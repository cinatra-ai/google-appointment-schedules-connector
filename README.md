# Google Appointment Schedules

Google Appointment Schedules connector for Cinatra. Stores each user's public Google Calendar appointment-schedule booking links (`calendar.app.google`), each tied to the specific Google Calendar its availability comes from, so agents can share the right booking link without manual link management. Full documentation lives in the Integrations hub at https://docs.cinatra.ai/integrations/google-appointment-schedules/

## Works with

- Cinatra (connector kind: `connector`)
- Requires `@cinatra-ai/google-calendar-connector` (a required runtime dependency) for the live per-user calendar list. This connector consumes that connector's host `google-oauth` service, not one of its MCP primitives, so the declared-vs-used validator flags the edge as an advisory stale-declaration warning — accepted honestly, not disguised.

## Capabilities

- Add, list, and delete per-user appointment schedules on a declarative `schema-config` setup page — no bundled React, hot-installable
- Pick the Google Calendar each schedule belongs to from your connected account's live calendar list
- List stored appointment schedules via the `appointment_schedule_list` MCP tool
- Contribute scheduling links to the chat system prompt via the `chat-user-context` capability
- Surface structured `{ title, bookingPageUrl }` rows to host call-to-action surfaces via the `appointment-schedules` capability
