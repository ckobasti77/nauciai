import Link from "next/link";

import { BadgeSticker } from "@/components/igra/badge-sticker";
import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { cn } from "@/components/ui/primitives";
import { badgeTally, shelfBadges, type IgraBadgeViewState } from "@/lib/igra-a11y";
import { IGRA_BADGE_GROUP_LABEL, IGRA_BADGE_GROUPS, igraBadge, type IgraBadgeKey, type IgraBadgeProgress } from "@/lib/igra-badges";
import { IGRA_PRIMITIVE_COPY } from "@/lib/igra-copy";
import type { Locale } from "@/lib/i18n";

export type TrophyShelfBadge = {
  key: IgraBadgeKey;
  state: IgraBadgeViewState;
  unlockedAt: number | null;
  progress: IgraBadgeProgress | null;
};

/** Daska police: nalepnice „stoje" na njoj. */
function Board() {
  return <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-igra-track" />;
}

/**
 * Trofejna polica (K05). `row`: nekoliko bedževa (novi, pa poslednji osvojeni, pa sledeći
 * ciljevi kao siluete) - za tablu i panel. `grid`: svi bedževi po grupama sa nazivima,
 * zaključani kao siluete - za profil. Polica bez ijednog bedža pokazuje siluete i poziv.
 */
export function TrophyShelf(
  props: Loadable<{ badges: readonly TrophyShelfBadge[] }> & {
    locale: Locale;
    variant?: "row" | "grid";
    /** Koliko bedževa staje u `row` (podrazumevano 3). */
    max?: number;
    /** Link „Svi bedževi" ispod reda. */
    moreHref?: string;
    className?: string;
  },
) {
  const { locale, variant = "row", max = 3, moreHref, className } = props;
  const copy = IGRA_PRIMITIVE_COPY;

  if (props.loading) {
    const slots = variant === "row" ? max : 8;
    return (
      <div aria-busy="true" className={className}>
        <span role="status" className="sr-only">
          {copy.loading[locale]}
        </span>
        <IgraSkeleton className="h-3 w-24 rounded-full" />
        <div className={cn("mt-3", variant === "row" ? "flex flex-wrap gap-3" : "grid grid-cols-4 gap-x-2 gap-y-4 lg:grid-cols-8")}>
          {Array.from({ length: slots }, (_, index) => (
            <IgraSkeleton key={index} className={cn("size-[4.5rem] rounded-full", variant === "grid" && "mx-auto")} />
          ))}
        </div>
        <Board />
      </div>
    );
  }

  const { badges } = props;
  const tally = badgeTally(badges, locale);
  const header = (
    <div className="flex items-baseline justify-between gap-3">
      <p className="type-eyebrow text-muted">{copy.shelfTitle[locale]}</p>
      <p className="type-caption font-black tabular-nums text-ink">
        <span aria-hidden="true">{tally.text}</span>
        <span className="sr-only">{tally.label}</span>
      </p>
    </div>
  );

  if (variant === "grid") {
    return (
      <div className={className}>
        {header}
        {IGRA_BADGE_GROUPS.map((group) => (
          <div key={group} className="mt-5">
            <p className="type-body-sm font-black text-ink">{IGRA_BADGE_GROUP_LABEL[group][locale]}</p>
            <ul className="mt-2 grid grid-cols-4 gap-x-2 gap-y-4 lg:grid-cols-8">
              {badges
                .filter((badge) => igraBadge(badge.key).group === group)
                .map((badge) => (
                  <li key={badge.key} className="flex min-w-0 flex-col items-center text-center">
                    <BadgeSticker badge={badge.key} state={badge.state} progress={badge.progress} locale={locale} />
                    <span
                      aria-hidden="true"
                      className={cn("mt-1 type-caption font-bold", badge.state === "unlocked" || badge.state === "fresh" ? "text-ink" : "text-muted")}
                    >
                      {igraBadge(badge.key).name[locale]}
                    </span>
                  </li>
                ))}
            </ul>
            <Board />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {header}
      <ul className="mt-2 flex flex-wrap items-end gap-3">
        {shelfBadges(badges, max).map((badge) => (
          <li key={badge.key}>
            <BadgeSticker badge={badge.key} state={badge.state} progress={badge.progress} locale={locale} />
          </li>
        ))}
      </ul>
      <Board />
      {tally.earned === 0 ? <p className="mt-3 type-body-sm font-semibold text-muted">{copy.shelfEmpty[locale]}</p> : null}
      {moreHref ? (
        <Link
          href={moreHref}
          className="mt-2 inline-flex min-h-11 items-center type-body-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {copy.shelfAll[locale]}
        </Link>
      ) : null}
    </div>
  );
}
