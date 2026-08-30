"use client";

import { useState, useTransition } from "react";
import { sendManualReply } from "@/app/actions/inquiries";
import { Button } from "@/components/ui/Button";

export function ReplyComposer({ inquiryId, defaultSubject }: { inquiryId: string; defaultSubject: string }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Write a reply
      </Button>
    );
  }

  return (
    <div className="animate-enter flex flex-col gap-2 rounded-xl border border-[var(--color-line)] p-3.5">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="transition-color rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-brand-primary"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="Write your reply to the parent…"
        className="transition-color resize-none rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-brand-primary"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button
          disabled={pending || body.trim().length === 0}
          onClick={() =>
            startTransition(() => {
              setError(null);
              sendManualReply(inquiryId, subject, body)
                .then(() => {
                  setOpen(false);
                  setBody("");
                })
                .catch((err) => setError(err instanceof Error ? err.message : "Failed to send"));
            })
          }
        >
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </div>
  );
}
