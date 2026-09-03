import type { AuditLogEntry } from "@/types/database";

const ACTION_LABELS: Record<string, string> = {
  "inquiry.created": "Inquiry created",
  "inquiry.message_received": "New message received",
  "reply.sent": "Automated reply sent",
  "reply.sent_manual": "Staff reply sent",
  "status.changed": "Status changed",
  "assignment.changed": "Assignment changed",
  "notes.updated": "Notes updated",
  "booking.confirmed": "Tour booked",
  "integration.google_calendar.connected": "Google Calendar connected",
  "integration.airtable.configured": "Airtable configured",
  "integration.google_calendar.disconnected": "Google Calendar disconnected",
  "integration.airtable.disconnected": "Airtable disconnected",
  "billing.subscribed": "Subscription started",
  "billing.status_changed": "Billing status changed",
};

export function AuditTrail({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">No activity yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-2.5 border-l border-[var(--color-line)] pl-4">
      {entries.map((entry) => (
        <li key={entry.id} className="relative text-sm">
          <span className="absolute -left-[21px] top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-line)]" />
          <span className="text-[var(--color-ink)]">{ACTION_LABELS[entry.action] ?? entry.action}</span>
          <span className="ml-2 text-xs text-[var(--color-muted)]">
            {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
              new Date(entry.created_at),
            )}
            {" · "}
            {entry.actor_type}
          </span>
        </li>
      ))}
    </ol>
  );
}
