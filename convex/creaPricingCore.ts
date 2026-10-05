/**
 * Cene v2 (Crea C1, odluka O1): marža po KATEGORIJI posla umesto jedne marže
 * od 2,5× za sve. Čista logika - bez `ctx`, bez baze - pa je isti fajl i u
 * Convex-u i u browseru: cena na dugmetu i naplaćena cena idu kroz istu funkciju.
 *
 * Sve je iza flega `crea_pricing_v2` (`convex/creaFlags.ts`). **Dok je fleg
 * isključen, `resolveCreditFactor` vraća današnji `CREDIT_FACTOR` (216,25) za
 * svaku kategoriju**, pa je svaka cena bit-identična današnjoj (test nad celim
 * katalogom u `creaPricingCore.test.ts`).
 *
 * Vrednosti marži su iz `docs/crea/planovi/K06.md` §9 (odluke K06-1…K06-3).
 */

import { CREDIT_FACTOR } from "./studioPricing";

/** Kurs iz zaglavlja kataloga (STUDIO-CATALOG-V4): `CREDIT_FACTOR = 0,865 × 2,5 × 100`. */
export const EUR_PER_USD = 0.865;

/** Kredita po evru (1 kr = 0,01 €). */
export const CREDITS_PER_EUR = 100;

/**
 * Četiri kategorije, ne devet (K06-1): proba nema svoju kategoriju, jer je cena
 * probe obična cena jeftinog modela na kome se pravi.
 */
export type CreaPriceCategory = "image" | "video" | "audio" | "image_batch";

export const CREA_PRICE_CATEGORIES: readonly CreaPriceCategory[] = ["image", "video", "audio", "image_batch"];

/** Najniža dozvoljena marža u v2 (O1): ×1,5. Test drži svaku kategoriju iznad nje. */
export const MIN_MARGIN_V2 = 1.5;

/**
 * Marže v2 (K06-2). Zvuk ostaje kao danas (×2,5): apsolutni iznosi su mali, a
 * ×1,5 bi premium glas spustio ispod razumne marže. `image_batch` je noćna tura
 * na batch nabavnoj ceni (K08): ×2,0 daje korisniku −30-35% prema dnevnoj v2 ceni.
 */
export const CREA_MARGINS_V2: Readonly<Record<CreaPriceCategory, number>> = {
  image: 1.5,
  video: 1.5,
  audio: 2.5,
  image_batch: 2.0,
};

export function priceCategoryOf(kind: "image" | "video" | "audio", opts: { night: boolean }): CreaPriceCategory {
  if (opts.night && kind === "image") return "image_batch";

  return kind;
}

/**
 * Faktor za datu maržu, sa istim seckanjem na šest decimala kao `computeCredits`
 * (`0,865 × 2,5 × 100` u binarnom zapisu nije tačno 216,25).
 */
export function creditFactorFor(margin: number): number {
  return Math.round(EUR_PER_USD * margin * CREDITS_PER_EUR * 1e6) / 1e6;
}

/**
 * Faktor po kojem se naplaćuje posao. **Fleg isključen = `CREDIT_FACTOR` UVEK**,
 * bez obzira na kategoriju - tako se garantuje da se ništa ne menja dok Jovan
 * ručno ne upali v2.
 */
export function resolveCreditFactor(p: { pricingV2: boolean; category: CreaPriceCategory }): number {
  if (!p.pricingV2) return CREDIT_FACTOR;

  return creditFactorFor(CREA_MARGINS_V2[p.category]);
}

/** Da li posao treba da pamti svoj faktor (samo kad odstupa od današnjeg). */
export function isDefaultCreditFactor(factor: number): boolean {
  return factor === CREDIT_FACTOR;
}
