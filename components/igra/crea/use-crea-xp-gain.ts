"use client";

import { useEffect, useState } from "react";

import { useIgraProgress } from "@/components/igra/igra-progress-context";
import { CREA_XP_WINDOW_MS, creaXpRun, type CreaXpRun } from "@/lib/igra-crea-xp";

/**
 * Koliko je XP-a doneo rad na pozornici (K16): broj stiže samo ako je rad viđen u izradi i
 * XP iz ljuske porastao najviše 8 s posle kraja. Bez napretka (gost, nema provider-a) uvek
 * `null`. Logika je `creaXpRun`.
 */
export function useCreaXpGain(jobId: string | null, working: boolean): number | null {
  const xp = useIgraProgress().progress?.xp ?? null;
  const [run, setRun] = useState<CreaXpRun>(null);

  let next = run;
  if (jobId !== null && xp !== null) {
    next = creaXpRun(next, working ? { type: "start", jobId, xp } : { type: "finish", jobId, xp });
    next = creaXpRun(next, { type: "xp", xp });
  }
  if (next !== run) setRun(next);

  const open = run?.open ? run.jobId : null;
  useEffect(() => {
    if (open === null) return;
    const timer = window.setTimeout(() => setRun((current) => creaXpRun(current, { type: "close", jobId: open })), CREA_XP_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return run && run.jobId === jobId ? run.gain : null;
}
