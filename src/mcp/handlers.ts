import type { ExtensionPrimitiveRequest } from "@cinatra-ai/sdk-extensions";
import { getStoredGoogleAppointmentSchedules } from "../index";

const PACKAGE_NAME = "@cinatra-ai/google-appointment-schedules-connector";

/**
 * Resolves the TRUSTED human subject `{ userId }` for the current invocation.
 * The host injects this on the manifest-discovered MCP-module path (it reads
 * the request/run context store — the MCP transport carries no actor).
 * Mirrors google-calendar-connector / email-connector / social-media-connector's
 * `resolveActor`; the host passes the SAME resolver uniformly to every
 * connector module factory.
 */
export type GoogleAppointmentSchedulesActorResolver = () => Promise<{ userId?: string; orgId?: string }>;

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

// Appointment schedules are stored PER USER
// (`google_appointment_schedules_user:<id>`), so the agent-facing tool must
// read the INVOKING user's store. The trusted actor arrives by one of two
// host wiring paths:
//   - MCP-module path: the host-injected `resolveActor()` (the synthesized
//     primitive request carries no userId there);
//   - in-process primitive path (agents passthrough): the host builds a
//     trusted `request.actor` (PrimitiveActorContext with `userId`) from the
//     run row.
// `actor` is a TRUSTED host value (NOT agent-supplied `input`), so there is no
// spoofing surface. If BOTH ever supply a userId and they DISAGREE, refuse to
// guess (fail closed) rather than risk reading another user's schedules.
async function resolveInvokingUserId(
  request: ExtensionPrimitiveRequest<unknown>,
  resolveActor?: GoogleAppointmentSchedulesActorResolver,
): Promise<{ userId?: string; deny: boolean }> {
  const injected = nonEmpty((await resolveActor?.())?.userId);
  const onRequest = nonEmpty(
    (request.actor as { userId?: string } | null | undefined)?.userId,
  );
  if (injected && onRequest && injected !== onRequest) {
    console.warn(
      `${PACKAGE_NAME}: conflicting invoking-user ids from the actor resolver and the ` +
        `request actor — refusing to guess; returning no schedules.`,
    );
    return { deny: true };
  }
  return { userId: injected ?? onRequest, deny: false };
}

export function createGoogleAppointmentSchedulesPrimitiveHandlers(
  resolveActor?: GoogleAppointmentSchedulesActorResolver,
) {
  return {
    "appointment_schedule_list": async (request: ExtensionPrimitiveRequest<unknown>) => {
      const { userId, deny } = await resolveInvokingUserId(request, resolveActor);
      if (deny || !userId) {
        return {
          items: [] as {
            title: string;
            bookingPageUrl: string;
            calendarId: string;
            calendarSummary: string;
          }[],
          total: 0,
          syncedAt: null,
        };
      }
      const { schedules, syncedAt } = getStoredGoogleAppointmentSchedules(userId);
      return {
        items: schedules.map((s) => ({
          title: s.title,
          bookingPageUrl: s.bookingPageUrl,
          calendarId: s.calendarId,
          calendarSummary: s.calendarSummary,
        })),
        total: schedules.length,
        syncedAt: syncedAt ?? null,
      };
    },
  } as const;
}
