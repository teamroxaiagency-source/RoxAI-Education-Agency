-- B2B billing: schools pay RoxAI for the platform. One row per school;
-- created lazily the first time a school's admin visits billing
-- settings. All writes come from trusted server code (the Stripe
-- webhook handler, the checkout/portal routes) using the service-role
-- client — staff can view their own school's billing status but never
-- write it directly, so a compromised staff account can't grant itself
-- a free subscription.

create type billing_status as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused'
);

create table school_billing (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references schools (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status billing_status not null default 'trialing',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Looked up by the Stripe webhook handler, which only has the Stripe
-- customer/subscription id from the event payload, not the school id.
create index school_billing_stripe_customer_id_idx on school_billing (stripe_customer_id) where stripe_customer_id is not null;
create index school_billing_stripe_subscription_id_idx on school_billing (stripe_subscription_id) where stripe_subscription_id is not null;

create trigger school_billing_set_updated_at before update on school_billing
  for each row execute function set_updated_at();

alter table school_billing enable row level security;
alter table school_billing force row level security;

create policy school_billing_select_own_school_admin on school_billing
  for select to authenticated
  using (school_id = app_current_school_id() and app_current_staff_role() = 'admin');

-- No insert/update/delete policy for `authenticated` — every write comes
-- from the service-role client in src/lib/integrations/stripe.ts and the
-- Stripe webhook handler.
