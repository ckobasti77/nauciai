import { describe, expect, test } from "vitest";

import { CREA_PALETTES, CREA_PALETTE_MAX, CREA_STYLE_GROUPS, CREA_STYLES, normalizePalette, styleById, stylesInGroup } from "./crea-styles";

const HEX = /^#[0-9a-f]{6}$/i;

describe("stilovi (S8)", () => {
  test("oko 40 stilova, jedinstveni id-jevi, svaka grupa ima bar 4", () => {
    expect(CREA_STYLES.length).toBeGreaterThanOrEqual(36);
    expect(CREA_STYLES.length).toBeLessThanOrEqual(48);
    expect(new Set(CREA_STYLES.map((style) => style.id)).size).toBe(CREA_STYLES.length);
    for (const group of CREA_STYLE_GROUPS) expect(stylesInGroup(group.id).length, group.id).toBeGreaterThanOrEqual(4);
  });

  test("svaki stil ima naziv i savet na oba jezika, kratak dodatak opisu i ispravnu sličicu", () => {
    for (const style of CREA_STYLES) {
      expect(style.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      for (const text of [style.label, style.hint]) {
        expect(text.sr.trim().length, style.id).toBeGreaterThan(0);
        expect(text.en.trim().length, style.id).toBeGreaterThan(0);
      }
      expect(style.fragment.length, style.id).toBeGreaterThan(10);
      expect(style.fragment.length, style.id).toBeLessThanOrEqual(160);
      expect(style.fragment.endsWith("."), style.id).toBe(false);
      for (const color of [...style.thumb.bg, style.thumb.fg]) expect(color, style.id).toMatch(HEX);
    }
  });

  test("`styleById` ne izmišlja", () => {
    expect(styleById("ilu-akvarel")?.label.sr).toBe("Akvarel");
    expect(styleById("nema")).toBeUndefined();
    expect(styleById(null)).toBeUndefined();
  });

  test("palete: ispravne boje, najviše 5; `normalizePalette` čisti ulaz", () => {
    expect(CREA_PALETTES.length).toBeGreaterThanOrEqual(6);
    for (const palette of CREA_PALETTES) {
      expect(palette.colors.length).toBeLessThanOrEqual(CREA_PALETTE_MAX);
      for (const color of palette.colors) expect(color).toMatch(HEX);
    }
    expect(normalizePalette(["#AABBCC", " #aabbcc ", "crvena", "#123", "#000000", "#111111", "#222222", "#333333", "#444444"])).toEqual([
      "#aabbcc",
      "#000000",
      "#111111",
      "#222222",
      "#333333",
    ]);
  });
});
