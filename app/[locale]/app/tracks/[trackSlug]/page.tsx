import { redirect } from "next/navigation";

import { preserveSearchParams, trackPath, type IncomingSearchParams } from "@/lib/app-routes";
import { normalizeLocale } from "@/lib/i18n";

/**
 * Track detail now lives at /app/classroom/tracks/[trackSlug]. Bookmarks and sidebar history
 * entries issued before the move still point here, so honour the old shape with a redirect
 * rather than 404. Temporary (307) not permanent: /app/** is robots-disallowed so there is no
 * SEO argument for a 308, and a 308 would be cached by the browser indefinitely. Every search
 * param rides across.
 */
export default async function LegacyTrackRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; trackSlug: string }>;
  searchParams: Promise<IncomingSearchParams>;
}) {
  const [{ locale: localeParam, trackSlug }, sp] = await Promise.all([params, searchParams]);
  redirect(preserveSearchParams(trackPath(normalizeLocale(localeParam), trackSlug), sp));
}
