import { redirect } from "next/navigation";

import { normalizeLocale, withLocale } from "@/lib/i18n";

// Admin je sada kontekst sa rutama; /app/admin je samo ulaz. 307 (Next default), a gate
// stoji na SVAKOJ leaf ruti (content/users/growth/analytics), ne na ovoj roditeljskoj.
export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  redirect(withLocale(locale, "/app/admin/content"));
}
