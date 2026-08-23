import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";

import { CoursePlayer } from "@/components/app/course-player";
import type { Id } from "@/convex/_generated/dataModel";
import type { Course, Lesson, LessonAsset, LessonPart } from "@/lib/content";
import { findCourse, findLesson } from "@/lib/content";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { coursePath, lessonPath } from "@/lib/app-routes";
import { normalizeLocale, withLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; courseSlug: string; lessonSlug: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Lekcija", en: "Lesson" });
}

type LiveLessonPayload = {
  course?: {
    _id: Id<"courses">;
    slug: string;
    titleSr: string;
    titleEn: string;
    subtitleSr: string;
    subtitleEn: string;
    descriptionSr: string;
    descriptionEn: string;
    descriptionRichSr?: string;
    descriptionRichEn?: string;
  } | null;
  lesson?: {
    _id: Id<"lessons">;
    moduleId: Id<"modules">;
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
  } | null;
  assets?: Array<{
    _id?: Id<"lessonAssets">;
    titleSr: string;
    titleEn: string;
    kind: "pdf" | "prompt" | "worksheet" | "project";
    fileName: string;
    byteSize?: number;
    downloadUrl?: string | null;
  }>;
  parts?: Array<{
    _id: Id<"lessonParts">;
    parentPartId?: Id<"lessonParts">;
    slug: string;
    titleSr: string;
    titleEn: string;
    kind: "text" | "image" | "video" | "file";
    bodySr?: string;
    bodyEn?: string;
    bodyRichSr?: string;
    bodyRichEn?: string;
    fileName?: string;
    byteSize?: number;
    downloadUrl?: string | null;
    isPublished?: boolean;
    sortOrder?: number;
  }>;
  progress?: {
    completed?: boolean;
  } | null;
  isAdmin?: boolean;
};

type LiveLessonResult = LiveLessonPayload | null;

function formatDuration(durationSeconds: number) {
  return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

function formatBytes(value?: number) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function liveLessonAssets(assets: LiveLessonPayload["assets"]): LessonAsset[] {
  return (assets ?? []).map((asset) => ({
    id: (asset as typeof asset & { _id?: string })._id,
    label: {
      sr: asset.titleSr,
      en: asset.titleEn,
    },
    kind: asset.kind,
    size: formatBytes(asset.byteSize) || asset.fileName,
    downloadUrl: asset.downloadUrl,
  }));
}

function liveLessonParts(parts: LiveLessonPayload["parts"]): LessonPart[] {
  return (parts ?? []).map((part) => ({
    id: part._id,
    parentPartId: part.parentPartId,
    slug: part.slug,
    title: {
      sr: part.titleSr,
      en: part.titleEn,
    },
    kind: part.kind,
    body:
      part.bodySr || part.bodyEn
        ? {
            sr: part.bodySr ?? part.bodyEn ?? "",
            en: part.bodyEn ?? part.bodySr ?? "",
          }
        : undefined,
    bodyRich: part.bodyRichSr || part.bodyRichEn ? { sr: part.bodyRichSr ?? "", en: part.bodyRichEn ?? "" } : undefined,
    downloadUrl: part.downloadUrl,
    fileName: part.fileName,
    size: formatBytes(part.byteSize),
    isPublished: part.isPublished ?? true,
    sortOrder: part.sortOrder,
  }));
}

function liveCourseAndLesson(liveLesson: LiveLessonResult, fallbackCourse: Course, fallbackLesson: Lesson) {
  if (!liveLesson?.course || !liveLesson.lesson) {
    return { course: fallbackCourse, lesson: fallbackLesson };
  }

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
    summaryRich: liveLesson.lesson.summaryRichSr || liveLesson.lesson.summaryRichEn ? { sr: liveLesson.lesson.summaryRichSr ?? "", en: liveLesson.lesson.summaryRichEn ?? "" } : undefined,
    isPublished: liveLesson.lesson.isPublished,
    sortOrder: liveLesson.lesson.sortOrder,
    assets: liveLessonAssets(liveLesson.assets),
    parts: liveLessonParts(liveLesson.parts),
  };

  const course: Course = {
    slug: liveLesson.course.slug,
    title: {
      sr: liveLesson.course.titleSr,
      en: liveLesson.course.titleEn,
    },
    subtitle: {
      sr: liveLesson.course.subtitleSr,
      en: liveLesson.course.subtitleEn,
    },
    description: {
      sr: liveLesson.course.descriptionSr,
      en: liveLesson.course.descriptionEn,
    },
    descriptionRich: liveLesson.course.descriptionRichSr || liveLesson.course.descriptionRichEn ? { sr: liveLesson.course.descriptionRichSr ?? "", en: liveLesson.course.descriptionRichEn ?? "" } : undefined,
    status: "published",
    priceLabel: fallbackCourse.priceLabel,
    image: fallbackCourse.image,
    detail: fallbackCourse.detail,
    stripePriceEnv: fallbackCourse.stripePriceEnv,
    accent: fallbackCourse.accent,
    modules: fallbackCourse.modules,
  };

  return { course, lesson };
}

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; courseSlug: string; lessonSlug: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { locale: localeParam, courseSlug, lessonSlug } = await params;
  const { view } = await searchParams;
  const locale = normalizeLocale(localeParam);
  const course = findCourse(courseSlug);
  const lesson = findLesson(course, lessonSlug);
  let liveLesson: LiveLessonResult = null;

  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    const token = await convexAuthNextjsToken();
    if (!token) {
      redirect(withLocale(locale, `/sign-in?next=${lessonPath(locale, courseSlug, lessonSlug)}`));
    }

    const convex = getConvexHttpClient(token);
    const profileStatus = convex
      ? await convex.query(convexQueries.getViewerProfileStatus, {}).catch(() => null) as { emailVerifiedForCourses?: boolean; isAdmin?: boolean } | null
      : null;
    if (profileStatus && !profileStatus.isAdmin && !profileStatus.emailVerifiedForCourses) {
      redirect(`${withLocale(locale, "/app/profile")}?verifyEmail=1&returnTo=${encodeURIComponent(lessonPath(locale, courseSlug, lessonSlug))}`);
    }
    liveLesson = convex
      ? ((await convex
          .query(convexQueries.getLessonForStudent, { courseSlug, lessonSlug })
          .catch(() => null)) as LiveLessonResult)
      : null;
  }

  if (!liveLesson && course.status !== "published") {
    redirect(coursePath(locale, course.slug));
  }

  const resolved = liveCourseAndLesson(liveLesson, course, lesson);

  return (
    <CoursePlayer
      course={resolved.course}
      lesson={resolved.lesson}
      locale={locale}
      courseId={liveLesson?.course?._id}
      lessonId={liveLesson?.lesson?._id}
      moduleId={liveLesson?.lesson?.moduleId}
      isAdmin={Boolean(liveLesson?.isAdmin)}
      initialView={view === "pro" ? "pro" : view === "light" ? "light" : undefined}
    />
  );
}
