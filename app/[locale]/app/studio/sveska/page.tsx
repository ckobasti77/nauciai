import type { Metadata } from "next";

import { CreaNotebook } from "@/components/crea/game/crea-notebook";
import { appPageMetadata } from "@/lib/app-metadata";
import { normalizeLocale, withLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Sveska · Crea", en: "Notebook · Crea" });
}

/** Sveska Cree u školskom omotaču (K26) - ista komponenta kao `/crea/sveska`. */
export default async function NotebookRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return null;
  return <CreaNotebook locale={locale} notebookPath="/app/studio/sveska" appPath="/app/studio" signInHref={withLocale(locale, "/sign-in")} />;
}
