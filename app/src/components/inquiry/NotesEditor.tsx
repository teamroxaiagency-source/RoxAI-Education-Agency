"use client";

import { useState, useTransition } from "react";
import { updateInquiryNotes } from "@/app/actions/inquiries";
import { Button } from "@/components/ui/Button";

export function NotesEditor({ inquiryId, initialNotes }: { inquiryId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? "");
  const [pending, startTransition] = useTransition();

  const dirty = notes !== savedNotes;

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder="Internal notes (not visible to the parent)…"
        className="transition-color resize-none rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-brand-primary"
      />
      {dirty && (
        <div className="animate-enter flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setNotes(savedNotes)}
            disabled={pending}
          >
            Discard
          </Button>
          <Button
            type="button"
            onClick={() =>
              startTransition(() => {
                updateInquiryNotes(inquiryId, notes)
                  .then(() => setSavedNotes(notes))
                  .catch(() => setNotes(savedNotes));
              })
            }
            disabled={pending}
          >
            {pending ? "Saving…" : "Save notes"}
          </Button>
        </div>
      )}
    </div>
  );
}
