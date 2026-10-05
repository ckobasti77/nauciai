/**
 * Rečenice i govornici iz transkripta (Crea K23, A9 i A10). Reči stižu iz
 * prepoznavanja govora (`stt`, Scribe V2 sa `speaker_id`); ovde se slažu u
 * kratke delove po govorniku - deo je jedinica prevoda, izgovora i zamene glasa.
 * Čiste funkcije, bez browser API-ja.
 */

export type SegmentWord = { w: string; s: number; e: number; speaker?: string };

export type SpeechSegment = { id: string; speaker: string; start: number; end: number; text: string };

export const SEGMENT_RULES = {
  /** Pauza duža od ovoga počinje nov deo (s). */
  maxGapS: 0.8,
  /** Najduži deo (s) - dovoljno kratak da prevod stane u isto vreme. */
  maxS: 12,
  /** Posle tačke nov deo počinje tek kad je tekući bar ovoliko dug (s). */
  minSentenceS: 2.5,
  maxChars: 240,
} as const;

export const DEFAULT_SPEAKER = "speaker_0";

const SENTENCE_END = /[.!?…]["»”']?$/;

export function segmentsFromWords(words: readonly SegmentWord[], rules: typeof SEGMENT_RULES = SEGMENT_RULES): SpeechSegment[] {
  const sorted = words
    .filter((word) => word.w.trim().length > 0 && Number.isFinite(word.s) && Number.isFinite(word.e))
    .slice()
    .sort((a, b) => a.s - b.s);
  const out: SpeechSegment[] = [];
  let current: SpeechSegment | null = null;
  for (const word of sorted) {
    const speaker = word.speaker ?? DEFAULT_SPEAKER;
    const text = word.w.trim();
    const split =
      !current ||
      current.speaker !== speaker ||
      word.s - current.end > rules.maxGapS ||
      word.e - current.start > rules.maxS ||
      current.text.length + 1 + text.length > rules.maxChars ||
      (SENTENCE_END.test(current.text) && current.end - current.start >= rules.minSentenceS);
    if (split) {
      current = { id: `s${out.length + 1}`, speaker, start: word.s, end: Math.max(word.s, word.e), text };
      out.push(current);
    } else if (current) {
      current.end = Math.max(current.end, word.e);
      current.text = `${current.text} ${text}`;
    }
  }
  return out;
}

export type Speaker = { id: string; number: number; seconds: number; segments: number; sample: string };

/** Govornici redom pojavljivanja, sa ukupnim vremenom govora i prvim rečima. */
export function speakersOf(segments: readonly SpeechSegment[]): Speaker[] {
  const out: Speaker[] = [];
  for (const segment of segments) {
    let speaker = out.find((entry) => entry.id === segment.speaker);
    if (!speaker) {
      speaker = { id: segment.speaker, number: out.length + 1, seconds: 0, segments: 0, sample: segment.text.slice(0, 80) };
      out.push(speaker);
    }
    speaker.seconds += Math.max(0, segment.end - segment.start);
    speaker.segments += 1;
  }
  return out;
}

/** Do kad deo sme da traje: početak sledećeg dela ili kraj snimka. */
export function slotEnd(segments: readonly SpeechSegment[], index: number, totalS: number): number {
  const segment = segments[index]!;
  const next = segments.slice(index + 1).find((entry) => entry.start >= segment.start);
  return Math.max(segment.end, next ? next.start : totalS);
}

/** Najveće ubrzanje novog govora da stane u svoje mesto (iznad ovoga zvuči neprirodno). */
export const MAX_FIT_RATE = 1.25;

/** Brzina puštanja novog snimka da stane u mesto: 1 kad staje, inače ubrzanje do `maxRate`. */
export function fitRate(sourceS: number, slotS: number, maxRate = MAX_FIT_RATE): number {
  if (!(sourceS > 0) || !(slotS > 0) || sourceS <= slotS) return 1;
  return Math.round(Math.min(maxRate, sourceS / slotS) * 100) / 100;
}

export type CompactPiece = { segmentId: string; srcStart: number; srcEnd: number; at: number };

/**
 * Samo delovi jednog govornika, spojeni jedan za drugim (uz malu rezervu oko
 * reči i tišinu između): promena glasa se plaća po minutu, pa se ne šalje ceo
 * snimak sa tuđim govorom i tišinom. `at` je mesto dela u spojenom fajlu - po
 * njemu se promenjen glas vraća tačno tamo gde je bio (`srcStart`).
 */
export function compactPlan(
  segments: readonly SpeechSegment[],
  speakerId: string,
  totalS: number,
  options: { padS?: number; gapS?: number } = {},
): { pieces: CompactPiece[]; durationS: number } {
  const pad = options.padS ?? 0.12;
  const gap = options.gapS ?? 0.4;
  const pieces: CompactPiece[] = [];
  let at = 0;
  let lastEnd = -Infinity;
  for (const segment of segments) {
    if (segment.speaker !== speakerId) continue;
    const srcStart = Math.max(0, segment.start - pad, lastEnd);
    const srcEnd = Math.min(totalS, segment.end + pad);
    if (srcEnd - srcStart <= 0.01) continue;
    if (pieces.length > 0) at += gap;
    pieces.push({ segmentId: segment.id, srcStart, srcEnd, at });
    at += srcEnd - srcStart;
    lastEnd = srcEnd;
  }
  return { pieces, durationS: Math.max(0, at) };
}
