"use client";

import { useMutation, useQuery } from "convex/react";
import { Moon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { api } from "@/convex/_generated/api";
import { nightArrivalsText } from "@/convex/creaNightCore";
import { CREA_NIGHT_COPY } from "@/lib/crea-copy";
import type { Locale } from "@/lib/i18n";
import { studioMotionTokens } from "@/lib/studio-motion";

/**
 * Jutarnje iznenađenje (Crea K08, G13): značka „Stiglo je N radova iz noćne ture"
 * iznad radionice, dok korisnik ne otvori radove. Isti podatak nosi i push
 * (`creaNight.announceIfRoundDone`); klik ga gasi na oba mesta.
 */
export function NightArrivals({ locale, onOpen }: { locale: Locale; onOpen: () => void }) {
  const arrivals = useQuery(api.creaNight.getMorningArrivals, {});
  const markSeen = useMutation(api.creaNight.markMorningArrivalsSeen);

  if (!arrivals || arrivals.count === 0) return null;

  return (
    <NightArrivalsBadge
      locale={locale}
      count={arrivals.count}
      onOpen={() => {
        void markSeen({});
        onOpen();
      }}
    />
  );
}

export function NightArrivalsBadge({ locale, count, onOpen }: { locale: Locale; count: number; onOpen: () => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      role="status"
      initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: studioMotionTokens.element.enterDuration, ease: studioMotionTokens.element.easeEnter }}
      className="mb-4"
    >
      <button
        type="button"
        onClick={onOpen}
        className="igra-press igra-shadow-ink inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 py-2 text-left text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Moon aria-hidden="true" className="size-4 shrink-0 fill-current" />
        <span>
          {nightArrivalsText(count, locale)} {CREA_NIGHT_COPY.arrivalsFrom[locale]}
        </span>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-ink/40" />
        <span className="shrink-0 underline underline-offset-4">{CREA_NIGHT_COPY.arrivalsOpen[locale]}</span>
      </button>
    </motion.div>
  );
}
