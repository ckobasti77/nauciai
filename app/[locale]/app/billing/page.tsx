import { BillingPage } from "@/components/app/profile-billing";
import { normalizeLocale } from "@/lib/i18n";

export default async function BillingRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  return <BillingPage locale={normalizeLocale(localeParam)} />;
}
