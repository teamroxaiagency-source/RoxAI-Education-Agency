import { NextResponse } from "next/server";
import { requireCurrentStaff } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/integrations/google-calendar";
import { createSignedState } from "@/lib/signing";

export const runtime = "nodejs";

/** Staff-initiated: an admin clicks "Connect Google Calendar" in settings and lands here, which redirects to Google's consent screen. */
export async function GET() {
  const { staff, school } = await requireCurrentStaff();

  if (staff.role !== "admin") {
    return NextResponse.json({ error: "only school admins can connect integrations" }, { status: 403 });
  }

  const state = createSignedState({ schoolId: school.id, staffId: staff.id });

  try {
    return NextResponse.redirect(buildAuthUrl(state));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar OAuth is not configured";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
