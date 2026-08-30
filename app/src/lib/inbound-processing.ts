import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractInquiryFields } from "@/lib/extraction";
import { computeDedupKey } from "@/lib/dedup";
import { composeInquiryReply } from "@/lib/reply-composer";
import { sendReplyEmail, type PostmarkInboundPayload } from "@/lib/postmark";
import { syncInquiryToAirtable } from "@/lib/integrations/airtable";
import { recordAuditEvent } from "@/lib/audit";
import type { Database, Inquiry } from "@/types/database";

export type InboundProcessingResult =
  | { outcome: "processed"; inquiryId: string; isNewInquiry: boolean }
  | { outcome: "unrouted"; recipient: string };

/**
 * The full inbound-email pipeline, end to end: route to a school, ground
 * field extraction against that school's real data, dedup, persist,
 * compose and send a same-day reply from real availability, audit, sync.
 * Called by the Postmark webhook route handler after auth has already
 * been verified.
 */
export async function processInboundEmail(
  serviceClient: SupabaseClient<Database>,
  payload: PostmarkInboundPayload,
): Promise<InboundProcessingResult> {
  const recipient = payload.OriginalRecipient || payload.To;

  const { data: school } = await serviceClient
    .from("schools")
    .select("*")
    .eq("admissions_inbound_address", recipient.toLowerCase())
    .maybeSingle();

  if (!school) {
    return { outcome: "unrouted", recipient };
  }

  const extracted = await extractInquiryFields({
    fromName: payload.FromName || null,
    fromEmail: payload.From,
    subject: payload.Subject,
    textBody: payload.TextBody,
    gradeLevels: school.grade_levels,
  });

  const dedupKey = computeDedupKey(payload.From, extracted.gradeInterested);

  const { data: existingInquiry } = await serviceClient
    .from("inquiries")
    .select("*")
    .eq("school_id", school.id)
    .eq("dedup_key", dedupKey)
    .not("status", "in", "(enrolled,closed_lost)")
    .maybeSingle();

  let inquiry: Inquiry;
  let isNewInquiry = false;

  if (existingInquiry) {
    const { data: updated, error: updateError } = await serviceClient
      .from("inquiries")
      .update({
        parent_name: existingInquiry.parent_name ?? extracted.parentName,
        student_name: existingInquiry.student_name ?? extracted.studentName,
        parent_phone: existingInquiry.parent_phone ?? extracted.parentPhone,
      })
      .eq("id", existingInquiry.id)
      .select()
      .single();

    if (updateError || !updated) throw updateError ?? new Error("Failed to update existing inquiry");
    inquiry = updated;
  } else {
    const { data: created, error: insertError } = await serviceClient
      .from("inquiries")
      .insert({
        school_id: school.id,
        status: "new",
        parent_name: extracted.parentName,
        parent_email: payload.From,
        parent_phone: extracted.parentPhone,
        student_name: extracted.studentName,
        grade_interested: extracted.gradeInterested,
        source: "email",
        dedup_key: dedupKey,
      })
      .select()
      .single();

    if (insertError || !created) throw insertError ?? new Error("Failed to create inquiry");
    inquiry = created;
    isNewInquiry = true;
  }

  await serviceClient.from("messages").insert({
    school_id: school.id,
    inquiry_id: inquiry.id,
    direction: "inbound",
    channel: "email",
    from_address: payload.From,
    to_address: recipient,
    subject: payload.Subject,
    body_text: payload.TextBody,
    body_html: payload.HtmlBody || null,
    postmark_message_id: payload.MessageID,
  });

  await recordAuditEvent(serviceClient, {
    schoolId: school.id,
    inquiryId: inquiry.id,
    actorType: "parent",
    action: isNewInquiry ? "inquiry.created" : "inquiry.message_received",
    metadata: { extractionMethod: extracted.method, postmarkMessageId: payload.MessageID },
  });

  const reply = await composeInquiryReply(serviceClient, school, inquiry);

  const sendResult = await sendReplyEmail({
    to: payload.From,
    subject: reply.subject,
    textBody: reply.textBody,
    htmlBody: reply.htmlBody,
    inReplyToMessageId: payload.MessageID,
  });

  await serviceClient.from("messages").insert({
    school_id: school.id,
    inquiry_id: inquiry.id,
    direction: "outbound",
    channel: "email",
    from_address: school.admissions_reply_from,
    to_address: payload.From,
    subject: reply.subject,
    body_text: reply.textBody,
    body_html: reply.htmlBody,
    postmark_message_id: sendResult.postmarkMessageId,
  });

  const { data: withBookingToken } = await serviceClient
    .from("inquiries")
    .update({
      status: isNewInquiry ? "contacted" : inquiry.status,
      booking_token_hash: reply.bookingTokenHash,
      booking_token_expires_at: reply.bookingTokenExpiresAt.toISOString(),
    })
    .eq("id", inquiry.id)
    .select()
    .single();

  await recordAuditEvent(serviceClient, {
    schoolId: school.id,
    inquiryId: inquiry.id,
    actorType: "system",
    action: "reply.sent",
    metadata: { postmarkMessageId: sendResult.postmarkMessageId },
  });

  await syncInquiryToAirtable(serviceClient, withBookingToken ?? inquiry);

  return { outcome: "processed", inquiryId: inquiry.id, isNewInquiry };
}
