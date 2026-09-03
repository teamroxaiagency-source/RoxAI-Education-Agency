import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
// Never cache a health check — every ping should reflect the current state.
export const dynamic = "force-dynamic";

/**
 * For uptime monitors and deploy pipelines, not for staff or parents.
 * Deliberately unauthenticated (a health check gated behind a login can't
 * tell you the login page itself is broken) and deliberately cheap — one
 * indexed-lookalike row read, not a full table scan.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    const { error } = await createServiceRoleClient().from("schools").select("id").limit(1);
    if (error) throw error;

    return NextResponse.json(
      { status: "ok", checks: { database: "ok" }, latencyMs: Date.now() - startedAt },
      { status: 200 },
    );
  } catch (error) {
    logError(error, "Health check failed");
    return NextResponse.json(
      { status: "error", checks: { database: "error" }, latencyMs: Date.now() - startedAt },
      { status: 503 },
    );
  }
}
