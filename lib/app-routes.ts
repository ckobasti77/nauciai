import { withLocale, type Locale } from "@/lib/i18n";

/**
 * Canonical builders for the smer -> kurs -> lekcija routes. Before this, the sidebar and
 * the dashboard each built the course URL from their own string literal, which is how they
 * ended up pointing at two different shapes of the same destination.
 *
 * These live under /app/classroom now; the old /app/tracks and /app/courses shapes redirect
 * (307) to here via the stubs left behind at those paths.
 */
export function trackPath(locale: Locale, trackSlug: string) {
  return withLocale(locale, `/app/classroom/tracks/${trackSlug}`);
}

export function coursePath(locale: Locale, courseSlug: string) {
  return withLocale(locale, `/app/classroom/courses/${courseSlug}`);
}

export function lessonPath(locale: Locale, courseSlug: string, lessonSlug: string) {
  return withLocale(locale, `/app/classroom/courses/${courseSlug}/lessons/${lessonSlug}`);
}

export function lessonEditPath(locale: Locale, courseSlug: string, lessonSlug: string) {
  return `${lessonPath(locale, courseSlug, lessonSlug)}/edit`;
}

export function classroomPath(locale: Locale) {
  return withLocale(locale, "/app/classroom");
}

/**
 * In-app katalog kurseva — zona „Kursevi" u Učionici. Postoji kao zaseban builder
 * zato što je to odredište svakog „Pogledaj kurseve" / „Unapredi" dugmeta u
 * aplikaciji; ranije je svako od njih vodilo na marketing `/{locale}#pricing`, to
 * jest izbacivalo studenta iz aplikacije.
 */
export function courseCatalogPath(locale: Locale) {
  return `${classroomPath(locale)}?view=courses`;
}

export type IncomingSearchParams = Record<string, string | string[] | undefined>;

/**
 * Appends the incoming search params onto `base`, dropping `undefined` and any key listed in
 * `skip`, and preserving repeated params via `append`. Single source of truth for param
 * preservation: both the legacy `?course=` redirect and the /app/courses -> /app/classroom
 * redirect stubs go through here so the two can never drift apart.
 */
export function preserveSearchParams(
  base: string,
  searchParams: IncomingSearchParams,
  skip: readonly string[] = [],
): string {
  const preserved = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (skip.includes(key) || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => preserved.append(key, item));
    } else {
      preserved.set(key, value);
    }
  }

  const query = preserved.toString();
  return `${base}${query ? `?${query}` : ""}`;
}

/**
 * Course detail used to be `/app?course=<slug>`. Resolves that legacy shape to the route
 * it moved to, carrying every other param across untouched — `checkout=success` arrives
 * this way from Stripe — and returns null when there is nothing to redirect.
 */
export function legacyCourseRedirect(locale: Locale, searchParams: IncomingSearchParams): string | null {
  const raw = searchParams.course;
  const course = Array.isArray(raw) ? raw[0] : raw;
  if (!course) return null;

  return preserveSearchParams(coursePath(locale, encodeURIComponent(course)), searchParams, ["course"]);
}
