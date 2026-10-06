import type { LocalizedText } from "./i18n";
import { toolIdFromModelSlug } from "./crea-tools";

/** Licenca biblioteke zvučnih efekata (Kenney, `public/brand/crea/sfx`). */
export const SFX_LICENSE = {
  id: "CC0-1.0",
  name: "Creative Commons Zero (CC0 1.0)",
  url: "https://creativecommons.org/publicdomain/zero/1.0/",
  author: "Kenney (kenney.nl)",
} as const;

/**
 * Oznaka „Sigurno za objavu" (Crea K23, A21) na muzici, glasovima i efektima:
 * jedna rečenica koja početniku kaže sme li zvuk da ide na mrežu ili u reklamu,
 * i ODAKLE to znamo (izvor). Čisti podaci - nema pravnog saveta preko onoga što
 * stoji u uslovima provajdera.
 *
 * Tri vrste:
 * - `sigurno`: zvuk je napravljen od nule iz tvog opisa ili teksta, a provajder
 *   dozvoljava komercijalnu upotrebu (Google: „Google won't claim ownership over
 *   that content", https://ai.google.dev/gemini-api/terms; fal: model nosi oznaku
 *   „Commercial use" na svojoj strani);
 * - `cc0`: fajl iz besplatne biblioteke, javno dobro (CC0 1.0);
 * - `tvoj-snimak`: rezultat je izveden iz TVOG snimka (promena glasa, prevod,
 *   trake…) - prava su ista kao prava na taj snimak, pa oznake „sigurno" nema.
 *
 * Test traži oznaku za SVAKI zvučni model kataloga, pa nov model ne može da uđe
 * bez odluke o licenci.
 */

export type LicenseKind = "sigurno" | "cc0" | "tvoj-snimak";

export type LicenseTag = {
  kind: LicenseKind;
  /** Kratka oznaka na kartici. */
  label: LocalizedText;
  /** Jedna rečenica: zašto. */
  detail: LocalizedText;
  /** Odakle to znamo. */
  source: { label: string; url: string };
  /** Google SynthID: nečujan vodeni žig u svakom izlazu (Lyria, po zvaničnoj strani muzike). */
  synthId?: true;
};

const SAFE_LABEL: LocalizedText = { sr: "Sigurno za objavu", en: "Safe to publish" };

const GOOGLE_TERMS = { label: "Gemini API Additional Terms", url: "https://ai.google.dev/gemini-api/terms" };

function falSource(endpoint: string) {
  return { label: `fal.ai · ${endpoint} · Commercial use`, url: `https://fal.ai/models/${endpoint}` };
}

const GENERATED_DETAIL: LocalizedText = {
  sr: "Napravljeno od nule iz tvog opisa; provajder dozvoljava i komercijalnu upotrebu. Ne traži imena pravih izvođača ni tuđe tekstove pesama.",
  en: "Made from scratch from your description; the provider allows commercial use too. Do not ask for real artists' names or other people's lyrics.",
};

const VOICE_DETAIL: LocalizedText = {
  sr: "Ugrađen glas provajdera, napravljen iz tvog teksta; sme i u reklame i na mreže.",
  en: "A built-in provider voice, made from your text; fine for ads and social media.",
};

const YOUR_RECORDING: Omit<LicenseTag, "source"> = {
  kind: "tvoj-snimak",
  label: { sr: "Prava kao tvoj snimak", en: "Same rights as your recording" },
  detail: {
    sr: "Rezultat je napravljen od tvog snimka: smeš da ga objaviš ako smeš da objaviš i original (tvoj glas, tvoja muzika ili imaš dozvolu).",
    en: "The result is made from your recording: you may publish it if you may publish the original (your voice, your music, or you have permission).",
  },
};

function generated(source: LicenseTag["source"], options: { voice?: boolean; synthId?: boolean } = {}): LicenseTag {
  return {
    kind: "sigurno",
    label: SAFE_LABEL,
    detail: options.voice ? VOICE_DETAIL : GENERATED_DETAIL,
    source,
    ...(options.synthId ? { synthId: true as const } : {}),
  };
}

/** Oznaka za svaki zvučni model kataloga (i video→zvuk). */
const MODEL_LICENSES: Record<string, LicenseTag> = {
  "gemini-tts": generated(GOOGLE_TERMS, { voice: true }),
  tts: generated(falSource("fal-ai/elevenlabs/tts/eleven-v3"), { voice: true }),
  dialogue: generated(falSource("fal-ai/elevenlabs/text-to-dialogue/eleven-v3"), { voice: true }),
  "lyria-3-clip": generated(GOOGLE_TERMS, { synthId: true }),
  "lyria-35": generated(GOOGLE_TERMS, { synthId: true }),
  music: generated(falSource("fal-ai/elevenlabs/music")),
  sfx: generated(falSource("fal-ai/elevenlabs/sound-effects/v2")),
  "mmaudio-sfx": generated(falSource("fal-ai/mmaudio-v2/text-to-audio")),
  // Zvuk za tvoj video: sam zvuk je nov, napravljen iz slike - sme kao i ostali generisani.
  "kling-v2a": generated(falSource("fal-ai/kling-video/v2a")),
  "voice-changer": { ...YOUR_RECORDING, source: falSource("fal-ai/elevenlabs/voice-changer") },
  dubbing: { ...YOUR_RECORDING, source: falSource("fal-ai/elevenlabs/dubbing") },
  "audio-isolation": { ...YOUR_RECORDING, source: falSource("fal-ai/elevenlabs/audio-isolation") },
  stems: { ...YOUR_RECORDING, source: falSource("fal-ai/demucs") },
  stt: { ...YOUR_RECORDING, source: falSource("fal-ai/elevenlabs/speech-to-text/scribe-v2") },
};

export const CC0_TAG: LicenseTag = {
  kind: "cc0",
  label: { sr: "CC0 · sigurno za objavu", en: "CC0 · safe to publish" },
  detail: {
    sr: "Javno dobro: slobodno i za reklame, bez navođenja autora (Kenney).",
    en: "Public domain: free even for ads, no credit needed (Kenney).",
  },
  source: { label: SFX_LICENSE.name, url: SFX_LICENSE.url },
};

/** Lokalni zvučni rezultati alata: spoj generisanih glasova je siguran, a obrada tvog snimka nije. */
const TOOL_LICENSES: Record<string, LicenseTag> = {
  "zvuk.dijalog": MODEL_LICENSES["gemini-tts"]!,
  "zvuk.podkast": MODEL_LICENSES["gemini-tts"]!,
  // Petlja (K23) se pravi na uređaju od numere bilo kog motora - bez tvrdnje o SynthID-u.
  "zvuk.muzika": generated(GOOGLE_TERMS),
  "zvuk.promena": { ...YOUR_RECORDING, source: falSource("fal-ai/elevenlabs/voice-changer") },
  "zvuk.prevod": { ...YOUR_RECORDING, source: GOOGLE_TERMS },
  "zvuk.ozvuci": { ...YOUR_RECORDING, source: GOOGLE_TERMS },
  "zvuk.trake": { ...YOUR_RECORDING, source: falSource("fal-ai/demucs") },
  // Iz biblioteke se u galeriju čuva CC0 fajl (plaćen efekat je posao svog modela).
  "zvuk.efekti": CC0_TAG,
};



export function licenseForModel(slug: string): LicenseTag | null {
  return MODEL_LICENSES[slug] ?? null;
}

/** Oznaka za rad iz galerije: plaćeni model ili lokalni alat (`local:<alat>`). */
export function licenseForJob(job: { modelSlug: string }): LicenseTag | null {
  const toolId = toolIdFromModelSlug(job.modelSlug);
  return toolId ? (TOOL_LICENSES[toolId] ?? null) : licenseForModel(job.modelSlug);
}

/** Sme li bez razmišljanja na mrežu (napravljeno od nule ili CC0). */
export function isSafeToPublish(tag: LicenseTag | null): boolean {
  return tag?.kind === "sigurno" || tag?.kind === "cc0";
}

export const LICENSE_SYNTHID_NOTE: LocalizedText = {
  sr: "Nosi nečujan Google SynthID vodeni žig - po njemu se zna da je zvuk napravio AI.",
  en: "Carries an inaudible Google SynthID watermark - it marks the audio as AI-made.",
};
