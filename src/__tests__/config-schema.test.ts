// Contract fixtures for the declarative setup DSL (cinatra.configSchema).
//
// This connector ships a `uiSurface:"schema-config"` declaration so the host
// renders its setup page from DATA with NO rebuild (cinatra-ai/cinatra#2367 /
// #2368). These tests prove the declared `cinatra.configSchema` passes the
// PUBLIC validation path — the SAME fail-closed `validateConfigSchema` the
// repo's `extension-kind-gate.mjs` runs in CI — and pin the exact field/tab
// shape the issue specifies: record-list + text bookingPageUrl +
// dynamic-select-options{optionsAction:"listCalendars"} + named-action "Add
// schedule", plus a single reserved "help" tab carrying the verbatim
// booking-page prose.

import { describe, expect, it } from "vitest";
import pkg from "../../package.json" with { type: "json" };
import { validateConfigSchema } from "../../extension-kind-gate.mjs";

const configSchema = (pkg as { cinatra?: { configSchema?: unknown } }).cinatra?.configSchema;

type Field = Record<string, unknown>;
type Tab = { id: string; label: string; fields: Field[] };

const setupFields = (configSchema as { fields: Field[] }).fields;
const tabs = (configSchema as { tabs?: Tab[] }).tabs ?? [];
const helpTab = tabs.find((t) => t.id === "help");

const VERBATIM_BOOKING_PAGE_HELP =
  "A public Google Calendar appointment-schedule link (calendar.app.google/…) the assistant " +
  "shares so people can book time with you — a share link, not a calendar sync. Get one in " +
  "Google Calendar: Create → Appointment schedule, then paste its public link here.";

describe("google-appointment-schedules-connector cinatra.configSchema", () => {
  it('declares uiSurface:"schema-config" and requests authSession + capabilities + ui host ports', () => {
    const cinatra = (pkg as { cinatra: Record<string, unknown> }).cinatra;
    expect(cinatra.uiSurface).toBe("schema-config");
    expect(cinatra.requestedHostPorts).toEqual(
      expect.arrayContaining(["authSession", "capabilities", "ui"]),
    );
    // No providerConfigKey of its own (item 2 of the issue).
    expect(cinatra.providerConfigKey).toBeUndefined();
    // Enrollment requirement.
    expect(cinatra.consumes).toEqual([]);
  });

  it("declares the required runtime dependency edge on google-calendar-connector", () => {
    const cinatra = (pkg as { cinatra: { dependencies: Record<string, unknown>[] } }).cinatra;
    expect(cinatra.dependencies).toHaveLength(1);
    const dep = cinatra.dependencies[0];
    expect(dep.packageName).toBe("@cinatra-ai/google-calendar-connector");
    expect(dep.kind).toBe("connector");
    expect(dep.edgeType).toBe("runtime");
    expect(dep.requirement).toBe("required");
    expect(dep.versionConstraint).toEqual({ kind: "semver-range", range: "^0.1.0" });
  });

  it("the declared configSchema parses with ZERO validation errors", () => {
    expect(validateConfigSchema(configSchema)).toEqual([]);
  });

  it("covers every required Setup-tab element (record-list + text + dynamic-select-options + named-action)", () => {
    const byKind = (k: string) => setupFields.filter((f) => f.kind === k);

    const recordList = byKind("record-list")[0];
    expect(recordList).toBeDefined();
    expect(recordList.listActionId).toBe("listAppointmentSchedules");
    expect(recordList.deleteActionId).toBe("deleteAppointmentSchedule");
    expect(recordList.emptyState).toBeTruthy();
    expect(recordList.itemTitleKey).toBe("title");
    const badgeKeys = (recordList.itemBadges as Array<{ key: string }>).map((b) => b.key);
    expect(badgeKeys).toContain("calendarSummary");

    const bookingUrl = byKind("text").find((f) => f.key === "bookingPageUrl");
    expect(bookingUrl).toBeDefined();
    expect(bookingUrl!.required).toBe(true);

    const calendarSelect = byKind("dynamic-select-options").find((f) => f.key === "calendarId");
    expect(calendarSelect).toBeDefined();
    expect(calendarSelect!.optionsAction).toBe("listCalendars");
    // The disconnected-state guidance is baked into the field's own placeholder
    // (item 4): it must name the Google Calendar setup path.
    expect(String(calendarSelect!.placeholder)).toContain(
      "/connectors/cinatra-ai/google-calendar-connector/setup",
    );

    const addAction = byKind("named-action").find((f) => f.label === "Add schedule");
    expect(addAction).toBeDefined();
    expect(addAction!.actionId).toBe("addSchedule");
  });

  describe("the Help tab (design spec: app-connectors §II — reserved, always last)", () => {
    it("declares exactly one tab: the reserved Help tab", () => {
      expect(tabs.map((t) => t.id)).toEqual(["help"]);
      expect(helpTab?.label).toBe("Help");
    });

    it("carries the booking-page help prose VERBATIM AND IN FULL, with the schema-mandated advisory fields", () => {
      const fields = helpTab!.fields;
      expect(fields).toHaveLength(1);
      const advisory = fields[0] as {
        kind: string;
        label?: string;
        tone?: string;
        probeActionId?: string;
        whenReady?: string;
        whenNotReady?: string;
      };
      expect(advisory.kind).toBe("advisory");
      expect(advisory.label).toBeTruthy();
      expect(advisory.tone).toBeTruthy();
      expect(advisory.probeActionId).toBe("bookingPageGuideReady");
      expect(advisory.whenReady).toBe(VERBATIM_BOOKING_PAGE_HELP);
      expect(advisory.whenNotReady).toBe(VERBATIM_BOOKING_PAGE_HELP);
    });

    it("every field key stays unique across the Setup tab AND the Help tab (one flat submit namespace)", () => {
      const allKeyed = [...setupFields, ...(helpTab?.fields ?? [])]
        .map((f) => (f as { key?: string }).key)
        .filter((k): k is string => typeof k === "string");
      expect(new Set(allKeyed).size).toBe(allKeyed.length);
    });
  });

  describe("validateConfigSchema is fail-closed (mirrors the host parser)", () => {
    it("rejects an UNKNOWN key on a field (no executable/HTML carrier smuggled in)", () => {
      for (const evil of ["html", "onClick", "render", "component", "script", "dangerouslySetInnerHTML"]) {
        const errs = validateConfigSchema({
          fields: [{ kind: "text", key: "label", label: "Label", [evil]: "<script>x</script>" }],
        });
        expect(errs.length, `expected ${evil} to be rejected`).toBeGreaterThan(0);
      }
    });

    it("rejects a record-list with no listActionId", () => {
      expect(
        validateConfigSchema({ fields: [{ kind: "record-list", label: "Schedules" }] }).length,
      ).toBeGreaterThan(0);
    });

    it("rejects a dynamic-select-options field with no optionsAction", () => {
      expect(
        validateConfigSchema({
          fields: [{ kind: "dynamic-select-options", key: "calendarId", label: "Calendar" }],
        }).length,
      ).toBeGreaterThan(0);
    });

    it("rejects a duplicate tab id", () => {
      expect(
        validateConfigSchema({
          fields: [{ kind: "text", key: "k", label: "L" }],
          tabs: [
            { id: "dup", label: "One", fields: [{ kind: "text", key: "k1", label: "L" }] },
            { id: "dup", label: "Two", fields: [{ kind: "text", key: "k2", label: "L" }] },
          ],
        }).length,
      ).toBeGreaterThan(0);
    });
  });
});
