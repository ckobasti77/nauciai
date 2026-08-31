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
        "relative overflow-hidden rounded-[16px] border bg-paper-strong p-4 text-center transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        row.rank === 1
          ? "border-2 border-ink shadow-[5px_5px_0_var(--yellow)] md:-translate-y-3"
          : "border-line",
        row.isViewer && "ring-4 ring-yellow/35",
      )}
    >
      <div className="absolute left-3 top-3 flex items-center gap-1 font-mono text-xs font-black text-ink">
        <RankIcon rank={row.rank} />
        #{row.rank}
      </div>
      {row.isViewer ? (
        <span className="absolute right-3 top-3 rounded-full bg-ink px-2 py-1 type-eyebrow-sm text-paper-strong">
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
      <h3 className="mt-2 truncate type-h4 text-ink">{row.name}</h3>
      {row.username ? <p className="truncate text-xs font-bold text-muted">@{row.username}</p> : null}
      <p className="mt-3 font-mono text-xl font-black text-ink">{row.xp.toLocaleString()} XP</p>
      <div className="mt-3 flex justify-center gap-2 type-eyebrow-sm text-muted">
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
      <Link href={row.username ? withLocale(locale, `/app/members/${row.username}`) : "#"} aria-disabled={!row.username} className="flex min-w-0 items-center gap-3 rounded-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
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
              <span className="rounded-full bg-ink px-2 py-0.5 type-eyebrow-sm text-paper-strong">
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
    <div className="space-y-6">
      <CommunityStickyToolbar>
      <section className="overflow-x-auto rounded-[16px] border border-line bg-paper-strong p-3 sm:p-4">
        <div className="flex min-w-max items-center gap-2">
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
                      "min-h-10 sm:min-h-9 flex-1 rounded-full px-4 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
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
        <CommunityRouteSkeleton />
      ) : (
        <div className="block">
          <section className="min-w-0 space-y-6" aria-live="polite">
            {podiumRows.length ? (
              <div className="grid gap-3 md:grid-cols-3 md:items-end md:pt-4">
                {podiumRows.map((row) => <PodiumCard key={row.userId} locale={locale} row={row} />)}
              </div>
            ) : null}

            {rows.length ? (
              <div className="overflow-hidden rounded-[16px] border border-ink bg-paper-strong">
                <div className="hidden grid-cols-[52px_minmax(0,1fr)_100px_100px] gap-3 border-b border-ink bg-ink/5 dark:bg-ink/10 px-3 py-2 type-eyebrow-sm text-muted sm:grid">
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
                title={locale === "sr" ? "Rang lista još nema nijedan bod" : "The leaderboard has no points yet"}
                body={
                  locale === "sr"
                    ? "Bodovi (XP) se dobijaju za završene lekcije i urađene zadatke. Završi jednu lekciju na ovom kursu i lista počinje da se puni."
                    : "Points (XP) come from finished lessons and completed tasks. Finish one lesson in this course and the list starts filling up."
                }
                action={
                  <Link
                    href={withLocale(locale, "/app/courses")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink shadow-[3px_3px_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0"
                  >
                    <BookOpenCheck className="size-4" />
                    {locale === "sr" ? "Otvori kurseve" : "Browse courses"}
                  </Link>
                }
              />
            )}

            {viewerOutsidePage ? (
              <section className="rounded-[16px] border-2 border-ink bg-yellow/20 p-2" aria-label={locale === "sr" ? "Tvoj rang" : "Your rank"}>
                <p className="px-3 pb-1 pt-2 type-eyebrow-sm text-ink/65">
                  {locale === "sr" ? "Tvoja pozicija" : "Your position"}
                </p>
                <ol><LeaderboardRowItem locale={locale} row={{ ...viewerOutsidePage, isViewer: true }} /></ol>
              </section>
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
                    ? "Bodovi su isti za Lite i Pro. Predavači i moderatori se ne rangiraju. Ko ima isto bodova, deli isto mesto."
                    : "Points are the same for Lite and Pro. Teachers and moderators are not ranked. Equal points share the same place."}
                </p>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
