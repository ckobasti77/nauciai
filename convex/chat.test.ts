/// <reference types="vite/client" />

import aggregateTest from "@convex-dev/aggregate/test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterAll, beforeAll, expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { promoteDirectRequestsAfterFollow } from "./chatCore";
import {
  markChatInboxAggregateReady,
  syncChatInboxSummaryMember,
} from "./chatInboxSummaryCore";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

function createTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "chatInbox");
  aggregateTest.register(t, "studyHub");
  return t;
}
type TestConvex = ReturnType<typeof createTest>;

beforeAll(() => {
  process.env.INITIAL_ADMIN_EMAILS = "chat-admin@example.com";
});

afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

const chatApi = {
  createDirect: makeFunctionReference<"mutation">("chat:createOrGetDirect"),
  respondDirect: makeFunctionReference<"mutation">("chat:respondDirectRequest"),
  send: makeFunctionReference<"mutation">("chat:sendMessage"),
  listMessages: makeFunctionReference<"query">("chat:listMessagesPage"),
  listMedia: makeFunctionReference<"query">("chat:listConversationMediaPage"),
  listInvites: makeFunctionReference<"query">("chat:listConversationInvitesPage"),
  listInbox: makeFunctionReference<"query">("chat:listInboxPage"),
  listPinnedInbox: makeFunctionReference<"query">("chat:listPinnedInboxPage"),
  search: makeFunctionReference<"query">("chat:searchMessages"),
  searchConversationPage: makeFunctionReference<"query">("chat:searchConversationMessagesPage"),
  searchViewerConversationsPage: makeFunctionReference<"query">("chat:searchViewerConversationsPage"),
  getInboxSummary: makeFunctionReference<"query">("chat:getInboxSummary"),
  edit: makeFunctionReference<"mutation">("chat:editMessage"),
  deleteForEveryone: makeFunctionReference<"mutation">("chat:deleteMessageForEveryone"),
  markRead: makeFunctionReference<"mutation">("chat:markRead"),
  toggleReaction: makeFunctionReference<"mutation">("chat:toggleReaction"),
  updateMemberState: makeFunctionReference<"mutation">("chat:updateMemberState"),
  allowRequestImages: makeFunctionReference<"mutation">("chat:allowRequestImages"),
  createGroup: makeFunctionReference<"mutation">("chat:createGroup"),
  inviteGroupMember: makeFunctionReference<"mutation">("chat:inviteGroupMember"),
  respondGroup: makeFunctionReference<"mutation">("chat:respondGroupInvite"),
  removeGroupMember: makeFunctionReference<"mutation">("chat:removeGroupMember"),
  transferOwner: makeFunctionReference<"mutation">("chat:transferGroupOwnership"),
  leaveGroup: makeFunctionReference<"mutation">("chat:leaveGroup"),
  block: makeFunctionReference<"mutation">("chat:blockUser"),
  report: makeFunctionReference<"mutation">("chatModeration:reportContent"),
  moderate: makeFunctionReference<"mutation">("chatModeration:moderateReport"),
  getReportedConversation: makeFunctionReference<"query">("chatModeration:getReportedConversation"),
  openAdminUserChats: makeFunctionReference<"mutation">("chatModeration:openAdminUserChats"),
  suspendAccount: makeFunctionReference<"mutation">("chatModeration:suspendAccount"),
  getMySuspension: makeFunctionReference<"query">("chatModeration:getMySuspension"),
  appeal: makeFunctionReference<"mutation">("chatModeration:submitSuspensionAppeal"),
  prepareImage: makeFunctionReference<"action">("chatMedia:prepareImage"),
  requestPreview: makeFunctionReference<"action">("chatLinkPreview:requestLinkPreview"),
};

function asUser(t: TestConvex, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `chat-test|${userId}` });
}

async function seedUsers(
  t: TestConvex,
  count = 4,
  overrides: Record<number, { role?: "student" | "pro_student" | "moderator" | "admin"; dmPrivacy?: "requests" | "following" | "nobody"; email?: string }> = {},
) {
  return t.run(async (ctx) => {
    const ids: Id<"users">[] = [];
    for (let index = 0; index < count; index += 1) {
      ids.push(
        await ctx.db.insert("users", {
          email: overrides[index]?.email ?? `chat-user-${index}@example.com`,
          name: `Chat User ${index}`,
          username: `chat_user_${index}`,
          role: overrides[index]?.role ?? "student",
          dmPrivacy: overrides[index]?.dmPrivacy ?? "requests",
          language: "sr",
          createdAt: index + 1,
          updatedAt: index + 1,
        }),
      );
    }
    return ids;
  });
}

async function acceptedDirect(
  t: TestConvex,
  senderId: Id<"users">,
  recipientId: Id<"users">,
) {
  await t.run((ctx) =>
    ctx.db.insert("userFollows", {
      followerId: recipientId,
      followingId: senderId,
      createdAt: Date.now(),
    }),
  );
  return asUser(t, senderId).mutation(chatApi.createDirect, { recipientId });
}

async function sendText(
  t: TestConvex,
  userId: Id<"users">,
  conversationId: Id<"chatConversations">,
  body: string,
  clientNonce: string,
) {
  return asUser(t, userId).mutation(chatApi.send, {
    conversationId,
    body,
    imageIds: [],
    mentionUserIds: [],
    clientNonce,
  });
}

test("direct conversation is unique and requests require explicit acceptance", async () => {
  const t = createTest();
  const [senderId, recipientId] = await seedUsers(t, 2);
  const sender = asUser(t, senderId);
  const recipient = asUser(t, recipientId);
  const first = await sender.mutation(chatApi.createDirect, { recipientId });
  const retry = await sender.mutation(chatApi.createDirect, { recipientId });
  const reverse = await recipient.mutation(chatApi.createDirect, { recipientId: senderId });

  expect(retry.conversationId).toBe(first.conversationId);
  expect(reverse.conversationId).toBe(first.conversationId);
  expect(reverse.requestStatus).toBe("pending");
  await expect(
    sendText(t, recipientId, first.conversationId, "Ne prihvatam implicitno", "recipient-before-accept"),
  ).rejects.toThrow("REQUEST_NOT_ACCEPTED");

  await recipient.mutation(chatApi.respondDirect, {
    conversationId: first.conversationId,
    accept: true,
  });
  await expect(
    sendText(t, recipientId, first.conversationId, "Sada je prihvaćeno", "recipient-after-accept"),
  ).resolves.toMatchObject({ deduplicated: false });

  const state = await t.run(async (ctx) => ({
    conversations: await ctx.db.query("chatConversations").collect(),
    requests: await ctx.db.query("chatDirectRequests").collect(),
  }));
  expect(state.conversations).toHaveLength(1);
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0].status).toBe("accepted");
});

test("pending request allows three sender messages and client nonce retry is idempotent", async () => {
  const t = createTest();
  const [senderId, recipientId] = await seedUsers(t, 2);
  const direct = await asUser(t, senderId).mutation(chatApi.createDirect, { recipientId });
  const first = await sendText(t, senderId, direct.conversationId, "Jedan", "nonce-one");
  const retry = await sendText(t, senderId, direct.conversationId, "Promenjen retry payload", "nonce-one");
  await sendText(t, senderId, direct.conversationId, "Dva", "nonce-two");
  await sendText(t, senderId, direct.conversationId, "Tri", "nonce-three");
  await expect(sendText(t, senderId, direct.conversationId, "Četiri", "nonce-four")).rejects.toThrow(
    "REQUEST_MESSAGE_LIMIT",
  );
  expect(retry).toMatchObject({ messageId: first.messageId, deduplicated: true });

  const rows = await t.run((ctx) =>
    ctx.db
      .query("chatMessages")
      .withIndex("by_conversationId_and_sequence", (q) => q.eq("conversationId", direct.conversationId))
      .collect(),
  );
  expect(rows).toHaveLength(3);
});

test("follow promotion, privacy and 15-day decline cooldown are enforced", async () => {
  const t = createTest();
  const [senderId, recipientId, followingOnlyId, nobodyId] = await seedUsers(t, 4, {
    2: { dmPrivacy: "following" },
    3: { dmPrivacy: "nobody" },
  });
  const request = await asUser(t, senderId).mutation(chatApi.createDirect, { recipientId });
  await t.run((ctx) =>
    ctx.db.insert("userFollows", {
      followerId: recipientId,
      followingId: senderId,
      createdAt: Date.now(),
    }),
  );
  await t.run((ctx) =>
    promoteDirectRequestsAfterFollow(ctx, { followerId: recipientId, followingId: senderId }),
  );
  const promoted = await t.run((ctx) =>
    ctx.db
      .query("chatDirectRequests")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", request.conversationId))
      .unique(),
  );
  expect(promoted?.status).toBe("accepted");

  await expect(
    asUser(t, senderId).mutation(chatApi.createDirect, { recipientId: followingOnlyId }),
  ).rejects.toThrow("DM_PRIVACY_FOLLOWING_ONLY");
  await t.run((ctx) =>
    ctx.db.insert("userFollows", {
      followerId: followingOnlyId,
      followingId: senderId,
      createdAt: Date.now(),
    }),
  );
  await expect(
    asUser(t, senderId).mutation(chatApi.createDirect, { recipientId: followingOnlyId }),
  ).resolves.toMatchObject({ requestStatus: "accepted" });
  await expect(
    asUser(t, senderId).mutation(chatApi.createDirect, { recipientId: nobodyId }),
  ).rejects.toThrow("DM_PRIVACY_BLOCKED");

  const [declinerSender, declinerRecipient] = await seedUsers(t, 2);
  const declined = await asUser(t, declinerSender).mutation(chatApi.createDirect, {
    recipientId: declinerRecipient,
  });
  await asUser(t, declinerRecipient).mutation(chatApi.respondDirect, {
    conversationId: declined.conversationId,
    accept: false,
  });
  await expect(
    asUser(t, declinerSender).mutation(chatApi.createDirect, { recipientId: declinerRecipient }),
  ).rejects.toThrow("DM_REQUEST_COOLDOWN");
});

test("recipient daily limits cap ten new DM requests and twenty group invites", async () => {
  const t = createTest();
  const users = await seedUsers(t, 23);
  const recipientId = users[0];
  for (let index = 1; index <= 10; index += 1) {
    await asUser(t, users[index]).mutation(chatApi.createDirect, { recipientId });
  }
  await expect(
    asUser(t, users[11]).mutation(chatApi.createDirect, { recipientId }),
  ).rejects.toThrow("DM_REQUEST_RATE_LIMIT");

  const groupRecipientId = users[22];
  for (let index = 1; index <= 20; index += 1) {
    await asUser(t, users[index]).mutation(chatApi.createGroup, {
      name: `Grupa ${index}`,
      memberIds: [groupRecipientId],
    });
  }
  await expect(
    asUser(t, users[21]).mutation(chatApi.createGroup, {
      name: "Grupa 21",
      memberIds: [groupRecipientId],
    }),
  ).rejects.toThrow("GROUP_INVITE_RATE_LIMIT");
});

test("group owner must transfer ownership before leaving", async () => {
  const t = createTest();
  const [ownerId, memberId] = await seedUsers(t, 2);
  const group = await asUser(t, ownerId).mutation(chatApi.createGroup, {
    name: "AI grupa",
    memberIds: [memberId],
  });
  await asUser(t, memberId).mutation(chatApi.respondGroup, {
    conversationId: group.conversationId,
    accept: true,
  });
  await expect(
    asUser(t, ownerId).mutation(chatApi.leaveGroup, { conversationId: group.conversationId }),
  ).rejects.toThrow("Transfer ownership first");
  await asUser(t, ownerId).mutation(chatApi.transferOwner, {
    conversationId: group.conversationId,
    newOwnerId: memberId,
  });
  await expect(
    asUser(t, ownerId).mutation(chatApi.leaveGroup, { conversationId: group.conversationId }),
  ).resolves.toMatchObject({ status: "left" });
});

test("group membership rejects duplicate invites and archives cleanly on leave or removal", async () => {
  const t = createTest();
  const [ownerId, memberId] = await seedUsers(t, 2);
  const owner = asUser(t, ownerId);
  const member = asUser(t, memberId);
  const group = await owner.mutation(chatApi.createGroup, {
    name: "Integritet članstva",
    memberIds: [memberId],
  });
  const pendingInvites = await owner.query(chatApi.listInvites, {
    conversationId: group.conversationId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(pendingInvites.page).toMatchObject([{ userId: memberId, membershipStatus: "invited" }]);

  await expect(
    owner.mutation(chatApi.inviteGroupMember, {
      conversationId: group.conversationId,
      userId: memberId,
    }),
  ).rejects.toThrow("Already a member");
  await member.mutation(chatApi.respondGroup, {
    conversationId: group.conversationId,
    accept: true,
  });
  expect((await owner.query(chatApi.listInvites, {
    conversationId: group.conversationId,
    paginationOpts: { cursor: null, numItems: 10 },
  })).page).toEqual([]);
  await expect(
    owner.mutation(chatApi.inviteGroupMember, {
      conversationId: group.conversationId,
      userId: memberId,
    }),
  ).rejects.toThrow("Already a member");

  const setUnreadPinnedState = () =>
    t.run(async (ctx) => {
      const membership = await ctx.db
        .query("chatMembers")
        .withIndex("by_conversationId_and_userId", (q) =>
          q.eq("conversationId", group.conversationId).eq("userId", memberId),
        )
        .unique();
      if (!membership) throw new Error("Missing group membership fixture");
      const patch = {
        lastDeliveredSequence: 7,
        unreadCount: 7,
        hasUnread: true,
        isPinned: true,
        isArchived: false,
        updatedAt: Date.now(),
      };
      await ctx.db.patch(membership._id, patch);
      await syncChatInboxSummaryMember(ctx, membership._id, { ...membership, ...patch });
    });
  const getMembership = () =>
    t.run((ctx) =>
      ctx.db
        .query("chatMembers")
        .withIndex("by_conversationId_and_userId", (q) =>
          q.eq("conversationId", group.conversationId).eq("userId", memberId),
        )
        .unique(),
    );
  const expectAbsentFromInbox = async () => {
    const [all, groups, archive, pinned] = await Promise.all([
      member.query(chatApi.listInbox, {
        section: "all",
        paginationOpts: { cursor: null, numItems: 20 },
      }),
      member.query(chatApi.listInbox, {
        section: "groups",
        paginationOpts: { cursor: null, numItems: 20 },
      }),
      member.query(chatApi.listInbox, {
        section: "archive",
        paginationOpts: { cursor: null, numItems: 20 },
      }),
      member.query(chatApi.listPinnedInbox, {
        section: "all",
        paginationOpts: { cursor: null, numItems: 20 },
      }),
    ]);
    for (const result of [all, groups, archive, pinned]) {
      expect(result.page.map((row: { conversationId: Id<"chatConversations"> }) => row.conversationId))
        .not.toContain(group.conversationId);
    }
  };

  await setUnreadPinnedState();
  await member.mutation(chatApi.leaveGroup, { conversationId: group.conversationId });
  expect(await getMembership()).toMatchObject({
    status: "left",
    unreadCount: 0,
    hasUnread: false,
    isPinned: false,
    isArchived: true,
    lastReadSequence: 7,
  });
  await expectAbsentFromInbox();

  await expect(
    owner.mutation(chatApi.inviteGroupMember, {
      conversationId: group.conversationId,
      userId: memberId,
    }),
  ).resolves.toMatchObject({ status: "pending" });
  expect(await getMembership()).toMatchObject({
    status: "invited",
    requestStatus: "pending",
    unreadCount: 0,
    hasUnread: false,
    isPinned: false,
    isArchived: false,
  });
  const requests = await member.query(chatApi.listInbox, {
    section: "requests",
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(requests.page.map((row: { conversationId: Id<"chatConversations"> }) => row.conversationId))
    .toContain(group.conversationId);
  await expect(
    owner.mutation(chatApi.inviteGroupMember, {
      conversationId: group.conversationId,
      userId: memberId,
    }),
  ).rejects.toThrow("Already a member");

  await member.mutation(chatApi.respondGroup, {
    conversationId: group.conversationId,
    accept: true,
  });
  await setUnreadPinnedState();
  await owner.mutation(chatApi.removeGroupMember, {
    conversationId: group.conversationId,
    userId: memberId,
  });
  expect(await getMembership()).toMatchObject({
    status: "removed",
    unreadCount: 0,
    hasUnread: false,
    isPinned: false,
    isArchived: true,
    lastReadSequence: 7,
  });
  await expectAbsentFromInbox();
  await expect(
    owner.mutation(chatApi.inviteGroupMember, {
      conversationId: group.conversationId,
      userId: memberId,
    }),
  ).resolves.toMatchObject({ status: "pending" });
});

test("read state, reactions, mute and edit/delete windows stay per member and message", async () => {
  const t = createTest();
  const [senderId, recipientId] = await seedUsers(t, 2);
  const direct = await acceptedDirect(t, senderId, recipientId);
  const sent = await sendText(t, senderId, direct.conversationId, "Originalna poruka", "read-message");
  await asUser(t, recipientId).mutation(chatApi.markRead, {
    conversationId: direct.conversationId,
    sequence: sent.sequence,
  });
  await expect(
    asUser(t, recipientId).mutation(chatApi.toggleReaction, { messageId: sent.messageId, emoji: "👍" }),
  ).resolves.toEqual({ active: true });
  await expect(
    asUser(t, recipientId).mutation(chatApi.toggleReaction, { messageId: sent.messageId, emoji: "👍" }),
  ).resolves.toEqual({ active: false });
  await asUser(t, recipientId).mutation(chatApi.updateMemberState, {
    conversationId: direct.conversationId,
    mutedUntil: -1,
  });
  await asUser(t, senderId).mutation(chatApi.edit, {
    messageId: sent.messageId,
    body: "Izmenjena poruka",
  });
  await t.run((ctx) => ctx.db.patch(sent.messageId, { createdAt: Date.now() - 16 * 60 * 1000 }));
  await expect(
    asUser(t, senderId).mutation(chatApi.edit, { messageId: sent.messageId, body: "Prekasno" }),
  ).rejects.toThrow("EDIT_WINDOW_EXPIRED");
  await expect(
    asUser(t, senderId).mutation(chatApi.deleteForEveryone, { messageId: sent.messageId }),
  ).rejects.toThrow("DELETE_WINDOW_EXPIRED");

  const state = await t.run(async (ctx) => ({
    member: await ctx.db
      .query("chatMembers")
      .withIndex("by_conversationId_and_userId", (q) =>
        q.eq("conversationId", direct.conversationId).eq("userId", recipientId),
      )
      .unique(),
    reactions: await ctx.db
      .query("chatReactions")
      .withIndex("by_messageId_and_createdAt", (q) => q.eq("messageId", sent.messageId))
      .collect(),
  }));
  expect(state.member).toMatchObject({ lastReadSequence: sent.sequence, unreadCount: 0, hasUnread: false });
  expect(state.member?.mutedUntil).toBe(Number.MAX_SAFE_INTEGER);
  expect(state.reactions).toHaveLength(0);
});

test("conversation IDs and search are authorized server-side", async () => {
  const t = createTest();
  const [senderId, recipientId, outsiderId] = await seedUsers(t, 3);
  const direct = await acceptedDirect(t, senderId, recipientId);
  await sendText(t, senderId, direct.conversationId, "tajna magnetna reč", "secret-message");
  await expect(
    asUser(t, outsiderId).query(chatApi.listMessages, {
      conversationId: direct.conversationId,
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).rejects.toThrow("Forbidden");
  await expect(
    asUser(t, outsiderId).query(chatApi.search, {
      query: "magnetna",
      conversationId: direct.conversationId,
      limit: 20,
    }),
  ).rejects.toThrow("Forbidden");
  expect(await asUser(t, outsiderId).query(chatApi.search, { query: "magnetna", limit: 20 })).toEqual([]);
  expect(await asUser(t, recipientId).query(chatApi.search, { query: "magnetna", limit: 20 })).toHaveLength(1);
  const scoped = await asUser(t, recipientId).query(chatApi.searchConversationPage, {
    conversationId: direct.conversationId,
    query: "magnetna",
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(scoped.page).toMatchObject([{ sequence: 1, body: expect.stringContaining("magnetna") }]);
  await expect(
    asUser(t, outsiderId).query(chatApi.searchConversationPage, {
      conversationId: direct.conversationId,
      query: "magnetna",
      paginationOpts: { cursor: null, numItems: 1 },
    }),
  ).rejects.toThrow("Forbidden");
});

test("viewer conversation search paginates a private projection and removes membership ghosts", async () => {
  const t = createTest();
  const [viewerId, firstOwnerId, secondOwnerId, outsiderOwnerId] = await seedUsers(t, 4);
  const firstOwner = asUser(t, firstOwnerId);
  const secondOwner = asUser(t, secondOwnerId);
  const viewer = asUser(t, viewerId);
  const first = await firstOwner.mutation(chatApi.createGroup, {
    name: "Orion grupa jedan",
    memberIds: [viewerId],
  });
  const second = await secondOwner.mutation(chatApi.createGroup, {
    name: "Orion grupa dva",
    memberIds: [viewerId],
  });
  const privateGroup = await asUser(t, outsiderOwnerId).mutation(chatApi.createGroup, {
    name: "Orion privatna grupa",
    memberIds: [],
  });

  const beforeBackfill = await viewer.query(chatApi.searchViewerConversationsPage, {
    query: "Orion",
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(new Set(beforeBackfill.page.map((row: { conversationId: Id<"chatConversations"> }) => row.conversationId)))
    .toEqual(new Set([first.conversationId, second.conversationId]));
  await t.run((ctx) =>
    ctx.db.insert("chatConversationSearchVersions", {
      key: "v1",
      ready: true,
      updatedAt: Date.now(),
    }),
  );

  const firstPage = await viewer.query(chatApi.searchViewerConversationsPage, {
    query: "Orion",
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(firstPage.page).toHaveLength(1);
  expect(firstPage.isDone).toBe(false);

  const secondPage = await viewer.query(chatApi.searchViewerConversationsPage, {
    query: "Orion",
    paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
  });
  expect(secondPage.page).toHaveLength(1);
  expect(new Set([
    firstPage.page[0]?.conversationId,
    secondPage.page[0]?.conversationId,
  ])).toEqual(new Set([first.conversationId, second.conversationId]));
  expect([
    firstPage.page[0]?.conversationId,
    secondPage.page[0]?.conversationId,
  ]).not.toContain(privateGroup.conversationId);
  try {
    const crossViewerPage = await asUser(t, outsiderOwnerId).query(
      chatApi.searchViewerConversationsPage,
      {
        query: "Orion",
        paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
      },
    );
    expect(crossViewerPage.page.map((row: { conversationId: Id<"chatConversations"> }) => row.conversationId))
      .not.toContain(first.conversationId);
  } catch (error) {
    expect(String(error).toLocaleLowerCase()).toMatch(/cursor|pagination/);
  }

  await expect(
    viewer.query(chatApi.searchViewerConversationsPage, {
      query: Array.from({ length: 17 }, (_, index) => `termin${index}`).join(" "),
      paginationOpts: { cursor: null, numItems: 5 },
    }),
  ).resolves.toBeDefined();
  await expect(
    viewer.query(chatApi.searchViewerConversationsPage, {
      query: "č".repeat(40),
      paginationOpts: { cursor: null, numItems: 5 },
    }),
  ).resolves.toBeDefined();

  const searchAll = async () =>
    viewer.query(chatApi.searchViewerConversationsPage, {
      query: "Orion",
      paginationOpts: { cursor: null, numItems: 20 },
    });

  await viewer.mutation(chatApi.respondGroup, {
    conversationId: first.conversationId,
    accept: false,
  });
  expect((await searchAll()).page.map((row: { conversationId: Id<"chatConversations"> }) => row.conversationId))
    .toEqual([second.conversationId]);

  await firstOwner.mutation(chatApi.inviteGroupMember, {
    conversationId: first.conversationId,
    userId: viewerId,
  });
  expect(new Set((await searchAll()).page.map((row: { conversationId: Id<"chatConversations"> }) => row.conversationId)))
    .toEqual(new Set([first.conversationId, second.conversationId]));

  await viewer.mutation(chatApi.respondGroup, {
    conversationId: first.conversationId,
    accept: true,
  });
  await firstOwner.mutation(chatApi.removeGroupMember, {
    conversationId: first.conversationId,
    userId: viewerId,
  });
  expect((await searchAll()).page.map((row: { conversationId: Id<"chatConversations"> }) => row.conversationId))
    .toEqual([second.conversationId]);

  await viewer.mutation(chatApi.respondGroup, {
    conversationId: second.conversationId,
    accept: true,
  });
  await viewer.mutation(chatApi.leaveGroup, { conversationId: second.conversationId });
  expect((await searchAll()).page).toEqual([]);

  const deleted = await viewer.mutation(chatApi.createGroup, {
    name: "Orion obrisana grupa",
    memberIds: [],
  });
  await t.run((ctx) =>
    ctx.db.patch(deleted.conversationId, { deletedAt: Date.now(), updatedAt: Date.now() }),
  );
  expect((await searchAll()).page).toEqual([]);
});

test("pinned inbox rows stay cursor-paginated and can be composed above regular rows", async () => {
  const t = createTest();
  const [viewerId, firstPeerId, secondPeerId, thirdPeerId] = await seedUsers(t, 4);
  const first = await acceptedDirect(t, viewerId, firstPeerId);
  const second = await acceptedDirect(t, viewerId, secondPeerId);
  await acceptedDirect(t, viewerId, thirdPeerId);
  await asUser(t, viewerId).mutation(chatApi.updateMemberState, {
    conversationId: first.conversationId,
    isPinned: true,
  });
  await asUser(t, viewerId).mutation(chatApi.updateMemberState, {
    conversationId: second.conversationId,
    isPinned: true,
  });

  const firstPage = await asUser(t, viewerId).query(chatApi.listPinnedInbox, {
    section: "all",
    paginationOpts: { cursor: null, numItems: 1 },
  });
  const secondPage = await asUser(t, viewerId).query(chatApi.listPinnedInbox, {
    section: "all",
    paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
  });
  expect(firstPage.page).toHaveLength(1);
  expect(firstPage.isDone).toBe(false);
  expect(secondPage.page).toHaveLength(1);
  expect(secondPage.page[0]?.conversationId).not.toBe(firstPage.page[0]?.conversationId);
  expect([...firstPage.page, ...secondPage.page].every((row) => row.isPinned)).toBe(true);

  const regular = await asUser(t, viewerId).query(chatApi.listInbox, {
    section: "all",
    paginationOpts: { cursor: null, numItems: 20 },
  });
  const combined = [
    ...firstPage.page,
    ...secondPage.page,
    ...regular.page.filter((row: { isPinned: boolean }) => !row.isPinned),
  ];
  expect(combined.slice(0, 2).every((row) => row.isPinned)).toBe(true);
  expect(combined.filter((row) => !row.isPinned)).toHaveLength(1);
});

test("conversation media is paginated and respects request visibility, membership, and history cutoff", async () => {
  const t = createTest();
  const [senderId, recipientId, outsiderId] = await seedUsers(t, 3);
  const direct = await asUser(t, senderId).mutation(chatApi.createDirect, { recipientId });
  const firstMessage = await sendText(t, senderId, direct.conversationId, "Prva slika", "media-first");
  const secondMessage = await sendText(t, senderId, direct.conversationId, "Druga slika", "media-second");

  await t.run(async (ctx) => {
    for (const [index, message] of [firstMessage, secondMessage].entries()) {
      const storageId = await ctx.storage.store(
        new Blob([new Uint8Array([index + 1])], { type: "image/webp" }),
      );
      await ctx.db.insert("chatImages", {
        uploaderId: senderId,
        messageId: message.messageId,
        conversationId: direct.conversationId,
        storageId,
        fileName: `media-${index}.webp`,
        mimeType: "image/webp",
        byteSize: 1,
        width: 1,
        height: 1,
        status: "attached",
        createdAt: index + 1,
        updatedAt: index + 1,
      });
    }
  });

  await expect(
    asUser(t, outsiderId).query(chatApi.listMedia, {
      conversationId: direct.conversationId,
      paginationOpts: { cursor: null, numItems: 1 },
    }),
  ).rejects.toThrow("Forbidden");
  const hidden = await asUser(t, recipientId).query(chatApi.listMedia, {
    conversationId: direct.conversationId,
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(hidden.page).toEqual([]);

  await asUser(t, recipientId).mutation(chatApi.allowRequestImages, {
    conversationId: direct.conversationId,
  });
  const firstPage = await asUser(t, recipientId).query(chatApi.listMedia, {
    conversationId: direct.conversationId,
    paginationOpts: { cursor: null, numItems: 1 },
  });
  const secondPage = await asUser(t, recipientId).query(chatApi.listMedia, {
    conversationId: direct.conversationId,
    paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
  });
  expect(firstPage.page).toHaveLength(1);
  expect(firstPage.page[0]?.url).toMatch(/^https?:\/\//);
  expect(firstPage.isDone).toBe(false);
  expect(secondPage.page).toHaveLength(1);
  expect(secondPage.page[0]?.id).not.toBe(firstPage.page[0]?.id);

  await asUser(t, recipientId).mutation(chatApi.updateMemberState, {
    conversationId: direct.conversationId,
    historyCutoffSequence: secondMessage.sequence,
  });
  const afterCutoff = await asUser(t, recipientId).query(chatApi.listMedia, {
    conversationId: direct.conversationId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(afterCutoff.page).toEqual([]);
});

test("inbox summary stays exact beyond one thousand memberships", async () => {
  const t = createTest();
  const [viewerId] = await seedUsers(t, 1);
  const totalMemberships = 1_105;
  let expectedUnread = 0;
  let expectedUnreadConversations = 0;
  let expectedRequests = 0;
  let expectedGroupInvites = 0;

  for (let start = 0; start < totalMemberships; start += 100) {
    const end = Math.min(totalMemberships, start + 100);
    await t.run(async (ctx) => {
      for (let index = start; index < end; index += 1) {
        const conversationKind = index % 3 === 0 ? "group" as const : "direct" as const;
        const requestStatus = index % 2 === 0 ? "pending" as const : "accepted" as const;
        const status = conversationKind === "group" && requestStatus === "pending" ? "invited" as const : "active" as const;
        const unreadCount = (index % 4) + 1;
        const now = index + 1;
        const conversationId = await ctx.db.insert("chatConversations", {
          kind: conversationKind,
          createdById: viewerId,
          nextSequence: 1,
          createdAt: now,
          updatedAt: now,
        });
        const memberId = await ctx.db.insert("chatMembers", {
          conversationId,
          userId: viewerId,
          conversationKind,
          role: "member",
          status,
          requestStatus,
          lastReadSequence: 0,
          lastDeliveredSequence: unreadCount,
          lastDeliveredAt: now,
          unreadCount,
          hasUnread: true,
          isArchived: false,
          isPinned: false,
          historyCutoffSequence: 0,
          joinedAt: status === "active" ? now : undefined,
          invitedAt: status === "invited" ? now : undefined,
          updatedAt: now,
        });
        await syncChatInboxSummaryMember(ctx, memberId, {
          userId: viewerId,
          conversationKind,
          status,
          requestStatus,
          unreadCount,
          hasUnread: true,
        });
      }
    });
  }
  for (let index = 0; index < totalMemberships; index += 1) {
    const group = index % 3 === 0;
    const pending = index % 2 === 0;
    if (!(group && pending)) {
      expectedUnread += (index % 4) + 1;
      expectedUnreadConversations += 1;
    }
    if (pending && !group) expectedRequests += 1;
    if (pending && group) expectedGroupInvites += 1;
  }
  await expect(asUser(t, viewerId).query(chatApi.getInboxSummary, {})).resolves.toEqual({
    totalUnread: expectedUnread,
    unreadConversations: expectedUnreadConversations,
    pendingRequests: expectedRequests,
    pendingGroupInvites: expectedGroupInvites,
  });
});

test("inbox summary keeps the manual projection until aggregate cutover", async () => {
  const t = createTest();
  const [viewerId] = await seedUsers(t, 1);
  const memberId = await t.run(async (ctx) => {
    const conversationId = await ctx.db.insert("chatConversations", {
      kind: "direct",
      createdById: viewerId,
      nextSequence: 4,
      lastMessageSequence: 3,
      createdAt: 1,
      updatedAt: 1,
    });
    const id = await ctx.db.insert("chatMembers", {
      conversationId,
      userId: viewerId,
      conversationKind: "direct",
      role: "member",
      status: "active",
      requestStatus: "pending",
      lastReadSequence: 0,
      lastDeliveredSequence: 3,
      lastDeliveredAt: 1,
      unreadCount: 3,
      hasUnread: true,
      isArchived: false,
      isPinned: false,
      historyCutoffSequence: 0,
      joinedAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("chatInboxSummaryMembers", {
      chatMemberId: id,
      userId: viewerId,
      totalUnread: 3,
      unreadConversations: 1,
      pendingRequests: 1,
      pendingGroupInvites: 0,
      updatedAt: 1,
    });
    await ctx.db.insert("chatInboxSummaries", {
      userId: viewerId,
      totalUnread: 3,
      unreadConversations: 1,
      pendingRequests: 1,
      pendingGroupInvites: 0,
      ready: true,
      aggregateReady: false,
      updatedAt: 1,
    });
    return id;
  });
  const expected = {
    totalUnread: 3,
    unreadConversations: 1,
    pendingRequests: 1,
    pendingGroupInvites: 0,
  };
  const viewer = asUser(t, viewerId);
  await expect(viewer.query(chatApi.getInboxSummary, {})).resolves.toEqual(expected);

  await t.run(async (ctx) => {
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Missing chat membership fixture");
    await syncChatInboxSummaryMember(ctx, member._id, member);
    await syncChatInboxSummaryMember(ctx, member._id, member);
    await markChatInboxAggregateReady(ctx, viewerId);
  });
  await expect(viewer.query(chatApi.getInboxSummary, {})).resolves.toEqual(expected);
});

test("block archives direct chat and collapses blocked sender in a shared group", async () => {
  const t = createTest();
  const [blockedId, blockerId, ownerId] = await seedUsers(t, 3);
  const direct = await acceptedDirect(t, blockedId, blockerId);
  const group = await asUser(t, ownerId).mutation(chatApi.createGroup, {
    name: "Zajednička grupa",
    memberIds: [blockedId, blockerId],
  });
  await asUser(t, blockedId).mutation(chatApi.respondGroup, { conversationId: group.conversationId, accept: true });
  await asUser(t, blockerId).mutation(chatApi.respondGroup, { conversationId: group.conversationId, accept: true });
  await asUser(t, blockerId).mutation(chatApi.block, { userId: blockedId });
  await expect(
    sendText(t, blockedId, direct.conversationId, "Ne može", "blocked-direct"),
  ).rejects.toThrow("CHAT_BLOCKED");
  const blockedMessage = await sendText(t, blockedId, group.conversationId, "Skupljena poruka", "blocked-group");
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array([1])], { type: "image/webp" }),
    );
    await ctx.db.insert("chatImages", {
      uploaderId: blockedId,
      messageId: blockedMessage.messageId,
      conversationId: group.conversationId,
      storageId,
      fileName: "blocked.webp",
      mimeType: "image/webp",
      byteSize: 1,
      width: 1,
      height: 1,
      status: "attached",
      createdAt: 1,
      updatedAt: 1,
    });
  });
  const page = await asUser(t, blockerId).query(chatApi.listMessages, {
    conversationId: group.conversationId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(page.page).toHaveLength(1);
  expect(page.page[0]).toMatchObject({ collapsed: true });
  expect(page.page[0]).not.toHaveProperty("body");
  const hiddenSearch = await asUser(t, blockerId).query(chatApi.searchConversationPage, {
    conversationId: group.conversationId,
    query: "Skupljena",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(hiddenSearch.page).toHaveLength(1);
  expect(hiddenSearch.page[0]).toMatchObject({
    messageId: blockedMessage.messageId,
    collapsed: true,
  });
  expect(hiddenSearch.page[0]).not.toHaveProperty("body");
  expect(hiddenSearch.page[0]).not.toHaveProperty("senderId");
  expect(hiddenSearch.page[0]).not.toHaveProperty("senderName");
  const visibleSearch = await asUser(t, ownerId).query(chatApi.searchConversationPage, {
    conversationId: group.conversationId,
    query: "Skupljena",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(visibleSearch.page).toMatchObject([{
    messageId: blockedMessage.messageId,
    body: "Skupljena poruka",
    senderId: blockedId,
    collapsed: false,
  }]);
  await expect(asUser(t, blockerId).query(chatApi.listMedia, {
    conversationId: group.conversationId,
    paginationOpts: { cursor: null, numItems: 10 },
  })).resolves.toMatchObject({ page: [] });
});

test("reports preserve snapshots and are the moderator's conversation access boundary", async () => {
  const t = createTest();
  const [senderId, reporterId, moderatorId, outsiderId] = await seedUsers(t, 4, {
    2: { role: "moderator" },
  });
  const direct = await acceptedDirect(t, senderId, reporterId);
  const sent = await sendText(t, senderId, direct.conversationId, "Original za prijavu", "report-message");
  const reportId = await asUser(t, reporterId).mutation(chatApi.report, {
    targetType: "message",
    targetMessageId: sent.messageId,
    reason: "Uznemiravajući sadržaj",
  });
  await t.run((ctx) => ctx.db.patch(sent.messageId, { body: "Naknadno promenjeno" }));
  const stored = await t.run((ctx) => ctx.db.get(reportId as Id<"chatReports">));
  expect(stored?.snapshotJson).toContain("Original za prijavu");
  expect(stored?.snapshotJson).not.toContain("Naknadno promenjeno");
  await expect(
    asUser(t, moderatorId).query(chatApi.getReportedConversation, {
      reportId,
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).resolves.toMatchObject({ conversation: { _id: direct.conversationId } });
  await expect(
    asUser(t, outsiderId).query(chatApi.getReportedConversation, {
      reportId,
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).rejects.toThrow("Staff access required");
  await asUser(t, moderatorId).mutation(chatApi.moderate, {
    reportId,
    kind: "warn",
    reason: "Formalno upozorenje zbog prijavljenog sadržaja",
  });
  const sanctionNotifications = await t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_userId_and_kind_and_createdAt", (q) =>
        q.eq("userId", senderId).eq("kind", "chat_sanction"),
      )
      .collect(),
  );
  expect(sanctionNotifications).toHaveLength(1);
});

test("admin access is audited and account suspension exposes exactly one appeal", async () => {
  const t = createTest();
  const [adminId, userId, peerId] = await seedUsers(t, 3, {
    0: { role: "admin", email: "chat-admin@example.com" },
  });
  await acceptedDirect(t, userId, peerId);
  await asUser(t, adminId).mutation(chatApi.openAdminUserChats, {
    targetUserId: userId,
    reason: "Provera prijavljenog obrasca ponašanja",
  });
  const notificationsAfterAudit = await t.run((ctx) =>
    ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  );
  expect(notificationsAfterAudit).toHaveLength(0);
  const suspensionId = await asUser(t, adminId).mutation(chatApi.suspendAccount, {
    userId,
    duration: "24h",
    reason: "Ponovljeno uznemiravanje članova",
  });
  await expect(
    asUser(t, userId).mutation(chatApi.createDirect, { recipientId: peerId }),
  ).rejects.toThrow("ACCOUNT_SUSPENDED");
  const suspension = await asUser(t, userId).query(chatApi.getMySuspension, {});
  expect(suspension).toMatchObject({ suspensionId, reason: "Ponovljeno uznemiravanje članova", permanent: false });
  await asUser(t, userId).mutation(chatApi.appeal, {
    suspensionId,
    body: "Molim da ponovo pregledate odluku i kontekst razgovora.",
  });
  await expect(
    asUser(t, userId).mutation(chatApi.appeal, {
      suspensionId,
      body: "Druga žalba ne sme biti dozvoljena.",
    }),
  ).rejects.toThrow("APPEAL_ALREADY_SUBMITTED");
  const audit = await t.run((ctx) => ctx.db.query("chatAccessAudit").collect());
  const notificationsAfterSuspension = await t.run((ctx) =>
    ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  );
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({ adminId, targetUserId: userId });
  expect(notificationsAfterSuspension).toHaveLength(1);
  expect(notificationsAfterSuspension[0]).toMatchObject({ kind: "account_suspension" });
});

test("image action rejects invalid signatures and re-encodes valid image data", async () => {
  const t = createTest();
  const [userId] = await seedUsers(t, 1);
  const validPng = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
    (char) => char.charCodeAt(0),
  );
  const validStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([validPng], { type: "image/png" })),
  );
  const prepared = await asUser(t, userId).action(chatApi.prepareImage, {
    storageId: validStorageId,
    fileName: "avatar.png",
  });
  expect(prepared).toMatchObject({ mimeType: "image/webp", width: 1, height: 1 });
  const storedImage = await t.run((ctx) => ctx.db.get(prepared.imageId));
  expect(storedImage).toMatchObject({ uploaderId: userId, status: "prepared", mimeType: "image/webp" });

  const invalidStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([new TextEncoder().encode("nije slika")], { type: "image/png" })),
  );
  await expect(
    asUser(t, userId).action(chatApi.prepareImage, {
      storageId: invalidStorageId,
      fileName: "lažna.png",
    }),
  ).rejects.toThrow();
  expect(await t.run((ctx) => ctx.storage.get(invalidStorageId))).toBeNull();
});

test("link previews reject local SSRF targets and forged message URLs", async () => {
  const t = createTest();
  const [senderId, recipientId] = await seedUsers(t, 2);
  const direct = await acceptedDirect(t, senderId, recipientId);
  const sent = await sendText(
    t,
    senderId,
    direct.conversationId,
    "Pogledaj http://127.0.0.1/private",
    "ssrf-link",
  );
  await expect(
    asUser(t, senderId).action(chatApi.requestPreview, {
      messageId: sent.messageId,
      url: "http://127.0.0.1/private",
    }),
  ).resolves.toMatchObject({ status: "failed" });
  await expect(
    asUser(t, senderId).action(chatApi.requestPreview, {
      messageId: sent.messageId,
      url: "https://example.com/not-in-message",
    }),
  ).rejects.toThrow("URL_NOT_IN_MESSAGE");
});
