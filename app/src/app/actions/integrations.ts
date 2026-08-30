"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentStaff } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * RLS (school_integrations_admin_manage) already restricts this upsert to
 * admins of the caller's own school — requireCurrentStaff's role check
 * here is a fast, friendly rejection, not the actual security boundary.
 */
export async function updateAirtableConfig(baseId: string, tableName: string) {
  const { staff, school } = await requireCurrentStaff();
  if (staff.role !== "admin") throw new Error("Only school admins can manage integrations");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("school_integrations").upsert(
    {
      school_id: school.id,
      provider: "airtable",
      status: "connected",
      config: { base_id: baseId, table_name: tableName },
      connected_by_staff_id: staff.id,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "school_id,provider" },
  );

  if (error) throw new Error(error.message);

  await recordAuditEvent(createServiceRoleClient(), {
    schoolId: school.id,
    actorType: "staff",
    actorStaffId: staff.id,
    action: "integration.airtable.configured",
    metadata: { baseId, tableName },
  });

  revalidatePath("/settings/integrations");
}

export async function disconnectIntegration(provider: "google_calendar" | "airtable") {
  const { staff, school } = await requireCurrentStaff();
  if (staff.role !== "admin") throw new Error("Only school admins can manage integrations");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("school_integrations")
    .update({ status: "disconnected" })
    .eq("school_id", school.id)
    .eq("provider", provider);

  if (error) throw new Error(error.message);

  await recordAuditEvent(createServiceRoleClient(), {
    schoolId: school.id,
    actorType: "staff",
    actorStaffId: staff.id,
    action: `integration.${provider}.disconnected`,
  });

  revalidatePath("/settings/integrations");
}
