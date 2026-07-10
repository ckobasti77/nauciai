import { CommunityMentionsPage } from "@/components/app/community-v2/community-mentions";
import { normalizeLocale } from "@/lib/i18n";

export default async function MentionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CommunityMentionsPage locale={normalizeLocale(locale)} />;
}
