import { IgraSkeleton, type Loadable } from "@/components/igra/igra-skeleton";
import { cn } from "@/components/ui/primitives";
import type { StreakDayState } from "@/lib/crea-streak";
import { INK_CALENDAR_PHONE_WEEKS, inkCalendarView, type InkLevel } from "@/lib/igra-calendar";
import { IGRA_DASHBOARD_COPY, IGRA_PRIMITIVE_COPY } from "@/lib/igra-copy";
import type { Locale } from "@/lib/i18n";

/** Jačina mastila po stepenu; prazno je podloga trake. */
const INK: Record<InkLevel, string> = {
  0: "bg-igra-track",
  1: "bg-ink/35",
  2: "bg-ink/65",
  3: "bg-ink",
};

const FRAME = "surface-card border-2 border-ink bg-paper-strong p-5 shadow-[6px_6px_0_0_var(--shadow-hard-13)] sm:p-6";
const GRID = "grid grid-flow-col grid-rows-7 gap-[3px] [grid-auto-columns:minmax(0,1fr)] sm:gap-1";
/** Mreža: cela širina na telefonu, najviše 26 kolona po ~22 px od `sm`. */
const GRID_BOX = "min-w-0 sm:max-w-[42rem] xl:w-[42rem] xl:shrink-0";

/**
 * Mastilo-kalendar (K08): poslednjih 26 nedelja kao mreža dana (na telefonu poslednjih
 * 13), tamnije mastilo za više završenih lekcija; današnji dan je uokviren. Mreža je jedna
 * slika za čitač ekrana, sa rečenicom umesto 182 ćelije. Bez aktivnosti stoji ista prazna
 * mreža i poziv, pa se ništa ne pomera kad prvi dan stigne.
 */
export function InkCalendar(
  props: Loadable<{
    activity: ReadonlyArray<{ day: string; completed: number }>;
    todayKey: string;
  }> & {
    /** Poslednjih 14 dana niza: dan aktivan zbog rada u Crei dobija najsvetliji stepen. */
    recent?: ReadonlyArray<{ dayKey: string; state: StreakDayState }>;
    /** Dodatni red ispod naslova (npr. najduži niz). */
    note?: string;
    locale: Locale;
    className?: string;
  },
) {
  const { locale, className } = props;
  const copy = IGRA_DASHBOARD_COPY;

  if (props.loading) {
    return (
      <section aria-busy="true" className={cn(FRAME, className)}>
        <span role="status" className="sr-only">
          {IGRA_PRIMITIVE_COPY.loading[locale]}
        </span>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <IgraSkeleton className="h-7 w-32 rounded-full" />
            <IgraSkeleton className="mt-2 h-[1.3125rem] w-56 rounded-full" />
            <IgraSkeleton className="mt-1 h-[1.3125rem] w-40 rounded-full" />
            <IgraSkeleton className="mt-4 h-[1.125rem] w-32 rounded-full" />
          </div>
          <div className={GRID_BOX}>
            <IgraSkeleton className="aspect-[13/7] surface-media sm:aspect-[26/7]" />
            <IgraSkeleton className="mt-2 h-[1.125rem] w-16 rounded-full" />
          </div>
        </div>
      </section>
    );
  }

  const view = inkCalendarView({ activity: props.activity, recent: props.recent, todayKey: props.todayKey }, locale);
  const phoneFrom = view.weeks - INK_CALENDAR_PHONE_WEEKS;
  const dateFormat = new Intl.DateTimeFormat(locale === "sr" ? "sr-RS" : "en-US", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const formatDay = (dayKey: string) => dateFormat.format(new Date(`${dayKey}T12:00:00Z`));
  const phoneStart = view.cells[phoneFrom * 7]?.dayKey;

  return (
    <section data-motion="card" aria-labelledby="igra-ink-calendar" className={cn(FRAME, className)}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h2 id="igra-ink-calendar" className="type-h2 text-ink">
            {copy.calendarTitle[locale]}
          </h2>
          <p className="mt-2 type-body-sm font-bold text-muted">{view.activeDays > 0 ? view.label : copy.calendarEmpty[locale]}</p>
          {props.note ? <p className="mt-1 type-body-sm font-bold text-muted">{props.note}</p> : null}
          <p aria-hidden="true" className="mt-4 flex items-center gap-1.5 type-caption font-bold text-muted">
            {copy.calendarLess[locale]}
            {([0, 1, 2, 3] as const).map((level) => (
              <span key={level} className={cn("size-3 surface-media", INK[level])} />
            ))}
            {copy.calendarMore[locale]}
          </p>
        </div>

        <div className={GRID_BOX}>
          <div role="img" aria-label={view.label} data-motion="chart" className={GRID}>
            {view.cells.map((cell) => (
              <span
                key={cell.dayKey}
                className={cn(
                  "aspect-square surface-media",
                  cell.week < phoneFrom && "max-sm:hidden",
                  cell.future ? "invisible" : INK[cell.level],
                  cell.today && "outline outline-2 outline-offset-1 outline-ink",
                )}
              />
            ))}
          </div>
          <p aria-hidden="true" className="mt-2 flex justify-between type-caption font-bold text-muted">
            <span className="sm:hidden">{phoneStart ? formatDay(phoneStart) : null}</span>
            <span className="max-sm:hidden">{view.cells.length > 0 ? formatDay(view.startKey) : null}</span>
            <span>{copy.calendarToday[locale]}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
