import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

import { requireSyncSecret, requireUserId } from "./helpers";

const subscriptionStatus = v.union(
  v.literal("trialing"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("incomplete"),
  v.literal("incomplete_expired"),
  v.literal("unpaid"),
  v.literal("paused"),
);

const planTier = v.union(v.literal("basic"), v.literal("premium"));

export const getBillingSummary = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return ctx.db
      .query("subscriptions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const syncStripeSubscription = mutationGeneric({
  args: {
    syncSecret: v.string(),
    userId: v.optional(v.id("users")),
    courseId: v.id("courses"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    status: subscriptionStatus,
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    plan: v.optional(planTier),
  },
  handler: async (ctx, args) => {
    requireSyncSecret(args.syncSecret);
    if (!args.userId) {
      throw new Error("Missing userId metadata for subscription sync");
    }

    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_subscription", (q) => q.eq("stripeSubscriptionId", args.stripeSubscriptionId))
      .unique();
    const patch = {
      userId: args.userId,
      courseId: args.courseId,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripePriceId: args.stripePriceId,
      status: args.status,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      updatedAt: Date.now(),
    };

    const subscriptionId = existing
      ? (await ctx.db.patch(existing._id, patch), existing._id)
      : await ctx.db.insert("subscriptions", patch);

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const enrollment = enrollments.find((item) => item.courseId === args.courseId);
    const enrollmentPatch = {
      userId: args.userId,
      courseId: args.courseId,
      status: args.status === "active" || args.status === "trialing" ? "active" : "blocked",
      // Omitted when the webhook does not know the plan, so the stored tier survives.
      ...(args.plan ? { plan: args.plan } : {}),
      updatedAt: Date.now(),
    };

    if (enrollment) {
      await ctx.db.patch(enrollment._id, enrollmentPatch);
    } else {
      await ctx.db.insert("enrollments", { ...enrollmentPatch, startedAt: Date.now() });
    }

    return subscriptionId;
  },
});
