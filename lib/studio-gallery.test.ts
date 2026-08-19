import { describe, expect, test } from "vitest";

import {
  dateRangeCutoff,
  expiryBadgeDays,
  expiryBadgeText,
  isDownloadable,
  regenerateButtonLabel,
} from "./studio-gallery";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("dateRangeCutoff", () => {
  test("'all' nema donju granicu", () => {
    expect(dateRangeCutoff("all", NOW)).toBeUndefined();
  });

  test("'7d' i '30d' su tačno N dana unazad od 'now'", () => {
    expect(dateRangeCutoff("7d", NOW)).toBe(NOW - 7 * DAY_MS);
    expect(dateRangeCutoff("30d", NOW)).toBe(NOW - 30 * DAY_MS);
  });
});

describe("expiryBadgeDays", () => {
  test("null kad nema fajla ili nema roka", () => {
    expect(expiryBadgeDays({ outputUrl: null, expiresAt: NOW + DAY_MS }, NOW)).toBeNull();
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: undefined }, NOW)).toBeNull();
  });

  test("null kad je rok već prošao (to je 'isteklo', ne značka)", () => {
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW - 1 }, NOW)).toBeNull();
  });

  test("null kad je 7 ili više dana do isteka", () => {
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW + 7 * DAY_MS }, NOW)).toBeNull();
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW + 30 * DAY_MS }, NOW)).toBeNull();
  });

  test("broj dana, zaokružen naviše, kad je manje od 7 dana do isteka", () => {
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW + 6 * DAY_MS }, NOW)).toBe(6);
    // Malo preko 2 puna dana -> značka kaže "3", da ne obeća više vremena nego što ima.
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW + 2 * DAY_MS + 60_000 }, NOW)).toBe(3);
    expect(expiryBadgeDays({ outputUrl: "https://x", expiresAt: NOW + 1000 }, NOW)).toBe(1);
  });
});

describe("expiryBadgeText", () => {
  test("posebna poruka za danas, jednina za jedan dan, inače plural 'dana'", () => {
    expect(expiryBadgeText(0, "sr")).toBe("ističe danas");
    expect(expiryBadgeText(0, "en")).toBe("expires today");
    expect(expiryBadgeText(1, "sr")).toBe("ističe za 1 dan");
    expect(expiryBadgeText(1, "en")).toBe("expires in 1 day");
    expect(expiryBadgeText(6, "sr")).toBe("ističe za 6 dana");
    expect(expiryBadgeText(6, "en")).toBe("expires in 6 days");
  });
});

test("regenerateButtonLabel nosi cenu u oba jezika", () => {
  expect(regenerateButtonLabel(20, "sr")).toBe("Generiši ponovo - 20 kr");
  expect(regenerateButtonLabel(20, "en")).toBe("Generate again - 20 cr");
});

describe("isDownloadable", () => {
  test("samo posao sa outputUrl je preuzimljiv", () => {
    expect(isDownloadable({ outputUrl: "https://x" })).toBe(true);
    expect(isDownloadable({ outputUrl: null })).toBe(false);
    expect(isDownloadable({ outputUrl: undefined })).toBe(false);
    expect(isDownloadable({})).toBe(false);
  });
});
