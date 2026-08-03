from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

import httpx
import jwt
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from jwt.algorithms import RSAAlgorithm
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from pydantic_settings import BaseSettings, SettingsConfigDict
from supabase import Client, create_client


class Settings(BaseSettings):
  model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

  environment: str = "development"
  frontend_url: str = "http://localhost:5173"
  frontend_url_regex: str = ""
  supabase_url: str = ""
  supabase_service_key: str = ""
  public_course_ids: str = "course-1"

  clerk_jwks_url: str = ""
  clerk_issuer: str = ""
  clerk_audience: str = ""
  clerk_secret_key: str = ""
  clerk_api_url: str = "https://api.clerk.com/v1"

  allow_dev_bearer_auth: bool = False
  dev_bearer_token: str = ""

  mux_signing_key_id: str = ""
  mux_signing_private_key: str = ""

  @property
  def is_development(self) -> bool:
    return self.environment == "development"


settings = Settings()
_supabase_client: Client | None = None


def get_supabase() -> Client:
  global _supabase_client
  if _supabase_client is None:
    if not settings.supabase_url or not settings.supabase_service_key:
      raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured")
    _supabase_client = create_client(settings.supabase_url, settings.supabase_service_key)
  return _supabase_client


class UserRole(str, Enum):
  ADMIN = "ADMIN"
  CLIENT = "CLIENT"


class ApiEnvelope(BaseModel):
  message: str


class ApiResponse(BaseModel):
  data: Any | None = None
  error: ApiEnvelope | None = None


class CamelModel(BaseModel):
  model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ClerkUser(BaseModel):
  clerk_id: str
  internal_user_id: UUID | None = None
  email: str | None = None
  first_name: str | None = None
  last_name: str | None = None
  role: UserRole = UserRole.CLIENT


class ResourceItem(CamelModel):
  id: str
  title: str
  course_id: str
  module_id: str | None = None
  type: Literal["video", "pdf", "article", "module"]
  topic: str
  description: str = ""
  duration: str | None = None
  access: Literal["public", "paid"] = "public"
  bucket: str | None = None
  file_path: str | None = None
  thumbnail_url: str | None = None
  content_url: str | None = None
  mux_asset_id: str | None = None
  mux_playback_id: str | None = None
  mux_playback_signed: bool = False
  created_at: datetime
  updated_at: datetime


class AdminResourceInput(CamelModel):
  title: str = Field(min_length=1, max_length=300)
  course_id: str = Field(min_length=1, max_length=100)
  module_id: str | None = None
  type: Literal["video", "pdf", "article", "module"]
  topic: str = Field(min_length=1, max_length=100)
  description: str = Field(default="", max_length=2000)
  duration: str | None = None
  access: Literal["public", "paid"] = "public"
  bucket: str | None = None
  file_path: str | None = None
  thumbnail_url: str | None = None
  content_url: str | None = None
  mux_playback_id: str | None = None
  mux_playback_signed: bool = False


class EntitlementsOut(CamelModel):
  courses: list[str]


class RedeemCodeIn(BaseModel):
  code: str = Field(min_length=8, max_length=128)


class RedemptionOut(CamelModel):
  course_id: str
  status: str = "granted"


class ResourceProgressItem(CamelModel):
  resource_id: str
  user_id: str
  status: Literal["not_started", "in_progress", "completed"] = "not_started"
  completed: bool
  progress_percent: int = Field(default=0, ge=0, le=100)
  completed_at: datetime | None = None
  last_accessed_at: datetime | None = None
  last_position_seconds: int | None = None
  duration_seconds: int | None = None
  pages_viewed: list[int] = Field(default_factory=list)
  page_count: int | None = None
  completion_source: Literal["manual", "video_threshold", "video_ended"] | None = None


class ResourceProgressUpdate(CamelModel):
  progress_percent: int | None = Field(default=None, ge=0, le=100)
  last_position_seconds: int | None = Field(default=None, ge=0)
  duration_seconds: int | None = Field(default=None, ge=0)
  pages_viewed: list[int] | None = None
  page_count: int | None = Field(default=None, ge=0)
  completed: bool | None = None
  completion_source: Literal["manual", "video_threshold", "video_ended"] | None = None


class ResourceCompletionUpdate(CamelModel):
  completion_source: Literal["manual", "video_threshold", "video_ended"] = "manual"


class StorageUrlResponse(CamelModel):
  bucket: str
  path: str
  is_paid: bool
  url: str
  expires_in: int | None = None


class MuxPlaybackTokenOut(CamelModel):
  token: str
  expires_at: int


@dataclass
class JWKSCache:
  keys: list[dict[str, Any]] = field(default_factory=list)
  fetched_at: float = 0.0
  ttl: float = 3600.0

  @property
  def expired(self) -> bool:
    return not self.keys or (time.time() - self.fetched_at) > self.ttl


_jwks_cache = JWKSCache()


async def fetch_jwks() -> list[dict[str, Any]]:
  if not _jwks_cache.expired:
    return _jwks_cache.keys
  async with httpx.AsyncClient(timeout=10.0) as client:
    response = await client.get(settings.clerk_jwks_url)
    response.raise_for_status()
  payload = response.json()
  keys = payload.get("keys") if isinstance(payload, dict) else None
  if not isinstance(keys, list):
    raise HTTPException(status_code=401, detail="Invalid Clerk JWKS")
  _jwks_cache.keys = keys
  _jwks_cache.fetched_at = time.time()
  return keys


def matching_jwk_key(keys: list[dict[str, Any]], token: str) -> Any:
  kid = jwt.get_unverified_header(token).get("kid")
  for key in keys:
    if key.get("kid") == kid:
      return RSAAlgorithm.from_jwk(key)
  raise HTTPException(status_code=401, detail="Invalid or expired token")


async def fetch_clerk_profile(clerk_user_id: str) -> dict[str, Any]:
  if not settings.clerk_secret_key:
    raise HTTPException(status_code=503, detail="CLERK_SECRET_KEY is required to fetch profile")
  async with httpx.AsyncClient(timeout=10.0) as client:
    response = await client.get(
      f"{settings.clerk_api_url.rstrip('/')}/users/{clerk_user_id}",
      headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
    )
    response.raise_for_status()
  return response.json()


def primary_email_from_clerk_profile(payload: dict[str, Any]) -> str | None:
  addresses = payload.get("email_addresses")
  if not isinstance(addresses, list):
    return None
  primary_id = payload.get("primary_email_address_id")
  candidate = next(
    (item for item in addresses if isinstance(item, dict) and item.get("id") == primary_id),
    None,
  ) or next((item for item in addresses if isinstance(item, dict)), None)
  email = candidate.get("email_address") if candidate else None
  return email.strip().lower() if isinstance(email, str) and email.strip() else None


def local_user_from_row(row: dict[str, Any], clerk_user: ClerkUser) -> ClerkUser:
  return clerk_user.model_copy(
    update={
      "internal_user_id": UUID(str(row["id"])),
      "email": row.get("email") or clerk_user.email,
      "first_name": row.get("first_name"),
      "last_name": row.get("last_name"),
      "role": UserRole(str(row.get("role") or "CLIENT")),
    }
  )


async def sync_authenticated_user(user: ClerkUser) -> ClerkUser:
  db = get_supabase()

  def find_local_user() -> dict[str, Any] | None:
    response = (
      db.table("users")
      .select("id,clerk_user_id,email,first_name,last_name,role,status")
      .eq("clerk_user_id", user.clerk_id)
      .limit(1)
      .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None

  row = await asyncio.to_thread(find_local_user)
  if row:
    return local_user_from_row(row, user)

  profile = {} if user.email else await fetch_clerk_profile(user.clerk_id)
  email = user.email or primary_email_from_clerk_profile(profile)
  if not email:
    raise HTTPException(status_code=503, detail="Authenticated user has no email")

  payload = {
    "clerk_user_id": user.clerk_id,
    "email": email.strip().lower(),
    "first_name": user.first_name if user.first_name is not None else profile.get("first_name"),
    "last_name": user.last_name if user.last_name is not None else profile.get("last_name"),
    "role": UserRole.CLIENT.value,
    "status": "ACTIVE",
  }
  await asyncio.to_thread(lambda: db.table("users").upsert(payload, on_conflict="clerk_user_id", ignore_duplicates=True).execute())
  row = await asyncio.to_thread(find_local_user)
  if not row:
    raise HTTPException(status_code=503, detail="Local user profile unavailable")
  return local_user_from_row(row, user)


async def get_current_user(request: Request) -> ClerkUser:
  auth_header = request.headers.get("Authorization")
  if (
    settings.is_development
    and settings.allow_dev_bearer_auth
    and settings.dev_bearer_token
    and auth_header == f"Bearer {settings.dev_bearer_token}"
  ):
    return ClerkUser(clerk_id="dev-user", email="dev-user@example.local")

  if not settings.clerk_jwks_url or not settings.clerk_issuer:
    raise HTTPException(status_code=503, detail="Clerk authentication is not configured")
  if not auth_header or not auth_header.startswith("Bearer "):
    raise HTTPException(status_code=401, detail="Missing authorization header")

  token = auth_header.removeprefix("Bearer ")
  try:
    key = matching_jwk_key(await fetch_jwks(), token)
    decode_options: dict[str, Any] = {"algorithms": ["RS256"], "issuer": settings.clerk_issuer}
    if settings.clerk_audience:
      decode_options["audience"] = settings.clerk_audience
    else:
      decode_options["options"] = {"verify_aud": False}
    payload = jwt.decode(token, key, **decode_options)
  except jwt.InvalidTokenError as exc:
    raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
  except httpx.HTTPError as exc:
    raise HTTPException(status_code=401, detail="Unable to verify token") from exc

  clerk_id = payload.get("sub")
  if not clerk_id:
    raise HTTPException(status_code=401, detail="Token missing subject")
  return await sync_authenticated_user(
    ClerkUser(
      clerk_id=str(clerk_id),
      email=payload.get("email"),
      first_name=payload.get("first_name"),
      last_name=payload.get("last_name"),
    )
  )


async def get_optional_current_user(request: Request) -> ClerkUser | None:
  if not request.headers.get("Authorization"):
    return None
  return await get_current_user(request)


async def require_admin(user: ClerkUser = Depends(get_current_user)) -> ClerkUser:
  if user.role is not UserRole.ADMIN:
    raise HTTPException(status_code=403, detail="Administrator access required")
  return user


def public_course_ids() -> set[str]:
  return {item.strip() for item in settings.public_course_ids.split(",") if item.strip()}


def normalize_redemption_code(code: str) -> str:
  return re.sub(r"[\s-]+", "", code).upper()


def hash_redemption_code(code: str) -> str:
  normalized = normalize_redemption_code(code)
  if len(normalized) < 8 or not normalized.isalnum():
    raise HTTPException(status_code=400, detail="Invalid redemption code")
  return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def row_to_resource(row: dict[str, Any]) -> ResourceItem:
  created = row.get("created_at") or datetime.now(UTC)
  updated = row.get("updated_at") or created
  return ResourceItem.model_validate(
    {
      "id": str(row["id"]),
      "title": row["title"],
      "course_id": row["course_id"],
      "module_id": row.get("module_id"),
      "type": row.get("type") or "article",
      "topic": row.get("topic") or "General",
      "description": row.get("description") or "",
      "duration": row.get("duration"),
      "access": row.get("access") or ("paid" if row.get("is_paid") else "public"),
      "bucket": row.get("bucket"),
      "file_path": row.get("file_path"),
      "thumbnail_url": row.get("thumbnail_url"),
      "content_url": row.get("content_url"),
      "mux_asset_id": row.get("mux_asset_id"),
      "mux_playback_id": row.get("mux_playback_id"),
      "mux_playback_signed": bool(row.get("mux_playback_signed")),
      "created_at": created,
      "updated_at": updated,
    }
  )


def list_resources() -> list[ResourceItem]:
  response = get_supabase().table("resources").select("*").order("created_at").execute()
  return [row_to_resource(row) for row in response.data or []]


def find_resource(resource_id: str) -> ResourceItem | None:
  response = get_supabase().table("resources").select("*").eq("id", resource_id).limit(1).execute()
  rows = response.data or []
  return row_to_resource(rows[0]) if rows else None


def redact_paid_metadata(resource: ResourceItem) -> ResourceItem:
  return resource.model_copy(
    update={
      "bucket": None,
      "file_path": None,
      "thumbnail_url": None,
      "content_url": None,
      "mux_asset_id": None,
      "mux_playback_id": None,
    }
  )


def admin_resource_payload(body: AdminResourceInput) -> dict[str, Any]:
  return {
    "title": body.title.strip(),
    "course_id": body.course_id.strip(),
    "module_id": body.module_id.strip() if body.module_id and body.module_id.strip() else None,
    "type": body.type,
    "topic": body.topic.strip(),
    "description": body.description.strip(),
    "duration": body.duration.strip() if body.duration and body.duration.strip() else None,
    "access": body.access,
    "bucket": body.bucket.strip() if body.bucket and body.bucket.strip() else None,
    "file_path": body.file_path.strip() if body.file_path and body.file_path.strip() else None,
    "thumbnail_url": body.thumbnail_url.strip()
    if body.thumbnail_url and body.thumbnail_url.strip()
    else None,
    "content_url": body.content_url.strip() if body.content_url and body.content_url.strip() else None,
    "mux_playback_id": body.mux_playback_id.strip()
    if body.mux_playback_id and body.mux_playback_id.strip()
    else None,
    "mux_playback_signed": body.mux_playback_signed,
  }


def audit_admin_resource_action(
  *,
  actor_user_id: UUID | None,
  action: str,
  resource_id: str,
  details: dict[str, Any],
) -> None:
  if actor_user_id is None:
    return
  get_supabase().table("admin_audit_log").insert(
    {
      "actor_user_id": str(actor_user_id),
      "action": action,
      "target_type": "resource",
      "target_id": resource_id,
      "details": details,
    }
  ).execute()


async def list_entitlements(user_id: UUID) -> list[str]:
  response = (
    get_supabase()
    .table("course_entitlements")
    .select("course_id")
    .eq("user_id", str(user_id))
    .is_("revoked_at", "null")
    .execute()
  )
  courses = {str(row["course_id"]) for row in response.data or []}
  courses.update(public_course_ids())
  return sorted(courses)


async def has_course_access(user: ClerkUser | None, course_id: str | None) -> bool:
  if not course_id:
    return False
  if course_id in public_course_ids():
    return True
  if user is not None and user.role is UserRole.ADMIN:
    return True
  if user is None or user.internal_user_id is None:
    return False
  return course_id in await list_entitlements(user.internal_user_id)


async def can_access_resource(resource: ResourceItem, user: ClerkUser | None) -> bool:
  return resource.access != "paid" or await has_course_access(user, resource.course_id)


def row_to_progress(row: dict[str, Any]) -> ResourceProgressItem:
  completed = row.get("completed_at") is not None or row.get("status") == "completed"
  return ResourceProgressItem.model_validate(
    {
      "resource_id": str(row["resource_id"]),
      "user_id": str(row["user_id"]),
      "status": "completed" if completed else row.get("status") or "not_started",
      "completed": completed,
      "progress_percent": row.get("progress_percent") or 0,
      "completed_at": row.get("completed_at"),
      "last_accessed_at": row.get("last_accessed_at"),
      "last_position_seconds": row.get("last_position_seconds"),
      "duration_seconds": row.get("duration_seconds"),
      "pages_viewed": row.get("pages_viewed") or [],
      "page_count": row.get("page_count"),
      "completion_source": row.get("completion_source"),
    }
  )


def clean_pages(pages: list[int] | None, page_count: int | None) -> list[int]:
  if not pages:
    return []
  return sorted(
    {
      page
      for page in pages
      if isinstance(page, int) and page > 0 and (page_count is None or page <= page_count)
    }
  )


def merge_progress_payload(
  user_id: UUID,
  resource: ResourceItem,
  existing: dict[str, Any] | None,
  update: ResourceProgressUpdate,
) -> dict[str, Any]:
  now = datetime.now(UTC).isoformat()
  existing_percent = int(existing.get("progress_percent") or 0) if existing else 0
  existing_pages = existing.get("pages_viewed") if existing else []
  page_count = update.page_count if update.page_count is not None else (existing or {}).get("page_count")
  pages_viewed = sorted(set(clean_pages(existing_pages, page_count)).union(clean_pages(update.pages_viewed, page_count)))
  derived_percent = round((len(pages_viewed) / page_count) * 100) if page_count else 0
  progress_percent = max(existing_percent, update.progress_percent or 0, derived_percent)
  completed_at = (existing or {}).get("completed_at")
  completed = bool(update.completed) or completed_at is not None
  completion_source = (existing or {}).get("completion_source")
  if update.completed:
    completed = True
    completed_at = completed_at or now
    completion_source = update.completion_source or "manual"
    progress_percent = 100
  status = "completed" if completed else ("in_progress" if progress_percent > 0 or pages_viewed else "not_started")
  payload: dict[str, Any] = {
    "user_id": str(user_id),
    "resource_id": resource.id,
    "status": status,
    "progress_percent": max(0, min(100, progress_percent)),
    "completed_at": completed_at,
    "last_accessed_at": now,
    "pages_viewed": pages_viewed,
    "updated_at": now,
  }
  for field_name in ("last_position_seconds", "duration_seconds", "page_count"):
    incoming = getattr(update, field_name)
    if incoming is not None:
      payload[field_name] = incoming
    elif existing and existing.get(field_name) is not None:
      payload[field_name] = existing[field_name]
  if completion_source:
    payload["completion_source"] = completion_source
  return payload


def storage_url(result: object, keys: tuple[str, ...]) -> str:
  if isinstance(result, dict):
    return next((str(result[key]) for key in keys if result.get(key)), "")
  return str(result)


def load_rsa_private_key(raw: str) -> Any:
  text = raw.strip()
  if "BEGIN" in text and "PRIVATE KEY" in text:
    return serialization.load_pem_private_key(text.encode(), password=None, backend=default_backend())
  try:
    decoded = base64.b64decode(text)
  except binascii.Error as exc:
    raise ValueError("MUX_SIGNING_PRIVATE_KEY is not valid PEM or base64 PEM") from exc
  return serialization.load_pem_private_key(decoded, password=None, backend=default_backend())


def mint_mux_token(playback_id: str, audience: Literal["v", "t"], expires_in: int) -> tuple[str, int]:
  if not settings.mux_signing_key_id or not settings.mux_signing_private_key:
    raise HTTPException(status_code=503, detail="Mux playback signing is not configured")
  now = int(time.time())
  exp = now + max(60, min(expires_in, 86400))
  token = jwt.encode(
    {"sub": playback_id, "aud": audience, "exp": exp},
    load_rsa_private_key(settings.mux_signing_private_key),
    algorithm="RS256",
    headers={"kid": settings.mux_signing_key_id, "typ": "JWT"},
  )
  return token.decode("utf-8") if isinstance(token, bytes) else str(token), exp


app = FastAPI(title="Course Access Portal API", version="0.1.0")
app.add_middleware(
  CORSMiddleware,
  allow_origins=[settings.frontend_url.rstrip("/")],
  allow_origin_regex=settings.frontend_url_regex or None,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.get("/api/v1/health", response_model=ApiResponse)
async def health() -> ApiResponse:
  return ApiResponse(data={"status": "ok", "environment": settings.environment})


@app.get("/api/v1/resources", response_model=ApiResponse)
async def list_resources_endpoint(
  user: ClerkUser | None = Depends(get_optional_current_user),
) -> ApiResponse:
  resources = await asyncio.to_thread(list_resources)
  visible = []
  for resource in resources:
    if user is not None and user.role is UserRole.ADMIN:
      visible.append(resource)
    elif resource.access == "paid" and not await can_access_resource(resource, user):
      visible.append(redact_paid_metadata(resource))
    else:
      visible.append(resource)
  return ApiResponse(data=visible)


@app.get("/api/v1/me", response_model=ApiResponse)
async def me(user: ClerkUser = Depends(get_current_user)) -> ApiResponse:
  return ApiResponse(data={"id": str(user.internal_user_id), "clerkUserId": user.clerk_id, "email": user.email, "role": user.role.value})


@app.post("/api/v1/admin/resources", response_model=ApiResponse)
async def admin_create_resource(
  body: AdminResourceInput,
  user: ClerkUser = Depends(require_admin),
) -> ApiResponse:
  payload = admin_resource_payload(body)
  response = get_supabase().table("resources").insert(payload).execute()
  rows = response.data or []
  if not rows:
    raise HTTPException(status_code=503, detail="Resource could not be created")
  resource = row_to_resource(rows[0])
  audit_admin_resource_action(
    actor_user_id=user.internal_user_id,
    action="resource.created",
    resource_id=resource.id,
    details={"course_id": resource.course_id, "type": resource.type},
  )
  return ApiResponse(data=resource)


@app.patch("/api/v1/admin/resources/{resource_id}", response_model=ApiResponse)
async def admin_update_resource(
  resource_id: str,
  body: AdminResourceInput,
  user: ClerkUser = Depends(require_admin),
) -> ApiResponse:
  payload = admin_resource_payload(body)
  response = get_supabase().table("resources").update(payload).eq("id", resource_id).execute()
  rows = response.data or []
  if not rows:
    raise HTTPException(status_code=404, detail="Resource not found")
  resource = row_to_resource(rows[0])
  audit_admin_resource_action(
    actor_user_id=user.internal_user_id,
    action="resource.updated",
    resource_id=resource.id,
    details={"course_id": resource.course_id, "type": resource.type},
  )
  return ApiResponse(data=resource)


@app.delete("/api/v1/admin/resources/{resource_id}", response_model=ApiResponse)
async def admin_delete_resource(
  resource_id: str,
  user: ClerkUser = Depends(require_admin),
) -> ApiResponse:
  existing = await asyncio.to_thread(find_resource, resource_id)
  if not existing:
    raise HTTPException(status_code=404, detail="Resource not found")
  response = get_supabase().table("resources").delete().eq("id", resource_id).execute()
  if not response.data:
    raise HTTPException(status_code=404, detail="Resource not found")
  audit_admin_resource_action(
    actor_user_id=user.internal_user_id,
    action="resource.deleted",
    resource_id=resource_id,
    details={"course_id": existing.course_id, "type": existing.type},
  )
  return ApiResponse(data=None)


@app.get("/api/v1/me/entitlements", response_model=ApiResponse)
async def my_entitlements(user: ClerkUser = Depends(get_current_user)) -> ApiResponse:
  if user.role is UserRole.ADMIN:
    resources = await asyncio.to_thread(list_resources)
    return ApiResponse(data=EntitlementsOut(courses=sorted({resource.course_id for resource in resources})))
  if user.internal_user_id is None:
    raise HTTPException(status_code=503, detail="User profile unavailable")
  return ApiResponse(data=EntitlementsOut(courses=await list_entitlements(user.internal_user_id)))


@app.post("/api/v1/entitlements/redeem", response_model=ApiResponse)
async def redeem_entitlement(body: RedeemCodeIn, user: ClerkUser = Depends(get_current_user)) -> ApiResponse:
  if user.internal_user_id is None:
    raise HTTPException(status_code=503, detail="User profile unavailable")
  try:
    response = get_supabase().rpc(
      "redeem_course_code",
      {"p_code_hash": hash_redemption_code(body.code), "p_user_id": str(user.internal_user_id)},
    ).execute()
  except Exception as exc:
    message = str(exc)
    if "INVALID_CODE" in message:
      raise HTTPException(status_code=400, detail="Invalid redemption code") from exc
    if "CODE_ALREADY_REDEEMED" in message:
      raise HTTPException(status_code=409, detail="Code has already been redeemed") from exc
    if "CODE_EXPIRED" in message:
      raise HTTPException(status_code=410, detail="Code has expired") from exc
    if "ALREADY_ENTITLED" in message:
      raise HTTPException(status_code=409, detail="Course access is already active") from exc
    raise HTTPException(status_code=503, detail="Redemption service unavailable") from exc
  return ApiResponse(data=RedemptionOut(course_id=str(response.data)))


@app.get("/api/v1/resources/progress", response_model=ApiResponse)
async def list_resource_progress(user: ClerkUser = Depends(get_current_user)) -> ApiResponse:
  if user.internal_user_id is None:
    raise HTTPException(status_code=503, detail="User profile unavailable")
  response = (
    get_supabase()
    .table("resource_progress")
    .select("*")
    .eq("user_id", str(user.internal_user_id))
    .order("updated_at", desc=True)
    .execute()
  )
  return ApiResponse(data=[row_to_progress(row) for row in response.data or []])


async def accessible_resource(resource_id: str, user: ClerkUser) -> ResourceItem:
  resource = await asyncio.to_thread(find_resource, resource_id)
  if not resource:
    raise HTTPException(status_code=404, detail="Resource not found")
  if not await can_access_resource(resource, user):
    raise HTTPException(status_code=403, detail="Course access required")
  return resource


@app.patch("/api/v1/resources/{resource_id}/progress", response_model=ApiResponse)
async def update_progress_endpoint(
  resource_id: str,
  body: ResourceProgressUpdate,
  user: ClerkUser = Depends(get_current_user),
) -> ApiResponse:
  if user.internal_user_id is None:
    raise HTTPException(status_code=503, detail="User profile unavailable")
  resource = await accessible_resource(resource_id, user)
  db = get_supabase()
  existing_response = (
    db.table("resource_progress")
    .select("*")
    .eq("user_id", str(user.internal_user_id))
    .eq("resource_id", resource.id)
    .limit(1)
    .execute()
  )
  existing = (existing_response.data or [None])[0]
  payload = merge_progress_payload(user.internal_user_id, resource, existing, body)
  response = db.table("resource_progress").upsert(payload, on_conflict="user_id,resource_id").execute()
  return ApiResponse(data=row_to_progress((response.data or [payload])[0]))


@app.post("/api/v1/resources/{resource_id}/complete", response_model=ApiResponse)
async def mark_complete_endpoint(
  resource_id: str,
  body: ResourceCompletionUpdate | None = None,
  user: ClerkUser = Depends(get_current_user),
) -> ApiResponse:
  return await update_progress_endpoint(
    resource_id,
    ResourceProgressUpdate(completed=True, progress_percent=100, completion_source=(body or ResourceCompletionUpdate()).completion_source),
    user,
  )


@app.delete("/api/v1/resources/{resource_id}/complete", response_model=ApiResponse)
async def mark_incomplete_endpoint(resource_id: str, user: ClerkUser = Depends(get_current_user)) -> ApiResponse:
  if user.internal_user_id is None:
    raise HTTPException(status_code=503, detail="User profile unavailable")
  await accessible_resource(resource_id, user)
  now = datetime.now(UTC).isoformat()
  payload = {
    "user_id": str(user.internal_user_id),
    "resource_id": resource_id,
    "status": "not_started",
    "progress_percent": 0,
    "completed_at": None,
    "completion_source": None,
    "last_accessed_at": now,
    "updated_at": now,
  }
  response = get_supabase().table("resource_progress").upsert(payload, on_conflict="user_id,resource_id").execute()
  return ApiResponse(data=row_to_progress((response.data or [payload])[0]))


@app.delete("/api/v1/courses/{course_id}/progress", response_model=ApiResponse)
async def reset_course_progress(course_id: str, user: ClerkUser = Depends(get_current_user)) -> ApiResponse:
  if user.internal_user_id is None:
    raise HTTPException(status_code=503, detail="User profile unavailable")
  resources = [resource for resource in await asyncio.to_thread(list_resources) if resource.course_id == course_id]
  for resource in resources:
    get_supabase().table("resource_progress").delete().eq("user_id", str(user.internal_user_id)).eq("resource_id", resource.id).execute()
  return ApiResponse(data=None)


async def public_pdf(resource_id: str) -> ResourceItem:
  resource = await asyncio.to_thread(find_resource, resource_id)
  if not resource or resource.type != "pdf" or resource.access == "paid":
    raise HTTPException(status_code=404, detail="Public PDF not found")
  if not resource.bucket or not resource.file_path:
    raise HTTPException(status_code=404, detail="PDF storage path not configured")
  return resource


async def paid_pdf(resource_id: str, user: ClerkUser | None) -> ResourceItem:
  resource = await asyncio.to_thread(find_resource, resource_id)
  if not resource or resource.type != "pdf" or resource.access != "paid":
    raise HTTPException(status_code=404, detail="Paid PDF not found")
  if not await can_access_resource(resource, user):
    raise HTTPException(status_code=403, detail="Course access required")
  if not resource.bucket or not resource.file_path:
    raise HTTPException(status_code=404, detail="PDF storage path not configured")
  return resource


@app.get("/api/v1/storage/public-url", response_model=ApiResponse)
async def public_storage_url(resource_id: str = Query(...)) -> ApiResponse:
  resource = await public_pdf(resource_id)
  result = get_supabase().storage.from_(resource.bucket).get_public_url(resource.file_path)
  return ApiResponse(data=StorageUrlResponse(bucket=resource.bucket, path=resource.file_path, is_paid=False, url=storage_url(result, ("publicUrl", "publicURL", "public_url"))))


@app.get("/api/v1/storage/paid-url", response_model=ApiResponse)
async def paid_storage_url(
  resource_id: str = Query(...),
  expires_in: int = Query(3600, ge=60, le=86400),
  user: ClerkUser | None = Depends(get_optional_current_user),
) -> ApiResponse:
  resource = await paid_pdf(resource_id, user)
  result = get_supabase().storage.from_(resource.bucket).create_signed_url(resource.file_path, expires_in)
  return ApiResponse(data=StorageUrlResponse(bucket=resource.bucket, path=resource.file_path, is_paid=True, url=storage_url(result, ("signedURL", "signedUrl", "signed_url")), expires_in=expires_in))


@app.get("/api/v1/storage/thumbnail-url", response_model=ApiResponse)
async def thumbnail_storage_url(
  resource_id: str = Query(...),
  expires_in: int = Query(900, ge=60, le=86400),
  user: ClerkUser | None = Depends(get_optional_current_user),
) -> ApiResponse:
  resource = await asyncio.to_thread(find_resource, resource_id)
  if not resource or resource.type != "pdf" or not resource.bucket or not resource.file_path:
    raise HTTPException(status_code=404, detail="PDF thumbnail not found")
  if resource.access == "paid":
    resource = await paid_pdf(resource_id, user)
  path = re.sub(r"([^/]+)\.pdf$", r"\1_thumbnail.jpg", resource.file_path, flags=re.IGNORECASE)
  if resource.access == "paid":
    result = get_supabase().storage.from_(resource.bucket).create_signed_url(path, expires_in)
    return ApiResponse(data=StorageUrlResponse(bucket=resource.bucket, path=path, is_paid=True, url=storage_url(result, ("signedURL", "signedUrl", "signed_url")), expires_in=expires_in))
  result = get_supabase().storage.from_(resource.bucket).get_public_url(path)
  return ApiResponse(data=StorageUrlResponse(bucket=resource.bucket, path=path, is_paid=False, url=storage_url(result, ("publicUrl", "publicURL", "public_url"))))


@app.get("/api/v1/playback/mux-token", response_model=ApiResponse)
async def mux_playback_token(
  resource_id: str = Query(...),
  expires_in: int = Query(3600, ge=60, le=86400),
  user: ClerkUser | None = Depends(get_optional_current_user),
) -> ApiResponse:
  resource = await asyncio.to_thread(find_resource, resource_id)
  if not resource or resource.type != "video" or not resource.mux_playback_id:
    raise HTTPException(status_code=404, detail="Video playback is not configured")
  if not resource.mux_playback_signed:
    raise HTTPException(status_code=400, detail="This video does not need a playback token")
  if not await can_access_resource(resource, user):
    raise HTTPException(status_code=403, detail="Course access required")
  token, exp = mint_mux_token(resource.mux_playback_id, "v", expires_in)
  return ApiResponse(data=MuxPlaybackTokenOut(token=token, expires_at=exp))


@app.get("/api/v1/playback/mux-thumbnail-token", response_model=ApiResponse)
async def mux_thumbnail_token(
  resource_id: str = Query(...),
  expires_in: int = Query(3600, ge=60, le=86400),
  user: ClerkUser | None = Depends(get_optional_current_user),
) -> ApiResponse:
  resource = await asyncio.to_thread(find_resource, resource_id)
  if not resource or resource.type != "video" or not resource.mux_playback_id:
    raise HTTPException(status_code=404, detail="Video thumbnail is not configured")
  if not resource.mux_playback_signed:
    raise HTTPException(status_code=400, detail="This video does not need a thumbnail token")
  if not await can_access_resource(resource, user):
    raise HTTPException(status_code=403, detail="Course access required")
  token, exp = mint_mux_token(resource.mux_playback_id, "t", expires_in)
  return ApiResponse(data=MuxPlaybackTokenOut(token=token, expires_at=exp))
