import { redirect } from "next/navigation";

import { StudentDashboard } from "@/components/app/dashboard";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale, withLocale } from "@/lib/i18n";
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

  // Course detail now lives at /app/courses/[courseSlug]. Bookmarks, sidebar history
  // entries and Stripe success_urls issued before the move still point here, so honour the
  // old shape with a redirect rather than silently rendering the grid instead. Temporary
  // (307) not permanent: /app/** is robots-disallowed so there is no SEO argument for a
  // 308, and a 308 would be cached by the browser indefinitely.
  const rawCourse = incomingSearchParams.course;
  const course = Array.isArray(rawCourse) ? rawCourse[0] : rawCourse;
  if (course) {
    const preserved = new URLSearchParams();
    for (const [key, value] of Object.entries(incomingSearchParams)) {
      if (key === "course" || value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((item) => preserved.append(key, item));
      } else {
        preserved.set(key, value);
      }
    }
    const query = preserved.toString();
    redirect(`${withLocale(locale, `/app/courses/${encodeURIComponent(course)}`)}${query ? `?${query}` : ""}`);
  }

  const profile = await getCurrentViewerProfile();
  return (
    <StudentDashboard
      locale={locale}
      profile={profile}
      hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)}
    />
  );
}
