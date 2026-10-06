/// <reference types="vite/client" />

/**
 * Nedeljne lige (K27, G9) i kreativni par sa pozivima (G10).
 *
 * Prihvatanje: liga se bira po XP-u (nikad po kreditima); nagrada za poziv stiže tek
 * kad nov prijatelj završi prvu lekciju I prvi rad, jednom, sa mesečnim plafonom i
 * zaštitom od farmovanja.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { INVITE_REWARD_CREDITS, INVITE_REWARDS_PER_MONTH } from "../lib/crea-community";
import { LEAGUE_COHORT_SIZE } from "../lib/crea-leagues";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { belgradeDayKey, belgradeWeekKey } from "./leaderboardCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;
type Seeded = { userId: Id<"users">; as: ReturnType<TestConvex["withIdentity"]> };

const DAY = 86_400_000;
/** Utorak 2026-10-06, podne po Beogradu. Prošla nedelja počinje 2026-09-28. */
const NOW = Date.parse("2026-10-06T10:00:00Z");
const TODAY = "2026-10-06";
const LAST_WEEK = "2026-09-28";

const SYNC_SECRET = "test-sync-secret";
const previousSyncSecret = process.env.WEBHOOK_SYNC_SECRET;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.WEBHOOK_SYNC_SECRET = SYNC_SECRET;
});
afterEach(() => {
  vi.useRealTimers();
  if (previousSyncSecret === undefined) delete process.env.WEBHOOK_SYNC_SECRET;
  else process.env.WEBHOOK_SYNC_SECRET = previousSyncSecret;
});

async function seedUser(t: TestConvex, email: string, opts: { role?: "student" | "moderator"; verified?: boolean } = {}): Promise<Seeded> {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: email,
      firstName: email.split("@")[0]!,
      lastName: "Ilić",
      username: email.split("@")[0]!.replace(/[^a-z0-9_]/g, "_"),
      role: opts.role ?? "student",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      ...(opts.verified === false ? {} : { emailVerificationTime: 1 }),
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, as: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function finishWork(t: TestConvex, userId: Id<"users">) {
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "nano-banana-2",
      kind: "image",
      provider: "google",
      params: JSON.stringify({ prompt: "pas" }),
      promptHash: "0".repeat(16),
      status: "done" as const,
      creditCost: 16,
      createdAt: Date.now(),
    }),
  );
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["izlaz"])));
  await t.mutation(internal.studio.finalizeOutput, { jobId, storageId, byteSize: 5 });
}

async function setWeekXp(t: TestConvex, userId: Id<"users">, weekKey: string, xp: number) {
  await t.run((ctx) =>
    ctx.db.insert("leaderboardStats", {
      userId,
      scopeKind: "global",
      scopeKey: "global",
      period: "week",
      periodKey: weekKey,
      xp,
      completedLessons: 0,
      completedTasks: 0,
      helpfulAnswers: 0,
      eligible: true,
      updatedAt: 1,
    }),
  );
}

async function lessonEvent(t: TestConvex, userId: Id<"users">) {
  await t.run((ctx) =>
    ctx.db.insert("leaderboardEvents", {
      userId,
      sourceType: "lesson",
      sourceId: `lekcija-${userId}`,
      points: 100,
      active: true,
      occurredAt: Date.now(),
      dayKey: belgradeDayKey(Date.now()),
      weekKey: belgradeWeekKey(Date.now()),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

describe("Nedeljne lige (G9)", () => {
  test("prvi rad u nedelji = ulazak u ligu; liga po XP-u prošle nedelje; osoblje nije u ligi", async () => {
    const t = makeT();
    const mila = await seedUser(t, "mila@example.com");
    await setWeekXp(t, mila.userId, LAST_WEEK, 200);
    expect(await mila.as.query(api.creaLeagues.myLeague, { todayKey: TODAY })).toMatchObject({ eligible: true, member: null, joinTier: 2 });
    await finishWork(t, mila.userId);
    const league = await mila.as.query(api.creaLeagues.myLeague, { todayKey: TODAY });
    expect(league).toMatchObject({ eligible: true, weekKey: belgradeWeekKey(NOW), member: { tier: 2, cohort: 1 } });

    const staff = await seedUser(t, "osoblje@example.com", { role: "moderator" });
    await finishWork(t, staff.userId);
    expect(await staff.as.query(api.creaLeagues.myLeague, { todayKey: TODAY })).toEqual({ eligible: false });
    await expect(staff.as.mutation(api.creaLeagues.joinLeague, {})).rejects.toThrow("LIGA_NIJE_DOSTUPNA");
  });

  test("grupa ima najviše 30 ljudi; rang po XP-u ove nedelje", async () => {
    const t = makeT();
    const weekKey = belgradeWeekKey(NOW);
    await t.run(async (ctx) => {
      for (let i = 0; i < LEAGUE_COHORT_SIZE; i += 1) {
        const userId = await ctx.db.insert("users", { email: `clan${i}@example.com`, role: "student", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("creaLeagueMembers", { weekKey, userId, tier: 0, cohort: 1, joinedAt: i });
      }
    });
    const late = await seedUser(t, "kasni@example.com");
    expect(await late.as.mutation(api.creaLeagues.joinLeague, {})).toEqual({ tier: 0, cohort: 2 });
    const friend = await seedUser(t, "drug@example.com");
    await friend.as.mutation(api.creaLeagues.joinLeague, {});
    await setWeekXp(t, friend.userId, weekKey, 40);
    await setWeekXp(t, late.userId, weekKey, 90);
    const league = await friend.as.query(api.creaLeagues.myLeague, { todayKey: TODAY });
    expect(league).toMatchObject({ member: { cohort: 2 }, myXp: 40, nextTier: 0 });
    if (!league?.eligible) throw new Error("liga");
    expect(league.table.map((row) => [row.rank, row.xp, row.isMe])).toEqual([
      [1, 90, false],
      [2, 40, true],
    ]);
  });

  test("kupovina kredita ne pomera ligu ni rang (XP se ne kupuje)", async () => {
    const t = makeT();
    const mila = await seedUser(t, "mila@example.com");
    await mila.as.mutation(api.creaLeagues.joinLeague, {});
    await t.mutation(api.credits.applyStripeGrant, { syncSecret: SYNC_SECRET, userId: mila.userId, amount: 10_000, source: "purchase", stripeSessionId: "cs_liga" });
    const league = await mila.as.query(api.creaLeagues.myLeague, { todayKey: TODAY });
    expect(league).toMatchObject({ myXp: 0, nextTier: 0, member: { tier: 0 } });
  });
});

describe("Kreativni par i pozivi (G10)", () => {
  test("kod poziva, par, zajednički niz samo za dane kad su oboje radili", async () => {
    const t = makeT();
    const ana = await seedUser(t, "ana@example.com");
    const code = await ana.as.mutation(api.creaPairs.ensureInviteCode, {});
    expect(await ana.as.mutation(api.creaPairs.ensureInviteCode, {})).toBe(code);
    await expect(ana.as.mutation(api.creaPairs.acceptInvite, { code })).rejects.toThrow("SVOJ_POZIV");
    await expect(ana.as.mutation(api.creaPairs.acceptInvite, { code: "nepostoj" })).rejects.toThrow("POZIV_NE_POSTOJI");

    const bora = await seedUser(t, "bora@example.com");
    expect(await t.query(api.creaPairs.inviteByCode, { code })).toMatchObject({ inviter: { name: "ana I." }, viewer: null });
    expect(await bora.as.mutation(api.creaPairs.acceptInvite, { code })).toEqual({ invited: true, paired: true });

    // Juče oboje, prekjuče samo Ana - niz para je 1 (danas još ne prekida).
    const yesterday = belgradeDayKey(NOW - DAY);
    const before = belgradeDayKey(NOW - 2 * DAY);
    await t.run(async (ctx) => {
      // Par je nastao pre tri dana.
      const pair = (await ctx.db.query("creaPairs").collect())[0]!;
      await ctx.db.patch(pair._id, { createdAt: NOW - 3 * DAY });
      for (const [userId, dayKey] of [
        [ana.userId, yesterday],
        [bora.userId, yesterday],
        [ana.userId, before],
      ] as const) {
        await ctx.db.insert("profileActivityDays", { userId, dayKey, lessons: 1, tasks: 0, threads: 0, comments: 0, updatedAt: 1 });
      }
    });
    const mine = await ana.as.query(api.creaPairs.myPair, { todayKey: TODAY });
    expect(mine?.pair).toMatchObject({ partner: { name: "bora I." }, streak: { current: 1 }, todayMe: false, todayPartner: false });

    // Treća osoba: poziv se beleži samo prvi; par se ne pravi dok oboje nisu slobodni.
    const ceca = await seedUser(t, "ceca@example.com");
    const cecaCode = await ceca.as.mutation(api.creaPairs.ensureInviteCode, {});
    expect(await bora.as.mutation(api.creaPairs.acceptInvite, { code: cecaCode })).toEqual({ invited: false, paired: false });
    await bora.as.mutation(api.creaPairs.leavePair, {});
    expect(await ana.as.query(api.creaPairs.myPair, { todayKey: TODAY })).toMatchObject({ pair: null });
    expect(await bora.as.mutation(api.creaPairs.acceptInvite, { code: cecaCode })).toEqual({ invited: false, paired: true });
  });

  test("nagrada: tek posle prve lekcije I prvog rada, jednom; kupovina se ne računa", async () => {
    const t = makeT();
    const ana = await seedUser(t, "ana@example.com");
    const code = await ana.as.mutation(api.creaPairs.ensureInviteCode, {});
    const bora = await seedUser(t, "bora@example.com");
    await bora.as.mutation(api.creaPairs.acceptInvite, { code });
    const inviteId = (await ana.as.query(api.creaPairs.myPair, { todayKey: TODAY }))!.invites[0]!.inviteId;

    await t.mutation(api.credits.applyStripeGrant, { syncSecret: SYNC_SECRET, userId: bora.userId, amount: 1000, source: "purchase", stripeSessionId: "cs_poziv" });
    expect(await ana.as.mutation(api.creaPairs.claimInviteReward, { inviteId })).toEqual({ ok: false, reason: "PRIJATELJ_NIJE_ZAVRSIO" });
    await lessonEvent(t, bora.userId);
    expect(await ana.as.mutation(api.creaPairs.claimInviteReward, { inviteId })).toEqual({ ok: false, reason: "PRIJATELJ_NIJE_ZAVRSIO" });
    await finishWork(t, bora.userId);
    expect(await ana.as.mutation(api.creaPairs.claimInviteReward, { inviteId })).toEqual({ ok: true, credits: INVITE_REWARD_CREDITS });
    expect(await ana.as.mutation(api.creaPairs.claimInviteReward, { inviteId })).toEqual({ ok: false, reason: "VEC_PREUZETO" });
    await expect(bora.as.mutation(api.creaPairs.claimInviteReward, { inviteId })).rejects.toThrow("NEMA_PRISTUPA");
    const lots = await t.run((ctx) => ctx.db.query("creditLots").withIndex("by_user_source", (q) => q.eq("userId", ana.userId).eq("source", "reward")).collect());
    expect(lots.map((lot) => lot.granted)).toEqual([INVITE_REWARD_CREDITS]);
  });

  test("farmovanje: star nalog, nalog sa istorijom, nepotvrđen prijatelj, mesečni plafon", async () => {
    const t = makeT();
    // Nalog star 10 dana (prvi upis u bazu - vreme nastanka u convex-test samo raste).
    vi.setSystemTime(NOW - 10 * DAY);
    const old = await seedUser(t, "stari@example.com");
    vi.setSystemTime(NOW);
    const ana = await seedUser(t, "ana@example.com");
    const code = await ana.as.mutation(api.creaPairs.ensureInviteCode, {});
    const finishedFriend = async (friend: Seeded) => {
      await friend.as.mutation(api.creaPairs.acceptInvite, { code });
      await lessonEvent(t, friend.userId);
      await finishWork(t, friend.userId);
    };

    await old.as.mutation(api.creaPairs.acceptInvite, { code });
    // Nalog koji je već imao lekciju pre poziva.
    const veteran = await seedUser(t, "veteran@example.com");
    await lessonEvent(t, veteran.userId);
    await veteran.as.mutation(api.creaPairs.acceptInvite, { code });
    // Nepotvrđen email.
    const ghost = await seedUser(t, "duh@example.com", { verified: false });
    await ghost.as.mutation(api.creaPairs.acceptInvite, { code });
    for (const friend of [old, veteran, ghost]) {
      await lessonEvent(t, friend.userId);
      await finishWork(t, friend.userId);
    }
    const byFriend = async () => {
      const invites = (await ana.as.query(api.creaPairs.myPair, { todayKey: TODAY }))!.invites;
      return new Map(invites.map((invite) => [invite.friend, invite]));
    };
    let invites = await byFriend();
    expect(invites.get("stari I.")?.block).toBe("NIJE_NOV_NALOG");
    expect(invites.get("veteran I.")?.block).toBe("NIJE_NOV_NALOG");
    expect(await ana.as.mutation(api.creaPairs.claimInviteReward, { inviteId: invites.get("duh I.")!.inviteId })).toEqual({ ok: false, reason: "EMAIL_NIJE_POTVRDJEN" });

    // Mesečni plafon: tri nagrade, četvrta čeka sledeći mesec.
    for (let i = 0; i <= INVITE_REWARDS_PER_MONTH; i += 1) {
      const friend = await seedUser(t, `drug${i}@example.com`);
      await finishedFriend(friend);
    }
    invites = await byFriend();
    const results = [];
    for (let i = 0; i <= INVITE_REWARDS_PER_MONTH; i += 1) {
      results.push(await ana.as.mutation(api.creaPairs.claimInviteReward, { inviteId: invites.get(`drug${i} I.`)!.inviteId }));
    }
    expect(results.filter((result) => result.ok)).toHaveLength(INVITE_REWARDS_PER_MONTH);
    expect(results.at(-1)).toEqual({ ok: false, reason: "MESECNI_LIMIT" });
  });
});
