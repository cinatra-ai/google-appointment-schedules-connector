import type { ExtensionMcpToolServer } from "@cinatra-ai/sdk-extensions";
import { registerGoogleAppointmentSchedulesPrimitives } from "./registry";
import type { GoogleAppointmentSchedulesActorResolver } from "./handlers";

// The host calls this factory (manifest-discovered) with a uniform options
// object carrying `resolveActor` — the trusted request/run actor resolver.
// Thread it into the primitive handlers so `appointment_schedule_list` reads
// the invoking user's per-user store. Mirrors
// google-calendar-connector's createGoogleCalendarModule.
export function createGoogleAppointmentSchedulesModule(deps?: {
  resolveActor?: GoogleAppointmentSchedulesActorResolver;
}) {
  return {
    registerCapabilities: (server: ExtensionMcpToolServer) =>
      registerGoogleAppointmentSchedulesPrimitives(server, deps?.resolveActor),
  };
}
