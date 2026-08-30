import type { ContentSelection } from "@/lib/content-selection";

// Čista logika master-detail navigacije u admin Sadržaju (/app/admin/content).
// `content-selection.ts` odgovara na "šta je izabrano"; ovaj fajl odgovara na
// "koja se lista vidi" i "kako izgleda stavka u listi".

/** Koja od tri liste hijerarhije je na redu. Na desktopu se vide sve tri; na mobilnom samo jedna. */
export type ListLevel = "tracks" | "courses" | "lessons";

/** Nivo na kome se bira - isti rečnik koji već koristi `changeContentSelection`. */
export type SelectionLevel = "track" | "course" | "lesson";

export type ContentStatus = "draft" | "published" | "archived";

/**
 * Najdublja lista koju izbor otvara. Koristi se za početno stanje mobilnih
 * koraka kad se stranica otvori sa `?track=…&course=…` u URL-u.
 */
export function listLevelForSelection(selection: ContentSelection): ListLevel {
  if (selection.courseId) return "lessons";
  if (selection.trackId) return "courses";
  return "tracks";
}

/** Kuda vodi "Nazad". `null` znači da smo na prvom koraku i dugmeta nema. */
export function parentListLevel(level: ListLevel): ListLevel | null {
  if (level === "lessons") return "courses";
  if (level === "courses") return "tracks";
  return null;
}

/**
 * Gde mobilni korak stoji posle promene izbora. Biranje roditelja vodi korak
 * napred (u njegovu decu), a poništavanje izbora vraća korak nazad - inače bi
 * "Poništi izbor" ostavilo korisnika na praznoj listi dece nepostojećeg roditelja.
 */
export function listLevelAfterChange(next: ContentSelection, level: SelectionLevel): ListLevel {
  if (level === "track") return next.trackId ? "courses" : "tracks";
  if (level === "course") return next.courseId ? "lessons" : "courses";
  return listLevelForSelection(next);
}

/**
 * Status jednog čvora hijerarhije. Smerovi i kursevi nose `status`, a lekcije
 * samo `isPublished` - UI ih svejedno crta istim Badge-om, pa se razlika rešava ovde.
 */
export function contentStatus(row: { status?: ContentStatus; isPublished?: boolean }): ContentStatus {
  if (row.status) return row.status;
  return row.isPublished ? "published" : "draft";
}

/** Koliko dece je još u nacrtu - broj koji admin gleda da vidi šta studenti NE vide. */
export function draftCount(rows: ReadonlyArray<{ status?: ContentStatus; isPublished?: boolean }>): number {
  return rows.filter((row) => contentStatus(row) === "draft").length;
}

/**
 * Boja znacke statusa u admin Sadrzaju (U12).
 *
 * Zuta je u celom proizvodu boja "ovo je zivo, ovo radi" - primarno dugme,
 * aktivna zona komandne table, celo trake napretka. Objavljen sadrzaj je jedino
 * stanje koje student stvarno vidi, pa nosi bas nju.
 *
 * Nacrt je NAMERNO tih: red u listi ga vec nosi kroz `ink-hatch` (skolska
 * srafura = "jos je olovka na ovome"), pa bi glasna znacka pored srafure bila
 * drugi signal za istu stvar. Arhiva je obicna pilula sa okvirom - ni ziva ni
 * u radu.
 *
 * Vrednosti su `BadgeTone` iz `components/ui/badge.tsx`; tip je ovde ponovljen
 * kao unija da `lib/` ne bi zavisio od `components/`, a TypeScript na mestu
 * poziva proverava da se dve liste nisu razisle.
 */
export type ContentStatusTone = "muted" | "yellow" | "neutral";

const STATUS_TONES: Record<ContentStatus, ContentStatusTone> = {
  draft: "muted",
  published: "yellow",
  archived: "neutral",
};

export function contentStatusTone(status: ContentStatus): ContentStatusTone {
  return STATUS_TONES[status];
}

/** Svi statusi u redosledu zivotnog ciklusa - ulaz za test pokrivenosti. */
export const contentStatuses = Object.keys(STATUS_TONES) as ContentStatus[];
