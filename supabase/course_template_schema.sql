create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  email text unique not null,
  first_name text,
  last_name text,
  role text not null default 'CLIENT'
    check (role in ('CLIENT', 'ADMIN')),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_modules (
  course_id text not null,
  id text not null,
  title text not null,
  sort_order integer not null default 0,
  primary key (course_id, id)
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  course_id text not null,
  module_id text,
  type text not null
    check (type in ('video', 'pdf', 'article', 'module')),
  topic text not null,
  description text not null default '',
  duration text,
  access text not null default 'public'
    check (access in ('public', 'paid')),
  bucket text,
  file_path text,
  thumbnail_url text,
  content_url text,
  mux_asset_id text,
  mux_playback_id text,
  mux_playback_signed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_course_module_fkey
    foreign key (course_id, module_id)
    references public.course_modules (course_id, id)
);

create table if not exists public.course_entitlements (
  user_id uuid not null references public.users(id) on delete cascade,
  course_id text not null,
  source text not null
    check (source in ('access_code', 'shop_webhook', 'admin')),
  source_reference text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, course_id)
);

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text unique not null check (char_length(code_hash) = 64),
  course_id text not null,
  order_id text,
  redeemed_by_user_id uuid references public.users(id) on delete restrict,
  redeemed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.users(id) on delete restrict,
  revocation_reason text,
  replacement_for_code_id uuid references public.access_codes(id) on delete restrict,
  check (
    (redeemed_by_user_id is null and redeemed_at is null)
    or
    (redeemed_by_user_id is not null and redeemed_at is not null)
  )
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.resource_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  progress_percent integer not null default 0
    check (progress_percent between 0 and 100),
  completed_at timestamptz,
  last_accessed_at timestamptz,
  last_position_seconds integer check (last_position_seconds is null or last_position_seconds >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  pages_viewed integer[] not null default '{}',
  page_count integer check (page_count is null or page_count >= 0),
  completion_source text
    check (
      completion_source is null
      or completion_source in ('manual', 'video_threshold', 'video_ended')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, resource_id),
  check (
    (status = 'completed' and completed_at is not null)
    or
    (status <> 'completed' and completed_at is null)
  )
);

create index if not exists idx_users_clerk_user_id on public.users(clerk_user_id);
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_resources_course_id on public.resources(course_id);
create index if not exists idx_resources_course_module on public.resources(course_id, module_id);
create index if not exists idx_resources_type on public.resources(type);
create index if not exists idx_course_entitlements_course_id on public.course_entitlements(course_id);
create index if not exists idx_access_codes_course_id on public.access_codes(course_id);
create index if not exists idx_access_codes_redeemed_by_user_id on public.access_codes(redeemed_by_user_id);
create unique index if not exists idx_access_codes_active_order_id
  on public.access_codes(order_id)
  where order_id is not null and revoked_at is null;
create index if not exists idx_resource_progress_user_updated
  on public.resource_progress(user_id, updated_at desc);
create index if not exists idx_resource_progress_resource_completed
  on public.resource_progress(resource_id, completed_at desc)
  where completed_at is not null;

alter table public.users enable row level security;
alter table public.course_modules enable row level security;
alter table public.resources enable row level security;
alter table public.course_entitlements enable row level security;
alter table public.access_codes enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.resource_progress enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
before update on public.users
for each row execute function public.touch_updated_at();

drop trigger if exists resources_touch_updated_at on public.resources;
create trigger resources_touch_updated_at
before update on public.resources
for each row execute function public.touch_updated_at();

drop trigger if exists resource_progress_touch_updated_at on public.resource_progress;
create trigger resource_progress_touch_updated_at
before update on public.resource_progress
for each row execute function public.touch_updated_at();

create or replace function public.redeem_course_code(
  p_code_hash text,
  p_user_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_code public.access_codes%rowtype;
begin
  if p_code_hash is null or length(p_code_hash) <> 64 then
    raise exception using errcode = 'P0001', message = 'INVALID_CODE';
  end if;

  if p_user_id is null then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;

  select *
  into v_code
  from public.access_codes
  where code_hash = lower(p_code_hash)
  for update;

  if not found or v_code.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'INVALID_CODE';
  end if;

  if v_code.redeemed_at is not null then
    raise exception using errcode = 'P0001', message = 'CODE_ALREADY_REDEEMED';
  end if;

  if v_code.expires_at is not null and v_code.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'CODE_EXPIRED';
  end if;

  perform 1
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.course_entitlements
    where user_id = p_user_id
      and course_id = v_code.course_id
      and revoked_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_ENTITLED';
  end if;

  insert into public.course_entitlements (
    user_id,
    course_id,
    source,
    source_reference,
    granted_at,
    revoked_at
  )
  values (
    p_user_id,
    v_code.course_id,
    'access_code',
    coalesce(v_code.order_id, v_code.id::text),
    now(),
    null
  )
  on conflict (user_id, course_id)
  do update set
    source = excluded.source,
    source_reference = excluded.source_reference,
    granted_at = excluded.granted_at,
    revoked_at = null;

  update public.access_codes
  set redeemed_by_user_id = p_user_id,
      redeemed_at = now()
  where id = v_code.id;

  return v_code.course_id;
end;
$$;

revoke execute on function public.redeem_course_code(text, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_course_code(text, uuid)
  to service_role;

insert into storage.buckets (id, name, public)
values
  ('resources-public', 'resources-public', true),
  ('resources-paid', 'resources-paid', false)
on conflict (id) do update set public = excluded.public;

insert into public.course_modules (course_id, id, title, sort_order)
values
  ('course-2', 'module-1', 'Module 1: Foundations', 1),
  ('course-2', 'module-2', 'Module 2: Practice', 2),
  ('course-2', 'module-3', 'Module 3: Feedback', 3),
  ('course-2', 'module-4', 'Module 4: Final Review', 4)
on conflict (course_id, id) do update
set title = excluded.title,
    sort_order = excluded.sort_order;

comment on table public.resources is
  'Course catalog rows for videos, PDFs, articles, and module placeholders.';
comment on table public.resource_progress is
  'Current per-user resource progress for signed-in learners.';
comment on table public.access_codes is
  'Single-use redemption codes. Store only code_hash, never the plaintext code.';
