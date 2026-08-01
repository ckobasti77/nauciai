import { CommunityMembersPage } from "@/components/app/community-v2/community-members";
import { normalizeLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Članovi", en: "Members" });
}

export default async function MembersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CommunityMembersPage locale={normalizeLocale(locale)} />;
}
