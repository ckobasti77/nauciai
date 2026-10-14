"use client";

import { X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { useCreaGame } from "@/components/crea/game/crea-game-context";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_STREAK_COPY } from "@/lib/crea-game-copy";
import type { StreakMilestone } from "@/lib/crea-streak";
import type { Locale } from "@/lib/i18n";
import { creaMotionFor } from "@/lib/motion-contract";

const BURST_VISIBLE_MS = 4200;
const MESSAGE: Record<StreakMilestone, keyof typeof CREA_STREAK_COPY> = { 7: "burst7", 30: "burst30", 100: "burst100" };

/** Jednom po cilju i danu, i u drugom tabu (localStorage). */
function seenKey(milestone: StreakMilestone, todayKey: string) {
  return `crea-niz-${milestone}-${todayKey}`;
}

/**
 * Proslava niza na 7, 30 i 100 dana (K26, G2): broj iskoči sa zracima kao u stripu, uz
 * rečenicu. Ne blokira rad (nije modal) i sama se skloni. Pod „manje pokreta" je mirna
 * kartica. Na 100 dana pucaju i konfete (isti lenji `canvas-confetti` kao prvi rad).
 */
export function CreaStreakBurst({ locale, milestone }: { locale: Locale; milestone: StreakMilestone | null }) {
  const { todayKey } = useCreaGame();
  const confetti = creaMotionFor(Boolean(useReducedMotion())).confetti;
  const [shown, setShown] = useState<StreakMilestone | null>(null);

  useEffect(() => {
    if (!milestone || !todayKey) return;
    const key = seenKey(milestone, todayKey);
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(key)) return;
        window.localStorage.setItem(key, "1");
      } catch {
        // Bez localStorage-a (privatni režim) proslava se pokaže, samo se ne pamti.
      }
      setShown(milestone);
      if (milestone === 100 && confetti) {
        void import("@/components/crea/reveal/fire-confetti").then(({ fireConfetti }) => fireConfetti(null, true)).catch(() => undefined);
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [milestone, todayKey, confetti]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), BURST_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
      <div data-igra-busy="" className="pointer-events-auto surface-card relative w-full max-w-xs border-2 border-ink bg-paper-strong px-6 pb-6 pt-8 text-center text-ink shadow-[8px_8px_0_0_var(--shadow-hard-16)]">
        <div className="relative mx-auto grid size-28 place-items-center">
          {/* Zraci kao znak Cree: tri crte iznad broja. */}
          <svg aria-hidden="true" viewBox="0 0 120 120" className="crea-streak-rays absolute inset-0 size-full text-yellow">
            {Array.from({ length: 10 }, (_, i) => {
              const angle = (i / 10) * Math.PI * 2;
              return (
                <line
                  key={i}
                  x1={60 + Math.cos(angle) * 40}
                  y1={60 + Math.sin(angle) * 40}
                  x2={60 + Math.cos(angle) * 56}
                  y2={60 + Math.sin(angle) * 56}
                  stroke="currentColor"
                  strokeWidth={7}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          <span className="crea-streak-pop relative grid size-20 place-items-center rounded-full border-2 border-ink bg-yellow text-4xl font-black tabular-nums text-ink">
            {shown}
          </span>
        </div>
        <p className="mt-4 type-h3">{fillCopy(CREA_STREAK_COPY.burstTitle[locale], { n: shown })}</p>
        <p className="mt-1 type-body-sm font-semibold text-muted">{CREA_STREAK_COPY[MESSAGE[shown]][locale]}</p>
        <button
          type="button"
          onClick={() => setShown(null)}
          aria-label={CREA_STREAK_COPY.close[locale]}
          className="absolute right-1 top-1 inline-grid size-11 place-items-center rounded-full transition hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
