/**
 * Čista logika biblioteke komponenti iz STUDIO-CATALOG-V4 sekcije 6:
 * `<ParamControl>`, `<ParamForm>`, `<PriceTag>` i `<GenerateButton>` ne rade
 * ništa što nije ovde, pa se sve što se korisniku PRIKAŽE može tvrditi testom
 * bez renderovanja.
 *
 * Cena se NE računa ovde. Sve ide kroz `computeCredits` iz
 * `convex/studioPricing.ts` - sekcija 1.3 kataloga izričito traži da je ista
 * funkcija uvezena i u Convex i u browser, jer dve računice cene su dve cene.
 *
 * Nijedna funkcija ne zna ime nijednog modela; sve dolazi iz `paramSpec`-a i
 * `priceRule`-a reda kataloga.
 */

import { isControlVisible, type ParamControl, type ParamOption } from "@/convex/studioParamSpec";
import { computeCredits, type PriceRule } from "@/convex/studioPricing";

import type { Locale } from "./i18n";

export type ParamValue = string | number | boolean;
export type ParamValues = Record<string, ParamValue>;

/**
 * Kontrole koje se vide u datom režimu. Dva reda kataloga (Kling Turbo) imaju
 * DVE kontrole sa istim ključem i različitim `showInModes` - u jednom režimu
 * vidljiva je tačno jedna, pa se po ključu zadržava prva vidljiva i time se
 * dupli ključ ne može provući do forme.
 */
export function visibleControls(spec: ParamControl[], inputMode?: string): ParamControl[] {
  const seen = new Set<string>();
  const controls: ParamControl[] = [];

  for (const control of spec) {
    if (!isControlVisible(control, inputMode)) continue;
    if (seen.has(control.key)) continue;
    seen.add(control.key);
    controls.push(control);
  }

  return controls;
}

/**
 * Vrednosti forme za dati režim. `previous` se zadržava samo za kontrole koje
 * u novom režimu i dalje postoje I dalje prihvataju tu vrednost - prebacivanje
 * režima kod Kling Turbo-a spušta rezoluciju sa 1080p na 720p, jer je 720p
 * jedina opcija te kontrole u režimu `first_last`.
 */
export function paramValuesForMode(
  spec: ParamControl[],
  inputMode?: string,
  previous: ParamValues = {},
): ParamValues {
  const values: ParamValues = {};

  for (const control of visibleControls(spec, inputMode)) {
    const carried = previous[control.key];
    values[control.key] = isAcceptableValue(control, carried) ? carried : control.default;
  }

  return values;
}

function optionValues(control: ParamControl): string[] {
  return (control.options ?? [])
    .map((option) => (option && typeof option.value === "string" ? option.value : null))
    .filter((value): value is string => value !== null);
}

function isAcceptableValue(control: ParamControl, value: ParamValue | undefined): value is ParamValue {
  if (value === undefined) return false;

  if (control.type === "select" || control.type === "segmented") {
    return typeof value === "string" && optionValues(control).includes(value);
  }
  if (control.type === "number" || control.type === "slider") {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    if (control.min !== undefined && value < control.min) return false;

    return control.max === undefined || value <= control.max;
  }
  if (control.type === "switch") return typeof value === "boolean";

  return typeof value === "string";
}

export function clampControlNumber(control: ParamControl, value: number): number {
  const low = control.min !== undefined ? Math.max(value, control.min) : value;

  return control.max !== undefined ? Math.min(low, control.max) : low;
}

/**
 * Objekat parametara koji ide i u `computeCredits` (dugme) i u `createJob`
 * (server). JEDAN objekat, jer je razilaženje ta dva mesta tačno ono što
 * katalog zabranjuje.
 *
 * `measured` su količine koje korisnik ne bira nego se mere iz ulaza (dužina
 * okačenog videa, broj znakova teksta, broj dodatnih ulaznih slika). Forma ih
 * prikazuje u ceni, ali server ih meri sam - klijentska vrednost tu nikad nije
 * poslednja reč.
 */
export function buildParams(
  spec: ParamControl[],
  values: ParamValues,
  inputMode?: string,
  measured: Record<string, number> = {},
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  for (const control of visibleControls(spec, inputMode)) {
    const value = values[control.key];

    if (control.type === "number" || control.type === "slider") {
      const asNumber = typeof value === "number" ? value : Number(value);
      params[control.key] = Number.isFinite(asNumber)
        ? clampControlNumber(control, asNumber)
        : control.default;
      continue;
    }

    if (control.type === "switch") {
      params[control.key] = typeof value === "boolean" ? value : control.default;
      continue;
    }

    if (control.type === "select" || control.type === "segmented") {
      params[control.key] =
        typeof value === "string" && optionValues(control).includes(value) ? value : control.default;
      continue;
    }

    params[control.key] = typeof value === "string" ? value : control.default;
  }

  for (const [key, quantity] of Object.entries(measured)) {
    if (Number.isFinite(quantity)) params[key] = quantity;
  }

  return params;
}

/**
 * Cena u kreditima za tačno ove parametre, ili `null` kad kombinacija nema
 * cenu (Seedance Mini na 1080p) ili količina još nije poznata (nije okačen
 * video kome se meri trajanje). `null` je "ne znam", i pozivalac ga prikazuje
 * kao takvog - nikad kao nulu, jer nula na dugmetu znači besplatno.
 */
export function creditsFor(
  rule: PriceRule,
  params: Record<string, unknown>,
  inputMode?: string,
): number | null {
  try {
    const credits = computeCredits(rule, params, inputMode);

    return Number.isFinite(credits) ? credits : null;
  } catch {
    return null;
  }
}

export type PriceDelta =
  | { kind: "none" }
  | { kind: "same" }
  | { kind: "multiplier"; factor: number }
  | { kind: "delta"; credits: number };

/**
 * Šta bi jedna opcija uradila ceni, PRE nego što je korisnik izabere
 * (katalog 1.2). Računa se iz `computeCredits`-a nad hipotetičkom vrednošću -
 * nema tabele razlika koja bi mogla da zastari.
 *
 * `same` nije isto što i `none`: kod Klinga na 4K zvuk se naplaćuje isto kao
 * bez njega, i to mora da piše, a ne da značka nestane (katalog 3.1).
 */
export function priceDelta(
  rule: PriceRule,
  params: Record<string, unknown>,
  key: string,
  candidate: unknown,
  inputMode?: string,
): PriceDelta {
  const base = creditsFor(rule, params, inputMode);
  const next = creditsFor(rule, { ...params, [key]: candidate }, inputMode);
  if (base === null || next === null) return { kind: "none" };

  if (next === base) return { kind: "same" };

  const factor = base > 0 ? next / base : 0;
  if (factor >= 2 && Number.isInteger(factor)) return { kind: "multiplier", factor };

  return { kind: "delta", credits: next - base };
}

/**
 * Razlika u ceni za JEDAN korak klizača (sekunda trajanja, sloj, slika).
 * Klizač na gornjoj granici gleda korak unazad - cena po koraku je ista, a
 * značka time ne nestaje baš tamo gde je generacija najskuplja.
 */
export function stepPriceDelta(
  rule: PriceRule,
  params: Record<string, unknown>,
  control: ParamControl,
  inputMode?: string,
): PriceDelta {
  const step = control.step ?? 1;
  const current = params[control.key];
  if (typeof current !== "number" || !Number.isFinite(current)) return { kind: "none" };

  if (control.max === undefined || current + step <= control.max) {
    return priceDelta(rule, params, control.key, current + step, inputMode);
  }

  const lower = { ...params, [control.key]: current - step };
  const base = creditsFor(rule, lower, inputMode);
  const next = creditsFor(rule, params, inputMode);
  if (base === null || next === null) return { kind: "none" };
  if (next === base) return { kind: "same" };

  return { kind: "delta", credits: next - base };
}

export function formatCredits(credits: number, locale: Locale): string {
  return `${credits} ${locale === "sr" ? "kr" : "cr"}`;
}

export function formatCreditsValue(credits: number): string {
  return String(credits);
}

/** Puni naziv sa brojem za čitače ekrana: npr. "16 kredita" ili "1 kredit". */
export function formatCreditsLong(credits: number, locale: Locale): string {
  if (locale === "sr") {
    const abs = Math.abs(credits);
    const mod10 = abs % 10;
    const mod100 = abs % 100;
    if (mod10 === 1 && mod100 !== 11) return `${credits} kredit`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${credits} kredita`;
    return `${credits} kredita`;
  }
  return `${credits} ${Math.abs(credits) === 1 ? "credit" : "credits"}`;
}

/** Tekst značke uz kontrolu: `+12 kr`, `×2`, `isto`. */
export function priceDeltaLabel(delta: PriceDelta, locale: Locale): string | null {
  if (delta.kind === "none") return null;
  if (delta.kind === "same") return locale === "sr" ? "ista cena" : "same price";
  if (delta.kind === "multiplier") return `×${delta.factor}`;

  const sign = delta.credits > 0 ? "+" : "−";

  return `${sign}${formatCredits(Math.abs(delta.credits), locale)}`;
}

/** Vrednost značke bez oznake jedinice: `+12`, `−5`, `×2`, `ista cena`. */
export function priceDeltaValue(delta: PriceDelta, locale: Locale): string | null {
  if (delta.kind === "none") return null;
  if (delta.kind === "same") return locale === "sr" ? "ista cena" : "same price";
  if (delta.kind === "multiplier") return `×${delta.factor}`;

  const sign = delta.credits > 0 ? "+" : "−";

  return `${sign}${Math.abs(delta.credits)}`;
}

/**
 * Cena po jedinici količine (kr/s kod videa, kr/min kod zvuka), za značku uz
 * model. Vraća `null` kad pravilo nema količinu ili kad količina nije poznata.
 * Deli se UKUPNA cena, pa se zaokruživanje na pun peti sekund (Kling lipsync)
 * vidi u cifri umesto da bude sakriveno.
 */
export function creditsPerUnit(
  rule: PriceRule,
  params: Record<string, unknown>,
  inputMode?: string,
): number | null {
  if (rule.quantityParam === undefined) return null;
  const quantity = params[rule.quantityParam];
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) return null;

  const total = creditsFor(rule, params, inputMode);

  return total === null ? null : total / quantity;
}

/** `27 kr/s` odnosno `27,4 kr/s` - decimala se piše samo kad postoji. */
export function formatCreditsPerUnit(perUnit: number, unit: string, locale: Locale): string {
  const rounded = Math.round(perUnit * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(".", locale === "sr" ? "," : ".");

  return `${text} ${locale === "sr" ? "kr" : "cr"}/${unit}`;
}

/** `27` odnosno `27,4` - samo broj kao string. */
export function creditsPerUnitValue(perUnit: number, locale: Locale): string {
  const rounded = Math.round(perUnit * 10) / 10;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(".", locale === "sr" ? "," : ".");
}

/** `27/s` odnosno `27,4/s` - broj sa jedinicom, bez kr/cr (za prikaz uz ikonicu). */
export function formatCreditsPerUnitValue(perUnit: number, unit: string, locale: Locale): string {
  const text = creditsPerUnitValue(perUnit, locale);
  return `${text}/${unit}`;
}

export function controlLabel(control: ParamControl, locale: Locale): string {
  return locale === "sr" ? control.labelSr : control.labelEn;
}

export function controlHelp(control: ParamControl, locale: Locale): string | undefined {
  return locale === "sr" ? control.helpSr : control.helpEn;
}

export function optionLabel(option: ParamOption, locale: Locale): string {
  return locale === "sr" ? option.labelSr : option.labelEn;
}

export function controlUnit(control: ParamControl, locale: Locale): string | undefined {
  return locale === "sr" ? control.unitSr : control.unitEn;
}
