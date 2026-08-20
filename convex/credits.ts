import { paginationOptsValidator } from "convex/server";
import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { computeExpiry, isValidCreditAmount, planSpend, usableBalance } from "./creditsCore";
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

    // Bonus dobrodošlice je jednom po KORISNIKU (STUDIO-PLAN D.1), a ne po
    // pretplati: otkazivanje pa ponovna pretplata pravi novu `invoice.id`, a uz
    // kupon od 100% i besplatnu petlju. Ključ `welcome:<userId>` to sam po sebi
    // rešava; ova provera je drugi sloj, za lotove otvorene pre te promene.
    if (args.source === "welcome_bonus") {
      const existingBonus = await ctx.db
        .query("creditLots")
        .withIndex("by_user_source", (q) =>
          q.eq("userId", args.userId).eq("source", "welcome_bonus"),
        )
        .first();
      if (existingBonus) return existingBonus._id;
    }

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
 * FIFO potrošnja preko `planSpend`. Ako plan ne postoji, baca PRE bilo kakvog
 * upisa, pa poziv ne ostavlja nikakav trag.
 *
 * Obična funkcija, a ne samo mutacija: `studio.createJob` je zove direktno, u
 * svojoj transakciji. Ugnježden `ctx.runMutation` je podtransakcija koju
 * pozivalac sme da uhvati i nastavi - a tamo posao i potrošnja moraju da padnu
 * zajedno, bez oslanjanja na to što oko poziva slučajno nema `try/catch`.
 */
export async function applySpend(
  ctx: MutationCtx,
  args: { userId: Id<"users">; amount: number; jobId: Id<"generationJobs"> },
) {
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
}

/**
 * Gasi lot kojem je istekao rok (STUDIO-PLAN D.2): `remaining` na 0,
 * `exhaustedAt` na `now`, red tipa `expiry` u ledgeru i keširan balans manji za
 * isti iznos. Poslednji korak je obavezan - `planSpend` istekle lotove ionako
 * preskače, pa bi bez njega `creditBalances.balance` posle godinu dana
 * pokazivao kredite koji se ne mogu potrošiti.
 *
 * Obična funkcija, kao `applySpend`: cron gasi više lotova u jednoj transakciji.
 */
export async function applyLotExpiry(ctx: MutationCtx, lot: Doc<"creditLots">, now: number) {
  await ctx.db.patch(lot._id, { remaining: 0, exhaustedAt: now });
  const balanceAfter = await applyBalanceDelta(ctx, lot.userId, now, {
    balance: -lot.remaining,
    purchased: 0,
    // `lifetimeSpent` je ono što je korisnik potrošio; istekli krediti nisu
    // potrošeni nego propali, pa se tu ne broje.
    spent: 0,
  });
  await ctx.db.insert("creditTransactions", {
    userId: lot.userId,
    amount: -lot.remaining,
    type: "expiry",
    balanceAfter,
    lotId: lot._id,
    createdAt: now,
  });

  return balanceAfter;
}

/** Tanak omotač za pozivaoce van transakcije (testovi, ručni `convex run`). */
export const spendCredits = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    jobId: v.id("generationJobs"),
  },
  handler: (ctx, args) => applySpend(ctx, args),
});

/**
 * Zajedničko jezgro povraćaja: nov lot sa istekom 12 meseci od sad, pomeren
 * balans i JEDAN red u ledgeru. Zovu ga `refundCredits` (pun iznos, tip
 * `refund`) i `applySettlement` (razlika naniže, tip `settlement`) - dva
 * pozivaoca, jedan upis, pa se ledger ne može razići sam sa sobom.
 */
async function openReturnLot(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    jobId: Id<"generationJobs">;
    amount: number;
    type: "refund" | "settlement";
    now: number;
  },
) {
  const expiresAt = computeExpiry(args.now);
  const lotId = await ctx.db.insert("creditLots", {
    userId: args.userId,
    source: "refund",
    granted: args.amount,
    remaining: args.amount,
    expiresAt,
    grantedAt: args.now,
  });
  const balanceAfter = await applyBalanceDelta(ctx, args.userId, args.now, {
    balance: args.amount,
    purchased: 0,
    spent: -args.amount,
  });
  await ctx.db.insert("creditTransactions", {
    userId: args.userId,
    amount: args.amount,
    type: args.type,
    balanceAfter,
    jobId: args.jobId,
    lotId,
    expiresAt,
    createdAt: args.now,
  });

  return lotId;
}

/**
 * Korekcija posle završenog posla (X2, nalaz N2). `credits` je razlika u
 * kreditima: pozitivna se SKIDA, negativna VRAĆA.
 *
 * Naviše se skida koliko korisnik ima, ne koliko duguje: posao je već završen i
 * provajder je već naplaćen, pa odbijanje ovde ne vraća ništa. Ono što nije
 * uspelo da se skine vraća se pozivaocu kao `unsettled` i on ga upisuje kao dug
 * na red posla; dok dug postoji, `createJob` tom korisniku ne otvara nov posao.
 *
 * Obična funkcija, kao `applySpend`: poravnanje i njegov trag na poslu moraju da
 * padnu zajedno, u istoj transakciji.
 */
export async function applySettlement(
  ctx: MutationCtx,
  args: { userId: Id<"users">; jobId: Id<"generationJobs">; credits: number },
): Promise<{ applied: number; unsettled: number }> {
  if (!Number.isInteger(args.credits) || args.credits === 0) {
    return { applied: 0, unsettled: 0 };
  }

  const now = Date.now();
  if (args.credits < 0) {
    await openReturnLot(ctx, {
      userId: args.userId,
      jobId: args.jobId,
      amount: -args.credits,
      type: "settlement",
      now,
    });

    return { applied: args.credits, unsettled: 0 };
  }

  const lots = await ctx.db
    .query("creditLots")
    .withIndex("by_user_active", (q) => q.eq("userId", args.userId).eq("exhaustedAt", undefined))
    .collect();
  const plain = lots.map((lot) => ({
    id: lot._id,
    remaining: lot.remaining,
    expiresAt: lot.expiresAt,
  }));

  const take = Math.min(args.credits, usableBalance(plain, now));
  const plan = take > 0 ? planSpend(plain, take, now) : null;
  if (!plan) return { applied: 0, unsettled: args.credits };

  const takeByLot = new Map(plan.map((step) => [step.lotId, step.take]));
  for (const lot of lots) {
    const step = takeByLot.get(lot._id);
    if (!step) continue;
    const remaining = lot.remaining - step;
    await ctx.db.patch(lot._id, remaining === 0 ? { remaining, exhaustedAt: now } : { remaining });
  }

  const balanceAfter = await applyBalanceDelta(ctx, args.userId, now, {
    balance: -take,
    purchased: 0,
    spent: take,
  });
  await ctx.db.insert("creditTransactions", {
    userId: args.userId,
    amount: -take,
    type: "settlement",
    balanceAfter,
    jobId: args.jobId,
    lotId: plan.length === 1 ? (plan[0].lotId as Id<"creditLots">) : undefined,
    createdAt: now,
  });

  return { applied: -take, unsettled: args.credits - take };
}

/**
 * Vraća tačno onoliko kredita koliko je posao skinuo, u NOV lot sa istekom 12
 * meseci od sad. Idempotentno preko `by_job_type`: drugi poziv vraća `null` i
 * ne dira ništa.
 *
 * "Koliko je posao skinuo" je zbir rezervacije i poravnanja (X2): posao kojem je
 * posle rezervacije skinuta razlika mora da vrati i nju, a posao kojem je deo
 * već vraćen ne sme da ga dobije drugi put. `spend` je obavezan, `settlement`
 * postoji samo kad je posao poravnat.
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

    const settlement = await ctx.db
      .query("creditTransactions")
      .withIndex("by_job_type", (q) => q.eq("jobId", args.jobId).eq("type", "settlement"))
      .unique();

    const amount = -spend.amount - (settlement?.amount ?? 0);
    // Posao kojem je poravnanje već vratilo sve što je skinuo nema šta da se
    // refundira; prazan lot bi bio red u ledgeru koji ne pomera nijedan broj.
    if (amount <= 0) return null;

    const lotId = await openReturnLot(ctx, {
      userId: spend.userId,
      jobId: args.jobId,
      amount,
      type: "refund",
      now: Date.now(),
    });

    return { lotId, credits: amount };
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

/**
 * Drugi ulaz za Stripe webhook (X7): oduzimanje kredita koje je uplata
 * dodelila, pošto je ta uplata refundirana (`charge.refunded`) ili osporena
 * (`charge.dispute.created`).
 *
 * Oduzima se PUN dodeljen iznos, a ne ono što je od lota ostalo. Krediti koji
 * su u međuvremenu potrošeni su otišli provajderu i ne vraćaju se nama, pa
 * saldo posle povlačenja sme da bude negativan - to je tačno onoliko koliko je
 * korisnik potrošio a nije platio. `studio.createJob` na negativan saldo ne
 * otvara posao, pa Studio ostaje zatvoren dok se minus ne poravna.
 *
 * Idempotencija ide po `event.id`, ne po ključu lota: isti dogadjaj isporučen
 * dvaput ne sme dvaput da obori saldo. Dva RAZLIČITA dogadjaja nad istom
 * uplatom (spor pa refundacija) upisuju dva reda, ali kredite oduzima samo
 * prvi - drugom `revokedCredits` ostaje 0, a red i dalje postoji jer brava
 * zbog spora visi na njemu.
 */
export const applyStripeReversal = mutation({
  args: {
    syncSecret: v.string(),
    eventId: v.string(),
    kind: v.union(v.literal("refund"), v.literal("dispute")),
    stripeInvoiceId: v.optional(v.string()),
    stripeSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSyncSecret(args.syncSecret);

    const keys: IdempotencyKey[] = [];
    if (args.stripeInvoiceId) keys.push({ field: "stripeInvoiceId", value: args.stripeInvoiceId });
    if (args.stripeSessionId) keys.push({ field: "stripeSessionId", value: args.stripeSessionId });
    if (keys.length !== 1) throw new Error("NEVALIDAN_KLJUC_IDEMPOTENCIJE");

    const repeated = await ctx.db
      .query("creditReversals")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (repeated) {
      return { revoked: repeated.revokedCredits, blocked: repeated.kind === "dispute" };
    }

    // Uplata koja nikad nije dodelila kredite (pretplata na kurs, naplata pre
    // nego što je Studio postojao). Nema šta da se oduzme i nema kome da se
    // upiše brava - webhook je već proverio da je ovo ključ kredit-lota, pa je
    // izostanak reda legitiman ishod, a ne greška.
    const lot = await findLotByKey(ctx, keys[0]);
    if (!lot) return { revoked: 0, blocked: false };

    const now = Date.now();
    const revoked = lot.revokedAt ? 0 : lot.granted;

    if (!lot.revokedAt) {
      await ctx.db.patch(lot._id, {
        remaining: 0,
        exhaustedAt: lot.exhaustedAt ?? now,
        revokedAt: now,
      });
      const balanceAfter = await applyBalanceDelta(ctx, lot.userId, now, {
        balance: -lot.granted,
        // Novac je otišao nazad, pa "koliko je ikad kupljeno" mora da padne za
        // isti iznos - inače bi refundiran paket zauvek stajao kao kupovina.
        purchased: PAID_SOURCES.has(lot.source) ? -lot.granted : 0,
        // `lifetimeSpent` se ne dira: ono što je potrošeno jeste potrošeno, i
        // upravo je to razlika koja saldo gura u minus.
        spent: 0,
      });
      await ctx.db.insert("creditTransactions", {
        userId: lot.userId,
        amount: -lot.granted,
        type: "revocation",
        balanceAfter,
        lotId: lot._id,
        stripeSessionId: lot.stripeSessionId,
        packId: lot.packId,
        createdAt: now,
      });
    }

    await ctx.db.insert("creditReversals", {
      eventId: args.eventId,
      userId: lot.userId,
      kind: args.kind,
      lotId: lot._id,
      revokedCredits: revoked,
      stripeInvoiceId: args.stripeInvoiceId,
      stripeSessionId: args.stripeSessionId,
      createdAt: now,
    });

    return { revoked, blocked: args.kind === "dispute" };
  },
});
