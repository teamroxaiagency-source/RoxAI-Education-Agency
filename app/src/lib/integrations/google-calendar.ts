import "server-only";
import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import type { Database, GoogleCalendarConfig, SchoolIntegration } from "@/types/database";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

export function getOAuthClient() {
  const env = getEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new Error("Google Calendar OAuth is not configured (GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)");
  }
  return new google.auth.OAuth2(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET, env.GOOGLE_OAUTH_REDIRECT_URI);
}

export function buildAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // ensures a refresh_token is returned even on re-connect
    scope: SCOPES,
    state,
  });
}

interface ExchangedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

export async function exchangeCodeForTokens(code: string): Promise<ExchangedTokens> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Google did not return an access token");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

/**
 * Loads a school's Google Calendar tokens (service-role only —
 * school_integration_secrets has no policy for `authenticated`), refreshes
 * them if expired, persists a rotated access token, and returns an
 * authorized calendar client scoped to the school's configured calendar.
 */
export async function getAuthorizedCalendarForSchool(
  serviceClient: SupabaseClient<Database>,
  schoolId: string,
): Promise<{ calendar: ReturnType<typeof google.calendar>; calendarId: string; integration: SchoolIntegration }> {
  const { data: integration, error: integrationError } = await serviceClient
    .from("school_integrations")
    .select("*")
    .eq("school_id", schoolId)
    .eq("provider", "google_calendar")
    .single();

  if (integrationError || !integration || integration.status !== "connected") {
    throw new Error(`School ${schoolId} has no connected Google Calendar integration`);
  }

  const { data: secret, error: secretError } = await serviceClient
    .from("school_integration_secrets")
    .select("*")
    .eq("integration_id", integration.id)
    .single();

  if (secretError || !secret?.refresh_token) {
    throw new Error(`Missing Google Calendar credentials for school ${schoolId}`);
  }

  const client = getOAuthClient();
  client.setCredentials({
    access_token: secret.access_token ?? undefined,
    refresh_token: secret.refresh_token,
    expiry_date: secret.token_expires_at ? new Date(secret.token_expires_at).getTime() : undefined,
  });

  client.on("tokens", async (tokens) => {
    if (!tokens.access_token) return;
    await serviceClient
      .from("school_integration_secrets")
      .update({
        access_token: tokens.access_token,
        token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      })
      .eq("integration_id", integration.id);
  });

  const config = integration.config as unknown as GoogleCalendarConfig;
  if (!config?.calendar_id) {
    throw new Error(`School ${schoolId}'s Google Calendar integration is missing a calendar_id`);
  }

  return {
    calendar: google.calendar({ version: "v3", auth: client }),
    calendarId: config.calendar_id,
    integration,
  };
}

export interface BusyInterval {
  start: string;
  end: string;
}

/** Real freebusy check against the school's actual calendar — this is the source of truth open slots are computed from. */
export async function getBusyIntervals(
  calendar: ReturnType<typeof google.calendar>,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<BusyInterval[]> {
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const busy = response.data.calendars?.[calendarId]?.busy ?? [];
  return busy
    .filter((b): b is { start: string; end: string } => Boolean(b.start && b.end))
    .map((b) => ({ start: b.start, end: b.end }));
}

export interface CreateCalendarEventArgs {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  timeZone: string;
  attendeeEmail: string;
}

export async function createCalendarEvent(
  calendar: ReturnType<typeof google.calendar>,
  calendarId: string,
  { summary, description, start, end, timeZone, attendeeEmail }: CreateCalendarEventArgs,
): Promise<string> {
  const response = await calendar.events.insert({
    calendarId,
    sendUpdates: "all",
    requestBody: {
      summary,
      description,
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
      attendees: [{ email: attendeeEmail }],
    },
  });

  if (!response.data.id) {
    throw new Error("Google Calendar did not return an event id");
  }

  return response.data.id;
}
