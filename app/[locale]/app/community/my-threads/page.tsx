import { CommunityMyThreadsPage } from "@/components/app/community-v2/community-my-threads";
import { normalizeLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Moji tredovi", en: "My threads" });
}

export default async function MyThreadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CommunityMyThreadsPage locale={normalizeLocale(locale)} />;
}
