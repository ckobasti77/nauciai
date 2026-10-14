"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";

import { CreaMascot } from "@/components/crea/mascot/crea-mascot";
import { LearnCard } from "@/components/crea/wait/learn-card";
import { IgraLik } from "@/components/igra/igra-lik";
import { useStampIn } from "@/components/igra/motion/use-stamp-in";
import { Odometer } from "@/components/igra/odometer";
import { cn } from "@/components/ui/primitives";
import type { CreaMascotMood } from "@/lib/crea-mascot";
import { tipAreaFor } from "@/lib/crea-tips";
import type { Locale } from "@/lib/i18n";
import type { CreaLik } from "@/lib/igra-crea";
import type { CreaMotionParams } from "@/lib/motion-contract";

/**
 * Društvo ispod scene dok Crea radi (K25): maskota (U5) pored kartice „Dok čekaš, nauči"
 * (U6); kad rad stigne ili padne, maskota slavi ili tuguje, a oblačić kaže zašto. Dok
 * nema čekanja ni prelaza, ničega nema - inspiracija zauzima to mesto.
 *
 * K16: prvi rad (i prvi rad svake vrste) u oblačiću dobija lika te vrste koji „udari" kao
 * pečat i žuti marker iza poruke; svaki rad koji je doneo XP dobija „+N XP" (odometar).
 */
export function StageCompanion({
  locale,
  mood,
  kind,
  seed,
  message,
  celebrate = null,
  xpGain = null,
  motion: motionParams,
}: {
  locale: Locale;
  mood: CreaMascotMood;
  kind: "image" | "video" | "audio";
  seed: string;
  /** Oblačić posle prelaza (prvi rad, greška…); `null` dok se radi. */
  message: string | null;
  /** Lik koji slavi prvi rad vrste (`creaMomentLik`); `null` za običan rad i neuspeh. */
  celebrate?: CreaLik | null;
  /** Izmeren porast XP-a posle rada (`useCreaXpGain`). */
  xpGain?: number | null;
  motion: CreaMotionParams;
}) {
  const working = mood === "razmislja";
  return (
    <motion.div
      initial={motionParams.isReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={motionParams.isReduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 8 }}
      transition={{ duration: motionParams.sheetFlip.duration || 0.12, ease: motionParams.sheetFlip.ease }}
      className="mx-auto mt-4 grid max-w-[640px] grid-cols-[84px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[124px_minmax(0,1fr)]"
    >
      <CreaMascot mood={mood} locale={locale} allow3d={motionParams.mascot3d} className="w-full" />
      <AnimatePresence mode="wait" initial={false}>
        {working ? (
          <motion.div key="learn" exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="min-w-0">
            <LearnCard locale={locale} area={tipAreaFor(kind)} seed={seed} motion={motionParams} />
          </motion.div>
        ) : message ? (
          <motion.div
            key="message"
            role="status"
            // Dok lik govori, domaćin slavlja (bedž „Prvi rad") čeka: nikad dva slavlja odjednom.
            data-igra-busy=""
            initial={motionParams.isReduced ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: motionParams.isReduced ? 0 : 0.28, ease: [0.34, 1.56, 0.64, 1] }}
            className={cn(
              "surface-card relative self-center border-2 border-ink bg-paper-strong px-4 py-3 font-display type-display-sm text-ink",
              mood === "tuzna" ? "shadow-[4px_4px_0_0_var(--shadow-hard-14)]" : "shadow-[4px_4px_0_0_var(--yellow)]",
              celebrate && "flex items-center gap-3",
            )}
          >
            {celebrate ? <CelebrateLik lik={celebrate} playKey={seed} /> : null}
            <span className="min-w-0">
              {celebrate ? <span className="igra-marker bg-yellow text-ink">{message}</span> : message}
              {xpGain && xpGain > 0 ? (
                <span className="mt-1 block font-sans type-body-sm font-black text-ink">
                  +<Odometer value={xpGain} locale={locale} size="sm" /> XP
                </span>
              ) : null}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/** Lik vrste rada „udari" kao pečat kad stigne prvi rad (uz smanjen pokret odmah stoji). */
function CelebrateLik({ lik, playKey }: { lik: CreaLik; playKey: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useStampIn(ref, { playKey, playOnMount: true });
  return (
    <span ref={ref} className="inline-block shrink-0">
      <IgraLik lik={lik} poza="slavi" size="md" decorative />
    </span>
  );
}
