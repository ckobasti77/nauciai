/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterAll, beforeAll, expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

beforeAll(() => {
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com";
});

afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

const helpApi = {
  listActiveTopics: makeFunctionReference<"query">("helpTopics:listActiveTopics"),
  getViewerHelpProfile: makeFunctionReference<"query">("helpTopics:getViewerHelpProfile"),
  setViewerHelpProfile: makeFunctionReference<"mutation">("helpTopics:setViewerHelpProfile"),
  proposeTopic: makeFunctionReference<"mutation">("helpTopics:proposeTopic"),
  listPendingSuggestions: makeFunctionReference<"query">("helpTopics:listPendingSuggestions"),
  reviewSuggestion: makeFunctionReference<"mutation">("helpTopics:reviewSuggestion"),
};

async function seedHelpContext(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const viewerId = await ctx.db.insert("users", {
      email: "help-viewer@example.com",
      name: "Help Viewer",
      username: "help_viewer",
      role: "student",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    });
    const adminId = await ctx.db.insert("users", {
      email: "admin@example.com",
      name: "Help Admin",
      username: "help_admin",
      role: "admin",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    });
    const courseId = await ctx.db.insert("courses", {
      slug: "published-help-course",
      titleSr: "Objavljeni kurs",
      titleEn: "Published course",
      subtitleSr: "Pomoć",
      subtitleEn: "Help",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: "published",
      sortOrder: 1,
      updatedAt: 1,
    });
    const draftCourseId = await ctx.db.insert("courses", {
      slug: "draft-help-course",
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
    return { viewerId, adminId, courseId, draftCourseId };
  });
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

test("suggested help topics stay private until an admin approves them", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedHelpContext(t);
  const viewer = asUser(t, ids.viewerId);
  const admin = asUser(t, ids.adminId);

  const proposal = await viewer.mutation(helpApi.proposeTopic, { name: "  Prompt   inženjering ", courseId: ids.courseId });
  expect(proposal.status).toBe("pending");
  await expect(viewer.query(helpApi.listPendingSuggestions, { paginationOpts: { cursor: null, numItems: 10 } })).rejects.toThrow("Forbidden");
  expect(await viewer.query(helpApi.listActiveTopics, { courseId: ids.courseId })).toEqual([]);

  const approved = await admin.mutation(helpApi.reviewSuggestion, {
    suggestionId: proposal.suggestionId,
    decision: "approve",
  });
  expect(approved.status).toBe("approved");
  const visible = await viewer.query(helpApi.listActiveTopics, { courseId: ids.courseId });
  expect(visible).toMatchObject([{ topicId: approved.topicId, name: "Prompt inženjering", courseId: ids.courseId }]);

  const state = await t.run(async (ctx) => ({
    suggestion: await ctx.db.get(proposal.suggestionId),
    topic: await ctx.db.get(approved.topicId),
  }));
  expect(state.suggestion).toMatchObject({ status: "approved", reviewedBy: ids.adminId, resolvedTopicId: approved.topicId });
  expect(state.topic).toMatchObject({ active: true, createdBy: ids.viewerId });
});

test("help profile is atomic, accepts only active topics, and caps selection at five", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedHelpContext(t);
  const viewer = asUser(t, ids.viewerId);
  const topicIds = await t.run(async (ctx) => {
    const result: Id<"helpTopics">[] = [];
    for (let index = 0; index < 6; index += 1) {
      result.push(await ctx.db.insert("helpTopics", {
        name: `Tema ${index + 1}`,
        normalizedName: `tema ${index + 1}`,
        active: true,
        createdBy: ids.adminId,
        createdAt: index + 1,
        updatedAt: index + 1,
      }));
    }
    return result;
  });
  const five = topicIds.slice(0, 5).map((topicId, index) => ({ topicId, mode: index % 2 === 0 ? "seeking" : "offering" }));
  await expect(viewer.mutation(helpApi.setViewerHelpProfile, { status: "both", topics: five })).resolves.toEqual({ status: "both", topicCount: 5 });
  const profile = await viewer.query(helpApi.getViewerHelpProfile, {});
  expect(profile.status).toBe("both");
  expect(profile.topics).toHaveLength(5);

  await expect(
    viewer.mutation(helpApi.setViewerHelpProfile, {
      status: "both",
      topics: topicIds.map((topicId) => ({ topicId, mode: "both" })),
    }),
  ).rejects.toThrow("najviše 5");
  await expect(viewer.mutation(helpApi.setViewerHelpProfile, { status: null, topics: [{ topicId: topicIds[0], mode: "seeking" }] })).rejects.toThrow("Izaberi status");

  const inactiveTopicId = await t.run((ctx) => ctx.db.insert("helpTopics", {
    name: "Skrivena tema",
    normalizedName: "skrivena tema",
    active: false,
    createdBy: ids.adminId,
    createdAt: 10,
    updatedAt: 10,
  }));
  await expect(
    viewer.mutation(helpApi.setViewerHelpProfile, { status: "seeking", topics: [{ topicId: inactiveTopicId, mode: "seeking" }] }),
  ).rejects.toThrow("nije javno dostupna");
  expect((await viewer.query(helpApi.getViewerHelpProfile, {})).topics).toHaveLength(5);
});

test("global and course scopes stay separate while admin can merge or reject suggestions", async () => {
  const t = convexTest(schema, modules);
  const ids = await seedHelpContext(t);
  const viewer = asUser(t, ids.viewerId);
  const admin = asUser(t, ids.adminId);
  const globalTopicId = await t.run((ctx) => ctx.db.insert("helpTopics", {
    name: "Python",
    normalizedName: "python",
    active: true,
    createdBy: ids.adminId,
    createdAt: 1,
    updatedAt: 1,
  }));

  expect(await viewer.mutation(helpApi.proposeTopic, { name: "PYTHON" })).toEqual({ status: "existing", topicId: globalTopicId });
  await expect(viewer.mutation(helpApi.proposeTopic, { name: "Nacrt tema", courseId: ids.draftCourseId })).rejects.toThrow("Objavljeni kurs");

  const mergeProposal = await viewer.mutation(helpApi.proposeTopic, { name: "Python pomoć" });
  const courseProposal = await viewer.mutation(helpApi.proposeTopic, { name: "Python pomoć", courseId: ids.courseId });
  await expect(
    admin.mutation(helpApi.reviewSuggestion, { suggestionId: courseProposal.suggestionId, decision: "merge", topicId: globalTopicId }),
  ).rejects.toThrow("istog opsega");
  await expect(
    viewer.mutation(helpApi.reviewSuggestion, { suggestionId: mergeProposal.suggestionId, decision: "merge", topicId: globalTopicId }),
  ).rejects.toThrow("Forbidden");
  await expect(
    admin.mutation(helpApi.reviewSuggestion, { suggestionId: mergeProposal.suggestionId, decision: "merge", topicId: globalTopicId }),
  ).resolves.toEqual({ status: "merged", topicId: globalTopicId });
  await expect(
    admin.mutation(helpApi.reviewSuggestion, { suggestionId: courseProposal.suggestionId, decision: "reject", reason: "Preusko" }),
  ).resolves.toEqual({ status: "rejected", topicId: null });

  expect(await viewer.query(helpApi.listActiveTopics, {})).toMatchObject([{ topicId: globalTopicId }]);
  expect(await viewer.query(helpApi.listActiveTopics, { courseId: ids.courseId })).toMatchObject([{ topicId: globalTopicId }]);
});
