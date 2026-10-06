import type { Metadata } from "next";

import { CreaNotebook } from "@/components/crea/game/crea-notebook";
import { normalizeLocale, t, withLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: t(normalizeLocale(locale), "Sveska", "Notebook") };
}

/**
 * Sveska samostalne Cree (K26): album sličica, mapa veština sa mini-lekcijama i đačka
 * knjižica. Javno `/crea/sveska` (folder ostaje `studio`, K02).
 */
export default async function StandaloneNotebookRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return null;
  return (
    <CreaNotebook
      locale={locale}
      notebookPath="/studio/sveska"
      appPath="/studio/app"
      signInHref={`${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(withLocale(locale, "/studio/sveska"))}`}
    />
  );
}
