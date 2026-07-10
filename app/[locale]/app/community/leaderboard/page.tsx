import { CommunityLeaderboardPage } from "@/components/app/community-v2/community-leaderboard";
import { normalizeLocale } from "@/lib/i18n";

export default async function LeaderboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CommunityLeaderboardPage locale={normalizeLocale(locale)} />;
}
