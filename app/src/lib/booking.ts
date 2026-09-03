import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyBookingToken, verifyTokenHash } from "@/lib/signing";
import { computeOpenSlots, isSlotStillOpen, type OpenSlot } from "@/lib/availability";
import { getAuthorizedCalendarForSchool, createCalendarEvent } from "@/lib/integrations/google-calendar";
import { syncInquiryToAirtable } from "@/lib/integrations/airtable";
import { recordAuditEvent } from "@/lib/audit";
import { sendReplyEmail } from "@/lib/postmark";
import { logError } from "@/lib/logger";
import type { Database, Inquiry, School } from "@/types/database";

export type ResolvedBookingLink =
  | { valid: true; inquiry: Inquiry; school: School; openSlots: OpenSlot[] }
  | { valid: false; reason: "invalid_or_expired_token" | "already_booked" | "not_found" };

/** Loads and validates a booking link (used by both the public page and the confirm route), and lists the real open slots for it. */
export async function resolveBookingLink(
  serviceClient: SupabaseClient<Database>,
  token: string,
): Promise<ResolvedBookingLink> {
  const verified = verifyBookingToken(token);
  if (!verified) return { valid: false, reason: "invalid_or_expired_token" };

  const { data: inquiry } = await serviceClient.from("inquiries").select("*").eq("id", verified.inquiryId).maybeSingle();
  if (!inquiry) return { valid: false, reason: "not_found" };

  if (!inquiry.booking_token_hash || !verifyTokenHash(token, inquiry.booking_token_hash)) {
    return { valid: false, reason: "invalid_or_expired_token" };
  }

  if (inquiry.scheduled_start) {
    return { valid: false, reason: "already_booked" };
  }

  const { data: school } = await serviceClient.from("schools").select("*").eq("id", inquiry.school_id).maybeSingle();
  if (!school) return { valid: false, reason: "not_found" };

  const openSlots = await computeOpenSlots(serviceClient, { schoolId: school.id, kind: "tour" });

  return { valid: true, inquiry, school, openSlots };
}

export type ConfirmBookingResult =
  | { status: "confirmed"; start: string; end: string }
  | { status: "slot_no_longer_available" }
  | { status: "invalid" };

/**
 * The second freebusy check happens inside isSlotStillOpen, immediately
 * before the write — this is the last moment the school's live calendar
 * (and this app's own bookings) can veto the slot the parent picked.
 */
export async function confirmBooking(
  serviceClient: SupabaseClient<Database>,
  token: string,
  slot: { start: string; end: string },
): Promise<ConfirmBookingResult> {
  const resolved = await resolveBookingLink(serviceClient, token);
  if (!resolved.valid) return { status: "invalid" };

  const { inquiry, school } = resolved;
  const start = new Date(slot.start);
  const end = new Date(slot.end);

  const stillOpen = await isSlotStillOpen(serviceClient, { schoolId: school.id, kind: "tour" }, { start, end });
  if (!stillOpen) return { status: "slot_no_longer_available" };

  const { data: updated, error: updateError } = await serviceClient
    .from("inquiries")
    .update({
      scheduled_kind: "tour",
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      status: "tour_scheduled",
    })
    .eq("id", inquiry.id)
    .is("scheduled_start", null) // guards against a parallel confirm on the same inquiry
    .select()
    .single();

  if (updateError) {
    // 23505 = unique_violation on inquiries_scheduled_slot_idx: another
    // parent's confirm for the same school+kind+start won the race.
    if ((updateError as { code?: string }).code === "23505") {
      return { status: "slot_no_longer_available" };
    }
    throw updateError;
  }

  if (!updated) return { status: "slot_no_longer_available" };

  let googleEventId: string | null = null;
  try {
    const { calendar, calendarId } = await getAuthorizedCalendarForSchool(serviceClient, school.id);
    googleEventId = await createCalendarEvent(calendar, calendarId, {
      summary: `Tour: ${inquiry.student_name ?? inquiry.parent_name ?? inquiry.parent_email}`,
      description: `Booked via the admissions inquiry pipeline.\nGrade interested: ${inquiry.grade_interested ?? "n/a"}\nParent: ${inquiry.parent_name ?? "n/a"} (${inquiry.parent_email})`,
      start,
      end,
      timeZone: school.timezone,
      attendeeEmail: inquiry.parent_email,
    });
    await serviceClient.from("inquiries").update({ google_event_id: googleEventId }).eq("id", inquiry.id);
  } catch (error) {
    // The DB-level booking is the durable source of truth; a missing
    // calendar event just means staff will need to add it by hand. Never
    // roll back a confirmed booking over a calendar API hiccup.
    logError(error, "Failed to create Google Calendar event for booking", { inquiryId: inquiry.id, schoolId: school.id });
  }

  await recordAuditEvent(serviceClient, {
    schoolId: school.id,
    inquiryId: inquiry.id,
    actorType: "parent",
    action: "booking.confirmed",
    metadata: { start: start.toISOString(), end: end.toISOString(), googleEventId },
  });

  await syncInquiryToAirtable(serviceClient, { ...inquiry, ...updated });

  const dateStr = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: school.timezone }).format(start);
  const timeStr = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: school.timezone }).format(start);

  await sendReplyEmail({
    to: inquiry.parent_email,
    subject: `Confirmed: your tour at ${school.name}`,
    textBody: `Hi ${inquiry.parent_name?.split(" ")[0] ?? "there"},\n\nYou're all set for a tour of ${school.name} on ${dateStr} at ${timeStr}. We look forward to seeing you!\n\nWarmly,\n${school.name} Admissions`,
    htmlBody: `<p>Hi ${inquiry.parent_name?.split(" ")[0] ?? "there"},</p><p>You're all set for a tour of <strong>${school.name}</strong> on ${dateStr} at ${timeStr}. We look forward to seeing you!</p><p>Warmly,<br/>${school.name} Admissions</p>`,
  });

  return { status: "confirmed", start: start.toISOString(), end: end.toISOString() };
}
