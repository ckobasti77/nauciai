import {
  elementInputs,
  promptWithElements,
  type ElementLike,
  type ReferenceModelLike,
} from "../convex/creaElementsCore";
import { autoMontage, type AutoScene } from "./crea-auto-montage";
import { cameraMoveById } from "./crea-camera-moves";
import { SHOT_TYPE_INFO, type StoryboardAspect, type StoryboardQuality, type StoryShot } from "../convex/creaStoryboardsCore";
import { composeVideoPrompt, effectParamsFor, type VideoPromptModel } from "./crea-director";
import { jobCredits, type PricedModel } from "./crea-job-price";
import { cuesFromWords, wordsFromText, type CaptionCue } from "./crea-subtitles";
import type { CreaTimelineV1, MediaRef, TimelineAspect } from "./crea-timeline";
import type { LocalizedText } from "./i18n";

/**
 * Strip → film (Crea K21, V10; plan K17 §4): priča → 3-8 kadrova kao strip u
 * svesci (svaka kartica uči vrstu kadra) → slika po kadru sa istim Likom (S34,
 * slike Lika + prvi kadar kao referenca) → animacija svakog kadra → automatska
 * montaža (K19). Ukupna cena unapred, istom računicom kao server (K17-18).
 * Čiste funkcije za klijent; kadrovi i njihova pravila (vrste kadrova, granice)
 * su u `convex/creaStoryboardsCore.ts`, jer ih proverava i server.
 */

/**
 * Modeli po kvalitetu (plan K17 §4.1): „Jeftino" = Nano Banana 2 Lite +
 * najjeftiniji model koji oživljava sliku (pravilo `animate` iz `lib/crea-auto.ts`:
 * Hailuo 2.3 Fast 768p); „Lepše" = Nano Banana 2 (1K) + Veo 3.1 Lite (720p, sa zvukom).
 */
export const STORYBOARD_QUALITY: Record<
  StoryboardQuality,
  { label: LocalizedText; hint: LocalizedText; image: { slug: string; params: Record<string, string> }; video: { slug: string; params: Record<string, string> } }
> = {
  jeftino: {
    label: { sr: "Jeftino", en: "Cheap" },
    hint: { sr: "Nano Banana 2 Lite + Hailuo 2.3 Fast", en: "Nano Banana 2 Lite + Hailuo 2.3 Fast" },
    image: { slug: "nano-banana-2-lite", params: {} },
    video: { slug: "hailuo-23-fast", params: { resolution: "768p" } },
  },
  lepse: {
    label: { sr: "Lepše", en: "Nicer" },
    hint: { sr: "Nano Banana 2 + Veo 3.1 Lite sa zvukom", en: "Nano Banana 2 + Veo 3.1 Lite with sound" },
    image: { slug: "nano-banana-2", params: { resolution: "1K" } },
    video: { slug: "veo-31-lite", params: { resolution: "720p" } },
  },
};

// ── Poslovi ─────────────────────────────────────────────────────────────────

export type StoryElement = ElementLike & { id: string };
export type CatalogModel = PricedModel & ReferenceModelLike & VideoPromptModel;

export type ShotImageJob = {
  modelSlug: string;
  inputMode: string;
  params: Record<string, string>;
  measured: Record<string, number>;
  /** Slike koje idu u slot `image`, redom: prvi kadar (ako ga ima), pa slike Likova. */
  images: Array<{ kind: "prvi-kadar" } | { kind: "lik"; storageId: string }>;
};

/**
 * Posao slike za kadar: vrsta kadra + opis + stil, Likovi iz kadra kao
 * reference (S34, `elementInputs`), a za kadrove 2..N i slika prvog kadra - da
 * lik, odeća i stil ostanu isti kroz ceo strip (plan K17 §4.1, korak 4).
 */
export function shotImageJob(input: {
  shot: StoryShot;
  quality: StoryboardQuality;
  aspect: StoryboardAspect;
  styleFragment: string | null;
  elements: readonly StoryElement[];
  model: ReferenceModelLike;
  withFirstShot: boolean;
}): ShotImageJob {
  const preset = STORYBOARD_QUALITY[input.quality].image;
  const used = input.elements.filter((element) => input.shot.elements.includes(element.handle));
  const base = [
    `${SHOT_TYPE_INFO[input.shot.shotType].phrase}: ${input.shot.imagePrompt.replace(/[.\s]+$/, "")}`,
    input.styleFragment,
    "a single cinematic film frame, no text, no captions, no speech bubbles, no panel borders",
  ]
    .filter(Boolean)
    .join(". ");
  const existing = input.withFirstShot ? 1 : 0;
  const mapping = used.length > 0 || existing > 0 ? elementInputs(used, input.model, { currentMode: "text", existingImages: existing }) : null;
  const refs = mapping?.ok ? mapping.refs : [];
  let prompt = promptWithElements(base, input.elements, refs);
  if (input.withFirstShot) {
    prompt = `${prompt}\n\nImage 1 is the first frame of the same film: keep the same characters, outfits, art style, colours and lighting.`;
  }
  const images: ShotImageJob["images"] = [
    ...(input.withFirstShot ? [{ kind: "prvi-kadar" as const }] : []),
    ...refs.flatMap((ref) => ref.images.map((image) => ({ kind: "lik" as const, storageId: image.storageId }))),
  ];
  const inputMode = images.length > 0 && mapping?.ok ? mapping.inputMode : "text";
  return {
    modelSlug: preset.slug,
    inputMode,
    params: { prompt, aspect_ratio: input.aspect, ...preset.params },
    measured: {},
    images: inputMode === "text" ? [] : images,
  };
}

export type ShotVideoJob = { modelSlug: string; inputMode: "image"; params: Record<string, string | number>; measured: Record<string, number> };

/** Posao videa: slika kadra oživi pokretom iz kadra (`composeVideoPrompt`), trajanje svedeno na vrednosti modela. */
export function shotVideoJob(shot: StoryShot, quality: StoryboardQuality, model: VideoPromptModel): ShotVideoJob {
  const preset = STORYBOARD_QUALITY[quality].video;
  const prompt = composeVideoPrompt({ prompt: shot.motionPrompt, move: cameraMoveById(shot.move) ?? null, model }).text;
  return {
    modelSlug: preset.slug,
    inputMode: "image",
    params: { prompt, ...preset.params, ...effectParamsFor({ params: { duration: shot.durationS } }, model, "image") },
    measured: {},
  };
}

/** Koliko kadar traje kad je oživljen (vrednost koju model stvarno prima). */
export function shotVideoSeconds(job: ShotVideoJob, fallback: number): number {
  const value = Number(job.params.duration);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export type StoryboardCost = { images: number | null; videos: number | null; total: number | null };

/**
 * Ukupna cena unapred - ista računica kao dugmad i server (`jobCredits`): N
 * slika + N videa. `null` kad neki model nije u katalogu.
 */
export function storyboardCost(shots: readonly StoryShot[], quality: StoryboardQuality, catalog: readonly CatalogModel[]): StoryboardCost {
  const imageModel = catalog.find((model) => model.slug === STORYBOARD_QUALITY[quality].image.slug);
  const videoModel = catalog.find((model) => model.slug === STORYBOARD_QUALITY[quality].video.slug);
  if (!imageModel || !videoModel) return { images: null, videos: null, total: null };
  let images = 0;
  let videos = 0;
  for (const shot of shots) {
    const image = jobCredits(
      { modelSlug: imageModel.slug, inputMode: "text", params: { ...STORYBOARD_QUALITY[quality].image.params }, measured: {} },
      catalog,
    );
    const video = jobCredits(shotVideoJob(shot, quality, videoModel), catalog);
    if (image === null || video === null) return { images: null, videos: null, total: null };
    images += image;
    videos += video;
  }
  return { images, videos, total: images + videos };
}

// ── Montaža ─────────────────────────────────────────────────────────────────

export type StripSceneSource =
  /** Oživljen kadar (pravi video). */
  | { kind: "video"; ref: MediaRef; durationS: number }
  /** Samo slika (DEMO video ili kadar koji nije oživljen) - Ken Burns na uređaju. */
  | { kind: "image"; ref: MediaRef };

/**
 * Gotov strip → montaža: kadrovi redom sa pretapanjem 0,3 s, naslov rukopisom
 * prve 2 s i (po želji) potpisi kadrova kao titlovi. Kadar bez videa ostaje
 * fotka sa Ken Burnsom - tako DEMO strip (bez ključa) i dalje postaje film.
 */
export function storyboardTimeline(input: {
  title: string;
  aspect: TimelineAspect;
  shots: ReadonlyArray<{ caption: string; durationS: number; source: StripSceneSource | null }>;
  captions: boolean;
}): CreaTimelineV1 {
  const usable = input.shots.filter((shot) => shot.source !== null);
  const scenes: AutoScene[] = usable.map((shot, index) =>
    shot.source!.kind === "video"
      ? { ref: shot.source!.ref, media: "video", length: shot.source!.durationS, sourceLength: shot.source!.durationS }
      : { ref: shot.source!.ref, media: "image", length: shot.durationS, kenBurnsIndex: index },
  );
  const transition = 0.3;
  const draft = autoMontage({ aspect: input.aspect, scenes, transition: { kind: "pretapanje", duration: transition } });
  // Potpisi kao titlovi: svaki u vremenu svog kadra (posle prelaza).
  let cues: CaptionCue[] = [];
  if (input.captions) {
    let start = 0;
    draft.main.forEach((clip, index) => {
      const length = clip.out - clip.in;
      const end = start + length - (index < draft.main.length - 1 ? transition : 0);
      const caption = usable[index]?.caption ?? "";
      cues = cues.concat(cuesFromWords(wordsFromText(caption, start + 0.2, Math.max(start + 0.4, end - 0.2))));
      start = end;
    });
  }
  const total = draft.main.reduce((sum, clip) => sum + (clip.out - clip.in), 0) - transition * Math.max(0, draft.main.length - 1);
  return autoMontage({
    aspect: input.aspect,
    scenes,
    transition: { kind: "pretapanje", duration: transition },
    titles: input.title.trim() ? [{ text: input.title.trim(), start: 0, end: Math.min(2, Math.max(0.5, total)), style: "rukopis", font: "rukopis", anim: "pretapanje" }] : [],
    captions: cues.length > 0 ? { cues, style: "klasican", script: "lat" } : null,
  });
}
