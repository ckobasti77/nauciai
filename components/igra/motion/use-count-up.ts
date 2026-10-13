"use client";

import { useReducedMotion } from "motion/react";
import { useRef, type RefObject } from "react";

import { gsap, useGSAP } from "@/components/igra/motion/gsap";
import { formatOdometer, IGRA_MOTION, odometerWidthCh, shouldAnimate } from "@/lib/igra-motion";
import type { Locale } from "@/lib/i18n";

/**
 * Odometar: broj u elementu se vrti do `value` (prvi put od `from`, posle toga od broja
 * koji je već na ekranu, pa i usred brojanja). Piše pravo u `textContent`, bez React
 * rendera po frejmu. Uz smanjen pokret, u pozadinskom tabu ili uz `enabled: false`
 * vrednost stoji odmah.
 *
 * Element treba da bude `inline-block tabular-nums` sa JEDNIM tekstualnim detetom
 * (`formatOdometer(value, locale)`); dok broji drži `min-width` u `ch`, pa ne gura susede.
 * Čitaču ekrana daj krajnju vrednost posebno (`sr-only`), a ovaj element sakrij
 * (`aria-hidden`) - cifre u pokretu nisu za čitanje.
 */
export function useCountUp(
  ref: RefObject<HTMLElement | null>,
  value: number,
  { locale, from = 0, enabled = true }: { locale: Locale; from?: number; enabled?: boolean },
) {
  const reduced = useReducedMotion() ?? false;
  const counter = useRef<{ value: number } | null>(null);

  useGSAP(
    () => {
      const element = ref.current;
      if (!element) return;
      const state = (counter.current ??= { value: from });
      const write = () => {
        const text = formatOdometer(state.value, locale);
        if (element.textContent !== text) element.textContent = text;
      };

      if (!enabled || !shouldAnimate({ reduced, hidden: document.hidden })) {
        gsap.killTweensOf(state);
        state.value = value;
        element.style.removeProperty("min-width");
        write();
        return;
      }

      element.style.minWidth = `${odometerWidthCh(state.value, value, locale)}ch`;
      write();
      gsap.to(state, { value, duration: IGRA_MOTION.count, ease: IGRA_MOTION.ease.count, overwrite: true, onUpdate: write });
      // Bez `revertOnUpdate`: nova vrednost nastavlja od broja na ekranu. Ovo čišćenje
      // radi tek kad se komponenta skine, pa sledeće montiranje broji ispočetka.
      return () => {
        counter.current = null;
      };
    },
    { scope: ref, dependencies: [value, locale, from, enabled, reduced] },
  );
}
