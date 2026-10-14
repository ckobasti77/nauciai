"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Medal } from "lucide-react";
import { useState } from "react";

import { useBelgradeToday } from "@/components/crea/game/crea-game-context";
import { RankChip } from "@/components/igra/rank-chip";
import { Button, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_COMMUNITY_NAV, CREA_LEAGUE_COPY, communityErrorText } from "@/lib/crea-community-copy";
import { LEAGUE_PODIUM, leagueTier } from "@/lib/crea-leagues";
import type { Locale } from "@/lib/i18n";

/**
 * Nedeljna liga u svesci (K27, G9): liga i grupa ove nedelje, tabela grupe (rang po XP-u
 * ove nedelje, prva tri na postolju), kuda vodi trenutni XP i mesto prošle nedelje.
 */
export function CreaLeaguePanel({ locale }: { locale: Locale }) {
  const todayKey = useBelgradeToday();
  const league = useQuery(api.creaLeagues.myLeague, { todayKey });
  return <LeagueView locale={locale} league={league} />;
}

/** Prikaz lige bez upita. */
export function LeagueView({ locale, league }: { locale: Locale; league: FunctionReturnType<typeof api.creaLeagues.myLeague> | undefined }) {
  const join = useMutation(api.creaLeagues.joinLeague);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const number = locale === "sr" ? "sr-RS" : "en-US";

  if (league === undefined || league === null) {
    return (
      <p role="status" className="type-body font-bold text-muted">
        {CREA_COMMUNITY_NAV.loading[locale]}
      </p>
    );
  }
  if (!league.eligible) {
    return <p className="type-body font-bold text-muted">{CREA_LEAGUE_COPY.staff[locale]}</p>;
  }

  const tierName = (index: number) => leagueTier(index).label[locale];
  return (
    <section aria-labelledby="crea-liga" className="surface-card border-2 border-ink bg-paper-strong p-4 text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-5">
      <h2 id="crea-liga" className="type-h2">
        {CREA_LEAGUE_COPY.title[locale]}
      </h2>
      <p className="mt-1 type-body-sm font-semibold text-muted type-measure">{CREA_LEAGUE_COPY.subtitle[locale]}</p>
      <p className="mt-1 text-xs font-bold text-muted">{CREA_LEAGUE_COPY.tiers[locale]}</p>

      {league.member ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-yellow px-4 py-1.5 type-body font-black text-ink">
              <Medal aria-hidden="true" className="size-5" />
              {fillCopy(CREA_LEAGUE_COPY.league[locale], { tier: tierName(league.member.tier) })}
              <span className="font-bold">· {fillCopy(CREA_LEAGUE_COPY.group[locale], { n: league.member.cohort })}</span>
            </p>
            <p className="type-body-sm font-black tabular-nums">{fillCopy(CREA_LEAGUE_COPY.myXp[locale], { n: league.myXp.toLocaleString(number) })}</p>
          </div>
          <p className="mt-2 type-body-sm font-bold">{fillCopy(CREA_LEAGUE_COPY.nextTier[locale], { tier: tierName(league.nextTier) })}</p>

          <table className="mt-4 w-full border-collapse text-left">
            <caption className="sr-only">{CREA_LEAGUE_COPY.table[locale]}</caption>
            <thead>
              <tr className="border-b border-line text-xs font-black text-muted">
                <th scope="col" className="w-20 py-2">
                  {CREA_LEAGUE_COPY.rank[locale]}
                </th>
                <th scope="col" className="py-2">
                  {CREA_LEAGUE_COPY.name[locale]}
                </th>
                <th scope="col" className="py-2 text-right">
                  {CREA_LEAGUE_COPY.xp[locale]}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {league.table.map((row, index) => (
                <tr key={`${row.rank}-${index}`} className={cn(row.isMe && "bg-yellow/20")}>
                  {/* Rang čip (K17): medalja za postolje, `#N` za ostale - isti čip kao rang lista zajednice. */}
                  <td className="py-2 pl-1" title={row.rank <= LEAGUE_PODIUM ? CREA_LEAGUE_COPY.podium[locale] : undefined}>
                    <RankChip rank={row.rank} locale={locale} />
                  </td>
                  <td className="py-2 text-sm font-black">
                    {row.name}
                    {row.isMe ? <span className="ml-2 text-xs font-bold text-muted dark:text-ink/75">({CREA_LEAGUE_COPY.you[locale]})</span> : null}
                  </td>
                  <td className="py-2 pr-1 text-right text-sm font-black tabular-nums">{row.xp.toLocaleString(number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            tone="ink"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await join({});
              } catch (thrown) {
                setError(communityErrorText(thrown, locale));
              } finally {
                setBusy(false);
              }
            }}
          >
            {CREA_LEAGUE_COPY.join[locale]}
          </Button>
          <p className="text-sm font-semibold text-muted">{fillCopy(CREA_LEAGUE_COPY.joinHint[locale], { tier: tierName(league.joinTier) })}</p>
        </div>
      )}

      {league.lastWeek?.rank ? (
        <p className="mt-4 border-t border-line pt-3 text-sm font-bold text-muted">
          {fillCopy(CREA_LEAGUE_COPY.lastWeek[locale], { rank: league.lastWeek.rank, tier: tierName(league.lastWeek.tier) })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-bold text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}
