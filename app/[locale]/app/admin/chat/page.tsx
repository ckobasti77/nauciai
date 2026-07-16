import { redirect } from "next/navigation";

import { ChatModerationConsole } from "@/components/app/chat/chat-moderation-console";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { normalizeLocale, withLocale } from "@/lib/i18n";

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
