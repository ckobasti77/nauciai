"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";

import { cn } from "@/components/ui/primitives";

/**
 * Rukom crtane marginalije uz naslove sekcija (Faza 3). Precrtane kao inline SVG stroke
 * putanje (strelica, zvezda, kruženje, iskra) i iscrtavaju se `stroke-dashoffset` animacijom
 * na scroll — GSAP ScrollTrigger, JEDNOM, bez `repeat`. Podrazumevani render (bez JS-a) i
 * `prefers-reduced-motion` ostavljaju ih pune (nema dash-a), pa nema layout shift-a; animira
 * se samo `stroke-dashoffset`. Dekorativne su: `aria-hidden`, `pointer-events-none`.
 */
type MarginaliaVariant = "arrow" | "star" | "loop" | "spark";

const DOODLES: Record<MarginaliaVariant, { viewBox: string; paths: string[] }> = {
  arrow: {
    viewBox: "0 0 90 66",
    paths: ["M8 50C26 16 54 12 80 28", "M80 28 63 24", "M80 28 72 43"],
  },
  star: {
    viewBox: "0 0 48 48",
    paths: ["M24 5V43", "M5 24H43", "M11 11 37 37", "M37 11 11 37"],
  },
  loop: {
    viewBox: "0 0 118 84",
    paths: ["M62 10C24 7 9 31 23 55 39 81 93 79 105 51 113 31 93 13 51 17"],
  },
  spark: {
    viewBox: "0 0 44 44",
    paths: ["M22 4C24 14 30 20 40 22 30 24 24 30 22 40 20 30 14 24 4 22 14 20 20 14 22 4Z"],
  },
};

export function SectionMarginalia({
  variant,
  className,
}: {
  variant: MarginaliaVariant;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const doodle = DOODLES[variant];

  useEffect(() => {
    const svg = ref.current;
    if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const paths = Array.from(svg.querySelectorAll("path"));

    const context = gsap.context(() => {
      paths.forEach((path, index) => {
        const length = path.getTotalLength();
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(path, {
          strokeDashoffset: 0,
          duration: 0.6,
          ease: "power2.out",
          delay: index * 0.08,
          scrollTrigger: { trigger: svg, start: "top 88%", once: true },
          onComplete: () => gsap.set(path, { clearProps: "strokeDasharray,strokeDashoffset" }),
        });
      });
    }, ref);

    return () => context.revert();
  }, [variant]);

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      viewBox={doodle.viewBox}
      fill="none"
      className={cn("pointer-events-none", className)}
    >
      {doodle.paths.map((d, index) => (
        <path
          key={index}
          d={d}
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
