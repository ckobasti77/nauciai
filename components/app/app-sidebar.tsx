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
  User,
} from "lucide-react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

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
    <div className="relative mt-5 lg:mt-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-[8px] border-2 border-ink bg-yellow px-3 py-2 text-left text-sm font-black text-ink"
        >
          <span className="flex min-w-0 items-center gap-2">
            <GraduationCap className="size-4 shrink-0" />
            <span className="truncate">{localized(currentCourse.title, locale)}</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 transition", open && "rotate-180")} />
        </button>
        {isAdmin ? <AddCourseAction locale={locale} nextSortOrder={nextSortOrder(courses)} iconOnly /> : null}
      </div>
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-[8px] border-2 border-ink bg-white p-2 shadow-[5px_5px_0_0_rgba(14,49,88,0.22)]">
          <div className="space-y-2">
            {courses.map((course) => {
              const comingSoon = isCourseComingSoon(course, isAdmin);
              const locked = isCourseLocked(course, isAdmin);
              const canEditCourse = Boolean(course.id && course.id !== course.slug);
              return (
                <div key={course.slug} className="rounded-[8px] border-2 border-line bg-paper p-2">
                  <div className="flex items-center gap-1">
                    {comingSoon ? (
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm font-black text-muted">
                        <span className="truncate">{localized(course.title, locale)}</span>
                        <span className="rounded-[6px] border-2 border-ink bg-white px-2 py-1 text-[11px] text-ink">
                          {locale === "sr" ? "Uskoro" : "Coming soon"}
                        </span>
                      </div>
                    ) : (
                      <Link
                        href={courseHref(locale, course.slug)}
                        onClick={() => setOpen(false)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm font-black text-ink hover:underline"
                      >
                        <span className="truncate">{localized(course.title, locale)}</span>
                        {locked ? <Lock className="size-4" /> : <ChevronRight className="size-4" />}
                      </Link>
                    )}
                    {isAdmin && canEditCourse ? (
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
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavLink({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: typeof LayoutDashboard;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 min-w-0 items-center justify-center gap-3 rounded-[8px] border-2 border-transparent px-3 py-2 text-sm font-extrabold text-ink transition hover:border-ink hover:bg-yellow sm:justify-start lg:w-full",
        active && "border-ink bg-paper",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
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
          <div key={part.id ?? part.slug} className={cn(depth > 0 && "ml-4")}>
            <div className="flex items-center gap-1">
              <Link
                href={partHref(locale, currentCourse.slug, lesson.slug, part.slug)}
                className={cn(
                  "flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-[6px] px-2 text-xs font-black text-muted hover:bg-paper hover:text-ink",
                  depth > 0 && "text-[11px]",
                )}
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{localized(part.title, locale)}</span>
              </Link>
              {isAdmin && part.id ? (
                <div className="flex items-center gap-1">
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
                </div>
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
          </div>
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

  function isExpanded(lessonSlug: string) {
    return Boolean(expandedLessons[lessonSlug] || currentLessonSlug === lessonSlug);
  }

  return (
    <div className="col-span-2 sm:col-span-3 lg:col-span-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-3 rounded-[8px] border-2 border-transparent px-3 py-2 text-sm font-extrabold text-ink transition hover:border-ink hover:bg-yellow sm:justify-start",
          currentLessonSlug && "border-ink bg-paper",
        )}
      >
        <BookOpen className="size-4" />
        <span className="flex-1 text-center sm:text-left">{dictionary[locale].lessons}</span>
        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-2 space-y-2 rounded-[8px] border-2 border-line bg-white p-2">
            {comingSoon ? (
              <p className="rounded-[8px] bg-paper p-3 text-sm font-black text-muted">
                {locale === "sr" ? "Lekcije za ovaj smer stižu uskoro." : "Lessons for this track are coming soon."}
              </p>
            ) : locked ? (
              <div className="rounded-[8px] bg-paper p-3">
                <p className="text-sm font-black text-muted">
                  {locale === "sr" ? "Smer je zaključan dok ne platiš pristup." : "This track is locked until payment."}
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
                <div key={module.id ?? module.title.sr} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 px-2 py-1">
                    <p className="min-w-0 truncate text-xs font-black uppercase text-muted">
                      {localized(module.title, locale)}
                    </p>
                    {isAdmin ? (
                      <div className="flex items-center gap-1">
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
                        />
                      </div>
                    ) : null}
                  </div>
                  {module.lessons.map((lesson) => {
                    const active = currentLessonSlug === lesson.slug;
                    const topLevelParts = childParts(lesson.parts);
                    return (
                      <div key={lesson.slug}>
                        <div
                          className={cn(
                            "flex items-center gap-1 rounded-[8px] border-2 border-transparent",
                            active && "border-ink bg-yellow",
                          )}
                        >
                          <Link
                            href={lessonHref(locale, currentCourse.slug, lesson.slug)}
                            className="flex min-h-10 min-w-0 flex-1 items-center gap-2 px-2 text-sm font-black text-ink"
                          >
                            <PlayCircle className="size-4 shrink-0" />
                            <span className="truncate">{localized(lesson.title, locale)}</span>
                          </Link>
                          {isAdmin ? (
                            <div className="flex items-center gap-1">
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
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLessons((current) => ({
                                ...current,
                                [lesson.slug]: !isExpanded(lesson.slug),
                              }))
                            }
                            className="mr-1 inline-flex size-8 items-center justify-center rounded-[6px] text-ink hover:bg-white"
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
                      </div>
                    );
                  })}
                </div>
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
}: {
  locale: Locale;
  navigation: AppNavigationData;
  source?: "server" | "live";
  authState?: "loading" | "authenticated" | "anonymous" | "unknown";
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

  return (
    <aside
      data-sidebar-source={source}
      data-sidebar-auth={authState}
      data-sidebar-role={navigation.role ?? "none"}
      data-sidebar-admin={isAdmin ? "true" : "false"}
      className="border-b-2 border-ink bg-white px-4 py-4 lg:w-72 lg:border-b-0 lg:border-r-2 lg:px-6 lg:py-7"
    >
      <div className="flex items-center justify-between gap-4 lg:block">
        <BrandMark href={withLocale(locale)} label={t.appName} />
      </div>
      {currentCourse ? (
        <CourseSwitcher locale={locale} courses={courses} currentCourse={currentCourse} isAdmin={isAdmin} />
      ) : null}
      {currentCourse ? (
        <nav className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col">
          <NavLink
            href={courseHref(locale, currentCourse.slug)}
            active={pathname === withLocale(locale, "/app")}
            icon={LayoutDashboard}
            label={t.dashboard}
          />
          <LessonsAccordion
            locale={locale}
            currentCourse={currentCourse}
            currentLessonSlug={params.lessonSlug}
            isAdmin={isAdmin}
          />
          <NavLink
            href={navHref(locale, "/app/community", currentCourse.slug)}
            active={pathname === withLocale(locale, "/app/community")}
            icon={MessageCircle}
            label={t.community}
          />
          <NavLink
            href={navHref(locale, "/app/profile", currentCourse.slug)}
            active={pathname === withLocale(locale, "/app/profile")}
            icon={User}
            label={t.profile}
          />
          <NavLink
            href={navHref(locale, "/app/billing", currentCourse.slug)}
            active={pathname === withLocale(locale, "/app/billing")}
            icon={CreditCard}
            label={t.billing}
          />
          <SignOutButton locale={locale} />
        </nav>
      ) : null}
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

  return (
    <AppSidebarContent
      locale={locale}
      navigation={resolvedNavigation}
      source={liveNavigation ? "live" : "server"}
      authState={authState}
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
