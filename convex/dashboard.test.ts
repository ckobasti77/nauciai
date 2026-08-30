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
  expect(result?.firstRun).toEqual({ hasUnlockedCourse: false, hasCommunityPost: false });
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

// ── firstRun: signali za checklist prvih koraka (U4) ─────────────────────────
// Ovo su jedina dva podatka koja pozdravni hero na `/app` ne može da izvede iz
// onoga što je agregat već nosio; bez njih bi se koraci „štiklirali" iz
// pretpostavke.

async function seedCourse(t: TestConvexWithSchema, slug = "kurs") {
  return t.run((ctx) =>
    ctx.db.insert("courses", {
      slug,
      titleSr: "Osnove",
      titleEn: "Basics",
      subtitleSr: "Podnaslov",
      subtitleEn: "Subtitle",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: "published" as const,
      sortOrder: 10,
      updatedAt: 1,
    }),
  );
}

test("firstRun: aktivan upis → hasUnlockedCourse true", async () => {
  const t = createTest();
  const userId = await seedUser(t);
  const courseId = await seedCourse(t);
  await t.run((ctx) =>
    ctx.db.insert("enrollments", { userId, courseId, status: "active", startedAt: 1, updatedAt: 1 }),
  );

  const result = await asUser(t, userId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.firstRun.hasUnlockedCourse).toBe(true);
});

test("firstRun: blokiran upis se ne broji kao otključan kurs", async () => {
  const t = createTest();
  const userId = await seedUser(t);
  const courseId = await seedCourse(t);
  await t.run((ctx) =>
    ctx.db.insert("enrollments", { userId, courseId, status: "blocked", startedAt: 1, updatedAt: 1 }),
  );

  const result = await asUser(t, userId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.firstRun.hasUnlockedCourse).toBe(false);
});

test("firstRun: staff ima otključan kurs i bez upisa", async () => {
  const t = createTest();
  const userId = await seedUser(t, { email: "pro@example.com", role: "pro_student" });
  await seedCourse(t);

  const result = await asUser(t, userId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.firstRun.hasUnlockedCourse).toBe(true);
});

test("firstRun: sopstvena objava → hasCommunityPost true", async () => {
  const t = createTest();
  const userId = await seedUser(t);
  await t.run((ctx) =>
    ctx.db.insert("communityPosts", {
      authorId: userId,
      language: "sr",
      title: "Moje pitanje",
      body: "Tekst",
      visibility: "members",
      status: "published",
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  const result = await asUser(t, userId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.firstRun.hasCommunityPost).toBe(true);
});

test("firstRun: tuđa objava NE štiklira korak zajednice", async () => {
  const t = createTest();
  const userId = await seedUser(t);
  const otherId = await seedUser(t, { email: "drugi@example.com" });
  await t.run((ctx) =>
    ctx.db.insert("communityPosts", {
      authorId: otherId,
      language: "sr",
      title: "Tuđe pitanje",
      body: "Tekst",
      visibility: "members",
      status: "published",
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  const result = await asUser(t, userId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.firstRun.hasCommunityPost).toBe(false);
});

// ── admin prozori: nacrti + poslednji registrovani (U4) ──────────────────────

test("admin: nacrti smera i kursa stižu sa id-jevima za deep link", async () => {
  const t = createTest();
  const adminId = await seedUser(t, { email: "dash-admin@example.com" });
  const trackId = await t.run((ctx) =>
    ctx.db.insert("courseTracks", {
      slug: "smer-nacrt",
      titleSr: "Smer u nacrtu",
      titleEn: "Draft track",
      status: "draft" as const,
      sortOrder: 10,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("courses", {
      trackId,
      slug: "kurs-nacrt",
      titleSr: "Kurs u nacrtu",
      titleEn: "Draft course",
      subtitleSr: "Podnaslov",
      subtitleEn: "Subtitle",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: "draft" as const,
      sortOrder: 10,
      updatedAt: 1,
    }),
  );

  const result = await asUser(t, adminId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.admin?.drafts.total).toBe(2);
  const kinds = result?.admin?.drafts.items.map((item) => item.kind);
  expect(kinds).toEqual(["track", "course"]);
  const course = result?.admin?.drafts.items.find((item) => item.kind === "course");
  expect(course?.courseId).not.toBeNull();
  expect(course?.trackId).toBe(trackId);
  expect(course?.title.sr).toBe("Kurs u nacrtu");
});

test("admin: objavljen sadržaj ne ulazi u nacrte", async () => {
  const t = createTest();
  const adminId = await seedUser(t, { email: "dash-admin@example.com" });
  await seedCourse(t);

  const result = await asUser(t, adminId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.admin?.drafts.total).toBe(0);
  expect(result?.admin?.drafts.items).toEqual([]);
});

test("admin: poslednji registrovani, najviše tri, bez spojenih naloga", async () => {
  const t = createTest();
  const adminId = await seedUser(t, { email: "dash-admin@example.com" });
  const mergedTargetId = await seedUser(t, { email: "meta@example.com" });
  await t.run(async (ctx) => {
    for (let i = 0; i < 4; i += 1) {
      await ctx.db.insert("users", {
        email: `novi${i}@example.com`,
        name: `Novi ${i}`,
        username: `novi_${i}`,
        role: "student",
        language: "sr",
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      });
    }
    await ctx.db.insert("users", {
      email: "spojen@example.com",
      name: "Spojen",
      username: "spojen",
      role: "student",
      language: "sr",
      mergedInto: mergedTargetId,
      createdAt: 9999,
      updatedAt: 9999,
    });
  });

  const result = await asUser(t, adminId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.admin?.recentUsers).toHaveLength(3);
  expect(result?.admin?.recentUsers.map((user) => user.name)).not.toContain("Spojen");
  // `order("desc")` je po vremenu upisa, pa je poslednji registrovan prvi u listi.
  expect(result?.admin?.recentUsers[0]?.username).toBe("novi_3");
});

test("ne-admin ne dobija ni nacrte ni listu korisnika", async () => {
  const t = createTest();
  const userId = await seedUser(t, { email: "plain@example.com", role: "student" });
  await seedCourse(t);
  const result = await asUser(t, userId).query(api.dashboard.getDashboardOverview, {});
  expect(result?.admin).toBeNull();
});
