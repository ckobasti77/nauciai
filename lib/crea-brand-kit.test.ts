import { describe, expect, test } from "vitest";

import {
  BRAND_COLORS_MAX,
  BRAND_FONT_INFO,
  BRAND_FONTS,
  BRAND_TONE_MAX,
  brandColorsFromPalette,
  brandPromptLine,
  brandSummary,
  cleanBrandColors,
  cleanBrandName,
  cleanBrandTone,
  isBrandFont,
} from "./crea-brand-kit";
import { CREA_SCENE_FONTS } from "./crea-editor-scene";
import type { PaletteColor } from "./crea-palette";

describe("brend kit (S38)", () => {
  test("fontovi kita su tačno fontovi editora, svaki ima opis za model", () => {
    expect([...BRAND_FONTS]).toEqual([...CREA_SCENE_FONTS]);
    for (const font of BRAND_FONTS) {
      expect(BRAND_FONT_INFO[font].style.trim()).not.toBe("");
      expect(BRAND_FONT_INFO[font].label.sr.trim()).not.toBe("");
    }
    expect(isBrandFont("lora")).toBe(true);
    expect(isBrandFont("comic-sans")).toBe(false);
  });

  test("ime: razmaci i kontrolni znakovi se sređuju, prazno i predugo se odbija", () => {
    expect(cleanBrandName("  Pekara\t  Klas \n")).toBe("Pekara Klas");
    expect(cleanBrandName("   ")).toBeNull();
    expect(cleanBrandName("x".repeat(61))).toBeNull();
    expect(cleanBrandName("Ђурђевак")).toBe("Ђурђевак");
  });

  test("boje: HEX, mala slova, bez duplikata, najviše 8", () => {
    expect(cleanBrandColors(["#FFF", "#ffffff", "0e3158"])).toEqual(["#ffffff", "#0e3158"]);
    expect(cleanBrandColors(["crvena"])).toBeNull();
    expect(cleanBrandColors(Array.from({ length: BRAND_COLORS_MAX + 1 }, (_, i) => `#00000${i}`))).toBeNull();
    expect(cleanBrandColors([])).toEqual([]);
  });

  test("ton: prazan je dozvoljen, predug nije", () => {
    expect(cleanBrandTone("  topao   i prijateljski ")).toBe("topao i prijateljski");
    expect(cleanBrandTone("")).toBe("");
    expect(cleanBrandTone("a".repeat(BRAND_TONE_MAX + 1))).toBeNull();
  });

  test("boje iz logoa: bela pozadina nije boja brenda", () => {
    const palette: PaletteColor[] = [
      { rgb: [255, 255, 255], hex: "#ffffff", share: 0.7 },
      { rgb: [200, 64, 47], hex: "#c8402f", share: 0.2 },
      { rgb: [244, 190, 48], hex: "#f4be30", share: 0.1 },
    ];
    expect(brandColorsFromPalette(palette)).toEqual(["#c8402f", "#f4be30"]);
    // Bela koja je samo detalj (malo udela) ostaje.
    expect(brandColorsFromPalette([{ rgb: [14, 49, 88], hex: "#0e3158", share: 0.9 }, { rgb: [255, 255, 255], hex: "#ffffff", share: 0.1 }])).toEqual(["#0e3158", "#ffffff"]);
  });

  test("rečenica za model: ime, boje sa nazivima, slova, ton i logo", () => {
    const line = brandPromptLine(
      { name: "Pekara Klas", colors: ["#0e3158"], fonts: { heading: "montserrat", body: "nunito" }, tone: "topao" },
      { logoImage: 3 },
    );
    expect(line).toContain('Brand: "Pekara Klas".');
    expect(line).toMatch(/\(#0e3158\)/);
    expect(line).toContain("geometric sans-serif");
    expect(line).toContain("Tone of voice: topao.");
    expect(line).toContain("Image 3 is the brand logo");
    const bare = brandPromptLine({ name: "X", colors: [], fonts: { heading: "nunito", body: "nunito" }, tone: " " });
    expect(bare).not.toContain("colours");
    expect(bare).not.toContain("Tone");
    expect(bare).not.toContain("logo");
  });

  test("sažetak sa srpskom množinom", () => {
    const kit = (n: number) => ({ name: "Klas", colors: Array.from({ length: n }, () => "#000000"), fonts: { heading: "lora" as const, body: "nunito" as const } });
    expect(brandSummary(kit(1), "sr")).toBe("Klas · 1 boja · Lora");
    expect(brandSummary(kit(3), "sr")).toBe("Klas · 3 boje · Lora");
    expect(brandSummary(kit(5), "sr")).toBe("Klas · 5 boja · Lora");
    expect(brandSummary(kit(2), "en")).toBe("Klas · 2 colours · Lora");
  });
});
