import { redirect } from "next/navigation";

import { coursePath, preserveSearchParams, type IncomingSearchParams } from "@/lib/app-routes";
import { normalizeLocale } from "@/lib/i18n";

/**
 * Course detail now lives at /app/classroom/courses/[courseSlug]. Bookmarks, sidebar history
 * entries and Stripe success_urls issued before the move still point here, so honour the old
 * shape with a redirect rather than 404. Temporary (307) not permanent: /app/** is
 * robots-disallowed so there is no SEO argument for a 308, and a 308 would be cached by the
 * browser indefinitely. Every search param (checkout, editModule, newLessonModule, …) rides across.
 */
export default async function LegacyCourseRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; courseSlug: string }>;
  searchParams: Promise<IncomingSearchParams>;
}) {
  const [{ locale: localeParam, courseSlug }, sp] = await Promise.all([params, searchParams]);
  redirect(preserveSearchParams(coursePath(normalizeLocale(localeParam), courseSlug), sp));
}
