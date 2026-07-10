"use client";

import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Lock,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  User,
  LogOut,
} from "lucide-react";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { gsap } from "gsap";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  AddCourseAction,
  AddLessonAction,
  AddLessonPartAction,
  AddModuleAction,
  EditCourseAction,
  EditLessonAction,
  EditLessonPartAction,
  EditModuleAction,
} from "@/components/app/admin-inline-actions";
import { CheckoutButton } from "@/components/app/checkout-button";
import { SignOutButton } from "@/components/app/sign-out-button";
import { BrandMark, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { AppCourseNav, AppLessonNav, AppLessonPartNav, AppNavigationData } from "@/lib/app-navigation";
import { primaryCourseSlug } from "@/lib/content";
import { dictionary, localized, type Locale, withLocale } from "@/lib/i18n";

function courseHref(locale: Locale, courseSlug: string) {
  return withLocale(locale, `/app?course=${courseSlug}`);
}

function navHref(locale: Locale, path: string, courseSlug: string) {
  return `${withLocale(locale, path)}?course=${courseSlug}`;
}

function communityHref(locale: Locale, courseSlug: string) {
  return `${withLocale(locale, "/app/community/discussions")}?scope=course&course=${courseSlug}`;
}

function lessonHref(locale: Locale, courseSlug: string, lessonSlug: string) {
  return withLocale(locale, `/app/courses/${courseSlug}/lessons/${lessonSlug}`);
}

function partHref(locale: Locale, courseSlug: string, lessonSlug: string, partSlug: string) {
  return `${lessonHref(locale, courseSlug, lessonSlug)}#part-${partSlug}`;
}

function nextSortOrder(items: Array<{ sortOrder: number }>) {
  return items.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10;
}

function childParts(parts: AppLessonPartNav[], parentPartId?: string) {
  return parts
    .filter((part) => (part.parentPartId ?? undefined) === parentPartId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

type LiveNavigationResult = {
  profile?: {
    role?: string;
    name?: string;
    username?: string;
    email?: string;
    avatarUrl?: string;
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
    stripePriceId?: string;
    hasAccess?: boolean;
    sortOrder: number;
    modules?: Array<{
      _id?: string;
      titleSr: string;
      titleEn: string;
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
        parts?: Array<{
          _id?: string;
          parentPartId?: string;
          slug: string;
          titleSr: string;
          titleEn: string;
          kind: "text" | "video" | "file";
          bodySr?: string;
          bodyEn?: string;
          fileName?: string;
          isPublished: boolean;
          sortOrder: number;
        }>;
      }>;
    }>;
  }>;
} | null | undefined;

function durationLabel(durationSeconds: number, locale: Locale) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  return locale === "sr" ? `${minutes} min` : `${minutes} min`;
}

function navigationFromLive(
  liveNavigation: LiveNavigationResult,
  fallbackNavigation: AppNavigationData,
  locale: Locale,
): AppNavigationData {
  if (!liveNavigation?.courses?.length) {
    return {
      ...fallbackNavigation,
      role: liveNavigation?.profile?.role ?? fallbackNavigation.role,
    };
  }

  return {
    role: liveNavigation.profile?.role ?? fallbackNavigation.role,
    courses: liveNavigation.courses.map((course) => {
      const fallbackCourse = fallbackNavigation.courses.find((item) => item.slug === course.slug);
      return {
        id: course._id,
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
        status: course.status,
        priceLabel: fallbackCourse?.priceLabel ?? {
          sr: "Uskoro",
          en: "Soon",
        },
        stripePriceId: course.stripePriceId,
        hasAccess: Boolean(course.hasAccess),
        sortOrder: course.sortOrder,
        modules: (course.modules ?? []).map((module) => ({
          id: module._id,
          title: {
            sr: module.titleSr,
            en: module.titleEn,
          },
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
              fileName: part.fileName,
              isPublished: part.isPublished,
              sortOrder: part.sortOrder,
            })),
          })),
        })),
      };
    }),
  };
}

function currentCourseFrom(
  courses: AppCourseNav[],
  routeCourseSlug: string | undefined,
  queryCourseSlug: string | null,
) {
  const slug = routeCourseSlug ?? queryCourseSlug ?? primaryCourseSlug;
  return courses.find((course) => course.slug === slug) ?? courses[0];
}

function isCourseComingSoon(course: AppCourseNav, isAdmin: boolean) {
  return course.status !== "published" && !isAdmin;
}

function isCourseLocked(course: AppCourseNav, isAdmin: boolean) {
  return course.status === "published" && !course.hasAccess && !isAdmin;
}

function SidebarAdminActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sidebar-action-cluster pointer-events-auto flex shrink-0 items-center gap-1 rounded-[7px] bg-white/95 p-0.5 shadow-[2px_2px_0_0_rgba(14,49,88,0.12)] transition",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CourseSwitcher({
  locale,
  courses,
  currentCourse,
  isAdmin,
}: {
  locale: Locale;
  courses: AppCourseNav[];
  currentCourse: AppCourseNav;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sidebar-reveal relative mt-5 lg:mt-8">
      <div className="flex items-center gap-2">
        <motion.button
          type="button"
          onClick={() => setOpen((value) => !value)}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 rounded-[8px] border-2 border-ink bg-yellow px-3 py-2 text-left text-sm font-black text-ink shadow-[4px_4px_0_0_rgba(14,49,88,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span className="flex min-w-0 items-center gap-2">
            <GraduationCap className="size-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate">{localized(currentCourse.title, locale)}</span>
              <span className="mt-0.5 block text-[11px] font-black uppercase text-ink/70">
                {currentCourse.status === "published"
                  ? currentCourse.hasAccess || isAdmin
                    ? locale === "sr"
                      ? "Aktivan smer"
                      : "Active track"
                    : locale === "sr"
                      ? "Zakljucan smer"
                      : "Locked track"
                  : locale === "sr"
                    ? "Nacrt"
                    : "Draft"}
              </span>
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 transition", open && "rotate-180")} />
        </motion.button>
        {isAdmin ? (
          <SidebarAdminActions className="sidebar-action-cluster-static">
            <AddCourseAction locale={locale} nextSortOrder={nextSortOrder(courses)} iconOnly />
          </SidebarAdminActions>
        ) : null}
      </div>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative z-20 mt-2 rounded-[8px] border-2 border-ink bg-white p-2 shadow-[6px_6px_0_0_rgba(14,49,88,0.18)]"
          >
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {courses.map((course) => {
                const comingSoon = isCourseComingSoon(course, isAdmin);
                const locked = isCourseLocked(course, isAdmin);
                const canEditCourse = Boolean(course.id && course.id !== course.slug);
                const active = course.slug === currentCourse.slug;
                const statusLabel = comingSoon
                  ? locale === "sr"
                    ? "Uskoro"
                    : "Coming soon"
                  : locked
                    ? locale === "sr"
                      ? "Zakljucano"
                      : "Locked"
                    : locale === "sr"
                      ? "Aktivno"
                      : "Active";

                return (
                  <motion.div
                    key={course.slug}
                    layout
                    whileHover={{ x: 2 }}
                    className={cn(
                      "group relative rounded-[8px] border-2 p-2 pr-10 transition",
                      active ? "border-ink bg-yellow/40" : "border-line bg-paper",
                    )}
                  >
                    <div className="sidebar-action-row flex items-center gap-1">
                      {comingSoon ? (
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm font-black text-muted">
                          <span className="truncate">{localized(course.title, locale)}</span>
                          <span className="rounded-[6px] border-2 border-ink bg-white px-2 py-1 text-[11px] text-ink">
                            {statusLabel}
                          </span>
                        </div>
                      ) : (
                        <Link
                          href={courseHref(locale, course.slug)}
                          onClick={() => setOpen(false)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[6px] px-1 py-1 text-sm font-black text-ink hover:bg-white"
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{localized(course.title, locale)}</span>
                            <span className="mt-1 inline-flex items-center gap-1 rounded-[6px] border-2 border-line bg-white px-2 py-0.5 text-[10px] font-black uppercase text-muted">
                              {locked ? <Lock className="size-3" /> : <ShieldCheck className="size-3" />}
                              {statusLabel}
                            </span>
                          </span>
                          {locked ? <Lock className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                        </Link>
                      )}
                    {isAdmin && canEditCourse ? (
                      <SidebarAdminActions className="absolute right-2 top-2">
                        <EditCourseAction
                          locale={locale}
                          courseId={course.id}
                          initial={{
                            slug: course.slug,
                            title: course.title,
                            subtitle: course.subtitle,
                            description: course.description,
                            status: course.status,
                            sortOrder: course.sortOrder,
                          }}
                          nextSortOrder={course.sortOrder}
                          iconOnly
                        />
                      </SidebarAdminActions>
                    ) : null}
                    </div>
                    {locked ? (
                      <div className="mt-2">
                        <CheckoutButton
                          courseSlug={course.slug}
                          locale={locale}
                          label={locale === "sr" ? "Plati" : "Pay"}
                          size="compact"
                        />
                      </div>
                    ) : null}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function NavLink({
  href,
  active,
  icon: Icon,
  label,
  badge,
}: {
  href: string;
  active: boolean;
  icon: typeof LayoutDashboard;
  label: string;
  badge?: number;
}) {
  return (
    <motion.div whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} className="min-w-0">
      <Link
        href={href}
        className={cn(
          "inline-flex min-h-11 min-w-0 items-center justify-between rounded-[8px] border-2 border-transparent px-3 py-2 text-sm font-extrabold text-ink transition hover:border-ink hover:bg-yellow sm:justify-start lg:w-full",
          active && "border-ink bg-paper shadow-[3px_3px_0_0_rgba(14,49,88,0.14)]",
        )}
      >
        <span className="flex items-center gap-3 min-w-0">
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        {badge && badge > 0 ? (
          <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white border border-ink shrink-0">
            {badge}
          </span>
        ) : null}
      </Link>
    </motion.div>
  );
}

function LessonPartTree({
  locale,
  currentCourse,
  lesson,
  parentPartId,
  depth = 0,
  isAdmin,
}: {
  locale: Locale;
  currentCourse: AppCourseNav;
  lesson: AppLessonNav;
  parentPartId?: string;
  depth?: number;
  isAdmin: boolean;
}) {
  const parts = childParts(lesson.parts, parentPartId);

  return (
    <>
      {parts.map((part) => {
        const nestedParts = childParts(lesson.parts, part.id);
        const canAddChildPart = isAdmin && depth === 0 && Boolean(part.id);
        return (
          <motion.div key={part.id ?? part.slug} layout className={cn("group relative", depth > 0 && "ml-4")}>
            <div className="sidebar-action-row flex items-center gap-1 rounded-[6px]">
              <Link
                href={partHref(locale, currentCourse.slug, lesson.slug, part.slug)}
                className={cn(
                  "flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-[6px] px-2 pr-16 text-xs font-black text-muted hover:bg-paper hover:text-ink sm:pr-2",
                  depth > 0 && "text-[11px]",
                )}
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{localized(part.title, locale)}</span>
                {isAdmin && part.isPublished === false ? (
                  <span className="ml-auto shrink-0 rounded-[5px] border border-line bg-white px-1.5 py-0.5 text-[9px] uppercase text-muted">
                    {locale === "sr" ? "Nacrt" : "Draft"}
                  </span>
                ) : null}
              </Link>
              {isAdmin && part.id ? (
                <SidebarAdminActions className="absolute right-0 top-0">
                  <EditLessonPartAction
                    locale={locale}
                    courseId={currentCourse.id}
                    lessonId={lesson.id}
                    lessonPartId={part.id}
                    initial={{
                      slug: part.slug,
                      parentPartId: part.parentPartId,
                      title: part.title,
                      kind: part.kind,
                      body: part.body,
                      fileName: part.fileName,
                      isPublished: part.isPublished,
                      sortOrder: part.sortOrder,
                    }}
                    nextSortOrder={part.sortOrder}
                    iconOnly
                  />
                  {canAddChildPart ? (
                    <AddLessonPartAction
                      locale={locale}
                      courseId={currentCourse.id}
                      lessonId={lesson.id}
                      parentPartId={part.id}
                      nextSortOrder={nextSortOrder(nestedParts)}
                      iconOnly
                      buttonLabel={locale === "sr" ? "Dodaj poddeo" : "Add subpart"}
                    />
                  ) : null}
                </SidebarAdminActions>
              ) : null}
            </div>
            {part.id ? (
              <LessonPartTree
                locale={locale}
                currentCourse={currentCourse}
                lesson={lesson}
                parentPartId={part.id}
                depth={depth + 1}
                isAdmin={isAdmin}
              />
            ) : null}
          </motion.div>
        );
      })}
    </>
  );
}

function LessonsAccordion({
  locale,
  currentCourse,
  currentLessonSlug,
  isAdmin,
}: {
  locale: Locale;
  currentCourse: AppCourseNav;
  currentLessonSlug?: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(Boolean(currentLessonSlug));
  const [expandedLessons, setExpandedLessons] = useState<Record<string, boolean>>({});
  const comingSoon = isCourseComingSoon(currentCourse, isAdmin);
  const locked = isCourseLocked(currentCourse, isAdmin);
  const totalLessons = currentCourse.modules.reduce((count, module) => count + module.lessons.length, 0);

  function isExpanded(lessonSlug: string) {
    return Boolean(expandedLessons[lessonSlug] || currentLessonSlug === lessonSlug);
  }

  return (
    <div className="sidebar-reveal col-span-2 sm:col-span-3 lg:col-span-1">
      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-3 rounded-[8px] border-2 border-transparent px-3 py-2 text-sm font-extrabold text-ink transition hover:border-ink hover:bg-yellow sm:justify-start",
          currentLessonSlug && "border-ink bg-paper",
        )}
      >
        <BookOpen className="size-4" />
        <span className="flex-1 text-center sm:text-left">
          {dictionary[locale].lessons}
          <span className="ml-2 rounded-[6px] border-2 border-line bg-white px-2 py-0.5 text-[10px] font-black text-muted">
            {totalLessons}
          </span>
        </span>
        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
      </motion.button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-2 space-y-2 rounded-[8px] border-2 border-line bg-white p-2 shadow-[4px_4px_0_0_rgba(14,49,88,0.08)]">
            {comingSoon ? (
              <div className="rounded-[8px] border-2 border-dashed border-line bg-paper p-3">
                <p className="text-sm font-black text-muted">
                  {locale === "sr" ? "Lekcije za ovaj smer stizu uskoro." : "Lessons for this track are coming soon."}
                </p>
                {isAdmin ? (
                  <p className="mt-1 text-xs font-bold text-muted">
                    {locale === "sr" ? "Admin moze da doda module i lekcije odmah." : "Admins can add modules and lessons now."}
                  </p>
                ) : null}
              </div>
            ) : locked ? (
              <div className="rounded-[8px] border-2 border-line bg-paper p-3">
                <p className="text-sm font-black text-muted">
                  {locale === "sr" ? "Smer je zakljucan dok ne platis pristup." : "This track is locked until payment."}
                </p>
                <div className="mt-3">
                  <CheckoutButton
                    courseSlug={currentCourse.slug}
                    locale={locale}
                    label={locale === "sr" ? "Plati" : "Pay"}
                    size="compact"
                  />
                </div>
              </div>
            ) : (
              currentCourse.modules.map((module) => (
                <motion.div layout key={module.id ?? module.title.sr} className="group relative space-y-1 rounded-[8px] border-2 border-line bg-paper p-2">
                  <div className="sidebar-action-row flex items-center justify-between gap-2 pr-20 sm:pr-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black uppercase text-muted">
                        {localized(module.title, locale)}
                      </p>
                      <p className="mt-0.5 text-[11px] font-bold text-muted">
                        {module.lessons.length} {locale === "sr" ? "lekcija" : "lessons"}
                      </p>
                    </div>
                    {isAdmin ? (
                      <SidebarAdminActions className="absolute right-2 top-2">
                        {module.id ? (
                          <EditModuleAction
                            locale={locale}
                            courseId={currentCourse.id}
                            moduleId={module.id}
                            initial={{
                              title: module.title,
                              sortOrder: module.sortOrder,
                            }}
                            nextSortOrder={module.sortOrder}
                            iconOnly
                          />
                        ) : null}
                        <AddLessonAction
                          locale={locale}
                          courseId={currentCourse.id}
                          courseSlug={currentCourse.slug}
                          moduleId={module.id}
                          nextSortOrder={nextSortOrder(module.lessons)}
                          iconOnly
                        />
                      </SidebarAdminActions>
                    ) : null}
                  </div>
                  <div className="mt-2 space-y-1">
                  {module.lessons.map((lesson) => {
                    const active = currentLessonSlug === lesson.slug;
                    const topLevelParts = childParts(lesson.parts);
                    return (
                      <motion.div layout key={lesson.slug} className="sidebar-action-row relative">
                        <div
                          className={cn(
                            "flex items-center gap-1 rounded-[8px] border-2 border-transparent bg-white",
                            active && "border-ink bg-yellow",
                          )}
                        >
                          <Link
                            href={lessonHref(locale, currentCourse.slug, lesson.slug)}
                            className="flex min-h-10 min-w-0 flex-1 items-center gap-2 px-2 pr-16 text-sm font-black text-ink sm:pr-2"
                          >
                            <PlayCircle className="size-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{localized(lesson.title, locale)}</span>
                            {isAdmin && !lesson.isPublished ? (
                              <span className="shrink-0 rounded-[5px] border border-ink bg-paper px-1.5 py-0.5 text-[9px] uppercase text-muted">
                                {locale === "sr" ? "Nacrt" : "Draft"}
                              </span>
                            ) : null}
                          </Link>
                          {isAdmin ? (
                            <SidebarAdminActions className="absolute right-10 top-1.5">
                              <EditLessonAction
                                locale={locale}
                                courseId={currentCourse.id}
                                courseSlug={currentCourse.slug}
                                moduleId={module.id}
                                lessonId={lesson.id}
                                initial={{
                                  slug: lesson.slug,
                                  title: lesson.title,
                                  summary: lesson.summary,
                                  durationSeconds: lesson.durationSeconds,
                                  isPublished: lesson.isPublished,
                                  sortOrder: lesson.sortOrder,
                                }}
                                nextSortOrder={lesson.sortOrder}
                                iconOnly
                              />
                              <AddLessonPartAction
                                locale={locale}
                                courseId={currentCourse.id}
                                lessonId={lesson.id}
                                nextSortOrder={nextSortOrder(topLevelParts)}
                                iconOnly
                              />
                            </SidebarAdminActions>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLessons((current) => ({
                                ...current,
                                [lesson.slug]: !isExpanded(lesson.slug),
                              }))
                            }
                            aria-label={locale === "sr" ? "Otvori delove lekcije" : "Open lesson parts"}
                            className="mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] text-ink hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                          >
                            <ChevronDown className={cn("size-4 transition", isExpanded(lesson.slug) && "rotate-180")} />
                          </button>
                        </div>
                        {isExpanded(lesson.slug) ? (
                          <div className="ml-7 mt-1 space-y-1 border-l-2 border-line pl-3">
                            {topLevelParts.length ? (
                              <LessonPartTree
                                locale={locale}
                                currentCourse={currentCourse}
                                lesson={lesson}
                                isAdmin={isAdmin}
                              />
                            ) : (
                              <p className="rounded-[6px] px-2 py-2 text-xs font-black text-muted">
                                {locale === "sr" ? "Nema delova jos." : "No parts yet."}
                              </p>
                            )}
                          </div>
                        ) : null}
                      </motion.div>
                    );
                  })}
                  {!module.lessons.length ? (
                    <p className="rounded-[6px] border-2 border-dashed border-line bg-white px-2 py-2 text-xs font-black text-muted">
                      {locale === "sr" ? "Nema lekcija u ovom modulu." : "No lessons in this module."}
                    </p>
                  ) : null}
                  </div>
                </motion.div>
              ))
            )}
            {isAdmin && currentCourse.id ? (
              <div className="flex flex-wrap gap-2 border-t-2 border-line pt-2">
                <AddModuleAction
                  locale={locale}
                  courseId={currentCourse.id}
                  nextSortOrder={nextSortOrder(currentCourse.modules)}
                />
                {!currentCourse.modules.length ? (
                  <span className="text-xs font-bold text-muted">
                    {locale === "sr" ? "Dodaj modul pre lekcije." : "Add a module before a lesson."}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppSidebarContent({
  locale,
  navigation,
  source = "server",
  authState = "unknown",
  profileData,
  communityBadge = 0,
}: {
  locale: Locale;
  navigation: AppNavigationData;
  source?: "server" | "live";
  authState?: "loading" | "authenticated" | "anonymous" | "unknown";
  profileData?: { name?: string; username?: string; email?: string; avatarUrl?: string } | null;
  communityBadge?: number;
}) {
  const pathname = usePathname();
  const params = useParams<{ courseSlug?: string; lessonSlug?: string }>();
  const searchParams = useSearchParams();
  const t = dictionary[locale];
  const courses = navigation.courses;
  const currentCourse = useMemo(
    () => currentCourseFrom(courses, params.courseSlug, searchParams.get("course")),
    [courses, params.courseSlug, searchParams],
  );
  const isAdmin = navigation.role === "admin";
  const rootRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { signOut } = useAuthActions();
  const router = useRouter();

  useEffect(() => {
    if (!rootRef.current || shouldReduceMotion) return;

    const context = gsap.context(() => {
      gsap.from(".sidebar-reveal", {
        autoAlpha: 0,
        y: 10,
        duration: 0.32,
        ease: "power2.out",
        stagger: 0.04,
      });
    }, rootRef);

    return () => context.revert();
  }, [navigation.role, shouldReduceMotion]);

  // Close profile menu on click outside
  useEffect(() => {
    if (!profileMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileMenuOpen]);

  const profileName = profileData?.name || "Student";
  const profileUsername = profileData?.username ? `@${profileData.username}` : profileData?.email || "";
  const profileInitials = profileName.split(/\s+/).map((part: string) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "AI";
  const profileAvatar = profileData?.avatarUrl;

  return (
    <aside
      ref={rootRef}
      data-sidebar-source={source}
      data-sidebar-auth={authState}
      data-sidebar-role={navigation.role ?? "none"}
      data-sidebar-admin={isAdmin ? "true" : "false"}
      className="border-b-2 border-ink bg-white px-4 py-4 lg:sticky lg:top-0 lg:max-h-screen lg:w-[336px] lg:border-b-0 lg:border-r-2 lg:px-5 lg:py-7 xl:w-[360px] lg:flex lg:flex-col lg:justify-between"
    >
      <div className="lg:flex-1 lg:overflow-y-auto min-w-0">
        <div className="sidebar-reveal flex items-center justify-between gap-4 lg:block">
          <BrandMark href={withLocale(locale)} label={t.appName} />
        </div>
        {isAdmin ? (
          <div className="sidebar-reveal mt-4 rounded-[8px] border-2 border-ink bg-paper px-3 py-2 text-xs font-black text-ink">
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-ink" />
              {locale === "sr" ? "Live admin akcije" : "Live admin actions"}
            </span>
            <span className="mt-1 block text-[11px] font-bold text-muted">
              {source === "live" ? "Convex live" : "Server fallback"} · {authState}
            </span>
          </div>
        ) : null}
        {currentCourse ? (
          <CourseSwitcher locale={locale} courses={courses} currentCourse={currentCourse} isAdmin={isAdmin} />
        ) : null}
        {currentCourse ? (
          <nav className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col">
            <NavLink
              href={courseHref(locale, currentCourse.slug)}
              active={pathname === withLocale(locale, "/app")}
              icon={LayoutDashboard}
              label="Dashboard"
            />
            <LessonsAccordion
              locale={locale}
              currentCourse={currentCourse}
              currentLessonSlug={params.lessonSlug}
              isAdmin={isAdmin}
            />
            <NavLink
              href={communityHref(locale, currentCourse.slug)}
              active={pathname === withLocale(locale, "/app/community") || pathname.includes("/app/community/")}
              icon={MessageCircle}
              label={t.community}
              badge={communityBadge}
            />
          </nav>
        ) : null}
      </div>

      {/* Bottom Profile Card */}
      {profileData && (
        <div className="relative mt-auto border-t-2 border-ink pt-4 hidden lg:block" ref={profileMenuRef}>
          {profileMenuOpen ? (
            <div className="absolute bottom-[calc(100%+0.65rem)] left-0 z-50 w-full rounded-[16px] border-2 border-ink bg-white p-2.5 text-ink shadow-[8px_8px_0_0_rgba(14,49,88,0.14)]">
              <span
                aria-hidden="true"
                className="absolute -bottom-2 left-6 size-4 rotate-45 border-r-2 border-b-2 border-ink bg-white"
              />
              
              <div className="overflow-hidden rounded-[12px] divide-y divide-line/80">
                <Link
                  href={currentCourse ? navHref(locale, "/app/profile", currentCourse.slug) : withLocale(locale, "/app/profile")}
                  onClick={() => setProfileMenuOpen(false)}
                  className="flex min-h-10 items-center gap-3 bg-white px-3 py-2 text-[13px] font-black uppercase text-ink transition hover:bg-yellow/35 font-extrabold"
                >
                  <User className="size-4 shrink-0" />
                  <span>{t.profile}</span>
                </Link>
                <Link
                  href={currentCourse ? navHref(locale, "/app/billing", currentCourse.slug) : withLocale(locale, "/app/billing")}
                  onClick={() => setProfileMenuOpen(false)}
                  className="flex min-h-10 items-center gap-3 bg-white px-3 py-2 text-[13px] font-black uppercase text-ink transition hover:bg-yellow/35 font-extrabold"
                >
                  <CreditCard className="size-4 shrink-0" />
                  <span>{t.billing}</span>
                </Link>
              </div>

              <div className="mt-2 border-t border-line/90 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    setProfileMenuOpen(false);
                    router.push(withLocale(locale, "/sign-in"));
                  }}
                  className="flex min-h-10 w-full items-center gap-3 rounded-[10px] bg-ink px-3 py-2 text-[13px] font-black uppercase text-white transition hover:bg-[#16446f] font-extrabold"
                >
                  <LogOut className="size-4 shrink-0" />
                  <span>{locale === "sr" ? "Odjavi se" : "Sign out"}</span>
                </button>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex w-full items-center gap-3 rounded-[12px] border-2 border-ink bg-white p-2 text-left text-ink transition hover:bg-yellow/15 shadow-[3px_3px_0_0_rgba(14,49,88,0.18)]"
          >
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-yellow text-xs font-black">
              {profileAvatar ? (
                <img src={profileAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{profileInitials}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black leading-tight text-ink">{profileName}</p>
              <p className="truncate text-[10px] font-semibold leading-normal text-muted/80 mt-0.5">{profileUsername}</p>
            </div>
            <ChevronDown className={cn("size-4 shrink-0 transition-transform text-muted", profileMenuOpen && "rotate-180")} />
          </button>
        </div>
      )}

      {/* Mobile profile link */}
      {profileData && (
        <div className="lg:hidden mt-4 border-t-2 border-ink pt-4 grid grid-cols-2 gap-2">
          <Link
            href={currentCourse ? navHref(locale, "/app/profile", currentCourse.slug) : withLocale(locale, "/app/profile")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-white px-3 py-2 text-xs font-black text-ink"
          >
            <User className="size-4" />
            {t.profile}
          </Link>
          <Link
            href={currentCourse ? navHref(locale, "/app/billing", currentCourse.slug) : withLocale(locale, "/app/billing")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-white px-3 py-2 text-xs font-black text-ink"
          >
            <CreditCard className="size-4" />
            {t.billing}
          </Link>
        </div>
      )}
    </aside>
  );
}

function LiveAppSidebar({ locale, navigation }: { locale: Locale; navigation: AppNavigationData }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const liveNavigation = useQuery(api.courses.getAppNavigation, isAuthenticated ? {} : "skip") as LiveNavigationResult;
  const resolvedNavigation = useMemo(
    () => navigationFromLive(liveNavigation, navigation, locale),
    [liveNavigation, locale, navigation],
  );
  const authState = isLoading ? "loading" : isAuthenticated ? "authenticated" : "anonymous";

  const notificationCounts = useQuery(
    api.notifications.getCommunityNotificationCounts,
    isAuthenticated ? {} : "skip"
  );
  const communityBadge = notificationCounts?.total ?? 0;

  return (
    <AppSidebarContent
      locale={locale}
      navigation={resolvedNavigation}
      source={liveNavigation ? "live" : "server"}
      authState={authState}
      profileData={liveNavigation?.profile}
      communityBadge={communityBadge}
    />
  );
}

export function AppSidebar({
  locale,
  navigation,
  hasConvex,
}: {
  locale: Locale;
  navigation: AppNavigationData;
  hasConvex: boolean;
}) {
  if (!hasConvex) {
    return <AppSidebarContent locale={locale} navigation={navigation} />;
  }

  return <LiveAppSidebar locale={locale} navigation={navigation} />;
}
