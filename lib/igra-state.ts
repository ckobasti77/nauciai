import { IGRA_STATE_COPY } from "./igra-state-copy";
import type { Locale } from "./i18n";
import type { IgraArtId } from "./igra-art";

/**
 * Stanja unutar aplikacije (K23): jedno mesto koje kaže koja slika, koji tekst i koja
 * ARIA uloga idu uz svako. `IgraState` samo crta ono što ovde piše.
 */
export const IGRA_STATE_VARIANTS = ["prazno", "greska", "404", "ucitavanje", "offline", "zakljucano", "uskoro"] as const;
export type IgraStateVariant = (typeof IGRA_STATE_VARIANTS)[number];

const STATE_ART: Record<IgraStateVariant, IgraArtId> = {
  // Robi koji razmišlja nosi svako prazno stanje bez posebne slike; strana sa svojom
  // slikom (`prazno.radovi`, `prazno.objave`…) je prosleđuje.
  prazno: "lik.robi.misli",
  greska: "prazno.greska",
  "404": "prazno.404",
  ucitavanje: "prazno.ucitavanje",
  offline: "prazno.offline",
  zakljucano: "prazno.zakljucano",
  uskoro: "prazno.uskoro",
};

export function igraStateArt(variant: IgraStateVariant): IgraArtId {
  return STATE_ART[variant];
}

/** Greška se objavljuje odmah; čekanje i veza se javljaju tiho; ostalo je običan sadržaj. */
export function igraStateRole(variant: IgraStateVariant): "alert" | "status" | undefined {
  if (variant === "greska") return "alert";
  if (variant === "ucitavanje" || variant === "offline") return "status";
  return undefined;
}

export function igraStateTitle(variant: IgraStateVariant, locale: Locale): string {
  return IGRA_STATE_COPY[variant].title[locale];
}

export function igraStateBody(variant: IgraStateVariant, locale: Locale): string {
  return IGRA_STATE_COPY[variant].body[locale];
}

/** Natpis podrazumevanog dugmeta; stanja bez njega (`prazno`, `ucitavanje`…) vraćaju `null`. */
export function igraStateCta(variant: IgraStateVariant, locale: Locale): string | null {
  const copy: { title: unknown; cta?: Record<Locale, string> } = IGRA_STATE_COPY[variant];
  return copy.cta?.[locale] ?? null;
}

/**
 * Greška na ekranu bez veze nije „greška aplikacije": kad pregledač kaže da nema mreže,
 * granica greške prikazuje `offline`, jer je to ono što korisnik može da razume i popravi.
 */
export function igraErrorVariant(online: boolean): "greska" | "offline" {
  return online ? "greska" : "offline";
}
