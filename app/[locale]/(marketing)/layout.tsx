import type { ReactNode } from "react";

import { PublicHeader } from "@/components/marketing/public-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
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
  const viewerProfile = await getCurrentViewerProfile();

  return (
    <>
      <PublicHeader locale={locale} viewerProfile={viewerProfile} />
      {/* Navbar lebdi (fixed), pa strane bez full-bleed heroja rezervišu njegovu
          visinu; hero strane je ponište preko `data-over-light` (globals.css). */}
      <div className="public-shell bg-surface-a">{children}</div>
      <SiteFooter locale={locale} />
    </>
  );
}
