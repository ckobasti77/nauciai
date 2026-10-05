/**
 * Maske izmena (K11): pikseli maske, okvir i pokrivenost, proširenje, oblik
 * koji traže Ideogram (crno = menja se) i MI-GAN (0 = briše se), isečak oko
 * predmeta, „velik predmet" i obojena zona za model bez maske.
 */

import { describe, expect, test } from "vitest";

import {
  dilateMask,
  inpaintCrop,
  isLargeObject,
  maskFromAlpha,
  maskFromConfidence,
  maskIsUsable,
  maskStats,
  miganMask,
  providerMaskRgba,
  strokeOutline,
  tintMasked,
  workSize,
  ZONE_TINT,
} from "./crea-mask";

function rectMask(width: number, height: number, rect: { x: number; y: number; w: number; h: number }) {
  const mask = new Uint8ClampedArray(width * height);
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) mask[y * width + x] = 255;
  return mask;
}

describe("maska iz piksela", () => {
  test("alfa i poverenje se seku na pragu", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 0, 9, 9, 9, 127, 9, 9, 9, 128, 1, 1, 1, 255]);
    expect([...maskFromAlpha(rgba)]).toEqual([0, 0, 255, 255]);
    expect([...maskFromConfidence(new Float32Array([0.1, 0.49, 0.5, 0.9]))]).toEqual([0, 0, 255, 255]);
  });

  test("pokrivenost i okvir; prazna maska nema okvir", () => {
    const stats = maskStats(rectMask(10, 8, { x: 2, y: 3, w: 4, h: 2 }), 10, 8);
    expect(stats.coverage).toBeCloseTo(8 / 80);
    expect(stats.box).toEqual({ x: 2, y: 3, width: 4, height: 2 });
    expect(maskStats(new Uint8ClampedArray(80), 10, 8)).toEqual({ coverage: 0, box: null });
  });

  test("upotrebljiva maska ima i označen i neoznačen deo", () => {
    expect(maskIsUsable(maskStats(new Uint8ClampedArray(100), 10, 10))).toBe(false);
    expect(maskIsUsable(maskStats(new Uint8ClampedArray(100).fill(255), 10, 10))).toBe(false);
    expect(maskIsUsable(maskStats(rectMask(10, 10, { x: 0, y: 0, w: 3, h: 3 }), 10, 10))).toBe(true);
  });
});

describe("proširenje", () => {
  test("proširenje za r piksela pravi kvadrat (2r+1) oko tačke i ne izlazi iz slike", () => {
    const mask = rectMask(9, 9, { x: 4, y: 4, w: 1, h: 1 });
    const grown = maskStats(dilateMask(mask, 9, 9, 2), 9, 9);
    expect(grown.box).toEqual({ x: 2, y: 2, width: 5, height: 5 });
    expect(grown.coverage).toBeCloseTo(25 / 81);
    const corner = maskStats(dilateMask(rectMask(9, 9, { x: 0, y: 0, w: 1, h: 1 }), 9, 9, 3), 9, 9);
    expect(corner.box).toEqual({ x: 0, y: 0, width: 4, height: 4 });
    expect(dilateMask(mask, 9, 9, 0)).toEqual(mask);
  });
});

describe("oblik za modele", () => {
  test("Ideogram: crno menja, belo čuva, neprovidno", () => {
    const rgba = providerMaskRgba(new Uint8ClampedArray([255, 0]));
    expect([...rgba]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  test("MI-GAN: 0 = popuni, 255 = ostaje", () => {
    expect([...miganMask(new Uint8ClampedArray([255, 0, 200, 10]))]).toEqual([0, 255, 0, 255]);
  });

  test("obojena zona menja samo označene piksele, ka jarkoj boji oznake", () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
    const out = tintMasked(rgba, new Uint8ClampedArray([255, 0]), ZONE_TINT, 0.5);
    expect([...out.slice(0, 4)]).toEqual([178, 50, 98, 255]);
    expect([...out.slice(4)]).toEqual([100, 100, 100, 255]);
  });
});

describe("brisanje predmeta", () => {
  test("isečak sadrži predmet sa okolinom i ostaje u slici", () => {
    const crop = inpaintCrop({ x: 900, y: 10, width: 60, height: 40 }, 1000, 800);
    expect(crop.x).toBeLessThanOrEqual(900);
    expect(crop.y).toBeLessThanOrEqual(10);
    expect(crop.x + crop.width).toBeGreaterThanOrEqual(960);
    expect(crop.y + crop.height).toBeGreaterThanOrEqual(50);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1000);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    // Najmanje 256 px okoline i za sitan predmet.
    expect(crop.width).toBeGreaterThanOrEqual(256);
    expect(crop.height).toBeGreaterThanOrEqual(256);
  });

  test("isečak ne izlazi iz male slike", () => {
    expect(inpaintCrop({ x: 10, y: 10, width: 20, height: 20 }, 120, 90)).toEqual({ x: 0, y: 0, width: 120, height: 90 });
  });

  test("velik predmet: puno označenog ili širok okvir", () => {
    const small = maskStats(rectMask(100, 100, { x: 10, y: 10, w: 10, h: 10 }), 100, 100);
    expect(isLargeObject(small, 100, 100)).toBe(false);
    const big = maskStats(rectMask(100, 100, { x: 0, y: 0, w: 50, h: 50 }), 100, 100);
    expect(isLargeObject(big, 100, 100)).toBe(true);
    // Tanka linija preko cele slike: malo piksela, ali okvir je ogroman.
    const cross = rectMask(100, 100, { x: 0, y: 0, w: 100, h: 2 });
    for (let y = 0; y < 100; y++) cross[y * 100] = cross[y * 100 + 1] = 255;
    const line = maskStats(cross, 100, 100);
    expect(isLargeObject(line, 100, 100)).toBe(true);
    expect(isLargeObject(maskStats(new Uint8ClampedArray(100), 10, 10), 10, 10)).toBe(false);
  });
});

describe("četkica i radna veličina", () => {
  test("potez je poligon oko tačaka, širok koliko je četkica", () => {
    const outline = strokeOutline(
      [
        [10, 50],
        [90, 50],
      ],
      20,
    );
    expect(outline.length).toBeGreaterThan(4);
    const ys = outline.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(15);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(25);
    expect(strokeOutline([], 10)).toEqual([]);
  });

  test("radna slika se smanjuje na 1536 po dužoj stranici, nikad ne uvećava", () => {
    expect(workSize(4000, 3000)).toEqual({ width: 1536, height: 1152, scale: 0.384 });
    expect(workSize(800, 600)).toEqual({ width: 800, height: 600, scale: 1 });
  });
});
