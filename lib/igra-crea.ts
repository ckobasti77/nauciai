import type { IgraArtId, IgraLik } from "./igra-art";
import type { CreaMoment } from "../convex/creaMomentsCore";
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

/**
 * Mini slavlje posle rezultata (K16): prvi rad uopšte i prvi rad svake vrste dobijaju lika
 * te vrste koji slavi. Jubilej ostaje samo tekst (zadatak traži prvi rad vrste).
 */
export function creaMomentLik(moment: CreaMoment | null, kind: CreaKind): CreaLik | null {
  if (moment?.id === "prvi-rad") return creaLikForKind(kind);
  if (moment?.id === "prvi-od-vrste") return creaLikForKind(moment.kind);
  return null;
}

/**
 * Rad nije uspeo (K16): lik vrste rada je tužan uz postojeću poruku o povraćaju. Posao koji
 * je korisnik sam otkazao (`OTKAZAO_KORISNIK`, `convex/creaFairCore.ts`) nije greška.
 */
export function isCreaGenerationError(job: { status: string; error?: string }): boolean {
  return job.status === "failed" || (job.status === "refunded" && job.error !== "OTKAZAO_KORISNIK");
}

/** Koliko dugo je gotov rad „nov" u biblioteci (K17): jedan dan od kad je stigao. */
export const CREA_FRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Nalepnica „Novo" na kartici biblioteke (K17): gotov rad koji je stigao u poslednja 24 h.
 * Čita samo polja koja kartica već ima (`completedAt`, a za stare radove `createdAt`);
 * `nowMs` je trenutak kad je mreža otvorena, pa se nalepnica ne menja dok korisnik gleda.
 */
export function isFreshCreaWork(job: { status: string; createdAt: number; completedAt?: number }, nowMs: number): boolean {
  if (job.status !== "done") return false;
  const age = nowMs - (job.completedAt ?? job.createdAt);
  return Number.isFinite(age) && age >= 0 && age < CREA_FRESH_MS;
}
