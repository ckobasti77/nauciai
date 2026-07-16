/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import { belgradeDayKey, belgradeWeekKey } from "./leaderboardCore";
import { adjustProfileActivity, adjustProfileContribution, transitionPublishedPostContributions } from "./profileActivityCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedContributionThread(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const authorId = await ctx.db.insert("users", {
      email: "author@example.com",
      name: "Author",
      username: "thread_author",
      role: "student",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    });
    const commenterId = await ctx.db.insert("users", {
      email: "commenter@example.com",
      name: "Commenter",
      username: "thread_commenter",
      role: "student",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    });
    const postId = await ctx.db.insert("communityPosts", {
      authorId,
      language: "sr",
      title: "Thread",
      body: "Body",
      visibility: "members",
      status: "published",
      createdAt: Date.parse("2026-07-10T10:00:00Z"),
      updatedAt: Date.parse("2026-07-10T10:00:00Z"),
    });
    const olderCommentId = await ctx.db.insert("comments", {
      postId,
      authorId: commenterId,
      body: "Older",
      createdAt: Date.parse("2026-07-11T10:00:00Z"),
    });
    const latestCommentId = await ctx.db.insert("comments", {
      postId,
      authorId: commenterId,
      body: "Latest",
      createdAt: Date.parse("2026-07-12T10:00:00Z"),
    });
    const authorCommentId = await ctx.db.insert("comments", {
      postId,
      authorId,
      body: "Author reply",
      createdAt: Date.parse("2026-07-13T10:00:00Z"),
    });
    return { authorId, commenterId, postId, olderCommentId, latestCommentId, authorCommentId };
  });
}

test("publish and unpublish rebuild every commentator contribution and activity day", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedContributionThread(t);
  await t.run((ctx) => transitionPublishedPostContributions(ctx, { postId: ids.postId, published: true }));

  const published = await t.run(async (ctx) => ({
    author: await ctx.db
      .query("profileContributions")
      .withIndex("by_userId_and_postId", (q) => q.eq("userId", ids.authorId).eq("postId", ids.postId))
      .unique(),
    commenter: await ctx.db
      .query("profileContributions")
      .withIndex("by_userId_and_postId", (q) => q.eq("userId", ids.commenterId).eq("postId", ids.postId))
      .unique(),
    authorStats: await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", ids.authorId)).unique(),
    commenterStats: await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", ids.commenterId)).unique(),
  }));
  expect(published.author).toMatchObject({ threadCount: 1, commentCount: 1, hasThread: true, hasComments: true });
  expect(published.commenter).toMatchObject({ threadCount: 0, commentCount: 2, hasThread: false, hasComments: true });
  expect(published.authorStats?.contributionCount).toBe(2);
  expect(published.commenterStats?.contributionCount).toBe(2);

  await t.run((ctx) => transitionPublishedPostContributions(ctx, { postId: ids.postId, published: false }));
  const unpublished = await t.run(async (ctx) => ({
    rows: await ctx.db.query("profileContributions").withIndex("by_postId", (q) => q.eq("postId", ids.postId)).take(10),
    authorStats: await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", ids.authorId)).unique(),
    commenterStats: await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", ids.commenterId)).unique(),
  }));
  expect(unpublished.rows).toEqual([]);
  expect(unpublished.authorStats?.contributionCount).toBe(0);
  expect(unpublished.commenterStats?.contributionCount).toBe(0);
});

test("deleting the latest comment restores the previous contribution activity timestamp", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedContributionThread(t);
  await t.run((ctx) => transitionPublishedPostContributions(ctx, { postId: ids.postId, published: true }));
  await t.run(async (ctx) => {
    const latest = await ctx.db.get(ids.latestCommentId);
    if (!latest) throw new Error("missing test comment");
    await ctx.db.delete(latest._id);
    await adjustProfileActivity(ctx, {
      userId: latest.authorId,
      timestamp: latest.createdAt,
      kind: "comments",
      delta: -1,
    });
    await adjustProfileContribution(ctx, {
      userId: latest.authorId,
      postId: latest.postId,
      commentDelta: -1,
      lastActivityAt: 0,
      recomputeLastActivity: true,
    });
  });
  const row = await t.run((ctx) => ctx.db
    .query("profileContributions")
    .withIndex("by_userId_and_postId", (q) => q.eq("userId", ids.commenterId).eq("postId", ids.postId))
    .unique());
  expect(row).toMatchObject({
    commentCount: 1,
    lastActivityAt: Date.parse("2026-07-11T10:00:00Z"),
  });
});

test("lesson and required-task reactivation restore the leaderboard event day in the heatmap", async () => {
  const t = convexTest(schema, modules);
  const occurredAt = Date.parse("2026-01-05T10:00:00Z");
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "learner@example.com",
      name: "Learner",
      username: "learner_user",
      appEmailVerificationTime: 1,
      role: "student",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    });
    const courseId = await ctx.db.insert("courses", {
      slug: "activity-course",
      titleSr: "Kurs",
      titleEn: "Course",
      subtitleSr: "Podnaslov",
      subtitleEn: "Subtitle",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: "published",
      sortOrder: 1,
      updatedAt: 1,
    });
    const lessonId = await ctx.db.insert("lessons", {
      courseId,
      slug: "activity-lesson",
      titleSr: "Lekcija",
      titleEn: "Lesson",
      summarySr: "Sažetak",
      summaryEn: "Summary",
      durationSeconds: 60,
      isPublished: true,
      proEnabled: true,
      lightEnabled: true,
      sortOrder: 1,
      updatedAt: 1,
    });
    const stepId = await ctx.db.insert("lessonSteps", {
      courseId,
      lessonId,
      slug: "activity-step",
      titleSr: "Korak",
      titleEn: "Step",
      bodySr: "Telo",
      bodyEn: "Body",
      outputKind: "text",
      isPublished: true,
      sortOrder: 1,
      updatedAt: 1,
    });
    const taskId = await ctx.db.insert("lessonTasks", {
      courseId,
      lessonId,
      stepId,
      promptSr: "Zadatak",
      promptEn: "Task",
      required: true,
      completionMode: "manual",
      isPublished: true,
      sortOrder: 1,
      updatedAt: 1,
    });
    const dayKey = belgradeDayKey(occurredAt);
    const weekKey = belgradeWeekKey(occurredAt);
    await ctx.db.insert("leaderboardEvents", {
      userId,
      sourceType: "lesson",
      sourceId: String(lessonId),
      points: 100,
      active: false,
      occurredAt,
      dayKey,
      weekKey,
      courseId,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
    await ctx.db.insert("leaderboardEvents", {
      userId,
      sourceType: "required_task",
      sourceId: String(taskId),
      points: 20,
      active: false,
      occurredAt,
      dayKey,
      weekKey,
      courseId,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
    return { userId, lessonId, taskId, dayKey };
  });

  const learner = t.withIdentity({ subject: ids.userId, tokenIdentifier: `test|${ids.userId}` });
  await learner.mutation(api.courses.markProgress, { lessonId: ids.lessonId, completed: true, positionSeconds: 0 });
  await learner.mutation(api.lab.markTaskProgress, { taskId: ids.taskId, completed: true });

  const activity = await t.run((ctx) => ctx.db
    .query("profileActivityDays")
    .withIndex("by_userId_and_dayKey", (q) => q.eq("userId", ids.userId).eq("dayKey", ids.dayKey))
    .unique());
  expect(activity).toMatchObject({ lessons: 1, tasks: 1 });
});
