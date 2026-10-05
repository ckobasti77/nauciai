/**
 * Proba → Usavrši (Crea S4, V3; plan `docs/crea/planovi/K06.md` §8). Čista
 * logika: koji jeftin model je proba za koji skuplji, i šta se iz probe prenosi
 * u konačnu verziju. Pun UI probnog lista (mreža 4-16 skica) je K13; ovde su
 * parovi i dva naloga - „Probaj jeftino" i „Usavrši".
 *
 * Šta se prenosi (K06-7):
 * - isti model, viša rezolucija (video): opis, trajanje, odnos, ulazi - a SEME
 *   prepisuje server (`convex/creaDraftCore.ts`), jer ga forma ne vidi;
 * - drugi model (slika): opis i izabrana skica kao REFERENTNA slika, jer seme
 *   drugom modelu ne znači ništa. Iznimka je FLUX.2 klein → Pro (ista porodica):
 *   tamo ide seme, bez reference.
 *
 * Cena probe je obična cena jeftinog modela (K06-1).
 */

import type { ParamControl } from "@/convex/studioParamSpec";

import { creditsFor, buildParams, paramValuesForMode, type ParamValues } from "./studio-params";
import type { StudioModel } from "./studio-models";

export type DraftCarryKey = "prompt" | "aspect_ratio" | "image_size" | "duration" | "audio" | "inputs";

export type DraftRefinePair = {
  id: string;
  area: "slika" | "video";
  draft: { modelSlug: string; params: Record<string, unknown> };
  refine: { modelSlug: string; inputMode?: string; params: Record<string, unknown> };
  carry: readonly DraftCarryKey[];
  /** Izabrana proba ide u usavršavanje kao referentna slika (proba je drugi model). */
  reference: boolean;
};

export const DRAFT_REFINE_PAIRS: readonly DraftRefinePair[] = [
  {
    id: "slika-skica",
    area: "slika",
    // Veličina skice se izvodi iz odnosa stranica koji je korisnik izabrao.
    draft: { modelSlug: "z-image-turbo", params: {} },
    refine: { modelSlug: "nano-banana-2", inputMode: "image_multi", params: { resolution: "2K" } },
    carry: ["prompt", "aspect_ratio"],
    reference: true,
  },
  {
    id: "slika-flux",
    area: "slika",
    draft: { modelSlug: "flux-2-klein", params: {} },
    refine: { modelSlug: "flux-2-pro", inputMode: "text", params: {} },
    carry: ["prompt", "image_size"],
    reference: false,
  },
  {
    id: "slika-lite",
    area: "slika",
    draft: { modelSlug: "nano-banana-2-lite", params: {} },
    refine: { modelSlug: "nano-banana-pro", inputMode: "image_multi", params: { resolution: "2K" } },
    carry: ["prompt", "aspect_ratio"],
    reference: true,
  },
  {
    id: "slika-seedream",
    area: "slika",
    draft: { modelSlug: "seedream-5-flash", params: {} },
    refine: { modelSlug: "seedream-5-pro", inputMode: "image_multi", params: { resolution: "2K" } },
    carry: ["prompt"],
    reference: true,
  },
  {
    id: "video-wan",
    area: "video",
    draft: { modelSlug: "wan-30", params: { resolution: "480p" } },
    refine: { modelSlug: "wan-30", params: { resolution: "1080p" } },
    carry: ["prompt", "duration", "aspect_ratio", "inputs"],
    reference: false,
  },
  {
    id: "video-h3",
    area: "video",
    draft: { modelSlug: "minimax-h3-max-turbo", params: { resolution: "480P" } },
    refine: { modelSlug: "minimax-h3-max-turbo", params: { resolution: "1080P" } },
    carry: ["prompt", "duration", "aspect_ratio", "inputs"],
    reference: false,
  },
  {
    id: "video-pixverse",
    area: "video",
    draft: { modelSlug: "pixverse-v6", params: { resolution: "360p" } },
    refine: { modelSlug: "pixverse-v6", params: { resolution: "1080p" } },
    carry: ["prompt", "duration", "audio", "inputs"],
    reference: false,
  },
  {
    id: "video-seedance",
    area: "video",
    draft: { modelSlug: "seedance-20", params: { tier: "mini", resolution: "480p" } },
    refine: { modelSlug: "seedance-20", params: { tier: "standard", resolution: "1080p" } },
    carry: ["prompt", "duration", "inputs"],
    reference: false,
  },
  {
    // Seedance 2.5 ima i pravi „draft" (480p → 1080p iz `draft_id`), ali ime
    // parametra na BytePlus-u nije potvrđeno (K06 §8) - zato generički par.
    id: "video-seedance-25",
    area: "video",
    draft: { modelSlug: "seedance-25", params: { resolution: "480p" } },
    refine: { modelSlug: "seedance-25", params: { resolution: "1080p" } },
    carry: ["prompt", "duration", "inputs"],
    reference: false,
  },
];

/**
 * Uvod koji „Usavrši" dodaje opisu kad proba ide kao referenca. Na engleskom
 * jer ga čita model, ne korisnik; korisnikov opis ide posle njega neizmenjen.
 */
export const REFINE_PROMPT_PREFIX =
  "Refine this sketch into a finished, detailed image. Keep its composition and subject. ";

/** fal preset veličine ↔ odnos stranica Nano Banane (`NANO_BANANA_RATIOS`). */
const IMAGE_SIZE_TO_RATIO: Record<string, string> = {
  square: "1:1",
  square_hd: "1:1",
  landscape_4_3: "3:2",
  landscape_16_9: "16:9",
  portrait_4_3: "2:3",
  portrait_16_9: "9:16",
};
const RATIO_TO_IMAGE_SIZE: Record<string, string> = {
  "1:1": "square_hd",
  "3:2": "landscape_4_3",
  "4:3": "landscape_4_3",
  "16:9": "landscape_16_9",
  "2:3": "portrait_4_3",
  "3:4": "portrait_4_3",
  "9:16": "portrait_16_9",
};

const MAX_PROMPT = 2000;

function isSameModelPair(pair: DraftRefinePair): boolean {
  return pair.draft.modelSlug === pair.refine.modelSlug;
}

function promptKeyOf(spec: ParamControl[]): string | null {
  return spec.find((control) => control.type === "textarea")?.key ?? null;
}

/**
 * Parametri svedeni na ono što model u datom režimu stvarno prima: ključ koji
 * model nema ispada, a vrednost koju ne prima zamenjuje podrazumevana - isto
 * pravilo koje forma primenjuje pri promeni modela (`paramValuesForMode`).
 */
export function fitParams(
  spec: ParamControl[],
  candidate: Record<string, unknown>,
  inputMode: string,
): Record<string, unknown> {
  const values: ParamValues = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") values[key] = value;
  }

  return buildParams(spec, paramValuesForMode(spec, inputMode, values), inputMode);
}

/** Odnos stranica iz parametara (direktno ili iz fal preseta veličine). */
function aspectOf(params: Record<string, unknown>): string | null {
  if (typeof params.aspect_ratio === "string") return params.aspect_ratio;
  if (typeof params.image_size === "string") return IMAGE_SIZE_TO_RATIO[params.image_size] ?? null;

  return null;
}

function carryInto(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  carry: readonly DraftCarryKey[],
  sourcePromptKey: string | null,
  targetPromptKey: string | null,
): void {
  for (const key of carry) {
    if (key === "inputs") continue;
    if (key === "prompt") {
      const prompt = sourcePromptKey ? source[sourcePromptKey] : undefined;
      if (targetPromptKey && typeof prompt === "string") target[targetPromptKey] = prompt;
      continue;
    }
    if (key === "aspect_ratio") {
      const ratio = aspectOf(source);
      if (ratio) {
        target.aspect_ratio = ratio;
        if (target.image_size === undefined && RATIO_TO_IMAGE_SIZE[ratio]) target.image_size = RATIO_TO_IMAGE_SIZE[ratio];
      }
      continue;
    }
    if (source[key] !== undefined) target[key] = source[key];
  }
}

// ── „Probaj jeftino" (iz composera skupljeg modela) ────────────────────────

/**
 * Par čiji je skupi model upravo izabran, ako proba ima smisla u ovom režimu.
 * Proba drugog modela ide samo iz opisa (`text`): referenca za „Usavrši" je
 * upravo ta skica. Proba istog modela radi u svakom režimu koji model ima.
 */
export function draftPairFor(modelSlug: string, inputMode: string): DraftRefinePair | null {
  return (
    DRAFT_REFINE_PAIRS.find((pair) => {
      if (pair.refine.modelSlug !== modelSlug) return false;

      return isSameModelPair(pair) || inputMode === "text";
    }) ?? null
  );
}

export type DraftOrder = { modelSlug: string; inputMode: string; params: Record<string, unknown> };

/** Nalog za probu: jeftin model, isti opis (i ulazi kad je isti model), niža rezolucija. */
export function buildDraftOrder(
  pair: DraftRefinePair,
  current: { params: Record<string, unknown>; inputMode: string; model: StudioModel },
  draftModel: StudioModel,
): DraftOrder {
  const inputMode = isSameModelPair(pair) ? current.inputMode : (draftModel.inputModes[0] ?? "text");
  const candidate: Record<string, unknown> = isSameModelPair(pair) ? { ...current.params } : {};
  if (!isSameModelPair(pair)) {
    carryInto(candidate, current.params, ["prompt", "aspect_ratio"], promptKeyOf(current.model.paramSpec), promptKeyOf(draftModel.paramSpec));
  }
  Object.assign(candidate, pair.draft.params);

  return { modelSlug: draftModel.slug, inputMode, params: fitParams(draftModel.paramSpec, candidate, inputMode) };
}

// ── „Usavrši" (na gotovoj probi) ───────────────────────────────────────────

type DraftJob = { modelSlug: string; params: Record<string, unknown>; inputMode?: string };

/**
 * Par u kojem je ovaj rad PROBA. Kod istog modela rad je proba samo ako je
 * napravljen sa parametrima probe (480p Wan je proba, 1080p Wan je već konačan).
 */
export function refinePairForJob(job: DraftJob): DraftRefinePair | null {
  return (
    DRAFT_REFINE_PAIRS.find((pair) => {
      if (pair.draft.modelSlug !== job.modelSlug) return false;
      if (!isSameModelPair(pair)) return true;

      return Object.entries(pair.draft.params).every(([key, value]) => job.params[key] === value);
    }) ?? null
  );
}

export type RefineOrder = {
  modelSlug: string;
  inputMode: string;
  params: Record<string, unknown>;
  /** `reference`: izlaz probe ide kao ulaz; `carry`: ulazi probe se ponavljaju; `none`: bez ulaza. */
  inputs: "reference" | "carry" | "none";
  derivation: "usavrsavanje";
};

export function buildRefineOrder(job: DraftJob, pair: DraftRefinePair, refineModel: StudioModel): RefineOrder {
  const inputMode = pair.refine.inputMode ?? job.inputMode ?? refineModel.inputModes[0] ?? "text";
  const candidate: Record<string, unknown> = {};
  const draftPromptKey = Object.keys(job.params).includes("prompt") ? "prompt" : null;
  carryInto(candidate, job.params, pair.carry, draftPromptKey, promptKeyOf(refineModel.paramSpec));
  Object.assign(candidate, pair.refine.params);

  const promptKey = promptKeyOf(refineModel.paramSpec);
  if (pair.reference && promptKey && typeof candidate[promptKey] === "string") {
    candidate[promptKey] = `${REFINE_PROMPT_PREFIX}${candidate[promptKey] as string}`.slice(0, MAX_PROMPT);
  }

  return {
    modelSlug: refineModel.slug,
    inputMode,
    params: fitParams(refineModel.paramSpec, candidate, inputMode),
    inputs: pair.reference ? "reference" : pair.carry.includes("inputs") ? "carry" : "none",
    derivation: "usavrsavanje",
  };
}

/** Cena naloga istom funkcijom kao dugme; `extraImages` broji referencu ili okačene ulaze. */
export function orderCredits(
  model: StudioModel,
  order: { inputMode: string; params: Record<string, unknown> },
  extraImages = 0,
): number | null {
  const params = { ...order.params };
  for (const extra of model.priceRule.extras ?? []) params[extra.param] = extraImages;
  const modeRule = model.priceRule.modeRules?.[order.inputMode];
  for (const extra of modeRule?.extras ?? []) params[extra.param] = extraImages;

  return creditsFor(model.priceRule, params, order.inputMode, model.creditFactor);
}
