# Rollback runbook

Two independent things can need rolling back: the deployed app, and the
database schema. They're rarely the same operation — most bad deploys are
fixed by rolling back the app alone.

## 1. Rolling back the app (Vercel)

This is the fast, safe, no-data-loss path — reach for it first.

- **Dashboard**: Project → Deployments → find the last known-good
  deployment → **⋯ → Promote to Production**. Takes effect immediately,
  no rebuild.
- **CLI**: `vercel rollback` from the project directory, or
  `vercel rollback <deployment-url>` to target a specific one.

This does not touch the database. If the bad deploy didn't ship a
migration, this alone fixes it.

## 2. Rolling back a database migration

Needed only when a migration itself was wrong (bad schema, bad RLS
policy) — not for ordinary app bugs.

**Before touching production data:**
1. Take a fresh backup/snapshot first, even if one exists — Supabase
   dashboard → Database → Backups, or `pg_dump` if you manage your own
   schedule.
2. Reproduce the rollback against a staging project first if at all
   possible.

**Then, in order:**
1. Run the newest rollback script first, working backwards. E.g. to roll
   back to before `0002_rls.sql`, run
   `supabase/migrations/rollback/0002_rls_down.sql`.
2. To roll back further, past `0001_schema.sql`, run
   `supabase/migrations/rollback/0001_schema_down.sql` next — **this
   drops every table and deletes all data in them.** Only run it if
   you've confirmed the backup from step 1 is restorable.
3. Re-apply a corrected migration, or restore from the backup, before
   bringing traffic back.

These rollback scripts are hand-written references, not auto-generated —
whenever you add a new migration, add a matching
`rollback/000N_<name>_down.sql` next to it, written to undo exactly that
migration and nothing else.

## 3. CI as the first line of defense

`.github/workflows/ci.yml` runs typecheck, lint, and a full `next build`
on every pull request. A red check there is a strong signal the change
isn't safe to merge, let alone deploy — don't override it without
understanding why it's red.

## 4. Rollback decision guide

| Symptom | Roll back |
|---|---|
| A new feature/bugfix broke something, schema unchanged | App only (Vercel) |
| A migration shipped a bad policy or column | App to the pre-migration deploy, then DB via the matching `_down.sql` |
| Data looks wrong but schema is fine | Neither — this is a data bug, fix forward with a script, don't roll back schema |
