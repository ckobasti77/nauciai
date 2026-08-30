import type { Metadata } from "next";
import type { ReactNode } from "react";

import { StudioShell } from "@/components/studio/studio-shell";
import { locales, normalizeLocale } from "@/lib/i18n";

/**
 * Samostalni Studio (studio-public F3): /studio/app (radni prostor),
 * /studio/app/m/[jobId] (detalj medija) i /studio/krediti (kupovina).
 * JAVNI LANDING /studio živi ODVOJENO, u app/[locale]/(marketing)/studio/ -
 * grupa (shell) ne učestvuje u URL-u, pa se ove dve polovine ne sudaraju.
 * Školski /app/studio ostaje netaknut (iste komponente, drugi omotač).
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: { default: "Studio", template: "%s · Studio · Nauči AI" },
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
