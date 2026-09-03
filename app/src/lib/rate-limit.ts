import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getEnv, isRateLimitConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Applied to every public, unauthenticated write endpoint (the Postmark
 * webhook, the booking-confirm endpoint, the Google OAuth callback, the
 * Stripe webhook): each is reachable by anyone who finds the URL, so each
 * needs its own throttle rather than relying on the caller being
 * well-behaved.
 *
 * Degrades to "not limited" (with a one-time warning) when Upstash isn't
 * configured, matching every other optional integration in this app —
 * local dev shouldn't require a Redis account, but production should
 * always have this configured.
 */

let redis: Redis | undefined;
let warnedMissingConfig = false;

function getRedis(): Redis | undefined {
  if (!isRateLimitConfigured()) {
    if (!warnedMissingConfig) {
      logger.warn("Rate limiting is not configured (UPSTASH_REDIS_REST_URL/TOKEN missing) — public endpoints are unthrottled");
      warnedMissingConfig = true;
    }
    return undefined;
  }

  if (!redis) {
    const env = getEnv();
    redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! });
  }
  return redis;
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(name: string, requests: number, windowSeconds: number): Ratelimit | undefined {
  const client = getRedis();
  if (!client) return undefined;

  const key = `${name}:${requests}:${windowSeconds}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
      prefix: `roxai-ratelimit:${name}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

export interface RateLimitResult {
  limited: boolean;
  remaining?: number;
}

/**
 * `identifier` should be something scoped to the caller — the request IP
 * for anonymous endpoints. Fails open (never limits) if Redis is
 * unreachable or unconfigured: a rate limiter that itself takes down the
 * app on a network blip is worse than no rate limiter.
 */
export async function checkRateLimit(
  name: string,
  identifier: string,
  { requests, windowSeconds }: { requests: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const limiter = getLimiter(name, requests, windowSeconds);
  if (!limiter) return { limited: false };

  try {
    const result = await limiter.limit(identifier);
    return { limited: !result.success, remaining: result.remaining };
  } catch (error) {
    logger.warn("Rate limiter check failed, allowing request through", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
    return { limited: false };
  }
}

/** Best-effort caller IP from standard proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}
