import { NextResponse } from "next/server";
import { requireCurrentStaff } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createBillingPortalSession } from "@/lib/integrations/stripe";
import { isStripeConfigured, getEnv } from "@/lib/env";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";

/** Admin-initiated: hands off to Stripe's hosted portal for plan changes, payment methods, and invoices — no billing UI to build or maintain ourselves. */
export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "billing is not configured yet" }, { status: 503 });
  }

  const { staff, school } = await requireCurrentStaff();
  if (staff.role !== "admin") {
    return NextResponse.json({ error: "only school admins can manage billing" }, { status: 403 });
  }

  const env = getEnv();
  const serviceClient = createServiceRoleClient();

  const { data: billing } = await serviceClient.from("school_billing").select("*").eq("school_id", school.id).maybeSingle();
  if (!billing?.stripe_customer_id) {
    return NextResponse.json({ error: "no billing account yet — subscribe first" }, { status: 400 });
  }

  try {
    const returnUrl = new URL("/settings/billing", env.NEXT_PUBLIC_APP_URL).toString();
    const portalUrl = await createBillingPortalSession(billing.stripe_customer_id, returnUrl);
    return NextResponse.json({ url: portalUrl }, { status: 200 });
  } catch (error) {
    logError(error, "Failed to create Stripe billing portal session", { schoolId: school.id });
    return NextResponse.json({ error: "failed to open billing portal" }, { status: 500 });
  }
}
