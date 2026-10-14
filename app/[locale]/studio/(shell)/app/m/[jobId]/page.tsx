import type { Metadata } from "next";

import { IgraState } from "@/components/igra/igra-state";
import { StudioPage } from "@/components/app/studio-page";
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
      <IgraState variant="offline" locale={locale} title={t(locale, "Baza nije povezana", "Database not connected")} body={t(
            locale,
            "Backend nije povezan na ovoj instalaciji, pa Crea ne može da prikaže generaciju.",
            "The backend is not connected on this installation, so Crea cannot show the generation.",
          )} />
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
