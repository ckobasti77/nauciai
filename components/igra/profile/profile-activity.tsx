import { InkCalendar } from "@/components/igra/ink-calendar";
import { Odometer } from "@/components/igra/odometer";
import { cn } from "@/components/ui/primitives";
import type { StreakDayState } from "@/lib/crea-streak";
import { IGRA_PROFILE_COPY } from "@/lib/igra-copy";
import { profileCalendarActivity, profileCounters, type ProfileActivityDay } from "@/lib/igra-profile";
import type { Locale } from "@/lib/i18n";

/** Kalendar profila pokriva godinu: 52 nedelje (na telefonu poslednjih 13, kao na tabli). */
const PROFILE_WEEKS = 52;

/**
 * Aktivnost na profilu (K13): brojači za poslednjih 12 meseci (lekcije, zadaci, radovi,
 * objave) kao odometri i mastilo-kalendar iste godine. Sve iz javnog kalendara, osim
 * radova (samo vlasniku ili uz javnu knjižicu). Jedan okvir: pločice brojača su unutrašnje
 * površine bez sopstvenog okvira.
 */
export function ProfileActivity({
  days,
  works,
  todayKey,
  recent,
  isOwner,
  locale,
  className,
}: {
  days: readonly ProfileActivityDay[];
  /** Broj, `undefined` = učitava se, `null` = bez pločice (`profileWorks`). */
  works: number | null | undefined;
  todayKey: string;
  /** Vlasnik: poslednjih 14 dana niza (dan sa radom u Crei dobija bar najsvetliji stepen). */
  recent?: ReadonlyArray<{ dayKey: string; state: StreakDayState }>;
  isOwner: boolean;
  locale: Locale;
  className?: string;
}) {
  const copy = IGRA_PROFILE_COPY;
  const counters = profileCounters(days, works, locale);

  return (
    <InkCalendar
      activity={profileCalendarActivity(days)}
      todayKey={todayKey}
      recent={recent}
      weeks={PROFILE_WEEKS}
      stacked
      title={copy.yearTitle[locale]}
      empty={isOwner ? copy.yearEmptyOwn[locale] : copy.yearEmptyMember[locale]}
      locale={locale}
      className={className}
    >
      <dl aria-label={copy.countersLabel[locale]} className={cn("grid gap-2", counters.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
        {counters.map((counter) => (
          <div key={counter.key} data-profile-counter={counter.key} className="surface-inset flex flex-col-reverse bg-paper px-4 py-3">
            <dt className="type-caption font-black text-muted">{counter.unit}</dt>
            <dd>
              {counter.value === null ? <Odometer loading size="lg" locale={locale} /> : <Odometer value={counter.value} size="lg" locale={locale} />}
            </dd>
          </div>
        ))}
      </dl>
    </InkCalendar>
  );
}
