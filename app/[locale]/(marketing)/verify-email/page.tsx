import { EmailVerificationPage } from "@/components/app/email-verification-page";
import { locales, normalizeLocale, type Locale } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function VerifyEmailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const locale = normalizeLocale(localeParam) as Locale;
  const rawToken = resolvedSearchParams.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  return <EmailVerificationPage locale={locale} token={token} />;
}
