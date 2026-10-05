import { toCyrillic, toLatin } from "./crea-ocr";
import type { LocalizedText } from "./i18n";

/**
 * Titlovi na srpskom (Crea K21, V25; plan K17 §6.1): reči sa vremenima (iz
 * transkripta `stt` ili raspoređene iz teksta) → titlovi (cue) po pravilima
 * čitljivosti, SRT/VTT, karaoke (koja reč se upravo izgovara) i latinica ↔
 * ćirilica. Čiste funkcije; isti titlovi idu u pregled, izvoz (montaža ih
 * utiskuje) i u preuzete fajlove.
 */

export type CaptionWord = { w: string; s: number; e: number; speaker?: string };
/** Jedan titl na ekranu: reči redom, `start`/`end` u sekundama videa. */
export type CaptionCue = { start: number; end: number; words: CaptionWord[] };

export const CAPTION_STYLES = ["klasican", "zuta-traka", "karaoke", "veliki", "rukopis"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];
export const CAPTION_SCRIPTS = ["lat", "cyr"] as const;
export type CaptionScript = (typeof CAPTION_SCRIPTS)[number];

export const CAPTION_STYLE_LABELS: Record<CaptionStyle, { label: LocalizedText; hint: LocalizedText }> = {
  klasican: {
    label: { sr: "Klasičan", en: "Classic" },
    hint: { sr: "Beli tekst na tamnoj traci, kao na televiziji.", en: "White text on a dark strip, like on TV." },
  },
  "zuta-traka": {
    label: { sr: "Žuta traka", en: "Yellow strip" },
    hint: { sr: "Mastilo na žutom, sa tvrdom senkom - boje Cree.", en: "Ink on yellow with a hard shadow - Crea's colours." },
  },
  karaoke: {
    label: { sr: "Karaoke", en: "Karaoke" },
    hint: { sr: "Reč koja se upravo izgovara postaje žuta.", en: "The word being spoken turns yellow." },
  },
  veliki: {
    label: { sr: "Veliki u sredini", en: "Big and centred" },
    hint: { sr: "Dve-tri reči odjednom, krupno - za TikTok i Reels.", en: "Two or three words at a time, large - for TikTok and Reels." },
  },
  rukopis: {
    label: { sr: "Rukopis", en: "Handwriting" },
    hint: { sr: "Kao da je napisano rukom u svesci.", en: "As if handwritten in a notebook." },
  },
};

export type CueOptions = {
  /** Najviše znakova u jednom redu. */
  maxChars: number;
  maxLines: number;
  /** Najduže trajanje jednog titla (s). */
  maxS: number;
  /** Najkraće trajanje (produžava se dok ne dođe sledeći). */
  minS: number;
  /** Pauza u govoru posle koje počinje nov titl (s). */
  gapS: number;
};

/** Pravila čitljivosti: 42 znaka u redu i 2 reda (standard za TV), „veliki" je jedan kratak red. */
export function cueOptionsFor(style: CaptionStyle): CueOptions {
  return style === "veliki"
    ? { maxChars: 16, maxLines: 1, maxS: 2.2, minS: 0.5, gapS: 0.6 }
    : { maxChars: 42, maxLines: 2, maxS: 6, minS: 1, gapS: 0.6 };
}

export const SUBTITLE_LIMITS = {
  words: 1500,
  cues: 600,
  wordChars: 40,
  /** Najduži video za titlove (s) - isto kao montaža (8 min). */
  durationS: 480,
} as const;

/**
 * Kratke reči koje ne smeju da ostanu same na kraju reda/titla („i", „u", „na"…):
 * čitalac ih vezuje za reč koja sledi.
 */
const WEAK_WORDS = new Set([
  "i", "u", "na", "da", "za", "sa", "je", "a", "o", "od", "do", "pa", "te", "ni", "ne", "se", "iz", "po", "pri", "k", "s", "uz", "kroz", "ili", "kao", "što", "sve",
  "и", "у", "на", "да", "за", "са", "је", "а", "о", "од", "до", "па", "те", "ни", "не", "се", "из", "по", "при", "к", "с", "уз", "кроз", "или", "као", "што", "све",
]);

function bare(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function isWeakWord(word: string): boolean {
  return WEAK_WORDS.has(bare(word));
}

function endsSentence(word: string): boolean {
  return /[.!?…]["“”»)]*$/.test(word);
}

function endsClause(word: string): boolean {
  return /[,;:–-]["“”»)]*$/.test(word);
}

function textLength(words: readonly CaptionWord[]): number {
  return words.reduce((sum, word, index) => sum + word.w.length + (index > 0 ? 1 : 0), 0);
}

/** Čista reč: bez praznih, sa vremenima u redu (`s ≤ e`, rastuće). */
export function cleanWords(words: readonly CaptionWord[]): CaptionWord[] {
  const out: CaptionWord[] = [];
  let last = 0;
  for (const word of words) {
    const text = word.w.replace(/\s+/g, " ").trim().slice(0, SUBTITLE_LIMITS.wordChars);
    if (!text || !Number.isFinite(word.s) || !Number.isFinite(word.e)) continue;
    const s = Math.max(last, word.s, 0);
    const e = Math.max(s, word.e);
    out.push({ w: text, s, e, ...(word.speaker ? { speaker: word.speaker } : {}) });
    last = s;
    if (out.length >= SUBTITLE_LIMITS.words) break;
  }
  return out;
}

/**
 * Reči → titlovi. Nov titl počinje kad tekst ne staje u redove, kad titl traje
 * predugo, posle pauze u govoru, posle kraja rečenice ili kad se promeni govornik.
 * Kratka veznička reč se ne ostavlja na kraju titla - prelazi u sledeći.
 */
export function cuesFromWords(words: readonly CaptionWord[], options: Partial<CueOptions> = {}): CaptionCue[] {
  const opts = { ...cueOptionsFor("klasican"), ...options };
  const capacity = opts.maxChars * opts.maxLines;
  const groups: CaptionWord[][] = [];
  let current: CaptionWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    // Slaba reč na kraju ide u sledeći titl (ako titl nije samo ona).
    let carry: CaptionWord[] = [];
    while (current.length > 1 && isWeakWord(current[current.length - 1]!.w) && !endsSentence(current[current.length - 1]!.w)) {
      carry = [current.pop()!, ...carry];
    }
    groups.push(current);
    current = carry;
  };

  for (const word of cleanWords(words)) {
    if (current.length > 0) {
      const previous = current[current.length - 1]!;
      const tooLong = textLength([...current, word]) > capacity;
      const tooSlow = word.e - current[0]!.s > opts.maxS;
      const pause = word.s - previous.e > opts.gapS;
      const sentence = endsSentence(previous.w);
      const speaker = (word.speaker ?? "") !== (previous.speaker ?? "");
      // Zarez je dobro mesto za rez kad je prvi red već pun.
      const clause = endsClause(previous.w) && textLength(current) >= opts.maxChars;
      if (tooLong || tooSlow || pause || sentence || speaker || clause) flush();
    }
    current.push(word);
  }
  // Poslednji titl ostaje ceo (nema sledećeg u koji bi slaba reč prešla).
  if (current.length > 0) groups.push(current);

  const cues = groups.map((group) => ({ start: group[0]!.s, end: group[group.length - 1]!.e, words: group }));
  // Najkraće trajanje: titl ostaje bar `minS`, ali nikad preko početka sledećeg.
  return cues.slice(0, SUBTITLE_LIMITS.cues).map((cue, index, all) => {
    const next = all[index + 1];
    const wanted = Math.max(cue.end, cue.start + opts.minS);
    return { ...cue, end: next ? Math.min(wanted, next.start) : wanted };
  });
}

/** Sve reči svih titlova, redom (za ponovno grupisanje kad se promeni stil). */
export function cueWords(cues: readonly CaptionCue[]): CaptionWord[] {
  return cues.flatMap((cue) => cue.words);
}

/** Reči titla raspoređene u redove (najviše `maxLines`, što ravnomernije). */
export function cueLines<T extends { w: string }>(words: readonly T[], maxChars: number, maxLines: number): T[][] {
  if (words.length === 0) return [];
  const total = words.reduce((sum, word, index) => sum + word.w.length + (index > 0 ? 1 : 0), 0);
  if (maxLines <= 1 || total <= maxChars) return [words.slice()];
  // Dva reda: tačka podele sa najmanjom razlikom dužina, bez slabe reči na kraju prvog reda.
  let best = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let split = 1; split < words.length; split++) {
    const first = words.slice(0, split).reduce((sum, word, index) => sum + word.w.length + (index > 0 ? 1 : 0), 0);
    const second = total - first - 1;
    const overflow = Math.max(0, first - maxChars) + Math.max(0, second - maxChars);
    const weak = isWeakWord(words[split - 1]!.w) ? 8 : 0;
    const score = overflow * 100 + Math.abs(first - second) + weak;
    if (score < bestScore) {
      bestScore = score;
      best = split;
    }
  }
  return [words.slice(0, best), words.slice(best)];
}

// ── Pismo ───────────────────────────────────────────────────────────────────

/** Strane reči, adrese i oznake ostaju kakve jesu kad se prelazi u ćirilicu („Wi-Fi", „@crea", „www…"). */
function keepLatin(word: string): boolean {
  return /[qwxy]/i.test(word) || /^(https?:|www\.|@|#)/i.test(word);
}

/** Tekst u traženom pismu (deterministički: `toLatin` / `toCyrillic` iz OCR-a, K09). */
export function transliterateText(text: string, script: CaptionScript): string {
  if (script === "lat") return toLatin(text);
  return text
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) || keepLatin(part) ? part : toCyrillic(part)))
    .join("");
}

export function transliterateCues(cues: readonly CaptionCue[], script: CaptionScript): CaptionCue[] {
  return cues.map((cue) => ({ ...cue, words: cue.words.map((word) => ({ ...word, w: transliterateText(word.w, script) })) }));
}

export function cueText(cue: CaptionCue): string {
  return cue.words.map((word) => word.w).join(" ");
}

// ── SRT / VTT ───────────────────────────────────────────────────────────────

function stamp(seconds: number, separator: "," | "."): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(rest, 3)}`;
}

function cueBody(cue: CaptionCue, options: CueOptions): string {
  return cueLines(cue.words, options.maxChars, options.maxLines)
    .map((line) => line.map((word) => word.w).join(" "))
    .join("\n");
}

/** SubRip: redni broj, `00:00:01,000 --> 00:00:03,500`, tekst, prazan red. */
export function toSrt(cues: readonly CaptionCue[], options: CueOptions = cueOptionsFor("klasican")): string {
  return cues
    .map((cue, index) => `${index + 1}\n${stamp(cue.start, ",")} --> ${stamp(cue.end, ",")}\n${cueBody(cue, options)}\n`)
    .join("\n");
}

/** WebVTT: zaglavlje `WEBVTT`, tačka u milisekundama. */
export function toVtt(cues: readonly CaptionCue[], options: CueOptions = cueOptionsFor("klasican")): string {
  const body = cues.map((cue) => `${stamp(cue.start, ".")} --> ${stamp(cue.end, ".")}\n${cueBody(cue, options)}\n`).join("\n");
  return `WEBVTT\n\n${body}`;
}

// ── Karaoke ─────────────────────────────────────────────────────────────────

/** Titl koji se vidi u trenutku `t` (ili -1). Titlovi su poređani po vremenu. */
export function cueIndexAt(cues: readonly CaptionCue[], t: number): number {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const cue = cues[mid]!;
    if (t < cue.start) high = mid - 1;
    else if (t >= cue.end) low = mid + 1;
    else return mid;
  }
  return -1;
}

/**
 * Karaoke: koji titl se vidi i koja reč u njemu se upravo izgovara (poslednja
 * koja je počela). `null` kad u tom trenutku nema titla.
 */
export function karaokeAt(cues: readonly CaptionCue[], t: number): { cueIndex: number; wordIndex: number } | null {
  const cueIndex = cueIndexAt(cues, t);
  if (cueIndex < 0) return null;
  const words = cues[cueIndex]!.words;
  let wordIndex = -1;
  for (let index = 0; index < words.length; index++) if (words[index]!.s <= t) wordIndex = index;
  return { cueIndex, wordIndex };
}

// ── Tekst bez vremena (explainer, „napiši sam") ────────────────────────────

/** Broj slogova (u srpskom je svaki samoglasnik slog; i slogotvorno „r" između suglasnika, npr. „prst", „Srbija"). */
export function syllableCount(word: string): number {
  const letters = bare(toLatin(word));
  if (!letters) return 0;
  const vowels = letters.match(/[aeiou]/g)?.length ?? 0;
  const syllabicR = letters.match(/(^|[^aeiou])r(?=[^aeiou]|$)/g)?.length ?? 0;
  return Math.max(1, vowels + syllabicR);
}

/**
 * Tekst raspoređen u vremenu `[start, end]` po slogovima (srpski govor ide u
 * slogovima, ne u slovima), uz kratke pauze posle zareza i tačaka - za glas iz
 * teksta (TTS ne vraća vremena reči) i za titl koji korisnik sam napiše.
 */
export function wordsFromText(text: string, start: number, end: number): CaptionWord[] {
  const tokens = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, SUBTITLE_LIMITS.words);
  if (tokens.length === 0 || !(end > start)) return [];
  const PAUSE_SENTENCE = 1.6;
  const PAUSE_CLAUSE = 0.6;
  const weights = tokens.map((token) => Math.max(1, syllableCount(token)));
  const pauses: number[] = tokens.map((token, index) => (index === tokens.length - 1 ? 0 : endsSentence(token) ? PAUSE_SENTENCE : endsClause(token) ? PAUSE_CLAUSE : 0));
  const total = weights.reduce((sum, value) => sum + value, 0) + pauses.reduce((sum, value) => sum + value, 0);
  const unit = (end - start) / total;
  const words: CaptionWord[] = [];
  let cursor = start;
  tokens.forEach((token, index) => {
    const s = cursor;
    const e = s + weights[index]! * unit;
    words.push({ w: token.slice(0, SUBTITLE_LIMITS.wordChars), s: round3(s), e: round3(e) });
    cursor = e + pauses[index]! * unit;
  });
  return words;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Ceo tekst kao titlovi preko trajanja `durationS` (od 0). */
export function cuesFromText(text: string, durationS: number, style: CaptionStyle = "klasican"): CaptionCue[] {
  return cuesFromWords(wordsFromText(text, 0, Math.max(0, Math.min(durationS, SUBTITLE_LIMITS.durationS))), cueOptionsFor(style));
}

/**
 * Izmena teksta jednog titla: nove reči se ravnomerno (po slogovima) rasporede
 * u isto vreme. Prazan tekst briše titl.
 */
export function replaceCueText(cues: readonly CaptionCue[], index: number, text: string): CaptionCue[] {
  const cue = cues[index];
  if (!cue) return cues.slice();
  const words = wordsFromText(text, cue.start, cue.end);
  if (words.length === 0) return cues.filter((_, other) => other !== index);
  return cues.map((entry, other) => (other === index ? { start: cue.start, end: cue.end, words } : entry));
}

/** Reči iz opsega `[from, to)` pomerene tako da `from` postane 0 (kratak klip iz dugog videa). */
export function wordsInRange(words: readonly CaptionWord[], from: number, to: number): CaptionWord[] {
  return words
    .filter((word) => word.e > from && word.s < to)
    .map((word) => ({ ...word, s: round3(Math.max(0, word.s - from)), e: round3(Math.min(to, word.e) - from) }));
}

/** Ponovo grupisanje za drugi stil (npr. „veliki" ima kraće titlove). */
export function regroupCues(cues: readonly CaptionCue[], style: CaptionStyle): CaptionCue[] {
  return cuesFromWords(cueWords(cues), cueOptionsFor(style));
}
