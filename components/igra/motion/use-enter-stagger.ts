"use client";

import { useReducedMotion } from "motion/react";
import type { RefObject } from "react";

import { gsap, useGSAP } from "@/components/igra/motion/gsap";
import { IGRA_MOTION, shouldAnimate } from "@/lib/igra-motion";

const ENTERED = "data-igra-entered";

/**
 * Ulaz liste koja stigne POSLE ulaza strane (podaci iz Convex-a): stavke iz `selector`
 * ulaze jedna za drugom kad lista dođe u kadar. Ulaz strane ostaje na `data-motion`
 * atributima (`components/motion/page-motion.tsx`) - ovo nije drugi sistem za isto.
 *
 * `deps` kaže kada da ponovo pogleda listu (npr. `[rows.length]`). Stavka koja je jednom
 * ušla se ne animira ponovo, pa osvežen upit ne trese listu, a novi redovi ulaze sami.
 * Posle `max` stavki nema dodatnog kašnjenja. Uz smanjen pokret lista je odmah tu.
 */
export function useEnterStagger(
  ref: RefObject<HTMLElement | null>,
  { selector, deps, max = IGRA_MOTION.staggerMax }: { selector: string; deps: readonly unknown[]; max?: number },
) {
  const reduced = useReducedMotion() ?? false;

  useGSAP(
    (_context, contextSafe) => {
      const root = ref.current;
      if (!root || !contextSafe || !shouldAnimate({ reduced, hidden: document.hidden })) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((item) => !item.hasAttribute(ENTERED));
      const first = items[0];
      if (!first) return;

      gsap.set(items, { autoAlpha: 0, y: IGRA_MOTION.enterY });
      const play = contextSafe(() => {
        for (const item of items) item.setAttribute(ENTERED, "");
        gsap.to(items, {
          autoAlpha: 1,
          y: 0,
          duration: IGRA_MOTION.enter,
          ease: IGRA_MOTION.ease.out,
          stagger: (index: number) => Math.min(index, max) * IGRA_MOTION.stagger,
          clearProps: "transform,opacity,visibility",
        });
      });

      // Jedan posmatrač po listi, na prvoj novoj stavci (radi i kad je koren `display: contents`).
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        play();
      });
      observer.observe(first);
      return () => observer.disconnect();
    },
    { scope: ref, dependencies: [...deps, selector, max, reduced], revertOnUpdate: true },
  );
}
