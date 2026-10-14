import type { Loadable } from "@/components/igra/igra-skeleton";
import { LevelStamp } from "@/components/igra/level-stamp";
import { Odometer } from "@/components/igra/odometer";
import { StreakFlame } from "@/components/igra/streak-flame";
import { XpBar } from "@/components/igra/xp-bar";
import { cn } from "@/components/ui/primitives";
import { IGRA_PRIMITIVE_COPY } from "@/lib/igra-copy";
import { levelFromXp } from "@/lib/igra-level";
import type { Locale } from "@/lib/i18n";

/** Deo odgovora `igra:getMyProgress` koji kartica crta. */
export type ProgressCardData = {
  xp: number;
  streak: { current: number; todayDone: boolean };
};

const FRAME = "surface-card border-2 border-ink bg-paper-strong shadow-[6px_6px_0_0_var(--shadow-hard-13)]";

/**
 * Kartica napretka (K05): nivo, XP i niz dana u jednom okviru. `full` je za tablu i panel
 * (pečat sa imenom nivoa, XP kao odometar, traka, plamen sa pozivom); `compact` je jedan
 * red za uske kolone. Bez ijednog poena ispod stoji poziv na prvi korak.
 */
export function ProgressCard(
  props: Loadable<{ progress: ProgressCardData }> & {
    locale: Locale;
    variant?: "full" | "compact";
    className?: string;
  },
) {
  const { locale, variant = "full", className } = props;
  const copy = IGRA_PRIMITIVE_COPY;
  const status = props.loading ? (
    <span role="status" className="sr-only">
      {copy.loading[locale]}
    </span>
  ) : null;

  if (variant === "compact") {
    return (
      <section aria-label={copy.progressTitle[locale]} aria-busy={props.loading || undefined} className={cn(FRAME, "flex items-center gap-3 p-3", className)}>
        {status}
        {props.loading ? (
          <>
            <LevelStamp loading size="sm" showName locale={locale} />
            <XpBar loading size="sm" locale={locale} className="min-w-0 flex-1" />
            <StreakFlame loading size="sm" locale={locale} />
          </>
        ) : (
          <>
            <LevelStamp level={levelFromXp(props.progress.xp).level} size="sm" showName locale={locale} />
            <XpBar xp={props.progress.xp} size="sm" locale={locale} className="min-w-0 flex-1" />
            <StreakFlame current={props.progress.streak.current} todayDone={props.progress.streak.todayDone} size="sm" locale={locale} />
          </>
        )}
      </section>
    );
  }

  const layout = "grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-8 lg:grid-cols-[auto_minmax(0,1fr)_auto]";
  const streakCell = "border-t border-line pt-4 sm:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0";

  if (props.loading) {
    return (
      <section aria-label={copy.progressTitle[locale]} aria-busy="true" className={cn(FRAME, "p-5 sm:p-6", className)}>
        {status}
        <div className={layout}>
          <LevelStamp loading size="lg" showName locale={locale} />
          <div className="min-w-0">
            <Odometer loading size="hero" locale={locale} />
            <XpBar loading locale={locale} className="mt-2" />
          </div>
          <div className={streakCell}>
            <StreakFlame loading size="lg" locale={locale} />
          </div>
        </div>
      </section>
    );
  }

  const { xp, streak } = props.progress;
  return (
    <section aria-label={copy.progressTitle[locale]} className={cn(FRAME, "p-5 sm:p-6", className)}>
      <div className={layout}>
        <LevelStamp level={levelFromXp(xp).level} size="lg" showName locale={locale} />
        <div className="min-w-0">
          <Odometer value={xp} size="hero" suffix="XP" locale={locale} />
          <XpBar xp={xp} locale={locale} className="mt-2" />
        </div>
        <div className={streakCell}>
          <StreakFlame current={streak.current} todayDone={streak.todayDone} size="lg" locale={locale} />
        </div>
      </div>
      {xp <= 0 ? <p className="mt-4 border-t border-line pt-4 type-body-sm font-semibold text-muted">{copy.progressInvite[locale]}</p> : null}
    </section>
  );
}
