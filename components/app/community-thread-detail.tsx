"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  CircleAlert,
  ExternalLink,
  GraduationCap,
  Globe2,
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
import { RichTextContent } from "@/components/app/rich-text";
import { ShareThreadButton } from "@/components/app/community-v2/community-share";
import { COMMUNITY_RICH_TEXT } from "@/lib/rich-text";
import { Panel, cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { t, withLocale } from "@/lib/i18n";

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
      setFavoriteError(locale === "sr" ? "Izaberi korisničko ime na Profilu da bi mogao/la da sačuvaš diskusiju." : "Set a username in Profile to save this discussion.");
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
          ? "Tema nije sačuvana. Proveri internet i pokušaj ponovo."
          : "The topic was not saved. Check your connection and try again.",
      );
    } finally {
      setFavoriteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={withLocale(locale, "/app/community/discussions")}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper-strong px-4 text-sm font-black text-ink transition hover:border-ink hover:bg-yellow/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <ArrowLeft className="size-4" />
          {locale === "sr" ? "Nazad na diskusije" : "Back to discussions"}
        </Link>

        {isAuthor ? (
          <Link
            href={withLocale(locale, `/app/community/${postId}/edit`)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper-strong px-4 text-sm font-black text-ink transition hover:border-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <Pencil className="size-4" />
            {locale === "sr" ? "Izmeni" : "Edit"}
          </Link>
        ) : null}
      </div>

      {post.status === "changes_requested" ? (
        <div className="flex items-start gap-3 rounded-[16px] border-2 border-amber-500 bg-amber-50 p-4 text-amber-950">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-black">{locale === "sr" ? "Moderator traži izmene" : "A moderator requested changes"}</p>
            <p className="mt-1 type-body-sm font-semibold">
              {post.moderationReason ||
                (locale === "sr"
                  ? "Otvori editor, proveri sadržaj i pošalji novu verziju na odobrenje."
                  : "Open the editor, review the content, and submit a new version for approval.")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-6">
          <Panel as="article" className="overflow-hidden rounded-[16px] border-2 border-ink bg-paper-strong shadow-[6px_6px_0_var(--shadow-hard-13)]">
            <header className="relative border-b border-line bg-paper/55 px-5 py-6 md:px-8 md:py-8">
              <div aria-hidden="true" className="absolute bottom-0 left-8 top-0 hidden w-px bg-ink/15 md:block" />
              <div className="relative mx-auto max-w-[720px]">
                <div className="flex items-start gap-3">
                  <Link href={post.authorUsername ? withLocale(locale, `/app/members/${post.authorUsername}`) : "#"} aria-disabled={!post.authorUsername} className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                    <CommunityAvatar
                      name={post.authorName}
                      avatarUrl={post.authorAvatarUrl}
                      role={post.authorRole}
                      rank={post.authorRank}
                      locale={locale}
                      size="md"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      {post.authorUsername ? <Link href={withLocale(locale, `/app/members/${post.authorUsername}`)} className="truncate text-sm font-black text-ink hover:underline">@{post.authorUsername}</Link> : <p className="truncate text-sm font-black text-ink">{post.authorName}</p>}
                      {post.authorUsername ? <p className="truncate text-xs font-semibold text-muted">{post.authorName}</p> : null}
                      <span aria-hidden="true" className="hidden text-line sm:inline">•</span>
                      <time dateTime={new Date(post.createdAt).toISOString()} className="text-xs font-bold text-ink/55">
                        {formatCommunityTime(post.createdAt, locale)}
                      </time>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-line bg-paper-strong px-3 text-xs font-black text-ink/70">
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
                <h1 className="mt-6 type-hero text-ink break-words">{post.title}</h1>
              </div>
            </header>

            <div className="px-5 py-7 md:px-8 md:py-9">
              <div className="mx-auto max-w-[720px]">
                <RichTextContent
                  value={post.bodyRich}
                  fallback={post.body}
                  config={COMMUNITY_RICH_TEXT}
                  images={post.bodyRichImageUrls}
                  locale={locale}
                  className="type-reading type-measure font-semibold text-ink/82"
                />
                {post.imageUrl ? (
                  <div className="mt-8 overflow-hidden rounded-[8px] border border-line bg-paper p-1.5">
                    <Image
                      src={post.imageUrl}
                      alt={locale === "sr" ? `Slika uz temu „${post.title}”` : `Attachment for “${post.title}”`}
                      width={1440}
                      height={900}
                      unoptimized
                      className="h-auto max-h-[560px] w-full rounded-[8px] object-contain"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <footer className="border-t border-line bg-paper/55 px-5 py-4 md:px-8">
              <div className="mx-auto flex max-w-[720px] flex-wrap items-center gap-2">
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
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  disabled={favoriteBusy}
                  aria-pressed={Boolean(post.isFavorited)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-line bg-paper-strong px-3 text-xs font-black text-ink transition hover:border-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60"
                >
                  {favoriteBusy ? (
                    <Spinner />
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
                <ShareThreadButton
                  locale={locale}
                  title={post.title}
                  body={post.body}
                  threadHref={withLocale(locale, `/app/community/${post._id}`)}
                  variant="labeled"
                />
              </div>
              {favoriteError ? (
                <p role="alert" className="mx-auto mt-3 max-w-[720px] rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">
                  {favoriteError}
                </p>
              ) : null}
            </footer>
          </Panel>

          <Panel id="comments" className="rounded-[16px] border border-line bg-paper-strong p-4 shadow-none md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="type-eyebrow text-ink">{locale === "sr" ? "Razmena znanja" : "Knowledge exchange"}</p>
                <h2 className="type-h2 text-ink">{locale === "sr" ? "Komentari" : "Comments"}</h2>
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
        </section>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <ThreadAuthorCard
            locale={locale}
            name={post.authorName}
            username={post.authorUsername}
            avatarUrl={post.authorAvatarUrl}
            role={post.authorRole}
            bio={post.authorBio}
            joinedAt={post.authorJoinedAt}
            lastSeenAt={post.authorLastSeenAt}
          />
          <Panel as="aside" className="rounded-[16px] border border-line bg-paper-strong p-4 shadow-none">
            <p className="type-eyebrow text-ink">{locale === "sr" ? "Gde se uči" : "Where you learn"}</p>
            <dl className="mt-3 space-y-2 text-sm">
              <MetaRow label={locale === "sr" ? "Gde pripada" : "Belongs to"} value={scope} icon={scopeIcon(post)} />
              <MetaRow label={locale === "sr" ? "Status" : "Status"} value={statusLabel(post.status, locale)} />
              <MetaRow
                label={locale === "sr" ? "Istaknuto" : "Pinned"}
                value={pinned ? (locale === "sr" ? "Da" : "Yes") : locale === "sr" ? "Ne" : "No"}
                icon={<Star className={cn("size-4", pinned && "fill-ink")} />}
              />
            </dl>
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
      <Panel className="mx-auto max-w-xl rounded-[16px] border border-line bg-paper-strong p-6 text-center shadow-none">
        <CircleAlert className="mx-auto size-9 text-amber-600" />
        <h1 className="mt-4 type-h1 text-ink">
          {locale === "sr" ? "Editor nije dostupan" : "Editor is not available"}
        </h1>
        <p className="mt-2 type-body-sm font-semibold text-muted">
          {locale === "sr"
            ? "Ovu temu može da menja samo onaj ko ju je napisao. Vrati se na prikaz za čitanje."
            : "Only the person who wrote this topic can edit it. Go back to the reading view."}
        </p>
        <Link
          href={withLocale(locale, `/app/community/${postId}`)}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink"
        >
          {locale === "sr" ? "Otvori temu" : "Open topic"}
        </Link>
      </Panel>
    );
  }

  return <CommunityPostEditor locale={locale} mode="edit" postId={postId} initialPost={post as CommunityEditorPost} />;
}

function ThreadLoading({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={locale === "sr" ? "Učitavanje teme" : "Loading topic"}>
      <div className="flex items-center justify-between">
        <div className="h-11 w-44 animate-pulse rounded-full border border-line bg-paper-strong" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <div className="overflow-hidden surface-card border-2 border-ink bg-paper-strong shadow-[6px_6px_0_var(--shadow-hard-13)]">
            <div className="border-b border-line bg-paper/55 p-6 md:p-8">
              <div className="flex items-center gap-3">
                <div className="size-12 animate-pulse rounded-full bg-ink/10" />
                <div className="space-y-2">
                  <div className="h-4 w-36 animate-pulse rounded-[8px] bg-ink/10" />
                  <div className="h-3 w-24 animate-pulse rounded-[8px] bg-ink/10" />
                </div>
              </div>
              <div className="mt-6 h-8 w-3/4 animate-pulse rounded-[8px] bg-ink/10" />
            </div>
            <div className="space-y-3 p-6 md:p-8">
              <div className="h-4 w-full animate-pulse rounded-[8px] bg-ink/10" />
              <div className="h-4 w-5/6 animate-pulse rounded-[8px] bg-ink/10" />
              <div className="h-4 w-2/3 animate-pulse rounded-[8px] bg-ink/10" />
            </div>
          </div>
          <div className="surface-card border border-line bg-paper-strong p-6">
            <div className="h-28 animate-pulse rounded-[12px] bg-ink/5" />
          </div>
        </div>
        <div className="hidden h-64 animate-pulse surface-card border border-line bg-paper-strong xl:block" />
      </div>
    </div>
  );
}

function ThreadUnavailable({ locale }: { locale: Locale }) {
  return (
    <Panel className="mx-auto max-w-xl surface-card border-2 border-ink bg-paper-strong p-6 text-center shadow-[6px_6px_0_var(--shadow-hard-13)]">
      <CircleAlert className="mx-auto size-9 text-amber-600" />
      <h1 className="mt-4 type-h1 text-ink">{locale === "sr" ? "Tema nije dostupna" : "Topic unavailable"}</h1>
      <p className="mt-2 type-body-sm font-semibold text-muted">
        {locale === "sr"
          ? "Tema je obrisana, još nije objavljena ili je na kursu koji još nemaš."
          : "The topic was deleted, is not published yet, or belongs to a course you do not have yet."}
      </p>
      <Link
        href={withLocale(locale, "/app/community/discussions")}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink shadow-[3px_3px_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0"
      >
        <ArrowLeft className="size-4" />
        {locale === "sr" ? "Nazad na diskusije" : "Back to discussions"}
      </Link>
    </Panel>
  );
}

const ACTIVE_NOW_MS = 5 * 60 * 1000;

function presenceLabel(locale: Locale, lastSeenAt: number | undefined, activeNow: boolean, now: number) {
  if (activeNow) return t(locale, "Aktivan sada", "Active now");
  if (!lastSeenAt) return t(locale, "Aktivnost nije zabeležena", "No activity recorded");
  const minutes = Math.max(1, Math.floor((now - lastSeenAt) / 60_000));
  if (minutes < 60) return t(locale, `Poslednji put pre ${minutes} min`, `Last seen ${minutes}m ago`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(locale, `Poslednji put pre ${hours} h`, `Last seen ${hours}h ago`);
  const days = Math.floor(hours / 24);
  return t(locale, `Poslednji put pre ${days} dana`, `Last seen ${days}d ago`);
}

/**
 * Kartica autora na detalju teme. Prati profil-karticu iz naloga (avatar, ime,
 * @korisnicko ime, prisustvo, kratka biografija, "Član od"), ali nosi TACNO
 * jedno dugme - "Poseti javni profil" - bez owner akcija (Uredi/Podesavanja),
 * jer ovo gleda posetilac tudje teme, ne vlasnik profila. `activeNow` se racuna
 * ovde iz `lastSeenAt` (klijent), pa Convex upit ne cita zidni sat.
 */
function ThreadAuthorCard({
  locale,
  name,
  username,
  avatarUrl,
  role,
  bio,
  joinedAt,
  lastSeenAt,
}: {
  locale: Locale;
  name: string;
  username?: string;
  avatarUrl?: string | null;
  role?: string;
  bio?: string;
  joinedAt?: number;
  lastSeenAt?: number;
}) {
  // Zidni sat uzimamo jednom, u inicijalizatoru stanja (isti obrazac kao
  // `ActivityHeatmap` u member-profile), da render ostane cist - direktan
  // `Date.now()` u telu komponente rusi react-compiler lint pravilo.
  const [now] = useState(() => Date.now());
  const activeNow = typeof lastSeenAt === "number" && now - lastSeenAt <= ACTIVE_NOW_MS;
  const profileHref = username ? withLocale(locale, `/app/members/${username}`) : null;

  return (
    <Panel as="aside" className="rounded-[16px] border border-line bg-paper-strong p-4 shadow-none">
      <p className="type-eyebrow text-ink/60">{t(locale, "Autor teme", "Topic author")}</p>
      <div className="mt-3 flex items-start gap-3">
        {profileHref ? (
          <Link href={profileHref} className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            <CommunityAvatar name={name} avatarUrl={avatarUrl} role={role} locale={locale} size="md" showRank={false} />
          </Link>
        ) : (
          <CommunityAvatar name={name} avatarUrl={avatarUrl} role={role} locale={locale} size="md" showRank={false} />
        )}
        <div className="min-w-0 flex-1">
          {profileHref ? (
            <Link href={profileHref} className="block truncate text-sm font-black text-ink hover:underline">{name}</Link>
          ) : (
            <p className="truncate text-sm font-black text-ink">{name}</p>
          )}
          {username ? <p className="truncate font-mono type-caption font-bold text-muted">@{username}</p> : null}
          <p className="mt-1.5 flex items-center gap-2 type-caption font-bold text-ink/70">
            <span className={cn("size-2 shrink-0 rounded-full", activeNow ? "bg-emerald-500" : "bg-line")} aria-hidden="true" />
            {presenceLabel(locale, lastSeenAt, activeNow, now)}
          </p>
        </div>
      </div>
      {bio ? <p className="mt-3 whitespace-pre-wrap type-body-sm font-semibold text-ink/80">{bio}</p> : null}
      {joinedAt ? (
        <p className="mt-3 flex items-center gap-2 type-caption font-bold text-muted">
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          {t(locale, "Član od", "Member since")}{" "}
          {new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", { month: "long", year: "numeric" }).format(new Date(joinedAt))}
        </p>
      ) : null}
      {profileHref ? (
        <Link
          href={profileHref}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          {t(locale, "Poseti javni profil", "Visit public profile")}
        </Link>
      ) : null}
    </Panel>
  );
}

function MetaRow({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[12px] border border-line bg-paper/55 px-3 py-2.5">
      <dt className="pt-0.5 type-eyebrow text-ink/45">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right text-xs font-black text-ink">
        {icon ? <span className="mt-0.5 shrink-0 text-ink/65">{icon}</span> : null}
        <span>{value}</span>
      </dd>
    </div>
  );
}
