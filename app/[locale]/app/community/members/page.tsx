import { CommunityMembersPage } from "@/components/app/community-v2/community-members";
import { normalizeLocale } from "@/lib/i18n";

export default async function MembersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CommunityMembersPage locale={normalizeLocale(locale)} />;
}
