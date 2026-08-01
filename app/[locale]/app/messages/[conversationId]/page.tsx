import { MessagesHub } from "@/components/app/chat/messages-hub";
import { isLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; conversationId: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Razgovor", en: "Conversation" });
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ locale: string; conversationId: string }>;
}) {
  const { locale, conversationId } = await params;
  return <MessagesHub locale={isLocale(locale) ? locale : "sr"} selectedConversationId={conversationId} />;
}
