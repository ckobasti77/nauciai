/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  chargeReversal,
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

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

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

test("validatePrompt hvata prazan, predugačak i zabranjen prompt, sa kategorijom", () => {
  expect(validatePrompt("   ")).toEqual({ ok: false, reason: "PRAZAN_PROMPT" });
  expect(validatePrompt("a".repeat(2001))).toEqual({ ok: false, reason: "PREDUGACAK_PROMPT" });
  expect(validatePrompt("nacrtaj mi pornografiju")).toEqual({
    ok: false,
    reason: "ZABRANJEN_POJAM",
    category: "nsfw",
  });
  expect(validatePrompt("deepfake predsednika")).toEqual({
    ok: false,
    reason: "ZABRANJEN_POJAM",
    category: "deepfake",
  });
  expect(validatePrompt("a".repeat(2000))).toEqual({ ok: true });
  // Kratki višeznačni koreni ne smeju da obore nevin prompt.
  expect(validatePrompt("Gol u 90. minutu, navijači slave na tribinama")).toEqual({ ok: true });
});

test("validatePrompt: nove kategorije (nasilje, javne ličnosti) i njihovi lažni pozitivi", () => {
  // Nasilje (studio-public F2.5).
  expect(validatePrompt("scena masakra u gradu")).toEqual({
    ok: false,
    reason: "ZABRANJEN_POJAM",
    category: "violence",
  });
  expect(validatePrompt("school shooting scene")).toEqual({
    ok: false,
    reason: "ZABRANJEN_POJAM",
    category: "violence",
  });
  // "gore" (prilog) i "krv" NISU u listi - nevin prompt prolazi.
  expect(validatePrompt("pogled sa planine gore ka dolini")).toEqual({ ok: true });

  // Javne ličnosti - prefiks hvata padeže.
  expect(validatePrompt("portret Vučića na konju")).toEqual({
    ok: false,
    reason: "ZABRANJEN_POJAM",
    category: "public_figure",
  });
  expect(validatePrompt("slika Putina u parku")).toEqual({
    ok: false,
    reason: "ZABRANJEN_POJAM",
    category: "public_figure",
  });
  expect(validatePrompt("donald trump govori")).toEqual({
    ok: false,
    reason: "ZABRANJEN_POJAM",
    category: "public_figure",
  });
  // Cela reč, ne prefiks: "trumpet" i "trampa" (razmena) su nevini.
  expect(validatePrompt("jazz trumpet player on stage")).toEqual({ ok: true });
  expect(validatePrompt("trampa dva bicikla za skejt")).toEqual({ ok: true });
});

// ── Convex sloj ────────────────────────────────────────────────────────────

test("invarijanta: posle 200 nasumičnih operacija balans === zbir lotova === zbir transakcija", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  // Nov seed (20260819 → 20260830) uz dodatu signup-bonus granu (studio-public
  // F2): test tvrdi invarijante i brojače > 0, ne tačne zbirove, pa je promena
  // seed-a bezbedna po konstrukciji.
  const random = seededRandom(20260830);
  const spentJobs: Id<"generationJobs">[] = [];
  const counts = { grant: 0, bonus: 0, spend: 0, rejected: 0, refund: 0 };

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

    if (roll < 0.45) {
      // Signup bonus (studio-public F2) sa NAMERNO istim ključem svaki put -
      // oba sloja idempotencije (`signup:<userId>` + `by_user_source`) se
      // provlače kroz nasumičnu putanju; sme da ostane najviše JEDAN lot.
      counts.bonus += 1;
      await t.mutation(internal.credits.grantCredits, {
        userId,
        amount: 25,
        source: "signup_bonus",
        idempotencyKey: { field: "stripeInvoiceId", value: `signup:${userId}` },
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
  expect(counts.bonus).toBeGreaterThan(1);
  expect(counts.spend).toBeGreaterThan(0);
  expect(counts.rejected).toBeGreaterThan(0);
  expect(counts.refund).toBeGreaterThan(0);

  // Više pokušaja bonusa, tačno jedan lot i tačno jedna bonus transakcija.
  expect(lots.filter((row) => row.source === "signup_bonus")).toHaveLength(1);
  expect(transactions.filter((row) => row.type === "bonus")).toHaveLength(1);

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
    amountPaid: 1000,
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
    amountPaid: 1000,
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
    amountPaid: 1000,
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
    amountPaid: 1000,
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
        amountPaid: 1000,
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

test("faktura naplaćena na 0 € ne dodeljuje ništa - ni mesečnu dozu, ni welcome bonus", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const packId = await seedPack(t, {
    slug: "premium",
    credits: PREMIUM_MONTHLY_CREDITS,
    kind: "plan",
    planTier: "premium",
  });

  // Kupon od 100% "forever" na Premium: svakog meseca uredna `invoice.paid` sa
  // novim `invoice.id`, dakle nova doza - a naplaćeno je nula. Idempotencija po
  // fakturi tu ne pomaže, jer je svaka faktura zaista nova.
  const coupon = [
    { invoiceId: "in_kupon_prva", billingReason: "subscription_create" },
    { invoiceId: "in_kupon_druga", billingReason: "subscription_cycle" },
    { invoiceId: "in_kupon_treca", billingReason: "subscription_cycle" },
  ];
  for (const invoice of coupon) {
    const grants = invoicePaidGrants({
      ...invoice,
      subscriptionMetadata: planMetadata(userId),
      planCredits: PREMIUM_MONTHLY_CREDITS,
      planPackId: packId,
      amountPaid: 0,
    });
    expect(grants).toEqual([]);
    await applyStripeGrants(t, grants);
  }

  // Faktura bez iznosa je isto "nije naplaćeno" - nagađanje bi ovde bilo
  // besplatan Premium.
  expect(
    invoicePaidGrants({
      invoiceId: "in_bez_iznosa",
      billingReason: "subscription_cycle",
      subscriptionMetadata: planMetadata(userId),
      planCredits: PREMIUM_MONTHLY_CREDITS,
      planPackId: packId,
      amountPaid: null,
    }),
  ).toEqual([]);

  const { balance, lots, transactions } = await ledger(t, userId);
  expect(balance).toBeNull();
  expect(lots).toEqual([]);
  expect(transactions).toEqual([]);

  // Ista faktura sa stvarnom uplatom i dalje prolazi.
  await applyStripeGrants(
    t,
    invoicePaidGrants({
      invoiceId: "in_placena",
      billingReason: "subscription_cycle",
      subscriptionMetadata: planMetadata(userId),
      planCredits: PREMIUM_MONTHLY_CREDITS,
      planPackId: packId,
      amountPaid: 1990,
    }),
  );
  expect((await ledger(t, userId)).balance?.balance).toBe(PREMIUM_MONTHLY_CREDITS);
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
      amountPaid: 1000,
    }),
  );

  const { balance, lots } = await ledger(t, userId);
  expect(lots).toHaveLength(1);
  expect(balance?.balance).toBe(WELCOME_BONUS_CREDITS);
});

// ── Stripe webhook -> povraćaji (X7) ───────────────────────────────────────

/** `charge.refunded` / `charge.dispute.created` onako kako ih webhook prosledi. */
async function applyReversal(
  t: TestConvex,
  reversal: { eventId: string; kind: "refund" | "dispute"; sessionId?: string; invoiceId?: string },
) {
  return t.mutation(api.credits.applyStripeReversal, {
    syncSecret: SYNC_SECRET,
    eventId: reversal.eventId,
    kind: reversal.kind,
    ...(reversal.invoiceId ? { stripeInvoiceId: reversal.invoiceId } : {}),
    ...(reversal.sessionId ? { stripeSessionId: reversal.sessionId } : {}),
  });
}

/** Kupljen paket od 500 kredita, isto kao u testu idempotencije iznad. */
async function seedPurchasedPack(t: TestConvex, userId: Id<"users">, sessionId: string) {
  const packId = await seedPack(t, { slug: "starter", credits: 500, kind: "pack" });
  await applyStripeGrants(
    t,
    creditPackGrants({
      sessionId,
      metadata: { kind: "credit_pack", packId, packSlug: "starter", userId, credits: "500" },
    }),
  );
  return packId;
}

test("charge.refunded oduzima tačno onoliko kredita koliko je ta uplata dodelila", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedPurchasedPack(t, userId, "cs_refund");
  expect((await ledger(t, userId)).balance?.balance).toBe(500);

  const outcome = await applyReversal(t, {
    eventId: "evt_refund_1",
    kind: "refund",
    sessionId: "cs_refund",
  });

  expect(outcome).toEqual({ revoked: 500, blocked: false });
  const { balance, lots, transactions } = await ledger(t, userId);
  expect(balance?.balance).toBe(0);
  // Novac je vraćen, pa i "koliko je ikad kupljeno" mora da padne - inače bi
  // refundiran paket zauvek stajao kao kupovina.
  expect(balance?.lifetimePurchased).toBe(0);
  expect(lots).toHaveLength(1);
  expect(lots[0].remaining).toBe(0);
  expect(lots[0].revokedAt).toEqual(expect.any(Number));
  expect(transactions.filter((row) => row.type === "revocation")).toHaveLength(1);
  expect(transactions.at(-1)).toMatchObject({ amount: -500, type: "revocation", balanceAfter: 0 });
});

test("dvaput isporučen isti charge.refunded ne oduzme dvaput", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedPurchasedPack(t, userId, "cs_refund");

  const first = await applyReversal(t, {
    eventId: "evt_refund_1",
    kind: "refund",
    sessionId: "cs_refund",
  });
  const second = await applyReversal(t, {
    eventId: "evt_refund_1",
    kind: "refund",
    sessionId: "cs_refund",
  });

  expect(first).toEqual({ revoked: 500, blocked: false });
  // Drugi prolaz vrati ISTI ishod, jer webhook na osnovu njega odlučuje šta da
  // javi Stripe-u - a ne sme da upiše nijedan nov red.
  expect(second).toEqual({ revoked: 500, blocked: false });

  const { balance, lots, transactions } = await ledger(t, userId);
  expect(balance?.balance).toBe(0);
  expect(lots).toHaveLength(1);
  expect(transactions.filter((row) => row.type === "revocation")).toHaveLength(1);
  const reversals = await t.run((ctx) => ctx.db.query("creditReversals").collect());
  expect(reversals).toHaveLength(1);
});

test("refundacija posle potrošnje gura saldo u minus, tačno za potrošeni deo", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedPurchasedPack(t, userId, "cs_refund");
  const jobId = await seedJob(t, userId, 320);
  await t.mutation(internal.credits.spendCredits, { userId, amount: 320, jobId });
  expect((await ledger(t, userId)).balance?.balance).toBe(180);

  await applyReversal(t, { eventId: "evt_refund_1", kind: "refund", sessionId: "cs_refund" });

  // 500 dodeljeno, 320 potrošeno: 180 se oduzme sa lota, 320 ostaje kao minus.
  const { balance } = await ledger(t, userId);
  expect(balance?.balance).toBe(-320);
});

test("charge.dispute.created zamrzava kredite i ostavlja bravu na nalogu", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedPurchasedPack(t, userId, "cs_spor");

  const outcome = await applyReversal(t, {
    eventId: "evt_dispute_1",
    kind: "dispute",
    sessionId: "cs_spor",
  });

  expect(outcome).toEqual({ revoked: 500, blocked: true });
  expect((await ledger(t, userId)).balance?.balance).toBe(0);
  const reversals = await t.run((ctx) =>
    ctx.db
      .query("creditReversals")
      .withIndex("by_userId_and_kind", (q) => q.eq("userId", userId).eq("kind", "dispute"))
      .collect(),
  );
  expect(reversals).toHaveLength(1);
  expect(reversals[0]).toMatchObject({ eventId: "evt_dispute_1", revokedCredits: 500 });
});

test("refundacija posle spora nad istom uplatom ne oduzima kredite drugi put", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedPurchasedPack(t, userId, "cs_spor");

  await applyReversal(t, { eventId: "evt_dispute_1", kind: "dispute", sessionId: "cs_spor" });
  const refund = await applyReversal(t, {
    eventId: "evt_refund_2",
    kind: "refund",
    sessionId: "cs_spor",
  });

  // Dva RAZLIČITA dogadjaja, pa oba upisuju svoj red - ali lot je već povučen,
  // pa drugi ne pomera nijedan broj.
  expect(refund).toEqual({ revoked: 0, blocked: false });
  const { balance, transactions } = await ledger(t, userId);
  expect(balance?.balance).toBe(0);
  expect(transactions.filter((row) => row.type === "revocation")).toHaveLength(1);
  const reversals = await t.run((ctx) => ctx.db.query("creditReversals").collect());
  expect(reversals).toHaveLength(2);
});

test("povraćaj po fakturi oduzima dozu plana, a welcome bonus ostaje netaknut", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const packId = await seedPack(t, {
    slug: "premium",
    credits: PREMIUM_MONTHLY_CREDITS,
    kind: "plan",
    planTier: "premium",
  });
  await applyStripeGrants(
    t,
    invoicePaidGrants({
      invoiceId: "in_prva",
      billingReason: "subscription_create",
      subscriptionMetadata: planMetadata(userId),
      planCredits: PREMIUM_MONTHLY_CREDITS,
      planPackId: packId,
      amountPaid: 1990,
    }),
  );

  await applyReversal(t, { eventId: "evt_refund_3", kind: "refund", invoiceId: "in_prva" });

  // Bonus visi na ključu `welcome:<userId>`, ne na fakturi - njega povlači
  // odvojena odluka podrške, ne ovaj dogadjaj.
  const { balance } = await ledger(t, userId);
  expect(balance?.balance).toBe(WELCOME_BONUS_CREDITS);
});

test("povraćaj naplate koja nikad nije dodelila kredite ne upisuje ništa", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedPurchasedPack(t, userId, "cs_paket");

  // Pretplata na kurs: postoji faktura, ali lot pod njom nikad nije otvoren.
  const outcome = await applyReversal(t, {
    eventId: "evt_refund_kurs",
    kind: "refund",
    invoiceId: "in_kurs",
  });

  expect(outcome).toEqual({ revoked: 0, blocked: false });
  expect((await ledger(t, userId)).balance?.balance).toBe(500);
  expect(await t.run((ctx) => ctx.db.query("creditReversals").collect())).toHaveLength(0);
});

test("applyStripeReversal odbija pogrešan syncSecret i poziv bez tačno jednog ključa", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedPurchasedPack(t, userId, "cs_refund");

  await expect(
    t.mutation(api.credits.applyStripeReversal, {
      syncSecret: "pogresan",
      eventId: "evt_x",
      kind: "refund",
      stripeSessionId: "cs_refund",
    }),
  ).rejects.toThrow(/Forbidden/);

  await expect(
    t.mutation(api.credits.applyStripeReversal, {
      syncSecret: SYNC_SECRET,
      eventId: "evt_y",
      kind: "refund",
    }),
  ).rejects.toThrow(/NEVALIDAN_KLJUC_IDEMPOTENCIJE/);

  await expect(
    t.mutation(api.credits.applyStripeReversal, {
      syncSecret: SYNC_SECRET,
      eventId: "evt_z",
      kind: "refund",
      stripeSessionId: "cs_refund",
      stripeInvoiceId: "in_refund",
    }),
  ).rejects.toThrow(/NEVALIDAN_KLJUC_IDEMPOTENCIJE/);

  expect((await ledger(t, userId)).balance?.balance).toBe(500);
});

test("chargeReversal bira fakturu pre sesije i odbija naplatu bez ijednog ključa", () => {
  expect(
    chargeReversal({ eventId: "evt_1", kind: "refund", invoiceId: "in_1", sessionId: "cs_1" }),
  ).toEqual({ eventId: "evt_1", kind: "refund", stripeInvoiceId: "in_1" });
  expect(chargeReversal({ eventId: "evt_1", kind: "dispute", sessionId: "cs_1" })).toEqual({
    eventId: "evt_1",
    kind: "dispute",
    stripeSessionId: "cs_1",
  });
  expect(
    chargeReversal({ eventId: "evt_1", kind: "refund", invoiceId: null, sessionId: null }),
  ).toBeNull();
  expect(chargeReversal({ eventId: "  ", kind: "refund", sessionId: "cs_1" })).toBeNull();
});
