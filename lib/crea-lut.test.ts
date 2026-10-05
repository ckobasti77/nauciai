/**
 * Boje i svetlo (S17, K11): neutralno je tačno identitet, klizači rade u
 * dobrom smeru, izgledi menjaju sliku, a 3D tabela ima raspored koji čita
 * `postprocessing` (`LookupTexture`).
 */

import { describe, expect, test } from "vitest";

import {
  ADJUST_SLIDERS,
  buildLutData,
  combinedAdjust,
  CREA_LOOKS,
  gradeColor,
  isNeutralGrade,
  lookById,
  NEUTRAL_ADJUST,
  screenEffects,
  type CreaColorAdjust,
  type RGB,
} from "./crea-lut";

const original = lookById("original");
const with_ = (patch: Partial<CreaColorAdjust>) => ({ ...NEUTRAL_ADJUST, ...patch });
const SAMPLES: RGB[] = [
  [0, 0, 0],
  [1, 1, 1],
  [0.5, 0.5, 0.5],
  [0.8, 0.3, 0.1],
  [0.1, 0.4, 0.9],
];
const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe("klizači", () => {
  test("neutralno je identitet", () => {
    for (const color of SAMPLES) expect(gradeColor(color, NEUTRAL_ADJUST, original)).toEqual(color);
    expect(isNeutralGrade(NEUTRAL_ADJUST, original)).toBe(true);
    expect(isNeutralGrade(with_({ contrast: 5 }), original)).toBe(false);
    expect(isNeutralGrade(NEUTRAL_ADJUST, lookById("noar"))).toBe(false);
    expect(isNeutralGrade(NEUTRAL_ADJUST, lookById("noar"), 0)).toBe(true);
  });

  test("svetlo podiže i spušta, crna i bela ostaju krajevi", () => {
    const mid: RGB = [0.4, 0.4, 0.4];
    expect(gradeColor(mid, with_({ exposure: 50 }), original)[0]).toBeGreaterThan(0.4);
    expect(gradeColor(mid, with_({ exposure: -50 }), original)[0]).toBeLessThan(0.4);
    expect(gradeColor([0, 0, 0], with_({ exposure: 100 }), original)).toEqual([0, 0, 0]);
    expect(gradeColor([1, 1, 1], with_({ exposure: 100 }), original)).toEqual([1, 1, 1]);
  });

  test("kontrast razmiče od sredine, a sredina stoji", () => {
    expect(gradeColor([0.8, 0.8, 0.8], with_({ contrast: 50 }), original)[0]).toBeGreaterThan(0.8);
    expect(gradeColor([0.2, 0.2, 0.2], with_({ contrast: 50 }), original)[0]).toBeLessThan(0.2);
    expect(gradeColor([0.5, 0.5, 0.5], with_({ contrast: 80 }), original)[0]).toBeCloseTo(0.5);
  });

  test("zasićenost -100 daje sivo, +100 jače boje", () => {
    const [r, g, b] = gradeColor([0.8, 0.3, 0.1], with_({ saturation: -100 }), original);
    expect(r).toBeCloseTo(g);
    expect(g).toBeCloseTo(b);
    const vivid = gradeColor([0.6, 0.4, 0.3], with_({ saturation: 100 }), original);
    expect(vivid[0] - vivid[2]).toBeGreaterThan(0.3);
  });

  test("toplina dodaje crvenu i oduzima plavu; nijansa ide ka magenti", () => {
    const warm = gradeColor([0.5, 0.5, 0.5], with_({ warmth: 100 }), original);
    expect(warm[0]).toBeGreaterThan(0.5);
    expect(warm[2]).toBeLessThan(0.5);
    const magenta = gradeColor([0.5, 0.5, 0.5], with_({ tint: 100 }), original);
    expect(magenta[1]).toBeLessThan(0.5);
    expect(magenta[0]).toBeGreaterThan(0.5);
  });

  test("senke podižu tamno, a svetli delovi ne diraju crno", () => {
    expect(gradeColor([0.1, 0.1, 0.1], with_({ shadows: 100 }), original)[0]).toBeGreaterThan(0.2);
    expect(gradeColor([0, 0, 0], with_({ highlights: -100 }), original)).toEqual([0, 0, 0]);
    expect(gradeColor([0.9, 0.9, 0.9], with_({ highlights: -100 }), original)[0]).toBeLessThan(0.75);
  });

  test("izbledi podiže crnu (mat izgled)", () => {
    expect(gradeColor([0, 0, 0], with_({ fade: 100 }), original)[0]).toBeGreaterThan(0.15);
  });

  test("izlaz je uvek u opsegu 0..1", () => {
    const extreme = with_({ exposure: 100, contrast: 100, saturation: 100, warmth: 100, shadows: 100, fade: 100 });
    for (const look of CREA_LOOKS) {
      for (const color of SAMPLES) {
        for (const v of gradeColor(color, extreme, look)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("izgledi", () => {
  test("id-jevi su jedinstveni, imaju sr/en naziv, i svaki osim prvog menja sliku", () => {
    expect(new Set(CREA_LOOKS.map((look) => look.id)).size).toBe(CREA_LOOKS.length);
    expect(CREA_LOOKS.length).toBeGreaterThanOrEqual(8);
    for (const look of CREA_LOOKS) {
      expect(look.label.sr.length).toBeGreaterThan(0);
      expect(look.label.en.length).toBeGreaterThan(0);
      if (look.id === "original") continue;
      const changed = SAMPLES.some((color) => gradeColor(color, NEUTRAL_ADJUST, look).some((v, i) => Math.abs(v - color[i]) > 0.01));
      expect(changed, look.id).toBe(true);
    }
    expect(lookById("nepostoji").id).toBe("original");
  });

  test("crno-belo je bez boje; stara fotka je toplo tonirana", () => {
    const [r, g, b] = gradeColor([0.8, 0.3, 0.1], NEUTRAL_ADJUST, lookById("crno-belo"));
    expect(r).toBeCloseTo(g);
    expect(g).toBeCloseTo(b);
    const sepia = gradeColor([0.5, 0.5, 0.5], NEUTRAL_ADJUST, lookById("stara-fotka"));
    expect(sepia[0]).toBeGreaterThan(sepia[2]);
  });

  test("jačina 0 je original, 1 pun izgled", () => {
    const noir = lookById("noar");
    const color: RGB = [0.8, 0.3, 0.1];
    expect(gradeColor(color, NEUTRAL_ADJUST, noir, 0)).toEqual(color);
    const half = gradeColor(color, NEUTRAL_ADJUST, noir, 0.5);
    const full = gradeColor(color, NEUTRAL_ADJUST, noir, 1);
    expect(half[0]).toBeCloseTo((color[0] + full[0]) / 2);
  });

  test("izgled se sabira sa klizačima i ne izlazi iz opsega klizača", () => {
    const sum = combinedAdjust(with_({ contrast: 90, vignette: 90 }), lookById("noar"));
    expect(sum.contrast).toBe(100);
    expect(sum.vignette).toBe(100);
    for (const slider of ADJUST_SLIDERS) expect(sum[slider.key]).toBeGreaterThanOrEqual(slider.min);
    expect(screenEffects(NEUTRAL_ADJUST, lookById("noar"))).toEqual({ vignette: 0.55, grain: 0.2 });
    expect(screenEffects(NEUTRAL_ADJUST, lookById("noar"), 0)).toEqual({ vignette: 0, grain: 0 });
  });
});

describe("3D tabela", () => {
  test("neutralna tabela je identitet u rasporedu r + g·n + b·n²", () => {
    const size = 5;
    const data = buildLutData(NEUTRAL_ADJUST, original, 1, size);
    expect(data.length).toBe(size ** 3 * 4);
    const at = (r: number, g: number, b: number) => [...data.slice((r + g * size + b * size * size) * 4, (r + g * size + b * size * size) * 4 + 4)];
    expect(at(0, 0, 0)).toEqual([0, 0, 0, 1]);
    expect(at(4, 0, 0)).toEqual([1, 0, 0, 1]);
    expect(at(0, 4, 0)).toEqual([0, 1, 0, 1]);
    expect(at(0, 0, 4)).toEqual([0, 0, 1, 1]);
    expect(at(2, 1, 3)).toEqual([0.5, 0.25, 0.75, 1]);
  });

  test("tabela izgleda je ista kao boja kroz `gradeColor`", () => {
    const size = 9;
    const look = lookById("bioskop");
    const adjust = with_({ warmth: 20 });
    const data = buildLutData(adjust, look, 0.8, size);
    const i = (8 + 4 * size + 2 * size * size) * 4;
    const expected = gradeColor([1, 0.5, 0.25], adjust, look, 0.8);
    expect(data[i]).toBeCloseTo(expected[0]);
    expect(data[i + 1]).toBeCloseTo(expected[1]);
    expect(data[i + 2]).toBeCloseTo(expected[2]);
  });

  test("svetlija tabela čuva redosled svetline (bez preokreta tonova)", () => {
    const size = 17;
    const data = buildLutData(with_({ exposure: 40, contrast: 30 }), lookById("leto"), 1, size);
    let previous = -1;
    for (let v = 0; v < size; v++) {
      const i = (v + v * size + v * size * size) * 4;
      const l = luma([data[i], data[i + 1], data[i + 2]]);
      expect(l).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = l;
    }
  });
});
