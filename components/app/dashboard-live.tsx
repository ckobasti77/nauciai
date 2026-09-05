"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import {
  DashboardContent,
  DashboardHome,
  DashboardHomeSkeleton,
  type DashboardCourse,
} from "@/components/app/dashboard-content";
import { LinkButton } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { ViewerProfile } from "@/lib/current-viewer";
import { courseFromLive, type LiveNavigationResult } from "@/lib/dashboard-courses";
import { withLocale, type Locale } from "@/lib/i18n";

// Pura logika mapiranja `getAppNavigation` -> `DashboardCourse` zivi u
// `lib/dashboard-courses.ts` (da bude testabilna). Re-export drzi postojece uvoze
// (npr. `classroom-hub.tsx`) netaknutim.
export { coursesFromLive, isLiveCatalogEmpty } from "@/lib/dashboard-courses";
export type { LiveNavigationResult } from "@/lib/dashboard-courses";

export function LiveStudentDashboard({
  locale,
  profile,
  courseSlug,
  fallbackCourse,
  fallbackCourses,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  courseSlug?: string;
  fallbackCourse: DashboardCourse;
  fallbackCourses: DashboardCourse[];
}) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  // Komandna tabla se hrani JEDNIM agregatom. courseSlug (legacy /app?course=) je
  // preusmeren na /app/classroom u page.tsx pre nego što stigne dovde, pa je ta grana
  // van komandne table i i dalje čita getAppNavigation samo kad je slug prisutan.
  const overview = useQuery(api.dashboard.getDashboardOverview, isAuthenticated && !courseSlug ? {} : "skip");
  const liveNavigation = useQuery(
    api.courses.getAppNavigation,
    isAuthenticated && courseSlug ? {} : "skip",
  ) as LiveNavigationResult;
  const isAdmin = profile?.role === "admin" || liveNavigation?.profile?.role === "admin";

  // Three states, kept distinct: loading (auth resolving, or query still undefined),
  // empty (query resolved with nothing), loaded. Conflating the first two is what made the
  // dashboard show fabricated data on every page load.
  if (authLoading) {
    return <DashboardHomeSkeleton />;
  }

  if (!courseSlug) {
    if (isAuthenticated && overview === undefined) {
      return <DashboardHomeSkeleton />;
    }
    return <DashboardHome locale={locale} profile={profile} overview={overview ?? null} />;
  }

  if (isAuthenticated && liveNavigation === undefined) {
    return <DashboardHomeSkeleton />;
  }

  const course = courseFromLive(liveNavigation, fallbackCourse, fallbackCourses, courseSlug);

  if (!course) {
    return <DashboardCourseNotFound locale={locale} />;
  }

  return <DashboardContent locale={locale} profile={profile} course={course} isAdmin={isAdmin} />;
}

function DashboardCourseNotFound({ locale }: { locale: Locale }) {
  return (
    <section
      role="alert"
      className="grid min-h-80 place-items-center rounded-[16px] border-2 border-ink bg-paper-strong p-6 text-center shadow-[6px_6px_0_var(--shadow-hard-12)]"
    >
      <div className="max-w-md">
        <h2 className="type-h2 text-ink">
          {locale === "sr" ? "Ovaj kurs ne postoji" : "That course does not exist"}
        </h2>
        <p className="mt-3 type-body-sm font-semibold text-muted">
          {locale === "sr"
            ? "Link je možda zastareo. Vrati se na pregled i izaberi kurs sa liste."
            : "The link may be out of date. Go back to the overview and pick a course from the list."}
        </p>
        <LinkButton href={withLocale(locale, "/app")} tone="yellow" className="mt-6">
          {locale === "sr" ? "Nazad na pregled" : "Back to overview"}
        </LinkButton>
      </div>
    </section>
  );
}
