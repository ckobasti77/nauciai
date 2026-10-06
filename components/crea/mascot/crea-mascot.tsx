"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/components/ui/primitives";
import { CREA_MASCOT_POSTER, mascotLine, type CreaMascotMood } from "@/lib/crea-mascot";
import { CREA_MASCOT_COPY } from "@/lib/crea-experience-copy";
import type { Locale } from "@/lib/i18n";

const CreaMascotCanvas = dynamic(() => import("@/components/crea/mascot/crea-mascot-canvas").then((mod) => mod.CreaMascotCanvas), {
  ssr: false,
});

/** 3D samo na računaru (≥ 1024 px, miš) i uz dozvoljen pokret; inače poster. */
const WIDE_FINE = "(min-width: 1024px) and (pointer: fine)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE_FINE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Maskota u Crei (K25, U5): razmišlja dok se radi, slavi kad stigne, tužna kad ne uspe.
 * Na računaru je to postojeći 3D lik (lenjo: three.js i GLB se skidaju tek kad se maskota
 * prvi put pojavi u kadru); na telefonu i uz smanjen pokret ostaje poster, a raspoloženje
 * nosi rečenica pored. Poster je i podloga dok se 3D učitava (isti kadar).
 */
export function CreaMascot({
  mood,
  locale,
  allow3d,
  className,
}: {
  mood: CreaMascotMood;
  locale: Locale;
  /** `creaMotionFor(...).mascot3d` - lažno uz smanjen pokret. */
  allow3d: boolean;
  className?: string;
}) {
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(WIDE_FINE).matches, () => false);
  const use3d = wide && allow3d;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!use3d) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new IntersectionObserver((entries) => {
      const inView = entries[0]?.isIntersecting ?? false;
      setVisible(inView && !document.hidden);
      if (inView) setSeen(true);
    });
    observer.observe(wrap);
    const onVisibility = () => setVisible((current) => current && !document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [use3d]);

  const line = mascotLine(mood, locale);
  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="relative aspect-[6/7] w-full">
        <Image
          src={CREA_MASCOT_POSTER}
          alt=""
          fill
          sizes="160px"
          className={cn(
            "object-contain transition-opacity duration-300",
            use3d && ready ? "opacity-0" : "opacity-100",
            // 2D raspoloženje: bez petlji, samo poza postera (pokret je samo kratak skok kad slavi).
            mood === "tuzna" && "translate-y-1 rotate-[-6deg]",
            mood === "slavi" && "crea-mascot-hop",
          )}
        />
        {use3d && seen ? (
          <div className="absolute inset-0">
            <CreaMascotCanvas mood={mood} active={visible} onReady={() => setReady(true)} />
          </div>
        ) : null}
      </div>
      <span className="sr-only">
        {CREA_MASCOT_COPY.label[locale]}
        {line ? `: ${line}` : ""}
      </span>
    </div>
  );
}
