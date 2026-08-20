/**
 * Red kataloga `models` onakav kakav ga vidi browser: JSON polja su parsirana
 * jednom, pa forma, slotovi i cena rade nad objektima umesto da svaka
 * komponenta zove `JSON.parse`.
 *
 * Filteri i pretraga `<ModelPicker>`-a su ovde kao čiste funkcije - da bi se
 * mogli tvrditi testom - i nijedna ne pominje nijedan slug.
 */

import { parseParamSpec, type ParamControl } from "@/convex/studioParamSpec";
import { parsePriceRule, type PriceRule } from "@/convex/studioPricing";

import type { Locale } from "./i18n";
import { buildParams, creditsFor, paramValuesForMode } from "./studio-params";
import { parseInputModes, parseInputSpec, type InputSpec } from "./studio-slots";

export type StudioModelBadge = "preporuceno" | "skupo" | "novo";

/** Sirov red iz `models` tabele - sva složena polja su JSON stringovi (schema.ts). */
export type StudioModelRow = {
  slug: string;
  provider: "fal" | "google" | "byteplus";
  kind: "image" | "video" | "audio";
  family: string;
  labelSr: string;
  labelEn: string;
  taglineSr: string;
  taglineEn: string;
  descriptionSr: string;
  descriptionEn: string;
  inputModes: string;
  inputSpec: string;
  paramSpec: string;
  priceRule: string;
  capabilities: string;
  badge?: StudioModelBadge;
  sortOrder: number;
};

export type StudioModel = {
  slug: string;
  provider: "fal" | "google" | "byteplus";
  kind: "image" | "video" | "audio";
  family: string;
  labelSr: string;
  labelEn: string;
  taglineSr: string;
  taglineEn: string;
  descriptionSr: string;
  descriptionEn: string;
  inputModes: string[];
  inputSpec: InputSpec;
  paramSpec: ParamControl[];
  priceRule: PriceRule;
  capabilities: Record<string, unknown>;
  badge?: StudioModelBadge;
  sortOrder: number;
};

/**
 * `null` kad red nema upotrebljivo cenovno pravilo ili spisak kontrola - model
 * bez cene se ne nudi, jer bi dugme moralo da prizna da ne zna koliko košta.
 */
export function parseStudioModel(row: StudioModelRow): StudioModel | null {
  const priceRule = parsePriceRule(row.priceRule);
  const paramSpec = parseParamSpec(row.paramSpec);
  if (!priceRule || !paramSpec) return null;

  let capabilities: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.capabilities);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      capabilities = parsed as Record<string, unknown>;
    }
  } catch {
    capabilities = {};
  }

  return {
    slug: row.slug,
    provider: row.provider,
    kind: row.kind,
    family: row.family,
    labelSr: row.labelSr,
    labelEn: row.labelEn,
    taglineSr: row.taglineSr,
    taglineEn: row.taglineEn,
    descriptionSr: row.descriptionSr,
    descriptionEn: row.descriptionEn,
    inputModes: parseInputModes(row.inputModes),
    inputSpec: parseInputSpec(row.inputSpec),
    paramSpec,
    priceRule,
    capabilities,
    ...(row.badge ? { badge: row.badge } : {}),
    sortOrder: row.sortOrder,
  };
}

export function modelLabel(model: StudioModel, locale: Locale): string {
  return locale === "sr" ? model.labelSr : model.labelEn;
}

export function modelTagline(model: StudioModel, locale: Locale): string {
  return locale === "sr" ? model.taglineSr : model.taglineEn;
}

export const MODEL_BADGE_LABELS: Record<StudioModelBadge, Record<Locale, string>> = {
  preporuceno: { sr: "preporučeno", en: "recommended" },
  skupo: { sr: "skupo", en: "expensive" },
  novo: { sr: "novo", en: "new" },
};

/**
 * Ima li model zvuk. Prvo `capabilities.audio` (tako ga katalog piše), pa
 * prekidač `audio` u kontrolama - model kod kojeg je zvuk stavka na računu ga
 * ima kao kontrolu, a ne kao zastavicu.
 */
export function hasAudio(model: StudioModel): boolean {
  if (model.capabilities.audio === true) return true;
  if (model.kind === "audio") return true;

  return model.paramSpec.some((control) => control.key === "audio");
}

/** Prvi ulazni režim modela - onaj kojim se forma otvara. */
export function defaultInputMode(model: StudioModel): string | undefined {
  return model.inputModes[0];
}

/**
 * Cena podrazumevanog izbora, za značku uz model u listi. `null` kad količina
 * nije poznata unapred (naplata po sekundi okačenog fajla) - tada lista ne
 * laže cifrom nego ćuti, a cena stiže na dugme kad se fajl okači.
 */
export function defaultCredits(model: StudioModel, override: Record<string, number> = {}): number | null {
  const mode = defaultInputMode(model);
  const values = paramValuesForMode(model.paramSpec, mode);
  const params = buildParams(model.paramSpec, values, mode, override);

  return creditsFor(model.priceRule, params, mode);
}

export type ModelFilter = {
  kind?: "image" | "video" | "audio";
  audioOnly?: boolean;
  query?: string;
};

export function filterModels(models: StudioModel[], filter: ModelFilter, locale: Locale): StudioModel[] {
  const query = (filter.query ?? "").trim().toLowerCase();

  return models.filter((model) => {
    if (filter.kind && model.kind !== filter.kind) return false;
    if (filter.audioOnly && !hasAudio(model)) return false;
    if (query.length === 0) return true;

    const haystack = [modelLabel(model, locale), model.slug, model.family].join(" ").toLowerCase();

    return haystack.includes(query);
  });
}

/** Grupisanje po porodici, redosledom prve pojave (koja prati `sortOrder`). */
export function groupByFamily(models: StudioModel[]): Array<{ family: string; models: StudioModel[] }> {
  const groups = new Map<string, StudioModel[]>();

  for (const model of models) {
    const bucket = groups.get(model.family);
    if (bucket) bucket.push(model);
    else groups.set(model.family, [model]);
  }

  return Array.from(groups, ([family, entries]) => ({ family, models: entries }));
}
