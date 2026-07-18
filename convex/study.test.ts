/// <reference types="vite/client" />

import aggregateTest from "@convex-dev/aggregate/test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterAll, beforeAll, expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { ensureStudyPartnershipMembers, progressZoneForPercent } from "./study";
import {
  markStudyHubAggregateReady,
  syncStudyGroupMembershipSummary,
  syncStudyPartnerInviteSummary,
  syncStudyPartnershipSummary,
} from "./studyHubSummaryCore";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

function createTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "chatInbox");
  aggregateTest.register(t, "studyHub");
  return t;
}

beforeAll(() => {
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com";
});

afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

const studyApi = {
  setViewerAvailability: makeFunctionReference<"mutation">("study:setViewerAvailability"),
  getViewerAvailability: makeFunctionReference<"query">("study:getViewerAvailability"),
  getViewerCourseAvailability: makeFunctionReference<"query">("study:getViewerCourseAvailability"),
  listCommonStudyCoursesPage: makeFunctionReference<"query">("study:listCommonStudyCoursesPage"),
  listPartnerSuggestions: makeFunctionReference<"query">("study:listPartnerSuggestions"),
  createPartnerInvite: makeFunctionReference<"mutation">("study:createPartnerInvite"),
  respondToPartnerInvite: makeFunctionReference<"mutation">("study:respondToPartnerInvite"),
  listViewerPartnerInvites: makeFunctionReference<"query">("study:listViewerPartnerInvites"),
  getPartnerInvite: makeFunctionReference<"query">("study:getPartnerInvite"),
  listViewerPartnerships: makeFunctionReference<"query">("study:listViewerPartnerships"),
  listViewerPartnershipsPage: makeFunctionReference<"query">("study:listViewerPartnershipsPage"),
  getStudyPartnership: makeFunctionReference<"query">("study:getStudyPartnership"),
  createStudyGroupProposal: makeFunctionReference<"mutation">("study:createStudyGroupProposal"),
  listViewerStudyGroupInvites: makeFunctionReference<"query">("study:listViewerStudyGroupInvites"),
  listViewerStudyGroups: makeFunctionReference<"query">("study:listViewerStudyGroups"),
  listViewerStudyGroupsPage: makeFunctionReference<"query">("study:listViewerStudyGroupsPage"),
  getStudyHubSummary: makeFunctionReference<"query">("study:getStudyHubSummary"),
  respondToStudyGroupInvite: makeFunctionReference<"mutation">("study:respondToStudyGroupInvite"),
  getStudyGroup: makeFunctionReference<"query">("study:getStudyGroup"),
  listStudyGroupMembersPage: makeFunctionReference<"query">("study:listStudyGroupMembersPage"),
  leaveStudyGroup: makeFunctionReference<"mutation">("study:leaveStudyGroup"),
};

const coursesApi = {
  markProgress: makeFunctionReference<"mutation">("courses:markProgress"),
  listPublishedCoursesPage: makeFunctionReference<"query">("courses:listPublishedCoursesPage"),
};

type SeededStudyContext = Awaited<ReturnType<typeof seedStudyContext>>;

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

function pairKey(userAId: Id<"users">, userBId: Id<"users">) {
  return [String(userAId), String(userBId)].sort().join(":");
}

async function seedStudyContext(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const insertUser = (name: string, username: string, role: "student" | "moderator" | "admin" = "student") =>
      ctx.db.insert("users", {
        email: `${username}@example.com`,
        name,
        username,
        role,
        language: "sr",
        appEmailVerificationTime: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    const creatorId = await insertUser("Creator", "study_creator");
    const sameZoneId = await insertUser("Same Zone", "same_zone");
    const differentZoneId = await insertUser("Different Zone", "different_zone");
    const fourthId = await insertUser("Fourth Partner", "fourth_partner");
    const unrelatedId = await insertUser("Unrelated", "study_unrelated");
    const adminId = await insertUser("Study Admin", "admin", "admin");
    const moderatorId = await insertUser("Study Moderator", "study_moderator", "moderator");
    const courseId = await ctx.db.insert("courses", {
      slug: "study-course",
      titleSr: "Kurs za partnerstvo",
      titleEn: "Study partner course",
      subtitleSr: "Učenje",
      subtitleEn: "Study",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: "published",
      sortOrder: 1,
      updatedAt: 1,
    });
    const draftCourseId = await ctx.db.insert("courses", {
      slug: "draft-study-course",
      titleSr: "Nacrt",
      titleEn: "Draft",
      subtitleSr: "Nacrt",
      subtitleEn: "Draft",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: "draft",
      sortOrder: 2,
      updatedAt: 1,
    });
    const lessonIds: Id<"lessons">[] = [];
    for (let index = 0; index < 4; index += 1) {
      lessonIds.push(await ctx.db.insert("lessons", {
        courseId,
        slug: `lesson-${index + 1}`,
        titleSr: `Lekcija ${index + 1}`,
        titleEn: `Lesson ${index + 1}`,
        summarySr: "Sažetak",
        summaryEn: "Summary",
        durationSeconds: 60,
        isPublished: true,
        sortOrder: index,
        updatedAt: 1,
      }));
    }
    const complete = async (userId: Id<"users">, count: number) => {
      for (let index = 0; index < count; index += 1) {
        await ctx.db.insert("progress", {
          userId,
          courseId,
          lessonId: lessonIds[index],
          completed: true,
          positionSeconds: 60,
          updatedAt: 1,
        });
      }
    };
    await complete(creatorId, 1);
    await complete(sameZoneId, 1);
    await complete(differentZoneId, 2);
    await complete(fourthId, 1);
    return {
      creatorId,
      sameZoneId,
      differentZoneId,
      fourthId,
      unrelatedId,
      adminId,
      moderatorId,
      courseId,
      draftCourseId,
      lessonIds,
    };
  });
}

async function optIn(t: ReturnType<typeof convexTest>, ids: SeededStudyContext, userIds: Id<"users">[]) {
  for (const userId of userIds) {
    await asUser(t, userId).mutation(studyApi.setViewerAvailability, { courseId: ids.courseId, active: true });
  }
}

async function seedPartnerships(
  t: ReturnType<typeof convexTest>,
  creatorId: Id<"users">,
  partnerIds: Id<"users">[],
  courseId: Id<"courses">,
) {
  await t.run(async (ctx) => {
    for (const partnerId of partnerIds) {
      const key = pairKey(creatorId, partnerId);
      const inviteId = await ctx.db.insert("studyPartnerInvites", {
        pairKey: key,
        senderId: creatorId,
        recipientId: partnerId,
        courseId,
        status: "accepted",
        createdAt: 1,
        respondedAt: 1,
        updatedAt: 1,
      });
      const partnershipId = await ctx.db.insert("studyPartnerships", {
        pairKey: key,
        userAId: String(creatorId) < String(partnerId) ? creatorId : partnerId,
        userBId: String(creatorId) < String(partnerId) ? partnerId : creatorId,
        courseId,
        createdFromInviteId: inviteId,
        createdAt: 1,
        updatedAt: 1,
      });
      const partnership = await ctx.db.get(partnershipId);
      if (partnership) {
        await ensureStudyPartnershipMembers(ctx, partnership);
        await syncStudyPartnershipSummary(ctx, null, partnership);
      }
    }
  });
}

test("study progress zones use exact 0-25, 26-50, 51-75 and 76-100 boundaries", () => {
  expect(progressZoneForPercent(0)).toBe("0_25");
  expect(progressZoneForPercent(25)).toBe("0_25");
  expect(progressZoneForPercent(26)).toBe("26_50");
  expect(progressZoneForPercent(50)).toBe("26_50");
  expect(progressZoneForPercent(51)).toBe("51_75");
  expect(progressZoneForPercent(75)).toBe("51_75");
  expect(progressZoneForPercent(76)).toBe("76_100");
  expect(progressZoneForPercent(100)).toBe("76_100");
});

test("published courses stay sort-ordered and cursor-paginated", async () => {
  const t = createTest();
  await seedStudyContext(t);
  await t.run((ctx) => ctx.db.insert("courses", {
    slug: "second-published-study-course",
    titleSr: "Drugi kurs",
    titleEn: "Second course",
    subtitleSr: "Učenje",
    subtitleEn: "Study",
    descriptionSr: "Opis",
    descriptionEn: "Description",
    status: "published",
    sortOrder: 3,
    updatedAt: 3,
  }));

  const firstPage = await t.query(coursesApi.listPublishedCoursesPage, {
    paginationOpts: { cursor: null, numItems: 1 },
  });
  const secondPage = await t.query(coursesApi.listPublishedCoursesPage, {
    paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
  });
  expect(firstPage.page.map((course: { slug: string }) => course.slug)).toEqual(["study-course"]);
  expect(firstPage.isDone).toBe(false);
  expect(secondPage.page.map((course: { slug: string }) => course.slug)).toEqual([
    "second-published-study-course",
  ]);
  expect(secondPage.isDone).toBe(true);
});

test("availability is course-specific and suggestions include only active members in the same progress zone", async () => {
  const t = createTest();
  const ids = await seedStudyContext(t);
  await optIn(t, ids, [ids.creatorId, ids.sameZoneId, ids.differentZoneId, ids.fourthId]);
  await asUser(t, ids.fourthId).mutation(studyApi.setViewerAvailability, { courseId: ids.courseId, active: false });

  const suggestions = await asUser(t, ids.creatorId).query(studyApi.listPartnerSuggestions, {
    courseId: ids.courseId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(suggestions.viewerProgress).toMatchObject({ progressPercent: 25, progressZone: "0_25" });
  expect(suggestions.page.map((member: { userId: Id<"users"> }) => member.userId)).toEqual([ids.sameZoneId]);
  await expect(
    asUser(t, ids.creatorId).query(studyApi.listCommonStudyCoursesPage, {
      userId: ids.sameZoneId,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  ).resolves.toMatchObject({
    page: [{ courseId: ids.courseId, slug: "study-course", matchingAvailable: true, progressZone: "0_25" }],
  });

  await asUser(t, ids.creatorId).mutation(coursesApi.markProgress, {
    lessonId: ids.lessonIds[1],
    completed: true,
    positionSeconds: 60,
  });
  const refreshedAvailability = await asUser(t, ids.creatorId).query(studyApi.getViewerAvailability, {});
  expect(refreshedAvailability.find((row: { courseId: Id<"courses"> }) => row.courseId === ids.courseId)).toMatchObject({
    progressPercent: 50,
    progressZone: "26_50",
  });
  await expect(
    asUser(t, ids.creatorId).query(studyApi.getViewerCourseAvailability, { courseId: ids.courseId }),
  ).resolves.toMatchObject({
    userId: ids.creatorId,
    courseId: ids.courseId,
    active: true,
    progressPercent: 50,
    progressZone: "26_50",
  });

  await expect(
    asUser(t, ids.creatorId).mutation(studyApi.setViewerAvailability, { courseId: ids.draftCourseId, active: true }),
  ).rejects.toThrow("Objavljeni kurs");
  await expect(
    asUser(t, ids.adminId).mutation(studyApi.setViewerAvailability, { courseId: ids.courseId, active: true }),
  ).rejects.toThrow("Admin nalozi");
});

test.each([
  ["viewer blocks candidate", true],
  ["candidate blocks viewer", false],
] as const)("blocked study pairs stay out of suggestions and cannot create invites: %s", async (_label, viewerBlocksCandidate) => {
  const t = createTest();
  const ids = await seedStudyContext(t);
  await optIn(t, ids, [ids.creatorId, ids.sameZoneId]);
  await t.run(async (ctx) => {
    await ctx.db.insert("chatBlocks", {
      blockerId: viewerBlocksCandidate ? ids.creatorId : ids.sameZoneId,
      blockedId: viewerBlocksCandidate ? ids.sameZoneId : ids.creatorId,
      createdAt: Date.now(),
    });
  });

  const creator = asUser(t, ids.creatorId);
  const suggestions = await creator.query(studyApi.listPartnerSuggestions, {
    courseId: ids.courseId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(suggestions.page.map((member: { userId: Id<"users"> }) => member.userId)).not.toContain(ids.sameZoneId);
  await expect(
    creator.mutation(studyApi.createPartnerInvite, {
      recipientId: ids.sameZoneId,
      courseId: ids.courseId,
    }),
  ).rejects.toThrow("CHAT_BLOCKED");
  await expect(t.run(async (ctx) => ctx.db.query("studyPartnerInvites").take(1))).resolves.toEqual([]);
});

test("partner invites are unique, private, cooldown-protected and create one accepted direct chat", async () => {
  const t = createTest();
  const ids = await seedStudyContext(t);
  await optIn(t, ids, [ids.creatorId, ids.sameZoneId]);
  await t.run((ctx) => markStudyHubAggregateReady(ctx));
  const creator = asUser(t, ids.creatorId);
  const recipient = asUser(t, ids.sameZoneId);
  const unrelated = asUser(t, ids.unrelatedId);

  await expect(
    creator.mutation(studyApi.createPartnerInvite, { recipientId: ids.sameZoneId, courseId: ids.courseId, message: "Nije dozvoljeno" }),
  ).rejects.toThrow();
  const first = await creator.mutation(studyApi.createPartnerInvite, { recipientId: ids.sameZoneId, courseId: ids.courseId });
  await expect(creator.query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    pendingPartnerInviteCount: 0,
    pendingOutgoingPartnerInviteCount: 1,
    activePartnershipCount: 0,
  });
  await expect(recipient.query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    pendingPartnerInviteCount: 1,
    pendingOutgoingPartnerInviteCount: 0,
    activePartnershipCount: 0,
  });
  const outgoing = await creator.query(studyApi.listViewerPartnerInvites, {
    direction: "outgoing",
    status: "pending",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(outgoing.page[0]).toMatchObject({
    inviteId: first.inviteId,
    counterpart: { userId: ids.sameZoneId, username: "same_zone" },
    course: { courseId: ids.courseId, titleSr: "Kurs za partnerstvo" },
  });
  await expect(creator.mutation(studyApi.createPartnerInvite, { recipientId: ids.sameZoneId, courseId: ids.courseId })).rejects.toThrow("već na čekanju");
  await expect(unrelated.mutation(studyApi.respondToPartnerInvite, { inviteId: first.inviteId, decision: "accept" })).rejects.toThrow("nije pronađen");
  await expect(recipient.mutation(studyApi.respondToPartnerInvite, { inviteId: first.inviteId, decision: "decline" })).resolves.toEqual({
    partnershipId: null,
    conversationId: null,
  });
  await expect(recipient.mutation(studyApi.createPartnerInvite, { recipientId: ids.creatorId, courseId: ids.courseId })).rejects.toThrow("15 dana");

  await t.run(async (ctx) => ctx.db.patch(first.inviteId, { cooldownUntil: Date.now() - 1 }));
  const second = await recipient.mutation(studyApi.createPartnerInvite, { recipientId: ids.creatorId, courseId: ids.courseId });
  const accepted = await creator.mutation(studyApi.respondToPartnerInvite, { inviteId: second.inviteId, decision: "accept" });
  expect(accepted.partnershipId).toBeTruthy();
  expect(accepted.conversationId).toBeTruthy();
  await expect(creator.query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    pendingPartnerInviteCount: 0,
    pendingOutgoingPartnerInviteCount: 0,
    activePartnershipCount: 1,
  });
  await expect(creator.mutation(studyApi.respondToPartnerInvite, { inviteId: second.inviteId, decision: "accept" })).resolves.toEqual(accepted);

  const state = await t.run(async (ctx) => ({
    partnerships: await ctx.db.query("studyPartnerships").withIndex("by_pairKey_and_courseId", (q) => q.eq("pairKey", pairKey(ids.creatorId, ids.sameZoneId)).eq("courseId", ids.courseId)).take(5),
    conversations: await ctx.db.query("chatConversations").withIndex("by_directKey", (q) => q.eq("directKey", `direct:${pairKey(ids.creatorId, ids.sameZoneId)}`)).take(5),
    messages: await ctx.db.query("chatMessages").withIndex("by_conversationId_and_sequence", (q) => q.eq("conversationId", accepted.conversationId)).take(10),
  }));
  expect(state.partnerships).toHaveLength(1);
  expect(state.conversations).toHaveLength(1);
  expect(state.messages).toHaveLength(1);
  expect(state.messages[0]).toMatchObject({ kind: "system" });

  expect(await unrelated.query(studyApi.listViewerPartnerships, {})).toEqual([]);
  await expect(unrelated.query(studyApi.getPartnerInvite, { inviteId: second.inviteId })).rejects.toThrow("Forbidden");
  await expect(asUser(t, ids.adminId).query(studyApi.getPartnerInvite, { inviteId: second.inviteId })).resolves.toMatchObject({
    inviteId: second.inviteId,
    status: "accepted",
  });
  await expect(unrelated.query(studyApi.getStudyPartnership, { partnershipId: accepted.partnershipId })).rejects.toThrow("Forbidden");
  await expect(asUser(t, ids.adminId).query(studyApi.getStudyPartnership, { partnershipId: accepted.partnershipId })).resolves.toMatchObject({
    partnershipId: accepted.partnershipId,
    conversationId: accepted.conversationId,
  });
  await expect(
    unrelated.query(studyApi.listViewerPartnerInvites, {
      direction: "incoming",
      status: "pending",
      paginationOpts: { cursor: null, numItems: 10 },
      userId: ids.creatorId,
    }),
  ).rejects.toThrow();
});

test("study hub summary falls back before backfill and cuts over idempotently", async () => {
  const t = createTest();
  const ids = await seedStudyContext(t);
  const inviteId = await t.run((ctx) => ctx.db.insert("studyPartnerInvites", {
    pairKey: pairKey(ids.creatorId, ids.sameZoneId),
    senderId: ids.creatorId,
    recipientId: ids.sameZoneId,
    courseId: ids.courseId,
    status: "pending",
    createdAt: 10,
    updatedAt: 10,
  }));
  const recipient = asUser(t, ids.sameZoneId);

  await expect(recipient.query(studyApi.getStudyHubSummary, {})).resolves.toEqual({
    pendingPartnerInviteCount: 1,
    pendingOutgoingPartnerInviteCount: 0,
    pendingStudyGroupInviteCount: 0,
    activePartnershipCount: 0,
    activeStudyGroupCount: 0,
  });

  await t.run(async (ctx) => {
    const invite = await ctx.db.get(inviteId);
    if (!invite) throw new Error("Missing invite fixture");
    await syncStudyPartnerInviteSummary(ctx, null, invite);
    await syncStudyPartnerInviteSummary(ctx, null, invite);
    await markStudyHubAggregateReady(ctx);
  });

  await expect(recipient.query(studyApi.getStudyHubSummary, {})).resolves.toEqual({
    pendingPartnerInviteCount: 1,
    pendingOutgoingPartnerInviteCount: 0,
    pendingStudyGroupInviteCount: 0,
    activePartnershipCount: 0,
    activeStudyGroupCount: 0,
  });
});

test("study group activates at creator plus two accepts, reuses chat, paginates members and stays active with two", async () => {
  const t = createTest();
  const ids = await seedStudyContext(t);
  await seedPartnerships(t, ids.creatorId, [ids.sameZoneId, ids.differentZoneId, ids.fourthId], ids.courseId);
  await t.run((ctx) => markStudyHubAggregateReady(ctx));
  const creator = asUser(t, ids.creatorId);

  await expect(
    creator.mutation(studyApi.createStudyGroupProposal, {
      courseId: ids.courseId,
      name: "Prevelika grupa",
      memberIds: Array.from({ length: 41 }, () => ids.sameZoneId),
    }),
  ).rejects.toThrow("INVITE_IN_BATCH_LIMIT");
  await expect(
    creator.mutation(studyApi.createStudyGroupProposal, { courseId: ids.courseId, name: "Premala grupa", memberIds: [ids.sameZoneId] }),
  ).rejects.toThrow("najmanje dva");
  await expect(
    creator.mutation(studyApi.createStudyGroupProposal, {
      courseId: ids.courseId,
      name: "Pogrešan partner",
      memberIds: [ids.sameZoneId, ids.unrelatedId],
    }),
  ).rejects.toThrow("samo postojećim partnerima");

  const proposal = await creator.mutation(studyApi.createStudyGroupProposal, {
    courseId: ids.courseId,
    name: "AI grupa za učenje",
    memberIds: [ids.sameZoneId, ids.differentZoneId, ids.fourthId],
  });
  await expect(creator.query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    pendingStudyGroupInviteCount: 0,
    activeStudyGroupCount: 1,
  });
  await expect(asUser(t, ids.sameZoneId).query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    pendingStudyGroupInviteCount: 1,
    activeStudyGroupCount: 0,
  });
  await expect(creator.query(studyApi.listViewerStudyGroups, {})).resolves.toMatchObject([
    { groupId: proposal.groupId, status: "forming", membershipRole: "owner" },
  ]);
  const pendingForSameZone = await asUser(t, ids.sameZoneId).query(studyApi.listViewerStudyGroupInvites, {
    status: "pending",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(pendingForSameZone.page[0]).toMatchObject({
    group: { groupId: proposal.groupId, name: "AI grupa za učenje", status: "forming" },
    inviter: { userId: ids.creatorId, username: "study_creator" },
    course: { courseId: ids.courseId },
  });
  await expect(asUser(t, ids.unrelatedId).query(studyApi.getStudyGroup, { groupId: proposal.groupId })).rejects.toThrow("Forbidden");
  await expect(asUser(t, ids.adminId).query(studyApi.getStudyGroup, { groupId: proposal.groupId })).resolves.toMatchObject({ groupId: proposal.groupId });

  const invites = await t.run(async (ctx) => ctx.db
    .query("studyGroupInvites")
    .withIndex("by_groupId_and_status_and_createdAt", (q) => q.eq("groupId", proposal.groupId).eq("status", "pending"))
    .take(10));
  const inviteByUser = new Map(invites.map((invite) => [String(invite.userId), invite]));
  const sameInvite = inviteByUser.get(String(ids.sameZoneId))!;
  const differentInvite = inviteByUser.get(String(ids.differentZoneId))!;
  const fourthInvite = inviteByUser.get(String(ids.fourthId))!;

  const concurrentAccepts = await Promise.all([
    asUser(t, ids.sameZoneId).mutation(studyApi.respondToStudyGroupInvite, { inviteId: sameInvite._id, decision: "accept" }),
    asUser(t, ids.differentZoneId).mutation(studyApi.respondToStudyGroupInvite, { inviteId: differentInvite._id, decision: "accept" }),
  ]);
  expect(concurrentAccepts).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: "forming", activeMemberCount: 2, conversationId: null }),
    expect.objectContaining({ status: "active", activeMemberCount: 3 }),
  ]));
  const active = await creator.query(studyApi.getStudyGroup, { groupId: proposal.groupId });
  expect(active).toMatchObject({ status: "active", activeMemberCount: 3 });
  expect(active.conversationId).toBeTruthy();
  await expect(asUser(t, ids.sameZoneId).query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    pendingStudyGroupInviteCount: 0,
    activeStudyGroupCount: 1,
  });
  await expect(asUser(t, ids.differentZoneId).query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    pendingStudyGroupInviteCount: 0,
    activeStudyGroupCount: 1,
  });
  await expect(asUser(t, ids.sameZoneId).query(studyApi.listViewerStudyGroups, {})).resolves.toMatchObject([
    { groupId: proposal.groupId, status: "active", conversationId: active.conversationId },
  ]);

  const late = await asUser(t, ids.fourthId).mutation(studyApi.respondToStudyGroupInvite, { inviteId: fourthInvite._id, decision: "accept" });
  expect(late).toMatchObject({ status: "active", activeMemberCount: 4, conversationId: active.conversationId });
  await expect(asUser(t, ids.fourthId).query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    pendingStudyGroupInviteCount: 0,
    activeStudyGroupCount: 1,
  });
  const chatState = await t.run(async (ctx) => ({
    conversations: await ctx.db.query("chatConversations").withIndex("by_studyGroupId", (q) => q.eq("studyGroupId", proposal.groupId)).take(5),
    messages: await ctx.db.query("chatMessages").withIndex("by_conversationId_and_sequence", (q) => q.eq("conversationId", active.conversationId)).take(10),
  }));
  expect(chatState.conversations).toHaveLength(1);
  expect(chatState.messages).toHaveLength(1);

  const firstPage = await creator.query(studyApi.listStudyGroupMembersPage, {
    groupId: proposal.groupId,
    paginationOpts: { cursor: null, numItems: 2 },
  });
  expect(firstPage.page).toHaveLength(2);
  expect(firstPage.isDone).toBe(false);
  const secondPage = await creator.query(studyApi.listStudyGroupMembersPage, {
    groupId: proposal.groupId,
    paginationOpts: { cursor: firstPage.continueCursor, numItems: 2 },
  });
  expect(secondPage.page).toHaveLength(2);

  await asUser(t, ids.sameZoneId).mutation(studyApi.leaveStudyGroup, { groupId: proposal.groupId });
  const exitedChatMembership = await t.run((ctx) =>
    ctx.db
      .query("chatMembers")
      .withIndex("by_conversationId_and_userId", (q) =>
        q.eq("conversationId", active.conversationId).eq("userId", ids.sameZoneId),
      )
      .unique(),
  );
  expect(exitedChatMembership).toMatchObject({
    status: "left",
    unreadCount: 0,
    hasUnread: false,
    isPinned: false,
    isArchived: true,
  });
  const afterSecondLeave = await asUser(t, ids.differentZoneId).mutation(studyApi.leaveStudyGroup, { groupId: proposal.groupId });
  expect(afterSecondLeave).toMatchObject({ status: "active", activeMemberCount: 2 });
  expect(await creator.query(studyApi.getStudyGroup, { groupId: proposal.groupId })).toMatchObject({ status: "active", activeMemberCount: 2 });
  await expect(asUser(t, ids.sameZoneId).query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    activeStudyGroupCount: 0,
  });
  await expect(asUser(t, ids.differentZoneId).query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    activeStudyGroupCount: 0,
  });
  await expect(creator.query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    activeStudyGroupCount: 1,
  });
});

test("partnership and study-group pages stay cursor-paginated beyond one hundred rows", async () => {
  const t = createTest();
  const ids = await seedStudyContext(t);
  const rowCount = 125;
  await t.run(async (ctx) => {
    for (let index = 0; index < rowCount; index += 1) {
      const now = index + 10;
      const partnerId = await ctx.db.insert("users", {
        email: `scale-partner-${index}@example.com`,
        name: `Scale Partner ${index}`,
        username: `scale_partner_${index}`,
        role: "student",
        language: "sr",
        createdAt: now,
        updatedAt: now,
      });
      const key = pairKey(ids.creatorId, partnerId);
      const inviteId = await ctx.db.insert("studyPartnerInvites", {
        pairKey: key,
        senderId: ids.creatorId,
        recipientId: partnerId,
        courseId: ids.courseId,
        status: "accepted",
        createdAt: now,
        respondedAt: now,
        updatedAt: now,
      });
      const partnershipId = await ctx.db.insert("studyPartnerships", {
        pairKey: key,
        userAId: ids.creatorId,
        userBId: partnerId,
        courseId: ids.courseId,
        createdFromInviteId: inviteId,
        createdAt: now,
        updatedAt: now,
      });
      const partnership = await ctx.db.get(partnershipId);
      if (partnership) {
        await ensureStudyPartnershipMembers(ctx, partnership);
        await syncStudyPartnershipSummary(ctx, null, partnership);
      }

      const groupId = await ctx.db.insert("studyGroups", {
        courseId: ids.courseId,
        creatorId: ids.creatorId,
        name: `Scale Group ${index}`,
        status: "active",
        activeMemberCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      const membershipId = await ctx.db.insert("studyGroupMembers", {
        groupId,
        userId: ids.creatorId,
        courseId: ids.courseId,
        role: "owner",
        active: true,
        joinedAt: now,
      });
      const membership = await ctx.db.get(membershipId);
      if (membership) await syncStudyGroupMembershipSummary(ctx, null, membership);
    }
  });
  await t.run((ctx) => markStudyHubAggregateReady(ctx));

  const viewer = asUser(t, ids.creatorId);
  const partnershipIds: string[] = [];
  let partnershipCursor: string | null = null;
  let partnershipDone = false;
  while (!partnershipDone) {
    const result: {
      page: Array<{ partnershipId: Id<"studyPartnerships"> }>;
      continueCursor: string;
      isDone: boolean;
    } = await viewer.query(studyApi.listViewerPartnershipsPage, {
      courseId: ids.courseId,
      paginationOpts: { cursor: partnershipCursor, numItems: 23 },
    });
    partnershipIds.push(...result.page.map((row: { partnershipId: Id<"studyPartnerships"> }) => String(row.partnershipId)));
    partnershipCursor = result.continueCursor;
    partnershipDone = result.isDone;
  }

  const groupIds: string[] = [];
  let groupCursor: string | null = null;
  let groupDone = false;
  while (!groupDone) {
    const result: {
      page: Array<{ groupId: Id<"studyGroups"> }>;
      continueCursor: string;
      isDone: boolean;
    } = await viewer.query(studyApi.listViewerStudyGroupsPage, {
      courseId: ids.courseId,
      paginationOpts: { cursor: groupCursor, numItems: 19 },
    });
    groupIds.push(...result.page.map((row: { groupId: Id<"studyGroups"> }) => String(row.groupId)));
    groupCursor = result.continueCursor;
    groupDone = result.isDone;
  }

  expect(new Set(partnershipIds).size).toBe(rowCount);
  expect(new Set(groupIds).size).toBe(rowCount);
  await expect(viewer.query(studyApi.getStudyHubSummary, {})).resolves.toMatchObject({
    activePartnershipCount: rowCount,
    activeStudyGroupCount: rowCount,
  });
});
