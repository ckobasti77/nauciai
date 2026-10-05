/**
 * Uklanjanje pozadine (S14, K11): ulaz modela u pravoj veličini i normalizaciji,
 * izlaz kao providnost (i kad model vraća logite), boje pozadine.
 */

import { describe, expect, test } from "vitest";

import {
  BACKGROUND_SWATCHES,
  backgroundBlurRadius,
  matteCoverage,
  matteFromOutput,
  modnetInputSize,
  modnetTensor,
  normalizeHex,
} from "./crea-matting";

describe("ulaz modela", () => {
  test("MODNet: kraća stranica 512, obe deljive sa 32, duža najviše 1024", () => {
    expect(modnetInputSize(1024, 768)).toEqual({ width: 672, height: 512 });
    expect(modnetInputSize(300, 300)).toEqual({ width: 512, height: 512 });
    const panorama = modnetInputSize(4000, 1000);
    expect(panorama.width).toBe(1024);
    expect(panorama.width % 32).toBe(0);
    expect(panorama.height % 32).toBe(0);
    expect(modnetInputSize(5000, 50).height).toBeGreaterThanOrEqual(32);
  });

  test("normalizacija MODNet-a: opseg -1..1, raspored NCHW", () => {
    const rgba = new Uint8ClampedArray([255, 0, 128, 255, 0, 255, 0, 255]);
    const m = modnetTensor(rgba, 2, 1);
    expect([...m].map((v) => Math.round(v * 100) / 100)).toEqual([1, -1, -1, 1, 0, -1]);
  });
});

describe("izlaz modela", () => {
  test("verovatnoća ide pravo u providnost", () => {
    expect([...matteFromOutput(new Float32Array([0, 0.5, 1]))]).toEqual([0, 128, 255]);
  });

  test("logiti dobijaju sigmoid (kao transformers.js)", () => {
    const alpha = matteFromOutput(new Float32Array([-8, 0, 8]));
    expect(alpha[0]).toBeLessThan(3);
    expect(alpha[1]).toBe(128);
    expect(alpha[2]).toBeGreaterThan(252);
  });

  test("pokrivenost isečka", () => {
    expect(matteCoverage(new Uint8ClampedArray([255, 0, 255, 0]))).toBeCloseTo(0.5);
    expect(matteCoverage(new Uint8ClampedArray([]))).toBe(0);
  });
});

describe("pozadina", () => {
  test("boje: brz izbor je ispravan HEX, a unos se sređuje", () => {
    for (const swatch of BACKGROUND_SWATCHES) expect(normalizeHex(swatch)).toBe(swatch);
    expect(normalizeHex("F4BE30")).toBe("#f4be30");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("plava")).toBeNull();
  });

  test("zamućenje raste sa slikom i jačinom", () => {
    expect(backgroundBlurRadius(2000, 1000, 1)).toBe(20);
    expect(backgroundBlurRadius(2000, 1000, 2)).toBe(40);
    expect(backgroundBlurRadius(100, 50, 0)).toBeGreaterThanOrEqual(2);
  });
});
