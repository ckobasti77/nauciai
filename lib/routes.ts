import type { Locale } from "./i18n";

/**
 * Jedina tačka istine za prevod javnih URL segmenata. Klijent i server računaju
 * URL istom funkcijom (`toPublicPath`, preko `withLocale`), pa ne mogu da se raziđu.
 *
 * Kanonski segment == ime foldera u `app/[locale]/(marketing)/`. Javni slug se
 * prevodi po jeziku; sve što nije ovde (npr. `/app`, `/sign-in`, slug posta)
 * prolazi neizmenjeno. Srpski je jezik-bez-prefiksa (`/kursevi`), engleski nosi
 * `/en` (`/en/courses`).
 *
 * `routes.ts` sme da uvozi SAMO `type Locale` (izbrisan u runtime-u) — `i18n.ts`
 * uvozi `toPublicPath` odavde, pa bi vrednosni uvoz napravio ciklus.
 */
const SEGMENTS: Record<string, Record<Locale, string>> = {
  courses: { sr: "kursevi", en: "courses" },
  community: { sr: "zajednica", en: "community" },
  studio: { sr: "studio", en: "studio" },
  pricing: { sr: "pretplata", en: "pricing" },
  "privacy-policy": { sr: "politika-privatnosti", en: "privacy-policy" },
  "studio-terms": { sr: "uslovi-studio", en: "studio-terms" },
  "3d": { sr: "3d", en: "3d" },
};

// Obrnuta mapa (bilo koji jezički slug -> kanonski segment) gradi se jednom, na
// nivou modula. Kanonski segment mapira i sam na sebe (`courses` -> `courses`).
const SLUG_TO_CANONICAL: Record<string, string> = {};
for (const [canonical, variants] of Object.entries(SEGMENTS)) {
  SLUG_TO_CANONICAL[canonical] = canonical;
  for (const slug of Object.values(variants)) {
    SLUG_TO_CANONICAL[slug] = canonical;
  }
}

/** Prima slug bilo kog jezika, vraća kanonski; nepoznat vraća neizmenjen. */
export function canonicalSegment(slug: string): string {
  return SLUG_TO_CANONICAL[slug] ?? slug;
}

/** Kanonski segment -> javni slug za dati jezik; nepoznat vraća neizmenjen. */
export function publicSegment(canonical: string, locale: Locale): string {
  return SEGMENTS[canonical]?.[locale] ?? canonical;
}

/** Odseca `?query`/`#hash`; vraća [putanja, sufiks] gde sufiks uključuje `?`/`#`. */
function splitSuffix(path: string): [string, string] {
  const at = path.search(/[?#]/);
  return at === -1 ? [path, ""] : [path.slice(0, at), path.slice(at)];
}

/**
 * Prihvata I staru (`/sr/courses`, `/en/kursevi`) I novu (`/kursevi`) formu:
 * skida vodeći `/sr` ili `/en` ako postoji, pa prvi preostali segment provlači
 * kroz `canonicalSegment`. Bez prefiksa -> `sr`. Query/hash se odseca.
 */
export function parsePath(pathname: string): { locale: Locale; canonicalPath: string } {
  const [path] = splitSuffix(pathname);

  let locale: Locale = "sr";
  let rest = path;
  const localeMatch = path.match(/^\/(sr|en)(?=\/|$)/);
  if (localeMatch) {
    locale = localeMatch[1] as Locale;
    rest = path.slice(localeMatch[0].length);
  }

  if (rest === "" || rest === "/") return { locale, canonicalPath: "/" };
  if (!rest.startsWith("/")) rest = `/${rest}`;

  const seg = rest.match(/^\/([^/]+)([\s\S]*)$/);
  if (!seg) return { locale, canonicalPath: "/" };
  return { locale, canonicalPath: `/${canonicalSegment(seg[1])}${seg[2]}` };
}

/**
 * Kanonska putanja -> javni URL za dati jezik. Prevodi SAMO prvi segment; ostatak
 * (slug, podsegmenti) i `?query`/`#hash` ostaju netaknuti. `sr` je bez prefiksa,
 * `en` nosi `/en`. `"/"` i `""` daju `"/"` (sr) / `"/en"` (en) — nikad prazan string.
 */
export function toPublicPath(locale: Locale, canonicalPath: string = "/"): string {
  const [rawPath, suffix] = splitSuffix(canonicalPath);
  const prefix = locale === "en" ? "/en" : "";

  if (rawPath === "" || rawPath === "/") {
    return `${prefix || "/"}${suffix}`;
  }

  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const seg = path.match(/^\/([^/]+)([\s\S]*)$/);
  if (!seg) return `${prefix || "/"}${suffix}`;

  const translated = `/${publicSegment(canonicalSegment(seg[1]), locale)}${seg[2]}`;
  return `${prefix}${translated}${suffix}`;
}

/**
 * Kanonska putanja -> INTERNA putanja koju Next razrešava (`/${locale}` + putanja).
 * Ne prevodi segmente (interni folder == kanonski). Za `"/"` daje `"/sr"` BEZ
 * završne kose crte. Koristi se samo za `NextResponse.rewrite` u `proxy.ts`.
 */
export function internalPath(locale: Locale, canonicalPath: string): string {
  if (canonicalPath === "" || canonicalPath === "/") return `/${locale}`;
  const path = canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`;
  return `/${locale}${path}`;
}

/**
 * Metadata alternates za jednu kanonsku putanju: `canonical` za trenutni jezik +
 * `languages` (sr, en, x-default = sr varijanta) kao apsolutni URL-ovi.
 * U J1 se koristi samo na `/studio`; pun hreflang rollout ide u J2.
 */
export function alternatesFor(origin: string, canonicalPath: string, locale: Locale) {
  const sr = `${origin}${toPublicPath("sr", canonicalPath)}`;
  const en = `${origin}${toPublicPath("en", canonicalPath)}`;
  return {
    canonical: `${origin}${toPublicPath(locale, canonicalPath)}`,
    languages: { sr, en, "x-default": sr },
  };
}
