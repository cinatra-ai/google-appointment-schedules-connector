import { z } from "zod";
import type { ExtensionMcpToolServer, ExtensionMcpToolResult } from "@cinatra-ai/sdk-extensions";
import {
  createGoogleAppointmentSchedulesPrimitiveHandlers,
  type GoogleAppointmentSchedulesActorResolver,
} from "./handlers";

const TOOL_META: Record<string, { description: string; inputSchema: z.ZodTypeAny }> = {
  "appointment_schedule_list": {
    description:
      "List the invoking user's stored Google Calendar appointment schedules (public booking page URLs, plus the calendar each is tied to). Returns items[], total, and syncedAt.",
    inputSchema: z.object({}),
  },
};

export function registerGoogleAppointmentSchedulesPrimitives(
  server: ExtensionMcpToolServer,
  resolveActor?: GoogleAppointmentSchedulesActorResolver,
) {
  const handlers = createGoogleAppointmentSchedulesPrimitiveHandlers(resolveActor);

  for (const [name, handler] of Object.entries(handlers)) {
    const meta = TOOL_META[name] ?? { description: name, inputSchema: z.object({}).passthrough() };
    server.registerTool(
      name,
      {
        title: name,
        description: meta.description,
        inputSchema: meta.inputSchema,
      },
      async (input): Promise<ExtensionMcpToolResult> => {
        const result = await handler({
          primitiveName: name,
          input,
          actor: { actorType: "model", source: "agent" },
          mode: "agentic",
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: Array.isArray(result)
            ? { items: result }
            : typeof result === "object" && result !== null
              ? (result as Record<string, unknown>)
              : { result },
        };
      },
    );
  }
}
