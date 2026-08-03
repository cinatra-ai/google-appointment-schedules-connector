// Unit tests for the appointment-schedule store: the `calendar.app.google`
// allowlist + og-scrape enrichment (moved, unchanged logic, from
// google-calendar-connector), the per-entry Google Calendar resolution (item
// 5 of cinatra-ai/cinatra#2368: an omitted calendarId defaults to the
// account's primary calendar; a supplied one is validated against a fresh
// account-scoped list and refused if unknown; calendarSummary is always
// derived server-side), and the two capability providers moved with
// unchanged ids/shapes.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  registerGoogleAppointmentSchedulesConnector,
  _resetGoogleAppointmentSchedulesDepsForTests,
  type GoogleAppointmentSchedulesConnectorDeps,
} from "../deps";
import {
  addUserGoogleAppointmentSchedule,
  deleteUserGoogleAppointmentSchedule,
  getStoredGoogleAppointmentSchedules,
  googleAppointmentSchedulesCapabilityProvider,
  googleAppointmentSchedulesChatUserContextProvider,
  isGoogleCalendarConnectionReady,
  listUserGoogleCalendars,
} from "../index";

type Store = Record<string, unknown>;

const CALENDARS = [
  { id: "primary", summary: "marcus@example.com", primary: true },
  { id: "work-calendar-id", summary: "Work" },
];

function stubDeps(store: Store, opts: { calendars?: typeof CALENDARS | null } = {}) {
  const deps: GoogleAppointmentSchedulesConnectorDeps = {
    readConnectorConfigFromDatabase<T>(connectorId: string, fallback: T): T {
      return connectorId in store ? (store[connectorId] as T) : fallback;
    },
    writeConnectorConfigToDatabase(connectorId: string, value: unknown): void {
      store[connectorId] = value;
    },
    requireSessionUserId: async () => {
      throw new Error("not exercised in these tests");
    },
    oauth: {
      apiFetch: (async () => {
        if (opts.calendars === null) {
          throw new Error("no saved connection");
        }
        return { items: opts.calendars ?? CALENDARS };
      }) as GoogleAppointmentSchedulesConnectorDeps["oauth"]["apiFetch"],
    },
  };
  return deps;
}

const HTML_PAGE = `<!doctype html><html><head>
  <title>Fallback title</title>
  <meta property="og:title" content="Intro call" />
  <meta property="og:description" content="30 minute intro" />
</head><body></body></html>`;

beforeEach(() => {
  _resetGoogleAppointmentSchedulesDepsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOk(html: string = HTML_PAGE) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(html, { status: 200 }) as unknown as Response,
  );
}

describe("addUserGoogleAppointmentSchedule", () => {
  it("url-only defaults to the primary calendar; calendarSummary is derived server-side", async () => {
    mockFetchOk();
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    const schedule = await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123");

    expect(schedule.title).toBe("Intro call");
    expect(schedule.description).toBe("30 minute intro");
    expect(schedule.calendarId).toBe("primary");
    expect(schedule.calendarSummary).toBe("marcus@example.com");
    expect(schedule.bookingPageUrl).toBe("https://calendar.app.google/abc123");
  });

  it("an explicit valid calendarId is honored, deriving calendarSummary from the fresh list", async () => {
    mockFetchOk();
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    const schedule = await addUserGoogleAppointmentSchedule(
      "u1",
      "https://calendar.app.google/abc123",
      "work-calendar-id",
    );

    expect(schedule.calendarId).toBe("work-calendar-id");
    expect(schedule.calendarSummary).toBe("Work");
  });

  it("refuses an invalid calendarId (not in the fresh account-scoped list)", async () => {
    mockFetchOk();
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await expect(
      addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123", "not-a-real-calendar"),
    ).rejects.toThrow(/not one of your Google calendars/);
  });

  it("refuses a non-calendar.app.google URL", async () => {
    mockFetchOk();
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await expect(
      addUserGoogleAppointmentSchedule("u1", "https://evil.example.com/xyz"),
    ).rejects.toThrow(/calendar.app.google/);
  });

  it("refuses url-only when there is no Google Calendar connection at all", async () => {
    mockFetchOk();
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store, { calendars: null }));

    await expect(
      addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123"),
    ).rejects.toThrow(/No Google Calendar connection/);
  });

  it("re-adding the same URL refreshes the existing row instead of duplicating it", async () => {
    mockFetchOk();
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123");
    mockFetchOk(HTML_PAGE.replace("Intro call", "Intro call (updated)"));
    await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123", "work-calendar-id");

    const { schedules } = getStoredGoogleAppointmentSchedules("u1");
    expect(schedules).toHaveLength(1);
    expect(schedules[0].title).toBe("Intro call (updated)");
    expect(schedules[0].calendarId).toBe("work-calendar-id");
  });
});

describe("getStoredGoogleAppointmentSchedules — sanitize", () => {
  it("drops non-public booking URLs stored under the per-user key", () => {
    const store: Store = {
      "google_appointment_schedules_user:u1": {
        schedules: [
          {
            id: "a1",
            title: "Intro call",
            bookingPageUrl: "https://calendar.app.google/abc123",
            calendarId: "primary",
            calendarSummary: "marcus@example.com",
          },
          {
            id: "a2",
            title: "Not public",
            bookingPageUrl: "https://evil.example.com/xyz",
            calendarId: "primary",
            calendarSummary: "marcus@example.com",
          },
        ],
        schedulesSyncedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    const { schedules, syncedAt } = getStoredGoogleAppointmentSchedules("u1");
    expect(schedules).toHaveLength(1);
    expect(schedules[0].id).toBe("a1");
    expect(syncedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("deleteUserGoogleAppointmentSchedule", () => {
  it("removes only the matching row", async () => {
    mockFetchOk();
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));
    const schedule = await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123");

    deleteUserGoogleAppointmentSchedule("u1", schedule.id);

    expect(getStoredGoogleAppointmentSchedules("u1").schedules).toEqual([]);
  });
});

describe("listUserGoogleCalendars / isGoogleCalendarConnectionReady", () => {
  it("returns the live list when connected", async () => {
    registerGoogleAppointmentSchedulesConnector(stubDeps({}));
    expect(await listUserGoogleCalendars("u1")).toEqual(CALENDARS);
    expect(await isGoogleCalendarConnectionReady("u1")).toBe(true);
  });

  it("returns an EMPTY successful result (never throws) when there is no saved connection", async () => {
    registerGoogleAppointmentSchedulesConnector(stubDeps({}, { calendars: null }));
    await expect(listUserGoogleCalendars("u1")).resolves.toEqual([]);
    expect(await isGoogleCalendarConnectionReady("u1")).toBe(false);
  });
});

describe("capability providers — moved with unchanged ids/shapes", () => {
  it("chat-user-context: buildSections summarizes saved schedules", async () => {
    mockFetchOk();
    registerGoogleAppointmentSchedulesConnector(stubDeps({}));
    await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123");

    expect(googleAppointmentSchedulesChatUserContextProvider.packageName).toBe(
      "@cinatra-ai/google-appointment-schedules-connector",
    );
    const sections = googleAppointmentSchedulesChatUserContextProvider.impl.buildSections({ userId: "u1" });
    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain("Intro call");
  });

  it("chat-user-context: no userId -> empty (no throw)", () => {
    registerGoogleAppointmentSchedulesConnector(stubDeps({}));
    expect(googleAppointmentSchedulesChatUserContextProvider.impl.buildSections({})).toEqual([]);
  });

  it("appointment-schedules: structured { title, bookingPageUrl } rows", async () => {
    mockFetchOk();
    registerGoogleAppointmentSchedulesConnector(stubDeps({}));
    await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123");

    expect(googleAppointmentSchedulesCapabilityProvider.packageName).toBe(
      "@cinatra-ai/google-appointment-schedules-connector",
    );
    expect(googleAppointmentSchedulesCapabilityProvider.impl.getSchedules({ userId: "u1" })).toEqual([
      { title: "Intro call", bookingPageUrl: "https://calendar.app.google/abc123" },
    ]);
  });

  it("appointment-schedules: empty store -> empty (no throw)", () => {
    registerGoogleAppointmentSchedulesConnector(stubDeps({}));
    expect(googleAppointmentSchedulesCapabilityProvider.impl.getSchedules({ userId: "u1" })).toEqual([]);
  });
});
