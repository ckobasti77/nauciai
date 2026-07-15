import { Migrations } from "@convex-dev/migrations";

import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { syncLeaderboardSourceEvent } from "./leaderboardCore";
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

export const backfillAppEmailVerificationTime = migrations.define({
  table: "users",
  batchSize: 100,
  migrateOne: async (ctx, user) => {
    if (user.appEmailVerificationTime) return;
    if (user.passwordEmailVerificationTime) {
      return { appEmailVerificationTime: user.passwordEmailVerificationTime };
    }
    if (!user.emailVerificationTime) return;
    const passwordAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id).eq("provider", "password"))
      .first();
    if (passwordAccount) return { appEmailVerificationTime: user.emailVerificationTime };
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

/**
 * Keeps every legacy lesson and its former module reference, while declaring
 * the two representations now available at lesson level. lessonParts become
 * Light blocks and lessonSteps remain the Pro experience.
 */
export const backfillLessonViews = migrations.define({
  table: "lessons",
  batchSize: 50,
  migrateOne: async (ctx, lesson) => {
    const [lightBlock, proStep] = await Promise.all([
      ctx.db.query("lessonParts").withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id)).first(),
      ctx.db.query("lessonSteps").withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id)).first(),
    ]);
    return {
      lightEnabled: lesson.lightEnabled ?? (Boolean(lightBlock) || !proStep),
      proEnabled: lesson.proEnabled ?? Boolean(proStep),
    };
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
  migrationApi.backfillCourseTracks,
  migrationApi.backfillLessonViews,
  migrationApi.backfillCommunityReactions,
  migrationApi.backfillCommunityComments,
  migrationApi.backfillCommentTreeRanking,
  migrationApi.backfillCommunityPosts,
  migrationApi.backfillLessonLeaderboardEvents,
  migrationApi.backfillTaskLeaderboardEvents,
]);
