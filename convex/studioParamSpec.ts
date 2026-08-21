/**
 * `models.paramSpec` (STUDIO-CATALOG-V4 sekcija 1.2): niz kontrola iz kojih UI
 * gradi formu, a server čisti ono što je forma poslala. Čista logika - bez
 * `ctx`, bez baze, bez sata - pa se isti fajl uvozi i u Convex i u browser.
 *
 * Postojeća `studioCore.sanitizeParams` radi nad STARIM `modelCatalog.paramSchema`
 * i ostaje netaknuta dok stari katalog živi; ovo je njen parnjak za `models`.
 */

import { isCombinationPriceable, type PriceRule } from "./studioPricing";

export type ParamControlType =
  | "select"
  | "segmented"
  | "slider"
  | "number"
  | "switch"
  | "textarea"
  | "text";

export type ParamOption = {
  value: string;
  labelSr: string;
  labelEn: string;
  badge?: string;
};

export type ParamControl = {
  key: string;
  type: ParamControlType;
  labelSr: string;
  labelEn: string;
  helpSr?: string;
  helpEn?: string;
  default: string | number | boolean;
  /** Ako fali, kontrola je vidljiva u SVIM režimima. */
  showInModes?: string[];
  options?: ParamOption[];
  min?: number;
  max?: number;
  step?: number;
  unitSr?: string;
  unitEn?: string;
  affectsPrice: boolean;
};

/**
 * Isti prag kao u `studioCore.sanitizeParams`: koliko puta preko `max` je još
 * promašaj forme (pa se odseca), a odakle je gadjanje našeg računa kod
 * provajdera (pa se odbija).
 */
const PARAM_MAGNITUDE_FACTOR = 10;

/** Gornja granica dužine teksta kad je kontrola ne propiše kroz `max`. */
const DEFAULT_TEXT_MAX_LENGTH = 5000;

export type SanitizedSpecParams =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; reason: string };

export function parseParamSpec(raw: string): ParamControl[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const controls: ParamControl[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const control = entry as ParamControl;
    if (typeof control.key !== "string" || typeof control.type !== "string") continue;
    controls.push(control);
  }

  return controls;
}

/** Kontrola bez `showInModes` važi svuda; sa `showInModes` samo u nabrojanim režimima. */
export function isControlVisible(control: ParamControl, inputMode: string | undefined): boolean {
  if (!control.showInModes || inputMode === undefined) return true;

  return control.showInModes.includes(inputMode);
}

function optionValues(control: ParamControl): string[] {
  return (control.options ?? [])
    .map((option) => (option && typeof option.value === "string" ? option.value : null))
    .filter((value): value is string => value !== null);
}

/**
 * Koje opcije jedne kontrole su STVARNO dostupne uz trenutno izabrane ostale
 * parametre. Seedance Mini nema 1080p ni 4K - ali to nigde ne piše kao pravilo:
 * kombinacija `mini|1080p` prosto ne postoji u `lookup` mapi cenovnog pravila.
 * UI zato ne treba spisak zabrana, nego ovaj upit; a server odbija istu
 * kombinaciju kroz `sanitizeSpecParams`, iz istog izvora.
 *
 * Kontrola koja ne utiče na cenu nema šta da sakrije - vraća sve svoje opcije.
 */
export function availableOptionValues(
  control: ParamControl,
  rule: PriceRule,
  params: Record<string, unknown>,
  inputMode?: string,
): string[] {
  const values = optionValues(control);
  if (!control.affectsPrice) return values;

  return values.filter((value) =>
    isCombinationPriceable(rule, { ...params, [control.key]: value }, inputMode),
  );
}

/**
 * Jedina kapija izmedju onoga što je klijent poslao i onoga što provajder
 * naplaćuje, za `models` katalog.
 *
 * Redom: nepoznat ključ tiho ispada (klijent ne dobija mapu polja koja
 * postoje); kontrola koja se ne vidi u ovom režimu ispada; `select`/`segmented`
 * van svog skupa se ODBIJA, ne odseca - kod `lookup` cena nepoznata vrednost
 * znači nepoznatu cenu, a to je tiha rupa; broj se odseca na `min`/`max` ali se
 * odbija kad je van reda veličine; `switch` prima samo boolean; tekst se seče
 * na svoju granicu.
 *
 * Na kraju se popunjavaju podrazumevane vrednosti kontrola koje klijent nije
 * poslao - bez njih bi `lookup` ključ bio nepotpun i cena bi pukla na poslu
 * koji je forma sasvim ispravno poslala. Tek nad POPUNJENIM skupom se proverava
 * da li kombinacija uopšte ima cenu.
 */
export function sanitizeSpecParams(
  spec: ParamControl[],
  rule: PriceRule,
  raw: Record<string, unknown>,
  inputMode?: string,
): SanitizedSpecParams {
  const visible = new Map<string, ParamControl>();
  for (const control of spec) {
    if (isControlVisible(control, inputMode)) visible.set(control.key, control);
  }

  const params: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    const control = visible.get(key);
    if (!control) continue;

    if (control.type === "select" || control.type === "segmented") {
      if (typeof value !== "string" || !optionValues(control).includes(value)) {
        return { ok: false, reason: `NEPOZNATA_VREDNOST_PARAMETRA:${key}` };
      }
      params[key] = value;
      continue;
    }

    if (control.type === "number" || control.type === "slider") {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (control.max !== undefined && value > control.max * PARAM_MAGNITUDE_FACTOR) {
        return { ok: false, reason: `VAN_OPSEGA:${key}` };
      }
      const low = control.min !== undefined ? Math.max(value, control.min) : value;
      params[key] = control.max !== undefined ? Math.min(low, control.max) : low;
      continue;
    }

    if (control.type === "switch") {
      if (typeof value !== "boolean") continue;
      params[key] = value;
      continue;
    }

    if (control.type === "textarea" || control.type === "text") {
      if (typeof value !== "string") continue;
      params[key] = value.slice(0, control.max ?? DEFAULT_TEXT_MAX_LENGTH);
    }
  }

  for (const [key, control] of visible) {
    if (params[key] === undefined) params[key] = control.default;
  }

  if (!isCombinationPriceable(rule, params, inputMode)) {
    return { ok: false, reason: `NEDOSTUPNA_KOMBINACIJA:${describeCombination(rule, params)}` };
  }

  return { ok: true, params };
}

/** Šta je tačno odbijeno, da poruka u podršci ne bude samo "nedostupno". */
function describeCombination(rule: PriceRule, params: Record<string, unknown>): string {
  const keys = [
    ...(rule.lookup?.params ?? []),
    ...(rule.multipliers ?? []).map((multiplier) => multiplier.param),
  ];

  return keys.map((key) => `${key}=${String(params[key])}`).join(",");
}
