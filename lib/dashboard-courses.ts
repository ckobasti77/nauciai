import type { DashboardCourse } from "@/components/app/dashboard-content";

/**
 * Cista logika koja `api.courses.getAppNavigation` payload pretvara u
 * `DashboardCourse[]` za komandnu tablu, Ucionicu i ekran kursa.
 *
 * Zivi u `lib/` (a ne u `components/app/dashboard-live.tsx`) da bi bila
 * testabilna bez React/Convex import lanca - `dashboard-live.tsx` je re-exportuje
 * pa svi postojeci uvozi rade i dalje.
 */
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
    /** Vlasnistvo za prikaz (aktivan upis ili staff rola). Vidi lib/course-catalog.ts. */
    owned?: boolean;
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

/**
 * Baza je PRAZNA za ovog korisnika: upit je zavrsen (nije `undefined`) i vratio je
 * nijedan kurs koji korisnik sme da vidi. Tada - i samo tada - se prikazuje
 * staticni katalog iz `lib/content.ts`. Dok upit traje (`undefined`) ovo je
 * `false`, pa se nikada ne pada na staticni sadrzaj usred ucitavanja.
 */
export function isLiveCatalogEmpty(liveNavigation: LiveNavigationResult): boolean {
  return liveNavigation !== undefined && (liveNavigation?.courses?.length ?? 0) === 0;
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
    // Namerno bez `Boolean(...)`: `undefined` znaci "payload nema to polje" i
    // `isCourseOwned` ga tada vraca na `hasAccess`. `Boolean(undefined)` bi to
    // pretvorio u tvrdo "nema kurs".
    owned: liveCourse.owned,
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

// fallbackCourses je dvostruke namene:
//  1) slug-uparen izvor DEKORATIVNE naslovne slike za kurs koji nema coverUrl;
//  2) STATICNI katalog kad je baza prazna (`isLiveCatalogEmpty`) - dok se ne
//     seed-uje. Cim baza ima >=1 kurs, ona je jedini izvor (nema mesanja).
// Dok upit traje (`liveNavigation === undefined`) vraca se prazno, ne fallback -
// da se marketing sadrzaj ne prikaze kao studentova lista usred ucitavanja.
export function coursesFromLive(liveNavigation: LiveNavigationResult, fallbackCourses: DashboardCourse[]): DashboardCourse[] {
  if (liveNavigation === undefined) return [];
  if (isLiveCatalogEmpty(liveNavigation)) return fallbackCourses;
  return (liveNavigation?.courses ?? []).map((course) =>
    courseFromLiveCourse(
      course,
      fallbackCourses.find((fallbackCourse) => fallbackCourse.slug === course.slug),
    ),
  );
}

export function courseFromLive(
  liveNavigation: LiveNavigationResult,
  fallbackCourse: DashboardCourse,
  fallbackCourses: DashboardCourse[],
  courseSlug?: string,
): DashboardCourse | null {
  if (liveNavigation === undefined) return null;
  // Baza prazna -> ekran kursa cita staticni kurs po slug-u, isto kao katalog.
  if (isLiveCatalogEmpty(liveNavigation)) {
    return fallbackCourses.find((course) => course.slug === courseSlug) ?? null;
  }

  const liveCourse = liveNavigation?.courses?.find((course) => course.slug === courseSlug);
  // An unknown course slug used to silently render liveCourses[0] — a different course than
  // the URL asked for. Return null so the caller can say so instead.
  if (!liveCourse) return null;

  return courseFromLiveCourse(
    liveCourse,
    fallbackCourses.find((course) => course.slug === liveCourse.slug) ?? fallbackCourse,
  );
}
