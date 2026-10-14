"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Award, Check, Trophy, Vote } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { CommunityHeader, FOCUS, WorkCard } from "@/components/crea/community/crea-community-ui";
import { CreaSeasonBanner } from "@/components/crea/community/crea-season-banner";
import { useBelgradeToday } from "@/components/crea/game/crea-game-context";
import { WinnerCrown } from "@/components/igra/crea/winner-crown";
import { IgraArt } from "@/components/igra/igra-art";
import { Button, LinkButton, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CHALLENGE_WINNER_CREDITS, type ChallengeGroup } from "@/lib/crea-challenges";
import { fillCopy } from "@/lib/crea-copy";
import {
  CREA_CHALLENGE_COPY,
  CREA_CHALLENGE_GROUP_LABEL,
  CREA_COMMUNITY_NAV,
  CREA_GALLERY_COPY,
  CREA_VOTE_FORMS,
  communityErrorText,
} from "@/lib/crea-community-copy";
import { pluralize, withLocale, type Locale } from "@/lib/i18n";

function votesLabel(locale: Locale, count: number) {
  return `${count} ${pluralize(locale, count, CREA_VOTE_FORMS[locale])}`;
}

function dayLabel(dayKey: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn-RS" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${dayKey}T12:00:00Z`),
  );
}

/**
 * Dnevni izazov (K27, G3): tema danas i prijava rada od danas, glasanje za jučerašnje
 * prijave (po grupama, bez broja glasova) i pobednici od prekjuče sa bedževima.
 */
export function CreaChallenge({ locale }: { locale: Locale }) {
  const todayKey = useBelgradeToday();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useConvexAuth();
  const board = useQuery(api.creaChallenges.challengeBoard, { todayKey });
  return <ChallengeView locale={locale} board={board} todayKey={todayKey} isAuthenticated={isAuthenticated} seasonPreview={searchParams.get("sezona")} />;
}

/** Prikaz izazova bez upita table (prijava sa ekrana i dalje čita današnje radove). */
export function ChallengeView({
  locale,
  board,
  todayKey,
  isAuthenticated,
  seasonPreview,
}: {
  locale: Locale;
  board: FunctionReturnType<typeof api.creaChallenges.challengeBoard> | undefined;
  todayKey: string;
  isAuthenticated: boolean;
  seasonPreview: string | null;
}) {
  const header = (
    <CommunityHeader
      locale={locale}
      title={CREA_CHALLENGE_COPY.title[locale]}
      subtitle={fillCopy(CREA_CHALLENGE_COPY.subtitle[locale], { n: CHALLENGE_WINNER_CREDITS })}
      current="izazov"
    />
  );
  if (board === undefined || !board.enabled) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 text-ink">
        {header}
        <p role="status" className="type-body font-bold text-muted">
          {CREA_COMMUNITY_NAV.loading[locale]}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 text-ink">
      {header}
      <CreaSeasonBanner locale={locale} preview={seasonPreview} />

      {/* Danas: tema i prijava */}
      <section aria-labelledby="izazov-danas" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-6">
        <p className="type-display text-xl">{CREA_CHALLENGE_COPY.todayKicker[locale]}</p>
        <h2 id="izazov-danas" className="type-h1 mt-1">
          {board.today.theme.label[locale]}
        </h2>
        <p className="mt-2 type-body font-semibold text-muted type-measure">{board.today.theme.hint[locale]}</p>
        <p className="mt-1 text-xs font-bold text-muted">{dayLabel(board.today.dayKey, locale)}</p>

        <div className="mt-4 border-t border-line pt-4">
          {!isAuthenticated ? (
            <p className="type-body-sm font-bold">{CREA_CHALLENGE_COPY.signIn[locale]}</p>
          ) : board.today.myEntry ? (
            <p className="inline-flex items-center gap-2 type-body-sm font-black">
              <Check aria-hidden="true" className="size-5" />
              {CREA_CHALLENGE_COPY.myEntry[locale]}
              {board.today.myEntry.title ? `: ${board.today.myEntry.title}` : ""} -{" "}
              {board.today.myEntry.status === "approved" ? CREA_CHALLENGE_COPY.entryApproved[locale] : CREA_CHALLENGE_COPY.entryPending[locale]}
            </p>
          ) : (
            <EnterToday locale={locale} todayKey={todayKey} />
          )}
          {board.today.myGroup ? (
            <p className="mt-3 text-sm font-bold text-muted">
              {fillCopy(CREA_CHALLENGE_COPY.myGroup[locale], { group: CREA_CHALLENGE_GROUP_LABEL[board.today.myGroup][locale] })} ·{" "}
              {CREA_CHALLENGE_COPY.groupsHint[locale]}
            </p>
          ) : null}
        </div>
      </section>

      {/* Glasanje: jučerašnje prijave */}
      <section aria-labelledby="izazov-glasanje" className="space-y-3">
        <div>
          <h2 id="izazov-glasanje" className="type-h2 inline-flex items-center gap-2">
            <Vote aria-hidden="true" className="size-6" />
            {CREA_CHALLENGE_COPY.votingTitle[locale]}
          </h2>
          <p className="type-body-sm font-bold text-muted">
            {fillCopy(CREA_CHALLENGE_COPY.votingTheme[locale], { theme: board.voting.theme.label[locale] })} · {CREA_CHALLENGE_COPY.votingHint[locale]}
          </p>
        </div>
        {/* Prazno glasanje (K17): jedna ilustracija za ceo deo, ne po jedna za svaku grupu. */}
        {board.voting.groups.every((group) => group.entries.length === 0) ? (
          <div className="flex justify-center">
            <IgraArt id="prazno.izazov" size={120} decorative />
          </div>
        ) : null}
        {board.voting.groups.map((group) => (
          <VotingGroup key={group.group} locale={locale} group={group.group} entries={group.entries} myVote={group.myVote} signedIn={isAuthenticated} />
        ))}
      </section>

      {/* Rezultati: prekjuče */}
      {/* Bez okvira oko grupe: kartica pobednika je sama okvir (jedan okvir po grupi). */}
      <section aria-labelledby="izazov-rezultati" className="space-y-3">
        <h2 id="izazov-rezultati" className="type-h2 inline-flex items-center gap-2">
          <Trophy aria-hidden="true" className="size-6" />
          {CREA_CHALLENGE_COPY.resultsTitle[locale]}
        </h2>
        <p className="type-body-sm font-bold text-muted">{fillCopy(CREA_CHALLENGE_COPY.resultsTheme[locale], { theme: board.results.theme.label[locale] })}</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {board.results.groups.map((result) => (
            <div key={result.group} className="border-t border-line pt-3">
              <p className="type-body-sm font-black">{CREA_CHALLENGE_GROUP_LABEL[result.group][locale]}</p>
              {!result.closed ? (
                <p className="mt-1 text-sm font-semibold text-muted">{CREA_CHALLENGE_COPY.resultsPending[locale]}</p>
              ) : (
                <>
                  <p className="mt-1 text-xs font-bold text-muted">
                    {fillCopy(CREA_CHALLENGE_COPY.entries[locale], { n: result.entries, votes: votesLabel(locale, result.votesTotal) })}
                  </p>
                  {result.winner ? (
                    <div className="mt-2 max-w-[17rem]">
                      <WorkCard
                        locale={locale}
                        work={result.winner}
                        sticker={<WinnerCrown workId={result.winner._id} />}
                        footer={
                          <p className="inline-flex items-center gap-1.5 text-xs font-black">
                            <Award aria-hidden="true" className="size-4" />
                            <span className="igra-marker bg-yellow text-ink">{CREA_CHALLENGE_COPY.winner[locale]}</span> · {votesLabel(locale, result.winner.votes)}
                          </p>
                        }
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-muted">
                      {result.noWinnerReason === "MALO_PRIJAVA" || result.noWinnerReason === "MALO_GLASOVA"
                        ? CREA_CHALLENGE_COPY[result.noWinnerReason][locale]
                        : CREA_CHALLENGE_COPY.resultsPending[locale]}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {isAuthenticated ? (
        <section aria-labelledby="izazov-bedzevi" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[4px_4px_0_0_var(--shadow-hard-14)] sm:p-5">
          <h2 id="izazov-bedzevi" className="type-h3">
            {CREA_CHALLENGE_COPY.badges[locale]}
          </h2>
          {board.badges.length === 0 ? (
            <p className="mt-1 type-body-sm font-semibold text-muted">{CREA_CHALLENGE_COPY.badgesEmpty[locale]}</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {board.badges.map((badge) => (
                <li
                  key={`${badge.dayKey}:${badge.group}`}
                  className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 py-1.5 text-sm font-black text-ink"
                  title={dayLabel(badge.dayKey, locale)}
                >
                  <IgraArt id="bedz.izazov" size="xs" decorative />
                  {fillCopy(CREA_CHALLENGE_COPY.badge[locale], { theme: badge.theme[locale] })}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function EnterToday({ locale, todayKey }: { locale: Locale; todayKey: string }) {
  const works = useQuery(api.creaChallenges.myWorksForToday, { todayKey });
  const enter = useMutation(api.creaChallenges.enterChallenge);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (works === undefined) return null;
  if (works.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="type-body-sm font-bold">{CREA_CHALLENGE_COPY.noWorksToday[locale]}</p>
        <LinkButton href={withLocale(locale, "/studio/app")} tone="yellow">
          {CREA_CHALLENGE_COPY.makeInCrea[locale]}
        </LinkButton>
      </div>
    );
  }
  return (
    <div>
      <h3 className="type-body font-black">{CREA_CHALLENGE_COPY.enterTitle[locale]}</h3>
      <p className="text-sm font-semibold text-muted">{CREA_CHALLENGE_COPY.enterHint[locale]}</p>
      <ul className="mt-3 flex flex-wrap gap-3">
        {works.map((work) => (
          <li key={work.jobId} className="flex w-28 flex-col items-stretch gap-2">
            <span className="surface-media grid aspect-square place-items-center overflow-hidden bg-studio-well">
              {work.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={work.thumbUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-xs font-black text-white">
                  {work.kind === "audio" ? CREA_GALLERY_COPY.kindAudio[locale] : work.kind === "video" ? CREA_GALLERY_COPY.kindVideo[locale] : CREA_GALLERY_COPY.kindImage[locale]}
                </span>
              )}
            </span>
            <Button
              tone="paper"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(work.jobId);
                setError(null);
                try {
                  await enter({ jobId: work.jobId as Id<"generationJobs">, sharePrompt: false });
                } catch (thrown) {
                  setError(communityErrorText(thrown, locale));
                } finally {
                  setBusy(null);
                }
              }}
              className="px-2 text-xs"
            >
              {CREA_CHALLENGE_COPY.pick[locale]}
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-bold text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Board = Extract<FunctionReturnType<typeof api.creaChallenges.challengeBoard>, { enabled: true }>;
type VotingEntry = Board["voting"]["groups"][number]["entries"][number];

function VotingGroup({
  locale,
  group,
  entries,
  myVote,
  signedIn,
}: {
  locale: Locale;
  group: ChallengeGroup;
  entries: readonly VotingEntry[];
  myVote: string | null;
  signedIn: boolean;
}) {
  const vote = useMutation(api.creaChallenges.vote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="border-t border-line pt-3">
      <h3 className="type-h3">{CREA_CHALLENGE_GROUP_LABEL[group][locale]}</h3>
      {entries.length === 0 ? (
        <p className="mt-1 type-body-sm font-semibold text-muted">{CREA_CHALLENGE_COPY.votingEmpty[locale]}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {entries.map((entry) => {
            const mine = myVote === entry._id;
            const title = entry.title ?? CREA_GALLERY_COPY.untitled[locale];
            return (
              <li key={entry._id}>
                <WorkCard
                  locale={locale}
                  work={entry}
                  footer={
                    mine ? (
                      <p className="inline-flex min-h-11 items-center gap-1.5 text-sm font-black">
                        <Check aria-hidden="true" className="crea-vote-pop size-4" />
                        {CREA_CHALLENGE_COPY.yourVote[locale]}
                      </p>
                    ) : signedIn && myVote === null && !entry.isMine ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={fillCopy(CREA_CHALLENGE_COPY.voteFor[locale], { title })}
                        onClick={async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            await vote({ workId: entry._id });
                          } catch (thrown) {
                            setError(communityErrorText(thrown, locale));
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className={cn(
                          "igra-press inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-yellow px-3 text-sm font-black text-ink disabled:opacity-50",
                          FOCUS,
                        )}
                      >
                        <Vote aria-hidden="true" className="size-4" />
                        {CREA_CHALLENGE_COPY.vote[locale]}
                      </button>
                    ) : null
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-bold text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
