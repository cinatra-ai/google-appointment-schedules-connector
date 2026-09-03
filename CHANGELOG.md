# Changelog

All notable changes to this project are documented here, derived from the
project's merged pull request and release-tag history.

## Unreleased

- Initial scaffold via `cinatra create-extension connector` + the org hygiene
  workflow set.
- Extract the appointment-schedule store, the `calendar.app.google` booking-page
  allowlist, and the og-scrape enrichment from `@cinatra-ai/google-calendar-connector`
  into this connector, with a per-entry Google Calendar selection and a
  declarative `schema-config` setup surface (record list, booking-page URL,
  live calendar picker, "Add schedule" action, and a Help tab carrying the
  booking-page prose).
- Add the `appointment_schedule_list` MCP tool and move the `chat-user-context`
  + `appointment-schedules` capability providers over with unchanged ids/shapes.
- Declare a required runtime dependency on `@cinatra-ai/google-calendar-connector`.
- The appointment-schedule row badge now NAMES its calendar: the record-list
  badge opts in to the host DSL's `showsValue`, so it renders the row's stored
  `calendarSummary` (the calendar's own name) instead of the static word
  "Calendar", which stays as the badge's accessible qualifier.
