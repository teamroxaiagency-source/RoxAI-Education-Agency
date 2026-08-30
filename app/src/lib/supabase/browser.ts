"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Browser-side Supabase client for Client Components (e.g. the login
 * form). Uses the public anon key only — RLS applies exactly as it does
 * server-side, so this client is safe to instantiate anywhere on the
 * client without leaking data across schools.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
