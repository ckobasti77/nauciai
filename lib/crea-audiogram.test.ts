/** Audiogram (K24, A20): raspored kadra i nivoi talasa po kadru. */

import { describe, expect, test } from "vitest";

import { AUDIOGRAM_ASPECTS, AUDIOGRAM_BARS, AUDIOGRAM_FPS, AUDIOGRAM_WAVES, audiogramLayout, insideFrame, overlaps, waveAt, waveFrames } from "./crea-audiogram";

describe("raspored", () => {
  test("svaki oblik i talas: sve je u kadru, ništa se ne preklapa (osim prstena oko slike)", () => {
    for (const aspect of AUDIOGRAM_ASPECTS) {
      for (const wave of AUDIOGRAM_WAVES) {
        for (const withTitle of [true, false]) {
          const layout = audiogramLayout(aspect, wave, withTitle);
          const where = `${aspect}/${wave}/${withTitle}`;
          const rects = [layout.image, layout.wave, layout.captions, ...(layout.title ? [layout.title] : [])];
          for (const rect of rects) expect(insideFrame(rect), where).toBe(true);
          expect(overlaps(layout.image, layout.captions), where).toBe(false);
          expect(overlaps(layout.wave, layout.captions), where).toBe(false);
          if (layout.title) {
            expect(overlaps(layout.title, layout.image), where).toBe(false);
            expect(overlaps(layout.title, layout.wave), where).toBe(false);
          }
          if (wave === "krug") {
            // Prsten obavija sliku sa svih strana.
            expect(layout.wave.x).toBeLessThan(layout.image.x);
            expect(layout.wave.x + layout.wave.w).toBeGreaterThan(layout.image.x + layout.image.w);
          } else {
            expect(overlaps(layout.wave, layout.image), where).toBe(false);
          }
          expect(layout.title === null).toBe(!withTitle);
        }
      }
    }
  });

  test("slika je kvadrat u pikselima u svakom obliku", () => {
    const ratios = { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 } as const;
    for (const aspect of AUDIOGRAM_ASPECTS) {
      const { image } = audiogramLayout(aspect, "stubici", true);
      expect((image.w * ratios[aspect]) / image.h, aspect).toBeCloseTo(1, 6);
    }
  });
});

describe("nivoi talasa", () => {
  const rate = 8000;
  function signal(): Float32Array {
    // 1 s tišine, 1 s tona, 1 s tiše.
    const samples = new Float32Array(rate * 3);
    for (let index = rate; index < rate * 2; index++) samples[index] = 0.5 * Math.sin((2 * Math.PI * 200 * index) / rate);
    for (let index = rate * 2; index < rate * 3; index++) samples[index] = 0.05 * Math.sin((2 * Math.PI * 200 * index) / rate);
    return samples;
  }

  test("jedan red nivoa po kadru, vrednosti 0..1", () => {
    const { levels, frames } = waveFrames(signal(), rate, AUDIOGRAM_FPS, AUDIOGRAM_BARS);
    expect(frames).toBe(90);
    expect(levels.length).toBe(90 * AUDIOGRAM_BARS);
    for (const value of levels) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test("glasno je više od tihog, tišina je nula; posle tona talas pada postepeno", () => {
    const { levels } = waveFrames(signal(), rate, AUDIOGRAM_FPS, AUDIOGRAM_BARS);
    const mean = (frame: number) => waveAt(levels, AUDIOGRAM_BARS, frame).reduce((sum, value) => sum + value, 0) / AUDIOGRAM_BARS;
    expect(mean(5)).toBe(0);
    expect(mean(45)).toBeGreaterThan(0.9);
    expect(mean(80)).toBeLessThan(mean(45));
    expect(mean(80)).toBeGreaterThan(0);
    // Kadar van opsega se drži ivice.
    expect(waveAt(levels, AUDIOGRAM_BARS, 999)).toEqual(waveAt(levels, AUDIOGRAM_BARS, 89));
  });

  test("tih i glasan snimak popune istu visinu (normalizacija)", () => {
    const loud = signal();
    const quiet = loud.map((value) => value * 0.1);
    const peak = (samples: Float32Array) => Math.max(...waveFrames(samples, rate, AUDIOGRAM_FPS, 8).levels);
    expect(peak(quiet)).toBeCloseTo(peak(loud), 1);
  });
});
