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
 *
 * `variant`:
 *   · "load" (podrazumevano, hero): iscrta se na mount posle LCP-a (kratak delay).
 *   · "view" (naslovi sekcija, v2): iscrta se kad naslov uđe u vidno polje
 *     (IntersectionObserver, threshold 0.4, JEDNOM). Ista GSAP animacija.
 */
export function MarkerHighlight({
  children,
  className,
  variant = "load",
}: {
  children: ReactNode;
  className?: string;
  variant?: "load" | "view";
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let observer: IntersectionObserver | undefined;
    const context = gsap.context(() => {
      gsap.set(el, { transformOrigin: "left center" });
      const draw = (delay: number) =>
        gsap.fromTo(
          el,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.42, ease: "power2.out", delay, clearProps: "transform" },
        );

      if (variant === "view") {
        // Dok ne uđe u kadar stoji „neiscrtan" (scaleX 0), pa nema bljeska punog markera.
        gsap.set(el, { scaleX: 0 });
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                draw(0);
                observer?.disconnect();
              }
            }
          },
          { threshold: 0.4 },
        );
        observer.observe(el);
      } else {
        draw(0.45);
      }
    }, ref);

    return () => {
      observer?.disconnect();
      context.revert();
    };
  }, [variant]);

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
