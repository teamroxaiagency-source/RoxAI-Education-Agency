import { requireCurrentStaff } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KANBAN_COLUMNS } from "@/lib/kanban";
import type { Inquiry } from "@/types/database";

export default async function PipelinePage() {
  const { school } = await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();

  const { data: inquiries } = await supabase
    .from("inquiries")
    .select("*")
    .eq("school_id", school.id)
    .order("created_at", { ascending: false });

  const columns = KANBAN_COLUMNS.map((column) => ({
    ...column,
    inquiries: (inquiries ?? []).filter((inquiry: Inquiry) => inquiry.status === column.status),
  }));

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Admissions pipeline</h1>
        <p className="text-sm text-[var(--color-muted)]">{inquiries?.length ?? 0} inquiries</p>
      </div>
      <KanbanBoard columns={columns} />
    </div>
  );
}
