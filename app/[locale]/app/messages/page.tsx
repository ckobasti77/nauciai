import { MessagesHub } from "@/components/app/chat/messages-hub";
import { isLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Poruke", en: "Messages" });
}

export default async function MessagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MessagesHub locale={isLocale(locale) ? locale : "sr"} />;
}
