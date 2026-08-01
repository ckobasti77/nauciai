import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { locales, normalizeLocale } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Scoped to the app segment so marketing metadata (which sets its own full titles) is unaffected.
export const metadata: Metadata = {
  title: { default: "Nauči AI", template: "%s · Nauči AI" },
};

export default async function StudentAppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  return <AppShell locale={locale}>{children}</AppShell>;
}
