// serverEntry `register(ctx)` — capability + schema-config named-action
// registration shape (cinatra-ai/cinatra#2367 S1).
//
// Pins:
//   - the capability id set register(ctx) publishes (chat-user-context +
//     appointment-schedules, moved unchanged from google-calendar-connector);
//   - the schema-config named-action id set the declared `cinatra.configSchema`
//     references (listAppointmentSchedules, deleteAppointmentSchedule,
//     listCalendars, addSchedule, bookingPageGuideReady);
//   - `listCalendars` returns an EMPTY successful result when the invoking
//     user has no Google connection (item 4), never a thrown error;
//   - `addSchedule` refuses an invalid calendarId without throwing across the
//     action boundary (returns an error banner instead);
//   - registration-only activation (no host-service I/O at register time).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "../register";
import { _resetGoogleAppointmentSchedulesDepsForTests } from "../deps";

type RegisteredProvider = { packageName: string; impl: unknown };
type UiAction = { id: string; handler: (input: unknown) => Promise<unknown> };

function makeCtx(services: Record<string, unknown>, actorUserId: string | undefined = "u1") {
  const uiActions: UiAction[] = [];
  const registered = new Map<string, RegisteredProvider[]>();
  const ctx = {
    capabilities: {
      registerProvider: (capability: string, provider: RegisteredProvider) => {
        const list = registered.get(capability) ?? [];
        list.push(provider);
        registered.set(capability, list);
      },
      resolveProviders: (capability: string): RegisteredProvider[] => {
        const svc = services[capability];
        return svc ? [{ packageName: "host", impl: svc }] : [];
      },
    },
    ui: {
      registerAction: (action: UiAction) => {
        uiActions.push(action);
      },
    },
    authSession: {
      getActor: vi.fn(async () => (actorUserId ? { userId: actorUserId } : null)),
    },
  };
  return { ctx: ctx as unknown as Parameters<typeof register>[0], uiActions, registered };
}

function hostConfigService(store: Record<string, unknown> = {}) {
  return {
    read: vi.fn((id: string, fallback: unknown) => (id in store ? store[id] : fallback)),
    write: vi.fn((id: string, value: unknown) => {
      store[id] = value;
    }),
  };
}

function hostOAuthService(calendars: Array<{ id: string; summary?: string; primary?: boolean }> | null) {
  return {
    apiFetch: vi.fn(async () => {
      if (calendars === null) throw new Error("no saved connection");
      return { items: calendars };
    }),
  };
}

beforeEach(() => {
  _resetGoogleAppointmentSchedulesDepsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("register(ctx) — capability registration", () => {
  it("registers chat-user-context + appointment-schedules and performs NO host-service I/O at activation", () => {
    const configRead = vi.fn();
    const { ctx, registered } = makeCtx({
      "@cinatra-ai/host:connector-config": { read: configRead, write: vi.fn() },
      "@cinatra-ai/host:google-oauth": hostOAuthService([]),
    });
    register(ctx);
    expect([...registered.keys()].sort()).toEqual(["appointment-schedules", "chat-user-context"]);
    expect(configRead).not.toHaveBeenCalled();
  });
});

describe("register(ctx) — schema-config named actions", () => {
  it("registers exactly the five actions the declared configSchema references", () => {
    const { ctx, uiActions } = makeCtx({
      "@cinatra-ai/host:connector-config": hostConfigService(),
      "@cinatra-ai/host:google-oauth": hostOAuthService([]),
    });
    register(ctx);
    expect(uiActions.map((a) => a.id).sort()).toEqual([
      "addSchedule",
      "bookingPageGuideReady",
      "deleteAppointmentSchedule",
      "listAppointmentSchedules",
      "listCalendars",
    ]);
  });

  it("listAppointmentSchedules returns the invoking user's saved schedules", async () => {
    const store = {
      "google_appointment_schedules_user:u1": {
        schedules: [
          {
            id: "a1",
            title: "Intro call",
            bookingPageUrl: "https://calendar.app.google/abc123",
            calendarId: "primary",
            calendarSummary: "marcus@example.com",
          },
        ],
      },
    };
    const { ctx, uiActions } = makeCtx({
      "@cinatra-ai/host:connector-config": hostConfigService(store),
      "@cinatra-ai/host:google-oauth": hostOAuthService([]),
    });
    register(ctx);
    const list = uiActions.find((a) => a.id === "listAppointmentSchedules")!;
    const out = (await list.handler(undefined)) as { items: unknown[] };
    expect(out.items).toHaveLength(1);
  });

  it("listCalendars returns an EMPTY successful result when there is no Google connection (never throws)", async () => {
    const { ctx, uiActions } = makeCtx({
      "@cinatra-ai/host:connector-config": hostConfigService(),
      "@cinatra-ai/host:google-oauth": hostOAuthService(null),
    });
    register(ctx);
    const listCalendars = uiActions.find((a) => a.id === "listCalendars")!;
    await expect(listCalendars.handler(undefined)).resolves.toEqual({ options: [] });
  });

  it("listCalendars projects the live calendar list to { value, label } options", async () => {
    const { ctx, uiActions } = makeCtx({
      "@cinatra-ai/host:connector-config": hostConfigService(),
      "@cinatra-ai/host:google-oauth": hostOAuthService([
        { id: "primary", summary: "marcus@example.com", primary: true },
        { id: "work", summary: "Work" },
      ]),
    });
    register(ctx);
    const listCalendars = uiActions.find((a) => a.id === "listCalendars")!;
    const out = (await listCalendars.handler(undefined)) as { options: { value: string; label: string }[] };
    expect(out.options).toEqual([
      { value: "primary", label: "marcus@example.com" },
      { value: "work", label: "Work" },
    ]);
  });

  it("addSchedule returns an error banner (not a thrown error) for an invalid calendarId", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><head><title>x</title></head></html>", { status: 200 }) as unknown as Response,
    );
    const { ctx, uiActions } = makeCtx({
      "@cinatra-ai/host:connector-config": hostConfigService(),
      "@cinatra-ai/host:google-oauth": hostOAuthService([{ id: "primary", summary: "me", primary: true }]),
    });
    register(ctx);
    const addSchedule = uiActions.find((a) => a.id === "addSchedule")!;
    const out = (await addSchedule.handler({
      bookingPageUrl: "https://calendar.app.google/abc",
      calendarId: "not-real",
    })) as { banner: string };
    expect(out.banner).toBe("error");
  });

  it("bookingPageGuideReady is always ready (the Help tab's probe)", async () => {
    const { ctx, uiActions } = makeCtx({
      "@cinatra-ai/host:connector-config": hostConfigService(),
      "@cinatra-ai/host:google-oauth": hostOAuthService([]),
    });
    register(ctx);
    const probe = uiActions.find((a) => a.id === "bookingPageGuideReady")!;
    await expect(probe.handler(undefined)).resolves.toEqual({ ready: true });
  });
});
