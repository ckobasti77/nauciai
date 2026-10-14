"use client";

import { useMutation, useQuery } from "convex/react";
import { Copy, Download, Eye, EyeOff, NotebookPen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useBelgradeToday } from "@/components/crea/game/crea-game-context";
import { CreaReportCardView } from "@/components/crea/game/crea-report-card";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { CREA_CARD_COPY } from "@/lib/crea-game-copy";
import { withLocale, type Locale } from "@/lib/i18n";

/** Javna adresa knjižice i njene slike (OG). */
export function reportCardPaths(locale: Locale, username: string) {
  const safe = encodeURIComponent(username);
  return {
    page: withLocale(locale, `/studio/knjizica/${safe}`),
    image: `/api/crea/knjizica/${safe}?lang=${locale}`,
  };
}

/**
 * Knjižica sa kontrolama deljenja (K26, G5). Vlasnik bira da li je javna (podrazumevano
 * NE): tek tad je vide drugi članovi i link za deljenje sa slikom. `profile` je sekcija
 * na profilu člana (sama nosi okvir, pa knjižica unutra nema svoj); kad knjižica nije
 * javna a gledalac nije vlasnik, sekcije nema.
 */
export function CreaReportCardPanel({
  locale,
  username,
  variant = "notebook",
  notebookHref,
}: {
  locale: Locale;
  username: string;
  variant?: "notebook" | "profile";
  /** Profil: link na knjižicu u svesci (samo vlasniku). */
  notebookHref?: string;
}) {
  const todayKey = useBelgradeToday();
  const data = useQuery(api.creaGame.reportCardFor, { username, todayKey });
  const setPublic = useMutation(api.creaGame.setReportCardPublic);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!data) return null;
  const paths = reportCardPaths(locale, data.username);
  const profile = variant === "profile";

  async function toggle() {
    setBusy(true);
    try {
      await setPublic({ reportCardPublic: !data!.isPublic });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${paths.page}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const body = (
    <div className="space-y-3">
      <CreaReportCardView locale={locale} name={data.name} username={data.username} card={data.card} framed={!profile} />
      {!profile ? <p className="type-body-sm font-semibold text-muted">{CREA_CARD_COPY.how[locale]}</p> : null}
      {data.isOwner ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={data.isPublic}
              disabled={busy}
              onClick={() => void toggle()}
              className={cn(
                "igra-press inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink px-4 text-sm font-black text-ink disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                data.isPublic ? "bg-yellow" : "bg-paper-strong",
              )}
            >
              {data.isPublic ? <Eye aria-hidden="true" className="size-4" /> : <EyeOff aria-hidden="true" className="size-4" />}
              {data.isPublic ? CREA_CARD_COPY.publicOn[locale] : CREA_CARD_COPY.publicOff[locale]}
            </button>
            {data.isPublic ? (
              <>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="igra-press inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <Copy aria-hidden="true" className="size-4" />
                  {CREA_CARD_COPY.copyLink[locale]}
                </button>
                <a
                  href={paths.image}
                  download={`knjizica-${data.username}.png`}
                  className="igra-press inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <Download aria-hidden="true" className="size-4" />
                  {CREA_CARD_COPY.image[locale]}
                </a>
              </>
            ) : null}
          </div>
          <p role="status" className="text-xs font-semibold text-muted">
            {copied ? CREA_CARD_COPY.copied[locale] : CREA_CARD_COPY.publicHint[locale]}
          </p>
        </div>
      ) : null}
    </div>
  );

  if (!profile) return body;
  return (
    <section className="surface-card border-2 border-line bg-paper-strong p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display type-display-sm text-ink">{CREA_CARD_COPY.profileTitle[locale]}</h2>
        {data.isOwner && notebookHref ? (
          <Link
            href={notebookHref}
            className="igra-press inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <NotebookPen aria-hidden="true" className="size-4" />
            {CREA_CARD_COPY.profileOpen[locale]}
          </Link>
        ) : null}
      </div>
      {body}
    </section>
  );
}
