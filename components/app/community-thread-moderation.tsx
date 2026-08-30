"use client";

import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  GraduationCap,
  Loader2,
  MessageSquareWarning,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { CommunityAvatar, formatCommunityTime, type CommunityRank, type CommunityRole } from "@/components/app/community-identity";
import { Dialog } from "@/components/ui/dialog";
import { CommunityStickyToolbar } from "@/components/app/community-v2/community-sticky-toolbar";
import { Panel } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

type ModerationPost = {
  _id: string;
  title: string;
  body: string;
  createdAt: number;
  authorName: string;
  authorUsername?: string;
  authorAvatarUrl?: string | null;
  authorRole: CommunityRole;
  authorRank?: CommunityRank;
  courseId?: string;
  trackId?: string;
  courseTitleSr?: string;
  courseTitleEn?: string;
  trackTitleSr?: string;
  trackTitleEn?: string;
  imageUrl?: string | null;
};

type ModerationTrack = {
  _id: string;
  titleSr: string;
  titleEn: string;
  courses: Array<{ _id: string }>;
};

export function CommunityModerationQueue({ locale }: { locale: Locale }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const viewerData = useQuery(api.courses.viewer, isAuthenticated ? {} : "skip");
  const communityFilters = useQuery(api.community.getCommunityFilters, isAuthenticated ? {} : "skip");
  const viewerRole = viewerData?.profile?.role;
  const isStaff = viewerRole === "admin" || viewerRole === "moderator";
  const queue = usePaginatedQuery(
    api.community.listModerationQueuePage,
    isStaff ? {} : "skip",
    { initialNumItems: 8 },
  );
  const moderatePost = useMutation(api.community.moderatePost);

  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [requestPostId, setRequestPostId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toast = useToast();

  async function approve(postId: string) {
    setActivePostId(postId);
    setError(null);
    setSuccess(null);
    try {
      await moderatePost({ postId: postId as Id<"communityPosts">, decision: "approve" });
      setSuccess(locale === "sr" ? "Tema je odobrena i objavljena." : "The topic was approved and published.");
      toast.success(locale === "sr" ? "Tema je odobrena i objavljena." : "The topic was approved and published.");
      if (expandedPostId === postId) setExpandedPostId(null);
    } catch (caughtError) {
      console.error(caughtError);
      setError(
        locale === "sr"
          ? "Odluka nije sačuvana. Proveri vezu i pokušaj ponovo."
          : "The decision was not saved. Check your connection and try again.",
      );
      toast.error(locale === "sr" ? "Odobravanje nije uspelo." : "Approval failed.");
    } finally {
      setActivePostId(null);
    }
  }

  async function requestChanges() {
    if (!requestPostId) return;
    if (!reason.trim()) {
      setReasonError(locale === "sr" ? "Napiši konkretnu izmenu koju autor treba da napravi." : "Describe the specific change the author needs to make.");
      return;
    }

    setActivePostId(requestPostId);
    setReasonError(null);
    setError(null);
    setSuccess(null);
    try {
      await moderatePost({
        postId: requestPostId as Id<"communityPosts">,
        decision: "request_changes",
        reason: reason.trim(),
      });
      setSuccess(locale === "sr" ? "Tema je vraćena autoru sa jasnim razlogom." : "The topic was returned to its author with a clear reason.");
      toast.warning(locale === "sr" ? "Tema je vraćena autoru na izmenu." : "The topic was returned to its author for changes.");
      setRequestPostId(null);
      setReason("");
      setExpandedPostId(null);
    } catch (caughtError) {
      console.error(caughtError);
      setReasonError(
        locale === "sr"
          ? "Odluka nije sačuvana. Sadržaj razloga je ostao ovde — pokušaj ponovo."
          : "The decision was not saved. Your reason is still here — try again.",
      );
      toast.error(locale === "sr" ? "Vraćanje na izmenu nije uspelo." : "Requesting changes failed.");
    } finally {
      setActivePostId(null);
    }
  }

  if (authLoading || (isAuthenticated && viewerData === undefined)) {
    return (
      <div className="grid min-h-80 place-items-center" aria-busy="true">
        <Loader2 className="size-8 animate-spin text-yellow motion-reduce:animate-none" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <Panel className="mx-auto max-w-xl rounded-[16px] border border-line bg-paper-strong p-7 text-center shadow-none">
        <ShieldCheck className="mx-auto size-9 text-ink/45" />
        <h1 className="mt-4 text-2xl font-black text-ink">{locale === "sr" ? "Staff prostor" : "Staff area"}</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-muted">
          {locale === "sr" ? "Odobrenjima mogu da pristupe moderator i admin." : "Approvals are available to moderators and admins."}
        </p>
        <Link
          href={withLocale(locale, "/app/community/discussions")}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink"
        >
          {locale === "sr" ? "Otvori diskusije" : "Open discussions"}
        </Link>
      </Panel>
    );
  }

  return (
    <section aria-label={locale === "sr" ? "Odobrenja" : "Approvals"} className="space-y-5">
      <CommunityStickyToolbar>
      <div className="flex flex-wrap items-end justify-end gap-4 rounded-[16px] border border-line bg-paper-strong p-2">
        <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-paper-strong px-3 text-xs font-black text-ink/65">
          <Clock3 className="size-4" />
          {queue.results.length} {locale === "sr" ? "učitano" : "loaded"}
        </span>
      </div>
      </CommunityStickyToolbar>

      {error ? (
        <p role="alert" className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="flex items-center gap-2 rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">
          <CheckCircle2 className="size-4" />
          {success}
        </p>
      ) : null}

      {queue.status === "LoadingFirstPage" ? (
        <div className="grid min-h-64 place-items-center" aria-busy="true">
          <Loader2 className="size-8 animate-spin text-yellow motion-reduce:animate-none" />
        </div>
      ) : queue.results.length === 0 ? (
        <Panel className="rounded-[16px] border border-dashed border-ink/20 bg-paper-strong p-8 text-center shadow-none">
          <ShieldCheck className="mx-auto size-9 text-emerald-600" />
          <h2 className="mt-4 text-xl font-black text-ink">{locale === "sr" ? "Red je čist" : "The queue is clear"}</h2>
          <p className="mt-2 text-sm font-semibold text-muted">
            {locale === "sr" ? "Nema tema koje čekaju proveru." : "No topics are waiting for review."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {(queue.results as ModerationPost[]).map((post) => {
            const expanded = expandedPostId === post._id;
            const busy = activePostId === post._id;
            return (
              <Panel key={post._id} as="article" className="overflow-hidden rounded-[16px] border border-line bg-paper-strong shadow-none">
                <div className="p-4 md:p-5">
                  <div className="flex items-start gap-3">
                    {post.authorUsername ? <Link href={withLocale(locale, `/app/members/${post.authorUsername}`)} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><CommunityAvatar
                      name={post.authorName}
                      avatarUrl={post.authorAvatarUrl}
                      role={post.authorRole}
                      rank={post.authorRank}
                      locale={locale}
                      size="sm"
                    /></Link> : <CommunityAvatar name={post.authorName} avatarUrl={post.authorAvatarUrl} role={post.authorRole} rank={post.authorRank} locale={locale} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        {post.authorUsername ? <Link href={withLocale(locale, `/app/members/${post.authorUsername}`)} className="font-black text-ink hover:underline">{post.authorName}</Link> : <span className="font-black text-ink">{post.authorName}</span>}
                        {post.authorUsername ? <span className="font-bold text-muted">@{post.authorUsername}</span> : null}
                        <time className="font-bold text-ink/45" dateTime={new Date(post.createdAt).toISOString()}>
                          {formatCommunityTime(post.createdAt, locale)}
                        </time>
                      </div>
                      <h2 className="mt-2 text-lg font-black leading-tight text-ink md:text-xl">{post.title}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-black text-ink/65">
                          <GraduationCap className="size-3.5" />
                          {moderationScopeLabel(post, locale, communityFilters?.tracks)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedPostId(expanded ? null : post._id)}
                      aria-expanded={expanded}
                      aria-controls={`moderation-preview-${post._id}`}
                      className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-line bg-paper-strong px-3 text-xs font-black text-ink transition hover:border-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      <span className="hidden sm:inline">{expanded ? (locale === "sr" ? "Sakrij" : "Collapse") : locale === "sr" ? "Pregledaj" : "Review"}</span>
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div id={`moderation-preview-${post._id}`} className="border-t border-line bg-paper/40 px-4 py-5 md:px-5">
                    <div className="mx-auto max-w-[720px]">
                      <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-ink/80">{post.body}</p>
                      {post.imageUrl ? (
                        <Image
                          src={post.imageUrl}
                          alt={locale === "sr" ? "Slika uz temu" : "Image for this topic"}
                          width={1200}
                          height={750}
                          unoptimized
                          className="mt-5 h-auto max-h-80 w-full rounded-[8px] border border-line bg-paper-strong object-contain"
                        />
                      ) : null}
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                        <Link
                          href={withLocale(locale, `/app/community/${post._id}`)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-black text-ink/65 transition hover:bg-paper-strong hover:text-ink"
                        >
                          {locale === "sr" ? "Otvori celu temu" : "Open the full topic"}
                          <ArrowUpRight className="size-4" />
                        </Link>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReason("");
                              setReasonError(null);
                              setRequestPostId(post._id);
                            }}
                            disabled={busy}
                            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-300 bg-paper-strong px-4 text-sm font-black text-amber-900 transition hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-50"
                          >
                            <MessageSquareWarning className="size-4" />
                            {locale === "sr" ? "Zatraži izmenu" : "Request changes"}
                          </button>
                          <button
                            type="button"
                            onClick={() => approve(post._id)}
                            disabled={busy}
                            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink shadow-[3px_3px_0_var(--shadow-hard-16)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                            {locale === "sr" ? "Odobri i objavi" : "Approve and publish"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}

      {queue.status === "CanLoadMore" || queue.status === "LoadingMore" ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => queue.loadMore(8)}
            disabled={queue.status === "LoadingMore"}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper-strong px-5 text-sm font-black text-ink transition hover:border-ink hover:bg-paper disabled:opacity-60"
          >
            {queue.status === "LoadingMore" ? <Loader2 className="size-4 animate-spin" /> : null}
            {locale === "sr" ? "Učitaj još" : "Load more"}
          </button>
        </div>
      ) : null}

      <Dialog
        open={Boolean(requestPostId)}
        title={locale === "sr" ? "Zatraži izmenu" : "Request changes"}
        description={
          locale === "sr"
            ? "Autor će ovaj razlog videti uz skicu. Napiši jednu konkretnu i primenljivu sledeću akciju."
            : "The author will see this reason with their draft. Write one specific, actionable next step."
        }
        closeLabel={locale === "sr" ? "Zatvori dijalog" : "Close dialog"}
        onClose={() => {
          if (activePostId) return;
          setRequestPostId(null);
          setReasonError(null);
        }}
      >
        <label htmlFor="moderation-reason" className="block text-xs font-black uppercase tracking-[0.06em] text-ink/55">
          {locale === "sr" ? "Razlog i tražena izmena" : "Reason and requested change"}
        </label>
        <textarea
          id="moderation-reason"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError(null);
          }}
          rows={5}
          autoFocus
          data-dialog-initial-focus
          aria-invalid={Boolean(reasonError)}
          aria-describedby={reasonError ? "moderation-reason-error" : "moderation-reason-help"}
          placeholder={locale === "sr" ? "Na primer: ukloni lične podatke iz drugog pasusa…" : "For example: remove personal information from the second paragraph…"}
          className="mt-2 w-full resize-y rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm font-semibold leading-6 text-ink focus:border-ink focus:ring-4 focus:ring-yellow/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        {reasonError ? (
          <p id="moderation-reason-error" role="alert" className="mt-2 text-xs font-bold text-red-700">{reasonError}</p>
        ) : (
          <p id="moderation-reason-help" className="mt-2 text-xs font-semibold text-muted">
            {locale === "sr" ? "Razlog je obavezan i ostaje u istoriji moderacije." : "A reason is required and remains in moderation history."}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setRequestPostId(null)}
            disabled={Boolean(activePostId)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-paper-strong px-5 text-sm font-black text-ink transition hover:border-ink hover:bg-paper disabled:opacity-50"
          >
            {locale === "sr" ? "Odustani" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={requestChanges}
            disabled={Boolean(activePostId)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink shadow-[3px_3px_0_var(--shadow-hard-16)] disabled:opacity-60"
          >
            {activePostId ? <Loader2 className="size-4 animate-spin" /> : <MessageSquareWarning className="size-4" />}
            {locale === "sr" ? "Vrati autoru" : "Return to author"}
          </button>
        </div>
      </Dialog>
    </section>
  );
}

function moderationScopeLabel(post: ModerationPost, locale: Locale, tracks: ModerationTrack[] = []) {
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
  return locale === "sr" ? "Globalno" : "Global";
}
