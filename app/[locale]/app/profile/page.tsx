import { ProfilePage } from "@/components/app/profile-billing";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Profil", en: "Profile" });
}

export default async function ProfileRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const profile = await getCurrentViewerProfile();
  return <ProfilePage locale={normalizeLocale(localeParam)} profile={profile} />;
}
