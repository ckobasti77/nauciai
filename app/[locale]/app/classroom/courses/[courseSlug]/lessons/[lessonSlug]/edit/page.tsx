import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";

import { LessonStepsEditor } from "@/components/app/lesson-steps-editor";
import type { Id } from "@/convex/_generated/dataModel";
import type { Course, Lesson } from "@/lib/content";
import { findCourse, findLesson } from "@/lib/content";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { lessonEditPath, lessonPath } from "@/lib/app-routes";
import { normalizeLocale, withLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; courseSlug: string; lessonSlug: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Izmena lekcije", en: "Edit lesson" });
}

type LiveLessonPayload = {
  course?: {
    _id: Id<"courses">;
    slug: string;
    titleSr: string;
    titleEn: string;
  } | null;
  lesson?: {
    _id: Id<"lessons">;
    moduleId: Id<"modules">;
    slug: string;
    titleSr: string;
    titleEn: string;
    summarySr: string;
    summaryEn: string;
    durationSeconds: number;
    isPublished: boolean;
    sortOrder: number;
  } | null;
  isAdmin?: boolean;
};

function formatDuration(durationSeconds: number) {
  return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

function liveCourseAndLesson(liveLesson: LiveLessonPayload | null, fallbackCourse: Course, fallbackLesson: Lesson) {
  if (!liveLesson?.course || !liveLesson.lesson) {
    return { course: fallbackCourse, lesson: fallbackLesson };
  }

  const course: Course = {
    ...fallbackCourse,
    slug: liveLesson.course.slug,
    title: {
      sr: liveLesson.course.titleSr,
      en: liveLesson.course.titleEn,
    },
  };

  const lesson: Lesson = {
    id: liveLesson.lesson._id,
    slug: liveLesson.lesson.slug,
    title: {
      sr: liveLesson.lesson.titleSr,
      en: liveLesson.lesson.titleEn,
    },
    duration: formatDuration(liveLesson.lesson.durationSeconds),
    durationSeconds: liveLesson.lesson.durationSeconds,
    summary: {
      sr: liveLesson.lesson.summarySr,
      en: liveLesson.lesson.summaryEn,
    },
    isPublished: liveLesson.lesson.isPublished,
    sortOrder: liveLesson.lesson.sortOrder,
    assets: [],
    parts: [],
  };

  return { course, lesson };
}

export default async function LessonEditPage({
  params,
}: {
  params: Promise<{ locale: string; courseSlug: string; lessonSlug: string }>;
}) {
  const { locale: localeParam, courseSlug, lessonSlug } = await params;
  const locale = normalizeLocale(localeParam);

  const course = findCourse(courseSlug);
  const lesson = findLesson(course, lessonSlug);

  let liveLesson: LiveLessonPayload | null = null;

  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    const token = await convexAuthNextjsToken();
    if (!token) {
      redirect(withLocale(locale, `/sign-in?next=${lessonEditPath(locale, courseSlug, lessonSlug)}`));
    }

    const convex = getConvexHttpClient(token);
    if (convex) {
      liveLesson = (await convex
        .query(convexQueries.getLessonForStudent, { courseSlug, lessonSlug })
        .catch(() => null)) as LiveLessonPayload | null;
    }
  }

  // If not admin, block edit access and redirect to the student view
  if (!liveLesson?.isAdmin) {
    redirect(lessonPath(locale, courseSlug, lessonSlug));
  }

  const resolved = liveCourseAndLesson(liveLesson, course, lesson);

  return (
    <LessonStepsEditor
      course={resolved.course}
      lesson={resolved.lesson}
      locale={locale}
      courseId={liveLesson.course?._id}
      lessonId={liveLesson.lesson?._id}
      moduleId={liveLesson.lesson?.moduleId}
    />
  );
}
