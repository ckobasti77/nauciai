import { describe, expect, test } from "vitest";

import {
  cropAxis,
  expandLayout,
  expandModelRatio,
  expandPrompt,
  ratioValue,
  REFRAME_PRESET_IDS,
  reframeCrop,
  reframePreset,
  sameAspect,
} from "./crea-reframe";

describe("preseti „za Instagram, TikTok, YouTube\"", () => {
  test("četiri formata sa tačnim odnosom i zapisom", () => {
    expect(REFRAME_PRESET_IDS).toEqual(["objava", "kvadrat", "prica", "youtube"]);
    for (const id of REFRAME_PRESET_IDS) {
      const preset = reframePreset(id);
      expect(preset.aspect, id).toBeCloseTo(ratioValue(preset.ratio), 6);
      expect(preset.size!.width / preset.size!.height, id).toBeCloseTo(preset.aspect, 2);
    }
    expect(reframePreset("prica").ratio).toBe("9:16");
    expect(reframePreset("objava").ratio).toBe("4:5");
  });
});

describe("isecanje (besplatno)", () => {
  test("najveći isečak ciljnog odnosa, u sredini", () => {
    // Položena 4000×3000 → 9:16: puna visina, širina 1688, u sredini.
    expect(reframeCrop(4000, 3000, 9 / 16)).toEqual({ x: 1156, y: 0, width: 1688, height: 3000 });
    // Uspravna 1080×1920 → 16:9: puna širina, visina 608.
    expect(reframeCrop(1080, 1920, 16 / 9)).toEqual({ x: 0, y: 656, width: 1080, height: 608 });
  });

  test("pomeranje kadra: −1 skroz levo/gore, 1 skroz desno/dole, uvek u slici", () => {
    expect(reframeCrop(4000, 3000, 1, -1).x).toBe(0);
    expect(reframeCrop(4000, 3000, 1, 1)).toEqual({ x: 1000, y: 0, width: 3000, height: 3000 });
    expect(reframeCrop(3000, 4000, 1, 1)).toEqual({ x: 0, y: 1000, width: 3000, height: 3000 });
    for (const shift of [-5, -1, -0.3, 0, 0.7, 1, 9, Number.NaN]) {
      const box = reframeCrop(1234, 777, 9 / 16, shift);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1234);
      expect(box.y + box.height).toBeLessThanOrEqual(777);
      expect(box.width / box.height).toBeCloseTo(9 / 16, 2);
    }
  });

  test("osa klizača i isti odnos", () => {
    expect(cropAxis(4000, 3000, 9 / 16)).toBe("x");
    expect(cropAxis(1080, 1920, 16 / 9)).toBe("y");
    expect(cropAxis(1080, 1080, 1)).toBeNull();
    expect(sameAspect(1080, 1350, 4 / 5)).toBe(true);
    expect(sameAspect(1080, 1300, 4 / 5)).toBe(false);
  });
});

describe("proširenje (plaćeno)", () => {
  test("odnos za model: tačan kad ga Nano Banana prima, inače najbliži", () => {
    expect(expandModelRatio(9 / 16)).toBe("9:16");
    expect(expandModelRatio(16 / 9)).toBe("16:9");
    expect(expandModelRatio(1)).toBe("1:1");
    expect(expandModelRatio(4 / 5)).toBe("2:3");
  });

  test("platno: cela fotka u sredini, doslikava se samo višak, odnos platna = odnos modela", () => {
    const tall = expandLayout(4000, 3000, "9:16");
    expect(tall.grows).toBe("vertical");
    expect(tall.canvasWidth / tall.canvasHeight).toBeCloseTo(9 / 16, 2);
    expect(Math.max(tall.canvasWidth, tall.canvasHeight)).toBeLessThanOrEqual(2048);
    expect(tall.photo.x).toBe(0);
    expect(tall.photo.width).toBe(tall.canvasWidth);
    expect(tall.photo.y).toBeGreaterThan(0);
    expect(tall.photo.y + tall.photo.height).toBeLessThanOrEqual(tall.canvasHeight);
    expect(Math.abs(tall.photo.y * 2 + tall.photo.height - tall.canvasHeight)).toBeLessThanOrEqual(1);
    // Odnos fotke se ne kvari.
    expect(tall.photo.width / tall.photo.height).toBeCloseTo(4 / 3, 2);

    const wide = expandLayout(1080, 1920, "16:9");
    expect(wide.grows).toBe("horizontal");
    expect(wide.photo.height).toBe(wide.canvasHeight);
    expect(wide.photo.x).toBeGreaterThan(0);
  });

  test("mala fotka se ne uvećava", () => {
    const small = expandLayout(400, 300, "1:1");
    expect(small.canvasWidth).toBe(400);
    expect(small.canvasHeight).toBe(400);
    expect(small.photo).toEqual({ x: 0, y: 50, width: 400, height: 300 });
  });

  test("opis kaže šta je prazno, šta ostaje isto i prima dodatak korisnika", () => {
    const sr = expandPrompt("9:16", "vertical", "više neba", "sr");
    expect(sr).toContain("9:16");
    expect(sr).toContain("iznad i ispod");
    expect(sr).toContain("ostaje potpuno isti");
    expect(sr).toContain("više neba");
    const en = expandPrompt("16:9", "horizontal", "  ", "en");
    expect(en).toContain("left and right");
    expect(en).not.toContain("In the new part");
  });
});
