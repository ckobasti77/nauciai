import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getConvexHttpClient, convexQueries } from "@/lib/convex-http";
import { PublicCommunityComments } from "@/components/app/public-community-comments";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { BrandMark, Panel } from "@/components/ui/primitives";
import { communityThreadContent, dictionary, normalizeLocale, otherLocale, withLocale, type Locale } from "@/lib/i18n";

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
  courseTitleSr?: string;
  courseTitleEn?: string;
  imageUrl?: string | null;
};

type PublicComment = {
  _id: string;
  body: string;
  createdAt: number;
  authorName: string;
  authorUsername?: string;
  directReplyCount?: number;
  voteScore: number;
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
      paginationOpts: { numItems: 3, cursor: null },
    });
    return (result.page ?? []) as PublicComment[];
  } catch {
    return [];
  }
});

function publicUrl(locale: Locale, postId: string) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${origin}${withLocale(locale, `/community/${postId}`)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; postId: string }>;
}): Promise<Metadata> {
  const { locale: localeParam, postId } = await params;
  const locale = normalizeLocale(localeParam);
  const post = await loadPost(postId);
  if (!post) return {};
  const url = publicUrl(locale, postId);
  const description = post.body.replace(/\s+/g, " ").trim().slice(0, 160);
  return {
    title: `${post.title} | Nauči AI`,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description,
      publishedTime: new Date(post.createdAt).toISOString(),
      modifiedTime: new Date(post.updatedAt).toISOString(),
      authors: [post.authorName],
      ...(post.imageUrl ? { images: [{ url: post.imageUrl }] } : {}),
    },
    twitter: { card: post.imageUrl ? "summary_large_image" : "summary" },
  };
}

export default async function PublicCommunityThreadPage({
  params,
}: {
  params: Promise<{ locale: string; postId: string }>;
}) {
  const { locale: localeParam, postId } = await params;
  const locale = normalizeLocale(localeParam);
  const post = await loadPost(postId);
  if (!post) notFound();
  const comments = await loadInitialComments(postId);
  const url = publicUrl(locale, postId);
  const signInUrl = `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(url)}`;
  const nextLocale = otherLocale(locale);
  const ct = communityThreadContent[locale];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: post.title,
    text: post.body,
    datePublished: new Date(post.createdAt).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    url,
    author: {
      "@type": "Person",
      name: post.authorName,
      ...(post.authorUsername ? { identifier: post.authorUsername } : {}),
    },
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: post.upvoteCount },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: post.commentsCount },
    ],
  };

  return (
    <main className="sketch-grid min-h-screen bg-paper px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <BrandMark href={withLocale(locale)} label={dictionary[locale].appName} />
          <div className="flex items-center gap-2">
            <ThemeToggle locale={locale} />
            <Link
              href={withLocale(nextLocale, `/community/${postId}`)}
              className="inline-flex min-h-11 items-center rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {nextLocale.toUpperCase()}
            </Link>
          </div>
        </div>
        <Link
          href={withLocale(locale, "/app/community/discussions")}
          className="inline-flex min-h-11 items-center text-sm font-black text-ink underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {ct.back}
        </Link>
        <Panel as="article" className="overflow-hidden">
          <header className="border-b border-line bg-paper/55 px-5 py-7 md:px-8">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">
              {ct.kicker}
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-ink md:text-5xl">{post.title}</h1>
            <p className="mt-4 text-sm font-bold text-muted">
              {post.authorUsername ? `@${post.authorUsername}` : post.authorName} · {new Date(post.createdAt).toLocaleDateString(locale === "sr" ? "sr-Latn-RS" : "en-US")}
            </p>
          </header>
          <div className="max-w-none whitespace-pre-wrap px-5 py-7 text-base font-medium leading-8 text-ink md:px-8">{post.body}</div>
          <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 md:px-8">
            <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-black">
              {post.voteScore} {ct.netVotes}
            </span>
            <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-black">
              {post.commentsCount} {ct.comments}
            </span>
            <Link
              href={signInUrl}
              className="ml-auto inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-yellow px-4 py-2 text-xs font-black text-ink shadow-[3px_3px_0_var(--shadow-hard-14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {ct.signInToAct}
            </Link>
          </footer>
        </Panel>

        <Panel id="comments" className="p-5 md:p-8">
          <PublicCommunityComments postId={postId} locale={locale} initialComments={comments} />
        </Panel>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
