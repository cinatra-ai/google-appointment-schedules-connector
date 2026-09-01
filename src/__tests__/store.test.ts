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

  it("refuses a non-calendar.app.google URL WITHOUT fetching it (validate before egress)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await expect(
      addUserGoogleAppointmentSchedule("u1", "https://evil.example.com/xyz"),
    ).rejects.toThrow(/calendar.app.google/);
    // The security property: the refused URL must never have produced a
    // server-side request — not merely an eventual rejection.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses an http:// URL without fetching it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await expect(
      addUserGoogleAppointmentSchedule("u1", "http://127.0.0.1:8080/abc"),
    ).rejects.toThrow(/https/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ACCEPTS the redirect a real booking link actually performs (calendar.app.google -> calendar.google.com)", async () => {
    // MEASURED against the real service: a public `calendar.app.google` link is
    // a SHORT link. Requesting one returns 302 to `calendar.google.com` and the
    // followed request returns 200 there. That single hop is not a hostile party
    // redirecting an allowlisted link off-host — it is the only way a genuine
    // booking link ever resolves.
    //
    // Re-checking the INPUT allowlist against the FINAL url therefore refused
    // every real link, with the message that tells the user to supply the very
    // kind of link they just supplied. The landing check has to know the short
    // link's own canonical destination.
    const landed = new Response(HTML_PAGE, { status: 200 });
    Object.defineProperty(landed, "url", {
      value: "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0000",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(landed as unknown as Response);
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    const schedule = await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123");

    expect(schedule.title).toBe("Intro call");
    // The row keeps the SHORT link the person pasted and the id derived from
    // it — the redirect target is where the scrape happened, never what is
    // stored, shared or deduped on.
    expect(schedule.bookingPageUrl).toBe("https://calendar.app.google/abc123");
    expect(schedule.id).toBe("abc123");
  });

  // THE REDIRECT MUST BE FOLLOWED BY US, NOT BY fetch.
  //
  // Validating only the FINAL url cannot enforce the property the landing check
  // exists for. `fetch` follows redirects itself, so by the time a final url is
  // available the server has ALREADY requested every hop — including a hop the
  // allowlist would have refused. The refusal is then a refusal to SCRAPE, not
  // a refusal to REQUEST, and a hostile short link still makes this connector
  // issue a server-side request to a host of its choosing. Worse, a hop through
  // an arbitrary origin that redirects BACK to an allowed host passes the final
  // check completely.
  //
  // So every hop is vetted BEFORE it is requested, which means following
  // redirects manually.
  it("requests the booking page with redirects UNFOLLOWED, so each hop can be vetted first", async () => {
    const page = new Response(HTML_PAGE, { status: 200 });
    Object.defineProperty(page, "url", { value: "https://calendar.app.google/abc123" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(page as unknown as Response);
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123");

    const options = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(options.redirect).toBe("manual");
  });

  it("follows the real booking-link hop ITSELF and requests the vetted destination", async () => {
    // The 302 a genuine short link answers with, then the page it points at.
    const hop = new Response(null, {
      status: 302,
      headers: { location: "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0000" },
    });
    const page = new Response(HTML_PAGE, { status: 200 });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(hop as unknown as Response)
      .mockResolvedValueOnce(page as unknown as Response);
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    const schedule = await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toBe(
      "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0000",
    );
    expect(schedule.title).toBe("Intro call");
    // The row still keeps the SHORT link the person pasted and the id derived
    // from it — the hop destination is where the scrape happened, never what is
    // stored, shared or deduped on.
    expect(schedule.bookingPageUrl).toBe("https://calendar.app.google/abc123");
    expect(schedule.id).toBe("abc123");
  });

  it("NEVER REQUESTS an off-allowlist hop — the refusal comes before the egress", async () => {
    const hop = new Response(null, {
      status: 302,
      headers: { location: "https://evil.example.com/landed" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(hop as unknown as Response);
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await expect(
      addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123"),
    ).rejects.toThrow(/calendar\.app\.google/);
    // THE ASSERTION THAT MATTERS: one call, to the allowlisted link. The
    // hostile destination was never requested at all.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://calendar.app.google/abc123");
  });

  it("refuses a hop chain that leaves the allowlist and returns, before the off-host request", async () => {
    // The shape a final-url-only check cannot see at all: hop off to an
    // arbitrary origin, hop back to an allowed one. The final url is
    // impeccable; the middle request is the whole attack.
    const away = new Response(null, {
      status: 302,
      headers: { location: "https://evil.example.com/bounce" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(away as unknown as Response);
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await expect(
      addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123"),
    ).rejects.toThrow(/calendar\.app\.google/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect loop rather than following hops forever", async () => {
    const loop = new Response(null, {
      status: 302,
      headers: { location: "https://calendar.google.com/loop" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(loop as unknown as Response);
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await expect(
      addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123"),
    ).rejects.toThrow(/appointment schedule page/);
    // Bounded: the hop budget, not an unbounded chase.
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("does NOT treat a non-redirect 3xx as a hop, even with a Location header", async () => {
    // `fetch` itself only follows 301/302/303/307/308. A 300, 304 or 305 is a
    // terminal answer even when it happens to carry a Location header, and
    // chasing it would be a behaviour change from the pre-existing
    // fetch-follows-redirects path.
    const notModified = new Response(null, {
      status: 304,
      headers: { location: "https://calendar.google.com/should-not-be-followed" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(notModified as unknown as Response);
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await expect(
      addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123"),
    ).rejects.toThrow(/304/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("releases the body of a hop answer it never reads", async () => {
    // Node's fetch is Undici-based: an unread response body keeps its
    // connection open, so a followed hop's body must be released once the
    // next request has started, not left dangling.
    const hop = new Response("unread redirect body", {
      status: 302,
      headers: { location: "https://calendar.google.com/landed" },
    });
    const page = new Response(HTML_PAGE, { status: 200 });
    Object.defineProperty(page, "url", {
      value: "https://calendar.google.com/landed",
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(hop as unknown as Response)
      .mockResolvedValueOnce(page as unknown as Response);
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123");

    expect(hop.bodyUsed).toBe(true);
  });

  it("refuses an allowlisted URL whose response landed off-allowlist (redirect)", async () => {
    // Simulate a followed redirect: fetch resolves fine but the response's
    // final URL is off-host.
    const offHost = new Response(HTML_PAGE, { status: 200 });
    Object.defineProperty(offHost, "url", { value: "https://evil.example.com/landed" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(offHost as unknown as Response);
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await expect(
      addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123"),
    ).rejects.toThrow(/calendar.app.google/);
  });

  it("fragment-only URL variants are ONE row (dedupe by id) and one delete removes exactly it", async () => {
    // A fresh Response per call — this test fetches twice, and a shared
    // Response body can only be read once.
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(HTML_PAGE, { status: 200 }) as unknown as Response,
    );
    const store: Store = {};
    registerGoogleAppointmentSchedulesConnector(stubDeps(store));

    await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123#a");
    const second = await addUserGoogleAppointmentSchedule("u1", "https://calendar.app.google/abc123#b");

    const { schedules: afterAdds } = getStoredGoogleAppointmentSchedules("u1");
    expect(afterAdds).toHaveLength(1);
    expect(afterAdds[0].id).toBe(second.id);

    deleteUserGoogleAppointmentSchedule("u1", second.id);
    expect(getStoredGoogleAppointmentSchedules("u1").schedules).toHaveLength(0);
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
