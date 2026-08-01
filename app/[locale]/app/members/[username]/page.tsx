import { MemberProfile } from "@/components/app/member-profile";
import { isLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; username: string }> }): Promise<Metadata> {
  const { locale, username } = await params;
  return appPageMetadata(locale, { sr: `@${username}`, en: `@${username}` });
}

export default async function MemberProfilePage({ params }: { params: Promise<{ locale: string; username: string }> }) {
  const { locale, username } = await params;
  return <MemberProfile locale={isLocale(locale) ? locale : "sr"} username={decodeURIComponent(username)} />;
}
