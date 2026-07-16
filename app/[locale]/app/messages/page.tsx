import { MessagesShell } from "@/components/app/chat/messages-shell";
import { isLocale } from "@/lib/i18n";

export default async function MessagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MessagesShell locale={isLocale(locale) ? locale : "sr"} />;
}
