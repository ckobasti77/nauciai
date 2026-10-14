"use client";

import { useCallback, useEffect, useState } from "react";

import { useIgraProgress } from "@/components/igra/igra-progress-context";
import { xpGain } from "@/lib/igra-lesson";

/** Koliko se čeka na porast XP-a pre nego što se odustane od broja. */
const WAIT_MS = 4000;

/**
 * „+N XP" posle završene lekcije (plan K07, ODLUKA 8): N se MERI, ne upisuje u kod.
 * `start()` pamti XP u trenutku klika; kad reaktivni napredak iz ljuske poraste, razlika je
 * `gain`. Bez porasta za 4 s (lekcija je već bila završena) ili bez napretka `gain` ostaje
 * `null`, pa se broj ne prikazuje.
 */
export function useXpGain() {
  const xp = useIgraProgress().progress?.xp ?? null;
  const [run, setRun] = useState<{ before: number; gain: number | null; open: boolean } | null>(null);

  // Pamti se prvi porast: XP koji stigne kasnije (drugi tab) ne menja prikazani broj.
  if (run?.open && xp !== null) {
    const gain = xpGain(run.before, xp);
    if (gain > 0) setRun({ before: run.before, gain, open: false });
  }

  const waiting = run?.open ?? false;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setRun((current) => (current?.open ? { ...current, open: false } : current)), WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  const start = useCallback(() => setRun(xp === null ? null : { before: xp, gain: null, open: true }), [xp]);

  return { xp, gain: run?.gain ?? null, start };
}
