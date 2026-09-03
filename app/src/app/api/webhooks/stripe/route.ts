import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { constructWebhookEvent, stripeStatusToBillingStatus } from "@/lib/integrations/stripe";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logger, logError } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Signature verification below is the real security control (Stripe
  // signs every payload); this is defense-in-depth against someone
  // hammering the URL with garbage before it ever reaches that check.
  const { limited } = await checkRateLimit("stripe-webhook", getClientIp(request), { requests: 60, windowSeconds: 60 });
  if (limited) {
    return NextResponse.json({ error: "rate limit exceeded" }, { status: 429 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (error) {
    logError(error, "Stripe webhook signature verification failed");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (!customerId || !subscriptionId) break;

        const { data: billing } = await serviceClient
          .from("school_billing")
          .select("*")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (billing) {
          await serviceClient
            .from("school_billing")
            .update({ stripe_subscription_id: subscriptionId, status: "active" })
            .eq("id", billing.id);

          await recordAuditEvent(serviceClient, {
            schoolId: billing.school_id,
            actorType: "system",
            action: "billing.subscribed",
            metadata: { stripeSubscriptionId: subscriptionId },
          });
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

        const { data: billing } = await serviceClient
          .from("school_billing")
          .select("*")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (billing) {
          const periodEnd = subscription.current_period_end;
          await serviceClient
            .from("school_billing")
            .update({
              stripe_subscription_id: subscription.id,
              status: stripeStatusToBillingStatus(subscription.status),
              current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            })
            .eq("id", billing.id);

          await recordAuditEvent(serviceClient, {
            schoolId: billing.school_id,
            actorType: "system",
            action: "billing.status_changed",
            metadata: { status: subscription.status },
          });
        }
        break;
      }

      default:
        logger.debug("Unhandled Stripe webhook event type", { type: event.type });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logError(error, "Failed to process Stripe webhook event", { eventType: event.type });
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
