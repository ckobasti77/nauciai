import type { ReactNode } from "react";

import { ContactRail } from "@/components/marketing/contact-rail";
import { PublicHeader } from "@/components/marketing/public-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { normalizeLocale } from "@/lib/i18n";
import { resolveSettings, type PlatformSettings, type PlatformSettingsInput } from "@/lib/platform-settings";

// Kontakti za levu traku (N5) - isti izvor kao cene na landingu (N1):
// razrešen preko `resolveSettings`, pa prazno polje znači da dugme ne postoji.
async function getContactSettings(): Promise<PlatformSettings> {
  const convex = getConvexHttpClient();
  if (!convex) return resolveSettings(null);
  try {
    const live = (await convex.query(convexQueries.getPlatformSettings, {})) as PlatformSettingsInput;
    return resolveSettings(live);
  } catch {
    return resolveSettings(null);
  }
}

export default async function MarketingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const [viewerProfile, settings] = await Promise.all([getCurrentViewerProfile(), getContactSettings()]);

  return (
    <>
      <PublicHeader locale={locale} viewerProfile={viewerProfile} />
      {/* Navbar lebdi (fixed), pa strane bez full-bleed heroja rezervišu njegovu
          visinu; hero strane je ponište preko `data-over-light` (globals.css). */}
      <div className="public-shell bg-surface-a">{children}</div>
      <SiteFooter locale={locale} />
      <ContactRail locale={locale} contact={settings.contact} socials={settings.socials} />
    </>
  );
}
