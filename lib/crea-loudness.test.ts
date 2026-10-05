/**
 * Glasnoća po BS.1770-4 (K24): sintetički sinusi iz EBU Tech 3341 (minimalni
 * zahtevi za merač glasnoće) + pravi vrh, limiter i normalizacija na −14 LUFS.
 */

import { describe, expect, test } from "vitest";

import {
  applyGain,
  integratedLoudness,
  kWeightingCoefficients,
  limitPeaks,
  linearToDb,
  LOUDNESS_TARGETS,
  measureLoudness,
  normalizationGainDb,
  normalizeLoudness,
  samplePeak,
  truePeak,
} from "./crea-loudness";

const RATE = 48000;

/** Sinus od `seconds` sekundi sa vrhom `peakDb` dBFS. */
function sine(seconds: number, peakDb: number, frequency = 1000, sampleRate = RATE, phase = 0): Float32Array {
  const amplitude = Math.pow(10, peakDb / 20);
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let index = 0; index < out.length; index++) out[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate + phase);
  return out;
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const stereo = (channel: Float32Array) => [channel, channel.slice()];

describe("K-filter", () => {
  test("na 48 kHz daje koeficijente iz tabele BS.1770-4", () => {
    const { shelf, highpass } = kWeightingCoefficients(48000);
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 6);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 6);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 6);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 6);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 6);
    expect(highpass).toMatchObject({ b0: 1, b1: -2, b2: 1 });
    expect(highpass.a1).toBeCloseTo(-1.99004745483398, 6);
    expect(highpass.a2).toBeCloseTo(0.99007225036621, 6);
  });
});

describe("integrisana glasnoća (EBU Tech 3341)", () => {
  test("slučaj 1: stereo sinus 1 kHz na −23 dBFS = −23,0 LUFS", () => {
    expect(integratedLoudness(stereo(sine(20, -23)), RATE)).toBeCloseTo(-23, 1);
  });

  test("slučaj 2: stereo sinus 1 kHz na −33 dBFS = −33,0 LUFS", () => {
    expect(integratedLoudness(stereo(sine(20, -33)), RATE)).toBeCloseTo(-33, 1);
  });

  test("slučaj 3: relativna kapija - tihi delovi (−36) oko glasnog (−23, 60 s) ne spuštaju rezultat", () => {
    const signal = concat(sine(10, -36), sine(60, -23), sine(10, -36));
    expect(integratedLoudness(stereo(signal), RATE)).toBeCloseTo(-23, 1);
  });

  test("slučaj 4: apsolutna kapija - i −72 dBFS na krajevima ostaje van merenja", () => {
    const signal = concat(sine(10, -72), sine(10, -36), sine(60, -23), sine(10, -36), sine(10, -72));
    expect(integratedLoudness(stereo(signal), RATE)).toBeCloseTo(-23, 1);
  });

  test("mono sinus je 3 dB tiši od istog stereo snimka; ista vrednost na 44,1 kHz", () => {
    expect(integratedLoudness([sine(10, -23)], RATE)).toBeCloseTo(-26, 1);
    expect(integratedLoudness(stereo(sine(10, -23, 1000, 44100)), 44100)).toBeCloseTo(-23, 1);
  });

  test("tišina i snimak ispod apsolutne kapije su −∞; kratak snimak se meri kao jedan blok", () => {
    expect(integratedLoudness([new Float32Array(RATE)], RATE)).toBe(Number.NEGATIVE_INFINITY);
    expect(integratedLoudness([sine(2, -80)], RATE)).toBe(Number.NEGATIVE_INFINITY);
    expect(integratedLoudness([], RATE)).toBe(Number.NEGATIVE_INFINITY);
    expect(integratedLoudness(stereo(sine(0.3, -23)), RATE)).toBeCloseTo(-23, 0);
  });
});

describe("vrh", () => {
  test("pravi vrh nalazi vrh između uzoraka (sinus na fs/4 sa fazom 45°)", () => {
    // Svaki uzorak je na 0,707 amplitude, a pravi vrh je sama amplituda.
    const signal = sine(1, -6, RATE / 4, RATE, Math.PI / 4);
    expect(linearToDb(samplePeak([signal]))).toBeCloseTo(-9.03, 1);
    expect(Math.abs(linearToDb(truePeak([signal])) + 6)).toBeLessThan(0.3);
  });

  test("za sinus od 1 kHz pravi vrh = vrh uzoraka", () => {
    const measure = measureLoudness(stereo(sine(2, -6)), RATE);
    expect(measure.samplePeakDb).toBeCloseTo(-6, 2);
    expect(Math.abs(measure.truePeakDb + 6)).toBeLessThan(0.05);
    expect(measure.durationS).toBe(2);
  });
});

describe("limiter i normalizacija", () => {
  test("limiter drži vrh ispod plafona, a tihe delove ne dira", () => {
    const signal = concat(sine(1, -20), sine(0.5, 0), sine(1, -20));
    const [limited] = limitPeaks([signal], RATE, { ceilingDb: -3 });
    expect(samplePeak([limited!])).toBeLessThanOrEqual(Math.pow(10, -3 / 20) + 1e-6);
    // Pola sekunde pre glasnog dela (dalje od pogleda unapred) je netaknuto.
    const quiet = limited!.subarray(0, Math.round(0.5 * RATE));
    expect(Array.from(quiet)).toEqual(Array.from(signal.subarray(0, quiet.length)));
    // Snimak ispod plafona izlazi isti.
    const soft = sine(1, -10);
    expect(Array.from(limitPeaks([soft], RATE, { ceilingDb: -1 })[0]!)).toEqual(Array.from(soft));
  });

  test("pojačanje do cilja: tišina se ne dira, pojačanje ima granicu", () => {
    expect(normalizationGainDb(-23, LOUDNESS_TARGETS.mreze)).toBe(9);
    expect(normalizationGainDb(-10, LOUDNESS_TARGETS.mreze)).toBe(-4);
    expect(normalizationGainDb(Number.NEGATIVE_INFINITY, -14)).toBe(0);
    expect(normalizationGainDb(-60, -14)).toBe(24);
    const louder = applyGain([sine(1, -20)], 6);
    expect(linearToDb(samplePeak(louder))).toBeCloseTo(-14, 2);
  });

  test("tih govor (−30 LUFS) postaje −14 LUFS za mreže, a pravi vrh ostaje ispod −1 dB", () => {
    // „Govor": ton sa jakim vrhovima (crest faktor) i pauzama.
    const parts: Float32Array[] = [];
    for (let index = 0; index < 8; index++) {
      const word = sine(0.6, -20, 220 + index * 30);
      for (let at = 0; at < word.length; at += 12000) word[at] = 0.4; // kratki udari (suglasnici)
      parts.push(word, new Float32Array(Math.round(0.3 * RATE)));
    }
    const voice = stereo(applyGain([concat(...parts)], -8)[0]!);
    const result = normalizeLoudness(voice, RATE, LOUDNESS_TARGETS.mreze);
    expect(result.before.integratedLufs).toBeLessThan(-25);
    expect(result.after.integratedLufs).toBeCloseTo(-14, 0);
    expect(Math.abs(result.after.integratedLufs + 14)).toBeLessThan(0.3);
    expect(result.after.truePeakDb).toBeLessThanOrEqual(-1);
    expect(result.gainDb).toBeGreaterThan(10);
  });

  test("preglasan snimak se stiša na −16 za podkast; tišina ostaje tišina", () => {
    const loud = stereo(sine(10, -3));
    const result = normalizeLoudness(loud, RATE, LOUDNESS_TARGETS.podkast);
    expect(result.after.integratedLufs).toBeCloseTo(-16, 1);
    expect(result.gainDb).toBeLessThan(0);
    const silent = normalizeLoudness([new Float32Array(RATE)], RATE, -14);
    expect(silent.gainDb).toBe(0);
    expect(silent.after.integratedLufs).toBe(Number.NEGATIVE_INFINITY);
  });
});
