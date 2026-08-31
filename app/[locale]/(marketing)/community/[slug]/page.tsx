import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { PublicCommunityComments, type PublicComment } from "@/components/app/public-community-comments";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { BrandMark, Panel } from "@/components/ui/primitives";
import {
  extractPostIdFromSlug,
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
  const repliesMap: Record<string, PublicComment[]> = {};

  await Promise.all(
    comments.map(async (comment) => {
      if ((comment.directReplyCount ?? 0) > 0) {
        try {
          const result = await convex.query(convexQueries.listPublicRepliesPage, {
            postId,
            parentId: comment._id,
            paginationOpts: { numItems: 3, cursor: null },
          });
          repliesMap[comment._id] = (result.page ?? []) as PublicComment[];
        } catch {
          repliesMap[comment._id] = [];
        }
      }
    }),
  );

  return repliesMap;
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
  const { slug: slugParam } = await params;
  const postId = extractPostIdFromSlug(slugParam);
  const post = await loadPost(postId);
  if (!post) return { robots: { index: false, follow: false } };

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

  const [comments, replies] = await Promise.all([
    loadInitialComments(post._id),
    loadInitialComments(post._id).then((rootComments) => loadInitialReplies(post._id, rootComments)),
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
              className="inline-flex min-h-11 items-center rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {nextLocale.toUpperCase()}
            </Link>
          </div>
        </div>

        {/* Back navigation */}
        <div>
          <Link
            href={withLocale(locale, "/community")}
            className="inline-flex min-h-11 items-center text-sm font-black text-ink underline transition hover:text-blue-mid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            ← {ct.back}
          </Link>
        </div>

        {/* Thread article */}
        <Panel as="article" className="overflow-hidden">
          <header className="border-b border-line bg-paper/55 px-5 py-7 md:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-muted">
                {ct.kicker}
              </span>
              {courseTitle ? (
                <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs font-bold text-ink">
                  {courseTitle}
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 text-3xl font-black leading-tight text-ink md:text-5xl">
              {post.title}
            </h1>
            <p className="mt-4 text-sm font-bold text-muted">
              {post.authorUsername ? `@${post.authorUsername}` : post.authorName} · {formattedDate}
            </p>
          </header>

          <div className="max-w-none whitespace-pre-wrap px-5 py-7 text-base font-medium leading-8 text-ink md:px-8">
            {post.body}
          </div>

          <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 md:px-8">
            <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-black text-ink">
              {post.voteScore} {ct.netVotes}
            </span>
            <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-black text-ink">
              {post.commentsCount} {ct.comments}
            </span>
            <Link
              href={signInUrl}
              className="ml-auto inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-yellow px-4 py-2 text-xs font-black text-ink shadow-[3px_3px_0_var(--shadow-hard-14)] transition hover:bg-yellow-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {ct.signInToReply}
            </Link>
          </footer>
        </Panel>

        {/* Comments section */}
        <Panel id="comments" className="p-5 md:p-8">
          <PublicCommunityComments
            postId={post._id}
            locale={locale}
            initialComments={comments}
            initialReplies={replies}
            signInUrl={signInUrl}
          />
        </Panel>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd }}
      />
    </main>
  );
}
