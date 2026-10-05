import { describe, expect, test } from "vitest";

import {
  DEFLICKER_GAIN_RANGE,
  deflickerGains,
  flickerAmount,
  FLICKER_VISIBLE,
  frameLuma,
  sceneStarts,
  smoothedLumas,
} from "./crea-deflicker";

const FPS = 30;

function corrected(lumas: number[]): number[] {
  const gains = deflickerGains(lumas, FPS);
  return lumas.map((luma, index) => luma * gains[index]!);
}

function spread(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

describe("bez treperenja", () => {
  test("svetlina piksela (Rec. 601)", () => {
    expect(frameLuma(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))).toBeCloseTo(127.5);
    expect(frameLuma(new Uint8ClampedArray([255, 0, 0, 255]))).toBeCloseTo(76.245);
    expect(frameLuma(new Uint8ClampedArray([]))).toBe(0);
  });

  test("stalna svetlina se ne menja", () => {
    const steady = Array.from({ length: 90 }, () => 120);
    expect(deflickerGains(steady, FPS).every((gain) => gain === 1)).toBe(true);
    expect(flickerAmount(steady, FPS)).toBe(0);
  });

  test("treperenje se smanjuje (naizmenično 100/120)", () => {
    const flicker = Array.from({ length: 120 }, (_, index) => (index % 2 === 0 ? 100 : 120));
    const before = spread(flicker.slice(10, -10));
    const after = spread(corrected(flicker).slice(10, -10));
    expect(after).toBeLessThan(before * 0.15);
    expect(flickerAmount(flicker, FPS)).toBeGreaterThan(FLICKER_VISIBLE);
    expect(flickerAmount(corrected(flicker), FPS)).toBeLessThan(flickerAmount(flicker, FPS) / 4);
  });

  test("nepravilno treperenje (50 Hz svetlo, uzorci na 30 kadrova)", () => {
    const flicker = Array.from({ length: 150 }, (_, index) => 110 + 12 * Math.sin((index * 2 * Math.PI * 20) / 30));
    expect(spread(corrected(flicker).slice(8, -8))).toBeLessThan(spread(flicker.slice(8, -8)) * 0.35);
  });

  test("spora promena svetla (zalazak) ostaje", () => {
    const ramp = Array.from({ length: 150 }, (_, index) => 80 + (80 * index) / 149);
    for (const gain of deflickerGains(ramp, FPS)) expect(Math.abs(gain - 1)).toBeLessThan(0.02);
  });

  test("rez između scena nije treperenje: nema talasa svetline oko reza", () => {
    const cut = [...Array.from({ length: 45 }, () => 60), ...Array.from({ length: 45 }, () => 180)];
    expect(sceneStarts(cut)).toEqual([0, 45]);
    const smooth = smoothedLumas(cut, FPS);
    expect(smooth[44]).toBe(60);
    expect(smooth[45]).toBe(180);
    expect(deflickerGains(cut, FPS).every((gain) => gain === 1)).toBe(true);
  });

  test("pojačanje je u granicama; crn kadar se ne dira", () => {
    const wild = [100, 200, 100, 200, 3, 100, 200];
    const gains = deflickerGains(wild, FPS);
    for (const gain of gains) {
      expect(gain).toBeGreaterThanOrEqual(DEFLICKER_GAIN_RANGE.min);
      expect(gain).toBeLessThanOrEqual(DEFLICKER_GAIN_RANGE.max);
    }
    expect(gains[4]).toBe(1);
  });
});
