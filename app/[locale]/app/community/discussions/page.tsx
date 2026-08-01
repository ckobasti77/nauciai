import { CommunityDiscussionsPage } from "@/components/app/community-v2/community-discussions";
import { normalizeLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Diskusije", en: "Discussions" });
}

export default async function DiscussionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CommunityDiscussionsPage locale={normalizeLocale(locale)} />;
}
