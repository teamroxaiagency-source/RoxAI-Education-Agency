-- Staging seed: one real client-shaped school tenant to develop and demo
-- against. Not sample/fixture data meant to be thrown away — this is the
-- first real school row a staging Supabase project should have, matching
-- the shape every future client school will use. Swap the values below
-- for the actual pilot school's details when you have them, or add
-- another `insert into schools (...)` block per additional school —
-- nothing in this schema assumes there is only ever one.

insert into schools (
  id, name, slug, timezone, grade_levels,
  admissions_inbound_address, admissions_reply_from,
  brand_primary_color, brand_secondary_color, brand_font_family
) values (
  '00000000-0000-0000-0000-000000000001',
  'Meridian Preparatory Academy',
  'meridian-prep',
  'America/New_York',
  array['Pre-K', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade'],
  'meridian-prep@inbound.postmarkapp.com',
  'admissions@meridianprep.example.org',
  '#1d4ed8',
  '#0f172a',
  'Inter'
)
on conflict (id) do nothing;

-- Recurring tour availability: Tuesday and Thursday mornings, 30-minute
-- slots. staff_id is left null (unassigned/"front desk" host) — assign it
-- to a specific staff_users row once the pilot's tour host has an account.
insert into availability (school_id, kind, day_of_week, start_time, end_time, slot_minutes)
values
  ('00000000-0000-0000-0000-000000000001', 'tour', 2, '09:00', '11:00', 30),
  ('00000000-0000-0000-0000-000000000001', 'tour', 4, '09:00', '11:00', 30)
on conflict do nothing;
