/**
 * Ritam i tonalitet (K24, A19): tonalitet iz hrome (i pravim `meyda` nad
 * sintetičkim akordima), imena na srpskom, Camelot, markeri udaraca i fajlovi markera.
 */

import Meyda from "meyda";
import { describe, expect, test } from "vitest";

import {
  audacityLabels,
  averageChroma,
  beatMarkers,
  camelot,
  detectKey,
  keyConfidence,
  keyName,
  keySymbol,
  markersCsv,
  type MusicalKey,
} from "./crea-key";

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const rotate = (profile: number[], tonic: number) => profile.map((_, index) => profile[(index - tonic + 12) % 12]!);

describe("tonalitet iz hrome", () => {
  test("svaki od 24 tonaliteta se prepoznaje iz svog profila", () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      expect(detectKey(rotate(MAJOR, tonic))).toMatchObject({ tonic, mode: "dur" });
      expect(detectKey(rotate(MINOR, tonic))).toMatchObject({ tonic, mode: "mol" });
    }
  });

  test("tišina ili pogrešna dužina = nema tonaliteta", () => {
    expect(detectKey(new Array(12).fill(0))).toBeNull();
    expect(detectKey([1, 2, 3])).toBeNull();
  });

  test("pravi meyda: akordi C - F - G - C (sinusi) daju C-dur", () => {
    const rate = 44100;
    const size = 4096;
    Meyda.bufferSize = size;
    Meyda.sampleRate = rate;
    const chords = [
      [261.63, 329.63, 392.0],
      [349.23, 440.0, 523.25],
      [392.0, 493.88, 587.33],
      [261.63, 329.63, 392.0],
    ];
    const frames: number[][] = [];
    for (const chord of chords) {
      for (let frame = 0; frame < 4; frame++) {
        const signal = new Float32Array(size);
        for (let index = 0; index < size; index++) {
          const t = (frame * size + index) / rate;
          for (const frequency of chord) signal[index]! += 0.2 * Math.sin(2 * Math.PI * frequency * t);
        }
        frames.push(Meyda.extract("chroma", signal) as unknown as number[]);
      }
    }
    const guess = detectKey(averageChroma(frames));
    expect(guess).toMatchObject({ tonic: 0, mode: "dur" });
    expect(keyName(guess!, "sr")).toBe("C-dur");
  });

  test("prosek hrome preskače prazne okvire i normalizuje zbir na 1", () => {
    const average = averageChroma([new Array(12).fill(0), [2, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0]]);
    expect(average[0]).toBeCloseTo(0.5);
    expect(average[7]).toBeCloseTo(0.5);
    expect(average.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  test("sigurnost procene rečima", () => {
    const sure = detectKey(rotate(MAJOR, 7))!;
    expect(keyConfidence(sure)).toBe("sigurno");
    expect(keyConfidence({ ...sure, score: 0.4, margin: 0 })).toBe("nesigurno");
  });
});

describe("imena tonaliteta", () => {
  const key = (tonic: number, mode: MusicalKey["mode"]): MusicalKey => ({ tonic, mode });

  test("srpska (nemačka) imena: B je si bemol, H je si", () => {
    expect(keyName(key(0, "dur"), "sr")).toBe("C-dur");
    expect(keyName(key(9, "mol"), "sr")).toBe("a-mol");
    expect(keyName(key(10, "dur"), "sr")).toBe("B-dur");
    expect(keyName(key(11, "dur"), "sr")).toBe("H-dur");
    expect(keyName(key(6, "mol"), "sr")).toBe("fis-mol");
    expect(keyName(key(3, "dur"), "sr")).toBe("Es-dur");
    expect(keyName(key(6, "mol"), "en")).toBe("F# minor");
    expect(keyName(key(10, "dur"), "en")).toBe("Bb major");
  });

  test("oznake akorda i Camelot točak", () => {
    expect(keySymbol(key(0, "dur"))).toBe("C");
    expect(keySymbol(key(9, "mol"))).toBe("Am");
    expect(keySymbol(key(1, "mol"))).toBe("C#m");
    expect(camelot(key(0, "dur"))).toBe("8B");
    expect(camelot(key(9, "mol"))).toBe("8A");
    expect(camelot(key(7, "dur"))).toBe("9B");
    expect(camelot(key(5, "dur"))).toBe("7B");
    expect(camelot(key(11, "dur"))).toBe("1B");
    expect(camelot(key(1, "dur"))).toBe("3B");
    expect(camelot(key(2, "mol"))).toBe("7A");
    expect(camelot(key(8, "mol"))).toBe("1A");
    // Svih 24 je različito.
    const all = new Set<string>();
    for (let tonic = 0; tonic < 12; tonic++) for (const mode of ["dur", "mol"] as const) all.add(camelot(key(tonic, mode)));
    expect(all.size).toBe(24);
  });
});

describe("markeri udaraca", () => {
  test("120 BPM od 0,5 s: udarac na svakih 0,5 s, takt 1 počinje na prvom naglasku", () => {
    const markers = beatMarkers(120, 1.25, 4);
    expect(markers.map((marker) => marker.t)).toEqual([0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75]);
    expect(markers[2]).toEqual({ t: 1.25, bar: 1, beat: 1, downbeat: true });
    expect(markers[1]).toMatchObject({ bar: 0, beat: 4 });
    expect(markers[6]).toMatchObject({ bar: 2, beat: 1, downbeat: true });
    expect(beatMarkers(0, 0, 10)).toEqual([]);
    expect(beatMarkers(120, 0, 0)).toEqual([]);
  });

  test("Audacity oznake i CSV", () => {
    const markers = beatMarkers(120, 0, 1.2);
    expect(audacityLabels(markers)).toBe("0.000000\t0.000000\t1.1\n0.500000\t0.500000\t1.2\n1.000000\t1.000000\t1.3\n");
    expect(audacityLabels(markers, true)).toBe("0.000000\t0.000000\t1.1\n");
    expect(markersCsv(markers, "sr")).toBe("vreme_s,takt,udarac,naglasak\n0.000,1,1,1\n0.500,1,2,0\n1.000,1,3,0\n");
  });
});
