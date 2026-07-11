import { redirect } from "next/navigation";
import { normalizeLocale, withLocale } from "@/lib/i18n";

export default async function MentionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(withLocale(normalizeLocale(locale), "/app/community/notifications"));
}
