import { resolveBookingLink } from "@/lib/booking";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { schoolThemeStyle } from "@/lib/theme";
import { SlotPicker } from "@/components/booking/SlotPicker";

const INVALID_MESSAGES: Record<string, string> = {
  invalid_or_expired_token: "This booking link is invalid or has expired. Please reply to your email and we'll send a new one.",
  already_booked: "This tour is already booked. Check your email for the confirmation, or reply if you need to reschedule.",
  not_found: "We couldn't find this booking link.",
};

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveBookingLink(createServiceRoleClient(), token);

  if (!resolved.valid) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="max-w-sm text-center text-sm text-[var(--color-muted)]">{INVALID_MESSAGES[resolved.reason]}</p>
      </main>
    );
  }

  const { school, inquiry, openSlots } = resolved;

  return (
    <main style={schoolThemeStyle(school)} className="min-h-screen bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-xl px-6 py-12">
        <div className="animate-enter mb-8 flex items-center gap-3">
          {school.brand_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.brand_logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              {school.name.slice(0, 1)}
            </span>
          )}
          <div>
            <h1 className="text-lg font-semibold">Book your tour</h1>
            <p className="text-sm text-[var(--color-muted)]">{school.name}</p>
          </div>
        </div>

        <p className="animate-enter mb-6 text-sm text-[var(--color-muted)]">
          Hi {inquiry.parent_name?.split(" ")[0] || "there"}, pick a time that works for
          {inquiry.student_name ? ` ${inquiry.student_name}` : " you"}
          {inquiry.grade_interested ? ` (${inquiry.grade_interested})` : ""}.
        </p>

        <SlotPicker
          token={token}
          slots={openSlots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }))}
          timezone={school.timezone}
          schoolName={school.name}
        />
      </div>
    </main>
  );
}
