import { StudentDashboard } from "@/components/app/dashboard";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale } from "@/lib/i18n";
import type { Metadata } from "next";

// `absolute` because a layout's title template applies to child segments, not to the page
// in its own segment — without it this route would render a bare "Pregled".
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: { absolute: normalizeLocale(locale) === "sr" ? "Pregled · Nauči AI" : "Overview · Nauči AI" } };
}

export default async function StudentDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ course?: string }>;
}) {
  const { locale: localeParam } = await params;
  const { course } = await searchParams;
  const profile = await getCurrentViewerProfile();
  return (
    <StudentDashboard
      locale={normalizeLocale(localeParam)}
      profile={profile}
      courseSlug={course}
      hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)}
    />
  );
}
