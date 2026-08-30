"use client";

import { useState, useTransition } from "react";
import { updateAirtableConfig } from "@/app/actions/integrations";
import { Button } from "@/components/ui/Button";
import type { AirtableConfig } from "@/types/database";

export function AirtableConfigForm({ config }: { config: AirtableConfig | null }) {
  const [baseId, setBaseId] = useState(config?.base_id ?? "");
  const [tableName, setTableName] = useState(config?.table_name ?? "Leads");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() => {
          updateAirtableConfig(baseId, tableName).then(() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          });
        });
      }}
      className="flex flex-col gap-2.5"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-[var(--color-muted)]">Airtable Base ID</span>
        <input
          value={baseId}
          onChange={(e) => setBaseId(e.target.value)}
          placeholder="appXXXXXXXXXXXXXX"
          className="transition-color rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-[var(--color-muted)]">Table name</span>
        <input
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          className="transition-color rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="secondary" disabled={pending || !baseId || !tableName}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="animate-enter text-xs text-emerald-600">Saved</span>}
      </div>
    </form>
  );
}
