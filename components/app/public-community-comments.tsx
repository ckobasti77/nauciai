"use client";

import { usePaginatedQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { Spinner } from "@/components/ui/spinner";

type PublicComment = {
  _id: string;
  body: string;
  createdAt: number;
  authorName: string;
  authorUsername?: string;
  directReplyCount?: number;
  voteScore: number;
};

export function PublicCommunityComments({
  postId,
  locale,
  initialComments,
}: {
  postId: string;
  locale: Locale;
  initialComments: PublicComment[];
}) {
  const query = usePaginatedQuery(
    api.community.listPublicRootCommentsPage,
    { postId: postId as Id<"communityPosts"> },
    { initialNumItems: 3 },
  );
  const comments = query.results.length ? (query.results as PublicComment[]) : initialComments;

  return (
    <div>
      <h2 className="text-2xl font-black text-ink">{locale === "sr" ? "Komentari" : "Comments"}</h2>
      {query.status === "LoadingFirstPage" && comments.length === 0 ? (
        <div className="mt-5 flex items-center gap-2 text-sm font-bold text-muted"><Spinner />{locale === "sr" ? "Učitavanje…" : "Loading…"}</div>
      ) : comments.length ? (
        <ol className="mt-5 space-y-3">
          {comments.map((comment) => <PublicCommentNode key={comment._id} postId={postId} comment={comment} locale={locale} />)}
        </ol>
      ) : (
        <p className="mt-4 text-sm font-bold text-muted">{locale === "sr" ? "Još nema komentara." : "No comments yet."}</p>
      )}
      {query.status === "CanLoadMore" || query.status === "LoadingMore" ? (
        <button type="button" onClick={() => query.loadMore(5)} disabled={query.status === "LoadingMore"} className="mt-4 inline-flex min-h-10 items-center rounded-full border border-line bg-paper-strong px-4 text-xs font-black text-ink disabled:opacity-60">
          {query.status === "LoadingMore" ? (locale === "sr" ? "Učitavanje…" : "Loading…") : (locale === "sr" ? "Prikaži još" : "Show more")}
        </button>
      ) : null}
    </div>
  );
}

function PublicCommentNode({ postId, comment, locale }: { postId: string; comment: PublicComment; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const hasReplies = (comment.directReplyCount ?? 0) > 0;
  return (
    <li className="rounded-[12px] border border-line bg-paper/40 p-4">
      <p className="text-xs font-black text-muted">{comment.authorUsername ? `@${comment.authorUsername}` : comment.authorName}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-ink">{comment.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-black text-muted">
        <span>{comment.voteScore} {locale === "sr" ? "neto glasova" : "net votes"}</span>
        {hasReplies ? <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1 rounded-full border border-line bg-paper-strong px-3 py-1.5 text-ink"><ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />{open ? (locale === "sr" ? "Sažmi" : "Collapse") : `${locale === "sr" ? "Prikaži" : "Show"} ${comment.directReplyCount} ${locale === "sr" ? "odgovora" : "replies"}`}</button> : null}
      </div>
      {open ? <PublicReplies postId={postId} parentId={comment._id} locale={locale} /> : null}
    </li>
  );
}

function PublicReplies({ postId, parentId, locale }: { postId: string; parentId: string; locale: Locale }) {
  const query = usePaginatedQuery(api.community.listPublicRepliesPage, { postId: postId as Id<"communityPosts">, parentId: parentId as Id<"comments"> }, { initialNumItems: 3 });
  const replies = query.results as PublicComment[];
  return (
    <div className="mt-3 space-y-3 border-l-2 border-ink/15 pl-3">
      {query.status === "LoadingFirstPage" ? <Spinner className="text-yellow" /> : replies.map((reply) => <PublicCommentNode key={reply._id} postId={postId} comment={reply} locale={locale} />)}
      {query.status === "CanLoadMore" || query.status === "LoadingMore" ? <button type="button" onClick={() => query.loadMore(5)} disabled={query.status === "LoadingMore"} className="inline-flex min-h-9 rounded-full border border-line bg-paper-strong px-3 text-xs font-black text-ink disabled:opacity-60">{query.status === "LoadingMore" ? (locale === "sr" ? "Učitavanje…" : "Loading…") : (locale === "sr" ? "Prikaži još" : "Show more")}</button> : null}
    </div>
  );
}
