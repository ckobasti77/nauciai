/**
 * Čiste funkcije za admin ekran Studija (P8). Matematika je namerno
 * DUPLIRANA iz `convex/studioCore.ts`, ne uvezena - "use client" komponente u
 * ovom repou ne uvoze `convex/*.ts` module direktno (isti obrazac kao
 * `PROMPT_MAX_LENGTH` u `lib/studio-form.ts`). `lib/studio-admin.test.ts`
 * uvozi OBE strane i tvrdi da se poklapaju, da razilaženje ne prođe nezapaženo.
 */

import type { Locale } from "./i18n";

/** ECB kurs iz STUDIO-PLAN §2 (14.08.2026): 1 $ = 0,865 €. */
export const EUR_PER_USD = 0.865;

/** Ispod ovog množioca se marža boji upozoravajuće. */
export const LOW_MARGIN_THRESHOLD = 2;

/**
 * Marža modela = maloprodajna vrednost `creditCost`-a u evrima (100 kr = 1 €)
 * podeljena nabavnom cenom u evrima. `null` kad nabavna cena nije upisana (0
 * ili manje) - to je "nema podatka", ne "beskonačna marža".
 */
export function computeMargin(creditCost: number, estimatedCostUsd: number): number | null {
  const costEur = estimatedCostUsd * EUR_PER_USD;
  if (costEur <= 0) return null;
  return creditCost / 100 / costEur;
}

export type MarginTone = "warn" | "ok" | "unknown";

export function marginTone(margin: number | null): MarginTone {
  if (margin === null) return "unknown";
  return margin < LOW_MARGIN_THRESHOLD ? "warn" : "ok";
}

export function formatMargin(margin: number | null): string {
  return margin === null ? "—" : `${margin.toFixed(1)}x`;
}

const JOB_STATUS_LABELS_SR: Record<string, string> = {
  reserved: "Rezervisano",
  running: "U toku",
  done: "Završeno",
  failed: "Neuspešno",
  refunded: "Vraćeno",
};

const JOB_STATUS_LABELS_EN: Record<string, string> = {
  reserved: "Reserved",
  running: "Running",
  done: "Done",
  failed: "Failed",
  refunded: "Refunded",
};

export function jobStatusLabel(status: string, locale: Locale = "sr"): string {
  const labels = locale === "en" ? JOB_STATUS_LABELS_EN : JOB_STATUS_LABELS_SR;
  return labels[status] ?? status;
}

/**
 * Mapiranje razloga zašto posao nema izmeren trošak u ljudske rečenice (tačka 2).
 * Sirov kod ostaje u `title` atributu za pretragu/dijagnostiku.
 */
const KNOWN_REASONS: Record<string, { sr: string; en: string }> = {
  "provajder nije prijavio upotrebu": {
    sr: "Provajder nije poslao podatke o potrošnji",
    en: "Provider did not report token usage",
  },
  "provajder nije prijavio kolicinu": {
    sr: "Provajder nije prijavio dužinu ili količinu",
    en: "Provider did not report measured quantity",
  },
  "model se ne naplacuje po tokenima": {
    sr: "Model se ne naplaćuje po tokenima",
    en: "Model is not billed by tokens",
  },
  "fal billing event nije stigao": {
    sr: "Čeka se noćni fal obračun",
    en: "Awaiting nightly fal billing event",
  },
  "nepoznat oblik odgovora": {
    sr: "Nepoznat format odgovora provajdera",
    en: "Unrecognized provider response format",
  },
  "model nije u katalogu": {
    sr: "Model više nije u katalogu",
    en: "Model not found in catalog",
  },
  "nema tarife za kategoriju prompt": {
    sr: "Nedostaje tarifa za prompt tokene",
    en: "Missing rate for prompt tokens",
  },
  "nema tarife za kategoriju output": {
    sr: "Nedostaje tarifa za izlazne tokene",
    en: "Missing rate for output tokens",
  },
  "nema tarife za kategoriju thinking": {
    sr: "Nedostaje tarifa za tokene razmišljanja",
    en: "Missing rate for thinking tokens",
  },
};

export function actualCostReasonLabel(reason: string, locale: Locale = "sr"): string {
  const known = KNOWN_REASONS[reason];
  if (known) {
    return locale === "en" ? known.en : known.sr;
  }

  // Dinamičko prepoznavanje "nema tarife za kategoriju <kategorija>"
  const match = reason.match(/^nema tarife za kategoriju (.+)$/);
  if (match) {
    const category = match[1];
    return locale === "en"
      ? `Missing rate for ${category} tokens`
      : `Nedostaje tarifa za kategoriju ${category}`;
  }

  return reason;
}

/**
 * Modeli kod kojih se `actualCostUsd` računa preko `quantityCostOutcome` (naš priceRule
 * primenjen na prijavljenu količinu) umesto nezavisne fakture provajdera (Nalaz Y3).
 */
export const QUANTITY_RATE_MODEL_SLUGS = new Set([
  "seedance-20",
  "seedance-25",
  "veo-31-fast",
  "gemini-omni",
]);

export function isQuantityRateModel(slug: string): boolean {
  return QUANTITY_RATE_MODEL_SLUGS.has(slug);
}

export type ModelCostOrigin = "provider_invoice" | "internal_quantity_rate" | "no_measurement";

export function modelCostOrigin(slug: string, measuredJobs: number): ModelCostOrigin {
  if (measuredJobs <= 0) return "no_measurement";
  if (isQuantityRateModel(slug)) return "internal_quantity_rate";
  return "provider_invoice";
}

export function costOriginLabel(origin: ModelCostOrigin, locale: Locale = "sr"): string {
  if (origin === "provider_invoice") {
    return locale === "en" ? "provider invoice" : "faktura provajdera";
  }
  if (origin === "internal_quantity_rate") {
    return locale === "en"
      ? "internal rate over reported quantity"
      : "naša tarifa nad prijavljenom količinom";
  }
  return locale === "en" ? "no measurement" : "nema merenja";
}

export function marginColumnTitle(origin: ModelCostOrigin, locale: Locale = "sr"): string {
  if (origin === "internal_quantity_rate") {
    return locale === "en" ? "Calculated margin (quantity)" : "Računska marža (količina)";
  }
  return locale === "en" ? "Actual margin" : "Stvarna marža";
}
