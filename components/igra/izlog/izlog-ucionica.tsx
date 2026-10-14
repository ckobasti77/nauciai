"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";

import { ClassroomHubView } from "@/components/app/classroom-hub";
import { DashboardContent } from "@/components/app/dashboard-content";
import { CelebrationHost } from "@/components/igra/celebration-host";
import { IgraProgressContext } from "@/components/igra/igra-progress-context";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { LessonDone } from "@/components/igra/lesson-done";
import { LessonStepsBar, useActiveLessonStep } from "@/components/igra/lesson-steps-bar";
import { useXpGain } from "@/components/igra/motion/use-xp-gain";
import { Button } from "@/components/ui/button";
import { HandUnderline, Panel, cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { coursePath, lessonPath } from "@/lib/app-routes";
import { createCelebrationQueue, type IgraProgressFresh } from "@/lib/igra-celebrations";
import { IGRA_CLASSROOM_COPY } from "@/lib/igra-copy";
import { CLASSROOM_FIXTURES, CLASSROOM_TRACK_FIXTURES, IGRA_FIXTURE_IDS, IGRA_FIXTURE_LABEL, IGRA_FIXTURES, type IgraFixtureId } from "@/lib/igra-fixtures";
import { nextLessonAfter, type LessonRef } from "@/lib/igra-lesson";
import { localized, t, withLocale, type Locale } from "@/lib/i18n";
import { lessonStepLabel } from "@/lib/lesson-position";

/**
 * Izlog, deo „učionica" (K09): PRAVA učionica (`ClassroomHubView`) i prava stranica kursa
 * nad test podacima, bez prijave. Plejer lekcije piše u bazu, pa je ovde sklopljen od
 * istih delova koje plejer koristi (traka koraka, mali kraj, merenje XP-a), a „server" je
 * tajmer: posle klika XP poraste kao posle `courses.markProgress`.
 */

const PROFILE: Record<IgraFixtureId, string> = { novi: "Tamara Ilić", aktivan: "Nikola Stanić", legenda: "Vesna Radović" };

/** Lekcija koju izlog „otvara": četvrta u kursu test korisnika. */
const LESSON_COURSE = "promptovi-koji-rade";
const LESSON_SLUG = "uloge-i-kontekst";
/** Koliko test server dodaje za lekciju (danas `LEADERBOARD_XP.lesson`); pravi plejer broj MERI. */
const SERVER_LESSON_XP = 100;
const SERVER_DELAY_MS = 450;

const STEPS: ReadonlyArray<{ slug: string; media?: boolean; sr: readonly string[]; en: readonly string[] }> = [
  {
    slug: "zasto-uloga",
    media: true,
    sr: ["Asistent odgovara bolje kad zna ko treba da bude. „Ti si strpljiv nastavnik” menja i rečnik i dužinu odgovora.", "U ovoj lekciji pišeš tri uloge i gledaš kako se isti zadatak menja."],
    en: ["An assistant answers better when it knows who to be. “You are a patient teacher” changes both the wording and the length.", "In this lesson you write three roles and watch the same task change."],
  },
  {
    slug: "prva-uloga",
    sr: ["Počni od posla, ne od titule: „Pomažeš početniku da napiše prvi mejl klijentu.”", "Dodaj jedno ograničenje, na primer: bez stručnih reči."],
    en: ["Start from the job, not the title: “You help a beginner write a first email to a client.”", "Add one constraint, for example: no jargon."],
  },
  {
    slug: "kontekst",
    media: true,
    sr: ["Kontekst je sve što asistent ne može da pogodi: kome pišeš, zašto baš sada i šta se već desilo.", "Tri rečenice konteksta obično vrede više od tri pokušaja."],
    en: ["Context is everything the assistant cannot guess: who you are writing to, why now, and what already happened.", "Three sentences of context usually beat three retries."],
  },
  {
    slug: "uporedi",
    sr: ["Pošalji isti zadatak sa ulogom i bez nje. Stavi odgovore jedan pored drugog.", "Obrati pažnju na ton, dužinu i prvi predlog."],
    en: ["Send the same task with and without a role. Put the answers side by side.", "Look at the tone, the length and the first suggestion."],
  },
  {
    slug: "sacuvaj",
    sr: ["Ulogu koja radi sačuvaj kao šablon. Sledeći put kreni od nje."],
    en: ["Save the role that works as a template. Next time, start from it."],
  },
];

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Lekcija kako je crta plejer: traka koraka, zaglavlje sa dugmetom, mali kraj, telo u koracima. */
function Lekcija({
  locale,
  lessons,
  initialCompleted,
  onServerComplete,
}: {
  locale: Locale;
  lessons: readonly LessonRef[];
  initialCompleted: boolean;
  /** „Mutacija": vraća se kad test server upiše lekciju. */
  onServerComplete: (alreadyDone: boolean) => Promise<void>;
}) {
  const xpGain = useXpGain();
  const [completed, setCompleted] = useState(initialCompleted);
  const [lessonDone, setLessonDone] = useState<{ repeat: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const activeStep = useActiveLessonStep(STEPS.map((step) => `part-${step.slug}`));
  const following = nextLessonAfter(lessons, LESSON_SLUG);
  const current = lessons.find((lesson) => lesson.slug === LESSON_SLUG);

  async function finish() {
    setSaving(true);
    xpGain.start();
    await onServerComplete(completed);
    setLessonDone({ repeat: completed });
    setCompleted(true);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <LessonStepsBar step={activeStep + 1} total={STEPS.length} locale={locale} floating className="sticky top-3 z-30" />
      <Panel className="relative p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="type-eyebrow text-muted">{t(locale, "Promptovi koji rade", "Prompts that work")}</p>
            <p className="mt-2 font-display type-display-sm text-ink">{current ? localized(current.title, locale) : null}</p>
            <HandUnderline size="sm" className="mt-1" />
          </div>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={saving}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 surface-media border-2 border-ink px-4 text-sm font-extrabold text-ink disabled:cursor-wait disabled:opacity-70",
              completed ? "bg-paper-strong" : "bg-yellow",
            )}
          >
            {saving ? <Spinner /> : <CheckCircle2 className="size-4" />}
            {completed ? IGRA_CLASSROOM_COPY.lessonFinished[locale] : t(locale, "Završio/la sam ovu lekciju", "I finished this lesson")}
          </button>
        </div>
        <LessonDone
          done={lessonDone !== null}
          repeat={lessonDone?.repeat}
          gain={xpGain.gain}
          xp={xpGain.xp}
          locale={locale}
          next={following?.lesson ? { title: localized(following.lesson.title, locale), href: lessonPath(locale, LESSON_COURSE, following.lesson.slug) } : null}
          courseDone={following?.courseDone ?? false}
          courseHref={coursePath(locale, LESSON_COURSE)}
          className="mt-5 border-t border-line pt-5"
        />
      </Panel>

      <div className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[5px_5px_0_var(--shadow-hard-10)] sm:p-6">
        <div className="mx-auto w-full max-w-3xl">
          {STEPS.map((step, index) => (
            <section key={step.slug} id={`part-${step.slug}`} className="scroll-mt-6 border-t-2 border-dashed border-line py-6 first:border-t-0 first:pt-0 last:pb-0">
              <p className="mb-3 inline-flex items-center rounded-full border-2 border-line bg-paper px-3 py-1 type-eyebrow-sm text-muted">
                {lessonStepLabel(locale, index + 1, STEPS.length)}
              </p>
              {step.media ? <div aria-hidden="true" className="mb-4 aspect-video surface-media bg-paper ink-hatch" /> : null}
              {(locale === "sr" ? step.sr : step.en).map((paragraph) => (
                <p key={paragraph} className="mt-3 type-reading type-measure text-muted first:mt-0">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const NO_FRESH: IgraProgressFresh = { level: null, badges: [], courses: [], ledgerEmpty: false };

/** Okvir lekcije: drži XP test korisnika, „server" i domaćina slavlja kao ljuska aplikacije. */
function LekcijaDemo({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const fixture = IGRA_FIXTURES[stanje];
  const course = CLASSROOM_FIXTURES.aktivan.find((item) => item.slug === LESSON_COURSE)!;
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [lastLesson, setLastLesson] = useState(false);
  const [run, setRun] = useState(0);
  const [xp, setXp] = useState(fixture.xp);
  const [fresh, setFresh] = useState<IgraProgressFresh>(NO_FRESH);
  const [seen, setSeen] = useState<string[]>([]);
  const [queue, setQueue] = useState(() => createCelebrationQueue());

  // „Poslednja lekcija": sve ostale lekcije kursa su već završene, pa ova zatvara kurs.
  const lessons: LessonRef[] = course.lessons.map((lesson) => ({
    slug: lesson.slug,
    title: lesson.title,
    completed: lastLesson ? lesson.slug !== LESSON_SLUG : Boolean(lesson.progress?.completed),
  }));
  const context = useMemo(() => ({ progress: { ...fixture, xp }, openPanel: () => undefined }), [fixture, xp]);

  function reset(next: { alreadyDone?: boolean; lastLesson?: boolean }) {
    setAlreadyDone(next.alreadyDone ?? alreadyDone);
    setLastLesson(next.lastLesson ?? lastLesson);
    setXp(fixture.xp);
    setFresh(NO_FRESH);
    setSeen([]);
    setQueue(createCelebrationQueue());
    setRun((value) => value + 1);
  }

  async function serverComplete(wasDone: boolean) {
    await new Promise((resolve) => window.setTimeout(resolve, SERVER_DELAY_MS));
    if (wasDone) return;
    setXp((value) => value + SERVER_LESSON_XP);
    if (lastLesson) setFresh({ ...NO_FRESH, courses: [{ key: `course:${course.id}`, title: course.title }] });
  }

  return (
    <IgraProgressContext.Provider value={context}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" aria-pressed={alreadyDone} onClick={() => reset({ alreadyDone: !alreadyDone })}>
          {t(locale, "Lekcija je već bila završena", "Lesson was already completed")}
        </Button>
        <Button size="sm" variant="secondary" aria-pressed={lastLesson} onClick={() => reset({ lastLesson: !lastLesson })}>
          {t(locale, "Poslednja lekcija kursa", "Last lesson of the course")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => reset({})}>
          {t(locale, "Ispočetka", "Start over")}
        </Button>
      </div>
      <p role="status" className="mb-5 break-all font-mono type-caption text-muted">
        XP: {xp} · markSeen: {seen.length > 0 ? seen.join(", ") : "-"}
      </p>
      <div data-izlog-lekcija="" className="mx-auto max-w-[52rem]">
        <Lekcija key={run} locale={locale} lessons={lessons} initialCompleted={alreadyDone} onServerComplete={serverComplete} />
      </div>
      <CelebrationHost
        key={run}
        locale={locale}
        fresh={fresh}
        queue={queue}
        onSeen={(keys) => {
          setSeen((all) => [...all, ...keys]);
          setFresh((current) => ({ ...current, courses: current.courses.filter((item) => !keys.includes(item.key)) }));
        }}
      />
    </IgraProgressContext.Provider>
  );
}

export function IzlogUcionica({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const courses = CLASSROOM_FIXTURES[stanje];
  const finished = courses.find((course) => course.owned && course.lessons.every((lesson) => lesson.progress?.completed));

  return (
    <div className="space-y-10">
      <nav aria-label={t(locale, "Test korisnik", "Test user")} className="flex flex-wrap items-center gap-2">
        <span className="mr-1 type-eyebrow text-muted">{t(locale, "Test korisnik", "Test user")}</span>
        {IGRA_FIXTURE_IDS.map((id) => (
          <Link
            key={id}
            href={`${withLocale(locale, "/igra-izlog")}?deo=ucionica&stanje=${id}`}
            aria-current={id === stanje ? "page" : undefined}
            className={cn(CHIP, id === stanje ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper")}
          >
            {IGRA_FIXTURE_LABEL[id][locale]}
          </Link>
        ))}
      </nav>

      {/* Isti razmak kao `<main>` u `AppShell`: trake učionice idu do njegovih ivica. */}
      <div data-izlog-ucionica="" className="overflow-hidden border-y border-line px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:px-8 md:pb-8 md:pt-8">
        <Suspense fallback={null}>
          <ClassroomHubView
            key={stanje}
            locale={locale}
            isAdmin={false}
            profileName={PROFILE[stanje]}
            courses={courses}
            trackMeta={CLASSROOM_TRACK_FIXTURES}
          />
        </Suspense>
      </div>

      <IzlogSection
        id="lekcija"
        title={t(locale, "Lekcija: traka koraka i mali kraj", "Lesson: steps bar and the small finish")}
        note={t(
          locale,
          "Traka prati korak dok skroluješ. Klik na dugme upisuje lekciju: „+N XP” je izmerena razlika, pa ponovljen klik ne pokazuje broj. Posle poslednje lekcije kursa stiže veliko slavlje, jednom.",
          "The bar follows the step as you scroll. The button logs the lesson: “+N XP” is the measured difference, so a repeated click shows no number. After the last lesson of a course the big celebration arrives, once.",
        )}
      >
        <LekcijaDemo key={stanje} locale={locale} stanje={stanje} />
      </IzlogSection>

      <IzlogSection
        title={t(locale, "Traka koraka u Pro prikazu", "Steps bar in the Pro view")}
        note={t(locale, "Ista traka bez okvira, u zaglavlju vežbe.", "The same bar without a frame, in the exercise header.")}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <IzlogDemo label="LessonStepsBar · 1/3">
            <LessonStepsBar step={1} total={3} locale={locale} />
          </IzlogDemo>
          <IzlogDemo label="LessonStepsBar · 3/3">
            <LessonStepsBar step={3} total={3} locale={locale} />
          </IzlogDemo>
        </div>
      </IzlogSection>

      {finished ? (
        <IzlogSection
          id="kurs"
          title={t(locale, "Stranica kursa: pečat uz 100 %", "Course page: the stamp at 100%")}
          note={t(locale, "Prava stranica kursa za završen kurs ovog korisnika.", "The real course page for this user's completed course.")}
        >
          {/* Bez `id`: stranica tada ne pita bazu za izdvojene teme. */}
          <DashboardContent locale={locale} course={{ ...finished, id: undefined }} profile={{ name: PROFILE[stanje] }} />
        </IzlogSection>
      ) : null}
    </div>
  );
}
