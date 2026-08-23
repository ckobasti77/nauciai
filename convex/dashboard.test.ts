/// <reference types="vite/client" />

import aggregateTest from "@convex-dev/aggregate/test";
import { convexTest, type TestConvex } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

// Vezivanje šeme čuva imena indeksa u tipovima (falWebhook.test.ts obrazac);
// `ReturnType<typeof convexTest>` bi izgubilo generic i `withIndex` bi popucao.
type TestConvexWithSchema = TestConvex<typeof schema>;

// `getDashboardOverview` komponuje chatInbox + studyHub agregate; registruj oba.
function createTest(): TestConvexWithSchema {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "chatInbox");
  aggregateTest.register(t, "studyHub");
  return t;
}

beforeAll(() => {
  process.env.INITIAL_ADMIN_EMAILS = "dash-admin@example.com";
});
afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

function asUser(t: TestConvexWithSchema, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `dash-test|${userId}` });
}

async function seedUser(
  t: TestConvexWithSchema,
  opts: { email?: string; role?: "student" | "pro_student" | "moderator" | "admin" } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      email: opts.email ?? "student@example.com",
      name: "Dash User",
      username: "dash_user",
      role: opts.role ?? "student",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

async function seedUnreadConversations(
  t: TestConvexWithSchema,
  userId: Id<"users">,
  count: number,
) {
  await t.run(async (ctx) => {
    const otherId = await ctx.db.insert("users", {
      email: "peer@example.com",
      name: "Sagovornik",
      username: "peer",
      role: "student",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    });
    for (let i = 0; i < count; i += 1) {
      const at = 100 + i;
      const conversationId = await ctx.db.insert("chatConversations", {
        kind: "direct",
        createdById: otherId,
        nextSequence: 2,
        lastMessageSequence: 1,
        lastMessageAt: at,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("chatMessages", {
        conversationId,
        sequence: 1,
        senderId: otherId,
        senderName: "Sagovornik",
        kind: "user",
        body: `Poruka ${i}`,
        mentionUserIds: [],
        imageCount: 0,
        createdAt: at,
      });
      await ctx.db.insert("chatMembers", {
        conversationId,
        userId,
        conversationKind: "direct",
        role: "member",
        status: "active",
        requestStatus: "accepted",
        lastReadSequence: 0,
        lastDeliveredSequence: 1,
        lastDeliveredAt: at,
        unreadCount: 1,
        hasUnread: true,
        isArchived: false,
        isPinned: false,
        historyCutoffSequence: 0,
        invitedAt: 1,
        joinedAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("chatMembers", {
        conversationId,
        userId: otherId,
        conversationKind: "direct",
        role: "owner",
        status: "active",
        requestStatus: "accepted",
        lastReadSequence: 1,
        lastDeliveredSequence: 1,
        lastDeliveredAt: at,
        unreadCount: 0,
        hasUnread: false,
        isArchived: false,
        isPinned: false,
        historyCutoffSequence: 0,
        invitedAt: 1,
        joinedAt: 1,
        updatedAt: 1,
      });
    }
  });
}

test("neautentifikovan poziv → null", async () => {
  const t = createTest();
  await seedUser(t);
  expect(await t.query(api.dashboard.getDashboardOverview, {})).toBeNull();
});

test("prazan korisnik → sve liste prazne, percent 0, admin null", async () => {
  const t = createTest();
  const userId = await seedUser(t);
  const result = await asUser(t, userId).query(api.dashboard.getDashboardOverview, {});

  expect(result).not.toBeNull();
  expect(result?.resume).toBeNull();
  expect(result?.progress.percent).toBe(0);
  expect(result?.nextLessons).toEqual([]);
  expect(result?.activity).toEqual([]);
  expect(result?.messages.items).toEqual([]);
  expect(result?.messages.unreadTotal).toBe(0);
  expect(result?.community.items).toEqual([]);
  expect(result?.notifications.items).toEqual([]);
  expect(result?.studio.items).toEqual([]);
  expect(result?.studio.creditsBalance).toBe(0);
  expect(result?.study).toEqual({ pendingInvites: 0, partners: 0 });
  expect(result?.leaderboard).toBeNull();
  expect(result?.admin).toBeNull();
});

test("5 nepročitanih konverzacija → unreadTotal 5, items.length 3", async () => {
  const t = createTest();
  const userId = await seedUser(t);
  await seedUnreadConversations(t, userId, 5);

  const result = await asUser(t, userId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.messages.unreadTotal).toBe(5);
  expect(result?.messages.items).toHaveLength(3);
});

test("ne-admin nikad ne dobija admin granu", async () => {
  const t = createTest();
  const userId = await seedUser(t, { email: "plain@example.com", role: "student" });
  const result = await asUser(t, userId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.admin).toBeNull();
});

test("admin dobija pendingApprovals", async () => {
  const t = createTest();
  const adminId = await seedUser(t, { email: "dash-admin@example.com" });
  await t.run((ctx) =>
    ctx.db.insert("communityPosts", {
      authorId: adminId,
      language: "sr",
      title: "Na čekanju",
      body: "Tekst",
      visibility: "members",
      status: "pending",
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  const result = await asUser(t, adminId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.admin).not.toBeNull();
  expect(result?.admin?.pendingApprovals).toBeGreaterThanOrEqual(1);
  expect(result?.admin?.readiness.ready).toBe(true);
});
