import type { Metadata } from "next";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { locales, normalizeLocale, publicMeta, withLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).locale);
  const title = publicMeta.home.title[locale];
  const description = publicMeta.home.description[locale];
  return {
    title,
    description,
    alternates: { canonical: withLocale(locale) },
    openGraph: { title, description, type: "website", url: withLocale(locale) },
  };
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
