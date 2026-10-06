import type { AdScript } from "../convex/creaLlmVideoCore";
import { autoMontage, sceneLengthsFor, type AutoTitle } from "./crea-auto-montage";
import type { CreaBrandKit } from "./crea-brand-kit";
import { jobCredits, type PricedJob, type PricedModel } from "./crea-job-price";
import { wordsFromText } from "./crea-subtitles";
import { aspectRatio, type CreaTimelineV1, type MediaRef, type OverlayClip, type TimelineAspect, type TitleFont } from "./crea-timeline";
import type { LocalizedText } from "./i18n";

/**
 * Reklama za mali biznis (Crea K21, V31; plan K17 §6.5): fotka proizvoda + dve
 * rečenice → (a) govorni oglas: scenario (LLM, 0 kr) → srpski glas (`tts`) →
 * montaža na uređaju sa Ken Burnsom proizvoda, natpisima u bojama i slovima
 * brend kita, logom u uglu i pozivom na akciju; ili (b) animacija proizvoda:
 * jeftin model oživi fotku po receptu „reklama", a natpisi i logo idu preko
 * u montaži. Oba puta završavaju kao montaža (`origin: "reklama"`) za doradu.
 */

export const AD_MODES = ["govor", "animacija"] as const;
export type AdMode = (typeof AD_MODES)[number];

export const AD_MODE_INFO: Record<AdMode, { label: LocalizedText; hint: LocalizedText }> = {
  govor: {
    label: { sr: "Govorni oglas", en: "Voice-over ad" },
    hint: { sr: "Glas priča o proizvodu, a fotka se lagano kreće uz natpise.", en: "A voice talks about the product while the photo moves gently with captions." },
  },
  animacija: {
    label: { sr: "Animacija proizvoda", en: "Product animation" },
    hint: { sr: "AI oživi fotku proizvoda kao u reklami, a natpisi idu preko.", en: "AI brings the product photo to life like a commercial, with captions on top." },
  },
};

/**
 * Modeli: srpski glas (Gemini govor; rezerva ElevenLabs `tts` kroz `narrationEngine`)
 * i najjeftiniji model koji oživljava sliku (pravilo `animate`, `lib/crea-auto.ts`).
 */
export const AD_MODELS = {
  voice: { slug: "gemini-tts", inputMode: "text" },
  animation: { slug: "hailuo-23-fast", inputMode: "image", params: { resolution: "768p", duration: "6" } },
} as const;

/** Recept „reklama za proizvod": pokret kamere i svetlo kao u studiju, bez ljudi i teksta. */
export function adAnimationPrompt(script: Pick<AdScript, "animationPrompt">): string {
  return `Product commercial shot of the product in the image: ${script.animationPrompt.trim().replace(/[.\s]+$/, "")}. Keep the product exactly as it is: same shape, label, colours and details. Clean premium look, no people, no added text or logos.`;
}

export function adNarration(script: Pick<AdScript, "shots">): string {
  return script.shots.map((shot) => shot.narration.trim()).filter(Boolean).join(" ");
}

export function adJobs(script: AdScript, mode: AdMode, voice: string, voiceSlug: string = AD_MODELS.voice.slug): PricedJob[] {
  if (mode === "animacija") {
    return [{ modelSlug: AD_MODELS.animation.slug, inputMode: AD_MODELS.animation.inputMode, params: { prompt: adAnimationPrompt(script), ...AD_MODELS.animation.params }, measured: {} }];
  }
  const text = adNarration(script);
  return [{ modelSlug: voiceSlug, inputMode: AD_MODELS.voice.inputMode, params: { text, voice }, measured: { char_count: text.length } }];
}

/** Cena unapred (ista računica kao server); `null` kad model nije dostupan. */
export function adCost(script: AdScript, mode: AdMode, voice: string, catalog: readonly PricedModel[], voiceSlug: string = AD_MODELS.voice.slug): number | null {
  let total = 0;
  for (const job of adJobs(script, mode, voice, voiceSlug)) {
    const credits = jobCredits(job, catalog);
    if (credits === null) return null;
    total += credits;
  }
  return total;
}

type BrandLook = Pick<CreaBrandKit, "colors" | "fonts"> | null;

/** Boja natpisa iz kita (prva boja), inače žuta Cree; slova naslova iz kita. */
function brandTitle(kit: BrandLook): { color: string; font: TitleFont } {
  const color = kit?.colors.find((value) => /^#[0-9a-f]{6}$/i.test(value))?.toLowerCase() ?? "#f4be30";
  return { color, font: kit?.fonts.heading ?? "nunito" };
}

/** Logo u gornjem desnom uglu, ~22 % kraće stranice, kvadratan na ekranu. */
export function logoRect(aspect: TimelineAspect): OverlayClip["rect"] {
  const ratio = aspectRatio(aspect);
  const w = ratio >= 1 ? 0.14 : 0.22;
  const h = w * ratio;
  return { x: 1 - w - 0.05, y: 0.05, w, h };
}

const CTA_SECONDS = 2.5;

/**
 * Govorni oglas → montaža: ista fotka kroz kadrove (svaki drugi Ken Burns),
 * natpis kadra kao „donja traka" u bojama kita dok narator govori o njemu, na
 * kraju poziv na akciju preko poslednjih 2,5 s, logo u uglu ceo video, glas.
 */
export function adVoiceTimeline(input: {
  script: AdScript;
  product: { ref: MediaRef };
  voice: { ref: MediaRef; durationS: number };
  logo: { ref: MediaRef } | null;
  kit: BrandLook;
  aspect: TimelineAspect;
}): CreaTimelineV1 {
  const shots = input.script.shots;
  const voiceLength = Math.max(1, input.voice.durationS);
  const total = voiceLength + CTA_SECONDS;
  const words = wordsFromText(adNarration(input.script), 0.1, voiceLength);
  const starts: number[] = [];
  let wordIndex = 0;
  shots.forEach((shot, index) => {
    starts.push(index === 0 ? 0 : (words[wordIndex]?.s ?? (index * voiceLength) / shots.length));
    wordIndex += shot.narration.trim().split(/\s+/).filter(Boolean).length;
  });
  const lengths = sceneLengthsFor(starts, total, 0.4);
  const look = brandTitle(input.kit);
  const titles: AutoTitle[] = shots.map((shot, index) => ({
    text: shot.onScreen,
    start: starts[index]! + 0.3,
    end: (starts[index + 1] ?? voiceLength) - 0.1,
    style: "donja-traka",
    font: look.font,
  }));
  if (input.script.cta.trim()) titles.push({ text: input.script.cta.trim(), start: voiceLength, end: total, style: "naslov", font: look.font, color: look.color });
  return autoMontage({
    aspect: input.aspect,
    scenes: shots.map((_, index) => ({ ref: input.product.ref, media: "image", length: lengths[index]!, kenBurnsIndex: index })),
    transition: { kind: "pretapanje", duration: 0.4 },
    titles: titles.filter((title) => title.end - title.start >= 0.3),
    voice: { ref: input.voice.ref, length: voiceLength },
    overlays: input.logo ? [{ src: input.logo.ref, media: "image", in: 0, out: total, start: 0, rect: logoRect(input.aspect), volumeDb: 0, muted: true }] : [],
  });
}

/**
 * Animacija proizvoda → montaža: oživljen klip (ili fotka sa Ken Burnsom kad je
 * video DEMO), naslov na početku, poziv na akciju na kraju, logo u uglu.
 */
export function adAnimationTimeline(input: {
  script: AdScript;
  clip: { ref: MediaRef; media: "video" | "image"; durationS: number };
  logo: { ref: MediaRef } | null;
  kit: BrandLook;
  aspect: TimelineAspect;
}): CreaTimelineV1 {
  const length = Math.max(2, input.clip.durationS);
  const look = brandTitle(input.kit);
  const titles: AutoTitle[] = [];
  if (input.script.headline.trim()) titles.push({ text: input.script.headline.trim(), start: 0.2, end: Math.min(length / 2, 2.6), style: "naslov", font: look.font, color: look.color });
  if (input.script.cta.trim()) titles.push({ text: input.script.cta.trim(), start: Math.max(length / 2, length - 2.4), end: length, style: "donja-traka", font: look.font });
  return autoMontage({
    aspect: input.aspect,
    scenes: [{ ref: input.clip.ref, media: input.clip.media, length, sourceLength: input.clip.media === "video" ? length : undefined, kenBurnsIndex: 0 }],
    titles,
    overlays: input.logo ? [{ src: input.logo.ref, media: "image", in: 0, out: length, start: 0, rect: logoRect(input.aspect), volumeDb: 0, muted: true }] : [],
  });
}
