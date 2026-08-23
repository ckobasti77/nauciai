import type { Metadata } from "next";

import { StudentDashboard } from "@/components/app/dashboard";
import { appPageMetadata } from "@/lib/app-metadata";
import { getAppNavigationData } from "@/lib/app-navigation";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { localized, normalizeLocale } from "@/lib/i18n";

/**
 * The title names the course, not the app — this route exists so that "which course am I
 * in" is answerable from the tab strip and from history. It reads the same navigation
 * payload the sidebar renders (React `cache` dedupes it with AppShell's call), so the
 * title can never disagree with the course switcher.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; courseSlug: string }>;
}): Promise<Metadata> {
  const { locale: localeParam, courseSlug } = await params;
  const locale = normalizeLocale(localeParam);
  const navigation = await getAppNavigationData(locale);
  const course = navigation.courses.find((item) => item.slug === courseSlug);
  if (!course) return appPageMetadata(localeParam, { sr: "Kurs", en: "Course" });
  const title = localized(course.title, locale);
  return appPageMetadata(localeParam, { sr: title, en: title });
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; courseSlug: string }>;
}) {
  const { locale: localeParam, courseSlug } = await params;
  const profile = await getCurrentViewerProfile();
  return (
    <StudentDashboard
      locale={normalizeLocale(localeParam)}
      profile={profile}
      courseSlug={courseSlug}
      hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)}
    />
  );
}
