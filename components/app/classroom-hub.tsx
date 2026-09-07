"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowRight, BookOpen, Clock3, Compass, Database, Lock, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CourseCatalogCard } from "@/components/app/course-catalog-card";
import {
  CourseCover,
  CourseProgress,
  DashboardCourseCard,
  DashboardFirstRun,
  getProgressSummary,
  type DashboardCourse,
} from "@/components/app/dashboard-content";
import { coursesFromLive, isLiveCatalogEmpty, type LiveNavigationResult } from "@/components/app/dashboard-live";
import { SectionWave } from "@/components/marketing/section-wave";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { HandUnderline, LinkButton, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { coursePath, lessonPath, trackPath } from "@/lib/app-routes";
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
import { progressEncouragement } from "@/lib/progress-encouragement";
import { nextLevel, surfaceClass, type SurfaceLevel } from "@/lib/surface";

type CourseEntry = {
  course: DashboardCourse;
  summary: ReturnType<typeof getProgressSummary>;
  /** Vlasnistvo za prikaz; `isCourseOwned` iz lib/course-catalog.ts, ne `hasAccess`. */
  owned: boolean;
};
type TrackMeta = CatalogTrackMeta;

/**
 * Ritam Učionice (N10): četiri pune trake koje se smenjuju po istom pravilu kao javne
 * strane (`lib/surface.ts`) i razdvajaju talasom (`SectionWave`), umesto niza panela
 * jedne iste boje. Nivo trake se prosleđuje karticama u njoj, pa kartica uvek uzme
 * SUPROTNU boju — bez toga bi `bg-paper-strong` bio identičan traci u jednoj od dve
 * teme (svetla: paper-strong = surface-a; tamna: paper-strong = surface-b).
 */
const ZONE_RESUME: SurfaceLevel = 0;
const ZONE_TRACKS: SurfaceLevel = 1;
const ZONE_COURSES: SurfaceLevel = 0;
const ZONE_UP_NEXT: SurfaceLevel = 1;

/** Bleed do ivica `<main>`-a: trake su pune širine sadržaja, ne kartice u koloni. */
const ZONE_BLEED = "-mx-4 -mt-5 sm:-mx-6 md:-mx-8 md:-mt-8 -mb-[calc(4.5rem+env(safe-area-inset-bottom))] md:-mb-8";
/**
 * Poslednja traka sama nosi donji padding ljuske, jer ga `ZONE_BLEED` poništava da bi
 * traka išla do dna. Bez ovoga bi ispod poslednje trake ostala pruga u trećoj boji
 * (`--paper`), a na telefonu bi je pojela fiksna donja navigacija.
 */
const LAST_ZONE_PB = "pb-[calc(4.5rem+env(safe-area-inset-bottom)+3.5rem)] md:pb-24";
const ZONE_X = "px-4 sm:px-6 md:px-8";

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
    return <ClassroomHubSkeleton />;
  }

  const courses = coursesFromLive(live, fallbackCourses);
  // Admin-only obavestenje: baza je prazna, pa student vidi staticni katalog.
  // Student ne vidi nikakvu poruku - samo katalog.
  const showFallbackNotice = isAdmin && isLiveCatalogEmpty(live);

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
      showFallbackNotice={showFallbackNotice}
    />
  );
}

/**
 * Kostur Ucionice dok traje upit. Ranije je ovde stajao `DashboardHomeSkeleton`, cije
 * su visine merene po komandnoj tabli (puls od cetiri plocice, mreza prozora) — na
 * Ucionici je to bio kostur ekrana koji se posle ne pojavi, pa je swap pomerao sve.
 * Ove visine prate stvarne trake: A „nastavi" · B smerovi · C katalog (2 kolone).
 */
export function ClassroomHubSkeleton() {
  return (
    <div className={cn(ZONE_BLEED, surfaceClass(ZONE_UP_NEXT))} aria-busy="true" aria-label="Učitavanje / Loading">
      <div className={cn("relative pb-14 pt-6 md:pb-20 md:pt-10", ZONE_X, surfaceClass(ZONE_RESUME))}>
        <div className="mx-auto max-w-6xl">
          <div className="h-7 w-56 max-w-full animate-pulse rounded-full bg-line" />
          <div
            className={cn(
              "mt-6 h-[26rem] animate-pulse surface-card border-2 border-line lg:h-64",
              surfaceClass(nextLevel(ZONE_RESUME)),
            )}
          />
        </div>
      </div>
      <div className={cn("relative py-14 md:py-20", ZONE_X, surfaceClass(ZONE_TRACKS))}>
        <div className="mx-auto max-w-6xl">
          <div className="h-6 w-40 animate-pulse rounded-full bg-line" />
          <div className="mt-8 flex gap-4 overflow-hidden">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className={cn(
                  "h-44 w-56 shrink-0 animate-pulse surface-card border-2 border-line sm:w-64",
                  surfaceClass(nextLevel(ZONE_TRACKS)),
                )}
              />
            ))}
          </div>
        </div>
      </div>
      <div className={cn("relative pt-14 md:pt-20", ZONE_X, LAST_ZONE_PB, surfaceClass(ZONE_COURSES))}>
        <div className="mx-auto max-w-6xl">
          <div className="h-6 w-40 animate-pulse rounded-full bg-line" />
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className={cn(
                  "h-[26rem] animate-pulse surface-card border-2 border-line",
                  surfaceClass(nextLevel(ZONE_COURSES)),
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClassroomHubView({
  locale,
  isAdmin,
  profileName,
  courses,
  trackMeta,
  showFallbackNotice = false,
}: {
  locale: Locale;
  isAdmin: boolean;
  profileName: string;
  courses: DashboardCourse[];
  trackMeta: TrackMeta;
  /** Admin-only banner: baza je prazna, prikazuje se staticni katalog. */
  showFallbackNotice?: boolean;
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
  const hasUpNext = upcoming.length > 0;

  return (
    <div className={cn(ZONE_BLEED, surfaceClass(hasUpNext ? ZONE_UP_NEXT : ZONE_COURSES))}>
      {/* ── ZONA A · Nastavi gde si stao ─────────────────────────────────────── */}
      <section className={cn("relative pb-14 pt-6 md:pb-20 md:pt-10", ZONE_X, surfaceClass(ZONE_RESUME))}>
        <div className="mx-auto max-w-6xl">
          {showFallbackNotice ? (
            <div className="mb-6">
              <Callout icon={Database} title={tr(locale, "Baza nema kurseva", "The database has no courses")}>
                {tr(locale, "Prikazuje se statični sadržaj. Pokreni ", "Static content is being shown. Run ")}
                <code className="surface-media border border-line bg-paper px-1.5 py-0.5 font-mono text-xs">
                  npm run convex:seed -- --prod
                </code>
                {tr(locale, ".", ".")}
              </Callout>
            </div>
          ) : null}

          <p className="font-display type-display-sm text-ink">
            {locale === "sr" ? `Zdravo, ${profileName}` : `Hi, ${profileName}`}
          </p>

          {/* Student bez ijednog otključanog kursa ovde dobija first-run blok, ali on
              NE zamenjuje stranicu: katalog ispod je jedini razlog zbog kog taj student
              uopšte otvara Učionicu. */}
          {ownedEntries.length === 0 ? (
            <div className="mt-6">
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
            </div>
          ) : resume && resumeLesson ? (
            <ResumePanel
              locale={locale}
              entry={resume}
              lessonTitle={localized(resumeLesson.title, locale)}
              lessonHref={lessonPath(locale, resume.course.slug, resumeLesson.slug)}
              position={resumePosition}
              total={resumeTotal}
            />
          ) : (
            <div
              className={cn(
                "mt-6 surface-card border-2 border-ink p-6 shadow-[8px_8px_0_0_var(--shadow-hard-12)] sm:p-8",
                surfaceClass(nextLevel(ZONE_RESUME)),
              )}
            >
              <h1 className="type-h1 text-ink">{tr(locale, "Sve lekcije su završene", "Every lesson is done")}</h1>
              <p className="mt-2 type-body type-measure font-bold text-muted">
                {tr(
                  locale,
                  "Prošao/la si sve lekcije koje imaš. Vrati se bilo kom kursu ispod da ponoviš gradivo ili otključaj nov kurs.",
                  "You have been through every lesson you have. Revisit any course below to go over it again, or unlock a new course.",
                )}
              </p>
            </div>
          )}
        </div>
        <SectionWave from={ZONE_RESUME} to={ZONE_TRACKS} className="section-wave" />
      </section>

      {/* ── ZONA B · Smerovi kao horizontalne trake ──────────────────────────── */}
      <section
        ref={tracksRef}
        id="tracks"
        className={cn("relative scroll-mt-4 py-14 md:py-20", ZONE_X, surfaceClass(ZONE_TRACKS))}
      >
        <div className="mx-auto max-w-6xl">
          <p className="type-eyebrow text-muted">{tr(locale, "Smerovi", "Tracks")}</p>
          <h2 className="mt-2 type-h2 text-ink">{tr(locale, "Uči po smeru", "Learn by track")}</h2>
          {trackGroups.length ? (
            <div className="mt-8 space-y-12">
              {trackGroups.map((group) => (
                <TrackStrip key={group.trackId} locale={locale} group={group} />
              ))}
            </div>
          ) : (
            <div className="mt-8">
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
        </div>
        <SectionWave from={ZONE_TRACKS} to={ZONE_COURSES} className="section-wave" />
      </section>

      {/* ── ZONA C · Katalog: mreža od dve kolone, svaka kartica sa svojom petljom ── */}
      <section
        ref={coursesRef}
        id="courses"
        className={cn(
          "relative scroll-mt-4 pt-14 md:pt-20",
          ZONE_X,
          hasUpNext ? "pb-14 md:pb-20" : LAST_ZONE_PB,
          surfaceClass(ZONE_COURSES),
        )}
      >
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="type-eyebrow text-muted">{tr(locale, "Kursevi", "Courses")}</p>
              <h2 className="mt-2 type-h2 text-ink">
                {ownedEntries.length
                  ? tr(locale, "Izaberi gde nastavljaš", "Choose where to continue")
                  : tr(locale, "Izaberi svoj prvi kurs", "Choose your first course")}
              </h2>
              {/* Katalog je prodajna zona Učionice — školski potpis je nosi isto kao
                  naslov marketinga, u aplikacijskoj veličini. */}
              <HandUnderline size="sm" className="mt-1" />
            </div>
            <span
              className={cn(
                "inline-flex w-fit items-center gap-2 rounded-full border-2 border-ink px-4 py-2 text-xs font-black text-ink",
                surfaceClass(nextLevel(ZONE_COURSES)),
              )}
            >
              <BookOpen className="size-4" />
              {formatCourseCount(locale, visibleCourses.length)}
            </span>
          </div>

          {visibleCourses.length ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {COURSE_FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  aria-pressed={filter === option.id}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-full border-2 px-4 py-1.5 text-xs font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    filter === option.id
                      ? "border-ink bg-yellow text-ink"
                      : cn("border-line text-muted hover:text-ink", surfaceClass(nextLevel(ZONE_COURSES))),
                  )}
                >
                  {tr(locale, option.sr, option.en)}
                </button>
              ))}
            </div>
          ) : null}

          {visibleCourses.length === 0 ? (
            <div className="mt-8">
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
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {filteredEntries.map((entry) =>
                entry.owned ? (
                  <DashboardCourseCard
                    key={entry.course.slug}
                    locale={locale}
                    course={entry.course}
                    isAdmin={isAdmin}
                    summary={entry.summary}
                    level={ZONE_COURSES}
                    loop
                  />
                ) : (
                  <CourseCatalogCard
                    key={entry.course.slug}
                    locale={locale}
                    course={entry.course}
                    level={ZONE_COURSES}
                    loop
                  />
                ),
              )}
            </div>
          ) : (
            // Filter bez pogodaka je do U11 bio jedan red teksta u panelu visokom
            // koliko i mreža kartica — pola praznog panela bez ijednog sledećeg koraka.
            <div className="mt-8">
              <EmptyState
                icon={BookOpen}
                title={tr(locale, "Nema kurseva u ovom filteru", "No courses match this filter")}
                body={tr(
                  locale,
                  "Izaberi „Svi” iznad da vidiš sve kurseve koji postoje.",
                  "Pick “All” above to see every course there is.",
                )}
              />
            </div>
          )}
        </div>
        {hasUpNext ? <SectionWave from={ZONE_COURSES} to={ZONE_UP_NEXT} className="section-wave" /> : null}
      </section>

      {/* ── ZONA D · Sledeće lekcije ─────────────────────────────────────────── */}
      {hasUpNext ? (
        <section className={cn("relative pt-14 md:pt-20", ZONE_X, LAST_ZONE_PB, surfaceClass(ZONE_UP_NEXT))}>
          <div className="mx-auto max-w-6xl">
            <p className="type-eyebrow text-muted">{tr(locale, "Nastavlja se", "Up next")}</p>
            <h2 className="mt-2 type-h2 text-ink">{tr(locale, "Sledeće lekcije", "The next lessons")}</h2>
            <ul className="mt-6 divide-y-2 divide-line border-y-2 border-line">
              {upcoming.map((entry) => {
                const lesson = entry.summary.nextLesson;
                if (!lesson) return null;
                return (
                  <li key={`${entry.course.slug}-${lesson.slug}`}>
                    <Link
                      href={lessonPath(locale, entry.course.slug, lesson.slug)}
                      className="flex items-center gap-4 px-2 py-4 transition-colors hover:bg-ink/6 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
                        <PlayCircle className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate type-h4 text-ink">{localized(lesson.title, locale)}</span>
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
          </div>
        </section>
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
 * Zona A: širok blok sa VELIKIM medijem levo i odlukom desno. Medij je bešavna petlja
 * kursa (`CourseCover loop`) — isti mehanizam kao na javnim stranama: IntersectionObserver
 * pušta tek u kadru, pauzira van njega, a `prefers-reduced-motion` i ušteda podataka
 * ostavljaju mirni poster.
 */
function ResumePanel({
  locale,
  entry,
  lessonTitle,
  lessonHref,
  position,
  total,
}: {
  locale: Locale;
  entry: CourseEntry;
  lessonTitle: string;
  lessonHref: string;
  position: number;
  total: number;
}) {
  const cardLevel = nextLevel(ZONE_RESUME);
  const courseTitle = localized(entry.course.title, locale);

  return (
    <article
      data-motion="hero"
      className={cn(
        "mt-6 grid gap-0 overflow-hidden surface-card border-2 border-ink shadow-[8px_8px_0_0_var(--shadow-hard-12)] lg:grid-cols-2",
        surfaceClass(cardLevel),
      )}
    >
      <div className="p-3">
        <div
          className={cn(
            // N12: kartica već nosi pun okvir grupe, pa medij ima SAMO tanku unutrašnju
            // ivicu (da bled kadar ne iscuri u papir), ne i drugi pun okvir.
            "relative aspect-[16/9] overflow-hidden surface-media shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]",
            surfaceClass(nextLevel(cardLevel)),
          )}
        >
          <CourseCover course={entry.course} locale={locale} loop />
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-3 px-5 pb-6 pt-1 lg:py-8 lg:pl-3 lg:pr-8">
        <p className="type-eyebrow text-muted">{tr(locale, "Nastavi gde si stao", "Continue where you left off")}</p>
        <h1 className="type-h1 text-ink">{courseTitle}</h1>
        <p className="type-body font-bold text-muted">
          <span className="font-black text-ink">
            {tr(locale, `Lekcija ${position}/${total}`, `Lesson ${position}/${total}`)}
          </span>
          {" · "}
          {lessonTitle}
        </p>
        <div>
          <div className="flex items-end justify-between gap-3">
            <p className="type-eyebrow text-muted">{tr(locale, "Napredak", "Progress")}</p>
            <p className="shrink-0 type-h3 text-ink">{entry.summary.percent}%</p>
          </div>
          <div className="mt-2">
            <CourseProgress
              percent={entry.summary.percent}
              label={tr(locale, `Napredak kursa ${courseTitle}`, `Progress for ${courseTitle}`)}
            />
          </div>
          <p className="mt-2 text-xs font-bold text-muted">
            {progressEncouragement(locale, {
              completedLessons: entry.summary.completedLessons,
              totalLessons: entry.summary.totalLessons,
            })}
          </p>
        </div>
        <div className="mt-1">
          <LinkButton href={lessonHref} tone="yellow" size="lg">
            <PlayCircle className="size-5" />
            {entry.summary.completedLessons === 0
              ? tr(locale, "Započni", "Start")
              : tr(locale, "Nastavi", "Continue")}
          </LinkButton>
        </div>
      </div>
    </article>
  );
}

/**
 * Zona B: jedan smer kao HORIZONTALNA traka — naslov smera i minijature kurseva u njemu.
 * Napredak se prikazuje tek kad student ima bar jedan kurs iz tog smera — „0%" iznad
 * četiri zaključana kursa nije informacija nego prekor.
 */
function TrackStrip({ locale, group }: { locale: Locale; group: CatalogTrackGroup<CourseEntry> }) {
  const ownedCount = group.items.filter((entry) => entry.owned).length;
  const totalLessons = group.items.reduce((sum, entry) => sum + (entry.owned ? entry.summary.totalLessons : 0), 0);
  const completedLessons = group.items.reduce(
    (sum, entry) => sum + (entry.owned ? entry.summary.completedLessons : 0),
    0,
  );
  const percent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const title = localized(group.title, locale);
  const tileLevel = nextLevel(ZONE_TRACKS);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 className="type-h3 text-ink">{title}</h3>
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
        <div className="mt-3 max-w-md">
          <div className="flex items-end justify-between gap-3">
            <p className="type-eyebrow text-muted">{tr(locale, "Napredak", "Progress")}</p>
            <p className="shrink-0 type-h4 text-ink">{percent}%</p>
          </div>
          <div className="mt-2">
            <CourseProgress
              percent={percent}
              label={tr(locale, `Napredak smera ${title}`, `Progress for ${title}`)}
            />
          </div>
          <p className="mt-2 text-xs font-bold text-muted">
            {progressEncouragement(locale, { completedLessons, totalLessons })}
          </p>
        </div>
      ) : null}

      {/* Minijature: traka koja se skroluje vodoravno umesto vertikalne liste. Svaka je
          ceo link, pa je klik meta cela pločica, ne samo naslov. */}
      <ul className="mt-5 flex snap-x gap-4 overflow-x-auto pb-2">
        {group.items.map((entry) => (
          <li key={entry.course.slug} className="w-56 shrink-0 snap-start sm:w-64">
            <Link
              href={trackTileHref(locale, entry)}
              className={cn(
                "group block h-full overflow-hidden surface-card border-2 border-ink shadow-[4px_4px_0_0_var(--shadow-hard-12)] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--shadow-hard-16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                surfaceClass(tileLevel),
              )}
            >
              <div className="p-2">
                <div
                  className={cn(
                    // Ista pločica kao u zoni A: jedan okvir na kartici, tanka
                    // unutrašnja ivica na mediju (N12).
                    "relative aspect-[16/9] overflow-hidden surface-media shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]",
                    surfaceClass(nextLevel(tileLevel)),
                  )}
                >
                  <CourseCover course={entry.course} locale={locale} />
                  {entry.owned ? null : (
                    <>
                      <div aria-hidden="true" className="pointer-events-none absolute inset-0 ink-hatch" />
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border-2 border-ink bg-paper-strong px-2 py-0.5 type-eyebrow-sm text-ink">
                        <Lock className="size-3" />
                        {tr(locale, "Zaključano", "Locked")}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="px-3 pb-3">
                <p className="truncate type-h4 text-ink">{localized(entry.course.title, locale)}</p>
                <p className="mt-1 text-xs font-bold text-muted">
                  {entry.owned
                    ? tr(locale, `${entry.summary.percent}% završeno`, `${entry.summary.percent}% done`)
                    : tr(locale, "Otključaj kurs", "Unlock the course")}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Minijatura vodi tamo gde student stvarno ide: otključan kurs u sledeću lekciju,
 * zaključan na stranicu kursa gde stoji kupovina.
 */
function trackTileHref(locale: Locale, entry: CourseEntry): string {
  const next = entry.owned ? entry.summary.nextLesson : undefined;
  return next ? lessonPath(locale, entry.course.slug, next.slug) : coursePath(locale, entry.course.slug);
}
