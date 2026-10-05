/**
 * Čista logika glasova Cree (K22, A3/A7): granice, odluka o uzorku glasa, zahtev
 * za transkript pristanka i čitanje fal odgovora. Mrežu i bazu radi
 * `convex/creaVoices.ts`.
 */

import { sanitizeVoiceSettings } from "../lib/crea-voice-tags";
import { isVoiceEngineId, voiceById, type CreaVoice } from "../lib/crea-voices";

export const VOICE_FAVORITES_MAX = 100;
export const VOICE_PRESETS_MAX = 50;
export const VOICE_PRESET_NAME_MAX = 40;

/** Glas iz biblioteke ili `undefined` (nepoznat motor ili glas). */
export function libraryVoice(engine: string, voiceId: string): CreaVoice | undefined {
  return isVoiceEngineId(engine) ? voiceById(engine, voiceId) : undefined;
}

/** Podešavanje za čuvanje: samo poznata polja, u granicama (≤ 1 KB). */
export function presetSettingsJson(raw: string): string {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  return JSON.stringify(sanitizeVoiceSettings(parsed));
}

export function cleanPresetName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, VOICE_PRESET_NAME_MAX);
}

// ── Uzorci glasova (A3) ─────────────────────────────────────────────────────

/** Koliko se čeka na tuđ uzorak u izradi pre nego što se pokuša ponovo (ms). */
export const VOICE_SAMPLE_PENDING_MS = 2 * 60 * 1000;
/** Posle neuspeha, sledeći pokušaj tek posle ovoliko (ms) - mreža za trošak. */
export const VOICE_SAMPLE_RETRY_MS = 10 * 60 * 1000;

export type SampleRow = { status: "pending" | "ready" | "failed"; attemptedAt: number };
export type SampleDecision = "ready" | "pending" | "failed" | "go";

/**
 * Uzorak se pravi JEDNOM za sve korisnike: gotov se samo pusti, tuđ u izradi se
 * sačeka, skorašnji neuspeh se ne ponavlja odmah. Sve ostalo = napravi ga.
 */
export function sampleDecision(row: SampleRow | null, now: number): SampleDecision {
  if (!row) return "go";
  if (row.status === "ready") return "ready";
  if (row.status === "pending" && now - row.attemptedAt < VOICE_SAMPLE_PENDING_MS) return "pending";
  if (row.status === "failed" && now - row.attemptedAt < VOICE_SAMPLE_RETRY_MS) return "failed";
  return "go";
}

/** fal sinhrona ruta (`fal.run`) - za uzorak ElevenLabs glasa, bez webhooka. */
export const FAL_SYNC_TTS_URL = "https://fal.run/fal-ai/elevenlabs/tts/eleven-v3";
/** Tarifa reda `tts` ($ po hiljadu znakova) - trošak uzorka. */
export const ELEVEN_USD_PER_1K_CHARS = 0.1;

/** Adresa zvuka iz fal odgovora (`{ audio: { url } }`). */
export function readFalAudioUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const audio = (payload as { audio?: unknown }).audio;
  if (!audio || typeof audio !== "object") return null;
  const url = (audio as { url?: unknown }).url;
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
}

// ── Pristanak za kloniranje (A7, O5) ────────────────────────────────────────

export const CONSENT_AUDIO_MAX_BYTES = 1_500_000;
export const CONSENT_AUDIO_TYPES = ["audio/wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"] as const;
/** Koliko rečenica pristanka korisnik sme da zatraži za 24 h. */
export const CONSENTS_PER_DAY = 10;

/** Zahtev Gemini-ju (jeftin model, isti kao pomoćnik): doslovan transkript snimka. */
export function buildConsentTranscriptRequest(base64: string, mimeType: string) {
  return {
    systemInstruction: {
      parts: [
        {
          text: "You transcribe short voice recordings. Write exactly the words that are spoken, in the spoken language and script, with no comments, translation or corrections. If nothing is spoken, reply with an empty string.",
        },
      ],
    },
    contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: base64 } }, { text: "Transcript:" }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 400 },
  };
}

/** `audio/webm;codecs=opus` → `audio/webm`; nepoznat tip = `null`. */
export function consentAudioType(mimeType: string): (typeof CONSENT_AUDIO_TYPES)[number] | null {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  const normalized = base === "audio/x-wav" || base === "audio/wave" ? "audio/wav" : base;
  return (CONSENT_AUDIO_TYPES as readonly string[]).includes(normalized) ? (normalized as (typeof CONSENT_AUDIO_TYPES)[number]) : null;
}
