import { requireCurrentStaff } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/env";
import { BillingActions } from "@/components/settings/BillingActions";
import { ACTIVE_BILLING_STATUSES } from "@/types/database";

const STATUS_LABELS: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Past due — payment needed",
  canceled: "Canceled",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  unpaid: "Unpaid",
  paused: "Paused",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { staff, school } = await requireCurrentStaff();
  const { checkout } = await searchParams;

  if (staff.role !== "admin") {
    return <p className="text-sm text-[var(--color-muted)]">Only school admins can manage billing.</p>;
  }

  if (!isStripeConfigured()) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Billing isn&apos;t configured for this deployment yet — nothing to do here until RoxAI sets up Stripe.
        </p>
      </div>
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: billing } = await supabase.from("school_billing").select("*").eq("school_id", school.id).maybeSingle();

  const status = billing?.status ?? "trialing";
  const hasSubscription = Boolean(billing?.stripe_subscription_id);
  const isActive = ACTIVE_BILLING_STATUSES.includes(status);

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold">Billing</h1>

      {checkout === "success" && (
        <p className="animate-enter mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Subscription confirmed — thank you!
        </p>
      )}
      {checkout === "canceled" && (
        <p className="animate-enter mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Checkout was canceled — no changes were made.
        </p>
      )}

      <section className="mt-6 flex flex-col gap-3 rounded-xl border border-[var(--color-line)] p-4">
        <div>
          <h2 className="font-medium">{school.name}</h2>
          <p className={`text-sm ${isActive ? "text-emerald-600" : "text-amber-600"}`}>{STATUS_LABELS[status] ?? status}</p>
          {billing?.current_period_end && (
            <p className="text-xs text-[var(--color-muted)]">
              Current period ends{" "}
              {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(
                new Date(billing.current_period_end),
              )}
            </p>
          )}
        </div>
        <BillingActions hasSubscription={hasSubscription} />
      </section>
    </div>
  );
}
