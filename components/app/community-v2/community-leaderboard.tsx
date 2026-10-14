"use client";

import { BookOpenCheck, CheckCircle2, ChevronDown, HelpCircle, Palette, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";

import { FlipOrder } from "@/components/igra/leaderboard/flip-order";
import { RankAvatar } from "@/components/igra/leaderboard/rank-avatar";
import { WeekCountdown } from "@/components/igra/leaderboard/week-countdown";
import { useEnterStagger } from "@/components/igra/motion/use-enter-stagger";
import { Odometer } from "@/components/igra/odometer";
import { Podium } from "@/components/igra/podium";
import { cn } from "@/components/ui/primitives";
import { classroomPath } from "@/lib/app-routes";
import { formatLevel } from "@/lib/igra-a11y";
import { IGRA_LEADERBOARD_COPY } from "@/lib/igra-copy";
import {
  rowXpIsTotal,
  splitPodium,
  unrankedHint,
  viewerBar,
  type LeaderboardPeriod,
  type LeaderboardScopeKind,
  type ViewerBar,
} from "@/lib/igra-leaderboard";
import { levelFromXp } from "@/lib/igra-level";
import { IGRA_MOTION } from "@/lib/igra-motion";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import { fallbackCommunityFilters, useCommunityFilters, useLeaderboard } from "./community-data";
import { CommunityScopeControls, useCommunityQueryParams, useResolvedCommunityScope } from "./community-filters";
import { CommunityStickyToolbar } from "./community-sticky-toolbar";
import {
  EmptyCommunityState,
  LearningSpine,
  LoadMoreButton,
} from "./community-shared";
import type { CommunityFilters, LeaderboardRow } from "./community-types";

export function useLeaderboardPeriod() {
  const { searchParams, update } = useCommunityQueryParams();
  const period: LeaderboardPeriod = searchParams.get("period") === "all_time" ? "all_time" : "week";
  return {
    period,
    setPeriod: (next: LeaderboardPeriod) => update({ period: next === "week" ? undefined : next }),
  };
}

export function CommunityLeaderboardPage({ locale }: { locale: Locale }) {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return <LiveLeaderboardPage locale={locale} />;
  return <StaticLeaderboardPage locale={locale} />;
}

function StaticLeaderboardPage({ locale }: { locale: Locale }) {
  const scopeState = useResolvedCommunityScope(fallbackCommunityFilters, locale);
  const periodState = useLeaderboardPeriod();
  return (
    <LeaderboardView
      locale={locale}
      filters={fallbackCommunityFilters}
      scopeState={scopeState}
      periodState={periodState}
      rows={[]}
      viewer={undefined}
      loading={false}
      canLoadMore={false}
      loadingMore={false}
    />
  );
}

function LiveLeaderboardPage({ locale }: { locale: Locale }) {
  const { filters, isLoading: filtersLoading } = useCommunityFilters(true);
  const scopeState = useResolvedCommunityScope(filters, locale);
  const periodState = useLeaderboardPeriod();
  const board = useLeaderboard({
    scope: filtersLoading ? { kind: "global" } : scopeState.scope,
    period: periodState.period,
  });

  return (
    <LeaderboardView
      locale={locale}
      filters={filters}
      scopeState={scopeState}
      periodState={periodState}
      rows={board.results}
      viewer={board.viewer}
      loading={filtersLoading || board.isInitialLoading}
      canLoadMore={board.status === "CanLoadMore"}
      loadingMore={board.status === "LoadingMore"}
      onLoadMore={() => board.loadMore(20)}
    />
  );
}

const LB = IGRA_LEADERBOARD_COPY;

function memberHref(locale: Locale, username: string | undefined) {
  return username ? withLocale(locale, `/app/members/${username}`) : undefined;
}

/**
 * XP se vrti samo pri prvom prikazu liste (K12): redovi koji stignu posle (osvežen upit,
 * „Učitaj još") odmah stoje na vrednosti. Prozor traje koliko jedno brojanje.
 */
function useFirstShowCount(ready: boolean) {
  const [counting, setCounting] = useState(true);
  useEffect(() => {
    if (!ready || !counting) return;
    const timer = window.setTimeout(() => setCounting(false), (IGRA_MOTION.count + 0.3) * 1000);
    return () => window.clearTimeout(timer);
  }, [ready, counting]);
  return counting;
}

/** Da li je moj pravi red (podijum ili lista) u kadru, iznad pojasa koji zauzima „ti" red. */
function useViewerOnScreen(rootRef: RefObject<HTMLElement | null>, watchKey: string | null) {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const target = watchKey ? rootRef.current?.querySelector("[data-rank-viewer]") : null;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? false), {
      rootMargin: "0px 0px -144px 0px",
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [rootRef, watchKey]);
  return watchKey ? onScreen : false;
}

/**
 * Ime i avatar u redu. `scroll-m*`: fokusiran red ne ostaje ispod lepljivih traka - „ti" reda
 * dole i filtera gore (148 px na telefonu, 106 px na računaru; izmereno u K28).
 */
const ROW_MEMBER =
  "flex min-h-11 min-w-0 scroll-mt-44 scroll-mb-40 items-center gap-3 surface-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:scroll-mt-32 md:scroll-mb-24";

function LeaderboardRowItem({
  locale,
  row,
  showLevel,
  countUp = false,
  inBar = false,
  duplicate = false,
}: {
  locale: Locale;
  row: LeaderboardRow;
  showLevel: boolean;
  countUp?: boolean;
  /** Kopija u lepljivom „ti" redu: nije meta Flip-a ni posmatrača. */
  inBar?: boolean;
  /** Kopija reda koji već postoji na listi: vidi se, ali je čitač ekrana i Tab preskaču. */
  duplicate?: boolean;
}) {
  const href = memberHref(locale, row.username);
  const level = showLevel ? levelFromXp(row.xp) : null;
  const member = (
    <>
      <RankAvatar name={row.name} avatarUrl={row.avatarUrl} size="sm" levelProgress={level?.progress} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-black text-ink">{row.name}</span>
          {row.isViewer ? (
            <span className="rounded-full bg-ink px-2 py-0.5 type-eyebrow-sm text-paper-strong">
              {LB.you[locale]}
            </span>
          ) : null}
        </div>
        {row.username || level ? (
          <span className="block truncate text-xs font-bold text-muted">
            {[row.username ? `@${row.username}` : null, level ? formatLevel(level.level, locale) : null].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
    </>
  );
  return (
    <li
      data-flip-id={inBar ? undefined : row.userId}
      data-rank-viewer={row.isViewer && !inBar ? "" : undefined}
      className={cn(
        "grid min-h-16 grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-3 last:border-b-0 sm:grid-cols-[52px_minmax(0,1fr)_100px_100px]",
        row.isViewer && !inBar && "bg-igra-marker-wash",
      )}
    >
      <span className="font-mono text-sm font-black text-ink">#{row.rank}</span>
      {/* Bez korisničkog imena nema profila: red nije link (ni lažni `href="#"`). Kopija u
          „ti" redu se ne fokusira kad je pravi red već na listi (jedna meta za tastaturu). */}
      {href ? (
        <Link href={href} tabIndex={duplicate ? -1 : undefined} className={ROW_MEMBER}>
          {member}
        </Link>
      ) : (
        <span className={ROW_MEMBER}>{member}</span>
      )}
      <span className="hidden text-right text-xs font-black text-muted sm:block">
        {row.completedLessons ?? 0} {locale === "sr" ? "lekcija" : "lessons"}
      </span>
      <span className="text-right">
        <Odometer value={row.xp} size="sm" animate={countUp} locale={locale} />
        <span className="ml-1 text-xs font-black text-muted">XP</span>
      </span>
    </li>
  );
}

/**
 * Lepljivi „ti" red (K12): uvek na dnu ekrana dok se gleda lista, iznad donjeg menija na
 * telefonu. Kad je moj pravi red u kadru, kopija se povuče (providnost, bez pomeranja
 * strane: mesto ostaje rezervisano). Bez XP-a u ovom periodu je blag poziv, bez broja.
 */
function ViewerBarRow({
  locale,
  bar,
  row,
  hidden,
  showLevel,
  hint,
}: {
  locale: Locale;
  bar: NonNullable<ViewerBar>;
  row: LeaderboardRow | null;
  hidden: boolean;
  showLevel: boolean;
  hint: string;
}) {
  const duplicate = bar.kind === "row" && bar.onBoard;
  return (
    <div
      inert={hidden}
      className={cn(
        "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mr-14 transition-[opacity,translate] duration-200 motion-reduce:transition-none md:bottom-4",
        hidden && "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <section
        aria-label={LB.yourPlace[locale]}
        // Kad je moj red već na listi, ovo je samo vizuelni podsetnik: čitač ekrana ga ne čita dvaput.
        aria-hidden={duplicate || undefined}
        className="overflow-hidden surface-card border-2 border-ink bg-paper-strong shadow-[0_6px_0_0_var(--shadow-hard-14)]"
      >
        {bar.kind === "row" && row ? (
          <ol>
            <LeaderboardRowItem locale={locale} row={{ ...row, isViewer: true }} showLevel={showLevel} inBar duplicate={duplicate} />
          </ol>
        ) : (
          <div className="flex min-h-16 items-center gap-3 px-3 py-3">
            <span className="w-[42px] shrink-0 font-mono text-sm font-black text-muted sm:w-[52px]" aria-hidden="true">#—</span>
            <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 type-eyebrow-sm text-paper-strong">{LB.you[locale]}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-ink">{LB.notRanked[locale]}</span>
              <span className="block text-xs font-bold text-muted">{hint}</span>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Jedna lista (opseg + period): odbrojavanje, podijum, animirana lista i „ti" red.
 * Ključ je opseg i period, pa nova lista ponovo broji XP pri prvom prikazu.
 */
function RankBoard({
  locale,
  rows,
  viewer,
  period,
  scopeKind,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  locale: Locale;
  rows: LeaderboardRow[];
  viewer: LeaderboardViewer | undefined;
  period: LeaderboardPeriod;
  scopeKind: LeaderboardScopeKind;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
}) {
  const boardRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { podium, rest } = splitPodium(rows);
  const showLevel = rowXpIsTotal(scopeKind, period);
  const countUp = useFirstShowCount(rows.length > 0);
  const bar = viewerBar(viewer, rows);
  const mine = viewer?.row ?? null;
  const viewerOnScreen = useViewerOnScreen(boardRef, bar?.kind === "row" && bar.onBoard && mine ? `${mine.userId}:${mine.rank}` : null);
  useEnterStagger(listRef, { selector: "li[data-flip-id]", deps: [rest.length] });

  return (
    <div className="min-w-0 space-y-6">
      {period === "week" ? <WeekCountdown weekKey={viewer?.periodKey} locale={locale} /> : null}

      {/* Bez `aria-live` (K28): lista se menja uživo (tuđi XP, Flip, „učitaj još"), pa bi čitač
          ekrana čitao svaki red. Izabran period kaže `aria-pressed` na dugmetu. */}
      <section ref={boardRef} className="min-w-0 space-y-6">
        {podium.length ? (
          <Podium
            rows={podium}
            locale={locale}
            showLevel={showLevel}
            countUp={countUp}
            hrefFor={(row) => memberHref(locale, row.username)}
          />
        ) : null}

        {rest.length ? (
          <div ref={listRef} className="overflow-hidden surface-card border border-ink bg-paper-strong">
            <div className="hidden grid-cols-[52px_minmax(0,1fr)_100px_100px] gap-3 border-b border-ink bg-ink/5 dark:bg-ink/10 px-3 py-2 type-eyebrow-sm text-muted sm:grid">
              <span>{locale === "sr" ? "Rang" : "Rank"}</span>
              <span>{locale === "sr" ? "Član" : "Member"}</span>
              <span className="text-right">{locale === "sr" ? "Lekcije" : "Lessons"}</span>
              <span className="text-right">XP</span>
            </div>
            <FlipOrder ids={rest.map((row) => row.userId)}>
              {rest.map((row) => (
                <LeaderboardRowItem key={row.userId} locale={locale} row={row} showLevel={showLevel} countUp={countUp} />
              ))}
            </FlipOrder>
          </div>
        ) : rows.length ? null : (
          <EmptyCommunityState
            locale={locale}
            icon={Trophy}
            art="rang.pehar"
            title={locale === "sr" ? "Rang lista još nema nijedan bod" : "The leaderboard has no points yet"}
            body={
              locale === "sr"
                ? "Bodovi (XP) se dobijaju za završene lekcije i urađene zadatke. Završi jednu lekciju na ovom kursu i lista počinje da se puni."
                : "Points (XP) come from finished lessons and completed tasks. Finish one lesson in this course and the list starts filling up."
            }
            action={
              <Link
                href={classroomPath(locale)}
                className="igra-press igra-shadow inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <BookOpenCheck className="size-4" />
                {locale === "sr" ? "Otvori kurseve" : "Browse courses"}
              </Link>
            }
          />
        )}

        {bar ? (
          <ViewerBarRow
            locale={locale}
            bar={bar}
            row={mine}
            hidden={viewerOnScreen}
            showLevel={showLevel}
            hint={unrankedHint(scopeKind, period, locale)}
          />
        ) : null}

        {viewer && !viewer.eligible ? (
          <section className="rounded-[16px] border border-line bg-ink/5 dark:bg-ink/10 p-4 type-body-sm font-bold text-muted">
            {locale === "sr"
              ? "Predavači i moderatori se vide u Zajednici, ali se ne rangiraju - lista je samo za studente."
              : "Teachers and moderators show up in the Community but are not ranked - the list is for students only."}
          </section>
        ) : null}

        {canLoadMore && onLoadMore ? (
          <div className="flex justify-center">
            <LoadMoreButton locale={locale} loading={loadingMore} onClick={onLoadMore} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Kostur iste visine kao odbrojavanje, podijum i prvih pet redova (bez skoka kad stignu). */
function LeaderboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-6 w-72 max-w-full animate-pulse rounded-full bg-igra-track motion-reduce:animate-none" />
      <div className="h-56 animate-pulse surface-card bg-igra-track motion-reduce:animate-none md:h-[27rem]" />
      <div className="overflow-hidden surface-card border border-line bg-paper-strong">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="flex min-h-16 items-center gap-3 border-b border-line px-3 py-3 last:border-b-0">
            <span className="h-4 w-8 animate-pulse rounded-full bg-igra-track motion-reduce:animate-none" />
            <span className="size-10 animate-pulse rounded-full bg-igra-track motion-reduce:animate-none" />
            <span className="h-4 flex-1 animate-pulse rounded-full bg-igra-track motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}

export type LeaderboardViewer = { eligible: boolean; row: LeaderboardRow | null; periodKey?: string };

export function LeaderboardView({
  locale,
  filters,
  scopeState,
  periodState,
  rows,
  viewer,
  loading,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  locale: Locale;
  filters: CommunityFilters;
  scopeState: ReturnType<typeof useResolvedCommunityScope>;
  periodState: ReturnType<typeof useLeaderboardPeriod>;
  rows: LeaderboardRow[];
  viewer: LeaderboardViewer | undefined;
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div className="space-y-6">
      <CommunityStickyToolbar>
      <section className="overflow-x-auto rounded-[16px] border border-line bg-paper-strong p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:min-w-max">
        <CommunityScopeControls
          locale={locale}
          filters={filters}
          scopeState={scopeState}
          compact
          layout="inline"
          showLearningDepth={false}
          inlineMiddle={
            <div className="flex shrink-0 gap-1 rounded-full border border-line bg-ink/5 dark:bg-ink/10 p-1" role="group" aria-label={locale === "sr" ? "Period rangiranja" : "Ranking period"}>
              {(["week", "all_time"] as const).map((period) => {
                const active = periodState.period === period;
                return (
                  <button
                    key={period}
                    type="button"
                    onClick={() => periodState.setPeriod(period)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-10 sm:min-h-9 pointer-coarse:min-h-11 flex-1 whitespace-nowrap rounded-full px-4 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
                      active ? "bg-ink text-paper-strong" : "text-ink/65 hover:bg-paper-strong hover:text-ink",
                    )}
                  >
                    {period === "week"
                      ? locale === "sr"
                        ? "Ova nedelja"
                        : "This week"
                      : locale === "sr"
                        ? "Ukupno"
                        : "All time"}
                  </button>
                );
              })}
            </div>
          }
        />
        </div>
      </section>
      </CommunityStickyToolbar>

      {loading ? (
        <LeaderboardSkeleton />
      ) : (
        <div className="block">
          <RankBoard
            key={`${JSON.stringify(scopeState.scope)}:${periodState.period}`}
            locale={locale}
            rows={rows}
            viewer={viewer}
            period={periodState.period}
            scopeKind={scopeState.scope.kind}
            canLoadMore={canLoadMore}
            loadingMore={loadingMore}
            onLoadMore={onLoadMore}
          />

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <LearningSpine
              locale={locale}
              scope={scopeState.scope}
              track={scopeState.trackLabel}
              course={scopeState.courseLabel}
              xp={viewer?.row?.xp}
            />
            <details open className="group overflow-hidden rounded-[16px] border border-ink bg-paper-strong shadow-[4px_4px_0_var(--yellow)]">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                <Sparkles className="size-4 shrink-0 text-yellow" aria-hidden="true" />
                <h2 className="min-w-0 flex-1 type-h4 text-ink">{locale === "sr" ? "Kako se dobija XP" : "How XP is earned"}</h2>
                <ChevronDown className="size-5 shrink-0 text-ink transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-line px-4 py-4">
                <ul className="space-y-3">
                  {[
                    { icon: BookOpenCheck, value: "+100", sr: "Završena lekcija", en: "Completed lesson" },
                    { icon: CheckCircle2, value: "+20", sr: "Obavezni zadatak", en: "Required task" },
                    { icon: HelpCircle, value: "+10", sr: "Koristan odgovor", en: "Helpful reply", href: `${withLocale(locale, "/app/community/discussions")}?sort=unanswered` },
                    // Crea XP (K26, G1): prvi rad u oblasti 30, mini-lekcija 20, recept 15, rad dana 10, nova tehnika 5.
                    { icon: Palette, value: "+5–30", sr: "Crea: prvi rad, nova tehnika, recept, mini-lekcija", en: "Crea: first work, new technique, recipe, mini-lesson", href: withLocale(locale, "/app/studio/sveska") },
                  ].map((item) => {
                    const Icon = item.icon;
                    const label = locale === "sr" ? item.sr : item.en;
                    return (
                      <li key={item.value} className="flex items-center gap-3">
                        <span className="grid size-8 place-items-center rounded-full bg-ink/5 dark:bg-ink/10 text-ink"><Icon className="size-4" aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1 text-sm font-bold text-ink">
                          {item.href ? (
                            <Link
                              href={item.href}
                              className="inline-flex min-h-11 items-center underline decoration-yellow decoration-2 underline-offset-4 transition hover:text-blue-mid dark:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                            >
                              {label}
                            </Link>
                          ) : (
                            label
                          )}
                        </span>
                        <span className="font-mono text-sm font-black text-ink">{item.value}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-4 border-t border-line pt-3 type-caption font-semibold text-muted">
                  {locale === "sr"
                    ? "Bodovi su isti za Lite i Pro. Predavači i moderatori se ne rangiraju. Ko ima isto bodova, deli isto mesto. XP u Crei se dobija za ono što uradiš prvi put, uz dnevni limit - nikad za potrošene kredite."
                    : "Points are the same for Lite and Pro. Teachers and moderators are not ranked. Equal points share the same place. Crea XP comes from what you do for the first time, with a daily limit - never from credits spent."}
                </p>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
