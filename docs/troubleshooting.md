---
slug: google-appointment-schedules
title: Google Appointment Schedules troubleshooting
description: Diagnose and fix common Google Appointment Schedules issues.
navOrder: 5
tier: first-party
lifecycle: active
cinatraCompat: ">=1.2 <2"
integrationVersion: "0.1.0"
sourceRepo: https://github.com/cinatra-ai/google-appointment-schedules-connector
supportUrl: https://docs.cinatra.ai/resources/support/
marketplaceUrl: https://marketplace.cinatra.ai/extensions/google-appointment-schedules
---

# Google Appointment Schedules troubleshooting

Each problem below gives the **symptoms**, the **cause**, the **fix**, the
**diagnostics** to confirm it, and the **escalation** path if the fix does not
work.

## The calendar picker is empty

- **Symptoms:** The **Calendar** field on the setup page shows no options, with
  guidance to connect Google Calendar.
- **Cause:** Your account has no active Google Calendar connection.
- **Fix:** Open the [Google Calendar](https://marketplace.cinatra.ai/extensions/google-calendar)
  setup page (`/connectors/cinatra-ai/google-calendar-connector/setup`) and
  connect your Google account, then return to this connector's setup page.
- **Diagnostics:** The Google Calendar setup page shows a connected status once
  the connection succeeds; the calendar picker here repopulates on the next
  page load.
- **Escalation:** [Contact support](https://docs.cinatra.ai/resources/support/)
  if the picker stays empty after a confirmed Google Calendar connection.

## Adding a schedule fails with an invalid calendar error

- **Symptoms:** Clicking **Add schedule** returns an error naming the calendar
  id as invalid.
- **Cause:** The submitted calendar id no longer matches your account's live
  calendar list (it may have been removed or the picker was stale).
- **Fix:** Reload the setup page so the calendar picker re-fetches your current
  list, choose a calendar again, and retry.
- **Diagnostics:** The calendar you select must appear in the freshly loaded
  picker; a calendar id used elsewhere does not carry over.
- **Escalation:** [Contact support](https://docs.cinatra.ai/resources/support/)
  if a calendar visible in the picker is still rejected.

## The booking page URL is rejected

- **Symptoms:** Adding a schedule fails immediately with a link-format error.
- **Cause:** The pasted link does not resolve to `calendar.app.google` over
  `https` — it may be a raw calendar link, a shortened link, or a typo.
- **Fix:** In Google Calendar, open **Create → Appointment schedule** and copy
  its public link directly (it starts with `https://calendar.app.google/`).
- **Diagnostics:** Paste the link into a browser; it should open a public
  booking page, not your calendar itself.
- **Escalation:** [Contact support](https://docs.cinatra.ai/resources/support/)
  if a genuine `calendar.app.google` link is still rejected.

## A deleted schedule still appears

- **Symptoms:** A schedule you removed is still listed after the page reloads.
- **Cause:** The delete action did not complete, or you are viewing a cached
  page.
- **Fix:** Reload the setup page and delete the row again.
- **Diagnostics:** A successful delete removes the row immediately.
- **Escalation:** [Contact support](https://docs.cinatra.ai/resources/support/)
  if the row reappears after a confirmed delete.

For configuration details and the permission model, see
[settings & permissions](./settings-and-permissions.md).
