import "server-only";

// ---------------------------------------------------------------------------
// @cinatra-ai/google-appointment-schedules-connector — host dependency
// injection singleton.
//
// Host dependency injection keeps this connector decoupled from host-internal
// modules such as `@/lib/database`. Direct imports would anchor the package to
// the host's src/ tree; the host instead injects the runtime dependencies at
// boot via `registerGoogleAppointmentSchedulesConnector(deps)`, and the
// runtime functions in this package resolve the injected impl via
// `getGoogleAppointmentSchedulesDeps()` on every call.
//
// This connector's own persisted state (the saved schedules) is read/written
// through `readConnectorConfigFromDatabase` / `writeConnectorConfigToDatabase`
// under this connector's OWN per-user config key (mirrors
// google-calendar-connector's KV-store shape) — see ./index.
//
// The `oauth.apiFetch` surface is the SAME host `@cinatra-ai/host:google-oauth`
// service google-calendar-connector and gmail-connector already bind (the
// shared Google OAuth broker); this connector calls it with
// `connectorKey:"googleCalendar"` so the calendar-scoped connection (and its
// `calendar.readonly` grant) is used, not a second connection. Inlined
// (NOT imported from a sibling package) so this connector carries no non-SDK
// `@cinatra-ai/*` code dependency — the host binds the concrete impl at boot.
//
// The deps slot is anchored on `globalThis` via a namespaced+versioned Symbol
// so the activation-time registration (this connector's serverEntry
// `register(ctx)`) and runtime callers in SEPARATELY-COMPILED Next.js bundles
// resolve the SAME slot (same reason as the gmail/google-calendar/
// mcp-server-connector deps slots).
// ---------------------------------------------------------------------------

/** Google-scoped connector key this connector passes through to the shared
 *  Google-OAuth surface — the SAME key google-calendar-connector uses, so
 *  `apiFetch` reuses that connection rather than opening a second one. */
export type GoogleAppointmentSchedulesConnectorKey = "googleCalendar";

/** A single row from `calendar/v3/users/me/calendarList` (the fields this
 *  connector reads; the live Google response carries many more). */
export type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  primary?: boolean;
};

/**
 * Structural shape of the Google-OAuth surface this connector uses. Inlined
 * (NOT imported from `@cinatra-ai/google-oauth-connector`) so this connector
 * carries no non-SDK `@cinatra-ai/*` code dependency — the host binds the
 * concrete impl at boot.
 */
export interface GoogleAppointmentSchedulesOAuthCapability {
  /** Perform an authenticated Google REST call, refreshing the token if
   *  needed. Rejects when the invoking user has no saved connection — callers
   *  must catch that and degrade (never propagate a raw fetch error to the
   *  setup UI). */
  apiFetch<T>(
    input: { url: string; method?: string; body?: unknown },
    options?: { userId?: string; connectorKey?: GoogleAppointmentSchedulesConnectorKey },
  ): Promise<T>;
}

/**
 * The narrow surface of the host this connector needs at runtime:
 * connector-config read/write (this connector's own per-user store) plus the
 * host-injected Google-OAuth capability, and the invoking session user id.
 */
export interface GoogleAppointmentSchedulesConnectorDeps {
  /** Read this connector's persisted per-user settings (the saved schedules). */
  readConnectorConfigFromDatabase: <T>(connectorId: string, fallback: T) => T;
  /** Write this connector's persisted per-user settings. */
  writeConnectorConfigToDatabase: (connectorId: string, value: unknown) => void;
  /** Resolve the current session user id (throws with no authenticated
   *  session — every stored entry is per-user, so there is no instance-scoped
   *  fallback in this connector). */
  requireSessionUserId: () => Promise<string>;
  oauth: GoogleAppointmentSchedulesOAuthCapability;
}

const GOOGLE_APPOINTMENT_SCHEDULES_DEPS_KEY = Symbol.for(
  "@cinatra-ai/google-appointment-schedules-connector:host-deps/v1",
);
type DepsHolder = { [k: symbol]: GoogleAppointmentSchedulesConnectorDeps | null | undefined };
const _holder = globalThis as unknown as DepsHolder;

export function registerGoogleAppointmentSchedulesConnector(
  deps: GoogleAppointmentSchedulesConnectorDeps,
): void {
  _holder[GOOGLE_APPOINTMENT_SCHEDULES_DEPS_KEY] = deps;
}

export function getGoogleAppointmentSchedulesDeps(): GoogleAppointmentSchedulesConnectorDeps {
  const deps = _holder[GOOGLE_APPOINTMENT_SCHEDULES_DEPS_KEY];
  if (!deps) {
    throw new Error(
      "@cinatra-ai/google-appointment-schedules-connector: host runtime deps not registered. " +
        "The connector's serverEntry register(ctx) binds them at activation " +
        "(tests: call registerGoogleAppointmentSchedulesConnector(stubDeps) in setup).",
    );
  }
  return deps;
}

/** @internal test-only. */
export function _resetGoogleAppointmentSchedulesDepsForTests(): void {
  _holder[GOOGLE_APPOINTMENT_SCHEDULES_DEPS_KEY] = null;
}
