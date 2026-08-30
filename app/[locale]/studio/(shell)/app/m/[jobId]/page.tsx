import type { Metadata } from "next";

import { StudioPage } from "@/components/app/studio-page";
import { Panel } from "@/components/ui/primitives";
import { normalizeLocale, t, withLocale } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: t(normalizeLocale(locale), "Pregled generacije", "Generation detail") };
}

/**
 * Detalj medija u samostalnom shell-u - ogledalo školskog
 * /app/studio/m/[jobId], samo sa standalone `basePath`-om.
 */
export default async function StandaloneStudioDetailRoute({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const { locale: localeParam, jobId } = await params;
  const locale = normalizeLocale(localeParam);

  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <Panel className="p-6">
        <p className="type-body type-measure font-bold text-muted">
          {t(
            locale,
            "Backend nije povezan na ovoj instalaciji, pa Studio ne može da prikaže generaciju.",
            "The backend is not connected on this installation, so the Studio cannot show the generation.",
          )}
        </p>
      </Panel>
    );
  }

  return (
    <StudioPage
      locale={locale}
      initialJobId={jobId}
      basePath="/studio/app"
      creditsHref={withLocale(locale, "/studio/krediti")}
      signInHref={`${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(
        withLocale(locale, "/studio/app"),
      )}`}
    />
  );
}
