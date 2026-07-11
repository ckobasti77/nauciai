"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CircleAlert,
  GraduationCap,
  Globe2,
  Loader2,
  MessageCircle,
  Pencil,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { CommentsSection } from "@/components/app/community-comments";
import { CommunityAvatar, formatCommunityTime } from "@/components/app/community-identity";
import { CommunityPostEditor, type CommunityEditorPost } from "@/components/app/community-post-editor";
import { CommunityThreadActions } from "@/components/app/community-thread-actions";
import { Panel, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

type ScopePost = {
  courseId?: string;
  trackId?: string;
  courseTitleSr?: string;
  courseTitleEn?: string;
  trackTitleSr?: string;
  trackTitleEn?: string;
};

type ScopeTrack = {
  _id: string;
  titleSr: string;
  titleEn: string;
  courses: Array<{ _id: string }>;
};

function scopeLabel(post: ScopePost, locale: Locale, tracks: ScopeTrack[] = []) {
  const courseTitle = locale === "sr" ? post.courseTitleSr ?? post.courseTitleEn : post.courseTitleEn ?? post.courseTitleSr;
  const track = tracks.find(
    (item) => item._id === post.trackId || Boolean(post.courseId && item.courses.some((course) => course._id === post.courseId)),
  );
  const trackTitle = track
    ? locale === "sr"
      ? track.titleSr
      : track.titleEn
    : locale === "sr"
      ? post.trackTitleSr ?? post.trackTitleEn
      : post.trackTitleEn ?? post.trackTitleSr;
  if (trackTitle && courseTitle) return `${trackTitle} → ${courseTitle}`;
  if (courseTitle) return courseTitle;
  if (trackTitle) return trackTitle;
  return locale === "sr" ? "Globalna diskusija" : "Global discussion";
}

function scopeIcon(post: ScopePost) {
  return post.courseId || post.trackId ? <GraduationCap className="size-4" /> : <Globe2 className="size-4" />;
}

function statusLabel(status: string | undefined, locale: Locale) {
  if (status === "draft") return locale === "sr" ? "Skica" : "Draft";
  if (status === "pending") return locale === "sr" ? "Na odobrenju" : "Pending review";
  if (status === "changes_requested") return locale === "sr" ? "Potrebne izmene" : "Changes requested";
  return locale === "sr" ? "Objavljeno" : "Published";
}

export function LiveCommunityThreadPage({
  locale,
  postId,
}: {
  locale: Locale;
  postId: string;
}) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const viewerData = useQuery(api.courses.viewer, isAuthenticated ? {} : "skip");
  const communityFilters = useQuery(api.community.getCommunityFilters, isAuthenticated ? {} : "skip");
  const viewerProfile = viewerData?.profile;
  const post = useQuery(
    api.community.getPostDetail,
    isAuthenticated ? { postId: postId as Id<"communityPosts"> } : "skip",
  );
  const toggleFavorite = useMutation(api.community.toggleFavorite);
  const markPostNotificationsAsRead = useMutation(api.notifications.markPostNotificationsAsRead);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !post?._id) return;
    void markPostNotificationsAsRead({ postId: post._id as Id<"communityPosts"> });
  }, [isAuthenticated, markPostNotificationsAsRead, post?._id]);

  if (authLoading || (isAuthenticated && (post === undefined || viewerData === undefined || communityFilters === undefined))) {
    return <ThreadLoading locale={locale} />;
  }

  if (!post || !viewerProfile) {
    return <ThreadUnavailable locale={locale} />;
  }

  const isAuthor = post.authorId === viewerProfile.userId;
  const canModerate = post.viewerRole === "admin" || post.viewerRole === "moderator";
  const pinned = Boolean(post.isFeaturedGlobal || post.featuredTrackId || post.featuredCourseId);
  const scope = scopeLabel(post, locale, communityFilters?.tracks ?? []);

  async function handleToggleFavorite() {
    if (!isAuthenticated || favoriteBusy) return;
    if (!viewerProfile?.username) {
      setFavoriteError(locale === "sr" ? "Podesi username na Profilu da bi sačuvao/la diskusiju." : "Set a username in Profile to save this discussion.");
      return;
    }
    setFavoriteBusy(true);
    setFavoriteError(null);
    try {
      await toggleFavorite({ postId: postId as Id<"communityPosts"> });
    } catch (caughtError) {
      console.error(caughtError);
      setFavoriteError(
        locale === "sr"
          ? "Tred nije sačuvan. Proveri vezu i pokušaj ponovo."
          : "The thread was not saved. Check your connection and try again.",
      );
    } finally {
      setFavoriteBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={withLocale(locale, "/app/community/discussions")}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-black text-ink transition hover:border-ink hover:bg-yellow/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <ArrowLeft className="size-4" />
          {locale === "sr" ? "Nazad na diskusije" : "Back to discussions"}
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isAuthor ? (
            <Link
              href={withLocale(locale, `/app/community/${postId}/edit`)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-black text-ink transition hover:border-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Pencil className="size-4" />
              {locale === "sr" ? "Izmeni" : "Edit"}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={handleToggleFavorite}
            disabled={favoriteBusy}
            aria-pressed={Boolean(post.isFavorited)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-white px-4 text-sm font-black text-ink shadow-[3px_3px_0_rgba(14,49,88,0.14)] transition hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60"
          >
            {favoriteBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : post.isFavorited ? (
              <BookmarkCheck className="size-4 fill-yellow text-ink" />
            ) : (
              <Bookmark className="size-4" />
            )}
            {post.isFavorited
              ? locale === "sr"
                ? "Sačuvano"
                : "Saved"
              : locale === "sr"
                ? "Sačuvaj"
                : "Save"}
          </button>
        </div>
      </div>

      {favoriteError ? (
        <p role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          {favoriteError}
        </p>
      ) : null}

      {post.status === "changes_requested" ? (
        <div className="flex items-start gap-3 rounded-[16px] border-2 border-amber-500 bg-amber-50 p-4 text-amber-950">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-black">{locale === "sr" ? "Moderator traži izmene" : "A moderator requested changes"}</p>
            <p className="mt-1 text-sm font-semibold leading-6">
              {post.moderationReason ||
                (locale === "sr"
                  ? "Otvori editor, proveri sadržaj i pošalji novu verziju na odobrenje."
                  : "Open the editor, review the content, and submit a new version for approval.")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-5">
          <Panel as="article" className="overflow-hidden rounded-[16px] border-2 border-ink bg-white shadow-[6px_6px_0_rgba(14,49,88,0.13)]">
            <header className="relative border-b border-line bg-paper/55 px-5 py-6 md:px-8 md:py-8">
              <div aria-hidden="true" className="absolute bottom-0 left-8 top-0 hidden w-px bg-ink/15 md:block" />
              <div className="relative mx-auto max-w-[720px]">
                <div className="flex items-start gap-3">
                  <CommunityAvatar
                    name={post.authorName}
                    avatarUrl={post.authorAvatarUrl}
                    role={post.authorRole}
                    rank={post.authorRank}
                    locale={locale}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-sm font-black text-ink">{post.authorUsername ? `@${post.authorUsername}` : post.authorName}</p>
                      {post.authorUsername ? <p className="truncate text-xs font-semibold text-muted">{post.authorName}</p> : null}
                      <span aria-hidden="true" className="hidden text-line sm:inline">•</span>
                      <time dateTime={new Date(post.createdAt).toISOString()} className="text-xs font-bold text-ink/55">
                        {formatCommunityTime(post.createdAt, locale)}
                      </time>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-line bg-white px-3 text-xs font-black text-ink/70">
                        {scopeIcon(post)}
                        {scope}
                      </span>
                      {pinned ? (
                        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-ink bg-yellow px-3 text-xs font-black text-ink">
                          <Star className="size-3.5 fill-ink" />
                          {locale === "sr" ? "Mentorski izbor" : "Mentor pick"}
                        </span>
                      ) : null}
                      {post.status && post.status !== "published" ? (
                        <span className="inline-flex min-h-8 items-center rounded-full border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-900">
                          {statusLabel(post.status, locale)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <h1 className="mt-6 text-3xl font-black leading-[1.08] tracking-[-0.025em] text-ink md:text-5xl">{post.title}</h1>
              </div>
            </header>

            <div className="px-5 py-7 md:px-8 md:py-9">
              <div className="mx-auto max-w-[720px]">
                <p className="whitespace-pre-wrap text-[17px] font-semibold leading-8 text-ink/82">{post.body}</p>
                {post.imageUrl ? (
                  <div className="mt-8 overflow-hidden rounded-[8px] border border-line bg-paper p-1.5">
                    <Image
                      src={post.imageUrl}
                      alt={locale === "sr" ? `Prilog uz tred „${post.title}”` : `Attachment for “${post.title}”`}
                      width={1440}
                      height={900}
                      unoptimized
                      className="h-auto max-h-[560px] w-full rounded-[8px] object-contain"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel id="comments" className="rounded-[16px] border border-line bg-white p-4 shadow-none md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg text-ink">{locale === "sr" ? "Razmena znanja" : "Knowledge exchange"}</p>
                <h2 className="text-2xl font-black text-ink">{locale === "sr" ? "Komentari" : "Comments"}</h2>
              </div>
              <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-line bg-paper px-3 text-xs font-black text-ink/65">
                <MessageCircle className="size-4" />
                {post.commentsCount}
              </span>
            </div>
            <CommentsSection
              postId={post._id}
              locale={locale}
              isAuthenticated={isAuthenticated}
              canModerate={canModerate}
              canMarkHelpful={isAuthor || canModerate}
              canInteract={Boolean(viewerProfile.username)}
              viewerUserId={viewerProfile.userId}
            />
          </Panel>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Panel as="aside" className="rounded-[16px] border border-line bg-white p-4 shadow-none">
            <p className="font-display text-lg text-ink">{locale === "sr" ? "Learning spine" : "Learning spine"}</p>
            <dl className="mt-3 space-y-2 text-sm">
              <MetaRow label={locale === "sr" ? "Opseg" : "Scope"} value={scope} icon={scopeIcon(post)} />
              <MetaRow label={locale === "sr" ? "Status" : "Status"} value={statusLabel(post.status, locale)} />
              <MetaRow
                label={locale === "sr" ? "Istaknuto" : "Pinned"}
                value={pinned ? (locale === "sr" ? "Da" : "Yes") : locale === "sr" ? "Ne" : "No"}
                icon={<Star className={cn("size-4", pinned && "fill-ink")} />}
              />
            </dl>
            <div className="mt-5 border-t border-line pt-4">
              <CommunityThreadActions
                locale={locale}
                postId={post._id}
                courseId={post.courseId}
                trackId={post.trackId}
                isFeaturedGlobal={post.isFeaturedGlobal}
                featuredTrackId={post.featuredTrackId}
                featuredCourseId={post.featuredCourseId}
                reactionsCount={post.reactionsCount}
                voteScore={post.voteScore}
                commentsCount={post.commentsCount}
                userReaction={post.userReaction}
                userVote={post.userVote}
                viewerRole={post.viewerRole}
              />
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

export function LiveCommunityThreadEditorPage({ locale, postId }: { locale: Locale; postId: string }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const viewerData = useQuery(api.courses.viewer, isAuthenticated ? {} : "skip");
  const post = useQuery(
    api.community.getPostDetail,
    isAuthenticated ? { postId: postId as Id<"communityPosts"> } : "skip",
  );

  if (authLoading || (isAuthenticated && (viewerData === undefined || post === undefined))) {
    return <ThreadLoading locale={locale} />;
  }

  if (!post || !viewerData?.profile || post.authorId !== viewerData.profile.userId) {
    return (
      <Panel className="mx-auto max-w-xl rounded-[16px] border border-line bg-white p-7 text-center shadow-none">
        <CircleAlert className="mx-auto size-9 text-amber-600" />
        <h1 className="mt-4 text-2xl font-black text-ink">
          {locale === "sr" ? "Editor nije dostupan" : "Editor is not available"}
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">
          {locale === "sr"
            ? "Samo autor može da menja ovaj tred. Vrati se na čitački prikaz."
            : "Only the author can edit this thread. Return to the reader view."}
        </p>
        <Link
          href={withLocale(locale, `/app/community/${postId}`)}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink"
        >
          {locale === "sr" ? "Otvori tred" : "Open thread"}
        </Link>
      </Panel>
    );
  }

  return <CommunityPostEditor locale={locale} mode="edit" postId={postId} initialPost={post as CommunityEditorPost} />;
}

function ThreadLoading({ locale }: { locale: Locale }) {
  return (
    <div className="grid min-h-96 place-items-center" aria-busy="true" aria-label={locale === "sr" ? "Učitavanje treda" : "Loading thread"}>
      <Loader2 className="size-9 animate-spin text-yellow motion-reduce:animate-none" />
    </div>
  );
}

function ThreadUnavailable({ locale }: { locale: Locale }) {
  return (
    <Panel className="mx-auto max-w-xl rounded-[16px] border border-line bg-white p-7 text-center shadow-none">
      <CircleAlert className="mx-auto size-9 text-amber-600" />
      <h1 className="mt-4 text-2xl font-black text-ink">{locale === "sr" ? "Tred nije dostupan" : "Thread unavailable"}</h1>
      <p className="mt-2 text-sm font-semibold leading-6 text-muted">
        {locale === "sr"
          ? "Tred je obrisan, još nije objavljen ili nemaš pristup njegovom kursu."
          : "The thread was deleted, is not published yet, or belongs to a course you cannot access."}
      </p>
      <Link
        href={withLocale(locale, "/app/community/discussions")}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink"
      >
        <ArrowLeft className="size-4" />
        {locale === "sr" ? "Nazad na diskusije" : "Back to discussions"}
      </Link>
    </Panel>
  );
}

function MetaRow({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[12px] border border-line bg-paper/55 px-3 py-2.5">
      <dt className="pt-0.5 text-[11px] font-black uppercase tracking-[0.06em] text-ink/45">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right text-xs font-black text-ink">
        {icon ? <span className="mt-0.5 shrink-0 text-ink/65">{icon}</span> : null}
        <span>{value}</span>
      </dd>
    </div>
  );
}
