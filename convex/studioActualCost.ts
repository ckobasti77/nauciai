import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { sendAdminAlertEmail } from "./adminAlert";
import { FAL_BILLING_PAGE_LIMIT, fetchFalBillingEvents } from "../lib/fal";
import { parseParams } from "./studioCore";
import {
  ACTUAL_COST_REASON,
  type ActualCostOutcome,
  COST_DEVIATION_RATIO,
  COST_DEVIATION_STREAK,
  nextModelCostState,
  parseTokenRates,
  previousDayKey,
  sampleJson,
  shiftReasonCounts,
  sumByRequestId,
  type TokenUsage,
  tokenCostOutcome,
} from "./studioActualCostCore";
import { parseJobInputs } from "./providers/jobInputs";
import { hasVideoInput } from "./studioJobCore";
import { computeCostUsd, parsePriceRule, type PriceRule, pricingModeFor } from "./studioPricing";

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
 *
 * **X3, nalaz N6: nikad tiho `null`.** Mehanizam iznad je bio ceo napisan a nije
 * proizvodio nijedan podatak - nijedan Google model nije imao tarifu za
 * `prompt` tokene koje Google uvek prijavi, nijedan BytePlus red nije imao
 * tarifu uopšte, a fal je zavisio od oblika odgovora koji niko nije video.
 * Zato sada svaki završen posao izlazi sa TAČNO JEDNIM od dva: `actualCostUsd`,
 * ili `actualCostReason` koji kaže zašto ga nema. Uz to:
 *
 * - model koji se ne naplaćuje po tokenima nego po KOLIČINI izlaza (Seedance po
 *   sekundi, Veo Fast, Gemini Omni) dobija cenu iz prijavljene količine, kroz
 *   isti `computeCostUsd` kojim je i rezervisan;
 * - odgovor iz kojeg ne umemo da pročitamo ni jedno ni drugo ostavlja sirov
 *   uzorak u `studioProviderSamples`, pa se oblik posle prve prave generacije
 *   ne nagađa nego čita.
 */

/** Oblik potrošnje na granici Convex funkcija; `TokenUsage` iz Core-a. */
export const tokenUsageValidator = v.object({
  prompt: v.optional(v.number()),
  output: v.optional(v.number()),
  thinking: v.optional(v.number()),
});

/**
 * Pod kojim "modelom" stoje fal događaji naplate u `studioProviderSamples`.
 * Spisak naplate nije vezan ni za jedan model - nepoznat je oblik SPISKA, ne
 * oblik odgovora nekog modela - pa mu treba svoj red, a ne tuđi.
 */
export const FAL_BILLING_SAMPLE_SLUG = "billing-events";

/** Red zbira za model; `first` a ne `unique` iz istog razloga kao svuda ovde. */
function modelCostRow(ctx: MutationCtx, modelSlug: string) {
  return ctx.db
    .query("studioModelCost")
    .withIndex("by_modelSlug", (q) => q.eq("modelSlug", modelSlug))
    .first();
}

/**
 * Upisuje RAZLOG zašto posao nema izmeren trošak i pomera brojač razloga svog
 * modela. Posao koji cenu već ima se ne dira: razlog i cena se međusobno
 * isključuju, a cena je jača.
 *
 * Isti razlog se ne upisuje dvaput - inače bi ponovljen callback pomerio brojač
 * za posao koji je već prebrojan.
 */
export async function recordActualCostReason(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  reason: string,
): Promise<boolean> {
  if (job.actualCostUsd !== undefined) return false;
  if (job.actualCostReason === reason) return false;

  await ctx.db.patch(job._id, { actualCostReason: reason });
  await shiftModelReason(ctx, job.modelSlug, job.actualCostReason, reason);

  return true;
}

/** Skida jedan posao sa starog razloga i dodaje ga na novi, u redu `studioModelCost`. */
async function shiftModelReason(
  ctx: MutationCtx,
  modelSlug: string,
  from: string | undefined,
  to: string | undefined,
): Promise<void> {
  const row = await modelCostRow(ctx, modelSlug);
  const reasonCounts = shiftReasonCounts(row?.reasonCounts, from, to);
  const now = Date.now();
  if (row) {
    await ctx.db.patch(row._id, { reasonCounts, updatedAt: now });

    return;
  }

  // Model bez ijednog izmerenog posla još nema red. Pravi se ovde da bi admin
  // ekran imao gde da pročita razlog - `measuredJobs: 0` i dalje znači "nema
  // merenja", pa se prikaz stvarne marže ne menja.
  await ctx.db.insert("studioModelCost", {
    modelSlug,
    measuredJobs: 0,
    actualCostUsd: 0,
    estimatedCostUsd: 0,
    creditCost: 0,
    deviationStreak: 0,
    reasonCounts,
    updatedAt: now,
  });
}

/** Uzorak neprepoznatog odgovora; jedan red po provajderu i modelu, prepisuje se. */
export async function saveProviderSample(
  ctx: MutationCtx,
  provider: string,
  modelSlug: string,
  sample: string,
): Promise<void> {
  const existing = await ctx.db
    .query("studioProviderSamples")
    .withIndex("by_provider_modelSlug", (q) => q.eq("provider", provider).eq("modelSlug", modelSlug))
    .first();
  const now = Date.now();
  if (existing) await ctx.db.patch(existing._id, { sample, updatedAt: now });
  else await ctx.db.insert("studioProviderSamples", { provider, modelSlug, sample, updatedAt: now });
}

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

  // Cena je jača od razloga: čim je stigla, razlog nestaje sa posla i sa brojača
  // svog modela (X3, tačka 3).
  await ctx.db.patch(job._id, {
    actualCostUsd,
    ...(job.actualCostReason !== undefined ? { actualCostReason: undefined } : {}),
  });

  // `first` a ne `unique`: slučajan duplikat sme da pomeri zbir, ne da obori
  // upis stvarnog troška - isto obrazloženje kao kod `studioCostAlarms`.
  const row = await modelCostRow(ctx, job.modelSlug);

  const { state, alarm, deviationCostUsd } = nextModelCostState(
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
      // Alarm poredi PORAVNAT trošak sa PRVOBITNOM procenom (X3, tačka 5).
      ...(job.settledCostUsd !== undefined ? { settledCostUsd: job.settledCostUsd } : {}),
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
    // Posao je upravo prešao sa razloga na cenu - brojač razloga to prati.
    reasonCounts: shiftReasonCounts(row?.reasonCounts, job.actualCostReason, undefined),
    updatedAt: now,
  };
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert("studioModelCost", { modelSlug: job.modelSlug, ...fields });

  if (alarm && job.estimatedCostUsd !== undefined) {
    // Mejl ide iz akcije, posle commit-a: upis stvarnog troška ne sme da zavisi
    // od toga da li Resend radi (isti razlog kao kod globalnog plafona, W2).
    await ctx.scheduler.runAfter(0, internal.studioActualCost.sendCostDeviationAlarm, {
      modelSlug: job.modelSlug,
      // Broj koji je alarm i podigao, a ne nužno onaj koji je provajder javio.
      actualCostUsd: deviationCostUsd,
      estimatedCostUsd: job.estimatedCostUsd,
      measuredJobs: state.measuredJobs,
    });
  }

  return true;
}

/** Šta je provajder javio uz gotov posao - ulaz u `recordProviderCost`. */
export type ProviderReport = {
  /** Potrošeni tokeni; `undefined` kad ih u odgovoru nema. */
  usage?: TokenUsage;
  /** Trajanje izlaza u sekundama; `undefined` kad ga u odgovoru nema. */
  reportedSeconds?: number;
  /**
   * Sirov odgovor, ali SAMO kad iz njega nije pročitano ni jedno ni drugo.
   * Postojanje uzorka je i signal: odgovor je stigao, a mi ga ne razumemo -
   * to je `nepoznat oblik odgovora`, za razliku od poziva koji sirov odgovor
   * uopšte nije ni doneo (`provajder nije prijavio upotrebu`).
   */
  sample?: string;
};

/**
 * Cena po KOLIČINI koju je provajder prijavio (X3, tačka 2). Seedance se ne
 * naplaćuje po tokenima nego po sekundi izlaza, a isto važi i za Veo Fast i
 * Gemini Omni - za njih je stvaran trošak nabavna cena kataloga izračunata nad
 * onim što je stvarno renderovano, a ne nad onim što je korisnik naručio.
 *
 * Ide kroz `computeCostUsd`, dakle kroz JEDINU računicu cene u projektu -
 * cenovni motor se ne dira, samo mu se daje stvarna količina.
 */
function quantityCostOutcome(
  rule: PriceRule | null,
  job: Doc<"generationJobs">,
  reportedSeconds: number | undefined,
): ActualCostOutcome {
  const perSecond = rule?.unit === "second" || rule?.unit === "minute";
  if (!rule || !perSecond || rule.quantityParam === undefined) {
    return { ok: false, reason: ACTUAL_COST_REASON.notTokenBilled };
  }
  if (reportedSeconds === undefined || !Number.isFinite(reportedSeconds) || reportedSeconds <= 0) {
    return { ok: false, reason: ACTUAL_COST_REASON.noQuantity };
  }

  const params = {
    ...(parseParams(job.params) ?? {}),
    [rule.quantityParam]: rule.unit === "minute" ? reportedSeconds / 60 : reportedSeconds,
  };
  const pricingMode =
    job.inputMode === undefined
      ? undefined
      : pricingModeFor(job.inputMode, hasVideoInput(parseJobInputs(job.inputs)));

  try {
    return { ok: true, usd: computeCostUsd(rule, params, pricingMode) };
  } catch {
    // Pravilo koje za prijavljenu količinu ne ume da izračuna cenu ne sme da
    // obori zatvaranje posla - izlazi kao razlog, isto kao u `planSettlement`.
    return { ok: false, reason: ACTUAL_COST_REASON.noQuantity };
  }
}

/**
 * Ono što je provajder javio -> `actualCostUsd`, ILI `actualCostReason`. Ovo je
 * jedini put kojim Google i BytePlus posao dobija stvaran trošak, i jedino
 * mesto koje odlučuje koji je razlog tačan kad ga nema.
 *
 * Redosled je redosled pouzdanosti:
 * 1. **tarifa po tokenu** ako je katalog za taj model objavljuje - tada je
 *    prijavljena potrošnja tokena sam trošak;
 * 2. **prijavljena količina** za modele koji se naplaćuju po sekundi izlaza;
 * 3. **razlog**, nikad nagađanje.
 */
export async function recordProviderCost(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  report: ProviderReport,
): Promise<boolean> {
  if (job.actualCostUsd !== undefined) return false;

  const model = await ctx.db
    .query("models")
    .withIndex("by_slug", (q) => q.eq("slug", job.modelSlug))
    .unique();
  if (!model) {
    await recordActualCostReason(ctx, job, ACTUAL_COST_REASON.noCatalogRow);

    return false;
  }

  const rates = parseTokenRates(parseParams(model.capabilities));
  const outcome: ActualCostOutcome = rates
    ? tokenCostOutcome(report.usage ?? null, rates)
    : quantityCostOutcome(parsePriceRule(model.priceRule), job, report.reportedSeconds);

  if (outcome.ok) return recordJobActualCost(ctx, job, outcome.usd);

  // Odgovor je stigao a nismo pročitali ni tokene ni količinu: to nije "model
  // se ne meri", to je oblik koji ne razumemo. Uzorak je jedini način da se
  // posle prve prave generacije vidi kako odgovor stvarno izgleda.
  if (report.sample !== undefined) {
    await saveProviderSample(ctx, model.provider, model.slug, report.sample);
    await recordActualCostReason(ctx, job, ACTUAL_COST_REASON.unknownShape);

    return false;
  }

  await recordActualCostReason(ctx, job, outcome.reason);

  return false;
}

/**
 * Ulaz za sinhrone provajdere koji potrošnju saznaju u AKCIJI, a ne u mutaciji
 * koja posao zatvara (BytePlus slike). Posao koji je u međuvremenu nestao ili
 * već ima cenu izlazi bez dejstva.
 *
 * Pored tokena hvata i KOLIČINU (X2, nalaz N2): trajanje obrađenog snimka je
 * jedini podatak iz kojeg se cena posla može preračunati po stvarnoj količini, a
 * ne po zaglavlju koje je korisnik okačio. Poravnanje se zakazuje, ne zove -
 * greška u naplati ne sme da povuče upis stvarnog troška sa sobom.
 */
export const recordProviderUsage = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    usage: v.optional(tokenUsageValidator),
    reportedSeconds: v.optional(v.number()),
    sample: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return false;

    const recorded = await recordProviderCost(ctx, job, {
      ...(args.usage !== undefined ? { usage: args.usage } : {}),
      ...(args.reportedSeconds !== undefined ? { reportedSeconds: args.reportedSeconds } : {}),
      ...(args.sample !== undefined ? { sample: args.sample } : {}),
    });
    await ctx.scheduler.runAfter(0, internal.studio.settleJobCredits, {
      jobId: args.jobId,
      ...(args.reportedSeconds !== undefined ? { reportedSeconds: args.reportedSeconds } : {}),
    });

    return recorded;
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
      if (await recordJobActualCost(ctx, job, event.usd)) {
        matched += 1;
        // fal u odgovoru nema cenu, pa je ovo za većinu fal poslova JEDINI
        // trenutak u kojem se poravnanje uopšte može izvesti (X2). Posao koji je
        // već poravnat po prijavljenoj količini `settleJobCredits` odbija sam.
        await ctx.scheduler.runAfter(0, internal.studio.settleJobCredits, { jobId: job._id });
      } else alreadyPriced += 1;
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

/** Koliko fal poslova jednog dana se najviše prepisuje na `nepoznat oblik odgovora`. */
const FAL_SHAPE_FAILURE_LIMIT = 500;

/**
 * Spisak naplate je stigao, ali ga ne razumemo (X3, tačka 4). Dva upisa:
 *
 * 1. sirov JSON prvog neprepoznatog reda ide u `studioProviderSamples`, jedan
 *    red na ceo fal - to je jedini način da se oblik posle prve prave
 *    rekonsilijacije pročita umesto da se nagađa;
 * 2. fal poslovi TOG dana koji i dalje nemaju cenu prestaju da pišu "fal
 *    billing event nije stigao" - jer jeste stigao, samo ga ne razumemo.
 *
 * Prozor je jedan dan i ograničen je: prepis je popravka prikaza, ne migracija.
 */
export const applyFalBillingShapeFailure = internalMutation({
  args: { day: v.string(), sample: v.string() },
  handler: async (ctx, args) => {
    await saveProviderSample(ctx, "fal", FAL_BILLING_SAMPLE_SLUG, args.sample);

    // Prozor je ZATVOREN sa obe strane: bez gornje granice bi poslovi kasnijih
    // dana pojeli kap i baš dan koji nas zanima ostao bi neobeležen.
    const since = new Date(`${args.day}T00:00:00.000Z`).getTime();
    const until = since + 24 * 60 * 60 * 1000;
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_provider_status", (q) =>
        q.eq("provider", "fal").eq("status", "done").gte("createdAt", since).lt("createdAt", until),
      )
      .take(FAL_SHAPE_FAILURE_LIMIT);

    let flagged = 0;
    for (const job of jobs) {
      if (await recordActualCostReason(ctx, job, ACTUAL_COST_REASON.unknownShape)) flagged += 1;
    }

    return { flagged, capped: jobs.length >= FAL_SHAPE_FAILURE_LIMIT };
  },
});

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
    const { events, unrecognized } = await fetchFalBillingEvents({
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

    // Uzorak se pamti PRE spajanja: red koji nismo pročitali je jedini dokaz o
    // obliku, a spajanje ga ionako nema odakle da uzme.
    if (unrecognized !== null) {
      await ctx.runMutation(internal.studioActualCost.applyFalBillingShapeFailure, {
        day,
        sample: sampleJson(unrecognized),
      });
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
