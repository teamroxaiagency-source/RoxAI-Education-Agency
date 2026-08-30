import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeOpenSlots } from "@/lib/availability";
import { createBookingToken } from "@/lib/signing";
import { getEnv } from "@/lib/env";
import type { Database, Inquiry, School } from "@/types/database";

export interface ComposedReply {
  subject: string;
  textBody: string;
  htmlBody: string;
  bookingToken: string;
  bookingTokenHash: string;
  bookingTokenExpiresAt: Date;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
};
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/**
 * Builds the same-day reply from real data only: the school's actual name
 * and grade, and up to three of its actual next-available tour slots
 * (computed by computeOpenSlots, the same function the booking page uses).
 * Never invents availability — if nothing is open in the window, the
 * reply says so honestly and still gives the parent a way to reach staff.
 */
export async function composeInquiryReply(
  serviceClient: SupabaseClient<Database>,
  school: School,
  inquiry: Inquiry,
): Promise<ComposedReply> {
  const env = getEnv();
  const openSlots = await computeOpenSlots(serviceClient, { schoolId: school.id, kind: "tour" });
  const previewSlots = openSlots.slice(0, 3);

  const { token, tokenHash, expiresAt } = createBookingToken(inquiry.id);
  const bookingUrl = `${env.NEXT_PUBLIC_APP_URL}/book/${token}`;

  const greetingName = inquiry.parent_name?.split(" ")[0] || "there";
  const gradeText = inquiry.grade_interested ? ` for ${inquiry.grade_interested}` : "";
  const studentText = inquiry.student_name ? ` for ${inquiry.student_name}` : "";

  const slotLines = previewSlots.map((slot) => formatSlotForTimezone(slot.start, school.timezone));

  const availabilityParagraph =
    previewSlots.length > 0
      ? `Here are our next available tour times:\n${slotLines.map((line) => `  • ${line}`).join("\n")}\n\nPick a time that works (or see more options) here: ${bookingUrl}`
      : `We don't have a tour slot open in the next two weeks just yet, but our admissions team will follow up personally with times shortly. You can also check for newly opened slots any time here: ${bookingUrl}`;

  const textBody =
    `Hi ${greetingName},\n\n` +
    `Thank you for reaching out to ${school.name} about enrollment${gradeText}${studentText}. ` +
    `We'd love to show you around.\n\n` +
    `${availabilityParagraph}\n\n` +
    `Warmly,\n${school.name} Admissions`;

  const htmlBody = `
    <p>Hi ${escapeHtml(greetingName)},</p>
    <p>Thank you for reaching out to <strong>${escapeHtml(school.name)}</strong> about enrollment${escapeHtml(gradeText)}${escapeHtml(studentText)}. We'd love to show you around.</p>
    ${
      previewSlots.length > 0
        ? `<p>Here are our next available tour times:</p>
           <ul>${slotLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
           <p><a href="${bookingUrl}" style="color:${escapeHtml(school.brand_primary_color)};font-weight:600;">Choose a time →</a></p>`
        : `<p>We don't have a tour slot open in the next two weeks just yet, but our admissions team will follow up personally with times shortly. You can also <a href="${bookingUrl}">check for newly opened slots</a> any time.</p>`
    }
    <p>Warmly,<br/>${escapeHtml(school.name)} Admissions</p>
  `.trim();

  return {
    subject: `Re: Your inquiry to ${school.name}`,
    textBody,
    htmlBody,
    bookingToken: token,
    bookingTokenHash: tokenHash,
    bookingTokenExpiresAt: expiresAt,
  };
}

function formatSlotForTimezone(date: Date, timezone: string): string {
  const dateStr = new Intl.DateTimeFormat("en-US", { ...DATE_FORMAT, timeZone: timezone }).format(date);
  const timeStr = new Intl.DateTimeFormat("en-US", { ...TIME_FORMAT, timeZone: timezone }).format(date);
  return `${dateStr} at ${timeStr}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
