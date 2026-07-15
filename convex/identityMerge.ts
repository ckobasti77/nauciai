import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const ROW_LIMIT = 1000;

function normalizeEmail(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

async function requireExistingAdmin(ctx: Pick<QueryCtx, "auth" | "db">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthorized");
  const user = await ctx.db.get(userId);
  if (user?.role !== "admin") throw new Error("Admin access required");
  return userId;
}

export const findPasswordDuplicate = internalQuery({
  args: { canonicalUserId: v.id("users") },
  handler: async (ctx, args) => {
    const canonical = await ctx.db.get(args.canonicalUserId);
    const email = normalizeEmail(canonical?.email);
    if (!canonical || !email) return null;
    const users = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).take(10);
    for (const user of users) {
      if (user._id === args.canonicalUserId || user.mergedInto) continue;
      const accounts = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id).eq("provider", "password"))
        .take(1);
      if (accounts.length) return user._id;
    }
    return null;
  },
});

export const mergePasswordDuplicateForUser = internalAction({
  args: { canonicalUserId: v.id("users") },
  handler: async (ctx, args): Promise<{
    merged: boolean;
    reason?: string;
    canonicalUserId?: Id<"users">;
    duplicateUserId?: Id<"users">;
    movedProviders?: string[];
  }> => {
    const duplicateUserId: Id<"users"> | null = await ctx.runQuery(
      internal.identityMerge.findPasswordDuplicate,
      args,
    );
    if (!duplicateUserId) return { merged: false as const };
    return await ctx.runMutation(internal.identityMerge.mergeVerifiedUsers, {
      canonicalUserId: args.canonicalUserId,
      duplicateUserId,
    });
  },
});

async function mergeVerifiedUsersInMutation(
  ctx: MutationCtx,
  args: { canonicalUserId: Id<"users">; duplicateUserId: Id<"users"> },
) {
    if (args.canonicalUserId === args.duplicateUserId) {
      return { merged: false as const, reason: "same_user" as const };
    }

    const [canonicalUser, duplicateUser] = await Promise.all([
      ctx.db.get(args.canonicalUserId),
      ctx.db.get(args.duplicateUserId),
    ]);
    if (!canonicalUser || !duplicateUser) {
      throw new Error("Account merge could not find both users.");
    }
    if (duplicateUser.mergedInto === args.canonicalUserId) {
      return { merged: false as const, reason: "already_merged" as const };
    }

    const canonicalEmail = normalizeEmail(canonicalUser.email);
    const duplicateEmail = normalizeEmail(duplicateUser.email);
    if (!canonicalEmail || canonicalEmail !== duplicateEmail) {
      throw new Error("Accounts can only be merged when their normalized emails match.");
    }
    const canonicalAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.canonicalUserId))
      .take(20);
    const duplicateAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.duplicateUserId))
      .take(20);
    const canonicalHasPassword = canonicalAccounts.some((account) => account.provider === "password");
    const canonicalHasGoogle = canonicalAccounts.some((account) => account.provider === "google");
    const duplicateHasPassword = duplicateAccounts.some((account) => account.provider === "password");
    const duplicateHasGoogle = duplicateAccounts.some((account) => account.provider === "google");
    const canonicalVerified = Boolean(
      canonicalUser.appEmailVerificationTime ||
      canonicalUser.passwordEmailVerificationTime ||
      ((canonicalHasPassword || canonicalHasGoogle) && canonicalUser.emailVerificationTime) ||
      canonicalAccounts.some((account) => account.emailVerified),
    );
    if (!canonicalVerified) {
      throw new Error("Verify the account email before linking sign-in methods.");
    }
    const duplicateVerified = Boolean(
      duplicateUser.appEmailVerificationTime ||
      duplicateUser.passwordEmailVerificationTime ||
      ((duplicateHasPassword || duplicateHasGoogle) && duplicateUser.emailVerificationTime) ||
      duplicateAccounts.some((account) => account.emailVerified),
    );
    const duplicateIsPasswordOnly = duplicateHasPassword && !duplicateHasGoogle && duplicateAccounts.every((account) => account.provider === "password");
    if (!duplicateVerified && !duplicateIsPasswordOnly) {
      throw new Error("Both account emails must be verified before linking sign-in methods.");
    }

    const preferredProfile = [canonicalUser, duplicateUser].sort((a, b) => {
      const usernameDifference = Number(Boolean(b.username)) - Number(Boolean(a.username));
      return usernameDifference || (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime);
    })[0];

    const duplicateProfileStats = await ctx.db
      .query("profileStats")
      .withIndex("by_userId", (q) => q.eq("userId", args.duplicateUserId))
      .take(20);
    const canonicalProfileStats = await ctx.db
      .query("profileStats")
      .withIndex("by_userId", (q) => q.eq("userId", args.canonicalUserId))
      .take(20);
    if (duplicateProfileStats.length) {
      const completedLessons = Math.max(
        ...duplicateProfileStats.map((row) => row.completedLessons),
        ...canonicalProfileStats.map((row) => row.completedLessons),
      );
      if (canonicalProfileStats[0]) {
        await ctx.db.patch(canonicalProfileStats[0]._id, { completedLessons, updatedAt: Date.now() });
      } else {
        await ctx.db.insert("profileStats", { userId: args.canonicalUserId, completedLessons, updatedAt: Date.now() });
      }
      for (const row of [...duplicateProfileStats, ...canonicalProfileStats.slice(1)]) await ctx.db.delete(row._id);
    }

    for (const row of await ctx.db.query("aiConversations").withIndex("by_user_lesson", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("aiMessages").withIndex("by_user_lesson", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("labOutputs").withIndex("by_user_lesson", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }

    for (const row of await ctx.db.query("taskProgress").withIndex("by_user_task", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      const existing = await ctx.db.query("taskProgress").withIndex("by_user_task", (q) => q.eq("userId", args.canonicalUserId).eq("taskId", row.taskId)).unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          completed: existing.completed || row.completed,
          evidenceOutputId: existing.evidenceOutputId ?? row.evidenceOutputId,
          completedAt: Math.max(existing.completedAt ?? 0, row.completedAt ?? 0) || undefined,
          updatedAt: Math.max(existing.updatedAt, row.updatedAt),
        });
        await ctx.db.delete(row._id);
      } else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("lessonStepProgress").withIndex("by_user_step", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      const existing = await ctx.db.query("lessonStepProgress").withIndex("by_user_step", (q) => q.eq("userId", args.canonicalUserId).eq("stepId", row.stepId)).unique();
      if (existing) {
        await ctx.db.patch(existing._id, { completed: existing.completed || row.completed, updatedAt: Math.max(existing.updatedAt, row.updatedAt) });
        await ctx.db.delete(row._id);
      } else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }

    for (const row of await ctx.db.query("subscriptions").withIndex("by_user_course", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("enrollments").withIndex("by_user", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      const existing = await ctx.db.query("enrollments").withIndex("by_user_course", (q) => q.eq("userId", args.canonicalUserId).eq("courseId", row.courseId)).unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          status: existing.status === "active" || row.status === "active" ? "active" : "blocked",
          startedAt: Math.min(existing.startedAt, row.startedAt),
          updatedAt: Math.max(existing.updatedAt, row.updatedAt),
        });
        await ctx.db.delete(row._id);
      } else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("courseFavorites").withIndex("by_user", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      const existing = await ctx.db.query("courseFavorites").withIndex("by_user_course", (q) => q.eq("userId", args.canonicalUserId).eq("courseId", row.courseId)).unique();
      if (existing) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("progress").withIndex("by_user_lesson", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      const existing = await ctx.db.query("progress").withIndex("by_user_lesson", (q) => q.eq("userId", args.canonicalUserId).eq("lessonId", row.lessonId)).unique();
      if (existing) {
        const newer = row.updatedAt > existing.updatedAt ? row : existing;
        await ctx.db.patch(existing._id, {
          completed: existing.completed || row.completed,
          positionSeconds: newer.positionSeconds,
          updatedAt: Math.max(existing.updatedAt, row.updatedAt),
        });
        await ctx.db.delete(row._id);
      } else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }

    for (const row of await ctx.db.query("communityPosts").withIndex("by_author", (q) => q.eq("authorId", args.duplicateUserId)).take(ROW_LIMIT)) {
      await ctx.db.patch(row._id, { authorId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("comments").withIndex("by_authorId_and_createdAt", (q) => q.eq("authorId", args.duplicateUserId)).take(ROW_LIMIT)) {
      await ctx.db.patch(row._id, { authorId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("reactions").withIndex("by_user_target", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      const existing = await ctx.db.query("reactions").withIndex("by_user_target", (q) => q.eq("userId", args.canonicalUserId).eq("targetType", row.targetType).eq("targetId", row.targetId)).unique();
      if (existing) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("postFavorites").withIndex("by_user", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      const existing = await ctx.db.query("postFavorites").withIndex("by_user_post", (q) => q.eq("userId", args.canonicalUserId).eq("postId", row.postId)).unique();
      if (existing) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("communityModerationEvents").withIndex("by_moderatorId_and_createdAt", (q) => q.eq("moderatorId", args.duplicateUserId)).take(ROW_LIMIT)) {
      await ctx.db.patch(row._id, { moderatorId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("leaderboardEvents").withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      const existing = await ctx.db.query("leaderboardEvents").withIndex("by_userId_and_sourceType_and_sourceId", (q) => q.eq("userId", args.canonicalUserId).eq("sourceType", row.sourceType).eq("sourceId", row.sourceId)).unique();
      if (existing) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await ctx.db.query("leaderboardStats").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      const existing = await ctx.db.query("leaderboardStats").withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) => q.eq("userId", args.canonicalUserId).eq("scopeKey", row.scopeKey).eq("period", row.period).eq("periodKey", row.periodKey)).unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          xp: Math.max(existing.xp, row.xp),
          completedLessons: Math.max(existing.completedLessons, row.completedLessons),
          completedTasks: Math.max(existing.completedTasks, row.completedTasks),
          helpfulAnswers: Math.max(existing.helpfulAnswers, row.helpfulAnswers),
          eligible: existing.eligible || row.eligible,
          updatedAt: Math.max(existing.updatedAt, row.updatedAt),
        });
        await ctx.db.delete(row._id);
      } else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }

    for (const token of await ctx.db.query("emailVerificationTokens").withIndex("by_userId_and_createdAt", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT)) {
      await ctx.db.patch(token._id, { userId: args.canonicalUserId });
    }
    for (const account of duplicateAccounts) await ctx.db.patch(account._id, { userId: args.canonicalUserId });

    const duplicateSessions = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", args.duplicateUserId)).take(ROW_LIMIT);
    for (const session of duplicateSessions) {
      for (const refreshToken of await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session._id)).take(ROW_LIMIT)) {
        await ctx.db.delete(refreshToken._id);
      }
      await ctx.db.delete(session._id);
    }

    const verificationTime = Math.max(
      canonicalUser.appEmailVerificationTime ?? 0,
      canonicalUser.passwordEmailVerificationTime ?? 0,
      duplicateUser.appEmailVerificationTime ?? 0,
      duplicateUser.passwordEmailVerificationTime ?? 0,
    ) || undefined;
    await ctx.db.patch(args.canonicalUserId, {
      email: canonicalEmail,
      name: preferredProfile.name ?? canonicalUser.name,
      firstName: preferredProfile.firstName ?? canonicalUser.firstName,
      lastName: preferredProfile.lastName ?? canonicalUser.lastName,
      username: preferredProfile.username ?? canonicalUser.username,
      avatarUrl: preferredProfile.avatarUrl ?? canonicalUser.avatarUrl,
      avatarStorageId: preferredProfile.avatarStorageId ?? canonicalUser.avatarStorageId,
      avatarPreset: preferredProfile.avatarPreset ?? canonicalUser.avatarPreset,
      role: preferredProfile.role ?? canonicalUser.role,
      language: preferredProfile.language ?? canonicalUser.language,
      searchText: `${preferredProfile.name ?? canonicalUser.name ?? ""} ${preferredProfile.username ?? canonicalUser.username ?? ""} ${canonicalEmail}`.trim(),
      createdAt: Math.min(canonicalUser.createdAt ?? canonicalUser._creationTime, duplicateUser.createdAt ?? duplicateUser._creationTime),
      updatedAt: Date.now(),
      appEmailVerificationTime: verificationTime,
      passwordEmailVerificationTime: verificationTime,
      emailVerificationTime: canonicalUser.emailVerificationTime ?? duplicateUser.emailVerificationTime,
    });
    await ctx.db.patch(args.duplicateUserId, {
      email: undefined,
      name: undefined,
      firstName: undefined,
      lastName: undefined,
      username: undefined,
      avatarUrl: undefined,
      avatarStorageId: undefined,
      avatarPreset: undefined,
      role: undefined,
      language: undefined,
      searchText: undefined,
      mergedInto: args.canonicalUserId,
      appEmailVerificationTime: undefined,
      passwordEmailVerificationTime: undefined,
    });

    return {
      merged: true as const,
      canonicalUserId: args.canonicalUserId,
      duplicateUserId: args.duplicateUserId,
      movedProviders: duplicateAccounts.map((account) => account.provider),
    };
}

export const mergeVerifiedUsers = internalMutation({
  args: {
    canonicalUserId: v.id("users"),
    duplicateUserId: v.id("users"),
  },
  handler: mergeVerifiedUsersInMutation,
});

export const previewVerifiedDuplicateAccounts = query({
  args: {},
  handler: async (ctx) => {
    await requireExistingAdmin(ctx);
    const users = await ctx.db.query("users").withIndex("email").take(2000);
    const byEmail = new Map<string, typeof users>();
    for (const user of users) {
      if (user.mergedInto) continue;
      const email = normalizeEmail(user.email);
      if (!email) continue;
      byEmail.set(email, [...(byEmail.get(email) ?? []), user]);
    }

    const groups = [];
    for (const [email, candidates] of byEmail) {
      if (candidates.length < 2) continue;
      const scored = await Promise.all(candidates.map(async (user) => {
        const [enrollment, subscription, accounts] = await Promise.all([
          ctx.db.query("enrollments").withIndex("by_user", (q) => q.eq("userId", user._id)).first(),
          ctx.db.query("subscriptions").withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "active")).first(),
          ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", user._id)).take(10),
        ]);
        const verified = Boolean(
          user.appEmailVerificationTime ||
          user.passwordEmailVerificationTime ||
          (user.emailVerificationTime && accounts.some((account) => account.provider === "password" || account.provider === "google")),
        );
        return {
          userId: user._id,
          createdAt: user._creationTime,
          hasCompleteProfile: Boolean(user.username),
          hasAccessData: Boolean(enrollment || subscription),
          providers: accounts.map((account) => account.provider),
          verified,
        };
      }));
      if (!scored.every((candidate) => candidate.verified)) continue;
      scored.sort((a, b) =>
        Number(b.hasCompleteProfile) - Number(a.hasCompleteProfile) ||
        Number(b.hasAccessData) - Number(a.hasAccessData) ||
        a.createdAt - b.createdAt,
      );
      groups.push({ email, canonicalUserId: scored[0].userId, candidates: scored });
    }
    return { scannedUsers: users.length, groups };
  },
});

export const mergeVerifiedDuplicateAccount = mutation({
  args: {
    canonicalUserId: v.id("users"),
    duplicateUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireExistingAdmin(ctx);
    return await mergeVerifiedUsersInMutation(ctx, args);
  },
});
