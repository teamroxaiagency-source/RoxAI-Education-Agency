-- Reference rollback for 0002_rls.sql. NOT auto-run by any tool — a
-- human runs this deliberately, per docs/ROLLBACK.md, only when rolling
-- the schema itself back (e.g. a bad migration reached production).
-- Rolling back RLS removes the tenant-isolation boundary — never leave a
-- production database in the state this script produces; it should only
-- ever be a step on the way to re-applying a corrected 0002_rls.sql.

drop policy if exists schools_select_own on schools;
drop policy if exists schools_update_own_admin on schools;
alter table schools disable row level security;

drop policy if exists staff_users_select_own_school on staff_users;
drop policy if exists staff_users_update_self on staff_users;
drop policy if exists staff_users_admin_manage on staff_users;
alter table staff_users disable row level security;

drop policy if exists inquiries_select_own_school on inquiries;
drop policy if exists inquiries_insert_own_school on inquiries;
drop policy if exists inquiries_update_own_school on inquiries;
alter table inquiries disable row level security;

drop policy if exists messages_select_own_school on messages;
drop policy if exists messages_insert_own_school on messages;
alter table messages disable row level security;

drop policy if exists availability_select_own_school on availability;
drop policy if exists availability_manage_own_school_admin on availability;
alter table availability disable row level security;

drop policy if exists audit_log_select_own_school on audit_log;
alter table audit_log disable row level security;

drop policy if exists school_integrations_select_own_school on school_integrations;
drop policy if exists school_integrations_admin_manage on school_integrations;
alter table school_integrations disable row level security;

alter table school_integration_secrets disable row level security;

drop function if exists app_current_school_id();
drop function if exists app_current_staff_role();
