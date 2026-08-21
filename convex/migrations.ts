import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx } from "./_generated/server";
import { syncLeaderboardSourceEvent } from "./leaderboardCore";
import { hotScoreFor, voteValue } from "./community";
import { effectiveRoleForProfile } from "./helpers";
import { adjustProfileActivity, adjustProfileContribution } from "./profileActivityCore";
import { parseJobInputs } from "./providers/jobInputs";
import {
  markChatInboxAggregateReady,
  markChatInboxSummaryReady,
  syncChatInboxSummaryMember,
} from "./chatInboxSummaryCore";
import { syncConversationSearchEntry } from "./chatSearchProjection";
import { ensureStudyPartnershipMembers, syncStudyAvailabilityForProgressChange } from "./study";
import {
  markStudyHubAggregateReady,
  syncStudyGroupInviteSummary,
  syncStudyGroupMembershipSummary,
  syncStudyPartnerInviteSummary,
  syncStudyPartnershipSummary,
} from "./studyHubSummaryCore";

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

export const clearPublicProfileActivity = migrations.define({
  table: "profileActivityDays",
  batchSize: 100,
  migrateOne: async (ctx, row) => ctx.db.delete(row._id),
});

export const clearPublicProfileContributions = migrations.define({
  table: "profileContributions",
  batchSize: 100,
  migrateOne: async (ctx, row) => ctx.db.delete(row._id),
});

export const resetPublicProfileStats = migrations.define({
  table: "profileStats",
  batchSize: 100,
  migrateOne: async (ctx, row) => {
    const user = await ctx.db.get(row.userId);
    return {
      contributionCount: 0,
      followerCount: 0,
      followingCount: 0,
      role: user ? effectiveRoleForProfile(String(user.email ?? ""), user.role) : row.role,
      aggregateVersion: 1,
      updatedAt: Date.now(),
    };
  },
});

export const dedupePublicProfileStats = migrations.define({
  table: "users",
  batchSize: 50,
  migrateOne: async (ctx, user) => {
    const rows = await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", user._id)).take(101);
    if (rows.length > 100) throw new Error("Previše profileStats redova za jednog korisnika.");
    if (rows.length < 2) return;
    const winner = rows.sort((a, b) => a._creationTime - b._creationTime)[0];
    await ctx.db.patch(winner._id, {
      completedLessons: Math.max(...rows.map((row) => Math.max(0, row.completedLessons))),
      updatedAt: Math.max(...rows.map((row) => row.updatedAt)),
    });
    for (const row of rows) if (row._id !== winner._id) await ctx.db.delete(row._id);
  },
});

export const ensurePublicProfileStats = migrations.define({
  table: "users",
  batchSize: 50,
  migrateOne: async (ctx, user) => {
    if (user.mergedInto) return;
    const stats = await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", user._id)).first();
    if (stats) return;
    await ctx.db.insert("profileStats", {
      userId: user._id,
      completedLessons: 0,
      contributionCount: 0,
      followerCount: 0,
      followingCount: 0,
      role: effectiveRoleForProfile(String(user.email ?? ""), user.role),
      aggregateVersion: 1,
      updatedAt: Date.now(),
    });
  },
});

export const cleanupInvalidFollowEdges = migrations.define({
  table: "userFollows",
  batchSize: 50,
  migrateOne: async (ctx, edge) => {
    const [follower, following] = await Promise.all([
      ctx.db.get(edge.followerId),
      ctx.db.get(edge.followingId),
    ]);
    const invalid = edge.followerId === edge.followingId
      || !follower
      || !following
      || Boolean(follower.mergedInto)
      || Boolean(following.mergedInto)
      || effectiveRoleForProfile(String(follower?.email ?? ""), follower?.role) === "admin"
      || effectiveRoleForProfile(String(following?.email ?? ""), following?.role) === "admin";
    if (invalid) {
      await ctx.db.delete(edge._id);
      return;
    }
    const duplicates = await ctx.db
      .query("userFollows")
      .withIndex("by_followerId_and_followingId", (q) =>
        q.eq("followerId", edge.followerId).eq("followingId", edge.followingId),
      )
      .take(101);
    if (duplicates.length > 100) throw new Error("Previše duplih follow veza za isti par.");
    const keeper = duplicates.sort((a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime)[0];
    if (keeper && keeper._id !== edge._id) await ctx.db.delete(edge._id);
  },
});

export const rebuildPublicProfileActivityFromLeaderboard = migrations.define({
  table: "leaderboardEvents",
  batchSize: 50,
  migrateOne: async (ctx, event) => {
    if (!event.active || (event.sourceType !== "lesson" && event.sourceType !== "required_task")) return;
    await adjustProfileActivity(ctx, {
      userId: event.userId,
      timestamp: event.occurredAt,
      kind: event.sourceType === "lesson" ? "lessons" : "tasks",
      delta: 1,
    });
  },
});

export const rebuildPublicProfileThreads = migrations.define({
  table: "communityPosts",
  batchSize: 25,
  migrateOne: async (ctx, post) => {
    if ((post.status ?? "published") !== "published") return;
    await adjustProfileActivity(ctx, { userId: post.authorId, timestamp: post.createdAt, kind: "threads", delta: 1 });
    await adjustProfileContribution(ctx, {
      userId: post.authorId,
      postId: post._id,
      threadDelta: 1,
      lastActivityAt: post.createdAt,
    });
  },
});

export const rebuildPublicProfileComments = migrations.define({
  table: "comments",
  batchSize: 25,
  migrateOne: async (ctx, comment) => {
    const post = await ctx.db.get(comment.postId);
    if (!post || (post.status ?? "published") !== "published") return;
    await adjustProfileActivity(ctx, { userId: comment.authorId, timestamp: comment.createdAt, kind: "comments", delta: 1 });
    await adjustProfileContribution(ctx, {
      userId: comment.authorId,
      postId: post._id,
      commentDelta: 1,
      lastActivityAt: comment.createdAt,
    });
  },
});

async function incrementFollowStat(
  ctx: MutationCtx,
  userId: Id<"users">,
  field: "followerCount" | "followingCount",
) {
  const stats = await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", userId)).first();
  if (stats) await ctx.db.patch(stats._id, { [field]: (stats[field] ?? 0) + 1, updatedAt: Date.now() });
}

export const rebuildPublicProfileFollowStats = migrations.define({
  table: "userFollows",
  batchSize: 50,
  migrateOne: async (ctx, edge) => {
    await incrementFollowStat(ctx, edge.followerId, "followingCount");
    await incrementFollowStat(ctx, edge.followingId, "followerCount");
  },
});

export const backfillChatInboxSummaryMembers = migrations.define({
  table: "chatMembers",
  batchSize: 25,
  migrateOne: async (ctx, member) => {
    await syncChatInboxSummaryMember(ctx, member._id, member);
  },
});

export const ensureChatInboxSummaryRows = migrations.define({
  table: "users",
  batchSize: 50,
  migrateOne: async (ctx, user) => {
    const existing = await ctx.db
      .query("chatInboxSummaries")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!existing) {
      await ctx.db.insert("chatInboxSummaries", {
        userId: user._id,
        totalUnread: 0,
        unreadConversations: 0,
        pendingRequests: 0,
        pendingGroupInvites: 0,
        ready: false,
        updatedAt: Date.now(),
      });
    }
  },
});

export const finalizeChatInboxSummaries = migrations.define({
  table: "chatInboxSummaries",
  batchSize: 100,
  migrateOne: async (ctx, summary) => {
    if (!summary.ready) await markChatInboxSummaryReady(ctx, summary.userId);
  },
});

/**
 * Aggregate v1 intentionally uses a new migration identity. The earlier manual
 * summary backfill may already be complete, so reusing its name would skip rows.
 */
export const backfillChatInboxAggregateV1 = migrations.define({
  table: "chatMembers",
  batchSize: 25,
  migrateOne: async (ctx, member) => {
    await syncChatInboxSummaryMember(ctx, member._id, member);
  },
});

export const ensureChatInboxAggregateRowsV1 = migrations.define({
  table: "users",
  batchSize: 50,
  migrateOne: async (ctx, user) => {
    const existing = await ctx.db
      .query("chatInboxSummaries")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!existing) {
      await ctx.db.insert("chatInboxSummaries", {
        userId: user._id,
        totalUnread: 0,
        unreadConversations: 0,
        pendingRequests: 0,
        pendingGroupInvites: 0,
        ready: true,
        aggregateReady: false,
        updatedAt: Date.now(),
      });
    }
  },
});

// Cut over only after both aggregate backfill steps above report completion.
export const finalizeChatInboxAggregateV1 = migrations.define({
  table: "chatInboxSummaries",
  batchSize: 100,
  migrateOne: async (ctx, summary) => {
    if (!summary.aggregateReady) await markChatInboxAggregateReady(ctx, summary.userId);
  },
});

export const ensureChatConversationSearchVersionV1 = migrations.define({
  table: "users",
  batchSize: 50,
  migrateOne: async (ctx) => {
    const existing = await ctx.db
      .query("chatConversationSearchVersions")
      .withIndex("by_key", (q) => q.eq("key", "v1"))
      .unique();
    if (!existing) {
      await ctx.db.insert("chatConversationSearchVersions", {
        key: "v1",
        ready: false,
        updatedAt: Date.now(),
      });
    }
  },
});

export const backfillChatConversationSearchEntriesV1 = migrations.define({
  table: "chatMembers",
  batchSize: 25,
  migrateOne: async (ctx, member) => {
    if (member.conversationKind === "direct") return;
    await syncConversationSearchEntry(ctx, {
      conversationId: member.conversationId,
      viewerId: member.userId,
      membershipStatus: member.status,
    });
  },
});

// Cut over only after the projection backfill above reports completion.
export const finalizeChatConversationSearchVersionV1 = migrations.define({
  table: "chatConversationSearchVersions",
  batchSize: 10,
  migrateOne: (_ctx, version) => {
    if (version.key === "v1" && !version.ready) {
      return { ready: true, updatedAt: Date.now() };
    }
  },
});

export const backfillStudyPartnershipMembers = migrations.define({
  table: "studyPartnerships",
  batchSize: 50,
  migrateOne: async (ctx, partnership) => {
    await ensureStudyPartnershipMembers(ctx, partnership);
  },
});

export const refreshStudyPartnerAvailability = migrations.define({
  table: "studyPartnerAvailability",
  batchSize: 10,
  migrateOne: async (ctx, availability) => {
    await syncStudyAvailabilityForProgressChange(ctx, availability.userId, availability.courseId);
  },
});

export const backfillStudyHubPartnerInvitesV1 = migrations.define({
  table: "studyPartnerInvites",
  batchSize: 25,
  migrateOne: async (ctx, invite) => {
    await syncStudyPartnerInviteSummary(ctx, null, invite);
  },
});

export const backfillStudyHubPartnershipsV1 = migrations.define({
  table: "studyPartnerships",
  batchSize: 25,
  migrateOne: async (ctx, partnership) => {
    await syncStudyPartnershipSummary(ctx, null, partnership);
  },
});

export const backfillStudyHubGroupInvitesV1 = migrations.define({
  table: "studyGroupInvites",
  batchSize: 25,
  migrateOne: async (ctx, invite) => {
    await syncStudyGroupInviteSummary(ctx, null, invite);
  },
});

export const backfillStudyHubGroupMembershipsV1 = migrations.define({
  table: "studyGroupMembers",
  batchSize: 25,
  migrateOne: async (ctx, membership) => {
    await syncStudyGroupMembershipSummary(ctx, null, membership);
  },
});

// This global readiness flag must be the final Study Hub rollout step.
export const finalizeStudyHubAggregateV1 = migrations.define({
  table: "users",
  batchSize: 100,
  migrateOne: async (ctx) => {
    await markStudyHubAggregateReady(ctx);
  },
});

/**
 * `falRequestId` -> `providerRequestId` (STUDIO-CATALOG-V4 sekcija 7): isti
 * podatak, ime koje važi i za BytePlus i za Google. Prošireno pa preseljeno -
 * ovaj prolaz popunjava novo polje na zatečenim poslovima, a staro ostaje dok
 * ga zaseban korak ne ugasi. Bez njega bi `by_provider_request` video samo
 * poslove napravljene posle deploy-a.
 */
export const backfillProviderRequestId = migrations.define({
  table: "generationJobs",
  batchSize: 100,
  migrateOne: (_ctx, job) => {
    if (job.providerRequestId || !job.falRequestId) return;
    return { providerRequestId: job.falRequestId };
  },
});

/**
 * `generationJobs.provider` (nalaz W7-6): Google poller sad čita
 * `by_provider_status` umesto da skenira sve "running" poslove i učitava
 * model za svaki. Poslovi upisani pre ovog polja ga nemaju - v4 model se nadje
 * po `modelSlug`, a stari `modelCatalog` slug je uvek fal (katalog §7).
 */
export const backfillGenerationJobProvider = migrations.define({
  table: "generationJobs",
  batchSize: 100,
  migrateOne: async (ctx, job) => {
    if (job.provider) return;
    const model = await ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", job.modelSlug))
      .unique();
    return { provider: model?.provider ?? "fal" };
  },
});

/**
 * Vlasništvo nad ulaznim fajlovima zatečenih poslova (nalaz R4). `createJob` od
 * sada prima samo `storageId` koji ima svoj red u `studioUploads`, a poslovi
 * napravljeni pre toga ga nemaju - bez ovog prolaza bi im "Generiši ponovo"
 * vraćalo `TUDJI_FAJL` nad sopstvenim fajlom.
 *
 * Vlasnik je vlasnik posla, jer je samo on te fajlove i mogao okačiti. Roka
 * nema: fajl koji je već u poslu nije nevezan upload. Fajl kojeg u storage-u
 * više nema se preskače - nema šta da se prijavi.
 */
export const backfillStudioUploads = migrations.define({
  table: "generationJobs",
  batchSize: 50,
  migrateOne: async (ctx, job) => {
    for (const [slot, ids] of Object.entries(parseJobInputs(job.inputs))) {
      for (const rawId of ids) {
        const storageId = ctx.db.system.normalizeId("_storage", rawId);
        if (!storageId) continue;
        const existing = await ctx.db
          .query("studioUploads")
          .withIndex("by_storage", (q) => q.eq("storageId", storageId))
          .first();
        if (existing) continue;
        const meta = await ctx.db.system.get("_storage", storageId);
        if (!meta) continue;
        await ctx.db.insert("studioUploads", {
          userId: job.userId,
          storageId,
          slot,
          bytes: meta.size,
          ...(meta.contentType ? { mimeType: meta.contentType } : {}),
          createdAt: job.createdAt,
        });
      }
    }
  },
});

/**
 * Sedam modela koje je W3 ugasio, vraćeno u ponudu (W5).
 *
 * Seed ume da GASI red na već seedovanom deployment-u, ali ne i da ga pali -
 * inače bi svaki `npm run convex:seed` vratio model koji je Jovan namerno
 * isključio (`studioModels.seedStudioModels`). Marker `isEnabled: false` je
 * uklonjen iz kataloga, pa nov deployment ove modele upisuje uključene, a na
 * postojećem ih pali ovaj jednokratan prolaz.
 *
 * Uslov za paljenje - da parser čita svaki format koji merni slot prihvata -
 * tvrdi `providers/catalogModels.test.ts`, ne ovaj spisak.
 */
const MEASURED_MODEL_SLUGS = [
  "kling-avatar",
  "kling-lipsync",
  "kling-motion",
  "stt",
  "voice-changer",
  "audio-isolation",
  "dubbing",
];

export const enableMeasuredModels = migrations.define({
  table: "models",
  batchSize: 50,
  migrateOne: (_ctx, model) => {
    if (model.isEnabled || !MEASURED_MODEL_SLUGS.includes(model.slug)) return;
    return { isEnabled: true, updatedAt: Date.now() };
  },
});

export const verifyPublicProfileAggregateForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const stats = await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    let contributionCount = 0;
    let followerCount = 0;
    let followingCount = 0;
    const seenDays = new Set<string>();
    const duplicateDays: string[] = [];
    const invalidDays: string[] = [];
    for await (const row of ctx.db.query("profileContributions").withIndex("by_userId_and_lastActivityAt", (q) => q.eq("userId", args.userId))) {
      contributionCount += Math.max(0, row.threadCount) + Math.max(0, row.commentCount);
    }
    for await (const edge of ctx.db.query("userFollows").withIndex("by_followingId_and_createdAt", (q) => q.eq("followingId", args.userId))) followerCount += edge._id ? 1 : 0;
    for await (const edge of ctx.db.query("userFollows").withIndex("by_followerId_and_createdAt", (q) => q.eq("followerId", args.userId))) followingCount += edge._id ? 1 : 0;
    for await (const row of ctx.db.query("profileActivityDays").withIndex("by_userId_and_dayKey", (q) => q.eq("userId", args.userId))) {
      if (seenDays.has(row.dayKey)) duplicateDays.push(row.dayKey);
      seenDays.add(row.dayKey);
      if ([row.lessons, row.tasks, row.threads, row.comments].some((value) => value < 0)) invalidDays.push(row.dayKey);
    }
    const expected = { contributionCount, followerCount, followingCount };
    const actual = {
      contributionCount: stats?.contributionCount ?? 0,
      followerCount: stats?.followerCount ?? 0,
      followingCount: stats?.followingCount ?? 0,
    };
    return {
      complete: Boolean(stats)
        && JSON.stringify(actual) === JSON.stringify(expected)
        && duplicateDays.length === 0
        && invalidDays.length === 0,
      actual,
      expected,
      duplicateDays: duplicateDays.slice(0, 10),
      invalidDays: invalidDays.slice(0, 10),
    };
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
  migrationApi.clearPublicProfileActivity,
  migrationApi.clearPublicProfileContributions,
  migrationApi.dedupePublicProfileStats,
  migrationApi.resetPublicProfileStats,
  migrationApi.ensurePublicProfileStats,
  migrationApi.cleanupInvalidFollowEdges,
  migrationApi.rebuildPublicProfileActivityFromLeaderboard,
  migrationApi.rebuildPublicProfileThreads,
  migrationApi.rebuildPublicProfileComments,
  migrationApi.rebuildPublicProfileFollowStats,
  migrationApi.backfillChatInboxSummaryMembers,
  migrationApi.ensureChatInboxSummaryRows,
  migrationApi.finalizeChatInboxSummaries,
  migrationApi.backfillChatInboxAggregateV1,
  migrationApi.ensureChatInboxAggregateRowsV1,
  migrationApi.finalizeChatInboxAggregateV1,
  migrationApi.backfillStudyPartnershipMembers,
  migrationApi.refreshStudyPartnerAvailability,
  migrationApi.backfillStudyHubPartnerInvitesV1,
  migrationApi.backfillStudyHubPartnershipsV1,
  migrationApi.backfillStudyHubGroupInvitesV1,
  migrationApi.backfillStudyHubGroupMembershipsV1,
  migrationApi.finalizeStudyHubAggregateV1,
  migrationApi.backfillProviderRequestId,
  migrationApi.backfillStudioUploads,
  migrationApi.enableMeasuredModels,
  migrationApi.backfillGenerationJobProvider,
]);
