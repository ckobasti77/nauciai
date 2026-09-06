"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/components/ui/primitives";

/**
 * Robot koji lebdi u desnoj trećini kartice plana (#pricing). Snimci već U SEBI imaju
 * ping-pong petlju (10,08 s = 5 s napred + 5 s nazad, prvi frejm = poslednji), pa je
 * dovoljan atribut `loop` — BEZ reverse-a u JS-u, bez `playbackRate`, bez sečenja klipa.
 *
 * Ponašanje (v3, po dopuni brifa):
 *   · Oba videa idu AUTOMATSKI u petlji, NE na hover — sekcija cena je trenutak odluke i
 *     poređenje Basic/Premium radi samo ako se dešava samo od sebe (na telefonu hover ni
 *     ne postoji). Hover na kartici i dalje samo diže karticu.
 *   · Play tek kad #pricing uđe u kadar (IntersectionObserver, prag 0.25), pauza kad izađe.
 *   · Pauza na `visibilitychange → hidden`, nastavak na visible (kao marquee traka).
 *   · FAZNI POMAK: oba starta ISTOVREMENO (bez setTimeout, bez odlaganja play() — zamrznut
 *     poster izgleda kao greška). Pomak radi preko `currentTime`: Basic ostaje na 0, Premium
 *     se pre play() postavi na `duration * phase` (≈0.7 → ~7 s). Vrhunac klipa je na 5. s, pa
 *     Premium plane ~3 s POSLE Basic-a. Razmak se ne gubi kroz petlje (isti klipovi) ni kroz
 *     pauzu/nastavak (currentTime se NE resetuje pri nastavku).
 *   · `prefers-reduced-motion` ILI < 1024px → nijedan `<video>` se ne renderuje/učitava, samo
 *     poster kroz `next/image`.
 *
 * Bez okvira, bordera, senke, radijusa i pozadine na video elementu — robot ima svoju senku
 * u snimku i pozadinu TAČNO boje kartice (#F4F0E8 = surface-b), pa `object-contain` letterbox
 * ostaje bešavan. `pointer-events-none` da ne hvata klik kartice.
 */

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

/** `true` → renderuj `<video>` (pokret dozvoljen I širina ≥ 1024). */
function getSnapshot(): boolean {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wide = window.matchMedia("(min-width: 1024px)").matches;
  return !reduce && wide;
}

function getServerSnapshot(): boolean {
  return false;
}

function useVideoEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function PlanRobot({
  mp4Src,
  posterSrc,
  phase,
  className,
}: {
  mp4Src: string;
  posterSrc: string;
  /** Fazni pomak u DELU trajanja klipa (0 = Basic, 0.7 = Premium). */
  phase: number;
  /** Pozicioniranje kontejnera (desna trećina na desktopu, manji desno na mobilnom). */
  className?: string;
}) {
  const enabled = useVideoEnabled();
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  // `active` = sekcija u kadru; drži se u ref-u da `visibilitychange` handler čita svežu vrednost.
  const activeRef = useRef(false);
  // Fazni pomak se postavlja SAMO jednom (na prvom play-u); nastavak ga ne resetuje.
  const seededRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Prati CELU #pricing sekciju, pa oba robota (Basic/Premium) krenu na isti prelaz praga.
    const target = wrap.closest("#pricing") ?? wrap;

    const play = () => {
      const video = videoRef.current;
      if (!video) return;
      const seed = () => {
        if (seededRef.current) return;
        if (video.duration && Number.isFinite(video.duration)) {
          if (phase > 0) video.currentTime = video.duration * phase;
          seededRef.current = true;
        }
      };
      if (video.readyState >= 1) seed();
      else video.addEventListener("loadedmetadata", seed, { once: true });
      void video.play().catch(() => {});
    };

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) setNear(true);
        if (entry.intersectionRatio >= 0.25) {
          activeRef.current = true;
          if (!document.hidden) play();
        } else {
          activeRef.current = false;
          videoRef.current?.pause();
        }
      },
      { threshold: [0, 0.25] },
    );
    io.observe(target);

    // Isti obrazac kao marquee: pauza dok je tab/prozor skriven, nastavak po povratku
    // (bez resetovanja currentTime → fazni pomak se održava sam).
    const onVisibility = () => {
      if (document.hidden) videoRef.current?.pause();
      else if (activeRef.current) play();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, phase]);

  return (
    <div ref={wrapRef} aria-hidden="true" className={cn("pointer-events-none absolute", className)}>
      <Image src={posterSrc} alt="" fill sizes="(min-width: 1024px) 240px, 100px" className="object-contain" />
      {enabled ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          muted
          loop
          playsInline
          preload={near ? "auto" : "none"}
          poster={posterSrc}
          aria-hidden="true"
        >
          <source src={mp4Src} type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
