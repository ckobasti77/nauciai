"use client";

import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Crown,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Lock,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Shield,
  ShieldCheck,
  User,
  LogOut,
  X,
  ArrowUpRight,
} from "lucide-react";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { gsap } from "gsap";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

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
import { BrandMark, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import {
  APP_SIDEBAR_COOKIE,
  APP_SIDEBAR_KEYBOARD_STEP,
  APP_SIDEBAR_MAX_WIDTH,
  APP_SIDEBAR_RAIL_WIDTH,
  type AppSidebarPreferences,
  preferencesFromDraggedWidth,
  serializeAppSidebarPreferences,
} from "@/lib/app-sidebar-preferences";
import type { AppCourseNav, AppLessonNav, AppLessonPartNav, AppNavigationData } from "@/lib/app-navigation";
import { primaryCourseSlug } from "@/lib/content";
import { dictionary, localized, type Locale, withLocale } from "@/lib/i18n";

function dashboardHref(locale: Locale) {
  return withLocale(locale, "/app");
}

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
  const currentStatus =
    currentCourse.status !== "published"
      ? locale === "sr"
        ? "Skica"
        : "Draft"
      : currentCourse.hasAccess || isAdmin
        ? locale === "sr"
          ? "Aktivan kurs"
          : "Active course"
        : locale === "sr"
          ? "Zaključan"
          : "Locked";

  return (
    <div className="sidebar-reveal relative mt-5 lg:mt-8">
      <div className="flex items-center gap-2">
        <motion.button
          type="button"
          onClick={() => setOpen((value) => !value)}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          aria-expanded={open}
          className="flex min-h-[4.5rem] min-w-0 flex-1 items-center justify-between gap-3 rounded-[16px] border-2 border-ink bg-white p-2 text-left text-sm font-black text-ink shadow-[4px_4px_0_0_rgba(14,49,88,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[12px] border-2 border-ink bg-yellow shadow-[2px_2px_0_0_rgba(14,49,88,0.12)]">
              <GraduationCap className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate">{localized(currentCourse.title, locale)}</span>
              <span className="mt-1 inline-flex items-center rounded-full bg-ink px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-white">
                {currentStatus}
              </span>
            </span>
          </span>
          <ChevronDown className={cn("size-5 shrink-0 transition", open && "rotate-180")} />
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
            className="relative z-20 mt-3 rounded-[16px] border-2 border-ink bg-white p-3 shadow-[6px_6px_0_0_rgba(14,49,88,0.18)]"
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">
                  {locale === "sr" ? "Tvoje učenje" : "Your learning"}
                </p>
                <p className="mt-0.5 text-sm font-black text-ink">
                  {locale === "sr" ? "Izaberi kurs" : "Choose a course"}
                </p>
              </div>
              <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-[10px] font-black text-muted">
                {courses.length} {locale === "sr" ? "kursa" : "courses"}
              </span>
            </div>
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
                      "group relative overflow-hidden rounded-[16px] border-2 p-3 pr-11 transition",
                      active ? "border-ink bg-yellow/35 shadow-[2px_2px_0_0_rgba(14,49,88,0.12)]" : "border-line bg-paper hover:border-ink/45 hover:bg-white",
                    )}
                  >
                    {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-yellow" /> : null}
                    <div className="sidebar-action-row flex items-center gap-1">
                      {comingSoon ? (
                        <div className="flex min-w-0 flex-1 items-center gap-3 text-sm font-black text-muted">
                          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-white">
                            <GraduationCap className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-ink">{localized(course.title, locale)}</span>
                            <span className="mt-1 inline-flex rounded-full border border-line bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-muted">
                              {statusLabel}
                            </span>
                          </span>
                        </div>
                      ) : (
                        <Link
                          href={courseHref(locale, course.slug)}
                          onClick={() => setOpen(false)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[10px] text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-ink/15 bg-white">
                            {locked ? <Lock className="size-4" /> : <GraduationCap className="size-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{localized(course.title, locale)}</span>
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-muted">
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
                      <div className="mt-3 border-t border-ink/10 pt-3">
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
  initiallyOpen = false,
}: {
  locale: Locale;
  currentCourse: AppCourseNav;
  currentLessonSlug?: string;
  isAdmin: boolean;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(currentLessonSlug) || initiallyOpen);
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

function RailAction({
  label,
  icon,
  active = false,
  badge = 0,
  href,
  expanded,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  badge?: number;
  href?: string;
  expanded?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "group relative flex size-12 items-center justify-center rounded-full border-2 text-ink transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
    active ? "border-ink bg-yellow shadow-[3px_3px_0_rgba(14,49,88,0.16)]" : "border-transparent bg-white hover:border-ink hover:bg-yellow/25",
  );
  const content = (
    <>
      {active ? <span aria-hidden="true" className="absolute -left-[15px] h-7 w-1.5 rounded-full bg-yellow ring-2 ring-ink" /> : null}
      {icon}
      {badge > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-red-600 px-1 text-[9px] font-black text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-[calc(100%+12px)] z-[80] whitespace-nowrap rounded-full border-2 border-ink bg-white px-3 py-1.5 text-xs font-black text-ink opacity-0 shadow-[4px_4px_0_rgba(14,49,88,0.14)] transition group-hover:opacity-100 group-focus-visible:opacity-100",
          expanded && "hidden",
        )}
      >
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} aria-expanded={expanded} onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function SidebarRoleBadge({
  role,
  plan,
  locale,
  collapsed = false,
}: {
  role?: string;
  plan?: string;
  locale: Locale;
  collapsed?: boolean;
}) {
  const normalizedRole = role ?? "student";
  const resolvedPlan = plan ?? (
    normalizedRole === "admin"
      ? "admin"
      : normalizedRole === "moderator"
        ? "moderator"
        : normalizedRole === "pro_student"
          ? "pro"
          : "free"
  );

  const label =
    resolvedPlan === "admin"
      ? "Administrator"
      : resolvedPlan === "moderator"
        ? "Moderator"
        : resolvedPlan === "pro"
          ? (locale === "sr" ? "Pro plan" : "Pro plan")
          : resolvedPlan === "lite"
            ? (locale === "sr" ? "Lite plan" : "Lite plan")
            : (locale === "sr" ? "Free plan" : "Free plan");

  const RoleIcon =
    resolvedPlan === "admin"
      ? ShieldCheck
      : resolvedPlan === "moderator"
        ? Shield
        : resolvedPlan === "pro"
          ? Crown
          : resolvedPlan === "lite"
            ? GraduationCap
            : BookOpen;

  if (collapsed) {
    return (
      <span
        role="status"
        aria-label={`${locale === "sr" ? "Uloga" : "Role"}: ${label}`}
        title={label}
        className={cn(
          "flex size-9 items-center justify-center rounded-full border-2 border-ink text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.12)]",
          resolvedPlan === "admin" && "bg-yellow",
          resolvedPlan === "moderator" && "bg-ink text-white",
          resolvedPlan === "pro" && "bg-[#dfc4ff]",
          resolvedPlan === "lite" && "bg-[#d1e5ff]",
          resolvedPlan === "free" && "bg-[#ffeed1]",
        )}
      >
        <RoleIcon className="size-4" />
      </span>
    );
  }

  const showUpgrade = resolvedPlan === "free" || resolvedPlan === "lite";

  const badgeContent = (
    <div
      className={cn(
        "flex w-fit items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-1 text-[10px] font-black uppercase leading-none tracking-[0.04em] text-ink transition shadow-[2px_2px_0_0_rgba(14,49,88,0.12)] hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        resolvedPlan === "admin" && "bg-yellow hover:bg-yellow/90",
        resolvedPlan === "moderator" && "bg-ink text-white hover:bg-ink/90",
        resolvedPlan === "pro" && "bg-[#dfc4ff] hover:bg-[#d0a7ff]",
        resolvedPlan === "lite" && "bg-[#d1e5ff] hover:bg-[#badaff]",
        resolvedPlan === "free" && "bg-[#ffeed1] hover:bg-[#ffdca3]",
      )}
    >
      <RoleIcon className="size-3.5" />
      <span>{label}</span>
    </div>
  );

  return (
    <div className="sidebar-reveal mt-3 flex items-center gap-2">
      <Link href={`${withLocale(locale)}#pricing`} className="focus:outline-none">
        {badgeContent}
      </Link>
      
      {showUpgrade && (
        <Link
          href={`${withLocale(locale)}#pricing`}
          className="flex items-center gap-1 rounded-full border-2 border-ink bg-[#10b981] px-2.5 py-1 text-[10px] font-black uppercase leading-none tracking-[0.04em] text-white transition shadow-[2px_2px_0_0_rgba(14,49,88,0.12)] hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <ArrowUpRight className="size-3 shrink-0" />
          <span>{locale === "sr" ? "Unapredi" : "Upgrade"}</span>
        </Link>
      )}
    </div>
  );
}

function AppSidebarContent({
  locale,
  navigation,
  initialPreferences,
  source = "server",
  authState = "unknown",
  profileData,
  communityBadge = 0,
  accountBadge = 0,
  profileComplete = true,
}: {
  locale: Locale;
  navigation: AppNavigationData;
  initialPreferences: AppSidebarPreferences;
  source?: "server" | "live";
  authState?: "loading" | "authenticated" | "anonymous" | "unknown";
  profileData?: { name?: string; username?: string; email?: string; avatarUrl?: string } | null;
  communityBadge?: number;
  accountBadge?: number;
  profileComplete?: boolean;
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

  const [sidebarPreferences, setSidebarPreferences] = useState(initialPreferences);
  const sidebarPreferencesRef = useRef(sidebarPreferences);
  const [isResizing, setIsResizing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railFlyout, setRailFlyout] = useState<"course" | "lessons" | "profile" | null>(null);
  const railLayerRef = useRef<HTMLDivElement>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { signOut } = useAuthActions();
  const router = useRouter();

  useEffect(() => {
    sidebarPreferencesRef.current = sidebarPreferences;
  }, [sidebarPreferences]);

  const persistSidebarPreferences = useCallback((preferences: AppSidebarPreferences) => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${APP_SIDEBAR_COOKIE}=${serializeAppSidebarPreferences(preferences)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  }, []);

  const applySidebarPreferences = useCallback(
    (preferences: AppSidebarPreferences, persist = true) => {
      sidebarPreferencesRef.current = preferences;
      setSidebarPreferences(preferences);
      if (persist) persistSidebarPreferences(preferences);
    },
    [persistSidebarPreferences],
  );

  const toggleSidebar = useCallback(() => {
    const current = sidebarPreferencesRef.current;
    const next = current.collapsed
      ? {
          collapsed: false,
          width: current.lastExpandedWidth,
          lastExpandedWidth: current.lastExpandedWidth,
        }
      : {
          collapsed: true,
          width: APP_SIDEBAR_RAIL_WIDTH,
          lastExpandedWidth: current.width,
        };
    setRailFlyout(null);
    applySidebarPreferences(next);
  }, [applySidebarPreferences]);

  const startSidebarResize = useCallback(
    (startEvent: ReactPointerEvent<HTMLDivElement>) => {
      if (window.innerWidth < 1024) return;
      startEvent.preventDefault();
      startEvent.currentTarget.setPointerCapture?.(startEvent.pointerId);
      const startX = startEvent.clientX;
      const current = sidebarPreferencesRef.current;
      const startWidth = current.collapsed ? APP_SIDEBAR_RAIL_WIDTH : current.width;
      setIsResizing(true);
      setRailFlyout(null);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const next = preferencesFromDraggedWidth(startWidth + moveEvent.clientX - startX, sidebarPreferencesRef.current);
        applySidebarPreferences(next, false);
      };

      const finishResize = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishResize);
        window.removeEventListener("pointercancel", finishResize);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setIsResizing(false);
        persistSidebarPreferences(sidebarPreferencesRef.current);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", finishResize, { once: true });
      window.addEventListener("pointercancel", finishResize, { once: true });
    },
    [applySidebarPreferences, persistSidebarPreferences],
  );

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const current = sidebarPreferencesRef.current;
      let nextWidth: number | null = null;
      if (event.key === "ArrowLeft") nextWidth = (current.collapsed ? APP_SIDEBAR_RAIL_WIDTH : current.width) - APP_SIDEBAR_KEYBOARD_STEP;
      if (event.key === "ArrowRight") nextWidth = (current.collapsed ? APP_SIDEBAR_RAIL_WIDTH : current.width) + APP_SIDEBAR_KEYBOARD_STEP;
      if (event.key === "Home") nextWidth = APP_SIDEBAR_RAIL_WIDTH;
      if (event.key === "End") nextWidth = APP_SIDEBAR_MAX_WIDTH;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (nextWidth === null) return;
      event.preventDefault();
      applySidebarPreferences(preferencesFromDraggedWidth(nextWidth, current));
    },
    [applySidebarPreferences, toggleSidebar],
  );

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

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sidebar = rootRef.current;
    const focusable = Array.from(
      sidebar?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
    ).filter((element) => element.offsetParent !== null);
    focusable[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    function handleBreakpointChange(event: MediaQueryListEvent) {
      if (event.matches) setMobileOpen(false);
    }
    desktopQuery.addEventListener("change", handleBreakpointChange);
    return () => desktopQuery.removeEventListener("change", handleBreakpointChange);
  }, []);

  useEffect(() => {
    if (!railFlyout) return;
    function handlePointerDown(event: PointerEvent) {
      if (!railLayerRef.current?.contains(event.target as Node)) setRailFlyout(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setRailFlyout(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [railFlyout]);

  const profileName = profileData?.name || "Student";
  const profileUsername = profileData?.username ? `@${profileData.username}` : profileData?.email || "";
  const profileInitials = profileName.split(/\s+/).map((part: string) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "AI";
  const profileAvatar = profileData?.avatarUrl;
  const profileIncomplete = !profileComplete || !profileData?.username;
  const settingsLabel = locale === "sr" ? "Podešavanja" : "Settings";
  const dashboardActive = pathname === withLocale(locale, "/app") && !searchParams.get("course");
  const communityActive = pathname === withLocale(locale, "/app/community") || pathname.includes("/app/community/");
  const sidebarWidth = sidebarPreferences.collapsed ? APP_SIDEBAR_RAIL_WIDTH : sidebarPreferences.width;
  const sidebarStyle = { "--app-sidebar-width": `${sidebarWidth}px` } as CSSProperties;

  return (
    <>
      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b-2 border-ink bg-white px-4 lg:hidden">
        <BrandMark href={withLocale(locale)} label={t.appName} />
        <button
          type="button"
          aria-label={locale === "sr" ? "Otvori navigaciju" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="inline-flex size-11 items-center justify-center border-2 border-ink bg-yellow text-ink shadow-[3px_3px_0_rgba(14,49,88,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Menu className="size-5" />
        </button>
      </header>
      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={cn(
          "pointer-events-none fixed inset-0 z-40 bg-ink/45 opacity-0 backdrop-blur-[2px] transition-opacity lg:hidden",
          mobileOpen && "pointer-events-auto opacity-100",
        )}
      />
    <aside
      ref={rootRef}
      data-sidebar-source={source}
      data-sidebar-auth={authState}
      data-sidebar-role={navigation.role ?? "none"}
      data-sidebar-admin={isAdmin ? "true" : "false"}
      data-collapsed={sidebarPreferences.collapsed ? "true" : "false"}
      data-resizing={isResizing ? "true" : "false"}
      style={sidebarStyle}
      onClickCapture={(event) => {
        if ((event.target as Element).closest("a")) {
          setMobileOpen(false);
          setRailFlyout(null);
        }
      }}
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(336px,calc(100vw_-_32px))] min-w-0 -translate-x-full flex-col border-r-2 border-ink bg-white px-4 py-4 shadow-[18px_0_45px_rgba(14,49,88,0.18)] transition-transform duration-200",
        mobileOpen && "translate-x-0",
        "lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:w-[var(--app-sidebar-width)] lg:shrink-0 lg:translate-x-0 lg:overflow-visible lg:px-5 lg:py-7 lg:shadow-none",
        !isResizing && "lg:transition-[width] lg:duration-200",
      )}
    >
      <div className={cn("flex h-full min-w-0 flex-col", sidebarPreferences.collapsed && "lg:hidden")}>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <div className="sidebar-reveal flex items-center justify-between gap-4">
          <BrandMark href={withLocale(locale)} label={t.appName} />
          <button
            type="button"
            aria-label={locale === "sr" ? "Kolapsiraj sidebar" : "Collapse sidebar"}
            onClick={toggleSidebar}
            className="hidden size-11 shrink-0 items-center justify-center border-2 border-ink bg-white text-ink transition hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:inline-flex"
          >
            <PanelLeftClose className="size-5" />
          </button>
          <button
            type="button"
            aria-label={locale === "sr" ? "Zatvori navigaciju" : "Close navigation"}
            onClick={() => setMobileOpen(false)}
            className="inline-flex size-11 shrink-0 items-center justify-center border-2 border-ink bg-white text-ink lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>
        <SidebarRoleBadge role={navigation.role} plan={navigation.plan} locale={locale} />
        {currentCourse ? (
          <CourseSwitcher locale={locale} courses={courses} currentCourse={currentCourse} isAdmin={isAdmin} />
        ) : null}
        {currentCourse ? (
          <nav className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col">
            <NavLink
              href={dashboardHref(locale)}
              active={pathname === withLocale(locale, "/app") && !searchParams.get("course")}
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
                  className={cn("flex min-h-10 items-center gap-3 px-3 py-2 text-[13px] font-black uppercase text-ink transition font-extrabold", profileIncomplete ? "bg-amber-50 hover:bg-amber-100" : "bg-white hover:bg-yellow/35")}
                >
                  {profileIncomplete ? <CircleAlert className="size-4 shrink-0 text-amber-700" /> : <User className="size-4 shrink-0" />}
                  <span>{settingsLabel}</span>
                  {profileIncomplete ? <span className="ml-auto rounded-full border border-amber-500 bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-900">{locale === "sr" ? "Upozorenje" : "Warning"}</span> : null}
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
            onClick={() => setProfileMenuOpen((value) => !value)}
            className="relative flex w-full items-center gap-3 rounded-[12px] border-2 border-ink bg-white p-2 text-left text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] transition hover:bg-yellow/15"
          >
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-yellow text-xs font-black">
              {profileAvatar ? (
                /* Avatar URLs are user-provided at runtime and intentionally avoid Next image host restrictions. */
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{profileInitials}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black leading-tight text-ink">{profileName}</p>
              <p className="mt-0.5 truncate text-[10px] font-semibold leading-normal text-muted/80">{profileUsername}</p>
            </div>
            <ChevronDown className={cn("size-4 shrink-0 transition-transform text-muted", profileMenuOpen && "rotate-180")} />
            {accountBadge > 0 ? <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-red-600 px-1 text-[10px] font-black text-white">{accountBadge > 99 ? "99+" : accountBadge}</span> : null}
          </button>
        </div>
      )}

      {/* Mobile profile link */}
      {profileData && (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t-2 border-ink pt-4 lg:hidden">
          <Link
            href={currentCourse ? navHref(locale, "/app/profile", currentCourse.slug) : withLocale(locale, "/app/profile")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-white px-3 py-2 text-xs font-black text-ink"
          >
            {profileIncomplete ? <CircleAlert className="size-4 text-amber-700" /> : <User className="size-4" />}
            {settingsLabel}
          </Link>
          <Link
            href={currentCourse ? navHref(locale, "/app/billing", currentCourse.slug) : withLocale(locale, "/app/billing")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-white px-3 py-2 text-xs font-black text-ink"
          >
            <CreditCard className="size-4" />
            {t.billing}
          </Link>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.push(withLocale(locale, "/sign-in"));
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-ink px-3 py-2 text-xs font-black text-white"
          >
            <LogOut className="size-4" />
            {locale === "sr" ? "Odjavi se" : "Sign out"}
          </button>
        </div>
      )}
      </div>

      <div ref={railLayerRef} className={cn("relative hidden h-full w-full flex-col items-center", sidebarPreferences.collapsed && "lg:flex")}>
        <button
          type="button"
          aria-label={locale === "sr" ? "Proširi sidebar" : "Expand sidebar"}
          onClick={toggleSidebar}
          className="inline-flex size-11 items-center justify-center border-2 border-ink bg-yellow text-ink shadow-[3px_3px_0_rgba(14,49,88,0.16)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <PanelLeftOpen className="size-5" />
        </button>
        <Link href={withLocale(locale)} aria-label={t.appName} className="mt-4 inline-flex size-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          <Image src="/images/logos/logo-emblem.png" alt="" width={160} height={160} className="size-10 object-contain" priority />
        </Link>

        <div className="my-4 h-px w-8 bg-line" />
        <nav className="flex flex-col items-center gap-2" aria-label={locale === "sr" ? "Glavna navigacija" : "Main navigation"}>
          <SidebarRoleBadge role={navigation.role} plan={navigation.plan} locale={locale} collapsed />
          {currentCourse ? (
            <RailAction label={localized(currentCourse.title, locale)} icon={<GraduationCap className="size-5" />} expanded={railFlyout === "course"} onClick={() => setRailFlyout((value) => value === "course" ? null : "course")} />
          ) : null}
          <RailAction href={dashboardHref(locale)} label="Dashboard" icon={<LayoutDashboard className="size-5" />} active={dashboardActive} />
          {currentCourse ? (
            <RailAction label={t.lessons} icon={<BookOpen className="size-5" />} active={Boolean(params.lessonSlug)} expanded={railFlyout === "lessons"} onClick={() => setRailFlyout((value) => value === "lessons" ? null : "lessons")} />
          ) : null}
          {currentCourse ? (
            <RailAction href={communityHref(locale, currentCourse.slug)} label={t.community} icon={<MessageCircle className="size-5" />} active={communityActive} badge={communityBadge} />
          ) : null}
        </nav>

        {railFlyout && railFlyout !== "profile" && currentCourse ? (
          <div className={cn("absolute left-[calc(100%_+_32px)] z-[70] w-[380px] max-w-[calc(100vw_-_112px)] rounded-[16px] border-2 border-ink bg-white p-4 text-ink shadow-[10px_10px_0_rgba(14,49,88,0.16)]", railFlyout === "course" ? "top-20" : "top-40 max-h-[calc(100vh_-_190px)] overflow-y-auto overflow-x-hidden")}>
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <p className="text-sm font-black">{railFlyout === "course" ? (locale === "sr" ? "Izaberi smer" : "Choose track") : t.lessons}</p>
              <button type="button" aria-label={locale === "sr" ? "Zatvori" : "Close"} onClick={() => setRailFlyout(null)} className="inline-flex size-9 items-center justify-center border border-line bg-paper text-ink"><X className="size-4" /></button>
            </div>
            {railFlyout === "course" ? (
              <CourseSwitcher locale={locale} courses={courses} currentCourse={currentCourse} isAdmin={isAdmin} />
            ) : (
              <div className="mt-3"><LessonsAccordion locale={locale} currentCourse={currentCourse} currentLessonSlug={params.lessonSlug} isAdmin={isAdmin} initiallyOpen /></div>
            )}
          </div>
        ) : null}

        {profileData ? (
          <div className="relative mt-auto">
            {railFlyout === "profile" ? (
              <div className="absolute bottom-0 left-[calc(100%_+_36px)] z-[70] w-72 rounded-[16px] border-2 border-ink bg-white p-3 text-ink shadow-[10px_10px_0_rgba(14,49,88,0.16)]">
                <div className="mb-3 min-w-0 border-b border-line pb-3">
                  <p className="truncate text-sm font-black">{profileName}</p>
                  <p className="truncate text-xs font-bold text-muted">{profileUsername}</p>
                </div>
                <Link href={currentCourse ? navHref(locale, "/app/profile", currentCourse.slug) : withLocale(locale, "/app/profile")} className={cn("flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-black", profileIncomplete ? "bg-amber-50 text-amber-900" : "hover:bg-yellow/25")}>
                  {profileIncomplete ? <CircleAlert className="size-4" /> : <User className="size-4" />} {settingsLabel}
                </Link>
                <Link href={currentCourse ? navHref(locale, "/app/billing", currentCourse.slug) : withLocale(locale, "/app/billing")} className="flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-black hover:bg-yellow/25"><CreditCard className="size-4" /> {t.billing}</Link>
                <button type="button" onClick={async () => { await signOut(); router.push(withLocale(locale, "/sign-in")); }} className="mt-2 flex min-h-11 w-full items-center gap-3 bg-ink px-3 text-sm font-black text-white"><LogOut className="size-4" /> {locale === "sr" ? "Odjavi se" : "Sign out"}</button>
              </div>
            ) : null}
            <button type="button" aria-label={profileName} aria-expanded={railFlyout === "profile"} onClick={() => setRailFlyout((value) => value === "profile" ? null : "profile")} className="relative flex size-12 items-center justify-center overflow-visible rounded-full border-2 border-ink bg-yellow text-xs font-black shadow-[3px_3px_0_rgba(14,49,88,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              <span className="flex size-full items-center justify-center overflow-hidden rounded-full">
                {profileAvatar ? (
                  /* Avatar URLs are user-provided at runtime and intentionally avoid Next image host restrictions. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profileAvatar} alt="" className="size-full object-cover" />
                ) : profileInitials}
              </span>
              {accountBadge > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-red-600 px-1 text-[9px] text-white">{accountBadge > 99 ? "99+" : accountBadge}</span> : null}
            </button>
          </div>
        ) : null}
      </div>

      <div
        role="separator"
        aria-label={locale === "sr" ? "Promeni širinu sidebar-a" : "Resize sidebar"}
        aria-orientation="vertical"
        aria-valuemin={APP_SIDEBAR_RAIL_WIDTH}
        aria-valuemax={APP_SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={startSidebarResize}
        onKeyDown={handleResizeKeyDown}
        className="group absolute -right-2 top-0 z-[75] hidden h-full w-4 cursor-col-resize items-center justify-center bg-transparent focus-visible:outline-none lg:flex"
      >
        <span className="h-14 w-1 rounded-full bg-line transition group-hover:w-1.5 group-hover:bg-yellow group-focus-visible:w-1.5 group-focus-visible:bg-yellow group-focus-visible:ring-2 group-focus-visible:ring-ink" />
      </div>
    </aside>
    </>
  );
}

function LiveAppSidebar({
  locale,
  navigation,
  initialPreferences,
}: {
  locale: Locale;
  navigation: AppNavigationData;
  initialPreferences: AppSidebarPreferences;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const liveNavigation = useQuery(api.courses.getAppNavigation, isAuthenticated ? {} : "skip") as LiveNavigationResult;
  const resolvedNavigation = useMemo(
    () => navigationFromLive(liveNavigation, navigation, locale),
    [liveNavigation, locale, navigation],
  );
  const authState = isLoading ? "loading" : isAuthenticated ? "authenticated" : "anonymous";

  const notificationSummary = useQuery(
    api.notifications.getUserNotificationSummary,
    isAuthenticated ? {} : "skip"
  );
  const communityBadge = notificationSummary?.community ?? 0;
  const accountBadge = notificationSummary?.profileIncomplete ?? 0;
  const profileStatus = useQuery(api.profiles.getViewerProfileStatus, isAuthenticated ? {} : "skip");

  return (
    <AppSidebarContent
      locale={locale}
      navigation={resolvedNavigation}
      initialPreferences={initialPreferences}
      source={liveNavigation ? "live" : "server"}
      authState={authState}
      profileData={liveNavigation?.profile}
      communityBadge={communityBadge}
      accountBadge={accountBadge}
      profileComplete={profileStatus?.complete ?? false}
    />
  );
}

export function AppSidebar({
  locale,
  navigation,
  hasConvex,
  initialPreferences,
}: {
  locale: Locale;
  navigation: AppNavigationData;
  hasConvex: boolean;
  initialPreferences: AppSidebarPreferences;
}) {
  if (!hasConvex) {
    return <AppSidebarContent locale={locale} navigation={navigation} initialPreferences={initialPreferences} />;
  }

  return <LiveAppSidebar locale={locale} navigation={navigation} initialPreferences={initialPreferences} />;
}
