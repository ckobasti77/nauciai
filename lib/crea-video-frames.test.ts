import { describe, expect, test } from "vitest";

import {
  averageLuma,
  frameFileName,
  frameMimeType,
  frameTimeAt,
  FRAME_PNG_MAX_PIXELS,
  lastFrameCandidates,
} from "./crea-video-frames";

describe("kadar iz videa (V4)", () => {
  test("poslednji kadar: tik pred kraj, pa po kadar unazad, nikad ispod nule", () => {
    expect(lastFrameCandidates(5, 25)).toEqual([4.999, 4.96, 4.92, 4.88]);
    const fallback = lastFrameCandidates(2, null);
    expect(fallback[0]).toBe(1.999);
    expect(fallback[1]).toBeCloseTo(2 - 1 / 30, 6);
    expect(lastFrameCandidates(0.02, 30).every((time) => time >= 0)).toBe(true);
    expect(lastFrameCandidates(0, 30)).toEqual([0]);
    expect(lastFrameCandidates(Number.NaN, 30)).toEqual([0]);
  });

  test("izabran kadar je uvek unutar klipa", () => {
    expect(frameTimeAt(10, 0)).toBe(0);
    expect(frameTimeAt(10, 0.5)).toBe(5);
    expect(frameTimeAt(10, 1)).toBeCloseTo(9.999, 6);
    expect(frameTimeAt(10, 7)).toBeCloseTo(9.999, 6);
    expect(frameTimeAt(10, -1)).toBe(0);
  });

  test("PNG za manje kadrove, JPG za velike; ime fajla", () => {
    expect(frameMimeType(1280, 720)).toBe("image/png");
    expect(frameMimeType(3840, 2160)).toBe("image/jpeg");
    expect(1920 * 1080).toBeLessThanOrEqual(FRAME_PNG_MAX_PIXELS);
    expect(frameFileName(12.44, "image/png")).toBe("kadar-12_4s.png");
    expect(frameFileName(3, "image/jpeg")).toBe("kadar-3_0s.jpg");
  });

  test("svetlina: crn kadar se prepoznaje", () => {
    expect(averageLuma(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]))).toBe(0);
    expect(averageLuma(new Uint8ClampedArray([255, 255, 255, 255]))).toBeCloseTo(255, 6);
    expect(averageLuma(new Uint8ClampedArray([]))).toBe(0);
  });
});
