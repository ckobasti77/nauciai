import { paginationOptsValidator } from "convex/server";
import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { computeExpiry, isValidCreditAmount, planSpend } from "./creditsCore";
import { requireSyncSecret, requireUserId } from "./helpers";

const creditLotSource = v.union(
  v.literal("purchase"),
  v.literal("plan_grant"),
  v.literal("welcome_bonus"),
  v.literal("admin_grant"),
  v.literal("refund"),
);

type LotSource = Infer<typeof creditLotSource>;

/** Webhook sme da doznači samo ono za šta je Stripe stvarno naplatio. */
const stripeGrantSource = v.union(
  v.literal("purchase"),
  v.literal("plan_grant"),
  v.literal("welcome_bonus"),
);

/**
 * Ključ ide u `stripeInvoiceId` ili `stripeSessionId` lota, pa se pre svakog
 * inserta traži po odgovarajućem indeksu. Obavezan je i za grantove bez
 * Stripe-a (admin) - dupli grant je izgubljen novac, a ne kozmetika.
 */
const idempotencyKey = v.object({
  field: v.union(v.literal("stripeInvoiceId"), v.literal("stripeSessionId")),
  value: v.string(),
});

const grantMeta = v.object({
  packId: v.optional(v.id("creditPacks")),
  note: v.optional(v.string()),
});

type IdempotencyKey = { field: "stripeInvoiceId" | "stripeSessionId"; value: string };

const TRANSACTION_TYPE_BY_SOURCE = {
  purchase: "purchase",
  plan_grant: "purchase",
  welcome_bonus: "bonus",
  admin_grant: "admin_adjust",
  refund: "refund",
} as const;

/** Samo izvori za koje je stvarno legao novac ulaze u `lifetimePurchased`. */
const PAID_SOURCES: ReadonlySet<LotSource> = new Set<LotSource>(["purchase", "plan_grant"]);

async function findLotByKey(ctx: QueryCtx, key: IdempotencyKey) {
  if (key.field === "stripeInvoiceId") {
    return ctx.db
      .query("creditLots")
      .withIndex("by_stripe_invoice", (q) => q.eq("stripeInvoiceId", key.value))
      .unique();
  }

  return ctx.db
    .query("creditLots")
    .withIndex("by_stripe_session", (q) => q.eq("stripeSessionId", key.value))
    .unique();
}

/**
 * `creditBalances` je keš zbira `remaining` po lotovima, pa se pomera isključivo
 * u istoj mutaciji koja je pomerila lotove. Vraća novi balans za `balanceAfter`.
 */
async function applyBalanceDelta(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number,
  delta: { balance: number; purchased: number; spent: number },
) {
  const row = await ctx.db
    .query("creditBalances")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const next = {
    balance: (row?.balance ?? 0) + delta.balance,
    lifetimePurchased: (row?.lifetimePurchased ?? 0) + delta.purchased,
    lifetimeSpent: (row?.lifetimeSpent ?? 0) + delta.spent,
    updatedAt: now,
  };

  if (row) await ctx.db.patch(row._id, next);
  else await ctx.db.insert("creditBalances", { userId, ...next });

  return next.balance;
}

export const getBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return {
      balance: row?.balance ?? 0,
      lifetimePurchased: row?.lifetimePurchased ?? 0,
      lifetimeSpent: row?.lifetimeSpent ?? 0,
      updatedAt: row?.updatedAt ?? null,
    };
  },
});

export const getLots = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const lots = await ctx.db
      .query("creditLots")
      .withIndex("by_user_active", (q) => q.eq("userId", userId).eq("exhaustedAt", undefined))
      .collect();

    return lots
      .sort((a, b) => a.expiresAt - b.expiresAt)
      .map((lot) => ({
        _id: lot._id,
        source: lot.source,
        granted: lot.granted,
        remaining: lot.remaining,
        grantedAt: lot.grantedAt,
        expiresAt: lot.expiresAt,
      }));
  },
});

export const getTransactions = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const result = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.map((transaction) => ({
        _id: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        balanceAfter: transaction.balanceAfter,
        jobId: transaction.jobId,
        note: transaction.note,
        createdAt: transaction.createdAt,
      })),
    };
  },
});

/**
 * Otvara nov lot i upisuje transakciju i balans u istoj mutaciji. Ako lot sa
 * istim `idempotencyKey` već postoji, vraća njegov ID i ne upisuje ništa.
 */
export const grantCredits = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    source: creditLotSource,
    idempotencyKey,
    meta: v.optional(grantMeta),
  },
  handler: async (ctx, args) => {
    if (!isValidCreditAmount(args.amount)) throw new Error("NEVALIDAN_IZNOS");

    const existing = await findLotByKey(ctx, args.idempotencyKey);
    if (existing) return existing._id;

    const now = Date.now();
    const expiresAt = computeExpiry(now);
    const stripeInvoiceId =
      args.idempotencyKey.field === "stripeInvoiceId" ? args.idempotencyKey.value : undefined;
    const stripeSessionId =
      args.idempotencyKey.field === "stripeSessionId" ? args.idempotencyKey.value : undefined;

    const lotId = await ctx.db.insert("creditLots", {
      userId: args.userId,
      source: args.source,
      granted: args.amount,
      remaining: args.amount,
      expiresAt,
      grantedAt: now,
      stripeInvoiceId,
      stripeSessionId,
      packId: args.meta?.packId,
    });
    const balanceAfter = await applyBalanceDelta(ctx, args.userId, now, {
      balance: args.amount,
      purchased: PAID_SOURCES.has(args.source) ? args.amount : 0,
      spent: 0,
    });
    await ctx.db.insert("creditTransactions", {
      userId: args.userId,
      amount: args.amount,
      type: TRANSACTION_TYPE_BY_SOURCE[args.source],
      balanceAfter,
      lotId,
      stripeSessionId,
      packId: args.meta?.packId,
      note: args.meta?.note,
      expiresAt,
      createdAt: now,
    });

    return lotId;
  },
});

/**
 * FIFO potrošnja preko `planSpend`. Ako plan ne postoji, mutacija baca pre bilo
 * kakvog upisa, pa poziv ne ostavlja nikakav trag.
 */
export const spendCredits = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    jobId: v.id("generationJobs"),
  },
  handler: async (ctx, args) => {
    if (!isValidCreditAmount(args.amount)) throw new Error("NEVALIDAN_IZNOS");

    const now = Date.now();
    // Svi lotovi sa preostalim kreditima moraju da se pročitaju: parcijalno
    // čitanje bi tiho potcenilo balans i odbilo generaciju koja je plaćena.
    const lots = await ctx.db
      .query("creditLots")
      .withIndex("by_user_active", (q) => q.eq("userId", args.userId).eq("exhaustedAt", undefined))
      .collect();

    const plan = planSpend(
      lots.map((lot) => ({ id: lot._id, remaining: lot.remaining, expiresAt: lot.expiresAt })),
      args.amount,
      now,
    );
    if (!plan) throw new Error("NEDOVOLJNO_KREDITA");

    const takeByLot = new Map(plan.map((step) => [step.lotId, step.take]));
    for (const lot of lots) {
      const take = takeByLot.get(lot._id);
      if (!take) continue;
      const remaining = lot.remaining - take;
      await ctx.db.patch(lot._id, remaining === 0 ? { remaining, exhaustedAt: now } : { remaining });
    }

    const balanceAfter = await applyBalanceDelta(ctx, args.userId, now, {
      balance: -args.amount,
      purchased: 0,
      spent: args.amount,
    });
    await ctx.db.insert("creditTransactions", {
      userId: args.userId,
      amount: -args.amount,
      type: "spend",
      balanceAfter,
      jobId: args.jobId,
      // Trag ka lotu ima smisla samo kad je potrošnja stala u jedan lot.
      lotId: plan.length === 1 ? (plan[0].lotId as Id<"creditLots">) : undefined,
      createdAt: now,
    });

    return { balanceAfter };
  },
});

/**
 * Vraća tačno onoliko kredita koliko je posao skinuo, u NOV lot sa istekom 12
 * meseci od sad. Idempotentno preko `by_job_type`: drugi poziv vraća `null` i
 * ne dira ništa.
 */
export const refundCredits = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const alreadyRefunded = await ctx.db
      .query("creditTransactions")
      .withIndex("by_job_type", (q) => q.eq("jobId", args.jobId).eq("type", "refund"))
      .unique();
    if (alreadyRefunded) return null;

    const spend = await ctx.db
      .query("creditTransactions")
      .withIndex("by_job_type", (q) => q.eq("jobId", args.jobId).eq("type", "spend"))
      .unique();
    if (!spend) throw new Error("NEMA_TROSKA_ZA_REFUND");

    const amount = -spend.amount;
    const now = Date.now();
    const expiresAt = computeExpiry(now);
    const lotId = await ctx.db.insert("creditLots", {
      userId: spend.userId,
      source: "refund",
      granted: amount,
      remaining: amount,
      expiresAt,
      grantedAt: now,
    });
    const balanceAfter = await applyBalanceDelta(ctx, spend.userId, now, {
      balance: amount,
      purchased: 0,
      spent: -amount,
    });
    await ctx.db.insert("creditTransactions", {
      userId: spend.userId,
      amount,
      type: "refund",
      balanceAfter,
      jobId: args.jobId,
      lotId,
      expiresAt,
      createdAt: now,
    });

    return lotId;
  },
});

/**
 * Jedini ulaz za Stripe webhook. Ne zna ništa o lotovima - proveri `syncSecret`,
 * sklopi ključ idempotencije od Stripe ID-ja koji je stigao i prosledi ga
 * `grantCredits`-u, koji jedini zna kako se lot otvara.
 */
export const applyStripeGrant = mutation({
  args: {
    syncSecret: v.string(),
    userId: v.id("users"),
    amount: v.number(),
    source: stripeGrantSource,
    stripeInvoiceId: v.optional(v.string()),
    stripeSessionId: v.optional(v.string()),
    packId: v.optional(v.id("creditPacks")),
  },
  handler: async (ctx, args): Promise<Id<"creditLots">> => {
    requireSyncSecret(args.syncSecret);

    // Tačno jedan ključ: bez ijednog bi se grant ponovio na svakom Stripe
    // retry-ju, a sa oba bi isti novac mogao da legne pod svaki od njih.
    const keys: IdempotencyKey[] = [];
    if (args.stripeInvoiceId) keys.push({ field: "stripeInvoiceId", value: args.stripeInvoiceId });
    if (args.stripeSessionId) keys.push({ field: "stripeSessionId", value: args.stripeSessionId });
    if (keys.length !== 1) throw new Error("NEVALIDAN_KLJUC_IDEMPOTENCIJE");

    const lotId: Id<"creditLots"> = await ctx.runMutation(internal.credits.grantCredits, {
      userId: args.userId,
      amount: args.amount,
      source: args.source,
      idempotencyKey: keys[0],
      meta: args.packId ? { packId: args.packId } : undefined,
    });

    return lotId;
  },
});
