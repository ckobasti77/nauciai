"use client";

import { useMutation } from "convex/react";
import { GraduationCap, MessageCircle, Star, ThumbsUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { CommunityThreadConfirmDialog } from "@/components/app/community-thread-dialog";
import type { CommunityRole } from "@/components/app/community-identity";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

export function CommunityThreadActions({
  locale,
  postId,
  courseId,
  trackId,
  isFeaturedGlobal,
  featuredTrackId,
  featuredCourseId,
  reactionsCount,
  commentsCount,
  userReaction,
  viewerRole,
}: {
  locale: Locale;
  postId: string;
  courseId?: string;
  trackId?: string;
  isFeaturedGlobal?: boolean;
  featuredTrackId?: string;
  featuredCourseId?: string;
  reactionsCount: number;
  commentsCount: number;
  userReaction?: string;
  viewerRole?: CommunityRole;
}) {
  const router = useRouter();
  const reactPost = useMutation(api.community.react);
  const setPinnedScope = useMutation(api.community.setPinnedScope);
  const deletePost = useMutation(api.community.deletePost);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPin = viewerRole === "admin";
  const canDelete = viewerRole === "admin" || viewerRole === "moderator";
  const isLiked = userReaction === "like";

  async function run(action: string, task: () => Promise<void>) {
    setBusy(action);
    setError(null);
    try {
      await task();
    } catch (caughtError) {
      console.error(caughtError);
      setError(
        locale === "sr"
          ? "Akcija nije sačuvana. Proveri vezu i pokušaj ponovo."
          : "The action was not saved. Check your connection and try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy("delete");
    setError(null);
    try {
      await deletePost({ postId: postId as Id<"communityPosts"> });
      router.push(withLocale(locale, "/app/community/discussions"));
    } catch (caughtError) {
      console.error(caughtError);
      setDeleteOpen(false);
      setError(
        locale === "sr"
          ? "Tred nije obrisan. Osveži stranicu i pokušaj ponovo."
          : "The thread was not deleted. Refresh the page and try again.",
      );
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <ActionButton
          icon={<ThumbsUp className={cn("size-4", isLiked && "fill-ink")} />}
          label={`${locale === "sr" ? "Sviđa mi se" : "Like"} (${reactionsCount})`}
          active={isLiked}
          disabled={busy !== null}
          onClick={() =>
            run("like", async () => {
              await reactPost({
                targetType: "post",
                targetId: postId,
                reaction: "like",
              });
            })
          }
        />
        <a
          href="#comments"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-line bg-white px-3 text-xs font-black text-ink transition hover:border-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <MessageCircle className="size-4" />
          {locale === "sr" ? "Komentari" : "Comments"} ({commentsCount})
        </a>
        {canPin ? (
          <>
            <ActionButton
              icon={<Star className={cn("size-4", isFeaturedGlobal && "fill-ink")} />}
              label={locale === "sr" ? "Globalno" : "Global"}
              active={Boolean(isFeaturedGlobal)}
              disabled={busy !== null}
              onClick={() =>
                run("global", async () => {
                  await setPinnedScope({
                    postId: postId as Id<"communityPosts">,
                    scope: { kind: "global" },
                    enabled: !isFeaturedGlobal,
                  });
                })
              }
            />
            {trackId ? (
              <ActionButton
                icon={<GraduationCap className={cn("size-4", featuredTrackId && "fill-ink")} />}
                label={locale === "sr" ? "Smer" : "Track"}
                active={Boolean(featuredTrackId)}
                disabled={busy !== null}
                onClick={() =>
                  run("track", async () => {
                    await setPinnedScope({
                      postId: postId as Id<"communityPosts">,
                      scope: { kind: "track", trackId: trackId as Id<"courseTracks"> },
                      enabled: !featuredTrackId,
                    });
                  })
                }
              />
            ) : null}
            {courseId ? (
              <ActionButton
                icon={<GraduationCap className={cn("size-4", featuredCourseId && "fill-ink")} />}
                label={locale === "sr" ? "Kurs" : "Course"}
                active={Boolean(featuredCourseId)}
                disabled={busy !== null}
                onClick={() =>
                  run("course", async () => {
                    await setPinnedScope({
                      postId: postId as Id<"communityPosts">,
                      scope: { kind: "course", courseId: courseId as Id<"courses"> },
                      enabled: !featuredCourseId,
                    });
                  })
                }
              />
            ) : null}
          </>
        ) : null}
        {canDelete ? (
          <ActionButton
            icon={<Trash2 className="size-4" />}
            label={locale === "sr" ? "Obriši" : "Delete"}
            destructive
            disabled={busy !== null}
            onClick={() => setDeleteOpen(true)}
          />
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">
          {error}
        </p>
      ) : null}

      <CommunityThreadConfirmDialog
        open={deleteOpen}
        title={locale === "sr" ? "Obrisati tred?" : "Delete thread?"}
        description={
          locale === "sr"
            ? "Tred, komentari i reakcije biće trajno uklonjeni. Ova radnja ne može da se poništi."
            : "The thread, comments, and reactions will be permanently removed. This action cannot be undone."
        }
        confirmLabel={locale === "sr" ? "Obriši tred" : "Delete thread"}
        cancelLabel={locale === "sr" ? "Odustani" : "Cancel"}
        closeLabel={locale === "sr" ? "Zatvori dijalog" : "Close dialog"}
        busy={busy === "delete"}
        destructive
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function ActionButton({
  icon,
  label,
  active,
  destructive,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-line bg-white px-3 text-xs font-black text-ink transition hover:border-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50",
        active && "border-ink bg-yellow/25",
        destructive && "text-red-600 hover:border-red-200 hover:bg-red-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
