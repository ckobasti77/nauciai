import type { Locale, LocalizedText } from "./i18n";

/**
 * Ritam i tonalitet (Crea K24, A19): čista logika. Hromu (12 polutonova) po okviru
 * računa `meyda` na uređaju, a BPM `web-audio-beat-detector` (oba u alatu); ovde je
 * izbor tonaliteta (Krumhansl-Kessler profili), imena, Camelot oznaka za DJ-eve i
 * markeri udaraca za montažu.
 */

export type KeyMode = "dur" | "mol";
export type MusicalKey = { tonic: number; mode: KeyMode };
export type KeyGuess = MusicalKey & {
  /** Korelacija najboljeg tonaliteta (−1..1). */
  score: number;
  /** Koliko je najbolji ispred drugog (0..1, veće = sigurnije). */
  margin: number;
  /** Paralelni ili relativni tonalitet koji je bio odmah iza (često zbunjuje i ljude). */
  runnerUp: MusicalKey;
};

/** Krumhansl-Kessler profili (C = indeks 0). */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: ArrayLike<number>, b: ArrayLike<number>, shift: number): number {
  let meanA = 0;
  let meanB = 0;
  for (let index = 0; index < 12; index++) {
    meanA += a[index]!;
    meanB += b[index]!;
  }
  meanA /= 12;
  meanB /= 12;
  let top = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < 12; index++) {
    const x = a[(index + shift) % 12]! - meanA;
    const y = b[index]! - meanB;
    top += x * y;
    left += x * x;
    right += y * y;
  }
  return left > 0 && right > 0 ? top / Math.sqrt(left * right) : 0;
}

/** Tonalitet iz prosečne hrome; bez ikakvog tona (tišina, čist bubanj) = `null`. */
export function detectKey(chroma: ArrayLike<number>): KeyGuess | null {
  if (chroma.length !== 12) return null;
  let energy = 0;
  for (let index = 0; index < 12; index++) energy += Math.max(0, chroma[index]!);
  if (!(energy > 0)) return null;
  const scored: Array<MusicalKey & { score: number }> = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    scored.push({ tonic, mode: "dur", score: correlation(chroma, MAJOR_PROFILE, tonic) });
    scored.push({ tonic, mode: "mol", score: correlation(chroma, MINOR_PROFILE, tonic) });
  }
  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored as [MusicalKey & { score: number }, MusicalKey & { score: number }];
  return {
    tonic: best.tonic,
    mode: best.mode,
    score: Math.round(best.score * 1000) / 1000,
    margin: Math.round(Math.max(0, best.score - second.score) * 1000) / 1000,
    runnerUp: { tonic: second.tonic, mode: second.mode },
  };
}

/** Prosek hrome po okvirima, normalizovan na zbir 1 (prazni okviri se preskaču). */
export function averageChroma(frames: ReadonlyArray<ArrayLike<number>>): number[] {
  const sum = new Array<number>(12).fill(0);
  for (const frame of frames) {
    let total = 0;
    for (let index = 0; index < 12; index++) total += frame[index] ?? 0;
    if (!(total > 0) || !Number.isFinite(total)) continue;
    for (let index = 0; index < 12; index++) sum[index]! += (frame[index] ?? 0) / total;
  }
  const total = sum.reduce((acc, value) => acc + value, 0);
  return total > 0 ? sum.map((value) => value / total) : sum;
}

// Srpska (nemačka) imena: B = si bemol, H = si.
const SR_MAJOR = ["C", "Des", "D", "Es", "E", "F", "Fis", "G", "As", "A", "B", "H"];
const SR_MINOR = ["c", "cis", "d", "es", "e", "f", "fis", "g", "gis", "a", "b", "h"];
const SYMBOL_MAJOR = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const SYMBOL_MINOR = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** „C-dur", „fis-mol" (sr) / „C major", „F# minor" (en). */
export function keyName(key: MusicalKey, locale: Locale): string {
  if (locale === "sr") return key.mode === "dur" ? `${SR_MAJOR[key.tonic]}-dur` : `${SR_MINOR[key.tonic]}-mol`;
  return key.mode === "dur" ? `${SYMBOL_MAJOR[key.tonic]} major` : `${SYMBOL_MINOR[key.tonic]} minor`;
}

/** Oznaka akorda kakvu piše svaki pevač i gitarista: „C", „F#m". */
export function keySymbol(key: MusicalKey): string {
  return key.mode === "dur" ? SYMBOL_MAJOR[key.tonic]! : `${SYMBOL_MINOR[key.tonic]}m`;
}

/** Camelot točak (DJ miks): C-dur = 8B, a-mol = 8A; susedni brojevi se lepo spajaju. */
export function camelot(key: MusicalKey): string {
  const major = key.mode === "dur" ? key.tonic : (key.tonic + 3) % 12;
  const number = (((major * 7) % 12) + 7) % 12 + 1;
  return `${number}${key.mode === "dur" ? "B" : "A"}`;
}

/** Koliko je procena sigurna, rečima. */
export function keyConfidence(guess: KeyGuess): "sigurno" | "verovatno" | "nesigurno" {
  if (guess.score >= 0.7 && guess.margin >= 0.05) return "sigurno";
  if (guess.score >= 0.5) return "verovatno";
  return "nesigurno";
}

export const KEY_CONFIDENCE_LABELS: Record<ReturnType<typeof keyConfidence>, LocalizedText> = {
  sigurno: { sr: "sigurno", en: "confident" },
  verovatno: { sr: "verovatno", en: "likely" },
  nesigurno: { sr: "nesigurno - poslušaj", en: "unsure - have a listen" },
};

// ── Markeri udaraca ──────────────────────────────────────────────────────────

export type BeatMarker = {
  t: number;
  /** Takt (od 1) i udarac u taktu (1-4). */
  bar: number;
  beat: number;
  downbeat: boolean;
};

export const MAX_MARKERS = 4000;

/**
 * Markeri svakog udarca od početka do kraja pesme. `offset` je prvi naglašen udarac
 * (detektor); udarci PRE njega pripadaju taktu 0, pa takt 1 počinje tačno na njemu.
 */
export function beatMarkers(bpm: number, offset: number, durationS: number, beatsPerBar = 4): BeatMarker[] {
  if (!(bpm > 0) || !(durationS > 0)) return [];
  const period = 60 / bpm;
  const before = Math.floor(Math.max(0, offset) / period + 1e-9);
  const first = Math.max(0, offset) - before * period;
  const markers: BeatMarker[] = [];
  for (let index = 0; markers.length < MAX_MARKERS; index++) {
    const t = Math.round((first + index * period) * 1e4) / 1e4;
    if (t >= durationS) break;
    const fromDownbeat = index - before;
    const bar = Math.floor(fromDownbeat / beatsPerBar) + 1;
    const beat = ((fromDownbeat % beatsPerBar) + beatsPerBar) % beatsPerBar + 1;
    markers.push({ t, bar, beat, downbeat: beat === 1 });
  }
  return markers;
}

/** Audacity „label track" (uvozi ga i većina programa za montažu): početak, kraj, ime. */
export function audacityLabels(markers: readonly BeatMarker[], onlyDownbeats = false): string {
  return markers
    .filter((marker) => !onlyDownbeats || marker.downbeat)
    .map((marker) => `${marker.t.toFixed(6)}\t${marker.t.toFixed(6)}\t${marker.bar}.${marker.beat}`)
    .join("\n")
    .concat(markers.length > 0 ? "\n" : "");
}

export function markersCsv(markers: readonly BeatMarker[], locale: Locale): string {
  const header = locale === "sr" ? "vreme_s,takt,udarac,naglasak" : "time_s,bar,beat,downbeat";
  return [header, ...markers.map((marker) => `${marker.t.toFixed(3)},${marker.bar},${marker.beat},${marker.downbeat ? 1 : 0}`)].join("\n") + "\n";
}
