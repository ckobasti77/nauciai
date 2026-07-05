import { CommunityBoard } from "@/components/app/community-board";
import { normalizeLocale } from "@/lib/i18n";

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  return <CommunityBoard locale={normalizeLocale(localeParam)} />;
}
