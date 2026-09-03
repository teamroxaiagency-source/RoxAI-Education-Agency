import { NextResponse } from "next/server";
import { verifyInboundWebhookAuth, type PostmarkInboundPayload } from "@/lib/postmark";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { processInboundEmail } from "@/lib/inbound-processing";
import { logger, logError } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { limited } = await checkRateLimit("postmark-webhook", getClientIp(request), { requests: 30, windowSeconds: 60 });
  if (limited) {
    return NextResponse.json({ error: "rate limit exceeded" }, { status: 429 });
  }

  if (!verifyInboundWebhookAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: PostmarkInboundPayload;
  try {
    payload = (await request.json()) as PostmarkInboundPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!payload.From || !payload.TextBody) {
    return NextResponse.json({ error: "missing From or TextBody" }, { status: 400 });
  }

  try {
    const result = await processInboundEmail(createServiceRoleClient(), payload);

    if (result.outcome === "unrouted") {
      // Not this app's mail to handle. Log for ops visibility but return
      // 200 so Postmark doesn't retry indefinitely on a payload that will
      // never become routable.
      logger.warn("No school matches inbound address", { recipient: result.recipient });
      return NextResponse.json({ status: "unrouted" }, { status: 200 });
    }

    return NextResponse.json(
      { status: "processed", inquiryId: result.inquiryId, isNewInquiry: result.isNewInquiry },
      { status: 200 },
    );
  } catch (error) {
    logError(error, "Failed to process inbound Postmark email");
    // 500 so Postmark retries — this path is for real failures (DB down,
    // Postmark send failing) where a retry might actually succeed.
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
