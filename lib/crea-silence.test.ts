/** Brisanje tišine (K24, A14): od verovatnoće govora do opsega za brisanje. */

import { describe, expect, test } from "vitest";

import { cutRanges, appendSource, emptyEdit, mainDuration } from "./crea-audio-edit";
import { energyProbabilities, silenceCuts, SILENCE_PRESETS, speechSegments, totalSeconds } from "./crea-silence";

const FRAME = 0.032; // Silero: 512 uzoraka na 16 kHz

/** Niz verovatnoća: [trajanje (s), vrednost]... */
function probs(...parts: Array<[number, number]>): Float32Array {
  const values: number[] = [];
  for (const [seconds, value] of parts) for (let index = 0; index < Math.round(seconds / FRAME); index++) values.push(value);
  return Float32Array.from(values);
}

describe("delovi govora", () => {
  test("histereza, rezerva oko govora i zatvaranje kratkih rupa", () => {
    const segments = speechSegments(probs([1, 0.05], [2, 0.9], [0.1, 0.1], [1, 0.8], [2, 0.02], [1, 0.7], [1, 0.02]), FRAME);
    expect(segments).toHaveLength(2);
    const [first, second] = segments as [[number, number], [number, number]];
    // Prvi deo: 1 s .. 4,1 s (rupa od 0,1 s je zatvorena), uz 0,1 s rezerve.
    expect(first[0]).toBeCloseTo(0.9, 1);
    expect(first[1]).toBeCloseTo(4.2, 1);
    expect(second[0]).toBeCloseTo(6.0, 1);
    expect(second[1]).toBeCloseTo(7.2, 1);
  });

  test("vrednost između pragova ne počinje govor, ali ga i ne prekida", () => {
    expect(speechSegments(probs([2, 0.45]), FRAME)).toEqual([]);
    const segments = speechSegments(probs([1, 0.9], [1, 0.4], [1, 0.0]), FRAME, { padS: 0 });
    expect(segments).toHaveLength(1);
    expect(segments[0]![1]).toBeCloseTo(2, 1);
  });

  test("kratak udarac (klik) nije govor", () => {
    expect(speechSegments(probs([1, 0], [0.064, 1], [1, 0]), FRAME)).toEqual([]);
  });
});

describe("opsezi za brisanje", () => {
  test("duga pauza se skrati na zadato, kratka ostaje; ivice zadrže pola", () => {
    const speech: Array<[number, number]> = [
      [2, 4],
      [4.4, 6],
      [9, 10],
    ];
    const cuts = silenceCuts(speech, 14, SILENCE_PRESETS.srednje);
    // Početak: tišina 0..2 → ostaje 0,175 s; pauza 6..9 → ostaje 0,35 s; kraj 10..14 → ostaje 0,175 s.
    expect(cuts).toEqual([
      [0, 1.825],
      [6.175, 8.825],
      [10.175, 14],
    ]);
    expect(totalSeconds(cuts)).toBeCloseTo(1.825 + 2.65 + 3.825, 3);
  });

  test("primenjeno na uređivač: pauze nestanu, govor ostane netaknut", () => {
    const speech: Array<[number, number]> = [
      [1, 3],
      [6, 8],
    ];
    const doc = appendSource(emptyEdit(), "snimak", 9);
    const cut = cutRanges(doc, silenceCuts(speech, 9, SILENCE_PRESETS.jako));
    // Ostaje: 0,1 + 2 + 0,2 + 2 + 0,1 = 4,4 s.
    expect(mainDuration(cut)).toBeCloseTo(4.4, 3);
    expect(cut.main.map((clip) => [clip.in, clip.out])).toEqual([
      [0.9, 3.1],
      [5.9, 8.1],
    ]);
  });

  test("bez govora se ne briše ništa (bolje ništa nego ceo snimak)", () => {
    expect(silenceCuts([], 30, SILENCE_PRESETS.jako)).toEqual([]);
  });

  test("blago briše manje od jakog", () => {
    const speech: Array<[number, number]> = [
      [0, 1],
      [1.6, 2.5],
      [3.5, 5],
    ];
    expect(totalSeconds(silenceCuts(speech, 5, SILENCE_PRESETS.blago))).toBeLessThan(totalSeconds(silenceCuts(speech, 5, SILENCE_PRESETS.jako)));
  });
});

describe("rezervni detektor po jačini", () => {
  test("ton u tišini sa malo šuma: govor tamo gde je ton", () => {
    const rate = 16000;
    const samples = new Float32Array(rate * 3);
    let seed = 7;
    for (let index = 0; index < samples.length; index++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      samples[index] = ((seed / 2147483648) * 2 - 1) * 0.001; // pod buke ~ −63 dB
      if (index >= rate && index < rate * 2) samples[index]! += 0.2 * Math.sin((2 * Math.PI * 220 * index) / rate);
    }
    const probabilities = energyProbabilities(samples, rate, FRAME);
    const segments = speechSegments(probabilities, FRAME, { padS: 0 });
    expect(segments).toHaveLength(1);
    expect(segments[0]![0]).toBeCloseTo(1, 1);
    expect(segments[0]![1]).toBeCloseTo(2, 1);
  });
});
