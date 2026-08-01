import { CommunityLeaderboardPage } from "@/components/app/community-v2/community-leaderboard";
import { normalizeLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Rang lista", en: "Leaderboard" });
}

export default async function LeaderboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CommunityLeaderboardPage locale={normalizeLocale(locale)} />;
}
