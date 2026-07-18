import { MessagesHub } from "@/components/app/chat/messages-hub";
import { isLocale } from "@/lib/i18n";

export default async function MessagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MessagesHub locale={isLocale(locale) ? locale : "sr"} />;
}
