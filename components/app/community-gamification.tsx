"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/primitives";
import { communityGamificationContent, type Locale } from "@/lib/i18n";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * Brojač glasova koji se PREBROJI NAGORE kad vrednost poraste, uz jednu iskru iznad
 * sebe. Radi samo kad je `celebrate` tačno (sadržaj je viewer-ov) — tuđi brojač se
 * menja bez ijedne animacije.
 *
 * Tri kapije, sve tri jeftine i sve tri obavezne:
 *   · prvi render nikad ne animira (referenca kreće od početne vrednosti),
 *   · `prefers-reduced-motion` daje trenutnu promenu i nijednu iskru,
 *   · van kadra se ne pokreće — jedan `getBoundingClientRect` u trenutku promene,
 *     bez ijednog `IntersectionObserver`-a po redu liste (feed diskusija ne sme da
 *     nosi observer po kartici).
 */
export function VoteScore({
  value,
  celebrate,
  locale,
  className,
  children,
}: {
  value: number;
  celebrate: boolean;
  locale: Locale;
  className?: string;
  children?: ReactNode;
}) {
  const t = communityGamificationContent[locale];
  const [display, setDisplay] = useState(value);
  const [sparkKey, setSparkKey] = useState(0);
  const previous = useRef(value);
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;

    const host = hostRef.current;
    const inView = host
      ? (() => {
          const rect = host.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        })()
      : false;

    if (!celebrate || value < from || !inView || prefersReducedMotion()) {
      setDisplay(value);
      return;
    }

    setSparkKey((key) => key + 1);
    const start = performance.now();
    let frame = window.requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / 400);
      setDisplay(Math.round(from + (value - from) * progress));
      if (progress < 1) frame = window.requestAnimationFrame(step);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [celebrate, value]);

  return (
    <span ref={hostRef} className={cn("relative tabular-nums", className)}>
      {display}
      {children}
      {sparkKey > 0 ? (
        // Iskra se SKIDA čim animacija prođe — inače bi nevidljiv (opacity 0) element
        // sa imenom zauvek ostao u stablu pristupačnosti.
        <Sparkles
          key={sparkKey}
          aria-label={t.upvoteSpark}
          onAnimationEnd={() => setSparkKey(0)}
          className="community-spark pointer-events-none absolute -top-1 left-1/2 size-4 fill-yellow text-ink opacity-0"
        />
      ) : null}
    </span>
  );
}
