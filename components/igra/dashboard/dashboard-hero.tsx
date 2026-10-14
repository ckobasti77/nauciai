"use client";

import { ArrowRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { IgraHero } from "@/components/igra/igra-hero";
import { IgraLik } from "@/components/igra/igra-lik";
import { IgraSkeleton } from "@/components/igra/igra-skeleton";
import { ProgressRing } from "@/components/igra/progress-ring";
import { LinkButton } from "@/components/ui/primitives";
import { IGRA_PRIMITIVE_COPY } from "@/lib/igra-copy";
import { dashboardGreeting, dashboardRobiLine, dashboardSceneArt, type IgraDaypart } from "@/lib/igra-daypart";
import { missionRingLabel, missionRingProgress, type DailyMission } from "@/lib/igra-mission";
import type { Locale } from "@/lib/i18n";

const DashboardMascot = dynamic(() => import("@/components/igra/dashboard/dashboard-mascot").then((mod) => mod.DashboardMascot), { ssr: false });

/**
 * Heroj kontrolne table (K08, plan K07 §1): scena po dobu dana, pozdrav, Robijeva rečenica
 * i misija dana - JEDAN sledeći korak sa jednim dugmetom. Kad lekcija čeka, misija je
 * „nastavi kurs" sa prstenom mesta u kursu. Pozdrav i scena zavise samo od doba dana
 * (server), pa su na ekranu pre podataka; misija dok čeka crta skelet iste visine.
 *
 * Prezentaciona: `mission === undefined` znači „učitava se", `null` „za danas je sve na mestu".
 */
export function DashboardHero({
  locale,
  daypart,
  name,
  mission,
  note,
  secondary,
  mascot = true,
}: {
  locale: Locale;
  daypart: IgraDaypart;
  name: string | null;
  mission: DailyMission | null | undefined;
  /** Rečenica ispod dugmeta (ukupan napredak kroz lekcije). */
  note?: string;
  /** Tiši link pored dugmeta. */
  secondary?: { href: string; label: string };
  mascot?: boolean;
}) {
  const copy = IGRA_PRIMITIVE_COPY;

  return (
    <IgraHero
      art={dashboardSceneArt(daypart)}
      locale={locale}
      greeting={dashboardGreeting(daypart, name, locale)}
      aside={
        mascot ? (
          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-[33.5%] hidden w-40 min-[1400px]:block">
            <DashboardMascot locale={locale} />
          </div>
        ) : null
      }
    >
      <p className="relative w-fit surface-inset bg-paper px-4 py-3 type-body-sm font-bold text-ink shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
        <span aria-hidden="true" className="absolute -top-1 right-10 size-2 rotate-45 bg-paper shadow-[inset_1px_1px_0_0_var(--shadow-hard-14)] lg:-right-1 lg:top-1/2 lg:-translate-y-1/2 lg:shadow-[inset_-1px_1px_0_0_var(--shadow-hard-14)]" />
        <span className="font-black">Robi:</span> {dashboardRobiLine(daypart, locale)}
      </p>

      <div className="mt-5 border-t border-line pt-5" aria-busy={mission === undefined || undefined}>
        {mission === undefined ? (
          <>
            <span role="status" className="sr-only">
              {copy.loading[locale]}
            </span>
            {/* Iste visine kao misija sa lekcijom (naslov, rečenica, dugme, link, napomena),
                da se kartice ispod heroja ne pomere kad podaci stignu. */}
            <IgraSkeleton className="h-4 w-24 rounded-full" />
            <div className="mt-2 flex items-start gap-4">
              <IgraSkeleton className="size-14 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <IgraSkeleton className="h-7 w-3/4 rounded-full lg:h-[2.125rem]" />
                <IgraSkeleton className="mt-2 h-[3.25rem] w-full surface-inset sm:h-[1.625rem] sm:rounded-full" />
              </div>
            </div>
            <IgraSkeleton className="mt-5 h-12 w-full rounded-full sm:w-48" />
            <IgraSkeleton className="mt-3 h-11 w-36 rounded-full sm:hidden" />
            <IgraSkeleton className="mt-3 h-[1.125rem] w-64 max-w-full rounded-full" />
          </>
        ) : (
          <>
            <p className="type-eyebrow text-muted">{copy.missionEyebrow[locale]}</p>
            <div className="mt-2 flex items-start gap-4">
              {mission?.ring ? (
                <ProgressRing progress={missionRingProgress(mission.ring)} label={missionRingLabel(mission.ring, locale)}>
                  {mission.ring.position}/{mission.ring.total}
                </ProgressRing>
              ) : mission ? (
                <IgraLik lik={mission.lik} poza={mission.poza} size="md" decorative />
              ) : null}
              <div className="min-w-0">
                <h1 className="type-h1 text-ink">{mission ? mission.title : copy.missionEmptyTitle[locale]}</h1>
                <p className="mt-2 type-body type-measure font-bold text-muted">{mission ? mission.body : copy.missionEmptyBody[locale]}</p>
              </div>
            </div>
            {mission || secondary ? (
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                {mission ? (
                  <LinkButton href={mission.href} tone="yellow" size="lg" className="w-full sm:w-fit">
                    {mission.cta}
                    <ArrowRight aria-hidden="true" className="size-5" />
                  </LinkButton>
                ) : null}
                {secondary ? (
                  <Link
                    href={secondary.href}
                    className="inline-flex min-h-11 items-center gap-1 type-body-sm font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {secondary.label}
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            ) : null}
            {note ? <p className="mt-3 type-caption font-bold text-muted">{note}</p> : null}
          </>
        )}
      </div>
    </IgraHero>
  );
}
