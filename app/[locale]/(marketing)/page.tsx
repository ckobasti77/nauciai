import { MarketingPage } from "@/components/marketing/marketing-page";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { locales, normalizeLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const viewerProfile = await getCurrentViewerProfile();

  return <MarketingPage locale={locale} viewerProfile={viewerProfile} />;
}
