import type { LocalizedText } from "./i18n";
import { jobCredits, type PricedModel } from "./crea-job-price";

/**
 * Lik koji govori (V21), lipsync (V22) i „Napiši → izgovori → oživi" (V23) -
 * Crea K20, plan K17 §5. Jedan alat, lanac od 2-3 postojeća posla, ukupna cena
 * unapred (K17-18):
 *
 * 1. **scena** (po želji, samo uz Lik): Nano Banana 2 nacrta Lika u sceni
 *    Selfi · Podkast · Vesti · Predavanje · Auto (slike Lika kao reference);
 * 2. **glas**: tekst → srpski govor (`tts`, ElevenLabs v3 - jedini srpski glas u
 *    katalogu dok K22 ne doda Gemini TTS), ili snimak mikrofonom, ili fajl;
 * 3. **video**: Kling avatar (slika + glas) ILI Kling lipsync (tvoj video iz
 *    Cree + glas). Trajanje = trajanje glasa (avatar 1-60 s).
 *
 * Lice je samo sopstveni Lik sa pristankom ili rad koji je Crea napravila (K17-15,
 * O5) - to proverava SERVER (`creaFaceJobs`). Čiste funkcije, test:
 * `crea-talking.test.ts`.
 */

export const TALKING_SCENE_IDS = ["bez", "selfi", "podkast", "vesti", "predavanje", "auto"] as const;
export type TalkingSceneId = (typeof TALKING_SCENE_IDS)[number];

export type TalkingScene = {
  id: TalkingSceneId;
  label: LocalizedText;
  hint: LocalizedText;
  /** Odnos slike i videa; `null` = ostaje fotka Lika kakva jeste. */
  aspect: "9:16" | "16:9" | null;
  /** Engleski opis mesta (za Nano Bananu 2). */
  setting: string;
};

export const TALKING_SCENES: readonly TalkingScene[] = [
  {
    id: "bez",
    label: { sr: "Bez scene", en: "No scene" },
    hint: { sr: "Govori fotka Lika, kakva jeste. Najjeftinije.", en: "The character's photo talks as it is. Cheapest." },
    aspect: null,
    setting: "",
  },
  {
    id: "selfi",
    label: { sr: "Selfi", en: "Selfie" },
    hint: { sr: "Telefon u ruci, ulica iza.", en: "Phone in hand, a street behind." },
    aspect: "9:16",
    setting: "a casual selfie video frame, the phone held at arm's length, a sunny city street softly blurred behind",
  },
  {
    id: "podkast",
    label: { sr: "Podkast", en: "Podcast" },
    hint: { sr: "Mikrofon, topla svetla studija.", en: "A microphone, warm studio lights." },
    aspect: "16:9",
    setting: "a cosy podcast studio, seated behind a professional microphone on a boom arm, warm lamps and acoustic panels behind",
  },
  {
    id: "vesti",
    label: { sr: "Vesti", en: "News" },
    hint: { sr: "Za stolom kao voditelj dnevnika.", en: "At the desk like a news anchor." },
    aspect: "16:9",
    setting: "a TV news studio, seated at the news desk in a smart jacket, softly blurred studio screens behind",
  },
  {
    id: "predavanje",
    label: { sr: "Predavanje", en: "Lecture" },
    hint: { sr: "Pored table, kao na času.", en: "Next to a whiteboard, like in class." },
    aspect: "16:9",
    setting: "a bright classroom, standing next to a whiteboard with simple hand-drawn diagrams",
  },
  {
    id: "auto",
    label: { sr: "Auto", en: "Car" },
    hint: { sr: "Vlog iz parkiranog auta.", en: "A vlog from a parked car." },
    aspect: "9:16",
    setting: "the driver's seat of a parked car, filmed from a phone on the dashboard, soft daylight through the windows",
  },
];

export function talkingScene(id: TalkingSceneId): TalkingScene {
  return TALKING_SCENES.find((scene) => scene.id === id) ?? TALKING_SCENES[0]!;
}

export const TALKING_MODELS = {
  scene: { slug: "nano-banana-2", inputMode: "image_multi", resolution: "1K" },
  voice: { slug: "tts", inputMode: "text" },
  avatar: { slug: "kling-avatar", inputMode: "image_audio" },
  lipsync: { slug: "kling-lipsync", inputMode: "video_audio" },
} as const;

/** Najviše slika Lika koje idu uz scenu (prostor za pozu ostaje). */
export const SCENE_REFS_MAX = 3;

function imageRange(count: number): string {
  return count <= 1 ? "Image 1 shows" : `Images 1-${count} show`;
}

/** Opis scene za Nano Bananu 2: Lik iz referenci, lice jasno, usta zatvorena, jedna osoba. */
export function scenePrompt(scene: TalkingScene, element: { name: string; description?: string | null }, refCount: number): string {
  const name = element.name.trim() || "the character";
  const note = element.description?.trim() ? ` (${element.description.trim()})` : "";
  return [
    `${imageRange(Math.max(1, refCount))} ${name}${note}.`,
    `Create a photorealistic, well-lit photo of ${name} for a talking video: ${scene.setting}.`,
    `${name} looks straight into the camera with a relaxed, closed-mouth expression; the face is fully visible, head and shoulders in the frame.`,
    "Keep the same face, hairstyle and outfit as in the reference images. Only one person in the picture, no text, no logos.",
  ].join(" ");
}

/** Parametri posla scene (bez cene). */
export function sceneParams(scene: TalkingScene, element: { name: string; description?: string | null }, refCount: number): Record<string, string> {
  return { prompt: scenePrompt(scene, element, refCount), resolution: TALKING_MODELS.scene.resolution, aspect_ratio: scene.aspect ?? "1:1" };
}

/** Srpski govor: oko 14 znakova u sekundi (≈ 2,5 reči). */
export const SPEECH_CHARS_PER_SECOND = 14;
/** Avatar traje najviše 60 s - to je ~800 znakova; ostavljamo prostor za pauze. */
export const TALKING_TEXT_MAX = 700;
export const TALKING_SECONDS = { min: 1, max: 60 } as const;

/** Procena trajanja izgovorenog teksta (za cenu pre nego što glas postoji). */
export function estimateSpeechSeconds(text: string): number {
  const chars = text.trim().length;
  if (chars === 0) return 0;
  return Math.min(TALKING_SECONDS.max, Math.max(TALKING_SECONDS.min, Math.ceil(chars / SPEECH_CHARS_PER_SECOND)));
}

export type TalkingOutput = "avatar" | "usne";
export type TalkingVoice = "tekst" | "snimak" | "fajl";

export type TalkingPlanInput = {
  output: TalkingOutput;
  /** Scena samo za avatar sa Likom. */
  scene: TalkingSceneId;
  element: { name: string; description?: string | null } | null;
  refCount: number;
  voice: TalkingVoice;
  text: string;
  voiceName: string;
  /** Trajanje snimka ili fajla (s); za tekst je procena. */
  audioSeconds: number | null;
  /** Trajanje videa za lipsync (s). */
  videoSeconds: number | null;
  quality: "720p" | "1080p";
};

export type TalkingStepId = "scena" | "glas" | "video";
export type TalkingStep = {
  id: TalkingStepId;
  modelSlug: string;
  inputMode: string;
  params: Record<string, string | number | boolean>;
  /** Količine koje server meri (za cenu na dugmetu, ista računica kao naplata). */
  measured: Record<string, number>;
};

export type TalkingProblem =
  | "nema-teksta"
  | "predug-tekst"
  | "nema-glasa"
  | "glas-predug"
  | "glas-prekratak"
  | "video-predug"
  | "nema-videa";

/** Trajanje glasa: izmereno (snimak, fajl) ili procenjeno iz teksta. */
export function voiceSeconds(input: Pick<TalkingPlanInput, "voice" | "text" | "audioSeconds">): number | null {
  if (input.voice === "tekst") return estimateSpeechSeconds(input.text) || null;
  return input.audioSeconds;
}

/** Šta još fali (ili `null`). */
export function talkingProblem(input: TalkingPlanInput): TalkingProblem | null {
  if (input.voice === "tekst") {
    if (input.text.trim().length === 0) return "nema-teksta";
    if (input.text.trim().length > TALKING_TEXT_MAX) return "predug-tekst";
  } else {
    if (input.audioSeconds === null) return "nema-glasa";
    if (input.audioSeconds < TALKING_SECONDS.min) return "glas-prekratak";
    if (input.audioSeconds > TALKING_SECONDS.max + 0.05) return "glas-predug";
  }
  if (input.output === "usne") {
    if (input.videoSeconds === null) return "nema-videa";
    if (input.videoSeconds > TALKING_SECONDS.max + 0.05) return "video-predug";
  }
  return null;
}

/** Koraci lanca, redom. Scena samo za avatar sa Likom i izabranom scenom; glas samo za tekst. */
export function talkingSteps(input: TalkingPlanInput): TalkingStep[] {
  const steps: TalkingStep[] = [];
  const scene = talkingScene(input.scene);
  if (input.output === "avatar" && input.element && scene.aspect) {
    steps.push({
      id: "scena",
      modelSlug: TALKING_MODELS.scene.slug,
      inputMode: TALKING_MODELS.scene.inputMode,
      params: sceneParams(scene, input.element, Math.min(SCENE_REFS_MAX, Math.max(1, input.refCount))),
      measured: {},
    });
  }
  if (input.voice === "tekst") {
    const text = input.text.trim();
    steps.push({
      id: "glas",
      modelSlug: TALKING_MODELS.voice.slug,
      inputMode: TALKING_MODELS.voice.inputMode,
      params: { text, voice: input.voiceName },
      measured: { char_count: text.length },
    });
  }
  const seconds = voiceSeconds(input) ?? TALKING_SECONDS.min;
  if (input.output === "avatar") {
    steps.push({
      id: "video",
      modelSlug: TALKING_MODELS.avatar.slug,
      inputMode: TALKING_MODELS.avatar.inputMode,
      params: { quality: input.quality },
      measured: { duration: seconds },
    });
  } else {
    steps.push({
      id: "video",
      modelSlug: TALKING_MODELS.lipsync.slug,
      inputMode: TALKING_MODELS.lipsync.inputMode,
      params: { source: "audio" },
      measured: { duration: input.videoSeconds ?? TALKING_SECONDS.min },
    });
  }
  return steps;
}

export type TalkingCatalogModel = PricedModel;

/** Cena jednog koraka: ista računica kao server (`jobCredits`). */
export function stepCredits(step: TalkingStep, catalog: readonly TalkingCatalogModel[]): number | null {
  return jobCredits(step, catalog);
}

/** Ukupna cena lanca unapred; `null` kad bilo koji korak nema cenu (model nedostupan). */
export function talkingCredits(steps: readonly TalkingStep[], catalog: readonly TalkingCatalogModel[]): number | null {
  let total = 0;
  for (const step of steps) {
    const credits = stepCredits(step, catalog);
    if (credits === null) return null;
    total += credits;
  }
  return total;
}

/**
 * Glas je duži od procene pa video košta primetno više nego što je pisalo na
 * dugmetu: pre poslednjeg koraka korisnik ponovo potvrđuje (K17-18).
 */
export function needsPriceConfirm(estimated: number, actual: number): boolean {
  return actual > Math.round(estimated * 1.1) + 1;
}

// ── Lanac na klijentu ────────────────────────────────────────────────────────

export type ChainJobState = "idle" | "waiting" | "done" | "demo" | "failed";

export type TalkingChainState = {
  /** `skip` = lanac nema scenu. */
  scene: ChainJobState | "skip";
  /** Glas iz teksta; `skip` = snimak ili fajl (već okačen i izmeren). */
  voice: ChainJobState | "skip";
  /** Izmeren zvuk za avatar/lipsync postoji. */
  audioReady: boolean;
  final: ChainJobState;
};

export type TalkingNext =
  | { kind: "wait" }
  | { kind: "prepare-voice"; demo: boolean }
  | { kind: "start-final"; face: "scene" | "selected" }
  | { kind: "done" }
  | { kind: "failed"; step: TalkingStepId };

/**
 * Sledeći korak lanca iz stanja poslova. Scena i glas idu uporedo; video kreće
 * kad je zvuk izmeren i scena gotova (ili je nema). DEMO glas (plakat bez zvuka)
 * traži probni zvuk na uređaju; DEMO scena (plakat) se preskače i govori fotka Lika.
 */
export function talkingNext(state: TalkingChainState): TalkingNext {
  if (state.scene === "failed") return { kind: "failed", step: "scena" };
  if (state.voice === "failed") return { kind: "failed", step: "glas" };
  if (state.final === "failed") return { kind: "failed", step: "video" };
  if (state.final === "done" || state.final === "demo") return { kind: "done" };
  if (state.final === "waiting") return { kind: "wait" };
  if (!state.audioReady && (state.voice === "done" || state.voice === "demo")) {
    return { kind: "prepare-voice", demo: state.voice === "demo" };
  }
  const sceneSettled = state.scene === "skip" || state.scene === "done" || state.scene === "demo";
  if (state.audioReady && sceneSettled) return { kind: "start-final", face: state.scene === "done" ? "scene" : "selected" };
  return { kind: "wait" };
}

// ── DEMO glas (bez ključa provajdera) ────────────────────────────────────────

/**
 * DEMO posao govora (bez `FAL_KEY`, O3) vraća plakat, ne zvuk - a avatar traži
 * pravi snimak čije trajanje server meri. Za DEMO lanac uređaj zato napravi
 * PROBNI zvuk procenjene dužine („mrmljanje" od tona sa ritmom slogova), jasno
 * označen kao DEMO, i lanac ide do kraja. 16-bitni mono WAV.
 */
export function demoSpeechWav(seconds: number, sampleRate = 16000): Uint8Array {
  const count = Math.max(1, Math.round(Math.min(TALKING_SECONDS.max, Math.max(TALKING_SECONDS.min, seconds)) * sampleRate));
  const samples = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const t = index / sampleRate;
    // Slogovi ~4 u sekundi, kratka pauza svake 2 s - usta avatara imaju šta da prate.
    const syllable = Math.max(0, Math.sin(2 * Math.PI * 4 * t));
    const phrase = t % 2 < 1.7 ? 1 : 0;
    const pitch = 150 + 25 * Math.sin(2 * Math.PI * 0.7 * t);
    samples[index] = 0.35 * syllable * phrase * Math.sin(2 * Math.PI * pitch * t);
  }
  return pcmWav(samples, sampleRate);
}

/**
 * Mono 16-bitni WAV od uzoraka -1..1. Služi i za snimak mikrofona (K20): WebM iz
 * `MediaRecorder`-a nema trajanje u zaglavlju, a WAV ima - server ga meri.
 */
export function pcmWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]!));
    view.setInt16(44 + index * 2, Math.round(value * 32767), true);
  }
  return bytes;
}
