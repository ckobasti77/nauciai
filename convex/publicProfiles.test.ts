/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { belgradeDayKey } from "./leaderboardCore";
import { adjustProfileActivity, adjustProfileContribution } from "./profileActivityCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedMembers(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const viewerId = await ctx.db.insert("users", {
      email: "viewer@example.com",
      name: "Viewer Member",
      firstName: "Viewer",
      lastName: "Member",
      username: "viewer_member",
      role: "student",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    });
    const targetId = await ctx.db.insert("users", {
      email: "private@example.com",
      name: "Jovan Milojević",
      firstName: "Jovan",
      lastName: "Milojević",
      username: "jovan_m",
      bio: "Gradim AI projekte.",
      websiteUrl: "https://example.com/",
      role: "pro_student",
      language: "sr",
      createdAt: 2,
      updatedAt: 2,
    });
    return { viewerId, targetId };
  });
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

test("public profile is auth protected, whitelisted, and reads aggregate projections", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedMembers(t);
  const dayKey = belgradeDayKey(Date.now());
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.targetId, { helpStatus: "both" });
    await ctx.db.insert("profileStats", {
      userId: ids.targetId,
      completedLessons: 4,
      contributionCount: 17,
      followerCount: 23,
      followingCount: 9,
      role: "pro_student",
      updatedAt: 10,
    });
    await ctx.db.insert("profileActivityDays", {
      userId: ids.targetId,
      dayKey,
      lessons: 1,
      tasks: 2,
      threads: 3,
      comments: 4,
      updatedAt: 10,
    });
    for (let index = 0; index < 6; index += 1) {
      const topicId = await ctx.db.insert("helpTopics", {
        name: `Tema ${index + 1}`,
        normalizedName: `tema ${index + 1}`,
        active: index < 5,
        createdBy: ids.targetId,
        createdAt: index + 1,
        updatedAt: index + 1,
      });
      await ctx.db.insert("userHelpTopics", {
        userId: ids.targetId,
        topicId,
        mode: index % 2 ? "seeking" : "offering",
        createdAt: index + 1,
        updatedAt: index + 1,
      });
    }
  });

  await expect(t.query(api.publicProfiles.getPublicProfile, { username: "jovan_m" })).rejects.toThrow();
  const profile = await asUser(t, ids.viewerId).query(api.publicProfiles.getPublicProfile, { username: "jovan_m" });
  expect(profile?.identity).toMatchObject({ name: "Jovan Milojević", username: "jovan_m", role: "pro_student" });
  expect(profile?.stats).toEqual({ contributions: 17, followers: 23, following: 9 });
  expect(profile?.activity.days).toContainEqual({ dayKey, lessons: 1, tasks: 2, threads: 3, comments: 4, total: 10 });
  expect(profile?.help.status).toBe("both");
  expect(profile?.help.topics).toHaveLength(5);
  expect(profile?.help.topics.every((topic) => topic.name !== "Tema 6")).toBe(true);
  expect(profile?.viewer).toMatchObject({
    isOwner: false,
    isFollowing: false,
    isFollowedBy: false,
    isMutual: false,
    canFollow: true,
    canMessage: true,
  });
  expect(profile?.identity).not.toHaveProperty("email");
  expect(profile).not.toHaveProperty("authProviders");
  expect(JSON.stringify(profile)).not.toContain("private@example.com");
});

test("follow toggle blocks self and Admin edges, preserves one row, and reports mutual state", async () => {
  const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com";
  try {
  const t = convexTest(schema, modules);
  const ids = await seedMembers(t);
  const adminId = await t.run((ctx) => ctx.db.insert("users", {
    email: "admin@example.com",
    name: "Admin",
    username: "admin_user",
    role: "admin",
    language: "sr",
    createdAt: 3,
    updatedAt: 3,
  }));
  const viewer = asUser(t, ids.viewerId);
  const target = asUser(t, ids.targetId);
  const admin = asUser(t, adminId);

  await expect(viewer.mutation(api.publicProfiles.toggleFollow, { userId: ids.viewerId })).rejects.toThrow("pratiti sebe");
  await expect(viewer.mutation(api.publicProfiles.toggleFollow, { userId: adminId })).rejects.toThrow("Admin profili");
  await expect(admin.mutation(api.publicProfiles.toggleFollow, { userId: ids.targetId })).rejects.toThrow("Admin profili");
  expect(await viewer.mutation(api.publicProfiles.toggleFollow, { userId: ids.targetId })).toEqual({ following: true, isMutual: false });
  expect(await target.mutation(api.publicProfiles.toggleFollow, { userId: ids.viewerId })).toEqual({ following: true, isMutual: true });

  const state = await t.run(async (ctx) => ({
    follows: await ctx.db
      .query("userFollows")
      .withIndex("by_followerId_and_followingId", (q) =>
        q.eq("followerId", ids.viewerId).eq("followingId", ids.targetId),
      )
      .take(2),
    notifications: await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_eventKey", (q) =>
        q.eq("userId", ids.targetId).eq("eventKey", `new_follower:${ids.viewerId}`),
      )
      .take(2),
  }));
  expect(state.follows).toHaveLength(1);
  expect(state.notifications).toHaveLength(1);
  expect(state.notifications[0]).toMatchObject({ kind: "new_follower" });

  const profile = await viewer.query(api.publicProfiles.getPublicProfile, { username: "jovan_m" });
  expect(profile?.viewer).toMatchObject({ isFollowing: true, isFollowedBy: true, isMutual: true });
  } finally {
    if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
    else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
  }
});

test("profile message permission honors target dmPrivacy without leaking block state", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedMembers(t);
  await t.run((ctx) => ctx.db.patch(ids.targetId, { dmPrivacy: "following" }));
  const viewer = asUser(t, ids.viewerId);
  const target = asUser(t, ids.targetId);

  expect((await viewer.query(api.publicProfiles.getPublicProfile, { username: "jovan_m" }))?.viewer.canMessage).toBe(false);
  await target.mutation(api.publicProfiles.toggleFollow, { userId: ids.viewerId });
  expect((await viewer.query(api.publicProfiles.getPublicProfile, { username: "jovan_m" }))?.viewer.canMessage).toBe(true);

  await t.run((ctx) => ctx.db.patch(ids.targetId, { dmPrivacy: "nobody" }));
  expect((await viewer.query(api.publicProfiles.getPublicProfile, { username: "jovan_m" }))?.viewer.canMessage).toBe(false);
});

test("full lists are viewer-owned, staff access is explicit, and owner receives bounded previews", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedMembers(t);
  const moderatorId = await t.run((ctx) => ctx.db.insert("users", {
    email: "moderator@example.com",
    name: "Moderator",
    username: "moderator_user",
    role: "moderator",
    language: "sr",
    createdAt: 3,
    updatedAt: 3,
  }));
  await asUser(t, ids.viewerId).mutation(api.publicProfiles.toggleFollow, { userId: ids.targetId });

  const targetFollowers = await asUser(t, ids.targetId).query(api.publicProfiles.listViewerConnectionsPage, {
    kind: "followers",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(targetFollowers.page).toHaveLength(1);
  expect(targetFollowers.page[0]).toMatchObject({ username: "viewer_member" });

  await expect(asUser(t, ids.viewerId).query(api.publicProfiles.listProfileConnectionsForStaff, {
    userId: ids.targetId,
    kind: "followers",
    paginationOpts: { cursor: null, numItems: 10 },
  })).rejects.toThrow("Forbidden");
  const staffPage = await asUser(t, moderatorId).query(api.publicProfiles.listProfileConnectionsForStaff, {
    userId: ids.targetId,
    kind: "followers",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(staffPage.page).toHaveLength(1);

  const ownerProfile = await asUser(t, ids.targetId).query(api.publicProfiles.getPublicProfile, { username: "jovan_m" });
  expect(ownerProfile?.connections.followersPreview).toHaveLength(1);
  const visitorProfile = await asUser(t, ids.viewerId).query(api.publicProfiles.getPublicProfile, { username: "jovan_m" });
  expect(visitorProfile?.connections.followersPreview).toEqual([]);
});

test("visitor common people are deduplicated, typed, and capped at six", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedMembers(t);
  await t.run(async (ctx) => {
    for (let index = 0; index < 7; index += 1) {
      const commonId = await ctx.db.insert("users", {
        email: `common-${index}@example.com`,
        name: `Common ${index}`,
        username: `common_${index}`,
        role: "student",
        language: "sr",
        createdAt: 10 + index,
        updatedAt: 10 + index,
      });
      await ctx.db.insert("userFollows", { followerId: ids.viewerId, followingId: commonId, createdAt: 20 + index });
      await ctx.db.insert("userFollows", { followerId: ids.targetId, followingId: commonId, createdAt: 30 + index });
      await ctx.db.insert("userFollows", { followerId: commonId, followingId: ids.viewerId, createdAt: 40 + index });
      await ctx.db.insert("userFollows", { followerId: commonId, followingId: ids.targetId, createdAt: 50 + index });
    }
  });

  const profile = await asUser(t, ids.viewerId).query(api.publicProfiles.getPublicProfile, { username: "jovan_m" });
  expect(profile?.connections.commonPeople).toHaveLength(6);
  expect(new Set(profile?.connections.commonPeople.map((person) => person.userId)).size).toBe(6);
  expect(profile?.connections.commonPeople.every((person) =>
    person.connectionKinds.includes("followed_by_both") && person.connectionKinds.includes("follows_both"),
  )).toBe(true);
});

test("contribution pages use Convex cursors and indexed thread/comment filters", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedMembers(t);
  await t.run(async (ctx) => {
    for (let index = 0; index < 3; index += 1) {
      const postId = await ctx.db.insert("communityPosts", {
        authorId: ids.targetId,
        language: "sr",
        title: `Post ${index}`,
        body: "Doprinos",
        visibility: "members",
        status: "published",
        createdAt: 100 + index,
        updatedAt: 100 + index,
      });
      await ctx.db.insert("profileContributions", {
        userId: ids.targetId,
        postId,
        hasThread: index !== 1,
        hasComments: index === 1,
        threadCount: index === 1 ? 0 : 1,
        commentCount: index === 1 ? 1 : 0,
        lastActivityAt: 100 + index,
        updatedAt: 100 + index,
      });
    }
  });
  const viewer = asUser(t, ids.viewerId);
  const first = await viewer.query(api.publicProfiles.listProfileContributionsPage, {
    username: "jovan_m",
    filter: "threads",
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(first.page).toHaveLength(1);
  expect(first.isDone).toBe(false);
  const second = await viewer.query(api.publicProfiles.listProfileContributionsPage, {
    username: "jovan_m",
    filter: "threads",
    paginationOpts: { cursor: first.continueCursor, numItems: 1 },
  });
  expect(second.page).toHaveLength(1);
  expect(second.page[0].post.id).not.toBe(first.page[0].post.id);

  const comments = await viewer.query(api.publicProfiles.listProfileContributionsPage, {
    username: "jovan_m",
    filter: "comments",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(comments.page).toHaveLength(1);
  expect(comments.page[0].hasThread).toBe(false);
});

test("aggregate deltas apply only the realizable change and never go negative", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedMembers(t);
  const timestamp = Date.parse("2026-07-16T10:00:00Z");
  const postId = await t.run((ctx) => ctx.db.insert("communityPosts", {
    authorId: ids.targetId,
    language: "sr",
    title: "Test",
    body: "Doprinos",
    visibility: "members",
    status: "published",
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  await t.run(async (ctx) => {
    expect(await adjustProfileActivity(ctx, { userId: ids.targetId, timestamp, kind: "threads", delta: -1 })).toBe(0);
    expect(await adjustProfileContribution(ctx, { userId: ids.targetId, postId, threadDelta: -1, lastActivityAt: timestamp })).toBe(0);
    await adjustProfileActivity(ctx, { userId: ids.targetId, timestamp, kind: "threads", delta: 1 });
    await adjustProfileContribution(ctx, { userId: ids.targetId, postId, threadDelta: 1, lastActivityAt: timestamp });
    await adjustProfileActivity(ctx, { userId: ids.targetId, timestamp, kind: "threads", delta: -2 });
    await adjustProfileContribution(ctx, { userId: ids.targetId, postId, threadDelta: -2, lastActivityAt: timestamp });
  });
  const rows = await t.run(async (ctx) => ({
    activity: await ctx.db
      .query("profileActivityDays")
      .withIndex("by_userId_and_dayKey", (q) => q.eq("userId", ids.targetId).eq("dayKey", "2026-07-16"))
      .unique(),
    contribution: await ctx.db
      .query("profileContributions")
      .withIndex("by_userId_and_postId", (q) => q.eq("userId", ids.targetId).eq("postId", postId))
      .unique(),
    stats: await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", ids.targetId)).unique(),
  }));
  expect(rows.activity?.threads).toBe(0);
  expect(rows.contribution).toBeNull();
  expect(rows.stats?.contributionCount).toBe(0);
});

test("profile editor rejects non-http public links and bio longer than 280 characters", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedMembers(t);
  const viewer = asUser(t, ids.viewerId);
  await expect(viewer.mutation(api.profiles.updateViewerProfile, {
    firstName: "Viewer",
    lastName: "Member",
    websiteUrl: "javascript:alert(1)",
  })).rejects.toThrow("http:// ili https://");
  await expect(viewer.mutation(api.profiles.updateViewerProfile, {
    firstName: "Viewer",
    lastName: "Member",
    bio: "x".repeat(281),
  })).rejects.toThrow("280");
});
