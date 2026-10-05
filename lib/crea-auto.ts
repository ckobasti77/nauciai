/**
 * Auto izbor modela (Crea S3; plan `docs/crea/planovi/K06.md` §7). Čista logika:
 * po POSLU (tekst u slici, izmena sa referencom, vektor, jeftina proba, video sa
 * zvukom…) bira najjeftiniji model koji taj posao radi dobro, poštuje limit cene
 * i kaže jednu rečenicu „zašto".
 *
 * Pravila su lista preferencija po poslu, poređana od najjeftinijeg modela koji
 * posao radi dobro. Bira se PRVI dostupan model iz liste čija cena staje u
 * budžet; kad ništa ne staje, najjeftiniji sposoban, uz `overBudget`. Cena ide
 * kroz istu funkciju kao dugme (`creditsFor`), sa faktorom modela (cene v2).
 *
 * Slug koji nije u katalogu (ugašen model, zvučni model koji tek stiže) se
 * preskače ćutke - isto pravilo kao `recommendationsFor`.
 */

import type { Locale } from "./i18n";
import { buildParams, creditsFor, paramValuesForMode, type ParamValues } from "./studio-params";
import type { StudioModel } from "./studio-models";

export type AutoArea = "slika" | "video" | "zvuk";

export type AutoJob = {
  area: AutoArea;
  prompt: string;
  inputs: { images: number; videos: number; audio: number; mask: boolean };
  /** Režim ljuske Cree (npr. `muzika` u Zvuku) - kaže koji posao je u pitanju. */
  shellMode?: string;
  wants?: { draft?: boolean; quality?: boolean };
  /** „Najviše X kr po radu" - opciono. */
  budgetCredits?: number;
};

export type AutoReasonId =
  | "vector"
  | "edit_one"
  | "edit_many"
  | "text"
  | "draft"
  | "quality"
  | "default_image"
  | "first_last"
  | "refs"
  | "animate"
  | "audio"
  | "long"
  | "draft_video"
  | "quality_video"
  | "default_video"
  | "speech"
  | "music_clip"
  | "music_song"
  | "music_long";

type AutoChoice = { slug: string; params?: Record<string, unknown> };

type AutoRule = {
  id: AutoReasonId;
  area: AutoArea;
  mode: string;
  when: (job: AutoJob, signals: AutoSignals) => boolean;
  picks: readonly AutoChoice[];
  why: { sr: string; en: string };
};

export type AutoSignals = {
  text: boolean;
  vector: boolean;
  cheap: boolean;
  quality: boolean;
  audio: boolean;
  /** Trajanje koje opis traži, u sekundama (npr. „20 sekundi"), ili `null`. */
  durationS: number | null;
};

/** Mala slova, bez dijakritika - „Natpis" i „natpis", „ćirilica" i „cirilica" su isto. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "dj");
}

const TEXT_WORDS = /\b(natpis|tekst|logo|poster|plakat|meni|jelovnik|etiket|pozivnic|baner|cestitk|text|sign|label|menu|invitation|banner|lettering)/;
const VECTOR_WORDS = /\b(logo|ikonic|ikona|vektor|svg|icon|vector)/;
const CHEAP_WORDS = /\b(jeftin|proba|probn|skic|brz|cheap|draft|sketch|quick)/;
const QUALITY_WORDS = /\b(najbolj|vrhunsk|profesional|savrsen|detaljn|best|premium|professional|perfect|highest)/;
const AUDIO_WORDS = /\b(zvuk|muzik|govor|pesm|glas|dijalog|sound|music|voice|speech|song|dialogue)/;
const QUOTED = /[„"“”«»][^„"“”«»]{2,}[„"“”«»]/;
const DURATION = /(\d{1,3})\s*(s\b|sek|sec|second)/;

export function autoSignals(prompt: string): AutoSignals {
  const text = normalize(prompt);
  const duration = DURATION.exec(text);

  return {
    text: QUOTED.test(prompt) || TEXT_WORDS.test(text),
    vector: VECTOR_WORDS.test(text),
    cheap: CHEAP_WORDS.test(text),
    quality: QUALITY_WORDS.test(text),
    audio: AUDIO_WORDS.test(text),
    durationS: duration ? Number(duration[1]) : null,
  };
}

/**
 * Pravila, redom po prioritetu (K06 §7.2). Prvo pravilo čiji uslov važi i koje
 * ima bar jedan dostupan model odlučuje; ostala se ne gledaju.
 */
export const AUTO_RULES: readonly AutoRule[] = [
  // ── Slika ──
  {
    id: "vector",
    area: "slika",
    mode: "text",
    when: (_job, s) => s.vector,
    picks: [{ slug: "recraft-41-vector" }, { slug: "recraft-41" }],
    why: { sr: "Pravi vektor (SVG) — oštar na svakoj veličini.", en: "It makes a vector (SVG) — sharp at any size." },
  },
  {
    id: "edit_one",
    area: "slika",
    mode: "image_multi",
    when: (job) => job.inputs.images === 1,
    picks: [
      { slug: "nano-banana-2-lite" },
      { slug: "flux-kontext" },
      { slug: "seedream-5-flash" },
      { slug: "nano-banana-2", params: { resolution: "1K" } },
    ],
    why: { sr: "Menja tvoju sliku, a čuva lice i predmete.", en: "It edits your image and keeps faces and objects." },
  },
  {
    id: "edit_many",
    area: "slika",
    mode: "image_multi",
    when: (job) => job.inputs.images >= 2,
    picks: [
      { slug: "nano-banana-2-lite" },
      { slug: "seedream-5-flash" },
      { slug: "nano-banana-2", params: { resolution: "1K" } },
    ],
    why: { sr: "Spaja više tvojih slika u jednu.", en: "It combines several of your images into one." },
  },
  {
    id: "text",
    area: "slika",
    mode: "text",
    when: (_job, s) => s.text,
    picks: [
      { slug: "recraft-41" },
      { slug: "ideogram-45", params: { quality: "medium" } },
      { slug: "nano-banana-2", params: { resolution: "1K" } },
    ],
    why: {
      sr: "Najbolje piše tekst u slici, i najjeftiniji je koji to ume.",
      en: "It writes text in images best, and it is the cheapest that can.",
    },
  },
  {
    id: "draft",
    area: "slika",
    mode: "text",
    when: (job, s) => job.wants?.draft === true || s.cheap,
    picks: [{ slug: "z-image-turbo" }, { slug: "flux-2-klein" }],
    why: { sr: "Brza skica za kredit-dva — usavršiš je kad ti se svidi.", en: "A quick sketch for a credit or two — refine it once you like it." },
  },
  {
    id: "quality",
    area: "slika",
    mode: "text",
    when: (job, s) => job.wants?.quality === true || s.quality,
    picks: [{ slug: "nano-banana-pro", params: { resolution: "2K" } }, { slug: "flux-2-pro" }],
    why: {
      sr: "Najtačniji model — za sliku koja mora da bude dobra iz prve.",
      en: "The most precise model — for an image that has to be right the first time.",
    },
  },
  {
    id: "default_image",
    area: "slika",
    mode: "text",
    when: () => true,
    picks: [
      { slug: "seedream-5-flash" },
      { slug: "nano-banana-2-lite" },
      { slug: "nano-banana-2", params: { resolution: "1K" } },
    ],
    why: { sr: "Dobar kvalitet za malo kredita.", en: "Good quality for few credits." },
  },
  // ── Video ──
  {
    id: "first_last",
    area: "video",
    mode: "first_last",
    when: (job) => job.inputs.images === 2,
    picks: [
      { slug: "wan-30", params: { resolution: "720p" } },
      { slug: "minimax-h3-max-turbo", params: { resolution: "768P" } },
      { slug: "kling-3-turbo" },
    ],
    why: { sr: "Spaja tvoj prvi i poslednji kadar.", en: "It joins your first and last frame." },
  },
  {
    id: "refs",
    area: "video",
    mode: "reference",
    when: (job) => job.inputs.images >= 3,
    picks: [
      { slug: "seedance-20", params: { tier: "mini", resolution: "720p" } },
      { slug: "wan-30", params: { resolution: "720p" } },
      { slug: "kling-omni" },
    ],
    why: { sr: "Drži isti lik iz tvojih slika.", en: "It keeps the same character from your images." },
  },
  {
    id: "animate",
    area: "video",
    mode: "image",
    when: (job) => job.inputs.images === 1,
    picks: [
      { slug: "hailuo-23-fast", params: { resolution: "768p", duration: "6" } },
      { slug: "grok-video-15-lite", params: { resolution: "720p" } },
      { slug: "minimax-h3-max-turbo", params: { resolution: "768P" } },
    ],
    why: { sr: "Oživi fotku najjeftinije.", en: "It brings the photo to life for the least." },
  },
  {
    id: "long",
    area: "video",
    mode: "text",
    when: (_job, s) => s.durationS !== null && s.durationS > 10,
    picks: [{ slug: "wan-30" }, { slug: "seedance-25" }, { slug: "ltx-23-fast" }],
    why: { sr: "Dug kadar u jednom komadu.", en: "A long shot in one piece." },
  },
  {
    id: "audio",
    area: "video",
    mode: "text",
    when: (_job, s) => s.audio,
    picks: [
      { slug: "minimax-h3", params: { resolution: "768p" } },
      { slug: "wan-30", params: { resolution: "720p" } },
      { slug: "veo-31-lite" },
    ],
    why: { sr: "Zvuk je već u ceni.", en: "The audio is already in the price." },
  },
  {
    id: "draft_video",
    area: "video",
    mode: "text",
    when: (job, s) => job.wants?.draft === true || s.cheap,
    picks: [
      { slug: "grok-video-15-lite", params: { resolution: "480p", duration: 6 } },
      { slug: "minimax-h3-max-turbo", params: { resolution: "480P" } },
      { slug: "seedance-20", params: { tier: "mini", resolution: "480p" } },
    ],
    why: { sr: "Jeftina proba pokreta pre prave verzije.", en: "A cheap motion test before the real version." },
  },
  {
    id: "quality_video",
    area: "video",
    mode: "text",
    when: (job, s) => job.wants?.quality === true || s.quality,
    picks: [{ slug: "veo-31" }, { slug: "kling-3", params: { resolution: "1080p" } }],
    why: { sr: "Najviši kvalitet slike i pokreta.", en: "The highest picture and motion quality." },
  },
  {
    id: "default_video",
    area: "video",
    mode: "text",
    when: () => true,
    picks: [
      { slug: "minimax-h3-max-turbo", params: { resolution: "768P", duration: 5 } },
      { slug: "minimax-h3" },
    ],
    why: { sr: "Najbolji odnos cene i kvaliteta.", en: "The best value for the price." },
  },
  // ── Zvuk ── (Gemini TTS i Lyria stižu u K22/K23; do tada vredi rezervni model)
  {
    id: "music_long",
    area: "zvuk",
    mode: "text",
    when: (job, s) => isMusicJob(job) && s.durationS !== null && s.durationS > 150,
    picks: [{ slug: "music" }],
    why: { sr: "Jedini koji pravi tačno trajanje do 5 minuta.", en: "The only one that makes an exact length up to 5 minutes." },
  },
  {
    id: "music_clip",
    area: "zvuk",
    mode: "text",
    when: (job, s) => isMusicJob(job) && s.durationS !== null && s.durationS <= 30,
    picks: [{ slug: "lyria-3-clip" }, { slug: "music" }],
    why: { sr: "Kratka numera za malo kredita.", en: "A short track for few credits." },
  },
  {
    id: "music_song",
    area: "zvuk",
    mode: "text",
    when: (job) => isMusicJob(job),
    picks: [{ slug: "lyria-35" }, { slug: "music" }],
    why: { sr: "Cela pesma iz jednog opisa.", en: "A whole song from one description." },
  },
  {
    id: "speech",
    area: "zvuk",
    mode: "text",
    when: () => true,
    picks: [{ slug: "gemini-tts" }, { slug: "tts" }],
    why: { sr: "Glas koji govori srpski.", en: "A voice that speaks Serbian." },
  },
];

function isMusicJob(job: AutoJob): boolean {
  return job.shellMode === "muzika" || /\b(muzik|pesm|numer|music|song|track)/.test(normalize(job.prompt));
}

export type AutoPick = {
  model: StudioModel;
  inputMode: string;
  params: Record<string, unknown>;
  /** Samo ono što pravilo MENJA u formi (npr. rezolucija 1K) - ostali izbori korisnika ostaju. */
  overrides: ParamValues;
  credits: number;
  reasonId: AutoReasonId;
  why: { sr: string; en: string };
  overBudget: boolean;
};

type Candidate = { model: StudioModel; params: Record<string, unknown>; overrides: ParamValues; credits: number };

/** Parametri izbora (podrazumevani za režim + preporuka pravila) i njihova cena. */
function candidateFor(model: StudioModel, mode: string, choice: AutoChoice, job: AutoJob, signals: AutoSignals): Candidate | null {
  const overrides: ParamValues = {};
  for (const [key, value] of Object.entries(choice.params ?? {})) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") overrides[key] = value;
  }
  if (signals.durationS !== null && model.kind === "video" && choice.params?.duration === undefined) {
    overrides.duration = signals.durationS;
  }
  const params = buildParams(model.paramSpec, paramValuesForMode(model.paramSpec, mode, overrides), mode);
  // Okačene slike ulaze u cenu kao `extras` (isto kao forma, `measuredExtraCounts`).
  const priced: Record<string, unknown> = { ...params };
  const extras = [...(model.priceRule.extras ?? []), ...(model.priceRule.modeRules?.[mode]?.extras ?? [])];
  for (const extra of extras) priced[extra.param] = job.inputs.images;
  // Govor se naplaćuje po znaku opisa (`capabilities.quantity`, isto kao forma).
  const quantity = model.capabilities.quantity as { param?: unknown; from?: unknown } | undefined;
  if (quantity?.from === "text_length" && typeof quantity.param === "string") {
    priced[quantity.param] = Math.max(1, job.prompt.length);
  }

  const credits = creditsFor(model.priceRule, priced, mode, model.creditFactor);

  return credits === null ? null : { model, params, overrides, credits };
}

/** Prima li model toliko slika u tom režimu (`inputSpec`). */
function acceptsImages(model: StudioModel, mode: string, count: number): boolean {
  if (count === 0) return true;
  const slot = model.inputSpec[mode]?.image;

  return slot !== undefined && slot.max >= count;
}

export function pickAuto(
  job: AutoJob,
  models: StudioModel[],
  ctx: { available: (model: StudioModel) => boolean },
): AutoPick | null {
  // Izmena postojećeg videa ili zvuka nije posao za Auto - tu bira korisnik.
  if (job.inputs.videos > 0 || job.inputs.audio > 0) return null;
  const signals = autoSignals(job.prompt);
  const bySlug = new Map(models.map((model) => [model.slug, model]));

  for (const rule of AUTO_RULES) {
    if (rule.area !== job.area || !rule.when(job, signals)) continue;

    const candidates: Candidate[] = [];
    for (const choice of rule.picks) {
      const model = bySlug.get(choice.slug);
      if (!model || !ctx.available(model) || !model.inputModes.includes(rule.mode)) continue;
      if (!acceptsImages(model, rule.mode, job.inputs.images)) continue;
      const candidate = candidateFor(model, rule.mode, choice, job, signals);
      if (candidate) candidates.push(candidate);
    }
    if (candidates.length === 0) continue;

    const budget = job.budgetCredits;
    const fits = budget === undefined ? candidates[0] : candidates.find((candidate) => candidate.credits <= budget);
    const cheapest = candidates.reduce((best, candidate) => (candidate.credits < best.credits ? candidate : best));
    const chosen = fits ?? cheapest;

    return {
      model: chosen.model,
      inputMode: rule.mode,
      params: chosen.params,
      overrides: chosen.overrides,
      credits: chosen.credits,
      reasonId: rule.id,
      why: rule.why,
      overBudget: fits === undefined,
    };
  }

  return null;
}

/** Jedna rečenica za korisnika: razlog, cena i (kad postoji) odnos prema limitu. */
export function autoSentence(pick: AutoPick, locale: Locale, budgetCredits?: number): string {
  const unit = locale === "sr" ? "kr" : "cr";
  const base = `${pick.why[locale]} ${pick.credits} ${unit}.`;
  if (budgetCredits === undefined) return base;
  if (!pick.overBudget) {
    return locale === "sr"
      ? `${base} Staje u tvoj limit od ${budgetCredits} kr.`
      : `${base} Fits your ${budgetCredits} cr limit.`;
  }

  return locale === "sr"
    ? `${pick.why.sr} Ništa ne staje u ${budgetCredits} kr — najjeftiniji koji ume je ${pick.model.labelSr} (${pick.credits} kr).`
    : `${pick.why.en} Nothing fits ${budgetCredits} cr — the cheapest that can is ${pick.model.labelEn} (${pick.credits} cr).`;
}
