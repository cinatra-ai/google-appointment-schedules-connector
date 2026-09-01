// Public surface for @cinatra-ai/google-appointment-schedules-connector.
//
// This is the connector's ENTRY MODULE: the retained/renamed core
// `appointment_schedule_add` bridge and the core's readiness probes consume
// the named exports below (cinatra-ai/cinatra#2367 S1). Names are fixed by
// THIS package and mirrored by the cinatra core repo's S3 sub-issue — see the
// header comment on each export for what it is for.
//
// The appointment-schedule store, the `calendar.app.google` URL allowlist, and
// the og-scrape enrichment are MOVED (unchanged logic) from
// `@cinatra-ai/google-calendar-connector` (cinatra-ai/cinatra#2367, a
// first-time extraction — appointment schedules were never their own
// connector before this). Each stored entry now also carries `calendarId` +
// `calendarSummary` (the per-entry calendar selection this epic adds), and
// entries are stored under THIS connector's own per-user config key — the old
// rows stored by the calendar connector are NOT migrated (owner decision).
//
// Host-coupled `@/lib/database` runtime imports are replaced with the
// injected deps via getGoogleAppointmentSchedulesDeps(). The host binds
// concrete impls in ./register at activation.

import { getGoogleAppointmentSchedulesDeps } from "./deps";
import type { GoogleCalendarListEntry } from "./deps";

const PACKAGE_NAME = "@cinatra-ai/google-appointment-schedules-connector";

/** The stored shape of one appointment schedule (per cinatra-ai/cinatra#2368
 *  scope item 3): `{id,title,description?,bookingPageUrl,calendarId,
 *  calendarSummary,lastFetchedAt?}`. */
export type StoredAppointmentSchedule = {
  id: string;
  title: string;
  description?: string;
  bookingPageUrl: string;
  /** The Google Calendar id this schedule's availability comes from. */
  calendarId: string;
  /** The calendar's display name, derived server-side (never client-supplied). */
  calendarSummary: string;
  lastFetchedAt?: string;
};

type GoogleAppointmentSchedulesSettings = {
  schedules?: StoredAppointmentSchedule[];
  schedulesSyncedAt?: string;
};

function getSettingsConnectorId(userId: string) {
  return `google_appointment_schedules_user:${userId}`;
}

function readSettings(userId: string) {
  return getGoogleAppointmentSchedulesDeps().readConnectorConfigFromDatabase<GoogleAppointmentSchedulesSettings>(
    getSettingsConnectorId(userId),
    {},
  );
}

function writeSettings(userId: string, value: GoogleAppointmentSchedulesSettings) {
  getGoogleAppointmentSchedulesDeps().writeConnectorConfigToDatabase(getSettingsConnectorId(userId), value);
}

// ---- the calendar.app.google booking-page allowlist + og-scrape (moved,
// unchanged logic, from google-calendar-connector) ----

function isPublicScheduleUrl(value: string) {
  try {
    return new URL(value).hostname === "calendar.app.google";
  } catch {
    return false;
  }
}

function sanitizeSchedules(schedules: StoredAppointmentSchedule[] | undefined) {
  return (schedules ?? []).filter((schedule) => isPublicScheduleUrl(schedule.bookingPageUrl));
}

function normalizeBookingPageUrl(input: string) {
  const parsed = new URL(input);
  if (parsed.protocol !== "https:") {
    throw new Error("Appointment schedule links must use https.");
  }
  if (parsed.hostname !== "calendar.app.google") {
    throw new Error("Use a public Google Calendar appointment schedule link from calendar.app.google.");
  }
  return parsed.toString();
}

/**
 * The hosts a booking-page request may legitimately be SENT to, hop included.
 *
 * NOT the same set as the INPUT allowlist, and deliberately so. A person may
 * only ever submit (and this connector may only ever store) a
 * `calendar.app.google` link — that is `normalizeBookingPageUrl` above and it
 * is unchanged. But such a link is a SHORT link: requesting one returns 302 to
 * `calendar.google.com`, which is where the page actually is. Re-checking the
 * INPUT allowlist against the destination therefore refused every genuine
 * booking link ever pasted, telling the person to supply the exact kind of
 * link they had just supplied.
 */
const BOOKING_PAGE_HOP_HOSTS = new Set(["calendar.app.google", "calendar.google.com"]);

/** The hop budget. A genuine short link needs exactly one. */
const MAX_BOOKING_PAGE_HOPS = 5;

/**
 * The statuses `fetch` itself treats as a redirect to follow. A 300, 304 or
 * 305 also carries a `Location` header on some servers but is NOT one of
 * these — chasing it would be a behaviour change from the pre-existing
 * fetch-follows-redirects path, which never chased those either.
 */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Best-effort release of a response body this connector will never read.
 * Node's fetch is Undici-based: an unread body keeps its connection open, and
 * repeated booking-page requests could exhaust or stall the pool. Cancelling
 * is best-effort — a mocked or already-consumed response is a no-op.
 */
async function releaseUnreadBody(response: Response): Promise<void> {
  try {
    if (response.body && !response.bodyUsed) {
      await response.body.cancel();
    }
  } catch {
    // best-effort only
  }
}

/** Refuse any URL this connector is about to REQUEST that is not a booking-page host. */
function assertBookingPageHopUrl(candidateUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(candidateUrl);
  } catch {
    throw new Error("Use a public Google Calendar appointment schedule link from calendar.app.google.");
  }
  if (parsed.protocol !== "https:" || !BOOKING_PAGE_HOP_HOSTS.has(parsed.hostname)) {
    throw new Error("Use a public Google Calendar appointment schedule link from calendar.app.google.");
  }
}

/**
 * Fetch the booking page, FOLLOWING REDIRECTS OURSELVES.
 *
 * `fetch` follows redirects for you, which means that by the time a final URL
 * is available the server has already requested every hop — including one the
 * allowlist would have refused. Checking only the final URL is therefore a
 * refusal to SCRAPE, never a refusal to REQUEST: a hostile short link would
 * still make this connector issue a server-side request to a host of its
 * choosing, and a chain that hops off to an arbitrary origin and back to an
 * allowed one would pass a final-URL check completely.
 *
 * So redirects are unfollowed (`redirect: "manual"`) and every hop is vetted
 * BEFORE it is requested. The response's own final URL is vetted too, for a
 * runtime that ignores the option — belt and braces, not the guard.
 */
async function fetchBookingPageFollowingHops(startUrl: string): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_BOOKING_PAGE_HOPS; hop += 1) {
    assertBookingPageHopUrl(current);
    const response = await fetch(current, {
      headers: {
        "User-Agent": "Cinatra/1.0",
      },
      cache: "no-store",
      redirect: "manual",
    });
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        await releaseUnreadBody(response);
        throw new Error(`Unable to load the appointment schedule page (${response.status}).`);
      }
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        await releaseUnreadBody(response);
        throw new Error(
          "Use a public Google Calendar appointment schedule link from calendar.app.google.",
        );
      }
      await releaseUnreadBody(response);
      current = next;
      continue;
    }
    if (!response.ok) {
      await releaseUnreadBody(response);
      throw new Error(`Unable to load the appointment schedule page (${response.status}).`);
    }
    // Some runtimes/mocks expose no final URL; then the vetted `current` is the
    // only URL the request can have used.
    try {
      assertBookingPageHopUrl(response.url || current);
    } catch (err) {
      await releaseUnreadBody(response);
      throw err;
    }
    return response;
  }
  throw new Error("Unable to load the appointment schedule page (too many redirects).");
}

function buildScheduleId(url: string) {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
  return path || parsed.toString();
}

function extractMetaContent(html: string, name: string) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
  const match = html.match(pattern);
  return match?.[1]?.trim();
}

function extractTitle(html: string) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match?.[1]?.trim();
}

async function fetchAppointmentSchedulePage(url: string): Promise<{
  id: string;
  title: string;
  description?: string;
  bookingPageUrl: string;
  lastFetchedAt: string;
}> {
  // Validate BEFORE any egress: an unvetted string must never be fetched
  // (server-side request to 127.0.0.1/link-local/internal hosts), so the
  // https + calendar.app.google allowlist runs first and the request goes to
  // the NORMALIZED form only.
  const normalizedUrl = normalizeBookingPageUrl(url);
  const response = await fetchBookingPageFollowingHops(normalizedUrl);

  const html = await response.text();
  const title =
    extractMetaContent(html, "og:title") ??
    extractMetaContent(html, "twitter:title") ??
    extractTitle(html) ??
    "Google Calendar appointment schedule";
  const description =
    extractMetaContent(html, "og:description") ??
    extractMetaContent(html, "description") ??
    extractMetaContent(html, "twitter:description") ??
    undefined;

  return {
    id: buildScheduleId(normalizedUrl),
    title,
    description,
    bookingPageUrl: normalizedUrl,
    lastFetchedAt: new Date().toISOString(),
  };
}

// ---- the per-user Google Calendar list (item 4: host google-oauth service
// apiFetch, connectorKey "googleCalendar") ----

const CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

/**
 * Fetch the invoking user's calendar list. Returns an EMPTY array — a
 * successful, non-throwing result — when the user has no saved Google
 * connection (no per-user Google OAuth connection to read), rather than
 * propagating the underlying fetch error. Consumed by both the `listCalendars`
 * ui-action (item 4) and the add-schedule calendar resolution below, so the
 * "disconnected → empty" behavior is defined in exactly one place.
 */
export async function listUserGoogleCalendars(userId: string): Promise<GoogleCalendarListEntry[]> {
  try {
    const result = await getGoogleAppointmentSchedulesDeps().oauth.apiFetch<{ items?: GoogleCalendarListEntry[] }>(
      { url: CALENDAR_LIST_URL },
      { userId, connectorKey: "googleCalendar" },
    );
    return result.items ?? [];
  } catch {
    return [];
  }
}

/**
 * A cheap readiness probe: does the invoking user have at least one
 * reachable calendar (i.e. a live Google Calendar connection)? Used by the
 * core registration readiness probes (cinatra-ai/cinatra#2367 S3 mirrors this
 * export) and available for any host-side health check that needs a boolean
 * rather than the full list.
 */
export async function isGoogleCalendarConnectionReady(userId: string): Promise<boolean> {
  const calendars = await listUserGoogleCalendars(userId);
  return calendars.length > 0;
}

/**
 * The setup page's Calendar picker offers an explicit "use my primary
 * calendar" row, because the field's own text promises an unset state that a
 * plain calendar list cannot express. Two surface constraints shape the value
 * below: an option whose value is the empty string is dropped before the
 * person sees it, and the first option is what a control opens on when
 * nothing has been chosen — so the row needs a NON-EMPTY marker value and the
 * first position in the list. The marker is deliberately shaped so no real
 * Google calendar id can equal it (a calendar id is an address or the literal
 * "primary"), and it is never stored: resolveCalendarSelection maps it back
 * onto an omitted calendar id, which resolves the account's primary calendar
 * server-side.
 */
export const PRIMARY_CALENDAR_OPTION_VALUE = "__use_primary_calendar__";

/** The plain label the primary-calendar row carries in the picker. */
export const PRIMARY_CALENDAR_OPTION_LABEL = "My primary calendar";

/**
 * Resolve which calendar an add-schedule call should use: a supplied
 * `calendarId` is validated against a FRESH account-scoped list (refused if
 * not found — never trusted from a stale client value); an omitted
 * `calendarId` defaults to the account's primary calendar (the ratified
 * default-calendar exception). The setup page's primary-calendar marker
 * (PRIMARY_CALENDAR_OPTION_VALUE) is normalized to omission HERE, so the
 * picker's unset row and an omitted id take one and the same road.
 * `calendarSummary` is always derived server-side from the resolved entry,
 * never client-supplied.
 */
async function resolveCalendarSelection(
  userId: string,
  calendarId: string | undefined,
): Promise<{ calendarId: string; calendarSummary: string }> {
  const calendars = await listUserGoogleCalendars(userId);
  const requested = calendarId === PRIMARY_CALENDAR_OPTION_VALUE ? undefined : calendarId;

  if (requested) {
    const match = calendars.find((entry) => entry.id === requested);
    if (!match) {
      throw new Error(
        `"${requested}" is not one of your Google calendars. Connect Google Calendar and try again, ` +
          `or omit calendarId to use your primary calendar.`,
      );
    }
    return { calendarId: match.id, calendarSummary: match.summary ?? match.id };
  }

  const primary = calendars.find((entry) => entry.primary === true) ?? calendars[0];
  if (!primary) {
    throw new Error(
      "No Google Calendar connection found for this account. Connect Google Calendar at " +
        "/connectors/cinatra-ai/google-calendar-connector/setup before adding an appointment schedule.",
    );
  }
  return { calendarId: primary.id, calendarSummary: primary.summary ?? primary.id };
}

// ---- the appointment-schedule store ----

/** Read the invoking user's stored schedules (sanitizing out any row whose
 *  URL no longer passes the allowlist). Consumed by the setup page's
 *  `listAppointmentSchedules` ui-action, the MCP `appointment_schedule_list`
 *  tool, and both capability providers below. */
export function getStoredGoogleAppointmentSchedules(userId: string) {
  const settings = readSettings(userId);
  const schedules = sanitizeSchedules(settings.schedules);

  if (schedules.length !== (settings.schedules ?? []).length) {
    writeSettings(userId, {
      schedules,
      schedulesSyncedAt: settings.schedulesSyncedAt,
    });
  }

  return {
    schedules,
    syncedAt: settings.schedulesSyncedAt,
  };
}

/**
 * Add (or refresh, if the same URL is re-submitted) an appointment schedule
 * for `userId`. THE function the core's retained/renamed
 * `appointment_schedule_add{url, calendarId?}` bridge calls (cinatra-ai/
 * cinatra#2367 S1 item 5) — its name and shape are fixed here and mirrored by
 * the S3 sub-issue.
 */
export async function addUserGoogleAppointmentSchedule(
  userId: string,
  url: string,
  calendarId?: string,
): Promise<StoredAppointmentSchedule> {
  const page = await fetchAppointmentSchedulePage(url);
  const { calendarId: resolvedCalendarId, calendarSummary } = await resolveCalendarSelection(userId, calendarId);

  const schedule: StoredAppointmentSchedule = {
    id: page.id,
    title: page.title,
    description: page.description,
    bookingPageUrl: page.bookingPageUrl,
    calendarId: resolvedCalendarId,
    calendarSummary,
    lastFetchedAt: page.lastFetchedAt,
  };

  const settings = readSettings(userId);
  const schedules = [...sanitizeSchedules(settings.schedules)];
  // Dedupe on the ID — the same identity delete filters by. Comparing the
  // full URL here while the id derives from the pathname let two rows share
  // one id (fragment-only variants), and deleting either deleted both.
  const existingIndex = schedules.findIndex((entry) => entry.id === schedule.id);
  if (existingIndex >= 0) {
    schedules[existingIndex] = schedule;
  } else {
    schedules.push(schedule);
  }
  schedules.sort((left, right) => left.title.localeCompare(right.title));

  writeSettings(userId, {
    schedules,
    schedulesSyncedAt: new Date().toISOString(),
  });

  return schedule;
}

/** Remove one stored schedule by id. Used by the setup page's per-row delete
 *  (`deleteAppointmentSchedule` ui-action). */
export function deleteUserGoogleAppointmentSchedule(userId: string, id: string): void {
  const settings = readSettings(userId);
  const schedules = sanitizeSchedules(settings.schedules).filter((entry) => entry.id !== id);
  writeSettings(userId, {
    schedules,
    schedulesSyncedAt: new Date().toISOString(),
  });
}

/** Clear every stored schedule for `userId` (test/ops utility; mirrors
 *  google-calendar-connector's clear helper). */
export function clearStoredUserGoogleAppointmentSchedules(userId: string): void {
  writeSettings(userId, {});
}

// ---- capability providers (item 6: moved with UNCHANGED ids/shapes) ----

// Chat user-context: contributes the user's appointment schedules to the chat
// system prompt, registration-driven (the chat runner resolves this
// capability instead of importing a package by name). Capability id
// "chat-user-context" is UNCHANGED from google-calendar-connector; only the
// packageName + implementation now live here.
export const googleAppointmentSchedulesChatUserContextProvider = {
  packageName: PACKAGE_NAME,
  impl: {
    buildSections({ userId }: { userId?: string }): string[] {
      if (!userId) return [];
      const { schedules } = getStoredGoogleAppointmentSchedules(userId);
      if (schedules.length === 0) return [];
      const list = schedules
        .map((s) => `"${s.title}" (${s.bookingPageUrl}, calendar: ${s.calendarSummary})`)
        .join(", ");
      return [`Appointment schedules: ${list}`];
    },
  },
};

// Structured appointment schedules for the host's CTA server action
// (cinatra#151 Stage 4 / cinatra#2367): packages/agents resolves
// "appointment-schedules" instead of value-importing this package. Capability
// id "appointment-schedules" is UNCHANGED from google-calendar-connector.
export const googleAppointmentSchedulesCapabilityProvider = {
  packageName: PACKAGE_NAME,
  impl: {
    getSchedules({ userId }: { userId?: string }): { title: string; bookingPageUrl: string }[] {
      if (!userId) return [];
      const { schedules } = getStoredGoogleAppointmentSchedules(userId);
      return schedules.map((s) => ({ title: s.title, bookingPageUrl: s.bookingPageUrl }));
    },
  },
};

// Dependency-injection registration keeps host coupling at the boot boundary.
export {
  registerGoogleAppointmentSchedulesConnector,
  getGoogleAppointmentSchedulesDeps,
} from "./deps";
export type {
  GoogleAppointmentSchedulesConnectorDeps,
  GoogleAppointmentSchedulesOAuthCapability,
  GoogleAppointmentSchedulesConnectorKey,
  GoogleCalendarListEntry,
} from "./deps";
