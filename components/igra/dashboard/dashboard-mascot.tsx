"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { CreaMascot } from "@/components/crea/mascot/crea-mascot";
import { IGRA_THREE_MEDIA } from "@/lib/igra-three";
import type { Locale } from "@/lib/i18n";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(IGRA_THREE_MEDIA);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * 3D maskota na heroju kontrolne table (K08) - samo ukras i samo na računaru. Montira
 * postojeću maskotu (`CreaMascot`: isti GLB, lokalni Draco, pauza van kadra) tek kad važi
 * sve: širok ekran sa mišem, dozvoljen pokret, bez štednje podataka i posle prvog crtanja
 * (kad pregledač miruje). Inače ne crta ništa: Robi je već na sceni heroja. Ovaj fajl se
 * uvozi samo kroz `next/dynamic`, pa na telefonu nema ni zahteva za three.js.
 */
export function DashboardMascot({ locale, className }: { locale: Locale; className?: string }) {
  const reduced = useReducedMotion();
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(IGRA_THREE_MEDIA).matches, () => false);
  const allowed = wide && !reduced;
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    const start = () => setIdle(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(start, 1200);
    return () => window.clearTimeout(id);
  }, [allowed]);

  if (!allowed || !idle) return null;
  return <CreaMascot mood="miruje" locale={locale} allow3d className={className} />;
}
