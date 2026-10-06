/// <reference types="vite/client" />

/**
 * Zajednica Cree (K27): javna galerija iza flega (G8, O6), moderacija, lajkovi,
 * „Napravi svoju verziju" (remiks), deljeni stilovi i nagrade autorima (G11).
 *
 * Prihvatanje: galerija se ne vidi dok je fleg isključen; nagrade autorima imaju
 * zaštitu od farmovanja (isti korisnik, besplatan rad, nepotvrđen nalog, limiti).
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import {
  AUTHOR_REWARD_CREDITS,
  AUTHOR_REWARDS_PER_DAY,
  AUTHOR_REWARDS_PER_MONTH,
  monthKeyOfDay,
  PUBLISH_PER_DAY,
} from "../lib/crea-community";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { belgradeDayKey } from "./leaderboardCore";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

const PAGE = { paginationOpts: { numItems: 20, cursor: null }, sort: "novo" as const };

async function setGallery(t: TestConvex, enabled: boolean) {
  await t.mutation(internal.creaFlags.setCreaFlag, { key: "crea_public_gallery", enabled });
}

async function seedUser(
  t: TestConvex,
  opts: { email: string; role?: "student" | "moderator" | "admin"; verified?: boolean },
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: opts.email,
      name: "Neko Crea",
      firstName: opts.email.split("@")[0]!,
      lastName: "Jovanović",
      username: opts.email.split("@")[0]!.replace(/[^a-z0-9_]/g, "_"),
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

/** Gotov rad direktnim upisom (bez kuka) - za objavu. */
async function doneJob(t: TestConvex, userId: Id<"users">, opts: { prompt?: string; status?: "done" | "running" } = {}) {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["izlaz"]));
    return ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "nano-banana-2",
      kind: "image",
      provider: "google",
      params: JSON.stringify({ prompt: opts.prompt ?? "mačka u svemiru" }),
      promptHash: "0".repeat(16),
      status: opts.status ?? "done",
      creditCost: 16,
      ...(opts.status === "running" ? {} : { outputStorageId: storageId }),
      createdAt: Date.now(),
    });
  });
}

/** Gotov rad kroz pravi `finalizeOutput` - sa kukama (remiks, stil, liga). */
async function finishWork(
  t: TestConvex,
  userId: Id<"users">,
  opts: { remixOfWorkId?: Id<"creaPublicWorks">; creaStyleId?: Id<"creaUserStyles">; creditCost?: number; freeTry?: boolean } = {},
) {
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "nano-banana-2",
      kind: "image",
      provider: "google",
      params: JSON.stringify({ prompt: "moja verzija" }),
      promptHash: "1".repeat(16),
      status: "done" as const,
      creditCost: opts.creditCost ?? 16,
      ...(opts.freeTry ? { freeTryLessonId: "slika-ai" } : {}),
      ...(opts.remixOfWorkId ? { remixOfWorkId: opts.remixOfWorkId } : {}),
      ...(opts.creaStyleId ? { creaStyleId: opts.creaStyleId } : {}),
      createdAt: Date.now(),
    }),
  );
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["izlaz"])));
  await t.mutation(internal.studio.finalizeOutput, { jobId, storageId, byteSize: 5 });
  return jobId;
}

/** Odobren javni rad (objava + odobrenje moderatora). */
async function approvedWork(
  t: TestConvex,
  author: Awaited<ReturnType<typeof seedUser>>,
  moderator: Awaited<ReturnType<typeof seedUser>>,
  opts: { sharePrompt?: boolean; title?: string } = {},
) {
  const jobId = await doneJob(t, author.userId);
  const { workId } = await author.as.mutation(api.creaGallery.publishWork, { jobId, sharePrompt: opts.sharePrompt ?? true, title: opts.title ?? "Mačka" });
  await moderator.as.mutation(api.creaGallery.moderateWork, { workId, decision: "approve" });
  return { jobId, workId };
}

async function rewardLots(t: TestConvex, userId: Id<"users">) {
  return t.run((ctx) => ctx.db.query("creditLots").withIndex("by_user_source", (q) => q.eq("userId", userId).eq("source", "reward")).collect());
}

async function setup(t: TestConvex) {
  await setGallery(t, true);
  const author = await seedUser(t, { email: "autorka@example.com" });
  const viewer = await seedUser(t, { email: "posmatrac@example.com" });
  const moderator = await seedUser(t, { email: "moderator@example.com", role: "moderator" });
  return { author, viewer, moderator };
}

describe("Javna galerija je iza flega (O6)", () => {
  test("isključen fleg: ništa se ne vidi, ništa se ne objavljuje; uključen: odobren rad se vidi", async () => {
    const t = makeT();
    const author = await seedUser(t, { email: "autorka@example.com" });
    const viewer = await seedUser(t, { email: "posmatrac@example.com" });
    const jobId = await doneJob(t, author.userId);
    // Odobren rad već postoji u bazi (npr. pre gašenja flega).
    const workId = await t.run((ctx) =>
      ctx.db.insert("creaPublicWorks", {
        jobId,
        userId: author.userId,
        kind: "image",
        modelSlug: "nano-banana-2",
        status: "approved",
        sharePrompt: true,
        prompt: "mačka u svemiru",
        likes: 0,
        remixes: 0,
        votes: 0,
        publishedAt: Date.now(),
      }),
    );
    const styleId = await t.run((ctx) =>
      ctx.db.insert("creaUserStyles", { userId: author.userId, name: "Topli film", promptFragment: "warm film", uses: 0, isPublic: true, publicStatus: "approved", createdAt: 1 }),
    );
    const todayKey = belgradeDayKey(Date.now());

    for (const state of ["odsutan", "iskljucen"] as const) {
      if (state === "iskljucen") await setGallery(t, false);
      expect(await t.query(api.creaGallery.galleryState, {})).toMatchObject({ enabled: false });
      expect((await t.query(api.creaGallery.listPublicWorks, PAGE)).page).toEqual([]);
      expect((await viewer.as.query(api.creaGallery.listPublicWorks, { ...PAGE, sort: "popularno" })).page).toEqual([]);
      expect(await viewer.as.query(api.creaGallery.getPublicWork, { workId })).toBeNull();
      expect(await author.as.query(api.creaGallery.myPublicWorks, {})).toEqual([]);
      expect(await t.query(api.creaGallery.listPublicStyles, {})).toEqual([]);
      expect(await t.query(api.creaGallery.getSharedStyle, { styleId })).toBeNull();
      expect(await viewer.as.query(api.creaChallenges.challengeBoard, { todayKey })).toEqual({ enabled: false });
      await expect(author.as.mutation(api.creaGallery.publishWork, { jobId, sharePrompt: false })).rejects.toThrow("GALERIJA_ISKLJUCENA");
      await expect(viewer.as.mutation(api.creaGallery.toggleLike, { workId })).rejects.toThrow("GALERIJA_ISKLJUCENA");
      await expect(author.as.mutation(api.creaGallery.setStyleShared, { styleId, shared: true })).rejects.toThrow("GALERIJA_ISKLJUCENA");
      await expect(author.as.mutation(api.creaChallenges.enterChallenge, { jobId, sharePrompt: false })).rejects.toThrow("GALERIJA_ISKLJUCENA");
      await expect(viewer.as.mutation(api.creaChallenges.vote, { workId })).rejects.toThrow("GALERIJA_ISKLJUCENA");
    }

    await setGallery(t, true);
    expect(await t.query(api.creaGallery.galleryState, {})).toMatchObject({ enabled: true });
    expect((await t.query(api.creaGallery.listPublicWorks, PAGE)).page.map((work) => work._id)).toEqual([workId]);
    expect(await viewer.as.query(api.creaGallery.getPublicWork, { workId })).toMatchObject({ prompt: "mačka u svemiru" });
    expect((await t.query(api.creaGallery.listPublicStyles, {})).map((style) => style._id)).toEqual([styleId]);
  });
});

describe("Objava i moderacija (G8)", () => {
  test("rad ide na moderaciju; drugi ga vide tek posle odobrenja; opis samo uz deljenje", async () => {
    const t = makeT();
    const { author, viewer, moderator } = await setup(t);
    const jobId = await doneJob(t, author.userId, { prompt: "lisica u šumi" });
    const { workId, status } = await author.as.mutation(api.creaGallery.publishWork, { jobId, title: "  Lisica   noću ", sharePrompt: false });
    expect(status).toBe("pending");
    expect(await viewer.as.query(api.creaGallery.getPublicWork, { workId })).toBeNull();
    expect((await t.query(api.creaGallery.listPublicWorks, PAGE)).page).toEqual([]);
    expect(await author.as.query(api.creaGallery.getPublicWork, { workId })).toMatchObject({ status: "pending", title: "Lisica noću", isMine: true });

    // Samo osoblje moderira.
    await expect(viewer.as.mutation(api.creaGallery.moderateWork, { workId, decision: "approve" })).rejects.toThrow("Forbidden");
    await expect(viewer.as.query(api.creaGallery.moderationQueue, { kind: "radovi", status: "pending" })).rejects.toThrow("Forbidden");
    const queue = await moderator.as.query(api.creaGallery.moderationQueue, { kind: "radovi", status: "pending" });
    expect(queue.works.map((work) => work._id)).toEqual([workId]);
    // Opis nije podeljen - ni osoblje ga ne vidi kroz red.
    expect(queue.works[0]!.prompt).toBeNull();

    await moderator.as.mutation(api.creaGallery.moderateWork, { workId, decision: "approve" });
    expect(await viewer.as.query(api.creaGallery.getPublicWork, { workId })).toMatchObject({ status: "approved", prompt: null, isMine: false });
    expect((await t.query(api.creaGallery.listPublicWorks, PAGE)).page).toHaveLength(1);

    // Izmena (deljenje opisa) vraća rad na čekanje; posle odobrenja opis je javan.
    await author.as.mutation(api.creaGallery.publishWork, { jobId, title: "Lisica noću", sharePrompt: true });
    expect(await viewer.as.query(api.creaGallery.getPublicWork, { workId })).toBeNull();
    await moderator.as.mutation(api.creaGallery.moderateWork, { workId, decision: "approve" });
    expect(await viewer.as.query(api.creaGallery.getPublicWork, { workId })).toMatchObject({ prompt: "lisica u šumi" });

    // Skidanje: odbijen rad nestaje; razlog vidi samo vlasnik.
    await moderator.as.mutation(api.creaGallery.moderateWork, { workId, decision: "reject", reason: "Nije za javnost" });
    expect(await viewer.as.query(api.creaGallery.getPublicWork, { workId })).toBeNull();
    expect(await author.as.query(api.creaGallery.getPublicWork, { workId })).toMatchObject({ status: "rejected", rejectReason: "Nije za javnost" });
  });

  test("samo svoj gotov rad; plafon objava; brisanje rada ga povlači", async () => {
    const t = makeT();
    const { author, viewer } = await setup(t);
    const foreign = await doneJob(t, viewer.userId);
    await expect(author.as.mutation(api.creaGallery.publishWork, { jobId: foreign, sharePrompt: false })).rejects.toThrow("NEMA_PRISTUPA");
    const running = await doneJob(t, author.userId, { status: "running" });
    await expect(author.as.mutation(api.creaGallery.publishWork, { jobId: running, sharePrompt: false })).rejects.toThrow("RAD_NIJE_GOTOV");
    const longTitle = await doneJob(t, author.userId);
    await expect(author.as.mutation(api.creaGallery.publishWork, { jobId: longTitle, sharePrompt: false, title: "x".repeat(61) })).rejects.toThrow("PREDUG_NASLOV");

    for (let i = 0; i < PUBLISH_PER_DAY; i += 1) {
      const jobId = await doneJob(t, author.userId);
      await author.as.mutation(api.creaGallery.publishWork, { jobId, sharePrompt: false });
    }
    const extra = await doneJob(t, author.userId);
    await expect(author.as.mutation(api.creaGallery.publishWork, { jobId: extra, sharePrompt: false })).rejects.toThrow("DNEVNI_LIMIT_OBJAVA");

    const t2 = makeT();
    const second = await setup(t2);
    const { jobId, workId } = await approvedWork(t2, second.author, second.moderator);
    await second.author.as.mutation(api.studio.deleteJob, { jobId });
    expect(await second.viewer.as.query(api.creaGallery.getPublicWork, { workId })).toBeNull();
    expect(await t2.run((ctx) => ctx.db.get(workId))).toMatchObject({ status: "withdrawn" });
  });

  test("lajk: jednom po osobi, poništava se, ne za svoj ni neodobren rad", async () => {
    const t = makeT();
    const { author, viewer, moderator } = await setup(t);
    const { workId } = await approvedWork(t, author, moderator);
    expect(await viewer.as.mutation(api.creaGallery.toggleLike, { workId })).toEqual({ liked: true, likes: 1 });
    expect(await viewer.as.query(api.creaGallery.getPublicWork, { workId })).toMatchObject({ likes: 1, likedByMe: true });
    expect(await viewer.as.mutation(api.creaGallery.toggleLike, { workId })).toEqual({ liked: false, likes: 0 });
    await expect(author.as.mutation(api.creaGallery.toggleLike, { workId })).rejects.toThrow("SVOJ_RAD");
    const pendingJob = await doneJob(t, author.userId);
    const pending = await author.as.mutation(api.creaGallery.publishWork, { jobId: pendingJob, sharePrompt: false });
    await expect(viewer.as.mutation(api.creaGallery.toggleLike, { workId: pending.workId })).rejects.toThrow("RAD_NIJE_JAVAN");
  });
});

describe("„Napravi svoju verziju\" (remiks) i nagrade autorima (G8, G11)", () => {
  const MODEL = STUDIO_MODELS.find((model) => model.slug === "nano-banana-2-lite")!;

  async function seedModel(t: TestConvex) {
    await t.run((ctx) =>
      ctx.db.insert("models", {
        slug: MODEL.slug,
        provider: MODEL.provider,
        kind: MODEL.kind,
        family: MODEL.family,
        labelSr: MODEL.labelSr,
        labelEn: MODEL.labelEn,
        taglineSr: MODEL.taglineSr,
        taglineEn: MODEL.taglineEn,
        descriptionSr: MODEL.descriptionSr,
        descriptionEn: MODEL.descriptionEn,
        endpoints: JSON.stringify(MODEL.endpoints),
        inputModes: JSON.stringify(MODEL.inputModes),
        inputSpec: JSON.stringify(MODEL.inputSpec),
        paramSpec: JSON.stringify(MODEL.paramSpec),
        priceRule: JSON.stringify(MODEL.priceRule),
        capabilities: JSON.stringify(MODEL.capabilities),
        isEnabled: true,
        sortOrder: MODEL.sortOrder,
        updatedAt: 1,
      }),
    );
  }

  test("createJob pamti zaslugu samo za odobren TUĐ rad dok je galerija upaljena", async () => {
    const t = makeT();
    const { author, moderator } = await setup(t);
    await seedModel(t);
    const maker = await seedUser(t, { email: "pravim@example.com", role: "moderator" });
    await t.mutation(internal.credits.grantCredits, {
      userId: maker.userId,
      amount: 500,
      source: "admin_grant",
      idempotencyKey: { field: "stripeInvoiceId", value: "test-krediti" },
    });
    const { workId } = await approvedWork(t, author, moderator);
    const own = await approvedWork(t, maker, moderator);
    const pendingJob = await doneJob(t, author.userId);
    const pending = await author.as.mutation(api.creaGallery.publishWork, { jobId: pendingJob, sharePrompt: true });
    const order = { modelSlug: MODEL.slug, params: JSON.stringify({ prompt: "moja verzija", aspect_ratio: "1:1" }), inputMode: "text" };

    const remixRef = async (remixOfWorkId: Id<"creaPublicWorks">) => {
      const jobId = (await maker.as.mutation(api.studio.createJob, { ...order, remixOfWorkId })) as Id<"generationJobs">;
      // Posao se „završi" da ne zauzima mesto u limitu paralelnih poslova.
      const row = await t.run(async (ctx) => {
        await ctx.db.patch(jobId, { status: "done" });
        return ctx.db.get(jobId);
      });
      return row!.remixOfWorkId ?? null;
    };
    expect(await remixRef(workId)).toBe(workId);
    expect(await remixRef(own.workId)).toBeNull();
    expect(await remixRef(pending.workId)).toBeNull();
    await setGallery(t, false);
    expect(await remixRef(workId)).toBeNull();
  });

  test("gotov remiks: brojač, XP i nagrada autoru recepta - jednom po korisniku", async () => {
    const t = makeT();
    const { author, viewer, moderator } = await setup(t);
    const { workId } = await approvedWork(t, author, moderator, { sharePrompt: true });

    await finishWork(t, viewer.userId, { remixOfWorkId: workId });
    expect(await t.run((ctx) => ctx.db.get(workId))).toMatchObject({ remixes: 1 });
    expect((await rewardLots(t, author.userId)).map((lot) => lot.granted)).toEqual([AUTHOR_REWARD_CREDITS]);
    const xp = await t.run((ctx) =>
      ctx.db.query("leaderboardEvents").withIndex("by_userId_and_occurredAt", (q) => q.eq("userId", author.userId)).collect(),
    );
    expect(xp.filter((event) => event.sourceType === "crea_remix_received")).toHaveLength(1);

    // Isti korisnik, isti recept: brojač raste, nagrade više nema.
    await finishWork(t, viewer.userId, { remixOfWorkId: workId });
    expect(await t.run((ctx) => ctx.db.get(workId))).toMatchObject({ remixes: 2 });
    expect(await rewardLots(t, author.userId)).toHaveLength(1);

    // Autor remiksuje sam sebe: ništa.
    await finishWork(t, author.userId, { remixOfWorkId: workId });
    expect(await t.run((ctx) => ctx.db.get(workId))).toMatchObject({ remixes: 2 });
    expect(await rewardLots(t, author.userId)).toHaveLength(1);

    // Stablo remiksa: objavljena svoja verzija pokazuje roditelja, roditelj nju.
    const remixJob = await finishWork(t, viewer.userId, { remixOfWorkId: workId });
    const child = await viewer.as.mutation(api.creaGallery.publishWork, { jobId: remixJob, sharePrompt: false, title: "Moja mačka" });
    await moderator.as.mutation(api.creaGallery.moderateWork, { workId: child.workId, decision: "approve" });
    const parentView = await t.query(api.creaGallery.getPublicWork, { workId });
    expect(parentView?.children.map((entry) => entry._id)).toEqual([child.workId]);
    expect((await t.query(api.creaGallery.getPublicWork, { workId: child.workId }))?.parent?._id).toBe(workId);
  });

  test("farmovanje: besplatan rad, nepotvrđen ili dupli nalog i rad bez podeljenog opisa ne donose kredite", async () => {
    const t = makeT();
    const { author, moderator } = await setup(t);
    const { workId } = await approvedWork(t, author, moderator, { sharePrompt: true });
    const unverified = await seedUser(t, { email: "nepotvrdjen@example.com", verified: false });
    await seedUser(t, { email: "farma@gmail.com" });
    const alias = await seedUser(t, { email: "f.arma+2@gmail.com" });
    const freeRider = await seedUser(t, { email: "besplatno@example.com" });

    await finishWork(t, unverified.userId, { remixOfWorkId: workId });
    await finishWork(t, alias.userId, { remixOfWorkId: workId });
    await finishWork(t, freeRider.userId, { remixOfWorkId: workId, creditCost: 0, freeTry: true });
    await finishWork(t, freeRider.userId, { remixOfWorkId: workId, creditCost: 1 });
    expect(await rewardLots(t, author.userId)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(workId))).toMatchObject({ remixes: 4 });

    // Opis nije podeljen = nije „recept": XP autoru da, krediti ne.
    const secret = await approvedWork(t, author, moderator, { sharePrompt: false });
    const buyer = await seedUser(t, { email: "kupac@example.com" });
    await finishWork(t, buyer.userId, { remixOfWorkId: secret.workId });
    expect(await rewardLots(t, author.userId)).toEqual([]);

    // Ni autor sa nepotvrđenim emailom ne dobija kredite.
    const shy = await seedUser(t, { email: "stidljiv@example.com", verified: false });
    const shyWork = await approvedWork(t, shy, moderator, { sharePrompt: true });
    await finishWork(t, buyer.userId, { remixOfWorkId: shyWork.workId });
    expect(await rewardLots(t, shy.userId)).toEqual([]);
  });

  test("dnevni i mesečni plafon nagrada autoru", async () => {
    const t = makeT();
    const { author, moderator } = await setup(t);
    const { workId } = await approvedWork(t, author, moderator, { sharePrompt: true });
    for (let i = 0; i <= AUTHOR_REWARDS_PER_DAY; i += 1) {
      const fan = await seedUser(t, { email: `fan${i}@example.com` });
      await finishWork(t, fan.userId, { remixOfWorkId: workId });
    }
    expect(await rewardLots(t, author.userId)).toHaveLength(AUTHOR_REWARDS_PER_DAY);

    // Mesec je pun (ranije nagrade istog meseca): ni nov dan ne pomaže.
    const t2 = makeT();
    const second = await setup(t2);
    const work2 = await approvedWork(t2, second.author, second.moderator, { sharePrompt: true });
    const monthKey = monthKeyOfDay(belgradeDayKey(Date.now()));
    await t2.run(async (ctx) => {
      const lotId = await ctx.db.insert("creditLots", { userId: second.author.userId, source: "reward", granted: 2, remaining: 2, expiresAt: Date.now() + 1e9, grantedAt: 1 });
      for (let i = 0; i < AUTHOR_REWARDS_PER_MONTH; i += 1) {
        await ctx.db.insert("creaAuthorRewards", {
          authorId: second.author.userId,
          userId: second.viewer.userId,
          kind: "recept",
          itemId: `stari-${i}`,
          jobId: await ctx.db.insert("generationJobs", { userId: second.viewer.userId, modelSlug: "x", kind: "image", params: "{}", promptHash: "x", status: "done", creditCost: 16, createdAt: 1 }),
          credits: 2,
          dayKey: `${monthKey}-01`,
          monthKey,
          lotId,
          createdAt: 1,
        });
      }
    });
    const late = await seedUser(t2, { email: "kasno@example.com" });
    await finishWork(t2, late.userId, { remixOfWorkId: work2.workId });
    const lots = await rewardLots(t2, second.author.userId);
    expect(lots).toHaveLength(1); // samo ručno upisan lot iz pripreme
  });

  test("deljeni stil: moderacija, upotreba drugog korisnika = broj upotreba i nagrada", async () => {
    const t = makeT();
    const { author, viewer, moderator } = await setup(t);
    const styleId = await t.run((ctx) =>
      ctx.db.insert("creaUserStyles", { userId: author.userId, name: "Topli film", styleId: "film-35mm", promptFragment: "warm grain", uses: 0, isPublic: false, createdAt: 1 }),
    );
    await expect(viewer.as.mutation(api.creaGallery.setStyleShared, { styleId, shared: true })).rejects.toThrow("NEMA_PRISTUPA");
    await author.as.mutation(api.creaGallery.setStyleShared, { styleId, shared: true });
    expect(await t.query(api.creaGallery.listPublicStyles, {})).toEqual([]);
    expect((await moderator.as.query(api.creaGallery.moderationQueue, { kind: "stilovi", status: "pending" })).styles.map((style) => style._id)).toEqual([styleId]);
    await moderator.as.mutation(api.creaGallery.moderateStyle, { styleId, decision: "approve" });
    expect(await viewer.as.query(api.creaGallery.getSharedStyle, { styleId })).toMatchObject({ name: "Topli film", promptFragment: "warm grain" });

    await finishWork(t, viewer.userId, { creaStyleId: styleId });
    expect(await t.run((ctx) => ctx.db.get(styleId))).toMatchObject({ uses: 1 });
    expect((await rewardLots(t, author.userId)).map((lot) => lot.granted)).toEqual([AUTHOR_REWARD_CREDITS]);
    const rows = await t.run((ctx) => ctx.db.query("creaAuthorRewards").withIndex("by_authorId_and_dayKey", (q) => q.eq("authorId", author.userId)).collect());
    expect(rows.map((row) => row.kind)).toEqual(["stil"]);

    // Vlasnik ga vrati u privatne: nestaje iz zajednice.
    await author.as.mutation(api.creaGallery.setStyleShared, { styleId, shared: false });
    expect(await t.query(api.creaGallery.getSharedStyle, { styleId })).toBeNull();
    expect((await author.as.query(api.creaStyles.listMyStyles, {}))[0]).toMatchObject({ shared: null, uses: 1 });
  });
});
