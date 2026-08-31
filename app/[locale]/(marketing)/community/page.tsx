import { ChevronLeft, ChevronRight, MessageSquare, PlusCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { BrandMark, Panel } from "@/components/ui/primitives";
import { getCommunityPostPath } from "@/lib/community-slug";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import {
  communityListingContent,
  dictionary,
  normalizeLocale,
  otherLocale,
  withLocale,
} from "@/lib/i18n";

type PublicPost = {
  _id: string;
  title: string;
  body: string;
  language: "sr" | "en";
  createdAt: number;
  updatedAt: number;
  authorName: string;
  authorUsername?: string;
  authorAvatarUrl?: string;
  commentsCount: number;
  upvoteCount: number;
  downvoteCount: number;
  voteScore: number;
  courseSlug?: string;
  courseTitleSr?: string;
  courseTitleEn?: string;
  imageUrl?: string | null;
};

type PaginatedPostsResult = {
  page: PublicPost[];
  isDone: boolean;
  continueCursor: string;
};

const PAGE_SIZE = 15;
const MAX_PAGE_LIMIT = 50;

async function loadPublicPosts(targetPage: number): Promise<{
  posts: PublicPost[];
  isDone: boolean;
  page: number;
}> {
  const convex = getConvexHttpClient();
  if (!convex) {
    return { posts: [], isDone: true, page: 1 };
  }

  const safePage = Math.max(1, Math.min(targetPage, MAX_PAGE_LIMIT));
  let cursor: string | null = null;
  let lastResult: PaginatedPostsResult = { page: [], isDone: true, continueCursor: "" };

  try {
    for (let p = 1; p <= safePage; p++) {
      const result: PaginatedPostsResult = await convex.query(
        convexQueries.listPublicPostsPage,
        { paginationOpts: { numItems: PAGE_SIZE, cursor } },
      );
      lastResult = result;
      if (result.isDone || !result.continueCursor) {
        return {
          posts: result.page ?? [],
          isDone: true,
          page: p,
        };
      }
      cursor = result.continueCursor;
    }

    return {
      posts: lastResult.page ?? [],
      isDone: Boolean(lastResult.isDone),
      page: safePage,
    };
  } catch {
    return { posts: [], isDone: true, page: 1 };
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const { page: pageParam } = await searchParams;
  const locale = normalizeLocale(localeParam);
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const t = communityListingContent[locale];

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const pageSuffix = page > 1 ? `/community?page=${page}` : "/community";
  const canonicalPath = withLocale(locale, pageSuffix);
  const canonicalUrl = `${origin}${canonicalPath}`;
  const srUrl = `${origin}${withLocale("sr", pageSuffix)}`;
  const enUrl = `${origin}${withLocale("en", pageSuffix)}`;

  const title = page > 1 ? `${t.metaTitle} — ${t.page} ${page}` : t.metaTitle;

  return {
    title,
    description: t.metaDescription,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        sr: srUrl,
        en: enUrl,
        "x-default": srUrl,
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      title,
      description: t.metaDescription,
    },
    twitter: { card: "summary" },
  };
}

export default async function PublicCommunityListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale: localeParam } = await params;
  const { page: pageParam } = await searchParams;
  const locale = normalizeLocale(localeParam);
  const requestedPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const { posts, isDone, page: actualPage } = await loadPublicPosts(requestedPage);

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const currentPath = withLocale(
    locale,
    actualPage > 1 ? `/community?page=${actualPage}` : "/community",
  );
  const currentUrl = `${origin}${currentPath}`;
  const nextLocale = otherLocale(locale);
  const t = communityListingContent[locale];
  const createThreadSignInUrl = `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(withLocale(locale, "/app/community/new"))}`;

  const prevPageUrl =
    actualPage > 1
      ? withLocale(locale, actualPage === 2 ? "/community" : `/community?page=${actualPage - 1}`)
      : null;

  const nextPageUrl = !isDone
    ? withLocale(locale, `/community?page=${actualPage + 1}`)
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t.title,
    description: t.subtitle,
    url: currentUrl,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: posts.map((post, index) => ({
        "@type": "ListItem",
        position: (actualPage - 1) * PAGE_SIZE + index + 1,
        url: `${origin}${getCommunityPostPath(locale, post)}`,
        name: post.title,
      })),
    },
  };

  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <main className="sketch-grid min-h-screen bg-paper px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-4">
          <BrandMark href={withLocale(locale)} label={dictionary[locale].appName} />
          <div className="flex items-center gap-2">
            <ThemeToggle locale={locale} />
            <Link
              href={withLocale(
                nextLocale,
                actualPage > 1 ? `/community?page=${actualPage}` : "/community",
              )}
              className="inline-flex min-h-11 items-center rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {nextLocale.toUpperCase()}
            </Link>
          </div>
        </div>

        {/* Hero title panel */}
        <Panel className="overflow-hidden p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">
                {t.kicker}
              </p>
              <h1 className="text-3xl font-black leading-tight text-ink md:text-4xl">
                {t.title}
              </h1>
              <p className="max-w-2xl text-sm font-medium text-muted md:text-base">
                {t.subtitle}
              </p>
            </div>
            <div className="shrink-0">
              <Link
                href={createThreadSignInUrl}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 py-2.5 text-sm font-black text-ink shadow-[3px_3px_0_var(--shadow-hard-14)] transition hover:bg-yellow-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <PlusCircle className="size-4" aria-hidden="true" />
                {t.askQuestion}
              </Link>
            </div>
          </div>
        </Panel>

        {/* Threads list */}
        {posts.length === 0 ? (
          <Panel className="p-8 text-center text-sm font-bold text-muted">
            {t.noPosts}
          </Panel>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const threadPath = getCommunityPostPath(locale, post);
              const courseTitle = locale === "sr" ? post.courseTitleSr : post.courseTitleEn;
              const formattedDate = new Date(post.createdAt).toLocaleDateString(
                locale === "sr" ? "sr-Latn-RS" : "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              );

              return (
                <Panel
                  key={post._id}
                  as="article"
                  className="p-5 transition hover:bg-paper-strong md:p-6"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
                      <span className="font-black text-ink">
                        {post.authorUsername ? `@${post.authorUsername}` : post.authorName}
                      </span>
                      <span>·</span>
                      <time dateTime={new Date(post.createdAt).toISOString()}>{formattedDate}</time>
                      {courseTitle ? (
                        <>
                          <span>·</span>
                          <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs font-bold text-ink">
                            {courseTitle}
                          </span>
                        </>
                      ) : null}
                    </div>

                    <h2 className="text-xl font-black text-ink transition hover:underline md:text-2xl">
                      <Link href={threadPath} className="focus-visible:outline-none">
                        {post.title}
                      </Link>
                    </h2>

                    <p className="line-clamp-2 text-sm font-medium leading-relaxed text-muted">
                      {post.body}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-black text-muted">
                      <span className="rounded-full border border-line bg-paper px-3 py-1 text-ink">
                        {post.voteScore} {t.netVotes}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-ink">
                        <MessageSquare className="size-3.5" aria-hidden="true" />
                        {post.commentsCount} {t.comments}
                      </span>
                      <Link
                        href={threadPath}
                        className="ml-auto inline-flex items-center gap-1 text-xs font-black text-ink underline transition hover:text-blue-mid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        {locale === "sr" ? "Otvori diskusiju →" : "View discussion →"}
                      </Link>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}

        {/* Crawl-friendly pagination with real HTML links */}
        {(prevPageUrl || nextPageUrl) && (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-4 pt-4"
          >
            {prevPageUrl ? (
              <Link
                href={prevPageUrl}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-4 py-2 text-xs font-black text-ink shadow-[2px_2px_0_var(--shadow-hard-10)] transition hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                {t.prevPage}
              </Link>
            ) : (
              <span />
            )}

            <span className="text-xs font-black text-muted">
              {t.page} {actualPage}
            </span>

            {nextPageUrl ? (
              <Link
                href={nextPageUrl}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-4 py-2 text-xs font-black text-ink shadow-[2px_2px_0_var(--shadow-hard-10)] transition hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {t.nextPage}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd }}
      />
    </main>
  );
}
