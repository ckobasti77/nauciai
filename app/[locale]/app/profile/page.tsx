import { ProfilePage } from "@/components/app/profile-billing";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale } from "@/lib/i18n";

export default async function ProfileRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const profile = await getCurrentViewerProfile();
  return <ProfilePage locale={normalizeLocale(localeParam)} profile={profile} />;
}
