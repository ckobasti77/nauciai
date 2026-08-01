import { withLocale, type Locale } from "@/lib/i18n";

/**
 * Canonical builders for the smer -> kurs -> lekcija routes. Before this, the sidebar and
 * the dashboard each built the course URL from their own string literal, which is how they
 * ended up pointing at two different shapes of the same destination.
 */
export function trackPath(locale: Locale, trackSlug: string) {
  return withLocale(locale, `/app/tracks/${trackSlug}`);
}

export function coursePath(locale: Locale, courseSlug: string) {
  return withLocale(locale, `/app/courses/${courseSlug}`);
}

export function lessonPath(locale: Locale, courseSlug: string, lessonSlug: string) {
  return withLocale(locale, `/app/courses/${courseSlug}/lessons/${lessonSlug}`);
}

type IncomingSearchParams = Record<string, string | string[] | undefined>;

/**
 * Course detail used to be `/app?course=<slug>`. Resolves that legacy shape to the route
 * it moved to, carrying every other param across untouched — `checkout=success` arrives
 * this way from Stripe — and returns null when there is nothing to redirect.
 */
export function legacyCourseRedirect(locale: Locale, searchParams: IncomingSearchParams): string | null {
  const raw = searchParams.course;
  const course = Array.isArray(raw) ? raw[0] : raw;
  if (!course) return null;

  const preserved = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "course" || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => preserved.append(key, item));
    } else {
      preserved.set(key, value);
    }
  }

  const query = preserved.toString();
  return `${coursePath(locale, encodeURIComponent(course))}${query ? `?${query}` : ""}`;
}
