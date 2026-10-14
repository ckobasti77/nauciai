"use client";

import Link from "next/link";
import { useRef } from "react";

import { RankAvatar } from "@/components/igra/leaderboard/rank-avatar";
import { useEnterStagger } from "@/components/igra/motion/use-enter-stagger";
import { Odometer } from "@/components/igra/odometer";
import { IgraThreeStage } from "@/components/igra/three/igra-three-stage";
import { cn } from "@/components/ui/primitives";
import { formatLevel, rankChipView } from "@/lib/igra-a11y";
import { IGRA_LEADERBOARD_COPY } from "@/lib/igra-copy";
import { podiumStep } from "@/lib/igra-leaderboard";
import { levelFromXp } from "@/lib/igra-level";
import type { Locale } from "@/lib/i18n";

const COPY = IGRA_LEADERBOARD_COPY;

export type PodiumRow = {
  userId: string;
  rank: number;
  name: string;
  username?: string;
  avatarUrl?: string | null;
  xp: number;
  isViewer?: boolean;
};

/** Od `md` podijum je tri stuba: drugo mesto levo, prvo u sredini, treće desno. */
const ORDER = ["md:order-2", "md:order-1", "md:order-3"] as const;
/** Visina stepenika po mestu (izjednačeni dele visinu). Prvo mesto je jedino žuto. */
const STEP = {
  1: "md:h-28 bg-yellow",
  2: "md:h-20 bg-igra-track",
  3: "md:h-14 bg-igra-track",
} as const;

/**
 * Podijum (K12, IGRA-PLAN §5): prva tri mesta sa medaljom (`rang.zlato|srebro|bronza`),
 * avatarom u prstenu nivoa i XP-om kao odometrom. Na telefonu su to tri reda; od `md` tri
 * stuba na stepenicima koji stoje na donjoj ivici kartice, a iznad prvog mesta je 3D pehar
 * (na računaru, lenjo; inače nalepnica `rang.pehar`). Mesta koja niko ne drži su prazni
 * stepenici, pa podijum zadržava oblik i sa jednim ili dva člana.
 *
 * Prezentaciona komponenta: redovi, adrese i odluka o nivou stižu kroz props.
 */
export function Podium({
  rows,
  locale,
  showLevel,
  countUp,
  hrefFor,
  show3d = true,
  className,
}: {
  /** Najviše tri reda, redom mesta. */
  rows: readonly PodiumRow[];
  locale: Locale;
  /** Nivo samo kad je XP reda ukupan XP (`rowXpIsTotal`). */
  showLevel: boolean;
  /** XP se vrti samo pri prvom prikazu liste. */
  countUp: boolean;
  hrefFor: (row: PodiumRow) => string | undefined;
  show3d?: boolean;
  className?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  useEnterStagger(listRef, { selector: "li[data-podium-place]", deps: [rows.length] });
  const places = rows.slice(0, 3);

  return (
    <section
      aria-label={COPY.podium[locale]}
      className={cn("overflow-hidden surface-card border-2 border-ink bg-paper-strong shadow-[6px_6px_0_0_var(--shadow-hard-12)]", className)}
    >
      <ol ref={listRef} className="divide-y divide-line md:grid md:grid-cols-3 md:items-end md:gap-4 md:divide-y-0 md:px-6 md:pt-6 lg:gap-6">
        {[0, 1, 2].map((index) => {
          const row = places[index];
          if (!row) {
            return (
              <li key={`open-${index}`} aria-hidden="true" className={cn("hidden md:flex md:flex-col md:items-center md:justify-end", ORDER[index])}>
                <span className="pb-3 type-body-sm font-bold text-muted">{COPY.openSpot[locale]}</span>
                <span className="block h-14 w-full rounded-t-xl border border-b-0 border-dashed border-line" />
              </li>
            );
          }

          const step = podiumStep(row.rank);
          const rank = rankChipView(row.rank, locale);
          const level = showLevel ? levelFromXp(row.xp) : null;
          const href = hrefFor(row);
          const first = index === 0;
          return (
            <li
              key={row.userId}
              data-podium-place={step}
              data-rank-viewer={row.isViewer ? "" : undefined}
              className={cn(
                "flex items-center gap-3 px-4 py-3 md:flex-col md:items-stretch md:justify-end md:gap-0 md:p-0 md:text-center",
                row.isViewer && "bg-igra-marker-wash md:bg-transparent",
                ORDER[index],
              )}
            >
              {first && show3d ? (
                <div className="mx-auto hidden w-24 md:block lg:w-28">
                  <IgraThreeStage kind="pehar" spin="once" />
                </div>
              ) : null}
              <Link
                href={href ?? "#"}
                aria-disabled={!href}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 surface-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:flex-none md:flex-col md:gap-2 md:px-1 md:pt-2"
              >
                <RankAvatar
                  name={row.name}
                  avatarUrl={row.avatarUrl}
                  size={step === 1 ? "podiumFirst" : "podium"}
                  levelProgress={level?.progress}
                  medal={rank.medal}
                />
                <span className="min-w-0 flex-1 md:w-full">
                  <span className="sr-only">{rank.label}: </span>
                  <span className="flex min-w-0 items-center gap-2 md:justify-center">
                    <span className="truncate type-body font-black text-ink">{row.name}</span>
                    {row.isViewer ? (
                      <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 type-eyebrow-sm text-paper-strong">{COPY.you[locale]}</span>
                    ) : null}
                  </span>
                  {row.username || level ? (
                    <span className="block truncate text-xs font-bold text-muted">
                      {[row.username ? `@${row.username}` : null, level ? formatLevel(level.level, locale) : null].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </span>
              </Link>
              <span className="shrink-0 text-right md:mt-1 md:text-center">
                <Odometer value={row.xp} size="md" suffix="XP" animate={countUp} locale={locale} />
              </span>
              <span
                aria-hidden="true"
                className={cn("hidden w-full place-items-center rounded-t-xl font-black text-ink type-h2 md:mt-3 md:grid", STEP[step])}
              >
                {row.rank}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
