/**
 * Admin ekran nad v4 katalogom (S7): marža za podrazumevana podešavanja i
 * cena SVAKE kombinacije, da se odmah vidi šta jedna izmena `baseUsd`-a
 * pomera. Jedan broj u pravilu menja celu porodicu varijanti - zato tabela, a
 * ne jedan red.
 *
 * Cena ide isključivo kroz `computeCredits`/`computeCostUsd` iz
 * `convex/studioPricing.ts` - istu funkciju zove i naplata (katalog 1.3). Ovde
 * nema nijedne aritmetike nad cenom osim deljenja koje čini maržu.
 */

import { parseQuantitySource } from "@/convex/studioJobCore";
import type { ParamControl } from "@/convex/studioParamSpec";
import { computeCostUsd, computeCredits, type PriceRule } from "@/convex/studioPricing";

import type { Locale } from "./i18n";
import { computeMargin } from "./studio-admin";
import { buildParams, paramValuesForMode, visibleControls, type ParamValues } from "./studio-params";

/** Koliko redova tabela pokazuje pre nego što prizna da ih ima još. */
export const MAX_PRICE_ROWS = 24;

export type PriceRow = {
  /** Vrednosti koje ovaj red opisuje, npr. `1080p · sa zvukom`. */
  label: string;
  inputMode: string;
  credits: number;
  costUsd: number;
  margin: number | null;
};

export type PriceTable = {
  rows: PriceRow[];
  /** Koliko kombinacija je izostavljeno iz prikaza; 0 kad su sve tu. */
  hidden: number;
  /** Najmanja marža u CELOM prostoru, ne samo u prikazanim redovima. */
  worstMargin: number | null;
};

/**
 * Kontrole koje diraju cenu, sa svojim opcijama. Klizači i brojevi ulaze
 * podrazumevanom vrednošću: njihov doprinos je linearan (trajanje množi), pa
 * bi po tri reda na svaki utopili one koji cenu stvarno menjaju.
 */
function pricingAxes(spec: ParamControl[], inputMode: string): Array<{ control: ParamControl; values: unknown[] }> {
  const axes: Array<{ control: ParamControl; values: unknown[] }> = [];

  for (const control of visibleControls(spec, inputMode)) {
    if (!control.affectsPrice) continue;

    if (control.type === "select" || control.type === "segmented") {
      const values = (control.options ?? []).map((option) => option.value);
      if (values.length > 1) axes.push({ control, values });
      continue;
    }
    if (control.type === "switch") axes.push({ control, values: [false, true] });
  }

  return axes;
}

function optionLabelFor(control: ParamControl, value: unknown, locale: Locale): string {
  if (control.type === "switch") {
    const on = value === true;
    if (locale === "sr") return on ? "sa zvukom" : "bez zvuka";

    return on ? "with audio" : "without audio";
  }

  const option = (control.options ?? []).find((entry) => entry.value === value);
  if (!option) return String(value);

  return locale === "sr" ? option.labelSr : option.labelEn;
}

/**
 * Cena svake kombinacije, po svakom ulaznom režimu. Kombinacija koja nema cenu
 * (Seedance Mini na 1080p) se PRESKAČE - nije red sa nulom, nego kombinacija
 * koju katalog ne nudi ni korisniku.
 */
export function priceTable(input: {
  paramSpec: ParamControl[];
  priceRule: PriceRule;
  inputModes: string[];
  capabilities: string;
  locale: Locale;
  limit?: number;
}): PriceTable {
  const limit = input.limit ?? MAX_PRICE_ROWS;
  const quantity = quantityOverride(input.capabilities);
  const rows: PriceRow[] = [];
  let total = 0;
  let worstMargin: number | null = null;

  for (const inputMode of input.inputModes.length > 0 ? input.inputModes : [""]) {
    const axes = pricingAxes(input.paramSpec, inputMode);
    const base = paramValuesForMode(input.paramSpec, inputMode);

    for (const combination of cartesian(axes)) {
      const values = { ...base, ...combination.values };
      const params = buildParams(input.paramSpec, values, inputMode, quantity);

      let credits: number;
      let costUsd: number;
      try {
        credits = computeCredits(input.priceRule, params, inputMode);
        costUsd = computeCostUsd(input.priceRule, params, inputMode);
      } catch {
        continue;
      }
      if (!Number.isFinite(credits) || !Number.isFinite(costUsd)) continue;

      total += 1;
      const margin = computeMargin(credits, costUsd);
      if (margin !== null && (worstMargin === null || margin < worstMargin)) worstMargin = margin;

      if (rows.length < limit) {
        rows.push({
          label: combination.labels
            .map(([control, value]) => optionLabelFor(control, value, input.locale))
            .join(" · "),
          inputMode,
          credits,
          costUsd,
          margin,
        });
      }
    }
  }

  return { rows, hidden: Math.max(0, total - rows.length), worstMargin };
}

/**
 * Merena količina (sekunde okačenog zvuka, znakovi teksta) nije kontrola, pa
 * je forma ne nosi. Za tabelu se uzima NAJMANJA dozvoljena - marža je tu
 * najtanja, jer se konstantan dodatak i zaokruživanje na kraju raspodeljuju
 * na najmanju količinu.
 */
function quantityOverride(capabilities: string): Record<string, number> {
  const source = parseQuantitySource(capabilities);

  return source ? { [source.param]: source.min } : {};
}

type Combination = { values: ParamValues; labels: Array<[ParamControl, unknown]> };

function cartesian(axes: Array<{ control: ParamControl; values: unknown[] }>): Combination[] {
  let combinations: Combination[] = [{ values: {}, labels: [] }];

  for (const axis of axes) {
    const next: Combination[] = [];
    for (const combination of combinations) {
      for (const value of axis.values) {
        next.push({
          values: { ...combination.values, [axis.control.key]: value as string | number | boolean },
          labels: [...combination.labels, [axis.control, value]],
        });
      }
    }
    combinations = next;
  }

  return combinations;
}

/**
 * Marža za PODRAZUMEVANA podešavanja - kolona u tabeli modela. `null` kad
 * podrazumevani izbor nema cenu, što je kvar u redu kataloga, ne nula.
 */
export function defaultMargin(input: {
  paramSpec: ParamControl[];
  priceRule: PriceRule;
  inputModes: string[];
  capabilities: string;
}): number | null {
  const inputMode = input.inputModes[0];
  const values = paramValuesForMode(input.paramSpec, inputMode);
  const params = buildParams(input.paramSpec, values, inputMode, quantityOverride(input.capabilities));

  try {
    return computeMargin(
      computeCredits(input.priceRule, params, inputMode),
      computeCostUsd(input.priceRule, params, inputMode),
    );
  } catch {
    return null;
  }
}

/**
 * Sme li se `baseUsd` uopšte menjati na ovom pravilu. Pravilo sa `lookup`
 * tabelom cenu čita iz nje (katalog 1.3), pa bi upisan broj stajao u redu a ne
 * bi se video ni u jednoj ceni - isto pravilo koje `applyPriceEdit` proverava
 * na serveru.
 */
export function isBaseUsdEditable(rule: PriceRule): boolean {
  return rule.lookup === undefined;
}
