import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthorizedCalendarForSchool, getBusyIntervals, type BusyInterval } from "@/lib/integrations/google-calendar";
import type { BookingKind, Database } from "@/types/database";

export interface OpenSlot {
  start: Date;
  end: Date;
}

interface ComputeOpenSlotsArgs {
  schoolId: string;
  kind: BookingKind;
  daysAhead?: number;
  /** Slots must start at least this far in the future — avoids offering a slot 10 minutes from now. */
  minLeadTimeMs?: number;
}

/**
 * The single source of truth for "what times can a parent actually book."
 * Both the booking page (listing slots) and the confirm step (re-checking
 * the chosen slot) call this, so they can never disagree about what's
 * open. Layers, in order:
 *   1. The school's recurring weekly availability rules.
 *   2. Anything this app has already booked (DB).
 *   3. The school's live Google Calendar freebusy, when connected.
 */
export async function computeOpenSlots(
  serviceClient: SupabaseClient<Database>,
  { schoolId, kind, daysAhead = 14, minLeadTimeMs = 1000 * 60 * 60 * 12 }: ComputeOpenSlotsArgs,
): Promise<OpenSlot[]> {
  const { data: rules, error: rulesError } = await serviceClient
    .from("availability")
    .select("*")
    .eq("school_id", schoolId)
    .eq("kind", kind)
    .eq("active", true);

  if (rulesError) throw rulesError;
  if (!rules || rules.length === 0) return [];

  const { data: school, error: schoolError } = await serviceClient
    .from("schools")
    .select("timezone")
    .eq("id", schoolId)
    .single();
  if (schoolError || !school) throw schoolError ?? new Error(`School ${schoolId} not found`);

  const now = new Date();
  const earliestStart = new Date(now.getTime() + minLeadTimeMs);
  const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const candidates = generateCandidateSlots(rules, earliestStart, windowEnd);
  if (candidates.length === 0) return [];

  const { data: booked, error: bookedError } = await serviceClient
    .from("inquiries")
    .select("scheduled_start, scheduled_end")
    .eq("school_id", schoolId)
    .eq("scheduled_kind", kind)
    .neq("status", "closed_lost")
    .not("scheduled_start", "is", null)
    .gte("scheduled_start", now.toISOString())
    .lte("scheduled_start", windowEnd.toISOString());

  if (bookedError) throw bookedError;

  const bookedIntervals: BusyInterval[] = (booked ?? [])
    .filter((b): b is { scheduled_start: string; scheduled_end: string } => Boolean(b.scheduled_start && b.scheduled_end))
    .map((b) => ({ start: b.scheduled_start, end: b.scheduled_end }));

  let busyIntervals = bookedIntervals;

  try {
    const { calendar, calendarId } = await getAuthorizedCalendarForSchool(serviceClient, schoolId);
    const googleBusy = await getBusyIntervals(calendar, calendarId, earliestStart, windowEnd);
    busyIntervals = [...busyIntervals, ...googleBusy];
  } catch {
    // Google Calendar not connected (or a transient API error) — the
    // school's own recurring rules and this app's own bookings are still
    // enforced; we just can't also see the rest of the tour host's
    // calendar. Never let a Google outage take down the booking page.
  }

  return candidates.filter((slot) => !overlapsAny(slot, busyIntervals));
}

function generateCandidateSlots(
  rules: { day_of_week: number; start_time: string; end_time: string; slot_minutes: number }[],
  earliestStart: Date,
  windowEnd: Date,
): OpenSlot[] {
  const slots: OpenSlot[] = [];

  for (const rule of rules) {
    const [startH, startM] = parseTimeParts(rule.start_time);
    const [endH, endM] = parseTimeParts(rule.end_time);

    const cursor = new Date(earliestStart);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= windowEnd) {
      if (cursor.getDay() === rule.day_of_week) {
        const dayStart = new Date(cursor);
        dayStart.setHours(startH, startM, 0, 0);
        const dayEnd = new Date(cursor);
        dayEnd.setHours(endH, endM, 0, 0);

        let slotStart = new Date(dayStart);
        while (slotStart.getTime() + rule.slot_minutes * 60 * 1000 <= dayEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + rule.slot_minutes * 60 * 1000);
          if (slotStart >= earliestStart && slotEnd <= windowEnd) {
            slots.push({ start: new Date(slotStart), end: slotEnd });
          }
          slotStart = slotEnd;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** "HH:MM:SS" (Postgres `time` comes back this way) -> [hours, minutes]. */
function parseTimeParts(time: string): [number, number] {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return [hours, minutes];
}

function overlapsAny(slot: OpenSlot, busy: BusyInterval[]): boolean {
  return busy.some((interval) => {
    const busyStart = new Date(interval.start).getTime();
    const busyEnd = new Date(interval.end).getTime();
    return slot.start.getTime() < busyEnd && slot.end.getTime() > busyStart;
  });
}

/** True when the exact slot is still free — used at confirm time, right before writing the booking, as the second freebusy check. */
export async function isSlotStillOpen(
  serviceClient: SupabaseClient<Database>,
  args: ComputeOpenSlotsArgs,
  slot: OpenSlot,
): Promise<boolean> {
  const openSlots = await computeOpenSlots(serviceClient, args);
  return openSlots.some((s) => s.start.getTime() === slot.start.getTime() && s.end.getTime() === slot.end.getTime());
}
