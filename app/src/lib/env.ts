import { z } from "zod";

// Validated once, at import time, so a missing/malformed env var fails
// loudly at boot instead of surfacing as a confusing runtime error deep in
// a webhook handler. Optional integrations (Claude, Google, Airtable) are
// allowed to be absent — the app degrades to documented fallbacks — but
// anything load-bearing (Supabase, the booking-link signing secret,
// Postmark) is required.

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  NEXT_PUBLIC_APP_URL: z.string().url(),
  APP_SIGNING_SECRET: z.string().min(32, "APP_SIGNING_SECRET must be at least 32 characters"),

  POSTMARK_SERVER_TOKEN: z.string().min(1),
  POSTMARK_INBOUND_WEBHOOK_SECRET: z.string().min(1),
  POSTMARK_FROM_ADDRESS: z.string().email(),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),

  AIRTABLE_PERSONAL_ACCESS_TOKEN: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * Lazily validated so importing this module never throws at build time
 * (e.g. during `next build` static analysis, when secrets aren't present).
 * Throws with a readable, field-by-field message the first time it's
 * actually called at runtime with a bad environment.
 */
export function getEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration. Fix the following (see .env.example):\n${issues}`,
    );
  }

  cached = parsed.data;
  return cached;
}

export function isGoogleCalendarConfigured(env: ServerEnv = getEnv()): boolean {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REDIRECT_URI);
}

export function isClaudeExtractionConfigured(env: ServerEnv = getEnv()): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export function isAirtableConfigured(env: ServerEnv = getEnv()): boolean {
  return Boolean(env.AIRTABLE_PERSONAL_ACCESS_TOKEN);
}
