import type { Metadata } from "next";

import { McpServerPage, type McpCatalog } from "@/components/marketing/mcp-server-page";
import { getConvexHttpClient, convexQueries } from "@/lib/convex-http";
import { getConvexSiteUrl } from "@/lib/env";
import { locales, mcpPageContent, normalizeLocale } from "@/lib/i18n";
import { alternatesFor } from "@/lib/routes";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).locale);
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const t = mcpPageContent[locale];
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: alternatesFor(origin, "/mcp", locale),
    openGraph: { title: t.metaTitle, description: t.metaDescription, type: "website" },
  };
}

async function loadCatalog(): Promise<McpCatalog | null> {
  const convex = getConvexHttpClient();
  if (!convex) return null;

  return (await convex.query(convexQueries.mcpPublicCatalog, {}).catch(() => null)) as McpCatalog | null;
}

export default async function McpServerRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = normalizeLocale((await params).locale);
  const [catalog, siteUrl] = await Promise.all([loadCatalog(), Promise.resolve(getConvexSiteUrl())]);
  const mcpUrl = siteUrl ? `${siteUrl}/mcp` : null;

  return <McpServerPage locale={locale} mcpUrl={mcpUrl} catalog={catalog} />;
}
