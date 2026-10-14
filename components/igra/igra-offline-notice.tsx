"use client";

import dynamic from "next/dynamic";

import { useOnline } from "@/components/igra/use-online";
import type { Locale } from "@/lib/i18n";

const IgraOfflineBar = dynamic(() => import("@/components/igra/igra-offline-bar").then((m) => m.IgraOfflineBar), { ssr: false });

/**
 * Tiha traka kad pregledač javi da nema veze (K23). Stoji na vrhu sadržaja, ne zaklanja
 * ništa i ne traži ništa: Convex sam nastavlja čim se veza vrati. Dok je veza tu, ne crta
 * ništa, a telo trake se učitava tek kad zatreba (ljuska je na svakoj ruti aplikacije).
 */
export function IgraOfflineNotice({ locale }: { locale: Locale }) {
  const online = useOnline();
  return online ? null : <IgraOfflineBar locale={locale} />;
}
