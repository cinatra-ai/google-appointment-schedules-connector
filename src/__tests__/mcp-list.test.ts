// Unit tests for the agent-facing `appointment_schedule_list` MCP primitive
// handler — pins that it reads the INVOKING USER's per-user store
// (`google_appointment_schedules_user:<id>`), resolving the trusted actor from
// EITHER the host-injected `resolveActor` (MCP-module path) OR
// `request.actor.userId` (in-process primitive/passthrough path), and that it
// fails closed (empty) with no actor at all or a conflicting actor.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExtensionPrimitiveRequest, ExtensionMcpToolServer } from "@cinatra-ai/sdk-extensions";

import {
  registerGoogleAppointmentSchedulesConnector,
  _resetGoogleAppointmentSchedulesDepsForTests,
  type GoogleAppointmentSchedulesConnectorDeps,
} from "../deps";
import { createGoogleAppointmentSchedulesPrimitiveHandlers } from "../mcp/handlers";
import { createGoogleAppointmentSchedulesModule } from "../mcp/module";

type Store = Record<string, unknown>;

function stubDeps(store: Store) {
  const reads: string[] = [];
  const deps: GoogleAppointmentSchedulesConnectorDeps = {
    readConnectorConfigFromDatabase<T>(connectorId: string, fallback: T): T {
      reads.push(connectorId);
      return connectorId in store ? (store[connectorId] as T) : fallback;
    },
    writeConnectorConfigToDatabase(connectorId: string, value: unknown): void {
      store[connectorId] = value;
    },
    requireSessionUserId: async () => {
      throw new Error("requireSessionUserId is not exercised by the list handler");
    },
    oauth: {
      apiFetch: async () => {
        throw new Error("apiFetch is not exercised by the list handler");
      },
    },
  };
  return { deps, reads };
}

const SCHEDULES_U1 = {
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
};

const INTRO_CALL = {
  title: "Intro call",
  bookingPageUrl: "https://calendar.app.google/abc123",
  calendarId: "primary",
  calendarSummary: "marcus@example.com",
};

function req(actor: unknown, input: unknown = {}): ExtensionPrimitiveRequest<unknown> {
  return { primitiveName: "appointment_schedule_list", input, actor, mode: "agentic" };
}

const AGENT_ACTOR = { actorType: "model", source: "agent" };

beforeEach(() => {
  _resetGoogleAppointmentSchedulesDepsForTests();
  vi.restoreAllMocks();
});

describe("appointment_schedule_list — storage-key resolution", () => {
  it("reads the per-user key via the host-injected resolveActor (MCP-module path)", async () => {
    const store: Store = { "google_appointment_schedules_user:u1": SCHEDULES_U1 };
    const { deps, reads } = stubDeps(store);
    registerGoogleAppointmentSchedulesConnector(deps);

    const handlers = createGoogleAppointmentSchedulesPrimitiveHandlers(async () => ({ userId: "u1" }));
    const result = await handlers.appointment_schedule_list(req(AGENT_ACTOR));

    expect(reads).toContain("google_appointment_schedules_user:u1");
    expect(result).toEqual({ items: [INTRO_CALL], total: 1, syncedAt: "2026-01-01T00:00:00.000Z" });
  });

  it("reads the per-user key from request.actor.userId (in-process primitive path)", async () => {
    const store: Store = { "google_appointment_schedules_user:u1": SCHEDULES_U1 };
    const { deps } = stubDeps(store);
    registerGoogleAppointmentSchedulesConnector(deps);

    const handlers = createGoogleAppointmentSchedulesPrimitiveHandlers();
    const result = await handlers.appointment_schedule_list(
      req({ actorType: "human", userId: "u1", orgId: "o1" }),
    );

    expect(result.items).toEqual([INTRO_CALL]);
    expect(result.total).toBe(1);
  });

  it("fails closed (empty) with no actor at all — this connector has no legacy instance-scoped fallback", async () => {
    const store: Store = { "google_appointment_schedules_user:u1": SCHEDULES_U1 };
    const { deps } = stubDeps(store);
    registerGoogleAppointmentSchedulesConnector(deps);

    const handlers = createGoogleAppointmentSchedulesPrimitiveHandlers();
    const result = await handlers.appointment_schedule_list(req(undefined));

    expect(result).toEqual({ items: [], total: 0, syncedAt: null });
  });

  it("fails closed (empty) when the resolver and the request actor disagree", async () => {
    const store: Store = {
      "google_appointment_schedules_user:u1": SCHEDULES_U1,
      "google_appointment_schedules_user:u2": {
        schedules: [
          {
            id: "b1",
            title: "Other user",
            bookingPageUrl: "https://calendar.app.google/other",
            calendarId: "primary",
            calendarSummary: "other@example.com",
          },
        ],
      },
    };
    const { deps } = stubDeps(store);
    registerGoogleAppointmentSchedulesConnector(deps);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const handlers = createGoogleAppointmentSchedulesPrimitiveHandlers(async () => ({ userId: "u1" }));
    const result = await handlers.appointment_schedule_list(
      req({ actorType: "human", userId: "u2", orgId: "o1" }),
    );

    expect(result).toEqual({ items: [], total: 0, syncedAt: null });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("drops non-public booking URLs (sanitize) before returning", async () => {
    const store: Store = { "google_appointment_schedules_user:u1": SCHEDULES_U1 };
    const { deps } = stubDeps(store);
    registerGoogleAppointmentSchedulesConnector(deps);

    const handlers = createGoogleAppointmentSchedulesPrimitiveHandlers(async () => ({ userId: "u1" }));
    const result = await handlers.appointment_schedule_list(req(AGENT_ACTOR));

    expect(result.items).toHaveLength(1);
    expect(result.items.every((i) => i.bookingPageUrl.startsWith("https://calendar.app.google/"))).toBe(true);
  });

  it("module→registry wiring threads resolveActor into the registered tool", async () => {
    const store: Store = { "google_appointment_schedules_user:u1": SCHEDULES_U1 };
    const { deps, reads } = stubDeps(store);
    registerGoogleAppointmentSchedulesConnector(deps);

    let captured:
      | ((input: unknown, extra?: unknown) => Promise<{ structuredContent?: Record<string, unknown> }>)
      | undefined;
    const fakeServer = {
      registerTool: (
        _name: string,
        _config: unknown,
        handler: (input: unknown, extra?: unknown) => Promise<{ structuredContent?: Record<string, unknown> }>,
      ) => {
        captured = handler;
      },
    };

    createGoogleAppointmentSchedulesModule({ resolveActor: async () => ({ userId: "u1" }) }).registerCapabilities(
      fakeServer as unknown as ExtensionMcpToolServer,
    );

    expect(captured).toBeTypeOf("function");
    const wrapped = await captured!({});
    expect(reads).toContain("google_appointment_schedules_user:u1");
    expect(wrapped.structuredContent).toEqual({
      items: [INTRO_CALL],
      total: 1,
      syncedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
