import type { Metadata } from "next";
import type { ReactNode } from "react";

import { StudioShell } from "@/components/studio/studio-shell";
import { CREA_ICONS, CREA_OG_IMAGE } from "@/lib/crea-brand";
import { locales, normalizeLocale } from "@/lib/i18n";

/**
 * Samostalna Crea (bivši Studio, studio-public F3): javno /crea/app (radni
 * prostor), /crea/app/m/[jobId] (detalj medija) i /crea/krediti (kupovina);
 * folder ostaje `studio` (K02 - menja se samo javni slug).
 * JAVNI LANDING /studio živi ODVOJENO, u app/[locale]/(marketing)/studio/ -
 * grupa (shell) ne učestvuje u URL-u, pa se ove dve polovine ne sudaraju.
 * Školski /app/studio ostaje netaknut (iste komponente, drugi omotač).
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: { default: "Crea", template: "%s · Crea · Nauči AI" },
  icons: CREA_ICONS,
  openGraph: { images: [CREA_OG_IMAGE] },
};

export default async function StudioShellLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  return <StudioShell locale={locale}>{children}</StudioShell>;
}
