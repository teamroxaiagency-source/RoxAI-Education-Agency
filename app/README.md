# Inquiry-to-Enrollment Agent

Production pilot module for RoxAI's school clients: inbound admissions
emails are read, deduped, and answered same-day with real availability;
parents book a real calendar slot; staff work the pipeline from a Kanban
board. This is a separate Next.js + Supabase app from the marketing site
at the repo root — it deploys independently (its own Vercel project) and
the root site's `.assetsignore` excludes `/app` from its own asset bundle
so the two never collide.

## Stack

- **Next.js 15** (App Router, Server Actions) + TypeScript
- **Supabase** — Postgres with Row Level Security as the tenant boundary,
  plus Supabase Auth for staff sign-in
- **Postmark** — inbound email parsing webhook + outbound sends
- **Claude (Anthropic API)** — grounded field extraction, with a
  deterministic fallback so the pipeline works without an API key
- **Google Calendar API** — per-school OAuth, freebusy-checked booking
- **Airtable API** — pushes inquiry state into a school's existing
  lead-tracking base

## 1. Supabase project

1. Create a Supabase project (staging and production should be separate
   projects — this pilot only ever points at one).
2. Apply the migrations in order:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push   # runs supabase/migrations/*.sql
   ```
   Read `supabase/migrations/0002_rls.sql` before going live — it's the
   file that makes this multi-tenant: every tenant table has RLS enabled
   *and forced*, and no policy grants the `authenticated` role a
   cross-school view. Only the service-role key (used exclusively by
   server code in `src/lib/**`, never sent to the browser) can cross
   tenants.
3. Seed a staging school:
   ```bash
   psql "$SUPABASE_DB_URL" -f supabase/seed.sql
   ```
   Edit the values in `supabase/seed.sql` first, or add a second `insert`
   block for your actual pilot school — the seed is a real school row
   shaped like every future one, not throwaway fixture data.
4. Create a staff login for that school:
   ```bash
   STAFF_EMAIL=admin@yourschool.example.org \
   STAFF_PASSWORD='pick-a-real-password' \
   STAFF_NAME='Your Name' \
   SCHOOL_SLUG=meridian-prep \
   npm run seed:staff
   ```

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Same page — **server only, never `NEXT_PUBLIC_*`** |
| `NEXT_PUBLIC_APP_URL` | yes | The deployed origin; used to build booking links & OAuth redirects |
| `APP_SIGNING_SECRET` | yes | `openssl rand -base64 32` — signs booking links and OAuth state |
| `POSTMARK_SERVER_TOKEN` | yes | Postmark server's API token, for outbound sends |
| `POSTMARK_INBOUND_WEBHOOK_SECRET` | yes | Any random string; set the same value as the basic-auth password on the inbound webhook URL you configure in Postmark |
| `POSTMARK_FROM_ADDRESS` | yes | Verified sender signature |
| `ANTHROPIC_API_KEY` | no | Omit to run extraction on the deterministic fallback parser |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `GOOGLE_OAUTH_REDIRECT_URI` | no | Omit to disable calendar booking until a school connects |
| `AIRTABLE_PERSONAL_ACCESS_TOKEN` | no | Omit to disable Airtable sync |

Startup fails loudly (see `src/lib/env.ts`) if a required var is missing
or malformed — that's intentional, so a bad deploy never silently drops
inbound admissions email.

## 3. Postmark inbound routing

Each school gets its own inbound address (`schools.admissions_inbound_address`,
e.g. `meridian-prep@inbound.postmarkapp.com`) — the webhook payload's
`OriginalRecipient` is how a single shared webhook URL routes to the
right tenant. In the Postmark server:

1. Add an **inbound** stream, note the inbound address it assigns (or
   configure a custom domain), and set that exact address on the
   school's row.
2. Set the inbound webhook URL to
   `https://<basic-auth-user>:<POSTMARK_INBOUND_WEBHOOK_SECRET>@<your-domain>/api/webhooks/postmark`
   (Postmark supports basic auth embedded in the webhook URL; the
   username can be anything, only the password is checked).

## 4. Google Calendar per school

1. In Google Cloud Console, create an OAuth 2.0 Client ID (Web
   application), add `GOOGLE_OAUTH_REDIRECT_URI` as an authorized
   redirect URI, and enable the Calendar API.
2. Set `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` in the app's
   env.
3. In the dashboard, an admin for the school visits **Integrations** and
   clicks **Connect Google Calendar** — this authorizes the app against
   *that admin's* Google account/calendar (`primary` by default) and
   stores the refresh token in `school_integration_secrets`, a table with
   zero RLS policies for `authenticated`/`anon` — reachable only by
   trusted server code.
4. Configure the school's actual tour/call hours in the `availability`
   table (recurring weekly rules) — real open slots are the intersection
   of those rules with this calendar's live freebusy.

## 5. Airtable per school

In **Integrations**, an admin enters the school's existing lead-tracking
base ID and table name. Every inquiry create and status change pushes a
row keyed on a stable `RoxAI Inquiry ID` field, so re-syncs update in
place.

## Local development

```bash
npm install
npm run dev
```

`npm run typecheck` and `npm run lint` before pushing — both are part of
what should gate a deploy.

## Design system note

Per-school branding (`schools.brand_primary_color`, `brand_secondary_color`,
`brand_font_family`, `brand_logo_url`) is read once per request and
applied as CSS custom properties (`src/lib/theme.ts`) around both the
staff dashboard and the parent-facing booking page — the same components
serve every client school without a per-school fork. Motion follows the
concrete rules in github.com/emilkowalski/skills (`animate`): `ease-out`
only for entrances/exits, named transition properties (`transform`/
`opacity`, never `transition: all`), sub-300ms durations, and everything
gated behind `prefers-reduced-motion` and, for hover effects,
`(hover: hover) and (pointer: fine)` — see `src/app/globals.css`.
