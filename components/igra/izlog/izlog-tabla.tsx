"use client";

import Link from "next/link";
import { useState } from "react";

import { DashboardHome } from "@/components/app/dashboard-home";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { IGRA_DAYPARTS, type IgraDaypart } from "@/lib/igra-daypart";
import { DASHBOARD_OVERVIEW_FIXTURES, IGRA_FIXTURE_IDS, IGRA_FIXTURE_LABEL, IGRA_FIXTURE_TODAY, IGRA_FIXTURES, type IgraFixtureId } from "@/lib/igra-fixtures";
import { t, withLocale, type Locale, type LocalizedText } from "@/lib/i18n";

/**
 * Izlog, deo „tabla" (K08): PRAVA kontrolna tabla (`DashboardHome`) nad test podacima, bez
 * prijave i bez upita. Prekidači menjaju ono što u aplikaciji zavisi od sata i od mreže:
 * doba dana (scena i pozdrav), učitavanje, tablu bez napretka (upit pao) i dan koji još
 * nije upisan u niz (misija tada nudi lekciju koja čeka).
 */

const PROFILE: Record<IgraFixtureId, { name: string; firstName: string; username: string }> = {
  novi: { name: "Tamara Ilić", firstName: "Tamara", username: "tamara.ilic" },
  aktivan: { name: "Nikola Stanić", firstName: "Nikola", username: "nikola.stanic" },
  legenda: { name: "Vesna Radović", firstName: "Vesna", username: "vesna.radovic" },
};

const DAYPART_LABEL: Record<IgraDaypart, LocalizedText> = {
  jutro: { sr: "Jutro", en: "Morning" },
  dan: { sr: "Dan", en: "Day" },
  vece: { sr: "Veče", en: "Evening" },
  noc: { sr: "Noć", en: "Night" },
};

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function IzlogTabla({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const [daypart, setDaypart] = useState<IgraDaypart>("jutro");
  const [loading, setLoading] = useState(false);
  const [noProgress, setNoProgress] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);

  const fixture = IGRA_FIXTURES[stanje];
  const igra = noProgress ? null : loading ? undefined : todayOpen ? { ...fixture, streak: { ...fixture.streak, todayDone: false } } : fixture;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <nav aria-label={t(locale, "Test korisnik", "Test user")} className="flex flex-wrap items-center gap-2">
          <span className="mr-1 type-eyebrow text-muted">{t(locale, "Test korisnik", "Test user")}</span>
          {IGRA_FIXTURE_IDS.map((id) => (
            <Link
              key={id}
              href={`${withLocale(locale, "/igra-izlog")}?deo=tabla&stanje=${id}`}
              aria-current={id === stanje ? "page" : undefined}
              className={cn(CHIP, id === stanje ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}
            >
              {IGRA_FIXTURE_LABEL[id][locale]}
            </Link>
          ))}
        </nav>
        <div role="group" aria-label={t(locale, "Doba dana", "Time of day")} className="flex flex-wrap items-center gap-2">
          <span className="mr-1 type-eyebrow text-muted">{t(locale, "Doba dana", "Time of day")}</span>
          {IGRA_DAYPARTS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === daypart}
              onClick={() => setDaypart(item)}
              className={cn(CHIP, item === daypart ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}
            >
              {DAYPART_LABEL[item][locale]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" aria-pressed={loading} onClick={() => setLoading((value) => !value)}>
            {loading ? t(locale, "Prikaži podatke", "Show data") : t(locale, "Prikaži učitavanje", "Show loading")}
          </Button>
          <Button size="sm" variant="secondary" aria-pressed={noProgress} onClick={() => setNoProgress((value) => !value)}>
            {noProgress ? t(locale, "Vrati napredak", "Restore progress") : t(locale, "Bez napretka", "No progress data")}
          </Button>
          <Button size="sm" variant="secondary" aria-pressed={todayOpen} onClick={() => setTodayOpen((value) => !value)}>
            {todayOpen ? t(locale, "Dan je upisan", "Today is logged") : t(locale, "Dan još nije upisan", "Today not logged yet")}
          </Button>
        </div>
      </div>

      {/* Širina sadržaja kao u aplikaciji na 1440 px (sidebar 246 px + margine). */}
      <div data-izlog-tabla="" className="mx-auto max-w-[70.5rem]">
        <DashboardHome
          key={stanje}
          locale={locale}
          profile={PROFILE[stanje]}
          overview={DASHBOARD_OVERVIEW_FIXTURES[stanje]}
          loading={loading}
          daypart={daypart}
          igra={igra}
          todayKey={IGRA_FIXTURE_TODAY}
        />
      </div>
    </div>
  );
}
