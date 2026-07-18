import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { env, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  computeChatInboxSummary,
  getChatInboxAggregateSummary,
  syncChatInboxSummaryMember,
} from "./chatInboxSummaryCore";
import {
  scheduleConversationSearchRefresh,
  syncConversationSearchEntry,
} from "./chatSearchProjection";
import {
  DIRECT_REQUEST_MESSAGE_LIMIT,
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MESSAGE_IMAGE_BYTES,
  MAX_MESSAGE_IMAGES,
  MESSAGE_EDIT_WINDOW_MS,
  TYPING_TTL_MS,
  acceptDirectRequestCore,
  assertGroupInviteRateLimit,
  createOrReuseDirectConversation,
  declineDirectRequestCore,
  directConversationKey,
  getChatMembership,
  isBlockedEitherDirection,
  requireChatActor,
  requireConversationMember,
  reserveMessageSequence,
  scheduleMessageDelivery,
  schedulePersistentActivityPush,
  upsertChatMember,
} from "./chatCore";
import { syncStudyGroupMembershipSummary } from "./studyHubSummaryCore";

const inboxSectionValidator = v.union(
  v.literal("all"),
  v.literal("unread"),
  v.literal("requests"),
  v.literal("groups"),
  v.literal("archive"),
);

const notificationCategories = ["chat", "requests", "groups", "mentions", "study"] as const;

function cleanBody(body: string | undefined) {
  const value = body?.trim();
  if (!value) return undefined;
  if (value.length > MAX_MESSAGE_BODY_LENGTH) throw new Error("MESSAGE_TOO_LONG");
  return value;
}

function cleanGroupName(name: string) {
  const value = name.trim();
  if (value.length < 2 || value.length > 100) throw new Error("INVALID_GROUP_NAME");
  return value;
}

function cleanEmoji(emoji: string) {
  const value = emoji.trim();
  if (!value || value.length > 24) throw new Error("INVALID_REACTION");
  return value;
}

function normalizeFullTextSearchQuery(query: string) {
  return query
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 16)
    .map((token) => Array.from(token).slice(0, 32).join(""))
    .filter(Boolean)
    .join(" ");
}

function archivedMembershipPatch(
  membership: Doc<"chatMembers">,
  status: "left" | "removed",
  now: number,
) {
  return {
    status,
    leftAt: now,
    unreadCount: 0,
    hasUnread: false,
    isPinned: false,
    isArchived: true,
    lastReadSequence: Math.max(membership.lastReadSequence, membership.lastDeliveredSequence),
    updatedAt: now,
  } as const;
}

async function publicUser(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return null;
  return {
    userId: user._id,
    name: user.anonymizedAt ? "Obrisan korisnik" : user.name ?? "Član",
    username: user.anonymizedAt ? undefined : user.username,
    avatarUrl: user.anonymizedAt ? undefined : user.avatarUrl ?? user.image,
    role: user.role ?? "student",
  };
}

export const createImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireChatActor(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

async function conversationImageUrl(ctx: QueryCtx, conversation: Doc<"chatConversations">) {
  return conversation.imageStorageId ? ctx.storage.getUrl(conversation.imageStorageId) : null;
}

async function conversationMembers(
  ctx: QueryCtx,
  conversationId: Id<"chatConversations">,
  limit = 50,
) {
  const rows = await ctx.db
    .query("chatMembers")
    .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
      q.eq("conversationId", conversationId).eq("status", "active"),
    )
    .take(limit + 1);
  const projected = await Promise.all(
    rows.slice(0, limit).map(async (row) => ({
      ...(await publicUser(ctx, row.userId)),
      role: row.role,
      status: row.status,
      requestStatus: row.requestStatus,
      lastReadSequence: row.lastReadSequence,
    })),
  );
  return { members: projected.filter((row) => row.userId), truncated: rows.length > limit };
}

async function inboxItem(
  ctx: QueryCtx,
  membership: Doc<"chatMembers">,
) {
  if (membership.status === "left" || membership.status === "removed") return null;
  const conversation = await ctx.db.get(membership.conversationId);
  if (!conversation || conversation.deletedAt) return null;
  const lastMessage = conversation.lastMessageSequence
    ? await ctx.db
        .query("chatMessages")
        .withIndex("by_conversationId_and_sequence", (q) =>
          q.eq("conversationId", conversation._id).eq("sequence", conversation.lastMessageSequence!),
        )
        .unique()
    : null;
  let counterpart = null;
  if (conversation.kind !== "group") {
    const other = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
        q.eq("conversationId", conversation._id).eq("status", "active"),
      )
      .take(3);
    const otherMembership = other.find((row) => row.userId !== membership.userId);
    counterpart = otherMembership ? await publicUser(ctx, otherMembership.userId) : null;
  }
  return {
    conversationId: conversation._id,
    kind: conversation.kind,
    title: conversation.title,
    imageUrl: await conversationImageUrl(ctx, conversation),
    counterpart,
    lastMessage: lastMessage
      ? {
          sequence: lastMessage.sequence,
          body: lastMessage.deletedAt ? undefined : lastMessage.body,
          senderId: lastMessage.senderId,
          senderName: lastMessage.senderName,
          kind: lastMessage.kind,
          createdAt: lastMessage.createdAt,
        }
      : null,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: Math.max(0, membership.unreadCount),
    isPinned: membership.isPinned,
    isArchived: membership.isArchived,
    mutedUntil: membership.mutedUntil,
    memberStatus: membership.status,
    requestStatus: membership.requestStatus,
  };
}

async function projectInboxPage(
  ctx: QueryCtx,
  result: {
    page: Doc<"chatMembers">[];
    isDone: boolean;
    continueCursor: string;
    splitCursor?: string | null;
    pageStatus?: "SplitRecommended" | "SplitRequired" | null;
  },
  section: "all" | "unread" | "requests" | "groups" | "archive",
) {
  const page = await Promise.all(result.page.map((membership) => inboxItem(ctx, membership)));
  return {
    ...result,
    page: page.filter((item) => {
      if (!item) return false;
      if (section === "all") return !item.isArchived;
      if (section === "archive") return item.isArchived;
      if (section === "requests") return item.requestStatus === "pending" || item.memberStatus === "invited";
      if (section === "groups") return item.kind === "group" && !item.isArchived;
      return item.unreadCount > 0 && !item.isArchived;
    }),
  };
}

export const getInboxSummary = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireChatActor(ctx);
    const summary = await ctx.db
      .query("chatInboxSummaries")
      .withIndex("by_userId", (q) => q.eq("userId", actor.userId))
      .unique();
    if (summary?.aggregateReady) {
      return getChatInboxAggregateSummary(ctx, actor.userId);
    }
    if (summary?.ready) {
      return {
        totalUnread: summary.totalUnread,
        unreadConversations: summary.unreadConversations,
        pendingRequests: summary.pendingRequests,
        pendingGroupInvites: summary.pendingGroupInvites,
      };
    }
    return computeChatInboxSummary(ctx, actor.userId);
  },
});

export const listInboxPage = query({
  args: { section: inboxSectionValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    if (args.section === "unread") {
      const result = await ctx.db
        .query("chatMembers")
        .withIndex("by_userId_and_hasUnread_and_lastDeliveredAt", (q) =>
          q.eq("userId", actor.userId).eq("hasUnread", true),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return projectInboxPage(ctx, result, args.section);
    }
    if (args.section === "requests") {
      const result = await ctx.db
        .query("chatMembers")
        .withIndex("by_userId_and_requestStatus_and_lastDeliveredAt", (q) =>
          q.eq("userId", actor.userId).eq("requestStatus", "pending"),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return projectInboxPage(ctx, result, args.section);
    }
    if (args.section === "groups") {
      const result = await ctx.db
        .query("chatMembers")
        .withIndex("by_userId_and_conversationKind_and_lastDeliveredAt", (q) =>
          q.eq("userId", actor.userId).eq("conversationKind", "group"),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return projectInboxPage(ctx, result, args.section);
    }
    if (args.section === "archive") {
      const result = await ctx.db
        .query("chatMembers")
        .withIndex("by_userId_and_isArchived_and_lastDeliveredAt", (q) =>
          q.eq("userId", actor.userId).eq("isArchived", true),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return projectInboxPage(ctx, result, args.section);
    }
    const result = await ctx.db
      .query("chatMembers")
      .withIndex("by_userId_and_status_and_lastDeliveredAt", (q) =>
        q.eq("userId", actor.userId).eq("status", "active"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return projectInboxPage(ctx, result, args.section);
  },
});

export const listPinnedInboxPage = query({
  args: { section: inboxSectionValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const result = await ctx.db
      .query("chatMembers")
      .withIndex("by_userId_and_isPinned_and_lastDeliveredAt", (q) =>
        q.eq("userId", actor.userId).eq("isPinned", true),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return projectInboxPage(ctx, result, args.section);
  },
});

export const getConversation = query({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    const { actor, conversation, membership } = await requireConversationMember(ctx, args.conversationId, {
      allowInvited: true,
    });
    const [memberData, directRequest] = await Promise.all([
      conversationMembers(ctx, conversation._id),
      conversation.kind === "group"
        ? Promise.resolve(null)
        : ctx.db
            .query("chatDirectRequests")
            .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
            .unique(),
    ]);
    return {
      conversation: {
        id: conversation._id,
        kind: conversation.kind,
        title: conversation.title,
        imageUrl: await conversationImageUrl(ctx, conversation),
        courseId: conversation.courseId,
        studyGroupId: conversation.studyGroupId,
        ownerId: conversation.ownerId,
        lastMessageSequence: conversation.lastMessageSequence ?? 0,
      },
      viewer: {
        userId: actor.userId,
        role: membership.role,
        status: membership.status,
        requestStatus: membership.requestStatus,
        lastReadSequence: membership.lastReadSequence,
        historyCutoffSequence: membership.historyCutoffSequence,
        mutedUntil: membership.mutedUntil,
        requestImagesAllowedAt: membership.requestImagesAllowedAt,
      },
      members: memberData.members,
      membersTruncated: memberData.truncated,
      directRequest: directRequest
        ? {
            senderId: directRequest.senderId,
            recipientId: directRequest.recipientId,
            status: directRequest.status,
            senderMessageCount: directRequest.senderMessageCount,
            cooldownUntil: directRequest.cooldownUntil,
          }
        : null,
    };
  },
});

export const listConversationMembersPage = query({
  args: { conversationId: v.id("chatConversations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireConversationMember(ctx, args.conversationId, { allowInvited: true });
    const result = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
        q.eq("conversationId", args.conversationId).eq("status", "active"),
      )
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (member) => ({
          ...(await publicUser(ctx, member.userId)),
          membershipRole: member.role,
          lastReadSequence: member.lastReadSequence,
          joinedAt: member.joinedAt,
        })),
      ),
    };
  },
});

export const listConversationInvitesPage = query({
  args: { conversationId: v.id("chatConversations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { conversation } = await requireConversationMember(ctx, args.conversationId);
    if (conversation.kind !== "group") {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
        q.eq("conversationId", args.conversationId).eq("status", "invited"),
      )
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (member) => ({
          ...(await publicUser(ctx, member.userId)),
          membershipRole: member.role,
          membershipStatus: member.status,
          requestStatus: member.requestStatus,
          invitedAt: member.invitedAt,
        })),
      ),
    };
  },
});

export const listConversationMediaPage = query({
  args: { conversationId: v.id("chatConversations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { actor, conversation, membership } = await requireConversationMember(ctx, args.conversationId, {
      allowInvited: true,
    });
    if (membership.status === "invited") {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("chatImages")
      .withIndex("by_conversationId_and_status_and_createdAt", (q) =>
        q.eq("conversationId", conversation._id).eq("status", "attached"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const pairs = await Promise.all(
      result.page.map(async (image) => ({
        image,
        message: image.messageId ? await ctx.db.get(image.messageId) : null,
      })),
    );
    const senderIds = Array.from(
      new Set(
        pairs.flatMap(({ message }) =>
          message?.senderId ? [message.senderId] : [],
        ),
      ),
    );
    const blocks = conversation.kind === "group"
      ? await Promise.all(
          senderIds.map((senderId) =>
            ctx.db
              .query("chatBlocks")
              .withIndex("by_blockerId_and_blockedId", (q) =>
                q.eq("blockerId", actor.userId).eq("blockedId", senderId),
              )
              .unique(),
          ),
        )
      : [];
    const blockedIds = new Set(blocks.filter(Boolean).map((row) => String(row!.blockedId)));
    const page = await Promise.all(
      pairs.map(async ({ image, message }) => {
        if (
          !message ||
          message.conversationId !== conversation._id ||
          message.deletedAt ||
          message.sequence <= membership.historyCutoffSequence ||
          !image.storageId ||
          (message.senderId && blockedIds.has(String(message.senderId)))
        ) {
          return null;
        }
        const requestImagesHidden =
          conversation.kind === "direct" &&
          membership.requestStatus === "pending" &&
          !membership.requestImagesAllowedAt &&
          message.senderId !== actor.userId;
        if (requestImagesHidden) return null;
        const url = await ctx.storage.getUrl(image.storageId);
        if (!url) return null;
        return {
          id: image._id,
          messageId: message._id,
          sequence: message.sequence,
          senderId: message.senderId,
          fileName: image.fileName,
          mimeType: image.mimeType,
          byteSize: image.byteSize,
          width: image.width,
          height: image.height,
          createdAt: image.createdAt,
          url,
        };
      }),
    );
    return { ...result, page: page.filter((item) => item !== null) };
  },
});

async function projectMessage(
  ctx: QueryCtx,
  message: Doc<"chatMessages">,
  options: {
    viewerId: Id<"users">;
    conversation: Doc<"chatConversations">;
    membership: Doc<"chatMembers">;
    activeMembers: Doc<"chatMembers">[];
    activeMembersTruncated?: boolean;
    blockedIds: Set<string>;
    revealBlocked?: boolean;
  },
) {
  const collapsed = Boolean(
    !options.revealBlocked &&
      options.conversation.kind === "group" &&
      message.senderId &&
      options.blockedIds.has(String(message.senderId)),
  );
  const [sender, reply, images, reactions, linkPreview] = await Promise.all([
    message.senderId ? publicUser(ctx, message.senderId) : Promise.resolve(null),
    message.replyToMessageId ? ctx.db.get(message.replyToMessageId) : Promise.resolve(null),
    ctx.db.query("chatImages").withIndex("by_messageId", (q) => q.eq("messageId", message._id)).take(MAX_MESSAGE_IMAGES),
    ctx.db.query("chatReactions").withIndex("by_messageId_and_createdAt", (q) => q.eq("messageId", message._id)).take(50),
    ctx.db
      .query("chatLinkPreviews")
      .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
      .unique(),
  ]);
  const requestImagesHidden =
    options.conversation.kind === "direct" &&
    options.membership.requestStatus === "pending" &&
    !options.membership.requestImagesAllowedAt &&
    message.senderId !== options.viewerId;
  const imageRows = await Promise.all(
    images.map(async (image) => ({
      id: image._id,
      fileName: image.fileName,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
      url:
        collapsed || requestImagesHidden || image.status !== "attached" || !image.storageId
          ? null
          : await ctx.storage.getUrl(image.storageId),
    })),
  );
  const reactionMap = new Map<string, { emoji: string; count: number; viewerReacted: boolean }>();
  for (const reaction of reactions) {
    const current = reactionMap.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, viewerReacted: false };
    current.count += 1;
    if (reaction.userId === options.viewerId) current.viewerReacted = true;
    reactionMap.set(reaction.emoji, current);
  }
  const allSeen = options.activeMembers.filter(
    (member) => member.userId !== message.senderId && member.lastReadSequence >= message.sequence,
  );
  const seenBy = allSeen.slice(0, 6);
  const seenUsers = await Promise.all(seenBy.map((member) => publicUser(ctx, member.userId)));
  const replyCollapsed = Boolean(
    !options.revealBlocked &&
      options.conversation.kind === "group" &&
      reply?.senderId &&
      options.blockedIds.has(String(reply.senderId)),
  );
  let preview = null;
  if (!collapsed && !message.deletedAt && linkPreview) {
    try {
      const normalized = new URL(linkPreview.normalizedUrl);
      const safeImage = linkPreview.imageUrl ? new URL(linkPreview.imageUrl) : null;
      preview = {
        url: linkPreview.url,
        title: linkPreview.title,
        description: linkPreview.description,
        imageUrl: safeImage?.protocol === "https:" ? safeImage.toString() : undefined,
        siteName: normalized.hostname.replace(/^www\./i, ""),
        status: linkPreview.status,
      };
    } catch {
      preview = null;
    }
  }
  return {
    id: message._id,
    sequence: message.sequence,
    sender: message.kind === "system" ? { name: message.senderName } : sender,
    kind: message.kind,
    body: collapsed || message.deletedAt ? undefined : message.body,
    replyTo: reply
      ? {
          id: reply._id,
          senderName: replyCollapsed ? undefined : reply.senderName,
          body: reply.deletedAt || replyCollapsed ? undefined : reply.body,
          collapsed: replyCollapsed,
        }
      : null,
    mentions: message.mentionUserIds,
    imageCount: message.imageCount,
    images: collapsed ? [] : imageRows,
    reactions: [...reactionMap.values()],
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    createdAt: message.createdAt,
    seenCount: allSeen.length,
    seenBy: seenUsers.filter(Boolean),
    seenByTruncated: allSeen.length > 6 || options.activeMembersTruncated === true,
    linkPreview: preview,
    collapsed,
  };
}

export const listMessagesPage = query({
  args: { conversationId: v.id("chatConversations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { actor, conversation, membership } = await requireConversationMember(ctx, args.conversationId, {
      allowInvited: true,
    });
    if (membership.status === "invited") {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId_and_sequence", (q) =>
        q.eq("conversationId", args.conversationId).gt("sequence", membership.historyCutoffSequence),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const activeMemberRows = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
        q.eq("conversationId", conversation._id).eq("status", "active"),
      )
      .take(1_001);
    const activeMembers = activeMemberRows.slice(0, 1_000);
    const senderIds = Array.from(
      new Set(result.page.flatMap((message) => (message.senderId ? [message.senderId] : []))),
    );
    const blocks = conversation.kind === "group"
      ? await Promise.all(
          senderIds.map((senderId) =>
            ctx.db
              .query("chatBlocks")
              .withIndex("by_blockerId_and_blockedId", (q) =>
                q.eq("blockerId", actor.userId).eq("blockedId", senderId),
              )
              .unique(),
          ),
        )
      : [];
    const blockedIds = new Set(blocks.filter(Boolean).map((row) => String(row!.blockedId)));
    return {
      ...result,
      page: await Promise.all(
        result.page.map((message) =>
          projectMessage(ctx, message, {
            viewerId: actor.userId,
            conversation,
            membership,
            activeMembers,
            activeMembersTruncated: activeMemberRows.length > 1_000,
            blockedIds,
          }),
        ),
      ),
    };
  },
});

export const revealBlockedMessage = query({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    const { actor, conversation, membership } = await requireConversationMember(ctx, message.conversationId);
    if (conversation.kind !== "group" || !message.senderId) throw new Error("Not a collapsed group message");
    const blocked = await ctx.db
      .query("chatBlocks")
      .withIndex("by_blockerId_and_blockedId", (q) =>
        q.eq("blockerId", actor.userId).eq("blockedId", message.senderId!),
      )
      .unique();
    if (!blocked) throw new Error("Message is not blocked");
    const activeMemberRows = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
        q.eq("conversationId", conversation._id).eq("status", "active"),
      )
      .take(1_001);
    const activeMembers = activeMemberRows.slice(0, 1_000);
    return projectMessage(ctx, message, {
      viewerId: actor.userId,
      conversation,
      membership,
      activeMembers,
      activeMembersTruncated: activeMemberRows.length > 1_000,
      blockedIds: new Set(),
      revealBlocked: true,
    });
  },
});

async function assertChatSendAllowed(
  ctx: MutationCtx,
  actorId: Id<"users">,
  conversationId: Id<"chatConversations">,
) {
  const actions = await ctx.db
    .query("chatModerationActions")
    .withIndex("by_targetUserId_and_createdAt", (q) => q.eq("targetUserId", actorId))
    .order("desc")
    .take(100);
  const now = Date.now();
  if (
    actions.some(
      (action) =>
        action.kind === "suspend_chat" &&
        (!action.conversationId || action.conversationId === conversationId) &&
        (!action.endsAt || action.endsAt > now),
    )
  ) {
    throw new Error("CHAT_SUSPENDED");
  }
}

export const sendMessage = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    body: v.optional(v.string()),
    imageIds: v.array(v.id("chatImages")),
    replyToMessageId: v.optional(v.id("chatMessages")),
    mentionUserIds: v.array(v.id("users")),
    clientNonce: v.string(),
  },
  handler: async (ctx, args) => {
    const { actor, conversation, membership } = await requireConversationMember(ctx, args.conversationId);
    await assertChatSendAllowed(ctx, actor.userId, conversation._id);
    if (!args.clientNonce.trim() || args.clientNonce.length > 160) throw new Error("INVALID_CLIENT_NONCE");
    const existing = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId_and_senderId_and_clientNonce", (q) =>
        q.eq("conversationId", conversation._id).eq("senderId", actor.userId).eq("clientNonce", args.clientNonce),
      )
      .unique();
    if (existing) return { messageId: existing._id, sequence: existing.sequence, deduplicated: true };

    const body = cleanBody(args.body);
    const imageIds = Array.from(new Set(args.imageIds));
    if (imageIds.length > MAX_MESSAGE_IMAGES) throw new Error("TOO_MANY_IMAGES");
    if (!body && imageIds.length === 0) throw new Error("EMPTY_MESSAGE");
    const images = await Promise.all(imageIds.map((imageId) => ctx.db.get(imageId)));
    if (
      images.some(
        (image) => !image || image.uploaderId !== actor.userId || image.status !== "prepared" || image.messageId,
      )
    ) {
      throw new Error("INVALID_PREPARED_IMAGE");
    }
    const totalBytes = images.reduce((total, image) => total + (image?.byteSize ?? 0), 0);
    if (totalBytes > MAX_MESSAGE_IMAGE_BYTES) throw new Error("IMAGES_TOO_LARGE");

    if (args.replyToMessageId) {
      const reply = await ctx.db.get(args.replyToMessageId);
      if (!reply || reply.conversationId !== conversation._id) throw new Error("INVALID_REPLY");
    }
    const mentionUserIds = Array.from(new Set(args.mentionUserIds));
    if (mentionUserIds.length > 20) throw new Error("TOO_MANY_MENTIONS");
    if (mentionUserIds.length && conversation.kind !== "group") throw new Error("MENTIONS_REQUIRE_GROUP");
    for (const mentionedId of mentionUserIds) {
      const member = await getChatMembership(ctx, conversation._id, mentionedId);
      if (!member || member.status !== "active") throw new Error("INVALID_MENTION");
    }

    if (conversation.kind !== "group") {
      const members = await ctx.db
        .query("chatMembers")
        .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
          q.eq("conversationId", conversation._id).eq("status", "active"),
        )
        .take(3);
      const other = members.find((member) => member.userId !== actor.userId);
      if (!other || (await isBlockedEitherDirection(ctx, actor.userId, other.userId))) throw new Error("CHAT_BLOCKED");
      const request = await ctx.db
        .query("chatDirectRequests")
        .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
        .unique();
      if (request?.status === "declined") throw new Error("REQUEST_DECLINED");
      if (request?.status === "pending") {
        if (request.senderId !== actor.userId) throw new Error("REQUEST_NOT_ACCEPTED");
        if (request.senderMessageCount >= DIRECT_REQUEST_MESSAGE_LIMIT) throw new Error("REQUEST_MESSAGE_LIMIT");
        await ctx.db.patch(request._id, {
          senderMessageCount: request.senderMessageCount + 1,
          updatedAt: Date.now(),
        });
      }
    }

    const preview = body ?? (imageIds.length ? `${imageIds.length} image${imageIds.length === 1 ? "" : "s"}` : "Message");
    const { sequence, now } = await reserveMessageSequence(ctx, conversation, preview);
    const messageId = await ctx.db.insert("chatMessages", {
      conversationId: conversation._id,
      sequence,
      senderId: actor.userId,
      senderName: actor.user.name ?? "Član",
      kind: "user",
      body,
      searchText: body?.toLocaleLowerCase(),
      replyToMessageId: args.replyToMessageId,
      clientNonce: args.clientNonce,
      mentionUserIds,
      imageCount: imageIds.length,
      createdAt: now,
    });
    for (const image of images) {
      if (!image) continue;
      await ctx.db.patch(image._id, {
        messageId,
        conversationId: conversation._id,
        status: "attached",
        updatedAt: now,
      });
    }
    if (membership.isArchived) await ctx.db.patch(membership._id, { isArchived: false, updatedAt: now });
    await scheduleMessageDelivery(ctx, { conversationId: conversation._id, sequence, senderId: actor.userId });
    return { messageId, sequence, deduplicated: false };
  },
});

export const editMessage = mutation({
  args: { messageId: v.id("chatMessages"), body: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message || message.senderId !== actor.userId || message.kind !== "user" || message.deletedAt) {
      throw new Error("Forbidden");
    }
    if (Date.now() - message.createdAt > MESSAGE_EDIT_WINDOW_MS) throw new Error("EDIT_WINDOW_EXPIRED");
    await requireConversationMember(ctx, message.conversationId);
    const body = cleanBody(args.body);
    if (!body) throw new Error("EMPTY_MESSAGE");
    const now = Date.now();
    await ctx.db.patch(message._id, { body, searchText: body.toLocaleLowerCase(), editedAt: now });
    const conversation = await ctx.db.get(message.conversationId);
    if (conversation?.lastMessageSequence === message.sequence) {
      await ctx.db.patch(conversation._id, { lastMessagePreview: body.slice(0, 180), updatedAt: now });
    }
    return { messageId: message._id, editedAt: now };
  },
});

export const deleteMessageForEveryone = mutation({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message || message.senderId !== actor.userId || message.kind !== "user" || message.deletedAt) {
      throw new Error("Forbidden");
    }
    if (Date.now() - message.createdAt > MESSAGE_EDIT_WINDOW_MS) throw new Error("DELETE_WINDOW_EXPIRED");
    await requireConversationMember(ctx, message.conversationId);
    const images = await ctx.db
      .query("chatImages")
      .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
      .take(MAX_MESSAGE_IMAGES);
    for (const image of images) {
      if (image.storageId) await ctx.storage.delete(image.storageId);
      await ctx.db.patch(image._id, { storageId: undefined, status: "deleted", updatedAt: Date.now() });
    }
    const now = Date.now();
    await ctx.db.patch(message._id, {
      body: undefined,
      searchText: undefined,
      imageCount: 0,
      deletedAt: now,
      editedAt: undefined,
    });
    const conversation = await ctx.db.get(message.conversationId);
    if (conversation?.lastMessageSequence === message.sequence) {
      await ctx.db.patch(conversation._id, { lastMessagePreview: "Message deleted", updatedAt: now });
    }
    return { messageId: message._id, deletedAt: now };
  },
});

export const markRead = mutation({
  args: { conversationId: v.id("chatConversations"), sequence: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { conversation, membership } = await requireConversationMember(ctx, args.conversationId);
    const sequence = Math.max(
      membership.lastReadSequence,
      Math.min(args.sequence ?? conversation.lastMessageSequence ?? 0, conversation.lastMessageSequence ?? 0),
    );
    const remaining = Math.max(0, (conversation.lastMessageSequence ?? 0) - sequence);
    const patch = {
      lastReadSequence: sequence,
      unreadCount: remaining,
      hasUnread: remaining > 0,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(membership._id, patch);
    await syncChatInboxSummaryMember(ctx, membership._id, { ...membership, ...patch });
    return { lastReadSequence: sequence };
  },
});

export const setTyping = mutation({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    const { actor } = await requireConversationMember(ctx, args.conversationId);
    const existing = await ctx.db
      .query("chatTyping")
      .withIndex("by_conversationId_and_userId", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", actor.userId),
      )
      .unique();
    const now = Date.now();
    const expiresAt = now + TYPING_TTL_MS;
    if (existing) await ctx.db.patch(existing._id, { expiresAt, updatedAt: now });
    else await ctx.db.insert("chatTyping", { conversationId: args.conversationId, userId: actor.userId, expiresAt, updatedAt: now });
    return { expiresAt };
  },
});

export const listTyping = query({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    const { actor } = await requireConversationMember(ctx, args.conversationId, { allowInvited: true });
    const rows = await ctx.db
      .query("chatTyping")
      .withIndex("by_conversationId_and_expiresAt", (q) =>
        q.eq("conversationId", args.conversationId).gt("expiresAt", Date.now()),
      )
      .take(25);
    return Promise.all(
      rows
        .filter((row) => row.userId !== actor.userId)
        .map(async (row) => ({ ...(await publicUser(ctx, row.userId)), expiresAt: row.expiresAt })),
    );
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("chatMessages"), emoji: v.string() },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message || message.deletedAt) throw new Error("Message not found");
    const { actor } = await requireConversationMember(ctx, message.conversationId);
    const emoji = cleanEmoji(args.emoji);
    const existing = await ctx.db
      .query("chatReactions")
      .withIndex("by_messageId_and_userId_and_emoji", (q) =>
        q.eq("messageId", message._id).eq("userId", actor.userId).eq("emoji", emoji),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { active: false };
    }
    await ctx.db.insert("chatReactions", {
      messageId: message._id,
      conversationId: message.conversationId,
      userId: actor.userId,
      emoji,
      createdAt: Date.now(),
    });
    return { active: true };
  },
});

export const saveDraft = mutation({
  args: { conversationId: v.id("chatConversations"), body: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await requireConversationMember(ctx, args.conversationId, { allowInvited: true });
    if (args.body.length > MAX_MESSAGE_BODY_LENGTH) throw new Error("DRAFT_TOO_LONG");
    const existing = await ctx.db
      .query("chatDrafts")
      .withIndex("by_conversationId_and_userId", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", actor.userId),
      )
      .unique();
    const now = Date.now();
    if (!args.body) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }
    if (existing) await ctx.db.patch(existing._id, { body: args.body, updatedAt: now });
    else await ctx.db.insert("chatDrafts", { conversationId: args.conversationId, userId: actor.userId, body: args.body, updatedAt: now });
    return { body: args.body, updatedAt: now };
  },
});

export const getDraft = query({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    const { actor } = await requireConversationMember(ctx, args.conversationId, { allowInvited: true });
    const draft = await ctx.db
      .query("chatDrafts")
      .withIndex("by_conversationId_and_userId", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", actor.userId),
      )
      .unique();
    return draft ? { body: draft.body, updatedAt: draft.updatedAt } : null;
  },
});

export const updateMemberState = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    isPinned: v.optional(v.boolean()),
    isArchived: v.optional(v.boolean()),
    historyCutoffSequence: v.optional(v.number()),
    mutedUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { conversation, membership } = await requireConversationMember(ctx, args.conversationId, { allowInvited: true });
    const patch: Partial<Doc<"chatMembers">> = { updatedAt: Date.now() };
    if (args.isPinned !== undefined) patch.isPinned = args.isPinned;
    if (args.isArchived !== undefined) patch.isArchived = args.isArchived;
    if (args.mutedUntil !== undefined) patch.mutedUntil = args.mutedUntil < 0 ? Number.MAX_SAFE_INTEGER : args.mutedUntil;
    if (args.historyCutoffSequence !== undefined) {
      patch.historyCutoffSequence = Math.max(
        membership.historyCutoffSequence,
        Math.min(args.historyCutoffSequence, conversation.lastMessageSequence ?? 0),
      );
    }
    await ctx.db.patch(membership._id, patch);
    return {
      isPinned: patch.isPinned ?? membership.isPinned,
      isArchived: patch.isArchived ?? membership.isArchived,
      historyCutoffSequence: patch.historyCutoffSequence ?? membership.historyCutoffSequence,
      mutedUntil: patch.mutedUntil ?? membership.mutedUntil,
    };
  },
});

export const deleteConversationForMe = mutation({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    const { conversation, membership } = await requireConversationMember(ctx, args.conversationId, { allowInvited: true });
    const cutoff = conversation.lastMessageSequence ?? 0;
    const patch = {
      historyCutoffSequence: cutoff,
      isArchived: true,
      unreadCount: 0,
      hasUnread: false,
      lastReadSequence: Math.max(membership.lastReadSequence, cutoff),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(membership._id, patch);
    await syncChatInboxSummaryMember(ctx, membership._id, { ...membership, ...patch });
    return { historyCutoffSequence: cutoff };
  },
});

export const createOrGetDirect = mutation({
  args: { recipientId: v.id("users"), support: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    return createOrReuseDirectConversation(ctx, {
      senderId: actor.userId,
      recipientId: args.recipientId,
      support: args.support,
    });
  },
});

export const respondDirectRequest = mutation({
  args: { conversationId: v.id("chatConversations"), accept: v.boolean() },
  handler: async (ctx, args) => {
    const { actor } = await requireConversationMember(ctx, args.conversationId);
    const request = await ctx.db
      .query("chatDirectRequests")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .unique();
    if (!request || request.recipientId !== actor.userId || request.status !== "pending") throw new Error("Forbidden");
    if (args.accept) await acceptDirectRequestCore(ctx, request);
    else await declineDirectRequestCore(ctx, request);
    return { conversationId: request.conversationId, status: args.accept ? "accepted" : "declined" };
  },
});

export const allowRequestImages = mutation({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    const { actor, membership } = await requireConversationMember(ctx, args.conversationId);
    const request = await ctx.db
      .query("chatDirectRequests")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .unique();
    if (!request || request.recipientId !== actor.userId || request.status !== "pending") throw new Error("Forbidden");
    const requestImagesAllowedAt = Date.now();
    await ctx.db.patch(membership._id, { requestImagesAllowedAt, updatedAt: requestImagesAllowedAt });
    return { requestImagesAllowedAt };
  },
});

export const createGroup = mutation({
  args: {
    name: v.string(),
    memberIds: v.array(v.id("users")),
    imageStorageId: v.optional(v.id("_storage")),
    courseId: v.optional(v.id("courses")),
  },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    if (actor.role === "admin") throw new Error("ADMIN_SOCIAL_DM_DISABLED");
    if (args.imageStorageId) throw new Error("GROUP_AVATAR_REQUIRES_PREPARATION");
    const memberIds = Array.from(new Set(args.memberIds)).filter((id) => id !== actor.userId);
    if (memberIds.length > 40) throw new Error("INVITE_IN_BATCH_LIMIT");
    for (const memberId of memberIds) {
      const target = await ctx.db.get(memberId);
      if (!target || target.mergedInto || target.anonymizedAt) throw new Error("Profile not found");
      if (await isBlockedEitherDirection(ctx, actor.userId, memberId)) throw new Error("CHAT_BLOCKED");
      await assertGroupInviteRateLimit(ctx, memberId);
    }
    const now = Date.now();
    const conversationId = await ctx.db.insert("chatConversations", {
      kind: "group",
      ownerId: actor.userId,
      createdById: actor.userId,
      title: cleanGroupName(args.name),
      courseId: args.courseId,
      nextSequence: 1,
      createdAt: now,
      updatedAt: now,
    });
    await upsertChatMember(ctx, {
      conversationId,
      userId: actor.userId,
      conversationKind: "group",
      role: "owner",
      status: "active",
      requestStatus: "accepted",
      joinedAt: now,
    });
    for (const memberId of memberIds) {
      await upsertChatMember(ctx, {
        conversationId,
        userId: memberId,
        conversationKind: "group",
        role: "member",
        status: "invited",
        requestStatus: "pending",
        invitedBy: actor.userId,
        invitedAt: now,
      });
    }
    await schedulePersistentActivityPush(ctx, {
      category: "groups",
      recipientIds: memberIds,
      senderId: actor.userId,
      conversationId,
      title: "Poziv u grupni razgovor",
      body: `${actor.user.name ?? "Član"} te poziva u grupu „${cleanGroupName(args.name)}“.`,
      urlPath: `/app/messages/${String(conversationId)}`,
      eventKey: `group-invite:${String(conversationId)}`,
    });
    return { conversationId, status: "active" as const };
  },
});

async function requireGroupOwner(ctx: MutationCtx, conversationId: Id<"chatConversations">) {
  const result = await requireConversationMember(ctx, conversationId);
  if (result.conversation.kind !== "group" || result.conversation.ownerId !== result.actor.userId || result.membership.role !== "owner") {
    throw new Error("Forbidden");
  }
  return result;
}

export const createGroupAvatarUpload = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    sha256: v.string(),
    byteSize: v.number(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    const { actor, conversation } = await requireGroupOwner(ctx, args.conversationId);
    const sha256 = args.sha256.trim().toLowerCase();
    const contentType = args.contentType.trim().toLowerCase();
    if (
      !/^[a-f0-9]{64}$/.test(sha256) ||
      !Number.isSafeInteger(args.byteSize) ||
      args.byteSize < 1 ||
      args.byteSize > 5 * 1024 * 1024 ||
      !contentType.startsWith("image/") ||
      contentType.length > 100
    ) {
      throw new Error("INVALID_GROUP_AVATAR_UPLOAD");
    }
    const now = Date.now();
    const expiresAt = now + 15 * 60_000;
    const uploadId = await ctx.db.insert("chatGroupAvatarUploads", {
      uploaderId: actor.userId,
      conversationId: conversation._id,
      expectedSha256: sha256,
      expectedByteSize: args.byteSize,
      expectedContentType: contentType,
      status: "pending",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    return {
      uploadId,
      uploadUrl: await ctx.storage.generateUploadUrl(),
      expiresAt,
    };
  },
});

export const updateGroup = mutation({
  args: {
    conversationId: v.id("chatConversations"),
    name: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    removeImage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor, conversation, membership } = await requireGroupOwner(ctx, args.conversationId);
    if (args.imageStorageId) throw new Error("GROUP_AVATAR_REQUIRES_PREPARATION");
    const name = args.name !== undefined ? cleanGroupName(args.name) : undefined;
    await ctx.db.patch(conversation._id, {
      ...(name !== undefined ? { title: name } : {}),
      ...(args.removeImage ? { imageStorageId: undefined } : {}),
      updatedAt: Date.now(),
    });
    if (name !== undefined) {
      await syncConversationSearchEntry(ctx, {
        conversationId: conversation._id,
        viewerId: actor.userId,
        membershipStatus: membership.status,
      });
      await scheduleConversationSearchRefresh(ctx, conversation._id);
    }
    if (args.removeImage && conversation.imageStorageId) {
      const previousImageStorageId = conversation.imageStorageId;
      const managedFile = await ctx.db
        .query("chatGroupAvatarFiles")
        .withIndex("by_storageId", (q) => q.eq("storageId", previousImageStorageId))
        .unique();
      if (managedFile?.conversationId === conversation._id) {
        await ctx.storage.delete(managedFile.storageId);
        await ctx.db.delete(managedFile._id);
      }
    }
    if (conversation.studyGroupId && name !== undefined) {
      const studyGroup = await ctx.db.get(conversation.studyGroupId);
      if (!studyGroup || studyGroup.conversationId !== conversation._id) {
        throw new Error("STUDY_GROUP_STATE_MISMATCH");
      }
      await ctx.db.patch(studyGroup._id, { name, updatedAt: Date.now() });
    }
    return { conversationId: conversation._id };
  },
});

export const inviteGroupMember = mutation({
  args: { conversationId: v.id("chatConversations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const { actor, conversation } = await requireGroupOwner(ctx, args.conversationId);
    if (conversation.studyGroupId) throw new Error("STUDY_GROUP_MANAGED_SEPARATELY");
    if (args.userId === actor.userId) throw new Error("Already a member");
    const existingMembership = await getChatMembership(ctx, conversation._id, args.userId);
    if (
      existingMembership &&
      existingMembership.status !== "left" &&
      existingMembership.status !== "removed"
    ) {
      throw new Error("Already a member");
    }
    const target = await ctx.db.get(args.userId);
    if (!target || target.mergedInto || target.anonymizedAt) throw new Error("Profile not found");
    if (await isBlockedEitherDirection(ctx, actor.userId, args.userId)) throw new Error("CHAT_BLOCKED");
    await assertGroupInviteRateLimit(ctx, args.userId);
    const now = Date.now();
    await upsertChatMember(ctx, {
      conversationId: conversation._id,
      userId: args.userId,
      conversationKind: "group",
      role: "member",
      status: "invited",
      requestStatus: "pending",
      invitedBy: actor.userId,
      invitedAt: now,
    });
    await schedulePersistentActivityPush(ctx, {
      category: "groups",
      recipientIds: [args.userId],
      senderId: actor.userId,
      conversationId: conversation._id,
      title: "Poziv u grupni razgovor",
      body: `${actor.user.name ?? "Član"} te poziva u grupu „${conversation.title ?? "Grupa"}“.`,
      urlPath: `/app/messages/${String(conversation._id)}`,
      eventKey: `group-invite:${String(conversation._id)}:${String(args.userId)}`,
    });
    return { conversationId: conversation._id, status: "pending" as const };
  },
});

export const respondGroupInvite = mutation({
  args: { conversationId: v.id("chatConversations"), accept: v.boolean() },
  handler: async (ctx, args) => {
    const { membership } = await requireConversationMember(ctx, args.conversationId, { allowInvited: true });
    if (membership.status !== "invited" || membership.requestStatus !== "pending") throw new Error("Invite not pending");
    const now = Date.now();
    const patch = args.accept
      ? {
          status: "active" as const,
          requestStatus: "accepted" as const,
          joinedAt: now,
          leftAt: undefined,
          isArchived: false,
          updatedAt: now,
        }
      : {
          ...archivedMembershipPatch(membership, "removed", now),
          requestStatus: "declined" as const,
          joinedAt: undefined,
        };
    await ctx.db.patch(membership._id, patch);
    await syncChatInboxSummaryMember(ctx, membership._id, { ...membership, ...patch });
    await syncConversationSearchEntry(ctx, {
      conversationId: args.conversationId,
      viewerId: membership.userId,
      membershipStatus: patch.status,
    });
    return { conversationId: args.conversationId, status: args.accept ? "accepted" : "declined" };
  },
});

export const removeGroupMember = mutation({
  args: { conversationId: v.id("chatConversations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const { conversation } = await requireGroupOwner(ctx, args.conversationId);
    if (args.userId === conversation.ownerId) throw new Error("Transfer ownership first");
    const membership = await getChatMembership(ctx, conversation._id, args.userId);
    if (!membership || (membership.status !== "active" && membership.status !== "invited")) throw new Error("Member not found");
    const now = Date.now();
    if (conversation.studyGroupId) {
      const [studyGroup, studyMembership] = await Promise.all([
        ctx.db.get(conversation.studyGroupId),
        ctx.db
          .query("studyGroupMembers")
          .withIndex("by_groupId_and_userId", (q) =>
            q.eq("groupId", conversation.studyGroupId!).eq("userId", args.userId),
          )
          .unique(),
      ]);
      if (
        !studyGroup ||
        studyGroup.conversationId !== conversation._id ||
        !studyMembership?.active
      ) {
        throw new Error("STUDY_GROUP_STATE_MISMATCH");
      }
      const studyMembershipPatch = { active: false, leftAt: now };
      await ctx.db.patch(studyMembership._id, studyMembershipPatch);
      await syncStudyGroupMembershipSummary(ctx, studyMembership, {
        ...studyMembership,
        ...studyMembershipPatch,
      });
      await ctx.db.patch(studyGroup._id, {
        activeMemberCount: Math.max(1, studyGroup.activeMemberCount - 1),
        updatedAt: now,
      });
    }
    const patch = archivedMembershipPatch(membership, "removed", now);
    await ctx.db.patch(membership._id, patch);
    await syncChatInboxSummaryMember(ctx, membership._id, { ...membership, ...patch });
    await syncConversationSearchEntry(ctx, {
      conversationId: conversation._id,
      viewerId: membership.userId,
      membershipStatus: patch.status,
    });
    return { conversationId: conversation._id, userId: args.userId };
  },
});

export const transferGroupOwnership = mutation({
  args: { conversationId: v.id("chatConversations"), newOwnerId: v.id("users") },
  handler: async (ctx, args) => {
    const { actor, conversation, membership } = await requireGroupOwner(ctx, args.conversationId);
    const nextOwner = await getChatMembership(ctx, conversation._id, args.newOwnerId);
    if (!nextOwner || nextOwner.status !== "active" || args.newOwnerId === actor.userId) throw new Error("Invalid new owner");
    const now = Date.now();
    const patches = [
      ctx.db.patch(conversation._id, { ownerId: args.newOwnerId, updatedAt: Date.now() }),
      ctx.db.patch(membership._id, { role: "member", updatedAt: now }),
      ctx.db.patch(nextOwner._id, { role: "owner", updatedAt: now }),
    ];
    if (conversation.studyGroupId) {
      const [studyGroup, currentStudyMember, nextStudyMember] = await Promise.all([
        ctx.db.get(conversation.studyGroupId),
        ctx.db
          .query("studyGroupMembers")
          .withIndex("by_groupId_and_userId", (q) =>
            q.eq("groupId", conversation.studyGroupId!).eq("userId", actor.userId),
          )
          .unique(),
        ctx.db
          .query("studyGroupMembers")
          .withIndex("by_groupId_and_userId", (q) =>
            q.eq("groupId", conversation.studyGroupId!).eq("userId", args.newOwnerId),
          )
          .unique(),
      ]);
      if (
        !studyGroup ||
        studyGroup.conversationId !== conversation._id ||
        studyGroup.creatorId !== actor.userId ||
        !currentStudyMember?.active ||
        currentStudyMember.role !== "owner" ||
        !nextStudyMember?.active
      ) {
        throw new Error("STUDY_GROUP_STATE_MISMATCH");
      }
      patches.push(
        ctx.db.patch(studyGroup._id, { creatorId: args.newOwnerId, updatedAt: now }),
        ctx.db.patch(currentStudyMember._id, { role: "member" }),
        ctx.db.patch(nextStudyMember._id, { role: "owner" }),
      );
    }
    await Promise.all(patches);
    return { conversationId: conversation._id, ownerId: args.newOwnerId };
  },
});

export const leaveGroup = mutation({
  args: { conversationId: v.id("chatConversations") },
  handler: async (ctx, args) => {
    const { actor, conversation, membership } = await requireConversationMember(ctx, args.conversationId);
    if (conversation.kind !== "group") throw new Error("Not a group");
    if (conversation.ownerId === actor.userId || membership.role === "owner") throw new Error("Transfer ownership first");
    const now = Date.now();
    if (conversation.studyGroupId) {
      const [studyGroup, studyMembership] = await Promise.all([
        ctx.db.get(conversation.studyGroupId),
        ctx.db
          .query("studyGroupMembers")
          .withIndex("by_groupId_and_userId", (q) =>
            q.eq("groupId", conversation.studyGroupId!).eq("userId", actor.userId),
          )
          .unique(),
      ]);
      if (
        !studyGroup ||
        studyGroup.conversationId !== conversation._id ||
        !studyMembership?.active ||
        studyMembership.role === "owner"
      ) {
        throw new Error("STUDY_GROUP_STATE_MISMATCH");
      }
      const studyMembershipPatch = { active: false, leftAt: now };
      await ctx.db.patch(studyMembership._id, studyMembershipPatch);
      await syncStudyGroupMembershipSummary(ctx, studyMembership, {
        ...studyMembership,
        ...studyMembershipPatch,
      });
      await ctx.db.patch(studyGroup._id, {
        activeMemberCount: Math.max(1, studyGroup.activeMemberCount - 1),
        updatedAt: now,
      });
    }
    const patch = archivedMembershipPatch(membership, "left", now);
    await ctx.db.patch(membership._id, patch);
    await syncChatInboxSummaryMember(ctx, membership._id, { ...membership, ...patch });
    await syncConversationSearchEntry(ctx, {
      conversationId: conversation._id,
      viewerId: membership.userId,
      membershipStatus: patch.status,
    });
    return { conversationId: conversation._id, status: "left" as const };
  },
});

export const blockUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    if (args.userId === actor.userId) throw new Error("Cannot block yourself");
    const existing = await ctx.db
      .query("chatBlocks")
      .withIndex("by_blockerId_and_blockedId", (q) =>
        q.eq("blockerId", actor.userId).eq("blockedId", args.userId),
      )
      .unique();
    if (!existing) await ctx.db.insert("chatBlocks", { blockerId: actor.userId, blockedId: args.userId, createdAt: Date.now() });
    for (const kind of ["direct", "support"] as const) {
      const directKey = directConversationKey(kind, actor.userId, args.userId);
      const conversation = await ctx.db.query("chatConversations").withIndex("by_directKey", (q) => q.eq("directKey", directKey)).unique();
      if (!conversation) continue;
      const members = await ctx.db
        .query("chatMembers")
        .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
          q.eq("conversationId", conversation._id).eq("status", "active"),
        )
        .take(3);
      for (const member of members) await ctx.db.patch(member._id, { isArchived: true, updatedAt: Date.now() });
    }
    return { blocked: true };
  },
});

export const unblockUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const existing = await ctx.db
      .query("chatBlocks")
      .withIndex("by_blockerId_and_blockedId", (q) =>
        q.eq("blockerId", actor.userId).eq("blockedId", args.userId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { blocked: false };
  },
});

export const searchMessages = query({
  args: { query: v.string(), limit: v.optional(v.number()), conversationId: v.optional(v.id("chatConversations")) },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const search = normalizeFullTextSearchQuery(args.query);
    if (search.length < 2) return [];
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 30)));
    const scoped = args.conversationId
      ? await requireConversationMember(ctx, args.conversationId)
      : null;
    const membershipCandidates = scoped
      ? [scoped.membership]
      : await ctx.db
          .query("chatMembers")
          .withIndex("by_userId_and_status_and_lastDeliveredAt", (q) =>
            q.eq("userId", actor.userId).eq("status", "active"),
          )
          .order("desc")
          .take(100);
    const conversationPairs = await Promise.all(
      membershipCandidates.map(async (membership) => ({
        membership,
        conversation: await ctx.db.get(membership.conversationId),
      })),
    );
    const authorized = new Map(
      conversationPairs
        .filter((pair) => pair.conversation && !pair.conversation.deletedAt)
        .map((pair) => [String(pair.membership.conversationId), pair] as const),
    );
    const messageHits = args.conversationId
      ? await ctx.db
          .query("chatMessages")
          .withSearchIndex("search_searchText", (q) =>
            q.search("searchText", search).eq("conversationId", args.conversationId!),
          )
          .take(limit * 3)
      : await ctx.db
          .query("chatMessages")
          .withSearchIndex("search_searchText", (q) => q.search("searchText", search))
          .take(limit * 8);
    const normalizedSearch = search.toLocaleLowerCase();
    const results = new Map<string, {
      conversationId: Id<"chatConversations">;
      messageId?: Id<"chatMessages">;
      sequence?: number;
      body?: string;
      senderName?: string;
      createdAt: number;
      title?: string;
      kind: "direct" | "group" | "support";
      matchType: "message" | "conversation" | "participant";
    }>();

    for (const pair of authorized.values()) {
      const conversation = pair.conversation!;
      if (conversation.title?.toLocaleLowerCase().includes(normalizedSearch)) {
        results.set(String(conversation._id), {
          conversationId: conversation._id,
          body: conversation.title,
          createdAt: conversation.lastMessageAt ?? conversation.updatedAt,
          title: conversation.title,
          kind: conversation.kind,
          matchType: "conversation",
        });
      } else if (conversation.kind !== "group") {
        const members = await ctx.db
          .query("chatMembers")
          .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
            q.eq("conversationId", conversation._id).eq("status", "active"),
          )
          .take(3);
        const counterpartMembership = members.find((member) => member.userId !== actor.userId);
        const counterpart = counterpartMembership ? await ctx.db.get(counterpartMembership.userId) : null;
        const counterpartText = `${counterpart?.name ?? ""} ${counterpart?.username ?? ""}`.toLocaleLowerCase();
        if (counterpart && counterpartText.includes(normalizedSearch)) {
          results.set(String(conversation._id), {
            conversationId: conversation._id,
            body: counterpart.username ? `@${counterpart.username}` : counterpart.name,
            createdAt: conversation.lastMessageAt ?? conversation.updatedAt,
            title: counterpart.name,
            kind: conversation.kind,
            matchType: "participant",
          });
        }
      }
    }

    for (const hit of messageHits) {
      const pair = authorized.get(String(hit.conversationId));
      if (
        !pair ||
        results.has(String(hit.conversationId)) ||
        hit.sequence <= pair.membership.historyCutoffSequence
      ) continue;
      const conversation = pair.conversation!;
      results.set(String(conversation._id), {
        conversationId: conversation._id,
        messageId: hit._id,
        sequence: hit.sequence,
        body: hit.deletedAt ? undefined : hit.body,
        senderName: hit.senderName,
        createdAt: hit.createdAt,
        title: conversation.title,
        kind: conversation.kind,
        matchType: "message",
      });
    }
    return [...results.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
});

export const searchConversationMessagesPage = query({
  args: {
    conversationId: v.id("chatConversations"),
    query: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { actor, conversation, membership } = await requireConversationMember(ctx, args.conversationId);
    const search = normalizeFullTextSearchQuery(args.query);
    if (search.length < 2) return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("chatMessages")
      .withSearchIndex("search_searchText", (q) =>
        q.search("searchText", search).eq("conversationId", args.conversationId),
      )
      .paginate(args.paginationOpts);
    const visibleMessages = result.page.filter(
      (message) => !message.deletedAt && message.sequence > membership.historyCutoffSequence,
    );
    const senderIds = Array.from(
      new Set(visibleMessages.flatMap((message) => (message.senderId ? [message.senderId] : []))),
    );
    const blocks = conversation.kind === "group"
      ? await Promise.all(
          senderIds.map((senderId) =>
            ctx.db
              .query("chatBlocks")
              .withIndex("by_blockerId_and_blockedId", (q) =>
                q.eq("blockerId", actor.userId).eq("blockedId", senderId),
              )
              .unique(),
          ),
        )
      : [];
    const blockedIds = new Set(blocks.filter(Boolean).map((row) => String(row!.blockedId)));
    return {
      ...result,
      page: visibleMessages.map((message) => {
        const collapsed = Boolean(
          conversation.kind === "group" &&
            message.senderId &&
            blockedIds.has(String(message.senderId)),
        );
        return {
          messageId: message._id,
          sequence: message.sequence,
          body: collapsed ? undefined : message.body,
          senderId: collapsed ? undefined : message.senderId,
          senderName: collapsed ? undefined : message.senderName,
          createdAt: message.createdAt,
          editedAt: message.editedAt,
          collapsed,
        };
      }),
    };
  },
});

export const searchViewerConversations = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const search = args.query.trim().toLocaleLowerCase().slice(0, 200);
    if (search.length < 2) return [];
    const limit = Math.max(1, Math.min(30, Math.floor(args.limit ?? 20)));
    const results = [];
    for await (const membership of ctx.db
      .query("chatMembers")
      .withIndex("by_userId_and_status_and_lastDeliveredAt", (q) =>
        q.eq("userId", actor.userId).eq("status", "active"),
      )
      .order("desc")) {
      const conversation = await ctx.db.get(membership.conversationId);
      if (!conversation || conversation.deletedAt) continue;
      let matches = conversation.title?.toLocaleLowerCase().includes(search) ?? false;
      if (!matches && conversation.kind !== "group") {
        const members = await ctx.db
          .query("chatMembers")
          .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
            q.eq("conversationId", conversation._id).eq("status", "active"),
          )
          .take(3);
        const counterpartMembership = members.find((member) => member.userId !== actor.userId);
        const counterpart = counterpartMembership ? await ctx.db.get(counterpartMembership.userId) : null;
        matches = Boolean(
          counterpart && `${counterpart.name ?? ""} ${counterpart.username ?? ""}`.toLocaleLowerCase().includes(search),
        );
      }
      if (!matches) continue;
      const item = await inboxItem(ctx, membership);
      if (item) results.push(item);
      if (results.length >= limit) break;
    }
    return results;
  },
});

export const searchViewerConversationsPage = query({
  args: { query: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const search = normalizeFullTextSearchQuery(args.query);
    if (search.length < 2) return { page: [], isDone: true, continueCursor: "" };

    const version = await ctx.db
      .query("chatConversationSearchVersions")
      .withIndex("by_key", (q) => q.eq("key", "v1"))
      .unique();
    if (!version?.ready) {
      const result = await ctx.db
        .query("chatMembers")
        .withIndex("by_userId_and_status_and_lastDeliveredAt", (q) =>
          q.eq("userId", actor.userId),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      const searchTokens = search.toLocaleLowerCase().split(" ");
      const page = [];
      for (const membership of result.page) {
        if (membership.status !== "active" && membership.status !== "invited") continue;
        const conversation = await ctx.db.get(membership.conversationId);
        if (
          !conversation ||
          conversation.deletedAt ||
          (conversation.kind !== "group" && conversation.kind !== "support")
        ) {
          continue;
        }
        const title = conversation.title?.trim().toLocaleLowerCase();
        if (!title || !searchTokens.every((token) => title.includes(token))) continue;
        const item = await inboxItem(ctx, membership);
        if (item) page.push(item);
      }
      return { ...result, page };
    }

    const result = await ctx.db
      .query("chatConversationSearchEntries")
      .withSearchIndex("search_searchText", (q) =>
        q
          .search("searchText", search)
          .eq("viewerId", actor.userId)
          .eq("status", "visible"),
      )
      .paginate(args.paginationOpts);
    const page = [];

    for (const entry of result.page) {
      const conversation = await ctx.db.get(entry.conversationId);
      if (
        !conversation ||
        conversation.deletedAt ||
        conversation.title?.trim() !== entry.searchText ||
        (conversation.kind !== "group" && conversation.kind !== "support")
      ) {
        continue;
      }
      const membership = await ctx.db
        .query("chatMembers")
        .withIndex("by_conversationId_and_userId", (q) =>
          q.eq("conversationId", entry.conversationId).eq("userId", actor.userId),
        )
        .unique();
      if (!membership || !["active", "invited"].includes(membership.status)) continue;
      const item = await inboxItem(ctx, membership);
      if (item) page.push(item);
    }

    return { ...result, page };
  },
});

export const getDockState = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    if (!args.deviceId.trim() || args.deviceId.length > 200) throw new Error("INVALID_DEVICE_ID");
    const state = await ctx.db
      .query("chatDockState")
      .withIndex("by_userId_and_deviceId", (q) => q.eq("userId", actor.userId).eq("deviceId", args.deviceId))
      .unique();
    return state
      ? { deviceId: state.deviceId, openConversationIds: state.openConversationIds, minimizedConversationIds: state.minimizedConversationIds, updatedAt: state.updatedAt }
      : null;
  },
});

export const saveDockState = mutation({
  args: {
    deviceId: v.string(),
    openConversationIds: v.array(v.id("chatConversations")),
    minimizedConversationIds: v.array(v.id("chatConversations")),
  },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    if (!args.deviceId.trim() || args.deviceId.length > 200) throw new Error("INVALID_DEVICE_ID");
    const open = Array.from(new Set(args.openConversationIds)).slice(-20);
    const minimized = Array.from(new Set(args.minimizedConversationIds)).filter((id) => open.includes(id)).slice(-20);
    for (const conversationId of open) await requireConversationMember(ctx, conversationId, { allowInvited: true });
    const existing = await ctx.db
      .query("chatDockState")
      .withIndex("by_userId_and_deviceId", (q) => q.eq("userId", actor.userId).eq("deviceId", args.deviceId))
      .unique();
    const updatedAt = Date.now();
    if (existing) await ctx.db.patch(existing._id, { openConversationIds: open, minimizedConversationIds: minimized, updatedAt });
    else await ctx.db.insert("chatDockState", { userId: actor.userId, deviceId: args.deviceId, openConversationIds: open, minimizedConversationIds: minimized, updatedAt });
    return { deviceId: args.deviceId, openConversationIds: open, minimizedConversationIds: minimized, updatedAt };
  },
});

async function endpointHash(endpoint: string) {
  const bytes = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export const getPushConfig = query({
  args: {},
  handler: async () => ({ enabled: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY), publicKey: env.VAPID_PUBLIC_KEY ?? null }),
});

export const registerPushSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    expiresAt: v.optional(v.number()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const endpoint = args.endpoint.trim();
    if (!endpoint.startsWith("https://") || endpoint.length > 2_048) throw new Error("INVALID_PUSH_ENDPOINT");
    const hash = await endpointHash(endpoint);
    const existing = await ctx.db.query("pushSubscriptions").withIndex("by_endpointHash", (q) => q.eq("endpointHash", hash)).unique();
    const now = Date.now();
    const values = { userId: actor.userId, endpoint, endpointHash: hash, p256dh: args.p256dh, auth: args.auth, expiresAt: args.expiresAt, userAgent: args.userAgent?.slice(0, 500), updatedAt: now };
    if (existing) await ctx.db.patch(existing._id, values);
    else await ctx.db.insert("pushSubscriptions", { ...values, createdAt: now });
    return { registered: true };
  },
});

export const removePushSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const hash = await endpointHash(args.endpoint.trim());
    const existing = await ctx.db.query("pushSubscriptions").withIndex("by_endpointHash", (q) => q.eq("endpointHash", hash)).unique();
    if (existing && existing.userId === actor.userId) await ctx.db.delete(existing._id);
    return { removed: Boolean(existing && existing.userId === actor.userId) };
  },
});

export const getNotificationPreferences = query({
  args: { conversationId: v.optional(v.id("chatConversations")) },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    if (args.conversationId) await requireConversationMember(ctx, args.conversationId, { allowInvited: true });
    const rows = await Promise.all(
      notificationCategories.map((category) =>
        ctx.db
          .query("notificationPreferences")
          .withIndex("by_userId_and_category_and_conversationId", (q) =>
            q.eq("userId", actor.userId).eq("category", category).eq("conversationId", args.conversationId),
          )
          .unique(),
      ),
    );
    return notificationCategories.map((category, index) => ({
      category,
      conversationId: args.conversationId,
      inApp: rows[index]?.inApp ?? true,
      push: rows[index]?.push ?? true,
      sound: rows[index]?.sound ?? true,
    }));
  },
});

export const setNotificationPreferences = mutation({
  args: {
    category: v.string(),
    conversationId: v.optional(v.id("chatConversations")),
    inApp: v.boolean(),
    push: v.boolean(),
    sound: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    if (!notificationCategories.includes(args.category as (typeof notificationCategories)[number])) throw new Error("INVALID_NOTIFICATION_CATEGORY");
    if (args.conversationId) await requireConversationMember(ctx, args.conversationId, { allowInvited: true });
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId_and_category_and_conversationId", (q) =>
        q.eq("userId", actor.userId).eq("category", args.category).eq("conversationId", args.conversationId),
      )
      .unique();
    const values = { userId: actor.userId, category: args.category, conversationId: args.conversationId, inApp: args.inApp, push: args.push, sound: args.sound, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, values);
    else await ctx.db.insert("notificationPreferences", values);
    return { category: args.category, conversationId: args.conversationId, inApp: args.inApp, push: args.push, sound: args.sound };
  },
});
