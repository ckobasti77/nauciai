import { normalizeRanges } from "./crea-audio-edit";
import { transliterateText, type CaptionScript, type CaptionWord } from "./crea-subtitles";
import type { LocalizedText } from "./i18n";

/**
 * Uređivanje tekstom (Crea K24, A16): obrišeš reč u transkriptu → isti deo nestane
 * iz snimka. Čista logika nad vremenima reči iz `stt` transkripta (Scribe V2,
 * `creaTranscripts`); sečenje samog zvuka radi uređivač na uređaju (0 kr).
 *
 * Pravilo reza (niz obrisanih reči i..j):
 * - postoji sledeća zadržana reč k: briše se [s_i, s_k − rezerva] - reči i pauza
 *   POSLE njih, a pauza ispred ostaje (prirodan razmak između zadržanih reči);
 * - niz je na kraju (nema sledeće), a postoji prethodna p: briše se [e_p + rezerva, e_j] -
 *   pauza ispred i reči, a ono što posle poslednje reči ostaje (muzika, uzdah) se ne dira;
 * - obrisano je sve: [s_i, e_j].
 * Rezerva (20 ms) čuva početak/kraj zadržane reči, jer vremena iz prepoznavanja
 * znaju da kasne nekoliko milisekundi. Nijedan rez ne ulazi u zadržanu reč.
 */

export type TranscriptWord = CaptionWord;
export type Range = [number, number];

export const WORD_GUARD_S = 0.02;

/** Uzastopni nizovi obrisanih reči (indeksi, uključivo). */
export function deletedRuns(wordCount: number, deleted: ReadonlySet<number>): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start: number | null = null;
  for (let index = 0; index <= wordCount; index++) {
    const isDeleted = index < wordCount && deleted.has(index);
    if (isDeleted && start === null) start = index;
    if (!isDeleted && start !== null) {
      runs.push([start, index - 1]);
      start = null;
    }
  }
  return runs;
}

/** Opsezi snimka (s) koji se brišu za skup obrisanih reči - sortirani i spojeni. */
export function deletionCuts(words: readonly TranscriptWord[], deleted: ReadonlySet<number>, durationS: number, guardS = WORD_GUARD_S): Range[] {
  const ranges: Range[] = [];
  for (const [first, last] of deletedRuns(words.length, deleted)) {
    const next = words[last + 1];
    const previous = words[first - 1];
    if (next) {
      ranges.push([words[first]!.s, Math.max(words[last]!.e, next.s - guardS)]);
    } else if (previous) {
      ranges.push([Math.min(words[first]!.s, previous.e + guardS), words[last]!.e]);
    } else {
      ranges.push([words[first]!.s, words[last]!.e]);
    }
  }
  return normalizeRanges(ranges, durationS);
}

/** Delovi koji ostaju (komplement rezova u [0, dužina]). */
export function keptRanges(cuts: readonly Range[], durationS: number): Range[] {
  const kept: Range[] = [];
  let at = 0;
  for (const [a, b] of normalizeRanges(cuts, durationS)) {
    if (a - at > 1e-6) kept.push([at, a]);
    at = b;
  }
  if (durationS - at > 1e-6) kept.push([at, durationS]);
  return kept;
}

/** Vreme u izvornom snimku → vreme u isečenom (deo unutar reza ide na početak reza). */
export function remapTime(t: number, cuts: readonly Range[]): number {
  let removed = 0;
  for (const [a, b] of cuts) {
    if (t >= b) removed += b - a;
    else if (t > a) return Math.round((a - removed) * 1e4) / 1e4;
    else break;
  }
  return Math.round((t - removed) * 1e4) / 1e4;
}

/** Zadržane reči sa vremenima u isečenom snimku (za titlove posle uređivanja). */
export function remapWords(words: readonly TranscriptWord[], deleted: ReadonlySet<number>, cuts: readonly Range[]): TranscriptWord[] {
  return words.flatMap((word, index) => (deleted.has(index) ? [] : [{ ...word, s: remapTime(word.s, cuts), e: remapTime(word.e, cuts) }]));
}

/** Izbor raspona reči (klik pa Shift+klik) u oba smera. */
export function wordRange(from: number, to: number): number[] {
  const start = Math.min(from, to);
  return Array.from({ length: Math.abs(to - from) + 1 }, (_, offset) => start + offset);
}

/** Obriši ili vrati reči: ako su SVE izabrane već obrisane, vraćaju se; inače se brišu. */
export function toggleWords(deleted: ReadonlySet<number>, indices: readonly number[]): Set<number> {
  const next = new Set(deleted);
  const restore = indices.length > 0 && indices.every((index) => deleted.has(index));
  for (const index of indices) {
    if (restore) next.delete(index);
    else next.add(index);
  }
  return next;
}

/** Pasus transkripta: isti govornik bez duge pauze. */
export type TranscriptParagraph = { speaker: string | null; start: number; from: number; to: number };

export const PARAGRAPH_PAUSE_S = 1.5;
export const PARAGRAPH_MAX_WORDS = 60;

export function paragraphs(words: readonly TranscriptWord[]): TranscriptParagraph[] {
  const out: TranscriptParagraph[] = [];
  words.forEach((word, index) => {
    const last = out[out.length - 1];
    const previous = words[index - 1];
    const sameSpeaker = last && (word.speaker ?? null) === last.speaker;
    const pause = previous ? word.s - previous.e : 0;
    if (last && sameSpeaker && pause < PARAGRAPH_PAUSE_S && index - last.from < PARAGRAPH_MAX_WORDS) {
      last.to = index;
      return;
    }
    out.push({ speaker: word.speaker ?? null, start: word.s, from: index, to: index });
  });
  return out;
}

/** Govornici redom pojavljivanja: `speaker_3` → „Govornik 1". */
export function speakerNumbers(words: readonly TranscriptWord[]): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const word of words) if (word.speaker && !numbers.has(word.speaker)) numbers.set(word.speaker, numbers.size + 1);
  return numbers;
}

export const SPEAKER_LABEL: LocalizedText = { sr: "Govornik", en: "Speaker" };

export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  return `${hours > 0 ? `${hours}:` : ""}${mm}:${String(secs).padStart(2, "0")}`;
}

/**
 * Tekst za preuzimanje (.txt): pasus po govorniku sa vremenom, u izabranom pismu.
 * Imena govornika („Govornik 1") ostaju u pismu interfejsa.
 */
export function transcriptText(words: readonly TranscriptWord[], script: CaptionScript, locale: "sr" | "en"): string {
  const numbers = speakerNumbers(words);
  return paragraphs(words)
    .map((paragraph) => {
      const text = transliterateText(
        words
          .slice(paragraph.from, paragraph.to + 1)
          .map((word) => word.w)
          .join(" "),
        script,
      );
      const who = paragraph.speaker ? ` ${SPEAKER_LABEL[locale]} ${numbers.get(paragraph.speaker)}:` : "";
      return `[${clock(paragraph.start)}]${who} ${text}`;
    })
    .join("\n\n");
}
