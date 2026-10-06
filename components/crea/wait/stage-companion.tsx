"use client";

import { AnimatePresence, motion } from "motion/react";

import { CreaMascot } from "@/components/crea/mascot/crea-mascot";
import { LearnCard } from "@/components/crea/wait/learn-card";
import { cn } from "@/components/ui/primitives";
import type { CreaMascotMood } from "@/lib/crea-mascot";
import { tipAreaFor } from "@/lib/crea-tips";
import type { Locale } from "@/lib/i18n";
import type { CreaMotionParams } from "@/lib/motion-contract";

/**
 * Društvo ispod scene dok Crea radi (K25): maskota (U5) pored kartice „Dok čekaš, nauči"
 * (U6); kad rad stigne ili padne, maskota slavi ili tuguje, a oblačić kaže zašto. Dok
 * nema čekanja ni prelaza, ničega nema - inspiracija zauzima to mesto.
 */
export function StageCompanion({
  locale,
  mood,
  kind,
  seed,
  message,
  motion: motionParams,
}: {
  locale: Locale;
  mood: CreaMascotMood;
  kind: "image" | "video" | "audio";
  seed: string;
  /** Oblačić posle prelaza (prvi rad, greška…); `null` dok se radi. */
  message: string | null;
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
          <motion.p
            key="message"
            role="status"
            initial={motionParams.isReduced ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: motionParams.isReduced ? 0 : 0.28, ease: [0.34, 1.56, 0.64, 1] }}
            className={cn(
              "surface-card relative self-center border-2 border-ink bg-paper-strong px-4 py-3 font-display type-display-sm text-ink",
              mood === "tuzna" ? "shadow-[4px_4px_0_0_var(--shadow-hard-14)]" : "shadow-[4px_4px_0_0_var(--yellow)]",
            )}
          >
            {message}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
