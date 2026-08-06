---
slug: google-appointment-schedules
title: Google Appointment Schedules advanced and reference
description: Deeper material and canonical reference links for the integration.
navOrder: 6
tier: first-party
lifecycle: active
cinatraCompat: ">=1.2 <2"
integrationVersion: "0.1.0"
sourceRepo: https://github.com/cinatra-ai/google-appointment-schedules-connector
supportUrl: https://docs.cinatra.ai/resources/support/
marketplaceUrl: https://marketplace.cinatra.ai/extensions/google-appointment-schedules
---

# Google Appointment Schedules advanced and reference

This page collects deeper material and links out to the canonical Cinatra
chapters — it does not duplicate them.

## A first-time extraction, not a migration

Appointment schedules were never their own connector before this one:
`@cinatra-ai/google-calendar-connector`'s initial import already contained the
full appointment store, and only the setup UI later moved into a dedicated
tab. This connector is a first-time extraction of that store, its
`calendar.app.google` allowlist, and its og-scrape enrichment into a
standalone package — the rows previously stored by the calendar connector are
not migrated; a fresh install starts with an empty list.

For the cross-cutting platform reference, see the canonical
[References](/references/) chapter.

## The required dependency on Google Calendar

This connector declares a required runtime dependency on
`@cinatra-ai/google-calendar-connector` (`versionConstraint: ^0.1.0`) because
it reads your calendar list through that connector's shared `google-oauth`
host service — not through one of its MCP primitives. That makes the
declared-vs-used validator flag the edge as an advisory stale-declaration
warning; this is expected (see
[settings & permissions](./settings-and-permissions.md)) and not a defect.
Installing this connector installs Google Calendar first if it is not already
present; an active install of this connector blocks Google Calendar from
being uninstalled or archived.

## The assistant-facing add flow

Beyond the setup page, an assistant can add a schedule on a user's behalf
through the host's `appointment_schedule_add{url, calendarId?}` bridge:
`calendarId` is optional and defaults to the account's primary calendar; a
supplied id is validated against a fresh account-scoped calendar list before
the schedule is saved, and `calendarSummary` is always derived server-side.

## MCP tool and capabilities

- `appointment_schedule_list` — lists the invoking user's saved schedules
  (title, booking-page URL, calendar id, and calendar name).
- `chat-user-context` — contributes a short summary of the user's schedules to
  the chat system prompt.
- `appointment-schedules` — surfaces structured `{ title, bookingPageUrl }`
  rows to host call-to-action surfaces (moved unchanged from Google Calendar).

## Source and support

- Source repository: [cinatra-ai/google-appointment-schedules-connector](https://github.com/cinatra-ai/google-appointment-schedules-connector).
- Get help: the [support](https://docs.cinatra.ai/resources/support/) page.
- Marketplace listing: [Google Appointment Schedules on the Cinatra Marketplace](https://marketplace.cinatra.ai/extensions/google-appointment-schedules).
