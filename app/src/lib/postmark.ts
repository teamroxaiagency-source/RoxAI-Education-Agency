import "server-only";
import { ServerClient } from "postmark";
import { getEnv } from "@/lib/env";

let client: ServerClient | undefined;

function getClient(): ServerClient {
  if (!client) {
    client = new ServerClient(getEnv().POSTMARK_SERVER_TOKEN);
  }
  return client;
}

export interface SendReplyArgs {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  /** Threads the reply under the original inbound message in the parent's inbox. */
  inReplyToMessageId?: string | null;
}

export interface SendReplyResult {
  postmarkMessageId: string;
}

/** Sends the same-day admissions reply. Real send — no dry-run/mock path — so what staff see in the thread is what the parent actually received. */
export async function sendReplyEmail({ to, subject, textBody, htmlBody, inReplyToMessageId }: SendReplyArgs): Promise<SendReplyResult> {
  const env = getEnv();

  const headers = inReplyToMessageId
    ? [
        { Name: "In-Reply-To", Value: inReplyToMessageId },
        { Name: "References", Value: inReplyToMessageId },
      ]
    : undefined;

  const result = await getClient().sendEmail({
    From: env.POSTMARK_FROM_ADDRESS,
    To: to,
    Subject: subject,
    TextBody: textBody,
    HtmlBody: htmlBody,
    MessageStream: "outbound",
    Headers: headers,
  });

  return { postmarkMessageId: result.MessageID };
}

/**
 * Postmark's inbound webhook has no built-in signature scheme — the
 * documented pattern is HTTP basic auth (or a shared query secret) on the
 * webhook URL itself, verified here against POSTMARK_INBOUND_WEBHOOK_SECRET.
 */
export function verifyInboundWebhookAuth(request: Request): boolean {
  const env = getEnv();
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(authHeader.slice("Basic ".length), "base64").toString("utf8");
  const [, providedSecret] = decoded.split(":");

  return providedSecret === env.POSTMARK_INBOUND_WEBHOOK_SECRET;
}

/** Shape of the subset of Postmark's inbound webhook payload this app reads. */
export interface PostmarkInboundPayload {
  FromName: string;
  From: string;
  OriginalRecipient: string;
  To: string;
  Subject: string;
  TextBody: string;
  HtmlBody: string;
  MessageID: string;
  Date: string;
}
