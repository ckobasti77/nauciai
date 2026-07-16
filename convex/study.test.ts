/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterAll, beforeAll, expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { progressZoneForPercent } from "./study";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

beforeAll(() => {
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com";
});

afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

const studyApi = {
  setViewerAvailability: makeFunctionReference<"mutation">("study:setViewerAvailability"),
  listPartnerSuggestions: makeFunctionReference<"query">("study:listPartnerSuggestions"),
  createPartnerInvite: makeFunctionReference<"mutation">("study:createPartnerInvite"),
  respondToPartnerInvite: makeFunctionReference<"mutation">("study:respondToPartnerInvite"),
  listViewerPartnerInvites: makeFunctionReference<"query">("study:listViewerPartnerInvites"),
  getPartnerInvite: makeFunctionReference<"query">("study:getPartnerInvite"),
  listViewerPartnerships: makeFunctionReference<"query">("study:listViewerPartnerships"),
  getStudyPartnership: makeFunctionReference<"query">("study:getStudyPartnership"),
  createStudyGroupProposal: makeFunctionReference<"mutation">("study:createStudyGroupProposal"),
  listViewerStudyGroupInvites: makeFunctionReference<"query">("study:listViewerStudyGroupInvites"),
  listViewerStudyGroups: makeFunctionReference<"query">("study:listViewerStudyGroups"),
  respondToStudyGroupInvite: makeFunctionReference<"mutation">("study:respondToStudyGroupInvite"),
  getStudyGroup: makeFunctionReference<"query">("study:getStudyGroup"),
  listStudyGroupMembersPage: makeFunctionReference<"query">("study:listStudyGroupMembersPage"),
  leaveStudyGroup: makeFunctionReference<"mutation">("study:leaveStudyGroup"),
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
      await ctx.db.insert("studyPartnerships", {
        pairKey: key,
        userAId: String(creatorId) < String(partnerId) ? creatorId : partnerId,
        userBId: String(creatorId) < String(partnerId) ? partnerId : creatorId,
        courseId,
        createdFromInviteId: inviteId,
        createdAt: 1,
        updatedAt: 1,
      });
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

test("availability is course-specific and suggestions include only active members in the same progress zone", async () => {
  const t = convexTest(schema, modules);
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
    asUser(t, ids.creatorId).mutation(studyApi.setViewerAvailability, { courseId: ids.draftCourseId, active: true }),
  ).rejects.toThrow("Objavljeni kurs");
  await expect(
    asUser(t, ids.adminId).mutation(studyApi.setViewerAvailability, { courseId: ids.courseId, active: true }),
  ).rejects.toThrow("Admin nalozi");
});

test("partner invites are unique, private, cooldown-protected and create one accepted direct chat", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedStudyContext(t);
  await optIn(t, ids, [ids.creatorId, ids.sameZoneId]);
  const creator = asUser(t, ids.creatorId);
  const recipient = asUser(t, ids.sameZoneId);
  const unrelated = asUser(t, ids.unrelatedId);

  await expect(
    creator.mutation(studyApi.createPartnerInvite, { recipientId: ids.sameZoneId, courseId: ids.courseId, message: "Nije dozvoljeno" }),
  ).rejects.toThrow();
  const first = await creator.mutation(studyApi.createPartnerInvite, { recipientId: ids.sameZoneId, courseId: ids.courseId });
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

test("study group activates at creator plus two accepts, reuses chat, paginates members and stays active with two", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedStudyContext(t);
  await seedPartnerships(t, ids.creatorId, [ids.sameZoneId, ids.differentZoneId, ids.fourthId], ids.courseId);
  const creator = asUser(t, ids.creatorId);

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
  await expect(asUser(t, ids.sameZoneId).query(studyApi.listViewerStudyGroups, {})).resolves.toMatchObject([
    { groupId: proposal.groupId, status: "active", conversationId: active.conversationId },
  ]);

  const late = await asUser(t, ids.fourthId).mutation(studyApi.respondToStudyGroupInvite, { inviteId: fourthInvite._id, decision: "accept" });
  expect(late).toMatchObject({ status: "active", activeMemberCount: 4, conversationId: active.conversationId });
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
  const afterSecondLeave = await asUser(t, ids.differentZoneId).mutation(studyApi.leaveStudyGroup, { groupId: proposal.groupId });
  expect(afterSecondLeave).toMatchObject({ status: "active", activeMemberCount: 2 });
  expect(await creator.query(studyApi.getStudyGroup, { groupId: proposal.groupId })).toMatchObject({ status: "active", activeMemberCount: 2 });
});
