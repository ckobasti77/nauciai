import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreaInviteLanding } from "@/components/crea/community/crea-invite-landing";
import { isInviteCode } from "@/lib/crea-community";
import { CREA_PAIR_COPY } from "@/lib/crea-community-copy";
import { normalizeLocale } from "@/lib/i18n";

type Params = Promise<{ locale: string; code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  // Lični link - ne indeksira se.
  return { title: CREA_PAIR_COPY.title[normalizeLocale(locale)], robots: { index: false, follow: false } };
}

/** Poziv u kreativni par (K27, G10): `/crea/poziv/<kod>`. Radi i bez galerije. */
export default async function CreaInviteRoute({ params }: { params: Params }) {
  const { locale, code } = await params;
  if (!isInviteCode(code)) notFound();
  return (
    <div className="py-4">
      <CreaInviteLanding locale={normalizeLocale(locale)} code={code} />
    </div>
  );
}
