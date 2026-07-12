"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import {
  DashboardContent,
  DashboardHomeContent,
  type DashboardCourse,
} from "@/components/app/dashboard-content";
import { api } from "@/convex/_generated/api";
import type { ViewerProfile } from "@/lib/current-viewer";
import type { Locale } from "@/lib/i18n";

type LiveNavigationResult = {
  profile?: {
    role?: string;
  } | null;
  courses?: Array<{
    _id?: string;
    slug: string;
    titleSr: string;
    titleEn: string;
    subtitleSr: string;
    subtitleEn: string;
    descriptionSr: string;
    descriptionEn: string;
    status: "draft" | "published" | "archived";
    hasAccess?: boolean;
    stripePriceId?: string;
    videoUrl?: string | null;
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
          duration: formatDuration(lesson.durationSeconds),
          durationSeconds: lesson.durationSeconds,
          isPublished: lesson.isPublished,
          sortOrder: lesson.sortOrder,
          progress: lesson.progress,
        })),
    }));

  return {
    id: liveCourse._id,
    slug: liveCourse.slug,
    title: {
      sr: liveCourse.titleSr,
      en: liveCourse.titleEn,
    },
    image: fallbackCourse?.image,
    subtitle: {
      sr: liveCourse.subtitleSr,
      en: liveCourse.subtitleEn,
    },
    description: {
      sr: liveCourse.descriptionSr,
      en: liveCourse.descriptionEn,
    },
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

function coursesFromLive(liveNavigation: LiveNavigationResult, fallbackCourses: DashboardCourse[]): DashboardCourse[] {
  const liveCourses = liveNavigation?.courses;
  if (!liveCourses?.length) {
    return fallbackCourses;
  }

  return liveCourses.map((course) =>
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
): DashboardCourse {
  const liveCourses = liveNavigation?.courses;
  if (!liveCourses?.length) {
    return fallbackCourse;
  }

  const liveCourse = liveCourses.find((course) => course.slug === courseSlug) ?? liveCourses[0];
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
  newLessonModuleId,
  editModuleId,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  courseSlug?: string;
  fallbackCourse: DashboardCourse;
  fallbackCourses: DashboardCourse[];
  newLessonModuleId?: string;
  editModuleId?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const liveNavigation = useQuery(api.courses.getAppNavigation, isAuthenticated ? {} : "skip") as LiveNavigationResult;
  const courses = coursesFromLive(liveNavigation, fallbackCourses);
  const course = courseFromLive(liveNavigation, fallbackCourse, fallbackCourses, courseSlug);
  const isAdmin = profile?.role === "admin" || liveNavigation?.profile?.role === "admin";

  if (!courseSlug) {
    return <DashboardHomeContent locale={locale} profile={profile} courses={courses} isAdmin={isAdmin} />;
  }

  return (
    <DashboardContent
      locale={locale}
      profile={profile}
      course={course}
      isAdmin={isAdmin}
      newLessonModuleId={newLessonModuleId}
      editModuleId={editModuleId}
    />
  );
}
