import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { locales, normalizeLocale } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

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
