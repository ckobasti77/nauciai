"use client";

import { gsap } from "gsap";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/components/ui/primitives";

/**
 * Marker-highlight preko ključne fraze u herou. `bg-yellow` čini frazu žutim ostrvom
 * svetle palete (globals.css), pa `text-ink` uvek razreši u tamnoplavo mastilo — čitljivo
 * i u svetloj i u tamnoj temi (7,66:1), isti princip kao žuto dugme. `inline-block` je
 * namerno: fraza ostaje jedan blok (ne lomi se preko redova) i nosi transform koji se
 * iscrtava na load.
 *
 * Faza 3: potez se iscrta (scaleX 0→1, transform-origin left) tek POSLE LCP-a — kratak
 * `delay` pušta naslov da se oboji pre nego što marker krene. Uz `prefers-reduced-motion`
 * se ne dira (ostaje pun). Animira se samo `transform`, bez layout shift-a.
 */
export function MarkerHighlight({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const context = gsap.context(() => {
      gsap.set(el, { transformOrigin: "left center" });
      gsap.fromTo(
        el,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.42,
          ease: "power2.out",
          delay: 0.45,
          clearProps: "transform",
        },
      );
    }, ref);

    return () => context.revert();
  }, []);

  return (
    <span
      ref={ref}
      data-marker-highlight
      className={cn(
        "relative inline-block rounded-[8px] bg-yellow px-[0.14em] text-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}
