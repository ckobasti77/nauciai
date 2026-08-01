"use client";

import { Award, BookOpenCheck, CheckCircle2, ChevronDown, Crown, HelpCircle, Medal, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";

import { CommunityAvatar } from "@/components/app/community-identity";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import { fallbackCommunityFilters, useCommunityFilters, useLeaderboard } from "./community-data";
import { CommunityScopeControls, useCommunityQueryParams, useResolvedCommunityScope } from "./community-filters";
import { CommunityStickyToolbar } from "./community-sticky-toolbar";
import {
  CommunityRouteSkeleton,
  EmptyCommunityState,
  LearningSpine,
  LoadMoreButton,
} from "./community-shared";
import type { CommunityFilters, LeaderboardRow } from "./community-types";

type LeaderboardPeriod = "week" | "all_time";

function useLeaderboardPeriod() {
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

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="size-4 fill-yellow text-ink" aria-hidden="true" />;
  if (rank === 2 || rank === 3) return <Medal className="size-4" aria-hidden="true" />;
  return <Award className="size-4" aria-hidden="true" />;
}

function PodiumCard({ locale, row }: { locale: Locale; row: LeaderboardRow }) {
  return (
    <Link
      href={row.username ? withLocale(locale, `/app/members/${row.username}`) : "#"}
      aria-disabled={!row.username}
      className={cn(
        "relative overflow-hidden rounded-[16px]! border bg-white p-4 text-center",
        row.rank === 1
          ? "border-2 border-ink shadow-[5px_5px_0_rgba(244,190,48,0.8)] md:-translate-y-3"
          : "border-line",
        row.isViewer && "ring-4 ring-yellow/35",
      )}
    >
      <div className="absolute left-3 top-3 flex items-center gap-1 font-mono text-xs font-black text-ink">
        <RankIcon rank={row.rank} />
        #{row.rank}
      </div>
      {row.isViewer ? (
        <span className="absolute right-3 top-3 rounded-full bg-ink px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white">
          {locale === "sr" ? "Ti" : "You"}
        </span>
      ) : null}
      <CommunityAvatar
        name={row.name}
        avatarUrl={row.avatarUrl}
        role={row.role}
        locale={locale}
        size={row.rank === 1 ? "lg" : "md"}
        showRank={false}
        className="mx-auto mt-4"
      />
      <h3 className="mt-2 truncate text-base font-black text-ink">{row.name}</h3>
      {row.username ? <p className="truncate text-xs font-bold text-muted">@{row.username}</p> : null}
      <p className="mt-3 font-mono text-xl font-black text-ink">{row.xp.toLocaleString()} XP</p>
      <div className="mt-3 flex justify-center gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-muted">
        <span>{locale === "sr" ? `Nivo ${row.level ?? 1}` : `Level ${row.level ?? 1}`}</span>
        <span aria-hidden="true">·</span>
        <span>{row.helpfulAnswers ?? 0} {locale === "sr" ? "korisnih" : "helpful"}</span>
      </div>
    </Link>
  );
}

function LeaderboardRowItem({ locale, row }: { locale: Locale; row: LeaderboardRow }) {
  return (
    <li
      className={cn(
        "grid min-h-16 grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-3 last:border-b-0 sm:grid-cols-[52px_minmax(0,1fr)_100px_100px]",
        row.isViewer && "bg-yellow/18",
      )}
    >
      <span className="font-mono text-sm font-black text-ink">#{row.rank}</span>
      <Link href={row.username ? withLocale(locale, `/app/members/${row.username}`) : "#"} aria-disabled={!row.username} className="flex min-w-0 items-center gap-3 rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        <CommunityAvatar
          name={row.name}
          avatarUrl={row.avatarUrl}
          role={row.role}
          locale={locale}
          size="sm"
          showRank={false}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black text-ink">{row.name}</span>
            {row.isViewer ? (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[9px] font-black uppercase text-white">
                {locale === "sr" ? "Ti" : "You"}
              </span>
            ) : null}
          </div>
          <span className="block truncate text-xs font-bold text-muted">
            {row.username ? `@${row.username}` : locale === "sr" ? `Nivo ${row.level ?? 1}` : `Level ${row.level ?? 1}`}
          </span>
        </div>
      </Link>
      <span className="hidden text-right text-xs font-black text-muted sm:block">
        {row.completedLessons ?? 0} {locale === "sr" ? "lekcija" : "lessons"}
      </span>
      <span className="text-right font-mono text-sm font-black text-ink">{row.xp.toLocaleString()} XP</span>
    </li>
  );
}

function LeaderboardView({
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
  viewer: { eligible: boolean; row: LeaderboardRow | null } | undefined;
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
}) {
  const podiumRows = rows.filter((row) => row.rank <= 3).slice(0, 3);
  const remainingRows = rows.filter((row) => !podiumRows.some((podium) => podium.userId === row.userId));
  const viewerOutsidePage = viewer?.row && !rows.some((row) => row.userId === viewer.row?.userId) ? viewer.row : null;

  return (
    <div className="space-y-5">
      <CommunityStickyToolbar>
      <section className="overflow-x-auto rounded-[16px]! border border-line bg-white p-3 sm:p-4">
        <div className="flex min-w-max items-center gap-2">
        <CommunityScopeControls
          locale={locale}
          filters={filters}
          scopeState={scopeState}
          compact
          layout="inline"
          showLearningDepth={false}
          inlineMiddle={
            <div className="flex shrink-0 gap-1 rounded-full border border-line bg-[#eef3f7] p-1" role="group" aria-label={locale === "sr" ? "Period rangiranja" : "Ranking period"}>
              {(["week", "all_time"] as const).map((period) => {
                const active = periodState.period === period;
                return (
                  <button
                    key={period}
                    type="button"
                    onClick={() => periodState.setPeriod(period)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-9 flex-1 rounded-full px-4 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
                      active ? "bg-ink text-white" : "text-ink/65 hover:bg-white hover:text-ink",
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
        <CommunityRouteSkeleton />
      ) : (
        <div className="block">
          <section className="min-w-0 space-y-5" aria-live="polite">
            {podiumRows.length ? (
              <div className="grid gap-3 md:grid-cols-3 md:items-end md:pt-4">
                {podiumRows.map((row) => <PodiumCard key={row.userId} locale={locale} row={row} />)}
              </div>
            ) : null}

            {rows.length ? (
              <div className="overflow-hidden rounded-[16px]! border border-ink bg-white">
                <div className="hidden grid-cols-[52px_minmax(0,1fr)_100px_100px] gap-3 border-b border-ink bg-[#eef3f7] px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-muted sm:grid">
                  <span>{locale === "sr" ? "Rang" : "Rank"}</span>
                  <span>{locale === "sr" ? "Član" : "Member"}</span>
                  <span className="text-right">{locale === "sr" ? "Lekcije" : "Lessons"}</span>
                  <span className="text-right">XP</span>
                </div>
                <ol>{remainingRows.map((row) => <LeaderboardRowItem key={row.userId} locale={locale} row={row} />)}</ol>
              </div>
            ) : (
              <EmptyCommunityState
                locale={locale}
                icon={Trophy}
                title={locale === "sr" ? "Leaderboard čeka prvi XP" : "The leaderboard is waiting for its first XP"}
                body={
                  locale === "sr"
                    ? "Završi lekciju ili obavezni zadatak u ovom scope-u. Rang se prikazuje čim postoji prvi XP događaj."
                    : "Complete a lesson or required task in this scope. Rankings appear as soon as the first XP event exists."
                }
              />
            )}

            {viewerOutsidePage ? (
              <section className="rounded-[16px]! border-2 border-ink bg-yellow/20 p-2" aria-label={locale === "sr" ? "Tvoj rang" : "Your rank"}>
                <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.1em] text-ink/65">
                  {locale === "sr" ? "Tvoja pozicija" : "Your position"}
                </p>
                <ol><LeaderboardRowItem locale={locale} row={{ ...viewerOutsidePage, isViewer: true }} /></ol>
              </section>
            ) : null}

            {viewer && !viewer.eligible ? (
              <section className="rounded-[16px]! border border-line bg-[#eef3f7] p-4 text-sm font-bold leading-6 text-muted">
                {locale === "sr"
                  ? "Staff nalozi se prikazuju u zajednici, ali ne učestvuju u rangiranju."
                  : "Staff accounts appear in the community but do not participate in rankings."}
              </section>
            ) : null}

            {canLoadMore && onLoadMore ? (
              <div className="flex justify-center">
                <LoadMoreButton locale={locale} loading={loadingMore} onClick={onLoadMore} />
              </div>
            ) : null}
          </section>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <LearningSpine
              locale={locale}
              scope={scopeState.scope}
              track={scopeState.trackLabel}
              course={scopeState.courseLabel}
              xp={viewer?.row?.xp}
            />
            <details open className="group overflow-hidden rounded-[16px]! border border-ink bg-white shadow-[4px_4px_0_rgba(244,190,48,0.7)]">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                <Sparkles className="size-4 shrink-0 text-yellow" aria-hidden="true" />
                <h2 className="min-w-0 flex-1 text-sm font-black text-ink">{locale === "sr" ? "Kako se dobija XP" : "How XP is earned"}</h2>
                <ChevronDown className="size-5 shrink-0 text-ink transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-line px-4 py-4">
                <ul className="space-y-3">
                  {[
                    { icon: BookOpenCheck, value: "+100", sr: "Završena lekcija", en: "Completed lesson" },
                    { icon: CheckCircle2, value: "+20", sr: "Obavezni zadatak", en: "Required task" },
                    { icon: HelpCircle, value: "+10", sr: "Koristan odgovor", en: "Helpful reply", href: `${withLocale(locale, "/app/community/discussions")}?sort=unanswered` },
                  ].map((item) => {
                    const Icon = item.icon;
                    const label = locale === "sr" ? item.sr : item.en;
                    return (
                      <li key={item.value} className="flex items-center gap-3">
                        <span className="grid size-8 place-items-center rounded-full bg-[#eef3f7] text-ink"><Icon className="size-4" aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1 text-sm font-bold text-ink">
                          {item.href ? (
                            <Link
                              href={item.href}
                              className="inline-flex min-h-11 items-center underline decoration-yellow decoration-2 underline-offset-4 transition hover:text-[#164d7d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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
                <p className="mt-4 border-t border-line pt-3 text-xs font-semibold leading-5 text-muted">
                  {locale === "sr"
                    ? "Lite i Pro imaju iste vrednosti. Staff nije rangiran. Jednaki XP deli isti rang."
                    : "Lite and Pro use the same values. Staff is unranked. Equal XP shares the same rank."}
                </p>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
