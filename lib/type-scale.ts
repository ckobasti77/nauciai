/**
 * Tipografska skala aplikacije (U10).
 *
 * Ovo je JEDAN izvor istine za veličine, težine, prored i razmak slova; blokovi
 * `@utility type-*` u `app/globals.css` su samo CSS ogledalo, a
 * `lib/type-scale.test.ts` čuva da se to dvoje ne raziđu (isti obrazac koji
 * `lib/studio-motion.ts` već ima sa `--motion-*` tokenima).
 *
 * Pravila skale:
 * - Patrick Hand (`font-display`) nosi SAMO `display` i `display-sm` — velike
 *   naslove i akcente. Nikad telo teksta.
 * - Nunito nosi sve ostalo; hijerarhiju pravi veličina + težina 900, ne boja.
 * - Naslovi koji se menjaju sa širinom koriste `clamp()`, ne `sm:`/`md:` breakpoint
 *   stepenice: jedan zapis umesto dva, i skala ostaje ista i na 390px i na 1440px.
 *   Srednji član je u `rem` da zumiranje i korisnička veličina fonta i dalje rade.
 * - Uloge tela (`body`, `body-sm`, `caption`) NAMERNO ne postavljaju `font-weight`:
 *   pozivalac bira `font-bold` ili ništa, pa `cn` (obično spajanje, ne
 *   tailwind-merge) ne može da napravi sudar.
 */

export type TypeRole =
  | "display"
  | "display-sm"
  | "hero"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "eyebrow"
  | "eyebrow-sm"
  | "reading"
  | "body"
  | "body-sm"
  | "caption";

export type TypeRoleSpec = {
  /** Tailwind utility klasa koja nosi ovu ulogu. */
  utility: string;
  /** Čemu uloga služi — ide u dokumentaciju i u pregled u progress fajlu. */
  purpose: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  /** Izostavljeno kad ulogu težina ne definiše (telo, metapodatak). */
  fontWeight?: string;
  textTransform?: string;
};

export const typeScale: Record<TypeRole, TypeRoleSpec> = {
  display: {
    utility: "type-display",
    purpose: "Patrick Hand hero — jedan po zoni, brend potez",
    fontSize: "clamp(2.25rem, 1.7rem + 2.4vw, 3.5rem)",
    lineHeight: "1",
    letterSpacing: "0",
    fontWeight: "400",
  },
  "display-sm": {
    utility: "type-display-sm",
    purpose: "Patrick Hand akcenat — naslov modala i istaknutog panela",
    fontSize: "clamp(1.5rem, 1.32rem + 0.9vw, 1.875rem)",
    lineHeight: "1.1",
    letterSpacing: "0",
    fontWeight: "400",
  },
  hero: {
    utility: "type-hero",
    purpose: "Nunito hero — pozdravni naslov zone i veliki broj napretka u svom panelu",
    fontSize: "clamp(1.875rem, 1.4rem + 2.1vw, 3rem)",
    lineHeight: "1.08",
    letterSpacing: "-0.03em",
    fontWeight: "900",
  },
  h1: {
    utility: "type-h1",
    purpose: "Naslov ekrana — tačno jedan po stranici",
    fontSize: "clamp(1.5rem, 1.32rem + 0.9vw, 1.875rem)",
    lineHeight: "1.15",
    letterSpacing: "-0.025em",
    fontWeight: "900",
  },
  h2: {
    utility: "type-h2",
    purpose: "Naslov sekcije unutar ekrana",
    fontSize: "clamp(1.25rem, 1.13rem + 0.6vw, 1.5rem)",
    lineHeight: "1.2",
    letterSpacing: "-0.02em",
    fontWeight: "900",
  },
  h3: {
    utility: "type-h3",
    purpose: "Naslov panela ili kartice",
    fontSize: "1.125rem",
    lineHeight: "1.3",
    letterSpacing: "-0.01em",
    fontWeight: "900",
  },
  h4: {
    utility: "type-h4",
    purpose: "Naslov reda u listi ili malog bloka",
    fontSize: "1rem",
    lineHeight: "1.35",
    letterSpacing: "0",
    fontWeight: "900",
  },
  eyebrow: {
    utility: "type-eyebrow",
    purpose: "Mala kapitalizovana etiketa iznad naslova",
    fontSize: "0.75rem",
    lineHeight: "1.25",
    letterSpacing: "0.12em",
    fontWeight: "900",
    textTransform: "uppercase",
  },
  "eyebrow-sm": {
    utility: "type-eyebrow-sm",
    purpose: "Etiketa u gustom kontekstu — čip, zaglavlje kolone, značka u redu",
    fontSize: "0.625rem",
    lineHeight: "1.25",
    letterSpacing: "0.14em",
    fontWeight: "900",
    textTransform: "uppercase",
  },
  reading: {
    utility: "type-reading",
    purpose: "Dugacak tekst za citanje — telo lekcije i telo teme u zajednici",
    fontSize: "1.0625rem",
    lineHeight: "1.85",
    letterSpacing: "0",
  },
  body: {
    utility: "type-body",
    purpose: "Pasus koji se stvarno čita",
    fontSize: "1rem",
    lineHeight: "1.7",
    letterSpacing: "0",
  },
  "body-sm": {
    utility: "type-body-sm",
    purpose: "Prateći tekst uz naslov, opis kartice, pomoć uz polje",
    fontSize: "0.875rem",
    lineHeight: "1.7",
    letterSpacing: "0",
  },
  caption: {
    utility: "type-caption",
    purpose: "Metapodatak — vreme, brojač, potpis",
    fontSize: "0.75rem",
    lineHeight: "1.5",
    letterSpacing: "0",
  },
};

/**
 * Mera čitljivosti. Nije uloga u skali (ne dira font), nego širina bloka: pasus
 * duži od ~75 znaka po redu je zid teksta za početnika, a kraći od ~45 cepa
 * rečenicu. 68ch je sredina tog opsega za Nunito.
 */
export const TYPE_MEASURE_UTILITY = "type-measure";
export const TYPE_MEASURE_MAX_WIDTH = "68ch";

/** Redosled uloga od najkrupnije ka najsitnijoj — koristi ga test i dokumentacija. */
export const typeRoleOrder: readonly TypeRole[] = [
  "display",
  "display-sm",
  "hero",
  "h1",
  "h2",
  "h3",
  "h4",
  "eyebrow",
  "eyebrow-sm",
  "reading",
  "body",
  "body-sm",
  "caption",
];

/**
 * Utility klase koje nose `letter-spacing`. Reset `letter-spacing: 0` u
 * `app/globals.css` mora da ostane u `@layer base` da bi ove klase radile i na
 * `button`/`a`/`input`/`textarea`/`select` — nelayerovani autorski CSS pobeđuje
 * svaki sloj, što je isti tip greške koji je AGENTS.md već dokumentovao za radiuse.
 */
export const trackedTypeUtilities: readonly string[] = typeRoleOrder
  .filter((role) => typeScale[role].letterSpacing !== "0")
  .map((role) => typeScale[role].utility);
