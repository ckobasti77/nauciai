"use client";

import { useMutation, useQuery } from "convex/react";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useCreaGame } from "@/components/crea/game/crea-game-context";
import { CreaStamp } from "@/components/crea/game/crea-stamp";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ALBUM_PAGE_REWARD_CREDITS, albumPageById, stickerById } from "@/lib/crea-album";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_STAMP_COPY } from "@/lib/crea-game-copy";
import { withLocale, type Locale } from "@/lib/i18n";

export type CreaStampMoment = { title: string; body: string; href: string };
type Moment = CreaStampMoment;

/** Pečat ostaje ovoliko dugo, pa se sam skloni (može i ranije, dugmetom). */
const STAMP_VISIBLE_MS = 6500;
/** Sačekaj da se otkrivanje rada (polaroid, traka, kaseta) završi pre pečata. */
const STAMP_DELAY_MS = 1400;

/**
 * Pečat „Odličan 5" kad nešto uradiš PRVI PUT (K26, G5): nova sličica u albumu ili puna
 * strana. Server upisuje sličice čim rad stigne; ovde se samo pokaže ono što korisnik
 * još nije video i odmah se označi kao viđeno (pa se ne ponavlja u drugom tabu).
 */
export function CreaStampHost({ locale }: { locale: Locale }) {
  const { game, notebookPath } = useCreaGame();
  const unseen = useQuery(api.creaGame.unseenMoments, game ? {} : "skip");
  const markSeen = useMutation(api.creaGame.markMomentsSeen);
  const [shown, setShown] = useState<Moment | null>(null);

  const pending = unseen && (unseen.stickers.length > 0 || unseen.pages.length > 0) ? unseen : null;

  useEffect(() => {
    if (shown || !pending) return;
    const timer = window.setTimeout(() => {
      const albumHref = `${withLocale(locale, notebookPath)}?deo=album`;
      const page = pending.pages[0] ? albumPageById(pending.pages[0].pageId) : undefined;
      const first = pending.stickers[0] ? stickerById(pending.stickers[0].stickerId) : undefined;
      const others = pending.stickers.length - 1;
      const moment: Moment | null = page
        ? {
            title: fillCopy(CREA_STAMP_COPY.pageFull[locale], { what: page.title[locale] }),
            body: fillCopy(CREA_STAMP_COPY.pageReward[locale], { n: ALBUM_PAGE_REWARD_CREDITS }),
            href: albumHref,
          }
        : first
          ? {
              title: fillCopy(CREA_STAMP_COPY.firstTime[locale], { what: first.label[locale] }),
              body:
                others > 0
                  ? `${CREA_STAMP_COPY.newSticker[locale]} · ${fillCopy(CREA_STAMP_COPY.more[locale], { n: others })}`
                  : CREA_STAMP_COPY.newSticker[locale],
              href: albumHref,
            }
          : null;
      void markSeen({
        stickerIds: pending.stickers.map((s) => s.id as Id<"creaStickers">),
        pageIds: pending.pages.map((p) => p.id as Id<"creaAlbumPages">),
      }).catch(() => undefined);
      if (moment) setShown(moment);
    }, STAMP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, shown, locale, notebookPath, markSeen]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), STAMP_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  return <CreaStampToast locale={locale} moment={shown} onClose={() => setShown(null)} />;
}

/** Pečat kao obaveštenje (bez upita); koristi ga `CreaStampHost`. */
export function CreaStampToast({ locale, moment, onClose }: { locale: Locale; moment: CreaStampMoment | null; onClose: () => void }) {
  const shown = moment;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 top-3 z-50 flex justify-center sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto">
      {shown ? (
        <div
          data-igra-busy=""
          className="pointer-events-auto surface-card relative flex w-full max-w-sm items-center gap-3 border-2 border-ink bg-paper-strong p-3 pr-12 text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)]"
        >
          <CreaStamp locale={locale} size="md" slam />
          <div className="crea-stamp-note min-w-0">
            <p className="type-body-sm font-black">{shown.title}</p>
            <p className="mt-0.5 text-xs font-bold text-muted">{shown.body}</p>
            <Link
              href={shown.href}
              className="mt-1.5 inline-flex min-h-11 items-center text-sm font-black text-ink underline decoration-yellow decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:min-h-0"
            >
              {CREA_STAMP_COPY.openAlbum[locale]}
            </Link>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={CREA_STAMP_COPY.close[locale]}
            className="absolute right-1 top-1 inline-grid size-11 place-items-center rounded-full text-ink transition hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
