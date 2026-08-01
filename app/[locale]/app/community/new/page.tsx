import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { CommunityPostEditor } from "@/components/app/community-post-editor";
import { normalizeLocale, withLocale } from "@/lib/i18n";
import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/app-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Novi tred", en: "New thread" });
}

export default async function NewThreadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await connection();

  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const token = await convexAuthNextjsToken();
  if (!token) {
    redirect(withLocale(locale, `/sign-in?next=/${locale}/app/community/new`));
  }

  return <CommunityPostEditor locale={locale} mode="create" />;
}
