---
slug: google-appointment-schedules
title: Google Appointment Schedules integration overview
description: Share the right Google Calendar booking link, tied to the calendar that owns it.
navOrder: 1
tier: first-party
lifecycle: active
cinatraCompat: ">=1.2 <2"
integrationVersion: "0.1.0"
sourceRepo: https://github.com/cinatra-ai/google-appointment-schedules-connector
supportUrl: https://docs.cinatra.ai/resources/support/
marketplaceUrl: https://marketplace.cinatra.ai/extensions/google-appointment-schedules
---

# Google Appointment Schedules integration overview

The Google Appointment Schedules integration stores the public
[Google Calendar appointment-schedule](https://support.google.com/calendar/answer/10729749)
booking links you want Cinatra to share on your behalf — each one tied to the
specific Google Calendar whose availability it publishes.

## Who it is for

Anyone who books time through a Google Calendar appointment schedule and wants
their Cinatra assistant to share the right link automatically, instead of
copy-pasting it into every conversation.

## What it lets you do

- **Save booking-page links.** Paste a public `calendar.app.google` link once;
  the connector fetches its title and description so it shows up clearly in
  your list.
- **Tie each schedule to a calendar.** Pick the Google Calendar each schedule's
  availability comes from, chosen from your connected account's real calendar
  list — not typed in blind.
- **Let the assistant share it.** Once saved, a schedule's link is available to
  Cinatra agents through the chat context and a dedicated MCP tool, so the
  assistant can offer it without you repeating yourself.

## How it fits together

This connector requires [Google Calendar](https://marketplace.cinatra.ai/extensions/google-calendar)
to be installed — it reads your connected account's calendar list through that
connector's shared Google connection rather than opening a second one. See
[settings & permissions](./settings-and-permissions.md) for what that
dependency means in practice.

Ready to set it up? Start with the [quick start](./quick-start.md). For
cross-cutting Cinatra material, see the canonical [Guides](/guides/).
