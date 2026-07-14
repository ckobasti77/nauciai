import { redirect } from "next/navigation";

import { AdminContentManager } from "@/components/app/admin-content-manager";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale, withLocale } from "@/lib/i18n";

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const profile = await getCurrentViewerProfile();
  if (profile?.role !== "admin") redirect(withLocale(locale, "/app"));
  return <AdminContentManager locale={locale} />;
}
