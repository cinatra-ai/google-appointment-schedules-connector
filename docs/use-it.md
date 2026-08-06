---
slug: google-appointment-schedules
title: Use the Google Appointment Schedules integration
description: What the connector does day to day, and what it does not.
navOrder: 3
tier: first-party
lifecycle: active
cinatraCompat: ">=1.2 <2"
integrationVersion: "0.1.0"
sourceRepo: https://github.com/cinatra-ai/google-appointment-schedules-connector
supportUrl: https://docs.cinatra.ai/resources/support/
marketplaceUrl: https://marketplace.cinatra.ai/extensions/google-appointment-schedules
---

# Use the Google Appointment Schedules integration

Once you have saved one or more appointment schedules, the integration runs
quietly in the background. This page explains what that means day to day —
and what it does not.

## What a saved schedule does

- **It is shareable by the assistant.** A saved schedule's title and booking
  link are contributed to the chat system prompt, so your Cinatra assistant
  can offer it in conversation.
- **It is listable by tools.** The `appointment_schedule_list` MCP tool and the
  `appointment-schedules` capability both expose your saved schedules to host
  and agent surfaces that need them.
- **It stays tied to its calendar.** Each schedule remembers which Google
  Calendar its availability comes from, shown as a badge in your list.

## Managing your schedules

- **List.** The setup page lists every schedule you have saved, with the
  calendar it is tied to.
- **Add.** Paste a booking-page link, pick a calendar (or leave it for your
  primary), and click **Add schedule**.
- **Remove.** The per-row delete action removes a schedule from your list.

## What is not done here

- **The connector does not create appointment schedules.** You create the
  schedule itself in Google Calendar; this connector only stores and shares
  the link you already have.
- **It does not sync your calendar.** A booking-page link is a share link, not
  a calendar sync — saving one does not read or write calendar events.
- **Only public links are accepted.** A link that does not resolve to
  `calendar.app.google` is rejected.

## How access stays safe

- **Every schedule is scoped to you.** Schedules are stored per user; no other
  user sees or manages your list.
- **The calendar list is always live.** The calendar picker reads your account's
  current calendars at the moment you open the setup page — it is never
  cached stale.

For configuration and the permission model, see
[settings & permissions](./settings-and-permissions.md).
