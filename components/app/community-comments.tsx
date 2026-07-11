"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import {
  BadgeCheck,
  CornerDownRight,
  Loader2,
  MessageCircleReply,
  Send,
  ArrowDown,
  ArrowUp,
  Trash2,
} from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { CommunityAvatar, formatCommunityTime, type CommunityRank, type CommunityRole } from "@/components/app/community-identity";
import { CommunityThreadConfirmDialog } from "@/components/app/community-thread-dialog";
import { cn } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

export type FlatComment = {
  _id: string;
  postId: string;
  parentId?: string;
  body: string;
  createdAt: number;
  authorId: string;
  authorName: string;
  authorUsername?: string;
  authorRole: CommunityRole;
  authorAvatarUrl?: string | null;
  authorRank?: CommunityRank;
  reactionsCount: number;
  upvoteCount?: number;
  downvoteCount?: number;
  voteScore?: number;
  userVote?: "upvote" | "downvote";
  userReaction?: string;
  isHelpful?: boolean;
  helpfulMarkedBy?: string;
  helpfulMarkedAt?: number;
};

type CommentNode = FlatComment & {
  replyToName?: string;
  replies: CommentNode[];
};

export function CommentsSection({
  postId,
  locale,
  isAuthenticated,
  canModerate,
  canMarkHelpful = false,
  viewerUserId,
  compact = false,
}: {
  postId: string;
  locale: Locale;
  isAuthenticated: boolean;
  canModerate: boolean;
  canMarkHelpful?: boolean;
  viewerUserId?: string;
  compact?: boolean;
}) {
  const commentsQuery = usePaginatedQuery(
    api.community.listCommentsPage,
    isAuthenticated ? { postId: postId as Id<"communityPosts"> } : "skip",
    { initialNumItems: compact ? 5 : 20 },
  );
  const comments = commentsQuery.results as FlatComment[];
  const toast = useToast();
  const addComment = useMutation(api.community.addComment);
  const voteComment = useMutation(api.community.vote);
  const deleteComment = useMutation(api.community.deleteComment);
  const setCommentHelpful = useMutation(api.community.setCommentHelpful);

  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddRootComment(event: FormEvent) {
    event.preventDefault();
    if (!commentText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await addComment({
        postId: postId as Id<"communityPosts">,
        body: commentText.trim(),
      });
      setCommentText("");
    } catch (caughtError) {
      console.error(caughtError);
      if (String(caughtError).includes("PROFILE_INCOMPLETE")) {
        toast.warning(
          locale === "sr" ? "Podesi username da bi komentarisao/la." : "Set a username to comment.",
          undefined,
          { label: locale === "sr" ? "Otvori Profil" : "Open Profile", onClick: () => (window.location.href = withLocale(locale, "/app/profile")) },
        );
      }
      setError(
        locale === "sr"
          ? "Komentar nije poslat. Tekst je ostao sačuvan — pokušaj ponovo."
          : "The comment was not sent. Your text is still here — try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteComment({ commentId: deleteTarget as Id<"comments"> });
      setDeleteTarget(null);
    } catch (caughtError) {
      console.error(caughtError);
      setDeleteTarget(null);
      setError(
        locale === "sr"
          ? "Komentar nije obrisan. Osveži stranicu i pokušaj ponovo."
          : "The comment was not deleted. Refresh the page and try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const commentTree = comments ? buildCommentTree(comments) : [];

  return (
    <div className={cn("space-y-5", compact && "space-y-4")}>
      {isAuthenticated ? (
        <form onSubmit={handleAddRootComment} className="rounded-[16px] border border-line bg-paper/45 p-3 sm:p-4">
          <label htmlFor={`comment-${postId}`} className="block text-xs font-black uppercase tracking-[0.06em] text-ink/55">
            {locale === "sr" ? "Dodaj komentar" : "Add a comment"}
          </label>
          <div className="mt-2 flex items-end gap-2">
            <textarea
              id={`comment-${postId}`}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder={locale === "sr" ? "Podeli odgovor, primer ili sledeći korak…" : "Share an answer, example, or next step…"}
              rows={compact ? 1 : 2}
              className="min-h-11 flex-1 resize-y rounded-[12px] border border-line bg-white px-3 py-2.5 text-sm font-semibold leading-6 text-ink outline-none transition placeholder:text-ink/35 focus:border-ink focus:ring-4 focus:ring-yellow/15"
            />
            <button
              type="submit"
              disabled={isSubmitting || !commentText.trim()}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_rgba(14,49,88,0.16)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={locale === "sr" ? "Pošalji komentar" : "Send comment"}
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Send className="size-4" />}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          {error}
        </p>
      ) : null}

      {commentsQuery.status === "LoadingFirstPage" ? (
        <div className="flex justify-center py-7" aria-busy="true">
          <Loader2 className="size-6 animate-spin text-yellow motion-reduce:animate-none" />
        </div>
      ) : commentTree.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-ink/20 bg-paper/40 px-5 py-7 text-center">
          <MessageCircleReply className="mx-auto size-7 text-ink/35" />
          <p className="mt-3 text-sm font-black text-ink/60">
            {locale === "sr" ? "Još nema komentara. Pokreni razmenu znanja." : "No comments yet. Start the knowledge exchange."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {commentTree.map((node) => (
            <CommentItem
              key={node._id}
              node={node}
              depth={0}
              locale={locale}
              isAuthenticated={isAuthenticated}
              canModerate={canModerate}
              canMarkHelpful={canMarkHelpful}
              viewerUserId={viewerUserId}
              onReact={async (commentId, vote) => {
                await voteComment({
                  targetType: "comment",
                  targetId: commentId,
                  vote,
                });
              }}
              onSetHelpful={async (commentId, helpful) => {
                await setCommentHelpful({ commentId: commentId as Id<"comments">, helpful });
              }}
              onDelete={setDeleteTarget}
              onReply={async (commentId, text) => {
                await addComment({
                  postId: postId as Id<"communityPosts">,
                  parentId: commentId as Id<"comments">,
                  body: text.trim(),
                });
              }}
              onError={() =>
                setError(
                  locale === "sr"
                    ? "Akcija nije sačuvana. Proveri vezu i pokušaj ponovo."
                    : "The action was not saved. Check your connection and try again.",
                )
              }
            />
          ))}
        </div>
      )}

      {commentsQuery.status === "CanLoadMore" || commentsQuery.status === "LoadingMore" ? (
        <button
          type="button"
          onClick={() => commentsQuery.loadMore(compact ? 5 : 20)}
          disabled={commentsQuery.status === "LoadingMore"}
          className="mx-auto inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-white px-4 text-xs font-black text-ink transition hover:border-ink disabled:opacity-60"
        >
          {commentsQuery.status === "LoadingMore"
            ? locale === "sr"
              ? "Učitavanje…"
              : "Loading…"
            : locale === "sr"
              ? "Učitaj još komentara"
              : "Load more comments"}
        </button>
      ) : null}

      <CommunityThreadConfirmDialog
        open={Boolean(deleteTarget)}
        title={locale === "sr" ? "Obrisati komentar?" : "Delete comment?"}
        description={
          locale === "sr"
            ? "Komentar i svi odgovori ispod njega biće trajno uklonjeni."
            : "The comment and every reply below it will be permanently removed."
        }
        confirmLabel={locale === "sr" ? "Obriši komentar" : "Delete comment"}
        cancelLabel={locale === "sr" ? "Odustani" : "Cancel"}
        closeLabel={locale === "sr" ? "Zatvori dijalog" : "Close dialog"}
        busy={isDeleting}
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function CommentItem({
  node,
  depth,
  locale,
  isAuthenticated,
  canModerate,
  canMarkHelpful,
  viewerUserId,
  onReact,
  onSetHelpful,
  onDelete,
  onReply,
  onError,
}: {
  node: CommentNode;
  depth: 0 | 1;
  locale: Locale;
  isAuthenticated: boolean;
  canModerate: boolean;
  canMarkHelpful: boolean;
  viewerUserId?: string;
  onReact: (commentId: string, vote: "upvote" | "downvote") => Promise<void>;
  onSetHelpful: (commentId: string, helpful: boolean) => Promise<void>;
  onDelete: (commentId: string) => void;
  onReply: (commentId: string, text: string) => Promise<void>;
  onError: () => void;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const canDelete = canModerate || Boolean(viewerUserId && node.authorId === viewerUserId);
  const canToggleHelpful = canMarkHelpful && node.authorId !== viewerUserId;

  async function run(action: string, task: () => Promise<void>) {
    setBusy(action);
    try {
      await task();
    } catch (caughtError) {
      console.error(caughtError);
      onError();
    } finally {
      setBusy(null);
    }
  }

  async function handleAddReply(event: FormEvent) {
    event.preventDefault();
    if (!replyText.trim() || busy) return;

    await run("reply", async () => {
      await onReply(node._id, replyText);
      setReplyText("");
      setShowReplyForm(false);
    });
  }

  return (
    <div className="space-y-3">
      <article
        className={cn(
          "group rounded-[16px] border bg-white p-4 transition",
          node.isHelpful ? "border-amber-400 shadow-[0_8px_24px_rgba(244,190,48,0.12)]" : "border-line hover:border-ink/30",
        )}
      >
        <div className="flex items-start gap-3">
          <CommunityAvatar
            name={node.authorName}
            avatarUrl={node.authorAvatarUrl}
            role={node.authorRole}
            rank={node.authorRank}
            locale={locale}
            size="sm"
            className="pt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-xs font-black text-ink">{node.authorUsername ? `@${node.authorUsername}` : node.authorName}</span>
              {node.authorUsername ? <span className="truncate text-[10px] font-semibold text-muted">{node.authorName}</span> : null}
              <time dateTime={new Date(node.createdAt).toISOString()} className="text-[10px] font-bold text-ink/50">
                {formatCommunityTime(node.createdAt, locale)}
              </time>
              {node.isHelpful ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-900">
                  <BadgeCheck className="size-3" />
                  {locale === "sr" ? "Koristan odgovor · +10 XP" : "Helpful answer · +10 XP"}
                </span>
              ) : null}
            </div>
            {node.replyToName ? (
              <p className="mt-1 text-[11px] font-bold text-ink/45">
                {locale === "sr" ? "Odgovor za" : "Replying to"} {node.replyToName}
              </p>
            ) : null}
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-ink/80">{node.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black text-ink">
              <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-white p-0.5">
                <button type="button" onClick={() => run("upvote", () => onReact(node._id, "upvote"))} disabled={!isAuthenticated || busy !== null} aria-pressed={node.userVote === "upvote"} className={cn("grid size-8 place-items-center rounded-full transition", node.userVote === "upvote" ? "bg-yellow text-ink" : "text-muted hover:bg-yellow/20 hover:text-ink")}><ArrowUp className="size-3.5" /></button>
                <span className={cn("min-w-7 text-center text-xs font-black", (node.voteScore ?? 0) < 0 && "text-red-700")}>{node.voteScore ?? 0}</span>
                <button type="button" onClick={() => run("downvote", () => onReact(node._id, "downvote"))} disabled={!isAuthenticated || busy !== null} aria-pressed={node.userVote === "downvote"} className={cn("grid size-8 place-items-center rounded-full transition", node.userVote === "downvote" ? "bg-red-100 text-red-700" : "text-muted hover:bg-red-50 hover:text-red-700")}><ArrowDown className="size-3.5" /></button>
              </div>
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => setShowReplyForm((value) => !value)}
                  aria-expanded={showReplyForm}
                  className={cn(
                    "min-h-9 rounded-full px-3 text-ink/60 transition hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    showReplyForm && "bg-yellow/20 text-ink",
                  )}
                >
                  {locale === "sr" ? "Odgovori" : "Reply"}
                </button>
              ) : null}
              {canToggleHelpful ? (
                <button
                  type="button"
                  onClick={() => run("helpful", () => onSetHelpful(node._id, !node.isHelpful))}
                  disabled={busy !== null}
                  aria-pressed={Boolean(node.isHelpful)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50",
                    node.isHelpful
                      ? "border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100"
                      : "border-line bg-white text-ink/60 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-950",
                  )}
                >
                  {busy === "helpful" ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />}
                  {node.isHelpful
                    ? locale === "sr"
                      ? "Ukloni oznaku"
                      : "Remove helpful"
                    : locale === "sr"
                      ? "Označi kao korisno"
                      : "Mark helpful"}
                </button>
              ) : null}
            </div>
          </div>
          {canDelete ? (
            <button
              type="button"
              onClick={() => onDelete(node._id)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-transparent text-red-500 opacity-100 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 md:opacity-0 md:group-hover:opacity-100"
              aria-label={locale === "sr" ? "Obriši komentar" : "Delete comment"}
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>

        {showReplyForm ? (
          <form onSubmit={handleAddReply} className="mt-4 flex items-end gap-2">
            <div className="relative flex-1">
              <CornerDownRight className="pointer-events-none absolute left-3 top-3 size-4 text-ink/45" />
              <label htmlFor={`reply-${node._id}`} className="sr-only">
                {locale === "sr" ? `Odgovor za ${node.authorName}` : `Reply to ${node.authorName}`}
              </label>
              <textarea
                id={`reply-${node._id}`}
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder={locale === "sr" ? "Napiši odgovor…" : "Write a reply…"}
                rows={2}
                className="min-h-11 w-full resize-y rounded-[12px] border border-line bg-white px-3 py-2.5 pl-9 text-xs font-bold leading-5 text-ink outline-none focus:border-ink focus:ring-2 focus:ring-yellow/15"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={busy !== null || !replyText.trim()}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black text-ink shadow-[2px_2px_0_rgba(14,49,88,0.16)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0.5 active:shadow-none disabled:opacity-50"
              aria-label={locale === "sr" ? "Pošalji odgovor" : "Send reply"}
            >
              {busy === "reply" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            </button>
          </form>
        ) : null}
      </article>

      {node.replies.length > 0 ? (
        <div className={depth === 0 ? "ml-3 space-y-3 border-l-2 border-ink/12 pl-3 sm:ml-6 sm:pl-5" : "space-y-3"}>
          {node.replies.map((reply) => (
            <CommentItem
              key={reply._id}
              node={reply}
              depth={1}
              locale={locale}
              isAuthenticated={isAuthenticated}
              canModerate={canModerate}
              canMarkHelpful={canMarkHelpful}
              viewerUserId={viewerUserId}
              onReact={onReact}
              onSetHelpful={onSetHelpful}
              onDelete={onDelete}
              onReply={onReply}
              onError={onError}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildCommentTree(flatComments: FlatComment[]): CommentNode[] {
  const map: Record<string, CommentNode> = {};
  flatComments.forEach((comment) => {
    map[comment._id] = { ...comment, replies: [] };
  });

  const root: CommentNode[] = [];
  flatComments.forEach((comment) => {
    const node = map[comment._id];
    const parent = comment.parentId ? map[comment.parentId] : undefined;
    if (parent) {
      node.replyToName = parent.authorName;
      parent.replies.push(node);
    } else {
      root.push(node);
    }
  });

  const sortReplies = (node: CommentNode) => {
    node.replies.sort((a, b) => (b.voteScore ?? 0) - (a.voteScore ?? 0) || a.createdAt - b.createdAt);
    node.replies.forEach(sortReplies);
  };

  root.sort((a, b) => (b.voteScore ?? 0) - (a.voteScore ?? 0) || a.createdAt - b.createdAt);
  root.forEach(sortReplies);

  return root;
}
