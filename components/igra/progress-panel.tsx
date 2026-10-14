"use client";

import { LevelStamp } from "@/components/igra/level-stamp";
import { Odometer } from "@/components/igra/odometer";
import { RankChip } from "@/components/igra/rank-chip";
import { StreakFlame } from "@/components/igra/streak-flame";
import { TrophyShelf, type TrophyShelfBadge } from "@/components/igra/trophy-shelf";
import { XpBar } from "@/components/igra/xp-bar";
import { Dialog } from "@/components/ui/dialog";
import { cn, LinkButton } from "@/components/ui/primitives";
import type { StreakSummary } from "@/lib/crea-streak";
import { formatXp } from "@/lib/igra-a11y";
import { IGRA_CELEBRATION_COPY, IGRA_SHELL_COPY } from "@/lib/igra-copy";
import { levelFromXp } from "@/lib/igra-level";
import { bestStreakText, streakStripLabel, weekRankHint } from "@/lib/igra-shell";
import type { Locale } from "@/lib/i18n";

/** Deo odgovora `igra:getMyProgress` koji panel crta. */
export type ProgressPanelData = {
  xp: number;
  weekXp: number;
  weekRank: number | null;
  eligible: boolean;
  streak: Pick<StreakSummary, "current" | "best" | "todayDone" | "recent">;
  badges: readonly TrophyShelfBadge[];
};

/** Tačka dana u traci niza: aktivan je mastilo, zamrznut prsten linije, propušten podloga. */
const DAY: Record<StreakSummary["recent"][number]["state"], string> = {
  active: "bg-ink",
  frozen: "bg-igra-track shadow-[inset_0_0_0_2px_var(--line)]",
  missed: "bg-igra-track",
  today: "shadow-[inset_0_0_0_2px_var(--ink)]",
};

const SECTION = "mt-5 border-t border-line pt-5";

/**
 * Sadržaj panela „Moj napredak" (K06): nivo i XP do sledećeg, niz sa poslednjih 14 dana,
 * poslednji bedževi i mesto na nedeljnoj listi. Jedan okvir nosi dijalog; delovi se
 * odvajaju tankom linijom. Bez upita - podaci kroz props.
 */
export function ProgressPanelBody({ progress, locale, profileHref }: { progress: ProgressPanelData; locale: Locale; profileHref: string }) {
  const copy = IGRA_SHELL_COPY;
  const { xp, streak } = progress;
  const hint = weekRankHint(progress, locale);
  const last = streak.recent.length - 1;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <LevelStamp level={levelFromXp(xp).level} size="lg" showName locale={locale} />
        <div className="sm:text-right">
          <p className="type-eyebrow text-muted">{copy.totalXp[locale]}</p>
          <Odometer value={xp} size="lg" suffix="XP" locale={locale} />
        </div>
      </div>
      <XpBar xp={xp} size="lg" locale={locale} className="mt-4" />

      <div className={cn(SECTION, "flex flex-wrap items-center justify-between gap-x-6 gap-y-4")}>
        <StreakFlame current={streak.current} todayDone={streak.todayDone} size="lg" locale={locale} />
        <div>
          <p className="type-eyebrow-sm text-muted">{copy.streakRecent[locale]}</p>
          <p role="img" aria-label={streakStripLabel(streak.recent, locale)} className="mt-1.5 flex gap-1">
            {streak.recent.map((day, index) => (
              // Današnji upisan dan je jedina žuta tačka: marker je nagrada, ne ukras.
              <span key={day.dayKey} className={cn("size-3 rounded-full", index === last && day.state === "active" ? "bg-igra-marker shadow-[inset_0_0_0_2px_var(--ink)]" : DAY[day.state])} />
            ))}
          </p>
          {streak.best > 0 ? <p className="mt-1.5 type-caption font-semibold text-muted">{bestStreakText(streak.best, locale)}</p> : null}
        </div>
      </div>

      <TrophyShelf badges={progress.badges} moreHref={profileHref} locale={locale} className={SECTION} />

      <div className={SECTION}>
        <p className="type-eyebrow text-muted">{copy.weekTitle[locale]}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {progress.eligible ? (
            <span className="inline-flex items-center gap-2">
              <span className="type-body-sm font-semibold text-muted">{copy.weekRank[locale]}</span>
              <RankChip rank={progress.weekRank} locale={locale} />
            </span>
          ) : null}
          <span className="type-body-sm font-black tabular-nums text-ink">{formatXp(progress.weekXp, locale)}</span>
        </div>
        {hint ? <p className="mt-2 type-caption font-semibold text-muted">{hint}</p> : null}
      </div>
    </>
  );
}

/**
 * Panel „Moj napredak": list uz donju ivicu na telefonu, dijalog od `sm`. Zatvara ga Esc,
 * klik pored i svaki link u njemu (profil, rang lista, „Svi bedževi").
 */
export function ProgressPanel({
  open,
  onClose,
  progress,
  locale,
  profileHref,
  leaderboardHref,
}: {
  open: boolean;
  onClose: () => void;
  progress: ProgressPanelData;
  locale: Locale;
  profileHref: string;
  leaderboardHref: string;
}) {
  const copy = IGRA_SHELL_COPY;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={copy.panelTitle[locale]}
      closeLabel={IGRA_CELEBRATION_COPY.close[locale]}
      align="sheet"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <LinkButton href={profileHref} tone="paper" onClick={onClose}>
            {copy.profileLink[locale]}
          </LinkButton>
          <LinkButton href={leaderboardHref} tone="yellow" onClick={onClose}>
            {copy.leaderboardLink[locale]}
          </LinkButton>
        </div>
      }
    >
      <div
        onClickCapture={(event) => {
          if ((event.target as Element).closest("a")) onClose();
        }}
      >
        <ProgressPanelBody progress={progress} locale={locale} profileHref={profileHref} />
      </div>
    </Dialog>
  );
}
