/**
 * Ken Burns (K19, V24/V29): prozor slike je UVEK ceo unutar slike - ivica se
 * nikad ne vidi, ni za uspravan kadar preko položene fotke ni obrnuto.
 */
import { describe, expect, test } from "vitest";

import {
  clampKenBurns,
  coverWindow,
  kenBurnsForIndex,
  kenBurnsWindow,
  KEN_BURNS_PRESETS,
  KEN_BURNS_PRESET_IDS,
  scaleKenBurns,
  sliceKenBurns,
  type CropWindow,
} from "./crea-ken-burns";

const ASPECTS = [9 / 16, 4 / 5, 1, 4 / 3, 16 / 9, 3 / 1, 1 / 3];

function inside(window: CropWindow): boolean {
  const eps = 1e-9;
  return window.x >= -eps && window.y >= -eps && window.x + window.w <= 1 + eps && window.y + window.h <= 1 + eps;
}

describe("Ken Burns", () => {
  test("ivica slike se nikad ne vidi (svi preseti, odnosi, jačine i trenuci)", () => {
    for (const id of KEN_BURNS_PRESET_IDS) {
      for (const strength of [0.5, 1, 1.6, 3]) {
        const kb = scaleKenBurns(KEN_BURNS_PRESETS[id], strength);
        for (const imageAspect of ASPECTS) {
          for (const frameAspect of [9 / 16, 1, 16 / 9, 4 / 5]) {
            for (let step = 0; step <= 40; step++) {
              const window = kenBurnsWindow(kb, step / 40, imageAspect, frameAspect);
              expect(inside(window), `${id} ${strength} ${imageAspect} ${frameAspect} ${step}`).toBe(true);
              // Prozor ima oblik kadra.
              expect((window.w * imageAspect) / window.h).toBeCloseTo(frameAspect, 6);
            }
          }
        }
      }
    }
  });

  test("bez zuma prozor je isečak „cover\" iz sredine; zum ga smanjuje", () => {
    expect(coverWindow(16 / 9, 9 / 16)).toMatchObject({ y: 0, h: 1 });
    expect(coverWindow(16 / 9, 9 / 16).x).toBeCloseTo((1 - (9 / 16) / (16 / 9)) / 2, 9);
    expect(coverWindow(1, 1)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    const zoomed = kenBurnsWindow(KEN_BURNS_PRESETS.pribli, 1, 1, 1);
    expect(zoomed.w).toBeCloseTo(1 / 1.25, 9);
    expect(zoomed.x + zoomed.w / 2).toBeCloseTo(0.5, 9);
  });

  test("vožnja s leva na desno ide od leve do desne ivice", () => {
    const start = kenBurnsWindow(KEN_BURNS_PRESETS["levo-desno"], 0, 16 / 9, 9 / 16);
    const end = kenBurnsWindow(KEN_BURNS_PRESETS["levo-desno"], 1, 16 / 9, 9 / 16);
    expect(start.x).toBeCloseTo(0, 9);
    expect(end.x + end.w).toBeCloseTo(1, 9);
  });

  test("granice, jačina, deo trajanja i naizmenični pokreti", () => {
    expect(clampKenBurns({ from: { zoom: 9, x: 5, y: -5 }, to: { zoom: 0, x: Number.NaN, y: 0 } })).toEqual({
      from: { zoom: 2, x: 1, y: -1 },
      to: { zoom: 1, x: -1, y: 0 },
    });
    expect(scaleKenBurns(KEN_BURNS_PRESETS.pribli, 0).to.zoom).toBe(1);
    const half = sliceKenBurns(KEN_BURNS_PRESETS.pribli, 0.5, 1);
    expect(half.from.zoom).toBeCloseTo(1.125, 9);
    expect(half.to.zoom).toBeCloseTo(1.25, 9);
    expect(kenBurnsForIndex(0)).not.toEqual(kenBurnsForIndex(1));
    expect(kenBurnsForIndex(-1)).toEqual(kenBurnsForIndex(5));
  });
});
