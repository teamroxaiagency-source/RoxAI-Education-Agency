# Secret rotation

Every secret this app depends on, why it matters, how often to rotate it,
and the actual steps — so rotation is a checklist, not a research
project, when it's time (or when one might be compromised).

## Cadence

| Secret | Rotate every | Rotate immediately if |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 90 days | Ever logged, committed, or shared outside the team |
| `APP_SIGNING_SECRET` | 180 days | Suspected leak of a booking link's signing scheme |
| `POSTMARK_SERVER_TOKEN` | 180 days | A staff member with access leaves |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 180 days | A staff member with Google Cloud Console access leaves |
| `AIRTABLE_PERSONAL_ACCESS_TOKEN` | 180 days | The creating staff member leaves, or scope needs narrowing |
| `ANTHROPIC_API_KEY` | 180 days | Usage spikes unexpectedly (possible leak) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | 180 days | Ever exposed client-side or in a log |
| `UPSTASH_REDIS_REST_TOKEN` | 180 days | — |
| `SENTRY_DSN` | Not a secret (safe to expose) — rotate only if abused for event spam | — |

## How to rotate each one

Most of these are "generate new → update env var → redeploy → revoke
old," in that order (never revoke the old one before the new one is live
— that's an outage, not a rotation).

- **Supabase service role key**: Project Settings → API → rotate. Update
  `SUPABASE_SERVICE_ROLE_KEY` in your deploy platform's env vars, redeploy,
  confirm `/api/health` returns 200, then the old key is invalidated
  automatically by Supabase's rotation.
- **Postmark server token**: Server → API Tokens → create a new one,
  update `POSTMARK_SERVER_TOKEN`, redeploy, confirm a test send works,
  then delete the old token.
- **Google OAuth client secret**: Google Cloud Console → Credentials →
  your OAuth client → Add Secret (Google supports multiple active
  secrets per client). Update `GOOGLE_OAUTH_CLIENT_SECRET`, redeploy,
  confirm a school can reconnect, then delete the old secret.
- **Airtable PAT**: airtable.com/create/tokens → create a new token with
  the same scopes → update `AIRTABLE_PERSONAL_ACCESS_TOKEN` → redeploy →
  delete the old token.
- **Anthropic API key**: console.anthropic.com → API Keys → create new →
  update `ANTHROPIC_API_KEY` → redeploy → delete old key.
- **Stripe keys**: Stripe Dashboard → Developers → API keys (secret key)
  and Webhooks (signing secret, per endpoint — click the endpoint to
  reveal "Roll secret"). Stripe supports rolling with an overlap window;
  update both env vars, redeploy, confirm a test webhook delivers
  successfully, then finalize the roll in Stripe's dashboard.
- **Upstash Redis token**: Upstash console → your database → rotate
  token → update `UPSTASH_REDIS_REST_TOKEN` → redeploy.

## `APP_SIGNING_SECRET` needs its own procedure

This one signs booking links already sitting in parents' inboxes (up to
7 days old) and short-lived OAuth `state` params. Rotating it naively
invalidates every outstanding booking link the instant you redeploy.

1. Move the **current** value of `APP_SIGNING_SECRET` into
   `APP_SIGNING_SECRET_PREVIOUS`.
2. Generate a new value for `APP_SIGNING_SECRET` (`openssl rand -base64 32`).
3. Deploy with both set. New tokens are signed with the new secret only;
   verification (`src/lib/signing.ts`) checks the new secret first, then
   falls back to `APP_SIGNING_SECRET_PREVIOUS` — so links already sent
   keep working until they expire on their own (max 7 days).
4. After at least 7 days, remove `APP_SIGNING_SECRET_PREVIOUS` entirely
   and redeploy. Don't leave it set indefinitely — it's a rotation grace
   window, not a second permanent secret.
