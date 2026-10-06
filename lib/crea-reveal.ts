import type { CreaMoment } from "@/convex/creaMomentsCore";

import type { Locale } from "./i18n";

/**
 * Otkrivanje gotovog rada (K25, U4): slika se razvija kao polaroid, video ulazi kao
 * filmska traka, zvuk kao kaseta. Konfete (žuta i mastilo) samo za posebne trenutke
 * (`convex/creaMomentsCore.ts`). Komponenta: `components/crea/reveal/crea-reveal.tsx`.
 */

export type CreaRevealStyle = "polaroid" | "film" | "kaseta";

export function revealStyleFor(kind: "image" | "video" | "audio"): CreaRevealStyle {
  return kind === "video" ? "film" : kind === "audio" ? "kaseta" : "polaroid";
}

/**
 * Opcije za `canvas-confetti`. Boje su tokeni teme pročitani u trenutku pucanja (`--yellow`,
 * `--ink`), pa je mastilo u tamnoj temi svetlo. `disableForReducedMotion` je uvek uključen -
 * biblioteka sama ćuti uz smanjen pokret, i pored naše provere.
 */
export type CreaConfettiShot = {
  particleCount: number;
  spread: number;
  startVelocity: number;
  angle: number;
  origin: { x: number; y: number };
  colors: string[];
  shapes: ("square" | "circle")[];
  scalar: number;
  ticks: number;
  gravity: number;
  disableForReducedMotion: true;
};

/** Dva rafala iz donjih uglova rada ka sredini - „papirići" iz sveske, ne vatromet preko ekrana. */
export function confettiShots(origin: { x: number; y: number }, colors: { yellow: string; ink: string }, big: boolean): CreaConfettiShot[] {
  const base = {
    particleCount: big ? 70 : 40,
    spread: 55,
    startVelocity: big ? 42 : 34,
    colors: [colors.yellow, colors.yellow, colors.ink],
    shapes: ["square", "circle"] as ("square" | "circle")[],
    scalar: 0.9,
    ticks: 180,
    gravity: 1.1,
    disableForReducedMotion: true as const,
  };
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return [
    { ...base, angle: 60, origin: { x: clamp(origin.x - 0.12), y: clamp(origin.y) } },
    { ...base, angle: 120, origin: { x: clamp(origin.x + 0.12), y: clamp(origin.y) } },
  ];
}

/** Poruka uz konfete; `null` kad trenutak nije poseban. */
export function momentMessage(moment: CreaMoment | null, locale: Locale): string | null {
  if (!moment) return null;
  if (moment.id === "prvi-rad") return locale === "sr" ? "Tvoj prvi rad u Crei!" : "Your first work in Crea!";
  if (moment.id === "jubilej") {
    return locale === "sr" ? `Ovo ti je ${moment.count}. rad. Bravo!` : `That is your work number ${moment.count}. Well done!`;
  }
  const what = {
    image: { sr: "Tvoja prva slika!", en: "Your first image!" },
    video: { sr: "Tvoj prvi video!", en: "Your first video!" },
    audio: { sr: "Tvoj prvi zvuk!", en: "Your first sound!" },
  }[moment.kind];
  return what[locale];
}
