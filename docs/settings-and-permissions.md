---
slug: google-appointment-schedules
title: Google Appointment Schedules settings and permissions
description: Configure the connector and understand its trust model.
navOrder: 4
tier: first-party
lifecycle: active
cinatraCompat: ">=1.2 <2"
integrationVersion: "0.1.0"
sourceRepo: https://github.com/cinatra-ai/google-appointment-schedules-connector
supportUrl: https://docs.cinatra.ai/resources/support/
marketplaceUrl: https://marketplace.cinatra.ai/extensions/google-appointment-schedules
---

# Google Appointment Schedules settings and permissions

This page covers the connector's configuration, the permissions it requires,
and its trust model — what it can access, how that access is granted, and how
it is governed. Read it before you enable the integration.

## Configuration

Each saved schedule takes these values, entered on the setup page:

| Setting | What it is | Example |
|---------|------------|---------|
| Booking page URL | A public Google Calendar appointment-schedule link | `https://calendar.app.google/...` |
| Calendar | The Google Calendar the schedule's availability comes from | Chosen from your live calendar list; defaults to your primary calendar |

A booking page URL must resolve to `calendar.app.google` over `https`; anything
else is rejected.

## Required permissions

- **In Cinatra:** each schedule is scoped to the user who saved it — any
  authenticated workspace member may save and manage their own schedules.
- **A required dependency on Google Calendar.** This connector declares a
  required runtime dependency on `@cinatra-ai/google-calendar-connector`
  (`versionConstraint: ^0.1.0`): installing this connector installs Google
  Calendar automatically if it is not already present, and an active
  dependent blocks Google Calendar from being removed. The dependency exists
  because this connector reads your calendar list through Google Calendar's
  shared `google-oauth` host service, not through one of its MCP primitives —
  the declared-vs-used validator therefore flags the edge as an advisory
  stale-declaration warning. That warning is expected and accepted, not a
  defect: the dependency captures a real host-service coupling that the
  primitive-usage check cannot see.
- **Host ports:** the connector requests the `authSession`, `capabilities`,
  and `ui` host ports, and runs under the standard connector
  inversion-of-control contract — it cannot reach host facilities it has not
  been granted.

## Trust model

- **No second Google connection.** The calendar list is read through Google
  Calendar's existing per-user connection (`calendar.readonly` scope); this
  connector never opens its own OAuth connection.
- **The calendar list is always fetched fresh.** Both the setup page's
  calendar picker and the add-schedule flow re-fetch the live list rather than
  trusting a cached or client-supplied value — an invalid or stale calendar id
  is refused.
- **`calendarSummary` is always derived server-side.** The display name shown
  for a schedule's calendar comes from the live calendar list, never from a
  client-supplied value.
- **Disconnected accounts degrade safely.** With no Google connection, the
  calendar picker returns an empty (not erroring) list with guidance to
  connect Google Calendar first.

## Failure modes

| Symptom | Cause |
|---------|-------|
| Calendar picker is empty | No Google Calendar connection for your account yet. |
| "not one of your Google calendars" error when adding | The submitted calendar id is no longer valid for your account. |
| Booking page URL rejected | The link does not resolve to `calendar.app.google` over `https`. |

For step-by-step recovery, see [troubleshooting](./troubleshooting.md).
