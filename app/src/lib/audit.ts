import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditActorType, Database } from "@/types/database";

interface RecordAuditEventArgs {
  schoolId: string;
  inquiryId?: string | null;
  actorType: AuditActorType;
  actorStaffId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit_log row. Always called with the service-role client —
 * staff have no insert policy on audit_log (see 0002_rls.sql), so the
 * trail can't be edited or fabricated from the dashboard.
 */
export async function recordAuditEvent(
  serviceClient: SupabaseClient<Database>,
  { schoolId, inquiryId = null, actorType, actorStaffId = null, action, metadata = {} }: RecordAuditEventArgs,
) {
  const { error } = await serviceClient.from("audit_log").insert({
    school_id: schoolId,
    inquiry_id: inquiryId,
    actor_type: actorType,
    actor_staff_id: actorStaffId,
    action,
    metadata,
  });

  if (error) {
    // Auditing must never take down the primary flow (an inbound webhook
    // still has to reply to the parent even if the audit write fails) —
    // log loudly instead of throwing.
    console.error(`[audit] failed to record "${action}" for school ${schoolId}:`, error.message);
  }
}
