import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, query, type QueryCtx } from "./_generated/server";
import { applySpend } from "./credits";
import { MAX_PROMPT_LENGTH, validatePrompt } from "./creditsCore";
import { requireUserId } from "./helpers";
import { applyTaskCompletion, assertLessonAccess } from "./lab";
import { parseJobInputs } from "./providers/jobInputs";
import {
  extraCounts,
  hasVideoInput,
  jobInputStorageIds,
  parseClientInputs,
  parseInputModes,
  parseInputSpec,
  parseQuantitySource,
  promptControlOf,
  promptFromParams,
  resolveMeasuredQuantity,
  sanitizeJobInputs,
} from "./studioJobCore";
import { parseParamSpec, sanitizeSpecParams } from "./studioParamSpec";
import { computeCostUsd, computeCredits, parsePriceRule, pricingModeFor } from "./studioPricing";
import {
  computeCreditCost,
  dayKey,
  exceedsDailyCostLimit,
  extractPrompt,
  isMockRequestId,
  MAX_ACTIVE_JOBS,
  MAX_DAILY_GENERATIONS,
  outputExpiresAt,
  outputTitle,
  parseParams,
  promptHash,
  requestedImageCount,
  sanitizeParams,
  STUDIO_FLAG_KEY,
} from "./studioCore";

/**
 * Lokalna kopija `generationJobs.kind` unije, po istoj konvenciji koju već
 * koristi `modelCatalog.ts` - `schema.ts` je ne izvozi.
 */
const studioModelKind = v.union(v.literal("image"), v.literal("video"), v.literal("audio"));

/**
 * Sve što jedan posao mora da zna PRE nego što se upiše: očišćeni parametri,
 * cena u kreditima i nabavna cena. Dva kataloga daju isti oblik, pa
 * `createJob` ispod ne zna po kojem je model naručen.
 */
type PricedOrder = {
  slug: string;
  kind: "image" | "video" | "audio";
  params: Record<string, unknown>;
  prompt: string;
  creditCost: number;
  estimatedCostUsd: number;
  inputMode?: string;
  inputs?: string;
};

/**
 * Posao iz v4 kataloga (STUDIO-CATALOG-V4). Cena ide kroz `computeCredits` nad
 * OČIŠĆENIM parametrima - istu funkciju nad istim objektom zove i forma, pa se
 * cifra na dugmetu i naplaćena cifra ne mogu razići (katalog 1.3).
 *
 * Redosled provera je namerno ovakav: prvo režim (bira endpoint i množilac),
 * pa ulazi (broje se u `extras` i odlučuju o sniženoj tarifi), pa parametri,
 * pa merena količina - tek onda prompt i cena, jer i jedno i drugo zavise od
 * svega iznad.
 */
function buildCatalogOrder(
  model: Doc<"models">,
  raw: Record<string, unknown>,
  args: { inputMode?: string; inputs?: string; measuredQuantity?: number },
): PricedOrder {
  if (!model.isEnabled) throw new Error("MODEL_NEDOSTUPAN");

  const spec = parseParamSpec(model.paramSpec);
  const rule = parsePriceRule(model.priceRule);
  if (!spec || !rule) throw new Error("MODEL_NEDOSTUPAN");

  const modes = parseInputModes(model.inputModes);
  const inputMode = args.inputMode ?? modes[0];
  if (inputMode === undefined || !modes.includes(inputMode)) throw new Error("NEISPRAVAN_REZIM");

  const inputSpec = parseInputSpec(model.inputSpec);
  const parsedInputs = parseClientInputs(args.inputs);
  if (!parsedInputs) throw new Error("NEISPRAVNI_ULAZI");
  const inputs = sanitizeJobInputs(parsedInputs, inputSpec, inputMode);
  if (!inputs.ok) throw new Error(`NEISPRAVNI_ULAZI:${inputs.reason}`);

  const sanitized = sanitizeSpecParams(spec, rule, raw, inputMode);
  if (!sanitized.ok) throw new Error(`NEISPRAVNI_PARAMETRI:${sanitized.reason}`);
  const params = sanitized.params;

  // Merena količina i broj dodatnih ulaza NISU kontrole - klijent ih ne bira,
  // pa se dopisuju ovde, posle kapije. Ono što forma pošalje pod tim ključevima
  // `sanitizeSpecParams` je već izbacio.
  const source = parseQuantitySource(model.capabilities);
  if (source) {
    const measured = resolveMeasuredQuantity(source, params, args.measuredQuantity);
    if (!measured.ok) throw new Error(measured.reason);
    params[source.param] = measured.quantity;
  }
  Object.assign(params, extraCounts(rule, inputs.inputs));

  // Prompt se traži samo tamo gde je JEDINI ulaz. Kling lipsync ima `textarea`
  // koja se koristi tek kad je izvor govora tekst, pa bi bezuslovan zahtev
  // odbio sasvim ispravan posao sa okačenim zvukom. Tekst koji POSTOJI ide
  // kroz moderaciju uvek, i to ceo - granica je granica te kontrole, jer
  // ElevenLabs prima 5 000 znakova a prompt za sliku 2 000.
  const control = promptControlOf(spec, inputMode);
  const prompt = promptFromParams(spec, params, inputMode) ?? "";
  const hasSlots = Object.keys(Object.hasOwn(inputSpec, inputMode) ? inputSpec[inputMode] : {}).length > 0;
  if (!hasSlots || prompt.trim().length > 0) {
    const maxLength = typeof control?.max === "number" ? control.max : MAX_PROMPT_LENGTH;
    const check = validatePrompt(prompt, maxLength);
    if (!check.ok) throw new Error(`NEISPRAVAN_PROMPT:${check.reason}`);
  }

  const pricingMode = pricingModeFor(inputMode, hasVideoInput(inputs.inputs));
  let creditCost: number;
  let estimatedCostUsd: number;
  try {
    creditCost = computeCredits(rule, params, pricingMode);
    estimatedCostUsd = computeCostUsd(rule, params, pricingMode);
  } catch (error) {
    // Cena koja ne može da se izračuna je odbijen posao, nikad nula.
    throw new Error(`NEISPRAVNI_PARAMETRI:${error instanceof Error ? error.message : "CENA"}`);
  }
  if (!Number.isFinite(creditCost) || creditCost <= 0) throw new Error("NEISPRAVNI_PARAMETRI:CENA");

  const storageIds = jobInputStorageIds(inputs.inputs);

  return {
    slug: model.slug,
    kind: model.kind,
    params,
    prompt,
    creditCost,
    estimatedCostUsd,
    inputMode,
    ...(storageIds.length > 0 ? { inputs: JSON.stringify(inputs.inputs) } : {}),
  };
}

/**
 * Posao iz starog `modelCatalog`-a - zatečeno ponašanje, nepromenjeno.
 * Postoji dok se poslednji red ne preseli u `models` (STUDIO-CATALOG-V4 1.1).
 */
async function buildLegacyOrder(
  ctx: MutationCtx,
  modelSlug: string,
  params: Record<string, unknown>,
): Promise<PricedOrder> {
  const prompt = extractPrompt(params);
  const promptCheck = validatePrompt(prompt);
  if (!promptCheck.ok) throw new Error(`NEISPRAVAN_PROMPT:${promptCheck.reason}`);

  // Model koji ne postoji i model koji je admin isključio su za korisnika
  // ista stvar: ne može se generisati na njemu.
  const model = await ctx.db
    .query("modelCatalog")
    .withIndex("by_slug", (q) => q.eq("slug", modelSlug))
    .unique();
  if (!model || !model.isEnabled) throw new Error("MODEL_NEDOSTUPAN");

  // Od ove tačke se radi ISKLJUČIVO sa očišćenim parametrima: i cena i ono
  // što `submitJob` pošalje fal-u moraju da izađu iz istog objekta, inače
  // naplaćujemo jedan posao a naručujemo drugi.
  const sanitized = sanitizeParams(model.paramSchema, params);
  if (!sanitized.ok) throw new Error(`NEISPRAVNI_PARAMETRI:${sanitized.reason}`);
  const cleanParams = sanitized.params;

  return {
    slug: model.slug,
    kind: model.kind,
    params: cleanParams,
    prompt,
    creditCost: computeCreditCost(model, cleanParams),
    // Nabavna cena raste sa brojem slika isto kao i naplata: bez toga dnevni
    // plafon od 5 $ propušta do 20 $ stvarnog troška (`num_images: 4`).
    estimatedCostUsd: model.estimatedCostUsd * requestedImageCount(cleanParams),
  };
}

/**
 * Rezervacija posla iz koraka 1 sekcije 4.2 STUDIO-PLAN-a. Sve provere idu
 * PRE prvog upisa, a rezervacija posla i skidanje kredita su u istoj
 * transakciji - ne sme da ostane ni skinut kredit bez posla, ni posao bez
 * skinutog kredita.
 */
export const createJob = mutation({
  args: {
    modelSlug: v.string(),
    params: v.string(),
    // Ulazni režim i okačeni fajlovi (STUDIO-CATALOG-V4 sekcija 5). Postoje
    // samo za v4 katalog; stari `modelCatalog` ih nema i ignoriše ih.
    inputMode: v.optional(v.string()),
    inputs: v.optional(v.string()),
    // Količina koju korisnik ne bira nego se meri iz okačenog fajla (sekunde
    // zvuka, minuti snimka). Prolazi kroz `resolveMeasuredQuantity` - videti
    // tamo zašto klijentu ovde ipak nije poslednja reč.
    measuredQuantity: v.optional(v.number()),
    // Kontekst lekcije (STUDIO-PLAN 1.1): kad Studio widget stoji u output
    // pane-u lekcije, izlaz treba da postane `labOutputs` red i dokaz da je
    // zadatak uradjen. Bez ovih polja ta veza se kasnije ne može rekonstruisati.
    lessonId: v.optional(v.id("lessons")),
    taskId: v.optional(v.id("lessonTasks")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    // Kill switch se čita prvi, pre svega ostalog. Red koji ne postoji znači
    // "nikad nije ni gašen" - podrazumevana vrednost seed-a je `true`.
    const flag = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", STUDIO_FLAG_KEY))
      .unique();
    if (flag && !flag.enabled) throw new Error("STUDIO_PAUZIRAN");

    // Studio je samo za upisane (STUDIO-PLAN 4.4). Dovoljan je jedan aktivan
    // upis - posao nije vezan za konkretan kurs.
    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!enrollment) throw new Error("NIJE_UPISAN");

    // Kontekst lekcije se proverava istim putem kao i u `lab.saveLabOutput`:
    // upis u Studio ne daje pristup tudjem kursu, pa izlaz ne sme da sleti u
    // lekciju koju korisnik ne sme ni da otvori. Zadatak bez lekcije se odbija
    // jer `labOutputs` bez `lessonId` ne postoji.
    if (args.taskId && !args.lessonId) throw new Error("ZADATAK_BEZ_LEKCIJE");
    if (args.lessonId) {
      await assertLessonAccess(ctx, args.lessonId);
      if (args.taskId) {
        const task = await ctx.db.get(args.taskId);
        if (!task || task.lessonId !== args.lessonId) throw new Error("ZADATAK_NIJE_U_LEKCIJI");
      }
    }

    const params = parseParams(args.params);
    if (!params) throw new Error("NEISPRAVNI_PARAMETRI");

    // Katalog v4 ima prednost nad starim `modelCatalog`-om: isti slug u obe
    // tabele znači model koji je PRESELJEN, a ne dva modela. Model kojeg u
    // `models` nema ide starim putem nepromenjen.
    const v4Model = await ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", args.modelSlug))
      .unique();

    const order = v4Model
      ? buildCatalogOrder(v4Model, params, args)
      : await buildLegacyOrder(ctx, args.modelSlug, params);
    const cleanParams = order.params;
    const estimatedCostUsd = order.estimatedCostUsd;

    const reserved = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "reserved"))
      .take(MAX_ACTIVE_JOBS);
    const running = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "running"))
      .take(MAX_ACTIVE_JOBS);
    if (reserved.length + running.length >= MAX_ACTIVE_JOBS) throw new Error("PREVISE_POSLOVA");

    const now = Date.now();
    const day = dayKey(now);
    const usage = await ctx.db
      .query("studioUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .unique();
    if ((usage?.generations ?? 0) >= MAX_DAILY_GENERATIONS) throw new Error("DNEVNI_LIMIT");
    // Drugi plafon je u dolarima, ne u komadima: broj generacija ne kaže ništa
    // dok korisnik bira između modela od 0,005 $ i modela od 2 $.
    if (exceedsDailyCostLimit(usage?.costUsd ?? 0, estimatedCostUsd)) {
      throw new Error("DNEVNI_LIMIT_TROSKA");
    }

    const creditCost = order.creditCost;

    // Upis posla ide PRE potrošnje jer `credits.applySpend` (A2) traži `jobId`
    // - to je ključ pod kojim se refund kasnije prepoznaje. Sve je i dalje
    // jedna transakcija: ako potrošnja pukne (NEDOVOLJNO_KREDITA), ovaj insert
    // se poništava sam, bez ručnog rollback-a.
    const jobId = await ctx.db.insert("generationJobs", {
      userId,
      modelSlug: order.slug,
      kind: order.kind,
      params: JSON.stringify(cleanParams),
      promptHash: promptHash(order.prompt),
      status: "reserved",
      creditCost,
      ...(order.inputMode ? { inputMode: order.inputMode } : {}),
      ...(order.inputs ? { inputs: order.inputs } : {}),
      ...(args.lessonId ? { lessonId: args.lessonId } : {}),
      ...(args.taskId ? { taskId: args.taskId } : {}),
      createdAt: now,
    });

    // Obična funkcija, a ne `ctx.runMutation`: ugnježdena mutacija je
    // podtransakcija koju pozivalac SME da uhvati i nastavi, pa bi jedan
    // `try/catch` dodat zbog lepše poruke tiho razvalio atomičnost. Ovako
    // potrošnja pada zajedno sa poslom, strukturno.
    await applySpend(ctx, { userId, amount: creditCost, jobId });

    if (usage) {
      await ctx.db.patch(usage._id, {
        generations: usage.generations + 1,
        creditsSpent: usage.creditsSpent + creditCost,
        costUsd: usage.costUsd + estimatedCostUsd,
      });
    } else {
      await ctx.db.insert("studioUsageDaily", {
        userId,
        day,
        generations: 1,
        creditsSpent: creditCost,
        costUsd: estimatedCostUsd,
      });
    }

    await ctx.scheduler.runAfter(0, internal.studioActions.submitJob, { jobId });

    return jobId;
  },
});

/**
 * Jedini dozvoljen prelaz je `reserved` -> `running`. Zakasneo poziv (reaper
 * je posao već refundirao, pa stigne stara predaja) ne sme da ga vrati u
 * `running`: korisnik bi tada dobio i refund i sliku.
 *
 * `providerRequestId` je isti podatak koji je do sada stajao samo u
 * `falRequestId`-ju, ali pod imenom koje važi i za BytePlus i za Google
 * (STUDIO-CATALOG-V4 sekcija 7). Upisuju se OBA polja dok traje prelaz: fal
 * webhook i dalje traži posao kroz `by_fal_request`, BytePlus callback kroz
 * `by_provider_request`.
 */
export const markJobRunning = internalMutation({
  args: { jobId: v.id("generationJobs"), providerRequestId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Posao nije pronađen.");
    if (job.status !== "reserved") throw new Error(`POSAO_NIJE_REZERVISAN:${job.status}`);
    await ctx.db.patch(args.jobId, {
      status: "running",
      falRequestId: args.providerRequestId,
      providerRequestId: args.providerRequestId,
    });
    return null;
  },
});

/**
 * Sinhroni provajder (BytePlus slike, Google slike) nema webhook: rezultat
 * stiže u istom pozivu u kojem je posao i predat, pa posao ide
 * `reserved` -> `done` i NIKAD ne prolazi kroz `running`. Zato ne može da
 * koristi `falWebhook.applyWebhookResult`, koji stoji upravo na `running`-u.
 *
 * Idempotencija je ista po duhu - prelaz je dozvoljen samo iz `reserved` -
 * pa druga predaja istog posla ne prepisuje izlaz i ne zakazuje `persistOutput`
 * drugi put. Vraća `false` kad nije bilo šta da se uradi.
 */
export const markJobDone = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    outputUrl: v.string(),
    providerRequestId: v.optional(v.string()),
    actualCostUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "reserved") return false;

    await ctx.db.patch(args.jobId, {
      status: "done",
      falOutputUrl: args.outputUrl,
      completedAt: Date.now(),
      ...(args.providerRequestId ? { providerRequestId: args.providerRequestId } : {}),
      ...(args.actualCostUsd !== undefined ? { actualCostUsd: args.actualCostUsd } : {}),
    });
    // Skidanje fajla ide u zakazanu akciju, kao i kod webhook puta - akcija
    // koja je upravo pričala sa provajderom ne sme da čeka i na preuzimanje.
    await ctx.scheduler.runAfter(0, internal.studioActions.persistOutput, { jobId: args.jobId });

    return true;
  },
});

/**
 * Označava posao kao neuspeo i odmah refundira preko `credits.refundCredits`
 * (idempotentno preko `by_job_type` - videti `convex/credits.ts`). Poziva se
 * kad `submitJob` ne uspe da preda zahtev fal-u, pre nego što je bilo šta
 * poslato - posao nikad nije ušao u `running`.
 */
export const failJob = internalMutation({
  args: { jobId: v.id("generationJobs"), error: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Posao nije pronađen.");
    await ctx.db.patch(args.jobId, { status: "failed", error: args.error, completedAt: Date.now() });
    await ctx.runMutation(internal.credits.refundCredits, { jobId: args.jobId });
    await ctx.db.patch(args.jobId, { status: "refunded" });
    return null;
  },
});

/**
 * Upisni deo `studioActions.persistOutput`-a: akcija je fajl već skinula i
 * stavila u storage, ovde se posao vezuje za taj fajl i dobija rok trajanja.
 * Sve u jednoj transakciji - posao sa `outputStorageId`, a bez `labOutputs`
 * reda, bio bi izlaz koji lekcija ne vidi.
 *
 * Vraća `false` kad nema šta da se upiše (posao je u medjuvremenu dobio fajl,
 * ili više nije `done`). Pozivalac tada briše fajl koji je upravo stavio u
 * storage: blob bez reference u bazi ne bi obrisao nijedan cron, jer
 * `crons.expireGenerationFiles` ide po `generationJobs`.
 */
export const finalizeOutput = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    storageId: v.id("_storage"),
    mimeType: v.optional(v.string()),
    byteSize: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "done" || job.outputStorageId) return false;

    const now = Date.now();
    const title = outputTitle(extractPrompt(parseParams(job.params) ?? {}), job.modelSlug);

    // `labOutputs` traži `courseId` i `lessonId`; posao bez konteksta lekcije
    // (obična generacija iz Studija) zato ostaje samo u `generationJobs`, gde
    // ga galerija i nalazi.
    let labOutputId: Id<"labOutputs"> | undefined;
    const lesson = job.lessonId ? await ctx.db.get(job.lessonId) : null;
    if (job.lessonId && lesson) {
      labOutputId = await ctx.db.insert("labOutputs", {
        userId: job.userId,
        courseId: lesson.courseId,
        lessonId: job.lessonId,
        ...(job.taskId ? { taskId: job.taskId } : {}),
        kind: job.kind,
        status: "ready",
        title,
        storageId: args.storageId,
        ...(args.mimeType ? { mimeType: args.mimeType } : {}),
        byteSize: args.byteSize,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.jobId, {
      outputStorageId: args.storageId,
      expiresAt: outputExpiresAt(job.kind, now),
      ...(labOutputId ? { labOutputId } : {}),
    });

    // Zadatak se zeleni sam, preko iste funkcije koju zove i ručno štikliranje
    // u lekciji (`lab.markTaskProgress`) - dakle isti leaderboard dogadjaj i
    // ista profilna aktivnost, bez paralelnog puta.
    if (labOutputId && job.taskId) {
      const task = await ctx.db.get(job.taskId);
      if (task) {
        await applyTaskCompletion(ctx, {
          userId: job.userId,
          task,
          completed: true,
          evidenceOutputId: labOutputId,
        });
      }
    }

    return true;
  },
});

/**
 * Skidanje izlaza je palo. Posao ostaje `done` i **nema refunda**: generacija
 * jeste uspela i fal je jeste naplatio, pa bi refund ovde bio poklon. Poruka
 * ide u `error` da se u podršci vidi razlika izmedju "model je odbio" i
 * "model je isporučio, a mi nismo preuzeli".
 */
export const markOutputFailed = internalMutation({
  args: { jobId: v.id("generationJobs"), error: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "done" || job.outputStorageId) return null;
    await ctx.db.patch(args.jobId, { error: args.error });
    return null;
  },
});

/**
 * Poslovi prijavljenog korisnika, najnoviji prvi. Convex query je već
 * realtime pretplata - UI dobija nov status čim ga webhook upiše, bez
 * pollinga (STUDIO-PLAN 4.2, korak 5).
 *
 * Filteri (galerija, P7) idu preko `.filter()` posle `by_user` indeksa - tabela
 * nema poseban indeks za tip/model/datum, a `.filter()` na dodatne predikate
 * koje indeks ne izražava je izričito dozvoljeno u `guidelines.md`. `createdAfter`
 * dolazi kao argument sa klijenta (zamrznut `Date.now()`), nikad se ne čita sat
 * unutar samog query-ja.
 */
export const listMyJobs = query({
  args: {
    paginationOpts: paginationOptsValidator,
    kind: v.optional(studioModelKind),
    modelSlug: v.optional(v.string()),
    createdAfter: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    let ordered = ctx.db
      .query("generationJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc");

    if (args.kind !== undefined) {
      const kind = args.kind;
      ordered = ordered.filter((q) => q.eq(q.field("kind"), kind));
    }
    if (args.modelSlug !== undefined) {
      const modelSlug = args.modelSlug;
      ordered = ordered.filter((q) => q.eq(q.field("modelSlug"), modelSlug));
    }
    if (args.createdAfter !== undefined) {
      const createdAfter = args.createdAfter;
      ordered = ordered.filter((q) => q.gte(q.field("createdAt"), createdAfter));
    }

    const result = await ordered.paginate(args.paginationOpts);

    return {
      ...result,
      // `falRequestId` i `actualCostUsd` su naša interna cena i trag ka fal-u;
      // korisniku ne trebaju i ne izlaze iz backend-a. `isMock` je jedino što
      // se iz `falRequestId`-ja izvodi, jer DEMO generacija ne sme da se
      // pomeša sa pravom.
      page: await Promise.all(
        result.page.map(async (job) => ({
          _id: job._id,
          modelSlug: job.modelSlug,
          kind: job.kind,
          params: job.params,
          status: job.status,
          creditCost: job.creditCost,
          outputStorageId: job.outputStorageId,
          posterStorageId: job.posterStorageId,
          // Bez URL-a galerija ima `storageId` koji ne ume da prikaže; potpisan
          // URL se pravi ovde, kao svuda u repou (`courses.ts`, `community.ts`).
          // Fajl kojem je istekla retencija (`crons.expireGenerationFiles`)
          // vrati `null` - kartica tada pokazuje istek, ne pokvarenu sliku.
          outputUrl: job.outputStorageId ? await ctx.storage.getUrl(job.outputStorageId) : null,
          // Ulazi kao sličice na kartici: bez njih "Generiši ponovo" kod modela
          // sa slikama nema smisla, jer se ne vidi šta je uopšte bio ulaz.
          // Potpisuje se najviše `GALLERY_INPUT_THUMBS` po poslu - stranica od
          // dvanaest kartica sa devet referenci je sto osam potpisa za mrežu
          // sličica; ceo spisak vraća `getJobForRegenerate`, jedan posao.
          inputMode: job.inputMode,
          inputThumbs: await resolveInputThumbs(ctx, job.inputs),
          error: job.error,
          isMock: isMockRequestId(job.falRequestId),
          expiresAt: job.expiresAt,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
        })),
      ),
    };
  },
});

/** Koliko ulaznih sličica jedna kartica u mreži dobija potpisane. */
const GALLERY_INPUT_THUMBS = 4;

/**
 * Ulazi jednog posla, spremni za prikaz: slot, potpisan URL i ukupan broj.
 * `url` je `null` za fajl koji je u medjuvremenu obrisan - kartica tada
 * pokazuje prazan slot, ne pokvarenu sliku.
 */
async function resolveInputThumbs(ctx: QueryCtx, rawInputs: string | undefined) {
  const inputs = parseJobInputs(rawInputs);
  const thumbs: Array<{ slot: string; storageId: string; url: string | null }> = [];
  let total = 0;

  for (const [slot, ids] of Object.entries(inputs)) {
    total += ids.length;
    for (const storageId of ids) {
      if (thumbs.length >= GALLERY_INPUT_THUMBS) continue;
      thumbs.push({
        slot,
        storageId,
        url: await ctx.storage.getUrl(storageId as Id<"_storage">),
      });
    }
  }

  return { items: thumbs, total };
}

/**
 * "Generiši ponovo" (S7): vraća MODEL, REŽIM, PARAMETRE I ULAZE jednog posla,
 * da forma može da se vrati u tačno isto stanje. Ide preko `jobId`-ja, a ne
 * kroz URL: spisak `storageId`-jeva u query stringu bio bi duži od svakog
 * razumnog linka, i zastareo bi čim fajl nestane.
 */
export const getJobForRegenerate = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== userId) return null;

    const inputs = parseJobInputs(job.inputs);
    const files: Array<{
      slot: string;
      storageId: string;
      url: string | null;
      mime: string;
      size: number;
    }> = [];
    for (const [slot, ids] of Object.entries(inputs)) {
      for (const rawId of ids) {
        const storageId = rawId as Id<"_storage">;
        // Tip i veličina se čitaju iz sistemske tabele umesto da se pogadjaju
        // iz imena slota: forma po `mime`-u odlučuje šta je pregled a šta se
        // broji kao ulazna slika u ceni.
        const meta = await ctx.db.system.get(storageId);

        files.push({
          slot,
          storageId: rawId,
          url: await ctx.storage.getUrl(storageId),
          mime: meta?.contentType ?? "",
          size: meta?.size ?? 0,
        });
      }
    }

    return {
      modelSlug: job.modelSlug,
      inputMode: job.inputMode,
      params: job.params,
      inputs: files,
    };
  },
});

/**
 * "Obriši" iz galerije (P7). Posao u letu se ne briše - `reserved`/`running`
 * imaju zakazanu akciju ili čekaju fal, i brisanje ispod njih bi ostavilo
 * siroč zakazivanje ili webhook bez posla za `by_fal_request` pretragu.
 *
 * Posao vezan za lekciju (`labOutputId`) se takodje odbija: `finalizeOutput`
 * upisuje ISTI `storageId` i na posao i na `labOutputs` red, pa brisanje fajla
 * ovde napravi lekciji dokaz koji pokazuje na obrisan fajl (`taskProgress`
 * ostaje zeleno sa slomljenom vezom). Galerija briše samo obične generacije.
 */
export const deleteJob = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== userId) throw new Error("Posao nije pronađen.");
    if (job.status === "reserved" || job.status === "running") throw new Error("POSAO_U_TOKU");
    if (job.labOutputId) throw new Error("POSAO_POVEZAN_SA_LEKCIJOM");

    if (job.outputStorageId) await ctx.storage.delete(job.outputStorageId);
    if (job.posterStorageId) await ctx.storage.delete(job.posterStorageId);
    await ctx.db.delete(args.jobId);
    return null;
  },
});

/**
 * Adresa za upload jednog ulaznog fajla (STUDIO-CATALOG-V4 sekcija 5). Isti
 * obrazac kao `lab.createLabOutputUploadUrl` i `profiles.createAvatarUploadUrl`:
 * URL važi kratko i traži prijavljenog korisnika.
 *
 * Slot, tip i veličinu proverava `<DropSlot>` PRE poziva, a vezu
 * `storageId` -> posao pravi tek `createJob`, koji `inputs` upisuje pod svojim
 * korisnikom.
 */
export const createInputUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);

    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Sve što playground mora da zna PRE nego što korisnik pritisne dugme, u
 * jednom upitu: da li je Studio uopšte upaljen (kill switch iz 4.4) i koliko
 * poslova korisnik već ima u letu. Bez ovoga bi UI oba stanja saznao tek iz
 * greške `createJob`-a, dakle pošto je korisnik već kliknuo.
 *
 * Broj poslova u letu se čita istim indeksom i istom granicom kao u
 * `createJob` - dugme se gasi po istom pravilu po kojem bi server odbio.
 */
export const getStudioState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const flag = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", STUDIO_FLAG_KEY))
      .unique();

    const reserved = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "reserved"))
      .take(MAX_ACTIVE_JOBS);
    const running = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "running"))
      .take(MAX_ACTIVE_JOBS);

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    return {
      // Red koji ne postoji znači "nikad nije ni gašen" - isto čitanje kao u
      // `createJob`, da UI i server nikad ne tvrde suprotno.
      enabled: flag ? flag.enabled : true,
      isEnrolled: enrollment !== null,
      activeJobs: reserved.length + running.length,
      maxActiveJobs: MAX_ACTIVE_JOBS,
    };
  },
});
