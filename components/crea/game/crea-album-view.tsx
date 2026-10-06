"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AudioLines,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clapperboard,
  Footprints,
  Gift,
  GitBranch,
  GraduationCap,
  Image as ImageIcon,
  Mic,
  Palette,
  Sparkles,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import {
  ALBUM_PAGE_REWARD_CREDITS,
  CREA_ALBUM_PAGES,
  CREA_ALBUM_STICKER_COUNT,
  isPageComplete,
  type CreaStickerFamily,
} from "@/lib/crea-album";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_ALBUM_COPY, CREA_STICKER_FAMILY_LABEL } from "@/lib/crea-game-copy";
import type { Locale } from "@/lib/i18n";
import { creaMotionFor, pageTurnDirection } from "@/lib/motion-contract";

const FAMILY_ICON: Record<CreaStickerFamily, LucideIcon> = {
  prvi: Footprints,
  alat: Wrench,
  kamera: Video,
  efekat: Sparkles,
  stil: Palette,
  glas: Mic,
  recept: ChefHat,
};

/** „Prvi koraci" imaju svaka svoju ikonicu; alati nose ikonicu svoje oblasti. */
const STICKER_ICON: Record<string, LucideIcon> = {
  "prvi:slika": ImageIcon,
  "prvi:video": Clapperboard,
  "prvi:zvuk": AudioLines,
  "prvi:besplatno": Wrench,
  "prvi:verzija": GitBranch,
  "prvi:recept": ChefHat,
  "prvi:lekcija": GraduationCap,
  "prvi:proba": Gift,
};
const TOOL_AREA_ICON: Record<string, LucideIcon> = { slika: ImageIcon, video: Clapperboard, zvuk: AudioLines };

function stickerIcon(sticker: { id: string; family: CreaStickerFamily }): LucideIcon {
  if (STICKER_ICON[sticker.id]) return STICKER_ICON[sticker.id]!;
  if (sticker.family === "alat") return TOOL_AREA_ICON[sticker.id.slice("alat:".length).split(".")[0]!] ?? Wrench;
  return FAMILY_ICON[sticker.family];
}

/** Kratko ime strane u indeksu - bez imena porodice ispred tačke („Kamera · Dron“ → „Dron“). Alati zadržavaju oblast. */
function shortTitle(title: string): string {
  const parts = title.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ") : title;
}

/** Blag nagib svake sličice (kao rukom zalepljena), stalan po mestu na strani. */
const TILTS = ["-2deg", "1.5deg", "-1deg", "2.5deg", "-2.5deg", "1deg"];

/** Sličica zalepljena u poslednja dva minuta dobija animaciju lepljenja. */
const FRESH_MS = 2 * 60_000;

type RewardOutcome = { pageId: string; text: string } | null;

export type CreaAlbumData = NonNullable<FunctionReturnType<typeof api.creaGame.myAlbum>>;
type ClaimResult = FunctionReturnType<typeof api.creaGame.claimAlbumReward>;

/** Album sa podacima iz Convex-a (sveska). */
export function CreaAlbumView({ locale }: { locale: Locale }) {
  const album = useQuery(api.creaGame.myAlbum, {});
  const claim = useMutation(api.creaGame.claimAlbumReward);
  if (album === undefined) {
    return <p className="type-body font-bold text-muted">{locale === "sr" ? "Učitavam album…" : "Loading the album…"}</p>;
  }
  return <CreaAlbumBook locale={locale} album={album} onClaim={(pageId) => claim({ pageId })} />;
}

/**
 * Album sličica (K26, G4) kao Panini: strana po strana, svako mesto ima broj i ime;
 * zalepljena sličica je u boji, prazno mesto je isprekidano. Puna strana nudi malu
 * nagradu u kreditima (jednom) - dugme, da se nagrada oseti.
 */
export function CreaAlbumBook({
  locale,
  album,
  onClaim,
}: {
  locale: Locale;
  album: CreaAlbumData;
  onClaim: (pageId: string) => Promise<ClaimResult>;
}) {
  const reduced = Boolean(useReducedMotion());
  const crea = creaMotionFor(reduced);
  const [mountedAt] = useState(() => Date.now());
  const [pageIndex, setPageIndex] = useState(0);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const [claiming, setClaiming] = useState(false);
  const [outcome, setOutcome] = useState<RewardOutcome>(null);

  const owned = useMemo(() => new Map(album.stickers.map((s) => [s.stickerId, s.earnedAt])), [album]);
  const ownedIds = useMemo(() => new Set(owned.keys()), [owned]);
  const pageRows = useMemo(() => new Map(album.pages.map((p) => [p.pageId, p])), [album]);

  const page = CREA_ALBUM_PAGES[pageIndex]!;
  const pageOwned = page.stickers.filter((s) => ownedIds.has(s.id)).length;
  const complete = isPageComplete(page, ownedIds);
  const row = pageRows.get(page.id);
  const claimed = Boolean(row && row.rewardCredits > 0);
  const date = new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn-RS" : "en-GB", { day: "numeric", month: "long" });

  function goTo(next: number) {
    const target = Math.max(0, Math.min(CREA_ALBUM_PAGES.length - 1, next));
    const order = CREA_ALBUM_PAGES.map((p) => p.id);
    setDirection(pageTurnDirection(order, page.id, CREA_ALBUM_PAGES[target]!.id));
    setPageIndex(target);
    setOutcome(null);
  }

  async function claimReward() {
    setClaiming(true);
    try {
      const result = await onClaim(page.id);
      setOutcome({
        pageId: page.id,
        text: result.ok ? fillCopy(CREA_ALBUM_COPY.claimedNow[locale], { n: result.credits }) : CREA_ALBUM_COPY.rewardProblem[result.reason][locale],
      });
    } finally {
      setClaiming(false);
    }
  }

  const families = [...new Set(CREA_ALBUM_PAGES.map((p) => p.family))];

  return (
    <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <nav aria-label={CREA_ALBUM_COPY.pages[locale]} className="min-w-0">
        <p className="type-body-sm font-black text-ink">
          {CREA_ALBUM_COPY.title[locale]} ·{" "}
          <span className="tabular-nums">{fillCopy(CREA_ALBUM_COPY.progress[locale], { owned: ownedIds.size, total: CREA_ALBUM_STICKER_COUNT })}</span>
        </p>
        <p className="mt-1 type-body-sm font-semibold text-muted">{fillCopy(CREA_ALBUM_COPY.intro[locale], { n: ALBUM_PAGE_REWARD_CREDITS })}</p>
        <details className="mt-3 lg:hidden">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            {CREA_ALBUM_COPY.pages[locale]} ({CREA_ALBUM_PAGES.length})
          </summary>
          <PageIndex locale={locale} families={families} activeId={page.id} ownedIds={ownedIds} onPick={(i) => goTo(i)} />
        </details>
        <div className="mt-3 hidden lg:block">
          <PageIndex locale={locale} families={families} activeId={page.id} ownedIds={ownedIds} onPick={(i) => goTo(i)} />
        </div>
      </nav>

      <div className="min-w-0 [perspective:1400px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={page.id}
            aria-labelledby={`strana-${page.id}`}
            initial={crea.isReduced ? { opacity: 0 } : { opacity: 0, rotateY: crea.pageTurn.rotateY * direction, x: crea.pageTurn.x * direction }}
            animate={{ opacity: 1, rotateY: 0, x: 0 }}
            exit={crea.isReduced ? { opacity: 0 } : { opacity: 0, rotateY: -crea.pageTurn.rotateY * direction, x: -crea.pageTurn.x * direction }}
            transition={{ duration: crea.pageTurn.duration, ease: crea.pageTurn.ease as unknown as [number, number, number, number] }}
            style={{ transformOrigin: direction >= 0 ? "left center" : "right center" }}
            className="surface-card border-2 border-ink bg-paper-strong p-4 text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-6"
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
              <div className="min-w-0">
                <p className="text-xs font-black text-muted">
                  {fillCopy(CREA_ALBUM_COPY.pageOf[locale], { n: pageIndex + 1, total: CREA_ALBUM_PAGES.length })} · {CREA_STICKER_FAMILY_LABEL[page.family][locale]}
                </p>
                <h2 id={`strana-${page.id}`} className="mt-1 type-h2">
                  {page.title[locale]}
                </h2>
                <p className="mt-1 type-body-sm font-semibold text-muted">
                  <span className="font-black text-ink">{CREA_ALBUM_COPY.how[locale]}:</span> {page.howTo[locale]}
                </p>
              </div>
              <span className="rounded-full bg-surface-b px-3 py-1 text-sm font-black tabular-nums">
                {pageOwned}/{page.stickers.length}
              </span>
            </header>

            <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {page.stickers.map((sticker, i) => {
                const earnedAt = owned.get(sticker.id);
                const Icon = stickerIcon(sticker);
                const number = String(i + 1).padStart(2, "0");
                const fresh = earnedAt !== undefined && mountedAt - earnedAt < FRESH_MS;
                return (
                  <li key={sticker.id} className="min-w-0">
                    {earnedAt !== undefined ? (
                      <div
                        style={{ rotate: TILTS[i % TILTS.length] }}
                        className={cn(
                          "surface-inset flex h-full flex-col items-center gap-2 bg-surface-a p-3 text-center shadow-[3px_3px_0_0_var(--shadow-hard)]",
                          fresh && "crea-sticker-stick",
                        )}
                      >
                        <span className="grid size-12 place-items-center rounded-full bg-yellow text-ink">
                          <Icon aria-hidden="true" className="size-6" />
                        </span>
                        <span className="text-sm font-black leading-tight">{sticker.label[locale]}</span>
                        <span className="mt-auto text-[0.7rem] font-bold text-muted">
                          № {number} · {fillCopy(CREA_ALBUM_COPY.earned[locale], { date: date.format(new Date(earnedAt)) })}
                        </span>
                      </div>
                    ) : (
                      <div className="surface-inset flex h-full flex-col items-center gap-2 border border-dashed border-line bg-paper p-3 text-center text-muted">
                        <span className="grid size-12 place-items-center rounded-full border border-dashed border-line font-mono text-sm font-black">{number}</span>
                        <span className="text-sm font-bold leading-tight">{sticker.label[locale]}</span>
                        <span className="sr-only">{CREA_ALBUM_COPY.empty[locale]}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <div className="flex flex-wrap items-center gap-3">
                {complete && claimed ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-b px-3 py-2 text-sm font-black">
                    <CircleCheck aria-hidden="true" className="size-4" />
                    {CREA_ALBUM_COPY.claimed[locale]}
                  </span>
                ) : complete ? (
                  <button
                    type="button"
                    onClick={() => void claimReward()}
                    disabled={claiming}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                  >
                    <Gift aria-hidden="true" className="size-4" />
                    {fillCopy(CREA_ALBUM_COPY.claim[locale], { n: ALBUM_PAGE_REWARD_CREDITS })}
                  </button>
                ) : (
                  <span className="rounded-full border border-line px-3 py-2 text-sm font-bold text-muted">
                    {fillCopy(CREA_ALBUM_COPY.reward[locale], { n: ALBUM_PAGE_REWARD_CREDITS })}
                  </span>
                )}
                {complete && !claimed && album.rewardProblem ? (
                  <p className="type-body-sm font-bold text-muted">{CREA_ALBUM_COPY.rewardProblem[album.rewardProblem][locale]}</p>
                ) : null}
                {outcome?.pageId === page.id ? (
                  <p role="status" className="type-body-sm font-black">
                    {outcome.text}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goTo(pageIndex - 1)}
                  disabled={pageIndex === 0}
                  aria-label={CREA_ALBUM_COPY.prev[locale]}
                  className="inline-grid size-11 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink transition hover:-translate-y-0.5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                >
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => goTo(pageIndex + 1)}
                  disabled={pageIndex === CREA_ALBUM_PAGES.length - 1}
                  aria-label={CREA_ALBUM_COPY.next[locale]}
                  className="inline-grid size-11 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink transition hover:-translate-y-0.5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                >
                  <ChevronRight aria-hidden="true" className="size-5" />
                </button>
              </div>
            </footer>
          </motion.section>
        </AnimatePresence>
        <p className="sr-only" aria-live="polite">
          {page.title[locale]} {pageOwned}/{page.stickers.length}
        </p>
      </div>
    </div>
  );
}

function PageIndex({
  locale,
  families,
  activeId,
  ownedIds,
  onPick,
}: {
  locale: Locale;
  families: CreaStickerFamily[];
  activeId: string;
  ownedIds: ReadonlySet<string>;
  onPick: (index: number) => void;
}) {
  return (
    <div className="mt-2 space-y-3">
      {families.map((family) => (
        <div key={family}>
          <p className="text-xs font-black text-muted">{CREA_STICKER_FAMILY_LABEL[family][locale]}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {CREA_ALBUM_PAGES.map((p, index) => ({ p, index }))
              .filter(({ p }) => p.family === family)
              .map(({ p, index }) => {
                const have = p.stickers.filter((s) => ownedIds.has(s.id)).length;
                const active = p.id === activeId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => onPick(index)}
                      title={p.title[locale]}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-left text-sm font-bold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                        active ? "bg-ink text-paper-strong" : "bg-surface-a text-ink hover:bg-surface-b",
                      )}
                    >
                      <span className="min-w-0 truncate">{family === "alat" ? p.title[locale] : shortTitle(p.title[locale])}</span>
                      <span className={cn("shrink-0 text-xs font-black tabular-nums", active ? "text-paper-strong" : "text-muted")}>
                        {have === p.stickers.length ? <CircleCheck aria-hidden="true" className="size-4" /> : `${have}/${p.stickers.length}`}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
