import { StudentDashboard } from "@/components/app/dashboard";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale } from "@/lib/i18n";

export default async function StudentDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ course?: string; newLessonModule?: string; editModule?: string }>;
}) {
  const { locale: localeParam } = await params;
  const { course, newLessonModule, editModule } = await searchParams;
  const profile = await getCurrentViewerProfile();
  return (
    <StudentDashboard
      locale={normalizeLocale(localeParam)}
      profile={profile}
      courseSlug={course}
      newLessonModuleId={newLessonModule}
      editModuleId={editModule}
      hasConvex={Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)}
    />
  );
}
