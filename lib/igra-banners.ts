import type { LocalizedText } from "./i18n";

/**
 * Baneri profila (K13, plan K01 §6.5): šest slika `baner.<kljuc>`, otključavaju se nivoom
 * i menjaju SAMO izgled profila (O6) - baner ne nosi ni kredite ni popust. Izbor se čuva u
 * `users.igraBanner`; `igra:setBanner` proverava katalog i nivo, a čitanja vraćaju samo
 * baner koji je i dalje otključan.
 *
 * Fajl namerno ne uvozi `lib/igra-art.ts` (manifest slika ne ulazi u Convex bundle); vezu
 * sa manifestom (ID i naziv) čuva `lib/igra-banners.test.ts`.
 */

export const IGRA_BANNERS = [
  { key: "sveska", level: 1, name: { sr: "Sveska", en: "Notebook" } },
  { key: "laboratorija", level: 3, name: { sr: "Laboratorija", en: "Laboratory" } },
  { key: "studio", level: 5, name: { sr: "Studio", en: "Studio" } },
  { key: "svemir", level: 7, name: { sr: "Svemir", en: "Space" } },
  { key: "grad", level: 9, name: { sr: "Grad", en: "City" } },
  { key: "okean", level: 11, name: { sr: "Okean", en: "Ocean" } },
] as const satisfies ReadonlyArray<{ key: string; level: number; name: LocalizedText }>;

export type IgraBannerKey = (typeof IGRA_BANNERS)[number]["key"];

/** Baner profila koji nikad nije biran (i jedini otključan na nivou 1). */
export const IGRA_DEFAULT_BANNER: IgraBannerKey = "sveska";

export function isIgraBannerKey(value: unknown): value is IgraBannerKey {
  return typeof value === "string" && IGRA_BANNERS.some((banner) => banner.key === value);
}

export function igraBanner(key: IgraBannerKey) {
  return IGRA_BANNERS.find((banner) => banner.key === key)!;
}

/** ID slike banera u manifestu. */
export function igraBannerArt(key: IgraBannerKey): `baner.${IgraBannerKey}` {
  return `baner.${key}`;
}

/** Da li je baner otključan na datom nivou (loš nivo = nivo 1). */
export function isBannerUnlocked(key: IgraBannerKey, level: number): boolean {
  const safe = Number.isFinite(level) ? level : 1;
  return safe >= igraBanner(key).level;
}

/**
 * Baner za prikaz: sačuvani izbor ako postoji u katalogu i otključan je na tekućem nivou,
 * inače `null` (prikazuje se `IGRA_DEFAULT_BANNER`). Ako XP padne ispod praga (npr.
 * vraćena lekcija), profil se tiho vraća na podrazumevani baner; izbor ostaje sačuvan.
 */
export function resolveBanner(stored: string | null | undefined, level: number): IgraBannerKey | null {
  if (!isIgraBannerKey(stored)) return null;
  return isBannerUnlocked(stored, level) ? stored : null;
}
