import { CommunityMentionsPage } from "@/components/app/community-v2/community-mentions";
import { normalizeLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Obaveštenja", en: "Notifications" });
}

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CommunityMentionsPage locale={normalizeLocale(locale)} />;
}
