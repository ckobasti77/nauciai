"use client";

import { useReducedMotion } from "motion/react";
import type { RefObject } from "react";

import { gsap, useGSAP } from "@/components/igra/motion/gsap";
import { IGRA_MOTION } from "@/lib/igra-motion";

/**
 * Nalepnica se „odlepi" pod mišem: nagib −3°, podizanje 3 px i jedan prelaz sjaja.
 * Samo uz precizan pokazivač (`pointer: fine`) i dozvoljen pokret; na dodir i uz smanjen
 * pokret ne radi ništa.
 *
 * `ref` je meta hovera (dugme, omotač) i ona miruje; pomera se dete `[data-igra-peel]`,
 * da nalepnica ne pobegne ispod pokazivača. Sjaj je opciono dete `[data-igra-shine]`
 * (podrazumevano `opacity-0`, u omotaču sa `overflow-hidden`).
 */
export function useStickerPeel(ref: RefObject<HTMLElement | null>) {
  const reduced = useReducedMotion() ?? false;

  useGSAP(
    (_context, contextSafe) => {
      const element = ref.current;
      if (!element || !contextSafe || reduced || !window.matchMedia("(pointer: fine)").matches) return;
      const sticker = element.querySelector<HTMLElement>("[data-igra-peel]");
      if (!sticker) return;
      const shine = element.querySelector<HTMLElement>("[data-igra-shine]");

      const tilt = gsap.quickTo(sticker, "rotation", { duration: IGRA_MOTION.micro, ease: IGRA_MOTION.ease.out });
      const lift = gsap.quickTo(sticker, "y", { duration: IGRA_MOTION.micro, ease: IGRA_MOTION.ease.out });
      const enter = contextSafe(() => {
        tilt(-3);
        lift(-3);
        if (shine) {
          gsap.fromTo(shine, { xPercent: -130, opacity: 1 }, { xPercent: 130, duration: 0.5, ease: "power2.out", overwrite: true, clearProps: "all" });
        }
      });
      const leave = () => {
        tilt(0);
        lift(0);
      };

      element.addEventListener("pointerenter", enter);
      element.addEventListener("pointerleave", leave);
      return () => {
        element.removeEventListener("pointerenter", enter);
        element.removeEventListener("pointerleave", leave);
      };
    },
    { scope: ref, dependencies: [reduced], revertOnUpdate: true },
  );
}
