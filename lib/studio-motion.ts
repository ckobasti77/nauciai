/**
 * Izvor istine za pokret u Studiju (Motion Vocabulary).
 *
 * Imenovano prema NAMENI, ne prema brojevima:
 * - mikro: hover, pritisak dugmeta, prekidač, flash cene
 * - element: tajl ulazi, čip se menja, panel se otvara
 * - prelaz: mreža ↔ detalj, klasičan ↔ studijski sidebar
 * - spor: mirno disanje / puls tamnog bunara dok traje posao
 *
 * Pravilo: Izlaz je uvek brži od ulaza (odlazak ne traži pažnju, dolazak je traži).
 * Performanse: Animiraju se isključivo `transform` i `opacity`.
 */

export const STUDIO_EASE_OUT = [0.05, 0.7, 0.1, 1] as const; // MD3 Emphasized Decelerate
export const STUDIO_EASE_IN = [0.3, 0, 1, 1] as const; // MD3 Accelerate
export const STUDIO_EASE_IN_OUT = [0.2, 0, 0, 1] as const; // MD3 Standard / Paper Curve

export const studioMotionTokens = {
  mikro: {
    enterDuration: 0.12,
    exitDuration: 0.08,
    easeEnter: STUDIO_EASE_OUT,
    easeExit: STUDIO_EASE_IN,
  },
  element: {
    enterDuration: 0.22,
    exitDuration: 0.16,
    stagger: 0.025,
    easeEnter: STUDIO_EASE_OUT,
    easeExit: STUDIO_EASE_IN,
  },
  prelaz: {
    enterDuration: 0.26,
    exitDuration: 0.2,
    easeEnter: STUDIO_EASE_OUT,
    easeExit: STUDIO_EASE_IN,
  },
  spor: {
    cycleDuration: 2.0,
    ease: "easeInOut" as const,
  },
} as const;

export type StudioMotionTier = "mikro" | "element" | "prelaz" | "spor";

export type StudioTransitionParams = {
  duration: number;
  ease: readonly number[] | string;
};

export type StudioMotionParams = {
  isReduced: boolean;
  mikro: {
    enter: StudioTransitionParams;
    exit: StudioTransitionParams;
  };
  element: {
    enter: StudioTransitionParams;
    exit: StudioTransitionParams;
    stagger: number;
  };
  prelaz: {
    enter: StudioTransitionParams;
    exit: StudioTransitionParams;
    offset: number;
    scale: number;
  };
  spor: {
    duration: number;
    ease: string;
  };
};

/**
 * Čista funkcija koja na osnovu prefers-reduced-motion zastavice
 * vraća odgovarajuće parametre animacija.
 *
 * Kada je reduceMotion=true: trajanja su nula, pomeraji su nula, skale su 1.
 */
export function getStudioMotion(reduceMotion: boolean): StudioMotionParams {
  if (reduceMotion) {
    return {
      isReduced: true,
      mikro: {
        enter: { duration: 0, ease: "linear" },
        exit: { duration: 0, ease: "linear" },
      },
      element: {
        enter: { duration: 0, ease: "linear" },
        exit: { duration: 0, ease: "linear" },
        stagger: 0,
      },
      prelaz: {
        enter: { duration: 0, ease: "linear" },
        exit: { duration: 0, ease: "linear" },
        offset: 0,
        scale: 1,
      },
      spor: {
        duration: 0,
        ease: "linear",
      },
    };
  }

  return {
    isReduced: false,
    mikro: {
      enter: { duration: studioMotionTokens.mikro.enterDuration, ease: studioMotionTokens.mikro.easeEnter },
      exit: { duration: studioMotionTokens.mikro.exitDuration, ease: studioMotionTokens.mikro.easeExit },
    },
    element: {
      enter: { duration: studioMotionTokens.element.enterDuration, ease: studioMotionTokens.element.easeEnter },
      exit: { duration: studioMotionTokens.element.exitDuration, ease: studioMotionTokens.element.easeExit },
      stagger: studioMotionTokens.element.stagger,
    },
    prelaz: {
      enter: { duration: studioMotionTokens.prelaz.enterDuration, ease: studioMotionTokens.prelaz.easeEnter },
      exit: { duration: studioMotionTokens.prelaz.exitDuration, ease: studioMotionTokens.prelaz.easeExit },
      offset: 24,
      scale: 0.985,
    },
    spor: {
      duration: studioMotionTokens.spor.cycleDuration,
      ease: studioMotionTokens.spor.ease,
    },
  };
}

/**
 * Pomoćna čista funkcija za formatiranje proteklog vremena čekanja posla u tamnom bunaru.
 */
export function formatElapsedTime(createdAt: number, now: number): string {
  const elapsedMs = Math.max(0, now - createdAt);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
