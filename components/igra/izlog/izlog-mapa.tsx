"use client";

import Link from "next/link";
import { useState } from "react";

import { DashboardContent } from "@/components/app/dashboard-content";
import { LazyCourseJourney } from "@/components/app/dashboard-live";
import { IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { JourneyMap } from "@/components/igra/journey-map";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { IGRA_JOURNEY_COPY } from "@/lib/igra-copy";
import { CLASSROOM_FIXTURES, IGRA_FIXTURE_IDS, IGRA_FIXTURE_LABEL, type IgraFixtureId } from "@/lib/igra-fixtures";
import { courseStations, lessonStations } from "@/lib/igra-journey";
import { t, withLocale, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „mapa" (K10): mapa puta nad test podacima, bez prijave i bez upita. Stanice
 * prave ISTE funkcije kao stranica kursa i smera (`lessonStations`, `courseStations`), a
 * stranica kursa je prava (`DashboardContent`) sa mapom u panelu „Nastavni tok" - istim
 * lenjim chunk-om (`LazyCourseJourney`) kojim je crta aplikacija.
 */

const PROFILE: Record<IgraFixtureId, string> = { novi: "Tamara Ilić", aktivan: "Nikola Stanić", legenda: "Vesna Radović" };
const COURSE = "promptovi-koji-rade";
const COUNTS = [1, 5, 20] as const;
/** Koliki deo puta je test korisnik prešao u mapi sa proizvoljnim brojem stanica. */
const DONE_SHARE: Record<IgraFixtureId, number> = { novi: 0, aktivan: 0.4, legenda: 1 };

/** Sve lekcije test kataloga redom: odatle se uzima prvih N za mapu od N stanica. */
const ALL_LESSONS = CLASSROOM_FIXTURES.legenda.flatMap((course) => course.lessons);

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
/** Okvir mape kad stoji sama (stranica smera). */
const FRAME = "surface-card border-2 border-ink shadow-[6px_6px_0_var(--shadow-hard-10)]";

function Stanice({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const [count, setCount] = useState<number>(5);
  const [done, setDone] = useState(() => Math.round(5 * DONE_SHARE[stanje]));
  const [locked, setLocked] = useState(false);
  const [run, setRun] = useState(0);

  const stations = lessonStations({
    courseSlug: COURSE,
    lessons: ALL_LESSONS.slice(0, count).map((lesson, index) => ({ ...lesson, progress: index < done ? { completed: true } : null })),
    canOpen: !locked,
    locale,
  });

  function pick(next: number) {
    setCount(next);
    setDone(Math.round(next * DONE_SHARE[stanje]));
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 type-eyebrow text-muted">{t(locale, "Stanica", "Stations")}</span>
        {COUNTS.map((item) => (
          <button key={item} type="button" aria-pressed={item === count} onClick={() => pick(item)} className={cn(CHIP, item === count ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}>
            {item}
          </button>
        ))}
        <Button size="sm" variant="secondary" disabled={done <= 0} onClick={() => setDone((value) => Math.max(0, value - 1))}>
          {t(locale, "Lekcija manje", "One lesson back")}
        </Button>
        <Button size="sm" variant="secondary" disabled={done >= count} onClick={() => setDone((value) => Math.min(count, value + 1))}>
          {t(locale, "Završi lekciju", "Finish a lesson")}
        </Button>
        <Button size="sm" variant="secondary" aria-pressed={locked} onClick={() => setLocked((value) => !value)}>
          {t(locale, "Bez pristupa", "No access")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRun((value) => value + 1)}>
          {t(locale, "Nacrtaj ponovo", "Draw again")}
        </Button>
      </div>
      <p role="status" className="mb-5 font-mono type-caption text-muted">
        {t(locale, `Urađeno ${Math.min(done, count)} od ${count}`, `Done ${Math.min(done, count)} of ${count}`)}
      </p>
      <div data-izlog-mapa="" className="mx-auto max-w-[70.5rem]">
        <JourneyMap key={run} stations={stations} locale={locale} label={IGRA_JOURNEY_COPY.courseLabel[locale]} className={FRAME} />
      </div>
    </>
  );
}

export function IzlogMapa({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const courses = CLASSROOM_FIXTURES[stanje];
  const course = courses.find((item) => item.slug === COURSE)!;
  const trackStations = courseStations({
    locale,
    courses: courses.map((item) => ({
      id: item.id ?? item.slug,
      slug: item.slug,
      title: item.title,
      owned: Boolean(item.owned),
      completedLessons: item.lessons.filter((lesson) => lesson.progress?.completed).length,
      totalLessons: item.lessons.length,
    })),
  });

  return (
    <div className="space-y-10">
      <nav aria-label={t(locale, "Test korisnik", "Test user")} className="flex flex-wrap items-center gap-2">
        <span className="mr-1 type-eyebrow text-muted">{t(locale, "Test korisnik", "Test user")}</span>
        {IGRA_FIXTURE_IDS.map((id) => (
          <Link
            key={id}
            href={`${withLocale(locale, "/igra-izlog")}?deo=mapa&stanje=${id}`}
            aria-current={id === stanje ? "page" : undefined}
            className={cn(CHIP, id === stanje ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}
          >
            {IGRA_FIXTURE_LABEL[id][locale]}
          </Link>
        ))}
      </nav>

      <IzlogSection
        id="stanice"
        title={t(locale, "Mapa puta: 1, 5 i 20 stanica", "Journey map: 1, 5 and 20 stations")}
        note={t(
          locale,
          "Pređeni deo se iscrta kad mapa uđe u kadar, a „sledeća” stanica otkuca tri puta. Raspored bira širina same mape: uspravno ispod 40rem, u redovima po pet iznad.",
          "The travelled part is drawn when the map scrolls into view, and the “next” station pulses three times. The map's own width picks the layout: vertical below 40rem, rows of five above.",
        )}
      >
        <Stanice key={stanje} locale={locale} stanje={stanje} />
      </IzlogSection>

      <IzlogSection
        id="smer"
        title={t(locale, "Smer: kursevi kao stanice", "Track: courses as stations")}
        note={t(
          locale,
          "Kurs koji korisnik nema je zaključan, ali vodi na svoju stranicu. Prvi otključan nezavršen kurs je „sledeće”.",
          "A course the user does not own is locked but still links to its page. The first unlocked unfinished course is “next”.",
        )}
      >
        <div className="mx-auto max-w-[70.5rem]">
          <JourneyMap key={stanje} stations={trackStations} locale={locale} label={IGRA_JOURNEY_COPY.trackLabel[locale]} className={FRAME} />
        </div>
      </IzlogSection>

      <IzlogSection
        id="kurs"
        title={t(locale, "Stranica kursa: mapa iznad spiska lekcija", "Course page: the map above the lesson list")}
        note={t(locale, "Prava stranica kursa za kurs „Promptovi koji rade” ovog korisnika.", "The real course page for this user's “Prompts that work” course.")}
      >
        {/* Bez `id`: stranica tada ne pita bazu za izdvojene teme. */}
        <div className="mx-auto max-w-[70.5rem]">
          <DashboardContent
            key={stanje}
            locale={locale}
            course={{ ...course, id: undefined }}
            profile={{ name: PROFILE[stanje] }}
            journey={<LazyCourseJourney course={course} locale={locale} isAdmin={false} />}
          />
        </div>
      </IzlogSection>
    </div>
  );
}
