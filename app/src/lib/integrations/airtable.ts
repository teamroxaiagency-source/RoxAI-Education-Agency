import "server-only";
import Airtable from "airtable";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnv, isAirtableConfigured } from "@/lib/env";
import type { AirtableConfig, Database, Inquiry } from "@/types/database";

/**
 * Pushes an inquiry's current state into the school's existing Airtable
 * lead-tracking base. One record per inquiry, matched on a stable
 * `RoxAI Inquiry ID` field so repeated syncs update in place instead of
 * creating duplicates. A no-op (not an error) when Airtable isn't
 * configured for this school or at the account level — sync is additive,
 * never load-bearing for the core email/booking flow.
 */
export async function syncInquiryToAirtable(serviceClient: SupabaseClient<Database>, inquiry: Inquiry): Promise<void> {
  if (!isAirtableConfigured()) return;

  const { data: integration } = await serviceClient
    .from("school_integrations")
    .select("*")
    .eq("school_id", inquiry.school_id)
    .eq("provider", "airtable")
    .eq("status", "connected")
    .maybeSingle();

  if (!integration) return;

  const config = integration.config as unknown as AirtableConfig;
  if (!config?.base_id || !config?.table_name) return;

  const env = getEnv();
  const base = new Airtable({ apiKey: env.AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(config.base_id);
  const table = base(config.table_name);

  try {
    const existing = await table
      .select({ filterByFormula: `{RoxAI Inquiry ID} = "${inquiry.id}"`, maxRecords: 1 })
      .firstPage();

    const fields = {
      "RoxAI Inquiry ID": inquiry.id,
      "Parent Name": inquiry.parent_name ?? "",
      "Parent Email": inquiry.parent_email,
      "Parent Phone": inquiry.parent_phone ?? "",
      "Student Name": inquiry.student_name ?? "",
      "Grade Interested": inquiry.grade_interested ?? "",
      Status: inquiry.status,
      "Tour Scheduled At": inquiry.scheduled_start ?? "",
    };

    const existingRecord = existing[0];
    if (existingRecord) {
      await table.update(existingRecord.id, fields);
    } else {
      await table.create([{ fields }]);
    }

    await serviceClient
      .from("school_integrations")
      .update({ status: "connected", last_error: null })
      .eq("id", integration.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Airtable sync error";
    console.error(`[airtable] sync failed for inquiry ${inquiry.id}:`, message);
    await serviceClient.from("school_integrations").update({ status: "error", last_error: message }).eq("id", integration.id);
  }
}
