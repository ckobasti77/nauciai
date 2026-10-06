"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, X } from "lucide-react";
import { useState } from "react";

import { WorkMedia } from "@/components/crea/community/crea-community-ui";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_GALLERY_COPY, CREA_MODERATION_COPY, communityErrorText } from "@/lib/crea-community-copy";
import { CREA_STYLES } from "@/lib/crea-styles";
import type { Locale } from "@/lib/i18n";

type Status = "pending" | "approved" | "rejected";
const STATUSES: readonly Status[] = ["pending", "approved", "rejected"];

const CHIP =
  "inline-flex min-h-11 items-center gap-1 rounded-full border-2 border-ink px-3 py-1 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 motion-reduce:transition-none";

/**
 * Moderacija zajednice u moderation grid-u (K27, O6): javni radovi i deljeni stilovi po
 * stanju. „Pusti" ih otvara svima (dok je galerija upaljena), „Odbij"/„Skini" ih sklanja,
 * sa razlogom koji vidi samo autor.
 */
export function CreaCommunityModeration({ locale, kind }: { locale: Locale; kind: "radovi" | "stilovi" }) {
  const [status, setStatus] = useState<Status>("pending");
  const queue = useQuery(api.creaGallery.moderationQueue, { kind, status });
  const gallery = useQuery(api.creaGallery.galleryState, {});
  const statusLabel: Record<Status, string> = {
    pending: CREA_MODERATION_COPY.pending[locale],
    approved: CREA_MODERATION_COPY.approved[locale],
    rejected: CREA_MODERATION_COPY.rejected[locale],
  };

  return (
    <div className="space-y-4">
      {gallery && !gallery.enabled ? (
        <p role="status" className="surface-inset border-2 border-dashed border-ink bg-paper p-3 type-body-sm font-bold text-ink">
          {CREA_MODERATION_COPY.galleryOff[locale]}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={status === id}
            onClick={() => setStatus(id)}
            className={cn(CHIP, status === id ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink hover:-translate-y-0.5")}
          >
            {statusLabel[id]}
          </button>
        ))}
      </div>
      {queue === undefined ? null : kind === "radovi" ? (
        queue.works.length === 0 ? (
          <p className="type-body font-bold text-muted">{CREA_MODERATION_COPY.empty[locale]}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {queue.works.map((work) => (
              <li key={work._id}>
                <WorkReview locale={locale} work={work} />
              </li>
            ))}
          </ul>
        )
      ) : queue.styles.length === 0 ? (
        <p className="type-body font-bold text-muted">{CREA_MODERATION_COPY.empty[locale]}</p>
      ) : (
        <ul className="surface-card divide-y divide-line border-2 border-ink bg-paper-strong px-4 shadow-[3px_3px_0_0_var(--shadow-hard-12)]">
          {queue.styles.map((style) => (
            <li key={style._id}>
              <StyleReview locale={locale} style={style} status={status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Queue = FunctionReturnType<typeof api.creaGallery.moderationQueue>;
type QueueWork = Queue["works"][number];
type QueueStyle = Queue["styles"][number];

export function WorkReview({ locale, work }: { locale: Locale; work: QueueWork }) {
  const moderate = useMutation(api.creaGallery.moderateWork);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = work.title ?? CREA_GALLERY_COPY.untitled[locale];

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await moderate({ workId: work._id as Id<"creaPublicWorks">, decision, ...(decision === "reject" && reason.trim() ? { reason } : {}) });
    } catch (thrown) {
      setError(communityErrorText(thrown, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="surface-card border-2 border-ink bg-paper-strong p-2 text-ink shadow-[3px_3px_0_0_var(--shadow-hard-12)]">
      <div className="surface-media grid min-h-40 place-items-center overflow-hidden bg-studio-well shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
        <WorkMedia work={work} compact alt={title} />
      </div>
      <div className="mt-2 space-y-1.5 px-1">
        <p className="truncate text-sm font-black">{title}</p>
        <p className="truncate text-xs font-bold text-muted">
          {work.author.name}
          {work.author.username ? ` · @${work.author.username}` : ""}
          {work.challenge ? ` · ${fillCopy(CREA_MODERATION_COPY.challenge[locale], { day: work.challenge.dayKey })}` : ""}
        </p>
        {work.prompt ? (
          <p className="line-clamp-3 text-xs font-semibold">
            <span className="font-black">{CREA_MODERATION_COPY.sharedPrompt[locale]}: </span>
            {work.prompt}
          </p>
        ) : null}
        {work.rejectReason ? <p className="text-xs font-bold text-muted">{work.rejectReason}</p> : null}
        {work.status !== "rejected" ? (
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            aria-label={CREA_MODERATION_COPY.reason[locale]}
            placeholder={CREA_MODERATION_COPY.reason[locale]}
            className="surface-inset min-h-11 w-full border-2 border-ink bg-paper px-3 text-xs font-semibold text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {work.status !== "approved" ? (
            <button type="button" disabled={busy} onClick={() => void decide("approve")} className={cn(CHIP, "bg-yellow text-ink")}>
              <Check aria-hidden="true" className="size-3.5" />
              {CREA_MODERATION_COPY.approve[locale]}
            </button>
          ) : null}
          {work.status !== "rejected" ? (
            <button type="button" disabled={busy} onClick={() => void decide("reject")} className={cn(CHIP, "bg-paper-strong text-ink")}>
              <X aria-hidden="true" className="size-3.5" />
              {work.status === "approved" ? CREA_MODERATION_COPY.takeDown[locale] : CREA_MODERATION_COPY.reject[locale]}
            </button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-xs font-bold text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function StyleReview({ locale, style, status }: { locale: Locale; style: QueueStyle; status: Status }) {
  const moderate = useMutation(api.creaGallery.moderateStyle);
  const [busy, setBusy] = useState(false);
  const base = style.styleId ? CREA_STYLES.find((entry) => entry.id === style.styleId)?.label[locale] : null;
  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      await moderate({ styleId: style._id as Id<"creaUserStyles">, decision });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black">{style.name}</p>
        <p className="text-xs font-bold text-muted">
          {style.author.name}
          {base ? ` · ${base}` : ""}
        </p>
        {style.promptFragment ? <p className="mt-1 text-xs font-semibold">{style.promptFragment}</p> : null}
      </div>
      <div className="flex gap-1.5">
        {status !== "approved" ? (
          <button type="button" disabled={busy} onClick={() => void decide("approve")} className={cn(CHIP, "bg-yellow text-ink")}>
            <Check aria-hidden="true" className="size-3.5" />
            {CREA_MODERATION_COPY.approve[locale]}
          </button>
        ) : null}
        {status !== "rejected" ? (
          <button type="button" disabled={busy} onClick={() => void decide("reject")} className={cn(CHIP, "bg-paper-strong text-ink")}>
            <X aria-hidden="true" className="size-3.5" />
            {status === "approved" ? CREA_MODERATION_COPY.takeDown[locale] : CREA_MODERATION_COPY.reject[locale]}
          </button>
        ) : null}
      </div>
    </div>
  );
}
