import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import type { Database, SchoolBilling } from "@/types/database";

let client: Stripe | undefined;

function getStripeClient(): Stripe {
  const env = getEnv();
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  }
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return client;
}

/** Ensures a school has a billing row, creating one in "trialing" the first time anyone looks. */
export async function getOrCreateBillingRecord(
  serviceClient: SupabaseClient<Database>,
  schoolId: string,
): Promise<SchoolBilling> {
  const { data: existing } = await serviceClient.from("school_billing").select("*").eq("school_id", schoolId).maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await serviceClient
    .from("school_billing")
    .insert({ school_id: schoolId, status: "trialing" })
    .select()
    .single();

  if (error || !created) throw error ?? new Error("Failed to create billing record");
  return created;
}

/** Reuses the school's Stripe customer if one exists, otherwise creates it and persists the id. */
export async function getOrCreateStripeCustomer(
  serviceClient: SupabaseClient<Database>,
  schoolId: string,
  schoolName: string,
  billing: SchoolBilling,
): Promise<string> {
  if (billing.stripe_customer_id) return billing.stripe_customer_id;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    name: schoolName,
    metadata: { school_id: schoolId },
  });

  await serviceClient.from("school_billing").update({ stripe_customer_id: customer.id }).eq("school_id", schoolId);

  return customer.id;
}

export async function createCheckoutSession(customerId: string, successUrl: string, cancelUrl: string): Promise<string> {
  const stripe = getStripeClient();
  const env = getEnv();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createBillingPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return session.url;
}

export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const stripe = getStripeClient();
  const env = getEnv();
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

/** Stripe's own subscription.status values map 1:1 onto our billing_status enum. */
export function stripeStatusToBillingStatus(status: Stripe.Subscription.Status): SchoolBilling["status"] {
  return status;
}
