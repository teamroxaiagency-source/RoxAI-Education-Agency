-- Reference rollback for 0001_schema.sql. Run 0002_rls_down.sql first —
-- this drops the tables those policies/functions are attached to.
-- Destructive: this deletes all data in every table below. Only run
-- against a database you have a verified backup of.

drop table if exists school_integration_secrets;
drop table if exists school_integrations;
drop table if exists audit_log;
drop table if exists availability;
drop table if exists messages;
drop table if exists inquiries;
drop table if exists staff_users;
drop table if exists schools;

drop function if exists check_inquiry_grade_valid();
drop function if exists set_updated_at();

drop type if exists inquiry_status;
