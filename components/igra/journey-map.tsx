"use client";

import { Check, Lock } from "lucide-react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRef, type CSSProperties, type ReactNode } from "react";

import { IgraArt } from "@/components/igra/igra-art";
import { IgraLik } from "@/components/igra/igra-lik";
import { gsap, useGSAP } from "@/components/igra/motion/gsap";
import { cn } from "@/components/ui/primitives";
import { IGRA_JOURNEY_COPY } from "@/lib/igra-copy";
import {
  journeyDrawSeconds,
  journeyLayout,
  journeyPaths,
  journeyTraveledTo,
  type JourneyLayout,
  type JourneyState,
  type JourneyStation,
} from "@/lib/igra-journey";
import { IGRA_MOTION, loadIgraPlugin, shouldAnimate } from "@/lib/igra-motion";
import type { Locale } from "@/lib/i18n";

const DOT: Record<JourneyState, string> = {
  done: "border-ink bg-ink text-paper-strong",
  next: "igra-journey-pulse border-ink bg-yellow text-ink",
  open: "border-ink bg-paper-strong text-ink",
  locked: "border-dashed border-muted bg-paper text-muted",
};

/** Putanja jednog rasporeda: tačkast ostatak ispod, pređeni deo mastilom preko njega. */
function JourneyPath({ layout, traveledTo, className, fixed = false }: { layout: JourneyLayout; traveledTo: number; className: string; fixed?: boolean }) {
  const { ink, rest } = journeyPaths(layout, traveledTo);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={fixed ? layout.width : undefined}
      height={fixed ? layout.height : undefined}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("pointer-events-none absolute left-0 top-0", className)}
    >
      {rest ? <path d={rest} className="stroke-ink/40" strokeWidth={3} strokeDasharray="1 10" vectorEffect="non-scaling-stroke" /> : null}
      {ink ? <path data-journey-ink="" d={ink} className="stroke-ink" strokeWidth={4} vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}

/**
 * Mapa puta (K10, plan K07 §3): ručno nacrtana putanja kroz stanice - lekcije kursa ili
 * kurseve smera. Prezentaciona: stanice daje pozivalac (`lessonStations` / `courseStations`).
 *
 * Oba rasporeda su u DOM-u i bira ih širina SAME mape (container query), bez JavaScript-a:
 * uspravna linija dok je mapa uža od 40rem, vijugava u redovima po pet kad je šira. Zato
 * nema skoka posle hidratacije ni vodoravnog skrola. Stanice su jedna `<ol>` redom kojim
 * ide put, pa fokus i čitač ekrana prate put u oba rasporeda.
 *
 * Mapa je svetao list i u tamnoj temi (`paper-island`), kao scena iza nje. Okvir i radijus
 * daje pozivalac kroz `className`, jer mapa nekad stoji u tuđem okviru.
 */
export function JourneyMap({ stations, locale, label, className }: { stations: readonly JourneyStation[]; locale: Locale; label: string; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const { wide, tall, columns } = journeyLayout(stations.length);
  const traveledTo = journeyTraveledTo(stations.map((station) => station.state));

  // Pređeni deo se iscrta kad mapa uđe u kadar; DrawSVG se tek tada i skida. Do tada je
  // pređeni deo sakriven samo ako će se crtati - bez pokreta mapa je odmah cela.
  useGSAP(
    (_context, contextSafe) => {
      const root = rootRef.current;
      if (!root || !contextSafe || traveledTo < 0 || !shouldAnimate({ reduced, hidden: document.hidden })) return;
      // Samo raspored koji se vidi: drugi je `display: none` i nema šta da se meri.
      const inks = Array.from(root.querySelectorAll<SVGPathElement>("[data-journey-ink]")).filter((path) => path.getBoundingClientRect().height > 0);
      const here = Array.from(root.querySelectorAll<HTMLElement>("[data-journey-here]"));
      if (inks.length === 0) return;

      gsap.set([...inks, ...here], { autoAlpha: 0 });
      const settle = () => root.setAttribute("data-journey-drawn", "");
      const play = contextSafe(() => {
        gsap.set(inks, { autoAlpha: 1 });
        gsap
          .timeline({ onComplete: settle })
          .fromTo(inks, { drawSVG: "0%" }, { drawSVG: "100%", duration: journeyDrawSeconds(traveledTo), ease: IGRA_MOTION.ease.fill })
          .fromTo(
            here,
            { autoAlpha: 0, y: 8, scale: 0.85 },
            { autoAlpha: 1, y: 0, scale: 1, duration: IGRA_MOTION.enter, ease: IGRA_MOTION.ease.stamp, clearProps: "transform,opacity,visibility" },
            "-=0.1",
          );
      });
      // Plugin nije stigao: mapa ostaje cela, bez crtanja.
      const show = contextSafe(() => {
        gsap.set([...inks, ...here], { clearProps: "opacity,visibility" });
        settle();
      });

      let cancelled = false;
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          loadIgraPlugin("DrawSVG").then(
            () => {
              if (!cancelled) play();
            },
            () => {
              if (!cancelled) show();
            },
          );
        },
        { rootMargin: "0px 0px -12% 0px" },
      );
      observer.observe(root);
      return () => {
        cancelled = true;
        observer.disconnect();
        root.removeAttribute("data-journey-drawn");
      };
    },
    { scope: rootRef, dependencies: [reduced, stations.length, traveledTo], revertOnUpdate: true },
  );

  if (stations.length === 0) return null;

  return (
    <div ref={rootRef} data-igra-journey="" className={cn("paper-island sketch-grid @container relative isolate overflow-hidden bg-igra-scene-paper", className)}>
      {/* Scena je tekstura u vrhu mape i nadole se pretapa u papir; bez slike ostaju papir i mreža. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full max-h-[28rem] opacity-20 [mask-image:linear-gradient(to_bottom,black_55%,transparent)] [&_img]:object-right @min-[40rem]:opacity-30 @min-[40rem]:[&_img]:object-center"
      >
        <IgraArt id="scena.mapa-puta" fit="cover" decorative className="h-full" />
      </div>

      <div className="p-4 @min-[40rem]:p-6">
        {/* Kutija mape: uspravno joj visinu daju redovi stanica, široko odnos strana putanje. */}
        <div
          className="relative mx-auto @min-[40rem]:aspect-[var(--journey-ratio)] @min-[40rem]:max-w-[65rem]"
          style={{ "--journey-ratio": `${wide.width} / ${wide.height}`, "--journey-column": `${100 / columns}%` } as CSSProperties}
        >
          <JourneyPath layout={tall} traveledTo={traveledTo} fixed className="@min-[40rem]:hidden" />
          <JourneyPath layout={wide} traveledTo={traveledTo} className="hidden size-full @min-[40rem]:block" />
          <ol aria-label={label} className="relative @min-[40rem]:absolute @min-[40rem]:inset-0">
            {stations.map((station, index) => {
              const point = wide.points[index]!;
              return (
                <li
                  key={station.id}
                  style={{ "--journey-x": `${(point.x / wide.width) * 100}%`, "--journey-y": `${(point.y / wide.height) * 100}%` } as CSSProperties}
                  // Široko: krug stanice (pola visine 22 px, od 60rem 28 px) leži tačno na putanji.
                  className="relative h-[88px] @min-[40rem]:absolute @min-[40rem]:left-[var(--journey-x)] @min-[40rem]:top-[var(--journey-y)] @min-[40rem]:h-auto @min-[40rem]:w-[var(--journey-column)] @min-[40rem]:max-w-56 @min-[40rem]:-translate-x-1/2 @min-[40rem]:-translate-y-[22px] @min-[60rem]:max-w-64 @min-[60rem]:-translate-y-[28px]"
                >
                  <Station station={station} index={index} locale={locale} />
                  {station.state === "next" ? (
                    // „Ti si ovde": uspravno uz desnu ivicu reda, široko iznad kruga stanice.
                    <span
                      data-journey-here=""
                      aria-hidden="true"
                      className="pointer-events-none absolute right-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 @min-[40rem]:bottom-full @min-[40rem]:left-1/2 @min-[40rem]:right-auto @min-[40rem]:top-auto @min-[40rem]:-translate-x-[62%] @min-[40rem]:translate-y-2.5 @min-[40rem]:flex-row-reverse @min-[40rem]:items-end"
                    >
                      <span className="block w-14 @min-[60rem]:w-20">
                        <IgraLik lik="robi" poza="mase" size="hero" decorative />
                      </span>
                      <span className="whitespace-nowrap rounded-full bg-ink px-2.5 py-1 type-eyebrow-sm text-paper-strong @min-[40rem]:mb-4">{IGRA_JOURNEY_COPY.here[locale]}</span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

/** Jedna stanica: krug na putanji i natpis. Link kad ima adresu; natpis i stanje su deo linka. */
function Station({ station, index, locale }: { station: JourneyStation; index: number; locale: Locale }) {
  const { state } = station;
  const body: ReactNode = (
    <>
      <span
        aria-hidden="true"
        className={cn("grid size-11 shrink-0 place-items-center rounded-full border-2 type-caption font-black tabular-nums @min-[60rem]:size-14 @min-[60rem]:text-sm", DOT[state])}
      >
        {state === "done" ? <Check className="size-5" strokeWidth={3} /> : state === "locked" ? <Lock className="size-4" /> : index + 1}
      </span>
      {/* Oreol u boji papira oko slova, kao na štampanoj mapi: natpis ostaje čitljiv i kad
          preko njega pređu putanja ili crtež scene. */}
      <span className="min-w-0 [text-shadow:0_0_2px_var(--igra-scene-paper),0_0_5px_var(--igra-scene-paper),0_0_9px_var(--igra-scene-paper)] @min-[40rem]:px-1">
        <span
          className={cn(
            "line-clamp-2 text-sm font-black leading-tight group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4 @min-[60rem]:text-base @min-[60rem]:leading-tight",
            state === "locked" ? "text-muted" : "text-ink",
          )}
        >
          {station.title}
        </span>
        {station.meta ? <span className="mt-0.5 block type-caption font-bold text-muted">{station.meta}</span> : null}
        <span className="sr-only"> ({IGRA_JOURNEY_COPY[state === "next" ? "here" : state][locale]})</span>
      </span>
    </>
  );
  const shape = cn(
    "grid h-full grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 @min-[40rem]:flex @min-[40rem]:h-auto @min-[40rem]:flex-col @min-[40rem]:gap-1.5 @min-[40rem]:text-center",
    // Uspravno „Ti si ovde" stoji uz desnu ivicu reda, pa natpis te stanice staje pre njega.
    state === "next" && "pr-24 @min-[40rem]:pr-0",
  );

  if (!station.href) return <span className={shape}>{body}</span>;
  return (
    <Link
      href={station.href}
      aria-current={state === "next" ? "step" : undefined}
      className={cn("group surface-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", shape)}
    >
      {body}
    </Link>
  );
}
