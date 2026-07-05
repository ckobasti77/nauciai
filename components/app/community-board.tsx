"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { CornerDownRight, Loader2, MessageCircle, Send, ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";

import { Panel, SectionHeader } from "@/components/ui/primitives";
import { communityPosts } from "@/lib/content";
import { localized, type Locale } from "@/lib/i18n";

// Typings for frontend mapping
interface FlatComment {
  _id: string;
  postId: string;
  parentId?: string;
  body: string;
  createdAt: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorAvatarUrl?: string;
  reactionsCount: number;
  userReaction?: string;
}

interface CommentNode extends FlatComment {
  replies: CommentNode[];
}

function formatTime(timestamp: number, locale: Locale) {
  const date = new Date(timestamp);
  return date.toLocaleDateString(locale === "sr" ? "sr-RS" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CommunityBoard({ locale }: { locale: Locale }) {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <LiveCommunityBoard locale={locale} />;
  }

  return <StaticCommunityBoard locale={locale} />;
}

function StaticCommunityBoard({ locale }: { locale: Locale }) {
  const [posts, setPosts] = useState(communityPosts);
  const [draft, setDraft] = useState("");

  function addPost() {
    if (!draft.trim()) return;
    setPosts((current) => [
      {
        id: `local-${Date.now()}`,
        author: "Nikola Jovanović",
        role: "student",
        title: {
          sr: "Pitanje iz lekcije",
          en: "Lesson question",
        },
        body: { sr: draft, en: draft },
        reactions: 0,
        comments: 0,
      },
      ...current,
    ]);
    setDraft("");
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title={locale === "sr" ? "Zajednica" : "Community"}
        body={
          locale === "sr"
            ? "Postovi, komentari i reakcije za studente sa aktivnim pristupom."
            : "Posts, comments, and reactions for students with active access."
        }
      />
      <Panel className="p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] border-2 border-ink bg-white">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          className="w-full resize-none rounded-[10px] border-2 border-ink bg-white p-4 text-base font-bold text-ink outline-none transition focus:border-yellow focus:ring-2 focus:ring-yellow/20"
          placeholder={locale === "sr" ? "Podeli workflow, pitanje ili rezultat..." : "Share a workflow, question, or result..."}
        />
        <button
          type="button"
          onClick={addPost}
          className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border-2 border-ink bg-yellow px-6 text-sm font-black text-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all duration-150"
        >
          <Send className="size-4" />
          {locale === "sr" ? "Objavi" : "Post"}
        </button>
      </Panel>
      <div className="space-y-6">
        {posts.map((post) => (
          <Panel key={post.id} as="article" className="p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] border-2 border-ink bg-white transition hover:-translate-y-0.5 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] duration-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-ink/65">{post.author}</p>
                <h2 className="mt-1 text-2xl font-black text-ink">{localized(post.title, locale)}</h2>
              </div>
              <span className="rounded-[8px] border-2 border-ink bg-paper px-3 py-1 text-xs font-black text-ink">
                {post.role}
              </span>
            </div>
            <p className="mt-4 text-base leading-7 text-muted">{localized(post.body, locale)}</p>
            <div className="mt-5 flex gap-4 text-sm font-extrabold text-ink">
              <span className="inline-flex items-center gap-2">
                <ThumbsUp className="size-4" />
                {post.reactions}
              </span>
              <span className="inline-flex items-center gap-2">
                <MessageCircle className="size-4" />
                {post.comments}
              </span>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function LiveCommunityBoard({ locale }: { locale: Locale }) {
  const { isAuthenticated } = useConvexAuth();
  const viewerData = useQuery(api.courses.viewer, {});
  const livePosts = useQuery(api.community.listPosts, {});
  const createPost = useMutation(api.community.createPost);
  const reactPost = useMutation(api.community.react);
  const deletePost = useMutation(api.community.deletePost);

  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

  const isAdmin = viewerData?.profile?.role === "admin";

  async function addPost() {
    if (!draft.trim()) return;
    if (!isAuthenticated) {
      setStatus(locale === "sr" ? "Prijavi se da objaviš post." : "Sign in to publish a post.");
      return;
    }

    try {
      await createPost({
        language: locale,
        title: locale === "sr" ? "Pitanje iz lekcije" : "Lesson question",
        body: draft,
      });
      setDraft("");
      setStatus(locale === "sr" ? "Objavljeno u Convex." : "Published to Convex.");
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : locale === "sr" ? "Objava nije uspela." : "Post failed.");
    }
  }

  async function handleLike(postId: string) {
    if (!isAuthenticated) return;
    await reactPost({
      targetType: "post",
      targetId: postId,
      reaction: "like",
    });
  }

  async function handleDeletePost(postId: string) {
    const confirmMsg = locale === "sr"
      ? "Da li ste sigurni da želite da obrišete ovaj post?"
      : "Are you sure you want to delete this post?";
    if (window.confirm(confirmMsg)) {
      await deletePost({ postId: postId as Id<"communityPosts"> });
    }
  }

  function toggleComments(postId: string) {
    setExpandedComments((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title={locale === "sr" ? "Zajednica" : "Community"}
        body={
          locale === "sr"
            ? "Postovi, komentari i reakcije za studente sa aktivnim pristupom."
            : "Posts, comments, and reactions for students with active access."
        }
      />
      
      {/* Create Post Form */}
      <Panel className="p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] border-2 border-ink bg-white">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          className="w-full resize-none rounded-[10px] border-2 border-ink bg-white p-4 text-base font-bold text-ink outline-none transition focus:border-yellow focus:ring-4 focus:ring-yellow/10"
          placeholder={locale === "sr" ? "Podeli workflow, pitanje ili rezultat..." : "Share a workflow, question, or result..."}
          disabled={!isAuthenticated}
        />
        <button
          type="button"
          onClick={addPost}
          disabled={!isAuthenticated}
          className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border-2 border-ink bg-yellow px-6 text-sm font-black text-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all duration-150 disabled:opacity-50"
        >
          <Send className="size-4 animate-bounce" />
          {locale === "sr" ? "Objavi" : "Post"}
        </button>
        {status ? <p className="mt-3 text-sm font-black text-muted-foreground">{status}</p> : null}
      </Panel>

      {/* Posts List */}
      <div className="space-y-6">
        {!livePosts ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-10 animate-spin text-yellow" />
          </div>
        ) : livePosts.length === 0 ? (
          <Panel className="p-12 text-center text-ink/65 font-black border-2 border-ink rounded-[12px] bg-paper/50">
            {locale === "sr" ? "Nema objava u zajednici." : "No community posts yet."}
          </Panel>
        ) : (
          livePosts.map((post) => {
            const isLiked = post.userReaction === "like";
            const showComments = !!expandedComments[post._id];

            return (
              <Panel
                key={post._id}
                as="article"
                className="p-6 space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] border-2 border-ink bg-white transition hover:-translate-y-0.5 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] duration-200 rounded-[12px] overflow-hidden"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-ink">{post.authorName}</span>
                      <span
                        className={`rounded-[6px] border-2 border-ink px-2 py-0.5 text-[10px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                          post.authorRole === "admin"
                            ? "bg-yellow text-ink"
                            : "bg-paper text-ink/70"
                        }`}
                      >
                        {post.authorRole}
                      </span>
                      <span className="text-xs font-bold text-ink/60">
                        • {formatTime(post.createdAt, locale)}
                      </span>
                    </div>
                    <h2 className="text-2xl font-black text-ink leading-tight mt-1">{post.title}</h2>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeletePost(post._id)}
                      className="text-red-500 hover:text-red-700 hover:scale-110 active:scale-95 transition-all p-2 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200"
                      title={locale === "sr" ? "Obriši objavu" : "Delete post"}
                    >
                      <Trash2 className="size-5" />
                    </button>
                  )}
                </div>
                
                <p className="text-base leading-7 text-ink/80 whitespace-pre-wrap font-medium">{post.body}</p>
                
                <div className="flex items-center gap-4 pt-2 text-sm font-black text-ink">
                  {/* Like Button */}
                  <button
                    onClick={() => handleLike(post._id)}
                    disabled={!isAuthenticated}
                    className={`group inline-flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 transition-all duration-150 py-1.5 px-4 rounded-[8px] border-2 border-ink bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none hover:bg-yellow/10 ${
                      isLiked ? "bg-yellow shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow" : ""
                    }`}
                  >
                    <ThumbsUp className={`size-4 group-hover:scale-110 transition ${isLiked ? "fill-ink text-ink" : ""}`} />
                    <span>{post.reactionsCount}</span>
                  </button>

                  {/* Comments Toggle Button */}
                  <button
                    onClick={() => toggleComments(post._id)}
                    className={`inline-flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 transition-all duration-150 py-1.5 px-4 rounded-[8px] border-2 border-ink bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none hover:bg-ink/5 ${
                      showComments ? "bg-paper shadow-none translate-x-[2px] translate-y-[2px]" : ""
                    }`}
                  >
                    <MessageCircle className="size-4" />
                    <span>{post.commentsCount}</span>
                  </button>
                </div>

                {/* Expanded Comments Panel with Slide Down Effect */}
                {showComments && (
                  <div className="border-t-2 border-ink/40 pt-5 mt-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <CommentsSection
                      postId={post._id}
                      locale={locale}
                      isAuthenticated={isAuthenticated}
                      isAdmin={isAdmin}
                    />
                  </div>
                )}
              </Panel>
            );
          })
        )}
      </div>
    </div>
  );
}

function CommentsSection({
  postId,
  locale,
  isAuthenticated,
  isAdmin,
}: {
  postId: string;
  locale: Locale;
  isAuthenticated: boolean;
  isAdmin: boolean;
}) {
  const comments = useQuery(api.community.getPostComments, { postId: postId as Id<"communityPosts"> });
  const addComment = useMutation(api.community.addComment);
  const reactComment = useMutation(api.community.react);
  const deleteComment = useMutation(api.community.deleteComment);

  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAddRootComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addComment({
        postId: postId as Id<"communityPosts">,
        body: commentText,
      });
      setCommentText("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Construct Tree from flat comment list
  const commentTree = comments ? buildCommentTree(comments) : [];

  return (
    <div className="space-y-5">
      {/* Root Comment Form */}
      {isAuthenticated && (
        <form onSubmit={handleAddRootComment} className="flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={locale === "sr" ? "Napiši komentar..." : "Write a comment..."}
            className="flex-1 min-h-11 rounded-[8px] border-2 border-ink bg-white px-4 text-sm font-bold text-ink outline-none transition focus:border-yellow focus:ring-4 focus:ring-yellow/10"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-h-11 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow px-5 text-sm font-black text-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all"
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      )}

      {/* Threaded Comments Rendering */}
      {!comments ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-6 animate-spin text-yellow" />
        </div>
      ) : commentTree.length === 0 ? (
        <p className="text-sm font-black text-ink/50 py-3 bg-paper/30 rounded-lg text-center border-2 border-dashed border-ink/20">
          {locale === "sr" ? "Još uvek nema komentara na ovu objavu." : "No comments on this post yet."}
        </p>
      ) : (
        <div className="space-y-4">
          {commentTree.map((node) => (
            <CommentItem
              key={node._id}
              node={node}
              locale={locale}
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              onReact={async (cid) => {
                await reactComment({
                  targetType: "comment",
                  targetId: cid,
                  reaction: "like",
                });
              }}
              onDelete={async (cid) => {
                const confirmMsg = locale === "sr"
                  ? "Da li ste sigurni da želite da obrišete ovaj komentar i sve njegove odgovore?"
                  : "Are you sure you want to delete this comment and all its replies?";
                if (window.confirm(confirmMsg)) {
                  await deleteComment({ commentId: cid as Id<"comments"> });
                }
              }}
              onReply={async (cid, text) => {
                await addComment({
                  postId: postId as Id<"communityPosts">,
                  parentId: cid as Id<"comments">,
                  body: text,
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentItem({
  node,
  locale,
  isAuthenticated,
  isAdmin,
  onReact,
  onDelete,
  onReply,
}: {
  node: CommentNode;
  locale: Locale;
  isAuthenticated: boolean;
  isAdmin: boolean;
  onReact: (commentId: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onReply: (commentId: string, text: string) => Promise<void>;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLiked = node.userReaction === "like";

  async function handleAddReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onReply(node._id, replyText);
      setReplyText("");
      setShowReplyForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-left-2 duration-200">
      <div className="group border-2 border-ink bg-paper/50 rounded-[10px] p-4 relative transition hover:border-ink/80 hover:bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-ink">{node.authorName}</span>
            <span
              className={`rounded-[4px] border border-ink px-1.5 py-0.2 text-[8px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                node.authorRole === "admin"
                  ? "bg-yellow text-ink"
                  : "bg-paper text-ink/75"
              }`}
            >
              {node.authorRole}
            </span>
            <span className="text-[10px] font-bold text-ink/50">
              {formatTime(node.createdAt, locale)}
            </span>
          </div>
          {isAdmin && (
            <button
              onClick={() => onDelete(node._id)}
              className="text-red-500 hover:text-red-700 hover:scale-110 transition p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded"
              title={locale === "sr" ? "Obriši komentar" : "Delete comment"}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>

        <p className="mt-2 text-sm text-ink font-semibold leading-relaxed whitespace-pre-wrap">{node.body}</p>

        <div className="mt-3 flex items-center gap-4 text-xs font-black text-ink">
          {/* Comment Like Button */}
          <button
            onClick={() => onReact(node._id)}
            disabled={!isAuthenticated}
            className={`inline-flex items-center gap-1.5 hover:text-yellow-600 transition-all active:scale-90 border border-ink/30 px-2 py-0.5 rounded bg-white hover:bg-yellow/10 ${
              isLiked ? "text-yellow-600 bg-yellow/10 border-yellow-600/50" : ""
            }`}
          >
            <ThumbsUp className={`size-3.5 ${isLiked ? "fill-yellow-600 text-yellow-600" : ""}`} />
            <span>{node.reactionsCount}</span>
          </button>

          {/* Comment Reply Button */}
          {isAuthenticated && (
            <button
              onClick={() => setShowReplyForm(!showReplyForm)}
              className={`hover:underline transition text-ink/60 hover:text-ink ${
                showReplyForm ? "text-yellow font-black" : ""
              }`}
            >
              {locale === "sr" ? "Odgovori" : "Reply"}
            </button>
          )}
        </div>

        {/* Reply form */}
        {showReplyForm && (
          <form onSubmit={handleAddReply} className="mt-3 flex gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex-1 relative flex items-center">
              <CornerDownRight className="size-4 text-ink/60 absolute left-3" />
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={locale === "sr" ? "Napiši odgovor..." : "Write a reply..."}
                className="w-full min-h-9 pl-9 rounded-[8px] border-2 border-ink bg-white px-3 text-xs font-bold text-ink outline-none focus:border-yellow focus:ring-2 focus:ring-yellow/10"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-9 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow px-4 text-xs font-black text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            </button>
          </form>
        )}
      </div>

      {/* Render nested replies recursively with linking indicator lines */}
      {node.replies.length > 0 && (
        <div className="ml-4 sm:ml-6 border-l-2 border-ink/20 pl-4 sm:pl-6 space-y-3 relative hover:border-ink/40 transition-colors duration-200">
          {node.replies.map((reply) => (
            <CommentItem
              key={reply._id}
              node={reply}
              locale={locale}
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              onReact={onReact}
              onDelete={onDelete}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Tree building helper
function buildCommentTree(flatComments: FlatComment[]): CommentNode[] {
  const map: Record<string, CommentNode> = {};
  flatComments.forEach((c) => {
    map[c._id] = { ...c, replies: [] };
  });

  const root: CommentNode[] = [];
  flatComments.forEach((c) => {
    if (c.parentId) {
      if (map[c.parentId]) {
        map[c.parentId].replies.push(map[c._id]);
      }
    } else {
      root.push(map[c._id]);
    }
  });

  // Sort replies oldest first, root comments newest first
  const sortReplies = (node: CommentNode) => {
    node.replies.sort((a, b) => a.createdAt - b.createdAt);
    node.replies.forEach(sortReplies);
  };

  root.sort((a, b) => b.createdAt - a.createdAt);
  root.forEach(sortReplies);

  return root;
}
