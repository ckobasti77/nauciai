import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { effectiveRoleForProfile, getCurrentProfile } from "./helpers";

export const DIRECT_REQUEST_MESSAGE_LIMIT = 3;
export const DIRECT_REQUEST_DAILY_LIMIT = 10;
export const GROUP_INVITE_DAILY_LIMIT = 20;
export const REQUEST_COOLDOWN_MS = 15 * 24 * 60 * 60 * 1000;
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const TYPING_TTL_MS = 12_000;
export const MAX_MESSAGE_IMAGES = 4;
export const MAX_MESSAGE_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_MESSAGE_BODY_LENGTH = 10_000;

export type ChatCtx = QueryCtx | MutationCtx;

export type ChatActor = {
  userId: Id<"users">;
  user: Doc<"users">;
  role: "student" | "pro_student" | "moderator" | "admin";
};

const deliveryBatchRef = makeFunctionReference<
  "mutation",
  {
    conversationId: Id<"chatConversations">;
    sequence: number;
    senderId?: Id<"users">;
    cursor: string | null;
  },
  null
>("chatCore:deliverMessageBatch");

const anonymizeBatchRef = makeFunctionReference<
  "mutation",
  { userId: Id<"users"> },
  null
>("chatCore:anonymizeUserMessagesBatch");

const pushBatchRef = makeFunctionReference<
  "action",
  {
    conversationId: Id<"chatConversations">;
    sequence: number;
    recipientIds: Id<"users">[];
  },
  null
>("chatPush:sendPushBatch");

const activityPushBatchRef = makeFunctionReference<
  "action",
  {
    category: "requests" | "groups" | "study";
    recipientIds: Id<"users">[];
    senderId?: Id<"users">;
    conversationId?: Id<"chatConversations">;
    title: string;
    body: string;
    urlPath: string;
    eventKey: string;
  },
  null
>("chatPush:sendActivityPushBatch");

function roleForUser(user: Doc<"users">) {
  return effectiveRoleForProfile(String(user.email ?? ""), user.role);
}

export function isStaffRole(role: unknown): role is "admin" | "moderator" {
  return role === "admin" || role === "moderator";
}

export function directPairKey(userAId: Id<"users">, userBId: Id<"users">) {
  return [String(userAId), String(userBId)].sort().join(":");
}

export function directConversationKey(
  kind: "direct" | "support",
  userAId: Id<"users">,
  userBId: Id<"users">,
) {
  return `${kind}:${directPairKey(userAId, userBId)}`;
}

export async function getChatMembership(
  ctx: ChatCtx,
  conversationId: Id<"chatConversations">,
  userId: Id<"users">,
) {
  return ctx.db
    .query("chatMembers")
    .withIndex("by_conversationId_and_userId", (q) =>
      q.eq("conversationId", conversationId).eq("userId", userId),
    )
    .unique();
}

export async function requireChatActor(ctx: ChatCtx): Promise<ChatActor> {
  const current = await getCurrentProfile(ctx);
  const user = await ctx.db.get(current.userId as Id<"users">);
  if (!user || user.mergedInto || user.anonymizedAt) throw new Error("Unauthorized");

  const suspension = await ctx.db
    .query("accountSuspensions")
    .withIndex("by_userId_and_active_and_createdAt", (q) =>
      q.eq("userId", user._id).eq("active", true),
    )
    .order("desc")
    .first();
  const now = Date.now();
  if (suspension && (suspension.permanent || !suspension.endsAt || suspension.endsAt > now)) {
    throw new Error("ACCOUNT_SUSPENDED");
  }

  const chatSuspensions = await ctx.db
    .query("chatModerationActions")
    .withIndex("by_targetUserId_and_createdAt", (q) => q.eq("targetUserId", user._id))
    .order("desc")
    .take(20);
  const chatSuspension = chatSuspensions.find(
    (entry) => entry.kind === "suspend_chat" && (!entry.endsAt || entry.endsAt > now),
  );
  if (chatSuspension) throw new Error("CHAT_SUSPENDED");

  return { userId: user._id, user, role: roleForUser(user) };
}

export async function requireConversationMember(
  ctx: ChatCtx,
  conversationId: Id<"chatConversations">,
  options: { allowInvited?: boolean } = {},
) {
  const actor = await requireChatActor(ctx);
  const [conversation, membership] = await Promise.all([
    ctx.db.get(conversationId),
    getChatMembership(ctx, conversationId, actor.userId),
  ]);
  if (!conversation || conversation.deletedAt) throw new Error("Conversation not found");
  const allowed = membership?.status === "active" || (options.allowInvited && membership?.status === "invited");
  if (!membership || !allowed) throw new Error("Forbidden");
  return { actor, conversation, membership };
}

export async function isBlockedEitherDirection(
  ctx: ChatCtx,
  userAId: Id<"users">,
  userBId: Id<"users">,
) {
  const [aBlockedB, bBlockedA] = await Promise.all([
    ctx.db
      .query("chatBlocks")
      .withIndex("by_blockerId_and_blockedId", (q) =>
        q.eq("blockerId", userAId).eq("blockedId", userBId),
      )
      .unique(),
    ctx.db
      .query("chatBlocks")
      .withIndex("by_blockerId_and_blockedId", (q) =>
        q.eq("blockerId", userBId).eq("blockedId", userAId),
      )
      .unique(),
  ]);
  return Boolean(aBlockedB || bBlockedA);
}

export async function recipientFollowsSender(
  ctx: ChatCtx,
  recipientId: Id<"users">,
  senderId: Id<"users">,
) {
  const follow = await ctx.db
    .query("userFollows")
    .withIndex("by_followerId_and_followingId", (q) =>
      q.eq("followerId", recipientId).eq("followingId", senderId),
    )
    .unique();
  return Boolean(follow);
}

async function assertDirectRequestRateLimit(ctx: MutationCtx, recipientId: Id<"users">) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const statuses = ["pending", "accepted", "declined"] as const;
  let count = 0;
  for (const status of statuses) {
    const rows = await ctx.db
      .query("chatDirectRequests")
      .withIndex("by_recipientId_and_status_and_createdAt", (q) =>
        q.eq("recipientId", recipientId).eq("status", status).gte("createdAt", since),
      )
      .take(DIRECT_REQUEST_DAILY_LIMIT + 1);
    count += rows.length;
    if (count >= DIRECT_REQUEST_DAILY_LIMIT) throw new Error("DM_REQUEST_RATE_LIMIT");
  }
}

export async function assertGroupInviteRateLimit(ctx: MutationCtx, recipientId: Id<"users">) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = await ctx.db
    .query("chatMembers")
    .withIndex("by_userId_and_invitedAt", (q) =>
      q.eq("userId", recipientId).gte("invitedAt", since),
    )
    .take(GROUP_INVITE_DAILY_LIMIT);
  if (rows.length >= GROUP_INVITE_DAILY_LIMIT) throw new Error("GROUP_INVITE_RATE_LIMIT");
}

export async function upsertChatMember(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"chatConversations">;
    userId: Id<"users">;
    conversationKind: "direct" | "group" | "support";
    role: "owner" | "member";
    status: "invited" | "active" | "left" | "removed";
    requestStatus: "none" | "pending" | "accepted" | "declined";
    invitedBy?: Id<"users">;
    invitedAt?: number;
    joinedAt?: number;
  },
) {
  const existing = await getChatMembership(ctx, args.conversationId, args.userId);
  const now = Date.now();
  const values = {
    conversationKind: args.conversationKind,
    role: args.role,
    status: args.status,
    requestStatus: args.requestStatus,
    invitedBy: args.invitedBy,
    invitedAt: args.invitedAt,
    joinedAt: args.joinedAt,
    leftAt: undefined,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, values);
    return existing._id;
  }
  return ctx.db.insert("chatMembers", {
    conversationId: args.conversationId,
    userId: args.userId,
    ...values,
    lastReadSequence: 0,
    lastDeliveredSequence: 0,
    lastDeliveredAt: now,
    unreadCount: 0,
    hasUnread: false,
    isArchived: false,
    isPinned: false,
    historyCutoffSequence: 0,
  });
}

async function setRequestStatusForMembers(
  ctx: MutationCtx,
  conversationId: Id<"chatConversations">,
  status: "pending" | "accepted" | "declined",
) {
  const members = await ctx.db
    .query("chatMembers")
    .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
      q.eq("conversationId", conversationId).eq("status", "active"),
    )
    .take(3);
  await Promise.all(
    members.map((member) =>
      ctx.db.patch(member._id, {
        requestStatus: status,
        isArchived: status === "declined" ? true : status === "accepted" ? false : member.isArchived,
        updatedAt: Date.now(),
      }),
    ),
  );
}

export async function acceptDirectRequestCore(
  ctx: MutationCtx,
  request: Doc<"chatDirectRequests">,
) {
  const now = Date.now();
  await ctx.db.patch(request._id, {
    status: "accepted",
    cooldownUntil: undefined,
    updatedAt: now,
  });
  await setRequestStatusForMembers(ctx, request.conversationId, "accepted");
  return request.conversationId;
}

export async function declineDirectRequestCore(
  ctx: MutationCtx,
  request: Doc<"chatDirectRequests">,
) {
  const now = Date.now();
  await ctx.db.patch(request._id, {
    status: "declined",
    cooldownUntil: now + REQUEST_COOLDOWN_MS,
    updatedAt: now,
  });
  await setRequestStatusForMembers(ctx, request.conversationId, "declined");
  return request.conversationId;
}

export async function createOrReuseDirectConversation(
  ctx: MutationCtx,
  args: {
    senderId: Id<"users">;
    recipientId: Id<"users">;
    support?: boolean;
    forceAccepted?: boolean;
  },
) {
  if (args.senderId === args.recipientId) throw new Error("Cannot message yourself");
  const [sender, recipient] = await Promise.all([
    ctx.db.get(args.senderId),
    ctx.db.get(args.recipientId),
  ]);
  if (!sender || sender.mergedInto || sender.anonymizedAt || !recipient || recipient.mergedInto || recipient.anonymizedAt) {
    throw new Error("Profile not found");
  }
  const senderRole = roleForUser(sender);
  const recipientRole = roleForUser(recipient);
  const support = args.support === true;
  if (support && senderRole !== "admin") throw new Error("Forbidden");
  if (!support && (senderRole === "admin" || recipientRole === "admin")) {
    throw new Error("ADMIN_SOCIAL_DM_DISABLED");
  }
  if (await isBlockedEitherDirection(ctx, sender._id, recipient._id)) throw new Error("CHAT_BLOCKED");

  const kind = support ? "support" : "direct";
  const directKey = directConversationKey(kind, sender._id, recipient._id);
  let conversation = await ctx.db
    .query("chatConversations")
    .withIndex("by_directKey", (q) => q.eq("directKey", directKey))
    .unique();
  let request = conversation
    ? await ctx.db
        .query("chatDirectRequests")
        .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation!._id))
        .unique()
    : null;

  if (request?.status === "pending") {
    return { conversationId: request.conversationId, requestStatus: "pending" as const, isNew: false };
  }
  if (request?.status === "declined" && (request.cooldownUntil ?? 0) > Date.now()) {
    throw new Error("DM_REQUEST_COOLDOWN");
  }
  if (request?.status === "accepted") {
    return { conversationId: request.conversationId, requestStatus: "accepted" as const, isNew: false };
  }

  const follows = await recipientFollowsSender(ctx, recipient._id, sender._id);
  const privacy = recipient.dmPrivacy ?? "requests";
  if (!support && privacy === "nobody") throw new Error("DM_PRIVACY_BLOCKED");
  if (!support && privacy === "following" && !follows) throw new Error("DM_PRIVACY_FOLLOWING_ONLY");
  const accepted = support || args.forceAccepted === true || follows;
  if (!accepted) await assertDirectRequestRateLimit(ctx, recipient._id);

  const now = Date.now();
  if (!conversation) {
    const conversationId = await ctx.db.insert("chatConversations", {
      kind,
      directKey,
      createdById: sender._id,
      nextSequence: 1,
      createdAt: now,
      updatedAt: now,
    });
    conversation = await ctx.db.get(conversationId);
  } else if (conversation.deletedAt) {
    await ctx.db.patch(conversation._id, { deletedAt: undefined, updatedAt: now });
  }
  if (!conversation) throw new Error("Conversation creation failed");

  const requestStatus = accepted ? "accepted" : "pending";
  await Promise.all([
    upsertChatMember(ctx, {
      conversationId: conversation._id,
      userId: sender._id,
      conversationKind: kind,
      role: "member",
      status: "active",
      requestStatus,
      joinedAt: now,
    }),
    upsertChatMember(ctx, {
      conversationId: conversation._id,
      userId: recipient._id,
      conversationKind: kind,
      role: "member",
      status: "active",
      requestStatus,
      joinedAt: now,
    }),
  ]);
  if (request) {
    await ctx.db.patch(request._id, {
      senderId: sender._id,
      recipientId: recipient._id,
      status: requestStatus,
      senderMessageCount: 0,
      cooldownUntil: undefined,
      updatedAt: now,
      createdAt: now,
    });
  } else {
    const requestId = await ctx.db.insert("chatDirectRequests", {
      conversationId: conversation._id,
      pairKey: directPairKey(sender._id, recipient._id),
      senderId: sender._id,
      recipientId: recipient._id,
      status: requestStatus,
      senderMessageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    request = await ctx.db.get(requestId);
  }
  if (!accepted) {
    await schedulePersistentActivityPush(ctx, {
      category: "requests",
      recipientIds: [recipient._id],
      senderId: sender._id,
      conversationId: conversation._id,
      title: "Novi zahtev za poruku",
      body: `${sender.name ?? "Član"} želi da započne razgovor.`,
      urlPath: `/app/messages/${String(conversation._id)}`,
      eventKey: `dm-request:${String(conversation._id)}:${String(request?._id ?? "request")}`,
    });
  }
  return { conversationId: conversation._id, requestStatus, isNew: true };
}

export async function reserveMessageSequence(
  ctx: MutationCtx,
  conversation: Doc<"chatConversations">,
  preview: string,
) {
  const sequence = Math.max(1, conversation.nextSequence);
  const now = Date.now();
  await ctx.db.patch(conversation._id, {
    nextSequence: sequence + 1,
    lastMessageSequence: sequence,
    lastMessageAt: now,
    lastMessagePreview: preview.slice(0, 180),
    updatedAt: now,
  });
  return { sequence, now };
}

export async function scheduleMessageDelivery(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"chatConversations">;
    sequence: number;
    senderId?: Id<"users">;
  },
) {
  await ctx.scheduler.runAfter(0, deliveryBatchRef, { ...args, cursor: null });
}

export async function schedulePersistentActivityPush(
  ctx: MutationCtx,
  args: {
    category: "requests" | "groups" | "study";
    recipientIds: Id<"users">[];
    senderId?: Id<"users">;
    conversationId?: Id<"chatConversations">;
    title: string;
    body: string;
    urlPath: string;
    eventKey: string;
  },
) {
  const recipientIds = Array.from(new Set(args.recipientIds)).slice(0, 50);
  if (!recipientIds.length) return;
  await ctx.scheduler.runAfter(0, activityPushBatchRef, {
    ...args,
    recipientIds,
    title: args.title.trim().slice(0, 120),
    body: args.body.trim().slice(0, 240),
    urlPath: args.urlPath.startsWith("/app/") ? args.urlPath : "/app",
    eventKey: args.eventKey.slice(0, 180),
  });
}

async function insertSystemMessageOnce(
  ctx: MutationCtx,
  conversationId: Id<"chatConversations">,
  body: string | undefined,
  nonce: string,
) {
  const normalized = body?.trim();
  if (!normalized) return null;
  const existing = await ctx.db
    .query("chatMessages")
    .withIndex("by_conversationId_and_senderId_and_clientNonce", (q) =>
      q.eq("conversationId", conversationId).eq("senderId", undefined).eq("clientNonce", nonce),
    )
    .unique();
  if (existing) return existing._id;
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const { sequence, now } = await reserveMessageSequence(ctx, conversation, normalized);
  const messageId = await ctx.db.insert("chatMessages", {
    conversationId,
    sequence,
    senderName: "Nauči AI",
    kind: "system",
    body: normalized,
    searchText: normalized.toLocaleLowerCase(),
    clientNonce: nonce,
    mentionUserIds: [],
    imageCount: 0,
    createdAt: now,
  });
  await scheduleMessageDelivery(ctx, { conversationId, sequence });
  return messageId;
}

export async function ensureAcceptedDirectConversation(
  ctx: MutationCtx,
  args: {
    userAId: Id<"users">;
    userBId: Id<"users">;
    createdById: Id<"users">;
    systemBody?: string;
  },
) {
  const recipientId = args.createdById === args.userAId ? args.userBId : args.userAId;
  if (args.createdById !== args.userAId && args.createdById !== args.userBId) {
    throw new Error("createdById must be a conversation member");
  }
  const result = await createOrReuseDirectConversation(ctx, {
    senderId: args.createdById,
    recipientId,
    forceAccepted: true,
  });
  const request = await ctx.db
    .query("chatDirectRequests")
    .withIndex("by_conversationId", (q) => q.eq("conversationId", result.conversationId))
    .unique();
  if (request && request.status !== "accepted") await acceptDirectRequestCore(ctx, request);
  await insertSystemMessageOnce(
    ctx,
    result.conversationId,
    args.systemBody,
    `study-direct:${directPairKey(args.userAId, args.userBId)}`,
  );
  return result.conversationId;
}

export async function ensureStudyGroupConversation(
  ctx: MutationCtx,
  args: {
    groupId: Id<"studyGroups">;
    courseId: Id<"courses">;
    ownerId: Id<"users">;
    memberIds: Id<"users">[];
    name: string;
    systemBody?: string;
  },
) {
  const uniqueMembers = Array.from(new Set([args.ownerId, ...args.memberIds]));
  const now = Date.now();
  let conversation = await ctx.db
    .query("chatConversations")
    .withIndex("by_studyGroupId", (q) => q.eq("studyGroupId", args.groupId))
    .unique();
  if (!conversation) {
    const conversationId = await ctx.db.insert("chatConversations", {
      kind: "group",
      ownerId: args.ownerId,
      createdById: args.ownerId,
      title: args.name.trim().slice(0, 100),
      courseId: args.courseId,
      studyGroupId: args.groupId,
      nextSequence: 1,
      createdAt: now,
      updatedAt: now,
    });
    conversation = await ctx.db.get(conversationId);
  } else {
    await ctx.db.patch(conversation._id, {
      ownerId: args.ownerId,
      title: args.name.trim().slice(0, 100),
      courseId: args.courseId,
      deletedAt: undefined,
      updatedAt: now,
    });
  }
  if (!conversation) throw new Error("Conversation creation failed");
  for (const userId of uniqueMembers) {
    const user = await ctx.db.get(userId);
    if (!user || user.mergedInto || user.anonymizedAt || roleForUser(user) === "admin") {
      throw new Error("Invalid study group member");
    }
    await upsertChatMember(ctx, {
      conversationId: conversation._id,
      userId,
      conversationKind: "group",
      role: userId === args.ownerId ? "owner" : "member",
      status: "active",
      requestStatus: "accepted",
      joinedAt: now,
    });
  }
  await insertSystemMessageOnce(
    ctx,
    conversation._id,
    args.systemBody,
    `study-group:${String(args.groupId)}`,
  );
  return conversation._id;
}

export async function promoteDirectRequestsAfterFollow(
  ctx: MutationCtx,
  args: { followerId: Id<"users">; followingId: Id<"users"> },
) {
  const request = await ctx.db
    .query("chatDirectRequests")
    .withIndex("by_recipientId_and_senderId", (q) =>
      q.eq("recipientId", args.followerId).eq("senderId", args.followingId),
    )
    .unique();
  if (!request || request.status !== "pending") return null;
  await acceptDirectRequestCore(ctx, request);
  return request.conversationId;
}

export const deliverMessageBatch = internalMutation({
  args: {
    conversationId: v.id("chatConversations"),
    sequence: v.number(),
    senderId: v.optional(v.id("users")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
        q.eq("conversationId", args.conversationId).eq("status", "active"),
      )
      .paginate({ numItems: 50, cursor: args.cursor });
    const now = Date.now();
    const pushRecipientIds: Id<"users">[] = [];
    for (const member of result.page) {
      const isSender = args.senderId === member.userId;
      const unread = !isSender && member.lastReadSequence < args.sequence;
      await ctx.db.patch(member._id, {
        lastDeliveredSequence: Math.max(member.lastDeliveredSequence, args.sequence),
        lastDeliveredAt: now,
        unreadCount: unread ? Math.max(0, member.unreadCount) + 1 : member.unreadCount,
        hasUnread: unread ? true : member.hasUnread,
        updatedAt: now,
      });
      if (unread && (!member.mutedUntil || member.mutedUntil <= now)) pushRecipientIds.push(member.userId);
    }
    if (pushRecipientIds.length) {
      await ctx.scheduler.runAfter(0, pushBatchRef, {
        conversationId: args.conversationId,
        sequence: args.sequence,
        recipientIds: pushRecipientIds,
      });
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, deliveryBatchRef, {
        conversationId: args.conversationId,
        sequence: args.sequence,
        senderId: args.senderId,
        cursor: result.continueCursor,
      });
    }
    return null;
  },
});

export const getPushBatchData = internalQuery({
  args: {
    conversationId: v.id("chatConversations"),
    sequence: v.number(),
    recipientIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const [conversation, message] = await Promise.all([
      ctx.db.get(args.conversationId),
      ctx.db
        .query("chatMessages")
        .withIndex("by_conversationId_and_sequence", (q) =>
          q.eq("conversationId", args.conversationId).eq("sequence", args.sequence),
        )
        .unique(),
    ]);
    if (!conversation || !message || message.deletedAt) return [];
    const directRequest = conversation.kind === "group"
      ? null
      : await ctx.db
          .query("chatDirectRequests")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
          .unique();
    const rows = [];
    for (const userId of Array.from(new Set(args.recipientIds)).slice(0, 50)) {
      const category = message.mentionUserIds.includes(userId)
        ? "mentions"
        : directRequest?.status === "pending" && directRequest.recipientId === userId
          ? "requests"
          : "chat";
      const [membership, conversationPreference, globalPreference, user, subscriptions, blocked] = await Promise.all([
        getChatMembership(ctx, conversation._id, userId),
        ctx.db
          .query("notificationPreferences")
          .withIndex("by_userId_and_category_and_conversationId", (q) =>
            q.eq("userId", userId).eq("category", category).eq("conversationId", conversation._id),
          )
          .unique(),
        ctx.db
          .query("notificationPreferences")
          .withIndex("by_userId_and_category_and_conversationId", (q) =>
            q.eq("userId", userId).eq("category", category).eq("conversationId", undefined),
          )
          .unique(),
        ctx.db.get(userId),
        ctx.db
          .query("pushSubscriptions")
          .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
          .order("desc")
          .take(10),
        message.senderId
          ? ctx.db
              .query("chatBlocks")
              .withIndex("by_blockerId_and_blockedId", (q) =>
                q.eq("blockerId", userId).eq("blockedId", message.senderId!),
              )
              .unique()
          : Promise.resolve(null),
      ]);
      if (
        !membership ||
        membership.status !== "active" ||
        (membership.mutedUntil && membership.mutedUntil > Date.now()) ||
        blocked
      ) continue;
      const preference = conversationPreference ?? globalPreference;
      if (preference?.push === false) continue;
      for (const subscription of subscriptions) {
        if (subscription.expiresAt && subscription.expiresAt <= Date.now()) continue;
        rows.push({
          endpointHash: subscription.endpointHash,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          title: conversation.kind === "group" ? conversation.title ?? message.senderName : message.senderName,
          body: message.body?.slice(0, 160) ?? (message.imageCount ? "Nova slika" : "Nova poruka"),
          url: `/${user?.language ?? "sr"}/app/messages/${String(conversation._id)}`,
          conversationId: conversation._id,
          sequence: message.sequence,
        });
      }
    }
    return rows;
  },
});

export const getActivityPushBatchData = internalQuery({
  args: {
    category: v.union(v.literal("requests"), v.literal("groups"), v.literal("study")),
    recipientIds: v.array(v.id("users")),
    senderId: v.optional(v.id("users")),
    conversationId: v.optional(v.id("chatConversations")),
    title: v.string(),
    body: v.string(),
    urlPath: v.string(),
    eventKey: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = [];
    for (const userId of Array.from(new Set(args.recipientIds)).slice(0, 50)) {
      const [conversationPreference, globalPreference, user, subscriptions, membership, blocked] =
        await Promise.all([
          args.conversationId
            ? ctx.db
                .query("notificationPreferences")
                .withIndex("by_userId_and_category_and_conversationId", (q) =>
                  q
                    .eq("userId", userId)
                    .eq("category", args.category)
                    .eq("conversationId", args.conversationId),
                )
                .unique()
            : Promise.resolve(null),
          ctx.db
            .query("notificationPreferences")
            .withIndex("by_userId_and_category_and_conversationId", (q) =>
              q.eq("userId", userId).eq("category", args.category).eq("conversationId", undefined),
            )
            .unique(),
          ctx.db.get(userId),
          ctx.db
            .query("pushSubscriptions")
            .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
            .order("desc")
            .take(10),
          args.conversationId
            ? getChatMembership(ctx, args.conversationId, userId)
            : Promise.resolve(null),
          args.senderId
            ? ctx.db
                .query("chatBlocks")
                .withIndex("by_blockerId_and_blockedId", (q) =>
                  q.eq("blockerId", userId).eq("blockedId", args.senderId!),
                )
                .unique()
            : Promise.resolve(null),
        ]);
      if (!user || user.mergedInto || user.anonymizedAt || blocked) continue;
      if (
        args.conversationId &&
        (!membership ||
          (membership.status !== "active" && membership.status !== "invited") ||
          (membership.mutedUntil && membership.mutedUntil > Date.now()))
      ) continue;
      const preference = conversationPreference ?? globalPreference;
      if (preference?.push === false) continue;
      for (const subscription of subscriptions) {
        if (subscription.expiresAt && subscription.expiresAt <= Date.now()) continue;
        rows.push({
          endpointHash: subscription.endpointHash,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          title: args.title,
          body: args.body,
          url: `/${user.language ?? "sr"}${args.urlPath}`,
          conversationId: args.conversationId,
          eventKey: args.eventKey,
        });
      }
    }
    return rows;
  },
});

export const removeInvalidPushSubscriptions = internalMutation({
  args: { endpointHashes: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const endpointHash of Array.from(new Set(args.endpointHashes)).slice(0, 50)) {
      const subscription = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpointHash", (q) => q.eq("endpointHash", endpointHash))
        .unique();
      if (subscription) await ctx.db.delete(subscription._id);
    }
    return null;
  },
});

export const anonymizeUserMessagesBatch = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_senderId_and_createdAt", (q) => q.eq("senderId", args.userId))
      .take(25);
    for (const message of messages) {
      const images = await ctx.db
        .query("chatImages")
        .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
        .take(MAX_MESSAGE_IMAGES);
      for (const image of images) {
        if (image.storageId) await ctx.storage.delete(image.storageId);
        await ctx.db.patch(image._id, {
          storageId: undefined,
          status: "deleted",
          updatedAt: Date.now(),
        });
      }
      await ctx.db.patch(message._id, {
        senderId: undefined,
        senderName: "Obrisan korisnik",
      });
    }
    if (messages.length === 25) await ctx.scheduler.runAfter(0, anonymizeBatchRef, args);
    return null;
  },
});

export async function scheduleChatAnonymization(ctx: MutationCtx, userId: Id<"users">) {
  await ctx.scheduler.runAfter(0, anonymizeBatchRef, { userId });
}

// Re-exported so tests and companion modules use the framework validator unchanged.
export const chatPaginationOptsValidator = paginationOptsValidator;
