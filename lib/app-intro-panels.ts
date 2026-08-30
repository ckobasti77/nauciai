/**
 * Uvodni paneli ("šta je ovo, čemu služi, prvi korak") koje korisnik vidi kad
 * prvi put otvori Zajednicu ili Studio, i koje može da zatvori zauvek.
 *
 * Stanje zatvorenosti je čisto klijentsko, po uzoru na `lib/studio-last-model.ts`:
 * `localStorage`, jedan ključ, bez nove Convex tabele. Podsetnik nije podatak
 * naloga - ako se izgubi (drugi uređaj, obrisan keš), najgore što se desi je da
 * korisnik još jednom pročita tri rečenice.
 *
 * Parsiranje i upis su razdvojeni od `window`-a namerno: čiste funkcije se
 * testiraju u edge-runtime okruženju vitesta, a omotači iznad njih su ti koji
 * smeju da ne postoje na serveru.
 */

export const INTRO_PANEL_IDS = ["community", "studio"] as const;

export type IntroPanelId = (typeof INTRO_PANEL_IDS)[number];

export const INTRO_PANELS_STORAGE_KEY = "app:intro-panels-dismissed";

export function isIntroPanelId(value: unknown): value is IntroPanelId {
  return typeof value === "string" && (INTRO_PANEL_IDS as readonly string[]).includes(value);
}

/**
 * Nepoznat sadržaj u ključu ne sme da obori ekran - svaka greška znači "panel
 * nije zatvoren", jer je prikazan panel bezopasan, a pad stranice nije.
 */
export function parseDismissedIntroPanels(rawValue: string | null | undefined): IntroPanelId[] {
  if (!rawValue) return [];

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return INTRO_PANEL_IDS.filter((id) => parsed.includes(id));
  } catch {
    return [];
  }
}

/** Uvek u redosledu iz `INTRO_PANEL_IDS`, bez duplikata - zapis je stabilan. */
export function serializeDismissedIntroPanels(ids: readonly IntroPanelId[]): string {
  return JSON.stringify(INTRO_PANEL_IDS.filter((id) => ids.includes(id)));
}

export function withDismissedIntroPanel(
  ids: readonly IntroPanelId[],
  id: IntroPanelId,
): IntroPanelId[] {
  return INTRO_PANEL_IDS.filter((candidate) => candidate === id || ids.includes(candidate));
}

export function readDismissedIntroPanels(): IntroPanelId[] {
  if (typeof window === "undefined") return [];
  try {
    return parseDismissedIntroPanels(window.localStorage.getItem(INTRO_PANELS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeDismissedIntroPanel(id: IntroPanelId): IntroPanelId[] {
  const next = withDismissedIntroPanel(readDismissedIntroPanels(), id);
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(INTRO_PANELS_STORAGE_KEY, serializeDismissedIntroPanels(next));
  } catch {
    // localStorage nedostupan (privatni prozor / puna kvota) - panel se onda
    // pojavi i sledeći put. To je neprijatno, ali nije kvar.
  }
  return next;
}
