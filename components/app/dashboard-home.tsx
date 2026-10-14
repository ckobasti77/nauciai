"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowRight, Check, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  DashboardFirstRun,
  DashboardPulseSkeleton,
  DashboardWindowsSkeleton,
  staticCommandTableView,
  type CommandTableView,
  type DashboardCourse,
} from "@/components/app/dashboard-content";
import { DashboardPulse, DashboardWindowsGrid, type DashboardOverview } from "@/components/app/dashboard-windows";
import { useBelgradeToday } from "@/components/crea/game/crea-game-context";
import { CreaQuickStart } from "@/components/igra/dashboard/crea-quick-start";
import { DashboardHero } from "@/components/igra/dashboard/dashboard-hero";
import { useIgraProgress, type IgraProgress } from "@/components/igra/igra-progress-context";
import { IgraSkeleton } from "@/components/igra/igra-skeleton";
import { ProgressCard } from "@/components/igra/progress-card";
import { Panel, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { classroomPath, courseCatalogPath } from "@/lib/app-routes";
import type { ViewerProfile } from "@/lib/current-viewer";
import { buildFirstRunChecklist, firstRunDoneCount, firstRunZoneView, type FirstRunSignals } from "@/lib/dashboard-first-run";
import { readFirstRunReadyDismissed, writeFirstRunReadyDismissed } from "@/lib/dashboard-first-run-preference";
import { IGRA_DASHBOARD_COPY } from "@/lib/igra-copy";
import type { IgraDaypart } from "@/lib/igra-daypart";
import { pickDailyMission } from "@/lib/igra-mission";
import { bestStreakText, weekPlaceView } from "@/lib/igra-shell";
import { t as tr, withLocale, type Locale } from "@/lib/i18n";
import { publicProfilePath } from "@/lib/profile-links";
import { progressEncouragement } from "@/lib/progress-encouragement";

/**
 * Komandna tabla (`/app`). Živi u svom fajlu, odvojeno od `dashboard-content.tsx`: taj fajl
 * se (kroz `loading.tsx` i kartice kurseva) učitava na svakoj ruti aplikacije, a heroj,
 * kalendar i polica bedževa trebaju samo ovde.
 */

// Polica bedževa (sa katalogom bedževa) i kalendar su ispod prevoja, pa stižu u svom
// chunk-u posle heroja; dok ne stignu, mesto im drži blok iste visine.
const TrophyShelf = dynamic(() => import("@/components/igra/trophy-shelf").then((mod) => mod.TrophyShelf), {
  loading: () => <IgraSkeleton className="h-[9.5rem] surface-inset" />,
});
const InkCalendar = dynamic(() => import("@/components/igra/ink-calendar").then((mod) => mod.InkCalendar), {
  loading: () => <div className="h-[23.5rem] animate-pulse surface-card border-2 border-line bg-paper-strong xl:h-64" />,
});

// `localStorage` nema sopstvenu pretplatu unutar istog taba, pa je ovo najmanji
// mogući izvor promene za `useSyncExternalStore`: kad korisnik zatvori „sve spremno"
// traku, `notifyReadyBarChanged` obavesti render da je pročita ponovo. Isti obrazac
// kao `dismissalListeners` u `intro-panel.tsx`.
const readyBarListeners = new Set<() => void>();

function subscribeReadyBar(listener: () => void) {
  readyBarListeners.add(listener);
  return () => {
    readyBarListeners.delete(listener);
  };
}

function notifyReadyBarChanged() {
  for (const listener of readyBarListeners) listener();
}

// Jednoredna „sve spremno" traka: zamenjuje punu checklistu kad je student sve već
// odradio, da lista prvih koraka ne stoji zauvek kao prekor. Zatvara se na X i to
// se pamti po korisniku (`lib/dashboard-first-run-preference.ts`). Kad je zatvorena,
// zona se uopšte ne renderuje (vidi `DashboardHome`) i sve ispod se podiže.
function FirstRunReadyBar({ locale, onDismiss }: { locale: Locale; onDismiss?: () => void }) {
  return (
    <Panel className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 sketch-grid" />
      <div className="relative flex items-center gap-3 p-3 sm:p-4">
        <span className="grid size-9 shrink-0 place-items-center surface-media border-2 border-ink bg-ink text-paper-strong">
          <Check aria-hidden="true" className="size-5" />
        </span>
        <p className="min-w-0 flex-1 type-body-sm font-bold text-ink">
          <span className="font-black">{tr(locale, "Sve spremno", "All set")}</span>
          {" — "}
          {tr(locale, "sledeći korak:", "next step:")}{" "}
          <Link
            href={courseCatalogPath(locale)}
            className="inline-flex items-center gap-1 font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {tr(locale, "izaberi kurs", "choose a course")}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={tr(locale, "Zatvori i ne prikazuj ponovo", "Close and do not show again")}
            className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-line bg-paper text-ink transition hover:bg-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
    </Panel>
  );
}

/** Ima li već rad u Crei: poslednji radovi iz agregata ili bedž „Prvi rad" iz napretka. */
function hasCreaWork(overview: DashboardOverview | null, igra: IgraProgress | null | undefined): boolean | undefined {
  if (!overview) return undefined;
  if (overview.studio.items.length > 0) return true;
  const badge = igra?.badges.find((item) => item.key === "prvi-rad");
  return badge?.state === "unlocked" || badge?.state === "fresh";
}

// Komandna tabla (IGRA K08, plan `docs/igra/planovi/K07.md` §1): HEROJ (scena po dobu dana,
// pozdrav, misija dana) · PRVI KORACI (samo dok ih ima) · NAPREDAK · PULS (4 pločice) ·
// BEDŽEVI + CREA · PROZORI (grid 1/2/3) · KALENDAR.
// Live: `overview` iz getDashboardOverview. Statička: `overview === null` + `staticCourses`.
export function DashboardHome({
  locale,
  profile,
  overview,
  staticCourses,
  loading = false,
  daypart = "dan",
  igra,
  todayKey,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  overview: DashboardOverview | null;
  staticCourses?: DashboardCourse[];
  /** Upit još nije stigao: heroj (pozdrav i scena) se crta odmah, ostalo je skelet. */
  loading?: boolean;
  /** Doba dana u Beogradu; računa ga server (`igraDaypartNow`). */
  daypart?: IgraDaypart;
  /** Napredak iz ljuske: `undefined` dok se učitava, `null` kad ga nema (njegove sekcije se tada ne crtaju). */
  igra: IgraProgress | null | undefined;
  /** Beogradski dan; izlog ga zadaje da test podaci ne zavise od sata. */
  todayKey?: string;
}) {
  const profileName = profile?.name ?? "Student";
  const greetingName = profile?.firstName?.trim() || profile?.name?.trim() || null;
  const username = profile?.username ?? null;
  const liveToday = useBelgradeToday();
  const today = todayKey ?? liveToday;

  const view: CommandTableView = overview
    ? {
        hasUnlockedCourse: overview.firstRun.hasUnlockedCourse,
        hasCommunityPost: overview.firstRun.hasCommunityPost,
        resume: overview.resume,
        progress: overview.progress,
        activity: overview.activity,
        nextLessons: overview.nextLessons,
      }
    : staticCommandTableView(staticCourses ?? [], locale);

  const firstRunSignals: FirstRunSignals = {
    hasUnlockedCourse: view.hasUnlockedCourse,
    completedLessons: view.progress.completedLessons,
    hasCommunityPost: view.hasCommunityPost,
  };
  const firstRunSteps = buildFirstRunChecklist(firstRunSignals);

  // Da li je „sve spremno" traka zatvorena za ovaj nalog. Na serveru odgovor ne
  // postoji, pa je „zatvoreno" jedini bezbedan izbor: traka se pojavi tek posle
  // hidracije umesto da bljesne pa nestane pred onim ko ju je već zatvorio.
  const readyDismissed = useSyncExternalStore(
    subscribeReadyBar,
    () => (username ? readFirstRunReadyDismissed().includes(username) : false),
    () => true,
  );

  // Zona prvih koraka se MENJA, tabla se ne gasi (`firstRunZoneView`): „resume" sada nosi
  // misija dana u heroju, „checklist" su koraci ispod heroja, „compact" jednoredna traka.
  const zone = firstRunZoneView({
    hasUnlockedCourse: view.hasUnlockedCourse,
    hasResume: view.resume != null,
    totalLessons: view.progress.totalLessons,
    doneCount: firstRunDoneCount(firstRunSteps),
    stepCount: firstRunSteps.length,
    compactDismissed: readyDismissed,
  });

  // Misija čeka i napredak (`todayDone` menja izbor), da se naslov ne promeni pred očima.
  const mission =
    loading || igra === undefined
      ? undefined
      : pickDailyMission(
          {
            hasUnlockedCourse: view.hasUnlockedCourse,
            resume: view.resume,
            completedLessons: view.progress.completedLessons,
            hasCommunityPost: view.hasCommunityPost,
            hasCreaWork: hasCreaWork(overview, igra),
            todayDone: igra?.streak.todayDone ?? false,
          },
          locale,
        );
  const hasLessons = !loading && view.hasUnlockedCourse && view.progress.totalLessons > 0;

  return (
    <div className="space-y-6">
      <DashboardHero
        locale={locale}
        daypart={daypart}
        name={greetingName}
        mission={mission}
        secondary={!loading && view.hasUnlockedCourse ? { href: classroomPath(locale), label: IGRA_DASHBOARD_COPY.openClassroom[locale] } : undefined}
        note={
          hasLessons
            ? `${view.progress.completedLessons}/${view.progress.totalLessons} ${IGRA_DASHBOARD_COPY.lessonsDone[locale]} · ${progressEncouragement(locale, {
                completedLessons: view.progress.completedLessons,
                totalLessons: view.progress.totalLessons,
              })}`
            : undefined
        }
      />

      {loading ? null : zone === "checklist" ? (
        <DashboardFirstRun locale={locale} profileName={profileName} signals={firstRunSignals} embedded />
      ) : zone === "compact" ? (
        <FirstRunReadyBar
          locale={locale}
          onDismiss={
            username
              ? () => {
                  writeFirstRunReadyDismissed(username);
                  notifyReadyBarChanged();
                }
              : undefined
          }
        />
      ) : null}

      {igra === null ? null : igra ? <ProgressCard progress={igra} locale={locale} /> : <ProgressCard loading locale={locale} />}

      {/* Pločica „Rang" čita mesto iz napretka ljuske (K12: isti izvor kao panel), pa čeka i
          njega, kao i misija; bez napretka (`null`) stoji crta. */}
      {loading || igra === undefined ? (
        <DashboardPulseSkeleton />
      ) : (
        <DashboardPulse
          locale={locale}
          creditsBalance={overview?.studio.creditsBalance ?? 0}
          unreadMessages={overview?.messages.unreadTotal ?? 0}
          notifications={overview?.notifications.total ?? 0}
          rankView={weekPlaceView(igra, locale)}
        />
      )}

      <div className={cn("grid gap-6", igra !== null && "lg:grid-cols-2")}>
        {igra === null ? null : (
          <section data-motion="card" className="surface-card border-2 border-ink bg-paper-strong p-5 shadow-[6px_6px_0_0_var(--shadow-hard-13)] sm:p-6">
            {igra ? (
              <TrophyShelf badges={igra.badges} moreHref={username ? withLocale(locale, publicProfilePath(username)) : undefined} locale={locale} />
            ) : (
              <TrophyShelf loading locale={locale} />
            )}
          </section>
        )}
        <CreaQuickStart locale={locale} />
      </div>

      {loading ? (
        <DashboardWindowsSkeleton />
      ) : (
        <DashboardWindowsGrid locale={locale} overview={overview} nextLessons={view.nextLessons} hasUnlockedCourse={view.hasUnlockedCourse} />
      )}

      {loading ? (
        <InkCalendar loading locale={locale} />
      ) : (
        <InkCalendar
          activity={view.activity}
          recent={igra?.streak.recent}
          todayKey={today}
          note={igra && igra.streak.best > 0 ? bestStreakText(igra.streak.best, locale) : undefined}
          locale={locale}
        />
      )}
    </div>
  );
}

/**
 * Tabla nad živim podacima: JEDAN agregat (`getDashboardOverview`) i napredak koji ljuska
 * već drži (`useIgraProgress`, bez drugog upita). Tri stanja ostaju odvojena: učitava se
 * (auth ili upit), prazno (upit vratio ništa), učitano.
 */
export function LiveDashboardHome({ locale, profile, daypart }: { locale: Locale; profile?: ViewerProfile; daypart: IgraDaypart }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const overview = useQuery(api.dashboard.getDashboardOverview, isAuthenticated ? {} : "skip");
  const { progress } = useIgraProgress();

  return (
    <DashboardHome
      locale={locale}
      profile={profile}
      overview={overview ?? null}
      loading={authLoading || (isAuthenticated && overview === undefined)}
      daypart={daypart}
      igra={progress}
    />
  );
}
