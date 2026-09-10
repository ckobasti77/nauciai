"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/components/ui/primitives";
import type { MascotVariant } from "@/lib/mascot-rig";

/**
 * Živa 3D maskota u desnoj trećini kartice plana (#pricing) — zamena za `PlanRobot`
 * (video). ISTO ponašanje gejtovanja i sinhronizacije, samo R3F canvas umesto `<video>`:
 *
 *   · GEJT: (min-width: 1024px) I bez prefers-reduced-motion → canvas; inače SAMO poster
 *     (novi providni WebP kroz `next/image`). Canvas ide kroz `next/dynamic` ssr:false i
 *     montira se tek kad je #pricing na 600px od kadra (IntersectionObserver) — three.js
 *     chunk i GLB se NE skidaju na učitavanje početne strane.
 *   · IDLE: pušta se čim je model učitan i #pricing u kadru (prag 0.25), pauza van kadra i na
 *     `visibilitychange → hidden`. Fazni pomak: basic 0 s, premium 2,1 s klipa (`action.time`).
 *   · SENKA: `plan-mascot-shadow` div ispod modela, u ritmu lebdenja, isti fazni pomak preko
 *     negativnog `animation-delay`.
 *   · POZDRAV: hover na kartici (pointerenter na Panel/`section`) → jednokratni „pozdrav"
 *     (`waveNonce`). Bez pozdrava na dodirnim uređajima (pointer: coarse).
 *
 * Providan canvas (bez pozadine) — boja kartice (paper-island) se vidi kroz njega u obe teme.
 * `pointer-events-none`, `aria-hidden`: dekoracija, ne hvata klik kartice.
 */
const PlanMascotCanvas = dynamic(
  () => import("@/components/marketing/plan-mascot-canvas").then((m) => m.PlanMascotCanvas),
  { ssr: false },
);

function subscribe(onChange: () => void): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wide = window.matchMedia("(min-width: 1024px)");
  reduce.addEventListener("change", onChange);
  wide.addEventListener("change", onChange);
  return () => {
    reduce.removeEventListener("change", onChange);
    wide.removeEventListener("change", onChange);
  };
}

/** `true` → 3D canvas dozvoljen (pokret uključen I širina ≥ 1024). */
function getSnapshot(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && window.matchMedia("(min-width: 1024px)").matches;
}

function getServerSnapshot(): boolean {
  return false;
}

function useCanvasEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function PlanMascot({
  variant,
  posterSrc,
  phaseSeconds,
  className,
}: {
  variant: MascotVariant;
  posterSrc: string;
  /** Fazni pomak idle klipa u SEKUNDAMA (basic 0, premium 2,1). */
  phaseSeconds: number;
  /** Pozicioniranje kontejnera (desna trećina na desktopu, manji desno na mobilnom). */
  className?: string;
}) {
  const enabled = useCanvasEnabled();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [waveNonce, setWaveNonce] = useState(0);
  // `active` = #pricing u kadru; u ref-u da `visibilitychange` čita svežu vrednost.
  const activeRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Prati CELU #pricing sekciju, pa oba robota (Basic/Premium) krenu na isti prelaz praga.
    const target = wrap.closest("#pricing") ?? wrap;

    // Montiranje: kad je #pricing na 600px od kadra (three chunk + GLB se skidaju tek tada).
    const nearIo = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setNear(true);
          nearIo.disconnect();
        }
      },
      { rootMargin: "600px" },
    );
    nearIo.observe(target);

    // Puštanje idle-a: #pricing u kadru (prag 0.25), pauza van kadra.
    const activeIo = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        activeRef.current = entry.intersectionRatio >= 0.25;
        setPlaying(activeRef.current && !document.hidden);
      },
      { threshold: [0, 0.25] },
    );
    activeIo.observe(target);

    const onVisibility = () => {
      setPlaying(activeRef.current && !document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      nearIo.disconnect();
      activeIo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  // Pozdrav na hover kartice — Panel je roditelj (`section`). Ne na dodirnim uređajima.
  useEffect(() => {
    if (!enabled) return;
    const card = wrapRef.current?.parentElement;
    if (!card || window.matchMedia("(pointer: coarse)").matches) return;
    const onEnter = () => setWaveNonce((n) => n + 1);
    card.addEventListener("pointerenter", onEnter);
    return () => card.removeEventListener("pointerenter", onEnter);
  }, [enabled]);

  return (
    <div ref={wrapRef} aria-hidden="true" className={cn("pointer-events-none absolute", className)}>
      <Image
        src={posterSrc}
        alt=""
        fill
        sizes="(min-width: 1024px) 240px, 100px"
        className={cn("object-contain transition-opacity duration-300", ready ? "opacity-0" : "opacity-100")}
      />
      {enabled && near ? (
        <>
          {/* Senka ispod stopala; fazni pomak i pauza prate model. */}
          <div
            className="plan-mascot-shadow absolute bottom-[15%] left-1/2 h-[7%] w-[55%]"
            style={{
              background: "radial-gradient(ellipse at center, var(--ink) 0%, transparent 70%)",
              opacity: 0.18,
              animationDelay: `${-phaseSeconds}s`,
              animationPlayState: playing ? "running" : "paused",
            }}
          />
          <div className="absolute inset-0">
            <PlanMascotCanvas
              variant={variant}
              phaseSeconds={phaseSeconds}
              playing={playing}
              waveNonce={waveNonce}
              onReady={() => setReady(true)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
