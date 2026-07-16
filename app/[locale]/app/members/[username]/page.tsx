import { MemberProfile } from "@/components/app/member-profile";
import { isLocale } from "@/lib/i18n";

export default async function MemberProfilePage({ params }: { params: Promise<{ locale: string; username: string }> }) {
  const { locale, username } = await params;
  return <MemberProfile locale={isLocale(locale) ? locale : "sr"} username={decodeURIComponent(username)} />;
}
