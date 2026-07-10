import { CommunityMyThreadsPage } from "@/components/app/community-v2/community-my-threads";
import { normalizeLocale } from "@/lib/i18n";

export default async function MyThreadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CommunityMyThreadsPage locale={normalizeLocale(locale)} />;
}
