/**
 * Rezervna ruta (Crea C3; plan `docs/crea/planovi/K06.md` §11, odluka K06-12).
 * Čista logika: kada sme da se posao koji je provajder odbio preda DRUGOM
 * provajderu, i kako izgleda red `capabilities.fallback`.
 *
 * Pravila:
 * - cena se NE menja posle rezervacije - korisnik plaća ono što je video;
 * - rezerva sme samo kad i posle nje ostaje marža od bar ×1,2 nad njenom
 *   nabavnom cenom (`fallbackAllowed`);
 * - samo za greške koje su prolazne kod provajdera (preopterećenje, kvota, 5xx),
 *   nikad za odbijen sadržaj ili pogrešan zahtev - tamo bi i rezerva pala;
 * - nikad na mock: rezerva traži pravi ključ drugog provajdera.
 */

import { CREDITS_PER_EUR, EUR_PER_USD } from "./creaPricingCore";
import type { FalMap } from "./providers/falInputs";
import type { PriceRule } from "./studioPricing";

/** Najmanja marža koja mora da ostane posle prelaska na rezervu. */
export const FALLBACK_MIN_MARGIN = 1.2;

export type CatalogFallback = {
  provider: "fal";
  endpoints: Record<string, string>;
  priceRule: PriceRule;
  fal?: FalMap;
};

/** `capabilities.fallback` reda, ili `null` kad ga red nema ili je neispravan. */
export function parseFallback(capabilities: Record<string, unknown>): CatalogFallback | null {
  const raw = capabilities.fallback;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const fallback = raw as Partial<CatalogFallback>;
  if (fallback.provider !== "fal") return null;
  if (!fallback.endpoints || typeof fallback.endpoints !== "object") return null;
  if (!fallback.priceRule || typeof fallback.priceRule !== "object") return null;

  return fallback as CatalogFallback;
}

/**
 * Prolazna greška provajdera: HTTP 429 ili 5xx u poruci, ili Google-ova kvota
 * (`googleHttpErrorMessage` piše status u zagradi: „Google API nije uspeo (503)").
 */
export function isRetriableProviderError(message: string): boolean {
  if (/RESOURCE_EXHAUSTED|KVOTA/i.test(message)) return true;

  return /\((429|5\d\d)\)/.test(message);
}

/**
 * Sme li rezerva: ono što je korisnik PLATIO (krediti → evri → dolari, 1 kr =
 * 0,01 €) mora da pokrije nabavnu cenu rezerve bar ×1,2. Faktor po kojem je
 * posao naplaćen tu ne učestvuje - bitan je novac koji je stvarno ušao.
 */
export function fallbackAllowed(p: { reservedCredits: number; fallbackUsd: number }): boolean {
  if (!Number.isFinite(p.fallbackUsd) || p.fallbackUsd <= 0) return false;
  if (!Number.isFinite(p.reservedCredits) || p.reservedCredits <= 0) return false;
  const paidUsd = p.reservedCredits / (CREDITS_PER_EUR * EUR_PER_USD);

  return p.fallbackUsd * FALLBACK_MIN_MARGIN <= paidUsd;
}
