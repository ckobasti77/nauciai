/// <reference types="vite/client" />

/**
 * Gejmifikacija Cree (K26): XP za događaje (nikad za kredite) sa dnevnim limitima,
 * niz dana (lekcija ILI rad), album sličica i nagrada za punu stranu, mini-lekcije
 * sa besplatnom probom, otključavanje alata, pečati i đačka knjižica.
 *
 * Prihvatanje: nijedna nagrada se ne dobija dvaput niti kupovinom kredita.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { ALBUM_PAGE_REWARD_CREDITS, ALBUM_REWARDS_PER_DAY, albumPageById, CREA_ALBUM_PAGES } from "../lib/crea-album";
import { CAMERA_MOVES } from "../lib/crea-camera-moves";
import { miniLessonById } from "../lib/crea-mini-lessons";
import { shiftDayKey } from "../lib/crea-streak";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { creaRewardKey } from "./creaGameCore";
import { belgradeDayKey, LEADERBOARD_DAILY_XP_LIMIT, LEADERBOARD_XP } from "./leaderboardCore";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

/** Otisak koji klijent najavljuje uz dozvolu za lokalni rezultat (K29-01). */
async function localDigest(t: TestConvex, storageId: Id<"_storage">) {
  return t.run(async (ctx) => {
    const meta = await ctx.db.system.get("_storage", storageId);
    if (!meta) throw new Error("nema fajla");
    return { sha256: meta.sha256, size: meta.size };
  });
}

const SYNC_SECRET = "test-sync-secret";
const previousSyncSecret = process.env.WEBHOOK_SYNC_SECRET;
beforeEach(() => {
  process.env.WEBHOOK_SYNC_SECRET = SYNC_SECRET;
});
afterEach(() => {
  if (previousSyncSecret === undefined) delete process.env.WEBHOOK_SYNC_SECRET;
  else process.env.WEBHOOK_SYNC_SECRET = previousSyncSecret;
});

const TODAY = () => belgradeDayKey(Date.now());

async function seedUser(
  t: TestConvex,
  opts: { email?: string; role?: "student" | "moderator" | "admin"; verified?: boolean; username?: string } = {},
) {
  const email = opts.email ?? "mila@example.com";
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Mila Crea",
      firstName: "Mila",
      lastName: "Petrović",
      username: opts.username ?? email.split("@")[0]!.replace(/[^a-z0-9_]/g, "_"),
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

type WorkOpts = {
  kind?: "image" | "video" | "audio";
  modelSlug?: string;
  provider?: "google" | "fal" | "local";
  creditCost?: number;
  params?: Record<string, unknown>;
  creaTechniques?: string[];
};

/** Gotov rad kroz pravi `finalizeOutput` (isto mesto gde stiže svaki plaćen izlaz). */
async function finishWork(t: TestConvex, userId: Id<"users">, opts: WorkOpts = {}) {
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: opts.modelSlug ?? "nano-banana-2",
      kind: opts.kind ?? "image",
      provider: opts.provider ?? "google",
      params: JSON.stringify(opts.params ?? { prompt: "mačka" }),
      promptHash: "0".repeat(16),
      status: "done" as const,
      creditCost: opts.creditCost ?? 16,
      ...(opts.creaTechniques ? { creaTechniques: opts.creaTechniques } : {}),
      createdAt: Date.now(),
    }),
  );
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["izlaz"])));
  await t.mutation(internal.studio.finalizeOutput, { jobId, storageId, byteSize: 5 });
  return jobId;
}

async function stickersOf(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) =>
    (await ctx.db.query("creaStickers").withIndex("by_userId_and_stickerId", (q) => q.eq("userId", userId)).collect()).map(
      (row) => row.stickerId,
    ),
  );
}

async function eventsOf(t: TestConvex, userId: Id<"users">, sourceType?: string) {
  return t.run(async (ctx) =>
    (await ctx.db.query("leaderboardEvents").withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", userId)).collect()).filter(
      (event) => sourceType === undefined || event.sourceType === sourceType,
    ),
  );
}

async function xpOf(t: TestConvex, userId: Id<"users">) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("leaderboardStats")
      .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
        q.eq("userId", userId).eq("scopeKey", "global").eq("period", "all_time").eq("periodKey", "all"),
      )
      .unique(),
  );
  return row?.xp ?? 0;
}

async function rewardLots(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) =>
    (await ctx.db.query("creditLots").withIndex("by_user_source", (q) => q.eq("userId", userId).eq("source", "reward")).collect()),
  );
}

/** Napuni stranu albuma direktnim upisom sličica (bez poslova) pa je proglasi punom. */
async function fillPage(t: TestConvex, userId: Id<"users">, pageId: string) {
  const page = albumPageById(pageId)!;
  const allButLast = page.stickers.slice(0, -1);
  await t.run(async (ctx) => {
    for (const sticker of allButLast) {
      await ctx.db.insert("creaStickers", { userId, stickerId: sticker.id, pageId, earnedAt: 1, seenAt: 1 });
    }
  });
  // Poslednja sličica stiže pravim putem, pa strana postaje puna u istoj mutaciji.
  const last = page.stickers.at(-1)!.id;
  if (last.startsWith("kamera:")) await finishWork(t, userId, { kind: "video", modelSlug: "grok-video-15-lite", creaTechniques: [last] });
  else throw new Error("fillPage podržava strane kamere");
}

describe("XP za Creu (G1): događaji, nikad krediti", () => {
  test("prvi rad u oblasti i prvi rad dana - jednom; drugi rad istog dana ne donosi ništa", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    await finishWork(t, userId);
    const afterFirst = await xpOf(t, userId);
    expect(afterFirst).toBe(LEADERBOARD_XP.crea_daily_work + LEADERBOARD_XP.crea_first_work);
    await finishWork(t, userId);
    expect(await xpOf(t, userId)).toBe(afterFirst);
    // Prvi video je nova oblast.
    await finishWork(t, userId, { kind: "video", modelSlug: "grok-video-15-lite" });
    expect(await xpOf(t, userId)).toBe(afterFirst + LEADERBOARD_XP.crea_first_work);
    expect((await eventsOf(t, userId, "crea_first_work")).map((e) => e.sourceId).sort()).toEqual(["slika", "video"]);
  });

  test("skup rad ne donosi više XP-a od jeftinog ni od besplatnog", async () => {
    const t = makeT();
    const paid = await seedUser(t, { email: "skupo@example.com" });
    const cheap = await seedUser(t, { email: "jeftino@example.com" });
    const free = await seedUser(t, { email: "besplatno@example.com" });
    await finishWork(t, paid.userId, { kind: "video", modelSlug: "veo-31", creditCost: 900, creaTechniques: ["kamera:fpv"] });
    await finishWork(t, cheap.userId, { kind: "video", modelSlug: "grok-video-15-lite", creditCost: 26, creaTechniques: ["kamera:fpv"] });
    await finishWork(t, free.userId, { kind: "video", modelSlug: "grok-video-15-lite", creditCost: 0, creaTechniques: ["kamera:fpv"] });
    const xp = [await xpOf(t, paid.userId), await xpOf(t, cheap.userId), await xpOf(t, free.userId)];
    expect(new Set(xp).size).toBe(1);
    // Isti skup posao deset puta: XP ostaje isti kao posle prvog.
    for (let i = 0; i < 9; i += 1) {
      await finishWork(t, paid.userId, { kind: "video", modelSlug: "veo-31", creditCost: 900, creaTechniques: ["kamera:fpv"] });
    }
    expect(await xpOf(t, paid.userId)).toBe(xp[0]);
  });

  test("nova tehnika donosi XP najviše 10 puta dnevno; sličice i dalje stižu", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    const moves = CAMERA_MOVES.slice(0, 14).map((move) => `kamera:${move.id}`);
    for (const id of moves) await finishWork(t, userId, { kind: "video", modelSlug: "grok-video-15-lite", creaTechniques: [id] });
    const technique = await eventsOf(t, userId, "crea_technique");
    expect(technique).toHaveLength(14);
    expect(technique.filter((e) => e.points > 0)).toHaveLength(LEADERBOARD_DAILY_XP_LIMIT.crea_technique!);
    const owned = await stickersOf(t, userId);
    for (const id of moves) expect(owned).toContain(id);
  });

  test("recept: XP jednom po receptu, najviše 3 recepta dnevno", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    for (const recipe of ["profilna", "profilna", "cv-fotka", "jelovnik", "logo", "plakat"]) {
      await finishWork(t, userId, { creaTechniques: [`recept:${recipe}`] });
    }
    const events = await eventsOf(t, userId, "crea_recipe");
    expect(events.map((e) => e.sourceId).sort()).toEqual(["cv-fotka", "jelovnik", "logo", "plakat", "profilna"]);
    expect(events.filter((e) => e.points > 0)).toHaveLength(LEADERBOARD_DAILY_XP_LIMIT.crea_recipe!);
  });

  test("osoblje dobija događaje, ali nije na rang-listi", async () => {
    const t = makeT();
    const { userId } = await seedUser(t, { role: "moderator" });
    await finishWork(t, userId);
    const stats = await t.run((ctx) => ctx.db.query("leaderboardStats").withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId)).collect());
    expect(stats.length).toBeGreaterThan(0);
    expect(stats.every((row) => row.eligible === false)).toBe(true);
  });

  test("rezultat besplatnog alata se broji kao rad: niz, XP, sličice", async () => {
    const t = makeT();
    const { userId, as } = await seedUser(t, { role: "moderator" });
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["webp"]));
      await ctx.db.patch(id as unknown as Id<"studioUploads">, { contentType: "image/webp" } as never);
      return id;
    });
    const { grantId } = await as.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image", ...(await localDigest(t, storageId)) });
    const result = await as.mutation(api.creaLocal.saveLocalResult, { grantId, storageId, toolId: "slika.format", kind: "image" });
    expect(result.ok).toBe(true);
    expect((await stickersOf(t, userId)).sort()).toEqual(["alat:slika.format", "prvi:besplatno", "prvi:slika"]);
    const game = await as.query(api.creaGame.myGame, { todayKey: TODAY() });
    expect(game?.streak).toMatchObject({ current: 1, todayDone: true });
  });
});

describe("Nijedna nagrada se ne kupuje", () => {
  test("kupovina kredita ne daje XP, sličice, dan u nizu ni nagradu", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    await t.mutation(api.credits.applyStripeGrant, {
      syncSecret: SYNC_SECRET,
      userId,
      amount: 5000,
      source: "purchase",
      stripeSessionId: "cs_test_1",
    });
    expect(await eventsOf(t, userId)).toHaveLength(0);
    expect(await stickersOf(t, userId)).toHaveLength(0);
    expect(await rewardLots(t, userId)).toHaveLength(0);
    const days = await t.run((ctx) => ctx.db.query("profileActivityDays").withIndex("by_userId_and_dayKey", (q) => q.eq("userId", userId)).collect());
    expect(days).toHaveLength(0);
  });

  test("Stripe webhook ne može da doznači nagradu (`reward` nije Stripe izvor)", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    await expect(
      t.mutation(api.credits.applyStripeGrant, {
        syncSecret: SYNC_SECRET,
        userId,
        amount: 5,
        source: "reward" as never,
        stripeSessionId: "cs_test_reward",
      }),
    ).rejects.toThrow();
    expect(await rewardLots(t, userId)).toHaveLength(0);
  });
});

describe("Album (G4) i nagrada za punu stranu", () => {
  const PAGE = "kamera-osnovni";

  test("puna strana: XP jednom, nagrada jednom (preuzimanje dvaput = jedan lot)", async () => {
    const t = makeT();
    const { userId, as } = await seedUser(t);
    await fillPage(t, userId, PAGE);
    const pages = await t.run((ctx) => ctx.db.query("creaAlbumPages").withIndex("by_userId_and_pageId", (q) => q.eq("userId", userId)).collect());
    expect(pages.map((p) => p.pageId)).toEqual([PAGE]);
    expect(await eventsOf(t, userId, "crea_album_page")).toHaveLength(1);

    expect(await as.mutation(api.creaGame.claimAlbumReward, { pageId: PAGE })).toEqual({ ok: true, credits: ALBUM_PAGE_REWARD_CREDITS });
    expect(await as.mutation(api.creaGame.claimAlbumReward, { pageId: PAGE })).toEqual({ ok: false, reason: "VEC_PREUZETO" });
    const lots = await rewardLots(t, userId);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ granted: ALBUM_PAGE_REWARD_CREDITS, stripeInvoiceId: creaRewardKey("album", userId, PAGE) });
    // Nagrada nije kupovina: ne ulazi u „kupljeno“.
    const balance = await t.run((ctx) => ctx.db.query("creditBalances").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
    expect(balance).toMatchObject({ balance: ALBUM_PAGE_REWARD_CREDITS, lifetimePurchased: 0 });

    // Ista sličica opet ne pravi drugu stranu ni drugu nagradu.
    const first = albumPageById(PAGE)!.stickers[0]!.id;
    await finishWork(t, userId, { kind: "video", modelSlug: "grok-video-15-lite", creaTechniques: [first] });
    expect(await eventsOf(t, userId, "crea_album_page")).toHaveLength(1);
    expect(await rewardLots(t, userId)).toHaveLength(1);
  });

  test("nepuna strana i tuđa strana: nema nagrade", async () => {
    const t = makeT();
    const { userId, as } = await seedUser(t);
    await finishWork(t, userId, { kind: "video", modelSlug: "grok-video-15-lite", creaTechniques: [albumPageById(PAGE)!.stickers[0]!.id] });
    expect(await as.mutation(api.creaGame.claimAlbumReward, { pageId: PAGE })).toEqual({ ok: false, reason: "STRANA_NIJE_PUNA" });
    const other = await seedUser(t, { email: "druga@example.com" });
    await fillPage(t, other.userId, PAGE);
    expect(await as.mutation(api.creaGame.claimAlbumReward, { pageId: PAGE })).toEqual({ ok: false, reason: "STRANA_NIJE_PUNA" });
    expect(await rewardLots(t, userId)).toHaveLength(0);
  });

  test("zaštita od farmovanja: nepotvrđen email i drugi nalog iz istog sandučeta", async () => {
    const t = makeT();
    const unverified = await seedUser(t, { email: "nova@example.com", verified: false });
    await fillPage(t, unverified.userId, PAGE);
    expect(await unverified.as.mutation(api.creaGame.claimAlbumReward, { pageId: PAGE })).toEqual({ ok: false, reason: "EMAIL_NIJE_POTVRDJEN" });

    await seedUser(t, { email: "farma@gmail.com" });
    const alias = await seedUser(t, { email: "f.arma+2@gmail.com", username: "farma_2" });
    await fillPage(t, alias.userId, PAGE);
    expect(await alias.as.mutation(api.creaGame.claimAlbumReward, { pageId: PAGE })).toEqual({ ok: false, reason: "DUPLIRAN_EMAIL" });
    expect(await rewardLots(t, alias.userId)).toHaveLength(0);
    expect(await rewardLots(t, unverified.userId)).toHaveLength(0);
  });

  test("dnevni plafon nagrada", async () => {
    const t = makeT();
    const { userId, as } = await seedUser(t);
    const cameraPages = CREA_ALBUM_PAGES.filter((page) => page.family === "kamera").slice(0, ALBUM_REWARDS_PER_DAY + 1);
    for (const page of cameraPages) await fillPage(t, userId, page.id);
    const results = [];
    for (const page of cameraPages) results.push(await as.mutation(api.creaGame.claimAlbumReward, { pageId: page.id }));
    expect(results.filter((r) => r.ok)).toHaveLength(ALBUM_REWARDS_PER_DAY);
    expect(results.at(-1)).toEqual({ ok: false, reason: "DNEVNI_LIMIT_NAGRADA" });
    // Sutra se preuzima ostatak (nagrada nije izgubljena).
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("creaAlbumPages").withIndex("by_userId_and_pageId", (q) => q.eq("userId", userId)).collect()) {
        if (row.rewardDayKey) await ctx.db.patch(row._id, { rewardDayKey: shiftDayKey(row.rewardDayKey, -1) });
      }
    });
    expect((await as.mutation(api.creaGame.claimAlbumReward, { pageId: cameraPages.at(-1)!.id })).ok).toBe(true);
  });

  test("pečati: neviđene sličice i strane; tuđ id se ne dira", async () => {
    const t = makeT();
    const { userId, as } = await seedUser(t);
    const other = await seedUser(t, { email: "ana@example.com" });
    await finishWork(t, userId, { kind: "video", modelSlug: "grok-video-15-lite", creaTechniques: ["kamera:fpv"] });
    await finishWork(t, other.userId);
    const unseen = (await as.query(api.creaGame.unseenMoments, {}))!;
    expect(unseen.stickers.map((s) => s.stickerId).sort()).toEqual(["kamera:fpv", "prvi:video"]);
    const othersUnseen = (await other.as.query(api.creaGame.unseenMoments, {}))!;
    await as.mutation(api.creaGame.markMomentsSeen, { stickerIds: [...unseen.stickers.map((s) => s.id), ...othersUnseen.stickers.map((s) => s.id)], pageIds: [] });
    expect((await as.query(api.creaGame.unseenMoments, {}))!.stickers).toHaveLength(0);
    expect((await other.as.query(api.creaGame.unseenMoments, {}))!.stickers).toHaveLength(othersUnseen.stickers.length);
  });
});

describe("Mini-lekcije (G6), otključavanje (U10) i besplatna proba", () => {
  const answers = (id: string) => miniLessonById(id)!.quiz.map((q) => q.correct);

  test("netačni odgovori ne otključavaju ništa", async () => {
    const t = makeT();
    const { as } = await seedUser(t);
    const wrong = answers("slika-popravi").map((a) => (a + 1) % 3);
    expect(await as.mutation(api.creaGame.completeMiniLesson, { lessonId: "slika-popravi", answers: wrong, via: "test" })).toEqual({
      ok: false,
      reason: "NETACNI_ODGOVORI",
    });
    expect((await as.query(api.creaGame.myGame, { todayKey: TODAY() }))!.unlock.lessons).toEqual([]);
  });

  test("položena lekcija: otključava, XP i sličica jednom; ponovo - ništa novo", async () => {
    const t = makeT();
    const { userId, as } = await seedUser(t);
    const first = await as.mutation(api.creaGame.completeMiniLesson, { lessonId: "slika-popravi", answers: answers("slika-popravi"), via: "lekcija" });
    expect(first).toEqual({ ok: true, first: true, freeTry: null });
    const again = await as.mutation(api.creaGame.completeMiniLesson, { lessonId: "slika-popravi", answers: answers("slika-popravi"), via: "test" });
    expect(again).toEqual({ ok: true, first: false, freeTry: null });
    expect((await as.query(api.creaGame.myGame, { todayKey: TODAY() }))!.unlock.lessons).toEqual(["slika-popravi"]);
    expect(await eventsOf(t, userId, "crea_mini_lesson")).toHaveLength(1);
    expect(await stickersOf(t, userId)).toEqual(["prvi:lekcija"]);
  });

  test("besplatna proba samo za potvrđen i jedinstven nalog, i samo jednom", async () => {
    const t = makeT();
    const verified = await seedUser(t);
    const unverified = await seedUser(t, { email: "neproveren@example.com", verified: false });
    const ok = await verified.as.mutation(api.creaGame.completeMiniLesson, { lessonId: "slika-ai", answers: answers("slika-ai"), via: "lekcija" });
    expect(ok).toMatchObject({ ok: true, freeTry: { granted: 1 } });
    const skipped = await unverified.as.mutation(api.creaGame.completeMiniLesson, { lessonId: "slika-ai", answers: answers("slika-ai"), via: "test" });
    expect(skipped).toMatchObject({ ok: true, freeTry: { skipped: "EMAIL_NIJE_POTVRDJEN" } });
    expect((await verified.as.query(api.creaGame.myGame, { todayKey: TODAY() }))!.freeTries).toEqual([
      { lessonId: "slika-ai", remaining: 1, models: ["nano-banana-2-lite"], maxCredits: 10 },
    ]);
    expect((await unverified.as.query(api.creaGame.myGame, { todayKey: TODAY() }))!.freeTries).toEqual([]);
  });

  test("„Otključaj sve“ i podrazumevano stanje (osoblje vidi sve)", async () => {
    const t = makeT();
    const student = await seedUser(t);
    const staff = await seedUser(t, { email: "mod@example.com", role: "moderator" });
    expect((await student.as.query(api.creaGame.myGame, { todayKey: TODAY() }))!.unlock).toMatchObject({ auto: false, chosen: false });
    expect((await staff.as.query(api.creaGame.myGame, { todayKey: TODAY() }))!.unlock.auto).toBe(true);
    await student.as.mutation(api.creaGame.setUnlockAll, { unlockAll: true });
    expect((await student.as.query(api.creaGame.myGame, { todayKey: TODAY() }))!.unlock.chosen).toBe(true);
    expect(await t.query(api.creaGame.myGame, { todayKey: TODAY() })).toBeNull();
  });
});

describe("Besplatna proba kroz createJob", () => {
  const LITE = STUDIO_MODELS.find((model) => model.slug === "nano-banana-2-lite")!;

  async function seedLite(t: TestConvex) {
    await t.run((ctx) =>
      ctx.db.insert("models", {
        slug: LITE.slug,
        provider: LITE.provider,
        kind: LITE.kind,
        family: LITE.family,
        labelSr: LITE.labelSr,
        labelEn: LITE.labelEn,
        taglineSr: LITE.taglineSr,
        taglineEn: LITE.taglineEn,
        descriptionSr: LITE.descriptionSr,
        descriptionEn: LITE.descriptionEn,
        endpoints: JSON.stringify(LITE.endpoints),
        inputModes: JSON.stringify(LITE.inputModes),
        inputSpec: JSON.stringify(LITE.inputSpec),
        paramSpec: JSON.stringify(LITE.paramSpec),
        priceRule: JSON.stringify(LITE.priceRule),
        capabilities: JSON.stringify(LITE.capabilities),
        isEnabled: true,
        sortOrder: LITE.sortOrder,
        updatedAt: 1,
      }),
    );
  }

  async function withTry(t: TestConvex) {
    const user = await seedUser(t, { email: "proba@example.com", role: "moderator" });
    await seedLite(t);
    await user.as.mutation(api.creaGame.completeMiniLesson, { lessonId: "slika-ai", answers: miniLessonById("slika-ai")!.quiz.map((q) => q.correct), via: "lekcija" });
    return user;
  }

  const job = { modelSlug: "nano-banana-2-lite", params: JSON.stringify({ prompt: "plava šolja", aspect_ratio: "1:1" }), inputMode: "text" };

  test("posao za 0 kredita, bez potrošnje u ledgeru; druga proba odbijena", async () => {
    const t = makeT();
    const { userId, as } = await withTry(t);
    const jobId = (await as.mutation(api.studio.createJob, { ...job, freeTryLessonId: "slika-ai" })) as Id<"generationJobs">;
    const row = await t.run((ctx) => ctx.db.get(jobId));
    expect(row).toMatchObject({ creditCost: 0, freeTryLessonId: "slika-ai" });
    const spends = await t.run((ctx) => ctx.db.query("creditTransactions").withIndex("by_job_type", (q) => q.eq("jobId", jobId)).collect());
    expect(spends).toHaveLength(0);
    await expect(as.mutation(api.studio.createJob, { ...job, freeTryLessonId: "slika-ai" })).rejects.toThrow("PROBA_ISKORISCENA");
    expect((await as.query(api.creaGame.myGame, { todayKey: TODAY() }))!.freeTries).toEqual([]);
    // Neuspeh vraća PROBU, ne kredite.
    await t.mutation(internal.studio.failJob, { jobId, error: "test" });
    expect((await as.query(api.creaGame.myGame, { todayKey: TODAY() }))!.freeTries).toEqual([
      { lessonId: "slika-ai", remaining: 1, models: ["nano-banana-2-lite"], maxCredits: 10 },
    ]);
    const lots = await t.run((ctx) => ctx.db.query("creditLots").withIndex("by_user_source", (q) => q.eq("userId", userId).eq("source", "refund")).collect());
    expect(lots).toHaveLength(0);
  });

  test("proba važi samo za svoj model i bez proba koje nisu dobijene", async () => {
    const t = makeT();
    const { as } = await withTry(t);
    await expect(as.mutation(api.studio.createJob, { ...job, freeTryLessonId: "video-kamera" })).rejects.toThrow("PROBA_ISKORISCENA");
    await expect(as.mutation(api.studio.createJob, { ...job, freeTryLessonId: "nema-lekcije" })).rejects.toThrow("PROBA_NEDOSTUPNA");
    const stranger = await seedUser(t, { email: "neko@example.com", role: "moderator" });
    await expect(stranger.as.mutation(api.studio.createJob, { ...job, freeTryLessonId: "slika-ai" })).rejects.toThrow("PROBA_ISKORISCENA");
  });

  test("poravnanje ne naplaćuje probu", async () => {
    const t = makeT();
    const { userId, as } = await withTry(t);
    const jobId = (await as.mutation(api.studio.createJob, { ...job, freeTryLessonId: "slika-ai" })) as Id<"generationJobs">;
    await t.run((ctx) => ctx.db.patch(jobId, { status: "done", actualCostUsd: 0.5 }));
    await t.mutation(internal.studio.settleJobCredits, { jobId });
    const settlements = await t.run((ctx) =>
      ctx.db.query("creditTransactions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    );
    expect(settlements.filter((tx) => tx.jobId === jobId)).toHaveLength(0);
  });

  test("tehnike na poslu: server čuva samo poznate i one koje odgovaraju vrsti", async () => {
    const t = makeT();
    const { userId, as } = await withTry(t);
    await t.mutation(internal.credits.grantCredits, {
      userId,
      amount: 100,
      source: "admin_grant",
      idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
    });
    const jobId = (await as.mutation(api.studio.createJob, {
      ...job,
      creaTool: "slika.cetkica",
      creaTechniques: ["stil:foto-film", "kamera:fpv", "izmisljeno:x"],
    })) as Id<"generationJobs">;
    expect((await t.run((ctx) => ctx.db.get(jobId)))?.creaTechniques).toEqual(["alat:slika.cetkica", "stil:foto-film"]);
  }, 20_000);
});

describe("Đačka knjižica (G5)", () => {
  test("drugi je vide tek kad je vlasnik uključi; javna verzija bez prijave isto", async () => {
    const t = makeT();
    const owner = await seedUser(t, { email: "maja@example.com" });
    const viewer = await seedUser(t, { email: "pera@example.com" });
    await finishWork(t, owner.userId, { creaTechniques: ["stil:foto-film"] });
    const today = TODAY();
    expect(await viewer.as.query(api.creaGame.reportCardFor, { username: "maja", todayKey: today })).toBeNull();
    expect(await t.query(api.creaGame.publicReportCard, { username: "maja", todayKey: today })).toBeNull();
    const own = await owner.as.query(api.creaGame.reportCardFor, { username: "maja", todayKey: today });
    expect(own).toMatchObject({ isOwner: true, isPublic: false, name: "Mila P." });
    expect(own!.card.subjects.find((s) => s.id === "slika")?.grade).toBe(2);

    await owner.as.mutation(api.creaGame.setReportCardPublic, { reportCardPublic: true });
    expect(await viewer.as.query(api.creaGame.reportCardFor, { username: "maja", todayKey: today })).toMatchObject({ isOwner: false });
    const shared = await t.query(api.creaGame.publicReportCard, { username: "maja", todayKey: today });
    expect(shared).toMatchObject({ name: "Mila P.", username: "maja" });
    expect(JSON.stringify(shared)).not.toContain("@example.com");
  });

  test("dan mora biti pravi datum", async () => {
    const t = makeT();
    const { as } = await seedUser(t);
    await expect(as.query(api.creaGame.myGame, { todayKey: "juče" })).rejects.toThrow("NEISPRAVAN_DAN");
  });
});
