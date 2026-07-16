import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { effectiveRoleForProfile } from "./helpers";

const ROW_LIMIT = 1000;

function requireBoundedRows<T>(rows: T[], label: string) {
  if (rows.length > ROW_LIMIT) {
    throw new Error(`${label} exceeds the synchronous merge limit; run a resumable batch merge.`);
  }
  return rows;
}

function normalizeEmail(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

async function boundedQuery<T>(rows: Promise<T[]>, label: string) {
  return requireBoundedRows(await rows, label);
}

async function boundedQueryRows<T>(query: { take: (limit: number) => Promise<T[]> }, label: string) {
  return boundedQuery(query.take(ROW_LIMIT + 1), label);
}

function mergedUserId(
  userId: Id<"users">,
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
) {
  return userId === duplicateUserId ? canonicalUserId : userId;
}

function userPairKey(userAId: Id<"users">, userBId: Id<"users">) {
  return [String(userAId), String(userBId)].sort().join(":");
}

function combinedHelpMode(
  left: "seeking" | "offering" | "both",
  right: "seeking" | "offering" | "both",
) {
  return left === right ? left : "both" as const;
}

const chatMemberStatusRank = { active: 4, invited: 3, left: 2, removed: 1 } as const;
const chatRequestStatusRank = { accepted: 4, pending: 3, none: 2, declined: 1 } as const;

function maxOptional(values: Array<number | undefined>) {
  return Math.max(0, ...values.map((value) => value ?? 0)) || undefined;
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

async function mergePresenceRows(
  ctx: MutationCtx,
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
) {
  const rows = requireBoundedRows([
    ...await ctx.db.query("userPresence").withIndex("by_userId", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("userPresence").withIndex("by_userId", (q) => q.eq("userId", duplicateUserId)).take(ROW_LIMIT + 1),
  ], "presence rows");
  if (!rows.length) return;
  const winner = rows.find((row) => row.userId === canonicalUserId) ?? rows[0];
  await ctx.db.patch(winner._id, {
    userId: canonicalUserId,
    lastSeenAt: Math.max(...rows.map((row) => row.lastSeenAt)),
  });
  for (const row of rows) if (row._id !== winner._id) await ctx.db.delete(row._id);
}

async function mergeActivityRows(
  ctx: MutationCtx,
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
) {
  const rows = requireBoundedRows([
    ...await ctx.db
      .query("profileActivityDays")
      .withIndex("by_userId_and_dayKey", (q) => q.eq("userId", canonicalUserId))
      .take(ROW_LIMIT + 1),
    ...await ctx.db
      .query("profileActivityDays")
      .withIndex("by_userId_and_dayKey", (q) => q.eq("userId", duplicateUserId))
      .take(ROW_LIMIT + 1),
  ], "profile activity rows");
  const byDay = new Map<string, typeof rows>();
  for (const row of rows) byDay.set(row.dayKey, [...(byDay.get(row.dayKey) ?? []), row]);
  for (const [dayKey, dayRows] of byDay) {
    const winner = dayRows.find((row) => row.userId === canonicalUserId) ?? dayRows[0];
    await ctx.db.patch(winner._id, {
      userId: canonicalUserId,
      dayKey,
      lessons: dayRows.reduce((sum, row) => sum + Math.max(0, row.lessons), 0),
      tasks: dayRows.reduce((sum, row) => sum + Math.max(0, row.tasks), 0),
      threads: dayRows.reduce((sum, row) => sum + Math.max(0, row.threads), 0),
      comments: dayRows.reduce((sum, row) => sum + Math.max(0, row.comments), 0),
      updatedAt: Math.max(...dayRows.map((row) => row.updatedAt)),
    });
    for (const row of dayRows) if (row._id !== winner._id) await ctx.db.delete(row._id);
  }
}

async function mergeContributionRows(
  ctx: MutationCtx,
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
) {
  const rows = requireBoundedRows([
    ...await ctx.db
      .query("profileContributions")
      .withIndex("by_userId_and_lastActivityAt", (q) => q.eq("userId", canonicalUserId))
      .take(ROW_LIMIT + 1),
    ...await ctx.db
      .query("profileContributions")
      .withIndex("by_userId_and_lastActivityAt", (q) => q.eq("userId", duplicateUserId))
      .take(ROW_LIMIT + 1),
  ], "profile contribution rows");
  const byPost = new Map<Id<"communityPosts">, typeof rows>();
  for (const row of rows) byPost.set(row.postId, [...(byPost.get(row.postId) ?? []), row]);
  for (const [postId, postRows] of byPost) {
    const winner = postRows.find((row) => row.userId === canonicalUserId) ?? postRows[0];
    const post = await ctx.db.get(postId);
    const threadCount = Math.max(...postRows.map((row) => Math.max(0, row.threadCount)));
    const commentCount = postRows.reduce((sum, row) => sum + Math.max(0, row.commentCount), 0);
    if (!threadCount && !commentCount) {
      for (const row of postRows) await ctx.db.delete(row._id);
      continue;
    }
    await ctx.db.patch(winner._id, {
      userId: canonicalUserId,
      courseId: post?.courseId ?? postRows.find((row) => row.courseId)?.courseId,
      hasThread: threadCount > 0,
      hasComments: commentCount > 0,
      threadCount,
      commentCount,
      lastActivityAt: Math.max(...postRows.map((row) => row.lastActivityAt)),
      updatedAt: Math.max(...postRows.map((row) => row.updatedAt)),
    });
    for (const row of postRows) if (row._id !== winner._id) await ctx.db.delete(row._id);
  }
}

async function adjustProfileStatCounter(
  ctx: MutationCtx,
  userId: Id<"users">,
  field: "followerCount" | "followingCount",
  delta: number,
) {
  if (!delta) return;
  const rows = await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", userId)).take(2);
  const row = rows[0];
  const next = Math.max(0, (row?.[field] ?? 0) + delta);
  if (row) await ctx.db.patch(row._id, { [field]: next, updatedAt: Date.now() });
  else {
    const user = await ctx.db.get(userId);
    await ctx.db.insert("profileStats", {
      userId,
      completedLessons: 0,
      [field]: next,
      role: user ? effectiveRoleForProfile(String(user.email ?? ""), user.role) : undefined,
      updatedAt: Date.now(),
    });
  }
}

async function mergeFollowRows(
  ctx: MutationCtx,
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
  canonicalRole: ReturnType<typeof effectiveRoleForProfile>,
) {
  const ids = [canonicalUserId, duplicateUserId] as const;
  const edgeMap = new Map<Id<"userFollows">, Doc<"userFollows">>();
  for (const userId of ids) {
    const [outgoing, incoming] = await Promise.all([
      boundedQuery(
        ctx.db.query("userFollows").withIndex("by_followerId_and_createdAt", (q) => q.eq("followerId", userId)).take(ROW_LIMIT + 1),
        "outgoing follow rows",
      ),
      boundedQuery(
        ctx.db.query("userFollows").withIndex("by_followingId_and_createdAt", (q) => q.eq("followingId", userId)).take(ROW_LIMIT + 1),
        "incoming follow rows",
      ),
    ]);
    for (const edge of [...outgoing, ...incoming]) edgeMap.set(edge._id, edge);
  }

  const beforeFollowerCounts = new Map<Id<"users">, number>();
  const afterFollowerCounts = new Map<Id<"users">, number>();
  const beforeFollowingCounts = new Map<Id<"users">, number>();
  const afterFollowingCounts = new Map<Id<"users">, number>();
  const mergeSet = new Set<Id<"users">>(ids);
  const increment = (map: Map<Id<"users">, number>, userId: Id<"users">) =>
    map.set(userId, (map.get(userId) ?? 0) + 1);
  const roleCache = new Map<Id<"users">, ReturnType<typeof effectiveRoleForProfile> | null>();
  const roleForId = async (userId: Id<"users">) => {
    if (userId === canonicalUserId) return canonicalRole;
    if (roleCache.has(userId)) return roleCache.get(userId) ?? null;
    const user = await ctx.db.get(userId);
    const role = user && !user.mergedInto
      ? effectiveRoleForProfile(String(user.email ?? ""), user.role)
      : null;
    roleCache.set(userId, role);
    return role;
  };

  for (const edge of edgeMap.values()) {
    if (mergeSet.has(edge.followerId) && !mergeSet.has(edge.followingId)) {
      increment(beforeFollowerCounts, edge.followingId);
    }
    if (mergeSet.has(edge.followingId) && !mergeSet.has(edge.followerId)) {
      increment(beforeFollowingCounts, edge.followerId);
    }
  }

  const seenPairs = new Set<string>();
  let canonicalFollowerCount = 0;
  let canonicalFollowingCount = 0;
  const edges = [...edgeMap.values()].sort((a, b) => a.createdAt - b.createdAt);
  for (const edge of edges) {
    const followerId = mergedUserId(edge.followerId, canonicalUserId, duplicateUserId);
    const followingId = mergedUserId(edge.followingId, canonicalUserId, duplicateUserId);
    const pair = `${followerId}:${followingId}`;
    const valid = followerId !== followingId
      && await roleForId(followerId) !== "admin"
      && await roleForId(followingId) !== "admin";
    if (!valid || seenPairs.has(pair)) {
      await ctx.db.delete(edge._id);
      continue;
    }
    seenPairs.add(pair);
    if (edge.followerId !== followerId || edge.followingId !== followingId) {
      await ctx.db.patch(edge._id, { followerId, followingId });
    }
    if (followerId === canonicalUserId) increment(afterFollowerCounts, followingId);
    if (followingId === canonicalUserId) increment(afterFollowingCounts, followerId);
    if (followerId === canonicalUserId) canonicalFollowingCount += 1;
    if (followingId === canonicalUserId) canonicalFollowerCount += 1;
  }

  const affected = new Set([
    ...beforeFollowerCounts.keys(),
    ...afterFollowerCounts.keys(),
    ...beforeFollowingCounts.keys(),
    ...afterFollowingCounts.keys(),
  ]);
  for (const userId of affected) {
    await adjustProfileStatCounter(
      ctx,
      userId,
      "followerCount",
      (afterFollowerCounts.get(userId) ?? 0) - (beforeFollowerCounts.get(userId) ?? 0),
    );
    await adjustProfileStatCounter(
      ctx,
      userId,
      "followingCount",
      (afterFollowingCounts.get(userId) ?? 0) - (beforeFollowingCounts.get(userId) ?? 0),
    );
  }
  return { followerCount: canonicalFollowerCount, followingCount: canonicalFollowingCount };
}

async function mergeHelpRows(
  ctx: MutationCtx,
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
) {
  const rows = requireBoundedRows([
    ...await ctx.db.query("userHelpTopics").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("userHelpTopics").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", duplicateUserId)).take(ROW_LIMIT + 1),
  ], "user help topic rows");
  const byTopic = new Map<Id<"helpTopics">, Doc<"userHelpTopics">[]>();
  for (const row of rows) byTopic.set(row.topicId, [...(byTopic.get(row.topicId) ?? []), row]);
  for (const topicRows of byTopic.values()) {
    const winner = topicRows.find((row) => row.userId === canonicalUserId) ?? topicRows[0];
    const mode = topicRows.reduce((combined, row) => combinedHelpMode(combined, row.mode), winner.mode);
    await ctx.db.patch(winner._id, {
      userId: canonicalUserId,
      mode,
      createdAt: Math.min(...topicRows.map((row) => row.createdAt)),
      updatedAt: Math.max(...topicRows.map((row) => row.updatedAt)),
    });
    for (const row of topicRows) if (row._id !== winner._id) await ctx.db.delete(row._id);
  }

  const suggestions = await boundedQuery(
    ctx.db
      .query("helpTopicSuggestions")
      .withIndex("by_proposerId_and_status_and_createdAt", (q) => q.eq("proposerId", duplicateUserId))
      .take(ROW_LIMIT + 1),
    "help topic suggestions",
  );
  for (const suggestion of suggestions) await ctx.db.patch(suggestion._id, { proposerId: canonicalUserId });

  const topics = await boundedQuery(ctx.db.query("helpTopics").take(ROW_LIMIT + 1), "help topics");
  for (const topic of topics) {
    if (topic.createdBy === duplicateUserId) await ctx.db.patch(topic._id, { createdBy: canonicalUserId });
  }
}

async function mergeStudyRows(
  ctx: MutationCtx,
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
) {
  const ids = [canonicalUserId, duplicateUserId] as const;
  const availability = requireBoundedRows([
    ...await ctx.db.query("studyPartnerAvailability").withIndex("by_userId_and_courseId", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("studyPartnerAvailability").withIndex("by_userId_and_courseId", (q) => q.eq("userId", duplicateUserId)).take(ROW_LIMIT + 1),
  ], "study availability rows");
  const availabilityByCourse = new Map<Id<"courses">, Doc<"studyPartnerAvailability">[]>();
  for (const row of availability) {
    availabilityByCourse.set(row.courseId, [...(availabilityByCourse.get(row.courseId) ?? []), row]);
  }
  for (const rows of availabilityByCourse.values()) {
    const winner = rows.find((row) => row.userId === canonicalUserId) ?? rows[0];
    const newest = [...rows].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    await ctx.db.patch(winner._id, {
      userId: canonicalUserId,
      progressZone: newest.progressZone,
      progressPercent: newest.progressPercent,
      active: rows.some((row) => row.active),
      createdAt: Math.min(...rows.map((row) => row.createdAt)),
      updatedAt: Math.max(...rows.map((row) => row.updatedAt)),
    });
    for (const row of rows) if (row._id !== winner._id) await ctx.db.delete(row._id);
  }

  const inviteMap = new Map<Id<"studyPartnerInvites">, Doc<"studyPartnerInvites">>();
  for (const userId of ids) {
    const [sent, received] = await Promise.all([
      boundedQuery(
        ctx.db.query("studyPartnerInvites").withIndex("by_senderId_and_status_and_createdAt", (q) => q.eq("senderId", userId)).take(ROW_LIMIT + 1),
        "sent study invites",
      ),
      boundedQuery(
        ctx.db.query("studyPartnerInvites").withIndex("by_recipientId_and_status_and_createdAt", (q) => q.eq("recipientId", userId)).take(ROW_LIMIT + 1),
        "received study invites",
      ),
    ]);
    for (const row of [...sent, ...received]) inviteMap.set(row._id, row);
  }
  const pendingByPairCourse = new Map<string, Doc<"studyPartnerInvites">[]>();
  for (const invite of inviteMap.values()) {
    const senderId = mergedUserId(invite.senderId, canonicalUserId, duplicateUserId);
    const recipientId = mergedUserId(invite.recipientId, canonicalUserId, duplicateUserId);
    if (senderId === recipientId) {
      await ctx.db.delete(invite._id);
      continue;
    }
    const pairKey = userPairKey(senderId, recipientId);
    if (invite.status === "pending") {
      const key = `${pairKey}:${invite.courseId}`;
      pendingByPairCourse.set(key, [...(pendingByPairCourse.get(key) ?? []), invite]);
    } else {
      await ctx.db.patch(invite._id, { senderId, recipientId, pairKey });
    }
  }
  for (const rows of pendingByPairCourse.values()) {
    const sorted = [...rows].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
    const winner = sorted[0];
    const senderId = mergedUserId(winner.senderId, canonicalUserId, duplicateUserId);
    const recipientId = mergedUserId(winner.recipientId, canonicalUserId, duplicateUserId);
    await ctx.db.patch(winner._id, { senderId, recipientId, pairKey: userPairKey(senderId, recipientId) });
    for (const row of sorted.slice(1)) await ctx.db.delete(row._id);
  }

  const partnershipMap = new Map<Id<"studyPartnerships">, Doc<"studyPartnerships">>();
  for (const userId of ids) {
    const [asA, asB] = await Promise.all([
      boundedQuery(
        ctx.db.query("studyPartnerships").withIndex("by_userAId_and_courseId_and_createdAt", (q) => q.eq("userAId", userId)).take(ROW_LIMIT + 1),
        "study partnerships as A",
      ),
      boundedQuery(
        ctx.db.query("studyPartnerships").withIndex("by_userBId_and_courseId_and_createdAt", (q) => q.eq("userBId", userId)).take(ROW_LIMIT + 1),
        "study partnerships as B",
      ),
    ]);
    for (const row of [...asA, ...asB]) partnershipMap.set(row._id, row);
  }
  const partnershipsByPairCourse = new Map<string, Doc<"studyPartnerships">[]>();
  for (const row of partnershipMap.values()) {
    const mappedA = mergedUserId(row.userAId, canonicalUserId, duplicateUserId);
    const mappedB = mergedUserId(row.userBId, canonicalUserId, duplicateUserId);
    if (mappedA === mappedB) {
      await ctx.db.delete(row._id);
      continue;
    }
    const [userAId, userBId] = [mappedA, mappedB].sort((a, b) => String(a).localeCompare(String(b)));
    const pairKey = userPairKey(userAId, userBId);
    const key = `${pairKey}:${row.courseId}`;
    partnershipsByPairCourse.set(key, [...(partnershipsByPairCourse.get(key) ?? []), row]);
  }
  for (const rows of partnershipsByPairCourse.values()) {
    const winner = [...rows].sort((a, b) => a.createdAt - b.createdAt)[0];
    const mappedA = mergedUserId(winner.userAId, canonicalUserId, duplicateUserId);
    const mappedB = mergedUserId(winner.userBId, canonicalUserId, duplicateUserId);
    const [userAId, userBId] = [mappedA, mappedB].sort((a, b) => String(a).localeCompare(String(b)));
    await ctx.db.patch(winner._id, {
      pairKey: userPairKey(userAId, userBId),
      userAId,
      userBId,
      directConversationId: rows.find((row) => row.directConversationId)?.directConversationId,
      createdAt: Math.min(...rows.map((row) => row.createdAt)),
      updatedAt: Math.max(...rows.map((row) => row.updatedAt)),
    });
    for (const row of rows) if (row._id !== winner._id) await ctx.db.delete(row._id);
  }

  const creatorGroups = await boundedQuery(
    ctx.db.query("studyGroups").withIndex("by_creatorId_and_createdAt", (q) => q.eq("creatorId", duplicateUserId)).take(ROW_LIMIT + 1),
    "created study groups",
  );
  for (const group of creatorGroups) await ctx.db.patch(group._id, { creatorId: canonicalUserId });

  const memberRows = requireBoundedRows([
    ...await ctx.db.query("studyGroupMembers").withIndex("by_userId_and_courseId_and_active_and_joinedAt", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("studyGroupMembers").withIndex("by_userId_and_courseId_and_active_and_joinedAt", (q) => q.eq("userId", duplicateUserId)).take(ROW_LIMIT + 1),
  ], "study group member rows");
  const membersByGroup = new Map<Id<"studyGroups">, Doc<"studyGroupMembers">[]>();
  for (const row of memberRows) membersByGroup.set(row.groupId, [...(membersByGroup.get(row.groupId) ?? []), row]);
  const affectedGroupIds = new Set<Id<"studyGroups">>(creatorGroups.map((group) => group._id));
  for (const [groupId, rows] of membersByGroup) {
    affectedGroupIds.add(groupId);
    const group = await ctx.db.get(groupId);
    const winner = rows.find((row) => row.userId === canonicalUserId) ?? rows[0];
    const active = rows.some((row) => row.active);
    await ctx.db.patch(winner._id, {
      userId: canonicalUserId,
      role: rows.some((row) => row.role === "owner") || group?.creatorId === canonicalUserId ? "owner" : "member",
      active,
      joinedAt: Math.min(...rows.map((row) => row.joinedAt)),
      leftAt: active ? undefined : Math.max(...rows.map((row) => row.leftAt ?? 0)) || undefined,
    });
    for (const row of rows) if (row._id !== winner._id) await ctx.db.delete(row._id);
  }

  const allGroupInvites = await boundedQuery(ctx.db.query("studyGroupInvites").take(ROW_LIMIT + 1), "study group invites");
  const relevantGroupInvites = allGroupInvites.filter((row) =>
    ids.includes(row.userId as typeof ids[number]) || ids.includes(row.invitedBy as typeof ids[number]),
  );
  const invitesByGroupUser = new Map<string, Doc<"studyGroupInvites">[]>();
  for (const invite of relevantGroupInvites) {
    const userId = mergedUserId(invite.userId, canonicalUserId, duplicateUserId);
    const invitedBy = mergedUserId(invite.invitedBy, canonicalUserId, duplicateUserId);
    affectedGroupIds.add(invite.groupId);
    if (userId === invitedBy) {
      await ctx.db.delete(invite._id);
      continue;
    }
    const activeMember = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", invite.groupId).eq("userId", userId))
      .unique();
    if (activeMember?.active) {
      await ctx.db.delete(invite._id);
      continue;
    }
    await ctx.db.patch(invite._id, { userId, invitedBy });
    const key = `${invite.groupId}:${userId}`;
    invitesByGroupUser.set(key, [...(invitesByGroupUser.get(key) ?? []), invite]);
  }
  const inviteRank = { accepted: 4, pending: 3, declined: 2, cancelled: 1 } as const;
  for (const rows of invitesByGroupUser.values()) {
    const winner = [...rows].sort((a, b) => inviteRank[b.status] - inviteRank[a.status] || b.createdAt - a.createdAt)[0];
    for (const row of rows) if (row._id !== winner._id) await ctx.db.delete(row._id);
  }

  for (const groupId of affectedGroupIds) {
    const group = await ctx.db.get(groupId);
    if (!group) continue;
    if (group.creatorId === canonicalUserId) {
      const owner = await ctx.db
        .query("studyGroupMembers")
        .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", groupId).eq("userId", canonicalUserId))
        .unique();
      if (owner) await ctx.db.patch(owner._id, { role: "owner", active: true, leftAt: undefined });
      else {
        await ctx.db.insert("studyGroupMembers", {
          groupId,
          userId: canonicalUserId,
          courseId: group.courseId,
          role: "owner",
          active: true,
          joinedAt: group.createdAt,
        });
      }
    }
    const activeMembers = await boundedQuery(
      ctx.db
        .query("studyGroupMembers")
        .withIndex("by_groupId_and_active_and_joinedAt", (q) => q.eq("groupId", groupId).eq("active", true))
        .take(ROW_LIMIT + 1),
      "active study group members",
    );
    await ctx.db.patch(groupId, { activeMemberCount: activeMembers.length, updatedAt: Date.now() });
  }
}

async function mergeChatMemberGroup(
  ctx: MutationCtx,
  conversation: Doc<"chatConversations">,
  rows: Doc<"chatMembers">[],
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
) {
  const mappedUserId = mergedUserId(rows[0].userId, canonicalUserId, duplicateUserId);
  const winner = rows.find((row) => row.conversationId === conversation._id && row.userId === mappedUserId) ?? rows[0];
  const newest = [...rows].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const status = [...rows].sort((a, b) => chatMemberStatusRank[b.status] - chatMemberStatusRank[a.status])[0].status;
  const requestStatus = [...rows].sort(
    (a, b) => chatRequestStatusRank[b.requestStatus] - chatRequestStatusRank[a.requestStatus],
  )[0].requestStatus;
  const unreadCount = Math.max(...rows.map((row) => Math.max(0, row.unreadCount)));
  await ctx.db.patch(winner._id, {
    conversationId: conversation._id,
    userId: mappedUserId,
    conversationKind: conversation.kind,
    role: rows.some((row) => row.role === "owner") ? "owner" : "member",
    status,
    requestStatus,
    lastReadSequence: Math.max(...rows.map((row) => row.lastReadSequence)),
    lastDeliveredSequence: Math.max(...rows.map((row) => row.lastDeliveredSequence)),
    lastDeliveredAt: Math.max(...rows.map((row) => row.lastDeliveredAt)),
    unreadCount,
    hasUnread: unreadCount > 0 || rows.some((row) => row.hasUnread),
    isArchived: rows.every((row) => row.isArchived),
    isPinned: rows.some((row) => row.isPinned),
    historyCutoffSequence: Math.min(...rows.map((row) => row.historyCutoffSequence)),
    mutedUntil: maxOptional(rows.map((row) => row.mutedUntil)),
    requestImagesAllowedAt: maxOptional(rows.map((row) => row.requestImagesAllowedAt)),
    invitedBy: newest.invitedBy
      ? mergedUserId(newest.invitedBy, canonicalUserId, duplicateUserId)
      : undefined,
    invitedAt: maxOptional(rows.map((row) => row.invitedAt)),
    joinedAt: Math.min(...rows.map((row) => row.joinedAt ?? Number.MAX_SAFE_INTEGER)) === Number.MAX_SAFE_INTEGER
      ? undefined
      : Math.min(...rows.map((row) => row.joinedAt ?? Number.MAX_SAFE_INTEGER)),
    leftAt: status === "active" || status === "invited" ? undefined : maxOptional(rows.map((row) => row.leftAt)),
    updatedAt: Math.max(...rows.map((row) => row.updatedAt)),
  });
  for (const row of rows) if (row._id !== winner._id) await ctx.db.delete(row._id);
}

async function mergeChatConversationInto(
  ctx: MutationCtx,
  winnerId: Id<"chatConversations">,
  losingId: Id<"chatConversations">,
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
) {
  if (winnerId === losingId) return;
  const [winner, losing] = await Promise.all([ctx.db.get(winnerId), ctx.db.get(losingId)]);
  if (!winner || !losing) return;

  const messages = await boundedQuery(
    ctx.db.query("chatMessages").withIndex("by_conversationId_and_sequence", (q) => q.eq("conversationId", losingId)).take(ROW_LIMIT + 1),
    "chat messages in merged conversation",
  );
  let nextSequence = Math.max(winner.nextSequence, (winner.lastMessageSequence ?? 0) + 1);
  for (const message of messages) {
    const sequence = nextSequence;
    nextSequence += 1;
    await ctx.db.patch(message._id, {
      conversationId: winnerId,
      sequence,
      senderId: message.senderId
        ? mergedUserId(message.senderId, canonicalUserId, duplicateUserId)
        : undefined,
      mentionUserIds: [...new Set(message.mentionUserIds.map((userId) =>
        mergedUserId(userId, canonicalUserId, duplicateUserId),
      ))],
    });
    for (const image of await ctx.db.query("chatImages").withIndex("by_messageId", (q) => q.eq("messageId", message._id)).take(20)) {
      await ctx.db.patch(image._id, { conversationId: winnerId });
    }
    for (const preview of await ctx.db.query("chatLinkPreviews").withIndex("by_messageId", (q) => q.eq("messageId", message._id)).take(20)) {
      await ctx.db.patch(preview._id, { conversationId: winnerId });
    }
    for (const reaction of await ctx.db.query("chatReactions").withIndex("by_messageId_and_createdAt", (q) => q.eq("messageId", message._id)).take(ROW_LIMIT + 1)) {
      await ctx.db.patch(reaction._id, {
        conversationId: winnerId,
        userId: mergedUserId(reaction.userId, canonicalUserId, duplicateUserId),
      });
    }
  }

  const memberRows = requireBoundedRows([
    ...await ctx.db.query("chatMembers").withIndex("by_conversationId_and_status_and_joinedAt", (q) => q.eq("conversationId", winnerId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("chatMembers").withIndex("by_conversationId_and_status_and_joinedAt", (q) => q.eq("conversationId", losingId)).take(ROW_LIMIT + 1),
  ], "chat members in merged conversations");
  const membersByUser = new Map<Id<"users">, Doc<"chatMembers">[]>();
  for (const row of memberRows) {
    const userId = mergedUserId(row.userId, canonicalUserId, duplicateUserId);
    membersByUser.set(userId, [...(membersByUser.get(userId) ?? []), row]);
  }
  for (const rows of membersByUser.values()) await mergeChatMemberGroup(ctx, winner, rows, canonicalUserId, duplicateUserId);

  const directRequests = requireBoundedRows([
    ...await ctx.db.query("chatDirectRequests").withIndex("by_conversationId", (q) => q.eq("conversationId", winnerId)).take(20),
    ...await ctx.db.query("chatDirectRequests").withIndex("by_conversationId", (q) => q.eq("conversationId", losingId)).take(20),
  ], "direct chat requests");
  if (directRequests.length) {
    const requestRank = { accepted: 3, pending: 2, declined: 1 } as const;
    const requestWinner = [...directRequests].sort(
      (a, b) => requestRank[b.status] - requestRank[a.status] || b.updatedAt - a.updatedAt,
    )[0];
    const senderId = mergedUserId(requestWinner.senderId, canonicalUserId, duplicateUserId);
    const recipientId = mergedUserId(requestWinner.recipientId, canonicalUserId, duplicateUserId);
    if (senderId === recipientId) await ctx.db.delete(requestWinner._id);
    else {
      await ctx.db.patch(requestWinner._id, {
        conversationId: winnerId,
        pairKey: userPairKey(senderId, recipientId),
        senderId,
        recipientId,
        senderMessageCount: Math.max(...directRequests.map((row) => row.senderMessageCount)),
        createdAt: Math.min(...directRequests.map((row) => row.createdAt)),
        updatedAt: Math.max(...directRequests.map((row) => row.updatedAt)),
      });
    }
    for (const row of directRequests) if (row._id !== requestWinner._id) await ctx.db.delete(row._id);
  }

  const typingRows = requireBoundedRows([
    ...await ctx.db.query("chatTyping").withIndex("by_conversationId_and_expiresAt", (q) => q.eq("conversationId", winnerId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("chatTyping").withIndex("by_conversationId_and_expiresAt", (q) => q.eq("conversationId", losingId)).take(ROW_LIMIT + 1),
  ], "chat typing rows");
  const typingByUser = new Map<Id<"users">, Doc<"chatTyping">[]>();
  for (const row of typingRows) {
    const userId = mergedUserId(row.userId, canonicalUserId, duplicateUserId);
    typingByUser.set(userId, [...(typingByUser.get(userId) ?? []), row]);
  }
  for (const [userId, rows] of typingByUser) {
    const row = rows.find((item) => item.conversationId === winnerId && item.userId === userId) ?? rows[0];
    await ctx.db.patch(row._id, {
      conversationId: winnerId,
      userId,
      expiresAt: Math.max(...rows.map((item) => item.expiresAt)),
      updatedAt: Math.max(...rows.map((item) => item.updatedAt)),
    });
    for (const item of rows) if (item._id !== row._id) await ctx.db.delete(item._id);
  }

  const draftRows = requireBoundedRows([
    ...await ctx.db.query("chatDrafts").withIndex("by_conversationId_and_userId", (q) => q.eq("conversationId", winnerId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("chatDrafts").withIndex("by_conversationId_and_userId", (q) => q.eq("conversationId", losingId)).take(ROW_LIMIT + 1),
  ], "chat draft rows");
  const draftsByUser = new Map<Id<"users">, Doc<"chatDrafts">[]>();
  for (const row of draftRows) {
    const userId = mergedUserId(row.userId, canonicalUserId, duplicateUserId);
    draftsByUser.set(userId, [...(draftsByUser.get(userId) ?? []), row]);
  }
  for (const [userId, rows] of draftsByUser) {
    const newest = [...rows].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    await ctx.db.patch(newest._id, { conversationId: winnerId, userId });
    for (const row of rows) if (row._id !== newest._id) await ctx.db.delete(row._id);
  }

  for (const preview of await boundedQuery(
    ctx.db.query("chatLinkPreviews").withIndex("by_conversationId_and_createdAt", (q) => q.eq("conversationId", losingId)).take(ROW_LIMIT + 1),
    "chat link previews",
  )) await ctx.db.patch(preview._id, { conversationId: winnerId });
  for (const report of await boundedQuery(
    ctx.db.query("chatReports").withIndex("by_targetConversationId_and_createdAt", (q) => q.eq("targetConversationId", losingId)).take(ROW_LIMIT + 1),
    "chat reports",
  )) await ctx.db.patch(report._id, { targetConversationId: winnerId });

  const partnerships = await boundedQuery(ctx.db.query("studyPartnerships").take(ROW_LIMIT + 1), "study partnerships");
  for (const row of partnerships) if (row.directConversationId === losingId) await ctx.db.patch(row._id, { directConversationId: winnerId });
  const groups = await boundedQuery(ctx.db.query("studyGroups").take(ROW_LIMIT + 1), "study groups");
  for (const row of groups) if (row.conversationId === losingId) await ctx.db.patch(row._id, { conversationId: winnerId });

  const latestIsLosing = (losing.lastMessageAt ?? 0) > (winner.lastMessageAt ?? 0);
  await ctx.db.patch(winnerId, {
    nextSequence,
    lastMessageSequence: nextSequence > 1 ? nextSequence - 1 : winner.lastMessageSequence,
    lastMessageAt: Math.max(winner.lastMessageAt ?? 0, losing.lastMessageAt ?? 0) || undefined,
    lastMessagePreview: latestIsLosing ? losing.lastMessagePreview : winner.lastMessagePreview,
    updatedAt: Math.max(winner.updatedAt, losing.updatedAt),
  });
  await ctx.db.delete(losingId);
}

async function mergeChatRows(
  ctx: MutationCtx,
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
) {
  const ids = [canonicalUserId, duplicateUserId] as const;
  const memberships = requireBoundedRows([
    ...await ctx.db.query("chatMembers").withIndex("by_userId_and_status_and_lastDeliveredAt", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("chatMembers").withIndex("by_userId_and_status_and_lastDeliveredAt", (q) => q.eq("userId", duplicateUserId)).take(ROW_LIMIT + 1),
  ], "chat memberships");
  const conversationIds = new Set<Id<"chatConversations">>(memberships.map((row) => row.conversationId));
  for (const userId of ids) {
    const owned = await boundedQuery(
      ctx.db.query("chatConversations").withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", userId)).take(ROW_LIMIT + 1),
      "owned chat conversations",
    );
    for (const conversation of owned) conversationIds.add(conversation._id);
  }

  const redirects = new Map<Id<"chatConversations">, Id<"chatConversations">>();
  const resolveConversationId = (conversationId: Id<"chatConversations">) => {
    let current = conversationId;
    while (redirects.has(current)) current = redirects.get(current)!;
    return current;
  };

  for (const originalId of [...conversationIds]) {
    const conversationId = resolveConversationId(originalId);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || (conversation.kind !== "direct" && conversation.kind !== "support")) continue;
    const rows = await boundedQuery(
      ctx.db.query("chatMembers").withIndex("by_conversationId_and_status_and_joinedAt", (q) => q.eq("conversationId", conversationId)).take(ROW_LIMIT + 1),
      "direct chat members",
    );
    const userIds = [...new Set(rows.map((row) => String(mergedUserId(row.userId, canonicalUserId, duplicateUserId))))]
      .map((userId) => userId as Id<"users">);
    if (userIds.length < 2) {
      await ctx.db.patch(conversationId, { directKey: undefined, deletedAt: Date.now(), updatedAt: Date.now() });
      continue;
    }
    if (userIds.length > 2) throw new Error("Direct conversation has more than two canonical members.");
    const directKey = `${conversation.kind}:${userPairKey(userIds[0], userIds[1])}`;
    const matches = await ctx.db.query("chatConversations").withIndex("by_directKey", (q) => q.eq("directKey", directKey)).take(10);
    const candidates = [...new Map([...matches, conversation].map((row) => [row._id, row])).values()]
      .sort((a, b) => a.createdAt - b.createdAt);
    const winner = candidates[0];
    for (const losing of candidates.slice(1)) {
      await mergeChatConversationInto(ctx, winner._id, losing._id, canonicalUserId, duplicateUserId);
      redirects.set(losing._id, winner._id);
      conversationIds.add(winner._id);
    }
    const currentWinner = await ctx.db.get(winner._id);
    if (currentWinner) {
      await ctx.db.patch(winner._id, {
        directKey,
        ownerId: currentWinner.ownerId
          ? mergedUserId(currentWinner.ownerId, canonicalUserId, duplicateUserId)
          : undefined,
        createdById: mergedUserId(currentWinner.createdById, canonicalUserId, duplicateUserId),
      });
    }
  }

  const currentMemberships = requireBoundedRows([
    ...await ctx.db.query("chatMembers").withIndex("by_userId_and_status_and_lastDeliveredAt", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("chatMembers").withIndex("by_userId_and_status_and_lastDeliveredAt", (q) => q.eq("userId", duplicateUserId)).take(ROW_LIMIT + 1),
  ], "canonical chat memberships");
  const membershipByConversation = new Map<Id<"chatConversations">, Doc<"chatMembers">[]>();
  for (const row of currentMemberships) {
    const conversationId = resolveConversationId(row.conversationId);
    membershipByConversation.set(conversationId, [...(membershipByConversation.get(conversationId) ?? []), row]);
  }
  for (const [conversationId, rows] of membershipByConversation) {
    const conversation = await ctx.db.get(conversationId);
    if (conversation) await mergeChatMemberGroup(ctx, conversation, rows, canonicalUserId, duplicateUserId);
  }

  const canonicalConversationIds = new Set([...conversationIds].map(resolveConversationId));
  for (const conversationId of canonicalConversationIds) {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) continue;
    const patch: { ownerId?: Id<"users">; createdById?: Id<"users"> } = {};
    if (conversation.ownerId === duplicateUserId) patch.ownerId = canonicalUserId;
    if (conversation.createdById === duplicateUserId) patch.createdById = canonicalUserId;
    if (patch.ownerId || patch.createdById) await ctx.db.patch(conversationId, patch);
    const messages = await boundedQuery(
      ctx.db.query("chatMessages").withIndex("by_conversationId_and_sequence", (q) => q.eq("conversationId", conversationId)).take(ROW_LIMIT + 1),
      "messages in identity merge conversations",
    );
    for (const message of messages) {
      const senderId = message.senderId
        ? mergedUserId(message.senderId, canonicalUserId, duplicateUserId)
        : undefined;
      const mentionUserIds = [...new Set(message.mentionUserIds.map((userId) =>
        mergedUserId(userId, canonicalUserId, duplicateUserId),
      ))];
      if (senderId !== message.senderId || mentionUserIds.some((userId, index) => userId !== message.mentionUserIds[index])) {
        await ctx.db.patch(message._id, { senderId, mentionUserIds });
      }
      const reactions = await boundedQuery(
        ctx.db.query("chatReactions").withIndex("by_messageId_and_createdAt", (q) => q.eq("messageId", message._id)).take(ROW_LIMIT + 1),
        "chat message reactions",
      );
      const seenReactions = new Map<string, Doc<"chatReactions">>();
      for (const reaction of reactions) {
        const userId = mergedUserId(reaction.userId, canonicalUserId, duplicateUserId);
        const key = `${userId}:${reaction.emoji}`;
        if (seenReactions.has(key)) await ctx.db.delete(reaction._id);
        else {
          seenReactions.set(key, reaction);
          if (userId !== reaction.userId || reaction.conversationId !== conversationId) {
            await ctx.db.patch(reaction._id, { userId, conversationId });
          }
        }
      }
    }

    const directRequests = await ctx.db
      .query("chatDirectRequests")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
      .take(20);
    const requestRank = { accepted: 3, pending: 2, declined: 1 } as const;
    const validRequests = [];
    for (const request of directRequests) {
      const senderId = mergedUserId(request.senderId, canonicalUserId, duplicateUserId);
      const recipientId = mergedUserId(request.recipientId, canonicalUserId, duplicateUserId);
      if (senderId === recipientId) {
        await ctx.db.delete(request._id);
        continue;
      }
      await ctx.db.patch(request._id, { senderId, recipientId, pairKey: userPairKey(senderId, recipientId) });
      validRequests.push(request);
    }
    if (validRequests.length > 1) {
      const winner = [...validRequests].sort(
        (a, b) => requestRank[b.status] - requestRank[a.status] || b.updatedAt - a.updatedAt,
      )[0];
      for (const request of validRequests) if (request._id !== winner._id) await ctx.db.delete(request._id);
    }

    const typingRows = await boundedQuery(
      ctx.db.query("chatTyping").withIndex("by_conversationId_and_expiresAt", (q) => q.eq("conversationId", conversationId)).take(ROW_LIMIT + 1),
      "chat typing rows",
    );
    const typingByUser = new Map<Id<"users">, Doc<"chatTyping">[]>();
    for (const row of typingRows) {
      const userId = mergedUserId(row.userId, canonicalUserId, duplicateUserId);
      typingByUser.set(userId, [...(typingByUser.get(userId) ?? []), row]);
    }
    for (const [userId, rows] of typingByUser) {
      const winner = rows.find((row) => row.userId === userId) ?? rows[0];
      await ctx.db.patch(winner._id, {
        userId,
        expiresAt: Math.max(...rows.map((row) => row.expiresAt)),
        updatedAt: Math.max(...rows.map((row) => row.updatedAt)),
      });
      for (const row of rows) if (row._id !== winner._id) await ctx.db.delete(row._id);
    }

    const draftRows = await boundedQuery(
      ctx.db.query("chatDrafts").withIndex("by_conversationId_and_userId", (q) => q.eq("conversationId", conversationId)).take(ROW_LIMIT + 1),
      "chat drafts",
    );
    const draftsByUser = new Map<Id<"users">, Doc<"chatDrafts">[]>();
    for (const row of draftRows) {
      const userId = mergedUserId(row.userId, canonicalUserId, duplicateUserId);
      draftsByUser.set(userId, [...(draftsByUser.get(userId) ?? []), row]);
    }
    for (const [userId, rows] of draftsByUser) {
      const newest = [...rows].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      await ctx.db.patch(newest._id, { userId });
      for (const row of rows) if (row._id !== newest._id) await ctx.db.delete(row._id);
    }
  }

  const images = await boundedQuery(
    ctx.db.query("chatImages").withIndex("by_uploaderId_and_status_and_createdAt", (q) => q.eq("uploaderId", duplicateUserId)).take(ROW_LIMIT + 1),
    "uploaded chat images",
  );
  for (const image of images) {
    await ctx.db.patch(image._id, {
      uploaderId: canonicalUserId,
      conversationId: image.conversationId ? resolveConversationId(image.conversationId) : undefined,
    });
  }

  const dockRows = requireBoundedRows([
    ...await ctx.db.query("chatDockState").withIndex("by_userId_and_deviceId", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("chatDockState").withIndex("by_userId_and_deviceId", (q) => q.eq("userId", duplicateUserId)).take(ROW_LIMIT + 1),
  ], "chat dock rows");
  const docksByDevice = new Map<string, Doc<"chatDockState">[]>();
  for (const row of dockRows) docksByDevice.set(row.deviceId, [...(docksByDevice.get(row.deviceId) ?? []), row]);
  for (const rows of docksByDevice.values()) {
    const winner = rows.find((row) => row.userId === canonicalUserId) ?? rows[0];
    const openConversationIds = [...new Set(rows.flatMap((row) => row.openConversationIds.map(resolveConversationId)))];
    const minimizedConversationIds = [...new Set(rows.flatMap((row) => row.minimizedConversationIds.map(resolveConversationId)))];
    await ctx.db.patch(winner._id, {
      userId: canonicalUserId,
      openConversationIds,
      minimizedConversationIds: minimizedConversationIds.filter((id) => openConversationIds.includes(id)),
      updatedAt: Math.max(...rows.map((row) => row.updatedAt)),
    });
    for (const row of rows) if (row._id !== winner._id) await ctx.db.delete(row._id);
  }

  const blockMap = new Map<Id<"chatBlocks">, Doc<"chatBlocks">>();
  for (const userId of ids) {
    const [outgoing, incoming] = await Promise.all([
      boundedQuery(ctx.db.query("chatBlocks").withIndex("by_blockerId_and_blockedId", (q) => q.eq("blockerId", userId)).take(ROW_LIMIT + 1), "outgoing chat blocks"),
      boundedQuery(ctx.db.query("chatBlocks").withIndex("by_blockedId_and_blockerId", (q) => q.eq("blockedId", userId)).take(ROW_LIMIT + 1), "incoming chat blocks"),
    ]);
    for (const row of [...outgoing, ...incoming]) blockMap.set(row._id, row);
  }
  const seenBlocks = new Set<string>();
  for (const row of [...blockMap.values()].sort((a, b) => a.createdAt - b.createdAt)) {
    const blockerId = mergedUserId(row.blockerId, canonicalUserId, duplicateUserId);
    const blockedId = mergedUserId(row.blockedId, canonicalUserId, duplicateUserId);
    const key = `${blockerId}:${blockedId}`;
    if (blockerId === blockedId || seenBlocks.has(key)) await ctx.db.delete(row._id);
    else {
      seenBlocks.add(key);
      await ctx.db.patch(row._id, { blockerId, blockedId });
    }
  }

  const pushRows = await boundedQuery(
    ctx.db.query("pushSubscriptions").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", duplicateUserId)).take(ROW_LIMIT + 1),
    "push subscriptions",
  );
  for (const row of pushRows) {
    const sameEndpoint = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpointHash", (q) => q.eq("endpointHash", row.endpointHash))
      .take(10);
    const canonical = sameEndpoint.find((candidate) => candidate.userId === canonicalUserId);
    if (canonical && canonical._id !== row._id) {
      if (row.updatedAt > canonical.updatedAt) {
        await ctx.db.patch(canonical._id, {
          endpoint: row.endpoint,
          p256dh: row.p256dh,
          auth: row.auth,
          userAgent: row.userAgent,
          expiresAt: row.expiresAt,
          updatedAt: row.updatedAt,
        });
      }
      await ctx.db.delete(row._id);
    } else await ctx.db.patch(row._id, { userId: canonicalUserId });
  }

  const preferenceRows = requireBoundedRows([
    ...await ctx.db.query("notificationPreferences").withIndex("by_userId_and_category_and_conversationId", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("notificationPreferences").withIndex("by_userId_and_category_and_conversationId", (q) => q.eq("userId", duplicateUserId)).take(ROW_LIMIT + 1),
  ], "notification preferences");
  const preferencesByKey = new Map<string, Doc<"notificationPreferences">[]>();
  for (const row of preferenceRows) {
    const conversationId = row.conversationId ? resolveConversationId(row.conversationId) : undefined;
    const key = `${row.category}:${conversationId ?? "global"}`;
    preferencesByKey.set(key, [...(preferencesByKey.get(key) ?? []), row]);
  }
  for (const rows of preferencesByKey.values()) {
    const newest = [...rows].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    await ctx.db.patch(newest._id, {
      userId: canonicalUserId,
      conversationId: newest.conversationId ? resolveConversationId(newest.conversationId) : undefined,
    });
    for (const row of rows) if (row._id !== newest._id) await ctx.db.delete(row._id);
  }

  const reports = await boundedQuery(ctx.db.query("chatReports").take(ROW_LIMIT + 1), "chat reports");
  for (const report of reports) {
    const reporterId = mergedUserId(report.reporterId, canonicalUserId, duplicateUserId);
    const targetUserId = report.targetUserId
      ? mergedUserId(report.targetUserId, canonicalUserId, duplicateUserId)
      : undefined;
    const targetConversationId = report.targetConversationId
      ? resolveConversationId(report.targetConversationId)
      : undefined;
    if (reporterId !== report.reporterId || targetUserId !== report.targetUserId || targetConversationId !== report.targetConversationId) {
      await ctx.db.patch(report._id, {
        reporterId,
        targetUserId: report.targetUserId
          ? targetUserId
          : undefined,
        targetConversationId,
      });
    }
  }
  const reportMessages = await boundedQuery(ctx.db.query("chatReportMessages").take(ROW_LIMIT + 1), "chat report messages");
  for (const row of reportMessages) {
    const conversationId = resolveConversationId(row.conversationId);
    if (conversationId !== row.conversationId) await ctx.db.patch(row._id, { conversationId });
  }
  const moderationActions = await boundedQuery(ctx.db.query("chatModerationActions").take(ROW_LIMIT + 1), "chat moderation actions");
  for (const row of moderationActions) {
    await ctx.db.patch(row._id, {
      actorId: mergedUserId(row.actorId, canonicalUserId, duplicateUserId),
      targetUserId: row.targetUserId ? mergedUserId(row.targetUserId, canonicalUserId, duplicateUserId) : undefined,
      conversationId: row.conversationId ? resolveConversationId(row.conversationId) : undefined,
    });
  }
  const accessAudits = await boundedQuery(ctx.db.query("chatAccessAudit").take(ROW_LIMIT + 1), "chat access audits");
  for (const row of accessAudits) {
    await ctx.db.patch(row._id, {
      adminId: mergedUserId(row.adminId, canonicalUserId, duplicateUserId),
      targetUserId: mergedUserId(row.targetUserId, canonicalUserId, duplicateUserId),
      conversationId: row.conversationId ? resolveConversationId(row.conversationId) : undefined,
    });
  }
  const suspensions = await boundedQuery(ctx.db.query("accountSuspensions").take(ROW_LIMIT + 1), "account suspensions");
  for (const row of suspensions) {
    await ctx.db.patch(row._id, {
      userId: mergedUserId(row.userId, canonicalUserId, duplicateUserId),
      createdBy: mergedUserId(row.createdBy, canonicalUserId, duplicateUserId),
      liftedBy: row.liftedBy ? mergedUserId(row.liftedBy, canonicalUserId, duplicateUserId) : undefined,
    });
  }
  const appeals = await boundedQuery(ctx.db.query("suspensionAppeals").take(ROW_LIMIT + 1), "suspension appeals");
  for (const row of appeals) {
    await ctx.db.patch(row._id, {
      userId: mergedUserId(row.userId, canonicalUserId, duplicateUserId),
      reviewedBy: row.reviewedBy ? mergedUserId(row.reviewedBy, canonicalUserId, duplicateUserId) : undefined,
    });
  }
}

async function rebuildCanonicalProfileStats(
  ctx: MutationCtx,
  canonicalUserId: Id<"users">,
  duplicateUserId: Id<"users">,
  role: ReturnType<typeof effectiveRoleForProfile>,
  followCounts: { followerCount: number; followingCount: number },
) {
  const existingRows = requireBoundedRows([
    ...await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
    ...await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", duplicateUserId)).take(ROW_LIMIT + 1),
  ], "profile stats rows");
  const [progressRows, contributions] = await Promise.all([
    boundedQuery(
      ctx.db.query("progress").withIndex("by_user_course", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
      "canonical progress rows",
    ),
    boundedQuery(
      ctx.db.query("profileContributions").withIndex("by_userId_and_lastActivityAt", (q) => q.eq("userId", canonicalUserId)).take(ROW_LIMIT + 1),
      "canonical contribution rows",
    ),
  ]);
  const completedFromProgress = new Set(
    progressRows.filter((row) => row.completed).map((row) => String(row.lessonId)),
  ).size;
  const completedLessons = Math.max(
    completedFromProgress,
    ...existingRows.map((row) => Math.max(0, row.completedLessons)),
    0,
  );
  const payload = {
    completedLessons,
    contributionCount: contributions.reduce(
      (sum, row) => sum + Math.max(0, row.threadCount) + Math.max(0, row.commentCount),
      0,
    ),
    followerCount: followCounts.followerCount,
    followingCount: followCounts.followingCount,
    role,
    aggregateVersion: 1,
    updatedAt: Date.now(),
  };
  const winner = existingRows.find((row) => row.userId === canonicalUserId);
  if (winner) await ctx.db.patch(winner._id, payload);
  else await ctx.db.insert("profileStats", { userId: canonicalUserId, ...payload });
  for (const row of existingRows) if (row._id !== winner?._id) await ctx.db.delete(row._id);
}

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

    for (const row of await boundedQueryRows(ctx.db.query("aiConversations").withIndex("by_user_lesson", (q) => q.eq("userId", args.duplicateUserId)), "AI conversations")) {
      await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("aiMessages").withIndex("by_user_lesson", (q) => q.eq("userId", args.duplicateUserId)), "AI messages")) {
      await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("labOutputs").withIndex("by_user_lesson", (q) => q.eq("userId", args.duplicateUserId)), "lab outputs")) {
      await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }

    for (const row of await boundedQueryRows(ctx.db.query("taskProgress").withIndex("by_user_task", (q) => q.eq("userId", args.duplicateUserId)), "task progress rows")) {
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
    for (const row of await boundedQueryRows(ctx.db.query("lessonStepProgress").withIndex("by_user_step", (q) => q.eq("userId", args.duplicateUserId)), "lesson step progress rows")) {
      const existing = await ctx.db.query("lessonStepProgress").withIndex("by_user_step", (q) => q.eq("userId", args.canonicalUserId).eq("stepId", row.stepId)).unique();
      if (existing) {
        await ctx.db.patch(existing._id, { completed: existing.completed || row.completed, updatedAt: Math.max(existing.updatedAt, row.updatedAt) });
        await ctx.db.delete(row._id);
      } else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }

    for (const row of await boundedQueryRows(ctx.db.query("subscriptions").withIndex("by_user_course", (q) => q.eq("userId", args.duplicateUserId)), "subscriptions")) {
      await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("enrollments").withIndex("by_user", (q) => q.eq("userId", args.duplicateUserId)), "enrollments")) {
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
    for (const row of await boundedQueryRows(ctx.db.query("courseFavorites").withIndex("by_user", (q) => q.eq("userId", args.duplicateUserId)), "course favorites")) {
      const existing = await ctx.db.query("courseFavorites").withIndex("by_user_course", (q) => q.eq("userId", args.canonicalUserId).eq("courseId", row.courseId)).unique();
      if (existing) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("progress").withIndex("by_user_lesson", (q) => q.eq("userId", args.duplicateUserId)), "lesson progress rows")) {
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

    for (const row of await boundedQueryRows(ctx.db.query("communityPosts").withIndex("by_author", (q) => q.eq("authorId", args.duplicateUserId)), "community posts")) {
      await ctx.db.patch(row._id, { authorId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("comments").withIndex("by_authorId_and_createdAt", (q) => q.eq("authorId", args.duplicateUserId)), "community comments")) {
      await ctx.db.patch(row._id, { authorId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("reactions").withIndex("by_user_target", (q) => q.eq("userId", args.duplicateUserId)), "community reactions")) {
      const existing = await ctx.db.query("reactions").withIndex("by_user_target", (q) => q.eq("userId", args.canonicalUserId).eq("targetType", row.targetType).eq("targetId", row.targetId)).unique();
      if (existing) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", args.duplicateUserId)), "notifications")) {
      await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("postFavorites").withIndex("by_user", (q) => q.eq("userId", args.duplicateUserId)), "post favorites")) {
      const existing = await ctx.db.query("postFavorites").withIndex("by_user_post", (q) => q.eq("userId", args.canonicalUserId).eq("postId", row.postId)).unique();
      if (existing) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("communityModerationEvents").withIndex("by_moderatorId_and_createdAt", (q) => q.eq("moderatorId", args.duplicateUserId)), "community moderation events")) {
      await ctx.db.patch(row._id, { moderatorId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("leaderboardEvents").withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", args.duplicateUserId)), "leaderboard events")) {
      const existing = await ctx.db.query("leaderboardEvents").withIndex("by_userId_and_sourceType_and_sourceId", (q) => q.eq("userId", args.canonicalUserId).eq("sourceType", row.sourceType).eq("sourceId", row.sourceId)).unique();
      if (existing) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { userId: args.canonicalUserId });
    }
    for (const row of await boundedQueryRows(ctx.db.query("leaderboardStats").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", args.duplicateUserId)), "leaderboard stats")) {
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

    const canonicalMergedRole = effectiveRoleForProfile(
      canonicalEmail,
      preferredProfile.role ?? canonicalUser.role,
    );
    const followCounts = await mergeFollowRows(ctx, args.canonicalUserId, args.duplicateUserId, canonicalMergedRole);
    await mergePresenceRows(ctx, args.canonicalUserId, args.duplicateUserId);
    await mergeActivityRows(ctx, args.canonicalUserId, args.duplicateUserId);
    await mergeContributionRows(ctx, args.canonicalUserId, args.duplicateUserId);
    await mergeHelpRows(ctx, args.canonicalUserId, args.duplicateUserId);
    await mergeStudyRows(ctx, args.canonicalUserId, args.duplicateUserId);
    await mergeChatRows(ctx, args.canonicalUserId, args.duplicateUserId);
    await rebuildCanonicalProfileStats(
      ctx,
      args.canonicalUserId,
      args.duplicateUserId,
      canonicalMergedRole,
      followCounts,
    );

    for (const token of await boundedQueryRows(ctx.db.query("emailVerificationTokens").withIndex("by_userId_and_createdAt", (q) => q.eq("userId", args.duplicateUserId)), "email verification tokens")) {
      await ctx.db.patch(token._id, { userId: args.canonicalUserId });
    }
    for (const account of duplicateAccounts) await ctx.db.patch(account._id, { userId: args.canonicalUserId });

    const duplicateSessions = await boundedQueryRows(ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", args.duplicateUserId)), "auth sessions");
    for (const session of duplicateSessions) {
      for (const refreshToken of await boundedQueryRows(ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session._id)), "auth refresh tokens")) {
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
      bio: preferredProfile.bio ?? canonicalUser.bio,
      websiteUrl: preferredProfile.websiteUrl ?? canonicalUser.websiteUrl,
      instagramUrl: preferredProfile.instagramUrl ?? canonicalUser.instagramUrl,
      linkedinUrl: preferredProfile.linkedinUrl ?? canonicalUser.linkedinUrl,
      youtubeUrl: preferredProfile.youtubeUrl ?? canonicalUser.youtubeUrl,
      helpStatus: preferredProfile.helpStatus ?? canonicalUser.helpStatus ?? duplicateUser.helpStatus,
      dmPrivacy: preferredProfile.dmPrivacy ?? canonicalUser.dmPrivacy ?? duplicateUser.dmPrivacy,
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
      bio: undefined,
      websiteUrl: undefined,
      instagramUrl: undefined,
      linkedinUrl: undefined,
      youtubeUrl: undefined,
      helpStatus: undefined,
      dmPrivacy: undefined,
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
