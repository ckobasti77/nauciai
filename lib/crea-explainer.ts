import {
  EXPLAINER_STYLE_FRAGMENTS,
  EXPLAINER_STYLE_IDS,
  type ExplainerPlan,
  type ExplainerStyleId,
} from "../convex/creaLlmVideoCore";
import { autoMontage, sceneLengthsFor } from "./crea-auto-montage";
import { jobCredits, type PricedJob, type PricedModel } from "./crea-job-price";
import { cuesFromWords, cueOptionsFor, wordsFromText, type CaptionScript, type CaptionStyle } from "./crea-subtitles";
import type { CreaTimelineV1, MediaRef, TimelineAspect } from "./crea-timeline";
import type { LocalizedText } from "./i18n";

/**
 * Objašnjavajući video (Crea K21, V28; plan K17 §6.4): lekcija ili tekst → scene
 * u stilu (tabla, štapići, papir, glina, pikseli) → jeftine slike (Nano Banana 2
 * Lite) + srpski glas (`tts`, jedan posao za celu naraciju) → montaža na uređaju:
 * Ken Burns po slici dok narator govori o njoj, titlovi iz teksta, prelaz „list
 * sveske" → MP4 (0 kr za montažu). Cena unapred i po minutu (cilj ~20-50 kr/min).
 */

export { EXPLAINER_STYLE_IDS, type ExplainerStyleId };

export const EXPLAINER_STYLES: ReadonlyArray<{ id: ExplainerStyleId; label: LocalizedText; hint: LocalizedText; fragment: string }> = [
  { id: "tabla", label: { sr: "Školska tabla", en: "Chalkboard" }, hint: { sr: "Kreda na zelenoj tabli", en: "Chalk on a green board" }, fragment: EXPLAINER_STYLE_FRAGMENTS.tabla },
  { id: "stapici", label: { sr: "Čiča-gliše", en: "Stick figures" }, hint: { sr: "Flomasterom, smešno i jasno", en: "With a marker, funny and clear" }, fragment: EXPLAINER_STYLE_FRAGMENTS.stapici },
  { id: "papir", label: { sr: "Isečen papir", en: "Paper cut-out" }, hint: { sr: "Šareni slojevi papira", en: "Colourful paper layers" }, fragment: EXPLAINER_STYLE_FRAGMENTS.papir },
  { id: "glina", label: { sr: "Glina", en: "Clay" }, hint: { sr: "Plastelin figurice", en: "Plasticine figures" }, fragment: EXPLAINER_STYLE_FRAGMENTS.glina },
  { id: "pikseli", label: { sr: "Pikseli", en: "Pixels" }, hint: { sr: "Kao stara video igra", en: "Like an old video game" }, fragment: EXPLAINER_STYLE_FRAGMENTS.pikseli },
];

export const EXPLAINER_LENGTHS = [30, 60, 90] as const;
export type ExplainerLength = (typeof EXPLAINER_LENGTHS)[number];

/** Modeli: najjeftinija Nano Banana za slike i jedini srpski glas u katalogu (do K22). */
export const EXPLAINER_MODELS = {
  image: { slug: "nano-banana-2-lite", inputMode: "text" },
  voice: { slug: "tts", inputMode: "text" },
} as const;

/** Srpski govor: oko 14 znakova u sekundi (isto kao `lib/crea-talking.ts`). */
const CHARS_PER_SECOND = 14;
/** Prelaz „list sveske" između scena (s). */
export const EXPLAINER_TRANSITION_S = 0.5;

export function narrationText(plan: Pick<ExplainerPlan, "scenes">): string {
  return plan.scenes.map((scene) => scene.narration.trim()).filter(Boolean).join(" ");
}

/** Procena trajanja naracije pre nego što glas postoji. */
export function estimateNarrationSeconds(plan: Pick<ExplainerPlan, "scenes">): number {
  const chars = narrationText(plan).length;
  return chars === 0 ? 0 : Math.max(3, Math.ceil(chars / CHARS_PER_SECOND));
}

export function sceneImagePrompt(visual: string, styleId: ExplainerStyleId): string {
  return `${visual.trim().replace(/[.\s]+$/, "")}. ${EXPLAINER_STYLE_FRAGMENTS[styleId]}. No text, no letters, no numbers in the picture.`;
}

/** Poslovi: po jedna slika na scenu i JEDAN glas za celu naraciju (isti glas, jedna cena po znaku). */
export function explainerJobs(plan: Pick<ExplainerPlan, "scenes">, input: { styleId: ExplainerStyleId; aspect: TimelineAspect; voice: string }) {
  const images: PricedJob[] = plan.scenes.map((scene) => ({
    modelSlug: EXPLAINER_MODELS.image.slug,
    inputMode: EXPLAINER_MODELS.image.inputMode,
    params: { prompt: sceneImagePrompt(scene.visual, input.styleId), aspect_ratio: input.aspect },
    measured: {},
  }));
  const text = narrationText(plan);
  const voice: PricedJob = {
    modelSlug: EXPLAINER_MODELS.voice.slug,
    inputMode: EXPLAINER_MODELS.voice.inputMode,
    params: { text, voice: input.voice },
    measured: { char_count: text.length },
  };
  return { images, voice };
}

export type ExplainerCost = { images: number | null; voice: number | null; total: number | null; perMinute: number | null; seconds: number };

/** Ukupna cena unapred (istom računicom kao server) i cena po minutu videa. */
export function explainerCost(plan: Pick<ExplainerPlan, "scenes">, input: { styleId: ExplainerStyleId; aspect: TimelineAspect; voice: string }, catalog: readonly PricedModel[]): ExplainerCost {
  const jobs = explainerJobs(plan, input);
  const seconds = estimateNarrationSeconds(plan);
  let images = 0;
  for (const job of jobs.images) {
    const credits = jobCredits(job, catalog);
    if (credits === null) return { images: null, voice: null, total: null, perMinute: null, seconds };
    images += credits;
  }
  const voice = jobCredits(jobs.voice, catalog);
  if (voice === null) return { images, voice: null, total: null, perMinute: null, seconds };
  const total = images + voice;
  return { images, voice, total, perMinute: seconds > 0 ? Math.round((total / seconds) * 60) : null, seconds };
}

/**
 * Gotov plan → montaža. Reči naracije se rasporede po slogovima preko pravog
 * trajanja glasa (TTS ne vraća vremena reči), scena počinje kad narator počne
 * njenu prvu reč, titlovi su te iste reči. Slike dobijaju Ken Burns, između
 * scena je „list sveske", naslov stoji prve 2,5 s.
 */
export function explainerTimeline(input: {
  plan: ExplainerPlan;
  images: readonly MediaRef[];
  voice: { ref: MediaRef; durationS: number };
  aspect: TimelineAspect;
  captions: { style: CaptionStyle; script: CaptionScript } | null;
  title: boolean;
}): CreaTimelineV1 {
  const scenes = input.plan.scenes.slice(0, input.images.length);
  const voiceLength = Math.max(1, input.voice.durationS);
  const total = voiceLength + 0.6;
  // Svaka scena počinje svojom prvom reči; reči cele naracije dele isto vreme.
  const words = wordsFromText(scenes.map((scene) => scene.narration).join(" "), 0.1, voiceLength);
  const starts: number[] = [];
  let wordIndex = 0;
  scenes.forEach((scene, index) => {
    starts.push(index === 0 ? 0 : (words[wordIndex]?.s ?? (index * total) / scenes.length));
    wordIndex += scene.narration.trim().split(/\s+/).filter(Boolean).length;
  });
  const lengths = sceneLengthsFor(starts, total, EXPLAINER_TRANSITION_S);
  return autoMontage({
    aspect: input.aspect,
    scenes: scenes.map((_, index) => ({ ref: input.images[index]!, media: "image", length: lengths[index]!, kenBurnsIndex: index })),
    transition: { kind: "list-sveske", duration: EXPLAINER_TRANSITION_S },
    titles: input.title && input.plan.title.trim() ? [{ text: input.plan.title.trim(), start: 0, end: Math.min(2.5, total), style: "naslov" }] : [],
    captions: input.captions ? { cues: cuesFromWords(words, cueOptionsFor(input.captions.style)), ...input.captions } : null,
    voice: { ref: input.voice.ref, length: voiceLength },
  });
}
