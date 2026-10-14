"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { fallbackCommunityFilters } from "@/components/app/community-v2/community-data";
import { useResolvedCommunityScope } from "@/components/app/community-v2/community-filters";
import { LeaderboardView, useLeaderboardPeriod } from "@/components/app/community-v2/community-leaderboard";
import { COMMUNITY_HERO_COPY } from "@/components/app/community-v2/community-shell";
import type { LeaderboardRow } from "@/components/app/community-v2/community-types";
import { CommunityHero } from "@/components/igra/community/community-hero";
import { cn } from "@/components/ui/primitives";
import { communityHeroCall } from "@/lib/igra-community";
import {
  fixtureLeaderboard,
  IGRA_FIXTURE_IDS,
  IGRA_FIXTURE_LABEL,
  LEADERBOARD_FIXTURE_SIZES,
  rankFixtureRows,
  type IgraFixtureId,
  type LeaderboardFixtureSize,
} from "@/lib/igra-fixtures";
import { t, withLocale, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „rang" (K12): PRAVA rang lista (`LeaderboardView`) nad test podacima, bez
 * prijave i bez upita - 0, 3, 50 ili 500 članova, „ti" po test korisniku, nalog tima.
 * „Učitaj još" dodaje po 20 redova kao `usePaginatedQuery`, a dugmad rade ono što u
 * aplikaciji radi Convex: nečiji XP poraste i on promeni mesto (GSAP Flip).
 */

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40";
const PAGE = 20;

function Board({
  locale,
  stanje,
  size,
  staff,
  loading,
}: {
  locale: Locale;
  stanje: IgraFixtureId;
  size: LeaderboardFixtureSize;
  staff: boolean;
  loading: boolean;
}) {
  const periodState = useLeaderboardPeriod();
  const scopeState = useResolvedCommunityScope(fallbackCommunityFilters, locale);
  const base = useMemo(() => fixtureLeaderboard({ size, period: periodState.period, stanje, staff }), [size, periodState.period, stanje, staff]);
  const [bonus, setBonus] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(PAGE);

  const ranked = useMemo(
    () => rankFixtureRows(base.rows.map((row): LeaderboardRow => ({ ...row, xp: row.xp + (bonus[row.userId] ?? 0) }))),
    [base, bonus],
  );
  const mine = base.viewer.row ? (ranked.find((row) => row.userId === base.viewer.row?.userId) ?? null) : null;
  const rows = ranked.slice(0, loaded);
  const mineIndex = mine ? ranked.indexOf(mine) : -1;

  /** Red sa `from` mesta pretekne red na `to` mestu (XP poraste za razliku + 5). */
  function overtake(from: number, to: number) {
    const mover = ranked[from];
    const target = ranked[to];
    if (!mover || !target) return;
    setBonus((current) => ({ ...current, [mover.userId]: (current[mover.userId] ?? 0) + target.xp - mover.xp + 5 }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={cn(CHIP, "bg-paper-strong hover:bg-paper")} disabled={ranked.length < 10} onClick={() => overtake(8, 4)}>
          {t(locale, "Deveti pretekne petog", "Ninth overtakes fifth")}
        </button>
        <button type="button" className={cn(CHIP, "bg-paper-strong hover:bg-paper")} disabled={mineIndex < 3} onClick={() => overtake(mineIndex, mineIndex - 3)}>
          {t(locale, "Ja: tri mesta gore", "Me: three places up")}
        </button>
      </div>

      <div className="space-y-6">
        <CommunityHero
          art="scena.podijum"
          locale={locale}
          title={locale === "sr" ? COMMUNITY_HERO_COPY.leaderboard!.titleSr : COMMUNITY_HERO_COPY.leaderboard!.titleEn}
          subtitle={locale === "sr" ? COMMUNITY_HERO_COPY.leaderboard!.subtitleSr : COMMUNITY_HERO_COPY.leaderboard!.subtitleEn}
          call={communityHeroCall("leaderboard", locale)}
        />
        {/* Isto mesto za traku filtera kao u `CommunityShellView` (portal `CommunityStickyToolbar`). */}
        <div className="sticky top-0 z-30 overflow-hidden border-b-2 border-line/75 bg-paper/95 backdrop-blur">
          <div className="p-2 empty:hidden sm:p-3" data-community-toolbar-target />
        </div>
        <LeaderboardView
          locale={locale}
          filters={fallbackCommunityFilters}
          scopeState={scopeState}
          periodState={periodState}
          rows={rows}
          viewer={mine ? { ...base.viewer, row: mine } : base.viewer}
          loading={loading}
          canLoadMore={loaded < ranked.length}
          loadingMore={false}
          onLoadMore={() => setLoaded((count) => count + PAGE)}
        />
      </div>
    </div>
  );
}

export function IzlogRang({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const [size, setSize] = useState<LeaderboardFixtureSize>(50);
  const [staff, setStaff] = useState(false);
  const [loading, setLoading] = useState(false);
  const periodKey = useLeaderboardPeriod().period;

  return (
    <div className="space-y-8">
      <nav aria-label={t(locale, "Test korisnik", "Test user")} className="flex flex-wrap items-center gap-2">
        <span className="mr-1 type-eyebrow text-muted">{t(locale, "Test korisnik", "Test user")}</span>
        {IGRA_FIXTURE_IDS.map((id) => (
          <Link
            key={id}
            href={`${withLocale(locale, "/igra-izlog")}?deo=rang&stanje=${id}`}
            aria-current={id === stanje ? "page" : undefined}
            className={cn(CHIP, id === stanje ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}
          >
            {IGRA_FIXTURE_LABEL[id][locale]}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t(locale, "Broj članova", "Member count")}>
        <span className="mr-1 type-eyebrow text-muted">{t(locale, "Članova", "Members")}</span>
        {LEADERBOARD_FIXTURE_SIZES.map((count) => (
          <button
            key={count}
            type="button"
            aria-pressed={count === size}
            onClick={() => setSize(count)}
            className={cn(CHIP, count === size ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}
          >
            {count}
          </button>
        ))}
        <button type="button" aria-pressed={staff} onClick={() => setStaff((value) => !value)} className={cn(CHIP, staff ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}>
          {t(locale, "Nalog tima", "Team account")}
        </button>
        <button type="button" aria-pressed={loading} onClick={() => setLoading((value) => !value)} className={cn(CHIP, loading ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}>
          {t(locale, "Učitava se", "Loading")}
        </button>
      </div>

      {/* Širina sadržaja zajednice u aplikaciji (`max-w-[1180px]` u `CommunityShellView`). */}
      <div className="mx-auto max-w-[1180px]">
        <Board key={`${stanje}-${size}-${staff}-${periodKey}`} locale={locale} stanje={stanje} size={size} staff={staff} loading={loading} />
      </div>
    </div>
  );
}
