import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { CommunityModerationQueue } from "@/components/app/community-thread-moderation";
import { normalizeLocale, withLocale } from "@/lib/i18n";

export default async function CommunityModerationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await connection();

  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  if (!process.env.NEXT_PUBLIC_CONVEX_URL) notFound();

  const token = await convexAuthNextjsToken();
  if (!token) {
    redirect(withLocale(locale, `/sign-in?next=/${locale}/app/community/moderation`));
  }

  return <CommunityModerationQueue locale={locale} />;
}
