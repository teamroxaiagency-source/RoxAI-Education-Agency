import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Request-scoped Supabase client that carries the signed-in staff member's
 * session cookie, so every query it makes runs as `authenticated` and is
 * subject to the RLS policies in supabase/migrations/0002_rls.sql. This is
 * the client every Server Component, Server Action, and route handler
 * should use for anything a staff member does in the dashboard — it can
 * never see another school's rows.
 */
export async function createServerSupabaseClient() {
  const env = getEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component with no response to write
          // cookies to — safe to ignore because middleware refreshes the
          // session on every navigation.
        }
      },
    },
  });
}
