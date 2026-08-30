-- Row Level Security. Every tenant-scoped table is locked down here.
--
-- Design: RLS is enabled AND forced on every table below, so even a
-- Postgres role that owns the table (e.g. one connecting as `postgres`)
-- is still subject to policy checks. The `service_role` key Supabase
-- issues carries the BYPASSRLS role attribute by default and is therefore
-- unaffected by FORCE ROW LEVEL SECURITY — that is the one intentional,
-- trusted, server-only path that can act across tenants. No policy below
-- ever grants the `authenticated` role a cross-school view.

-- ── helper functions (SECURITY DEFINER, so they can read staff_users
--    without recursively triggering staff_users' own RLS policies) ────────
create function app_current_school_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select school_id from staff_users where id = auth.uid();
$$;

create function app_current_staff_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from staff_users where id = auth.uid();
$$;

revoke all on function app_current_school_id() from public;
revoke all on function app_current_staff_role() from public;
grant execute on function app_current_school_id() to authenticated;
grant execute on function app_current_staff_role() to authenticated;

-- ── schools ────────────────────────────────────────────────────────────────
alter table schools enable row level security;
alter table schools force row level security;

create policy schools_select_own on schools
  for select to authenticated
  using (id = app_current_school_id());

create policy schools_update_own_admin on schools
  for update to authenticated
  using (id = app_current_school_id() and app_current_staff_role() = 'admin')
  with check (id = app_current_school_id() and app_current_staff_role() = 'admin');

-- ── staff_users ────────────────────────────────────────────────────────────
alter table staff_users enable row level security;
alter table staff_users force row level security;

create policy staff_users_select_own_school on staff_users
  for select to authenticated
  using (id = auth.uid() or school_id = app_current_school_id());

create policy staff_users_update_self on staff_users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and school_id = app_current_school_id());

create policy staff_users_admin_manage on staff_users
  for all to authenticated
  using (school_id = app_current_school_id() and app_current_staff_role() = 'admin')
  with check (school_id = app_current_school_id() and app_current_staff_role() = 'admin');

-- ── inquiries ──────────────────────────────────────────────────────────────
alter table inquiries enable row level security;
alter table inquiries force row level security;

create policy inquiries_select_own_school on inquiries
  for select to authenticated
  using (school_id = app_current_school_id());

create policy inquiries_insert_own_school on inquiries
  for insert to authenticated
  with check (school_id = app_current_school_id());

create policy inquiries_update_own_school on inquiries
  for update to authenticated
  using (school_id = app_current_school_id())
  with check (school_id = app_current_school_id());

-- No delete policy: inquiries are never hard-deleted by staff, only moved
-- to a closed status, preserving the audit trail.

-- ── messages ───────────────────────────────────────────────────────────────
alter table messages enable row level security;
alter table messages force row level security;

create policy messages_select_own_school on messages
  for select to authenticated
  using (school_id = app_current_school_id());

create policy messages_insert_own_school on messages
  for insert to authenticated
  with check (school_id = app_current_school_id());

-- ── availability ───────────────────────────────────────────────────────────
alter table availability enable row level security;
alter table availability force row level security;

create policy availability_select_own_school on availability
  for select to authenticated
  using (school_id = app_current_school_id());

create policy availability_manage_own_school_admin on availability
  for all to authenticated
  using (school_id = app_current_school_id() and app_current_staff_role() = 'admin')
  with check (school_id = app_current_school_id() and app_current_staff_role() = 'admin');

-- ── audit_log ──────────────────────────────────────────────────────────────
alter table audit_log enable row level security;
alter table audit_log force row level security;

create policy audit_log_select_own_school on audit_log
  for select to authenticated
  using (school_id = app_current_school_id());

-- Audit entries are written exclusively by trusted server code using the
-- service-role key (which bypasses RLS) so that staff can never edit or
-- fabricate their own audit trail. No insert/update/delete policy for
-- `authenticated` is intentional.

-- ── school_integrations ─────────────────────────────────────────────────────
alter table school_integrations enable row level security;
alter table school_integrations force row level security;

create policy school_integrations_select_own_school on school_integrations
  for select to authenticated
  using (school_id = app_current_school_id());

create policy school_integrations_admin_manage on school_integrations
  for all to authenticated
  using (school_id = app_current_school_id() and app_current_staff_role() = 'admin')
  with check (school_id = app_current_school_id() and app_current_staff_role() = 'admin');

-- ── school_integration_secrets ──────────────────────────────────────────────
-- RLS enabled and forced with *zero* policies for `authenticated` or
-- `anon` — this deny-by-default table is reachable only via the
-- service-role key from trusted server code (OAuth callback handlers,
-- calendar/Airtable sync jobs).
alter table school_integration_secrets enable row level security;
alter table school_integration_secrets force row level security;

revoke all on school_integration_secrets from authenticated, anon;
