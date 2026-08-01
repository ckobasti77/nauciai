import { redirect } from "next/navigation";

import { ChatModerationConsole } from "@/components/app/chat/chat-moderation-console";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale, withLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Chat sigurnost", en: "Chat safety" });
}

export default async function ChatModerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ userId?: string }>;
}) {
  const [{ locale: localeParam }, query, profile] = await Promise.all([
    params,
    searchParams,
    getCurrentViewerProfile(),
  ]);
  const locale = normalizeLocale(localeParam);
  if (profile?.role !== "admin" && profile?.role !== "moderator") {
    redirect(withLocale(locale, "/app/messages"));
  }
  return (
    <ChatModerationConsole
      locale={locale}
      role={profile.role}
      initialUserId={profile.role === "admin" ? query.userId : undefined}
    />
  );
}
