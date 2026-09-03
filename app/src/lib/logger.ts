import "server-only";
import winston from "winston";
import * as Sentry from "@sentry/nextjs";
import { getEnv, isSentryConfigured } from "@/lib/env";

/**
 * Structured logging (Winston) is the record of what happened, for
 * debugging and audits. Sentry (see logError below) is the alert that
 * something needs attention right now. They serve different jobs and
 * both matter: a log line nobody reads doesn't page anyone, and an alert
 * with no surrounding context is hard to debug from.
 */
const winstonLogger = winston.createLogger({
  level: safeLogLevel(),
  format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
  defaultMeta: { service: "roxai-inquiry-to-enrollment" },
  transports: [new winston.transports.Console()],
});

function safeLogLevel(): string {
  // getEnv() throws on a misconfigured environment, but logging itself
  // must never be why a request fails — fall back to "info" if env
  // validation hasn't succeeded yet (e.g. very early boot).
  try {
    return getEnv().LOG_LEVEL;
  } catch {
    return "info";
  }
}

export type LogContext = Record<string, unknown>;

export const logger = {
  debug: (message: string, context?: LogContext) => winstonLogger.debug(message, context),
  info: (message: string, context?: LogContext) => winstonLogger.info(message, context),
  warn: (message: string, context?: LogContext) => winstonLogger.warn(message, context),
  /**
   * For a message worth logging but that isn't an actual thrown error
   * (e.g. "Google Calendar not connected, skipping freebusy check").
   * Use logError below for real exceptions that should also alert.
   */
  error: (message: string, context?: LogContext) => winstonLogger.error(message, context),
};

/**
 * The one function every catch block should reach for. Always writes a
 * structured log entry; also reports to Sentry when SENTRY_DSN is
 * configured, so a production failure pages someone instead of scrolling
 * silently past in a log nobody is tailing.
 */
export function logError(error: unknown, message: string, context?: LogContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  winstonLogger.error(message, { ...context, error: err.message, stack: err.stack });

  if (isSentryConfigured()) {
    Sentry.captureException(err, { extra: { message, ...context } });
  }
}
