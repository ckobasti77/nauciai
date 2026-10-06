import type { Locale } from "./i18n";

/**
 * Cena i u dinarima (K28, U7). Kredit je €0,01 (STUDIO-PLAN D.1), pa je dinar
 * samo prikaz: kurs je konstanta sa datumom, ne živ podatak - menja se ručno.
 * Izvor: NBS srednji kurs, kursna lista br. 189 od 06.10.2026 (117,4948 RSD za
 * 1 EUR; https://kurs.resenje.org/api/v1/currencies/eur/rates/today, preuzeto
 * 2026-10-06). Ništa se ne naplaćuje u dinarima.
 */
export const EUR_RSD = { rate: 117.4948, date: "2026-10-06" } as const;

/** Evra po kreditu. */
export const EUR_PER_CREDIT = 0.01;

/** Dinara za `credits` kredita, zaokruženo na ceo dinar (najmanje 1 za plaćen rad). */
export function creditsToDinars(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return Math.max(1, Math.round(credits * EUR_PER_CREDIT * EUR_RSD.rate));
}

/** Evra za `credits` kredita, na dve decimale. */
export function creditsToEuros(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return Math.round(credits * EUR_PER_CREDIT * 100) / 100;
}

/** „≈ 19 din" / „≈ RSD 19" sa razmakom hiljada po jeziku. */
export function formatDinars(credits: number, locale: Locale): string {
  const value = creditsToDinars(credits).toLocaleString(locale === "sr" ? "sr-Latn-RS" : "en-GB");
  return locale === "sr" ? `≈ ${value} din` : `≈ RSD ${value}`;
}

export function formatEuros(credits: number, locale: Locale): string {
  return creditsToEuros(credits).toLocaleString(locale === "sr" ? "sr-Latn-RS" : "en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

/** „kurs 117,49 od 06.10.2026." - da korisnik zna da je kurs fiksan. */
export function rateNote(locale: Locale): string {
  const [year, month, day] = EUR_RSD.date.split("-");
  const rate = EUR_RSD.rate.toLocaleString(locale === "sr" ? "sr-Latn-RS" : "en-GB", { maximumFractionDigits: 2 });
  return locale === "sr" ? `1 € = ${rate} din (NBS, ${day}.${month}.${year}.)` : `€1 = RSD ${rate} (NBS, ${day}/${month}/${year})`;
}
