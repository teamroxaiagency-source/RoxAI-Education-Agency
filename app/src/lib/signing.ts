import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * HMAC-SHA256 signing for anything that needs to leave the server as an
 * opaque, tamper-evident token: booking links emailed to parents and the
 * Google OAuth `state` parameter. Never encodes secrets — only ids and an
 * expiry — so a leaked link can only be replayed for what it already
 * grants (viewing/booking one inquiry's open slots) until it expires.
 *
 * Rotation: new tokens are always signed with APP_SIGNING_SECRET alone.
 * Verification checks APP_SIGNING_SECRET first, then
 * APP_SIGNING_SECRET_PREVIOUS if set — so during a rotation window,
 * booking links already sent to parents (signed with the old secret)
 * keep working until they expire naturally, instead of breaking the
 * instant the secret rotates. See docs/SECRET_ROTATION.md.
 */

function activeSecrets(): string[] {
  const env = getEnv();
  return [env.APP_SIGNING_SECRET, env.APP_SIGNING_SECRET_PREVIOUS].filter((s): s is string => Boolean(s));
}

function signWithSecret(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Always signs with the current (first) secret only — never the rotation-grace previous one. */
function sign(payload: string): string {
  return signWithSecret(payload, activeSecrets()[0]!);
}

/** True if `signature` matches `payload` under *any* active secret (current or, during rotation, previous). */
function verifyAgainstActiveSecrets(payload: string, signature: string): boolean {
  return activeSecrets().some((secret) => timingSafeCompare(signature, signWithSecret(payload, secret)));
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

  if (!verifyAgainstActiveSecrets(payload, signature)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  if (!inquiryId) return null;

  return { inquiryId, expiresAt };
}

/** Stored on the inquiry row at creation time so a token can be looked up without keeping the raw token server-side. Always computed with the current secret. */
export function hashToken(token: string): string {
  return createHmac("sha256", activeSecrets()[0]!).update(token).digest("hex");
}

/**
 * Compares a presented token against a stored hash. Unlike hashToken
 * (used only at creation), this checks every active secret — a token
 * hashed and stored before a rotation must still verify against its
 * original (now "previous") secret.
 */
export function verifyTokenHash(token: string, storedHash: string): boolean {
  return activeSecrets().some((secret) => {
    const candidate = createHmac("sha256", secret).update(token).digest("hex");
    return timingSafeCompare(candidate, storedHash);
  });
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
  if (!verifyAgainstActiveSecrets(payload, signature)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T & { expiresAt: number };
    if (Date.now() > decoded.expiresAt) return null;
    return decoded;
  } catch {
    return null;
  }
}
