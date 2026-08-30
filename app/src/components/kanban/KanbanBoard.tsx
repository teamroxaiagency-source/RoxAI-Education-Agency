"use client";

import { useState, useTransition } from "react";
import { InquiryCard } from "@/components/kanban/InquiryCard";
import { updateInquiryStatus } from "@/app/actions/inquiries";
import type { Inquiry, InquiryStatus } from "@/types/database";

interface Column {
  status: InquiryStatus;
  title: string;
  inquiries: Inquiry[];
}

/**
 * Native HTML5 drag-and-drop — no extra dependency needed for a
 * single-board, mouse-driven Kanban. Optimistic: the card moves the
 * instant it's dropped and only reverts if the server action throws
 * (RLS denial, network error), so status changes feel instant without
 * pretending a failed write succeeded.
 */
export function KanbanBoard({ columns: initialColumns }: { columns: Column[] }) {
  const [columns, setColumns] = useState(initialColumns);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<InquiryStatus | null>(null);
  const [, startTransition] = useTransition();

  function moveCard(inquiryId: string, toStatus: InquiryStatus) {
    let fromStatus: InquiryStatus | null = null;
    let movedCard: Inquiry | undefined;

    setColumns((prev) => {
      const next = prev.map((col) => ({ ...col, inquiries: [...col.inquiries] }));
      for (const col of next) {
        const idx = col.inquiries.findIndex((i) => i.id === inquiryId);
        if (idx !== -1) {
          fromStatus = col.status;
          [movedCard] = col.inquiries.splice(idx, 1);
        }
      }
      if (movedCard && fromStatus !== toStatus) {
        const target = next.find((col) => col.status === toStatus);
        target?.inquiries.unshift({ ...movedCard, status: toStatus });
      } else if (movedCard) {
        const target = next.find((col) => col.status === toStatus);
        target?.inquiries.unshift(movedCard);
      }
      return next;
    });

    if (fromStatus === toStatus || !movedCard) return;

    startTransition(() => {
      updateInquiryStatus(inquiryId, toStatus).catch(() => {
        // Revert on failure.
        setColumns(initialColumns);
      });
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {columns.map((column) => (
        <div
          key={column.status}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverStatus(column.status);
          }}
          onDragLeave={() => setDragOverStatus((s) => (s === column.status ? null : s))}
          onDrop={(e) => {
            e.preventDefault();
            const inquiryId = e.dataTransfer.getData("text/plain");
            setDraggingId(null);
            setDragOverStatus(null);
            if (inquiryId) moveCard(inquiryId, column.status);
          }}
          className={`transition-color flex min-h-[200px] flex-col gap-2 rounded-xl p-2 ${
            dragOverStatus === column.status ? "bg-brand-primary/5" : "bg-transparent"
          }`}
        >
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold">{column.title}</h2>
            <span className="text-xs text-[var(--color-muted)]">{column.inquiries.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {column.inquiries.map((inquiry) => (
              <InquiryCard
                key={inquiry.id}
                inquiry={inquiry}
                dragging={draggingId === inquiry.id}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", inquiry.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingId(inquiry.id);
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
