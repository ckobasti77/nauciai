/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterAll, beforeAll, expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { promoteDirectRequestsAfterFollow } from "./chatCore";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

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
  search: makeFunctionReference<"query">("chat:searchMessages"),
  edit: makeFunctionReference<"mutation">("chat:editMessage"),
  deleteForEveryone: makeFunctionReference<"mutation">("chat:deleteMessageForEveryone"),
  markRead: makeFunctionReference<"mutation">("chat:markRead"),
  toggleReaction: makeFunctionReference<"mutation">("chat:toggleReaction"),
  updateMemberState: makeFunctionReference<"mutation">("chat:updateMemberState"),
  createGroup: makeFunctionReference<"mutation">("chat:createGroup"),
  respondGroup: makeFunctionReference<"mutation">("chat:respondGroupInvite"),
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

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `chat-test|${userId}` });
}

async function seedUsers(
  t: ReturnType<typeof convexTest>,
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
  t: ReturnType<typeof convexTest>,
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
  t: ReturnType<typeof convexTest>,
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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

test("read state, reactions, mute and edit/delete windows stay per member and message", async () => {
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
});

test("block archives direct chat and collapses blocked sender in a shared group", async () => {
  const t = convexTest(schema, modules);
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
  await sendText(t, blockedId, group.conversationId, "Skupljena poruka", "blocked-group");
  const page = await asUser(t, blockerId).query(chatApi.listMessages, {
    conversationId: group.conversationId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(page.page).toHaveLength(1);
  expect(page.page[0]).toMatchObject({ collapsed: true });
  expect(page.page[0]).not.toHaveProperty("body");
});

test("reports preserve snapshots and are the moderator's conversation access boundary", async () => {
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
  const t = convexTest(schema, modules);
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
