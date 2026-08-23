/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";
import { dayKey } from "./studioCore";
import { SETTLEMENT_REASON } from "./studioSettlementCore";

/**
 * PORAVNANJE posla (X2, nalaz N2). Rezervacija se ovde upisuje ručno, istim
 * poljima koja upisuje `createJob` - put od uploada do rezervacije ima svoje
 * testove u `studioCatalogJob.test.ts`, a ovde je predmet ono što se dešava
 * POSLE toga.
 */
const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

/** `dubbing`: 0,60 $ po minutu, količina se meri iz snimka (katalog 4.2). */
const MODEL_SLUG = "dubbing";

/** Rezervacija po zaglavlju od 0,1 minut - polazna tačka napada iz N2. */
const RESERVED_MINUTES = 0.1;
const RESERVED_COST_USD = 0.6 * RESERVED_MINUTES;
const RESERVED_CREDITS = 13;

/** Isto, za 120 obrađenih minuta: `ceil(72 × 216,25)`. */
const FULL_COST_USD = 72;
const FULL_CREDITS = 15570;

async function seedModel(t: TestConvex, slug = MODEL_SLUG) {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!seed) throw new Error(`Nema modela ${slug} u katalogu`);

  return t.run((ctx) =>
    ctx.db.insert("models", {
      slug: seed.slug,
      provider: seed.provider,
      kind: seed.kind,
      family: seed.family,
      labelSr: seed.labelSr,
      labelEn: seed.labelEn,
      taglineSr: seed.taglineSr,
      taglineEn: seed.taglineEn,
      descriptionSr: seed.descriptionSr,
      descriptionEn: seed.descriptionEn,
      endpoints: JSON.stringify(seed.endpoints),
      inputModes: JSON.stringify(seed.inputModes),
      inputSpec: JSON.stringify(seed.inputSpec),
      paramSpec: JSON.stringify(seed.paramSpec),
      priceRule: JSON.stringify(seed.priceRule),
      capabilities: JSON.stringify(seed.capabilities),
      isEnabled: true,
      sortOrder: seed.sortOrder,
      updatedAt: 1,
    }),
  );
}

async function seedUser(t: TestConvex, credits: number) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "student@example.com",
      name: "Studio Student",
      username: "studio_student",
      // `moderator`, ne `student`: dok je Studio zatvoreno testiranje
      // (`STUDIO_STAFF_ONLY` u `studioCore.ts`), sam upis ispod više ne
      // otvara `createJob` - ovaj fajl meri poravnanje, ne pristup.
      role: "moderator",
      language: "sr" as const,
      // Kapija uslova Studija (X7) je prošla: ovaj fajl meri cenu i poravnanje,
      // a ne pristanak - njega pokriva `studio.test.ts`.
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const courseId = await ctx.db.insert("courses", {
      slug: "studio-course",
      titleSr: "Kurs",
      titleEn: "Course",
      subtitleSr: "Podnaslov",
      subtitleEn: "Subtitle",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: "published" as const,
      sortOrder: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("enrollments", {
      userId,
      courseId,
      status: "active" as const,
      startedAt: 1,
      updatedAt: 1,
    });

    return userId;
  });

  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: credits,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });

  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

/**
 * Ista polja koja `createJob` upisuje pri rezervaciji: red posla, skinuti
 * krediti pod tim `jobId`-jem i red u dnevnom zbiru.
 */
async function reserveJob(
  t: TestConvex,
  userId: Id<"users">,
  options: {
    minutes?: number;
    creditCost?: number;
    estimatedCostUsd?: number;
    status?: "reserved" | "done";
  } = {},
) {
  const minutes = options.minutes ?? RESERVED_MINUTES;
  const creditCost = options.creditCost ?? RESERVED_CREDITS;
  const estimatedCostUsd = options.estimatedCostUsd ?? RESERVED_COST_USD;

  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: MODEL_SLUG,
      kind: "audio" as const,
      provider: "fal" as const,
      params: JSON.stringify({ target_language: "en", minutes }),
      promptHash: "0000000000000000",
      status: options.status ?? "done",
      creditCost,
      estimatedCostUsd,
      inputMode: "audio",
      createdAt: Date.now(),
    }),
  );
  await t.mutation(internal.credits.spendCredits, { userId, amount: creditCost, jobId });
  await t.run((ctx) =>
    ctx.db.insert("studioUsageDaily", {
      userId,
      day: dayKey(Date.now()),
      generations: 1,
      creditsSpent: creditCost,
      costUsd: estimatedCostUsd,
    }),
  );

  return jobId;
}

function jobOf(t: TestConvex, jobId: Id<"generationJobs">) {
  return t.run((ctx) => ctx.db.get(jobId));
}

async function balanceOf(t: TestConvex, userId: Id<"users">) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );

  return row?.balance ?? 0;
}

function usageOf(t: TestConvex, userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("studioUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", dayKey(Date.now())))
      .unique(),
  );
}

function transactionsOf(t: TestConvex, jobId: Id<"generationJobs">, type: "spend" | "settlement" | "refund") {
  return t.run((ctx) =>
    ctx.db
      .query("creditTransactions")
      .withIndex("by_job_type", (q) => q.eq("jobId", jobId).eq("type", type))
      .collect(),
  );
}

// ── razlika naviše ─────────────────────────────────────────────────────────

test("poravnanje naviše skida razliku do stvarne količine", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedUser(t, 100_000);
  await seedModel(t);
  const jobId = await reserveJob(t, userId);
  expect(await balanceOf(t, userId)).toBe(100_000 - RESERVED_CREDITS);

  // Provajder je obradio 120 minuta, a rezervisano je bilo 0,1.
  await t.mutation(internal.studio.settleJobCredits, { jobId, reportedSeconds: 7200 });

  expect(await balanceOf(t, userId)).toBe(100_000 - FULL_CREDITS);
  const job = await jobOf(t, jobId);
  expect(job?.settlementReason).toBe(SETTLEMENT_REASON.quantity);
  expect(job?.settledCostUsd).toBe(FULL_COST_USD);
  expect(job?.settledAt).toBeGreaterThan(0);
  expect(job?.unsettledCredits).toBeUndefined();

  // Rezervacija i korekcija su dva reda u istoriji, ne jedan prepisan.
  expect(await transactionsOf(t, jobId, "spend")).toHaveLength(1);
  const settlement = await transactionsOf(t, jobId, "settlement");
  expect(settlement).toHaveLength(1);
  expect(settlement[0].amount).toBe(-(FULL_CREDITS - RESERVED_CREDITS));
});

test("dnevni zbir posle poravnanja sadrži stvaran trošak, ne procenu", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedUser(t, 100_000);
  await seedModel(t);
  const jobId = await reserveJob(t, userId);
  expect((await usageOf(t, userId))?.costUsd).toBeCloseTo(RESERVED_COST_USD, 6);

  await t.mutation(internal.studio.settleJobCredits, { jobId, reportedSeconds: 7200 });

  // Ovo je poenta celog naloga N2: i plafon po korisniku i globalni plafon
  // čitaju baš ovo polje.
  const usage = await usageOf(t, userId);
  expect(usage?.costUsd).toBeCloseTo(FULL_COST_USD, 6);
  expect(usage?.creditsSpent).toBe(FULL_CREDITS);
  expect(usage?.generations).toBe(1);
});

// ── razlika naniže ─────────────────────────────────────────────────────────

test("poravnanje naniže vraća kredite u nov lot", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedUser(t, 100_000);
  await seedModel(t);
  // Rezervisano sedam minuta, obrađen jedan.
  const jobId = await reserveJob(t, userId, {
    minutes: 7,
    creditCost: 909,
    estimatedCostUsd: 4.2,
  });

  await t.mutation(internal.studio.settleJobCredits, { jobId, reportedSeconds: 60 });

  expect(await balanceOf(t, userId)).toBe(100_000 - 130);
  const settlement = await transactionsOf(t, jobId, "settlement");
  expect(settlement).toHaveLength(1);
  expect(settlement[0].amount).toBe(909 - 130);
  const lots = await t.run((ctx) =>
    ctx.db
      .query("creditLots")
      .withIndex("by_user_active", (q) => q.eq("userId", userId).eq("exhaustedAt", undefined))
      .collect(),
  );
  expect(lots.filter((lot) => lot.source === "refund")).toHaveLength(1);
  expect((await usageOf(t, userId))?.costUsd).toBeCloseTo(0.6, 6);
});

// ── idempotencija ──────────────────────────────────────────────────────────

test("drugi poziv poravnanja ne radi ništa", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedUser(t, 100_000);
  await seedModel(t);
  const jobId = await reserveJob(t, userId);

  await t.mutation(internal.studio.settleJobCredits, { jobId, reportedSeconds: 7200 });
  const afterFirst = await balanceOf(t, userId);
  const settledAt = (await jobOf(t, jobId))?.settledAt;

  // I webhook i poller umeju da stignu do istog posla.
  const second = await t.mutation(internal.studio.settleJobCredits, { jobId, reportedSeconds: 7200 });

  expect(second).toBeNull();
  expect(await balanceOf(t, userId)).toBe(afterFirst);
  expect(await transactionsOf(t, jobId, "settlement")).toHaveLength(1);
  expect((await jobOf(t, jobId))?.settledAt).toBe(settledAt);
});

// ── provajder nije prijavio ────────────────────────────────────────────────

test("provajder bez količine i bez cene ostavlja rezervaciju i upisuje razlog", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedUser(t, 100_000);
  await seedModel(t);
  const jobId = await reserveJob(t, userId);

  await t.mutation(internal.studio.settleJobCredits, { jobId });

  expect(await balanceOf(t, userId)).toBe(100_000 - RESERVED_CREDITS);
  expect(await transactionsOf(t, jobId, "settlement")).toHaveLength(0);
  const job = await jobOf(t, jobId);
  expect(job?.settlementReason).toBe(SETTLEMENT_REASON.missing);
  expect(job?.settledCostUsd).toBeUndefined();
  // `settledAt` ostaje prazan: noćna rekonsilijacija sme da proba ponovo, sa
  // cenom sa fakture.
  expect(job?.settledAt).toBeUndefined();
  expect((await usageOf(t, userId))?.costUsd).toBeCloseTo(RESERVED_COST_USD, 6);
});

test("posao bez prijavljene količine se kasnije poravnava po prijavljenoj ceni", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedUser(t, 100_000);
  await seedModel(t);
  const jobId = await reserveJob(t, userId);

  await t.mutation(internal.studio.settleJobCredits, { jobId });
  // fal cenu donosi tek noćna rekonsilijacija (`applyFalBillingEvents`).
  await t.run((ctx) => ctx.db.patch(jobId, { actualCostUsd: 2 }));
  await t.mutation(internal.studio.settleJobCredits, { jobId });

  const job = await jobOf(t, jobId);
  expect(job?.settlementReason).toBe(SETTLEMENT_REASON.cost);
  expect(job?.settledCostUsd).toBe(2);
  expect(await balanceOf(t, userId)).toBe(100_000 - 433);
  expect((await usageOf(t, userId))?.costUsd).toBeCloseTo(2, 6);
});

// ── dug ────────────────────────────────────────────────────────────────────

test("korisnik bez kredita dobija dug i blokadu novih poslova", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t, 100);
  await seedModel(t);
  await seedModel(t, "nano-banana-2");
  const jobId = await reserveJob(t, userId);

  const result = await t.mutation(internal.studio.settleJobCredits, { jobId, reportedSeconds: 7200 });

  // Skinuto je sve što je bilo, ostatak je dug - a posao se svejedno isporučuje.
  expect(result).toMatchObject({ unsettled: FULL_CREDITS - 100 });
  expect(await balanceOf(t, userId)).toBe(0);
  const job = await jobOf(t, jobId);
  expect(job?.unsettledCredits).toBe(FULL_CREDITS - 100);
  expect(job?.status).toBe("done");
  expect((await transactionsOf(t, jobId, "settlement"))[0].amount).toBe(-(100 - RESERVED_CREDITS));

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "lisica u snegu", resolution: "2K" }),
      inputMode: "text",
    }),
  ).rejects.toThrow("NEPORAVNAT_DUG");
});

test("bez kredita uopšte, ceo iznos ostaje dug i ne upisuje se prazan red", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedUser(t, RESERVED_CREDITS);
  await seedModel(t);
  const jobId = await reserveJob(t, userId);
  expect(await balanceOf(t, userId)).toBe(0);

  await t.mutation(internal.studio.settleJobCredits, { jobId, reportedSeconds: 7200 });

  expect(await balanceOf(t, userId)).toBe(0);
  expect(await transactionsOf(t, jobId, "settlement")).toHaveLength(0);
  expect((await jobOf(t, jobId))?.unsettledCredits).toBe(FULL_CREDITS - RESERVED_CREDITS);
});

// ── refund ─────────────────────────────────────────────────────────────────

test("refundiran posao izlazi iz dnevnog zbira", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedUser(t, 100_000);
  await seedModel(t);
  const jobId = await reserveJob(t, userId, { status: "reserved" });

  await t.mutation(internal.studio.failJob, { jobId, error: "fal je vratio grešku" });

  expect(await balanceOf(t, userId)).toBe(100_000);
  const usage = await usageOf(t, userId);
  expect(usage?.costUsd).toBe(0);
  expect(usage?.creditsSpent).toBe(0);
  // Broj generacija je brojač pokušaja, ne novca - on se ne vraća.
  expect(usage?.generations).toBe(1);
});

test("refund poravnatog posla vraća i rezervaciju i razliku", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedUser(t, 100_000);
  await seedModel(t);
  const jobId = await reserveJob(t, userId);
  await t.mutation(internal.studio.settleJobCredits, { jobId, reportedSeconds: 7200 });
  expect(await balanceOf(t, userId)).toBe(100_000 - FULL_CREDITS);

  await t.mutation(internal.studio.failJob, { jobId, error: "izlaz nikad nije stigao" });

  expect(await balanceOf(t, userId)).toBe(100_000);
  expect((await transactionsOf(t, jobId, "refund"))[0].amount).toBe(FULL_CREDITS);
  // Iz zbira izlazi PORAVNAT trošak, ne procena po kojoj je posao rezervisan.
  expect((await usageOf(t, userId))?.costUsd).toBe(0);
});
