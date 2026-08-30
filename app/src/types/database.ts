// Hand-written mirror of supabase/migrations/*.sql. Keep in sync manually
// (or regenerate with `supabase gen types typescript` once a live project
// exists) — there is no live Supabase project wired into this pilot repo yet.

export type InquiryStatus =
  | "new"
  | "contacted"
  | "tour_scheduled"
  | "tour_completed"
  | "enrolled"
  | "closed_lost";

export const OPEN_INQUIRY_STATUSES: InquiryStatus[] = [
  "new",
  "contacted",
  "tour_scheduled",
  "tour_completed",
];

export const CLOSED_INQUIRY_STATUSES: InquiryStatus[] = ["enrolled", "closed_lost"];

export type StaffRole = "admin" | "admissions_staff";
export type IntegrationProvider = "google_calendar" | "airtable";
export type IntegrationStatus = "disconnected" | "connected" | "error";
export type MessageDirection = "inbound" | "outbound";
export type AuditActorType = "system" | "staff" | "parent";
export type BookingKind = "tour" | "call";

export type School = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  grade_levels: string[];
  admissions_inbound_address: string;
  admissions_reply_from: string;
  brand_primary_color: string;
  brand_secondary_color: string;
  brand_logo_url: string | null;
  brand_font_family: string;
  created_at: string;
  updated_at: string;
}

export type StaffUser = {
  id: string;
  school_id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  created_at: string;
}

export type Inquiry = {
  id: string;
  school_id: string;
  status: InquiryStatus;
  parent_name: string | null;
  parent_email: string;
  parent_phone: string | null;
  student_name: string | null;
  grade_interested: string | null;
  source: string;
  assigned_staff_id: string | null;
  notes: string | null;
  dedup_key: string;
  scheduled_kind: BookingKind | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  google_event_id: string | null;
  booking_token_hash: string | null;
  booking_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Message = {
  id: string;
  school_id: string;
  inquiry_id: string;
  direction: MessageDirection;
  channel: "email";
  from_address: string;
  to_address: string;
  subject: string | null;
  body_text: string;
  body_html: string | null;
  postmark_message_id: string | null;
  created_at: string;
}

export type AvailabilityRule = {
  id: string;
  school_id: string;
  staff_id: string | null;
  kind: BookingKind;
  day_of_week: number; // 0 = Sunday .. 6 = Saturday
  start_time: string; // "HH:MM:SS"
  end_time: string;
  slot_minutes: number;
  active: boolean;
  created_at: string;
}

export type AuditLogEntry = {
  id: string;
  school_id: string;
  inquiry_id: string | null;
  actor_type: AuditActorType;
  actor_staff_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type SchoolIntegration = {
  id: string;
  school_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  last_error: string | null;
  connected_by_staff_id: string | null;
  connected_at: string | null;
  updated_at: string;
}

export type GoogleCalendarConfig = {
  calendar_id: string;
}

export type AirtableConfig = {
  base_id: string;
  table_name: string;
}

export type SchoolIntegrationSecret = {
  integration_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  updated_at: string;
}

type TableDef<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      schools: TableDef<School>;
      staff_users: TableDef<StaffUser>;
      inquiries: TableDef<Inquiry>;
      messages: TableDef<Message>;
      availability: TableDef<AvailabilityRule>;
      audit_log: TableDef<AuditLogEntry>;
      school_integrations: TableDef<SchoolIntegration>;
      school_integration_secrets: TableDef<SchoolIntegrationSecret>;
    };
    Views: Record<string, never>;
    Functions: {
      app_current_school_id: { Args: Record<string, never>; Returns: string };
      app_current_staff_role: { Args: Record<string, never>; Returns: string };
    };
    Enums: {
      inquiry_status: InquiryStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
