import type { InquiryStatus } from "@/types/database";

const STATUS_META: Record<InquiryStatus, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  contacted: { label: "Contacted", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  tour_scheduled: { label: "Tour scheduled", className: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  tour_completed: { label: "Tour completed", className: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300" },
  enrolled: { label: "Enrolled", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  closed_lost: { label: "Closed – lost", className: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
};

export function StatusBadge({ status }: { status: InquiryStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export { STATUS_META };
