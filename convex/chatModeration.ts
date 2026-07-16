import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getChatMembership, isStaffRole, requireChatActor } from "./chatCore";
import { effectiveRoleForProfile, getCurrentProfile } from "./helpers";

const reportStatusValidator = v.union(
  v.literal("open"),
  v.literal("reviewing"),
  v.literal("resolved"),
  v.literal("dismissed"),
);

const moderationKindValidator = v.union(
  v.literal("remove_message"),
  v.literal("warn"),
  v.literal("suspend_chat"),
  v.literal("recommend_account_suspension"),
);

function cleanReason(reason: string) {
  const value = reason.trim();
  if (value.length < 3 || value.length > 1_000) throw new Error("INVALID_REASON");
  return value;
}

function cleanAppeal(body: string) {
  const value = body.trim();
  if (value.length < 10 || value.length > 5_000) throw new Error("INVALID_APPEAL");
  return value;
}

async function requireSignedInWithoutSuspension(ctx: QueryCtx | MutationCtx) {
  const current = await getCurrentProfile(ctx);
  const user = await ctx.db.get(current.userId as Id<"users">);
  if (!user || user.mergedInto || user.anonymizedAt) throw new Error("Unauthorized");
  return {
    user,
    userId: user._id,
    role: effectiveRoleForProfile(String(user.email ?? ""), user.role),
  };
}

async function requireStaff(ctx: QueryCtx | MutationCtx) {
  const actor = await requireChatActor(ctx);
  if (!isStaffRole(actor.role)) throw new Error("Staff access required");
  return actor;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const actor = await requireChatActor(ctx);
  if (actor.role !== "admin") throw new Error("Admin access required");
  return actor;
}

function messageSnapshot(message: Doc<"chatMessages">) {
  return {
    messageId: message._id,
    conversationId: message.conversationId,
    sequence: message.sequence,
    senderId: message.senderId,
    senderName: message.senderName,
    kind: message.kind,
    body: message.body,
    replyToMessageId: message.replyToMessageId,
    mentionUserIds: message.mentionUserIds,
    imageCount: message.imageCount,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    createdAt: message.createdAt,
  };
}

export const reportContent = mutation({
  args: {
    targetType: v.union(v.literal("message"), v.literal("profile"), v.literal("group")),
    targetUserId: v.optional(v.id("users")),
    targetConversationId: v.optional(v.id("chatConversations")),
    targetMessageId: v.optional(v.id("chatMessages")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const reason = cleanReason(args.reason);
    const now = Date.now();
    let targetUserId: Id<"users"> | undefined;
    let targetConversationId: Id<"chatConversations"> | undefined;
    let targetMessageId: Id<"chatMessages"> | undefined;
    let snapshot: unknown;
    let context: Doc<"chatMessages">[] = [];

    if (args.targetType === "message") {
      if (!args.targetMessageId || args.targetUserId || args.targetConversationId) {
        throw new Error("INVALID_REPORT_TARGET");
      }
      const message = await ctx.db.get(args.targetMessageId);
      if (!message) throw new Error("Message not found");
      const membership = await getChatMembership(ctx, message.conversationId, actor.userId);
      if (membership?.status !== "active" || message.sequence <= membership.historyCutoffSequence) {
        throw new Error("Forbidden");
      }
      const images = await ctx.db
        .query("chatImages")
        .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
        .take(4);
      targetUserId = message.senderId;
      targetConversationId = message.conversationId;
      targetMessageId = message._id;
      snapshot = {
        targetType: "message",
        message: messageSnapshot(message),
        images: images.map((image) => ({
          imageId: image._id,
          fileName: image.fileName,
          mimeType: image.mimeType,
          byteSize: image.byteSize,
          width: image.width,
          height: image.height,
          status: image.status,
        })),
      };
      context = await ctx.db
        .query("chatMessages")
        .withIndex("by_conversationId_and_sequence", (q) =>
          q
            .eq("conversationId", message.conversationId)
            .gte("sequence", Math.max(1, message.sequence - 10))
            .lte("sequence", message.sequence + 10),
        )
        .take(21);
    } else if (args.targetType === "profile") {
      if (!args.targetUserId || args.targetConversationId || args.targetMessageId) {
        throw new Error("INVALID_REPORT_TARGET");
      }
      const target = await ctx.db.get(args.targetUserId);
      if (!target || target.mergedInto) throw new Error("Profile not found");
      targetUserId = target._id;
      snapshot = {
        targetType: "profile",
        profile: {
          userId: target._id,
          name: target.name,
          username: target.username,
          role: target.role,
          bio: target.bio,
          avatarUrl: target.avatarUrl ?? target.image,
          anonymizedAt: target.anonymizedAt,
        },
      };
    } else {
      if (!args.targetConversationId || args.targetUserId || args.targetMessageId) {
        throw new Error("INVALID_REPORT_TARGET");
      }
      const conversation = await ctx.db.get(args.targetConversationId);
      if (!conversation || conversation.kind !== "group" || conversation.deletedAt) {
        throw new Error("Group not found");
      }
      const membership = await getChatMembership(ctx, conversation._id, actor.userId);
      if (membership?.status !== "active") throw new Error("Forbidden");
      const members = await ctx.db
        .query("chatMembers")
        .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
          q.eq("conversationId", conversation._id).eq("status", "active"),
        )
        .take(201);
      targetUserId = conversation.ownerId;
      targetConversationId = conversation._id;
      snapshot = {
        targetType: "group",
        group: {
          conversationId: conversation._id,
          title: conversation.title,
          ownerId: conversation.ownerId,
          createdById: conversation.createdById,
          courseId: conversation.courseId,
          studyGroupId: conversation.studyGroupId,
          memberCount: members.length,
          memberCountTruncated: members.length > 200,
          createdAt: conversation.createdAt,
        },
      };
    }

    const reportId = await ctx.db.insert("chatReports", {
      reporterId: actor.userId,
      targetType: args.targetType,
      targetUserId,
      targetConversationId,
      targetMessageId,
      reason,
      snapshotJson: JSON.stringify(snapshot),
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    for (const message of context) {
      await ctx.db.insert("chatReportMessages", {
        reportId,
        messageId: message._id,
        conversationId: message.conversationId,
        sequence: message.sequence,
        snapshotJson: JSON.stringify(messageSnapshot(message)),
        createdAt: now,
      });
    }
    return reportId;
  },
});

export const listReportsPage = query({
  args: {
    status: v.optional(reportStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (args.status) {
      return ctx.db
        .query("chatReports")
        .withIndex("by_status_and_createdAt", (q) => q.eq("status", args.status!))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return ctx.db.query("chatReports").order("desc").paginate(args.paginationOpts);
  },
});

export const getReport = query({
  args: { reportId: v.id("chatReports") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    const context = await ctx.db
      .query("chatReportMessages")
      .withIndex("by_reportId_and_sequence", (q) => q.eq("reportId", report._id))
      .take(21);
    const actions = await ctx.db
      .query("chatModerationActions")
      .withIndex("by_reportId_and_createdAt", (q) => q.eq("reportId", report._id))
      .order("desc")
      .take(100);
    return { report, context, actions };
  },
});

export const getReportedConversation = query({
  args: {
    reportId: v.id("chatReports"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report?.targetConversationId) throw new Error("Report has no conversation");
    const conversation = await ctx.db.get(report.targetConversationId);
    if (!conversation) throw new Error("Conversation not found");
    const page = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId_and_sequence", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { conversation, ...page };
  },
});

export const openAdminUserChats = mutation({
  args: { targetUserId: v.id("users"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reason = cleanReason(args.reason);
    const target = await ctx.db.get(args.targetUserId);
    if (!target) throw new Error("Profile not found");
    const memberships = await ctx.db
      .query("chatMembers")
      .withIndex("by_userId_and_status_and_lastDeliveredAt", (q) =>
        q.eq("userId", target._id),
      )
      .order("desc")
      .take(201);
    await ctx.db.insert("chatAccessAudit", {
      adminId: admin.userId,
      targetUserId: target._id,
      reason,
      createdAt: Date.now(),
    });
    const conversations = await Promise.all(
      memberships.slice(0, 200).map(async (membership) => ({
        membership,
        conversation: await ctx.db.get(membership.conversationId),
      })),
    );
    return { conversations, truncated: memberships.length > 200 };
  },
});

export const openAdminConversationAccess = mutation({
  args: {
    targetUserId: v.id("users"),
    conversationId: v.id("chatConversations"),
    reason: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reason = cleanReason(args.reason);
    const [target, conversation, membership] = await Promise.all([
      ctx.db.get(args.targetUserId),
      ctx.db.get(args.conversationId),
      getChatMembership(ctx, args.conversationId, args.targetUserId),
    ]);
    if (!target || !conversation || !membership) throw new Error("Conversation not found");
    await ctx.db.insert("chatAccessAudit", {
      adminId: admin.userId,
      targetUserId: target._id,
      conversationId: conversation._id,
      reason,
      createdAt: Date.now(),
    });
    const page = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId_and_sequence", (q) =>
        q.eq("conversationId", conversation._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return { conversation, membership, ...page };
  },
});

async function removeMessage(ctx: MutationCtx, message: Doc<"chatMessages">) {
  const now = Date.now();
  const images = await ctx.db
    .query("chatImages")
    .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
    .take(4);
  for (const image of images) {
    if (image.storageId) await ctx.storage.delete(image.storageId);
    await ctx.db.patch(image._id, { storageId: undefined, status: "deleted", updatedAt: now });
  }
  await ctx.db.patch(message._id, {
    body: undefined,
    searchText: undefined,
    imageCount: 0,
    deletedAt: now,
  });
  const conversation = await ctx.db.get(message.conversationId);
  if (conversation?.lastMessageSequence === message.sequence) {
    await ctx.db.patch(conversation._id, {
      lastMessagePreview: "Poruka je uklonjena",
      updatedAt: now,
    });
  }
}

export const moderateReport = mutation({
  args: {
    reportId: v.optional(v.id("chatReports")),
    kind: moderationKindValidator,
    targetUserId: v.optional(v.id("users")),
    conversationId: v.optional(v.id("chatConversations")),
    messageId: v.optional(v.id("chatMessages")),
    reason: v.string(),
    endsAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    if (actor.role === "moderator" && !args.reportId) throw new Error("REPORT_REQUIRED");
    const report = args.reportId ? await ctx.db.get(args.reportId) : null;
    if (args.reportId && !report) throw new Error("Report not found");
    const messageId = args.messageId ?? report?.targetMessageId;
    const conversationId = args.conversationId ?? report?.targetConversationId;
    let targetUserId = args.targetUserId ?? report?.targetUserId;
    let message: Doc<"chatMessages"> | null = null;
    if (messageId) {
      message = await ctx.db.get(messageId);
      if (!message) throw new Error("Message not found");
      targetUserId ??= message.senderId;
    }
    if (
      report &&
      ((report.targetMessageId && report.targetMessageId !== messageId) ||
        (report.targetConversationId && report.targetConversationId !== conversationId) ||
        (report.targetUserId && targetUserId && report.targetUserId !== targetUserId))
    ) {
      throw new Error("ACTION_DOES_NOT_MATCH_REPORT");
    }
    if (args.kind === "remove_message") {
      if (!message) throw new Error("Message required");
      await removeMessage(ctx, message);
    } else {
      if (!targetUserId) throw new Error("Target user required");
      const target = await ctx.db.get(targetUserId);
      if (!target) throw new Error("Profile not found");
      const targetRole = effectiveRoleForProfile(String(target.email ?? ""), target.role);
      if (actor.role === "moderator" && targetRole === "admin") throw new Error("Admin access required");
      if (args.kind === "suspend_chat") {
        const now = Date.now();
        if (!args.endsAt || args.endsAt <= now || args.endsAt > now + 30 * 24 * 60 * 60 * 1000) {
          throw new Error("INVALID_CHAT_SUSPENSION_END");
        }
      }
    }
    const now = Date.now();
    const actionId = await ctx.db.insert("chatModerationActions", {
      reportId: report?._id,
      actorId: actor.userId,
      targetUserId,
      conversationId,
      messageId,
      kind: args.kind,
      reason: cleanReason(args.reason),
      endsAt: args.kind === "suspend_chat" ? args.endsAt : undefined,
      createdAt: now,
    });
    if (
      targetUserId &&
      targetUserId !== actor.userId &&
      args.kind !== "recommend_account_suspension"
    ) {
      const title = {
        remove_message: "Poruka je uklonjena",
        warn: "Upozorenje moderatora",
        suspend_chat: "Chat je suspendovan",
      }[args.kind];
      await ctx.db.insert("notifications", {
        userId: targetUserId,
        title,
        body: cleanReason(args.reason),
        kind: "chat_sanction",
        senderId: actor.userId,
        eventKey: `chat_sanction:${String(actionId)}`,
        createdAt: now,
      });
    }
    if (report) await ctx.db.patch(report._id, { status: "resolved", updatedAt: now });
    return actionId;
  },
});

export const updateReportStatus = mutation({
  args: { reportId: v.id("chatReports"), status: reportStatusValidator },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");
    await ctx.db.patch(report._id, { status: args.status, updatedAt: Date.now() });
    return report._id;
  },
});

export const suspendAccount = mutation({
  args: {
    userId: v.id("users"),
    duration: v.union(
      v.literal("24h"),
      v.literal("7d"),
      v.literal("30d"),
      v.literal("permanent"),
    ),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin.userId === args.userId) throw new Error("CANNOT_SUSPEND_SELF");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Profile not found");
    const now = Date.now();
    const durationMs = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
      permanent: undefined,
    }[args.duration];
    const active = await ctx.db
      .query("accountSuspensions")
      .withIndex("by_userId_and_active_and_createdAt", (q) =>
        q.eq("userId", target._id).eq("active", true),
      )
      .take(50);
    for (const suspension of active) {
      await ctx.db.patch(suspension._id, {
        active: false,
        liftedAt: now,
        liftedBy: admin.userId,
      });
    }
    const suspensionId = await ctx.db.insert("accountSuspensions", {
      userId: target._id,
      createdBy: admin.userId,
      reason: cleanReason(args.reason),
      startsAt: now,
      endsAt: durationMs === undefined ? undefined : now + durationMs,
      permanent: args.duration === "permanent",
      active: true,
      createdAt: now,
    });
    await ctx.db.insert("notifications", {
      userId: target._id,
      title: "Nalog je suspendovan",
      body: cleanReason(args.reason),
      kind: "account_suspension",
      senderId: admin.userId,
      eventKey: `account_suspension:${String(suspensionId)}`,
      createdAt: now,
    });
    return suspensionId;
  },
});

export const getMySuspension = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireSignedInWithoutSuspension(ctx);
    const rows = await ctx.db
      .query("accountSuspensions")
      .withIndex("by_userId_and_active_and_createdAt", (q) =>
        q.eq("userId", actor.userId).eq("active", true),
      )
      .order("desc")
      .take(20);
    const now = Date.now();
    const suspension = rows.find(
      (row) => row.permanent || !row.endsAt || row.endsAt > now,
    );
    if (!suspension) return null;
    const appeal = await ctx.db
      .query("suspensionAppeals")
      .withIndex("by_suspensionId_and_userId", (q) =>
        q.eq("suspensionId", suspension._id).eq("userId", actor.userId),
      )
      .unique();
    return {
      suspensionId: suspension._id,
      reason: suspension.reason,
      startsAt: suspension.startsAt,
      endsAt: suspension.endsAt,
      permanent: suspension.permanent,
      appeal: appeal
        ? {
            status: appeal.status,
            body: appeal.body,
            response: appeal.response,
            createdAt: appeal.createdAt,
            reviewedAt: appeal.reviewedAt,
          }
        : null,
    };
  },
});

export const submitSuspensionAppeal = mutation({
  args: { suspensionId: v.id("accountSuspensions"), body: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireSignedInWithoutSuspension(ctx);
    const suspension = await ctx.db.get(args.suspensionId);
    if (!suspension || suspension.userId !== actor.userId || !suspension.active) {
      throw new Error("Suspension not found");
    }
    const existing = await ctx.db
      .query("suspensionAppeals")
      .withIndex("by_suspensionId_and_userId", (q) =>
        q.eq("suspensionId", suspension._id).eq("userId", actor.userId),
      )
      .unique();
    if (existing) throw new Error("APPEAL_ALREADY_SUBMITTED");
    return ctx.db.insert("suspensionAppeals", {
      suspensionId: suspension._id,
      userId: actor.userId,
      body: cleanAppeal(args.body),
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const listSuspensionAppealsPage = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected"))),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.status) {
      return ctx.db
        .query("suspensionAppeals")
        .withIndex("by_status_and_createdAt", (q) => q.eq("status", args.status!))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return ctx.db.query("suspensionAppeals").order("desc").paginate(args.paginationOpts);
  },
});

export const reviewSuspensionAppeal = mutation({
  args: {
    appealId: v.id("suspensionAppeals"),
    decision: v.union(v.literal("accepted"), v.literal("rejected")),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const appeal = await ctx.db.get(args.appealId);
    if (!appeal || appeal.status !== "pending") throw new Error("Appeal not found");
    const response = cleanReason(args.response);
    const now = Date.now();
    await ctx.db.patch(appeal._id, {
      status: args.decision,
      reviewedBy: admin.userId,
      response,
      reviewedAt: now,
    });
    if (args.decision === "accepted") {
      const suspension = await ctx.db.get(appeal.suspensionId);
      if (suspension?.active) {
        await ctx.db.patch(suspension._id, {
          active: false,
          liftedAt: now,
          liftedBy: admin.userId,
        });
      }
    }
    return appeal._id;
  },
});

export const liftAccountSuspension = mutation({
  args: { suspensionId: v.id("accountSuspensions"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    cleanReason(args.reason);
    const suspension = await ctx.db.get(args.suspensionId);
    if (!suspension) throw new Error("Suspension not found");
    if (suspension.active) {
      await ctx.db.patch(suspension._id, {
        active: false,
        liftedAt: Date.now(),
        liftedBy: admin.userId,
      });
    }
    return suspension._id;
  },
});
