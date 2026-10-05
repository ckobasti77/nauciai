/** Efekti uređivača (K24): proceduralni odjek i eho, rep posle kraja. */

import { describe, expect, test } from "vitest";

import { COMPRESSOR_SETTINGS, echoTailS, impulseResponse } from "./crea-audio-fx";

const energy = (channel: Float32Array, from = 0, to = channel.length) => {
  let sum = 0;
  for (let index = from; index < to; index++) sum += channel[index]! * channel[index]!;
  return sum;
};

describe("odjek", () => {
  test("dužina prati veličinu prostora; isti preset = isti odziv (deterministički)", () => {
    const rate = 16000;
    const room = impulseResponse("soba", rate);
    const hall = impulseResponse("katedrala", rate);
    expect(room[0].length).toBeLessThan(hall[0].length);
    expect(hall[0].length).toBe(Math.ceil((4 + 0.04) * rate));
    expect(Array.from(impulseResponse("soba", rate)[0])).toEqual(Array.from(room[0]));
    // Levo i desno nisu isti (širina).
    expect(Array.from(room[0])).not.toEqual(Array.from(room[1]));
  });

  test("rep opada: prva četvrtina ima mnogo više energije od poslednje", () => {
    const [left] = impulseResponse("sala", 16000);
    const quarter = Math.floor(left.length / 4);
    expect(energy(left, 0, quarter)).toBeGreaterThan(energy(left, left.length - quarter) * 100);
  });

  test("eho: ponavljanja na razmaku, sve tiša, naizmenično levo-desno", () => {
    const rate = 1000;
    const [left, right] = impulseResponse("eho", rate);
    expect(left[320]).toBeCloseTo(0.8, 5);
    expect(right[640]).toBeCloseTo(0.8 * 0.45, 5);
    expect(left[640]).toBeLessThan(right[640]!);
    expect(left[960]!).toBeLessThan(left[320]!);
  });

  test("rep posle kraja i kompresori", () => {
    expect(echoTailS("off")).toBe(0);
    expect(echoTailS("katedrala")).toBe(4);
    expect(echoTailS("eho")).toBeCloseTo(1.92, 5);
    expect(COMPRESSOR_SETTINGS.jak.ratio).toBeGreaterThan(COMPRESSOR_SETTINGS.blag.ratio);
  });
});
