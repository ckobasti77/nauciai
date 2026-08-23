import type { Metadata } from "next";

import { ClassroomHubView, LiveClassroomHub } from "@/components/app/classroom-hub";
import { staticDashboardCourses } from "@/components/app/dashboard";
import { appPageMetadata } from "@/lib/app-metadata";
import { studentProfile } from "@/lib/content";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Učionica", en: "Classroom" });
}

export default async function ClassroomPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const profile = await getCurrentViewerProfile();
  const fallbackCourses = staticDashboardCourses();

  // Same env gate as the dashboard: the live hub uses Convex hooks, which only mount under the
  // provider AppShell renders when NEXT_PUBLIC_CONVEX_URL is set. Without it, render the static
  // course list (no progress, no tracks) rather than crashing on a missing provider.
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <LiveClassroomHub locale={locale} profile={profile} fallbackCourses={fallbackCourses} />;
  }

  const resolvedProfile = profile ?? studentProfile;
  return (
    <ClassroomHubView
      locale={locale}
      isAdmin={resolvedProfile?.role === "admin"}
      profileName={resolvedProfile?.name ?? "Student"}
      courses={fallbackCourses}
      trackMeta={{}}
    />
  );
}
