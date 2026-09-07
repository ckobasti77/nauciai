import type { Metadata } from "next";

import { buildPricingMetadata, PricingPage } from "@/components/marketing/pricing-page";
import { normalizeLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return buildPricingMetadata(normalizeLocale((await params).locale));
}

/**
 * Engleska ruta strane pretplate; srpska je `/pretplata`, ista komponenta. `/sr/pricing`
 * preusmerava `redirects()` u `next.config.ts` (vidi komentar tamo).
 */
export default async function PricingRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return <PricingPage locale={normalizeLocale((await params).locale)} />;
}
