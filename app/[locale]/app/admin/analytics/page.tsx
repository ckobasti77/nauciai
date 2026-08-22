import { redirect } from "next/navigation";

import { AdminAnalyticsPanel } from "@/components/app/admin-content-manager";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale, withLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Analitika", en: "Analytics" });
}

export default async function AdminAnalyticsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const profile = await getCurrentViewerProfile();
  if (profile?.role !== "admin") redirect(withLocale(locale, "/app"));
  return <AdminAnalyticsPanel />;
}
