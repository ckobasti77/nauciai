"use client";

import { useReducedMotion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";

import { CelebrationHost } from "@/components/igra/celebration-host";
import { IgraArt } from "@/components/igra/igra-art";
import { gsap } from "@/components/igra/motion/gsap";
import { useCountUp } from "@/components/igra/motion/use-count-up";
import { useEnterStagger } from "@/components/igra/motion/use-enter-stagger";
import { useMarkerFill } from "@/components/igra/motion/use-marker-fill";
import { useStampIn } from "@/components/igra/motion/use-stamp-in";
import { useStickerPeel } from "@/components/igra/motion/use-sticker-peel";
import { IgraThreeStage } from "@/components/igra/three/igra-three-stage";
import { Button } from "@/components/ui/button";
import { igraArt } from "@/lib/igra-art";
import { createCelebrationQueue, type IgraCelebrationQueue, type IgraProgressFresh } from "@/lib/igra-celebrations";
import { formatOdometer, IGRA_MOTION, loadIgraPlugin, shouldAnimate } from "@/lib/igra-motion";
import { t, type Locale } from "@/lib/i18n";

/**
 * Izlog, deo „pokret i 3D" (K03): svaki hook iz `components/igra/motion`, lenji GSAP
 * plugin, domaćin slavlja sa test podacima i 3D pehar/medalje sa fallback nalepnicom.
 * Bez podataka i bez prijave. Ljusku izloga i ostale delove dodaje K05.
 */

const XP_PER_BAR = 1000;
const STICKER = "bedz.prva-lekcija";

const FRESH = {
  nivo: { level: 3, badges: [], courses: [], ledgerEmpty: false },
  bedz: { level: null, badges: ["prva-lekcija"], courses: [], ledgerEmpty: false },
  bedzevi: { level: null, badges: ["prva-lekcija", "niz-3", "prvi-rad"], courses: [], ledgerEmpty: false },
  kurs: { level: null, badges: [], courses: [{ key: "course:izlog", title: { sr: "AI za početnike", en: "AI for beginners" } }], ledgerEmpty: false },
  zbir: { level: 4, badges: ["prva-lekcija", "pet-lekcija", "prvi-rad", "niz-3", "niz-7"], courses: [], ledgerEmpty: true },
  redom: { level: 5, badges: ["niz-7"], courses: [{ key: "course:izlog", title: { sr: "AI za početnike", en: "AI for beginners" } }], ledgerEmpty: false },
} satisfies Record<string, IgraProgressFresh>;

const CELEBRATIONS: ReadonlyArray<{ id: keyof typeof FRESH; sr: string; en: string }> = [
  { id: "nivo", sr: "Novi nivo", en: "New level" },
  { id: "bedz", sr: "Jedan bedž", en: "One badge" },
  { id: "bedzevi", sr: "Tri bedža", en: "Three badges" },
  { id: "kurs", sr: "Kraj kursa", en: "Course completed" },
  { id: "zbir", sr: "Zbir (prvi kontakt)", en: "Summary (first contact)" },
  { id: "redom", sr: "Tri zaredom", en: "Three in a row" },
];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-13)] sm:p-6">
      <h2 className="type-h3 text-ink">{title}</h2>
      {note ? <p className="mt-1 type-body-sm font-semibold text-muted">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="surface-inset bg-paper p-5">
      <p className="font-mono type-caption text-muted">{label}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function XpDemo({ locale }: { locale: Locale }) {
  const [xp, setXp] = useState(240);
  const numberRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  useCountUp(numberRef, xp, { locale });
  useMarkerFill(fillRef, (xp % XP_PER_BAR) / XP_PER_BAR);

  return (
    <Demo label="useCountUp · useMarkerFill">
      <p className="type-h1 text-ink">
        <span className="sr-only">{formatOdometer(xp, locale)} XP</span>
        <span aria-hidden="true">
          <span ref={numberRef} className="inline-block tabular-nums">
            {formatOdometer(xp, locale)}
          </span>{" "}
          XP
        </span>
      </p>
      <span className="mt-3 block h-3 overflow-hidden rounded-full bg-igra-track">
        <span ref={fillRef} className="block h-full bg-igra-marker" />
      </span>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setXp((value) => value + 100)}>
          +100 XP
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setXp((value) => value + 1250)}>
          +{formatOdometer(1250, locale)} XP
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setXp(0)}>
          {t(locale, "Na nulu", "Reset")}
        </Button>
      </div>
    </Demo>
  );
}

function StampDemo({ locale }: { locale: Locale }) {
  const [hits, setHits] = useState(0);
  const stampRef = useRef<HTMLSpanElement>(null);
  const stickerRef = useRef<HTMLSpanElement>(null);
  useStampIn(stampRef, { playKey: hits });
  useStampIn(stickerRef, { playKey: hits, delay: 0.12 });

  return (
    <Demo label="useStampIn">
      <div className="flex min-h-24 flex-wrap items-center gap-6">
        <span ref={stampRef} className="igra-stamp min-h-11 px-4 type-eyebrow">
          {t(locale, "Završeno", "Completed")}
        </span>
        <span ref={stickerRef} className="block">
          <IgraArt id="nivo.03" size="lg" locale={locale} />
        </span>
      </div>
      <Button className="mt-4" size="sm" variant="secondary" onClick={() => setHits((value) => value + 1)}>
        {t(locale, "Udari pečat", "Stamp it")}
      </Button>
    </Demo>
  );
}

function PeelDemo({ locale }: { locale: Locale }) {
  const ref = useRef<HTMLButtonElement>(null);
  useStickerPeel(ref);
  const mask = `url(${igraArt(STICKER).src})`;

  return (
    <Demo label="useStickerPeel">
      <button
        ref={ref}
        type="button"
        aria-label={igraArt(STICKER).alt[locale]}
        className="grid size-28 place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span data-igra-peel className="relative block">
          <IgraArt id={STICKER} size="lg" decorative />
          {/* Sjaj se vidi samo preko nalepnice: omotač je maskiran njenom slikom. */}
          <span aria-hidden="true" className="absolute inset-0 overflow-hidden" style={{ maskImage: mask, maskSize: "contain", WebkitMaskImage: mask, WebkitMaskSize: "contain" }}>
            <span
              data-igra-shine
              className="absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(105deg,transparent,var(--igra-sticker-edge),transparent)] opacity-0"
            />
          </span>
        </span>
      </button>
      <p className="mt-2 type-caption font-semibold text-muted">{t(locale, "Pređi mišem preko nalepnice.", "Hover the sticker.")}</p>
    </Demo>
  );
}

function StaggerDemo({ locale }: { locale: Locale }) {
  const [rows, setRows] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  useEnterStagger(listRef, { selector: "li", deps: [rows] });

  return (
    <Demo label="useEnterStagger">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setRows((value) => value + 4)}>
          {t(locale, "Stigla su 4 reda", "4 rows arrived")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRows(0)}>
          {t(locale, "Isprazni", "Clear")}
        </Button>
      </div>
      <ul ref={listRef} className="mt-3 divide-y divide-line">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="flex items-center justify-between py-2 type-body-sm font-bold text-ink">
            <span>
              {t(locale, "Red", "Row")} {index + 1}
            </span>
            <span className="tabular-nums text-muted">{formatOdometer((rows - index) * 120, locale)} XP</span>
          </li>
        ))}
      </ul>
    </Demo>
  );
}

function PluginDemo({ locale }: { locale: Locale }) {
  const reduced = useReducedMotion() ?? false;
  const pathRef = useRef<SVGPathElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  async function draw() {
    setStatus("loading");
    try {
      await loadIgraPlugin("DrawSVG");
      setStatus("ready");
      if (pathRef.current && shouldAnimate({ reduced, hidden: document.hidden })) {
        gsap.fromTo(pathRef.current, { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.2, ease: IGRA_MOTION.ease.fill });
      }
    } catch {
      setStatus("failed");
    }
  }

  const label = {
    idle: t(locale, "Plugin još nije učitan.", "Plugin not loaded yet."),
    loading: t(locale, "Učitavam…", "Loading…"),
    ready: t(locale, "DrawSVG je učitan i registrovan.", "DrawSVG is loaded and registered."),
    failed: t(locale, "Plugin nije stigao.", "The plugin did not load."),
  }[status];

  return (
    <Demo label={'loadIgraPlugin("DrawSVG")'}>
      <svg viewBox="0 0 320 80" className="h-20 w-full text-ink" aria-hidden="true">
        <path ref={pathRef} d="M8 60 C 60 8, 100 76, 160 40 S 260 8, 312 52" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={() => void draw()}>
          {t(locale, "Nacrtaj putanju", "Draw the path")}
        </Button>
        <p role="status" className="type-caption font-semibold text-muted">
          {label}
        </p>
      </div>
    </Demo>
  );
}

function CelebrationDemo({ locale }: { locale: Locale }) {
  const [run, setRun] = useState<{ id: number; fresh: IgraProgressFresh; queue: IgraCelebrationQueue } | null>(null);
  const [seen, setSeen] = useState<string[]>([]);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {CELEBRATIONS.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant="secondary"
            onClick={() => {
              setSeen([]);
              // Svaki klik je nova „sesija": svež red, pa se isto slavlje može ponoviti.
              setRun((previous) => ({ id: (previous?.id ?? 0) + 1, fresh: FRESH[item.id], queue: createCelebrationQueue() }));
            }}
          >
            {item[locale]}
          </Button>
        ))}
      </div>
      <p role="status" className="mt-3 break-all font-mono type-caption text-muted">
        markSeen: {seen.length > 0 ? seen.join(", ") : "-"}
      </p>
      {run ? <CelebrationHost key={run.id} locale={locale} fresh={run.fresh} queue={run.queue} onSeen={(keys) => setSeen((all) => [...all, ...keys])} /> : null}
    </>
  );
}

function ThreeDemo({ locale }: { locale: Locale }) {
  const [turn, setTurn] = useState(0);

  return (
    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
      <li>
        <IgraThreeStage key={turn} kind="pehar" spin="once" locale={locale} className="w-full max-w-40" />
        <Button className="mt-2" size="sm" variant="secondary" onClick={() => setTurn((value) => value + 1)}>
          {t(locale, "Ponovi okret", "Spin again")}
        </Button>
      </li>
      {(["zlato", "srebro", "bronza"] as const).map((tone) => (
        <li key={tone}>
          <IgraThreeStage kind="medalja" tone={tone} spin="idle" locale={locale} className="w-full max-w-40" />
          <p className="mt-2 font-mono type-caption text-muted">medalja · {tone}</p>
        </li>
      ))}
      <li>
        <IgraThreeStage kind="pehar" spin="once" allow3d={false} locale={locale} className="w-full max-w-40" />
        <p className="mt-2 font-mono type-caption text-muted">allow3d=false</p>
      </li>
    </ul>
  );
}

export function IzlogPokret({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-6">
      <Section
        title={t(locale, "Hookovi pokreta", "Motion hooks")}
        note={t(locale, "Uz „smanji pokrete\" svaki odmah pokaže krajnje stanje.", "With reduced motion each one shows its final state at once.")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <XpDemo locale={locale} />
          <StampDemo locale={locale} />
          <PeelDemo locale={locale} />
          <StaggerDemo locale={locale} />
          <PluginDemo locale={locale} />
        </div>
      </Section>

      <Section
        title={t(locale, "Slavlja", "Celebrations")}
        note={t(
          locale,
          "Jedno po jedno, najviše tri po sesiji. Esc ili klik pored kartice zatvara; samo se gasi posle 2,5 s.",
          "One at a time, at most three per session. Esc or a click outside closes it; it dismisses itself after 2.5 s.",
        )}
      >
        <CelebrationDemo locale={locale} />
      </Section>

      <Section
        title={t(locale, "3D pehar i medalje", "3D trophy and medals")}
        note={t(
          locale,
          "Platno samo na računaru i uz dozvoljen pokret; inače ostaje nalepnica.",
          "Canvas only on desktop with motion allowed; otherwise the sticker stays.",
        )}
      >
        <ThreeDemo locale={locale} />
      </Section>
    </div>
  );
}
