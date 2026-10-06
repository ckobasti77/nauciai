"use client";

import { motion, type Easing } from "motion/react";
import { useState, type ReactNode } from "react";

import { cn } from "@/components/ui/primitives";
import { CREA_REVEAL_COPY } from "@/lib/crea-experience-copy";
import type { CreaRevealStyle } from "@/lib/crea-reveal";
import type { Locale } from "@/lib/i18n";
import type { CreaMotionParams } from "@/lib/motion-contract";

/** Polaroid pre razvijanja: taman, ispran, mek - pa se razvije u pravu sliku. */
const UNDEVELOPED = "sepia(1) saturate(0.25) brightness(0.32) contrast(0.8) blur(3px)";
const DEVELOPED = "sepia(0) saturate(1) brightness(1) contrast(1) blur(0px)";

/**
 * Otkrivanje gotovog rada (K25, U4), samo kad je rad stigao DOK je kartica bila otvorena:
 * slika se razvija kao polaroid, video ulazi kroz filmsku traku, zvuk stiže kao kaseta.
 * Medij (`children`) ostaje na istom mestu u stablu (video se ne učitava ponovo); oko njega
 * su samo prolazni slojevi koji nestanu na kraju. Uz smanjen pokret (`duration` 0) nema
 * otkrivanja - medij se samo pojavi.
 */
export function CreaReveal({
  style,
  active,
  ready,
  caption,
  locale,
  motion: motionParams,
  className,
  children,
}: {
  style: CreaRevealStyle;
  /** Rad je upravo stigao (prelaz posmatran uživo). */
  active: boolean;
  /** Medij je učitan - otkrivanje kreće tek tada. */
  ready: boolean;
  caption: string;
  locale: Locale;
  motion: CreaMotionParams;
  /** Raspored korena (npr. centriranje u punom prikazu). */
  className?: string;
  children: ReactNode;
}) {
  const duration = motionParams.reveal[style];
  const [finished, setFinished] = useState(false);
  const playing = active && duration > 0 && !finished;
  const run = playing && ready;
  const ease = motionParams.reveal.ease as unknown as Easing;
  const done = () => setFinished(true);
  // Ključni kadrovi sa `times` dobijaju krivu PO DEONICI: jedna kriva za ceo niz bi se na
  // ubrzanim osobinama (opacity, filter - WAAPI) primenila na celo trajanje i iskrivila tempo.

  if (style === "polaroid") {
    return (
      <div className={cn("relative overflow-hidden", playing && "paper-island bg-paper", className)}>
        <motion.div
          className="size-full"
          initial={false}
          animate={
            run
              ? { scale: [0.82, 0.82, 1], y: ["-7%", "-7%", "0%"], rotate: [-2, -2, 0], filter: [UNDEVELOPED, DEVELOPED, DEVELOPED] }
              : playing
                ? { scale: 0.82, y: "-7%", rotate: -2, filter: UNDEVELOPED }
                : { scale: 1, y: "0%", rotate: 0, filter: "none" }
          }
          // Hemija se razvija ravnomerno (prvih 75 %), a list tek onda legne preko okvira.
          transition={
            run
              ? { duration, times: [0, 0.75, 1], ease: ["linear", ease], filter: { duration, times: [0, 0.75, 1], ease: ["easeInOut", "linear"] } }
              : { duration: 0 }
          }
          onAnimationComplete={() => {
            if (run) done();
          }}
        >
          {children}
        </motion.div>
      </div>
    );
  }

  if (style === "film") {
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <motion.div
          className="size-full"
          initial={false}
          animate={run ? { x: ["38%", "0%", "0%"], opacity: [0, 1, 1] } : playing ? { x: "38%", opacity: 0 } : { x: "0%", opacity: 1 }}
          transition={run ? { duration, times: [0, 0.62, 1], ease: [ease, "linear"] } : { duration: 0 }}
          onAnimationComplete={() => {
            if (run) done();
          }}
        >
          {children}
        </motion.div>
        {playing ? (
          <>
            {(["top", "bottom"] as const).map((edge) => (
              <motion.div
                key={edge}
                aria-hidden="true"
                className={cn("crea-film-strip paper-island pointer-events-none absolute inset-x-0 h-4", edge === "top" ? "top-0" : "bottom-0")}
                initial={{ backgroundPositionX: "0px", y: "0%" }}
                animate={run ? { backgroundPositionX: ["0px", "-88px", "-88px"], y: ["0%", "0%", edge === "top" ? "-110%" : "110%"] } : {}}
                transition={{ duration, times: [0, 0.7, 1], ease: ["linear", "easeIn"] }}
              />
            ))}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <motion.div
        className="size-full"
        initial={false}
        animate={run ? { opacity: [0, 0, 1] } : playing ? { opacity: 0 } : { opacity: 1 }}
        transition={run ? { duration, times: [0, 0.72, 1], ease: ["linear", "easeOut"] } : { duration: 0 }}
        onAnimationComplete={() => {
          if (run) done();
        }}
      >
        {children}
      </motion.div>
      {playing ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid place-items-center pb-10"
          initial={{ y: "40%", opacity: 0 }}
          animate={run ? { y: ["40%", "0%", "0%", "30%"], opacity: [0, 1, 1, 0] } : {}}
          transition={{ duration, times: [0, 0.25, 0.75, 1], ease: [ease, "linear", "easeIn"] }}
        >
          <Cassette label={caption || CREA_REVEAL_COPY.cassette[locale]} spinning={run} duration={duration} />
        </motion.div>
      ) : null}
    </div>
  );
}

/** Kaseta: krem kućište, mastilo, dva kotura koja se vrte dok traka „namotava" zvuk. */
function Cassette({ label, spinning, duration }: { label: string; spinning: boolean; duration: number }) {
  const reel = (cx: number) => (
    <motion.g
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
      animate={spinning ? { rotate: [0, 540] } : {}}
      transition={{ duration: duration * 0.7, delay: duration * 0.15, ease: "easeInOut" }}
    >
      <circle cx={cx} cy="62" r="13" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2.5" />
      {[0, 60, 120].map((angle) => (
        <line
          key={angle}
          x1={cx}
          y1="62"
          x2={cx + 11 * Math.cos((angle * Math.PI) / 180)}
          y2={62 + 11 * Math.sin((angle * Math.PI) / 180)}
          stroke="var(--ink)"
          strokeWidth="2"
        />
      ))}
      <circle cx={cx} cy="62" r="3.5" fill="var(--ink)" />
    </motion.g>
  );
  return (
    <div className="paper-island w-[min(70%,220px)]">
      <svg viewBox="0 0 200 124" className="block h-auto w-full">
        <rect x="4" y="4" width="192" height="116" rx="10" fill="var(--paper)" stroke="var(--ink)" strokeWidth="3" />
        <rect x="18" y="14" width="164" height="30" rx="4" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="2" />
        <text x="100" y="34" textAnchor="middle" fontFamily="var(--font-display)" fontSize="15" fill="var(--ink)">
          {label.length > 22 ? `${label.slice(0, 21)}…` : label}
        </text>
        <rect x="46" y="48" width="108" height="28" rx="14" fill="none" stroke="var(--ink)" strokeWidth="2" />
        {reel(64)}
        {reel(136)}
        <path d="M40 120 L52 96 L148 96 L160 120" fill="none" stroke="var(--ink)" strokeWidth="2.5" />
      </svg>
    </div>
  );
}
