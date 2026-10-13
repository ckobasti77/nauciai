"use client";

import { useReducedMotion } from "motion/react";
import { useRef, type RefObject } from "react";

import { gsap, useGSAP } from "@/components/igra/motion/gsap";
import { IGRA_MOTION, shouldAnimate } from "@/lib/igra-motion";

/**
 * Pečat „udari": element padne sa 1,6× i −8° na svoje mesto (uz `.igra-stamp` to je
 * −14° → −6°, jer klasa nosi svoj nagib kroz `rotate`). Svira samo kad se `playKey`
 * promeni; pri prvom prikazu samo uz `playOnMount`. Uz smanjen pokret pečat odmah stoji.
 */
export function useStampIn(
  ref: RefObject<HTMLElement | null>,
  { playKey, playOnMount = false, delay = 0 }: { playKey: string | number; playOnMount?: boolean; delay?: number },
) {
  const reduced = useReducedMotion() ?? false;
  const last = useRef<{ key: string | number; played: boolean } | null>(null);

  useGSAP(
    () => {
      const element = ref.current;
      if (!element) return;
      // Isti ključ drugi put (StrictMode u razvoju ponavlja efekat) = ponovi istu odluku.
      const previous = last.current;
      const play = previous === null ? playOnMount : previous.key === playKey ? previous.played : true;
      last.current = { key: playKey, played: play };
      if (!play || !shouldAnimate({ reduced, hidden: document.hidden })) return;

      gsap.from(element, { autoAlpha: 0, duration: 0.12, ease: "none", delay });
      gsap.from(element, {
        scale: 1.6,
        rotation: -8,
        duration: IGRA_MOTION.stamp,
        ease: IGRA_MOTION.ease.stamp,
        delay,
        clearProps: "transform,opacity,visibility",
      });
    },
    { scope: ref, dependencies: [playKey, reduced], revertOnUpdate: true },
  );
}
