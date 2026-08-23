"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowRight, BookOpen, Clock3, Compass, GraduationCap, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  CourseCover,
  CourseProgress,
  DashboardCourseCard,
  DashboardFirstRun,
  DashboardHomeSkeleton,
  getProgressSummary,
  type DashboardCourse,
} from "@/components/app/dashboard-content";
import { coursesFromLive, type LiveNavigationResult } from "@/components/app/dashboard-live";
import { LinkButton, Panel } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { lessonPath, trackPath } from "@/lib/app-routes";
import type { ViewerProfile } from "@/lib/current-viewer";
import { localized, t as tr, type Locale, type LocalizedText } from "@/lib/i18n";

type CourseEntry = { course: DashboardCourse; summary: ReturnType<typeof getProgressSummary> };
type TrackMeta = Record<string, { slug?: string; title: LocalizedText }>;
type CourseFilter = "all" | "inProgress" | "completed" | "locked";

/**
 * Live path: reads the same `getAppNavigation` payload the sidebar and dashboard use, so the hub
 * never runs its own query. `coursesFromLive` gives cards their per-lesson progress; the raw result
 * carries trackSlug/trackTitle (which the DashboardCourse shape drops), so track grouping reads it
 * straight off the query instead of a second round-trip.
 */
export function LiveClassroomHub({
  locale,
  profile,
  fallbackCourses,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  fallbackCourses: DashboardCourse[];
}) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const live = useQuery(api.courses.getAppNavigation, isAuthenticated ? {} : "skip") as LiveNavigationResult;
  const isAdmin = profile?.role === "admin" || live?.profile?.role === "admin";

  // Same three states as the dashboard: loading (auth resolving or query undefined), empty, loaded.
  if (authLoading || (isAuthenticated && live === undefined)) {
    return <DashboardHomeSkeleton />;
  }

  const courses = coursesFromLive(live, fallbackCourses);

  const trackMeta: TrackMeta = {};
  for (const course of live?.courses ?? []) {
    if (!course.trackId || trackMeta[course.trackId]) continue;
    const sr = course.trackTitleSr ?? course.trackTitleEn ?? "";
    const en = course.trackTitleEn ?? course.trackTitleSr ?? "";
    if (!sr && !en) continue;
    trackMeta[course.trackId] = { slug: course.trackSlug, title: { sr, en } };
  }

  return (
    <ClassroomHubView
      locale={locale}
      isAdmin={isAdmin}
      profileName={profile?.name ?? "Student"}
      courses={courses}
      trackMeta={trackMeta}
    />
  );
}

export function ClassroomHubView({
  locale,
  isAdmin,
  profileName,
  courses,
  trackMeta,
}: {
  locale: Locale;
  isAdmin: boolean;
  profileName: string;
  courses: DashboardCourse[];
  trackMeta: TrackMeta;
}) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const tracksRef = useRef<HTMLElement>(null);
  const coursesRef = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState<CourseFilter>("all");

  const visibleCourses = useMemo(
    () => courses.filter((course) => isAdmin || course.status === "published"),
    [courses, isAdmin],
  );
  const entries: CourseEntry[] = useMemo(
    () => visibleCourses.map((course) => ({ course, summary: getProgressSummary(course, locale) })),
    [visibleCourses, locale],
  );
  const accessible = useMemo(
    () => entries.filter((entry) => isAdmin || entry.course.hasAccess),
    [entries, isAdmin],
  );

  const trackGroups = useMemo(() => groupByTrack(entries, trackMeta), [entries, trackMeta]);

  const resume = useMemo(
    () =>
      accessible
        .filter((entry) => Boolean(entry.summary.nextLesson))
        .sort((a, b) => (b.summary.lastActivityAt ?? 0) - (a.summary.lastActivityAt ?? 0))[0],
    [accessible],
  );

  const upcoming = useMemo(
    () =>
      accessible
        .filter((entry) => Boolean(entry.summary.nextLesson))
        .sort((a, b) => (b.summary.lastActivityAt ?? 0) - (a.summary.lastActivityAt ?? 0))
        .slice(0, 5),
    [accessible],
  );

  const filteredEntries = useMemo(() => entries.filter((entry) => matchesFilter(entry, filter)), [entries, filter]);

  // ?view scrolls to the matching zone; the sidebar's Smerovi/Kursevi sections link here.
  useEffect(() => {
    const target = view === "tracks" ? tracksRef.current : view === "courses" ? coursesRef.current : null;
    if (!target) return;
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [view]);

  if (!accessible.length) {
    return <DashboardFirstRun locale={locale} profileName={profileName} />;
  }

  const resumeLesson = resume?.summary.nextLesson;
  const resumePosition = resume
    ? Math.max(1, Math.min(resume.summary.completedLessons + 1, resume.summary.totalLessons))
    : 0;
  const resumeTotal = resume ? Math.max(resumePosition, resume.summary.totalLessons) : 0;

  return (
    <div className="space-y-6">
      {/* Zone 1 — Continue where you left off */}
      <section
        data-motion="hero"
        className="overflow-hidden rounded-[16px] border-2 border-ink bg-paper-strong shadow-[6px_6px_0_0_var(--shadow-hard-12)]"
      >
        <div className="p-4 sm:p-5 lg:p-6" data-motion="copy">
          <p className="text-sm font-black uppercase text-muted">
            {locale === "sr" ? `Zdravo, ${profileName}` : `Hi, ${profileName}`}
          </p>
          {resume && resumeLesson ? (
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-[8px] bg-paper sm:w-44">
                <CourseCover course={resume.course} locale={locale} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase text-muted">
                  {tr(locale, "Nastavi gde si stao", "Continue where you left off")}
                </p>
                <h1 className="mt-2 text-2xl font-black leading-tight tracking-[-0.035em] text-ink sm:text-3xl">
                  {localized(resume.course.title, locale)}
                </h1>
                <p className="mt-2 text-sm font-bold leading-6 text-muted sm:text-base">
                  <span className="font-black text-ink">
                    {tr(locale, `Lekcija ${resumePosition}/${resumeTotal}`, `Lesson ${resumePosition}/${resumeTotal}`)}
                  </span>
                  {" · "}
                  {localized(resumeLesson.title, locale)}
                </p>
                <div className="mt-4">
                  <LinkButton
                    href={lessonPath(locale, resume.course.slug, resumeLesson.slug)}
                    tone="yellow"
                    size="lg"
                  >
                    <PlayCircle className="size-5" />
                    {resume.summary.completedLessons === 0
                      ? tr(locale, "Započni lekciju", "Start lesson")
                      : tr(locale, "Nastavi lekciju", "Continue lesson")}
                  </LinkButton>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <h1 className="text-2xl font-black leading-tight tracking-[-0.035em] text-ink sm:text-3xl">
                {tr(locale, "Sve lekcije su završene", "Every lesson is done")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-muted sm:text-base">
                {tr(
                  locale,
                  "Nema više lekcija na čekanju. Vrati se bilo kom kursu ispod da ponoviš gradivo.",
                  "Nothing is queued up. Revisit any course below to go over the material again.",
                )}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Zone 2 — Tracks */}
      <section ref={tracksRef} id="tracks" className="scroll-mt-6">
        <Panel className="overflow-hidden">
          <div className="border-b-2 border-ink bg-paper-strong p-5 sm:p-6">
            <p className="text-xs font-black uppercase text-muted">{tr(locale, "Smerovi", "Tracks")}</p>
            <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">
              {tr(locale, "Uči po smeru", "Learn by track")}
            </h2>
          </div>
          {trackGroups.length ? (
            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
              {trackGroups.map((group) => (
                <TrackCard key={group.trackId} locale={locale} group={group} />
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 p-5 text-sm font-bold text-muted sm:p-6">
              <Compass className="size-4 shrink-0 text-ink" />
              {tr(
                locale,
                "Kursevi još nisu grupisani u smerove.",
                "Courses are not grouped into tracks yet.",
              )}
            </p>
          )}
        </Panel>
      </section>

      {/* Zone 3 — Courses + filter */}
      <section ref={coursesRef} id="courses" className="scroll-mt-6">
        <Panel className="overflow-hidden">
          <div className="border-b-2 border-ink bg-paper-strong p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-muted">{tr(locale, "Kursevi", "Courses")}</p>
                <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">
                  {tr(locale, "Izaberi gde nastavljaš", "Choose where to continue")}
                </h2>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 py-2 text-xs font-black text-ink">
                <BookOpen className="size-4" />
                {visibleCourses.length} {tr(locale, "kursa", "courses")}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {COURSE_FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  aria-pressed={filter === option.id}
                  className={
                    filter === option.id
                      ? "inline-flex items-center rounded-full border-2 border-ink bg-yellow px-4 py-1.5 text-xs font-black text-ink"
                      : "inline-flex items-center rounded-full border-2 border-line bg-paper px-4 py-1.5 text-xs font-black text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  }
                >
                  {tr(locale, option.sr, option.en)}
                </button>
              ))}
            </div>
          </div>
          {filteredEntries.length ? (
            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
              {filteredEntries.map((entry) => (
                <DashboardCourseCard
                  key={entry.course.slug}
                  locale={locale}
                  course={entry.course}
                  isAdmin={isAdmin}
                  summary={entry.summary}
                />
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 p-5 text-sm font-bold text-muted sm:p-6">
              <BookOpen className="size-4 shrink-0 text-ink" />
              {tr(locale, "Nema kurseva u ovom filteru.", "No courses match this filter.")}
            </p>
          )}
        </Panel>
      </section>

      {/* Zone 4 — Up next */}
      {upcoming.length ? (
        <Panel className="overflow-hidden">
          <div className="border-b-2 border-ink bg-paper-strong p-5 sm:p-6">
            <p className="text-xs font-black uppercase text-muted">{tr(locale, "Nastavlja se", "Up next")}</p>
            <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">
              {tr(locale, "Sledeće lekcije", "The next lessons")}
            </h2>
          </div>
          <ul className="divide-y-2 divide-line">
            {upcoming.map((entry) => {
              const lesson = entry.summary.nextLesson;
              if (!lesson) return null;
              return (
                <li key={`${entry.course.slug}-${lesson.slug}`}>
                  <Link
                    href={lessonPath(locale, entry.course.slug, lesson.slug)}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink sm:px-6"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
                      <PlayCircle className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-black text-ink">
                        {localized(lesson.title, locale)}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-xs font-bold text-muted">
                        <span className="truncate">{localized(entry.course.title, locale)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3.5" />
                          {lesson.duration}
                        </span>
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-ink" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

const COURSE_FILTERS: Array<{ id: CourseFilter; sr: string; en: string }> = [
  { id: "all", sr: "Svi", en: "All" },
  { id: "inProgress", sr: "U toku", en: "In progress" },
  { id: "completed", sr: "Završeni", en: "Completed" },
  { id: "locked", sr: "Zaključani", en: "Locked" },
];

function matchesFilter(entry: CourseEntry, filter: CourseFilter) {
  if (filter === "all") return true;
  if (filter === "locked") return !entry.course.hasAccess;
  if (filter === "completed") return entry.summary.totalLessons > 0 && entry.summary.percent === 100;
  if (filter === "inProgress") return entry.summary.completedLessons > 0 && entry.summary.percent < 100;
  return true;
}

type TrackGroup = {
  trackId: string;
  slug?: string;
  title: LocalizedText;
  count: number;
  percent: number;
};

function groupByTrack(entries: CourseEntry[], trackMeta: TrackMeta): TrackGroup[] {
  const buckets = new Map<string, CourseEntry[]>();
  for (const entry of entries) {
    const trackId = entry.course.trackId;
    if (!trackId || !trackMeta[trackId]) continue;
    const bucket = buckets.get(trackId) ?? [];
    bucket.push(entry);
    buckets.set(trackId, bucket);
  }

  return Array.from(buckets.entries()).map(([trackId, items]) => {
    const totalLessons = items.reduce((sum, item) => sum + item.summary.totalLessons, 0);
    const completedLessons = items.reduce((sum, item) => sum + item.summary.completedLessons, 0);
    return {
      trackId,
      slug: trackMeta[trackId].slug,
      title: trackMeta[trackId].title,
      count: items.length,
      percent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
    };
  });
}

function TrackCard({ locale, group }: { locale: Locale; group: TrackGroup }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Compass className="size-5" />
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-paper px-3 py-1 text-[11px] font-black uppercase text-ink">
          <GraduationCap className="size-3.5" />
          {group.count} {tr(locale, "kursa", "courses")}
        </span>
      </div>
      <h3 className="mt-4 text-xl font-black leading-tight text-ink">{localized(group.title, locale)}</h3>
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs font-black uppercase text-muted">
          <span>{tr(locale, "Napredak", "Progress")}</span>
          <span>{group.percent}%</span>
        </div>
        <div className="mt-2">
          <CourseProgress
            percent={group.percent}
            label={tr(
              locale,
              `Napredak smera ${localized(group.title, locale)}`,
              `Progress for ${localized(group.title, locale)}`,
            )}
          />
        </div>
      </div>
    </>
  );

  if (!group.slug) {
    return <div className="rounded-[16px] border-2 border-line bg-paper p-5">{body}</div>;
  }

  return (
    <Link
      href={trackPath(locale, group.slug)}
      className="block rounded-[16px] border-2 border-ink bg-paper-strong p-5 shadow-[6px_6px_0_0_var(--shadow-hard-12)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {body}
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-ink underline decoration-2 underline-offset-4">
        {tr(locale, "Otvori smer", "Open track")}
        <ArrowRight className="size-3.5" />
      </span>
    </Link>
  );
}
