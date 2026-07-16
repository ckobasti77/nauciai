import { MessagesShell } from "@/components/app/chat/messages-shell";
import { isLocale } from "@/lib/i18n";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ locale: string; conversationId: string }>;
}) {
  const { locale, conversationId } = await params;
  return <MessagesShell locale={isLocale(locale) ? locale : "sr"} selectedConversationId={conversationId} />;
}
