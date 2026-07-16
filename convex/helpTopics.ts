import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getCurrentProfile, requireAdmin, requireUserId } from "./helpers";

const helpModeValidator = v.union(v.literal("seeking"), v.literal("offering"), v.literal("both"));
const MAX_ACTIVE_TOPICS = 5;
const MAX_TOPIC_NAME_LENGTH = 80;

function cleanTopicName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Naziv teme je obavezan.");
  if (name.length > MAX_TOPIC_NAME_LENGTH) {
    throw new Error(`Naziv teme može imati najviše ${MAX_TOPIC_NAME_LENGTH} znakova.`);
  }
  return name;
}

function normalizeTopicName(value: string) {
  return cleanTopicName(value).normalize("NFKC").toLocaleLowerCase("sr-Latn-RS");
}

function sameScope(left: Id<"courses"> | undefined, right: Id<"courses"> | undefined) {
  return left === right;
}

async function requirePublishedCourse(ctx: QueryCtx, courseId: Id<"courses">) {
  const course = await ctx.db.get(courseId);
  if (!course || course.status !== "published") throw new Error("Objavljeni kurs nije pronađen.");
  return course;
}

async function activeTopicsForScope(ctx: QueryCtx, courseId: Id<"courses"> | undefined) {
  return ctx.db
    .query("helpTopics")
    .withIndex("by_courseId_and_normalizedName", (q) => q.eq("courseId", courseId))
    .filter((q) => q.eq(q.field("active"), true))
    .take(100);
}

export const listActiveTopics = query({
  args: { courseId: v.optional(v.id("courses")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    if (args.courseId) await requirePublishedCourse(ctx, args.courseId);
    const [globalTopics, courseTopics] = await Promise.all([
      activeTopicsForScope(ctx, undefined),
      args.courseId ? activeTopicsForScope(ctx, args.courseId) : Promise.resolve([]),
    ]);
    return [...globalTopics, ...courseTopics].map((topic) => ({
      topicId: topic._id,
      name: topic.name,
      courseId: topic.courseId,
    }));
  },
});

export const getViewerHelpProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user || user.mergedInto) throw new Error("Unauthorized");
    const rows = await ctx.db
      .query("userHelpTopics")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_ACTIVE_TOPICS + 1);
    const topics = [];
    for (const row of rows) {
      const topic = await ctx.db.get(row.topicId);
      if (topic?.active) {
        topics.push({ topicId: topic._id, name: topic.name, courseId: topic.courseId, mode: row.mode });
        if (topics.length === MAX_ACTIVE_TOPICS) break;
      }
    }
    return { status: user.helpStatus ?? null, topics };
  },
});

export const setViewerHelpProfile = mutation({
  args: {
    status: v.union(helpModeValidator, v.null()),
    topics: v.array(v.object({ topicId: v.id("helpTopics"), mode: helpModeValidator })),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.topics.length > MAX_ACTIVE_TOPICS) {
      throw new Error(`Možeš izabrati najviše ${MAX_ACTIVE_TOPICS} aktivnih tema.`);
    }
    if (!args.status && args.topics.length > 0) {
      throw new Error("Izaberi status pomoći pre dodavanja tema.");
    }
    const uniqueTopicIds = new Set(args.topics.map((item) => String(item.topicId)));
    if (uniqueTopicIds.size !== args.topics.length) throw new Error("Tema ne može biti izabrana više puta.");

    for (const item of args.topics) {
      const topic = await ctx.db.get(item.topicId);
      if (!topic?.active) throw new Error("Tema nije javno dostupna.");
      if (topic.courseId) await requirePublishedCourse(ctx, topic.courseId);
    }

    const existing = await ctx.db
      .query("userHelpTopics")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .take(MAX_ACTIVE_TOPICS + 1);
    const byTopicId = new Map(existing.map((row) => [String(row.topicId), row]));
    const now = Date.now();
    for (const row of existing) {
      if (!uniqueTopicIds.has(String(row.topicId))) await ctx.db.delete(row._id);
    }
    for (const item of args.topics) {
      const row = byTopicId.get(String(item.topicId));
      if (row) await ctx.db.patch(row._id, { mode: item.mode, updatedAt: now });
      else await ctx.db.insert("userHelpTopics", { userId, topicId: item.topicId, mode: item.mode, createdAt: now, updatedAt: now });
    }
    await ctx.db.patch(userId, { helpStatus: args.status ?? undefined, updatedAt: now });
    return { status: args.status, topicCount: args.topics.length };
  },
});

export const proposeTopic = mutation({
  args: { name: v.string(), courseId: v.optional(v.id("courses")) },
  handler: async (ctx, args) => {
    const proposerId = await requireUserId(ctx);
    if (args.courseId) await requirePublishedCourse(ctx, args.courseId);
    const name = cleanTopicName(args.name);
    const normalizedName = normalizeTopicName(name);
    const existingTopic = await ctx.db
      .query("helpTopics")
      .withIndex("by_normalizedName_and_courseId", (q) =>
        q.eq("normalizedName", normalizedName).eq("courseId", args.courseId),
      )
      .unique();
    if (existingTopic?.active) return { status: "existing" as const, topicId: existingTopic._id };

    const pending = await ctx.db
      .query("helpTopicSuggestions")
      .withIndex("by_normalizedName_and_courseId_and_status", (q) =>
        q.eq("normalizedName", normalizedName).eq("courseId", args.courseId).eq("status", "pending"),
      )
      .take(20);
    const viewerPending = pending.find((suggestion) => suggestion.proposerId === proposerId);
    if (viewerPending) return { status: "pending" as const, suggestionId: viewerPending._id };

    const now = Date.now();
    const suggestionId = await ctx.db.insert("helpTopicSuggestions", {
      proposerId,
      name,
      normalizedName,
      courseId: args.courseId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return { status: "pending" as const, suggestionId };
  },
});

export const listViewerSuggestions = query({
  args: {},
  handler: async (ctx) => {
    const proposerId = await requireUserId(ctx);
    const statuses = ["pending", "approved", "merged", "rejected"] as const;
    const rows = [];
    for (const status of statuses) {
      rows.push(
        ...(await ctx.db
          .query("helpTopicSuggestions")
          .withIndex("by_proposerId_and_status_and_createdAt", (q) =>
            q.eq("proposerId", proposerId).eq("status", status),
          )
          .order("desc")
          .take(25)),
      );
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  },
});

export const listPendingSuggestions = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const current = await getCurrentProfile(ctx);
    if (current.profile.role !== "admin") throw new Error("Forbidden");
    return ctx.db
      .query("helpTopicSuggestions")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .order("asc")
      .paginate(args.paginationOpts);
  },
});

export const reviewSuggestion = mutation({
  args: {
    suggestionId: v.id("helpTopicSuggestions"),
    decision: v.union(v.literal("approve"), v.literal("reject"), v.literal("merge")),
    topicId: v.optional(v.id("helpTopics")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion || suggestion.status !== "pending") throw new Error("Predlog nije na čekanju.");
    const now = Date.now();

    if (args.decision === "reject") {
      await ctx.db.patch(suggestion._id, {
        status: "rejected",
        reviewedBy: admin.userId as Id<"users">,
        reviewReason: args.reason?.trim() || undefined,
        updatedAt: now,
      });
      return { status: "rejected" as const, topicId: null };
    }

    if (args.decision === "merge") {
      if (!args.topicId) throw new Error("Tema za spajanje je obavezna.");
      const topic = await ctx.db.get(args.topicId);
      if (!topic?.active || !sameScope(topic.courseId, suggestion.courseId)) {
        throw new Error("Predlog se može spojiti samo sa aktivnom temom iz istog opsega.");
      }
      await ctx.db.patch(suggestion._id, {
        status: "merged",
        resolvedTopicId: topic._id,
        reviewedBy: admin.userId as Id<"users">,
        reviewReason: args.reason?.trim() || undefined,
        updatedAt: now,
      });
      return { status: "merged" as const, topicId: topic._id };
    }

    const duplicate = await ctx.db
      .query("helpTopics")
      .withIndex("by_normalizedName_and_courseId", (q) =>
        q.eq("normalizedName", suggestion.normalizedName).eq("courseId", suggestion.courseId),
      )
      .unique();
    if (duplicate?.active) throw new Error("Tema već postoji; spoji predlog sa postojećom temom.");
    const topicId = duplicate
      ? (await ctx.db.patch(duplicate._id, { name: suggestion.name, active: true, updatedAt: now }), duplicate._id)
      : await ctx.db.insert("helpTopics", {
          name: suggestion.name,
          normalizedName: suggestion.normalizedName,
          courseId: suggestion.courseId,
          active: true,
          createdBy: suggestion.proposerId,
          createdAt: now,
          updatedAt: now,
        });
    await ctx.db.patch(suggestion._id, {
      status: "approved",
      resolvedTopicId: topicId,
      reviewedBy: admin.userId as Id<"users">,
      reviewReason: args.reason?.trim() || undefined,
      updatedAt: now,
    });
    return { status: "approved" as const, topicId };
  },
});
