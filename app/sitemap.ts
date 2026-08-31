import type { MetadataRoute } from "next";

import { courses } from "@/lib/content";
import { getCommunityPostPath } from "@/lib/community-slug";
import { getConvexHttpClient, convexQueries } from "@/lib/convex-http";
import { withLocale, type Locale } from "@/lib/i18n";
import { PRIVACY_POLICY_PATH, STUDIO_TERMS_PATH } from "@/lib/studio-messages";

export const dynamic = "force-dynamic";

type SitemapPostRef = {
  _id: string;
  title: string;
  language: "sr" | "en";
  lastActivityAt: number;
};

type SitemapPage = {
  page: SitemapPostRef[];
  isDone: boolean;
  continueCursor: string;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // Statične javne stranice idu i BEZ Convex-a: sve indeksibilne javne rute
  // (početna, oba kursa, Studio landing, javna zajednica, obe pravne strane) u obe locale
  // varijante ostaju u mapi i kad backend env fali. Auth-utility rute
  // (sign-in / reset-password / verify-email) su namerno izostavljene — one su
  // noindex i ne pripadaju sitemap-u.
  const staticPaths: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 1 },
    { path: "/studio", priority: 0.8 },
    { path: "/community", priority: 0.8 },
    ...courses.map((course) => ({ path: `/courses/${course.slug}`, priority: 0.9 })),
    { path: PRIVACY_POLICY_PATH, priority: 0.3 },
    { path: STUDIO_TERMS_PATH, priority: 0.3 },
  ];
  const urls: MetadataRoute.Sitemap = (["sr", "en"] as const).flatMap((locale) =>
    staticPaths.map(({ path, priority }) => ({
      url: `${origin}${withLocale(locale, path)}`,
      changeFrequency: "weekly" as const,
      priority,
    })),
  );

  const convex = getConvexHttpClient();
  if (!convex) return urls;
  try {
    let cursor: string | null = null;
    let isDone = false;
    let pages = 0;
    while (!isDone && pages < 10) {
      const result: SitemapPage = await convex.query(convexQueries.listPublicPostRefsForSitemap, {
        paginationOpts: { numItems: 500, cursor },
      });
      for (const thread of result.page ?? []) {
        const locale = (thread.language === "en" ? "en" : "sr") as Locale;
        urls.push({
          url: `${origin}${getCommunityPostPath(locale, thread)}`,
          lastModified: new Date(thread.lastActivityAt),
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
      isDone = Boolean(result.isDone);
      cursor = result.continueCursor ?? null;
      pages += 1;
    }
  } catch {
    // Return static URLs if backend query fails
    return urls;
  }
  return urls;
}
