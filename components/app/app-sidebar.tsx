"use client";

import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Coins,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Lock,
  Menu,
  MessageCircle,
  MessagesSquare,
  PanelLeftClose,
  PlayCircle,
  Settings,
  Shield,
  ShieldCheck,
  User,
  LogOut,
  Wand2,
  X,
  ArrowUpRight,
} from "lucide-react";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { gsap } from "gsap";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  AppAccountMenu,
  CreditsBalancePill,
  SidebarRoleBadge,
  planOffersUpgrade,
  resolvePlan,
} from "@/components/app/app-account-menu";
import { CheckoutButton } from "@/components/app/checkout-button";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { BrandMark, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import {
  APP_SIDEBAR_COOKIE,
  type AppSidebarPreferences,
  serializeAppSidebarPreferences,
} from "@/lib/app-sidebar-preferences";
import { classroomPath, courseCatalogPath, coursePath, lessonPath } from "@/lib/app-routes";
import { lessonPosition, lessonPositionLabel } from "@/lib/lesson-position";
import { publicProfilePath } from "@/lib/profile-links";
import type { AppCourseNav, AppNavigationData } from "@/lib/app-navigation";
import { primaryCourseSlug } from "@/lib/content";
import { dictionary, localized, otherLocale, type Locale, withLocale } from "@/lib/i18n";
import {
  COMMUNITY_PRESERVED_KEYS,
  activeSectionId,
  resolveSidebarContext,
  type SidebarHrefParams,
} from "@/lib/sidebar-contexts";
import {
  SidebarNavSwap,
  ContextSidebarNav,
  ContextSidebarRail,
  SIDEBAR_ROW,
  SIDEBAR_ROW_ACTIVE,
  SIDEBAR_ROW_ICON,
  SIDEBAR_ROW_IDLE,
  SIDEBAR_ROW_LABEL,
} from "@/components/app/app-sidebar-context";

const AddCourseAction = dynamic(() => import("@/components/app/admin-inline-actions").then((m) => m.AddCourseAction), { ssr: false });
const EditCourseAction = dynamic(() => import("@/components/app/admin-inline-actions").then((m) => m.EditCourseAction), { ssr: false });

/**
 * Width at which the <aside> stops being a modal drawer and becomes the persistent
 * sidebar. Must track the `md:` prefixes on the sidebar shell classes below. This is
 * deliberately NOT the same threshold as the pointer-resize handle, which stays at 1024px.
 */
const DESKTOP_SIDEBAR_MEDIA_QUERY = "(min-width: 768px)";
/** Isto trajanje kao `--motion-prelaz` u globals.css — vidi `setCollapsed` ispod. */
const SIDEBAR_COLLAPSE_MS = 260;
/** Koliko prevlacenje mora da predje da bi sarka preskocila u drugo stanje. */
const SIDEBAR_HINGE_TRAVEL = 24;

/**
 * Dugme za sklapanje (N8): samo ikonica u boji mastila, bez okvira, pozadine i senke;
 * hover daje isključivo podlogu na 6% mastila. Isto dugme stoji na istom mestu i kad je
 * sidebar zatvoren — jedina razlika je ikonica okrenuta za 180 stepeni. Širina mu je
 * kolona ikonice, pa na skupljenoj širini padne tačno na x rail dugmeta.
 */
const SIDEBAR_TOGGLE =
  "hidden shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:inline-flex md:size-[var(--sidebar-icon-col)]";

/** Rotira omotac, ne <svg>: transform na korenu lucide ikonice ume da ne uhvati. */
function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <span
      className={cn(
        "block transition-transform duration-200 ease-[var(--ease-studio-out)] motion-reduce:transition-none",
        collapsed && "rotate-180",
      )}
    >
      <PanelLeftClose className="size-5" />
    </span>
  );
}

function dashboardHref(locale: Locale) {
  return withLocale(locale, "/app");
}

function communityHref(locale: Locale, courseSlug: string) {
  return `${withLocale(locale, "/app/community/discussions")}?scope=course&course=${courseSlug}`;
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
        "sidebar-action-cluster pointer-events-auto flex shrink-0 items-center gap-1 rounded-[8px] bg-paper-strong/95 p-0.5 shadow-[2px_2px_0_0_var(--shadow-hard-12)] transition",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Rows inside the switcher panel share one shape regardless of what they select. A course
 * row and a lesson row are the two halves of a single decision; giving them different
 * radii and borders made one choice read as three unrelated controls.
 */
function switcherRowShell(active: boolean) {
  return cn(
    "group relative overflow-hidden rounded-[12px] border-2 transition",
    active ? "border-ink bg-yellow" : "border-line bg-paper-strong hover:border-ink",
  );
}

const switcherRowLink =
  "flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";

const switcherRowIcon =
  "grid size-8 shrink-0 place-items-center surface-media border-2 border-ink/15 bg-paper-strong";

/**
 * Plocica reda LEKCIJE. Nosi redni broj umesto uvek iste ikonice, a na otvorenoj
 * lekciji se puni mastilom — to je vizuelni deo markera „gde sam". Klase se biraju
 * ovde, a ne spajanjem u pozivaocu: `cn` je obicno spajanje, pa bi `border-ink` i
 * `border-ink/15` u istoj nisci ostavili ishod redosledu u Tailwind izlazu.
 */
function switcherLessonIcon(active: boolean) {
  return cn(
    "grid size-8 shrink-0 place-items-center surface-media border-2",
    active ? "border-ink bg-ink text-paper-strong" : "border-ink/15 bg-paper-strong text-ink",
  );
}

/**
 * One control for the two halves of the same choice: which course, and which lesson
 * inside it. These used to be a card at the top of the sidebar and a NavDisclosure
 * further down the nav, which meant the current lesson was invisible until you opened
 * an accordion, and one decision was spread across three different row shapes.
 */
function LearningSwitcher({
  locale,
  courses,
  currentCourse,
  currentLessonSlug,
  isAdmin,
  initiallyOpen = false,
}: {
  locale: Locale;
  courses: AppCourseNav[];
  currentCourse: AppCourseNav;
  currentLessonSlug?: string;
  isAdmin: boolean;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [tab, setTab] = useState<"courses" | "lessons">(currentLessonSlug ? "lessons" : "courses");
  // The expanded sidebar and the rail flyout can both be mounted at once (the expanded
  // column is only `md:hidden` while collapsed), so tab/panel ids have to be per-instance.
  const tabsId = useId();
  // Both surfaces are handed the same full list, so the switcher is also the only place
  // that can show a course outside the current track. Grouping keeps smer -> kurs legible
  // rather than presenting one flat list of everything.
  const trackGroups = useMemo(() => {
    const groups = new Map<string, { key: string; title: string | null; courses: AppCourseNav[] }>();
    for (const course of courses) {
      const key = course.trackSlug ?? "";
      let group = groups.get(key);
      if (!group) {
        group = { key, title: course.trackTitle ? localized(course.trackTitle, locale) : null, courses: [] };
        groups.set(key, group);
      }
      group.courses.push(course);
    }
    // A single unnamed group is the static no-Convex fallback: no tracks, so no headers.
    return Array.from(groups.values());
  }, [courses, locale]);
  const currentComingSoon = isCourseComingSoon(currentCourse, isAdmin);
  const currentLocked = isCourseLocked(currentCourse, isAdmin);
  const directLessons = currentCourse.modules
    .flatMap((module) => module.lessons)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const currentLesson = currentLessonSlug
    ? directLessons.find((lesson) => lesson.slug === currentLessonSlug)
    : undefined;
  // „Gde sam" nije samo „koja je lekcija otvorena" nego i „koja je po redu": za
  // pocetnika je bas taj drugi podatak ono sto smiruje. `null` kad pozicije nema.
  const currentPosition = lessonPosition(directLessons, currentLessonSlug);
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

  // Re-evaluated on every open rather than once at mount: the sidebar survives every
  // navigation, so a mount-time default would strand you on the wrong half of the panel.
  const toggle = () => {
    if (!open) setTab(currentLessonSlug ? "lessons" : "courses");
    setOpen((value) => !value);
  };

  return (
    <div className="sidebar-reveal relative mt-5 md:mt-8">
      <div className="flex items-start gap-2">
        <motion.button
          type="button"
          onClick={toggle}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          aria-expanded={open}
          className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 rounded-[16px] border-2 border-ink bg-paper-strong p-2 text-left text-sm font-black text-ink shadow-[4px_4px_0_0_var(--shadow-hard)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-[12px] border-2 border-ink bg-yellow shadow-[2px_2px_0_0_var(--shadow-hard-12)]">
                <GraduationCap className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block type-eyebrow-sm text-muted">
                  {locale === "sr" ? "Kurs" : "Course"}
                </span>
                <span className="block truncate">{localized(currentCourse.title, locale)}</span>
                <span className="mt-1 inline-flex items-center rounded-full bg-ink px-2 py-0.5 type-eyebrow-sm text-paper-strong">
                  {currentStatus}
                </span>
              </span>
            </span>
            {currentLesson ? (
              <span className="mt-2 flex min-w-0 items-center gap-3 border-t border-ink/10 pt-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-[12px] border-2 border-ink bg-paper">
                  <PlayCircle className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block type-eyebrow-sm text-muted">
                    {currentPosition
                      ? lessonPositionLabel(locale, currentPosition)
                      : locale === "sr"
                        ? "Lekcija"
                        : "Lesson"}
                  </span>
                  <span className="block truncate">{localized(currentLesson.title, locale)}</span>
                </span>
              </span>
            ) : null}
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
            className="relative z-20 mt-3 rounded-[16px] border-2 border-ink bg-paper-strong p-3 shadow-[6px_6px_0_0_var(--shadow-hard)]"
          >
            <p className="px-1 type-eyebrow-sm text-muted">
              {locale === "sr" ? "Tvoje učenje" : "Your learning"}
            </p>
            <div
              role="tablist"
              aria-label={locale === "sr" ? "Kurs i lekcije" : "Course and lessons"}
              className="mt-2 flex items-center gap-1 rounded-full border-2 border-line bg-paper p-1"
            >
              {(["courses", "lessons"] as const).map((key) => {
                const selected = tab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    id={`${tabsId}-tab-${key}`}
                    aria-selected={selected}
                    aria-controls={`${tabsId}-panel-${key}`}
                    onClick={() => setTab(key)}
                    className={cn(
                      "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 type-eyebrow transition",
                      selected ? "bg-ink text-paper-strong" : "text-muted hover:text-ink",
                    )}
                  >
                    {key === "courses"
                      ? locale === "sr"
                        ? "Kursevi"
                        : "Courses"
                      : dictionary[locale].lessons}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 type-caption",
                        selected ? "bg-paper-strong/25 text-paper-strong" : "bg-paper-strong text-muted",
                      )}
                    >
                      {key === "courses" ? courses.length : directLessons.length}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              role="tabpanel"
              id={`${tabsId}-panel-${tab}`}
              aria-labelledby={`${tabsId}-tab-${tab}`}
              className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1"
            >
              {tab === "courses"
                ? trackGroups.map((group) => (
                    <div key={group.key} className="space-y-2">
                      {group.title ? (
                        <p className="px-1 pt-1 type-eyebrow-sm text-muted">
                          {group.title}
                        </p>
                      ) : null}
                      {group.courses.map((course) => {
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
                              switcherRowShell(active),
                              locked && "pb-3",
                              isAdmin && canEditCourse && "pr-9",
                            )}
                          >
                            <div className="sidebar-action-row flex items-center gap-1">
                              {comingSoon ? (
                                <div className={cn(switcherRowLink, "text-muted")}>
                                  <span className={switcherRowIcon}>
                                    <GraduationCap className="size-4" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-ink">{localized(course.title, locale)}</span>
                                    <span className="mt-1 inline-flex rounded-full border border-line bg-paper-strong px-2 py-0.5 type-eyebrow-sm text-muted">
                                      {statusLabel}
                                    </span>
                                  </span>
                                </div>
                              ) : (
                                <Link
                                  href={coursePath(locale, course.slug)}
                                  onClick={() => setOpen(false)}
                                  aria-current={active ? "page" : undefined}
                                  className={switcherRowLink}
                                >
                                  <span className={switcherRowIcon}>
                                    {locked ? <Lock className="size-4" /> : <GraduationCap className="size-4" />}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate">{localized(course.title, locale)}</span>
                                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-line bg-paper-strong px-2 py-0.5 type-eyebrow-sm text-muted">
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
                              <div className="mx-3 mt-2 border-t border-ink/10 pt-3">
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
                  ))
                : currentComingSoon ? (
                    <div className="rounded-[12px] border-2 border-dashed border-line bg-paper p-3">
                      <p className="text-sm font-black text-muted">
                        {locale === "sr" ? "Lekcije za ovaj smer stizu uskoro." : "Lessons for this track are coming soon."}
                      </p>
                      {isAdmin ? (
                        <p className="mt-1 text-xs font-bold text-muted">
                          {locale === "sr" ? "Admin može odmah da doda lekcije." : "Admins can add lessons now."}
                        </p>
                      ) : null}
                    </div>
                  ) : currentLocked ? (
                    <div className="rounded-[12px] border-2 border-line bg-paper p-3">
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
                    <>
                      {directLessons.length ? null : (
                        <p className="rounded-[12px] border-2 border-dashed border-line bg-paper p-3 text-xs font-black text-muted">
                          {locale === "sr" ? "Kurs još nema lekcije." : "This course has no lessons yet."}
                        </p>
                      )}
                      {directLessons.map((lesson, lessonIndex) => {
                        const active = currentLessonSlug === lesson.slug;
                        return (
                          <motion.div key={lesson.id ?? lesson.slug} layout className={switcherRowShell(active)}>
                            <Link
                              href={lessonPath(locale, currentCourse.slug, lesson.slug)}
                              onClick={() => setOpen(false)}
                              aria-current={active ? "page" : undefined}
                              className={switcherRowLink}
                            >
                              <span className={switcherLessonIcon(active)}>
                                {active ? (
                                  <PlayCircle aria-hidden="true" className="size-4" />
                                ) : (
                                  <span className="type-eyebrow-sm">{lessonIndex + 1}</span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{localized(lesson.title, locale)}</span>
                              {active ? (
                                <span className="shrink-0 rounded-full border-2 border-ink bg-paper-strong px-2 py-0.5 type-eyebrow-sm text-ink">
                                  {locale === "sr" ? "Ovde si" : "You are here"}
                                </span>
                              ) : null}
                              {isAdmin && !lesson.isPublished ? (
                                <span className="shrink-0 rounded-full border border-ink bg-paper px-2 py-0.5 type-eyebrow-sm">
                                  Nacrt
                                </span>
                              ) : null}
                            </Link>
                          </motion.div>
                        );
                      })}
                      {isAdmin && currentCourse.id ? (
                        <div className="border-t-2 border-line pt-2">
                          <Link
                            href={withLocale(locale, "/app/admin")}
                            className="inline-flex min-h-9 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black"
                          >
                            <CircleAlert className="size-3.5" />
                            {locale === "sr" ? "Upravljaj lekcijama" : "Manage lessons"}
                          </Link>
                        </div>
                      ) : null}
                    </>
                  )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Krediti su vidljivi sa svake `/app` stranice preko ove pločice u zaglavlju
 * sidebar-a (mobilni top bar i prošireni desktop vrh) - `rounded-full`, sitna,
 * ne dominira. `undefined` znači "još se učitava" (prikazuje "—"); `null` znači
 * "neprijavljen", pa se pločica uopšte ne renderuje.
 */
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
        aria-current={active ? "page" : undefined}
        className={cn(
          // Ternary, not base+append: cn() is a plain join, so both branches would otherwise
          // be emitted and the winner decided by generated-CSS order.
          SIDEBAR_ROW,
          active ? SIDEBAR_ROW_ACTIVE : SIDEBAR_ROW_IDLE,
        )}
      >
        <span className={SIDEBAR_ROW_ICON}>
          <Icon className="size-5" />
        </span>
        <span className={SIDEBAR_ROW_LABEL}>
          <span className="truncate">{label}</span>
          {badge && badge > 0 ? (
            <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-ink bg-red-600 px-1 text-[10px] font-black text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </span>
      </Link>
    </motion.div>
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
    active ? "border-ink bg-yellow shadow-[3px_3px_0_var(--shadow-hard-16)]" : "border-transparent bg-paper-strong hover:border-ink hover:bg-yellow/25",
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
          "pointer-events-none absolute left-[calc(100%+12px)] z-[80] whitespace-nowrap rounded-full border-2 border-ink bg-paper-strong px-3 py-1.5 text-xs font-black text-ink opacity-0 shadow-[4px_4px_0_var(--shadow-hard-14)] transition group-hover:opacity-100 group-focus-visible:opacity-100",
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

/**
 * Phone-width primary navigation. Height is a contract with the bottom padding on
 * <main> in app-shell.tsx — changing min-h-14 there means changing it here too.
 * Avoids any class containing "border" on the tab links, because globals.css turns
 * bordered anchors into pills.
 */
function AppBottomNav({
  locale,
  communityLandingHref,
  dashboardActive,
  classroomActive,
  communityActive,
  messagesActive,
  communityBadge,
  messagesBadge,
  contextActive,
  onOpenSections,
  hidden,
}: {
  locale: Locale;
  communityLandingHref: string;
  dashboardActive: boolean;
  classroomActive: boolean;
  communityActive: boolean;
  messagesActive: boolean;
  communityBadge: number;
  messagesBadge: number;
  contextActive: boolean;
  onOpenSections: () => void;
  hidden: boolean;
}) {
  const t = dictionary[locale];
  // Exactly four slots, deliberately. Smer, Lekcije, Admin panel, Chat sigurnost, Profil,
  // Pretplata and Odjavi se are all absent here and reachable in two taps via the "Više" /
  // "More" button in the phone header, which opens the drawer — and the drawer *is* the
  // expanded sidebar, so it exposes everything the expanded sidebar does by construction.
  // Cramming a fifth tab in, or spending a slot on a More button, would cost Poruke its
  // unread badge. Do not add a fifth entry to this array.
  const tabs: Array<{
    key: string;
    icon: typeof LayoutDashboard;
    label: string;
    active: boolean;
    badge: number;
    href?: string;
    onClick?: () => void;
  }> = [
    {
      key: "dashboard",
      href: dashboardHref(locale),
      icon: LayoutDashboard,
      // Literal, matching the sidebar NavLink for the same destination.
      label: "Dashboard",
      active: dashboardActive,
      badge: 0,
    },
    {
      // Sve što se uči je jedan slot — Učionica; smer/kurs/lekcija su njen kontekst.
      key: "classroom",
      href: classroomPath(locale),
      icon: GraduationCap,
      label: locale === "sr" ? "Učionica" : "Classroom",
      active: classroomActive,
      badge: 0,
    },
    // Unutar konteksta (studio/community/admin) treći slot postaje „Sekcije" — otvara drawer
    // (prošireni sidebar sa sekcijama konteksta). Na home ostaje link na Zajednicu.
    contextActive
      ? {
          key: "sections",
          onClick: onOpenSections,
          icon: Menu,
          label: locale === "sr" ? "Sekcije" : "Sections",
          active: false,
          badge: 0,
        }
      : {
          key: "community",
          href: communityLandingHref,
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
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-paper-strong pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_18px_var(--shadow-hard-14)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const className = cn(
            "relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 pb-1.5 pt-2 type-eyebrow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
            tab.active ? "text-ink" : "text-muted",
          );
          const inner = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-4 top-0 h-1 rounded-b-full",
                  tab.active ? "bg-yellow" : "bg-transparent",
                )}
              />
              <span
                className={cn(
                  "relative grid size-8 place-items-center rounded-full transition",
                  tab.active && "bg-yellow ring-2 ring-ink",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {tab.badge > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-ink bg-red-600 px-1 text-[9px] font-black leading-none text-white">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate text-center">{tab.label}</span>
            </>
          );
          return (
            <li key={tab.key} className="min-w-0">
              {tab.href ? (
                <Link href={tab.href} aria-current={tab.active ? "page" : undefined} className={className}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={tab.onClick} aria-haspopup="dialog" className={className}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
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
  myThreadsBadge = 0,
  pendingApprovalsBadge = 0,
  accountBadge = 0,
  profileComplete = true,
  emailVerificationRequired = false,
  passwordRecommended = false,
  creditsBalance = null,
}: {
  locale: Locale;
  navigation: AppNavigationData;
  initialPreferences: AppSidebarPreferences;
  source?: "server" | "live";
  authState?: "loading" | "authenticated" | "anonymous" | "unknown";
  profileData?: { name?: string; username?: string; email?: string; avatarUrl?: string } | null;
  communityBadge?: number;
  messagesBadge?: number;
  myThreadsBadge?: number;
  pendingApprovalsBadge?: number;
  accountBadge?: number;
  profileComplete?: boolean;
  creditsBalance?: number | null;
  emailVerificationRequired?: boolean;
  passwordRecommended?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  // Rail se pokazuje TEK kad se sirina skupi, a sklanja se odmah pri otvaranju. Zato
  // tekst linkova ima gde da izbledi (prosireni sloj ostaje u kadru dok traje suzavanje)
  // i nikad se ne vidi prelomljen na pola animacije.
  const [showRail, setShowRail] = useState(initialPreferences.collapsed);
  const railTimerRef = useRef<number | null>(null);
  const openFrameRef = useRef<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  // Defaults to true (fail-open) on purpose: a false default would ship `inert` on the
  // desktop sidebar in the SSR payload and leave it dead until hydration.
  const [isDesktopSidebar, setIsDesktopSidebar] = useState(true);
  const [railFlyout, setRailFlyout] = useState<"learning" | "profile" | null>(null);
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

  /**
   * Sidebar ima tacno dva stanja i jedan prelaz izmedju njih. `applySidebarPreferences`
   * odmah prebacuje `data-collapsed` (sirina i tekst krecu istog frejma), a rail se
   * pojavljuje tek kad se sirina skupi — pri otvaranju obrnuto, odmah se sklanja.
   */
  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      if (railTimerRef.current !== null) {
        window.clearTimeout(railTimerRef.current);
        railTimerRef.current = null;
      }
      if (openFrameRef.current !== null) {
        window.cancelAnimationFrame(openFrameRef.current);
        openFrameRef.current = null;
      }
      setRailFlyout(null);
      setProfileMenuOpen(false);

      if (collapsed) {
        applySidebarPreferences({ collapsed: true });
        if (shouldReduceMotion) {
          setShowRail(true);
          return;
        }
        railTimerRef.current = window.setTimeout(() => {
          railTimerRef.current = null;
          setShowRail(true);
        }, SIDEBAR_COLLAPSE_MS);
        return;
      }

      setShowRail(false);
      if (shouldReduceMotion) {
        applySidebarPreferences({ collapsed: false });
        return;
      }
      // Prosireni sloj je do sad bio `display: none`, pa tekst nema odakle da krene:
      // bez jednog frejma u zatvorenom stanju banuo bi odjednom, umesto da izbledi
      // unutra tek kad se sirina otvori. Zato se `collapsed` skida frejm kasnije.
      openFrameRef.current = window.requestAnimationFrame(() => {
        openFrameRef.current = window.requestAnimationFrame(() => {
          openFrameRef.current = null;
          applySidebarPreferences({ collapsed: false });
        });
      });
    },
    [applySidebarPreferences, shouldReduceMotion],
  );

  const toggleSidebar = useCallback(() => {
    setCollapsed(!sidebarPreferencesRef.current.collapsed);
  }, [setCollapsed]);

  useEffect(
    () => () => {
      if (railTimerRef.current !== null) window.clearTimeout(railTimerRef.current);
      if (openFrameRef.current !== null) window.cancelAnimationFrame(openFrameRef.current);
    },
    [],
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    setProfileMenuOpen(false);
    setRailFlyout(null);
    router.push(withLocale(locale, "/sign-in"));
  }, [locale, router, signOut]);

  const goBackFromContext = useCallback(() => {
    // "Nazad" znaci IZLAZ IZ ALATA -> uvek dashboard, nikad router.back().
    // router.back() je vracao poslednji unos u istoriji, a otvaranje i zatvaranje
    // generacije gura DVA unosa (/app/studio/m/<id> pa /app/studio), pa je "Nazad"
    // ponovo otvarao bas tu generaciju. Odrediste je determinisano, ne zavisi od
    // toga koliko je koraka korisnik napravio unutar Studija.
    router.push(withLocale(locale, "/app"));
  }, [locale, router]);

  /**
   * Ivica sidebara je SARKA, ne klizac: prevlacenje ne pravi proizvoljne sirine nego
   * preskace izmedju ista dva stanja kao i klik na dugme, pa je i prelaz identican.
   * Nije u tab redosledu — dugme za kolaps je pristupacna kontrola za isti ishod.
   */
  const startSidebarHinge = useCallback(
    (startEvent: ReactPointerEvent<HTMLDivElement>) => {
      if (!window.matchMedia(DESKTOP_SIDEBAR_MEDIA_QUERY).matches) return;
      startEvent.preventDefault();
      startEvent.currentTarget.setPointerCapture?.(startEvent.pointerId);
      const startX = startEvent.clientX;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const travel = moveEvent.clientX - startX;
        const { collapsed } = sidebarPreferencesRef.current;
        if (travel <= -SIDEBAR_HINGE_TRAVEL && !collapsed) setCollapsed(true);
        else if (travel >= SIDEBAR_HINGE_TRAVEL && collapsed) setCollapsed(false);
      };

      const finishHinge = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishHinge);
        window.removeEventListener("pointercancel", finishHinge);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", finishHinge, { once: true });
      window.addEventListener("pointercancel", finishHinge, { once: true });
    },
    [setCollapsed],
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
  const accountSettingsLabel = locale === "sr" ? "Podešavanja" : "Settings";
  // Only a second row when the first one has gone somewhere else; without a username
  // profilePath already *is* /app/profile and two identical rows would be noise.
  const hasAccountSettingsRow = profilePath !== "/app/profile";
  // /app is now only ever the course grid — course detail has its own route — so this is
  // an exclusive match and "Dashboard" means exactly one screen.
  const dashboardActive = pathname === withLocale(locale, "/app");
  const communityActive = pathname === withLocale(locale, "/app/community") || pathname.includes("/app/community/");
  const messagesActive = pathname === withLocale(locale, "/app/messages") || pathname.includes("/app/messages/");
  // Registry vozi swap: kontekst iz pathname-a umesto boolean-a. `studioActive` ostaje samo
  // za highlight postojećih NavLink-ova u `home` (classic) grani.
  const sidebarContext = resolveSidebarContext(pathname);
  const contextActive = sidebarContext.id !== "home";
  const studioActive = sidebarContext.id === "studio";
  const classroomActive = sidebarContext.id === "classroom";
  // `searchParams` iz useSearchParams je read-only, pa ga kopiramo u pravi URLSearchParams za
  // `isActive`/`href` sekcija. Studio čita `?kind=`; zajednica čuva scope/track/course/q/sort.
  const currentSearch = new URLSearchParams(searchParams.toString());
  const preservedSearch = new URLSearchParams();
  for (const key of COMMUNITY_PRESERVED_KEYS) {
    currentSearch.getAll(key).forEach((value) => preservedSearch.append(key, value));
  }
  const contextParams: SidebarHrefParams = {
    courseSlug: params.courseSlug,
    trackSlug: params.trackSlug,
    lessonSlug: params.lessonSlug,
    // Titles feed the classroom context's "Smer · X" / "Kurs · Y" dynamicLabel.
    courseTitle: currentCourse ? localized(currentCourse.title, locale) : undefined,
    trackTitle: currentCourse?.trackTitle ? localized(currentCourse.trackTitle, locale) : undefined,
    preserved: preservedSearch,
  };
  const activeContextSectionId = activeSectionId(sidebarContext, pathname, currentSearch, contextParams);
  // Jedan izvor badge-eva za sekcije konteksta; `getUserNotificationSummary` u `LiveAppSidebar`
  // već daje community/myThreads/pendingApprovals — ne uvodi se nov query.
  const contextBadges = {
    community: communityBadge,
    myThreads: myThreadsBadge,
    pendingApprovals: pendingApprovalsBadge,
    messages: messagesBadge,
  };
  const creditsActive = pathname === withLocale(locale, "/app/credits");
  const adminActive = pathname === withLocale(locale, "/app/admin/content");
  const chatSafetyActive = pathname === withLocale(locale, "/app/admin/chat");
  const showUpgrade = planOffersUpgrade(resolvePlan(navigation.role, navigation.plan));
  // Prekidac jezika u meniju naloga vodi na ISTU stranu na drugom jeziku, kao u
  // javnom navbaru — bez ovoga bi svaka promena jezika vracala na pocetnu.
  const localePrefix = `/${locale}`;
  const pathWithoutLocale =
    pathname === localePrefix || pathname.startsWith(`${localePrefix}/`) ? pathname.slice(localePrefix.length) : null;
  const languageHref =
    pathWithoutLocale !== null ? withLocale(otherLocale(locale), pathWithoutLocale) : withLocale(otherLocale(locale));
  const upgradeLabel = locale === "sr" ? "Unapredi plan" : "Upgrade plan";
  // Community is a destination in its own right, not a property of the selected course.
  // Scope it to the course when there is one, but never withhold the link when there is not.
  const communityLandingHref = currentCourse
    ? communityHref(locale, currentCourse.slug)
    : withLocale(locale, "/app/community/discussions");
  // Below the desktop breakpoint the same <aside> behaves as a modal drawer.
  const drawerIsModal = !isDesktopSidebar;
  const navLabel = locale === "sr" ? "Glavna navigacija" : "Main navigation";

  return (
    <>
      <header inert={drawerIsModal && mobileOpen} className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b-2 border-ink bg-paper-strong px-4 md:hidden">
        <BrandMark href={withLocale(locale)} label={t.appName} />
        <div className="flex items-center gap-2">
          {authState === "authenticated" ? <CreditsBalancePill locale={locale} balance={creditsBalance} /> : null}
          <button
            ref={mobileMenuButtonRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={mobileOpen}
            aria-controls="app-sidebar-drawer"
            onClick={() => setMobileOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 border-2 border-ink bg-yellow px-3.5 type-eyebrow text-ink shadow-[3px_3px_0_var(--shadow-hard-16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <Menu className="size-5" aria-hidden="true" />
            {locale === "sr" ? "Više" : "More"}
          </button>
        </div>
      </header>
      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={cn(
          "pointer-events-none fixed inset-0 z-40 bg-scrim/45 opacity-0 backdrop-blur-[2px] transition-opacity md:hidden",
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
      onClickCapture={(event) => {
        if ((event.target as Element).closest("a")) {
          setMobileOpen(false);
          setRailFlyout(null);
        }
      }}
      // Sirina je u `.app-sidebar` (globals.css) da bi oba stanja bila jedan token, a
      // prelaz je utility ovde, jer bi `transition-transform` fioke inace pojeo sloj sa
      // sirinom. Glavni sadrzaj desno je flex-sused, pa prati istu krivu bez svog prelaza.
      className={cn(
        "app-sidebar fixed inset-y-0 left-0 z-50 flex h-dvh min-w-0 -translate-x-full flex-col border-r-2 border-ink bg-paper-strong px-4 py-4 shadow-[18px_0_45px_var(--shadow-hard)] transition-transform duration-200 motion-reduce:transition-none",
        mobileOpen && "translate-x-0",
        "md:sticky md:top-0 md:z-30 md:h-screen md:shrink-0 md:translate-x-0 md:overflow-visible md:py-7 md:shadow-none",
        "md:transition-[width] md:duration-[260ms] md:ease-[var(--ease-studio-out)]",
      )}
    >
      <div className={cn("flex h-full min-w-0 flex-col", showRail && "md:hidden")}>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="sidebar-reveal flex items-center justify-between gap-4 md:h-12">
          {/* `flex`, ne `block`: inline line-box oko logotipa bi dodao ~3px visine i
              gurnuo nav nize nego u rail-u — pri sklapanju se nista ne sme pomeriti. */}
          <div className="app-sidebar-label flex min-w-0">
            <BrandMark href={withLocale(locale)} label={t.appName} />
          </div>
          <button
            type="button"
            aria-label={locale === "sr" ? "Skupi sidebar" : "Collapse sidebar"}
            aria-expanded={!sidebarPreferences.collapsed}
            onClick={toggleSidebar}
            className={SIDEBAR_TOGGLE}
          >
            <SidebarToggleIcon collapsed={sidebarPreferences.collapsed} />
          </button>
          <button
            type="button"
            aria-label={locale === "sr" ? "Zatvori navigaciju" : "Close navigation"}
            onClick={() => setMobileOpen(false)}
            className="inline-flex size-11 shrink-0 items-center justify-center border-2 border-ink bg-paper-strong text-ink md:hidden"
          >
            <X className="size-5" />
          </button>
        </div>
        {/* Registry konteksta bira sadržaj ispod: `contextActive` prebacuje sa home (classic)
            na sekcije aktivnog konteksta (ContextSidebarNav). Kontrola za skupljanje iznad
            ostaje sidro; menja se samo ovo ispod nje. */}
        <SidebarNavSwap
          active={contextActive}
          reduce={shouldReduceMotion ?? false}
          classic={
            <nav aria-label={navLabel} className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-col">
              <NavLink
                href={dashboardHref(locale)}
                active={dashboardActive}
                icon={LayoutDashboard}
                label="Dashboard"
              />
              {/* Sve što se uči živi u Učionici (`/app/classroom`); smer/kurs/lekcija su njen kontekst,
                  ne redovi globalne navigacije. */}
              <NavLink
                href={classroomPath(locale)}
                active={classroomActive}
                icon={GraduationCap}
                label={locale === "sr" ? "Učionica" : "Classroom"}
              />
              <NavLink
                href={withLocale(locale, "/app/studio")}
                active={studioActive}
                icon={Wand2}
                label="Studio"
              />
              <NavLink
                href={withLocale(locale, "/app/credits")}
                active={creditsActive}
                icon={Coins}
                label={locale === "sr" ? "Krediti" : "Credits"}
              />
              {/* Zajednica je odredište; sekcije zajednice renderuje `community` kontekst
                  sidebara (uz očuvanje scope/track/course/q/sort). */}
              <NavLink
                href={communityLandingHref}
                active={communityActive}
                icon={MessageCircle}
                label={t.community}
                badge={communityBadge}
              />
              <NavLink
                href={withLocale(locale, "/app/messages")}
                active={messagesActive}
                icon={MessagesSquare}
                label={locale === "sr" ? "Poruke" : "Messages"}
                badge={messagesBadge}
              />
              {isAdmin ? (
                <NavLink
                  href={withLocale(locale, "/app/admin/content")}
                  active={pathname === withLocale(locale, "/app/admin/content")}
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
          }
          studio={
            <ContextSidebarNav
              context={sidebarContext}
              locale={locale}
              activeId={activeContextSectionId}
              onBack={goBackFromContext}
              reduce={shouldReduceMotion ?? false}
              isStaff={isStaff}
              isAdmin={isAdmin}
              params={contextParams}
              badges={contextBadges}
              leading={
                sidebarContext.id === "classroom" && currentCourse ? (
                  <LearningSwitcher
                    locale={locale}
                    courses={courses}
                    currentCourse={currentCourse}
                    currentLessonSlug={params.lessonSlug}
                    isAdmin={isAdmin}
                  />
                ) : undefined
              }
            />
          }
        />
      </div>

      {/* Bottom Profile Card */}
      {profileData && (
        <div className="relative mt-auto hidden md:block -mx-4 -mb-7 border-t-2 border-ink bg-paper-strong" ref={profileMenuRef}>
          {profileMenuOpen ? (
            <AppAccountMenu
              locale={locale}
              placement="above"
              name={profileName}
              username={profileData?.username}
              initials={profileInitials}
              avatarUrl={profileAvatar}
              role={navigation.role}
              plan={navigation.plan}
              needsAttention={hasAccountAdvisory}
              creditsBalance={creditsBalance}
              languageHref={languageHref}
              upgradeHref={showUpgrade ? courseCatalogPath(locale) : undefined}
              onNavigate={() => setProfileMenuOpen(false)}
              onSignOut={handleSignOut}
            />
          ) : null}

          <button
            type="button"
            onClick={() => setProfileMenuOpen((value) => !value)}
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            className="relative flex w-full items-center overflow-hidden rounded-none bg-paper-strong px-4 py-4 text-left text-ink transition hover:bg-yellow/15"
          >
            {/* Avatar je isti krug i na istom x-u kao ikonice nav-a i kao avatar u rail-u. */}
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-yellow text-xs font-black">
              {profileAvatar ? (
                /* Avatar URLs are user-provided at runtime and intentionally avoid Next image host restrictions. */
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{profileInitials}</span>
              )}
            </div>
            <span className="app-sidebar-label flex w-[var(--sidebar-label-w)] shrink-0 items-center gap-2 pr-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-black leading-tight text-ink">{profileName}</span>
                {/* Uloga stoji uz @username, ne u prvom redu: na izmerenoj sirini bi inace
                    ime ostalo na dva-tri slova. */}
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                  <span className="truncate type-caption font-semibold text-muted/80">{profileUsername}</span>
                  <SidebarRoleBadge role={navigation.role} plan={navigation.plan} locale={locale} />
                </span>
              </span>
              <ChevronDown className={cn("size-4 shrink-0 transition-transform text-muted", profileMenuOpen && "rotate-180")} />
            </span>
            {accountBadge > 0 ? <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-red-600 px-1 text-[10px] font-black text-white">{accountBadge > 99 ? "99+" : accountBadge}</span> : null}
          </button>
        </div>
      )}

      {/* Mobile profile link */}
      {profileData && (
        <div className="mt-4 flex items-center gap-3 border-t-2 border-ink pt-4 md:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black leading-tight text-ink">{profileName}</p>
            <p className="mt-0.5 truncate type-caption font-semibold text-muted/80">{profileUsername}</p>
          </div>
          <SidebarRoleBadge role={navigation.role} plan={navigation.plan} locale={locale} />
        </div>
      )}
      {profileData && (
        <div className={cn("mt-3 grid gap-2 md:hidden", hasAccountSettingsRow ? "grid-cols-2" : "grid-cols-3")}>
          <Link
            href={withLocale(locale, profilePath)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-xs font-black text-ink"
          >
            {hasAccountAdvisory ? <CircleAlert className={cn("size-4", profileIncomplete ? "text-red-700" : emailVerificationRequired ? "text-amber-700" : "text-indigo-700")} /> : <User className="size-4" />}
            {profileLabel}
          </Link>
          {hasAccountSettingsRow ? (
            <Link
              href={withLocale(locale, "/app/profile")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-xs font-black text-ink"
            >
              <Settings className="size-4" />
              {accountSettingsLabel}
            </Link>
          ) : null}
          <Link
            href={withLocale(locale, "/app/billing")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-xs font-black text-ink"
          >
            <CreditCard className="size-4" />
            {t.billing}
          </Link>
          {showUpgrade ? (
            <Link
              href={courseCatalogPath(locale)}
              className="col-span-full inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-[#10b981] px-3 py-2 text-xs font-black text-white"
            >
              <ArrowUpRight className="size-4" />
              {upgradeLabel}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.push(withLocale(locale, "/sign-in"));
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-ink px-3 py-2 text-xs font-black text-paper-strong"
          >
            <LogOut className="size-4" />
            {locale === "sr" ? "Odjavi se" : "Sign out"}
          </button>
        </div>
      )}
      <ThemeToggle locale={locale} className="mt-3 md:hidden" />
      </div>

      {/* Rail nosi TACNO iste elemente na istim mestima kao prosireni sloj: dugme na vrhu,
          pa nav na +20px, pa profil pri dnu. Emblem i crta koje je rail ranije imao izmedju
          dugmeta i nav-a su uklonjeni — gurali su ikonice nize nego u prosirenom stanju, a
          nista se pri sklapanju ne sme pomeriti vertikalno. */}
      <div ref={railLayerRef} className={cn("relative hidden h-full w-full flex-col items-center", showRail && "md:flex")}>
        <button
          type="button"
          aria-label={locale === "sr" ? "Proširi sidebar" : "Expand sidebar"}
          aria-expanded={!sidebarPreferences.collapsed}
          onClick={toggleSidebar}
          className={SIDEBAR_TOGGLE}
        >
          <SidebarToggleIcon collapsed={sidebarPreferences.collapsed} />
        </button>
        {/* Rail (skupljeno): isti swap, ali `compact` - opacity crossfade bez klizanja
            (80px je preusko za horizontalni pomeraj); „Nazad" ikona nosi značenje. */}
        <SidebarNavSwap
          compact
          active={contextActive}
          reduce={shouldReduceMotion ?? false}
          className="mt-5 w-full"
          classic={
            <nav className="flex flex-col items-center gap-2" aria-label={locale === "sr" ? "Glavna navigacija" : "Main navigation"}>
          <RailAction href={dashboardHref(locale)} label="Dashboard" icon={<LayoutDashboard className="size-5" />} active={dashboardActive} />
          {/* Učionica: smer/kurs/lekcija su njen kontekst; LearningSwitcher se otvara iz classroom raila. */}
          <RailAction href={classroomPath(locale)} label={locale === "sr" ? "Učionica" : "Classroom"} icon={<GraduationCap className="size-5" />} active={classroomActive} />
          <RailAction href={withLocale(locale, "/app/studio")} label="Studio" icon={<Wand2 className="size-5" />} active={studioActive} />
          <RailAction href={withLocale(locale, "/app/credits")} label={locale === "sr" ? "Krediti" : "Credits"} icon={<Coins className="size-5" />} active={creditsActive} />
          {/* Zajednica je odredište; njena sekcijska nav se prikazuje po dolasku, pa je svaka
              sekcija i dalje na dva klika odavde. */}
          <RailAction href={communityLandingHref} label={t.community} icon={<MessageCircle className="size-5" />} active={communityActive} badge={communityBadge} />
          <RailAction href={withLocale(locale, "/app/messages")} label={locale === "sr" ? "Poruke" : "Messages"} icon={<MessagesSquare className="size-5" />} active={messagesActive} badge={messagesBadge} />
          {/* Collapse state lives in a one-year cookie, so anything missing here is missing
              for a year. Admin panel and Chat safety used to be expanded-sidebar-only. */}
          {isAdmin ? (
            <RailAction href={withLocale(locale, "/app/admin/content")} label={locale === "sr" ? "Admin panel" : "Admin panel"} icon={<ShieldCheck className="size-5" />} active={adminActive} />
          ) : null}
          {isStaff ? (
            <RailAction href={withLocale(locale, "/app/admin/chat")} label={locale === "sr" ? "Chat sigurnost" : "Chat safety"} icon={<Shield className="size-5" />} active={chatSafetyActive} />
          ) : null}
          {showUpgrade ? (
            <RailAction href={courseCatalogPath(locale)} label={locale === "sr" ? "Unapredi" : "Upgrade"} icon={<ArrowUpRight className="size-5" />} />
          ) : null}
            </nav>
          }
          studio={
            <ContextSidebarRail
              context={sidebarContext}
              locale={locale}
              activeId={activeContextSectionId}
              onBack={goBackFromContext}
              isStaff={isStaff}
              isAdmin={isAdmin}
              params={contextParams}
              badges={contextBadges}
              leading={
                sidebarContext.id === "classroom" && currentCourse ? (
                  <RailAction
                    label={`${localized(currentCourse.title, locale)} · ${t.lessons}`}
                    icon={<GraduationCap className="size-5" />}
                    expanded={railFlyout === "learning"}
                    onClick={() => setRailFlyout((value) => (value === "learning" ? null : "learning"))}
                  />
                ) : undefined
              }
            />
          }
        />

        {railFlyout === "learning" && currentCourse ? (
          <div className="absolute left-[calc(100%_+_32px)] top-20 z-[70] max-h-[calc(100vh_-_140px)] w-[380px] max-w-[calc(100vw_-_112px)] overflow-y-auto overflow-x-hidden rounded-[16px] border-2 border-ink bg-paper-strong p-4 text-ink shadow-[10px_10px_0_var(--shadow-hard-16)]">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <p className="text-sm font-black">{locale === "sr" ? "Kurs i lekcije" : "Course and lessons"}</p>
              <button type="button" aria-label={locale === "sr" ? "Zatvori" : "Close"} onClick={() => setRailFlyout(null)} className="inline-flex size-9 items-center justify-center border border-line bg-paper text-ink"><X className="size-4" /></button>
            </div>
            <LearningSwitcher
              locale={locale}
              courses={courses}
              currentCourse={currentCourse}
              currentLessonSlug={params.lessonSlug}
              isAdmin={isAdmin}
              initiallyOpen
            />
          </div>
        ) : null}

        {profileData ? (
          // `-mb-7 pb-4` ponistava donji padding sidebara: avatar tako pada na isti y kao
          // avatar u prosirenoj kartici profila (koja je `-mb-7` + `py-4`).
          <div className="relative mt-auto -mb-7 flex flex-col items-center gap-2 pb-4">
            {railFlyout === "profile" ? (
              <AppAccountMenu
                locale={locale}
                placement="right"
                name={profileName}
                username={profileData?.username}
                initials={profileInitials}
                avatarUrl={profileAvatar}
                role={navigation.role}
                plan={navigation.plan}
                needsAttention={hasAccountAdvisory}
                creditsBalance={creditsBalance}
                languageHref={languageHref}
                upgradeHref={showUpgrade ? courseCatalogPath(locale) : undefined}
                onNavigate={() => setRailFlyout(null)}
                onSignOut={handleSignOut}
              />
            ) : null}
            {/* Mirrors the expanded sidebar, where the badge sits inside the profile card:
                the role belongs to the identity, not to the top of the navigation. */}
            <SidebarRoleBadge role={navigation.role} plan={navigation.plan} locale={locale} variant="collapsed" />
            <button type="button" aria-label={profileName} aria-expanded={railFlyout === "profile"} onClick={() => setRailFlyout((value) => value === "profile" ? null : "profile")} className="relative flex size-12 items-center justify-center overflow-visible rounded-full border-2 border-ink bg-yellow text-xs font-black shadow-[3px_3px_0_var(--shadow-hard-16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              <span className="flex size-full items-center justify-center overflow-hidden rounded-full">
                {profileAvatar ? (
                  /* Avatar URLs are user-provided at runtime and intentionally avoid Next image host restrictions. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profileAvatar} alt="" className="size-full object-cover" />
                ) : profileInitials}
              </span>
              {accountBadge > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-red-600 px-1 text-[9px] font-black text-white">{accountBadge > 99 ? "99+" : accountBadge}</span> : null}
            </button>
          </div>
        ) : null}
      </div>

      <div
        aria-hidden="true"
        onPointerDown={startSidebarHinge}
        className="absolute -right-2 top-0 z-[75] hidden h-full w-4 cursor-col-resize bg-transparent lg:block"
      />
    </aside>
      <AppBottomNav
        locale={locale}
        communityLandingHref={communityLandingHref}
        dashboardActive={dashboardActive}
        classroomActive={classroomActive}
        communityActive={communityActive}
        messagesActive={messagesActive}
        communityBadge={communityBadge}
        messagesBadge={messagesBadge}
        contextActive={contextActive}
        onOpenSections={() => setMobileOpen(true)}
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
  const myThreadsBadge = notificationSummary?.myThreads ?? 0;
  const pendingApprovalsBadge = notificationSummary?.pendingApprovals ?? 0;
  const chatSummary = useQuery(api.chat.getInboxSummary, isAuthenticated ? {} : "skip");
  const messagesBadge = chatSummary?.totalUnread ?? 0;
  const accountBadge = notificationSummary?.accountWarnings ?? 0;
  const profileStatus = useQuery(api.profiles.getViewerProfileStatus, isAuthenticated ? {} : "skip");
  const creditsBalance = useQuery(api.credits.getBalance, isAuthenticated ? {} : "skip");

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
      myThreadsBadge={myThreadsBadge}
      pendingApprovalsBadge={pendingApprovalsBadge}
      accountBadge={accountBadge}
      profileComplete={profileStatus?.complete ?? false}
      emailVerificationRequired={profileStatus?.advisories.emailVerification ?? false}
      passwordRecommended={profileStatus?.advisories.password ?? false}
      creditsBalance={creditsBalance?.balance}
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
