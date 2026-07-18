import { MessagesHub } from "@/components/app/chat/messages-hub";
import { isLocale } from "@/lib/i18n";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ locale: string; conversationId: string }>;
}) {
  const { locale, conversationId } = await params;
  return <MessagesHub locale={isLocale(locale) ? locale : "sr"} selectedConversationId={conversationId} />;
}
