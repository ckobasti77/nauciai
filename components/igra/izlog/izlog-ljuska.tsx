"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";

import { AppSidebarContent } from "@/components/app/app-sidebar";
import { CelebrationHost } from "@/components/igra/celebration-host";
import { IgraProgressContext } from "@/components/igra/igra-progress-context";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { LevelRing } from "@/components/igra/level-ring";
import { ProgressPanel, ProgressPanelBody } from "@/components/igra/progress-panel";
import { ShellProgressChip, ShellProgressRail, ShellProgressRow } from "@/components/igra/shell-progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { createCelebrationQueue, type IgraCelebrationQueue, type IgraProgressFresh } from "@/lib/igra-celebrations";
import { IGRA_FIXTURE_IDS, IGRA_FIXTURE_LABEL, IGRA_FIXTURES, type IgraFixtureId } from "@/lib/igra-fixtures";
import { t, withLocale, type Locale } from "@/lib/i18n";
import { publicProfilePath } from "@/lib/profile-links";

/**
 * Izlog, deo „ljuska" (K06): PRAVA ljuska aplikacije (`AppSidebarContent`: sidebar, rail,
 * mobilno zaglavlje i donji meni) nad test podacima, bez prijave i bez upita. Desno od
 * nje su isti delovi u svim stanjima, prsten nivoa i panel „Moj napredak".
 */

const NAVIGATION = { role: "student", plan: "pro", courses: [] };
/** Krediti sa 2, 4 i 5 cifara: od njih zavisi koliko čipa staje u mobilno zaglavlje. */
const PROFILE: Record<IgraFixtureId, { name: string; username: string; credits: number }> = {
  novi: { name: "Tamara Ilić", username: "tamara.ilic", credits: 40 },
  aktivan: { name: "Nikola Stanić", username: "nikola.stanic", credits: 1250 },
  legenda: { name: "Vesna Radović", username: "vesna.radovic", credits: 18400 },
};
const RING_SAMPLES = [0, 0.25, 0.49, 0.9, 1];

/**
 * Slavlje onako kako ga vodi ljuska: sveže stavke idu domaćinu, a `onSeen` radi što i
 * `igra:markSeen` na serveru - viđeno prestaje da bude sveže. Svaki klik je nova sesija.
 */
function SlavljeULjusci({ locale, fresh }: { locale: Locale; fresh: IgraProgressFresh }) {
  const [run, setRun] = useState<{ id: number; queue: IgraCelebrationQueue } | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const left = useMemo(
    () => ({
      level: fresh.level !== null && seen.includes(`level:${fresh.level}`) ? null : fresh.level,
      badges: fresh.badges.filter((badge) => !seen.includes(`badge:${badge}`)),
      courses: fresh.courses.filter((course) => !seen.includes(course.key)),
      ledgerEmpty: fresh.ledgerEmpty && seen.length === 0,
    }),
    [fresh, seen],
  );
  const nothing = fresh.level === null && fresh.badges.length === 0 && fresh.courses.length === 0;

  return (
    <>
      <Button
        disabled={nothing}
        onClick={() => {
          setSeen([]);
          setRun((previous) => ({ id: (previous?.id ?? 0) + 1, queue: createCelebrationQueue() }));
        }}
      >
        {t(locale, "Stiglo je novo neviđeno", "Something new arrived")}
      </Button>
      <p role="status" className="mt-3 break-all font-mono type-caption text-muted">
        {nothing ? t(locale, "Ovaj korisnik nema ništa novo.", "Nothing new for this user.") : `markSeen: ${seen.length > 0 ? seen.join(", ") : "-"}`}
      </p>
      {run ? <CelebrationHost key={run.id} locale={locale} fresh={left} queue={run.queue} onSeen={(keys) => setSeen((all) => [...all, ...keys])} /> : null}
    </>
  );
}

export function IzlogLjuska({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const fixture = IGRA_FIXTURES[stanje];
  const profile = PROFILE[stanje];
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const context = useMemo(() => ({ progress: loading ? undefined : fixture, openPanel: () => setPanelOpen(true) }), [fixture, loading]);
  const profileHref = withLocale(locale, publicProfilePath(profile.username));
  const leaderboardHref = withLocale(locale, "/app/community/leaderboard");
  const open = () => setPanelOpen(true);
  const loadingLabel = t(locale, "učitava se", "loading");
  const initials = profile.name.split(" ").map((part) => part[0]).join("");

  return (
    <IgraProgressContext.Provider value={context}>
      <div className="space-y-6">
        <nav aria-label={t(locale, "Test korisnik", "Test user")} className="flex flex-wrap items-center gap-2">
          <span className="mr-1 type-eyebrow text-muted">{t(locale, "Test korisnik", "Test user")}</span>
          {IGRA_FIXTURE_IDS.map((id) => (
            <Link
              key={id}
              href={`${withLocale(locale, "/igra-izlog")}?deo=ljuska&stanje=${id}`}
              aria-current={id === stanje ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                id === stanje ? "bg-ink text-paper-strong" : "bg-paper-strong hover:bg-paper",
              )}
            >
              {IGRA_FIXTURE_LABEL[id][locale]}
            </Link>
          ))}
          <Button size="sm" variant="secondary" aria-pressed={loading} onClick={() => setLoading((value) => !value)}>
            {loading ? t(locale, "Prikaži podatke", "Show data") : t(locale, "Prikaži učitavanje", "Show loading")}
          </Button>
        </nav>

        {/* Ista flex ljuska kao `AppShell`: sidebar levo (fioka na telefonu), strana desno.
            Na telefonu ide od ivice do ivice, da zaglavlje ima širinu kao u aplikaciji. */}
        <div data-izlog-ljuska="" className="-mx-4 flex min-h-screen min-w-0 flex-col border-t border-line sm:-mx-6 md:mx-0 md:flex-row">
          <Suspense fallback={null}>
            <AppSidebarContent
              key={stanje}
              locale={locale}
              navigation={NAVIGATION}
              initialPreferences={{ collapsed: false }}
              authState="authenticated"
              profileData={profile}
              creditsBalance={profile.credits}
            />
          </Suspense>

          <div className="min-w-0 flex-1 space-y-10 px-4 pb-24 pt-5 sm:px-6 md:px-8 md:pb-8">
            <IzlogSection
              title={t(locale, "Napredak u ljusci", "Progress in the shell")}
              note={t(
                locale,
                "Red u sidebaru, krug u rail-u i čip u mobilnom zaglavlju su jedno dugme koje otvara panel. Skelet je iste veličine, pa se ništa ne pomera kad podaci stignu.",
                "The sidebar row, the rail circle and the mobile header chip are one button that opens the panel. The skeleton has the same size, so nothing moves when data arrives.",
              )}
            >
              <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
                <IzlogDemo label={`ShellProgressRow · ${stanje}`}>
                  <ShellProgressRow progress={fixture} locale={locale} onOpen={open} />
                </IzlogDemo>
                <IzlogDemo label={`ShellProgressRow · ${loadingLabel}`}>
                  <ShellProgressRow loading locale={locale} onOpen={open} />
                </IzlogDemo>
                <IzlogDemo label={`ShellProgressRail · ${stanje} · ${loadingLabel}`}>
                  <div className="flex items-center gap-4">
                    <ShellProgressRail progress={fixture} locale={locale} onOpen={open} />
                    <ShellProgressRail loading locale={locale} onOpen={open} />
                  </div>
                </IzlogDemo>
                <IzlogDemo label={`ShellProgressChip · ${stanje} · ${t(locale, "tinja", "smouldering")} · ${loadingLabel}`}>
                  <div className="flex items-center gap-6 px-2">
                    <ShellProgressChip progress={fixture} locale={locale} onOpen={open} />
                    <ShellProgressChip progress={{ xp: fixture.xp, streak: { current: fixture.streak.current, todayDone: false } }} locale={locale} onOpen={open} />
                    <ShellProgressChip loading locale={locale} onOpen={open} />
                  </div>
                </IzlogDemo>
                <IzlogDemo label={`ShellProgressChip · ${t(locale, "kad nema mesta: bez broja, pa bez plamena", "when short on room: no number, then no flame")}`}>
                  <div className="flex items-center gap-6 px-2">
                    {["w-11", "w-7"].map((width) => (
                      <span key={width} className={cn("flex justify-end", width)}>
                        <ShellProgressChip progress={fixture} locale={locale} onOpen={open} />
                      </span>
                    ))}
                  </div>
                </IzlogDemo>
              </div>
            </IzlogSection>

            <IzlogSection
              title={t(locale, "Prsten nivoa", "Level ring")}
              note={t(locale, "SVG u kodu, bez slike: oreol oko avatara pokazuje koliko je do sledećeg nivoa.", "SVG in code, no image: the halo around the avatar shows how far the next level is.")}
            >
              <ul className="flex flex-wrap items-center gap-8 p-2">
                {RING_SAMPLES.map((progress) => (
                  <li key={progress} className="flex flex-col items-center gap-3">
                    <span className="relative">
                      <LevelRing progress={progress} size={58} />
                      <span className="flex size-12 items-center justify-center rounded-full border-2 border-ink bg-yellow text-xs font-black text-ink">{initials}</span>
                    </span>
                    <span className="font-mono type-caption text-muted">{Math.round(progress * 100)}%</span>
                  </li>
                ))}
              </ul>
            </IzlogSection>

            <IzlogSection
              title={t(locale, "Panel „Moj napredak\"", "“My progress” panel")}
              note={t(
                locale,
                "List uz donju ivicu na telefonu, dijalog na računaru. Ispod je isti sadržaj bez dijaloga, da se vidi u obe teme.",
                "A bottom sheet on the phone, a dialog on desktop. Below is the same content without the dialog, to see it in both themes.",
              )}
            >
              <Button onClick={open}>{t(locale, "Otvori panel", "Open the panel")}</Button>
              <div className="mt-5 max-w-lg surface-card border-2 border-ink bg-paper-strong p-5 shadow-[6px_6px_0_0_var(--shadow-hard-13)]">
                <ProgressPanelBody progress={fixture} locale={locale} profileHref={profileHref} />
              </div>
            </IzlogSection>

            <IzlogSection
              title={t(locale, "Slavlje u ljusci", "Celebration in the shell")}
              note={t(
                locale,
                "Novi nivo ili bedž se slavi jednom, jedno po jedno, i odmah upisuje kao viđen. Esc ili klik pored zatvara, samo se gasi posle 2,5 s; dok je panel otvoren slavlje čeka.",
                "A new level or badge is celebrated once, one at a time, and marked as seen right away. Esc or a click outside closes it, it dismisses itself after 2.5 s; while the panel is open the celebration waits.",
              )}
            >
              <SlavljeULjusci key={stanje} locale={locale} fresh={{ ...fixture.fresh, level: fixture.level.level >= 2 ? fixture.level.level : null, ledgerEmpty: false }} />
            </IzlogSection>
          </div>
        </div>
      </div>
      <ProgressPanel open={panelOpen} onClose={() => setPanelOpen(false)} progress={fixture} locale={locale} profileHref={profileHref} leaderboardHref={leaderboardHref} />
    </IgraProgressContext.Provider>
  );
}
