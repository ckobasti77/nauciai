"use client";

import { usePathname } from "next/navigation";

import { IgraState } from "@/components/igra/igra-state";
import { normalizeLocale } from "@/lib/i18n";

/**
 * 404 unutar aplikacije (K23): ostaje u ljusci (sidebar, napredak) umesto javne 404
 * strane. `not-found.tsx` ne dobija `params`, pa se jezik čita iz putanje, isto kao
 * u `[locale]/not-found.tsx` (koji se ne dira).
 */
export default function AppNotFound() {
  const locale = normalizeLocale(usePathname()?.split("/")[1]);
  return <IgraState page variant="404" locale={locale} />;
}
