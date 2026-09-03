import * as Sentry from "@sentry/nextjs";

// Covers the middleware/edge runtime — kept separate from
// sentry.server.config.ts because Next.js loads them into different
// runtimes (see instrumentation.ts).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
