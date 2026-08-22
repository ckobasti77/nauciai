"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Ellipsis,
  Link2,
  Loader2,
  MessageCircleReply,
  Send,
  Trash2,
} from "lucide-react";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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
  hotScore?: number;
  directReplyCount?: number;
  replyToName?: string;
  replyToBody?: string;
  userVote?: "upvote" | "downvote";
  userReaction?: string;
  isHelpful?: boolean;
  helpfulMarkedBy?: string;
  helpfulMarkedAt?: number;
};

type CommentAction = "upvote" | "downvote" | "helpful" | "reply";

export function CommentsSection({
  postId,
  locale,
  isAuthenticated,
  canModerate,
  canMarkHelpful = false,
  canInteract = true,
  viewerUserId,
  compact = false,
  showCommandDock = true,
}: {
  postId: string;
  locale: Locale;
  isAuthenticated: boolean;
  canModerate: boolean;
  canMarkHelpful?: boolean;
  canInteract?: boolean;
  viewerUserId?: string;
  compact?: boolean;
  showCommandDock?: boolean;
}) {
  const commentsQuery = usePaginatedQuery(
    api.community.listRootCommentsPage,
    isAuthenticated ? { postId: postId as Id<"communityPosts"> } : "skip",
    { initialNumItems: 5 },
  );
  const comments = commentsQuery.results as FlatComment[];
  const toast = useToast();
  const addComment = useMutation(api.community.addComment);
  const voteComment = useMutation(api.community.vote);
  const deleteComment = useMutation(api.community.deleteComment);
  const setCommentHelpful = useMutation(api.community.setCommentHelpful);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const commentsTopRef = useRef<HTMLDivElement>(null);

  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [expandLoadedSignal, setExpandLoadedSignal] = useState(0);

  async function handleAddRootComment(event: FormEvent) {
    event.preventDefault();
    if (!commentText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await addComment({ postId: postId as Id<"communityPosts">, body: commentText.trim() });
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
      setError(locale === "sr" ? "Komentar nije poslat. Tekst je ostao sačuvan — pokušaj ponovo." : "The comment was not sent. Your text is still here — try again.");
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
      setError(locale === "sr" ? "Komentar nije obrisan. Osveži stranicu i pokušaj ponovo." : "The comment was not deleted. Refresh the page and try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div ref={commentsTopRef} data-community-comments={postId} className={cn("relative space-y-5", compact && "space-y-4")}>
      {isAuthenticated && canInteract ? (
        <form onSubmit={handleAddRootComment} className="rounded-[16px] border border-line bg-paper/45 p-3 sm:p-4">
          <label htmlFor={`comment-${postId}`} className="block text-xs font-black uppercase tracking-[0.06em] text-ink/55">
            {locale === "sr" ? "Dodaj komentar" : "Add a comment"}
          </label>
          <div className="mt-2 flex items-end gap-2">
            <textarea
              ref={composerRef}
              id={`comment-${postId}`}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder={locale === "sr" ? "Podeli odgovor, primer ili sledeći korak…" : "Share an answer, example, or next step…"}
              rows={compact ? 1 : 2}
              className="min-h-11 flex-1 resize-y rounded-[12px] border border-line bg-paper-strong px-3 py-2.5 text-sm font-semibold leading-6 text-ink outline-none transition placeholder:text-ink/35 focus:border-ink focus:ring-4 focus:ring-yellow/15"
            />
            <button type="submit" disabled={isSubmitting || !commentText.trim()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_var(--shadow-hard-16)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50" aria-label={locale === "sr" ? "Pošalji komentar" : "Send comment"}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Send className="size-4" />}
            </button>
          </div>
        </form>
      ) : isAuthenticated ? (
        <p className="rounded-[16px] border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-black text-amber-900">
          {locale === "sr" ? "Podesi username na Profilu da komentarišeš i glasaš." : "Set a username in Profile to comment and vote."}
        </p>
      ) : null}

      {error ? <p role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p> : null}

      {commentsQuery.status === "LoadingFirstPage" ? (
        <div className="flex justify-center py-7" aria-busy="true"><Loader2 className="size-6 animate-spin text-yellow motion-reduce:animate-none" /></div>
      ) : comments.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-ink/20 bg-paper/40 px-5 py-7 text-center">
          <MessageCircleReply className="mx-auto size-7 text-ink/35" />
          <p className="mt-3 text-sm font-black text-ink/60">{locale === "sr" ? "Još nema komentara. Pokreni razmenu znanja." : "No comments yet. Start the knowledge exchange."}</p>
        </div>
      ) : (
        <div className="space-y-4" aria-live="polite">
          {comments.map((comment) => (
            <CommentItem
              key={comment._id}
              node={comment}
              depth={0}
              locale={locale}
              isAuthenticated={isAuthenticated}
              canModerate={canModerate}
              canMarkHelpful={canMarkHelpful}
              canInteract={canInteract}
              viewerUserId={viewerUserId}
              postId={postId}
              collapseSignal={collapseSignal}
              expandLoadedSignal={expandLoadedSignal}
              onReact={(commentId, vote) => voteComment({ targetType: "comment", targetId: commentId, vote })}
              onSetHelpful={(commentId, helpful) => setCommentHelpful({ commentId: commentId as Id<"comments">, helpful })}
              onDelete={setDeleteTarget}
              onReply={(commentId, text) => addComment({ postId: postId as Id<"communityPosts">, parentId: commentId as Id<"comments">, body: text.trim() })}
              onError={() => setError(locale === "sr" ? "Akcija nije sačuvana. Proveri vezu i pokušaj ponovo." : "The action was not saved. Check your connection and try again.")}
            />
          ))}
        </div>
      )}

      {commentsQuery.status === "CanLoadMore" || commentsQuery.status === "LoadingMore" ? (
        <button type="button" onClick={() => commentsQuery.loadMore(5)} disabled={commentsQuery.status === "LoadingMore"} className="mx-auto inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-paper-strong px-4 text-xs font-black text-ink transition hover:border-ink disabled:opacity-60">
          {commentsQuery.status === "LoadingMore" ? locale === "sr" ? "Učitavanje…" : "Loading…" : locale === "sr" ? "Prikaži još" : "Show more"}
        </button>
      ) : null}

      {showCommandDock ? (
        <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2 sm:right-6">
          {menuOpen ? (
            <div className="w-56 rounded-[16px] border border-ink bg-paper-strong p-2 shadow-[5px_5px_0_var(--shadow-hard-14)]" role="menu">
              <CommandButton locale={locale} label={locale === "sr" ? "Napiši komentar" : "Write a comment"} onClick={() => { composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); composerRef.current?.focus(); setMenuOpen(false); }} />
              <CommandButton locale={locale} label={locale === "sr" ? "Početak komentara" : "Comments start"} onClick={() => { commentsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); setMenuOpen(false); }} />
              <CommandButton locale={locale} label={locale === "sr" ? "Sažmi sve" : "Collapse all"} onClick={() => { setCollapseSignal((value) => value + 1); setMenuOpen(false); }} />
              <CommandButton locale={locale} label={locale === "sr" ? "Otvori učitane" : "Expand loaded"} onClick={() => { setExpandLoadedSignal((value) => value + 1); setMenuOpen(false); }} />
            </div>
          ) : null}
          <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label={locale === "sr" ? "Komande komentara" : "Comment commands"} className="grid size-12 place-items-center rounded-full border-2 border-ink bg-yellow text-ink shadow-[3px_3px_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            {menuOpen ? <ChevronDown className="size-5" /> : <Ellipsis className="size-5" />}
          </button>
        </div>
      ) : null}

      <CommunityThreadConfirmDialog open={Boolean(deleteTarget)} title={locale === "sr" ? "Obrisati komentar?" : "Delete comment?"} description={locale === "sr" ? "Komentar i svi odgovori ispod njega biće trajno uklonjeni." : "The comment and every reply below it will be permanently removed."} confirmLabel={locale === "sr" ? "Obriši komentar" : "Delete comment"} cancelLabel={locale === "sr" ? "Odustani" : "Cancel"} closeLabel={locale === "sr" ? "Zatvori dijalog" : "Close dialog"} busy={isDeleting} destructive onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
    </div>
  );
}

function CommandButton({ locale, label, onClick }: { locale: Locale; label: string; onClick: () => void }) {
  return <button type="button" role="menuitem" onClick={onClick} className="flex min-h-10 w-full items-center rounded-[10px] px-3 text-left text-xs font-black text-ink transition hover:bg-yellow/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink">{label}<span className="sr-only">{locale === "sr" ? " komanda" : " command"}</span></button>;
}

function CommentItem({
  node,
  depth,
  locale,
  isAuthenticated,
  canModerate,
  canMarkHelpful,
  canInteract,
  viewerUserId,
  postId,
  collapseSignal,
  expandLoadedSignal,
  onReact,
  onSetHelpful,
  onDelete,
  onReply,
  onError,
}: {
  node: FlatComment;
  depth: number;
  locale: Locale;
  isAuthenticated: boolean;
  canModerate: boolean;
  canMarkHelpful: boolean;
  canInteract: boolean;
  viewerUserId?: string;
  postId: string;
  collapseSignal: number;
  expandLoadedSignal: number;
  isExpanded?: boolean;
  onReact: (commentId: string, vote: "upvote" | "downvote") => Promise<unknown>;
  onSetHelpful: (commentId: string, helpful: boolean) => Promise<unknown>;
  onDelete: (commentId: string) => void;
  onReply: (commentId: string, text: string) => Promise<unknown>;
  onError: () => void;
}) {
  const hasReplies = (node.directReplyCount ?? 0) > 0;
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState<CommentAction | null>(null);
  const [isExpanded, setIsExpanded] = useState(() => depth === 0 && hasReplies);
  const [repliesRequested, setRepliesRequested] = useState(() => depth === 0 && hasReplies);
  const handledCollapse = useRef(0);
  const handledExpandLoaded = useRef(0);
  const canDelete = canModerate || Boolean(viewerUserId && node.authorId === viewerUserId);
  const canToggleHelpful = canMarkHelpful && node.authorId !== viewerUserId;
  const cardRef = useRef<HTMLElement>(null);
  const [highlighted, setHighlighted] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (window.location.hash !== `#comment-${node._id}`) return;
    let timeout = 0;
    const frame = window.requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ block: "center" });
      setHighlighted(true);
      timeout = window.setTimeout(() => setHighlighted(false), 1800);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [node._id]);

  async function copyLink() {
    const url = `${window.location.origin}${withLocale(locale, `/app/community/${postId}`)}#comment-${node._id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(locale === "sr" ? "Link je kopiran." : "Link copied.");
    } catch {
      toast.error(locale === "sr" ? "Kopiranje nije uspelo." : "Copy failed.");
    }
  }

  useEffect(() => {
    if (collapseSignal !== handledCollapse.current) {
      handledCollapse.current = collapseSignal;
      if (collapseSignal > 0) queueMicrotask(() => setIsExpanded(false));
    }
  }, [collapseSignal]);

  useEffect(() => {
    if (expandLoadedSignal !== handledExpandLoaded.current) {
      handledExpandLoaded.current = expandLoadedSignal;
      if (expandLoadedSignal > 0 && repliesRequested) queueMicrotask(() => setIsExpanded(true));
    }
  }, [expandLoadedSignal, repliesRequested]);

  async function run(action: CommentAction, task: () => Promise<unknown>) {
    setBusy(action);
    try { await task(); } catch (caughtError) { console.error(caughtError); onError(); } finally { setBusy(null); }
  }

  async function handleAddReply(event: FormEvent) {
    event.preventDefault();
    if (!replyText.trim() || busy) return;
    await run("reply", async () => { await onReply(node._id, replyText); setReplyText(""); setShowReplyForm(false); setIsExpanded(true); setRepliesRequested(true); });
  }

  return (
    <div className="space-y-3">
      <article
        ref={cardRef}
        id={`comment-${node._id}`}
        data-comment-card
        className={cn("group rounded-[16px] border bg-paper-strong p-4 transition", node.isHelpful ? "border-amber-400 shadow-[0_8px_24px_rgba(244,190,48,0.12)]" : "border-line hover:border-ink/30", highlighted && "ring-4 ring-yellow/70 ring-offset-2")}
      >
        <div className="flex items-start gap-3">
          <Link href={node.authorUsername ? withLocale(locale, `/app/members/${node.authorUsername}`) : "#"} aria-disabled={!node.authorUsername} className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            <CommunityAvatar name={node.authorName} avatarUrl={node.authorAvatarUrl} role={node.authorRole} rank={node.authorRank} locale={locale} size="sm" className="pt-0.5" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {node.authorUsername ? <Link href={withLocale(locale, `/app/members/${node.authorUsername}`)} className="truncate text-xs font-black text-ink hover:underline">@{node.authorUsername}</Link> : <span className="truncate text-xs font-black text-ink">{node.authorName}</span>}
              {node.authorUsername ? <span className="truncate text-[10px] font-semibold text-muted">{node.authorName}</span> : null}
              <time dateTime={new Date(node.createdAt).toISOString()} className="text-[10px] font-bold text-ink/50">{formatCommunityTime(node.createdAt, locale)}</time>
              {node.isHelpful ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-900"><BadgeCheck className="size-3" />{locale === "sr" ? "Koristan odgovor · +10 XP" : "Helpful answer · +10 XP"}</span> : null}
            </div>
            {node.parentId && node.replyToName ? (
              <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-ink/55">
                <CornerDownRight className="size-3.5 shrink-0 text-ink/45" aria-hidden="true" />
                <span className="shrink-0">{locale === "sr" ? "Odgovor na" : "Reply to"}</span>
                <span className="truncate text-ink/75">{node.replyToName}</span>
                {node.replyToBody ? <span className="truncate font-semibold text-ink/35">· {node.replyToBody}</span> : null}
              </p>
            ) : null}
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-ink/80">{node.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black text-ink">
              <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-paper-strong p-0.5">
                <button type="button" onClick={() => void run("upvote", () => onReact(node._id, "upvote"))} disabled={!isAuthenticated || !canInteract || busy !== null} aria-label={locale === "sr" ? "Upvote komentara" : "Upvote comment"} aria-pressed={node.userVote === "upvote"} className={cn("grid size-11 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 sm:size-8", node.userVote === "upvote" ? "bg-yellow text-ink" : "text-muted hover:bg-yellow/20 hover:text-ink")}><ArrowUp className="size-3.5" /></button>
                <span className={cn("min-w-7 text-center text-xs font-black", (node.voteScore ?? 0) < 0 && "text-red-700")} aria-label={locale === "sr" ? `${node.voteScore ?? 0} neto glasova` : `${node.voteScore ?? 0} net votes`}>{node.voteScore ?? 0}</span>
                <button type="button" onClick={() => void run("downvote", () => onReact(node._id, "downvote"))} disabled={!isAuthenticated || !canInteract || busy !== null} aria-label={locale === "sr" ? "Downvote komentara" : "Downvote comment"} aria-pressed={node.userVote === "downvote"} className={cn("grid size-11 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 sm:size-8", node.userVote === "downvote" ? "bg-red-100 text-red-700" : "text-muted hover:bg-red-50 hover:text-red-700")}><ArrowDown className="size-3.5" /></button>
              </div>
              {isAuthenticated && canInteract ? <button type="button" onClick={() => setShowReplyForm((value) => !value)} aria-expanded={showReplyForm} className={cn("min-h-9 rounded-full px-3 text-ink/60 transition hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", showReplyForm && "bg-yellow/20 text-ink")}>{locale === "sr" ? "Odgovori" : "Reply"}</button> : null}
              {hasReplies ? <button type="button" onClick={() => { setRepliesRequested(true); setIsExpanded((value) => !value); }} aria-expanded={isExpanded} aria-controls={`replies-${node._id}`} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-paper/50 px-3 text-ink/70 transition hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><ChevronRight className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")} />{isExpanded ? locale === "sr" ? "Sažmi" : "Collapse" : locale === "sr" ? `Prikaži ${node.directReplyCount ?? ""} odgovora` : `Show ${node.directReplyCount ?? ""} replies`}</button> : null}
              {canToggleHelpful ? <button type="button" onClick={() => void run("helpful", () => onSetHelpful(node._id, !node.isHelpful))} disabled={busy !== null} aria-pressed={Boolean(node.isHelpful)} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50", node.isHelpful ? "border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100" : "border-line bg-paper-strong text-ink/60 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-950")}>{busy === "helpful" ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />}{node.isHelpful ? locale === "sr" ? "Ukloni oznaku" : "Remove helpful" : locale === "sr" ? "Označi kao korisno" : "Mark helpful"}</button> : null}
              <button type="button" onClick={() => void copyLink()} aria-label={locale === "sr" ? "Kopiraj link komentara" : "Copy comment link"} className="grid size-11 place-items-center rounded-full text-ink/50 transition hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:size-9"><Link2 className="size-3.5" aria-hidden="true" /></button>
            </div>
          </div>
          {canDelete ? <button type="button" onClick={() => onDelete(node._id)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-transparent text-red-500 opacity-100 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 md:opacity-0 md:group-hover:opacity-100" aria-label={locale === "sr" ? "Obriši komentar" : "Delete comment"}><Trash2 className="size-3.5" /></button> : null}
        </div>
        {showReplyForm ? <form onSubmit={handleAddReply} className="mt-4 flex items-end gap-2"><div className="relative flex-1"><CornerDownRight className="pointer-events-none absolute left-3 top-3 size-4 text-ink/45" /><label htmlFor={`reply-${node._id}`} className="sr-only">{locale === "sr" ? `Odgovor za ${node.authorName}` : `Reply to ${node.authorName}`}</label><textarea id={`reply-${node._id}`} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder={locale === "sr" ? "Napiši odgovor…" : "Write a reply…"} rows={2} className="min-h-11 w-full resize-y rounded-[12px] border border-line bg-paper-strong px-3 py-2.5 pl-9 text-xs font-bold leading-5 text-ink outline-none focus:border-ink focus:ring-2 focus:ring-yellow/15" autoFocus /></div><button type="submit" disabled={busy !== null || !replyText.trim()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black text-ink shadow-[2px_2px_0_var(--shadow-hard-16)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0.5 active:shadow-none disabled:opacity-50" aria-label={locale === "sr" ? "Pošalji odgovor" : "Send reply"}>{busy === "reply" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}</button></form> : null}
      </article>
      {hasReplies && repliesRequested ? <CommentReplies id={`replies-${node._id}`} postId={postId} parentId={node._id} locale={locale} isAuthenticated={isAuthenticated} canModerate={canModerate} canMarkHelpful={canMarkHelpful} canInteract={canInteract} viewerUserId={viewerUserId} depth={depth + 1} collapseSignal={collapseSignal} expandLoadedSignal={expandLoadedSignal} isExpanded={isExpanded} onReact={onReact} onSetHelpful={onSetHelpful} onDelete={onDelete} onReply={onReply} onError={onError} /> : null}
    </div>
  );
}

function CommentReplies({ id, postId, parentId, locale, isAuthenticated, canModerate, canMarkHelpful, canInteract, viewerUserId, depth, collapseSignal, expandLoadedSignal, isExpanded, onReact, onSetHelpful, onDelete, onReply, onError }: { id: string; postId: string; parentId: string; locale: Locale; isAuthenticated: boolean; canModerate: boolean; canMarkHelpful: boolean; canInteract: boolean; viewerUserId?: string; depth: number; collapseSignal: number; expandLoadedSignal: number; isExpanded: boolean; onReact: (commentId: string, vote: "upvote" | "downvote") => Promise<unknown>; onSetHelpful: (commentId: string, helpful: boolean) => Promise<unknown>; onDelete: (commentId: string) => void; onReply: (commentId: string, text: string) => Promise<unknown>; onError: () => void }) {
  const repliesQuery = usePaginatedQuery(api.community.listRepliesPage, isAuthenticated ? { postId: postId as Id<"communityPosts">, parentId: parentId as Id<"comments"> } : "skip", { initialNumItems: 3 });
  const replies = repliesQuery.results as FlatComment[];
  return <div id={id} hidden={!isExpanded} className={cn("mt-3 space-y-3", depth <= 4 && "border-l-2 border-ink/20 pl-3 md:pl-4 ms-[calc(var(--comment-depth)*10px)] md:ms-[calc(var(--comment-depth)*12px)]")} style={{ "--comment-depth": depth } as CSSProperties}>{repliesQuery.status === "LoadingFirstPage" ? <div className="flex items-center gap-2 py-3 text-xs font-bold text-muted"><Loader2 className="size-4 animate-spin" />{locale === "sr" ? "Učitavanje odgovora…" : "Loading replies…"}</div> : replies.map((reply) => <CommentItem key={reply._id} node={reply} depth={depth} locale={locale} isAuthenticated={isAuthenticated} canModerate={canModerate} canMarkHelpful={canMarkHelpful} canInteract={canInteract} viewerUserId={viewerUserId} postId={postId} collapseSignal={collapseSignal} expandLoadedSignal={expandLoadedSignal} isExpanded={false} onReact={onReact} onSetHelpful={onSetHelpful} onDelete={onDelete} onReply={onReply} onError={onError} />)}{repliesQuery.status === "CanLoadMore" || repliesQuery.status === "LoadingMore" ? <button type="button" onClick={() => repliesQuery.loadMore(5)} disabled={repliesQuery.status === "LoadingMore"} className="inline-flex min-h-9 items-center justify-center rounded-full border border-line bg-paper-strong px-3 text-xs font-black text-ink transition hover:border-ink disabled:opacity-60">{repliesQuery.status === "LoadingMore" ? locale === "sr" ? "Učitavanje…" : "Loading…" : locale === "sr" ? "Prikaži još" : "Show more"}</button> : null}</div>;
}
