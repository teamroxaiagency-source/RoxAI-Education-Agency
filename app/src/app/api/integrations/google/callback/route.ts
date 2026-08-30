import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/integrations/google-calendar";
import { verifySignedState } from "@/lib/signing";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { recordAuditEvent } from "@/lib/audit";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

/** Public route (no staff session cookie is guaranteed to survive Google's redirect) — trust is established via the signed `state` param instead. */
export async function GET(request: Request) {
  const env = getEnv();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const settingsUrl = new URL("/settings/integrations", env.NEXT_PUBLIC_APP_URL);

  if (!code || !state) {
    settingsUrl.searchParams.set("google_error", "missing_code_or_state");
    return NextResponse.redirect(settingsUrl);
  }

  const decoded = verifySignedState<{ schoolId: string; staffId: string }>(state);
  if (!decoded) {
    settingsUrl.searchParams.set("google_error", "invalid_or_expired_state");
    return NextResponse.redirect(settingsUrl);
  }

  const serviceClient = createServiceRoleClient();

  try {
    const tokens = await exchangeCodeForTokens(code);

    const { data: integration, error: integrationError } = await serviceClient
      .from("school_integrations")
      .upsert(
        {
          school_id: decoded.schoolId,
          provider: "google_calendar",
          status: "connected",
          config: { calendar_id: "primary" },
          connected_by_staff_id: decoded.staffId,
          connected_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "school_id,provider" },
      )
      .select()
      .single();

    if (integrationError || !integration) throw integrationError ?? new Error("Failed to upsert integration");

    const { error: secretError } = await serviceClient.from("school_integration_secrets").upsert({
      integration_id: integration.id,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_expires_at: tokens.expiresAt?.toISOString() ?? null,
    });

    if (secretError) throw secretError;

    await recordAuditEvent(serviceClient, {
      schoolId: decoded.schoolId,
      actorType: "staff",
      actorStaffId: decoded.staffId,
      action: "integration.google_calendar.connected",
    });

    settingsUrl.searchParams.set("google_connected", "1");
    return NextResponse.redirect(settingsUrl);
  } catch (error) {
    console.error("[google oauth callback] failed:", error);
    settingsUrl.searchParams.set("google_error", "connection_failed");
    return NextResponse.redirect(settingsUrl);
  }
}
