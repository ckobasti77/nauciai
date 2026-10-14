"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import {
  DashboardContent,
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

// Stranica kursa (`/app/classroom/courses/[courseSlug]`). Komandna tabla (`/app`) je u
// `components/app/dashboard-home.tsx` i hrani se svojim agregatom.
export function LiveStudentDashboard({
  locale,
  profile,
  courseSlug,
  fallbackCourse,
  fallbackCourses,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  courseSlug: string;
  fallbackCourse: DashboardCourse;
  fallbackCourses: DashboardCourse[];
}) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const liveNavigation = useQuery(api.courses.getAppNavigation, isAuthenticated ? {} : "skip") as LiveNavigationResult;
  const isAdmin = profile?.role === "admin" || liveNavigation?.profile?.role === "admin";

  // Three states, kept distinct: loading (auth resolving, or query still undefined),
  // empty (query resolved with nothing), loaded. Conflating the first two is what made the
  // dashboard show fabricated data on every page load.
  if (authLoading || (isAuthenticated && liveNavigation === undefined)) {
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
