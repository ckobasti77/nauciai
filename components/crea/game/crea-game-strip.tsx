"use client";

import { Flame, NotebookPen, Sticker } from "lucide-react";
import Link from "next/link";

import { useCreaGame } from "@/components/crea/game/crea-game-context";
import { CreaStreakBurst } from "@/components/crea/game/crea-streak-burst";
import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_GAME_COPY, CREA_STREAK_COPY } from "@/lib/crea-game-copy";
import { withLocale, type Locale } from "@/lib/i18n";

/**
 * Traka napretka u radionici (K26): niz dana, XP i album u jednoj pilula-vezi ka svesci.
 * Gost je ne vidi. Na telefonu ostaje samo niz i ikonica sveske.
 */
export function CreaGameStrip({ locale }: { locale: Locale }) {
  const { game, notebookPath } = useCreaGame();
  if (!game) return null;
  const { streak, album, xp } = game;
  const number = locale === "sr" ? "sr-RS" : "en-US";
  const label = [
    fillCopy(CREA_GAME_COPY.streakChipLabel[locale], { n: streak.current }),
    streak.todayDone ? CREA_STREAK_COPY.done[locale] : CREA_GAME_COPY.streakToday[locale],
    fillCopy(CREA_GAME_COPY.xpChip[locale], { n: xp.toLocaleString(number) }),
    fillCopy(CREA_GAME_COPY.albumChipLabel[locale], { owned: album.owned, total: album.total }),
    CREA_GAME_COPY.notebookLabel[locale],
  ].join(". ");

  return (
    <>
      <Link
        href={withLocale(locale, notebookPath)}
        aria-label={label}
        title={label}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 studio-focus-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Flame aria-hidden="true" className={cn("size-3.5", streak.todayDone ? "fill-yellow text-ink" : "text-muted")} />
          {streak.current}
        </span>
        <span aria-hidden="true" className="hidden h-3.5 w-px bg-line md:inline-block" />
        <span className="hidden items-center gap-1 tabular-nums md:inline-flex">{fillCopy(CREA_GAME_COPY.xpChip[locale], { n: xp.toLocaleString(number) })}</span>
        <span aria-hidden="true" className="hidden h-3.5 w-px bg-line md:inline-block" />
        <span className="hidden items-center gap-1 tabular-nums md:inline-flex">
          <Sticker aria-hidden="true" className="size-3.5" />
          {fillCopy(CREA_GAME_COPY.albumChip[locale], { owned: album.owned, total: album.total })}
        </span>
        <NotebookPen aria-hidden="true" className="size-3.5" />
        <span className="hidden xl:inline">{CREA_GAME_COPY.notebook[locale]}</span>
      </Link>
      <CreaStreakBurst locale={locale} milestone={streak.milestoneToday} />
    </>
  );
}
