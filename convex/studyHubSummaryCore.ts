import { DirectAggregate } from "@convex-dev/aggregate";

import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type SummaryCtx = QueryCtx | MutationCtx;
type StudyHubMetric = 0 | 1 | 2 | 3 | 4;
type StudyHubAggregateKey = [metric: StudyHubMetric];

const STUDY_HUB_AGGREGATE_VERSION = "studyHubAggregateV1";

const studyHubAggregate = new DirectAggregate<{
  Namespace: Id<"users">;
  Key: StudyHubAggregateKey;
  Id: string;
}>(components.studyHub);

type Contribution = {
  namespace: Id<"users">;
  key: StudyHubAggregateKey;
  id: string;
};

function contribution(
  namespace: Id<"users">,
  metric: StudyHubMetric,
  id: string,
): Contribution {
  return { namespace, key: [metric], id };
}

async function reconcile(
  ctx: MutationCtx,
  previous: Contribution[],
  next: Contribution[],
) {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextById = new Map(next.map((item) => [item.id, item]));
  const ids = new Set([...previousById.keys(), ...nextById.keys()]);

  for (const id of ids) {
    const oldItem = previousById.get(id);
    const newItem = nextById.get(id);
    if (oldItem && newItem) {
      await studyHubAggregate.replaceOrInsert(ctx, oldItem, {
        namespace: newItem.namespace,
        key: newItem.key,
      });
    } else if (newItem) {
      await studyHubAggregate.insertIfDoesNotExist(ctx, newItem);
    } else if (oldItem) {
      await studyHubAggregate.deleteIfExists(ctx, oldItem);
    }
  }
}

function partnerInviteContributions(invite: Doc<"studyPartnerInvites"> | null) {
  if (!invite || invite.status !== "pending") return [];
  const source = String(invite._id);
  return [
    contribution(invite.recipientId, 0, `partnerInvite:${source}:recipient`),
    contribution(invite.senderId, 1, `partnerInvite:${source}:sender`),
  ];
}

function groupInviteContributions(invite: Doc<"studyGroupInvites"> | null) {
  if (!invite || invite.status !== "pending") return [];
  return [contribution(invite.userId, 2, `groupInvite:${String(invite._id)}:recipient`)];
}

function partnershipContributions(partnership: Doc<"studyPartnerships"> | null) {
  if (!partnership) return [];
  const source = String(partnership._id);
  return [
    contribution(partnership.userAId, 3, `partnership:${source}:a`),
    contribution(partnership.userBId, 3, `partnership:${source}:b`),
  ];
}

function groupMembershipContributions(membership: Doc<"studyGroupMembers"> | null) {
  if (!membership?.active) return [];
  return [contribution(membership.userId, 4, `groupMembership:${String(membership._id)}:member`)];
}

export async function syncStudyPartnerInviteSummary(
  ctx: MutationCtx,
  previous: Doc<"studyPartnerInvites"> | null,
  next: Doc<"studyPartnerInvites"> | null,
) {
  await reconcile(ctx, partnerInviteContributions(previous), partnerInviteContributions(next));
}

export async function syncStudyGroupInviteSummary(
  ctx: MutationCtx,
  previous: Doc<"studyGroupInvites"> | null,
  next: Doc<"studyGroupInvites"> | null,
) {
  await reconcile(ctx, groupInviteContributions(previous), groupInviteContributions(next));
}

export async function syncStudyPartnershipSummary(
  ctx: MutationCtx,
  previous: Doc<"studyPartnerships"> | null,
  next: Doc<"studyPartnerships"> | null,
) {
  await reconcile(ctx, partnershipContributions(previous), partnershipContributions(next));
}

export async function syncStudyGroupMembershipSummary(
  ctx: MutationCtx,
  previous: Doc<"studyGroupMembers"> | null,
  next: Doc<"studyGroupMembers"> | null,
) {
  await reconcile(ctx, groupMembershipContributions(previous), groupMembershipContributions(next));
}

export async function markStudyHubAggregateReady(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("studyHubSummaryVersions")
    .withIndex("by_key", (q) => q.eq("key", STUDY_HUB_AGGREGATE_VERSION))
    .unique();
  const now = Date.now();
  if (existing) {
    if (!existing.ready) await ctx.db.patch(existing._id, { ready: true, updatedAt: now });
    return;
  }
  await ctx.db.insert("studyHubSummaryVersions", {
    key: STUDY_HUB_AGGREGATE_VERSION,
    ready: true,
    updatedAt: now,
  });
}

export async function getStudyHubAggregateSummary(ctx: SummaryCtx, userId: Id<"users">) {
  const [counts, version] = await Promise.all([
    studyHubAggregate.countBatch(ctx, [
      { namespace: userId, bounds: { eq: [0] } },
      { namespace: userId, bounds: { eq: [1] } },
      { namespace: userId, bounds: { eq: [2] } },
      { namespace: userId, bounds: { eq: [3] } },
      { namespace: userId, bounds: { eq: [4] } },
    ]),
    ctx.db
      .query("studyHubSummaryVersions")
      .withIndex("by_key", (q) => q.eq("key", STUDY_HUB_AGGREGATE_VERSION))
      .unique(),
  ]);
  return {
    pendingPartnerInviteCount: counts[0],
    pendingOutgoingPartnerInviteCount: counts[1],
    pendingStudyGroupInviteCount: counts[2],
    activePartnershipCount: counts[3],
    activeStudyGroupCount: counts[4],
    ready: version?.ready === true,
  };
}
