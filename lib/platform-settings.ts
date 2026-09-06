/**
 * Opšte informacije platforme (N1): kontakt, mreže, cene i pravni podaci.
 *
 * Jedno mesto istine za OBLIK i za PROVERE tih podataka — deli ga admin ekran
 * (da greška stigne pre slanja), Convex mutacija (da greška ne prođe ni ako se
 * ekran zaobiđe) i javno čitanje na sajtu. Bez ovog zajedničkog modula bi ista
 * pravila živela u tri prepisa i razišla se prvom izmenom.
 */
import { PRICING } from "./pricing";

export type PlatformContact = {
  phone?: string;
  email?: string;
  address?: string;
};

export type PlatformSocialKey = "instagram" | "facebook" | "tiktok" | "youtube" | "threads";

export type PlatformSocials = Partial<Record<PlatformSocialKey, string>>;

export type PlatformPricing = {
  basicEur: string;
  premiumEur: string;
  currencyNote?: string;
};

export type PlatformBrand = {
  supportHours?: string;
  legalName?: string;
  pib?: string;
};

export type PlatformSettings = {
  contact: PlatformContact;
  socials: PlatformSocials;
  pricing: PlatformPricing;
  brand: PlatformBrand;
};

/** Ulaz iz baze: sve je opciono i sve može biti prazno. */
export type PlatformSettingsInput = {
  contact?: PlatformContact | null;
  socials?: PlatformSocials | null;
  pricing?: Partial<PlatformPricing> | null;
  brand?: PlatformBrand | null;
} | null | undefined;

export const SOCIAL_KEYS: readonly PlatformSocialKey[] = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "threads",
];

/** Domen koji se očekuje za svaku mrežu; poddomeni (`www.`) su dozvoljeni. */
export const SOCIAL_HOSTS: Record<PlatformSocialKey, string> = {
  instagram: "instagram.com",
  facebook: "facebook.com",
  tiktok: "tiktok.com",
  youtube: "youtube.com",
  threads: "threads.net",
};

/** Namerno labava provera oblika: pravu adresu potvrđuje samo poslata poruka. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** E.164: vodeća „+“, prva cifra nije nula, ukupno 8–15 cifara. */
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

export function isValidPhone(value: string) {
  return PHONE_PATTERN.test(value.trim());
}

export function isValidSocialUrl(key: PlatformSocialKey, value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const expected = SOCIAL_HOSTS[key];
  return url.hostname === expected || url.hostname.endsWith(`.${expected}`);
}

/**
 * Zatečene vrednosti dok admin ne upiše svoje. Cene dolaze iz `lib/pricing.ts`,
 * koji od N1 više NIJE izvor cena za „#pricing“ — samo rezerva kad reda u bazi
 * nema ili je polje prazno.
 */
export const STATIC_FALLBACK: PlatformSettings = {
  contact: { email: "kontakt@nauciai.com" },
  socials: {},
  pricing: { basicEur: PRICING.basic.eur, premiumEur: PRICING.premium.eur },
  brand: {},
};

function pick(live: string | undefined, fallback: string | undefined, valid?: (value: string) => boolean) {
  const candidates = [live, fallback];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    if (valid && !valid(value)) continue;
    return value;
  }
  return undefined;
}

/**
 * Spaja žive vrednosti preko rezerve i izbacuje prazna polja.
 *
 * Prazno ili nevalidno živo polje pada na rezervu, a ako ni ona ne valja, polje
 * se izostavlja — pozivalac time proverava samo postojanje (`if (contact.email)`)
 * umesto da svaki put ponavlja iste provere.
 */
export function resolveSettings(
  live: PlatformSettingsInput,
  fallback: PlatformSettings = STATIC_FALLBACK,
): PlatformSettings {
  const contact: PlatformContact = {};
  const email = pick(live?.contact?.email, fallback.contact.email, isValidEmail);
  if (email) contact.email = email;
  const phone = pick(live?.contact?.phone, fallback.contact.phone, isValidPhone);
  if (phone) contact.phone = phone;
  const address = pick(live?.contact?.address, fallback.contact.address);
  if (address) contact.address = address;

  const socials: PlatformSocials = {};
  for (const key of SOCIAL_KEYS) {
    const url = pick(live?.socials?.[key], fallback.socials[key], (value) => isValidSocialUrl(key, value));
    if (url) socials[key] = url;
  }

  const pricing: PlatformPricing = {
    basicEur: pick(live?.pricing?.basicEur, fallback.pricing.basicEur) ?? "",
    premiumEur: pick(live?.pricing?.premiumEur, fallback.pricing.premiumEur) ?? "",
  };
  const currencyNote = pick(live?.pricing?.currencyNote, fallback.pricing.currencyNote);
  if (currencyNote) pricing.currencyNote = currencyNote;

  const brand: PlatformBrand = {};
  const supportHours = pick(live?.brand?.supportHours, fallback.brand.supportHours);
  if (supportHours) brand.supportHours = supportHours;
  const legalName = pick(live?.brand?.legalName, fallback.brand.legalName);
  if (legalName) brand.legalName = legalName;
  const pib = pick(live?.brand?.pib, fallback.brand.pib);
  if (pib) brand.pib = pib;

  return { contact, socials, pricing, brand };
}
