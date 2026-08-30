import type { Metadata } from "next";

import { CreditsPage } from "@/components/app/credits-page";
import { Panel, SectionHeader } from "@/components/ui/primitives";
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
            "Kredit je bod kojim se plaća svaka generacija u Studiju.",
            "A credit is a point that pays for every generation in the Studio.",
          )}
        />
        <Panel className="p-6">
          <p className="type-body type-measure font-bold text-muted">
            {t(
              locale,
              "Backend nije povezan na ovoj instalaciji, pa krediti nisu dostupni.",
              "The backend is not connected on this installation, so credits are unavailable.",
            )}
          </p>
        </Panel>
      </div>
    );
  }

  return <CreditsPage locale={locale} variant="studio" />;
}
