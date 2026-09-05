/**
 * Pamćenje zatvaranja jednoredne „sve spremno" trake na komandnoj tabli.
 *
 * Isti obrazac kao `lib/app-intro-panels.ts`: čisto klijentsko stanje u
 * `localStorage`, bez nove Convex tabele. Podsetnik nije podatak naloga — ako se
 * izgubi (drugi uređaj, obrisan keš), najgore što se desi je da se jednoredna
 * traka pojavi još jednom.
 *
 * Ključ nosi LISTU korisničkih imena koja su traku zatvorila (zatvaranje se pamti
 * „po korisniku"), pa deljeni pregledač ne gasi traku pogrešnom nalogu.
 *
 * Parsiranje i upis su razdvojeni od `window`-a namerno: čiste funkcije se testiraju
 * u edge-runtime okruženju, a omotači iznad njih su ti koji smeju da ne postoje na
 * serveru.
 */

export const FIRST_RUN_READY_STORAGE_KEY = "app:first-run-ready-dismissed";

/**
 * Nepoznat sadržaj u ključu ne sme da obori ekran — svaka greška znači „nije
 * zatvoreno", jer je prikazana traka bezopasna, a pad stranice nije.
 */
export function parseFirstRunReadyDismissed(rawValue: string | null | undefined): string[] {
  if (!rawValue) return [];
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

/** Stabilan zapis: bez duplikata, u redosledu prvog pojavljivanja. */
export function serializeFirstRunReadyDismissed(usernames: readonly string[]): string {
  return JSON.stringify([...new Set(usernames)]);
}

export function withFirstRunReadyDismissed(
  usernames: readonly string[],
  username: string,
): string[] {
  return [...new Set([...usernames, username])];
}

/** Da li je traka zatvorena za dati nalog. Bez korisničkog imena: nikad. */
export function isFirstRunReadyDismissed(
  usernames: readonly string[],
  username: string | null | undefined,
): boolean {
  return Boolean(username) && usernames.includes(username as string);
}

export function readFirstRunReadyDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseFirstRunReadyDismissed(window.localStorage.getItem(FIRST_RUN_READY_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeFirstRunReadyDismissed(username: string): string[] {
  const next = withFirstRunReadyDismissed(readFirstRunReadyDismissed(), username);
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(FIRST_RUN_READY_STORAGE_KEY, serializeFirstRunReadyDismissed(next));
  } catch {
    // localStorage nedostupan (privatni prozor / puna kvota) — traka se onda pojavi
    // i sledeći put. Neprijatno, ali nije kvar.
  }
  return next;
}
