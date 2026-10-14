import { redirect } from "next/navigation";

import { staticDashboardCourses } from "@/components/app/dashboard";
import { DashboardHome, LiveDashboardHome } from "@/components/app/dashboard-home";
import { legacyCourseRedirect } from "@/lib/app-routes";
import { studentProfile } from "@/lib/content";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { igraDaypartNow } from "@/lib/igra-daypart";
import { normalizeLocale } from "@/lib/i18n";
import type { Metadata } from "next";

// `absolute` because a layout's title template applies to child segments, not to the page
// in its own segment — without it this route would render a bare "Pregled".
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: { absolute: normalizeLocale(locale) === "sr" ? "Pregled · Nauči AI" : "Overview · Nauči AI" } };
}

type DashboardSearchParams = Record<string, string | string[] | undefined>;

export default async function StudentDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const [{ locale: localeParam }, incomingSearchParams] = await Promise.all([params, searchParams]);
  const locale = normalizeLocale(localeParam);

  // Course detail now lives at /app/classroom/courses/[courseSlug]. Bookmarks, sidebar history
  // entries and Stripe success_urls issued before the move still point here, so honour the
  // old shape with a redirect rather than silently rendering the grid instead. Temporary
  // (307) not permanent: /app/** is robots-disallowed so there is no SEO argument for a
  // 308, and a 308 would be cached by the browser indefinitely.
  const legacyTarget = legacyCourseRedirect(locale, incomingSearchParams);
  if (legacyTarget) redirect(legacyTarget);

  const profile = (await getCurrentViewerProfile()) ?? studentProfile;
  // Doba dana (Beograd) bira scenu i pozdrav heroja. Računa ga server, pa je slika u HTML-u
  // i nema neslaganja pri hidrataciji; posle `await`-a iznad ruta je već dinamička.
  const daypart = igraDaypartNow();

  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <LiveDashboardHome locale={locale} profile={profile} daypart={daypart} />;
  }
  return <DashboardHome locale={locale} profile={profile} overview={null} staticCourses={staticDashboardCourses()} daypart={daypart} igra={null} />;
}
