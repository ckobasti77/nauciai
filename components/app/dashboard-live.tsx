"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import { DashboardContent, type DashboardCourse } from "@/components/app/dashboard-content";
import { api } from "@/convex/_generated/api";
import type { ViewerProfile } from "@/lib/current-viewer";
import type { Locale } from "@/lib/i18n";

type LiveNavigationResult = {
  profile?: {
    role?: string;
  } | null;
  courses?: Array<{
    slug: string;
    titleSr: string;
    titleEn: string;
    descriptionSr: string;
    descriptionEn: string;
    status: "draft" | "published" | "archived";
    hasAccess?: boolean;
    sortOrder: number;
    modules?: Array<{
      sortOrder: number;
      lessons?: Array<{
        slug: string;
        titleSr: string;
        titleEn: string;
        durationSeconds: number;
        isPublished: boolean;
        sortOrder: number;
      }>;
    }>;
  }>;
} | null | undefined;

function formatDuration(durationSeconds: number) {
  return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

function courseFromLive(liveNavigation: LiveNavigationResult, fallbackCourse: DashboardCourse, courseSlug?: string): DashboardCourse {
  const liveCourses = liveNavigation?.courses;
  if (!liveCourses?.length) {
    return fallbackCourse;
  }

  const liveCourse = liveCourses.find((course) => course.slug === courseSlug) ?? liveCourses[0];
  return {
    slug: liveCourse.slug,
    title: {
      sr: liveCourse.titleSr,
      en: liveCourse.titleEn,
    },
    description: {
      sr: liveCourse.descriptionSr,
      en: liveCourse.descriptionEn,
    },
    status: liveCourse.status,
    hasAccess: Boolean(liveCourse.hasAccess),
    lessons: (liveCourse.modules ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .flatMap((module) =>
        (module.lessons ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((lesson) => ({
            slug: lesson.slug,
            title: {
              sr: lesson.titleSr,
              en: lesson.titleEn,
            },
            duration: formatDuration(lesson.durationSeconds),
          })),
      ),
  };
}

export function LiveStudentDashboard({
  locale,
  profile,
  courseSlug,
  fallbackCourse,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  courseSlug?: string;
  fallbackCourse: DashboardCourse;
}) {
  const { isAuthenticated } = useConvexAuth();
  const liveNavigation = useQuery(api.courses.getAppNavigation, isAuthenticated ? {} : "skip") as LiveNavigationResult;
  const course = courseFromLive(liveNavigation, fallbackCourse, courseSlug);
  const isAdmin = profile?.role === "admin" || liveNavigation?.profile?.role === "admin";

  return <DashboardContent locale={locale} profile={profile} course={course} isAdmin={isAdmin} />;
}
