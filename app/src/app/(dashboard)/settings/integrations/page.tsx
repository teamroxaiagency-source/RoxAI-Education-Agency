import { requireCurrentStaff } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { AirtableConfigForm } from "@/components/settings/AirtableConfigForm";
import type { AirtableConfig } from "@/types/database";

const STATUS_COLORS: Record<string, string> = {
  connected: "text-emerald-600",
  disconnected: "text-[var(--color-muted)]",
  error: "text-red-600",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ google_connected?: string; google_error?: string }>;
}) {
  const { staff } = await requireCurrentStaff();
  const { google_connected, google_error } = await searchParams;
  const supabase = await createServerSupabaseClient();

  const { data: integrations } = await supabase.from("school_integrations").select("*");

  const google = integrations?.find((i) => i.provider === "google_calendar");
  const airtable = integrations?.find((i) => i.provider === "airtable");

  if (staff.role !== "admin") {
    return <p className="text-sm text-[var(--color-muted)]">Only school admins can manage integrations.</p>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Integrations</h1>

      {google_connected && (
        <p className="animate-enter rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Google Calendar connected successfully.
        </p>
      )}
      {google_error && (
        <p className="animate-enter rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t connect Google Calendar ({google_error}). Please try again.
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-[var(--color-line)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Google Calendar</h2>
            <p className={`text-sm ${STATUS_COLORS[google?.status ?? "disconnected"]}`}>
              {google?.status === "connected" ? "Connected" : google?.status === "error" ? "Error — reconnect" : "Not connected"}
            </p>
          </div>
          <a href="/api/integrations/google/oauth">
            <Button variant="secondary">{google?.status === "connected" ? "Reconnect" : "Connect"}</Button>
          </a>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Drives real tour availability and prevents double-booking by checking this calendar&apos;s freebusy before every
          booking link is issued and again the instant a parent confirms.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-[var(--color-line)] p-4">
        <div>
          <h2 className="font-medium">Airtable lead sync</h2>
          <p className={`text-sm ${STATUS_COLORS[airtable?.status ?? "disconnected"]}`}>
            {airtable?.status === "connected" ? "Connected" : airtable?.status === "error" ? "Error" : "Not connected"}
          </p>
        </div>
        <AirtableConfigForm config={(airtable?.config as AirtableConfig) ?? null} />
        <p className="text-xs text-[var(--color-muted)]">
          Every inquiry create and status change pushes to this base, matched on a stable inquiry ID so re-syncs
          update the same row instead of duplicating it.
        </p>
      </section>
    </div>
  );
}
