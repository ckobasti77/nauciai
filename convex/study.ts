import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { syncChatInboxSummaryMember } from "./chatInboxSummaryCore";
import { syncConversationSearchEntry } from "./chatSearchProjection";
import {
  ensureAcceptedDirectConversation,
  ensureStudyGroupConversation,
  isBlockedEitherDirection,
  schedulePersistentActivityPush,
} from "./chatCore";
import { effectiveRoleForProfile, getCurrentProfile } from "./helpers";
import {
  getStudyHubAggregateSummary,
  syncStudyGroupInviteSummary,
  syncStudyGroupMembershipSummary,
  syncStudyPartnerInviteSummary,
  syncStudyPartnershipSummary,
} from "./studyHubSummaryCore";

const partnerInviteStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("cancelled"),
);
const STUDY_INVITE_COOLDOWN_MS = 15 * 24 * 60 * 60 * 1000;
const STUDY_WELCOME = "Partnerstvo za učenje je prihvaćeno. Ovde možete da nastavite razgovor.";
const STUDY_GROUP_WELCOME = "Grupa za učenje je aktivna. Dogovorite sledeći zajednički korak.";

type StudyCtx = QueryCtx | MutationCtx;
type ProgressZone = "0_25" | "26_50" | "51_75" | "76_100";

export function progressZoneForPercent(value: number): ProgressZone {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  if (percent <= 25) return "0_25";
  if (percent <= 50) return "26_50";
  if (percent <= 75) return "51_75";
  return "76_100";
}

function studyPairKey(userAId: Id<"users">, userBId: Id<"users">) {
  return [String(userAId), String(userBId)].sort().join(":");
}

function isStaffRole(role: unknown): role is "admin" | "moderator" {
  return role === "admin" || role === "moderator";
}

async function requirePublishedCourse(ctx: StudyCtx, courseId: Id<"courses">) {
  const course = await ctx.db.get(courseId);
  if (!course || course.status !== "published") throw new Error("Objavljeni kurs nije pronađen.");
  return course;
}

async function requireStudyActor(ctx: StudyCtx) {
  const current = await getCurrentProfile(ctx);
  const user = await ctx.db.get(current.userId as Id<"users">);
  if (!user || user.mergedInto || user.anonymizedAt) throw new Error("Unauthorized");
  if (current.profile.role === "admin") throw new Error("Admin nalozi ne učestvuju u partnerstvima za učenje.");
  return { userId: user._id, user, role: current.profile.role };
}

async function courseProgress(ctx: StudyCtx, userId: Id<"users">, courseId: Id<"courses">) {
  const [lessonRows, progressRows] = await Promise.all([
    ctx.db
      .query("lessons")
      .withIndex("by_course_and_sortOrder", (q) => q.eq("courseId", courseId))
      .take(1001),
    ctx.db.query("progress").withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId)).take(1001),
  ]);
  if (lessonRows.length > 1000 || progressRows.length > 1000) {
    throw new Error("Napredak kursa je prevelik za direktan obračun.");
  }
  const publishedLessonIds = new Set(lessonRows.filter((lesson) => lesson.isPublished).map((lesson) => String(lesson._id)));
  const completedLessons = new Set(
    progressRows.filter((row) => row.completed && publishedLessonIds.has(String(row.lessonId))).map((row) => String(row.lessonId)),
  ).size;
  const totalLessons = publishedLessonIds.size;
  const progressPercent = totalLessons === 0 ? 0 : Math.min(100, Math.round((completedLessons / totalLessons) * 100));
  return { completedLessons, totalLessons, progressPercent, progressZone: progressZoneForPercent(progressPercent) };
}

async function refreshAvailability(ctx: MutationCtx, userId: Id<"users">, courseId: Id<"courses">) {
  const availability = await ctx.db
    .query("studyPartnerAvailability")
    .withIndex("by_userId_and_courseId", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .unique();
  const progress = await courseProgress(ctx, userId, courseId);
  if (availability && (availability.progressPercent !== progress.progressPercent || availability.progressZone !== progress.progressZone)) {
    await ctx.db.patch(availability._id, {
      progressPercent: progress.progressPercent,
      progressZone: progress.progressZone,
      updatedAt: Date.now(),
    });
  }
  return { availability, ...progress };
}

export async function syncStudyAvailabilityForProgressChange(
  ctx: MutationCtx,
  userId: Id<"users">,
  courseId: Id<"courses">,
) {
  const availability = await ctx.db
    .query("studyPartnerAvailability")
    .withIndex("by_userId_and_courseId", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .unique();
  if (!availability) return;
  await refreshAvailability(ctx, userId, courseId);
}

async function memberSummary(ctx: StudyCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user || user.mergedInto || user.anonymizedAt || !user.username) return null;
  const avatarUrl = user.avatarStorageId ? (await ctx.storage.getUrl(user.avatarStorageId)) ?? user.avatarUrl : user.avatarUrl;
  return {
    userId: user._id,
    name: user.name ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || "Član"),
    username: user.username,
    avatarUrl,
    role: user.role ?? "student",
  };
}

export async function ensureStudyPartnershipMembers(
  ctx: MutationCtx,
  partnership: Doc<"studyPartnerships">,
) {
  const pairs = [
    { userId: partnership.userAId, partnerId: partnership.userBId },
    { userId: partnership.userBId, partnerId: partnership.userAId },
  ] as const;
  for (const pair of pairs) {
    const existing = await ctx.db
      .query("studyPartnershipMembers")
      .withIndex("by_partnershipId_and_userId", (q) =>
        q.eq("partnershipId", partnership._id).eq("userId", pair.userId),
      )
      .unique();
    const values = {
      partnerId: pair.partnerId,
      courseId: partnership.courseId,
      createdAt: partnership.createdAt,
      updatedAt: partnership.updatedAt,
    };
    if (existing) await ctx.db.patch(existing._id, values);
    else {
      await ctx.db.insert("studyPartnershipMembers", {
        partnershipId: partnership._id,
        userId: pair.userId,
        ...values,
      });
    }
  }
}

async function requireMatchingAvailability(
  ctx: MutationCtx,
  userAId: Id<"users">,
  userBId: Id<"users">,
  courseId: Id<"courses">,
) {
  const [userA, userB] = await Promise.all([
    refreshAvailability(ctx, userAId, courseId),
    refreshAvailability(ctx, userBId, courseId),
  ]);
  if (!userA.availability?.active || !userB.availability?.active) {
    throw new Error("Oba člana moraju biti aktivna za traženje partnera na ovom kursu.");
  }
  if (userA.progressZone !== userB.progressZone) throw new Error("Partner mora biti u istoj zoni napretka.");
  return { progressZone: userA.progressZone };
}

export const setViewerAvailability = mutation({
  args: { courseId: v.id("courses"), active: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    await requirePublishedCourse(ctx, args.courseId);
    const progress = await courseProgress(ctx, actor.userId, args.courseId);
    const existing = await ctx.db
      .query("studyPartnerAvailability")
      .withIndex("by_userId_and_courseId", (q) => q.eq("userId", actor.userId).eq("courseId", args.courseId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        progressZone: progress.progressZone,
        progressPercent: progress.progressPercent,
        active: args.active,
        updatedAt: now,
      });
    } else if (args.active) {
      await ctx.db.insert("studyPartnerAvailability", {
        userId: actor.userId,
        courseId: args.courseId,
        progressZone: progress.progressZone,
        progressPercent: progress.progressPercent,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { active: args.active, ...progress };
  },
});

export const getViewerAvailability = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireStudyActor(ctx);
    const rows = await ctx.db
      .query("studyPartnerAvailability")
      .withIndex("by_userId_and_courseId", (q) => q.eq("userId", actor.userId))
      .take(100);
    return rows;
  },
});

export const getViewerCourseAvailability = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    return ctx.db
      .query("studyPartnerAvailability")
      .withIndex("by_userId_and_courseId", (q) =>
        q.eq("userId", actor.userId).eq("courseId", args.courseId),
      )
      .unique();
  },
});

async function getLegacyStudyHubSummary(ctx: QueryCtx, userId: Id<"users">) {
  const [
    pendingPartnerInvites,
    pendingOutgoingPartnerInvites,
    pendingStudyGroupInvites,
    partnershipsAsUserA,
    partnershipsAsUserB,
    activeStudyGroups,
  ] = await Promise.all([
    ctx.db
      .query("studyPartnerInvites")
      .withIndex("by_recipientId_and_status_and_createdAt", (q) =>
        q.eq("recipientId", userId).eq("status", "pending"),
      )
      .collect(),
    ctx.db
      .query("studyPartnerInvites")
      .withIndex("by_senderId_and_status_and_createdAt", (q) =>
        q.eq("senderId", userId).eq("status", "pending"),
      )
      .collect(),
    ctx.db
      .query("studyGroupInvites")
      .withIndex("by_userId_and_status_and_createdAt", (q) =>
        q.eq("userId", userId).eq("status", "pending"),
      )
      .collect(),
    ctx.db
      .query("studyPartnerships")
      .withIndex("by_userAId_and_courseId_and_createdAt", (q) => q.eq("userAId", userId))
      .collect(),
    ctx.db
      .query("studyPartnerships")
      .withIndex("by_userBId_and_courseId_and_createdAt", (q) => q.eq("userBId", userId))
      .collect(),
    ctx.db
      .query("studyGroupMembers")
      .withIndex("by_userId_and_active_and_joinedAt", (q) =>
        q.eq("userId", userId).eq("active", true),
      )
      .collect(),
  ]);
  return {
    pendingPartnerInviteCount: pendingPartnerInvites.length,
    pendingOutgoingPartnerInviteCount: pendingOutgoingPartnerInvites.length,
    pendingStudyGroupInviteCount: pendingStudyGroupInvites.length,
    activePartnershipCount: partnershipsAsUserA.length + partnershipsAsUserB.length,
    activeStudyGroupCount: activeStudyGroups.length,
  };
}

export const getStudyHubSummary = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireStudyActor(ctx);
    const { ready, ...aggregateSummary } = await getStudyHubAggregateSummary(ctx, actor.userId);
    if (ready) return aggregateSummary;
    return getLegacyStudyHubSummary(ctx, actor.userId);
  },
});

export const listCommonStudyCoursesPage = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    const target = await ctx.db.get(args.userId);
    if (
      !target ||
      target.mergedInto ||
      target.anonymizedAt ||
      effectiveRoleForProfile(String(target.email ?? ""), target.role) === "admin"
    ) return { page: [], isDone: true, continueCursor: "" };
    const coursesResult = await ctx.db
      .query("courses")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .paginate(args.paginationOpts);
    const result = [];
    for (const course of coursesResult.page) {
      const [viewerEnrollment, targetEnrollment, viewerProgress, targetProgress, viewerAvailability, targetAvailability] =
        await Promise.all([
          ctx.db
            .query("enrollments")
            .withIndex("by_user_course", (q) => q.eq("userId", actor.userId).eq("courseId", course._id))
            .unique(),
          ctx.db
            .query("enrollments")
            .withIndex("by_user_course", (q) => q.eq("userId", args.userId).eq("courseId", course._id))
            .unique(),
          ctx.db
            .query("progress")
            .withIndex("by_user_course", (q) => q.eq("userId", actor.userId).eq("courseId", course._id))
            .first(),
          ctx.db
            .query("progress")
            .withIndex("by_user_course", (q) => q.eq("userId", args.userId).eq("courseId", course._id))
            .first(),
          ctx.db
            .query("studyPartnerAvailability")
            .withIndex("by_userId_and_courseId", (q) => q.eq("userId", actor.userId).eq("courseId", course._id))
            .unique(),
          ctx.db
            .query("studyPartnerAvailability")
            .withIndex("by_userId_and_courseId", (q) => q.eq("userId", args.userId).eq("courseId", course._id))
            .unique(),
        ]);
      const viewerParticipates = viewerEnrollment?.status === "active" || Boolean(viewerProgress);
      const targetParticipates = targetEnrollment?.status === "active" || Boolean(targetProgress);
      if (!viewerParticipates || !targetParticipates) continue;
      const matchingAvailable = Boolean(
        viewerAvailability?.active &&
        targetAvailability?.active &&
        viewerAvailability.progressZone === targetAvailability.progressZone,
      );
      result.push({
        courseId: course._id,
        slug: course.slug,
        titleSr: course.titleSr,
        titleEn: course.titleEn,
        matchingAvailable,
        progressZone: matchingAvailable ? viewerAvailability?.progressZone : undefined,
      });
    }
    return { ...coursesResult, page: result };
  },
});

export const listPartnerSuggestions = query({
  args: { courseId: v.id("courses"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    await requirePublishedCourse(ctx, args.courseId);
    const availability = await ctx.db
      .query("studyPartnerAvailability")
      .withIndex("by_userId_and_courseId", (q) => q.eq("userId", actor.userId).eq("courseId", args.courseId))
      .unique();
    if (!availability?.active) throw new Error("Uključi traženje partnera za ovaj kurs.");
    const result = await ctx.db
      .query("studyPartnerAvailability")
      .withIndex("by_courseId_and_progressZone_and_active_and_updatedAt", (q) =>
        q.eq("courseId", args.courseId).eq("progressZone", availability.progressZone).eq("active", true),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      if (row.userId === actor.userId) continue;
      if (await isBlockedEitherDirection(ctx, actor.userId, row.userId)) continue;
      const member = await memberSummary(ctx, row.userId);
      if (member) page.push({ ...member, progressPercent: row.progressPercent, progressZone: row.progressZone });
    }
    return {
      ...result,
      page,
      viewerProgress: {
        progressPercent: availability.progressPercent,
        progressZone: availability.progressZone,
      },
    };
  },
});

export const createPartnerInvite = mutation({
  args: { recipientId: v.id("users"), courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    if (actor.userId === args.recipientId) throw new Error("Ne možeš pozvati sebe.");
    await requirePublishedCourse(ctx, args.courseId);
    if (await isBlockedEitherDirection(ctx, actor.userId, args.recipientId)) throw new Error("CHAT_BLOCKED");
    const recipient = await ctx.db.get(args.recipientId);
    if (
      !recipient ||
      recipient.mergedInto ||
      recipient.anonymizedAt ||
      effectiveRoleForProfile(String(recipient.email ?? ""), recipient.role) === "admin"
    ) {
      throw new Error("Član nije dostupan za partnerstvo.");
    }
    await requireMatchingAvailability(ctx, actor.userId, args.recipientId, args.courseId);
    const pairKey = studyPairKey(actor.userId, args.recipientId);
    const partnership = await ctx.db
      .query("studyPartnerships")
      .withIndex("by_pairKey_and_courseId", (q) => q.eq("pairKey", pairKey).eq("courseId", args.courseId))
      .unique();
    if (partnership) throw new Error("Partnerstvo već postoji.");
    const previousInvites = await ctx.db
      .query("studyPartnerInvites")
      .withIndex("by_pairKey_and_courseId", (q) => q.eq("pairKey", pairKey).eq("courseId", args.courseId))
      .order("desc")
      .take(20);
    const latest = previousInvites[0];
    if (latest?.status === "pending") throw new Error("Poziv je već na čekanju.");
    if (latest?.status === "accepted") throw new Error("Partnerstvo je već prihvaćeno.");
    if (latest?.status === "declined" && (latest.cooldownUntil ?? 0) > Date.now()) {
      throw new Error("Novi poziv je moguć 15 dana nakon odbijanja.");
    }
    const now = Date.now();
    const inviteId = await ctx.db.insert("studyPartnerInvites", {
      pairKey,
      senderId: actor.userId,
      recipientId: args.recipientId,
      courseId: args.courseId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    const insertedInvite = await ctx.db.get(inviteId);
    if (!insertedInvite) throw new Error("STUDY_INVITE_SAVE_FAILED");
    await syncStudyPartnerInviteSummary(ctx, null, insertedInvite);
    await schedulePersistentActivityPush(ctx, {
      category: "study",
      recipientIds: [args.recipientId],
      senderId: actor.userId,
      title: "Novi poziv za partnerstvo",
      body: `${actor.user.name ?? "Član"} želi da učite zajedno na istom kursu.`,
      urlPath: "/app/messages?view=study",
      eventKey: `study-partner-invite:${String(inviteId)}`,
    });
    return { inviteId };
  },
});

export const listViewerPartnerInvites = query({
  args: {
    direction: v.union(v.literal("incoming"), v.literal("outgoing")),
    status: partnerInviteStatusValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    const result = args.direction === "incoming"
      ? await ctx.db
        .query("studyPartnerInvites")
        .withIndex("by_recipientId_and_status_and_createdAt", (q) =>
          q.eq("recipientId", actor.userId).eq("status", args.status),
        )
        .order("desc")
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("studyPartnerInvites")
        .withIndex("by_senderId_and_status_and_createdAt", (q) => q.eq("senderId", actor.userId).eq("status", args.status))
        .order("desc")
        .paginate(args.paginationOpts);
    const page = [];
    for (const invite of result.page) {
      const [counterpart, course] = await Promise.all([
        memberSummary(ctx, args.direction === "incoming" ? invite.senderId : invite.recipientId),
        ctx.db.get(invite.courseId),
      ]);
      if (!counterpart || !course) continue;
      page.push({
        inviteId: invite._id,
        direction: args.direction,
        status: invite.status,
        counterpart,
        course: { courseId: course._id, titleSr: course.titleSr, titleEn: course.titleEn },
        cooldownUntil: invite.cooldownUntil,
        createdAt: invite.createdAt,
        respondedAt: invite.respondedAt,
      });
    }
    return { ...result, page };
  },
});

export const getPartnerInvite = query({
  args: { inviteId: v.id("studyPartnerInvites") },
  handler: async (ctx, args) => {
    const current = await getCurrentProfile(ctx);
    const viewerId = current.userId as Id<"users">;
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) return null;
    if (!isStaffRole(current.profile.role) && invite.senderId !== viewerId && invite.recipientId !== viewerId) {
      throw new Error("Forbidden");
    }
    const [sender, recipient, course] = await Promise.all([
      memberSummary(ctx, invite.senderId),
      memberSummary(ctx, invite.recipientId),
      ctx.db.get(invite.courseId),
    ]);
    if (!sender || !recipient || !course) return null;
    return {
      inviteId: invite._id,
      status: invite.status,
      sender,
      recipient,
      course: { courseId: course._id, titleSr: course.titleSr, titleEn: course.titleEn },
      cooldownUntil: invite.cooldownUntil,
      createdAt: invite.createdAt,
      respondedAt: invite.respondedAt,
    };
  },
});

export const cancelPartnerInvite = mutation({
  args: { inviteId: v.id("studyPartnerInvites") },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.senderId !== actor.userId || invite.status !== "pending") throw new Error("Poziv nije pronađen.");
    const patch = { status: "cancelled" as const, updatedAt: Date.now() };
    await ctx.db.patch(invite._id, patch);
    await syncStudyPartnerInviteSummary(ctx, invite, { ...invite, ...patch });
    return null;
  },
});

export const respondToPartnerInvite = mutation({
  args: { inviteId: v.id("studyPartnerInvites"), decision: v.union(v.literal("accept"), v.literal("decline")) },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.recipientId !== actor.userId) throw new Error("Poziv nije pronađen.");
    const pairKey = studyPairKey(invite.senderId, invite.recipientId);
    const existingPartnership = await ctx.db
      .query("studyPartnerships")
      .withIndex("by_pairKey_and_courseId", (q) => q.eq("pairKey", pairKey).eq("courseId", invite.courseId))
      .unique();
    if (invite.status === "accepted" && existingPartnership) {
      await ensureStudyPartnershipMembers(ctx, existingPartnership);
      return { partnershipId: existingPartnership._id, conversationId: existingPartnership.directConversationId ?? null };
    }
    if (invite.status !== "pending") throw new Error("Poziv više nije na čekanju.");
    const now = Date.now();
    if (args.decision === "decline") {
      const patch = {
        status: "declined",
        cooldownUntil: now + STUDY_INVITE_COOLDOWN_MS,
        respondedAt: now,
        updatedAt: now,
      } as const;
      await ctx.db.patch(invite._id, patch);
      await syncStudyPartnerInviteSummary(ctx, invite, { ...invite, ...patch });
      return { partnershipId: null, conversationId: null };
    }
    await requirePublishedCourse(ctx, invite.courseId);
    await requireMatchingAvailability(ctx, invite.senderId, invite.recipientId, invite.courseId);
    const conversationId = await ensureAcceptedDirectConversation(ctx, {
      userAId: invite.senderId,
      userBId: invite.recipientId,
      createdById: actor.userId,
      systemBody: STUDY_WELCOME,
    });
    let partnership: Doc<"studyPartnerships"> | null;
    if (existingPartnership) {
      await ctx.db.patch(existingPartnership._id, { directConversationId: conversationId, updatedAt: now });
      partnership = { ...existingPartnership, directConversationId: conversationId, updatedAt: now };
    } else {
      const partnershipId = await ctx.db.insert("studyPartnerships", {
          pairKey,
          userAId: String(invite.senderId) < String(invite.recipientId) ? invite.senderId : invite.recipientId,
          userBId: String(invite.senderId) < String(invite.recipientId) ? invite.recipientId : invite.senderId,
          courseId: invite.courseId,
          directConversationId: conversationId,
          createdFromInviteId: invite._id,
          createdAt: now,
          updatedAt: now,
        });
      partnership = await ctx.db.get(partnershipId);
      if (partnership) await syncStudyPartnershipSummary(ctx, null, partnership);
    }
    if (!partnership) throw new Error("PARTNERSHIP_SAVE_FAILED");
    await ensureStudyPartnershipMembers(ctx, partnership);
    const invitePatch = {
      status: "accepted" as const,
      cooldownUntil: undefined,
      respondedAt: now,
      updatedAt: now,
    };
    await ctx.db.patch(invite._id, invitePatch);
    await syncStudyPartnerInviteSummary(ctx, invite, { ...invite, ...invitePatch });
    return { partnershipId: partnership._id, conversationId };
  },
});

export const listViewerPartnerships = query({
  args: { courseId: v.optional(v.id("courses")) },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    const [asA, asB] = await Promise.all([
      ctx.db
        .query("studyPartnerships")
        .withIndex("by_userAId_and_courseId_and_createdAt", (q) =>
          args.courseId ? q.eq("userAId", actor.userId).eq("courseId", args.courseId) : q.eq("userAId", actor.userId),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("studyPartnerships")
        .withIndex("by_userBId_and_courseId_and_createdAt", (q) =>
          args.courseId ? q.eq("userBId", actor.userId).eq("courseId", args.courseId) : q.eq("userBId", actor.userId),
        )
        .order("desc")
        .take(100),
    ]);
    const rows = [...asA, ...asB].sort((a, b) => b.createdAt - a.createdAt);
    const result = [];
    for (const row of rows) {
      const partnerId = row.userAId === actor.userId ? row.userBId : row.userAId;
      const partner = await memberSummary(ctx, partnerId);
      if (partner) result.push({ partnershipId: row._id, courseId: row.courseId, conversationId: row.directConversationId, partner });
    }
    return result;
  },
});

export const listViewerPartnershipsPage = query({
  args: { courseId: v.optional(v.id("courses")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    const result = args.courseId
      ? await ctx.db
          .query("studyPartnershipMembers")
          .withIndex("by_userId_and_courseId_and_createdAt", (q) =>
            q.eq("userId", actor.userId).eq("courseId", args.courseId!),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("studyPartnershipMembers")
          .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", actor.userId))
          .order("desc")
          .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      const [partnership, partner] = await Promise.all([
        ctx.db.get(row.partnershipId),
        memberSummary(ctx, row.partnerId),
      ]);
      if (!partnership || !partner) continue;
      page.push({
        partnershipId: partnership._id,
        courseId: partnership.courseId,
        conversationId: partnership.directConversationId,
        partner,
      });
    }
    return { ...result, page };
  },
});

export const getStudyPartnership = query({
  args: { partnershipId: v.id("studyPartnerships") },
  handler: async (ctx, args) => {
    const current = await getCurrentProfile(ctx);
    const viewerId = current.userId as Id<"users">;
    const partnership = await ctx.db.get(args.partnershipId);
    if (!partnership) return null;
    if (!isStaffRole(current.profile.role) && partnership.userAId !== viewerId && partnership.userBId !== viewerId) {
      throw new Error("Forbidden");
    }
    const [userA, userB, course] = await Promise.all([
      memberSummary(ctx, partnership.userAId),
      memberSummary(ctx, partnership.userBId),
      ctx.db.get(partnership.courseId),
    ]);
    if (!userA || !userB || !course) return null;
    return {
      partnershipId: partnership._id,
      userA,
      userB,
      course: { courseId: course._id, titleSr: course.titleSr, titleEn: course.titleEn },
      conversationId: partnership.directConversationId,
      createdAt: partnership.createdAt,
    };
  },
});

async function requireGroupAccess(ctx: QueryCtx, groupId: Id<"studyGroups">) {
  const current = await getCurrentProfile(ctx);
  const userId = current.userId as Id<"users">;
  if (isStaffRole(current.profile.role)) return { userId, isStaff: true };
  const [membership, invite] = await Promise.all([
    ctx.db
      .query("studyGroupMembers")
      .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", groupId).eq("userId", userId))
      .unique(),
    ctx.db
      .query("studyGroupInvites")
      .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", groupId).eq("userId", userId))
      .unique(),
  ]);
  if (!membership?.active && invite?.status !== "pending" && invite?.status !== "accepted") throw new Error("Forbidden");
  return { userId, isStaff: false };
}

export const createStudyGroupProposal = mutation({
  args: { courseId: v.id("courses"), name: v.string(), memberIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    await requirePublishedCourse(ctx, args.courseId);
    if (args.memberIds.length > 40) throw new Error("INVITE_IN_BATCH_LIMIT");
    const name = args.name.trim();
    if (!name || name.length > 100) throw new Error("Naziv grupe mora imati između 1 i 100 znakova.");
    const memberIds = [...new Set(args.memberIds.filter((userId) => userId !== actor.userId))];
    if (memberIds.length < 2) throw new Error("Grupni predlog mora uključiti najmanje dva partnera.");
    for (const memberId of memberIds) {
      const pairKey = studyPairKey(actor.userId, memberId);
      const partnership = await ctx.db
        .query("studyPartnerships")
        .withIndex("by_pairKey_and_courseId", (q) => q.eq("pairKey", pairKey).eq("courseId", args.courseId))
        .unique();
      if (!partnership) throw new Error("Grupu možeš predložiti samo postojećim partnerima sa ovog kursa.");
    }
    const now = Date.now();
    const groupId = await ctx.db.insert("studyGroups", {
      courseId: args.courseId,
      creatorId: actor.userId,
      name,
      status: "forming",
      activeMemberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const creatorMembershipId = await ctx.db.insert("studyGroupMembers", {
      groupId,
      userId: actor.userId,
      courseId: args.courseId,
      role: "owner",
      active: true,
      joinedAt: now,
    });
    const creatorMembership = await ctx.db.get(creatorMembershipId);
    if (!creatorMembership) throw new Error("STUDY_GROUP_MEMBER_SAVE_FAILED");
    await syncStudyGroupMembershipSummary(ctx, null, creatorMembership);
    for (const memberId of memberIds) {
      const groupInviteId = await ctx.db.insert("studyGroupInvites", {
        groupId,
        courseId: args.courseId,
        invitedBy: actor.userId,
        userId: memberId,
        status: "pending",
        createdAt: now,
      });
      const groupInvite = await ctx.db.get(groupInviteId);
      if (!groupInvite) throw new Error("STUDY_GROUP_INVITE_SAVE_FAILED");
      await syncStudyGroupInviteSummary(ctx, null, groupInvite);
    }
    await schedulePersistentActivityPush(ctx, {
      category: "study",
      recipientIds: memberIds,
      senderId: actor.userId,
      title: "Predlog studijske grupe",
      body: `${actor.user.name ?? "Član"} te poziva u studijsku grupu „${name}“.`,
      urlPath: "/app/messages?view=study",
      eventKey: `study-group-invite:${String(groupId)}`,
    });
    return { groupId };
  },
});

export const listViewerStudyGroupInvites = query({
  args: { status: partnerInviteStatusValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    const result = await ctx.db
      .query("studyGroupInvites")
      .withIndex("by_userId_and_status_and_createdAt", (q) => q.eq("userId", actor.userId).eq("status", args.status))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const invite of result.page) {
      const [group, inviter, course] = await Promise.all([
        ctx.db.get(invite.groupId),
        memberSummary(ctx, invite.invitedBy),
        ctx.db.get(invite.courseId),
      ]);
      if (!group || !inviter || !course) continue;
      page.push({
        inviteId: invite._id,
        status: invite.status,
        group: {
          groupId: group._id,
          name: group.name,
          status: group.status,
          activeMemberCount: group.activeMemberCount,
          conversationId: group.conversationId,
        },
        inviter,
        course: { courseId: course._id, titleSr: course.titleSr, titleEn: course.titleEn },
        createdAt: invite.createdAt,
        respondedAt: invite.respondedAt,
      });
    }
    return { ...result, page };
  },
});

export const listViewerStudyGroups = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireStudyActor(ctx);
    const memberships = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_userId_and_courseId_and_active_and_joinedAt", (q) => q.eq("userId", actor.userId))
      .order("desc")
      .take(100);
    const result = [];
    for (const membership of memberships) {
      if (!membership.active) continue;
      const [group, course] = await Promise.all([ctx.db.get(membership.groupId), ctx.db.get(membership.courseId)]);
      if (!group || !course) continue;
      result.push({
        groupId: group._id,
        name: group.name,
        status: group.status,
        activeMemberCount: group.activeMemberCount,
        conversationId: group.conversationId,
        membershipRole: membership.role,
        course: { courseId: course._id, titleSr: course.titleSr, titleEn: course.titleEn },
        updatedAt: group.updatedAt,
      });
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const listViewerStudyGroupsPage = query({
  args: { courseId: v.optional(v.id("courses")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    const result = args.courseId
      ? await ctx.db
          .query("studyGroupMembers")
          .withIndex("by_userId_and_courseId_and_active_and_joinedAt", (q) =>
            q.eq("userId", actor.userId).eq("courseId", args.courseId!).eq("active", true),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("studyGroupMembers")
          .withIndex("by_userId_and_active_and_joinedAt", (q) =>
            q.eq("userId", actor.userId).eq("active", true),
          )
          .order("desc")
          .paginate(args.paginationOpts);
    const page = [];
    for (const membership of result.page) {
      const [group, course] = await Promise.all([
        ctx.db.get(membership.groupId),
        ctx.db.get(membership.courseId),
      ]);
      if (!group || !course) continue;
      page.push({
        groupId: group._id,
        name: group.name,
        status: group.status,
        activeMemberCount: group.activeMemberCount,
        conversationId: group.conversationId,
        membershipRole: membership.role,
        course: { courseId: course._id, titleSr: course.titleSr, titleEn: course.titleEn },
        updatedAt: group.updatedAt,
      });
    }
    return { ...result, page };
  },
});

export const respondToStudyGroupInvite = mutation({
  args: { inviteId: v.id("studyGroupInvites"), decision: v.union(v.literal("accept"), v.literal("decline")) },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.userId !== actor.userId || invite.status !== "pending") throw new Error("Poziv za grupu nije pronađen.");
    const group = await ctx.db.get(invite.groupId);
    if (!group) throw new Error("Grupa nije pronađena.");
    const now = Date.now();
    if (args.decision === "decline") {
      const patch = { status: "declined" as const, respondedAt: now };
      await ctx.db.patch(invite._id, patch);
      await syncStudyGroupInviteSummary(ctx, invite, { ...invite, ...patch });
      return { groupId: group._id, status: group.status, activeMemberCount: group.activeMemberCount, conversationId: group.conversationId ?? null };
    }
    const existingMember = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", group._id).eq("userId", actor.userId))
      .unique();
    const addedMember = !existingMember?.active;
    if (existingMember) {
      const patch = { active: true, leftAt: undefined, joinedAt: now };
      await ctx.db.patch(existingMember._id, patch);
      await syncStudyGroupMembershipSummary(ctx, existingMember, { ...existingMember, ...patch });
    } else {
      const membershipId = await ctx.db.insert("studyGroupMembers", {
        groupId: group._id,
        userId: actor.userId,
        courseId: group.courseId,
        role: "member",
        active: true,
        joinedAt: now,
      });
      const membership = await ctx.db.get(membershipId);
      if (!membership) throw new Error("STUDY_GROUP_MEMBER_SAVE_FAILED");
      await syncStudyGroupMembershipSummary(ctx, null, membership);
    }
    const invitePatch = { status: "accepted" as const, respondedAt: now };
    await ctx.db.patch(invite._id, invitePatch);
    await syncStudyGroupInviteSummary(ctx, invite, { ...invite, ...invitePatch });
    const activeMemberCount = group.activeMemberCount + (addedMember ? 1 : 0);
    let status = group.status;
    let conversationId = group.conversationId;
    if (group.status === "forming" && activeMemberCount >= 3) {
      const members = await ctx.db
        .query("studyGroupMembers")
        .withIndex("by_groupId_and_active_and_joinedAt", (q) => q.eq("groupId", group._id).eq("active", true))
        .take(10);
      conversationId = await ensureStudyGroupConversation(ctx, {
        groupId: group._id,
        courseId: group.courseId,
        ownerId: group.creatorId,
        memberIds: members.map((member) => member.userId),
        name: group.name,
        systemBody: STUDY_GROUP_WELCOME,
      });
      status = "active";
    } else if (group.status === "active") {
      conversationId = await ensureStudyGroupConversation(ctx, {
        groupId: group._id,
        courseId: group.courseId,
        ownerId: group.creatorId,
        memberIds: [actor.userId],
        name: group.name,
        systemBody: STUDY_GROUP_WELCOME,
      });
    }
    await ctx.db.patch(group._id, { activeMemberCount, status, conversationId, updatedAt: now });
    return { groupId: group._id, status, activeMemberCount, conversationId: conversationId ?? null };
  },
});

export const getStudyGroup = query({
  args: { groupId: v.id("studyGroups") },
  handler: async (ctx, args) => {
    const access = await requireGroupAccess(ctx, args.groupId);
    const group = await ctx.db.get(args.groupId);
    if (!group) return null;
    const membership = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", group._id).eq("userId", access.userId))
      .unique();
    return {
      groupId: group._id,
      courseId: group.courseId,
      name: group.name,
      status: group.status,
      activeMemberCount: group.activeMemberCount,
      conversationId: group.conversationId,
      viewer: { isStaff: access.isStaff, isMember: Boolean(membership?.active), isOwner: membership?.role === "owner" && membership.active },
    };
  },
});

export const listStudyGroupMembersPage = query({
  args: { groupId: v.id("studyGroups"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireGroupAccess(ctx, args.groupId);
    const result = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_groupId_and_active_and_joinedAt", (q) => q.eq("groupId", args.groupId).eq("active", true))
      .order("asc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const row of result.page) {
      const member = await memberSummary(ctx, row.userId);
      if (member) page.push({ ...member, membershipId: row._id, membershipRole: row.role, joinedAt: row.joinedAt });
    }
    return { ...result, page };
  },
});

export const transferStudyGroupOwnership = mutation({
  args: { groupId: v.id("studyGroups"), newOwnerId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    if (actor.userId === args.newOwnerId) throw new Error("Već si vlasnik grupe.");
    const [group, currentMembership, nextMembership] = await Promise.all([
      ctx.db.get(args.groupId),
      ctx.db
        .query("studyGroupMembers")
        .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", args.groupId).eq("userId", actor.userId))
        .unique(),
      ctx.db
        .query("studyGroupMembers")
        .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", args.groupId).eq("userId", args.newOwnerId))
        .unique(),
    ]);
    if (!group || group.creatorId !== actor.userId || currentMembership?.role !== "owner" || !currentMembership.active) {
      throw new Error("Samo aktivni vlasnik može preneti grupu.");
    }
    if (!nextMembership?.active) throw new Error("Novi vlasnik mora biti aktivni član grupe.");
    const now = Date.now();
    await Promise.all([
      ctx.db.patch(currentMembership._id, { role: "member" }),
      ctx.db.patch(nextMembership._id, { role: "owner" }),
      ctx.db.patch(group._id, { creatorId: args.newOwnerId, updatedAt: now }),
    ]);
    if (group.conversationId) {
      const [conversation, currentChatMember, nextChatMember] = await Promise.all([
        ctx.db.get(group.conversationId),
        ctx.db
          .query("chatMembers")
          .withIndex("by_conversationId_and_userId", (q) => q.eq("conversationId", group.conversationId!).eq("userId", actor.userId))
          .unique(),
        ctx.db
          .query("chatMembers")
          .withIndex("by_conversationId_and_userId", (q) => q.eq("conversationId", group.conversationId!).eq("userId", args.newOwnerId))
          .unique(),
      ]);
      if (conversation?.kind === "group") await ctx.db.patch(conversation._id, { ownerId: args.newOwnerId, updatedAt: now });
      if (currentChatMember) await ctx.db.patch(currentChatMember._id, { role: "member", updatedAt: now });
      if (nextChatMember) await ctx.db.patch(nextChatMember._id, { role: "owner", updatedAt: now });
    }
    return { groupId: group._id, ownerId: args.newOwnerId };
  },
});

export const leaveStudyGroup = mutation({
  args: { groupId: v.id("studyGroups") },
  handler: async (ctx, args) => {
    const actor = await requireStudyActor(ctx);
    const [group, membership] = await Promise.all([
      ctx.db.get(args.groupId),
      ctx.db
        .query("studyGroupMembers")
        .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", args.groupId).eq("userId", actor.userId))
        .unique(),
    ]);
    if (!group || !membership?.active) throw new Error("Aktivno članstvo nije pronađeno.");
    if (membership.role === "owner") throw new Error("Vlasnik grupe ne može izaći bez prenosa vlasništva.");
    const now = Date.now();
    const membershipPatch = { active: false, leftAt: now };
    await ctx.db.patch(membership._id, membershipPatch);
    await syncStudyGroupMembershipSummary(ctx, membership, { ...membership, ...membershipPatch });
    if (group.conversationId) {
      const chatMembership = await ctx.db
        .query("chatMembers")
        .withIndex("by_conversationId_and_userId", (q) =>
          q.eq("conversationId", group.conversationId!).eq("userId", actor.userId),
        )
        .unique();
      if (chatMembership) {
        const patch = {
          status: "left" as const,
          leftAt: now,
          unreadCount: 0,
          hasUnread: false,
          isPinned: false,
          isArchived: true,
          lastReadSequence: Math.max(
            chatMembership.lastReadSequence,
            chatMembership.lastDeliveredSequence,
          ),
          updatedAt: now,
        };
        await ctx.db.patch(chatMembership._id, patch);
        await syncChatInboxSummaryMember(ctx, chatMembership._id, { ...chatMembership, ...patch });
        await syncConversationSearchEntry(ctx, {
          conversationId: group.conversationId,
          viewerId: actor.userId,
          membershipStatus: patch.status,
        });
      }
    }
    const activeMemberCount = Math.max(1, group.activeMemberCount - 1);
    await ctx.db.patch(group._id, { activeMemberCount, updatedAt: now });
    return { groupId: group._id, status: group.status, activeMemberCount };
  },
});
