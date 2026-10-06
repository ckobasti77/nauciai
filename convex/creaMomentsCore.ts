/**
 * Posebni trenuci Cree (K25, U4): kad gotov rad zaslužuje konfete. Čista logika -
 * upit je `creaMoments.momentForJob`, a UI `components/crea/reveal/*`.
 *
 * Broje se samo GENERISANI radovi (ne rezultati besplatnih alata, `provider: "local"`):
 * „prvi rad" je prva slika, video ili zvuk koje je Crea napravila za tebe.
 */

export type CreaMomentKind = "image" | "video" | "audio";

export type CreaMoment =
  | { id: "prvi-rad" }
  | { id: "prvi-od-vrste"; kind: CreaMomentKind }
  | { id: "jubilej"; count: number };

/** Okrugli brojevi radova koji se slave. */
export const CREA_MILESTONES: readonly number[] = [10, 25, 50, 100];

/** Koliko gotovih radova upit najviše broji (ograničeno čitanje; dovoljno za najveći jubilej). */
export const CREA_MOMENT_SCAN_LIMIT = CREA_MILESTONES[CREA_MILESTONES.length - 1]! + 1;

/**
 * `total` = generisani gotovi radovi korisnika (uključujući ovaj), `ofKind` = od toga iste vrste.
 * `exact` = brojanje nije udarilo u granicu skeniranja; inače se ništa ne tvrdi (ovaj rad možda
 * nije ni među prebrojanima, jer indeks ide od najstarijeg).
 */
export function momentFor(counts: { total: number; ofKind: number; exact: boolean }, kind: CreaMomentKind): CreaMoment | null {
  if (!counts.exact || counts.total < 1) return null;
  if (counts.total === 1) return { id: "prvi-rad" };
  if (counts.ofKind === 1) return { id: "prvi-od-vrste", kind };
  if (CREA_MILESTONES.includes(counts.total)) return { id: "jubilej", count: counts.total };
  return null;
}
