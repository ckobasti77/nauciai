/**
 * Paleta boja (S31, K09): HEX u oba smera, kontrast po WCAG-u, srpski nazivi
 * i sređivanje palete pre prikaza.
 */
import { describe, expect, test } from "vitest";

import {
  colorName,
  contrastRatio,
  hexToRgb,
  palettePrompt,
  paletteText,
  readableOn,
  rgbToHex,
  tidyPalette,
} from "./crea-palette";

describe("HEX", () => {
  test("u oba smera, kratak zapis i loš unos", () => {
    expect(rgbToHex([14, 49, 88])).toBe("#0e3158");
    expect(rgbToHex([300, -4, 15.6])).toBe("#ff0010");
    expect(hexToRgb("#0e3158")).toEqual([14, 49, 88]);
    expect(hexToRgb("fab")).toEqual([255, 170, 187]);
    expect(hexToRgb("#12345")).toBeNull();
    expect(hexToRgb("zelena")).toBeNull();
  });
});

describe("kontrast", () => {
  test("crno na belom je 21:1, isto na istom 1:1", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrastRatio([120, 120, 120], [120, 120, 120])).toBe(1);
  });

  test("brend mastilo na papiru i na žutoj prolazi 4.5:1", () => {
    const ink = hexToRgb("#0e3158")!;
    expect(contrastRatio(ink, hexToRgb("#fffdf8")!)).toBeGreaterThan(4.5);
    expect(contrastRatio(ink, hexToRgb("#f4be30")!)).toBeGreaterThan(4.5);
  });

  test("tekst preko boje: taman na žutoj, svetao na mastilu", () => {
    expect(readableOn(hexToRgb("#f4be30")!)).toBe("dark");
    expect(readableOn(hexToRgb("#0e3158")!)).toBe("light");
  });
});

describe("nazivi boja", () => {
  test("osnovne boje na srpskom i engleskom", () => {
    expect(colorName([0, 0, 0], "sr")).toBe("crna");
    expect(colorName([255, 255, 255], "sr")).toBe("bela");
    expect(colorName([128, 128, 128], "sr")).toBe("siva");
    expect(colorName([220, 30, 30], "sr")).toBe("crvena");
    expect(colorName([40, 160, 60], "en")).toBe("green");
    expect(colorName(hexToRgb("#f4be30")!, "sr")).toBe("žuta");
  });

  test("tamno-, svetlo- i topli bledi tonovi", () => {
    expect(colorName(hexToRgb("#0e3158")!, "sr")).toBe("tamnoplava");
    expect(colorName(hexToRgb("#0e3158")!, "en")).toBe("dark blue");
    expect(colorName([170, 210, 250], "sr")).toBe("svetloplava");
    expect(colorName(hexToRgb("#fdeed8")!, "sr")).toBe("krem");
    expect(colorName([110, 70, 30], "sr")).toBe("braon");
    expect(colorName(hexToRgb("#8d4e3a")!, "sr")).toBe("braon");
    expect(colorName(hexToRgb("#657a92")!, "sr")).toBe("sivoplava");
    expect(colorName(hexToRgb("#657a92")!, "en")).toBe("greyish blue");
  });
});

describe("sređivanje palete", () => {
  test("skoro iste boje se spajaju, udeli se sabiraju i normalizuju", () => {
    const palette = tidyPalette([
      { rgb: [14, 49, 88], share: 0.4 },
      { rgb: [18, 52, 90], share: 0.1 },
      { rgb: [244, 190, 48], share: 0.3 },
      { rgb: [255, 253, 248], share: 0.2 },
    ]);
    expect(palette.map((color) => color.hex)).toEqual(["#0e3158", "#f4be30", "#fffdf8"]);
    expect(palette[0].share).toBeCloseTo(0.5, 5);
    expect(palette.reduce((sum, color) => sum + color.share, 0)).toBeCloseTo(1, 5);
  });

  test("boja ispod 1 % slike ne ulazi (ivice logoa, šum)", () => {
    const palette = tidyPalette([
      { rgb: [255, 255, 255], share: 0.6 },
      { rgb: [14, 49, 88], share: 0.395 },
      { rgb: [120, 200, 30], share: 0.005 },
    ]);
    expect(palette.map((color) => color.hex)).toEqual(["#ffffff", "#0e3158"]);
  });

  test("najviše `max` boja, od najzastupljenije", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ rgb: [i * 20, 255 - i * 20, 100] as const, share: i + 1 }));
    const palette = tidyPalette(many, 5);
    expect(palette).toHaveLength(5);
    expect(palette[0].share).toBeGreaterThan(palette[4].share);
  });

  test("tekst za opis i za kopiranje", () => {
    const palette = tidyPalette([
      { rgb: [14, 49, 88], share: 3 },
      { rgb: [244, 190, 48], share: 1 },
    ]);
    expect(palettePrompt(palette, "sr")).toBe("Paleta boja: tamnoplava (#0e3158), žuta (#f4be30).");
    expect(palettePrompt(palette, "en")).toBe("Colour palette: dark blue (#0e3158), yellow (#f4be30).");
    expect(paletteText(palette, "sr").split("\n")).toEqual(["#0e3158  tamnoplava  75 %", "#f4be30  žuta  25 %"]);
  });
});
