"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";

interface Slot {
  start: string;
  end: string;
}

export function SlotPicker({ token, slots, timezone, schoolName }: { token: string; slots: Slot[]; timezone: string; schoolName: string }) {
  const [selected, setSelected] = useState<Slot | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Slot | null>(null);

  const groups = useMemo(() => groupByDay(slots, timezone), [slots, timezone]);

  if (confirmed) {
    return (
      <div className="animate-enter flex flex-col items-center gap-2 py-10 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-white"
          style={{ background: "var(--brand-primary)" }}
        >
          ✓
        </div>
        <h2 className="text-lg font-semibold">You&apos;re all set</h2>
        <p className="max-w-sm text-sm text-[var(--color-muted)]">
          Your tour at {schoolName} is confirmed for {formatFull(confirmed.start, timezone)}. A confirmation email is on
          its way.
        </p>
      </div>
    );
  }

  if (slots.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">No open times right now — please check back soon.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([day, daySlots]) => (
        <div key={day}>
          <h3 className="mb-2 text-sm font-medium text-[var(--color-muted)]">{day}</h3>
          <div className="flex flex-wrap gap-2">
            {daySlots.map((slot) => {
              const isSelected = selected?.start === slot.start;
              return (
                <button
                  key={slot.start}
                  onClick={() => setSelected(slot)}
                  className={`transition-color transition-press rounded-lg border px-3 py-2 text-sm ${
                    isSelected
                      ? "border-brand-primary bg-brand-primary text-white"
                      : "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-brand-primary"
                  }`}
                >
                  {formatTime(slot.start, timezone)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selected && (
        <div className="animate-enter sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-lg">
          <div className="text-sm">
            <p className="font-medium">{formatFull(selected.start, timezone)}</p>
            {error && <p className="text-red-600">{error}</p>}
          </div>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const response = await fetch(`/api/booking/${token}/confirm`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(selected),
                });
                if (response.ok) {
                  setConfirmed(selected);
                } else {
                  const data = await response.json().catch(() => ({}));
                  setError(data.error ?? "Something went wrong. Please try again.");
                  setSelected(null);
                }
              })
            }
          >
            {pending ? "Booking…" : "Confirm tour"}
          </Button>
        </div>
      )}
    </div>
  );
}

function groupByDay(slots: Slot[], timezone: string): [string, Slot[]][] {
  const map = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: timezone }).format(
      new Date(slot.start),
    );
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(slot);
  }
  return Array.from(map.entries());
}

function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
}

function formatFull(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}
