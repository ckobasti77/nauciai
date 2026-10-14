import { Flame, Snowflake } from "lucide-react";

import { IgraArt } from "@/components/igra/igra-art";
import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_STREAK_COPY } from "@/lib/crea-game-copy";
import type { StreakDayState, StreakSummary } from "@/lib/crea-streak";
import type { Locale } from "@/lib/i18n";

const STATE_LABEL: Record<StreakDayState, keyof typeof CREA_STREAK_COPY> = {
  active: "stateActive",
  frozen: "stateFrozen",
  missed: "stateMissed",
  today: "stateToday",
};

function dayLabel(dayKey: string, locale: Locale) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn-RS" : "en-GB", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(date);
}

/**
 * Niz dana (K26, G2) u zaglavlju sveske: koliko dana zaredom, traka poslednje dve
 * nedelje (urađeno · zamrznuto · propušteno · danas), zamrzavanja i pravila.
 */
export function CreaStreakPanel({ locale, streak }: { locale: Locale; streak: StreakSummary }) {
  return (
    <section aria-labelledby="crea-niz-naslov" className="surface-card border-2 border-ink bg-paper-strong p-4 text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          {/* Nalepnica plamena (K17): gori kad je danas upisano, inače tinja - isto kao `StreakFlame`. */}
          <IgraArt id="rang.plamen" size={48} decorative className={streak.todayDone ? undefined : "opacity-60 saturate-[0.15]"} />
          <div>
            <h2 id="crea-niz-naslov" className="type-body-sm font-black text-muted">
              {CREA_STREAK_COPY.title[locale]}
            </h2>
            <p className="type-h3 tabular-nums">{fillCopy(CREA_STREAK_COPY.days[locale], { n: streak.current })}</p>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-muted">
          <li>{fillCopy(CREA_STREAK_COPY.best[locale], { n: streak.best })}</li>
          <li className="inline-flex items-center gap-1">
            <Snowflake aria-hidden="true" className="size-4" />
            {fillCopy(CREA_STREAK_COPY.freezes[locale], { n: streak.freezes })}
          </li>
          {streak.nextMilestone ? <li>{fillCopy(CREA_STREAK_COPY.next[locale], { n: streak.nextMilestone })}</li> : null}
        </ul>
      </div>

      <ol aria-label={CREA_STREAK_COPY.title[locale]} className="mt-4 grid grid-cols-7 gap-1.5 sm:grid-cols-14">
        {streak.recent.map((day) => {
          const label = `${dayLabel(day.dayKey, locale)}: ${CREA_STREAK_COPY[STATE_LABEL[day.state]][locale]}`;
          return (
            <li key={day.dayKey} title={label} className="flex flex-col items-center gap-1">
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-8 place-items-center rounded-full text-xs font-black",
                  day.state === "active" && "bg-ink text-paper-strong",
                  day.state === "frozen" && "bg-surface-b text-ink",
                  day.state === "missed" && "border border-line text-muted",
                  day.state === "today" && "border border-dashed border-ink text-ink",
                )}
              >
                {day.state === "frozen" ? <Snowflake className="size-3.5" /> : day.state === "active" ? <Flame className="size-3.5 fill-yellow text-yellow dark:fill-paper dark:text-paper" /> : null}
              </span>
              <span className="sr-only">{label}</span>
              <span aria-hidden="true" className="text-[0.65rem] font-bold text-muted">
                {Number(day.dayKey.slice(8))}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 type-body-sm font-bold">{streak.todayDone ? CREA_STREAK_COPY.done[locale] : CREA_STREAK_COPY.pending[locale]}</p>
      <details className="mt-2 text-sm text-muted">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          {locale === "sr" ? "Pravila niza" : "Streak rules"}
        </summary>
        <p className="type-measure font-semibold">{CREA_STREAK_COPY.rules[locale]}</p>
      </details>
    </section>
  );
}
