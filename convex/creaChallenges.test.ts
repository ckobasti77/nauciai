/// <reference types="vite/client" />

/**
 * Dnevni izazov Cree (K27, G3): prijava (samo rad od danas, jedna dnevno), glasanje
 * dan posle (jedan glas po grupi, ne za sebe, ne sa farme naloga) i rezultati
 * (pobednik, bedž, mali krediti - jednom).
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CHALLENGE_BEGINNER_MAX_XP, CHALLENGE_WINNER_CREDITS } from "../lib/crea-challenges";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { LEADERBOARD_XP } from "./leaderboardCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;
type Seeded = { userId: Id<"users">; as: ReturnType<TestConvex["withIdentity"]> };

const HOUR = 3_600_000;
/** 2026-10-06 12:00 po Beogradu (CEST). */
const D0_NOON = Date.parse("2026-10-06T10:00:00Z");
const D0 = "2026-10-06";
const D1 = "2026-10-07";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(D0_NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function seedUser(t: TestConvex, email: string, opts: { role?: "student" | "moderator"; verified?: boolean } = {}): Promise<Seeded> {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: email,
      firstName: email.split("@")[0]!,
      lastName: "Marković",
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

async function todayJob(t: TestConvex, userId: Id<"users">, createdAt = Date.now()) {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["izlaz"]));
    return ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "local:slika.format",
      kind: "image",
      provider: "local",
      params: "{}",
      promptHash: "0".repeat(16),
      status: "done",
      // Besplatan rad (0 kr) ravnopravno učestvuje.
      creditCost: 0,
      outputStorageId: storageId,
      createdAt,
    });
  });
}

/** Prijava + odobrenje moderatora. */
async function enter(t: TestConvex, user: Seeded, moderator: Seeded) {
  const jobId = await todayJob(t, user.userId);
  const result = await user.as.mutation(api.creaChallenges.enterChallenge, { jobId, sharePrompt: false });
  await moderator.as.mutation(api.creaGallery.moderateWork, { workId: result.workId, decision: "approve" });
  return result.workId;
}

async function base(t: TestConvex) {
  await t.mutation(internal.creaFlags.setCreaFlag, { key: "crea_public_gallery", enabled: true });
  const moderator = await seedUser(t, "moderator@example.com", { role: "moderator" });
  return { moderator };
}

describe("Prijava na izazov", () => {
  test("samo rad od danas, jedna prijava dnevno, grupa po ukupnom XP-u", async () => {
    const t = makeT();
    const { moderator } = await base(t);
    const ana = await seedUser(t, "ana@example.com");
    const yesterday = await todayJob(t, ana.userId, D0_NOON - 24 * HOUR);
    await expect(ana.as.mutation(api.creaChallenges.enterChallenge, { jobId: yesterday, sharePrompt: false })).rejects.toThrow("RAD_NIJE_OD_DANAS");

    const first = await todayJob(t, ana.userId);
    const entry = await ana.as.mutation(api.creaChallenges.enterChallenge, { jobId: first, sharePrompt: false, title: "Moj grad" });
    expect(entry).toMatchObject({ status: "pending", group: "pocetnici" });
    // Ista prijava ponovo je u redu; drugi rad istog dana nije.
    await ana.as.mutation(api.creaChallenges.enterChallenge, { jobId: first, sharePrompt: false, title: "Moj grad" });
    const second = await todayJob(t, ana.userId);
    await expect(ana.as.mutation(api.creaChallenges.enterChallenge, { jobId: second, sharePrompt: false })).rejects.toThrow("VEC_PRIJAVLJEN");

    // Iskusan korisnik ide u grupu „Svi".
    const pro = await seedUser(t, "pro@example.com");
    await t.run((ctx) =>
      ctx.db.insert("leaderboardStats", {
        userId: pro.userId,
        scopeKind: "global",
        scopeKey: "global",
        period: "all_time",
        periodKey: "all",
        xp: CHALLENGE_BEGINNER_MAX_XP,
        completedLessons: 5,
        completedTasks: 0,
        helpfulAnswers: 0,
        eligible: true,
        updatedAt: 1,
      }),
    );
    expect(await pro.as.mutation(api.creaChallenges.enterChallenge, { jobId: await todayJob(t, pro.userId), sharePrompt: false })).toMatchObject({ group: "svi" });

    // XP učešća stiže tek sa odobrenjem, jednom.
    await moderator.as.mutation(api.creaGallery.moderateWork, { workId: entry.workId, decision: "approve" });
    await moderator.as.mutation(api.creaGallery.moderateWork, { workId: entry.workId, decision: "approve" });
    const events = await t.run((ctx) =>
      ctx.db.query("leaderboardEvents").withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", ana.userId)).collect(),
    );
    expect(events.filter((event) => event.sourceType === "crea_challenge").map((event) => [event.sourceId, event.points])).toEqual([
      [D0, LEADERBOARD_XP.crea_challenge],
    ]);
    const board = await ana.as.query(api.creaChallenges.challengeBoard, { todayKey: D0 });
    expect(board).toMatchObject({ enabled: true, today: { dayKey: D0, myEntry: { status: "approved", group: "pocetnici" } } });
  });
});

describe("Glasanje: zaštita", () => {
  test("dvostruki glas, glas za sebe, farmanje naloga, pogrešan dan, neodobrena prijava", async () => {
    const t = makeT();
    const { moderator } = await base(t);
    const [ana, bora, ceca] = await Promise.all(["ana@example.com", "bora@example.com", "ceca@example.com"].map((email) => seedUser(t, email)));
    const workA = await enter(t, ana, moderator);
    const workB = await enter(t, bora, moderator);
    const pendingJob = await todayJob(t, ceca.userId);
    const pending = await ceca.as.mutation(api.creaChallenges.enterChallenge, { jobId: pendingJob, sharePrompt: false });

    // Dan prijava: glasanje još nije počelo.
    await expect(ceca.as.mutation(api.creaChallenges.vote, { workId: workA })).rejects.toThrow("GLASANJE_ZATVORENO");

    vi.setSystemTime(D0_NOON + 24 * HOUR);
    await expect(ana.as.mutation(api.creaChallenges.vote, { workId: workA })).rejects.toThrow("SVOJ_RAD");
    await expect(ana.as.mutation(api.creaChallenges.vote, { workId: pending.workId })).rejects.toThrow("PRIJAVA_NIJE_PRONADJENA");
    await ana.as.mutation(api.creaChallenges.vote, { workId: workB });
    // Drugi glas u istoj grupi istog dana - odbijen (i za drugi rad).
    await expect(ana.as.mutation(api.creaChallenges.vote, { workId: workB })).rejects.toThrow("VEC_GLASAO");
    const voter = await seedUser(t, "glasac@example.com");
    await voter.as.mutation(api.creaChallenges.vote, { workId: workA });
    await expect(voter.as.mutation(api.creaChallenges.vote, { workId: workB })).rejects.toThrow("VEC_GLASAO");

    // Farma: nepotvrđen email i drugi nalog istog sandučeta ne glasaju.
    const fresh = await seedUser(t, "nov@example.com", { verified: false });
    await expect(fresh.as.mutation(api.creaChallenges.vote, { workId: workA })).rejects.toThrow("GLAS_NIJE_DOZVOLJEN:EMAIL_NIJE_POTVRDJEN");
    await seedUser(t, "farma@gmail.com");
    const alias = await seedUser(t, "f.arma+2@gmail.com");
    await expect(alias.as.mutation(api.creaChallenges.vote, { workId: workA })).rejects.toThrow("GLAS_NIJE_DOZVOLJEN:DUPLIRAN_EMAIL");

    const works = await t.run(async (ctx) => [await ctx.db.get(workA), await ctx.db.get(workB)]);
    expect(works.map((work) => work!.votes)).toEqual([1, 1]);
    const votes = await t.run((ctx) => ctx.db.query("creaChallengeVotes").collect());
    expect(votes).toHaveLength(2);

    // Tokom glasanja broj glasova se ne vidi; moj glas da.
    const board = await ana.as.query(api.creaChallenges.challengeBoard, { todayKey: D1 });
    if (!board.enabled) throw new Error("izazov mora biti uključen");
    const beginners = board.voting.groups.find((group) => group.group === "pocetnici")!;
    expect(beginners.entries.map((entry) => entry.votes)).toEqual([0, 0]);
    expect(beginners.myVote).toBe(workB);
    // K29 S-08: ni galerija (rad po id-ju) ne otkriva broj glasova.
    const shared = await voter.as.query(api.creaGallery.getPublicWork, { workId: workA });
    expect(shared).not.toBeNull();
    expect(shared).not.toHaveProperty("votes");

    // Dan posle glasanja: zatvoreno.
    vi.setSystemTime(D0_NOON + 48 * HOUR);
    const late = await seedUser(t, "kasni@example.com");
    await expect(late.as.mutation(api.creaChallenges.vote, { workId: workA })).rejects.toThrow("GLASANJE_ZATVORENO");
  });
});

test("cron ne piše ništa dok je galerija isključena", async () => {
  const t = makeT();
  vi.setSystemTime(D0_NOON + 48 * HOUR);
  await t.mutation(internal.creaChallenges.closeDueChallenges, {});
  expect(await t.run((ctx) => ctx.db.query("creaChallengeResults").collect())).toEqual([]);
  await t.mutation(internal.creaFlags.setCreaFlag, { key: "crea_public_gallery", enabled: true });
  await t.mutation(internal.creaChallenges.closeDueChallenges, {});
  expect(await t.run((ctx) => ctx.db.query("creaChallengeResults").collect())).toHaveLength(6);
});

describe("Rezultati", () => {
  async function voteFor(t: TestConvex, workId: Id<"creaPublicWorks">, count: number, prefix: string) {
    for (let i = 0; i < count; i += 1) {
      const voter = await seedUser(t, `${prefix}${i}@example.com`);
      await voter.as.mutation(api.creaChallenges.vote, { workId });
    }
  }

  async function rewardLots(t: TestConvex, userId: Id<"users">) {
    return t.run((ctx) => ctx.db.query("creditLots").withIndex("by_user_source", (q) => q.eq("userId", userId).eq("source", "reward")).collect());
  }

  test("pobednik po glasovima, nerešeno = ranija prijava, nagrada i bedž jednom", async () => {
    const t = makeT();
    const { moderator } = await base(t);
    const [ana, bora, ceca, deki] = await Promise.all(["ana", "bora", "ceca", "deki"].map((name) => seedUser(t, `${name}@example.com`)));
    const workA = await enter(t, ana, moderator);
    vi.setSystemTime(D0_NOON + HOUR);
    const workB = await enter(t, bora, moderator);
    await enter(t, ceca, moderator);
    await enter(t, deki, moderator);

    vi.setSystemTime(D0_NOON + 24 * HOUR);
    await voteFor(t, workB, 3, "b");
    await voteFor(t, workA, 3, "a");
    // Glasanje traje - zatvaranje danas nije dozvoljeno.
    await expect(t.mutation(internal.creaChallenges.closeChallengeDay, { dayKey: D0 })).rejects.toThrow("GLASANJE_JOS_TRAJE");

    vi.setSystemTime(D0_NOON + 48 * HOUR);
    await t.mutation(internal.creaChallenges.closeDueChallenges, {});
    await t.mutation(internal.creaChallenges.closeDueChallenges, {});
    await t.mutation(internal.creaChallenges.closeChallengeDay, { dayKey: D0 });
    const results = await t.run((ctx) => ctx.db.query("creaChallengeResults").collect());
    const beginners = results.filter((row) => row.dayKey === D0 && row.group === "pocetnici");
    expect(beginners).toHaveLength(1);
    // 3:3 - pobeđuje Ana, prijavila se ranije.
    expect(beginners[0]).toMatchObject({ winnerWorkId: workA, winnerUserId: ana.userId, winnerVotes: 3, entries: 4, votesTotal: 6, rewardCredits: CHALLENGE_WINNER_CREDITS });
    expect((await rewardLots(t, ana.userId)).map((lot) => lot.granted)).toEqual([CHALLENGE_WINNER_CREDITS]);
    expect(await rewardLots(t, bora.userId)).toEqual([]);
    // Grupa bez prijava nema pobednika.
    expect(results.find((row) => row.dayKey === D0 && row.group === "svi")).toMatchObject({ noWinnerReason: "MALO_PRIJAVA", rewardCredits: 0 });

    const board = await ana.as.query(api.creaChallenges.challengeBoard, { todayKey: "2026-10-08" });
    if (!board.enabled) throw new Error("izazov mora biti uključen");
    expect(board.results.groups.find((group) => group.group === "pocetnici")).toMatchObject({ closed: true, winner: { _id: workA, votes: 3 } });
    expect(board.badges).toEqual([{ dayKey: D0, group: "pocetnici", theme: expect.any(Object), rewardCredits: CHALLENGE_WINNER_CREDITS }]);
  });

  test("malo glasova ili malo prijava = bez pobednika; nepotvrđen pobednik dobija bedž bez kredita", async () => {
    const t = makeT();
    const { moderator } = await base(t);
    const [ana, bora, ceca] = await Promise.all(["ana", "bora", "ceca"].map((name) => seedUser(t, `${name}@example.com`)));
    const workA = await enter(t, ana, moderator);
    await enter(t, bora, moderator);
    await enter(t, ceca, moderator);
    vi.setSystemTime(D0_NOON + 24 * HOUR);
    await voteFor(t, workA, 1, "a");
    vi.setSystemTime(D0_NOON + 48 * HOUR);
    await t.mutation(internal.creaChallenges.closeDueChallenges, {});
    expect(await t.run((ctx) => ctx.db.query("creaChallengeResults").collect())).toEqual(
      expect.arrayContaining([expect.objectContaining({ dayKey: D0, group: "pocetnici", noWinnerReason: "MALO_GLASOVA" })]),
    );
    expect(await rewardLots(t, ana.userId)).toEqual([]);

    vi.setSystemTime(D0_NOON);
    const t2 = makeT();
    const second = await base(t2);
    const shy = await seedUser(t2, "stidljiva@example.com", { verified: false });
    const [x, y] = await Promise.all(["x", "y"].map((name) => seedUser(t2, `${name}@example.com`)));
    const shyWork = await enter(t2, shy, second.moderator);
    await enter(t2, x, second.moderator);
    await enter(t2, y, second.moderator);
    vi.setSystemTime(D0_NOON + 24 * HOUR);
    await voteFor(t2, shyWork, 2, "s");
    vi.setSystemTime(D0_NOON + 48 * HOUR);
    await t2.mutation(internal.creaChallenges.closeDueChallenges, {});
    const row = await t2.run((ctx) =>
      ctx.db.query("creaChallengeResults").withIndex("by_dayKey_and_group", (q) => q.eq("dayKey", D0).eq("group", "pocetnici")).unique(),
    );
    expect(row).toMatchObject({ winnerUserId: shy.userId, rewardCredits: 0, rewardSkipped: "EMAIL_NIJE_POTVRDJEN" });
    expect(await rewardLots(t2, shy.userId)).toEqual([]);
  });
});
