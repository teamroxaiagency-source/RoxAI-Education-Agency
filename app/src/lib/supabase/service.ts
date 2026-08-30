import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Service-role client. Bypasses Row Level Security entirely — this is the
 * one intentionally cross-tenant-capable path described in the spec, and it
 * must only ever be constructed inside trusted server code (webhook
 * handlers, OAuth callbacks, sync jobs, route handlers). Never import this
 * from a Client Component or expose the key it uses to the browser.
 */
export function createServiceRoleClient() {
  const env = getEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
