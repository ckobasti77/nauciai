import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { LiveCommunityThreadEditorPage } from "@/components/app/community-thread-detail";
import { normalizeLocale, withLocale } from "@/lib/i18n";

export default async function CommunityThreadEditPage({
  params,
}: {
  params: Promise<{ locale: string; postId: string }>;
}) {
  await connection();

  const { locale: localeParam, postId } = await params;
  const locale = normalizeLocale(localeParam);

  if (!process.env.NEXT_PUBLIC_CONVEX_URL) notFound();

  const token = await convexAuthNextjsToken();
  if (!token) {
    redirect(withLocale(locale, `/sign-in?next=/${locale}/app/community/${postId}/edit`));
  }

  return <LiveCommunityThreadEditorPage locale={locale} postId={postId} />;
}
