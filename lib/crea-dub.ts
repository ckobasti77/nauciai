import type { DubLanguage } from "@/convex/creaLlmSoundCore";
import { lineFingerprint, type LineTake } from "./crea-dialogue";
import { jobCredits, type PricedModel } from "./crea-job-price";
import { DEFAULT_VOICE_SETTINGS, buildSpeechJob, speechChars, type SpeechJob } from "./crea-voice-tags";
import { DEFAULT_VOICE, voiceById } from "./crea-voices";
import { cuesFromWords, cueOptionsFor, toSrt, wordsFromText, type CaptionWord } from "./crea-subtitles";
import { fitRate, segmentsFromWords, slotEnd, type SegmentWord, type SpeechSegment } from "./crea-speech-segments";

/**
 * Prevod uz pregled (Crea K23, A10): transkript → rečenice → prevod (0 kr) →
 * korisnik ispravi i original i prevod → govor PO REČENICI (Gemini, krediti) →
 * spajanje na uređaju na mesta originalnih rečenica.
 *
 * Svaka rečenica je JEDAN posao govora, kao replika u dijalogu (K22): otisak
 * posla (`lineFingerprint`) pamti tačno šta je izgovoreno, pa posle izmene se
 * ponovo pravi i plaća SAMO izmenjena rečenica. Izmena ORIGINALA ne pravi ništa
 * sama - prevod te rečenice postaje „zastareo" dok se ponovo ne prevede (0 kr)
 * ili dok korisnik ne kaže „prevod je dobar".
 */

export const DUB_LIMITS = { segments: 120, textChars: 500 } as const;

export type DubSegment = {
  id: string;
  speaker: string;
  start: number;
  end: number;
  /** Original (prepoznat govor), korisnik ga sme ispraviti. */
  source: string;
  translation: string;
  /** Original iz kog je prevod nastao (ili koji je korisnik potvrdio); `null` = nije prevedeno. */
  translatedFrom: string | null;
};

export type DubDoc = {
  v: 1;
  to: DubLanguage;
  /** Jezik originala koji je prepoznavanje javilo (npr. `srp`), samo kao savet modelu. */
  from: string | null;
  durationS: number;
  segments: DubSegment[];
  /** Gemini glas po govorniku. */
  voices: Record<string, string>;
};

export type DubTakes = Readonly<Record<string, LineTake>>;

/** Podrazumevani glasovi govornika: smenjuju se žena i muškarac (Gemini). */
const SPEAKER_VOICES = ["Sulafat", "Achird", "Kore", "Charon", "Leda", "Puck", "Despina", "Iapetus", "Aoede", "Umbriel"] as const;

export function dubFromWords(words: readonly SegmentWord[], options: { to: DubLanguage; from: string | null; durationS: number }): DubDoc {
  const segments = segmentsFromWords(words).slice(0, DUB_LIMITS.segments);
  const voices: Record<string, string> = {};
  for (const segment of segments) {
    if (!voices[segment.speaker]) voices[segment.speaker] = SPEAKER_VOICES[Object.keys(voices).length % SPEAKER_VOICES.length]!;
  }
  const lastEnd = segments.reduce((max, segment) => Math.max(max, segment.end), 0);
  return {
    v: 1,
    to: options.to,
    from: options.from,
    durationS: Math.max(options.durationS, lastEnd),
    voices,
    segments: segments.map((segment: SpeechSegment) => ({
      id: segment.id,
      speaker: segment.speaker,
      start: segment.start,
      end: segment.end,
      source: segment.text.slice(0, DUB_LIMITS.textChars),
      translation: "",
      translatedFrom: null,
    })),
  };
}

export type DubStatus = "prazno" | "za-prevod" | "zastareo" | "nova" | "izmenjena" | "gotova";

/** Posao govora za rečenicu (prevod, glas govornika), ili `null` bez prevoda. */
export function segmentJob(doc: DubDoc, segment: DubSegment): SpeechJob | null {
  const text = segment.translation.trim();
  if (!text) return null;
  const voice = doc.voices[segment.speaker];
  return buildSpeechJob({
    engine: "gemini",
    voiceId: voice && voiceById("gemini", voice) ? voice : DEFAULT_VOICE.gemini,
    text,
    settings: DEFAULT_VOICE_SETTINGS,
  });
}

export function dubStatus(doc: DubDoc, segment: DubSegment, takes: DubTakes): DubStatus {
  const hasSource = segment.source.trim().length > 0;
  const hasTranslation = segment.translation.trim().length > 0;
  if (!hasSource && !hasTranslation) return "prazno";
  if (!hasTranslation) return "za-prevod";
  if (segment.translatedFrom === null || segment.translatedFrom.trim() !== segment.source.trim()) return "zastareo";
  const job = segmentJob(doc, segment)!;
  const take = takes[segment.id];
  if (!take) return "nova";
  return take.fingerprint === lineFingerprint(job) ? "gotova" : "izmenjena";
}

/** Rečenice koje treba (ponovo) prevesti: bez prevoda ili sa izmenjenim originalom. Prevod je 0 kr. */
export function segmentsToTranslate(doc: DubDoc, takes: DubTakes = {}): Array<{ id: string; text: string }> {
  return doc.segments
    .filter((segment) => segment.source.trim().length > 0)
    .filter((segment) => {
      const status = dubStatus(doc, segment, takes);
      return status === "za-prevod" || status === "zastareo";
    })
    .map((segment) => ({ id: segment.id, text: segment.source.trim() }));
}

/** Prevod stigao: upisuje se samo za rečenice koje postoje, uz original iz kog je nastao. */
export function applyTranslations(doc: DubDoc, translations: Readonly<Record<string, string>>): DubDoc {
  return {
    ...doc,
    segments: doc.segments.map((segment) => {
      const text = translations[segment.id];
      return typeof text === "string" && text.trim()
        ? { ...segment, translation: text.trim().slice(0, DUB_LIMITS.textChars), translatedFrom: segment.source.trim() }
        : segment;
    }),
  };
}

/** Ispravka originala: prevod ostaje, ali postaje „zastareo" (ništa se ne plaća). */
export function editSource(doc: DubDoc, id: string, text: string): DubDoc {
  return { ...doc, segments: doc.segments.map((segment) => (segment.id === id ? { ...segment, source: text.slice(0, DUB_LIMITS.textChars) } : segment)) };
}

/** Ispravka prevoda: korisnik ga time i potvrđuje za trenutni original. */
export function editTranslation(doc: DubDoc, id: string, text: string): DubDoc {
  return {
    ...doc,
    segments: doc.segments.map((segment) =>
      segment.id === id ? { ...segment, translation: text.slice(0, DUB_LIMITS.textChars), translatedFrom: segment.source.trim() } : segment,
    ),
  };
}

/** „Prevod je dobar" posle ispravke originala: bez novog prevoda. */
export function keepTranslation(doc: DubDoc, id: string): DubDoc {
  return { ...doc, segments: doc.segments.map((segment) => (segment.id === id ? { ...segment, translatedFrom: segment.source.trim() } : segment)) };
}

export function setSpeakerVoice(doc: DubDoc, speaker: string, voiceId: string): DubDoc {
  return voiceById("gemini", voiceId) ? { ...doc, voices: { ...doc.voices, [speaker]: voiceId } } : doc;
}

/** Rečenice koje treba izgovoriti: nove i izmenjene. Gotove se NE prave ponovo. */
export function segmentsToSynth(doc: DubDoc, takes: DubTakes): Array<{ segment: DubSegment; job: SpeechJob; fingerprint: string }> {
  const out: Array<{ segment: DubSegment; job: SpeechJob; fingerprint: string }> = [];
  for (const segment of doc.segments) {
    const status = dubStatus(doc, segment, takes);
    if (status !== "nova" && status !== "izmenjena") continue;
    const job = segmentJob(doc, segment)!;
    out.push({ segment, job, fingerprint: lineFingerprint(job) });
  }
  return out;
}

/** Cena SAMO rečenica koje se prave (zbir pojedinačnih poslova, ista računica kao server). */
export function dubCost(doc: DubDoc, takes: DubTakes, catalog: readonly PricedModel[]): { credits: number | null; segments: number; chars: number } {
  const todo = segmentsToSynth(doc, takes);
  let credits: number | null = 0;
  let chars = 0;
  for (const entry of todo) {
    const count = speechChars(entry.job);
    chars += count;
    const price = jobCredits({ modelSlug: entry.job.modelSlug, inputMode: entry.job.inputMode, params: entry.job.params, measured: { char_count: count } }, catalog);
    credits = price === null || credits === null ? null : credits + price;
  }
  return { credits, segments: todo.length, chars };
}

/** Sve rečenice sa tekstom su izgovorene (može da se spoji). */
export function dubReady(doc: DubDoc, takes: DubTakes): boolean {
  const spoken = doc.segments.filter((segment) => dubStatus(doc, segment, takes) !== "prazno");
  return spoken.length > 0 && spoken.every((segment) => dubStatus(doc, segment, takes) === "gotova");
}

/** Titlovi (SRT) prevoda ili originala, u vremenu originalnih rečenica. */
export function dubSrt(doc: DubDoc, which: "prevod" | "original"): string {
  const words: CaptionWord[] = [];
  for (const segment of doc.segments) {
    const text = (which === "prevod" ? segment.translation : segment.source).trim();
    if (text) words.push(...wordsFromText(text, segment.start, Math.max(segment.start + 0.3, segment.end)));
  }
  return toSrt(cuesFromWords(words, cueOptionsFor("klasican")));
}

export type DubPlacement = { segmentId: string; jobId: string; at: number; rate: number };

/**
 * Gde ide svaki izgovoren prevod: na početak originalne rečenice, ubrzan do
 * `MAX_FIT_RATE` ako je duži od mesta do sledeće rečenice. `durations` su
 * izmerena trajanja snimaka (s); rečenica bez snimka se preskače.
 */
export function dubPlacements(doc: DubDoc, takes: DubTakes, durations: Readonly<Record<string, number>>): DubPlacement[] {
  const ordered = doc.segments.slice().sort((a, b) => a.start - b.start);
  const out: DubPlacement[] = [];
  ordered.forEach((segment, index) => {
    const take = takes[segment.id];
    const seconds = durations[segment.id];
    if (!take || seconds === undefined || dubStatus(doc, segment, takes) !== "gotova") return;
    const slot = slotEnd(ordered.map((entry) => ({ ...entry, text: entry.source })), index, doc.durationS) - segment.start;
    out.push({ segmentId: segment.id, jobId: take.jobId, at: segment.start, rate: fitRate(seconds, slot) });
  });
  return out;
}

/** Dokument iz nepouzdanog izvora (`localStorage`); loš oblik = `null`. */
export function sanitizeDubDoc(raw: unknown, isLanguage: (value: unknown) => value is DubLanguage): DubDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== 1 || !Array.isArray(record.segments) || !isLanguage(record.to)) return null;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);
  const segments: DubSegment[] = [];
  for (const entry of record.segments.slice(0, DUB_LIMITS.segments)) {
    if (!entry || typeof entry !== "object") continue;
    const segment = entry as Record<string, unknown>;
    const start = num(segment.start);
    const end = num(segment.end);
    if (typeof segment.id !== "string" || !/^s\d{1,4}$/.test(segment.id) || typeof segment.speaker !== "string" || start === null || end === null) continue;
    segments.push({
      id: segment.id,
      speaker: segment.speaker.slice(0, 40),
      start,
      end: Math.max(start, end),
      source: typeof segment.source === "string" ? segment.source.slice(0, DUB_LIMITS.textChars) : "",
      translation: typeof segment.translation === "string" ? segment.translation.slice(0, DUB_LIMITS.textChars) : "",
      translatedFrom: typeof segment.translatedFrom === "string" ? segment.translatedFrom : null,
    });
  }
  if (segments.length === 0) return null;
  const voices: Record<string, string> = {};
  const rawVoices = record.voices && typeof record.voices === "object" ? (record.voices as Record<string, unknown>) : {};
  for (const segment of segments) {
    const voice = rawVoices[segment.speaker];
    voices[segment.speaker] = typeof voice === "string" && voiceById("gemini", voice) ? voice : (voices[segment.speaker] ?? DEFAULT_VOICE.gemini);
  }
  return {
    v: 1,
    to: record.to,
    from: typeof record.from === "string" ? record.from.slice(0, 12) : null,
    durationS: num(record.durationS) ?? segments[segments.length - 1]!.end,
    segments,
    voices,
  };
}
