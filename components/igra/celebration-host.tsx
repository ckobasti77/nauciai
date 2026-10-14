"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { CelebrationCard } from "@/components/igra/celebration-card";
import { useModalFocus } from "@/components/ui/dialog";
import {
  celebrationAnnouncement,
  celebrationSeenKeys,
  celebrationView,
  createCelebrationQueue,
  planCelebrations,
  type IgraCelebration,
  type IgraCelebrationQueue,
  type IgraProgressFresh,
} from "@/lib/igra-celebrations";
import { IGRA_MOTION } from "@/lib/igra-motion";
import { playIgraSfx } from "@/lib/igra-sound";
import type { Locale } from "@/lib/i18n";

/** Red slavlja cele sesije (jedan po učitanoj aplikaciji): plafon važi i kad se domaćin premontira. */
const sessionQueue = createCelebrationQueue();

/** Dok je ovo na ekranu slavlje čeka: drugi modal, Crea pečat ili Crea niz (`data-igra-busy`). */
const BUSY_SELECTOR = '[aria-modal="true"], .crea-stamp-note, [data-igra-busy]';
/** Pauza pre otvaranja (ulaz strane, prethodno slavlje) i razmak između provera. */
const OPEN_DELAY_MS = 600;
const RETRY_MS = 500;
/** Kartica u uglu (smanjen pokret) ostaje koliko i Crea pečat. */
const CORNER_VISIBLE_MS = 6500;
/** Konfete lete PREKO preklopa (110) i dijaloga (120). */
const CONFETTI_Z_INDEX = 130;

function CelebrationDialog({ celebration, locale, onClose }: { celebration: IgraCelebration | null; locale: Locale; onClose: () => void }) {
  const labelId = useId();
  const titleId = useId();
  const dialogRef = useModalFocus(celebration !== null, onClose);
  const big = celebration ? celebrationView(celebration, locale).big : false;
  const key = celebration?.key ?? null;

  useEffect(() => {
    if (key === null) return;
    // Lenjo: `canvas-confetti` (i `lib/crea-reveal`) ne ulaze u početni JS ljuske.
    void import("@/components/crea/reveal/fire-confetti").then((mod) => mod.fireConfetti(dialogRef.current, big, CONFETTI_Z_INDEX)).catch(() => undefined);
  }, [key, big, dialogRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {celebration ? (
        <motion.div
          key={celebration.key}
          className="fixed inset-0 z-[110] grid place-items-center bg-scrim/45 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose();
          }}
        >
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${labelId} ${titleId}`} tabIndex={-1} className="w-full max-w-sm">
            <CelebrationCard celebration={celebration} locale={locale} variant="stage" onClose={onClose} labelId={labelId} titleId={titleId} />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Domaćin slavlja (K03, plan K01 §3.3): montira se jednom u ljusci. Prima sveže stavke
 * napretka (`igra:getMyProgress` → `fresh`), slaže ih u red i prikazuje JEDNO po jedno.
 * U trenutku prikaza javlja `onSeen(keys)` (ljuska zove `igra:markSeen`), pa se isto
 * slavlje ne ponavlja ni u drugom tabu.
 *
 * - Uz pokret: preklop sa karticom, konfete, zvuk (ako je uključen), fokus na „Nastavi";
 *   Esc i klik na podlogu zatvaraju, samo se gasi posle 2,5 s.
 * - Uz smanjen pokret: bez preklopa, konfeta i 3D-a - mirna kartica u uglu sa dugmetom.
 * - Uvek: rečenica za čitač ekrana kroz `aria-live`.
 * - Čeka dok je otvoren drugi modal, dok traje Crea pečat i dok je tab u pozadini.
 */
export function CelebrationHost({
  locale,
  fresh,
  onSeen,
  queue = sessionQueue,
}: {
  locale: Locale;
  /** `null`/`undefined` dok se napredak učitava ili za gosta. */
  fresh: IgraProgressFresh | null | undefined;
  onSeen: (keys: string[]) => void;
  /** Samo za izlog i testove; ljuska koristi red sesije. */
  queue?: IgraCelebrationQueue;
}) {
  const reduced = useReducedMotion() ?? false;
  const current = useSyncExternalStore(queue.subscribe, queue.current, () => null);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const shown = current && current.key === shownKey ? current : null;

  const onSeenRef = useRef(onSeen);
  useEffect(() => {
    onSeenRef.current = onSeen;
  }, [onSeen]);

  useEffect(() => {
    if (!fresh) return;
    for (const celebration of planCelebrations(fresh, fresh.ledgerEmpty).show) queue.enqueue(celebration);
  }, [fresh, queue]);

  useEffect(() => {
    if (!current || current.key === shownKey) return;
    let timer = window.setTimeout(function open() {
      if (document.hidden || document.querySelector(BUSY_SELECTOR)) {
        timer = window.setTimeout(open, RETRY_MS);
        return;
      }
      setShownKey(current.key);
      onSeenRef.current(celebrationSeenKeys(current));
      playIgraSfx(celebrationView(current, locale).sfx);
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [current, shownKey, locale]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => queue.dismiss(), reduced ? CORNER_VISIBLE_MS : IGRA_MOTION.celebrate * 1000);
    return () => window.clearTimeout(timer);
  }, [shown, reduced, queue]);

  const close = () => queue.dismiss();

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {shown && !reduced ? celebrationAnnouncement(shown, locale) : ""}
      </p>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 top-3 z-[110] flex justify-center sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto">
        {shown && reduced ? <CelebrationCard celebration={shown} locale={locale} variant="corner" onClose={close} /> : null}
      </div>
      <CelebrationDialog celebration={shown && !reduced ? shown : null} locale={locale} onClose={close} />
    </>
  );
}
