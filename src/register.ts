// The google-appointment-schedules connector's `register(ctx)` server entry.
//
// Binds the connector's host deps AT ACTIVATION (this connector's own
// connector-config KV store, adapted from the `@cinatra-ai/host:connector-config`
// capability service, resolved LAZILY per call; the shared Google-OAuth
// `apiFetch` surface from `@cinatra-ai/host:google-oauth`; the session user id
// from the granted `ctx.authSession` port). SDK imports here stay TYPE-ONLY
// (host-peer value-import gate).
//
// Registers:
//   - the `chat-user-context` + `appointment-schedules` capability providers,
//     moved from google-calendar-connector with UNCHANGED ids/shapes (item 6);
//   - the schema-config named actions the declared `cinatra.configSchema`
//     references (`listAppointmentSchedules`, `deleteAppointmentSchedule`,
//     `listCalendars`, `addSchedule`, `bookingPageGuideReady`) — dispatched by
//     the host through `/api/extensions/{installId}/actions/{actionId}`, which
//     resolves + authorizes the actor BEFORE any handler runs.
//
// This connector serves NO MCP primitive via `ctx.mcp` — its
// `appointment_schedule_list` tool is served by the manifest-discovered
// mcp-module (src/mcp/module.ts), same pattern as google-calendar-connector's
// `google_calendar_appointments_list`.

import type {
  ExtensionHostContext,
  HostConnectorConfigService,
  HostGoogleOAuthService,
} from "@cinatra-ai/sdk-extensions";
import { registerGoogleAppointmentSchedulesConnector } from "./deps";
import {
  PRIMARY_CALENDAR_OPTION_LABEL,
  PRIMARY_CALENDAR_OPTION_VALUE,
  addUserGoogleAppointmentSchedule,
  deleteUserGoogleAppointmentSchedule,
  getStoredGoogleAppointmentSchedules,
  googleAppointmentSchedulesCapabilityProvider,
  googleAppointmentSchedulesChatUserContextProvider,
  listUserGoogleCalendars,
} from "./index";

const PACKAGE_NAME = "@cinatra-ai/google-appointment-schedules-connector";

function hostConfig(ctx: ExtensionHostContext): HostConnectorConfigService {
  const provider = ctx.capabilities.resolveProviders("@cinatra-ai/host:connector-config")[0];
  if (!provider) {
    throw new Error(
      `${PACKAGE_NAME}: host service "@cinatra-ai/host:connector-config" is not registered — ` +
        `the host boot wiring (register-transport-connectors) must run before connector calls.`,
    );
  }
  return provider.impl as HostConnectorConfigService;
}

function hostGoogleOAuth(ctx: ExtensionHostContext): HostGoogleOAuthService {
  const provider = ctx.capabilities.resolveProviders("@cinatra-ai/host:google-oauth")[0];
  if (!provider) {
    throw new Error(
      `${PACKAGE_NAME}: host service "@cinatra-ai/host:google-oauth" is not registered — ` +
        `the host boot wiring (register-transport-connectors) must run before connector calls.`,
    );
  }
  return provider.impl as HostGoogleOAuthService;
}

/**
 * The host dispatches a named action with an UNKNOWN payload — `ctx.ui`
 * types every handler as `(input: unknown) => Promise<unknown>` — so a handler
 * narrows the payload itself instead of declaring a concrete parameter type
 * (which does not satisfy the port's contravariant handler signature). Nothing
 * here trusts the payload: it only reaches the field readers below, never the
 * actor.
 */
function readActionInput<T extends object>(input: unknown): Partial<T> {
  return input && typeof input === "object" ? (input as Partial<T>) : {};
}

async function requireUserId(ctx: ExtensionHostContext): Promise<string> {
  const actor = await ctx.authSession.getActor();
  const userId = actor?.userId;
  if (!userId) {
    throw new Error(`${PACKAGE_NAME}: no authenticated session user.`);
  }
  return userId;
}

/** A saved-schedule row projected to the JSON-safe shape the `record-list`
 *  renderer consumes (cinatra.configSchema). */
export type AppointmentScheduleListRow = {
  id: string;
  title: string;
  description?: string;
  bookingPageUrl: string;
  calendarId: string;
  calendarSummary: string;
  lastFetchedAt?: string;
};

export function register(ctx: ExtensionHostContext): void {
  registerGoogleAppointmentSchedulesConnector({
    readConnectorConfigFromDatabase: (connectorId, fallback) =>
      hostConfig(ctx).read(connectorId, fallback),
    writeConnectorConfigToDatabase: (connectorId, value) =>
      hostConfig(ctx).write(connectorId, value),
    requireSessionUserId: () => requireUserId(ctx),
    oauth: {
      apiFetch: (input, options) => hostGoogleOAuth(ctx).apiFetch(input, options),
    },
  });

  // Chat user-context + appointment-schedules: moved from
  // google-calendar-connector with UNCHANGED capability ids/shapes (item 6).
  // GUARDED: a host whose CHECKED-IN generated manifest predates this
  // package's `capabilities` port request fail-louds on access — degrade
  // silently there (mirrors google-calendar-connector's own guard) rather
  // than let the grant gap skip the registrations that follow.
  try {
    ctx.capabilities.registerProvider(
      "chat-user-context",
      googleAppointmentSchedulesChatUserContextProvider,
    );
  } catch (err) {
    console.warn(
      `${PACKAGE_NAME}: chat-user-context registration skipped (capabilities port not granted yet):`,
      err instanceof Error ? err.message : err,
    );
  }
  try {
    ctx.capabilities.registerProvider(
      "appointment-schedules",
      googleAppointmentSchedulesCapabilityProvider,
    );
  } catch (err) {
    console.warn(
      `${PACKAGE_NAME}: appointment-schedules registration skipped (capabilities port not granted yet):`,
      err instanceof Error ? err.message : err,
    );
  }

  // ---- schema-config named actions ----
  //
  // The declarative setup surface (cinatra.configSchema) renders WITHOUT
  // shipping React. Requires the "ui" host port (declared in
  // cinatra.requestedHostPorts).

  // `listAppointmentSchedules` — the record-list's listActionId: the
  // invoking user's saved schedules.
  ctx.ui.registerAction({
    id: "listAppointmentSchedules",
    handler: async (): Promise<{ items: AppointmentScheduleListRow[] }> => {
      const userId = await requireUserId(ctx);
      const { schedules } = getStoredGoogleAppointmentSchedules(userId);
      return { items: schedules };
    },
  });

  // `deleteAppointmentSchedule` — the record-list's deleteActionId: POSTs
  // `{ id }`.
  ctx.ui.registerAction({
    id: "deleteAppointmentSchedule",
    handler: async (input: unknown): Promise<{ banner: "deleted" }> => {
      const userId = await requireUserId(ctx);
      const { id } = readActionInput<{ id?: string }>(input);
      if (id) {
        deleteUserGoogleAppointmentSchedule(userId, id);
      }
      return { banner: "deleted" };
    },
  });

  // `listCalendars` — the dynamic-select-options `optionsAction` (item 4):
  // reads the invoking user's live Google calendar list via the shared
  // google-oauth service. When the user has no saved Google connection,
  // `listUserGoogleCalendars` already degrades to an EMPTY array (a
  // successful result, never a thrown error) — the select's placeholder
  // (declared in cinatra.configSchema) carries the disconnected-state
  // guidance.
  //
  // The list opens with the explicit primary-calendar row: it is what the
  // field's text has always promised, its marker value is non-empty so the
  // row survives to the person, and holding FIRST place makes it the entry a
  // control opens on when nothing has been chosen. With no connection there
  // are no calendars to choose between, so the empty result stays empty.
  ctx.ui.registerAction({
    id: "listCalendars",
    handler: async (): Promise<{ options: { value: string; label: string }[] }> => {
      const userId = await requireUserId(ctx);
      const calendars = await listUserGoogleCalendars(userId);
      if (calendars.length === 0) return { options: [] };
      return {
        options: [
          { value: PRIMARY_CALENDAR_OPTION_VALUE, label: PRIMARY_CALENDAR_OPTION_LABEL },
          ...calendars.map((c) => ({ value: c.id, label: c.summary ?? c.id })),
        ],
      };
    },
  });

  // `addSchedule` — the named-action "Add schedule": collects the text
  // `bookingPageUrl` field and the dynamic-select-options `calendarId`
  // field's hidden input.
  ctx.ui.registerAction({
    id: "addSchedule",
    handler: async (
      input: unknown,
    ): Promise<{ banner: "saved" } | { banner: "error"; message: string }> => {
      const userId = await requireUserId(ctx);
      const fields = readActionInput<{ bookingPageUrl?: string; calendarId?: string }>(input);
      const url = String(fields.bookingPageUrl ?? "").trim();
      try {
        await addUserGoogleAppointmentSchedule(userId, url, fields.calendarId || undefined);
        return { banner: "saved" };
      } catch (err) {
        return { banner: "error", message: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // `bookingPageGuideReady` — the Help tab's advisory `probeActionId`. The
  // Help tab is pure documentation (schema-mandated fields only; nothing on
  // it is saved), so its probe is deliberately an ALWAYS-READY stub: there is
  // no readiness condition to gate the copy on.
  ctx.ui.registerAction({
    id: "bookingPageGuideReady",
    handler: async (): Promise<{ ready: true }> => ({ ready: true }),
  });
}
