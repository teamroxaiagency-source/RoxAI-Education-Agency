"use client";

import { useState, useTransition } from "react";
import { updateInquiryStatus } from "@/app/actions/inquiries";
import type { InquiryStatus } from "@/types/database";
import { STATUS_META } from "@/components/ui/StatusBadge";

const STATUSES: InquiryStatus[] = ["new", "contacted", "tour_scheduled", "tour_completed", "enrolled", "closed_lost"];

export function StatusSelect({ inquiryId, status }: { inquiryId: string; status: InquiryStatus }) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as InquiryStatus;
        const prev = value;
        setValue(next);
        startTransition(() => {
          updateInquiryStatus(inquiryId, next).catch(() => setValue(prev));
        });
      }}
      className="transition-color rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary disabled:opacity-60"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}
