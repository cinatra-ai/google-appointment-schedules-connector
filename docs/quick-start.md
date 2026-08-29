---
slug: google-appointment-schedules
title: Google Appointment Schedules quick start
description: Add your first appointment schedule in Cinatra.
navOrder: 2
tier: first-party
lifecycle: active
cinatraCompat: ">=1.2 <2"
integrationVersion: "0.1.0"
sourceRepo: https://github.com/cinatra-ai/google-appointment-schedules-connector
supportUrl: https://docs.cinatra.ai/resources/support/
marketplaceUrl: https://marketplace.cinatra.ai/extensions/google-appointment-schedules
---

# Google Appointment Schedules quick start

This page is everything you need to add your first Google Calendar
appointment schedule and make it available to your Cinatra assistant.

## Before you start

You need:

- A **public Google Calendar appointment-schedule link**
  (`calendar.app.google/...`) — a share link, not a calendar sync. In Google
  Calendar: **Create → Appointment schedule**, then copy its public link.
- The [Google Calendar](https://marketplace.cinatra.ai/extensions/google-calendar)
  integration installed and connected in Cinatra, so this connector can read
  your real calendar list. Installing Google Appointment Schedules installs
  Google Calendar automatically if it is not already present.
- Permission in Cinatra to install an integration and configure a connector.

## Step 1 — Install the integration

1. Open the Cinatra **Marketplace** and find **Google Appointment Schedules**.
2. Click **Install**. Google Calendar is pulled in automatically if it is not
   already installed.

## Step 2 — Connect Google Calendar

1. If you have not already, open the **Google Calendar** connector's setup
   page and connect your Google account.
2. Return to the **Google Appointment Schedules** setup page — its calendar
   picker now shows your real calendars.

## Step 3 — Add a schedule

1. Paste your **Booking page URL** (the `calendar.app.google` link).
2. Choose the **Calendar** this schedule's availability comes from, or keep
   **My primary calendar** — the first entry in the list — to use your
   primary calendar.
3. Click **Add schedule**.

## Step 4 — Confirm it is saved

The new schedule appears in the **Appointment schedules** list with the
calendar it is tied to. That is the whole setup — Cinatra agents can now share
this booking link.

## Verify it worked

Open the setup page again and confirm the schedule is listed. If something
does not line up, see [troubleshooting](./troubleshooting.md).
