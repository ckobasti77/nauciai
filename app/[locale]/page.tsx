import { MarketingPage } from "@/components/marketing/marketing-page";
import { locales, normalizeLocale } from "@/lib/i18n";

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

  return <MarketingPage locale={locale} />;
}
