import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmBooking } from "@/lib/booking";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
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
