"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, Copy, GitFork, Link2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  CommunityHeader,
  FOCUS,
  LikeButton,
  versionsLabel,
  WorkMedia,
  workPath,
} from "@/components/crea/community/crea-community-ui";
import { LinkButton, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { challengeThemeLabel } from "@/lib/crea-challenges";
import { fillCopy } from "@/lib/crea-copy";
import { remixQuery } from "@/lib/crea-community";
import { CREA_COMMUNITY_NAV, CREA_GALLERY_COPY, CREA_WORK_COPY } from "@/lib/crea-community-copy";
import { withLocale, type Locale } from "@/lib/i18n";

type Thumb = { _id: Id<"creaPublicWorks">; kind: string; title: string | null; author: string; thumbUrl: string | null };

function ThumbLink({ locale, thumb }: { locale: Locale; thumb: Thumb }) {
  const title = thumb.title ?? CREA_GALLERY_COPY.untitled[locale];
  return (
    <Link href={withLocale(locale, workPath(thumb._id))} className={cn("group flex items-center gap-3 rounded-full py-1 pr-3", FOCUS)}>
      <span className="surface-media grid size-14 shrink-0 place-items-center overflow-hidden bg-studio-well">
        {thumb.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb.thumbUrl} alt="" className="size-full object-cover" />
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block truncate type-body-sm font-black underline-offset-4 group-hover:underline">{title}</span>
        <span className="block truncate text-xs font-bold text-muted">{thumb.author}</span>
      </span>
    </Link>
  );
}

/**
 * Javni rad (K27, G8): medij, autor, lajk, „Napravi svoju verziju" (isti model i - ako
 * ga je autor podelio - isti opis; zasluga autoru) i stablo remiksa: od čega je nastao i
 * odobrene svoje verzije drugih.
 */
export function CreaPublicWork({ locale, workId }: { locale: Locale; workId: Id<"creaPublicWorks"> }) {
  const work = useQuery(api.creaGallery.getPublicWork, { workId });
  return <PublicWorkView locale={locale} work={work} />;
}

export type PublicWorkData = FunctionReturnType<typeof api.creaGallery.getPublicWork>;

/** Prikaz javnog rada bez upita (`undefined` = učitava se, `null` = nije javan). */
export function PublicWorkView({ locale, work }: { locale: Locale; work: PublicWorkData | undefined }) {
  const [copied, setCopied] = useState<"prompt" | "link" | null>(null);

  const header = <CommunityHeader locale={locale} title={CREA_GALLERY_COPY.title[locale]} subtitle={CREA_GALLERY_COPY.subtitle[locale]} current="galerija" />;
  if (work === undefined) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 text-ink">
        {header}
        <p role="status" className="type-body font-bold text-muted">
          {CREA_COMMUNITY_NAV.loading[locale]}
        </p>
      </div>
    );
  }
  if (work === null) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 text-ink">
        {header}
        <section className="surface-card border-2 border-ink bg-paper-strong p-6 text-center shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
          <p className="type-h3">{CREA_WORK_COPY.notFound[locale]}</p>
          <LinkButton href={withLocale(locale, "/studio/galerija")} tone="paper" className="mt-4">
            {CREA_GALLERY_COPY.title[locale]}
          </LinkButton>
        </section>
      </div>
    );
  }

  const title = work.title ?? CREA_GALLERY_COPY.untitled[locale];
  const remixHref = work.remix ? `${withLocale(locale, "/studio/app")}?${remixQuery(work._id, work.remix, work.prompt)}` : null;
  const copy = async (what: "prompt" | "link", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 text-ink">
      {header}
      {work.status !== "approved" ? (
        <p role="status" className="surface-inset border-2 border-dashed border-ink bg-paper p-3 type-body-sm font-bold">
          {work.status === "pending" ? CREA_WORK_COPY.pendingNote[locale] : CREA_WORK_COPY.rejectedNote[locale]}
          {work.rejectReason ? ` ${fillCopy(CREA_WORK_COPY.rejectedReason[locale], { reason: work.rejectReason })}` : ""}
        </p>
      ) : null}

      <article className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="surface-card self-start border-2 border-ink bg-paper-strong p-3 shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
          <div className="surface-media grid place-items-center overflow-hidden bg-studio-well shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
            <WorkMedia work={work} compact={false} alt={title} />
          </div>
        </div>

        <div className="surface-card flex flex-col gap-4 border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="type-h2 break-words">{title}</h2>
              <p className="mt-1 type-body-sm font-bold text-muted">
                {work.author.name}
                {work.author.username ? ` · @${work.author.username}` : ""}
              </p>
            </div>
            <LikeButton locale={locale} workId={work._id} likes={work.likes} liked={work.likedByMe} isMine={work.isMine} />
          </div>

          <ul className="flex flex-wrap gap-1.5 text-xs font-black">
            {work.modelLabel ? (
              <li className="rounded-full border-2 border-ink bg-paper px-2.5 py-0.5">{fillCopy(CREA_WORK_COPY.madeWith[locale], { model: work.modelLabel[locale] })}</li>
            ) : null}
            {work.remixes > 0 ? <li className="rounded-full border-2 border-ink bg-paper px-2.5 py-0.5">{versionsLabel(locale, work.remixes)}</li> : null}
            {work.challenge ? (
              <li className="rounded-full border-2 border-ink bg-yellow px-2.5 py-0.5 text-ink">
                {fillCopy(CREA_WORK_COPY.challengeEntry[locale], { theme: challengeThemeLabel(work.challenge.dayKey)[locale] })}
              </li>
            ) : null}
          </ul>

          {remixHref && !work.isMine ? (
            <div>
              <LinkButton href={remixHref} tone="yellow" size="lg" className="w-full">
                {work.remix?.toolId ? <Wand2 aria-hidden="true" className="size-5" /> : <GitFork aria-hidden="true" className="size-5" />}
                {work.remix?.toolId ? CREA_WORK_COPY.tryTool[locale] : CREA_WORK_COPY.makeYours[locale]}
              </LinkButton>
              {work.remix?.toolId ? null : (
                <p className="mt-2 text-xs font-bold text-muted">
                  {fillCopy(CREA_WORK_COPY.makeYoursHint[locale], { prompt: work.prompt ? CREA_WORK_COPY.withPrompt[locale] : "" })}
                </p>
              )}
            </div>
          ) : null}

          <section aria-labelledby="crea-rad-opis" className="border-t border-line pt-3">
            <h3 id="crea-rad-opis" className="type-body-sm font-black">
              {CREA_WORK_COPY.prompt[locale]}
            </h3>
            {work.prompt ? (
              <>
                <p className="surface-inset mt-2 whitespace-pre-wrap border border-line bg-paper p-3 text-sm font-semibold">{work.prompt}</p>
                <button
                  type="button"
                  onClick={() => void copy("prompt", work.prompt!)}
                  className={cn("mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black", FOCUS)}
                >
                  {copied === "prompt" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
                  {copied === "prompt" ? CREA_COMMUNITY_NAV.copied[locale] : CREA_WORK_COPY.copyPrompt[locale]}
                </button>
              </>
            ) : (
              <p className="mt-1 type-body-sm font-semibold text-muted">{CREA_WORK_COPY.promptHidden[locale]}</p>
            )}
          </section>

          <button
            type="button"
            onClick={() => void copy("link", window.location.href)}
            className={cn("inline-flex min-h-11 items-center gap-2 self-start rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black", FOCUS)}
          >
            {copied === "link" ? <Check aria-hidden="true" className="size-4" /> : <Link2 aria-hidden="true" className="size-4" />}
            {copied === "link" ? CREA_COMMUNITY_NAV.copied[locale] : CREA_COMMUNITY_NAV.copyLink[locale]}
          </button>
        </div>
      </article>

      <section aria-labelledby="crea-stablo" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[4px_4px_0_0_var(--shadow-hard-14)] sm:p-5">
        <h2 id="crea-stablo" className="type-h3">
          {CREA_WORK_COPY.remixTree[locale]}
        </h2>
        {work.parent ? (
          <div className="mt-3">
            <p className="text-xs font-black text-muted">{CREA_WORK_COPY.remixOf[locale]}</p>
            <ThumbLink locale={locale} thumb={work.parent} />
          </div>
        ) : null}
        <p className="mt-3 text-xs font-black text-muted">
          {CREA_WORK_COPY.remixes[locale]} ({work.children.length})
        </p>
        {work.children.length > 0 ? (
          <ul className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {work.children.map((child) => (
              <li key={child._id}>
                <ThumbLink locale={locale} thumb={child} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 type-body-sm font-semibold text-muted">{CREA_WORK_COPY.remixesEmpty[locale]}</p>
        )}
      </section>
    </div>
  );
}
