import { courses as staticCourses } from "@/lib/content";
import { t, type Locale, type LocalizedText } from "@/lib/i18n";

/**
 * Cista logika in-app kataloga kurseva (Ucionica -> "Kursevi" / "Smerovi").
 *
 * Ovde ne zivi nijedan React ni Convex poziv - samo odluke koje katalog donosi:
 * ko je vlasnik kursa, koji kurs prolazi filter, kako se grupise po smeru i kako
 * se broj lekcija i trajanje ispisuju na srpskom. Sve ima testove u
 * `lib/course-catalog.test.ts`.
 */

/**
 * Vlasnistvo za PRIKAZ, ne provera pristupa.
 *
 * `owned` stize sa servera (`convex/courses.ts` -> `getAppNavigation`) i znaci
 * "student je otkljucao ovaj kurs" (aktivan upis ili staff rola). Staticka grana
 * (bez `NEXT_PUBLIC_CONVEX_URL`) to polje nema, pa se vraca na zatecni `hasAccess`
 * - tako fallback ekran izgleda tacno kao pre ovog koraka.
 */
export function isCourseOwned(course: { owned?: boolean; hasAccess: boolean }, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return course.owned ?? course.hasAccess;
}

/** Isti cipovi kao pre ovog koraka; promenjeno je samo sta "locked" znaci. */
export type CatalogFilter = "all" | "inProgress" | "completed" | "locked";

export type CatalogFilterInput = {
  owned: boolean;
  totalLessons: number;
  completedLessons: number;
  percent: number;
};

/**
 * "Zakljucan" je od ovog koraka kurs koji student NEMA (`owned === false`), a ne
 * vise kurs koji nije objavljen. "U toku" i "Zavrseni" traze vlasnistvo: napredak
 * na kursu koji student nije otkljucao nije ni "u toku".
 */
export function matchesCatalogFilter(entry: CatalogFilterInput, filter: CatalogFilter): boolean {
  if (filter === "locked") return !entry.owned;
  if (filter === "completed") return entry.owned && entry.totalLessons > 0 && entry.percent === 100;
  if (filter === "inProgress") return entry.owned && entry.completedLessons > 0 && entry.percent < 100;
  return true;
}

export type CatalogTrackMeta = Record<string, { slug?: string; title: LocalizedText }>;

export type CatalogTrackGroup<T> = {
  trackId: string;
  slug?: string;
  title: LocalizedText;
  items: T[];
};

/**
 * Grupise kurseve po smeru, redosledom kojim su kursevi stigli (kursevi su vec
 * sortirani po `sortOrder`). Kurs bez smera - ili sa smerom koji nije u
 * `trackMeta`, npr. arhiviran - namerno ispada: takav bi zavrsio u grupi bez
 * naslova. Njega i dalje pokazuje ravna lista u zoni "Kursevi".
 */
export function groupByTrack<T>(
  items: T[],
  trackIdOf: (item: T) => string | undefined,
  trackMeta: CatalogTrackMeta,
): Array<CatalogTrackGroup<T>> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const trackId = trackIdOf(item);
    if (!trackId || !trackMeta[trackId]) continue;
    const bucket = buckets.get(trackId) ?? [];
    bucket.push(item);
    buckets.set(trackId, bucket);
  }

  return Array.from(buckets.entries()).map(([trackId, bucket]) => ({
    trackId,
    slug: trackMeta[trackId].slug,
    title: trackMeta[trackId].title,
    items: bucket,
  }));
}

/**
 * Srpski ima tri oblika uz broj (1 lekcija / 2 lekcije / 5 lekcija). Bez ovoga
 * kartica kursa pise "2 lekcija", sto na prodajnom ekranu izgleda kao greska.
 */
export function serbianPlural(count: number, forms: { one: string; few: string; many: string }): string {
  const abs = Math.abs(Math.trunc(count));
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (last === 1 && lastTwo !== 11) return forms.one;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms.few;
  return forms.many;
}

export function formatLessonCount(locale: Locale, count: number): string {
  const safe = Math.max(0, Math.trunc(count));
  return t(
    locale,
    `${safe} ${serbianPlural(safe, { one: "lekcija", few: "lekcije", many: "lekcija" })}`,
    `${safe} ${safe === 1 ? "lesson" : "lessons"}`,
  );
}

export function formatCourseCount(locale: Locale, count: number): string {
  const safe = Math.max(0, Math.trunc(count));
  return t(
    locale,
    `${safe} ${serbianPlural(safe, { one: "kurs", few: "kursa", many: "kurseva" })}`,
    `${safe} ${safe === 1 ? "course" : "courses"}`,
  );
}

/**
 * "45 min" / "1 h" / "1 h 20 min". Oznake `h` i `min` su iste u oba jezika (isti
 * izbor kao `durationLabel` u `lib/app-navigation.ts`), pa funkcija ne prima
 * `locale`. Vraca `null` kad trajanja nema - pozivalac tada ne ispisuje nista,
 * umesto "0 min".
 */
export function formatCourseDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/** Zbir trajanja objavljenih lekcija; nepublikovane se ne broje, isto kao `getProgressSummary`. */
export function totalDurationSeconds(
  lessons: Array<{ durationSeconds?: number; isPublished?: boolean }>,
): number {
  return lessons.reduce((sum, lesson) => {
    if (lesson.isPublished === false) return sum;
    const seconds = lesson.durationSeconds;
    return sum + (Number.isFinite(seconds) && seconds! > 0 ? seconds! : 0);
  }, 0);
}

/** "8 lekcija · 1 h 20 min"; bez trajanja ostaje samo broj lekcija. */
export function courseLengthLabel(locale: Locale, lessonCount: number, seconds: number): string {
  const duration = formatCourseDuration(seconds);
  const lessons = formatLessonCount(locale, lessonCount);
  return duration ? `${lessons} · ${duration}` : lessons;
}

/**
 * Prikazna cena kursa. Jedini izvor je `lib/content.ts` (`priceLabel`) - isti
 * koji marketing stranica ispisuje na pill-u iznad naslovne slike i koji
 * `lib/app-navigation.ts` vec spaja po slug-u. Kurs koji postoji samo u Convexu
 * nema cenu; tada se vraca `null` i kartica ne ispisuje cenu umesto da izmisli
 * broj.
 */
export function catalogPriceLabel(courseSlug: string): LocalizedText | null {
  return staticCourses.find((course) => course.slug === courseSlug)?.priceLabel ?? null;
}
