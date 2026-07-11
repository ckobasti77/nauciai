import type { MetadataRoute } from "next";

import { getConvexHttpClient, convexQueries } from "@/lib/convex-http";
import { withLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type SitemapPage = {
  page: Array<{ _id: string; language: "sr" | "en"; createdAt: number; updatedAt: number }>;
  isDone: boolean;
  continueCursor: string;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const convex = getConvexHttpClient();
  if (!convex) return [];

  const urls: MetadataRoute.Sitemap = [];
  let cursor: string | null = null;
  let isDone = false;
  let pages = 0;
  while (!isDone && pages < 100) {
    const result: SitemapPage = await convex.query(convexQueries.listPublishedThreadsForSitemap, {
      paginationOpts: { numItems: 500, cursor },
    });
    for (const thread of result.page ?? []) {
      const locale = (thread.language === "en" ? "en" : "sr") as Locale;
      urls.push({
        url: `${origin}${withLocale(locale, `/community/${thread._id}`)}`,
        lastModified: new Date(thread.updatedAt ?? thread.createdAt),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
    isDone = Boolean(result.isDone);
    cursor = result.continueCursor ?? null;
    pages += 1;
  }
  return urls;
}
