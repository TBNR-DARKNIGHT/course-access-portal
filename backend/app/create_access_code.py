from __future__ import annotations

import argparse
import hashlib
import os
import secrets
import sys
from datetime import datetime

from supabase import create_client

CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_GROUP_COUNT = 4
CODE_GROUP_LENGTH = 4


def normalize_redemption_code(code: str) -> str:
  return "".join(character for character in code.upper() if character.isalnum())


def hash_redemption_code(code: str) -> str:
  normalized = normalize_redemption_code(code)
  if len(normalized) < 8:
    raise ValueError("Code is too short")
  return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def generate_code(prefix: str) -> str:
  groups = [
    "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_GROUP_LENGTH))
    for _ in range(CODE_GROUP_COUNT)
  ]
  return f"{prefix.upper()}-" + "-".join(groups)


def parse_expiry(value: str) -> str:
  try:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
  except ValueError as exc:
    raise argparse.ArgumentTypeError("Use an ISO-8601 timestamp") from exc
  if parsed.tzinfo is None:
    raise argparse.ArgumentTypeError("Expiry must include a timezone")
  return parsed.isoformat()


def main() -> int:
  parser = argparse.ArgumentParser(description="Create a single-use course access code.")
  parser.add_argument("--course-id", default="course-2")
  parser.add_argument("--order-id")
  parser.add_argument("--expires-at", type=parse_expiry)
  parser.add_argument("--prefix", default="COURSE")
  args = parser.parse_args()

  supabase_url = os.environ.get("SUPABASE_URL", "").strip()
  service_key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
  if not supabase_url or not service_key:
    print("SUPABASE_URL and SUPABASE_SERVICE_KEY are required", file=sys.stderr)
    return 1

  code = generate_code(args.prefix)
  payload = {
    "code_hash": hash_redemption_code(code),
    "course_id": args.course_id,
    "order_id": args.order_id,
    "expires_at": args.expires_at,
  }

  try:
    create_client(supabase_url, service_key).table("access_codes").insert(payload).execute()
  except Exception as exc:
    print(f"Failed to create access code: {exc}", file=sys.stderr)
    return 1

  print("Access code created. This plaintext value will not be shown again:")
  print(code)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
