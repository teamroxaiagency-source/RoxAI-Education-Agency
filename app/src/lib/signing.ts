import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * HMAC-SHA256 signing for anything that needs to leave the server as an
 * opaque, tamper-evident token: booking links emailed to parents and the
 * Google OAuth `state` parameter. Never encodes secrets — only ids and an
 * expiry — so a leaked link can only be replayed for what it already
 * grants (viewing/booking one inquiry's open slots) until it expires.
 */
function sign(payload: string): string {
  const env = getEnv();
  return createHmac("sha256", env.APP_SIGNING_SECRET).update(payload).digest("base64url");
}

export interface BookingTokenPayload {
  inquiryId: string;
  expiresAt: number; // epoch ms
}

export function createBookingToken(inquiryId: string, ttlMs: number = 1000 * 60 * 60 * 24 * 7): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const expiresAt = Date.now() + ttlMs;
  const nonce = randomBytes(9).toString("base64url");
  const payload = `${inquiryId}.${expiresAt}.${nonce}`;
  const signature = sign(payload);
  const token = `${payload}.${signature}`;
  return { token, tokenHash: hashToken(token), expiresAt: new Date(expiresAt) };
}

export function verifyBookingToken(token: string): BookingTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [inquiryId, expiresAtStr, nonce, signature] = parts;
  if (!inquiryId || !expiresAtStr || !nonce || !signature) return null;
  const payload = `${inquiryId}.${expiresAtStr}.${nonce}`;
  const expected = sign(payload);

  if (!timingSafeCompare(signature, expected)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  if (!inquiryId) return null;

  return { inquiryId, expiresAt };
}

/** Stored on the inquiry row so a token can be invalidated/looked up without keeping the raw token server-side. */
export function hashToken(token: string): string {
  const env = getEnv();
  return createHmac("sha256", env.APP_SIGNING_SECRET).update(token).digest("hex");
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Generic short-lived signed state for OAuth redirects (CSRF protection + carrying the school id through the round trip). */
export function createSignedState(data: Record<string, string>, ttlMs: number = 1000 * 60 * 10): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ ...data, expiresAt })).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifySignedState<T extends Record<string, string>>(state: string): T | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  if (!timingSafeCompare(signature, sign(payload))) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T & { expiresAt: number };
    if (Date.now() > decoded.expiresAt) return null;
    return decoded;
  } catch {
    return null;
  }
}
