/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  computeExpiry,
  creditPackGrants,
  invoicePaidGrants,
  planSpend,
  studioPlanSlug,
  usableBalance,
  validatePrompt,
  welcomeBonusKey,
  WELCOME_BONUS_CREDITS,
  type Lot,
  type StripeGrant,
} from "./creditsCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const previousSyncSecret = process.env.WEBHOOK_SYNC_SECRET;
const SYNC_SECRET = "test-sync-secret";

beforeAll(() => {
  process.env.WEBHOOK_SYNC_SECRET = SYNC_SECRET;
});

afterAll(() => {
  if (previousSyncSecret === undefined) delete process.env.WEBHOOK_SYNC_SECRET;
  else process.env.WEBHOOK_SYNC_SECRET = previousSyncSecret;
});

type TestConvex = ReturnType<typeof convexTest>;

const NOW = 1_780_000_000_000;

function lot(id: string, remaining: number, expiresAt: number): Lot {
  return { id, remaining, expiresAt };
}

/** Deterministički PRNG (mulberry32) - invarijanta mora da pukne isto svaki put. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedUser(t: TestConvex) {
  return t.run(async (ctx) =>
    ctx.db.insert("users", { email: "studio@example.com", name: "Studio Student" }),
  );
}

async function seedJob(t: TestConvex, userId: Id<"users">, creditCost: number) {
  return t.run(async (ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "fal-ai/flux-2/flash",
      kind: "image",
      params: "{}",
      promptHash: "hash",
      status: "reserved",
      creditCost,
      createdAt: Date.now(),
    }),
  );
}

async function ledger(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) => {
    const balance = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const lots = await ctx.db
      .query("creditLots")
      .withIndex("by_user_expiry", (q) => q.eq("userId", userId))
      .collect();
    const transactions = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return { balance, lots, transactions };
  });
}

// ── creditsCore ────────────────────────────────────────────────────────────

test("planSpend prvo troši lot koji pre ističe", () => {
  const plan = planSpend(
    [lot("kasni", 100, NOW + 90_000), lot("rani", 100, NOW + 10_000)],
    40,
    NOW,
  );

  expect(plan).toEqual([{ lotId: "rani", take: 40 }]);
});

test("planSpend preseca preko više lotova kad prvi nije dovoljan", () => {
  const plan = planSpend(
    [lot("a", 30, NOW + 10_000), lot("b", 50, NOW + 20_000), lot("c", 100, NOW + 30_000)],
    95,
    NOW,
  );

  expect(plan).toEqual([
    { lotId: "a", take: 30 },
    { lotId: "b", take: 50 },
    { lotId: "c", take: 15 },
  ]);
});

test("planSpend vraća null kad je ukupno nedovoljno", () => {
  expect(planSpend([lot("a", 10, NOW + 10_000), lot("b", 5, NOW + 20_000)], 16, NOW)).toBeNull();
  expect(planSpend([], 1, NOW)).toBeNull();
});

test("planSpend vraća null i kad bi bilo dovoljno samo sa isteklim lotovima", () => {
  const lots = [lot("istekao", 500, NOW - 1), lot("aktivan", 10, NOW + 10_000)];

  expect(planSpend(lots, 11, NOW)).toBeNull();
  expect(planSpend(lots, 10, NOW)).toEqual([{ lotId: "aktivan", take: 10 }]);
});

test("usableBalance ne broji istekle lotove", () => {
  const lots = [
    lot("istekao", 500, NOW - 1),
    lot("istice sad", 300, NOW),
    lot("aktivan", 10, NOW + 1),
    lot("potrosen", 0, NOW + 90_000),
  ];

  expect(usableBalance(lots, NOW)).toBe(10);
  expect(usableBalance([], NOW)).toBe(0);
});

test("computeExpiry na 29. februar i na kraj meseca ostaje validan datum", () => {
  const leapDay = new Date(computeExpiry(Date.UTC(2028, 1, 29, 12, 30, 15, 250)));
  expect([leapDay.getUTCFullYear(), leapDay.getUTCMonth(), leapDay.getUTCDate()]).toEqual([
    2029, 1, 28,
  ]);
  expect([leapDay.getUTCHours(), leapDay.getUTCMinutes(), leapDay.getUTCSeconds()]).toEqual([
    12, 30, 15,
  ]);

  const endOfAugust = new Date(computeExpiry(Date.UTC(2026, 7, 31, 23, 59, 59)));
  expect([endOfAugust.getUTCFullYear(), endOfAugust.getUTCMonth(), endOfAugust.getUTCDate()]).toEqual(
    [2027, 7, 31],
  );

  const endOfJanuary = new Date(computeExpiry(Date.UTC(2026, 0, 31)));
  expect([
    endOfJanuary.getUTCFullYear(),
    endOfJanuary.getUTCMonth(),
    endOfJanuary.getUTCDate(),
  ]).toEqual([2027, 0, 31]);
});

test("validatePrompt hvata prazan, predugačak i zabranjen prompt", () => {
  expect(validatePrompt("   ")).toEqual({ ok: false, reason: "PRAZAN_PROMPT" });
  expect(validatePrompt("a".repeat(2001))).toEqual({ ok: false, reason: "PREDUGACAK_PROMPT" });
  expect(validatePrompt("nacrtaj mi pornografiju")).toEqual({ ok: false, reason: "ZABRANJEN_POJAM" });
  expect(validatePrompt("deepfake predsednika")).toEqual({ ok: false, reason: "ZABRANJEN_POJAM" });
  expect(validatePrompt("a".repeat(2000))).toEqual({ ok: true });
  // Kratki višeznačni koreni ne smeju da obore nevin prompt.
  expect(validatePrompt("Gol u 90. minutu, navijači slave na tribinama")).toEqual({ ok: true });
});

// ── Convex sloj ────────────────────────────────────────────────────────────

test("invarijanta: posle 200 nasumičnih operacija balans === zbir lotova === zbir transakcija", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const random = seededRandom(20260819);
  const spentJobs: Id<"generationJobs">[] = [];
  const counts = { grant: 0, spend: 0, rejected: 0, refund: 0 };

  for (let step = 0; step < 200; step += 1) {
    const roll = random();

    if (roll < 0.4) {
      counts.grant += 1;
      await t.mutation(internal.credits.grantCredits, {
        userId,
        amount: 1 + Math.floor(random() * 400),
        source: "purchase",
        idempotencyKey: { field: "stripeSessionId", value: `cs_test_${counts.grant}` },
      });
      continue;
    }

    if (roll < 0.85) {
      // Svaka četvrta potrošnja je namerno preko balansa: grana koja NE SME
      // ništa da upiše mora da se provuče kroz istu nasumičnu putanju.
      const amount = random() < 0.25 ? 5_000_000 : 1 + Math.floor(random() * 300);
      const jobId = await seedJob(t, userId, amount);
      try {
        await t.mutation(internal.credits.spendCredits, { userId, amount, jobId });
        spentJobs.push(jobId);
        counts.spend += 1;
      } catch (error) {
        expect(String(error)).toContain("NEDOVOLJNO_KREDITA");
        counts.rejected += 1;
      }
      continue;
    }

    if (spentJobs.length === 0) continue;
    counts.refund += 1;
    await t.mutation(internal.credits.refundCredits, {
      jobId: spentJobs[Math.floor(random() * spentJobs.length)],
    });
  }

  const { balance, lots, transactions } = await ledger(t, userId);
  const lotSum = usableBalance(
    lots.map((row) => ({ id: row._id, remaining: row.remaining, expiresAt: row.expiresAt })),
    Date.now(),
  );
  const transactionSum = transactions.reduce((sum, row) => sum + row.amount, 0);

  // Bez ovoga bi test mogao da prođe na praznom ledgeru.
  expect(counts.grant).toBeGreaterThan(0);
  expect(counts.spend).toBeGreaterThan(0);
  expect(counts.rejected).toBeGreaterThan(0);
  expect(counts.refund).toBeGreaterThan(0);

  expect(balance?.balance).toBe(lotSum);
  expect(balance?.balance).toBe(transactionSum);
  expect(lotSum).toBeGreaterThan(0);
});

test("dupli grantCredits sa istim stripeInvoiceId ostavlja tačno jedan lot", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const idempotencyKey = { field: "stripeInvoiceId" as const, value: "in_test_1" };

  const first = await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 2000,
    source: "plan_grant",
    idempotencyKey,
  });
  const second = await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 2000,
    source: "plan_grant",
    idempotencyKey,
  });

  expect(second).toBe(first);
  const { balance, lots, transactions } = await ledger(t, userId);
  expect(lots).toHaveLength(1);
  expect(transactions).toHaveLength(1);
  expect(balance?.balance).toBe(2000);
  expect(balance?.lifetimePurchased).toBe(2000);
});

test("dupli refundCredits za isti jobId upiše tačno jedan red", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 100,
    source: "purchase",
    idempotencyKey: { field: "stripeSessionId", value: "cs_refund" },
  });
  const jobId = await seedJob(t, userId, 40);
  await t.mutation(internal.credits.spendCredits, { userId, amount: 40, jobId });

  const firstRefund = await t.mutation(internal.credits.refundCredits, { jobId });
  const secondRefund = await t.mutation(internal.credits.refundCredits, { jobId });

  expect(firstRefund).not.toBeNull();
  expect(secondRefund).toBeNull();
  const { balance, lots, transactions } = await ledger(t, userId);
  expect(transactions.filter((row) => row.type === "refund")).toHaveLength(1);
  expect(lots.filter((row) => row.source === "refund")).toHaveLength(1);
  expect(balance?.balance).toBe(100);
  expect(balance?.lifetimeSpent).toBe(0);
});

test("spendCredits preko balansa baca grešku i ne menja ništa", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 100,
    source: "purchase",
    idempotencyKey: { field: "stripeSessionId", value: "cs_over" },
  });
  const jobId = await seedJob(t, userId, 101);
  const before = await ledger(t, userId);

  await expect(
    t.mutation(internal.credits.spendCredits, { userId, amount: 101, jobId }),
  ).rejects.toThrow("NEDOVOLJNO_KREDITA");

  const after = await ledger(t, userId);
  expect(after.lots).toEqual(before.lots);
  expect(after.balance).toEqual(before.balance);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.balance?.balance).toBe(100);
  expect(after.transactions).toHaveLength(1);
});

test("spendCredits tačno na balans prolazi i ostavlja balans 0", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 60,
    source: "purchase",
    idempotencyKey: { field: "stripeSessionId", value: "cs_exact_1" },
  });
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 40,
    source: "welcome_bonus",
    idempotencyKey: { field: "stripeInvoiceId", value: "in_exact:welcome" },
  });
  const jobId = await seedJob(t, userId, 100);

  await t.mutation(internal.credits.spendCredits, { userId, amount: 100, jobId });

  const { balance, lots, transactions } = await ledger(t, userId);
  expect(balance?.balance).toBe(0);
  expect(balance?.lifetimeSpent).toBe(100);
  // Bonus ne ulazi u `lifetimePurchased` - za njega nije legao novac.
  expect(balance?.lifetimePurchased).toBe(60);
  expect(lots.every((row) => row.remaining === 0 && row.exhaustedAt !== undefined)).toBe(true);
  expect(transactions).toHaveLength(3);
  expect(transactions.at(-1)).toMatchObject({ amount: -100, type: "spend", balanceAfter: 0 });
});

// ── Stripe webhook -> ledger ───────────────────────────────────────────────

const PREMIUM_MONTHLY_CREDITS = 2000;

async function seedPack(
  t: TestConvex,
  pack: { slug: string; credits: number; kind: "pack" | "plan"; planTier?: "basic" | "premium" },
) {
  return t.run(async (ctx) =>
    ctx.db.insert("creditPacks", {
      slug: pack.slug,
      titleSr: pack.slug,
      titleEn: pack.slug,
      priceEurCents: 2499,
      credits: pack.credits,
      bonusPercent: 0,
      kind: pack.kind,
      planTier: pack.planTier,
      sortOrder: 10,
      isActive: true,
    }),
  );
}

/** Metapodaci pretplate koje `createPlanCheckoutSession` upisuje (A5). */
function planMetadata(userId: Id<"users">): Record<string, string> {
  return {
    kind: "plan",
    planSlug: "premium",
    courseId: "course_seed",
    courseSlug: "ai-osnove",
    userId,
  };
}

/** Ista petlja koju vrti `app/api/stripe/webhook/route.ts`. */
async function applyStripeGrants(t: TestConvex, grants: StripeGrant[]) {
  for (const grant of grants) {
    await t.mutation(api.credits.applyStripeGrant, {
      ...grant,
      syncSecret: SYNC_SECRET,
      userId: grant.userId as Id<"users">,
      packId: grant.packId as Id<"creditPacks"> | undefined,
    });
  }
}

test("ista invoice.paid faktura obradjena dvaput ostavlja tačno jedan lot", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const packId = await seedPack(t, {
    slug: "premium",
    credits: PREMIUM_MONTHLY_CREDITS,
    kind: "plan",
    planTier: "premium",
  });
  const grants = invoicePaidGrants({
    invoiceId: "in_cycle_1",
    billingReason: "subscription_cycle",
    subscriptionMetadata: planMetadata(userId),
    planCredits: PREMIUM_MONTHLY_CREDITS,
    planPackId: packId,
  });

  await applyStripeGrants(t, grants);
  await applyStripeGrants(t, grants);

  const { balance, lots, transactions } = await ledger(t, userId);
  expect(lots).toHaveLength(1);
  expect(transactions).toHaveLength(1);
  expect(balance?.balance).toBe(PREMIUM_MONTHLY_CREDITS);
  expect(balance?.lifetimePurchased).toBe(PREMIUM_MONTHLY_CREDITS);
  expect(lots[0]).toMatchObject({
    source: "plan_grant",
    stripeInvoiceId: "in_cycle_1",
    packId,
  });
});

test("ista checkout.session.completed sesija obradjena dvaput ostavlja tačno jedan lot", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const packId = await seedPack(t, { slug: "starter", credits: 500, kind: "pack" });
  const grants = creditPackGrants({
    sessionId: "cs_test_starter",
    metadata: {
      kind: "credit_pack",
      packId,
      packSlug: "starter",
      userId,
      credits: "500",
    },
  });

  await applyStripeGrants(t, grants);
  await applyStripeGrants(t, grants);

  const { balance, lots, transactions } = await ledger(t, userId);
  expect(lots).toHaveLength(1);
  expect(transactions).toHaveLength(1);
  expect(balance?.balance).toBe(500);
  expect(balance?.lifetimePurchased).toBe(500);
  expect(lots[0]).toMatchObject({
    source: "purchase",
    stripeSessionId: "cs_test_starter",
    packId,
  });
});

test("subscription_create faktura dodeli dozu plana I welcome bonus, oba nezavisno idempotentna", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const packId = await seedPack(t, {
    slug: "premium",
    credits: PREMIUM_MONTHLY_CREDITS,
    kind: "plan",
    planTier: "premium",
  });
  const grants = invoicePaidGrants({
    invoiceId: "in_create_1",
    billingReason: "subscription_create",
    subscriptionMetadata: planMetadata(userId),
    planCredits: PREMIUM_MONTHLY_CREDITS,
    planPackId: packId,
  });

  expect(grants.map((grant) => grant.source)).toEqual(["plan_grant", "welcome_bonus"]);
  // Doza visi na fakturi, bonus na korisniku - inače nova pretplata donosi
  // novih 150 kredita.
  expect(grants.map((grant) => grant.stripeInvoiceId)).toEqual([
    "in_create_1",
    welcomeBonusKey(userId),
  ]);

  await applyStripeGrants(t, grants);
  const first = await ledger(t, userId);
  expect(first.lots).toHaveLength(2);
  expect(first.balance?.balance).toBe(PREMIUM_MONTHLY_CREDITS + WELCOME_BONUS_CREDITS);
  // Bonus nije uplata, pa ne ulazi u `lifetimePurchased`.
  expect(first.balance?.lifetimePurchased).toBe(PREMIUM_MONTHLY_CREDITS);

  // Svaki lot se ponavlja nezavisno od drugog: prvo samo doza, pa samo bonus,
  // pa oba - ni jedan redosled ne sme da otvori treći lot.
  await applyStripeGrants(t, [grants[0]]);
  await applyStripeGrants(t, [grants[1]]);
  await applyStripeGrants(t, grants);

  const after = await ledger(t, userId);
  expect(after.lots).toHaveLength(2);
  expect(after.transactions).toHaveLength(2);
  expect(after.balance?.balance).toBe(PREMIUM_MONTHLY_CREDITS + WELCOME_BONUS_CREDITS);
  expect(after.lots.map((row) => row.source).sort()).toEqual(["plan_grant", "welcome_bonus"]);
  expect(after.lots.map((row) => row.stripeInvoiceId).sort()).toEqual(
    ["in_create_1", welcomeBonusKey(userId)].sort(),
  );
});

test("obnova pretplate dodeli SAMO dozu plana, bez welcome bonusa", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const packId = await seedPack(t, {
    slug: "premium",
    credits: PREMIUM_MONTHLY_CREDITS,
    kind: "plan",
    planTier: "premium",
  });
  const grants = invoicePaidGrants({
    invoiceId: "in_cycle_2",
    billingReason: "subscription_cycle",
    subscriptionMetadata: planMetadata(userId),
    planCredits: PREMIUM_MONTHLY_CREDITS,
    planPackId: packId,
  });

  expect(grants).toHaveLength(1);
  await applyStripeGrants(t, grants);

  const { balance, lots, transactions } = await ledger(t, userId);
  expect(lots).toHaveLength(1);
  expect(lots[0].source).toBe("plan_grant");
  expect(lots.some((row) => row.source === "welcome_bonus")).toBe(false);
  expect(transactions.some((row) => row.type === "bonus")).toBe(false);
  expect(balance?.balance).toBe(PREMIUM_MONTHLY_CREDITS);
});

test("invoice.paid bez plan metapodataka ne dodeli ništa i ne pukne", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  // Pretplata na kurs iz postojećeg flow-a: ima userId i courseId, ali nema `kind`.
  const courseMetadata: Record<string, string> = {
    courseId: "course_seed",
    courseSlug: "ai-osnove",
    userId,
  };

  expect(studioPlanSlug(courseMetadata)).toBeNull();
  // Marker `kind` je taj koji kaze da je pretplata Studio plan - sam `planSlug`
  // u metapodacima nije dovoljan, inace bi tudji marker otvorio ledger.
  expect(studioPlanSlug({ ...courseMetadata, planSlug: "premium" })).toBeNull();
  expect(studioPlanSlug({ ...courseMetadata, kind: "credit_pack", planSlug: "premium" })).toBeNull();

  const grants = invoicePaidGrants({
    invoiceId: "in_kurs_1",
    billingReason: "subscription_create",
    subscriptionMetadata: courseMetadata,
    planCredits: PREMIUM_MONTHLY_CREDITS,
  });
  expect(grants).toEqual([]);

  await applyStripeGrants(t, grants);

  const { balance, lots, transactions } = await ledger(t, userId);
  expect(balance).toBeNull();
  expect(lots).toEqual([]);
  expect(transactions).toEqual([]);
});

test("applyStripeGrant odbija pogrešan syncSecret i grant bez tačno jednog ključa", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const base = { userId, amount: 500, source: "purchase" as const };

  await expect(
    t.mutation(api.credits.applyStripeGrant, {
      ...base,
      syncSecret: "pogresan-sekret",
      stripeSessionId: "cs_forbidden",
    }),
  ).rejects.toThrow("Forbidden");

  await expect(
    t.mutation(api.credits.applyStripeGrant, { ...base, syncSecret: SYNC_SECRET }),
  ).rejects.toThrow("NEVALIDAN_KLJUC_IDEMPOTENCIJE");

  await expect(
    t.mutation(api.credits.applyStripeGrant, {
      ...base,
      syncSecret: SYNC_SECRET,
      stripeInvoiceId: "in_oba",
      stripeSessionId: "cs_oba",
    }),
  ).rejects.toThrow("NEVALIDAN_KLJUC_IDEMPOTENCIJE");

  const { balance, lots, transactions } = await ledger(t, userId);
  expect(balance).toBeNull();
  expect(lots).toEqual([]);
  expect(transactions).toEqual([]);
});

test("regresioni cuvar: sesija pretplate na kurs ne ulazi u grane Studija", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  // Tacno ono sto `createCourseCheckoutSession` upisuje danas (lib/stripe.ts).
  const courseSession = {
    sessionId: "cs_kurs_1",
    metadata: {
      courseId: "course_seed",
      courseSlug: "ai-osnove",
      courseTitle: "AI osnove",
      userId,
    },
  };

  expect(creditPackGrants(courseSession)).toEqual([]);
  expect(creditPackGrants({ ...courseSession, metadata: null })).toEqual([]);
  // Paket bez upotrebljivih metapodataka takodje ne sme nista da doznaci.
  expect(
    creditPackGrants({ sessionId: "cs_prazan", metadata: { kind: "credit_pack", userId } }),
  ).toEqual([]);
  // Ni sesija plana - ista uplata bi tada legla i ovde i na `invoice.paid`.
  expect(
    creditPackGrants({
      sessionId: "cs_plan_1",
      metadata: { kind: "plan", planSlug: "premium", userId, credits: "2000" },
    }),
  ).toEqual([]);

  await applyStripeGrants(t, creditPackGrants(courseSession));

  const { balance, lots, transactions } = await ledger(t, userId);
  expect(balance).toBeNull();
  expect(lots).toEqual([]);
  expect(transactions).toEqual([]);
});

test("dve subscription_create fakture za istog korisnika daju tačno 150 kredita", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  // Prva pretplata, pa otkazivanje, pa nova pretplata: nova faktura, nov
  // `invoice.id`, isti korisnik. Basic nema mesečnu dozu, pa je bonus jedini
  // grant i lako se prebroji.
  for (const invoiceId of ["in_prva", "in_druga_posle_otkazivanja"]) {
    await applyStripeGrants(
      t,
      invoicePaidGrants({
        invoiceId,
        billingReason: "subscription_create",
        subscriptionMetadata: planMetadata(userId),
        planCredits: 0,
      }),
    );
  }

  const { balance, lots, transactions } = await ledger(t, userId);
  expect(lots).toHaveLength(1);
  expect(lots[0]).toMatchObject({
    source: "welcome_bonus",
    stripeInvoiceId: welcomeBonusKey(userId),
  });
  expect(transactions.filter((row) => row.type === "bonus")).toHaveLength(1);
  expect(balance?.balance).toBe(WELCOME_BONUS_CREDITS);
});

test("bonus se ne dodeljuje drugi put ni kad lot nosi stari ključ po fakturi", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  // Lot otvoren pre prelaska na ključ po korisniku - drugi sloj u
  // `grantCredits` ga mora prepoznati po izvoru, ne po ključu.
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: WELCOME_BONUS_CREDITS,
    source: "welcome_bonus",
    idempotencyKey: { field: "stripeInvoiceId", value: "in_stara:welcome" },
  });

  await applyStripeGrants(
    t,
    invoicePaidGrants({
      invoiceId: "in_nova",
      billingReason: "subscription_create",
      subscriptionMetadata: planMetadata(userId),
      planCredits: 0,
    }),
  );

  const { balance, lots } = await ledger(t, userId);
  expect(lots).toHaveLength(1);
  expect(balance?.balance).toBe(WELCOME_BONUS_CREDITS);
});
