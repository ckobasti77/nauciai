import type { Metadata } from "next";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { locales, normalizeLocale, publicMeta, withLocale } from "@/lib/i18n";
import {
  resolveSettings,
  type PlatformSettingsInput,
  type PlatformPricing,
} from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

// Broj Studio kredita uz Premium plan za „#pricing" — čita se iz istog javnog
// upita kao Studio landing. Ako plan „premium" nije definisan (ili Convex nije
// dostupan), vraća `null` i kartica prikazuje tekst bez broja.
async function getPremiumCredits(): Promise<number | null> {
  const convex = getConvexHttpClient();
  if (!convex) return null;
  try {
    const packs = (await convex.query(convexQueries.listPacks, { kind: "plan" })) as Array<{
      planTier?: string;
      credits?: number;
    }>;
    const premium = packs.find((pack) => pack.planTier === "premium");
    return premium?.credits ?? null;
  } catch {
    return null;
  }
}

// Cene za „#pricing" — od N1 ih drži admin u `platformSettings`, a
// `lib/pricing.ts` je samo rezerva kad reda nema, kad je polje prazno ili kad
// Convex nije dostupan. `resolveSettings` spaja to dvoje na jednom mestu.
async function getPricing(): Promise<PlatformPricing> {
  const convex = getConvexHttpClient();
  if (!convex) return resolveSettings(null).pricing;
  try {
    const live = (await convex.query(convexQueries.getPlatformSettings, {})) as PlatformSettingsInput;
    return resolveSettings(live).pricing;
  } catch {
    return resolveSettings(null).pricing;
  }
}

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
  const [viewerProfile, premiumCredits, pricing] = await Promise.all([
    getCurrentViewerProfile(),
    getPremiumCredits(),
    getPricing(),
  ]);

  return (
    <MarketingPage
      locale={locale}
      viewerProfile={viewerProfile}
      premiumCredits={premiumCredits}
      pricing={pricing}
    />
  );
}
