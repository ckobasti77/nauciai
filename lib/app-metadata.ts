import type { Metadata } from "next";

import { normalizeLocale, type LocalizedText } from "@/lib/i18n";

/**
 * Supplies the page-name half of the `%s · Nauči AI` title template declared in
 * app/[locale]/app/layout.tsx.
 */
export function appPageMetadata(localeParam: string, title: LocalizedText): Metadata {
  return { title: title[normalizeLocale(localeParam)] };
}
