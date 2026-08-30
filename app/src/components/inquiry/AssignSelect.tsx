"use client";

import { useState, useTransition } from "react";
import { assignInquiry } from "@/app/actions/inquiries";
import type { StaffUser } from "@/types/database";

export function AssignSelect({
  inquiryId,
  assignedStaffId,
  staffOptions,
}: {
  inquiryId: string;
  assignedStaffId: string | null;
  staffOptions: StaffUser[];
}) {
  const [value, setValue] = useState(assignedStaffId ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value || null;
        const prev = value;
        setValue(next ?? "");
        startTransition(() => {
          assignInquiry(inquiryId, next).catch(() => setValue(prev));
        });
      }}
      className="transition-color rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary disabled:opacity-60"
    >
      <option value="">Unassigned</option>
      {staffOptions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.full_name}
        </option>
      ))}
    </select>
  );
}
