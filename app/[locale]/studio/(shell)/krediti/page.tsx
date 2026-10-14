import type { Metadata } from "next";

import { IgraState } from "@/components/igra/igra-state";
import { CreditsPage } from "@/components/app/credits-page";
import { SectionHeader } from "@/components/ui/primitives";
import { normalizeLocale, t } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: t(normalizeLocale(locale), "Krediti", "Credits") };
}

/**
 * Kupovina kredita u samostalnom shell-u (studio-public F4): ista `CreditsPage`
 * komponenta kao školski /app/credits, u studio varijanti - checkout se vraća
 * OVDE (returnContext kroz server-side allowlistu), balans skoči live preko
 * Convex pretplate čim webhook upiše lot.
 */
export default async function StandaloneCreditsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="space-y-6">
        <SectionHeader
          variant="app"
          underline
          title={t(locale, "Krediti", "Credits")}
          body={t(
            locale,
            "Kredit je bod kojim se plaća svaka generacija u Crei.",
            "A credit is a point that pays for every generation in Crea.",
          )}
        />
        <IgraState variant="offline" locale={locale} title={t(locale, "Baza nije povezana", "Database not connected")} body={t(
              locale,
              "Backend nije povezan na ovoj instalaciji, pa krediti nisu dostupni.",
              "The backend is not connected on this installation, so credits are unavailable.",
            )} />
      </div>
    );
  }

  return <CreditsPage locale={locale} variant="studio" />;
}
