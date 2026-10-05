import type { LocalizedText } from "./i18n";
import { DEFAULT_VOICE, voiceById, voiceEngine, type VoiceEngineId } from "./crea-voices";

/**
 * Emocije kao nalepnice (Crea K22, A4). Korisnik u tekst ubacuje nalepnice na
 * svom jeziku („[šapuće]", „[pauza 1s]"), a pre slanja se prevode u ono što
 * motor razume:
 *
 * - Gemini 3.8 Flash TTS: tagovi u uglastim zagradama `<whispers>`, `<laugh>`,
 *   `<short pause>`… i stil cele replike kao opis (`speech_metadata.style`)
 *   (https://ai.google.dev/gemini-api/docs/speech-generation, 2026-10-05);
 * - ElevenLabs Eleven v3: tagovi `[whispers]`, `[laughs]`, `[sighs]`…; pauze samo
 *   tačkama („..."), jer v3 nema SSML pauze
 *   (https://elevenlabs.io/docs/best-practices/prompting/eleven-v4 - važi i za v3).
 *
 * Raspoloženje, brzina, visina i „opiši kako da zvuči" su za Gemini delovi
 * opisa stila; ElevenLabs ima pravi parametar brzine, raspoloženje kao početni
 * tag, a visinu i slobodan opis ne ume (UI ih tada gasi).
 */

export type VoiceSticker = {
  id: string;
  label: LocalizedText;
  gemini: string;
  eleven: string;
};

export const VOICE_STICKERS: readonly VoiceSticker[] = [
  { id: "sapuce", label: { sr: "[šapuće]", en: "[whispers]" }, gemini: "<whispers>", eleven: "[whispers]" },
  { id: "smeh", label: { sr: "[smeje se]", en: "[laughs]" }, gemini: "<laugh>", eleven: "[laughs]" },
  { id: "kikot", label: { sr: "[kikoće se]", en: "[giggles]" }, gemini: "<giggle>", eleven: "[laughs]" },
  { id: "uzdah", label: { sr: "[uzdah]", en: "[sighs]" }, gemini: "<sigh>", eleven: "[sighs]" },
  { id: "izdah", label: { sr: "[izdahne]", en: "[exhales]" }, gemini: "<exhales>", eleven: "[exhales]" },
  { id: "place", label: { sr: "[plače]", en: "[cries]" }, gemini: "<cry>", eleven: "[crying]" },
  { id: "pauza1", label: { sr: "[pauza 1s]", en: "[pause 1s]" }, gemini: "<short pause>", eleven: "..." },
  { id: "pauza2", label: { sr: "[pauza 2s]", en: "[pause 2s]" }, gemini: "<long pause>", eleven: "... ..." },
];

function fold(text: string): string {
  return text.toLowerCase().replace(/đ/g, "dj").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

const BY_LABEL = new Map<string, VoiceSticker>();
for (const sticker of VOICE_STICKERS) {
  BY_LABEL.set(fold(sticker.label.sr.slice(1, -1)), sticker);
  BY_LABEL.set(fold(sticker.label.en.slice(1, -1)), sticker);
}

/** Nalepnica iz teksta u zagradi (bez zagrada), na bilo kom jeziku, sa ili bez kvačica. */
export function stickerByWord(word: string): VoiceSticker | undefined {
  return BY_LABEL.get(fold(word));
}

/**
 * Tekst sa nalepnicama → tekst za motor. Nepoznata zagrada ostaje kakva jeste
 * (ElevenLabs razume i svoje slobodne tagove, npr. „[excited]").
 */
export function translateStickers(text: string, engine: VoiceEngineId): string {
  return text
    .replace(/\[([^\]\n]{1,24})\]/g, (whole, word: string) => {
      const sticker = stickerByWord(word);
      return sticker ? sticker[engine] : whole;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Koliko nalepnica tekst ima (za brojač u UI-ju). */
export function countStickers(text: string): number {
  let count = 0;
  for (const match of text.matchAll(/\[([^\]\n]{1,24})\]/g)) if (stickerByWord(match[1]!)) count += 1;
  return count;
}

// ── Raspoloženje, brzina, visina ────────────────────────────────────────────

export const VOICE_MOODS = [-2, -1, 0, 1, 2] as const;
export type VoiceMood = (typeof VOICE_MOODS)[number];

export const VOICE_MOOD_LABELS: Record<VoiceMood, LocalizedText> = {
  [-2]: { sr: "Tužno", en: "Sad" },
  [-1]: { sr: "Smireno", en: "Calm" },
  0: { sr: "Prirodno", en: "Natural" },
  1: { sr: "Veselo", en: "Cheerful" },
  2: { sr: "Uzbuđeno", en: "Excited" },
};

const MOOD_STYLE: Record<VoiceMood, string> = {
  [-2]: "sad and quiet",
  [-1]: "calm and relaxed",
  0: "",
  1: "cheerful and friendly",
  2: "excited and energetic",
};

/**
 * ElevenLabs: raspoloženje kao početni tag. `[excited]` je na spisku primera; ostala
 * tri su slobodni tagovi koje v3 prima (nisu na spisku - ODLUKA K22).
 */
const MOOD_TAG: Record<VoiceMood, string> = { [-2]: "[sad]", [-1]: "[calm]", 0: "", 1: "[cheerful]", 2: "[excited]" };

export const VOICE_SPEEDS = [0.8, 0.9, 1, 1.1, 1.2] as const;
export type VoiceSpeed = (typeof VOICE_SPEEDS)[number];

const SPEED_STYLE: Record<string, string> = {
  "0.8": "speaking slowly",
  "0.9": "speaking a little slowly",
  "1": "",
  "1.1": "speaking a little faster",
  "1.2": "speaking quickly",
};

export const VOICE_PITCHES = [-1, 0, 1] as const;
export type VoicePitch = (typeof VOICE_PITCHES)[number];

const PITCH_STYLE: Record<VoicePitch, string> = { [-1]: "with a lower pitch", 0: "", 1: "with a higher pitch" };

export const VOICE_DESCRIBE_MAX = 200;
/** Isto kao `max` kontrole `style` reda `gemini-tts`. */
export const VOICE_STYLE_MAX = 300;

export type VoiceSettings = {
  mood: VoiceMood;
  speed: VoiceSpeed;
  pitch: VoicePitch;
  /** „Opiši kako da zvuči" (samo Gemini). */
  describe: string;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { mood: 0, speed: 1, pitch: 0, describe: "" };

function nearest<T extends number>(values: readonly T[], value: unknown, fallback: T): T {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return values.reduce((best, current) => (Math.abs(current - value) < Math.abs(best - value) ? current : best), values[0]!);
}

/** Podešavanje iz nepouzdanog izvora (URL, `localStorage`, sačuvan red). */
export function sanitizeVoiceSettings(raw: unknown): VoiceSettings {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    mood: nearest(VOICE_MOODS, record.mood, 0),
    speed: nearest(VOICE_SPEEDS, record.speed, 1),
    pitch: nearest(VOICE_PITCHES, record.pitch, 0),
    describe: typeof record.describe === "string" ? record.describe.replace(/\s+/g, " ").trim().slice(0, VOICE_DESCRIBE_MAX) : "",
  };
}

/** Opis stila za Gemini (`speech_metadata.style`), ≤ 300 znakova; prazno = prirodno. */
export function geminiStyle(settings: VoiceSettings): string {
  return [MOOD_STYLE[settings.mood], SPEED_STYLE[String(settings.speed)] ?? "", PITCH_STYLE[settings.pitch], settings.describe.trim()]
    .filter((part) => part.length > 0)
    .join(", ")
    .slice(0, VOICE_STYLE_MAX);
}

export type SpeechJob = {
  modelSlug: string;
  inputMode: "text";
  params: Record<string, string | number | boolean>;
};

/**
 * Posao govora za izabran motor (A2/A4): prevedene nalepnice, glas i stil. Isti
 * oblik ide u `studio.createJob`; broj znakova za cenu je dužina `params.text`
 * (server ga meri sam).
 */
export function buildSpeechJob(input: { engine: VoiceEngineId; voiceId: string; text: string; settings: VoiceSettings }): SpeechJob {
  const engine = voiceEngine(input.engine);
  const voice = voiceById(input.engine, input.voiceId)?.id ?? DEFAULT_VOICE[input.engine];
  const spoken = translateStickers(input.text, input.engine);
  if (input.engine === "gemini") {
    const style = geminiStyle(input.settings);
    return { modelSlug: engine.modelSlug, inputMode: "text", params: { text: spoken, voice, ...(style ? { style } : {}) } };
  }
  const tag = MOOD_TAG[input.settings.mood];
  return {
    modelSlug: engine.modelSlug,
    inputMode: "text",
    params: { text: tag ? `${tag} ${spoken}` : spoken, voice, speed: input.settings.speed },
  };
}

/** Broj znakova koji se naplaćuje (= dužina teksta koji motor dobija). */
export function speechChars(job: SpeechJob): number {
  return typeof job.params.text === "string" ? job.params.text.length : 0;
}
