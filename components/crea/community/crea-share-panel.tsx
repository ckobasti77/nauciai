"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ExternalLink, Share2, Trophy, Undo2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { FOCUS, versionsLabel, workPath } from "@/components/crea/community/crea-community-ui";
import { useBelgradeToday } from "@/components/crea/game/crea-game-context";
import { Button, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { belgradeDayKey } from "@/convex/leaderboardCore";
import { challengeForDay } from "@/lib/crea-challenges";
import { AUTHOR_REWARD_CREDITS, PUBLIC_TITLE_MAX } from "@/lib/crea-community";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_GALLERY_COPY, CREA_SHARE_COPY, communityErrorText } from "@/lib/crea-community-copy";
import { withLocale, type Locale } from "@/lib/i18n";

/**
 * „Podeli sa zajednicom" u detalju sopstvenog rada (K27, G8 + G3): objava u javnu
 * galeriju (na proveru), deljenje opisa (recept - G11) i prijava na današnji izazov
 * za rad napravljen danas. Ne postoji dok je galerija isključena.
 */
export function CreaSharePanel({ locale, jobId, createdAt }: { locale: Locale; jobId: Id<"generationJobs">; createdAt: number }) {
  const share = useQuery(api.creaGallery.myWorkShare, { jobId });
  if (!share?.enabled) return null;
  // `key`: sačuvan rad (naslov, opis) puni formu iznova kad stigne.
  return <SharePanelForm key={share.work ? `${share.work._id}:${share.work.status}` : "nov"} locale={locale} jobId={jobId} createdAt={createdAt} work={share.work} />;
}

export type ShareWork = NonNullable<FunctionReturnType<typeof api.creaGallery.myWorkShare>["work"]>;

export function SharePanelForm({ locale, jobId, createdAt, work }: { locale: Locale; jobId: Id<"generationJobs">; createdAt: number; work: ShareWork | null }) {
  const publish = useMutation(api.creaGallery.publishWork);
  const enter = useMutation(api.creaChallenges.enterChallenge);
  const withdraw = useMutation(api.creaGallery.withdrawWork);
  const todayKey = useBelgradeToday();
  const [title, setTitle] = useState(work?.title ?? "");
  const [sharePrompt, setSharePrompt] = useState(work?.sharePrompt ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const titleId = useId();
  const promptId = useId();

  const madeToday = belgradeDayKey(createdAt) === todayKey;
  const inChallenge = work?.challengeDayKey === todayKey;
  const theme = challengeForDay(todayKey).theme;
  const changed = !work || (work.title ?? "") !== title.trim().replace(/\s+/g, " ") || work.sharePrompt !== sharePrompt;

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: "ok", text: ok });
    } catch (thrown) {
      setMessage({ kind: "error", text: communityErrorText(thrown, locale) });
    } finally {
      setBusy(false);
    }
  }

  const statusChip = work
    ? work.status === "approved"
      ? CREA_GALLERY_COPY.statusApproved[locale]
      : work.status === "rejected"
        ? CREA_GALLERY_COPY.statusRejected[locale]
        : CREA_GALLERY_COPY.statusPending[locale]
    : null;

  return (
    <section
      aria-labelledby={`${titleId}-naslov`}
      className="surface-card w-full max-w-[780px] border-2 border-ink bg-paper-strong p-4 text-ink shadow-[4px_4px_0_0_var(--shadow-hard-14)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${titleId}-naslov`} className="inline-flex items-center gap-2 type-body font-black">
          <Share2 aria-hidden="true" className="size-4" />
          {CREA_SHARE_COPY.title[locale]}
        </h3>
        {statusChip ? (
          <span className={cn("rounded-full border-2 px-2.5 py-0.5 text-xs font-black", work?.status === "approved" ? "border-ink bg-yellow text-ink" : "border-dashed border-ink bg-paper text-ink")}>
            {statusChip}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm font-semibold text-muted">{CREA_SHARE_COPY.body[locale]}</p>
      {work?.status === "approved" ? (
        <p className="mt-1 text-xs font-bold text-muted">
          {fillCopy(CREA_SHARE_COPY.likesAndVersions[locale], { likes: work.likes, versions: versionsLabel(locale, work.remixes) })}
        </p>
      ) : null}
      {work?.rejectReason ? <p className="mt-1 text-xs font-bold text-muted">{work.rejectReason}</p> : null}

      <div className="mt-3 grid gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={titleId} className="text-sm font-black">
            {CREA_SHARE_COPY.titleLabel[locale]}
          </label>
          <input
            id={titleId}
            value={title}
            maxLength={PUBLIC_TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={CREA_SHARE_COPY.titlePlaceholder[locale]}
            className="surface-inset min-h-11 border-2 border-ink bg-paper px-3 text-sm font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>
        <label htmlFor={promptId} className="flex min-h-11 cursor-pointer items-start gap-3">
          <input id={promptId} type="checkbox" checked={sharePrompt} onChange={(event) => setSharePrompt(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink" />
          <span>
            <span className="block text-sm font-black">{CREA_SHARE_COPY.sharePrompt[locale]}</span>
            <span className="block text-xs font-semibold text-muted">{fillCopy(CREA_SHARE_COPY.sharePromptHint[locale], { n: AUTHOR_REWARD_CREDITS })}</span>
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!work || changed ? (
          <Button
            tone="ink"
            disabled={busy}
            onClick={() => void run(() => publish({ jobId, title, sharePrompt }), CREA_SHARE_COPY.publishedPending[locale])}
          >
            {work ? CREA_SHARE_COPY.update[locale] : CREA_SHARE_COPY.publish[locale]}
          </Button>
        ) : null}
        {madeToday && !inChallenge ? (
          <Button
            tone="yellow"
            disabled={busy}
            onClick={() => void run(() => enter({ jobId, title, sharePrompt }), CREA_SHARE_COPY.publishedPending[locale])}
          >
            <Trophy aria-hidden="true" className="size-4" />
            {CREA_SHARE_COPY.enter[locale]}
          </Button>
        ) : null}
        {work ? (
          <>
            <Link
              href={withLocale(locale, workPath(work._id))}
              className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-black text-ink underline decoration-yellow decoration-2 underline-offset-4", FOCUS)}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              {CREA_SHARE_COPY.openPublic[locale]}
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => withdraw({ workId: work._id }), "")}
              className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-black text-muted hover:text-ink", FOCUS)}
            >
              <Undo2 aria-hidden="true" className="size-4" />
              {CREA_SHARE_COPY.withdraw[locale]}
            </button>
          </>
        ) : null}
      </div>
      <p className="mt-2 text-xs font-bold text-muted">
        {inChallenge
          ? `${CREA_SHARE_COPY.inChallenge[locale]}: ${theme.label[locale]}`
          : madeToday
            ? fillCopy(CREA_SHARE_COPY.enterHint[locale], { theme: theme.label[locale] })
            : CREA_SHARE_COPY.notToday[locale]}
      </p>
      {message && message.text ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={cn("mt-2 text-sm font-bold", message.kind === "error" ? "text-red-700 dark:text-red-300" : "text-ink")}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
