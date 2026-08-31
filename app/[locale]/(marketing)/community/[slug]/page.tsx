/* eslint-disable @next/next/no-img-element */
import { ArrowLeft, ArrowUp, MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { initialsFromName } from "@/components/app/community-identity";
import { PublicCommunityComments, type PublicComment } from "@/components/app/public-community-comments";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { BrandMark, LinkButton, Panel } from "@/components/ui/primitives";
import {
  extractPostIdFromSlug,
  formatRelativeDate,
  getCommunityPostPath,
  getCommunityPostSlug,
} from "@/lib/community-slug";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import {
  communityThreadContent,
  dictionary,
  normalizeLocale,
  otherLocale,
  withLocale,
  type Locale,
} from "@/lib/i18n";

type PublicPost = {
  _id: string;
  title: string;
  body: string;
  language: "sr" | "en";
  createdAt: number;
  updatedAt: number;
  lastActivityAt?: number;
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

const loadPost = cache(async (postId: string) => {
  const convex = getConvexHttpClient();
  if (!convex) return null;
  try {
    return (await convex.query(convexQueries.getPublicPostForSeo, { postId })) as PublicPost | null;
  } catch {
    return null;
  }
});

const loadInitialComments = cache(async (postId: string) => {
  const convex = getConvexHttpClient();
  if (!convex) return [];
  try {
    const result = await convex.query(convexQueries.listPublicRootCommentsPage, {
      postId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    return (result.page ?? []) as PublicComment[];
  } catch {
    return [];
  }
});

const loadInitialReplies = cache(async (postId: string, comments: PublicComment[]) => {
  const convex = getConvexHttpClient();
  if (!convex) return {};
  const parentIds = comments
    .filter((c) => (c.directReplyCount ?? 0) > 0)
    .map((c) => c._id);

  if (parentIds.length === 0) return {};

  try {
    const result = await convex.query(convexQueries.listPublicInitialRepliesForPost, {
      postId,
      parentIds,
      limitPerParent: 3,
    });
    return (result ?? {}) as Record<string, PublicComment[]>;
  } catch {
    return {};
  }
});

const loadOtherRecentPosts = cache(async (currentPostId: string): Promise<PublicPost[]> => {
  const convex = getConvexHttpClient();
  if (!convex) return [];
  try {
    const result = await convex.query(convexQueries.listPublicPostsPage, {
      paginationOpts: { numItems: 6, cursor: null },
    });
    const items = (result.page ?? []) as PublicPost[];
    return items.filter((p) => p._id !== currentPostId).slice(0, 5);
  } catch {
    return [];
  }
});

function canonicalThreadUrl(locale: Locale, post: { title: string; _id: string }) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const slug = getCommunityPostSlug(post.title, post._id);
  return `${origin}${withLocale(locale, `/community/${slug}`)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: localeParam, slug: slugParam } = await params;
  const locale = normalizeLocale(localeParam);
  const postId = extractPostIdFromSlug(slugParam);
  const post = await loadPost(postId);
  if (!post) return { robots: { index: false, follow: false } };

  const canonicalSlug = getCommunityPostSlug(post.title, post._id);
  if (slugParam !== canonicalSlug) {
    permanentRedirect(withLocale(locale, `/community/${canonicalSlug}`));
  }

  // Task 3: Canonical ALWAYS points to the locale matching post.language
  const canonicalLocale: Locale = post.language === "en" ? "en" : "sr";
  const canonicalUrl = canonicalThreadUrl(canonicalLocale, post);
  const description = post.body.replace(/\s+/g, " ").trim().slice(0, 160);

  // Task 4: Thin content (0 comments and < 200 chars body) gets noindex, follow
  const isThinContent = post.commentsCount === 0 && post.body.trim().length < 200;

  return {
    title: `${post.title} | Nauči AI`,
    description,
    alternates: { canonical: canonicalUrl },
    robots: isThinContent
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      type: "article",
      url: canonicalUrl,
      title: post.title,
      description,
      publishedTime: new Date(post.createdAt).toISOString(),
      modifiedTime: new Date(post.lastActivityAt ?? post.updatedAt ?? post.createdAt).toISOString(),
      authors: [post.authorName],
      ...(post.imageUrl ? { images: [{ url: post.imageUrl }] } : {}),
    },
    twitter: { card: post.imageUrl ? "summary_large_image" : "summary" },
  };
}

export default async function PublicCommunityThreadPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: localeParam, slug: slugParam } = await params;
  const locale = normalizeLocale(localeParam);
  const postId = extractPostIdFromSlug(slugParam);
  const post = await loadPost(postId);

  if (!post) {
    notFound();
  }

  const canonicalSlug = getCommunityPostSlug(post.title, post._id);

  // If the accessed URL is not the canonical slug (e.g. raw ID or outdated title), 301 redirect permanently
  if (slugParam !== canonicalSlug) {
    permanentRedirect(withLocale(locale, `/community/${canonicalSlug}`));
  }

  const comments = await loadInitialComments(post._id);
  const [replies, otherPosts] = await Promise.all([
    loadInitialReplies(post._id, comments),
    loadOtherRecentPosts(post._id),
  ]);

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const currentPath = withLocale(locale, `/community/${canonicalSlug}`);
  const currentUrl = `${origin}${currentPath}`;
  const signInUrl = `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(currentUrl)}`;
  const nextLocale = otherLocale(locale);
  const ct = communityThreadContent[locale];
  const courseTitle = locale === "sr" ? post.courseTitleSr : post.courseTitleEn;

  const formattedDate = new Date(post.createdAt).toLocaleDateString(
    locale === "sr" ? "sr-Latn-RS" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );

  const canonicalLocale: Locale = post.language === "en" ? "en" : "sr";
  const canonicalUrl = canonicalThreadUrl(canonicalLocale, post);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: post.title,
    text: post.body,
    datePublished: new Date(post.createdAt).toISOString(),
    dateModified: new Date(post.lastActivityAt ?? post.updatedAt ?? post.createdAt).toISOString(),
    url: canonicalUrl,
    author: {
      "@type": "Person",
      name: post.authorName,
    },
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: post.upvoteCount ?? 0,
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/CommentAction",
        userInteractionCount: post.commentsCount ?? 0,
      },
    ],
    comment: comments.map((comment) => ({
      "@type": "Comment",
      text: comment.body,
      author: {
        "@type": "Person",
        name: comment.authorName,
      },
      dateCreated: new Date(comment.createdAt).toISOString(),
      upvoteCount: comment.upvoteCount ?? 0,
    })),
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
              href={withLocale(nextLocale, `/community/${canonicalSlug}`)}
              className="inline-flex min-h-11 items-center rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black transition hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {nextLocale.toUpperCase()}
            </Link>
          </div>
        </div>

        {/* Breadcrumb & Back navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-black text-muted">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2">
            <Link
              href={withLocale(locale)}
              className="rounded-[4px] underline transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {ct.breadcrumbHome}
            </Link>
            <span aria-hidden="true">/</span>
            <Link
              href={withLocale(locale, "/community")}
              className="rounded-[4px] underline transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {ct.breadcrumbCommunity}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="line-clamp-1 max-w-[160px] text-ink sm:max-w-xs">{post.title}</span>
          </nav>

          <Link
            href={withLocale(locale, "/community")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2 text-xs font-black text-ink underline transition hover:text-blue-mid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>{ct.back}</span>
          </Link>
        </div>

        {/* Thread article */}
        <Panel as="article" className="overflow-hidden">
          <header className="border-b-2 border-line bg-paper/60 p-6 sm:p-8 md:p-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-muted">
                {ct.kicker}
              </span>
              {courseTitle ? (
                <span className="rounded-full border-2 border-ink bg-paper-strong px-2.5 py-0.5 text-xs font-black text-ink">
                  {courseTitle}
                </span>
              ) : null}
            </div>

            <h1 className="mt-3 text-balance font-display text-2xl font-black leading-tight text-ink sm:text-3xl md:text-4xl lg:text-5xl">
              {post.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-bold text-muted sm:text-sm">
              <div className="flex items-center gap-2">
                {post.authorAvatarUrl ? (
                  <img
                    src={post.authorAvatarUrl}
                    alt=""
                    width={24}
                    height={24}
                    className="size-6 rounded-full border border-ink bg-paper-strong object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-6 items-center justify-center rounded-full border border-ink bg-yellow text-xs font-black text-ink"
                  >
                    {initialsFromName(post.authorName)}
                  </span>
                )}
                <span className="font-black text-ink">
                  {post.authorUsername ? `@${post.authorUsername}` : post.authorName}
                </span>
              </div>
              <span>·</span>
              <time dateTime={new Date(post.createdAt).toISOString()}>{formattedDate}</time>
            </div>
          </header>

          <div className="max-w-prose whitespace-pre-wrap p-6 text-base font-medium leading-relaxed text-ink sm:p-8 md:text-lg md:leading-8">
            {post.body}
          </div>

          <footer className="flex flex-wrap items-center gap-3 border-t-2 border-line bg-paper/40 p-4 sm:p-6">
            <span className="rounded-full border-2 border-ink bg-paper-strong px-3.5 py-1 text-xs font-black tabular-nums text-ink shadow-[2px_2px_0_0_var(--shadow-hard-10)]">
              {post.voteScore} {ct.netVotes}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3.5 py-1 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard-10)]">
              <MessageSquare className="size-3.5" aria-hidden="true" />
              <span className="tabular-nums">{post.commentsCount} {ct.comments}</span>
            </span>
            <LinkButton
              href={signInUrl}
              tone="yellow"
              className="ml-auto min-h-11"
            >
              {ct.signInToReply}
            </LinkButton>
          </footer>
        </Panel>

        {/* Comments section */}
        <Panel id="comments" className="p-6 sm:p-8 md:p-10">
          <PublicCommunityComments
            postId={post._id}
            locale={locale}
            initialComments={comments}
            initialReplies={replies}
            signInUrl={signInUrl}
          />
        </Panel>

        {/* More community questions (Internal linking) */}
        {otherPosts.length > 0 ? (
          <section aria-labelledby="more-questions-heading" className="space-y-4 pt-6">
            <div className="space-y-1">
              <h2 id="more-questions-heading" className="text-balance font-display text-2xl font-black text-ink sm:text-3xl">
                {ct.moreThreadsTitle}
              </h2>
              <p className="text-sm font-medium text-muted">
                {ct.moreThreadsSubtitle}
              </p>
            </div>

            <div className="space-y-3">
              {otherPosts.map((otherPost) => {
                const otherPath = getCommunityPostPath(locale, otherPost);
                const otherCourseTitle = locale === "sr" ? otherPost.courseTitleSr : otherPost.courseTitleEn;
                const otherRelativeDate = formatRelativeDate(otherPost.createdAt, locale);

                return (
                  <Panel
                    key={otherPost._id}
                    as="article"
                    className="group flex items-stretch gap-4 p-4 transition-[transform,translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[8px_8px_0_0_var(--shadow-hard-18)] active:translate-y-0 sm:p-5"
                  >
                    <div className="flex shrink-0 flex-col items-center justify-center rounded-[12px] border-2 border-ink bg-paper px-2.5 py-2 text-ink shadow-[2px_2px_0_0_var(--shadow-hard-10)] sm:min-w-12">
                      <ArrowUp className="size-4 stroke-[3] text-ink" aria-hidden="true" />
                      <span className="text-xs font-black tabular-nums">{otherPost.voteScore}</span>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                      <h3 className="text-balance text-base font-black text-ink transition hover:underline sm:text-lg">
                        <Link
                          href={otherPath}
                          className="rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                          {otherPost.title}
                        </Link>
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-black text-muted">
                        <span className="font-bold text-ink">
                          {otherPost.authorUsername ? `@${otherPost.authorUsername}` : otherPost.authorName}
                        </span>
                        <span>·</span>
                        <time dateTime={new Date(otherPost.createdAt).toISOString()}>{otherRelativeDate}</time>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 font-bold text-ink">
                          <MessageSquare className="size-3.5" aria-hidden="true" />
                          <span className="tabular-nums">{otherPost.commentsCount}</span>
                        </span>
                        {otherCourseTitle ? (
                          <span className="rounded-full border-2 border-ink bg-paper-strong px-2 py-0.5 text-[11px] font-black text-ink">
                            {otherCourseTitle}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd }}
      />
    </main>
  );
}
