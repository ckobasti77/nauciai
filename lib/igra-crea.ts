import type { IgraArtId, IgraLik } from "./igra-art";
import type { CreaArea, CreaKind } from "./crea-shell";

/**
 * Crea ekipa (plan K14): svaka radionica ima svog lika - Piksi slika, Kadar video, Eho
 * zvuk. Jedini izvor mape oblast → lik (ulaz, zaglavlja radionica, prazna stanja, brzi
 * start na tabli).
 *
 * Čist modul bez uvoza manifesta i bez `lib/crea-shell` u vreme izvršavanja (samo tipovi):
 * tabla (`CreaQuickStart`) ga uvozi, a njen početni JS je pred budžetom.
 */

export type CreaLik = Extract<IgraLik, "piksi" | "kadar" | "eho">;

export const CREA_AREA_LIK = { slika: "piksi", video: "kadar", zvuk: "eho" } as const satisfies Record<CreaArea, CreaLik>;

const KIND_LIK = { image: "piksi", video: "kadar", audio: "eho" } as const satisfies Record<CreaKind, CreaLik>;

/**
 * Poza „radi" (čekanje, K16). Nije u `IGRA_POZE` (svi likovi imaju 4 poze, ovu samo
 * troje), pa su ID-jevi napisani doslovno i `check:igra` ih vidi kao korišćene.
 */
export const CREA_RADI_ART = {
  piksi: "lik.piksi.radi",
  kadar: "lik.kadar.radi",
  eho: "lik.eho.radi",
} as const satisfies Record<CreaLik, IgraArtId>;

export function creaLikForArea(area: CreaArea): CreaLik {
  return CREA_AREA_LIK[area];
}

export function creaLikForKind(kind: CreaKind): CreaLik {
  return KIND_LIK[kind];
}

export function creaRadiArt(lik: CreaLik): IgraArtId {
  return CREA_RADI_ART[lik];
}
