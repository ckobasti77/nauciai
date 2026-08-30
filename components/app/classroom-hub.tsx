"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowRight, BookOpen, Clock3, Compass, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CourseCatalogCard, CourseCatalogRow } from "@/components/app/course-catalog-card";
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
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton, Panel } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { lessonPath, trackPath } from "@/lib/app-routes";
import {
  formatCourseCount,
  groupByTrack,
  isCourseOwned,
  matchesCatalogFilter,
  type CatalogFilter,
  type CatalogTrackGroup,
  type CatalogTrackMeta,
} from "@/lib/course-catalog";
import type { ViewerProfile } from "@/lib/current-viewer";
import { localized, t as tr, withLocale, type Locale } from "@/lib/i18n";

type CourseEntry = {
  course: DashboardCourse;
  summary: ReturnType<typeof getProgressSummary>;
  /** Vlasnistvo za prikaz; `isCourseOwned` iz lib/course-catalog.ts, ne `hasAccess`. */
  owned: boolean;
};
type TrackMeta = CatalogTrackMeta;

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
  const [filter, setFilter] = useState<CatalogFilter>("all");

  const visibleCourses = useMemo(
    () => courses.filter((course) => isAdmin || course.status === "published"),
    [courses, isAdmin],
  );
  const entries: CourseEntry[] = useMemo(
    () =>
      visibleCourses.map((course) => ({
        course,
        summary: getProgressSummary(course, locale),
        owned: isCourseOwned(course, isAdmin),
      })),
    [visibleCourses, locale, isAdmin],
  );
  // „Nastavi", „Sledeće lekcije" i napredak smera računaju se SAMO iz kurseva koje
  // student ima. Ranije je to bio `hasAccess`, za koji je svaki objavljen kurs
  // dostupan — pa je hero nudio „Nastavi lekciju" u kurs koji je na kartici ispod
  // pisao „Zaključano".
  const ownedEntries = useMemo(() => entries.filter((entry) => entry.owned), [entries]);

  const trackGroups = useMemo(
    () => groupByTrack(entries, (entry) => entry.course.trackId, trackMeta),
    [entries, trackMeta],
  );

  const resume = useMemo(
    () =>
      ownedEntries
        .filter((entry) => Boolean(entry.summary.nextLesson))
        .sort((a, b) => (b.summary.lastActivityAt ?? 0) - (a.summary.lastActivityAt ?? 0))[0],
    [ownedEntries],
  );

  const upcoming = useMemo(
    () =>
      ownedEntries
        .filter((entry) => Boolean(entry.summary.nextLesson))
        .sort((a, b) => (b.summary.lastActivityAt ?? 0) - (a.summary.lastActivityAt ?? 0))
        .slice(0, 5),
    [ownedEntries],
  );

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) =>
        matchesCatalogFilter(
          {
            owned: entry.owned,
            totalLessons: entry.summary.totalLessons,
            completedLessons: entry.summary.completedLessons,
            percent: entry.summary.percent,
          },
          filter,
        ),
      ),
    [entries, filter],
  );

  // ?view scrolls to the matching zone; the sidebar's Smerovi/Kursevi sections link here.
  useEffect(() => {
    const target = view === "tracks" ? tracksRef.current : view === "courses" ? coursesRef.current : null;
    if (!target) return;
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [view]);

  const resumeLesson = resume?.summary.nextLesson;
  const resumePosition = resume
    ? Math.max(1, Math.min(resume.summary.completedLessons + 1, resume.summary.totalLessons))
    : 0;
  const resumeTotal = resume ? Math.max(resumePosition, resume.summary.totalLessons) : 0;

  return (
    <div className="space-y-6">
      {/* Zone 1 — Continue where you left off.
          Student bez ijednog otključanog kursa ovde dobija first-run blok, ali on
          više NE zamenjuje celu stranicu: katalog ispod je jedini razlog zbog kog
          taj student uopšte otvara Učionicu. */}
      {ownedEntries.length === 0 ? (
        <DashboardFirstRun
          locale={locale}
          profileName={profileName}
          // `hasCommunityPost` namerno izostaje: `getAppNavigation` taj podatak nema,
          // a Učionica zbog jednog čekboksa ne otvara drugi upit. Korak tada stoji
          // neoštikliran (vidi `lib/dashboard-first-run.ts`).
          signals={{
            hasUnlockedCourse: false,
            // Preko SVIH vidljivih kurseva, ne samo otključanih — isto kao
            // `overview.progress.completedLessons` na komandnoj tabli.
            completedLessons: entries.reduce((sum, entry) => sum + entry.summary.completedLessons, 0),
          }}
        />
      ) : (
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
                    "Prošao/la si sve lekcije koje imaš. Vrati se bilo kom kursu ispod da ponoviš gradivo ili otključaj nov kurs.",
                    "You have been through every lesson you have. Revisit any course below to go over it again, or unlock a new course.",
                  )}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

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
            <div className="divide-y-2 divide-line">
              {trackGroups.map((group) => (
                <TrackSection key={group.trackId} locale={locale} group={group} />
              ))}
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <EmptyState
                icon={Compass}
                title={tr(locale, "Smerovi još nisu napravljeni", "Tracks are not set up yet")}
                body={tr(
                  locale,
                  "Smer je više kurseva poređanih redom, od početka do kraja. Dok ih nema, kurseve biraš pojedinačno — spisak je odmah ispod.",
                  "A track is several courses lined up in order, from start to finish. Until tracks exist, pick courses one by one — the list is right below.",
                )}
              />
            </div>
          )}
        </Panel>
      </section>

      {/* Zone 3 — Catalog: every published course, unlocked and locked side by side */}
      <section ref={coursesRef} id="courses" className="scroll-mt-6">
        <Panel className="overflow-hidden">
          <div className="border-b-2 border-ink bg-paper-strong p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-muted">{tr(locale, "Kursevi", "Courses")}</p>
                <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">
                  {ownedEntries.length
                    ? tr(locale, "Izaberi gde nastavljaš", "Choose where to continue")
                    : tr(locale, "Izaberi svoj prvi kurs", "Choose your first course")}
                </h2>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 py-2 text-xs font-black text-ink">
                <BookOpen className="size-4" />
                {formatCourseCount(locale, visibleCourses.length)}
              </span>
            </div>
            {visibleCourses.length ? (
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
            ) : null}
          </div>
          {visibleCourses.length === 0 ? (
            <div className="p-5 sm:p-6">
              <EmptyState
                icon={BookOpen}
                title={tr(locale, "Još nema nijednog kursa", "No courses yet")}
                body={tr(
                  locale,
                  "Prvi kursevi se upravo pripremaju. Dok čekaš, upoznaj se sa ostalima u zajednici — tamo se javlja i kad nešto novo izađe.",
                  "The first courses are being prepared. In the meantime, meet the others in the community — that is also where new releases are announced.",
                )}
                action={
                  <LinkButton href={withLocale(locale, "/app/community")} tone="yellow">
                    {tr(locale, "Otvori zajednicu", "Open community")}
                  </LinkButton>
                }
              />
            </div>
          ) : filteredEntries.length ? (
            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
              {filteredEntries.map((entry) =>
                entry.owned ? (
                  <DashboardCourseCard
                    key={entry.course.slug}
                    locale={locale}
                    course={entry.course}
                    isAdmin={isAdmin}
                    summary={entry.summary}
                  />
                ) : (
                  <CourseCatalogCard key={entry.course.slug} locale={locale} course={entry.course} />
                ),
              )}
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

const COURSE_FILTERS: Array<{ id: CatalogFilter; sr: string; en: string }> = [
  { id: "all", sr: "Svi", en: "All" },
  { id: "inProgress", sr: "U toku", en: "In progress" },
  { id: "completed", sr: "Završeni", en: "Completed" },
  { id: "locked", sr: "Zaključani", en: "Locked" },
];

/**
 * Jedan smer sa svojim kursevima. Napredak se prikazuje tek kad student ima bar
 * jedan kurs iz tog smera — „0%" iznad četiri zaključana kursa nije informacija
 * nego prekor.
 */
function TrackSection({
  locale,
  group,
}: {
  locale: Locale;
  group: CatalogTrackGroup<CourseEntry>;
}) {
  const ownedCount = group.items.filter((entry) => entry.owned).length;
  const totalLessons = group.items.reduce((sum, entry) => sum + (entry.owned ? entry.summary.totalLessons : 0), 0);
  const completedLessons = group.items.reduce(
    (sum, entry) => sum + (entry.owned ? entry.summary.completedLessons : 0),
    0,
  );
  const percent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const title = localized(group.title, locale);

  return (
    <div>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <h3 className="text-xl font-black leading-tight text-ink">{title}</h3>
          <p className="mt-1 text-xs font-bold text-muted">
            {formatCourseCount(locale, group.items.length)}
            {ownedCount > 0 ? ` · ${tr(locale, `${ownedCount} otključano`, `${ownedCount} unlocked`)}` : null}
          </p>
        </div>
        {group.slug ? (
          <Link
            href={trackPath(locale, group.slug)}
            className="inline-flex w-fit shrink-0 items-center gap-1 text-xs font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {tr(locale, "Otvori smer", "Open track")}
            <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {ownedCount > 0 ? (
        <div className="px-5 pb-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 text-xs font-black uppercase text-muted">
            <span>{tr(locale, "Napredak", "Progress")}</span>
            <span>{percent}%</span>
          </div>
          <div className="mt-2">
            <CourseProgress
              percent={percent}
              label={tr(locale, `Napredak smera ${title}`, `Progress for ${title}`)}
            />
          </div>
        </div>
      ) : null}
      <ul className="divide-y-2 divide-line border-t-2 border-line">
        {group.items.map((entry) => (
          <CourseCatalogRow
            key={entry.course.slug}
            locale={locale}
            course={entry.course}
            owned={entry.owned}
            percent={entry.summary.percent}
          />
        ))}
      </ul>
    </div>
  );
}
