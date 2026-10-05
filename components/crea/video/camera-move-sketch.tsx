"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { cn } from "@/components/ui/primitives";
import type { CameraMove, SketchKey } from "@/lib/crea-camera-moves";

const W = 120;
const H = 72;
const LOOP_MS = 2600;

function transformOf(key: SketchKey): string {
  return `translate(${(key.x * W).toFixed(2)}px, ${(key.y * H).toFixed(2)}px) scale(${key.s}) rotate(${key.r}deg)`;
}

/** Ključevi u Web Animations okvire; pokret ide napred-nazad, sa ublažavanjem (nikad linearno). */
function frames(keys: readonly SketchKey[]): Keyframe[] {
  return keys.map((key) => ({ offset: key.t, transform: transformOf(key) }));
}

const LAYER = { transformBox: "view-box", transformOrigin: `${W / 2}px ${H / 2}px` } as const;

/**
 * Animirana SKICA pokreta kamere (Crea K18, V7): okvir kadra, pozadina (kuća,
 * drvo, sunce, tlo) i lik od crtica. Pomera se kroz Web Animations API po
 * ključnim tačkama iz `lib/crea-camera-moves.ts` - samo dok je kartica pod
 * mišem ili u fokusu (`playing`), da 40 kartica ne vrti 40 petlji. Uz smanjen
 * pokret stoji u početnom položaju, a pokret objašnjava naziv i mini-lekcija.
 *
 * Boje su tokeni (`currentColor` = mastilo, žuta za sunce), pa radi u obe teme.
 */
export function CameraMoveSketch({ move, playing, className }: { move: CameraMove; playing: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const sceneRef = useRef<SVGGElement>(null);
  const subjectRef = useRef<SVGGElement>(null);
  const sceneKeys = move.sketch.scene;
  const subjectKeys = move.sketch.subject ?? move.sketch.scene;
  // Mirna skica je početni položaj: većina pokreta kreće iz neutralnog kadra, pa mreža izgleda ujednačeno.
  const restScene = transformOf(sceneKeys[0]);
  const restSubject = transformOf(subjectKeys[0]);

  useEffect(() => {
    if (!playing || reduce) return;
    const options: KeyframeAnimationOptions = { duration: LOOP_MS, iterations: Infinity, direction: "alternate", easing: "ease-in-out" };
    const animations = [
      sceneRef.current?.animate(frames(sceneKeys), options),
      subjectRef.current?.animate(frames(subjectKeys), options),
    ];
    return () => {
      for (const animation of animations) animation?.cancel();
    };
  }, [playing, reduce, sceneKeys, subjectKeys]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className={cn("block h-auto w-full text-ink", className)}>
      <rect x="0" y="0" width={W} height={H} className="fill-paper" />
      <g ref={sceneRef} style={{ ...LAYER, transform: restScene }}>
        <circle cx="96" cy="16" r="7" className="fill-yellow" stroke="currentColor" strokeWidth="1.5" />
        <path d="M-40 58 H160" stroke="currentColor" strokeWidth="2" />
        <path d="M14 58 V38 L28 26 L42 38 V58 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <rect x="24" y="46" width="8" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M100 58 V44" stroke="currentColor" strokeWidth="2" />
        <circle cx="100" cy="38" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M-30 58 L-12 44 L4 58 M118 58 L132 46 L150 58" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <g ref={subjectRef} style={{ ...LAYER, transform: restSubject }}>
        <circle cx="60" cy="31" r="4.5" className="fill-paper" stroke="currentColor" strokeWidth="2" />
        <path d="M60 36 V48 M60 40 L53 45 M60 40 L67 44 M60 48 L55 57 M60 48 L65 57" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      {/* Okvir kadra (tražilo) - stoji, jer je to ono što kamera vidi. */}
      <path
        d="M5 15 V5 H15 M105 5 H115 V15 M115 57 V67 H105 M15 67 H5 V57"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {move.sketch.icon ? <SketchIcon icon={move.sketch.icon} /> : null}
    </svg>
  );
}

function SketchIcon({ icon }: { icon: NonNullable<CameraMove["sketch"]["icon"]> }) {
  return (
    <g transform="translate(9 9)" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round">
      <rect x="-1" y="-1" width="16" height="16" rx="8" className="fill-paper-strong" />
      {icon === "dron" ? <path d="M3 4 H6 M9 4 H12 M4.5 4 V7 H10.5 V4 M7.5 7 V10" /> : null}
      {icon === "ruka" ? <path d="M5 11 V5.5 M7.5 11 V4 M10 11 V5 M5 11 Q7.5 13 10 11" /> : null}
      {icon === "sat" ? <path d="M7 3.5 A3.5 3.5 0 1 0 7.01 3.5 M7 5 V7.2 L8.6 8.4" /> : null}
      {icon === "fokus" ? <path d="M7 3 V5 M7 9 V11 M3 7 H5 M9 7 H11 M7 7 m-1.4 0 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0" /> : null}
    </g>
  );
}
