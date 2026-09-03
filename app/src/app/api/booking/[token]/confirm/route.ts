import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmBooking } from "@/lib/booking";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  // A tight limit: this is a booking attempt, not a browsing action —
  // legitimate use never needs more than a handful of tries per minute,
  // and it guards against brute-forcing booking tokens or hammering a
  // popular slot.
  const { limited } = await checkRateLimit("booking-confirm", getClientIp(request), { requests: 10, windowSeconds: 60 });
  if (limited) {
    return NextResponse.json({ error: "too many attempts — please wait a moment and try again" }, { status: 429 });
  }

  const { token } = await params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const result = await confirmBooking(createServiceRoleClient(), token, parsed.data);

  switch (result.status) {
    case "confirmed":
      return NextResponse.json(result, { status: 200 });
    case "slot_no_longer_available":
      return NextResponse.json({ error: "that time was just booked — please pick another" }, { status: 409 });
    case "invalid":
      return NextResponse.json({ error: "this booking link is invalid, expired, or already used" }, { status: 410 });
  }
}
