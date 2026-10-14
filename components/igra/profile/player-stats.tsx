import { Odometer } from "@/components/igra/odometer";
import { StreakFlame } from "@/components/igra/streak-flame";
import { XpBar } from "@/components/igra/xp-bar";
import { cn } from "@/components/ui/primitives";
import { IGRA_DAY_FORMS, IGRA_PROFILE_COPY } from "@/lib/igra-copy";
import { pluralize, type Locale } from "@/lib/i18n";

/**
 * „Karta igrača" na profilu (K13): ukupan XP kao odometar, XP traka sa „još N XP do
 * nivoa X" i, samo na sopstvenom profilu, plamen niza i najduži niz. Tuđi niz se ne
 * prikazuje: niz broji i rad u Crei, a to je drugima javno samo kroz đačku knjižicu.
 */
export function PlayerStats({
  xp,
  streak,
  locale,
  className,
}: {
  xp: number;
  /** Samo vlasnik; `null` = bez niza. */
  streak: { current: number; best: number; todayDone: boolean } | null;
  locale: Locale;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <Odometer value={xp} size="lg" suffix="XP" locale={locale} />
        {streak ? <StreakFlame current={streak.current} todayDone={streak.todayDone} size="md" locale={locale} /> : null}
      </div>
      <XpBar xp={xp} size="md" locale={locale} />
      {streak && streak.best > 0 ? (
        <p className="type-caption font-bold text-muted">
          {IGRA_PROFILE_COPY.streakBest[locale]}: {streak.best} {pluralize(locale, streak.best, IGRA_DAY_FORMS[locale])}
        </p>
      ) : null}
    </div>
  );
}
