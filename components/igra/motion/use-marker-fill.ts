"use client";

import { useReducedMotion } from "motion/react";
import { useRef, type RefObject } from "react";

import { gsap, useGSAP } from "@/components/igra/motion/gsap";
import { IGRA_MOTION, shouldAnimate } from "@/lib/igra-motion";

/**
 * Marker se „razlije" kroz traku: `scaleX` elementa ispune (oslonac levo) ide do
 * `progress` (0..1) - prvi put od nule, posle od mesta gde je stao. Transform, ne širina,
 * pa nema preračuna layouta. Uz smanjen pokret ispuna odmah stoji na vrednosti.
 */
export function useMarkerFill(ref: RefObject<HTMLElement | null>, progress: number) {
  const reduced = useReducedMotion() ?? false;
  const started = useRef(false);
  const target = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;

  useGSAP(
    () => {
      const element = ref.current;
      if (!element) return;

      if (!shouldAnimate({ reduced, hidden: document.hidden })) {
        gsap.set(element, { scaleX: target, transformOrigin: "left center", overwrite: true });
        started.current = true;
        return;
      }

      if (!started.current) gsap.set(element, { scaleX: 0, transformOrigin: "left center" });
      started.current = true;
      gsap.to(element, { scaleX: target, duration: IGRA_MOTION.fill, ease: IGRA_MOTION.ease.fill, overwrite: true });
      // Bez `revertOnUpdate` (vidi `useCountUp`): čišćenje radi tek pri skidanju komponente.
      return () => {
        started.current = false;
      };
    },
    { scope: ref, dependencies: [target, reduced] },
  );
}
