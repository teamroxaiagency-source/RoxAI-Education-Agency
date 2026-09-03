import { NextResponse } from "next/server";
import { requireCurrentStaff } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getOrCreateBillingRecord, getOrCreateStripeCustomer, createCheckoutSession } from "@/lib/integrations/stripe";
import { isStripeConfigured, getEnv } from "@/lib/env";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";

/** Admin-initiated: starts a Stripe Checkout session for the school to subscribe. */
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

  try {
    const billing = await getOrCreateBillingRecord(serviceClient, school.id);
    const customerId = await getOrCreateStripeCustomer(serviceClient, school.id, school.name, billing);

    const settingsUrl = new URL("/settings/billing", env.NEXT_PUBLIC_APP_URL);
    const checkoutUrl = await createCheckoutSession(
      customerId,
      `${settingsUrl.toString()}?checkout=success`,
      `${settingsUrl.toString()}?checkout=canceled`,
    );

    return NextResponse.json({ url: checkoutUrl }, { status: 200 });
  } catch (error) {
    logError(error, "Failed to create Stripe checkout session", { schoolId: school.id });
    return NextResponse.json({ error: "failed to start checkout" }, { status: 500 });
  }
}
