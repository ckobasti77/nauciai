/**
 * Uvećanje 2× (S16, K11): pločice pokrivaju sliku tačno jednom, ulaz modela je
 * deljiv sa 8, ivica se ponavlja, a lažni model (2× najbliži sused) kroz ceo
 * put daje tačno 2× sliku - dokaz da nema šavova ni pomeraja.
 */

import { describe, expect, test } from "vitest";

import { checkUpscale, planTiles, sampleTile, SWIN_MULTIPLE, UPSCALE_MAX_INPUT_PIXELS, upscaleTileSide, writeTile } from "./crea-upscale";

function image(width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = (i * 7) % 256;
    rgba[i * 4 + 1] = (i * 13) % 256;
    rgba[i * 4 + 2] = (i * 29) % 256;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/** „Model": svaki piksel ulaza postaje 2×2 isti piksel (NCHW → NCHW). */
function nearest2x(input: Float32Array, width: number, height: number): Float32Array {
  const plane = width * height;
  const outW = width * 2;
  const outPlane = outW * height * 2;
  const out = new Float32Array(outPlane * 3);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < height * 2; y++) {
      for (let x = 0; x < outW; x++) out[c * outPlane + y * outW + x] = input[c * plane + (y >> 1) * width + (x >> 1)];
    }
  }
  return out;
}

describe("pločice", () => {
  test("unutrašnji delovi pokrivaju sliku tačno jednom; ulaz je deljiv sa 8", () => {
    for (const [w, h, side] of [
      [300, 200, 112],
      [113, 57, 112],
      [1920, 1080, 240],
      [7, 5, 112],
    ]) {
      const hits = new Uint8Array(w * h);
      for (const tile of planTiles(w, h, side)) {
        expect(tile.input.width % SWIN_MULTIPLE).toBe(0);
        expect(tile.input.height % SWIN_MULTIPLE).toBe(0);
        expect(tile.input.x).toBeLessThanOrEqual(tile.inner.x);
        expect(tile.input.x + tile.input.width).toBeGreaterThanOrEqual(tile.inner.x + tile.inner.width);
        for (let y = tile.inner.y; y < tile.inner.y + tile.inner.height; y++) {
          for (let x = tile.inner.x; x < tile.inner.x + tile.inner.width; x++) hits[y * w + x]++;
        }
      }
      expect([...hits].every((n) => n === 1), `${w}x${h}`).toBe(true);
    }
  });

  test("uzorak van slike ponavlja ivicu", () => {
    const rgba = image(4, 3);
    const tile = sampleTile(rgba, 4, 3, { x: -2, y: -1, width: 8, height: 8 });
    const plane = 64;
    // Gornji levi ugao uzorka = piksel (0, 0); desno van slike = piksel (3, y).
    expect(tile[0]).toBeCloseTo(rgba[0] / 255);
    expect(tile[plane + 7]).toBeCloseTo(rgba[(0 * 4 + 3) * 4 + 1] / 255);
    expect(tile[2 * plane + 7 * 8]).toBeCloseTo(rgba[(2 * 4 + 0) * 4 + 2] / 255);
  });

  test("ceo put sa lažnim 2× modelom daje tačno 2× sliku, bez šavova", () => {
    const [w, h] = [53, 37];
    const rgba = image(w, h);
    const out = new Uint8ClampedArray(w * 2 * h * 2 * 4);
    for (const tile of planTiles(w, h, 16, 4)) {
      const input = sampleTile(rgba, w, h, tile.input);
      writeTile(out, w * 2, nearest2x(input, tile.input.width, tile.input.height), tile);
    }
    for (let y = 0; y < h * 2; y++) {
      for (let x = 0; x < w * 2; x++) {
        const s = ((y >> 1) * w + (x >> 1)) * 4;
        const d = (y * w * 2 + x) * 4;
        expect([out[d], out[d + 1], out[d + 2], out[d + 3]]).toEqual([rgba[s], rgba[s + 1], rgba[s + 2], 255]);
      }
    }
  });
});

describe("granice po uređaju", () => {
  test("telefon dobija manju granicu od računara, WebGPU najveću", () => {
    expect(UPSCALE_MAX_INPUT_PIXELS.weak).toBeLessThan(UPSCALE_MAX_INPUT_PIXELS.phone);
    expect(UPSCALE_MAX_INPUT_PIXELS.phone).toBeLessThan(UPSCALE_MAX_INPUT_PIXELS.desktop);
    expect(UPSCALE_MAX_INPUT_PIXELS.desktop).toBeLessThan(UPSCALE_MAX_INPUT_PIXELS["desktop-gpu"]);
    // 1920×1080 → 4K samo sa WebGPU-om.
    expect(checkUpscale(1920, 1080, "desktop-gpu")).toEqual({ ok: true });
    expect(checkUpscale(1920, 1080, "desktop").ok).toBe(false);
    expect(checkUpscale(500, 500, "phone")).toEqual({ ok: true });
    expect(checkUpscale(1024, 1024, "phone")).toEqual({ ok: false, maxPixels: 250_000, maxSide: 500 });
  });

  test("pločica je veća na WebGPU-u", () => {
    expect(upscaleTileSide("webgpu")).toBeGreaterThan(upscaleTileSide("wasm"));
    expect((upscaleTileSide("wasm") + 16) % SWIN_MULTIPLE).toBe(0);
  });
});
