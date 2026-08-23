import { redirect } from "next/navigation";

import { lessonEditPath, preserveSearchParams, type IncomingSearchParams } from "@/lib/app-routes";
import { normalizeLocale } from "@/lib/i18n";

/**
 * Lesson editor now lives at /app/classroom/courses/[courseSlug]/lessons/[lessonSlug]/edit.
 * Bookmarks and sign-in `?next=` targets issued before the move still point here, so honour the
 * old shape with a redirect rather than 404. Temporary (307) not permanent: /app/** is
 * robots-disallowed so there is no SEO argument for a 308, and a 308 would be cached by the
 * browser indefinitely. `next` (sign-in return) and every other search param ride across.
 */
export default async function LegacyLessonEditRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; courseSlug: string; lessonSlug: string }>;
  searchParams: Promise<IncomingSearchParams>;
}) {
  const [{ locale: localeParam, courseSlug, lessonSlug }, sp] = await Promise.all([params, searchParams]);
  redirect(preserveSearchParams(lessonEditPath(normalizeLocale(localeParam), courseSlug, lessonSlug), sp));
}
