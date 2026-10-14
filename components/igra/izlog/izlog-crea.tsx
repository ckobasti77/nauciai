"use client";

import { SlidersHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";

import { StudioMediaTile } from "@/components/app/studio-media-tile";
import { ChallengeView } from "@/components/crea/community/crea-challenge";
import { CommunityHeader, WorkCard } from "@/components/crea/community/crea-community-ui";
import { GalleryEmpty } from "@/components/crea/community/crea-gallery";
import { LeagueView } from "@/components/crea/community/crea-league-panel";
import { PairView } from "@/components/crea/community/crea-pair-panel";
import { PublicWorkView } from "@/components/crea/community/crea-public-work";
import { CreaHistoryEmpty } from "@/components/crea/crea-history";
import { CreaStage } from "@/components/crea/crea-stage";
import { CreaStartScreen } from "@/components/crea/crea-start-screen";
import { CreaWorkshop } from "@/components/crea/crea-workshop";
import { CreaGameProvider } from "@/components/crea/game/crea-game-context";
import { CreaGameStrip } from "@/components/crea/game/crea-game-strip";
import { CreaReportCardView } from "@/components/crea/game/crea-report-card";
import { CreaStreakPanel } from "@/components/crea/game/crea-streak-panel";
import { CreaStampToast, type CreaStampMoment } from "@/components/crea/game/crea-stamp-host";
import { StageCompanion } from "@/components/crea/wait/stage-companion";
import { CreaWaitScreen } from "@/components/crea/wait/wait-screen";
import { CelebrationHost } from "@/components/igra/celebration-host";
import { CreaAreaHeader } from "@/components/igra/crea/crea-area-header";
import { CreaCover } from "@/components/igra/crea/crea-cover";
import { IgraArt } from "@/components/igra/igra-art";
import { IgraProgressContext } from "@/components/igra/igra-progress-context";
import { IzlogDemo, IzlogSection } from "@/components/igra/izlog/izlog-kit";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/primitives";
import type { CreaMoment } from "@/convex/creaMomentsCore";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_CHALLENGE_COPY, CREA_GALLERY_COPY } from "@/lib/crea-community-copy";
import { CREA_NOTEBOOK_COPY, CREA_STAMP_COPY } from "@/lib/crea-game-copy";
import { momentMessage } from "@/lib/crea-reveal";
import { CREA_AREAS, creaModeDef, parseCreaShellState, type CreaArea, type CreaKind, type CreaModeId } from "@/lib/crea-shell";
import { CREA_TYPICAL_WAIT_MS } from "@/lib/crea-wait";
import { createCelebrationQueue, type IgraProgressFresh } from "@/lib/igra-celebrations";
import { IGRA_CREA_COPY } from "@/lib/igra-copy";
import { creaMomentLik } from "@/lib/igra-crea";
import {
  CREA_GAME_FIXTURES,
  CREA_LEAGUE_FIXTURE,
  CREA_PAIR_EMPTY_FIXTURE,
  creaChallengeBoardFixture,
  creaJobFixture,
  creaPublicWorkFixture,
  creaReportCardFixture,
  IGRA_FIXTURE_IDS,
  IGRA_FIXTURE_LABEL,
  IGRA_FIXTURE_TODAY,
  IGRA_FIXTURES,
  type IgraFixtureId,
} from "@/lib/igra-fixtures";
import { t, withLocale, type Locale } from "@/lib/i18n";
import { creaMotionFor } from "@/lib/motion-contract";
import { jobPrompt, jobStatusText } from "@/lib/studio-form";
import { GALLERY_NO_MATCHES, STUDIO_NO_GENERATIONS } from "@/lib/studio-messages";

/**
 * Izlog, deo „crea" (K15): PRAVA radionica Cree nad test podacima, bez prijave i bez
 * upita - ulaz „Šta praviš danas?" sa likovima, zaglavlja radionica, prazne pozornice i
 * traka napretka. Radionica je uživo: pilule oblasti, pločice likova i kartice ciljeva
 * menjaju oblast ovde umesto da odu u aplikaciju (koja traži prijavu). Composer,
 * istorija radova i alati nisu deo izloga (čitaju bazu; alati vuku WASM koji `next dev
 * --webpack` ne ume da učita), pa i režim sa alatima ovde crta praznu pozornicu.
 *
 * K16: čekanje (lik „radi"), rezultat (lik slavi prvi rad vrste, „+N XP"), neuspeh (tužan
 * lik) i uživo tok prvog rada: otkrivanje → oblačić → pečat albuma → slavlje bedža.
 *
 * K17: biblioteka (nalepnice „novo" i „omiljeno", prazna stanja), galerija, izazov (kruna
 * pobednika), sveska i knjižica - prave komponente bez upita, nad test podacima.
 */

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const HELP = { slika: IGRA_CREA_COPY.helpSlika, video: IGRA_CREA_COPY.helpVideo, zvuk: IGRA_CREA_COPY.helpZvuk } as const;
const APP_PATH = "/app/studio";
const noop = () => {};

function LiveWorkshop({ locale }: { locale: Locale }) {
  const [shell, setShell] = useState<{ area: CreaArea | null; mode: CreaModeId | null }>({ area: null, mode: null });
  const modeDef = shell.area ? creaModeDef(shell.area, shell.mode) : null;

  // Pločica lika i kartica cilja su pravi linkovi ka radionici; ovde samo menjaju oblast.
  function stayInIzlog(event: MouseEvent) {
    const anchor = (event.target as Element).closest("a");
    if (!anchor) return;
    const url = new URL(anchor.href);
    if (!url.pathname.endsWith(APP_PATH)) return;
    const next = parseCreaShellState(url.searchParams);
    if (!next.area) return;
    event.preventDefault();
    setShell({ area: next.area, mode: next.mode });
  }

  const stage =
    shell.area === null || modeDef === null ? (
      <CreaStartScreen locale={locale} pathname={withLocale(locale, APP_PATH)} searchParams={new URLSearchParams()} />
    ) : (
      <CreaStage
        locale={locale}
        area={shell.area}
        mode={modeDef}
        job={null}
        isLoading={false}
        composerDocked
        onOpenDetail={noop}
        onReuse={noop}
        onExtend={noop}
      />
    );

  return (
    <div onClickCapture={stayInIzlog} className="surface-card bg-studio-canvas p-3 sm:p-5">
      <CreaWorkshop
        locale={locale}
        area={shell.area}
        mode={modeDef?.id ?? null}
        onNavigate={(next) =>
          setShell((current) => ({
            area: next.area !== undefined ? next.area : current.area,
            mode: next.area !== undefined && next.area !== current.area ? null : next.mode !== undefined ? next.mode : current.mode,
          }))
        }
        panel={null}
        stage={stage}
        history={shell.area ? <CreaHistoryEmpty locale={locale} area={shell.area} /> : null}
      />
    </div>
  );
}

const KINDS = ["image", "video", "audio"] as const satisfies readonly CreaKind[];
/** Bez 3D maskote u izlogu: desetak primera bi otvorilo desetak WebGL platna. */
const MOTION_2D = { ...creaMotionFor(false), mascot3d: false };

/** Tamni bunar pločice rada (isti kao u `StudioMediaTile`), bez okvira. */
function Well({ children }: { children: ReactNode }) {
  return <div className="surface-card grid min-h-[220px] place-items-center bg-studio-well shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">{children}</div>;
}

function WaitDemos({ locale }: { locale: Locale }) {
  // Sat čekanja kreće od trenutka otvaranja izloga (rad je počeo pre 12 s).
  const [now] = useState(() => Date.now());
  const screen = (kind: CreaKind, size: "stage" | "tile", options: { night?: boolean; animated?: boolean } = {}) => {
    const job = creaJobFixture(kind, options.night ? "queued" : "running", now);
    return (
      <CreaWaitScreen
        job={job}
        locale={locale}
        estimate={{ ms: CREA_TYPICAL_WAIT_MS[kind], basis: "typical" }}
        place={null}
        prompt={jobPrompt(job.params)}
        size={size}
        animated={options.animated ?? true}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-3">
        {KINDS.map((kind) => (
          <IzlogDemo key={kind} label={`size="stage" · ${kind}`}>
            <Well>{screen(kind, "stage")}</Well>
          </IzlogDemo>
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <IzlogDemo label={t(locale, "noćni posao (lik miruje)", "night job (character rests)")}>
          <Well>{screen("image", "stage", { night: true })}</Well>
        </IzlogDemo>
        <IzlogDemo label={t(locale, "smanjen pokret (animated=false)", "reduced motion (animated=false)")}>
          <Well>{screen("video", "stage", { animated: false })}</Well>
        </IzlogDemo>
        {(["image", "audio"] as const).map((kind) => (
          <IzlogDemo key={kind} label={`size="tile" · ${kind} (${t(locale, "bez lika", "no character")})`}>
            <Well>{screen(kind, "tile")}</Well>
          </IzlogDemo>
        ))}
      </div>
    </div>
  );
}

const RESULT_DEMOS: ReadonlyArray<{ label: string; kind: CreaKind; moment: CreaMoment | null; xp: number | null; failed?: true }> = [
  { label: "prvi-rad · +40 XP", kind: "image", moment: { id: "prvi-rad" }, xp: 40 },
  { label: "prvi-od-vrste · video", kind: "video", moment: { id: "prvi-od-vrste", kind: "video" }, xp: null },
  { label: "prvi-od-vrste · audio · +15 XP", kind: "audio", moment: { id: "prvi-od-vrste", kind: "audio" }, xp: 15 },
  { label: "prvi-od-vrste · image", kind: "image", moment: { id: "prvi-od-vrste", kind: "image" }, xp: null },
  { label: "jubilej (10) · +10 XP", kind: "image", moment: { id: "jubilej", count: 10 }, xp: 10 },
  { label: "moment=null · +10 XP", kind: "video", moment: null, xp: 10 },
  { label: "failed", kind: "image", moment: null, xp: null, failed: true },
];

function ResultDemos({ locale }: { locale: Locale }) {
  const [now] = useState(() => Date.now());
  return (
    <div className="grid gap-x-5 gap-y-8 lg:grid-cols-2">
      {RESULT_DEMOS.map((demo) => (
        <IzlogDemo key={demo.label} label={demo.label}>
          <StageCompanion
            locale={locale}
            mood={demo.failed ? "tuzna" : "slavi"}
            kind={demo.kind}
            seed={demo.label}
            message={
              demo.failed
                ? jobStatusText(creaJobFixture(demo.kind, "failed", now), locale)
                : (momentMessage(demo.moment, locale) ?? t(locale, "Gotovo!", "Done!"))
            }
            celebrate={demo.failed ? null : creaMomentLik(demo.moment, demo.kind)}
            xpGain={demo.xp}
            motion={MOTION_2D}
          />
        </IzlogDemo>
      ))}
    </div>
  );
}

function FailDemos({ locale }: { locale: Locale }) {
  const [now] = useState(() => Date.now());
  const demos = [
    { label: 'failed · size="stage"', job: creaJobFixture("image", "failed", now), size: "stage" as const },
    { label: 'refunded · size="stage"', job: creaJobFixture("video", "refunded", now), size: "stage" as const },
    {
      label: t(locale, "otkazano (nije greška, bez lika)", "cancelled (not an error, no character)"),
      job: creaJobFixture("audio", "refunded", now, { error: "OTKAZAO_KORISNIK" }),
      size: "stage" as const,
    },
    {
      label: t(locale, 'failed · size="tile" (istorija, bez lika)', 'failed · size="tile" (history, no character)'),
      job: creaJobFixture("image", "failed", now),
      size: "tile" as const,
    },
  ];
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {demos.map((demo) => (
        <IzlogDemo key={demo.label} label={demo.label}>
          <StudioMediaTile job={demo.job} locale={locale} waitSize={demo.size} animateEntrance={false} />
        </IzlogDemo>
      ))}
    </div>
  );
}

const NO_FRESH: IgraProgressFresh = { level: null, badges: [], courses: [], ledgerEmpty: false };
/** „Server" izloga (u aplikaciji se XP meri, ne upisuje; pečat albuma tempira `CreaStampHost`). */
const DEMO_WORK_MS = 3500;
const DEMO_XP = 40;
const DEMO_SERVER_MS = 300;
const DEMO_STAMP_DELAY_MS = 1400;
const DEMO_STAMP_VISIBLE_MS = 6500;
const firstWorkMoment = async (): Promise<CreaMoment | null> => ({ id: "prvi-rad" });

/** Tok prvog rada uživo: prava pozornica, napredak iz test podataka, pečat albuma i domaćin slavlja. */
function FirstWorkDemo({ locale, stanje, onStart }: { locale: Locale; stanje: IgraFixtureId; onStart: () => void }) {
  const fixture = IGRA_FIXTURES[stanje];
  const [run, setRun] = useState<{ id: number; startedAt: number; status: "running" | "done" } | null>(null);
  const [xp, setXp] = useState(fixture.xp);
  const [fresh, setFresh] = useState<IgraProgressFresh>(NO_FRESH);
  const [stamp, setStamp] = useState<CreaStampMoment | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [queue, setQueue] = useState(() => createCelebrationQueue());
  const context = useMemo(() => ({ progress: { ...fixture, xp }, openPanel: () => undefined }), [fixture, xp]);

  const status = run?.status ?? null;
  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setTimeout(() => setRun((current) => (current ? { ...current, status: "done" } : current)), DEMO_WORK_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (status !== "done") return;
    const server = window.setTimeout(() => {
      setXp((value) => value + DEMO_XP);
      setFresh({ ...NO_FRESH, badges: ["prvi-rad"] });
    }, DEMO_SERVER_MS);
    const album = window.setTimeout(() => {
      setStamp({
        title: fillCopy(CREA_STAMP_COPY.firstTime[locale], { what: t(locale, "prvi rad", "first work") }),
        body: CREA_STAMP_COPY.newSticker[locale],
        href: `${withLocale(locale, "/igra-izlog")}?deo=crea`,
      });
    }, DEMO_STAMP_DELAY_MS);
    return () => {
      window.clearTimeout(server);
      window.clearTimeout(album);
    };
  }, [status, locale]);

  useEffect(() => {
    if (!stamp) return;
    const timer = window.setTimeout(() => setStamp(null), DEMO_STAMP_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [stamp]);

  function start() {
    onStart();
    setXp(fixture.xp);
    setFresh(NO_FRESH);
    setStamp(null);
    setSeen([]);
    setQueue(createCelebrationQueue());
    setRun((current) => ({ id: (current?.id ?? 0) + 1, startedAt: Date.now(), status: "running" }));
  }

  const job = run ? creaJobFixture("image", run.status, run.startedAt, { _id: `izlog-prvi-rad-${run.id}`, createdAt: run.startedAt }) : null;

  return (
    <IgraProgressContext.Provider value={context}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={start}>
          {t(locale, "Napravi prvi rad", "Make the first work")}
        </Button>
      </div>
      <p role="status" className="mb-5 break-all font-mono type-caption text-muted">
        XP: {xp} · {t(locale, "stanje", "status")}: {status ?? "-"} · markSeen: {seen.length > 0 ? seen.join(", ") : "-"}
      </p>
      <div className="surface-card bg-studio-canvas p-3 sm:p-5">
        <CreaStage
          locale={locale}
          area="slika"
          mode={creaModeDef("slika", null)}
          job={job}
          isLoading={false}
          composerDocked
          onOpenDetail={noop}
          onReuse={noop}
          onExtend={noop}
          loadMoment={firstWorkMoment}
        />
      </div>
      <CreaStampToast locale={locale} moment={stamp} onClose={() => setStamp(null)} />
      <CelebrationHost
        key={run?.id ?? 0}
        locale={locale}
        fresh={fresh}
        queue={queue}
        onSeen={(keys) => {
          setSeen((all) => [...all, ...keys]);
          setFresh((current) => ({ ...current, badges: current.badges.filter((badge) => !keys.includes(`badge:${badge}`)) }));
        }}
      />
    </IgraProgressContext.Provider>
  );
}

// ── K17: biblioteka, galerija, izazov, sveska ─────────────────────────────────

const LIBRARY_NOW = Date.parse(`${IGRA_FIXTURE_TODAY}T10:00:00Z`);
const HOUR = 3_600_000;
const FIXTURE_NAME: Record<IgraFixtureId, string> = { novi: "Tamara Ilić", aktivan: "Nikola Stanić", legenda: "Vesna Radović" };

/** Kartice biblioteke: nalepnice „novo" (stiglo u poslednja 24 h) i „omiljeno"; hover je postojeći. */
function LibraryDemos({ locale }: { locale: Locale }) {
  const tiles = [
    { label: "fresh", job: creaJobFixture("image", "done", LIBRARY_NOW, { _id: "izlog-bib-novo", isMock: false }), fresh: true },
    { label: "favoriteAt", job: creaJobFixture("image", "done", LIBRARY_NOW - 30 * HOUR, { _id: "izlog-bib-omiljeno", isMock: false, favoriteAt: LIBRARY_NOW }), fresh: false },
    { label: "fresh · favoriteAt", job: creaJobFixture("image", "done", LIBRARY_NOW, { _id: "izlog-bib-oba", isMock: false, favoriteAt: LIBRARY_NOW }), fresh: true },
    { label: t(locale, "bez nalepnice", "no sticker"), job: creaJobFixture("image", "done", LIBRARY_NOW - 72 * HOUR, { _id: "izlog-bib-staro", isMock: false }), fresh: false },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <IzlogDemo key={tile.job._id} label={tile.label}>
            <StudioMediaTile job={tile.job} locale={locale} animateEntrance={false} fresh={tile.fresh} onToggleFavorite={noop} onReuse={noop} onOpenDetail={noop} />
          </IzlogDemo>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <IzlogDemo label={t(locale, "prazna biblioteka", "empty library")}>
          <EmptyState
            icon={Sparkles}
            art={<IgraArt id="prazno.radovi" size={120} decorative />}
            title={STUDIO_NO_GENERATIONS.title[locale]}
            body={STUDIO_NO_GENERATIONS.body[locale]}
            action={<Button>{STUDIO_NO_GENERATIONS.cta[locale]}</Button>}
          />
        </IzlogDemo>
        <IzlogDemo label={t(locale, "filter bez rezultata", "filter with no results")}>
          <EmptyState
            icon={SlidersHorizontal}
            art={<IgraArt id="prazno.pretraga" size={120} decorative />}
            title={GALLERY_NO_MATCHES.title[locale]}
            body={GALLERY_NO_MATCHES.body[locale]}
            action={<Button variant="secondary">{GALLERY_NO_MATCHES.cta[locale]}</Button>}
          />
        </IzlogDemo>
      </div>
    </div>
  );
}

function GalleryDemos({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-8">
      <IzlogDemo label='current="galerija"'>
        <div className="space-y-5">
          <CommunityHeader locale={locale} title={CREA_GALLERY_COPY.title[locale]} subtitle={CREA_GALLERY_COPY.subtitle[locale]} current="galerija" />
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((n) => (
              <li key={n}>
                <WorkCard locale={locale} work={creaPublicWorkFixture(n)} />
              </li>
            ))}
          </ul>
        </div>
      </IzlogDemo>
      <IzlogDemo label={t(locale, "galerija bez radova", "gallery without works")}>
        <GalleryEmpty locale={locale} />
      </IzlogDemo>
      <IzlogDemo label={t(locale, "rad ne postoji", "work not found")}>
        <PublicWorkView locale={locale} work={null} />
      </IzlogDemo>
    </div>
  );
}

function ChallengeDemos({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-10">
      <IzlogDemo label={t(locale, "glasanje + pobednik", "voting + winner")}>
        <ChallengeView locale={locale} board={creaChallengeBoardFixture(false)} todayKey={IGRA_FIXTURE_TODAY} isAuthenticated={false} seasonPreview={null} />
      </IzlogDemo>
      <IzlogDemo label={t(locale, "prazno glasanje", "empty voting")}>
        <ChallengeView locale={locale} board={creaChallengeBoardFixture(true)} todayKey={IGRA_FIXTURE_TODAY} isAuthenticated={false} seasonPreview={null} />
      </IzlogDemo>
    </div>
  );
}

function NotebookDemos({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const game = CREA_GAME_FIXTURES[stanje];
  return (
    <div className="space-y-8">
      <IzlogDemo label={t(locale, "naslovnica sveske", "notebook cover")}>
        <div className="space-y-5">
          <CreaCover art="lik.robi.mase" title={CREA_NOTEBOOK_COPY.title[locale]} subtitle={CREA_NOTEBOOK_COPY.subtitle[locale]} />
          <CreaStreakPanel locale={locale} streak={game.streak} />
        </div>
      </IzlogDemo>
      <div className="grid gap-6 lg:grid-cols-2">
        <IzlogDemo label={t(locale, "knjižica", "report card")}>
          <CreaReportCardView locale={locale} name={FIXTURE_NAME[stanje]} username={game.username ?? stanje} card={creaReportCardFixture(stanje)} />
        </IzlogDemo>
        <div className="space-y-6">
          <IzlogDemo label={t(locale, "liga: rang čipovi", "league: rank chips")}>
            <LeagueView locale={locale} league={CREA_LEAGUE_FIXTURE} />
          </IzlogDemo>
          <IzlogDemo label={t(locale, "par: još nema para", "pair: no pair yet")}>
            <PairView locale={locale} data={CREA_PAIR_EMPTY_FIXTURE} />
          </IzlogDemo>
        </div>
      </div>
    </div>
  );
}

export function IzlogCrea({ locale, stanje }: { locale: Locale; stanje: IgraFixtureId }) {
  const base = withLocale(locale, "/igra-izlog");
  const game = CREA_GAME_FIXTURES[stanje];
  // Primeri oblačića nose `data-igra-busy` i zadržali bi slavlje bedža u toku uživo.
  const [live, setLive] = useState(false);

  return (
    <div className="space-y-10">
      <nav aria-label={t(locale, "Test korisnik", "Test user")} className="flex flex-wrap gap-2">
        {IGRA_FIXTURE_IDS.map((id) => (
          <Link
            key={id}
            href={`${base}?deo=crea&stanje=${id}`}
            aria-current={id === stanje ? "true" : undefined}
            className={cn(CHIP, id === stanje ? "bg-ink text-paper-strong" : "bg-paper")}
          >
            {IGRA_FIXTURE_LABEL[id][locale]}
          </Link>
        ))}
      </nav>

      <IzlogSection
        id="radionica"
        title={t(locale, "Radionica (uživo)", "Workshop (live)")}
        note={t(
          locale,
          "Prava radionica: ulaz sa scenom i tri lika, pa zaglavlje radionice i prazna pozornica. Pilule oblasti, pločice likova i kartice ciljeva rade.",
          "The real workshop: the entry with the scene and three characters, then the workshop header and the empty stage. Area pills, character tiles and goal cards work.",
        )}
      >
        <LiveWorkshop key={locale} locale={locale} />
      </IzlogSection>

      <IzlogSection
        id="zaglavlja"
        title={t(locale, "Zaglavlja radionica", "Workshop headers")}
        note={t(locale, "Lik oblasti sa kratkim savetom; na telefonu manji lik.", "The area character with a short tip; a smaller character on phones.")}
      >
        <div className="space-y-5">
          {CREA_AREAS.map((area) => (
            <IzlogDemo key={area} label={`area="${area}"`}>
              <CreaAreaHeader area={area} help={HELP[area][locale]} />
            </IzlogDemo>
          ))}
        </div>
      </IzlogSection>

      <IzlogSection
        id="cekanje"
        title={t(locale, "Čekanje", "Waiting")}
        note={t(
          locale,
          "Lik radionice „radi” preko ugla lista dok olovka crta. Bez procenta: koraci, procena i protekli sat su postojeći. Noćni posao i smanjen pokret: lik miruje.",
          "The workshop character “works” over the corner of the sheet while the pencil draws. No percentage: steps, estimate and elapsed time are as before. Night job and reduced motion: the character rests.",
        )}
      >
        <WaitDemos locale={locale} />
      </IzlogSection>

      <IzlogSection
        id="rezultat"
        title={t(locale, "Rezultat", "Result")}
        note={t(
          locale,
          "Oblačić posle otkrivanja: prvi rad i prvi rad svake vrste dobijaju lika koji slavi i žuti marker; „+N XP” samo kad je XP porastao. Jubilej i običan rad ostaju tekst.",
          "The bubble after the reveal: the first work and the first work of each kind get a celebrating character and the yellow marker; “+N XP” only when XP went up. Milestones and ordinary works stay text.",
        )}
      >
        {live ? (
          <p className="type-body-sm font-semibold text-muted">
            {t(locale, "Primeri su skriveni dok traje „Prvi rad (uživo)”: oblačić drži slavlje bedža.", "Examples are hidden during “First work (live)”: a bubble holds back the badge celebration.")}
          </p>
        ) : (
          <ResultDemos locale={locale} />
        )}
      </IzlogSection>

      <IzlogSection
        id="neuspeh"
        title={t(locale, "Neuspeh", "Failure")}
        note={t(
          locale,
          "Na pozornici tužan lik vrste rada, postojeća poruka o povraćaju i blag poziv da se proba ponovo. Otkazan posao i pločice u istoriji ostaju bez lika.",
          "On the stage the work kind's sad character, the existing refund message and a gentle nudge to try again. Cancelled jobs and history tiles stay without a character.",
        )}
      >
        <FailDemos locale={locale} />
      </IzlogSection>

      <IzlogSection
        id="prvi-rad"
        title={t(locale, "Prvi rad (uživo)", "First work (live)")}
        note={t(
          locale,
          "Prava pozornica: čekanje → otkrivanje → oblačić sa Piksijem i „+40 XP” → pečat albuma → slavlje bedža „Prvi rad” tek kad se oblačić i pečat sklone. Nikad dva slavlja odjednom.",
          "The real stage: waiting → reveal → bubble with Piksi and “+40 XP” → album stamp → the “First work” badge celebration only once the bubble and the stamp are gone. Never two celebrations at once.",
        )}
      >
        <FirstWorkDemo key={`${locale}:${stanje}`} locale={locale} stanje={stanje} onStart={() => setLive(true)} />
      </IzlogSection>

      <IzlogSection
        id="traka"
        title={t(locale, "Traka napretka", "Progress strip")}
        note={t(
          locale,
          "Pečat nivoa iz ljuske (iz XP-a, ne iz starog serverskog nivoa), niz dana, XP i album. Na telefonu samo pečat, niz i sveska.",
          "The level seal from the shell (from XP, not the old server level), the streak, XP and the album. On phones only the seal, streak and notebook.",
        )}
      >
        <CreaGameProvider value={{ game, unlock: { all: true }, freeTries: [], notebookPath: "/app/studio/sveska", todayKey: IGRA_FIXTURE_TODAY }}>
          <IzlogDemo label={`xp=${game.xp} · streak=${game.streak.current}`}>
            <CreaGameStrip locale={locale} />
          </IzlogDemo>
        </CreaGameProvider>
      </IzlogSection>

      <IzlogSection
        id="biblioteka"
        title={t(locale, "Biblioteka", "Library")}
        note={t(
          locale,
          "Kartice radova sa suptilnim nalepnicama: „Novo” za rad koji je stigao u poslednja 24 h (samo u biblioteci) i srce za omiljeno. Prazna biblioteka i filter bez rezultata imaju ilustraciju.",
          "Work cards with subtle stickers: “New” for a work that arrived in the last 24 h (library only) and a heart for favourites. The empty library and a filter with no results get an illustration.",
        )}
      >
        <LibraryDemos locale={locale} />
      </IzlogSection>

      <IzlogSection
        id="galerija"
        title={t(locale, "Galerija", "Gallery")}
        note={t(
          locale,
          "Naslovnica sa Piksijem umesto znaka Cree; kartice radova su iste. Prazna galerija i rad koji ne postoji imaju ilustraciju.",
          "A cover with Piksi instead of the Crea mark; work cards are unchanged. The empty gallery and a missing work get an illustration.",
        )}
      >
        <GalleryDemos locale={locale} />
      </IzlogSection>

      <IzlogSection
        id="izazov"
        title={t(locale, "Izazov", "Challenge")}
        note={fillCopy(
          t(
            locale,
            "Naslovnica sa peharom, kruna koja jednom „udari” na kartici pobednika i marker na „{winner}”. Glasanje i rezultati su postojeći; prazno glasanje ima jednu ilustraciju.",
            "A cover with the trophy, a crown that stamps in once on the winner's card and the marker on “{winner}”. Voting and results are as before; empty voting gets one illustration.",
          ),
          { winner: CREA_CHALLENGE_COPY.winner[locale] },
        )}
      >
        <ChallengeDemos locale={locale} />
      </IzlogSection>

      <IzlogSection
        id="sveska"
        title={t(locale, "Sveska i knjižica", "Notebook and report card")}
        note={t(
          locale,
          "Naslovnica sveske sa Robijem, plamen niza kao nalepnica (tinja dok danas nije upisano), korica knjižice, rang čipovi u ligi i ilustracija kad još nema para.",
          "The notebook cover with Robi, the streak flame as a sticker (smoulders until today is logged), the report card cover, rank chips in the league and an illustration while there's no pair yet.",
        )}
      >
        <NotebookDemos locale={locale} stanje={stanje} />
      </IzlogSection>
    </div>
  );
}
