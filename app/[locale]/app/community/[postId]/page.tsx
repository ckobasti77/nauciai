import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { normalizeLocale, withLocale } from "@/lib/i18n";
import { LiveCommunityThreadPage } from "@/components/app/community-thread-detail";

export default async function CommunityThreadPage({
  params,
}: {
  params: Promise<{ locale: string; postId: string }>;
}) {
  await connection();

  const { locale: localeParam, postId } = await params;
  const locale = normalizeLocale(localeParam);

  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    notFound();
  }

  const token = await convexAuthNextjsToken();
  if (!token) {
    redirect(withLocale(locale, `/sign-in?next=/${locale}/app/community/${postId}`));
  }

  return <LiveCommunityThreadPage locale={locale} postId={postId} />;
}
