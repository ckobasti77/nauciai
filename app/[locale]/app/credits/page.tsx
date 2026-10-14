import type { Metadata } from "next";

import { IgraState } from "@/components/igra/igra-state";
import { CreditsPage } from "@/components/app/credits-page";
import { AccountHead } from "@/components/igra/account/account-head";
import { appPageMetadata } from "@/lib/app-metadata";
import { normalizeLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Krediti", en: "Credits" });
}

export default async function CreditsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  // Balans, paketi i istorija su sve Convex pretplate; bez `NEXT_PUBLIC_CONVEX_URL`
  // nema ni provider-a, pa stranica kaže zašto umesto da padne pri renderu.
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="space-y-6">
        <AccountHead
          art="ikona.krediti"
          title={locale === "sr" ? "Krediti" : "Credits"}
          body={
            locale === "sr"
              ? "Krediti pokreću Creu. Kupuju se jednom i važe 12 meseci."
              : "Credits power Crea. Bought once, valid for 12 months."
          }
        />
        <IgraState variant="offline" locale={locale} title={locale === "sr" ? "Baza nije povezana" : "Database not connected"} body={locale === "sr"
              ? "Backend nije povezan na ovoj instalaciji, pa balans i paketi nisu dostupni."
              : "The backend is not connected on this installation, so the balance and packs are unavailable."} />
      </div>
    );
  }

  return <CreditsPage locale={locale} />;
}
