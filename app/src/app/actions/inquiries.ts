"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentStaff } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { recordAuditEvent } from "@/lib/audit";
import { sendReplyEmail } from "@/lib/postmark";
import { syncInquiryToAirtable } from "@/lib/integrations/airtable";
import type { InquiryStatus } from "@/types/database";

/**
 * All mutations here run through the *request-scoped* Supabase client
 * first (createServerSupabaseClient — carries the staff member's session,
 * so RLS guarantees they can only ever touch their own school's row) and
 * only reach for the service-role client afterward, to write the audit
 * entry staff have no insert policy for. If the RLS-scoped update fails
 * (wrong school, no such row), nothing is audited — there's nothing to
 * audit.
 */

export async function updateInquiryStatus(inquiryId: string, status: InquiryStatus) {
  const { staff, school } = await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();

  const { data: updated, error } = await supabase
    .from("inquiries")
    .update({ status })
    .eq("id", inquiryId)
    .select()
    .single();

  if (error || !updated) {
    throw new Error(error?.message ?? "Inquiry not found");
  }

  const serviceClient = createServiceRoleClient();
  await recordAuditEvent(serviceClient, {
    schoolId: school.id,
    inquiryId,
    actorType: "staff",
    actorStaffId: staff.id,
    action: "status.changed",
    metadata: { status },
  });
  await syncInquiryToAirtable(serviceClient, updated);

  revalidatePath("/");
  revalidatePath(`/inquiries/${inquiryId}`);
}

export async function assignInquiry(inquiryId: string, assignedStaffId: string | null) {
  const { staff, school } = await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("inquiries").update({ assigned_staff_id: assignedStaffId }).eq("id", inquiryId);
  if (error) throw new Error(error.message);

  await recordAuditEvent(createServiceRoleClient(), {
    schoolId: school.id,
    inquiryId,
    actorType: "staff",
    actorStaffId: staff.id,
    action: "assignment.changed",
    metadata: { assignedStaffId },
  });

  revalidatePath(`/inquiries/${inquiryId}`);
}

export async function updateInquiryNotes(inquiryId: string, notes: string) {
  const { staff, school } = await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("inquiries").update({ notes }).eq("id", inquiryId);
  if (error) throw new Error(error.message);

  await recordAuditEvent(createServiceRoleClient(), {
    schoolId: school.id,
    inquiryId,
    actorType: "staff",
    actorStaffId: staff.id,
    action: "notes.updated",
  });

  revalidatePath(`/inquiries/${inquiryId}`);
}

export async function sendManualReply(inquiryId: string, subject: string, body: string) {
  const { staff, school } = await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();

  const { data: inquiry, error: inquiryError } = await supabase
    .from("inquiries")
    .select("*")
    .eq("id", inquiryId)
    .single();

  if (inquiryError || !inquiry) throw new Error(inquiryError?.message ?? "Inquiry not found");

  const htmlBody = body
    .split("\n\n")
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const sendResult = await sendReplyEmail({
    to: inquiry.parent_email,
    subject,
    textBody: body,
    htmlBody,
  });

  const { error: messageError } = await supabase.from("messages").insert({
    school_id: school.id,
    inquiry_id: inquiryId,
    direction: "outbound",
    channel: "email",
    from_address: school.admissions_reply_from,
    to_address: inquiry.parent_email,
    subject,
    body_text: body,
    body_html: htmlBody,
    postmark_message_id: sendResult.postmarkMessageId,
  });

  if (messageError) throw new Error(messageError.message);

  await recordAuditEvent(createServiceRoleClient(), {
    schoolId: school.id,
    inquiryId,
    actorType: "staff",
    actorStaffId: staff.id,
    action: "reply.sent_manual",
    metadata: { postmarkMessageId: sendResult.postmarkMessageId },
  });

  revalidatePath(`/inquiries/${inquiryId}`);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
