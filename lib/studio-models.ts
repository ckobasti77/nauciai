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

/**
 * Monohromni inicijal / dvoslovni znak porodice modela (npr. NB za Nano Banana,
 * VE za Veo, KL za Kling). Zamenjuje emoji markere za dosledan izgled.
 */
export function familyMark(model: StudioModel): string {
  const name = model.family.trim();
  const parts = name.split(/[\s-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export const MODEL_BADGE_LABELS: Record<StudioModelBadge, Record<Locale, string>> = {
  preporuceno: { sr: "preporučeno", en: "recommended" },
  skupo: { sr: "skupo", en: "expensive" },
  novo: { sr: "novo", en: "new" },
};

/**
 * Firma koja STVARNO pravi model - onaj čiji znak studentu nešto znači.
 * NIJE isto što i `provider`: `provider` je RUTA (fal je ruter, byteplus je ruta
 * do ByteDance modela), a brend je autor. Zato se izvodi iz `family`, ne iz
 * `provider` - Seedream ide i preko `fal` i preko `byteplus`, a firma je u oba
 * slučaja ByteDance.
 */
export type ProviderBrand =
  | "google"
  | "openai"
  | "bytedance"
  | "kling"
  | "minimax"
  | "elevenlabs";

export const PROVIDER_BRANDS: readonly ProviderBrand[] = [
  "google",
  "openai",
  "bytedance",
  "kling",
  "minimax",
  "elevenlabs",
] as const;

/**
 * Familija modela -> firma. Dodavanje familije bez unosa ovde znači da
 * `providerBrandOf` vrati `null`, što obara test kataloga - novi model bez
 * znaka se ne provuče tiho.
 */
const FAMILY_TO_BRAND: Record<string, ProviderBrand> = {
  "nano-banana": "google",
  gemini: "google",
  veo: "google",
  "gpt-image": "openai",
  seedream: "bytedance",
  seedance: "bytedance",
  kling: "kling",
  minimax: "minimax",
  elevenlabs: "elevenlabs",
};

/** Ime firme za `aria-label` znaka. Proper nouns - isto u oba jezika. */
export const PROVIDER_BRAND_NAME: Record<ProviderBrand, string> = {
  google: "Google",
  openai: "OpenAI",
  bytedance: "ByteDance",
  kling: "Kling",
  minimax: "MiniMax",
  elevenlabs: "ElevenLabs",
};

/**
 * Firma iza modela, ili `null` kad familija nije mapirana. `null` znači "ne
 * znam ko je autor" i pozivalac tada pada na dvoslovni `familyMark` - nikad ne
 * izmišlja znak. Izvedeno iz `family`, jer je `provider` samo ruta.
 */
export function providerBrandOf(model: Pick<StudioModel, "family">): ProviderBrand | null {
  return FAMILY_TO_BRAND[model.family] ?? null;
}

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
