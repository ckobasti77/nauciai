"use client";

import { usePaginatedQuery } from "convex/react";
import { ChevronRight, MessageSquare, LogIn } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { communityThreadContent, withLocale, type Locale } from "@/lib/i18n";
import { Spinner } from "@/components/ui/spinner";

export type PublicComment = {
  _id: string;
  body: string;
  createdAt: number;
  authorName: string;
  authorUsername?: string;
  authorAvatarUrl?: string;
  directReplyCount?: number;
  voteScore: number;
  upvoteCount?: number;
  downvoteCount?: number;
  reactionsCount?: number;
};

export function PublicCommunityComments({
  postId,
  locale,
  initialComments,
  initialReplies = {},
  signInUrl,
}: {
  postId: string;
  locale: Locale;
  initialComments: PublicComment[];
  initialReplies?: Record<string, PublicComment[]>;
  signInUrl?: string;
}) {
  const t = communityThreadContent[locale];
  const query = usePaginatedQuery(
    api.community.listPublicRootCommentsPage,
    { postId: postId as Id<"communityPosts"> },
    { initialNumItems: 20 },
  );

  const comments = query.results.length ? (query.results as PublicComment[]) : initialComments;
  const loginUrl = signInUrl ?? `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : withLocale(locale, `/community/${postId}`))}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <h2 className="text-xl font-black text-ink md:text-2xl">{t.commentsHeading}</h2>
        <Link
          href={loginUrl}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-ink bg-yellow px-3 py-1.5 text-xs font-black text-ink shadow-[2px_2px_0_var(--shadow-hard-14)] transition hover:bg-yellow-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <LogIn className="size-3.5" aria-hidden="true" />
          {t.signInToReply}
        </Link>
      </div>

      {query.status === "LoadingFirstPage" && comments.length === 0 ? (
        <div className="mt-6 flex items-center gap-2 text-sm font-bold text-muted">
          <Spinner />
          {t.loading}
        </div>
      ) : comments.length ? (
        <ol className="mt-6 space-y-4">
          {comments.map((comment) => (
            <PublicCommentNode
              key={comment._id}
              postId={postId}
              comment={comment}
              locale={locale}
              initialReplies={initialReplies[comment._id]}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-6 text-sm font-bold text-muted">{t.noComments}</p>
      )}

      {query.status === "CanLoadMore" || query.status === "LoadingMore" ? (
        <button
          type="button"
          onClick={() => query.loadMore(10)}
          disabled={query.status === "LoadingMore"}
          className="mt-6 inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper-strong px-5 text-xs font-black text-ink shadow-[2px_2px_0_var(--shadow-hard-10)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {query.status === "LoadingMore" ? t.loading : t.showMore}
        </button>
      ) : null}

      <div className="mt-8 rounded-[16px] border-2 border-dashed border-line bg-paper/60 p-5 text-center">
        <p className="text-sm font-black text-ink">{t.signInBannerText}</p>
        <Link
          href={loginUrl}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 py-2 text-xs font-black text-ink shadow-[3px_3px_0_var(--shadow-hard-14)] transition hover:bg-yellow-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <MessageSquare className="size-4" aria-hidden="true" />
          {t.signInToReply}
        </Link>
      </div>
    </div>
  );
}

function PublicCommentNode({
  postId,
  comment,
  locale,
  initialReplies,
}: {
  postId: string;
  comment: PublicComment;
  locale: Locale;
  initialReplies?: PublicComment[];
}) {
  const t = communityThreadContent[locale];
  const hasReplies = (comment.directReplyCount ?? 0) > 0;
  const [open, setOpen] = useState(true);

  const formattedDate = new Date(comment.createdAt).toLocaleDateString(
    locale === "sr" ? "sr-Latn-RS" : "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );

  return (
    <li className="rounded-[12px] border border-line bg-paper/50 p-4 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-muted">
        <p className="text-ink">
          {comment.authorUsername ? `@${comment.authorUsername}` : comment.authorName}
        </p>
        <time dateTime={new Date(comment.createdAt).toISOString()} className="font-bold">
          {formattedDate}
        </time>
      </div>

      <div className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-ink">
        {comment.body}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black text-muted">
        <span className="rounded-full border border-line bg-paper px-2.5 py-0.5">
          {comment.voteScore} {t.netVotes}
        </span>
        {hasReplies ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-paper-strong px-3 py-1 text-xs font-black text-ink transition hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ChevronRight
              className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            {open
              ? t.collapse
              : `${t.showReplies} ${comment.directReplyCount} ${t.replies}`}
          </button>
        ) : null}
      </div>

      {hasReplies && open ? (
        <PublicReplies
          postId={postId}
          parentId={comment._id}
          locale={locale}
          initialReplies={initialReplies}
        />
      ) : null}
    </li>
  );
}

function PublicReplies({
  postId,
  parentId,
  locale,
  initialReplies = [],
}: {
  postId: string;
  parentId: string;
  locale: Locale;
  initialReplies?: PublicComment[];
}) {
  const t = communityThreadContent[locale];
  const query = usePaginatedQuery(
    api.community.listPublicRepliesPage,
    { postId: postId as Id<"communityPosts">, parentId: parentId as Id<"comments"> },
    { initialNumItems: 3 },
  );

  const replies = query.results.length ? (query.results as PublicComment[]) : initialReplies;

  return (
    <div className="mt-3 space-y-3 border-l-2 border-ink/20 pl-3 md:pl-4">
      {query.status === "LoadingFirstPage" && replies.length === 0 ? (
        <div className="py-2">
          <Spinner className="text-yellow" />
        </div>
      ) : (
        replies.map((reply) => (
          <PublicCommentNode
            key={reply._id}
            postId={postId}
            comment={reply}
            locale={locale}
          />
        ))
      )}

      {query.status === "CanLoadMore" || query.status === "LoadingMore" ? (
        <button
          type="button"
          onClick={() => query.loadMore(5)}
          disabled={query.status === "LoadingMore"}
          className="inline-flex min-h-8 items-center rounded-full border border-line bg-paper-strong px-3 text-xs font-black text-ink disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {query.status === "LoadingMore" ? t.loading : t.showMore}
        </button>
      ) : null}
    </div>
  );
}
