"use client";

import Link from "next/link";
import type { Inquiry } from "@/types/database";

interface InquiryCardProps {
  inquiry: Inquiry;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  dragging: boolean;
}

export function InquiryCard({ inquiry, onDragStart, dragging }: InquiryCardProps) {
  return (
    <Link href={`/inquiries/${inquiry.id}`} draggable={false}>
      <div
        draggable
        onDragStart={onDragStart}
        className={`hover-lift transition-color cursor-grab rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5 active:cursor-grabbing ${
          dragging ? "opacity-40" : "opacity-100"
        }`}
      >
        <p className="text-sm font-medium">{inquiry.student_name || inquiry.parent_name || inquiry.parent_email}</p>
        {inquiry.grade_interested && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{inquiry.grade_interested}</p>}
        <p className="mt-2 truncate text-xs text-[var(--color-muted)]">{inquiry.parent_email}</p>
        {inquiry.scheduled_start && (
          <p className="mt-2 text-xs font-medium text-brand-primary">
            {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
              new Date(inquiry.scheduled_start),
            )}
          </p>
        )}
      </div>
    </Link>
  );
}
