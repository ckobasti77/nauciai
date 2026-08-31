/* eslint-disable @next/next/no-img-element */
import { ArrowUp, ChevronLeft, ChevronRight, MessageSquare, PlusCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { initialsFromName } from "@/components/app/community-identity";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { MarkerHighlight } from "@/components/marketing/marker-highlight";
import { BrandMark, LinkButton, Panel, SketchIcon } from "@/components/ui/primitives";
import { formatRelativeDate, getCommunityPostPath } from "@/lib/community-slug";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
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

  const [{ posts, isDone, page: actualPage }, viewerProfile] = await Promise.all([
    loadPublicPosts(requestedPage),
    getCurrentViewerProfile(),
  ]);

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const currentPath = withLocale(
    locale,
    actualPage > 1 ? `/community?page=${actualPage}` : "/community",
  );
  const currentUrl = `${origin}${currentPath}`;
  const nextLocale = otherLocale(locale);
  const t = communityListingContent[locale];
  const createThreadUrl = viewerProfile
    ? withLocale(locale, "/app/community/new")
    : `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(withLocale(locale, "/app/community/new"))}`;

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

        {/* Breadcrumb navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-black text-muted">
          <Link
            href={withLocale(locale)}
            className="rounded-[4px] underline transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {t.breadcrumbHome}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{t.breadcrumbCommunity}</span>
        </nav>

        {/* Hero title panel */}
        <Panel className="overflow-hidden p-6 sm:p-8 md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-muted">
                {t.kicker}
              </p>
              <h1 className="font-display text-3xl font-black leading-tight text-ink sm:text-4xl md:text-5xl">
                {t.heroTitleLead}
                <MarkerHighlight>{t.heroTitleHighlight}</MarkerHighlight>
              </h1>
              <p className="max-w-2xl text-sm font-medium leading-relaxed text-muted sm:text-base">
                {t.subtitle}
              </p>
            </div>
            <div className="shrink-0">
              <LinkButton
                href={createThreadUrl}
                tone="yellow"
              >
                <PlusCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>{t.askQuestion}</span>
              </LinkButton>
            </div>
          </div>
        </Panel>

        {/* Threads list */}
        {posts.length === 0 ? (
          <Panel className="flex flex-col items-center justify-center p-8 text-center sm:p-12">
            <SketchIcon className="size-14 text-ink">
              <MessageSquare className="size-7" aria-hidden="true" />
            </SketchIcon>
            <h2 className="mt-4 text-xl font-black text-ink">{t.noPosts}</h2>
            <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-muted">
              {t.emptyStateSubtext}
            </p>
            <div className="mt-6">
              <LinkButton href={createThreadUrl} tone="yellow">
                <PlusCircle className="size-4" aria-hidden="true" />
                <span>{t.askQuestion}</span>
              </LinkButton>
            </div>
          </Panel>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const threadPath = getCommunityPostPath(locale, post);
              const courseTitle = locale === "sr" ? post.courseTitleSr : post.courseTitleEn;
              const relativeDate = formatRelativeDate(post.createdAt, locale);

              return (
                <Panel
                  key={post._id}
                  as="article"
                  className="group flex items-stretch gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[8px_8px_0_0_var(--shadow-hard-18)] sm:gap-5 sm:p-6"
                >
                  {/* Left vote badge */}
                  <div className="flex shrink-0 flex-col items-center justify-start rounded-[12px] border-2 border-ink bg-paper px-2.5 py-3 text-ink shadow-[2px_2px_0_0_var(--shadow-hard-10)] sm:min-w-14">
                    <ArrowUp className="size-4 sm:size-5 stroke-[3] text-ink" aria-hidden="true" />
                    <span className="mt-1 text-xs font-black sm:text-sm">{post.voteScore}</span>
                  </div>

                  {/* Right content */}
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                    <div className="space-y-1.5">
                      <h2 className="text-lg font-black leading-snug text-ink transition hover:underline sm:text-xl md:text-2xl">
                        <Link
                          href={threadPath}
                          className="rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                          {post.title}
                        </Link>
                      </h2>
                      <p className="line-clamp-2 text-sm font-medium leading-relaxed text-muted">
                        {post.body}
                      </p>
                    </div>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 text-xs font-black text-muted">
                      {/* Author */}
                      <div className="flex items-center gap-1.5">
                        {post.authorAvatarUrl ? (
                          <img
                            src={post.authorAvatarUrl}
                            alt=""
                            width={20}
                            height={20}
                            className="size-5 rounded-full border border-ink object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="flex size-5 items-center justify-center rounded-full border border-ink bg-yellow text-[10px] font-black text-ink"
                          >
                            {initialsFromName(post.authorName)}
                          </span>
                        )}
                        <span className="font-black text-ink">
                          {post.authorUsername ? `@${post.authorUsername}` : post.authorName}
                        </span>
                      </div>

                      <span>·</span>

                      {/* Relative date */}
                      <time dateTime={new Date(post.createdAt).toISOString()} className="font-bold">
                        {relativeDate}
                      </time>

                      <span>·</span>

                      {/* Comments count */}
                      <span className="inline-flex items-center gap-1 font-bold text-ink">
                        <MessageSquare className="size-3.5" aria-hidden="true" />
                        <span>{post.commentsCount}</span>
                        <span className="font-bold text-muted">{t.comments}</span>
                      </span>

                      {/* Course pill if exists */}
                      {courseTitle ? (
                        <span className="rounded-full border-2 border-ink bg-paper-strong px-2.5 py-0.5 text-xs font-black text-ink">
                          {courseTitle}
                        </span>
                      ) : null}

                      {/* Open discussion link */}
                      <Link
                        href={threadPath}
                        className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 text-xs font-black text-ink underline transition hover:text-blue-mid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        {t.openDiscussion}
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
            className="flex items-center justify-between gap-4 pt-6"
          >
            {prevPageUrl ? (
              <LinkButton
                href={prevPageUrl}
                tone="paper"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                {t.prevPage}
              </LinkButton>
            ) : (
              <div />
            )}

            <span className="text-xs font-black text-muted">
              {t.page} {actualPage}
            </span>

            {nextPageUrl ? (
              <LinkButton
                href={nextPageUrl}
                tone="paper"
              >
                {t.nextPage}
                <ChevronRight className="size-4" aria-hidden="true" />
              </LinkButton>
            ) : (
              <div />
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
