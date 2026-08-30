import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentStaff } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatusSelect } from "@/components/inquiry/StatusSelect";
import { AssignSelect } from "@/components/inquiry/AssignSelect";
import { NotesEditor } from "@/components/inquiry/NotesEditor";
import { MessageThread } from "@/components/inquiry/MessageThread";
import { AuditTrail } from "@/components/inquiry/AuditTrail";
import { ReplyComposer } from "@/components/inquiry/ReplyComposer";

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { school } = await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();

  const { data: inquiry } = await supabase.from("inquiries").select("*").eq("id", id).maybeSingle();
  if (!inquiry) notFound();

  const [{ data: messages }, { data: auditEntries }, { data: staffOptions }] = await Promise.all([
    supabase.from("messages").select("*").eq("inquiry_id", id).order("created_at", { ascending: true }),
    supabase.from("audit_log").select("*").eq("inquiry_id", id).order("created_at", { ascending: false }),
    supabase.from("staff_users").select("*").eq("school_id", school.id).order("full_name"),
  ]);

  return (
    <div>
      <Link href="/" className="transition-color text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">
        ← Back to pipeline
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{inquiry.student_name || inquiry.parent_name || inquiry.parent_email}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {inquiry.parent_name && `${inquiry.parent_name} · `}
            {inquiry.parent_email}
            {inquiry.parent_phone && ` · ${inquiry.parent_phone}`}
          </p>
        </div>
        <StatusBadge status={inquiry.status} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">Conversation</h2>
            <MessageThread messages={messages ?? []} />
          </section>
          <section>
            <ReplyComposer inquiryId={inquiry.id} defaultSubject={`Re: Your inquiry to ${school.name}`} />
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-xl border border-[var(--color-line)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-muted)]">Details</h2>
            <Field label="Status">
              <StatusSelect inquiryId={inquiry.id} status={inquiry.status} />
            </Field>
            <Field label="Assigned to">
              <AssignSelect inquiryId={inquiry.id} assignedStaffId={inquiry.assigned_staff_id} staffOptions={staffOptions ?? []} />
            </Field>
            <Field label="Grade interested">
              <p className="text-sm">{inquiry.grade_interested ?? "Not specified"}</p>
            </Field>
            {inquiry.scheduled_start && (
              <Field label={`Tour ${inquiry.scheduled_kind === "call" ? "call" : ""} scheduled`}>
                <p className="text-sm">
                  {new Intl.DateTimeFormat("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: school.timezone,
                  }).format(new Date(inquiry.scheduled_start))}
                </p>
              </Field>
            )}
            <Field label="Source">
              <p className="text-sm capitalize">{inquiry.source}</p>
            </Field>
          </section>

          <section className="flex flex-col gap-2 rounded-xl border border-[var(--color-line)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-muted)]">Internal notes</h2>
            <NotesEditor inquiryId={inquiry.id} initialNotes={inquiry.notes} />
          </section>

          <section className="rounded-xl border border-[var(--color-line)] p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-muted)]">Activity</h2>
            <AuditTrail entries={auditEntries ?? []} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[var(--color-muted)]">{label}</span>
      {children}
    </div>
  );
}
