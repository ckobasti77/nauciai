import { describe, expect, it } from "vitest";

import {
  dashboardZoneAccent,
  dashboardZoneChipClass,
  dashboardZoneIds,
  dashboardZoneRole,
  type DashboardZoneAccent,
} from "./dashboard-zones";

const ACCENTS: DashboardZoneAccent[] = ["yellow", "ink", "paper"];

describe("dashboardZoneAccent", () => {
  it("gives every zone on the command table an accent", () => {
    expect(dashboardZoneIds).toHaveLength(8);
    for (const zone of dashboardZoneIds) {
      expect(ACCENTS).toContain(dashboardZoneAccent(zone));
    }
  });

  it("keeps yellow for the two zones where the student does something", () => {
    // Zuta je u celom proizvodu boja radnje. Ako je dobije i cetvrta zona, signal
    // prestaje da znaci „ovde ti radis".
    const yellow = dashboardZoneIds.filter((zone) => dashboardZoneAccent(zone) === "yellow");
    expect(yellow).toEqual(["classroom", "studio"]);
  });

  it("marks the zones with other people in ink", () => {
    const ink = dashboardZoneIds.filter((zone) => dashboardZoneAccent(zone) === "ink");
    expect(ink).toEqual(["messages", "community", "study"]);
  });

  it("leaves the status zones on paper, admin included", () => {
    const paper = dashboardZoneIds.filter((zone) => dashboardZoneAccent(zone) === "paper");
    expect(paper).toEqual(["notifications", "adminContent", "adminPeople"]);
  });

  it("derives the accent from the role, so a new zone cannot invent a fourth look", () => {
    for (const zone of dashboardZoneIds) {
      const role = dashboardZoneRole(zone);
      const expected = role === "do" ? "yellow" : role === "people" ? "ink" : "paper";
      expect(dashboardZoneAccent(zone)).toBe(expected);
    }
  });
});

describe("dashboardZoneChipClass", () => {
  it("always keeps the ink outline that carries the shape in both themes", () => {
    for (const zone of dashboardZoneIds) {
      expect(dashboardZoneChipClass(zone)).toContain("border-ink");
    }
  });

  it("uses only palette tokens — never a raw hex or an arbitrary colour", () => {
    for (const zone of dashboardZoneIds) {
      const classes = dashboardZoneChipClass(zone).split(" ");
      for (const item of classes) {
        expect(item).toMatch(/^(border|bg|text)-(ink|paper|paper-strong|yellow|muted|line)$/);
      }
    }
  });

  it("keeps the three accents visually distinct from each other", () => {
    const chips = new Set(dashboardZoneIds.map((zone) => dashboardZoneChipClass(zone)));
    expect(chips.size).toBe(3);
  });

  it("never paints a chip in the same fill as the panel it sits on", () => {
    // Panel je `bg-paper-strong`; plocica koja bi bila ista boja ne bi postojala.
    for (const zone of dashboardZoneIds) {
      expect(dashboardZoneChipClass(zone)).not.toContain("bg-paper-strong");
    }
  });
});
