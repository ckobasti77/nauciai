"use client";

import Link from "next/link";
import { useState } from "react";

import { BadgeSticker } from "@/components/igra/badge-sticker";
import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { cn } from "@/components/ui/primitives";
import { badgeTally, shelfBadges, type IgraBadgeViewState } from "@/lib/igra-badge-view";
import { IGRA_BADGE_GROUP_LABEL, IGRA_BADGE_GROUPS, igraBadge, type IgraBadgeKey, type IgraBadgeProgress } from "@/lib/igra-badges";
import { IGRA_PRIMITIVE_COPY } from "@/lib/igra-copy";
import { badgeFilterOptions, type BadgeFilter } from "@/lib/igra-profile";
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

/** Filter police po grupi (K13): dugmad sa stanjem `aria-pressed` i brojem osvojenih. */
function GroupFilter({
  badges,
  value,
  onChange,
  locale,
}: {
  badges: readonly TrophyShelfBadge[];
  value: BadgeFilter;
  onChange: (value: BadgeFilter) => void;
  locale: Locale;
}) {
  const options = badgeFilterOptions(badges, locale);
  return (
    <div role="group" aria-label={options.label} className="mt-4 flex flex-wrap gap-2">
      {options.items.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          aria-label={option.ariaLabel}
          onClick={() => onChange(option.id)}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink px-4 text-xs font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            value === option.id ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink hover:bg-paper",
          )}
        >
          {option.label}
          <span aria-hidden="true" className="tabular-nums opacity-70">
            {option.count}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Trofejna polica (K05). `row`: nekoliko bedževa (novi, pa poslednji osvojeni, pa sledeći
 * ciljevi kao siluete) - za tablu i panel. `grid`: svi bedževi po grupama sa nazivima,
 * zaključani kao siluete - za profil; uz `filter` (K13) iznad stoji izbor grupe. Polica
 * bez ijednog bedža pokazuje siluete i poziv.
 */
export function TrophyShelf(
  props: Loadable<{ badges: readonly TrophyShelfBadge[] }> & {
    locale: Locale;
    variant?: "row" | "grid";
    /** Koliko bedževa staje u `row` (podrazumevano 3). */
    max?: number;
    /** Link „Svi bedževi" ispod reda. */
    moreHref?: string;
    /** `grid`: izbor grupe iznad police. */
    filter?: boolean;
    /** Naslov sekcije (`h2`) umesto podrazumevanog natpisa „Bedževi". */
    title?: string;
    className?: string;
  },
) {
  const { locale, variant = "row", max = 3, moreHref, filter = false, className } = props;
  const copy = IGRA_PRIMITIVE_COPY;
  const [group, setGroup] = useState<BadgeFilter>("all");

  if (props.loading && variant === "grid") {
    // Isti raspored kao učitana polica (naslov, filter, tri grupe po 8), da se ništa ne pomeri.
    return (
      <div aria-busy="true" className={className}>
        <span role="status" className="sr-only">
          {copy.loading[locale]}
        </span>
        <IgraSkeleton className={props.title ? "h-8 w-48 rounded-full" : "h-3 w-24 rounded-full"} />
        {filter ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: IGRA_BADGE_GROUPS.length + 1 }, (_, index) => (
              <IgraSkeleton key={index} className="h-11 w-24 rounded-full" />
            ))}
          </div>
        ) : null}
        {IGRA_BADGE_GROUPS.map((item) => (
          <div key={item} className="mt-5">
            <IgraSkeleton className="h-5 w-20 rounded-full" />
            <div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-4 lg:grid-cols-8">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="flex flex-col items-center">
                  <IgraSkeleton className="size-[4.5rem] rounded-full" />
                  <IgraSkeleton className="mt-1 h-4 w-14 rounded-full" />
                </div>
              ))}
            </div>
            <Board />
          </div>
        ))}
      </div>
    );
  }

  if (props.loading) {
    const slots = max;
    return (
      <div aria-busy="true" className={className}>
        <span role="status" className="sr-only">
          {copy.loading[locale]}
        </span>
        <IgraSkeleton className="h-3 w-24 rounded-full" />
        <div className="mt-3 flex flex-wrap gap-3">
          {Array.from({ length: slots }, (_, index) => (
            <IgraSkeleton key={index} className="size-[4.5rem] rounded-full" />
          ))}
        </div>
        <Board />
        {/* Mesto za link „Svi bedževi" (K28): bez njega se polica posle učitavanja produži. */}
        {moreHref ? (
          <div className="mt-2 flex min-h-11 items-center">
            <IgraSkeleton className="h-4 w-24 rounded-full" />
          </div>
        ) : null}
      </div>
    );
  }

  const { badges } = props;
  const tally = badgeTally(badges, locale);
  const header = (
    <div className="flex items-baseline justify-between gap-3">
      {/* Polica sa svojim naslovom (profil) je sekcija strane: naslov je `h2`. */}
      {props.title ? <h2 className="type-h2 text-ink">{props.title}</h2> : <p className="type-eyebrow text-muted">{copy.shelfTitle[locale]}</p>}
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
        {filter ? <GroupFilter badges={badges} value={group} onChange={setGroup} locale={locale} /> : null}
        {IGRA_BADGE_GROUPS.filter((item) => !filter || group === "all" || item === group).map((item) => (
          <div key={item} className="mt-5">
            <p className="type-body-sm font-black text-ink">{IGRA_BADGE_GROUP_LABEL[item][locale]}</p>
            <ul className="mt-2 grid grid-cols-4 gap-x-2 gap-y-4 lg:grid-cols-8">
              {badges
                .filter((badge) => igraBadge(badge.key).group === item)
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
