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
import { withLocale, type Locale } from "@/lib/i18n";

export type LiveNavigationResult = {
  profile?: {
    role?: string;
  } | null;
  courses?: Array<{
    _id?: string;
    trackId?: string;
    trackSlug?: string;
    trackTitleSr?: string;
    trackTitleEn?: string;
    slug: string;
    titleSr: string;
    titleEn: string;
    subtitleSr: string;
    subtitleEn: string;
    descriptionSr: string;
    descriptionEn: string;
    descriptionRichSr?: string;
    descriptionRichEn?: string;
    status: "draft" | "published" | "archived";
    hasAccess?: boolean;
    stripePriceId?: string;
    videoUrl?: string | null;
    coverUrl?: string | null;
    videoFileName?: string;
    videoByteSize?: number;
    videoMimeType?: string;
    videoUpdatedAt?: number;
    sortOrder: number;
    progress?: {
      totalLessons: number;
      completedLessons: number;
      percent: number;
      startedAt?: number;
      lastActivityAt?: number;
      nextLessonSlug?: string;
      nextLessonTitleSr?: string;
      nextLessonTitleEn?: string;
      activity?: Array<{
        day: string;
        completed: number;
      }>;
    };
    modules?: Array<{
      _id?: string;
      titleSr: string;
      titleEn: string;
      descriptionSr?: string;
      descriptionEn?: string;
      imageUrl?: string | null;
      imageFileName?: string;
      imageAltSr?: string;
      imageAltEn?: string;
      sortOrder: number;
      lessons?: Array<{
        _id?: string;
        slug: string;
        titleSr: string;
        titleEn: string;
        summarySr: string;
        summaryEn: string;
        summaryRichSr?: string;
        summaryRichEn?: string;
        durationSeconds: number;
        isPublished: boolean;
        sortOrder: number;
        progress?: {
          completed?: boolean;
          positionSeconds?: number;
          updatedAt?: number;
        } | null;
      }>;
    }>;
  }>;
} | null | undefined;

function formatDuration(durationSeconds: number) {
  return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

function courseFromLiveCourse(
  liveCourse: NonNullable<NonNullable<LiveNavigationResult>["courses"]>[number],
  fallbackCourse?: DashboardCourse,
): DashboardCourse {
  const modules = (liveCourse.modules ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((module) => ({
      id: module._id,
      title: {
        sr: module.titleSr,
        en: module.titleEn,
      },
      description:
        module.descriptionSr || module.descriptionEn
          ? {
              sr: module.descriptionSr ?? module.descriptionEn ?? "",
              en: module.descriptionEn ?? module.descriptionSr ?? "",
            }
          : undefined,
      imageUrl: module.imageUrl,
      imageFileName: module.imageFileName,
      imageAlt:
        module.imageAltSr || module.imageAltEn
          ? {
              sr: module.imageAltSr ?? module.imageAltEn ?? "",
              en: module.imageAltEn ?? module.imageAltSr ?? "",
            }
          : undefined,
      sortOrder: module.sortOrder,
      lessons: (module.lessons ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((lesson) => ({
          id: lesson._id,
          slug: lesson.slug,
          title: {
            sr: lesson.titleSr,
            en: lesson.titleEn,
          },
          summary: {
            sr: lesson.summarySr,
            en: lesson.summaryEn,
          },
          summaryRich: lesson.summaryRichSr || lesson.summaryRichEn ? { sr: lesson.summaryRichSr ?? "", en: lesson.summaryRichEn ?? "" } : undefined,
          duration: formatDuration(lesson.durationSeconds),
          durationSeconds: lesson.durationSeconds,
          isPublished: lesson.isPublished,
          sortOrder: lesson.sortOrder,
          progress: lesson.progress,
        })),
    }));

  return {
    id: liveCourse._id,
    trackId: liveCourse.trackId,
    slug: liveCourse.slug,
    title: {
      sr: liveCourse.titleSr,
      en: liveCourse.titleEn,
    },
    image: fallbackCourse?.image,
    coverUrl: liveCourse.coverUrl,
    subtitle: {
      sr: liveCourse.subtitleSr,
      en: liveCourse.subtitleEn,
    },
    description: {
      sr: liveCourse.descriptionSr,
      en: liveCourse.descriptionEn,
    },
    descriptionRich: liveCourse.descriptionRichSr || liveCourse.descriptionRichEn ? { sr: liveCourse.descriptionRichSr ?? "", en: liveCourse.descriptionRichEn ?? "" } : undefined,
    status: liveCourse.status,
    hasAccess: Boolean(liveCourse.hasAccess),
    stripePriceId: liveCourse.stripePriceId,
    videoUrl: liveCourse.videoUrl,
    videoFileName: liveCourse.videoFileName,
    videoByteSize: liveCourse.videoByteSize,
    videoMimeType: liveCourse.videoMimeType,
    videoUpdatedAt: liveCourse.videoUpdatedAt,
    sortOrder: liveCourse.sortOrder,
    progress: liveCourse.progress
      ? {
          totalLessons: liveCourse.progress.totalLessons,
          completedLessons: liveCourse.progress.completedLessons,
          percent: liveCourse.progress.percent,
          startedAt: liveCourse.progress.startedAt,
          lastActivityAt: liveCourse.progress.lastActivityAt,
          nextLessonSlug: liveCourse.progress.nextLessonSlug,
          nextLessonTitle:
            liveCourse.progress.nextLessonTitleSr || liveCourse.progress.nextLessonTitleEn
              ? {
                  sr: liveCourse.progress.nextLessonTitleSr ?? liveCourse.progress.nextLessonTitleEn ?? "",
                  en: liveCourse.progress.nextLessonTitleEn ?? liveCourse.progress.nextLessonTitleSr ?? "",
                }
              : undefined,
          activity: liveCourse.progress.activity,
        }
      : undefined,
    lessons: modules.flatMap((module) => module.lessons),
    modules,
  };
}

// fallbackCourses is only a slug-matched source for the decorative cover image of a course
// that has no coverUrl. It is never a stand-in for the viewer's real course list — doing that
// rendered marketing content as the student's own data for the whole in-flight window.
export function coursesFromLive(liveNavigation: LiveNavigationResult, fallbackCourses: DashboardCourse[]): DashboardCourse[] {
  return (liveNavigation?.courses ?? []).map((course) =>
    courseFromLiveCourse(
      course,
      fallbackCourses.find((fallbackCourse) => fallbackCourse.slug === course.slug),
    ),
  );
}

function courseFromLive(
  liveNavigation: LiveNavigationResult,
  fallbackCourse: DashboardCourse,
  fallbackCourses: DashboardCourse[],
  courseSlug?: string,
): DashboardCourse | null {
  const liveCourse = liveNavigation?.courses?.find((course) => course.slug === courseSlug);
  // An unknown course slug used to silently render liveCourses[0] — a different course than
  // the URL asked for. Return null so the caller can say so instead.
  if (!liveCourse) return null;

  return courseFromLiveCourse(
    liveCourse,
    fallbackCourses.find((course) => course.slug === liveCourse.slug) ?? fallbackCourse,
  );
}

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
        <h2 className="text-2xl font-black text-ink">
          {locale === "sr" ? "Ovaj kurs ne postoji" : "That course does not exist"}
        </h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-muted">
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
