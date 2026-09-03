-- Reference rollback for 0003_billing.sql.

drop policy if exists school_billing_select_own_school_admin on school_billing;
drop table if exists school_billing;
drop type if exists billing_status;
