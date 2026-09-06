"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Deljeni video primitivi za marketing sekcije ISPOD heroa (L4). Hero ima svoj
 * `hero-loop.tsx` (autoplay, LCP poster) i NIJE diran.
 *
 * Zajedničko za obe komponente:
 *   - `useStillOnly()` — `prefers-reduced-motion` ILI data-saver (`saveData`) →
 *     uopšte se ne renderuje `<video>`, samo `next/image` poster. Isti obrazac
 *     kao hero-loop (`useSyncExternalStore`, server snapshot `false` → nema
 *     hydration nesklada).
 *   - IntersectionObserver gating: teški `<video>` se učitava tek kad uđe u kadar
 *     (ili tik uz njega), pa je van ekrana uvek `preload="none"` (0 učitanih
 *     videa van kadra).
 *   - Poster stoji kao pozadina wrappera ODMAH → nema skoka/CLS ni bleska pre
 *     prvog frejma; wrapper nosi `role="img"` + `aria-label`, video je
 *     `aria-hidden` i `pointer-events-none` (nikad ne presreće klik kartice).
 */

type NetworkInfo = EventTarget & { saveData?: boolean };

function getConnection(): NetworkInfo | undefined {
  return (navigator as Navigator & { connection?: NetworkInfo }).connection;
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = getConnection();
  query.addEventListener("change", onChange);
  connection?.addEventListener?.("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
    connection?.removeEventListener?.("change", onChange);
  };
}

function getSnapshot(): boolean {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduce || Boolean(getConnection()?.saveData);
}

function getServerSnapshot(): boolean {
  return false;
}

/** `true` → renderuj mirni poster umesto videa (reduced-motion ili ušteda podataka). */
function useStillOnly(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const POSTER_BG = (posterSrc: string) => ({
  backgroundImage: `url("${posterSrc}")`,
  backgroundSize: "cover",
  backgroundPosition: "center",
});

// ──────────────────────────────────────────────────────────────────────────
// LoopVideo — bešavna petlja (kursevi, zajednica). Prvi = poslednji frejm.
// ──────────────────────────────────────────────────────────────────────────

export function LoopVideo({
  webmSrc,
  mp4Src,
  posterSrc,
  label,
  className = "",
  sizes = "(min-width: 1024px) 50vw, 100vw",
}: {
  webmSrc: string;
  mp4Src: string;
  posterSrc: string;
  /** Ide na wrapper (`role="img"`); asset je dekorativan pa je video `aria-hidden`. */
  label: string;
  /** Klase wrappera — pozivalac drži aspect-ratio, radius i border (nema CLS). */
  className?: string;
  sizes?: string;
}) {
  const stillOnly = useStillOnly();
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (stillOnly || failed) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    // rootMargin 200px: tik pre kadra dozvoli `metadata` (lako); play tek na ≥25%.
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) setNear(true);
        const video = videoRef.current;
        if (!video) return;
        if (entry.intersectionRatio >= 0.25) {
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { rootMargin: "200px", threshold: [0, 0.25] },
    );
    io.observe(wrap);
    return () => io.disconnect();
  }, [stillOnly, failed]);

  return (
    <div ref={wrapRef} className={className} style={POSTER_BG(posterSrc)} role="img" aria-label={label}>
      {stillOnly || failed ? (
        <Image src={posterSrc} alt={label} fill sizes={sizes} className="object-cover" />
      ) : (
        <video
          ref={videoRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          muted
          loop
          playsInline
          preload={near ? "metadata" : "none"}
          poster={posterSrc}
          aria-hidden="true"
          onError={() => setFailed(true)}
        >
          <source src={mp4Src} type="video/mp4" />
          <source src={webmSrc} type="video/webm" />
        </video>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// StepHoverVideo — hover-in / hover-out na koracima (#how).
// ──────────────────────────────────────────────────────────────────────────
//
// Default: statični mono poster (`step-N-mono-poster.webp`, svetla žuto-bela
// ilustracija = prvi frejm hover-in). Na hover/focus kartice pušta se `hover-in`
// jednom (poslednji frejm = obojeno, „živo"); na leave/blur `hover-out` jednom
// (poslednji frejm = mono ilustracija = poster). Brzi ulaz/izlaz: out je vremenski
// obrnuti in, pa se `out.currentTime` postavi na `trajanje − in.currentTime` da
// prelaz bude vizuelno kontinuiran. Touch (pointer: coarse): bez hover-a — kad
// kartica uđe u kadar (≥60%) pušta se in jednom i ostaje „živo".

type StepSources = { webm: string; mp4: string };

export function StepHoverVideo({
  posterSrc,
  hoverIn,
  hoverOut,
  label,
  className = "",
  sizes = "(min-width: 768px) 33vw, 100vw",
}: {
  posterSrc: string;
  hoverIn: StepSources;
  hoverOut: StepSources;
  label: string;
  className?: string;
  sizes?: string;
}) {
  const stillOnly = useStillOnly();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLVideoElement>(null);
  const outRef = useRef<HTMLVideoElement>(null);
  // "idle" → poster; "in" → hover-in (drži poslednji frejm); "out" → hover-out.
  const [phase, setPhase] = useState<"idle" | "in" | "out">("idle");
  // Kad kartica uđe u kadar: in→"auto", out→"metadata" (van kadra oba "none").
  const [ready, setReady] = useState(false);
  // `phase` u ref-u da hover handleri (vezani jednom) čitaju svežu vrednost.
  const phaseRef = useRef<"idle" | "in" | "out">("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Hover je brži za 33 %: oba videa (in i out) idu playbackRate 1.33. `playbackRate` se
  // resetuje na 1 pri svakom (re)učitavanju izvora, pa ga vraćamo i na `loadedmetadata`.
  // Logika brzog ulaza/izlaza (currentTime = trajanje − odgledano) radi u medijskom vremenu,
  // ne u zidnom, pa ostaje ispravna sa novim tempom.
  useEffect(() => {
    if (stillOnly) return;
    const videos = [inRef.current, outRef.current];
    const RATE = 1.33;
    const cleanups = videos.map((video) => {
      if (!video) return undefined;
      const apply = () => {
        video.playbackRate = RATE;
      };
      apply();
      video.addEventListener("loadedmetadata", apply);
      return () => video.removeEventListener("loadedmetadata", apply);
    });
    return () => cleanups.forEach((cleanup) => cleanup?.());
  }, [stillOnly]);

  useEffect(() => {
    if (stillOnly) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let touchPlayed = false;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) setReady(true);
        // Touch: nema hover-a → pusti in jednom kad je kartica stvarno u kadru.
        if (coarse && !touchPlayed && entry.intersectionRatio >= 0.6) {
          touchPlayed = true;
          const inVideo = inRef.current;
          if (inVideo) {
            inVideo.currentTime = 0;
            setPhase("in");
            void inVideo.play().catch(() => {});
          }
        }
      },
      { threshold: [0, 0.6] },
    );
    io.observe(wrap);
    return () => io.disconnect();
  }, [stillOnly]);

  // Hover/focus se vezuje za CELU karticu (`<article>`), ne samo za medij.
  useEffect(() => {
    if (stillOnly) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const card = wrap.closest("article") ?? wrap;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const inVideo = inRef.current;
    const outVideo = outRef.current;
    if (!inVideo || !outVideo) return;

    const enter = () => {
      // Re-ulaz tokom out-a: nastavi in sa poklopljenog frejma (simetrično).
      const outDur = outVideo.duration || inVideo.duration || 0;
      if (phaseRef.current === "out" && outDur) {
        inVideo.currentTime = Math.max(0, (inVideo.duration || outDur) - outVideo.currentTime);
      } else {
        inVideo.currentTime = 0;
      }
      outVideo.pause();
      setPhase("in");
      void inVideo.play().catch(() => {});
    };

    const leave = () => {
      const inDur = inVideo.duration || 0;
      // Ako in nije stigao do kraja: kreni out sa poklopljenog frejma (out je obrnut in).
      if (phaseRef.current === "in" && inDur && !inVideo.ended) {
        outVideo.currentTime = Math.max(0, (outVideo.duration || inDur) - inVideo.currentTime);
      } else {
        outVideo.currentTime = 0;
      }
      inVideo.pause();
      setPhase("out");
      void outVideo.play().catch(() => {});
    };

    const onFocusIn = () => enter();
    const onFocusOut = (event: FocusEvent) => {
      if (card.contains(event.relatedTarget as Node | null)) return;
      leave();
    };

    card.addEventListener("mouseenter", enter);
    card.addEventListener("mouseleave", leave);
    card.addEventListener("focusin", onFocusIn);
    card.addEventListener("focusout", onFocusOut);
    return () => {
      card.removeEventListener("mouseenter", enter);
      card.removeEventListener("mouseleave", leave);
      card.removeEventListener("focusin", onFocusIn);
      card.removeEventListener("focusout", onFocusOut);
    };
  }, [stillOnly]);

  const onOutEnded = () => {
    if (phaseRef.current === "out") setPhase("idle");
  };

  return (
    <div ref={wrapRef} className={className} style={POSTER_BG(posterSrc)} role="img" aria-label={label}>
      {/* Poster je uvek u DOM-u (SSR / no-JS / reduced-motion). */}
      <Image src={posterSrc} alt={label} fill sizes={sizes} className="object-cover" />
      {stillOnly ? null : (
        <>
          <video
            ref={inRef}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-100 ${
              phase === "in" ? "opacity-100" : "opacity-0"
            }`}
            muted
            playsInline
            preload={ready ? "auto" : "none"}
            poster={posterSrc}
            aria-hidden="true"
          >
            <source src={hoverIn.mp4} type="video/mp4" />
            <source src={hoverIn.webm} type="video/webm" />
          </video>
          <video
            ref={outRef}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
              phase === "out" ? "opacity-100" : "opacity-0"
            }`}
            muted
            playsInline
            preload={ready ? "metadata" : "none"}
            aria-hidden="true"
            onEnded={onOutEnded}
          >
            <source src={hoverOut.mp4} type="video/mp4" />
            <source src={hoverOut.webm} type="video/webm" />
          </video>
        </>
      )}
    </div>
  );
}
