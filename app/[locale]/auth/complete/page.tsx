import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";

import { getConvexHttpClient, convexQueries } from "@/lib/convex-http";
import { normalizeLocale, withLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function safeNext(locale: Locale, value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const fallback = withLocale(locale, "/app");
  if (!candidate || candidate.startsWith("//")) return fallback;
  return candidate === withLocale(locale) || candidate.startsWith(`${withLocale(locale)}/`) ? candidate : fallback;
}

export default async function AuthCompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ next?: string | string[] }>;
}) {
  const locale = normalizeLocale((await params).locale);
  const resolvedSearchParams = await searchParams;
  const next = safeNext(locale, resolvedSearchParams?.next);
  const token = await convexAuthNextjsToken();
  const convex = getConvexHttpClient(token);
  if (!convex || !token) {
    redirect(withLocale(locale, "/sign-in"));
  }

  const status = (await convex.query(convexQueries.getViewerProfileStatus, {}).catch(() => null)) as
    | { complete?: boolean }
    | null;
  if (!status?.complete) {
    redirect(`${withLocale(locale, "/app/profile")}?onboarding=1&returnTo=${encodeURIComponent(next)}`);
  }

  redirect(next);
}
