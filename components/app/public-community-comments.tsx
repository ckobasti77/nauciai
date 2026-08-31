/* eslint-disable @next/next/no-img-element */
"use client";

import { usePaginatedQuery } from "convex/react";
import { ChevronRight, LogIn, MessageSquare } from "lucide-react";
import { useState } from "react";

import { initialsFromName } from "@/components/app/community-identity";
import { SectionMarginalia } from "@/components/marketing/section-marginalia";
import { LinkButton, Panel } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { communityThreadContent, withLocale, type Locale } from "@/lib/i18n";

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
  const loginUrl =
    signInUrl ??
    `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(
      typeof window !== "undefined" ? window.location.href : withLocale(locale, `/community/${postId}`),
    )}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line pb-5">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-black text-ink sm:text-2xl md:text-3xl">
            {t.commentsHeading}
          </h2>
          <SectionMarginalia variant="spark" className="size-6 text-yellow" />
        </div>
        <LinkButton
          href={loginUrl}
          tone="yellow"
          className="min-h-11"
        >
          <LogIn className="size-4 shrink-0" aria-hidden="true" />
          <span>{t.signInToReply}</span>
        </LinkButton>
      </div>

      {query.status === "LoadingFirstPage" && comments.length === 0 ? (
        <div className="mt-6 flex items-center gap-2 text-sm font-bold text-muted">
          <Spinner />
          <span>{t.loading}</span>
        </div>
      ) : comments.length ? (
        <ol className="mt-6 space-y-5">
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
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink bg-paper-strong px-5 text-xs font-black text-ink shadow-[2px_2px_0_var(--shadow-hard-10)] transition hover:-translate-y-0.5 hover:bg-paper disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {query.status === "LoadingMore" ? t.loading : t.showMore}
        </button>
      ) : null}

      <Panel className="mt-8 border-2 border-ink bg-paper p-6 text-center shadow-[4px_4px_0_0_var(--shadow-hard-13)] sm:p-8">
        <p className="text-base font-black text-ink sm:text-lg">{t.signInBannerText}</p>
        <div className="mt-4">
          <LinkButton
            href={loginUrl}
            tone="yellow"
            className="min-h-11"
          >
            <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
            <span>{t.signInToReply}</span>
          </LinkButton>
        </div>
      </Panel>
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
    <li className="rounded-[16px] border-2 border-ink bg-paper-strong p-5 shadow-[4px_4px_0_0_var(--shadow-hard-10)] transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-muted">
        <div className="flex items-center gap-2">
          {comment.authorAvatarUrl ? (
            <img
              src={comment.authorAvatarUrl}
              alt=""
              className="size-5 rounded-full border border-ink object-cover"
              loading="lazy"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-5 items-center justify-center rounded-full border border-ink bg-yellow text-[10px] font-black text-ink"
            >
              {initialsFromName(comment.authorName)}
            </span>
          )}
          <span className="font-black text-ink">
            {comment.authorUsername ? `@${comment.authorUsername}` : comment.authorName}
          </span>
        </div>
        <time dateTime={new Date(comment.createdAt).toISOString()} className="font-bold">
          {formattedDate}
        </time>
      </div>

      <div className="mt-3 whitespace-pre-wrap text-sm font-medium leading-relaxed text-ink md:text-base">
        {comment.body}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-black text-muted">
        <span className="rounded-full border-2 border-ink bg-paper px-3 py-1 text-ink">
          {comment.voteScore} {t.netVotes}
        </span>
        {hasReplies ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3.5 py-1.5 text-xs font-black text-ink transition hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ChevronRight
              className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            <span>
              {open
                ? t.collapse
                : `${t.showReplies} ${comment.directReplyCount} ${t.replies}`}
            </span>
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
    <div className="mt-4 space-y-4 border-l-2 border-line pl-4 sm:pl-6">
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
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink bg-paper-strong px-4 text-xs font-black text-ink shadow-[2px_2px_0_var(--shadow-hard-10)] transition hover:-translate-y-0.5 hover:bg-paper disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {query.status === "LoadingMore" ? t.loading : t.showMore}
        </button>
      ) : null}
    </div>
  );
}
