-- Inquiry-to-Enrollment Agent — core schema
-- Multi-tenant: every tenant-scoped table carries school_id and is locked
-- down by Row Level Security in 0002_rls.sql. This file only defines shape.

create extension if not exists "pgcrypto";

-- ── schools ────────────────────────────────────────────────────────────────
-- One row per RoxAI client school. grade_levels is the authoritative grade
-- list a school offers — inbound extraction is constrained to these values
-- so a parent's free-text email can never invent a grade the school doesn't
-- teach. brand_* columns drive per-school theming in the staff UI and the
-- parent-facing booking page.
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/New_York',
  grade_levels text[] not null check (array_length(grade_levels, 1) > 0),
  admissions_inbound_address text not null unique,
  admissions_reply_from text not null,
  brand_primary_color text not null default '#2563eb',
  brand_secondary_color text not null default '#0f172a',
  brand_logo_url text,
  brand_font_family text not null default 'Inter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column schools.admissions_inbound_address is
  'The Postmark inbound address (e.g. school-slug@inbound.postmarkapp.com) used to route a webhook payload to this school.';

-- ── staff_users ────────────────────────────────────────────────────────────
-- Mirrors auth.users 1:1 for admissions staff. id == auth.users.id.
create table staff_users (
  id uuid primary key references auth.users (id) on delete cascade,
  school_id uuid not null references schools (id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'admissions_staff' check (role in ('admin', 'admissions_staff')),
  created_at timestamptz not null default now()
);

create index staff_users_school_id_idx on staff_users (school_id);

-- ── inquiries ──────────────────────────────────────────────────────────────
create type inquiry_status as enum (
  'new',
  'contacted',
  'tour_scheduled',
  'tour_completed',
  'enrolled',
  'closed_lost'
);

-- Statuses considered "open" for the purposes of duplicate-inquiry detection.
-- A parent who re-emails about the same grade while an inquiry is still
-- open gets merged into it instead of spawning a duplicate lead.
create table inquiries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  status inquiry_status not null default 'new',
  parent_name text,
  parent_email text not null,
  parent_phone text,
  student_name text,
  grade_interested text,
  source text not null default 'email',
  assigned_staff_id uuid references staff_users (id) on delete set null,
  notes text,
  dedup_key text not null,
  scheduled_kind text check (scheduled_kind in ('tour', 'call')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  google_event_id text,
  booking_token_hash text,
  booking_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inquiries_school_id_idx on inquiries (school_id);
create index inquiries_school_status_idx on inquiries (school_id, status);
create index inquiries_assigned_staff_idx on inquiries (assigned_staff_id);
create index inquiries_booking_token_hash_idx on inquiries (booking_token_hash) where booking_token_hash is not null;

-- Belt-and-suspenders double-booking guard: even if two confirm requests
-- for the same slot both pass the live Google freebusy check in the same
-- instant, they can't both land here. The application layer still does a
-- freebusy check before AND at confirmation time (see
-- src/lib/integrations/google-calendar.ts) — this index is the last line
-- of defense, not the primary one, since it only knows about *this app's*
-- bookings, not other events already on the school's calendar.
create unique index inquiries_scheduled_slot_idx
  on inquiries (school_id, scheduled_kind, scheduled_start)
  where scheduled_start is not null and status <> 'closed_lost';

-- DB-level dedup: only one *open* inquiry per (school, parent email, grade).
-- A closed/enrolled/lost inquiry never blocks a fresh one for the same
-- family later on.
create unique index inquiries_open_dedup_idx
  on inquiries (school_id, dedup_key)
  where status not in ('enrolled', 'closed_lost');

-- Grade-list grounding: a check constraint can't subquery another table, so
-- this is enforced with a trigger instead. Extraction (Claude tool-use or
-- the deterministic fallback) is constrained to a school's real grade list
-- before it ever reaches here, but the DB is the last line of defense.
create function check_inquiry_grade_valid() returns trigger as $$
begin
  if new.grade_interested is not null and not exists (
    select 1 from schools
    where schools.id = new.school_id
      and new.grade_interested = any (schools.grade_levels)
  ) then
    raise exception 'grade_interested "%" is not in school %''s grade_levels', new.grade_interested, new.school_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger inquiries_check_grade before insert or update of grade_interested, school_id on inquiries
  for each row execute function check_inquiry_grade_valid();

-- ── messages ───────────────────────────────────────────────────────────────
create table messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  inquiry_id uuid not null references inquiries (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  channel text not null default 'email' check (channel in ('email')),
  from_address text not null,
  to_address text not null,
  subject text,
  body_text text not null,
  body_html text,
  postmark_message_id text,
  created_at timestamptz not null default now()
);

create index messages_school_id_idx on messages (school_id);
create index messages_inquiry_id_idx on messages (inquiry_id, created_at);

-- ── availability ───────────────────────────────────────────────────────────
-- Recurring weekly availability *rules*, not individual slots. Real open
-- slots are computed on demand by intersecting these windows with the
-- school's live Google Calendar freebusy and already-booked inquiries, so
-- the booking page and the double-booking guard always read the same truth.
create table availability (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  staff_id uuid references staff_users (id) on delete cascade,
  kind text not null default 'tour' check (kind in ('tour', 'call')),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_minutes smallint not null default 30 check (slot_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint availability_time_order check (end_time > start_time)
);

create index availability_school_id_idx on availability (school_id) where active;

-- ── audit_log ──────────────────────────────────────────────────────────────
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  inquiry_id uuid references inquiries (id) on delete set null,
  actor_type text not null check (actor_type in ('system', 'staff', 'parent')),
  actor_staff_id uuid references staff_users (id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_school_id_idx on audit_log (school_id, created_at desc);
create index audit_log_inquiry_id_idx on audit_log (inquiry_id, created_at);

-- ── school_integrations ────────────────────────────────────────────────────
-- Non-secret connection state, readable/manageable by school staff.
create table school_integrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools (id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'airtable')),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  config jsonb not null default '{}'::jsonb,
  last_error text,
  connected_by_staff_id uuid references staff_users (id) on delete set null,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (school_id, provider)
);

create index school_integrations_school_id_idx on school_integrations (school_id);

comment on column school_integrations.config is
  'Non-secret config only: e.g. {"calendar_id": "...", "airtable_base_id": "...", "airtable_table_name": "Leads"}.';

-- ── school_integration_secrets ──────────────────────────────────────────────
-- OAuth tokens and API secrets. Deliberately carries NO policies granting
-- the authenticated role any access (see 0002_rls.sql) — only the
-- service-role key, used exclusively by trusted server code, can read or
-- write this table.
create table school_integration_secrets (
  integration_id uuid primary key references school_integrations (id) on delete cascade,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ── updated_at maintenance ──────────────────────────────────────────────────
create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger schools_set_updated_at before update on schools
  for each row execute function set_updated_at();
create trigger inquiries_set_updated_at before update on inquiries
  for each row execute function set_updated_at();
create trigger school_integrations_set_updated_at before update on school_integrations
  for each row execute function set_updated_at();
create trigger school_integration_secrets_set_updated_at before update on school_integration_secrets
  for each row execute function set_updated_at();
