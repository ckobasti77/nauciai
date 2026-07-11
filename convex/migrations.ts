import { Migrations } from "@convex-dev/migrations";

import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { syncLeaderboardSourceEvent } from "./leaderboardCore";
import { effectiveRoleForProfile } from "./helpers";
import { isValidUsername, normalizeUsername } from "../lib/username-policy";
import { hotScoreFor, voteValue } from "./community";

type MigrationsComponent = ConstructorParameters<typeof Migrations<DataModel>>[0];
const migrationsComponent = (components as unknown as { migrations: MigrationsComponent }).migrations;
export const migrations = new Migrations<DataModel>(migrationsComponent);

const TRACKS_BY_COURSE_SLUG = {
  "video-audio-ai": {
    slug: "video-audio",
    titleSr: "Smer za video i audio",
    titleEn: "Video and audio track",
    descriptionSr: "Smer koji objedinjuje kurseve za video i audio produkciju.",
    descriptionEn: "A track grouping video and audio production courses.",
    sortOrder: 10,
  },
  "vibe-coding": {
    slug: "websites",
    titleSr: "Smer za web sajtove",
    titleEn: "Websites track",
    descriptionSr: "Smer koji objedinjuje kurseve za izradu web sajtova.",
    descriptionEn: "A track grouping website-building courses.",
    sortOrder: 20,
  },
} as const;

export const backfillProfilesFromAuthUsers = migrations.define({
  table: "users",
  batchSize: 20,
  migrateOne: async (ctx, user) => {
    const existingRows = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(100);
    const existing = [...existingRows].sort((a, b) => a._creationTime - b._creationTime)[0] ?? null;
    const email = String(user.email ?? "").trim().toLowerCase();
    const sourceName = String(user.name ?? email.split("@")[0] ?? "Student").trim() || "Student";
    const nameParts = sourceName.split(/\s+/).filter(Boolean);
    const firstName = existing?.firstName ?? nameParts[0] ?? "Student";
    const lastName = existing?.lastName ?? nameParts.slice(1).join(" ");
    const candidateUsername = normalizeUsername(user.username);
    const username = candidateUsername && isValidUsername(candidateUsername) ? candidateUsername : existing?.username;
    const role = effectiveRoleForProfile(email, existing?.role);
    const name = existing?.name ?? [firstName, lastName].filter(Boolean).join(" ");
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: existing.email ?? email,
        name,
        firstName,
        lastName,
        ...(username && !existing.username ? { username } : {}),
        avatarUrl: existing.avatarUrl ?? user.image ?? "/images/avatars/mythic-mentor.png",
        avatarPreset: existing.avatarStorageId ? undefined : existing.avatarPreset ?? "mythic-mentor",
        role,
        searchText: `${name} ${username ?? ""} ${email}`.trim(),
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("profiles", {
      userId: user._id,
      email,
      name,
      firstName,
      lastName,
      ...(username ? { username } : {}),
      avatarUrl: user.image ?? "/images/avatars/mythic-mentor.png",
      avatarPreset: "mythic-mentor",
      role,
      language: "sr",
      searchText: `${name} ${username ?? ""} ${email}`.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const backfillCourseTracks = migrations.define({
  table: "courses",
  batchSize: 20,
  migrateOne: async (ctx, course) => {
    const seed = TRACKS_BY_COURSE_SLUG[course.slug as keyof typeof TRACKS_BY_COURSE_SLUG];
    if (!seed) return;
    let track = await ctx.db
      .query("courseTracks")
      .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
      .unique();
    const now = Date.now();
    if (!track) {
      const trackId = await ctx.db.insert("courseTracks", {
        ...seed,
        status: "published",
        createdAt: now,
        updatedAt: now,
      });
      track = await ctx.db.get(trackId);
    }
    if (track && course.trackId !== track._id) {
      await ctx.db.patch(course._id, { trackId: track._id, updatedAt: now });
    }
  },
});

export const backfillCommunityPosts = migrations.define({
  table: "communityPosts",
  batchSize: 20,
  migrateOne: async (ctx, post) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .take(1000);
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "post").eq("targetId", String(post._id)),
      )
      .take(1000);
    const upvoteCount = reactions.filter((reaction) => voteValue(reaction.reaction) > 0).length;
    const downvoteCount = reactions.filter((reaction) => voteValue(reaction.reaction) < 0).length;
    const course = post.courseId ? await ctx.db.get(post.courseId) : null;
    const latestCommentAt = comments.reduce(
      (latest, comment) => Math.max(latest, comment.createdAt),
      post.updatedAt,
    );
    const scopeKind: "course" | "track" | "global" = post.courseId ? "course" : post.trackId ? "track" : "global";
    const trackId = post.trackId ?? course?.trackId;
    const scopeKey = post.courseId
      ? `course:${post.courseId}`
      : trackId
        ? `track:${trackId}`
        : "global";
    const workflowGroup: "drafts" | "pending" | "published" =
      post.status === "draft" || post.status === "changes_requested"
        ? "drafts"
        : post.status === "pending"
          ? "pending"
          : "published";
    return {
      status: post.status ?? "published",
      workflowGroup,
      scopeKind,
      scopeKey,
      trackId,
      searchText: `${post.title.trim()}\n${post.body.trim()}`.trim(),
      commentCount: comments.length,
      reactionCount: upvoteCount + downvoteCount,
      upvoteCount,
      downvoteCount,
      voteScore: upvoteCount - downvoteCount,
      hotScore: hotScoreFor(upvoteCount - downvoteCount, post.createdAt),
      helpfulAnswerCount: comments.filter((comment) => comment.isHelpful).length,
      lastActivityAt: latestCommentAt,
    };
  },
});

export const backfillCommunityReactions = migrations.define({
  table: "reactions",
  batchSize: 100,
  migrateOne: (_ctx, reaction) => ({
    reaction: voteValue(reaction.reaction) < 0 ? "downvote" as const : "upvote" as const,
  }),
});

export const backfillCommunityComments = migrations.define({
  table: "comments",
  batchSize: 50,
  migrateOne: async (ctx, comment) => {
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "comment").eq("targetId", String(comment._id)),
      )
      .take(1000);
    for (const reaction of reactions) {
      const nextReaction = voteValue(reaction.reaction) < 0 ? "downvote" : "upvote";
      if (reaction.reaction !== nextReaction) await ctx.db.patch(reaction._id, { reaction: nextReaction });
    }
    const upvoteCount = reactions.filter((reaction) => voteValue(reaction.reaction) > 0).length;
    const downvoteCount = reactions.filter((reaction) => voteValue(reaction.reaction) < 0).length;
    return {
      reactionCount: upvoteCount + downvoteCount,
      upvoteCount,
      downvoteCount,
      voteScore: upvoteCount - downvoteCount,
      isHelpful: Boolean(comment.isHelpful),
    };
  },
});

export const backfillCommentTreeRanking = migrations.define({
  table: "comments",
  batchSize: 50,
  migrateOne: async (ctx, comment) => {
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) => q.eq("targetType", "comment").eq("targetId", String(comment._id)))
      .take(1000);
    const upvoteCount = reactions.filter((reaction) => voteValue(reaction.reaction) > 0).length;
    const downvoteCount = reactions.filter((reaction) => voteValue(reaction.reaction) < 0).length;
    const voteScore = upvoteCount - downvoteCount;
    const directReplies = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentId", comment._id))
      .take(1001);
    return {
      reactionCount: upvoteCount + downvoteCount,
      upvoteCount,
      downvoteCount,
      voteScore,
      hotScore: hotScoreFor(voteScore, comment.createdAt),
      directReplyCount: directReplies.length,
    };
  },
});

export const consolidateDuplicateProfiles = migrations.define({
  table: "profiles",
  batchSize: 50,
  migrateOne: async (ctx, profile) => {
    const rows = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
      .take(100);
    if (rows.length < 2) return;
    const ordered = [...rows].sort((a, b) => a._creationTime - b._creationTime);
    const canonical = ordered[0];
    if (profile._id !== canonical._id) {
      await ctx.db.delete(profile._id);
      return;
    }
    const latest = [...rows].sort((a, b) => (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime))[0];
    const user = await ctx.db.get(profile.userId);
    const email = String(latest.email ?? user?.email ?? "").trim().toLowerCase();
    await ctx.db.patch(canonical._id, {
      email: latest.email ?? email,
      name: latest.name,
      firstName: latest.firstName,
      lastName: latest.lastName,
      username: latest.username,
      avatarUrl: latest.avatarUrl,
      avatarStorageId: latest.avatarStorageId,
      avatarPreset: latest.avatarPreset,
      language: latest.language,
      role: effectiveRoleForProfile(email, latest.role),
      searchText: `${latest.name} ${latest.username ?? ""} ${email}`.trim(),
      updatedAt: Date.now(),
    });
    for (const duplicate of ordered.slice(1)) await ctx.db.delete(duplicate._id);
    if (user && user.username !== latest.username) await ctx.db.patch(user._id, { username: latest.username });
  },
});

export const backfillProfileSearchText = migrations.define({
  table: "profiles",
  batchSize: 100,
  migrateOne: (_ctx, profile) => ({
    searchText: `${profile.name} ${profile.username ?? ""}`.trim(),
  }),
});

export const backfillLessonLeaderboardEvents = migrations.define({
  table: "progress",
  batchSize: 20,
  migrateOne: async (ctx, progress) => {
    if (!progress.completed) return;
    await syncLeaderboardSourceEvent(ctx, {
      userId: progress.userId,
      sourceType: "lesson",
      sourceId: String(progress.lessonId),
      active: true,
      occurredAt: progress.updatedAt,
      courseId: progress.courseId,
    });
  },
});

export const backfillTaskLeaderboardEvents = migrations.define({
  table: "taskProgress",
  batchSize: 20,
  migrateOne: async (ctx, progress) => {
    if (!progress.completed) return;
    const task = await ctx.db.get(progress.taskId);
    if (!task?.required) return;
    await syncLeaderboardSourceEvent(ctx, {
      userId: progress.userId,
      sourceType: "required_task",
      sourceId: String(progress.taskId),
      active: true,
      occurredAt: progress.completedAt ?? progress.updatedAt,
      courseId: progress.courseId,
    });
  },
});

// Run migrations explicitly after a dry run; this file never starts them automatically.
export const run = migrations.runner();

const migrationApi = (internal as unknown as {
  migrations: Record<string, never>;
}).migrations;

export const runAll = migrations.runner([
  migrationApi.backfillProfilesFromAuthUsers,
  migrationApi.backfillCourseTracks,
  migrationApi.backfillCommunityReactions,
  migrationApi.backfillCommunityComments,
  migrationApi.backfillCommentTreeRanking,
  migrationApi.backfillCommunityPosts,
  migrationApi.backfillProfileSearchText,
  migrationApi.backfillLessonLeaderboardEvents,
  migrationApi.backfillTaskLeaderboardEvents,
  migrationApi.consolidateDuplicateProfiles,
]);
