/// <reference types="vite/client" />

import aggregateTest from "@convex-dev/aggregate/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  markStudyHubAggregateReady,
  syncStudyPartnerInviteSummary,
} from "./studyHubSummaryCore";

const modules = import.meta.glob("./**/*.ts");

function createTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "chatInbox");
  aggregateTest.register(t, "studyHub");
  return t;
}

test("password identifiers resolve email, username, and @username server-side", async () => {
  const t = createTest();
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      email: "student@example.com",
      name: "Student",
      username: "čitalac_1",
      role: "student",
      language: "sr",
      searchText: "Student čitalac_1 student@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
  });

  await expect(t.query(internal.authInternal.resolvePasswordIdentifier, { identifier: "STUDENT@EXAMPLE.COM" })).resolves.toBe("student@example.com");
  await expect(t.query(internal.authInternal.resolvePasswordIdentifier, { identifier: "čitalac_1" })).resolves.toBe("student@example.com");
  await expect(t.query(internal.authInternal.resolvePasswordIdentifier, { identifier: "@ČITALAC_1" })).resolves.toBe("student@example.com");
  await expect(t.query(internal.authInternal.resolvePasswordIdentifier, { identifier: "missing_user" })).resolves.toBeNull();
});

test("a verified canonical account can reclaim an unverified password-only legacy duplicate", async () => {
  const t = createTest();
  const ids = await t.run(async (ctx) => {
    const canonicalUserId = await ctx.db.insert("users", {
      email: "linked@example.com",
      appEmailVerificationTime: 10,
      name: "Linked User",
      username: "linked_user",
      role: "student",
      language: "sr",
      searchText: "Linked User linked_user linked@example.com",
      createdAt: 1,
      updatedAt: 10,
    });
    const duplicateUserId = await ctx.db.insert("users", {
      email: "linked@example.com",
    });
    await ctx.db.insert("authAccounts", { userId: canonicalUserId, provider: "google", providerAccountId: "google-linked" });
    await ctx.db.insert("authAccounts", { userId: duplicateUserId, provider: "password", providerAccountId: "linked@example.com", secret: "hashed" });
    await ctx.db.insert("profileStats", { userId: duplicateUserId, completedLessons: 7, updatedAt: 9 });
    const otherUserId = await ctx.db.insert("users", {
      email: "other@example.com", name: "Other", username: "other_user", role: "student", language: "sr", createdAt: 3, updatedAt: 3,
    });
    await ctx.db.insert("userFollows", { followerId: canonicalUserId, followingId: otherUserId, createdAt: 1 });
    await ctx.db.insert("userFollows", { followerId: duplicateUserId, followingId: otherUserId, createdAt: 2 });
    await ctx.db.insert("userFollows", { followerId: otherUserId, followingId: canonicalUserId, createdAt: 3 });
    await ctx.db.insert("userFollows", { followerId: otherUserId, followingId: duplicateUserId, createdAt: 4 });
    await ctx.db.insert("userFollows", { followerId: duplicateUserId, followingId: canonicalUserId, createdAt: 5 });
    await ctx.db.insert("profileActivityDays", { userId: canonicalUserId, dayKey: "2026-07-15", lessons: 1, tasks: 0, threads: 0, comments: 0, updatedAt: 1 });
    await ctx.db.insert("profileActivityDays", { userId: duplicateUserId, dayKey: "2026-07-15", lessons: 2, tasks: 1, threads: 0, comments: 0, updatedAt: 2 });
    await ctx.db.insert("userPresence", { userId: canonicalUserId, lastSeenAt: 10 });
    await ctx.db.insert("userPresence", { userId: duplicateUserId, lastSeenAt: 20 });
    const postId = await ctx.db.insert("communityPosts", {
      authorId: duplicateUserId, language: "sr", title: "Merge", body: "Merge", visibility: "members", status: "published", createdAt: 10, updatedAt: 10,
    });
    await ctx.db.insert("profileContributions", { userId: canonicalUserId, postId, hasComments: true, threadCount: 0, commentCount: 1, lastActivityAt: 11, updatedAt: 11 });
    await ctx.db.insert("profileContributions", { userId: duplicateUserId, postId, hasThread: true, hasComments: true, threadCount: 1, commentCount: 2, lastActivityAt: 12, updatedAt: 12 });
    const topicId = await ctx.db.insert("helpTopics", { name: "Convex", normalizedName: "convex", active: true, createdBy: duplicateUserId, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("userHelpTopics", { userId: canonicalUserId, topicId, mode: "seeking", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("userHelpTopics", { userId: duplicateUserId, topicId, mode: "offering", createdAt: 2, updatedAt: 2 });
    const courseId = await ctx.db.insert("courses", {
      slug: "merge-course", titleSr: "Kurs", titleEn: "Course", subtitleSr: "", subtitleEn: "", descriptionSr: "", descriptionEn: "", status: "published", sortOrder: 1, updatedAt: 1,
    });
    await ctx.db.insert("studyPartnerAvailability", { userId: canonicalUserId, courseId, progressZone: "0_25", progressPercent: 10, active: false, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("studyPartnerAvailability", { userId: duplicateUserId, courseId, progressZone: "51_75", progressPercent: 60, active: true, createdAt: 2, updatedAt: 2 });
    const inviteId = await ctx.db.insert("studyPartnerInvites", {
      pairKey: [String(duplicateUserId), String(otherUserId)].sort().join(":"),
      senderId: duplicateUserId,
      recipientId: otherUserId,
      courseId,
      status: "pending",
      createdAt: 3,
      updatedAt: 3,
    });
    const invite = await ctx.db.get(inviteId);
    if (!invite) throw new Error("Missing study invite fixture");
    await syncStudyPartnerInviteSummary(ctx, null, invite);
    await markStudyHubAggregateReady(ctx);
    return { canonicalUserId, duplicateUserId, otherUserId, postId, topicId, courseId, inviteId };
  });

  const mergeArgs = { canonicalUserId: ids.canonicalUserId, duplicateUserId: ids.duplicateUserId };
  await expect(t.mutation(internal.identityMerge.mergeVerifiedUsers, mergeArgs)).resolves.toMatchObject({ merged: true });
  await expect(t.mutation(internal.identityMerge.mergeVerifiedUsers, mergeArgs)).resolves.toEqual({ merged: false, reason: "already_merged" });

  const state = await t.run(async (ctx) => ({
    duplicate: await ctx.db.get(ids.duplicateUserId),
    password: await ctx.db.query("authAccounts").withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", "linked@example.com")).unique(),
    stats: await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", ids.canonicalUserId)).unique(),
    follows: await ctx.db.query("userFollows").take(20),
    activity: await ctx.db.query("profileActivityDays").withIndex("by_userId_and_dayKey", (q) => q.eq("userId", ids.canonicalUserId)).unique(),
    presence: await ctx.db.query("userPresence").withIndex("by_userId", (q) => q.eq("userId", ids.canonicalUserId)).unique(),
    contribution: await ctx.db.query("profileContributions").withIndex("by_userId_and_postId", (q) => q.eq("userId", ids.canonicalUserId).eq("postId", ids.postId)).unique(),
    help: await ctx.db.query("userHelpTopics").withIndex("by_userId_and_topicId", (q) => q.eq("userId", ids.canonicalUserId).eq("topicId", ids.topicId)).unique(),
    topic: await ctx.db.get(ids.topicId),
    availability: await ctx.db.query("studyPartnerAvailability").withIndex("by_userId_and_courseId", (q) => q.eq("userId", ids.canonicalUserId).eq("courseId", ids.courseId)).unique(),
    studyInvite: await ctx.db.get(ids.inviteId),
  }));
  expect(state.duplicate).toMatchObject({ mergedInto: ids.canonicalUserId });
  expect(state.duplicate?.email).toBeUndefined();
  expect(state.password?.userId).toBe(ids.canonicalUserId);
  expect(state.stats?.completedLessons).toBe(7);
  expect(state.stats).toMatchObject({ contributionCount: 4, followerCount: 1, followingCount: 1 });
  expect(state.follows).toHaveLength(2);
  expect(state.follows).toEqual(expect.arrayContaining([
    expect.objectContaining({ followerId: ids.canonicalUserId, followingId: ids.otherUserId }),
    expect.objectContaining({ followerId: ids.otherUserId, followingId: ids.canonicalUserId }),
  ]));
  expect(state.activity).toMatchObject({ lessons: 3, tasks: 1 });
  expect(state.presence?.lastSeenAt).toBe(20);
  expect(state.contribution).toMatchObject({ threadCount: 1, commentCount: 3, hasThread: true, hasComments: true });
  expect(state.help?.mode).toBe("both");
  expect(state.topic?.createdBy).toBe(ids.canonicalUserId);
  expect(state.availability).toMatchObject({ active: true, progressPercent: 60, progressZone: "51_75" });
  expect(state.studyInvite).toMatchObject({ senderId: ids.canonicalUserId, recipientId: ids.otherUserId, status: "pending" });
  await expect(
    t.withIdentity({ subject: ids.canonicalUserId, tokenIdentifier: `test|${ids.canonicalUserId}` })
      .query(api.study.getStudyHubSummary, {}),
  ).resolves.toMatchObject({ pendingOutgoingPartnerInviteCount: 1 });
  await expect(
    t.withIdentity({ subject: ids.otherUserId, tokenIdentifier: `test|${ids.otherUserId}` })
      .query(api.study.getStudyHubSummary, {}),
  ).resolves.toMatchObject({ pendingPartnerInviteCount: 1 });
});

test("identity merge consolidates parallel direct chats and deduplicates membership", async () => {
  const t = createTest();
  const ids = await t.run(async (ctx) => {
    const canonicalUserId = await ctx.db.insert("users", {
      email: "chat-merge@example.com", appEmailVerificationTime: 1, name: "Canonical", username: "chat_canonical", role: "student", createdAt: 1, updatedAt: 1,
    });
    const duplicateUserId = await ctx.db.insert("users", { email: "chat-merge@example.com" });
    const otherUserId = await ctx.db.insert("users", {
      email: "chat-other@example.com", name: "Other", username: "chat_other", role: "student", createdAt: 2, updatedAt: 2,
    });
    await ctx.db.insert("authAccounts", { userId: canonicalUserId, provider: "google", providerAccountId: "chat-google" });
    await ctx.db.insert("authAccounts", { userId: duplicateUserId, provider: "password", providerAccountId: "chat-merge@example.com", secret: "hashed" });
    const pair = (left: typeof canonicalUserId, right: typeof canonicalUserId) => [String(left), String(right)].sort().join(":");
    const duplicateConversationId = await ctx.db.insert("chatConversations", {
      kind: "direct", directKey: `direct:${pair(duplicateUserId, otherUserId)}`, createdById: duplicateUserId,
      nextSequence: 2, lastMessageSequence: 1, lastMessageAt: 10, lastMessagePreview: "duplicate", createdAt: 1, updatedAt: 10,
    });
    const canonicalConversationId = await ctx.db.insert("chatConversations", {
      kind: "direct", directKey: `direct:${pair(canonicalUserId, otherUserId)}`, createdById: canonicalUserId,
      nextSequence: 2, lastMessageSequence: 1, lastMessageAt: 20, lastMessagePreview: "canonical", createdAt: 2, updatedAt: 20,
    });
    const addMember = (conversationId: typeof canonicalConversationId, userId: typeof canonicalUserId, updatedAt: number) =>
      ctx.db.insert("chatMembers", {
        conversationId, userId, conversationKind: "direct", role: "member", status: "active", requestStatus: "accepted",
        lastReadSequence: 0, lastDeliveredSequence: 1, lastDeliveredAt: updatedAt, unreadCount: 0, hasUnread: false,
        isArchived: false, isPinned: false, historyCutoffSequence: 0, joinedAt: updatedAt, updatedAt,
      });
    await addMember(duplicateConversationId, duplicateUserId, 10);
    await addMember(duplicateConversationId, otherUserId, 10);
    await addMember(canonicalConversationId, canonicalUserId, 20);
    await addMember(canonicalConversationId, otherUserId, 20);
    await ctx.db.insert("chatMessages", {
      conversationId: duplicateConversationId, sequence: 1, senderId: duplicateUserId, senderName: "Duplicate", kind: "user", body: "duplicate", mentionUserIds: [duplicateUserId], imageCount: 0, createdAt: 10,
    });
    await ctx.db.insert("chatMessages", {
      conversationId: canonicalConversationId, sequence: 1, senderId: canonicalUserId, senderName: "Canonical", kind: "user", body: "canonical", mentionUserIds: [], imageCount: 0, createdAt: 20,
    });
    return { canonicalUserId, duplicateUserId, otherUserId, duplicateConversationId, canonicalConversationId };
  });

  await t.mutation(internal.identityMerge.mergeVerifiedUsers, {
    canonicalUserId: ids.canonicalUserId,
    duplicateUserId: ids.duplicateUserId,
  });

  const state = await t.run(async (ctx) => {
    const directKey = `direct:${[String(ids.canonicalUserId), String(ids.otherUserId)].sort().join(":")}`;
    const conversations = await ctx.db.query("chatConversations").withIndex("by_directKey", (q) => q.eq("directKey", directKey)).take(10);
    const conversation = conversations[0];
    return {
      conversations,
      allConversations: await ctx.db.query("chatConversations").take(10),
      members: conversation
        ? await ctx.db.query("chatMembers").withIndex("by_conversationId_and_status_and_joinedAt", (q) => q.eq("conversationId", conversation._id)).take(10)
        : [],
      messages: conversation
        ? await ctx.db.query("chatMessages").withIndex("by_conversationId_and_sequence", (q) => q.eq("conversationId", conversation._id)).take(10)
        : [],
    };
  });
  expect(state.conversations).toHaveLength(1);
  expect(state.allConversations).toHaveLength(1);
  expect(state.members).toHaveLength(2);
  expect(state.members.map((row) => row.userId)).toEqual(expect.arrayContaining([ids.canonicalUserId, ids.otherUserId]));
  expect(state.members.some((row) => row.userId === ids.duplicateUserId)).toBe(false);
  expect(state.messages).toHaveLength(2);
  expect(state.messages.map((row) => row.sequence)).toEqual([1, 2]);
  expect(state.messages.every((row) => row.senderId !== ids.duplicateUserId)).toBe(true);
});

test("admin dry-run chooses complete profile before older incomplete duplicate", async () => {
  const t = createTest();
  const ids = await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", { email: "admin@example.com", emailVerificationTime: 1, name: "Admin", username: "admin_user", role: "admin", language: "sr", searchText: "Admin", createdAt: 1, updatedAt: 1 });
    const olderUserId = await ctx.db.insert("users", { email: "choice@example.com", emailVerificationTime: 1 });
    const completeUserId = await ctx.db.insert("users", { email: "choice@example.com", emailVerificationTime: 2, name: "Complete", username: "complete_user", role: "student", language: "sr", searchText: "Complete", createdAt: 2, updatedAt: 2 });
    await ctx.db.insert("authAccounts", { userId: olderUserId, provider: "password", providerAccountId: "choice@example.com" });
    await ctx.db.insert("authAccounts", { userId: completeUserId, provider: "google", providerAccountId: "google-choice" });
    return { adminUserId, completeUserId };
  });
  const asAdmin = t.withIdentity({ subject: ids.adminUserId, tokenIdentifier: `test|${ids.adminUserId}` });
  const preview = await asAdmin.query(api.identityMerge.previewVerifiedDuplicateAccounts, {});
  expect(preview.groups).toHaveLength(1);
  expect(preview.groups[0].canonicalUserId).toBe(ids.completeUserId);
});
