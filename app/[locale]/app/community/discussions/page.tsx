import { CommunityDiscussionsPage } from "@/components/app/community-v2/community-discussions";
import { normalizeLocale } from "@/lib/i18n";

export default async function DiscussionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CommunityDiscussionsPage locale={normalizeLocale(locale)} />;
}
