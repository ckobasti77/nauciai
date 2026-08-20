import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { sendAdminAlertEmail } from "./adminAlert";
import { FAL_BILLING_PAGE_LIMIT, fetchFalBillingEvents } from "../lib/fal";
import { parseParams } from "./studioCore";
import {
  COST_DEVIATION_RATIO,
  COST_DEVIATION_STREAK,
  nextModelCostState,
  parseTokenRates,
  previousDayKey,
  sumByRequestId,
  type TokenUsage,
  tokenCostUsd,
} from "./studioActualCostCore";

/**
 * STVARAN trošak posla (W6, `docs/STUDIO-CATALOG-REPORT.md` sekcija 6 stavka 6).
 *
 * Tri provajdera, tri puta do istog broja:
 * - **Google** i **BytePlus** vraćaju potrošene tokene u odgovoru; tokeni se
 *   množe tarifom iz reda kataloga (`capabilities.tokenRatesUsdPerMillion`) i
 *   upisuju odmah, u istoj transakciji u kojoj posao ide u `done`;
 * - **fal** u odgovoru nema cenu; nju donosi noćna rekonsilijacija sa
 *   `GET /v1/models/billing-events`, spojena po `providerRequestId`-ju.
 *
 * Sve troje prolazi kroz `recordJobActualCost` - jedno mesto koje upisuje polje
 * i održava zbir po modelu, pa stvarna marža u admin ekranu i alarm na
 * odstupanje uvek gledaju isti uzorak.
 */

/** Oblik potrošnje na granici Convex funkcija; `TokenUsage` iz Core-a. */
export const tokenUsageValidator = v.object({
  prompt: v.optional(v.number()),
  output: v.optional(v.number()),
  thinking: v.optional(v.number()),
});

/**
 * Upisuje stvaran trošak jednog posla i pomera zbir njegovog modela.
 *
 * JEDNOKRATNO je: posao koji već ima `actualCostUsd` se ne dira. fal ponavlja
 * događaje naplate, BytePlus callback stiže na svaku promenu statusa, a Google
 * poller ume da vidi istu gotovu operaciju dvaput - bez ovoga bi isti dolar
 * ušao u zbir modela više puta i stvarna marža bi ispala gora nego što jeste.
 *
 * Nula i negativan broj se odbijaju: to nije "besplatan posao" nego odgovor iz
 * kojeg se cena nije pročitala, a prazno polje je pošteno.
 */
export async function recordJobActualCost(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  actualCostUsd: number,
): Promise<boolean> {
  if (!Number.isFinite(actualCostUsd) || actualCostUsd <= 0) return false;
  if (job.actualCostUsd !== undefined) return false;

  await ctx.db.patch(job._id, { actualCostUsd });

  const row = await ctx.db
    .query("studioModelCost")
    .withIndex("by_modelSlug", (q) => q.eq("modelSlug", job.modelSlug))
    // `first` a ne `unique`: slučajan duplikat sme da pomeri zbir, ne da obori
    // upis stvarnog troška - isto obrazloženje kao kod `studioCostAlarms`.
    .first();

  const { state, alarm } = nextModelCostState(
    row
      ? {
          measuredJobs: row.measuredJobs,
          actualCostUsd: row.actualCostUsd,
          estimatedCostUsd: row.estimatedCostUsd,
          creditCost: row.creditCost,
          deviationStreak: row.deviationStreak,
          alarmSent: row.alarmSentAt !== undefined,
        }
      : null,
    {
      actualCostUsd,
      ...(job.estimatedCostUsd !== undefined ? { estimatedCostUsd: job.estimatedCostUsd } : {}),
      // Refundiran posao je naplatio NULA kredita, a provajdera smo ipak
      // platili. Da mu se krediti računali, stvarna marža bi ispala bolja nego
      // što jeste - a to je tačno laž koju ovaj korak sklanja. Trošak i procena
      // ostaju u zbiru: oni se i dalje porede međusobno.
      creditCost: job.status === "refunded" ? 0 : job.creditCost,
    },
  );

  const now = Date.now();
  const fields = {
    measuredJobs: state.measuredJobs,
    actualCostUsd: state.actualCostUsd,
    estimatedCostUsd: state.estimatedCostUsd,
    creditCost: state.creditCost,
    deviationStreak: state.deviationStreak,
    // `alarmSent: false` mora da OBRIŠE raniji pečat, inače bi jedan alarm
    // zauvek zaključao sve buduće nizove za taj model.
    alarmSentAt: state.alarmSent ? (row?.alarmSentAt ?? now) : undefined,
    updatedAt: now,
  };
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert("studioModelCost", { modelSlug: job.modelSlug, ...fields });

  if (alarm && job.estimatedCostUsd !== undefined) {
    // Mejl ide iz akcije, posle commit-a: upis stvarnog troška ne sme da zavisi
    // od toga da li Resend radi (isti razlog kao kod globalnog plafona, W2).
    await ctx.scheduler.runAfter(0, internal.studioActualCost.sendCostDeviationAlarm, {
      modelSlug: job.modelSlug,
      actualCostUsd,
      estimatedCostUsd: job.estimatedCostUsd,
      measuredJobs: state.measuredJobs,
    });
  }

  return true;
}

/**
 * Tokeni koje je provajder prijavio -> dolari, po tarifi REDA kataloga.
 *
 * Model bez tarife (ili sa tarifom koja ne pokriva jednu prijavljenu
 * kategoriju) ostaje bez `actualCostUsd`. To je namerno i to je ceo smisao
 * koraka: katalog objavljuje cenu po slici i po sekundi, a cenu po tokenu samo
 * za `nano-banana-pro` thinking tokene ($12/M, katalog 2.2). Dok ostale tarife
 * ne budu potvrdjene sa prve fakture, prazno polje je jedini pošten ishod.
 */
export async function recordTokenUsage(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  usage: TokenUsage | undefined,
): Promise<boolean> {
  if (!usage) return false;

  const model = await ctx.db
    .query("models")
    .withIndex("by_slug", (q) => q.eq("slug", job.modelSlug))
    .unique();
  if (!model) return false;

  const usd = tokenCostUsd(usage, parseTokenRates(parseParams(model.capabilities)));
  if (usd === null) return false;

  return recordJobActualCost(ctx, job, usd);
}

/**
 * Ulaz za sinhrone provajdere koji potrošnju saznaju u AKCIJI, a ne u mutaciji
 * koja posao zatvara (BytePlus slike). Posao koji je u međuvremenu nestao ili
 * već ima cenu izlazi bez dejstva.
 */
export const recordProviderUsage = internalMutation({
  args: { jobId: v.id("generationJobs"), usage: tokenUsageValidator },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return false;

    return recordTokenUsage(ctx, job, args.usage);
  },
});

/**
 * Alarm iz W6: stvaran trošak preko procene za više od 30%, pet uzastopnih
 * poslova istog modela. Ovo je jedino što grešku u katalogu uhvati pre nego što
 * je uhvati bankovni izvod, pa mejl nosi oba broja - procenu po kojoj je
 * naplaćeno i ono što je stvarno plaćeno.
 */
export const sendCostDeviationAlarm = internalAction({
  args: {
    modelSlug: v.string(),
    actualCostUsd: v.number(),
    estimatedCostUsd: v.number(),
    measuredJobs: v.number(),
  },
  handler: async (ctx, args) => {
    const over = args.estimatedCostUsd > 0 ? args.actualCostUsd / args.estimatedCostUsd : 0;
    await sendAdminAlertEmail({
      subject: `Studio: ${args.modelSlug} košta više nego što katalog kaže`,
      text: [
        `Model \`${args.modelSlug}\` je ${COST_DEVIATION_STREAK} posla zaredom premašio procenu iz kataloga za više od ${Math.round((COST_DEVIATION_RATIO - 1) * 100)}%.`,
        `Poslednji posao: procena ${args.estimatedCostUsd.toFixed(4)} $, stvarno ${args.actualCostUsd.toFixed(4)} $ (${over.toFixed(2)}x).`,
        `Izmereno poslova ovog modela do sada: ${args.measuredJobs}.`,
        "Cena se naplaćuje po PROCENI, pa svaka nova generacija ovog modela ide sa manjom maržom nego što admin ekran pokazuje. Popravlja se `baseUsd`/`addUsd` u katalogu v4.",
      ].join("\n\n"),
      context: {
        alert: "studio_cost_deviation",
        modelSlug: args.modelSlug,
        actualCostUsd: args.actualCostUsd,
        estimatedCostUsd: args.estimatedCostUsd,
      },
    });

    return null;
  },
});

/**
 * Spaja događaje naplate sa poslovima, po `providerRequestId`-ju. `request_id`
 * koji nema svoj posao se PRESKAČE bez greške: fal nalog naplaćuje i pozive van
 * Studija (ručni test, drugi projekat na istom ključu), a nepoznat ID nije kvar
 * nego tuđi red u izvodu.
 *
 * `by_fal_request` je rezerva za poslove upisane pre nego što je
 * `providerRequestId` uveden (videti `migrations.backfillProviderRequestId`).
 */
export const applyFalBillingEvents = internalMutation({
  args: {
    events: v.array(v.object({ requestId: v.string(), usd: v.number() })),
  },
  handler: async (ctx, args) => {
    let matched = 0;
    let unmatched = 0;
    let alreadyPriced = 0;

    for (const event of args.events) {
      const job =
        (await ctx.db
          .query("generationJobs")
          .withIndex("by_provider_request", (q) => q.eq("providerRequestId", event.requestId))
          .first()) ??
        (await ctx.db
          .query("generationJobs")
          .withIndex("by_fal_request", (q) => q.eq("falRequestId", event.requestId))
          .first());

      if (!job) {
        unmatched += 1;
        continue;
      }
      if (await recordJobActualCost(ctx, job, event.usd)) matched += 1;
      else alreadyPriced += 1;
    }

    return { matched, unmatched, alreadyPriced };
  },
});

/**
 * Koliko događaja ide u jednu transakciju. Svaki je dva čitanja po indeksu i
 * najviše dva upisa, pa je pedeset daleko ispod limita jedne mutacije, a
 * dovoljno da dan sa hiljadu poslova ne postane hiljadu poziva.
 */
const FAL_EVENT_BATCH = 50;

/**
 * Noćna rekonsilijacija fal troška (W6). fal u odgovoru posla ne nosi cenu, pa
 * je ovo jedini put kojim stvarna fal cena uopšte dolazi do nas.
 *
 * Prozor je PRETHODNI UTC dan, ne tekući: događaji naplate ne stignu odmah po
 * završetku posla, a dan koji je zatvoren se ne menja više.
 *
 * Ne baca: bez `FAL_KEY`-a (mock režim, lokalni razvoj) prolaz samo izađe.
 * Mrežna greška ide dalje - cron je zakazan svakodnevno, a tiho progutana
 * greška bi značila da rekonsilijacija godinu dana ne radi a niko ne zna.
 */
export const reconcileFalCosts = internalAction({
  args: { day: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const apiKey = process.env.FAL_KEY;
    if (!apiKey) {
      console.error("fal_reconcile_skipped: FAL_KEY nije postavljen");

      return { day: null, fetched: 0, matched: 0, unmatched: 0, alreadyPriced: 0 };
    }

    const day = args.day ?? previousDayKey(Date.now());
    const events = await fetchFalBillingEvents({
      apiKey,
      baseUrl: process.env.FAL_REST_BASE_URL,
      startTime: `${day}T00:00:00.000Z`,
      endTime: `${day}T23:59:59.999Z`,
    });

    // Bez ovog loga bi odsečen spisak izgledao kao dan bez ostatka - a to je
    // trošak koji niko nikad ne bi izmerio.
    if (events.length >= FAL_BILLING_PAGE_LIMIT) {
      console.error("fal_reconcile_truncated", { day, limit: FAL_BILLING_PAGE_LIMIT });
    }

    const totals = sumByRequestId(events);
    let matched = 0;
    let unmatched = 0;
    let alreadyPriced = 0;

    for (let index = 0; index < totals.length; index += FAL_EVENT_BATCH) {
      const outcome: { matched: number; unmatched: number; alreadyPriced: number } =
        await ctx.runMutation(internal.studioActualCost.applyFalBillingEvents, {
          events: totals.slice(index, index + FAL_EVENT_BATCH),
        });
      matched += outcome.matched;
      unmatched += outcome.unmatched;
      alreadyPriced += outcome.alreadyPriced;
    }

    return { day, fetched: events.length, matched, unmatched, alreadyPriced };
  },
});
