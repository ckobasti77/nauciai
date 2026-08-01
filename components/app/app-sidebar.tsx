"use client";

import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Compass,
  CreditCard,
  Crown,
  GraduationCap,
  LayoutDashboard,
  Lock,
  Menu,
  MessageCircle,
  MessagesSquare,
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
import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter } from "next/navigation";
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
import { publicProfilePath } from "@/lib/profile-links";
import type { AppCourseNav, AppNavigationData } from "@/lib/app-navigation";
import { primaryCourseSlug } from "@/lib/content";
import { dictionary, localized, type Locale, withLocale } from "@/lib/i18n";

const AddCourseAction = dynamic(() => import("@/components/app/admin-inline-actions").then((m) => m.AddCourseAction), { ssr: false });
const EditCourseAction = dynamic(() => import("@/components/app/admin-inline-actions").then((m) => m.EditCourseAction), { ssr: false });

/**
 * Width at which the <aside> stops being a modal drawer and becomes the persistent
 * sidebar. Must track the `md:` prefixes on the sidebar shell classes below. This is
 * deliberately NOT the same threshold as the pointer-resize handle, which stays at 1024px.
 */
const DESKTOP_SIDEBAR_MEDIA_QUERY = "(min-width: 768px)";

function dashboardHref(locale: Locale) {
  return withLocale(locale, "/app");
}

function courseHref(locale: Locale, courseSlug: string) {
  return withLocale(locale, `/app/courses/${courseSlug}`);
}

function trackHref(locale: Locale, trackSlug: string) {
  return withLocale(locale, `/app/tracks/${trackSlug}`);
}

function communityHref(locale: Locale, courseSlug: string) {
  return `${withLocale(locale, "/app/community/discussions")}?scope=course&course=${courseSlug}`;
}

function lessonHref(locale: Locale, courseSlug: string, lessonSlug: string) {
  return withLocale(locale, `/app/courses/${courseSlug}/lessons/${lessonSlug}`);
}

function nextSortOrder(items: Array<{ sortOrder: number }>) {
  return items.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10;
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
          kind: "text" | "image" | "video" | "file";
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
  routeTrackSlug?: string,
) {
  const slug = routeCourseSlug ?? primaryCourseSlug;
  return courses.find((course) => course.slug === slug) ?? courses.find((course) => course.trackSlug === routeTrackSlug) ?? courses[0];
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
    <div className="sidebar-reveal relative mt-5 md:mt-8">
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
    <motion.div whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} className="relative min-w-0">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          // Ternary, not base+append: cn() is a plain join, so both branches would otherwise
          // be emitted and the winner decided by generated-CSS order.
          "inline-flex min-h-11 min-w-0 items-center justify-between rounded-full border-2 px-3 py-2 text-sm font-extrabold text-ink transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:justify-start md:w-full",
          active
            ? "border-ink bg-yellow shadow-[3px_3px_0_0_rgba(14,49,88,0.14)]"
            : "border-transparent bg-transparent hover:border-ink hover:bg-yellow/25",
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
      {active ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-1 top-1/2 z-10 h-6 w-1.5 -translate-y-1/2 rounded-full bg-ink"
        />
      ) : null}
    </motion.div>
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
  const comingSoon = isCourseComingSoon(currentCourse, isAdmin);
  const locked = isCourseLocked(currentCourse, isAdmin);
  const directLessons = currentCourse.modules
    .flatMap((module) => module.lessons)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const totalLessons = directLessons.length;

  return (
    <div className="sidebar-reveal col-span-2 sm:col-span-3 md:col-span-1">
      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-3 rounded-full border-2 px-3 py-2 text-sm font-extrabold text-ink transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:justify-start",
          // This disclosure *contains* the current page rather than being it, so it stays
          // distinguishable from an active NavLink.
          currentLessonSlug
            ? "border-ink bg-yellow/40"
            : "border-transparent bg-transparent hover:border-ink hover:bg-yellow/25",
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
                    {locale === "sr" ? "Admin može odmah da doda lekcije." : "Admins can add lessons now."}
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
              directLessons.length ? directLessons.map((lesson) => {
                const active = currentLessonSlug === lesson.slug;
                return (
                  <motion.div layout key={lesson.id ?? lesson.slug} className="relative">
                    <Link href={lessonHref(locale, currentCourse.slug, lesson.slug)} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-2 rounded-[8px] border-2 bg-white px-3 text-sm font-black text-ink", active ? "border-ink bg-yellow" : "border-line hover:border-ink")}>
                      <PlayCircle className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{localized(lesson.title, locale)}</span>{isAdmin && !lesson.isPublished ? <span className="rounded-full border border-ink bg-paper px-2 py-0.5 text-[9px] uppercase">Nacrt</span> : null}
                    </Link>
                  </motion.div>
                );
              }) : <p className="rounded-[8px] border-2 border-dashed border-line bg-paper p-3 text-xs font-black text-muted">{locale === "sr" ? "Kurs još nema lekcije." : "This course has no lessons yet."}</p>
            )}
            {isAdmin && currentCourse.id ? (
              <div className="flex flex-wrap gap-2 border-t-2 border-line pt-2">
                <Link href={withLocale(locale, "/app/admin")} className="inline-flex min-h-9 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black"><CircleAlert className="size-3.5" />{locale === "sr" ? "Upravljaj lekcijama" : "Manage lessons"}</Link>
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
      <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={className}>
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

/**
 * Phone-width primary navigation. Height is a contract with the bottom padding on
 * <main> in app-shell.tsx — changing min-h-14 there means changing it here too.
 * Avoids any class containing "border" on the tab links, because globals.css turns
 * bordered anchors into pills.
 */
function AppBottomNav({
  locale,
  currentCourse,
  dashboardActive,
  courseActive,
  communityActive,
  messagesActive,
  communityBadge,
  messagesBadge,
  hidden,
}: {
  locale: Locale;
  currentCourse?: AppCourseNav;
  dashboardActive: boolean;
  courseActive: boolean;
  communityActive: boolean;
  messagesActive: boolean;
  communityBadge: number;
  messagesBadge: number;
  hidden: boolean;
}) {
  const t = dictionary[locale];
  const tabs = [
    {
      key: "dashboard",
      href: dashboardHref(locale),
      icon: LayoutDashboard,
      // Literal, matching the sidebar NavLink for the same destination.
      label: "Dashboard",
      active: dashboardActive,
      badge: 0,
    },
    currentCourse
      ? {
          key: "course",
          href: courseHref(locale, currentCourse.slug),
          icon: GraduationCap,
          // Was labelled "Lekcije" while linking to course detail. The destination was
          // right; the label was the lie.
          label: locale === "sr" ? "Kurs" : "Course",
          active: courseActive,
          badge: 0,
        }
      : {
          key: "courses",
          href: dashboardHref(locale),
          icon: GraduationCap,
          label: locale === "sr" ? "Kursevi" : "Courses",
          active: false,
          badge: 0,
        },
    {
      key: "community",
      href: currentCourse
        ? communityHref(locale, currentCourse.slug)
        : withLocale(locale, "/app/community/discussions"),
      icon: MessageCircle,
      label: t.community,
      active: communityActive,
      badge: communityBadge,
    },
    {
      key: "messages",
      href: withLocale(locale, "/app/messages"),
      icon: MessagesSquare,
      label: locale === "sr" ? "Poruke" : "Messages",
      active: messagesActive,
      badge: messagesBadge,
    },
  ];

  return (
    <nav
      data-app-bottom-nav=""
      aria-label={locale === "sr" ? "Brza navigacija" : "Quick navigation"}
      inert={hidden}
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_18px_rgba(14,49,88,0.14)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {tabs.map(({ key, href, icon: Icon, label, active, badge }) => (
          <li key={key} className="min-w-0">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 pb-1.5 pt-2 text-[10px] font-black uppercase tracking-[0.04em] transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
                active ? "text-ink" : "text-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-4 top-0 h-1 rounded-b-full",
                  active ? "bg-yellow" : "bg-transparent",
                )}
              />
              <span
                className={cn(
                  "relative grid size-8 place-items-center rounded-full transition",
                  active && "bg-yellow ring-2 ring-ink",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {badge > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-ink bg-red-600 px-1 text-[9px] font-black leading-none text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate text-center">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
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
  messagesBadge = 0,
  accountBadge = 0,
  profileComplete = true,
  emailVerificationRequired = false,
  passwordRecommended = false,
}: {
  locale: Locale;
  navigation: AppNavigationData;
  initialPreferences: AppSidebarPreferences;
  source?: "server" | "live";
  authState?: "loading" | "authenticated" | "anonymous" | "unknown";
  profileData?: { name?: string; username?: string; email?: string; avatarUrl?: string } | null;
  communityBadge?: number;
  messagesBadge?: number;
  accountBadge?: number;
  profileComplete?: boolean;
  emailVerificationRequired?: boolean;
  passwordRecommended?: boolean;
}) {
  const pathname = usePathname();
  const params = useParams<{ courseSlug?: string; lessonSlug?: string; trackSlug?: string }>();
  const t = dictionary[locale];
  const courses = navigation.courses;
  const currentCourse = useMemo(
    () => currentCourseFrom(courses, params.courseSlug, params.trackSlug),
    [courses, params.courseSlug, params.trackSlug],
  );
  const isAdmin = navigation.role === "admin";
  const isStaff = isAdmin || navigation.role === "moderator";
  const rootRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const [sidebarPreferences, setSidebarPreferences] = useState(initialPreferences);
  const sidebarPreferencesRef = useRef(sidebarPreferences);
  const [isResizing, setIsResizing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  // Defaults to true (fail-open) on purpose: a false default would ship `inert` on the
  // desktop sidebar in the SSR payload and leave it dead until hydration.
  const [isDesktopSidebar, setIsDesktopSidebar] = useState(true);
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
    const menuButton = mobileMenuButtonRef.current;
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
      // Only reclaim focus if it is still inside the drawer (or nowhere); a link click
      // legitimately moves it onward.
      const active = document.activeElement;
      if (!active || active === document.body || sidebar?.contains(active)) menuButton?.focus();
    };
  }, [mobileOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia(DESKTOP_SIDEBAR_MEDIA_QUERY);
    function sync(matches: boolean) {
      setIsDesktopSidebar(matches);
      if (matches) setMobileOpen(false);
    }
    sync(desktopQuery.matches);
    function handleBreakpointChange(event: MediaQueryListEvent) {
      sync(event.matches);
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
  const hasAccountAdvisory = profileIncomplete || emailVerificationRequired || passwordRecommended;
  const profileLabel = locale === "sr" ? "Profil" : "Profile";
  const profilePath = publicProfilePath(profileData?.username);
  // /app is now only ever the course grid — course detail has its own route — so this is
  // an exclusive match and "Dashboard" means exactly one screen.
  const dashboardActive = pathname === withLocale(locale, "/app");
  const communityActive = pathname === withLocale(locale, "/app/community") || pathname.includes("/app/community/");
  const messagesActive = pathname === withLocale(locale, "/app/messages") || pathname.includes("/app/messages/");
  // Course detail only; a lesson is a deeper node and lights up the Lessons disclosure.
  const courseActive = Boolean(params.courseSlug) && !params.lessonSlug;
  const trackActive = Boolean(params.trackSlug);
  // Optional on AppCourseNav, and never set by the static no-Convex fallback, so the
  // track entry has to be able to not exist.
  const currentTrackSlug = currentCourse?.trackSlug;
  const trackLabel = locale === "sr" ? "Smer" : "Track";
  const sidebarWidth = sidebarPreferences.collapsed ? APP_SIDEBAR_RAIL_WIDTH : sidebarPreferences.width;
  const sidebarStyle = { "--app-sidebar-width": `${sidebarWidth}px` } as CSSProperties;
  // Below the desktop breakpoint the same <aside> behaves as a modal drawer.
  const drawerIsModal = !isDesktopSidebar;
  const navLabel = locale === "sr" ? "Glavna navigacija" : "Main navigation";

  return (
    <>
      <header inert={drawerIsModal && mobileOpen} className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b-2 border-ink bg-white px-4 md:hidden">
        <BrandMark href={withLocale(locale)} label={t.appName} />
        <button
          ref={mobileMenuButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar-drawer"
          onClick={() => setMobileOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 border-2 border-ink bg-yellow px-3.5 text-xs font-black uppercase tracking-[0.06em] text-ink shadow-[3px_3px_0_rgba(14,49,88,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Menu className="size-5" aria-hidden="true" />
          {locale === "sr" ? "Više" : "More"}
        </button>
      </header>
      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={cn(
          "pointer-events-none fixed inset-0 z-40 bg-ink/45 opacity-0 backdrop-blur-[2px] transition-opacity md:hidden",
          mobileOpen && "pointer-events-auto opacity-100",
        )}
      />
    <aside
      ref={rootRef}
      id="app-sidebar-drawer"
      // Only assert dialog semantics while the element actually behaves as one; on desktop
      // `undefined` leaves the native complementary landmark intact.
      role={drawerIsModal ? "dialog" : undefined}
      aria-modal={drawerIsModal && mobileOpen ? true : undefined}
      aria-label={drawerIsModal ? navLabel : undefined}
      inert={drawerIsModal && !mobileOpen}
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
        "md:sticky md:top-0 md:z-30 md:h-screen md:w-[var(--app-sidebar-width)] md:shrink-0 md:translate-x-0 md:overflow-visible md:px-5 md:py-7 md:shadow-none",
        !isResizing && "md:transition-[width] md:duration-200",
      )}
    >
      <div className={cn("flex h-full min-w-0 flex-col", sidebarPreferences.collapsed && "md:hidden")}>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <div className="sidebar-reveal flex items-center justify-between gap-4">
          <BrandMark href={withLocale(locale)} label={t.appName} />
          <button
            type="button"
            aria-label={locale === "sr" ? "Kolapsiraj sidebar" : "Collapse sidebar"}
            onClick={toggleSidebar}
            className="hidden size-11 shrink-0 items-center justify-center border-2 border-ink bg-white text-ink transition hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:inline-flex"
          >
            <PanelLeftClose className="size-5" />
          </button>
          <button
            type="button"
            aria-label={locale === "sr" ? "Zatvori navigaciju" : "Close navigation"}
            onClick={() => setMobileOpen(false)}
            className="inline-flex size-11 shrink-0 items-center justify-center border-2 border-ink bg-white text-ink md:hidden"
          >
            <X className="size-5" />
          </button>
        </div>
        <SidebarRoleBadge role={navigation.role} plan={navigation.plan} locale={locale} />
        {currentCourse ? (
          <CourseSwitcher locale={locale} courses={currentCourse.trackId ? courses.filter((course) => course.trackId === currentCourse.trackId) : courses} currentCourse={currentCourse} isAdmin={isAdmin} />
        ) : null}
        <nav aria-label={navLabel} className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-col">
            <NavLink
              href={dashboardHref(locale)}
              active={dashboardActive}
              icon={LayoutDashboard}
              label="Dashboard"
            />
            {currentTrackSlug ? (
              <NavLink
                href={trackHref(locale, currentTrackSlug)}
                active={trackActive}
                icon={Compass}
                label={trackLabel}
              />
            ) : null}
            {currentCourse ? (
              <NavLink
                href={courseHref(locale, currentCourse.slug)}
                active={courseActive}
                icon={GraduationCap}
                label={locale === "sr" ? "Kurs" : "Course"}
              />
            ) : null}
            {currentCourse ? (
              <LessonsAccordion
                locale={locale}
                currentCourse={currentCourse}
                currentLessonSlug={params.lessonSlug}
                isAdmin={isAdmin}
              />
            ) : null}
            {currentCourse ? (
              <NavLink
                href={communityHref(locale, currentCourse.slug)}
                active={communityActive}
                icon={MessageCircle}
                label={t.community}
                badge={communityBadge}
              />
            ) : null}
            <NavLink
              href={withLocale(locale, "/app/messages")}
              active={messagesActive}
              icon={MessagesSquare}
              label={locale === "sr" ? "Poruke" : "Messages"}
              badge={messagesBadge}
            />
            {isAdmin ? (
              <NavLink
                href={withLocale(locale, "/app/admin")}
                active={pathname === withLocale(locale, "/app/admin")}
                icon={ShieldCheck}
                label={locale === "sr" ? "Admin panel" : "Admin panel"}
              />
            ) : null}
            {isStaff ? (
              <NavLink
                href={withLocale(locale, "/app/admin/chat")}
                active={pathname === withLocale(locale, "/app/admin/chat")}
                icon={Shield}
                label={locale === "sr" ? "Chat sigurnost" : "Chat safety"}
              />
            ) : null}
          </nav>
      </div>

      {/* Bottom Profile Card */}
      {profileData && (
        <div className="relative mt-auto border-t-2 border-ink pt-4 hidden md:block" ref={profileMenuRef}>
          {profileMenuOpen ? (
            <div className="absolute bottom-[calc(100%+0.65rem)] left-0 z-50 w-full rounded-[16px] border-2 border-ink bg-white p-2.5 text-ink shadow-[8px_8px_0_0_rgba(14,49,88,0.14)]">
              <span
                aria-hidden="true"
                className="absolute -bottom-2 left-6 size-4 rotate-45 border-r-2 border-b-2 border-ink bg-white"
              />
              
              <div className="overflow-hidden rounded-[12px] divide-y divide-line/80">
                <Link
                  href={withLocale(locale, profilePath)}
                  onClick={() => setProfileMenuOpen(false)}
                  className={cn(
                    "flex min-h-10 items-center gap-3 px-3 py-2 text-[13px] font-black uppercase text-ink transition font-extrabold",
                    profileIncomplete
                      ? "bg-red-50 hover:bg-red-100"
                      : emailVerificationRequired
                        ? "bg-amber-50 hover:bg-amber-100"
                        : passwordRecommended
                          ? "bg-indigo-50 hover:bg-indigo-100"
                          : "bg-white hover:bg-yellow/35",
                  )}
                >
                  {hasAccountAdvisory ? (
                    <CircleAlert className={cn("size-4 shrink-0", profileIncomplete ? "text-red-700" : emailVerificationRequired ? "text-amber-700" : "text-indigo-700")} />
                  ) : (
                    <User className="size-4 shrink-0" />
                  )}
                  <span>{profileLabel}</span>
                  {accountBadge > 0 ? <span className="ml-auto rounded-full border border-ink bg-white px-2 py-0.5 text-[9px] font-black text-ink">{accountBadge}</span> : null}
                </Link>
                {hasAccountAdvisory ? (
                  <div className="space-y-1.5 bg-white px-2 py-2">
                    {profileIncomplete ? <p className="rounded-full border border-red-400 bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-900">{locale === "sr" ? "Dodaj korisničko ime" : "Add a username"}</p> : null}
                    {emailVerificationRequired ? <p className="rounded-full border border-amber-400 bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-900">{locale === "sr" ? "Verifikuj email za kurseve" : "Verify email for courses"}</p> : null}
                    {passwordRecommended ? <p className="rounded-full border border-indigo-400 bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-900">{locale === "sr" ? "Dodaj opcionu lozinku" : "Add an optional password"}</p> : null}
                  </div>
                ) : null}
                <Link
                  href={withLocale(locale, "/app/billing")}
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
        <div className="mt-4 grid grid-cols-3 gap-2 border-t-2 border-ink pt-4 md:hidden">
          <Link
            href={withLocale(locale, profilePath)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-white px-3 py-2 text-xs font-black text-ink"
          >
            {hasAccountAdvisory ? <CircleAlert className={cn("size-4", profileIncomplete ? "text-red-700" : emailVerificationRequired ? "text-amber-700" : "text-indigo-700")} /> : <User className="size-4" />}
            {profileLabel}
          </Link>
          <Link
            href={withLocale(locale, "/app/billing")}
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

      <div ref={railLayerRef} className={cn("relative hidden h-full w-full flex-col items-center", sidebarPreferences.collapsed && "md:flex")}>
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
          {currentTrackSlug ? (
            <RailAction href={trackHref(locale, currentTrackSlug)} label={trackLabel} icon={<Compass className="size-5" />} active={trackActive} />
          ) : null}
          {currentCourse ? (
            <RailAction href={courseHref(locale, currentCourse.slug)} label={locale === "sr" ? "Kurs" : "Course"} icon={<GraduationCap className="size-5" />} active={courseActive} />
          ) : null}
          {currentCourse ? (
            <RailAction label={t.lessons} icon={<BookOpen className="size-5" />} active={Boolean(params.lessonSlug)} expanded={railFlyout === "lessons"} onClick={() => setRailFlyout((value) => value === "lessons" ? null : "lessons")} />
          ) : null}
          {currentCourse ? (
            <RailAction href={communityHref(locale, currentCourse.slug)} label={t.community} icon={<MessageCircle className="size-5" />} active={communityActive} badge={communityBadge} />
          ) : null}
          <RailAction href={withLocale(locale, "/app/messages")} label={locale === "sr" ? "Poruke" : "Messages"} icon={<MessagesSquare className="size-5" />} active={messagesActive} badge={messagesBadge} />
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
                <Link href={withLocale(locale, profilePath)} className={cn("flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-black", profileIncomplete ? "bg-red-50 text-red-900" : emailVerificationRequired ? "bg-amber-50 text-amber-900" : passwordRecommended ? "bg-indigo-50 text-indigo-900" : "hover:bg-yellow/25")}>
                  {hasAccountAdvisory ? <CircleAlert className="size-4" /> : <User className="size-4" />} {profileLabel}
                </Link>
                {hasAccountAdvisory ? (
                  <div className="mt-2 space-y-1.5">
                    {profileIncomplete ? <p className="rounded-full border border-red-400 bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-900">{locale === "sr" ? "Dodaj korisničko ime" : "Add a username"}</p> : null}
                    {emailVerificationRequired ? <p className="rounded-full border border-amber-400 bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-900">{locale === "sr" ? "Verifikuj email za kurseve" : "Verify email for courses"}</p> : null}
                    {passwordRecommended ? <p className="rounded-full border border-indigo-400 bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-900">{locale === "sr" ? "Dodaj opcionu lozinku" : "Add an optional password"}</p> : null}
                  </div>
                ) : null}
                <Link href={withLocale(locale, "/app/billing")} className="flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-black hover:bg-yellow/25"><CreditCard className="size-4" /> {t.billing}</Link>
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
      <AppBottomNav
        locale={locale}
        currentCourse={currentCourse}
        dashboardActive={dashboardActive}
        courseActive={courseActive}
        communityActive={communityActive}
        messagesActive={messagesActive}
        communityBadge={communityBadge}
        messagesBadge={messagesBadge}
        hidden={drawerIsModal && mobileOpen}
      />
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
  const chatSummary = useQuery(api.chat.getInboxSummary, isAuthenticated ? {} : "skip");
  const messagesBadge = chatSummary?.totalUnread ?? 0;
  const accountBadge = notificationSummary?.accountWarnings ?? 0;
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
      messagesBadge={messagesBadge}
      accountBadge={accountBadge}
      profileComplete={profileStatus?.complete ?? false}
      emailVerificationRequired={profileStatus?.advisories.emailVerification ?? false}
      passwordRecommended={profileStatus?.advisories.password ?? false}
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
