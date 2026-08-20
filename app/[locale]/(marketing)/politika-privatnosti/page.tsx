import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { locales, normalizeLocale, type Locale } from "@/lib/i18n";
import { PRIVACY_POLICY } from "@/lib/legal-copy";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  return { title: PRIVACY_POLICY.title[locale], description: PRIVACY_POLICY.intro[locale] };
}

export default async function PrivacyPolicyRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam) as Locale;

  return <LegalPage locale={locale} document={PRIVACY_POLICY} />;
}
