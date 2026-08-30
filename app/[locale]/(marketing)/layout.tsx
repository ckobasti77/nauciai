import type { ReactNode } from "react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { normalizeLocale } from "@/lib/i18n";

export default async function MarketingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  return (
    <>
      {children}
      <SiteFooter locale={locale} />
    </>
  );
}
