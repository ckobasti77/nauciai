import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { CommunityPostEditor } from "@/components/app/community-post-editor";
import { normalizeLocale, withLocale } from "@/lib/i18n";

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
