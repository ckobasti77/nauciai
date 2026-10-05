import { describe, expect, test } from "vitest";

import { analyzeVoice, downsample, frameLevels, meterLevel } from "./crea-voice-check";

const RATE = 16000;

/** Deterministički šum (LCG) zadate jačine. */
function noise(seconds: number, amplitude: number, seed = 7): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  let state = seed;
  for (let index = 0; index < out.length; index++) {
    state = (state * 1103515245 + 12345) % 2147483648;
    out[index] = amplitude * ((state / 2147483648) * 2 - 1);
  }
  return out;
}

/** „Govor": ton koji traje 0,7 s pa 0,3 s pauze, preko pozadinske buke. */
function speech(seconds: number, amplitude: number, noiseAmplitude: number): Float32Array {
  const out = noise(seconds, noiseAmplitude);
  for (let index = 0; index < out.length; index++) {
    const t = index / RATE;
    if (t % 1 < 0.7) out[index] = out[index]! + amplitude * Math.sin(2 * Math.PI * 180 * t);
  }
  return out;
}

describe("provera snimka glasa (A7, VAD po jačini)", () => {
  test("čist govor u tihoj sobi prolazi", () => {
    const check = analyzeVoice(speech(12, 0.3, 0.001), RATE, 6);
    expect(check.verdict).toBe("ok");
    expect(check.speechS).toBeGreaterThan(7);
    expect(check.speechS).toBeLessThan(9.5);
    expect(check.snrDb).toBeGreaterThan(15);
    expect(check.durationS).toBe(12);
  });

  test("tišina, buka, pretiho, preglasno, prekratko", () => {
    expect(analyzeVoice(new Float32Array(RATE * 5), RATE, 6).verdict).toBe("tisina");
    expect(analyzeVoice(noise(5, 0.0005), RATE, 6).verdict).toBe("tisina");
    expect(analyzeVoice(speech(12, 0.3, 0.05), RATE, 6).verdict).toBe("bucno");
    expect(analyzeVoice(speech(12, 0.01, 0.0001), RATE, 6).verdict).toBe("tiho");
    // Preglasan mikrofon: talas se seče na ±1.
    const clipped = speech(12, 1.6, 0.001).map((value) => Math.max(-1, Math.min(1, value)));
    expect(analyzeVoice(clipped, RATE, 6).verdict).toBe("preglasno");
    expect(analyzeVoice(speech(3, 0.3, 0.001), RATE, 6).verdict).toBe("prekratko");
  });

  test("merač i jačina okvira", () => {
    expect(meterLevel(new Float32Array(256))).toBe(0);
    expect(meterLevel(new Float32Array(256).fill(1))).toBe(1);
    expect(meterLevel(new Float32Array(256).fill(0.1))).toBeCloseTo(40 / 60, 2);
    expect(frameLevels(new Float32Array(RATE).fill(0.5), RATE)).toHaveLength(33);
  });

  test("spuštanje frekvencije: dužina i prosek", () => {
    const out = downsample(new Float32Array([1, 1, 0, 0, 0.5, 0.5]), 48000, 24000);
    expect(Array.from(out)).toEqual([1, 0, 0.5]);
    const same = new Float32Array(4);
    expect(downsample(same, 16000, 16000)).toBe(same);
  });
});
