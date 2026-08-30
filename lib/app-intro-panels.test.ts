import { describe, expect, it } from "vitest";

import {
  INTRO_PANEL_IDS,
  isIntroPanelId,
  parseDismissedIntroPanels,
  serializeDismissedIntroPanels,
  withDismissedIntroPanel,
} from "./app-intro-panels";

describe("app intro panels", () => {
  it("round-trips a dismissed panel", () => {
    const encoded = serializeDismissedIntroPanels(["studio"]);
    expect(parseDismissedIntroPanels(encoded)).toEqual(["studio"]);
  });

  it("treats a missing key as nothing dismissed", () => {
    expect(parseDismissedIntroPanels(null)).toEqual([]);
    expect(parseDismissedIntroPanels(undefined)).toEqual([]);
    expect(parseDismissedIntroPanels("")).toEqual([]);
  });

  // Panel koji se pojavi viska je bezopasan; ekran koji pukne zbog pokvarenog
  // localStorage zapisa nije - zato svaki neispravan ulaz pada na "nista nije zatvoreno".
  it("falls back to nothing dismissed on unusable storage values", () => {
    expect(parseDismissedIntroPanels("{")).toEqual([]);
    expect(parseDismissedIntroPanels('"studio"')).toEqual([]);
    expect(parseDismissedIntroPanels("{\"studio\":true}")).toEqual([]);
  });

  it("drops unknown ids instead of keeping them around", () => {
    expect(parseDismissedIntroPanels('["studio","kredit","community"]')).toEqual(["community", "studio"]);
  });

  it("serializes in a stable order and without duplicates", () => {
    expect(serializeDismissedIntroPanels(["studio", "community", "studio"])).toBe('["community","studio"]');
  });

  it("dismissing one panel keeps the other one visible", () => {
    const next = withDismissedIntroPanel([], "community");
    expect(next).toEqual(["community"]);
    expect(withDismissedIntroPanel(next, "studio")).toEqual(["community", "studio"]);
  });

  it("dismissing the same panel twice changes nothing", () => {
    expect(withDismissedIntroPanel(["community"], "community")).toEqual(["community"]);
  });

  it("recognizes only the declared ids", () => {
    expect(INTRO_PANEL_IDS).toEqual(["community", "studio"]);
    expect(isIntroPanelId("community")).toBe(true);
    expect(isIntroPanelId("dashboard")).toBe(false);
    expect(isIntroPanelId(7)).toBe(false);
  });
});
