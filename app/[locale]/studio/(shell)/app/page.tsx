import type { Metadata } from "next";

import { StudioPage } from "@/components/app/studio-page";
import { Panel, SectionHeader } from "@/components/ui/primitives";
import { normalizeLocale, t, withLocale } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: t(normalizeLocale(locale), "Radni prostor", "Workspace") };
}

/**
 * Samostalni radni prostor Studija (studio-public F3): ISTA `StudioPage`
 * komponenta kao školski /app/studio, samo sa standalone putanjama - detalj na
 * /studio/app/m/<id>, krediti na /studio/krediti, prijava sa ?next= nazad.
 */
export default async function StandaloneStudioRoute({
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
          title="Studio"
          body={t(
            locale,
            "Opiši šta hoćeš, izaberi model i generiši. Svaka generacija se plaća kreditima.",
            "Describe what you want, pick a model and generate. Every generation is paid in credits.",
          )}
        />
        <Panel className="p-6">
          <p className="type-body type-measure font-bold text-muted">
            {t(
              locale,
              "Backend nije povezan na ovoj instalaciji, pa Studio ne može da generiše.",
              "The backend is not connected on this installation, so the Studio cannot generate.",
            )}
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <StudioPage
      locale={locale}
      basePath="/studio/app"
      creditsHref={withLocale(locale, "/studio/krediti")}
      signInHref={`${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(
        withLocale(locale, "/studio/app"),
      )}`}
    />
  );
}
