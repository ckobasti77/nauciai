/**
 * Zvuk II (Crea K23): jeftin LLM (isti model i obrazac kao `creaLlmVoiceCore.ts`)
 * za dve stvari koje korisnik ne plaća kreditima:
 *
 * - A10 prevod uz pregled: rečenice transkripta → prevod, rečenica po rečenica,
 *   istim id-jevima (korisnik ga ispravi PRE izgovora);
 * - A12 „Ozvuči moj video": nekoliko kadrova klipa → kratak opis, raspoloženje,
 *   4 predloga muzike i do 3 efekta.
 *
 * Šablon zahteva, čitanje i sređivanje odgovora i deterministički DEMO bez ključa.
 * Mrežu radi `creaLlm.ts`.
 */

import type { CreaLlmLocale } from "./creaLlmCore";
import { parseJsonResponse } from "./creaLlmVideoCore";

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// ── A10: prevod rečenica ─────────────────────────────────────────────────────

/** Jezici prevoda - isti spisak kao sinhronizacija (`dubbing`), plus hrvatski. */
export const DUB_LANGUAGES = ["sr", "en", "de", "fr", "es", "it", "ru", "hr"] as const;
export type DubLanguage = (typeof DUB_LANGUAGES)[number];

export function isDubLanguage(value: unknown): value is DubLanguage {
  return typeof value === "string" && (DUB_LANGUAGES as readonly string[]).includes(value);
}

/** Ime jezika za model (engleski). Srpski je uvek latinica. */
const LANGUAGE_FOR_MODEL: Record<DubLanguage, string> = {
  sr: "Serbian (Latin script)",
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  ru: "Russian",
  hr: "Croatian",
};

export const TRANSLATE_LIMITS = { segments: 120, segmentChars: 500, totalChars: 15000, idChars: 12 } as const;
export const TRANSLATE_OUTPUT_TOKENS = 8000;

export type TranslateSegment = { id: string; text: string };
export type TranslateInput = { segments: TranslateSegment[]; to: DubLanguage; from: string | null };

/** Rečenice koje stvarno idu modelu: neprazne, očišćene, u granicama (redom). */
export function translateSegmentsInput(segments: readonly TranslateSegment[]): TranslateSegment[] {
  const out: TranslateSegment[] = [];
  let total = 0;
  for (const segment of segments) {
    if (out.length >= TRANSLATE_LIMITS.segments) break;
    const id = clip(segment.id, TRANSLATE_LIMITS.idChars);
    const text = clip(segment.text, TRANSLATE_LIMITS.segmentChars);
    if (!id || !text || out.some((entry) => entry.id === id)) continue;
    if (total + text.length > TRANSLATE_LIMITS.totalChars) break;
    total += text.length;
    out.push({ id, text });
  }
  return out;
}

const TRANSLATE_SYSTEM = `You translate the sentences of a video's transcript for dubbing: each sentence will be spoken by a voice in the target language in the same time slot.
Reply with JSON only, no markdown:
{"items":[{"id":"...","text":"..."}]}
Rules:
- One item per input sentence, with the same id. Never merge, split, skip or reorder sentences.
- Natural spoken language, not word-for-word. Keep about the same length as the original, so it fits the same time.
- Keep names, numbers and brand names. Do not add explanations, notes or quotes.
- If a sentence is already in the target language, keep it unchanged.
- For Serbian always use the Latin script.`;

export function buildTranslateRequest(input: TranslateInput) {
  const segments = translateSegmentsInput(input.segments);
  const user = [
    `Target language: ${LANGUAGE_FOR_MODEL[input.to]}.`,
    input.from ? `Source language code (detected): ${clip(input.from, 12)}.` : "Source language: detect it.",
    `Sentences:\n${JSON.stringify(segments)}`,
  ].join("\n\n");
  return {
    systemInstruction: { parts: [{ text: TRANSLATE_SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: TRANSLATE_OUTPUT_TOKENS },
  };
}

/** Prevod po id-ju; samo id-jevi koji su poslati. `null` kad odgovor ne valja ili je prazan. */
export function parseTranslateResponse(raw: unknown, ids: readonly string[]): Record<string, string> | null {
  const json = parseJsonResponse(raw);
  if (!json || !Array.isArray(json.items)) return null;
  const allowed = new Set(ids);
  const out: Record<string, string> = {};
  for (const entry of json.items) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const text = clip(record.text, TRANSLATE_LIMITS.segmentChars);
    if (allowed.has(id) && text && out[id] === undefined) out[id] = text;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** DEMO prevod bez ključa: ista rečenica sa oznakom jezika, da se ceo tok vidi. */
export function demoTranslate(input: TranslateInput): Record<string, string> {
  const out: Record<string, string> = {};
  for (const segment of translateSegmentsInput(input.segments)) out[segment.id] = `[${input.to.toUpperCase()} DEMO] ${segment.text}`;
  return out;
}

// ── A12: „Ozvuči moj video" ──────────────────────────────────────────────────

/** Kadrovi klipa (JPEG ~512 px, klijent ih smanji) i granice odgovora. */
export const SCORE_LIMITS = { frames: 4, frameBytes: 400_000, tracks: 4, effects: 3, promptChars: 300, labelChars: 60, summaryChars: 300 } as const;
export const SCORE_FRAME_TYPES = ["image/jpeg", "image/webp"] as const;
export const SCORE_OUTPUT_TOKENS = 1500;

export type ScoreTrack = { title: string; prompt: string };
export type ScoreEffect = { label: string; prompt: string };
export type ScorePlan = { summary: string; mood: string; tracks: ScoreTrack[]; effects: ScoreEffect[] };
export type ScoreInput = { durationS: number; locale: CreaLlmLocale };

const SCORE_SYSTEM = `You are a music supervisor. You see a few frames of a short video and suggest its soundtrack.
Reply with JSON only, no markdown:
{"summary":"...","mood":"...","tracks":[{"title":"...","prompt":"..."}],"effects":[{"label":"...","prompt":"..."}]}
Rules:
- "summary": one sentence in the user's language: what happens in the video.
- "mood": 1-3 words in the user's language.
- Exactly 4 "tracks", clearly different from each other (e.g. calm, upbeat, cinematic, playful) but all fitting the video.
  "title" is 2-4 words in the user's language; "prompt" is an English music-generation prompt (max 40 words): genre, instruments, tempo in BPM, mood. Instrumental only, no vocals. Never name real artists or songs.
- Up to 3 "effects" that match visible actions or places; "label" in the user's language (2-4 words), "prompt" a short English sound-effect description. Use [] when nothing fits.`;

export function buildScoreRequest(frames: ReadonlyArray<{ base64: string; mimeType: string }>, input: ScoreInput) {
  const language = input.locale === "sr" ? "Serbian (Latin script)" : "English";
  return {
    systemInstruction: { parts: [{ text: SCORE_SYSTEM }] },
    contents: [
      {
        role: "user",
        parts: [
          ...frames.slice(0, SCORE_LIMITS.frames).map((frame) => ({ inlineData: { mimeType: frame.mimeType, data: frame.base64 } })),
          { text: `User's language: ${language}.\nVideo length: ${Math.round(input.durationS)} seconds. The frames are in order.` },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.8, maxOutputTokens: SCORE_OUTPUT_TOKENS },
  };
}

export function parseScoreResponse(raw: unknown): ScorePlan | null {
  const json = parseJsonResponse(raw);
  if (!json || !Array.isArray(json.tracks)) return null;
  const tracks: ScoreTrack[] = [];
  for (const entry of json.tracks) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const prompt = clip(record.prompt, SCORE_LIMITS.promptChars);
    if (!prompt) continue;
    tracks.push({ title: clip(record.title, SCORE_LIMITS.labelChars) || `#${tracks.length + 1}`, prompt });
    if (tracks.length === SCORE_LIMITS.tracks) break;
  }
  if (tracks.length === 0) return null;
  const effects: ScoreEffect[] = [];
  for (const entry of Array.isArray(json.effects) ? json.effects : []) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const prompt = clip(record.prompt, SCORE_LIMITS.promptChars);
    if (!prompt) continue;
    effects.push({ label: clip(record.label, SCORE_LIMITS.labelChars) || prompt.slice(0, SCORE_LIMITS.labelChars), prompt });
    if (effects.length === SCORE_LIMITS.effects) break;
  }
  return { summary: clip(json.summary, SCORE_LIMITS.summaryChars), mood: clip(json.mood, SCORE_LIMITS.labelChars), tracks, effects };
}

/** DEMO predlog bez ključa: četiri različita žanra, da se ceo tok vidi i bez Google-a. */
export function demoScore(input: ScoreInput): ScorePlan {
  const sr = input.locale === "sr";
  return {
    summary: sr ? "DEMO (bez Google ključa): Crea ovde opiše šta se dešava u klipu." : "DEMO (no Google key): Crea describes what happens in the clip here.",
    mood: sr ? "vedro" : "bright",
    tracks: [
      { title: sr ? "Mirno jutro" : "Calm morning", prompt: "Calm acoustic guitar and soft piano, 80 BPM, warm and hopeful. Instrumental only, no vocals." },
      { title: sr ? "Puna energija" : "Full energy", prompt: "Upbeat electronic pop, punchy drums, bright synths, 120 BPM, energetic. Instrumental only, no vocals." },
      { title: sr ? "Filmski trenutak" : "Movie moment", prompt: "Cinematic orchestral build with strings and soft percussion, 90 BPM, emotional. Instrumental only, no vocals." },
      { title: sr ? "Zaigrano" : "Playful", prompt: "Playful ukulele, claps and glockenspiel, 110 BPM, cheerful. Instrumental only, no vocals." },
    ],
    effects: [{ label: sr ? "Lagani vetar" : "Light wind", prompt: "soft outdoor wind ambience" }],
  };
}
