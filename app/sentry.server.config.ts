import * as Sentry from "@sentry/nextjs";

// No-ops entirely when SENTRY_DSN isn't set (local dev, or before it's
// configured in production) — see src/lib/env.ts's isSentryConfigured.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
