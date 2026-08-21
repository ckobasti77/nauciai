import "server-only";

import { cache } from "react";

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { courses, primaryCourseSlug } from "@/lib/content";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import type { Locale, LocalizedText } from "@/lib/i18n";

export type AppLessonPartNav = {
  id?: string;
  parentPartId?: string;
  slug: string;
  title: LocalizedText;
  kind: "text" | "image" | "video" | "file";
  body?: LocalizedText;
  bodyRich?: LocalizedText;
  fileName?: string;
  isPublished: boolean;
  sortOrder: number;
};

export type AppLessonNav = {
  id?: string;
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  summaryRich?: LocalizedText;
  duration: string;
  durationSeconds?: number;
  isPublished: boolean;
  sortOrder: number;
  parts: AppLessonPartNav[];
};

export type AppModuleNav = {
  id?: string;
  title: LocalizedText;
  description?: LocalizedText;
  imageUrl?: string | null;
  imageFileName?: string;
  imageAlt?: LocalizedText;
  sortOrder: number;
  lessons: AppLessonNav[];
};

export type AppCourseNav = {
  id?: string;
  trackId?: string;
  trackSlug?: string;
  trackTitle?: LocalizedText;
  slug: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  description: LocalizedText;
  descriptionRich?: LocalizedText;
  status: "draft" | "published" | "archived";
  priceLabel: LocalizedText;
  stripePriceId?: string;
  videoUrl?: string | null;
  coverUrl?: string | null;
  videoFileName?: string;
  videoByteSize?: number;
  videoMimeType?: string;
  videoUpdatedAt?: number;
  hasAccess: boolean;
  sortOrder: number;
  modules: AppModuleNav[];
};

export type AppNavigationData = {
  role?: string;
  plan?: string;
  courses: AppCourseNav[];
};

type LiveNavigationResult = {
  profile?: {
    role?: string;
    plan?: string;
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
    stripePriceId?: string;
    videoUrl?: string | null;
    coverUrl?: string | null;
    videoFileName?: string;
    videoByteSize?: number;
    videoMimeType?: string;
    videoUpdatedAt?: number;
    hasAccess?: boolean;
    sortOrder: number;
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
        parts?: Array<{
          _id?: string;
          parentPartId?: string;
          slug: string;
          titleSr: string;
          titleEn: string;
          kind: "text" | "image" | "video" | "file";
          bodySr?: string;
          bodyEn?: string;
          bodyRichSr?: string;
          bodyRichEn?: string;
          fileName?: string;
          isPublished: boolean;
          sortOrder: number;
        }>;
      }>;
    }>;
  }>;
} | null;

function durationLabel(durationSeconds: number, locale: Locale) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  return locale === "sr" ? `${minutes} min` : `${minutes} min`;
}

function fallbackCourse(slug: string) {
  return courses.find((course) => course.slug === slug);
}

function staticNavigationData(): AppNavigationData {
  return {
    courses: courses.map((course, courseIndex) => ({
      id: course.slug,
      slug: course.slug,
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      status: course.status === "published" ? "published" : "draft",
      priceLabel: course.priceLabel,
      hasAccess: course.status === "published",
      sortOrder: courseIndex * 10,
      modules: course.modules.map((module, moduleIndex) => ({
        id: `${course.slug}-${moduleIndex}`,
        title: module.title,
        sortOrder: moduleIndex * 10,
        lessons: module.lessons.map((lesson, lessonIndex) => ({
          id: lesson.slug,
          slug: lesson.slug,
          title: lesson.title,
          summary: lesson.summary,
          duration: lesson.duration,
          isPublished: true,
          sortOrder: lessonIndex * 10,
          parts: lesson.parts.map((part, partIndex) => ({
            id: part.slug,
            parentPartId: part.parentPartId,
            slug: part.slug,
            title: part.title,
            kind: part.kind,
            body: part.body,
            fileName: part.fileName,
            isPublished: true,
            sortOrder: partIndex * 10,
          })),
        })),
      })),
    })),
  };
}

/**
 * `cache`d because two callers need it per request: AppShell, and the course-detail
 * route's generateMetadata. Deduping keeps that a single Convex round-trip and
 * guarantees the tab title names the same course the sidebar switcher shows.
 */
export const getAppNavigationData = cache(async (locale: Locale): Promise<AppNavigationData> => {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return staticNavigationData();
  }

  const token = await convexAuthNextjsToken();
  const convex = getConvexHttpClient(token);
  if (!convex) {
    return staticNavigationData();
  }

  const liveNavigation = (await convex
    .query(convexQueries.getAppNavigation, {})
    .catch(() => null)) as LiveNavigationResult;

  if (!liveNavigation?.courses?.length) {
    const role = liveNavigation?.profile?.role;
    let plan = "free";
    if (role === "admin") plan = "admin";
    else if (role === "moderator") plan = "moderator";
    else if (role === "pro_student") plan = "pro";
    return {
      ...staticNavigationData(),
      role,
      plan,
    };
  }

  return {
    role: liveNavigation.profile?.role,
    plan: liveNavigation.profile?.plan,
    courses: liveNavigation.courses.map((course) => {
      const fallback = fallbackCourse(course.slug);
      return {
        id: course._id,
        trackId: course.trackId,
        trackSlug: course.trackSlug,
        trackTitle: course.trackTitleSr || course.trackTitleEn ? { sr: course.trackTitleSr ?? course.trackTitleEn ?? "", en: course.trackTitleEn ?? course.trackTitleSr ?? "" } : undefined,
        slug: course.slug,
        title: {
          sr: course.titleSr,
          en: course.titleEn,
        },
        subtitle: {
          sr: course.subtitleSr,
          en: course.subtitleEn,
        },
        description: {
          sr: course.descriptionSr,
          en: course.descriptionEn,
        },
        descriptionRich: course.descriptionRichSr || course.descriptionRichEn ? { sr: course.descriptionRichSr ?? "", en: course.descriptionRichEn ?? "" } : undefined,
        status: course.status,
        priceLabel: fallback?.priceLabel ?? {
          sr: "Uskoro",
          en: "Soon",
        },
        stripePriceId: course.stripePriceId,
        videoUrl: course.videoUrl,
        coverUrl: course.coverUrl,
        videoFileName: course.videoFileName,
        videoByteSize: course.videoByteSize,
        videoMimeType: course.videoMimeType,
        videoUpdatedAt: course.videoUpdatedAt,
        hasAccess: Boolean(course.hasAccess),
        sortOrder: course.sortOrder,
        modules: (course.modules ?? []).map((module) => ({
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
          lessons: (module.lessons ?? []).map((lesson) => ({
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
            duration: durationLabel(lesson.durationSeconds, locale),
            durationSeconds: lesson.durationSeconds,
            isPublished: lesson.isPublished,
            sortOrder: lesson.sortOrder,
            parts: (lesson.parts ?? []).map((part) => ({
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
              fileName: part.fileName,
              isPublished: part.isPublished,
              sortOrder: part.sortOrder,
            })),
          })),
        })),
      };
    }),
  };
});

export function resolveCourseSlug(candidate?: string | null) {
  return candidate || primaryCourseSlug;
}
