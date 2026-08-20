import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { applySpend } from "./credits";
import { MAX_PROMPT_LENGTH, validatePrompt } from "./creditsCore";
import { getCurrentProfile, requireUserId } from "./helpers";
import { applyTaskCompletion, assertLessonAccess } from "./lab";
import { parseJobInputs } from "./providers/jobInputs";
import {
  extraCounts,
  hasVideoInput,
  type JobInputs,
  jobInputStorageIds,
  measuredQuantityFromSeconds,
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
  hasStudioAccess,
  INPUT_UPLOAD_TTL_MS,
  isMockRequestId,
  isStudioStaff,
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
  /** Redovi `studioUploads` koje ovaj posao veže za sebe - njima se sklanja `expiresAt`. */
  uploadIds: Array<Id<"studioUploads">>;
};

/**
 * Okačeni fajlovi jednog posla: provera vlasništva i izmereno trajanje po
 * slotu, iz istog prolaza (nalazi R4 i R3).
 *
 * `storageId` dolazi sa klijenta, a `studioUploads` je jedino mesto koje pamti
 * KO ga je okačio. Fajl bez svog reda - ili sa tuđim - se odbija: nepogodivost
 * ID-ja nije kontrola pristupa, a posao svoje ulaze kasnije potpisuje kroz
 * `ctx.storage.getUrl` (galerija, "Generiši ponovo"), pa bi tuđi `storageId`
 * značio čitanje tuđeg fajla. Time pada i druga polovina nalaza: `storageId`
 * koji uopšte ne postoji nema svoj red, pa više ne prolazi kroz naplatu da bi
 * pao tek na predaji posla i vratio se kroz refund.
 *
 * `seconds` je trajanje koje je `studioActions.measureInputUpload` pročitao iz
 * zaglavlja fajla. Slot bez ijednog izmerenog fajla nema svoj ključ, pa posao
 * koji se po trajanju naplaćuje pada na `MERENJE_NIJE_DOSTUPNO` umesto da se
 * naplati po broju koji je poslao klijent.
 */
async function ownedInputUploads(
  ctx: MutationCtx,
  userId: Id<"users">,
  inputs: JobInputs,
): Promise<{ seconds: Record<string, number>; uploadIds: Array<Id<"studioUploads">> }> {
  const seconds: Record<string, number> = {};
  const uploadIds: Array<Id<"studioUploads">> = [];

  for (const [slot, ids] of Object.entries(inputs)) {
    if (ids.length === 0) continue;

    let total = 0;
    let measured = false;
    for (const rawId of ids) {
      // `normalizeId` pre upita: niz koji nije `_storage` ID nema šta da traži
      // u indeksu, a dolazi sa klijenta.
      const storageId = ctx.db.system.normalizeId("_storage", rawId);
      if (!storageId) throw new Error("TUDJI_FAJL");
      // `first` a ne `unique`: prijava je jedinstvena po `storageId`-ju, ali
      // slučajan duplikat sme da propusti posao, ne da ga obori.
      const upload = await ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .first();
      if (!upload || upload.userId !== userId) throw new Error("TUDJI_FAJL");
      uploadIds.push(upload._id);
      if (upload.durationS !== undefined && upload.durationS > 0) {
        measured = true;
        total += upload.durationS;
      }
    }
    if (measured) seconds[slot] = total;
  }

  return { seconds, uploadIds };
}

/**
 * Posao iz v4 kataloga (STUDIO-CATALOG-V4). Cena ide kroz `computeCredits` nad
 * OČIŠĆENIM parametrima - istu funkciju nad istim objektom zove i forma, pa se
 * cifra na dugmetu i naplaćena cifra ne mogu razići (katalog 1.3).
 *
 * Redosled provera je namerno ovakav: prvo režim (bira endpoint i množilac),
 * pa ulazi (broje se u `extras`, proverava im se vlasništvo i odlučuju o
 * sniženoj tarifi), pa parametri, pa merena količina - tek onda prompt i cena,
 * jer i jedno i drugo zavise od svega iznad.
 */
async function buildCatalogOrder(
  ctx: MutationCtx,
  userId: Id<"users">,
  model: Doc<"models">,
  raw: Record<string, unknown>,
  args: { inputMode?: string; inputs?: string },
): Promise<PricedOrder> {
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

  // Vlasništvo nad okačenim fajlovima se proverava PRE cene, dakle i pre
  // svakog upisa i pre skidanja kredita (nalaz R4).
  const uploads = await ownedInputUploads(ctx, userId, inputs.inputs);

  const sanitized = sanitizeSpecParams(spec, rule, raw, inputMode);
  if (!sanitized.ok) throw new Error(`NEISPRAVNI_PARAMETRI:${sanitized.reason}`);
  const params = sanitized.params;

  // Merena količina i broj dodatnih ulaza NISU kontrole - klijent ih ne bira,
  // pa se dopisuju ovde, posle kapije. Ono što forma pošalje pod tim ključevima
  // `sanitizeSpecParams` je već izbacio.
  const source = parseQuantitySource(model.capabilities);
  if (source) {
    // Naplaćuje se trajanje koje je SERVER pročitao iz zaglavlja okačenog fajla
    // - isti princip po kojem se `extras` broje iz `inputs`-a, a ne iz onoga
    // što je klijent naveo. Sekunde su već pročitane iznad, uz proveru
    // vlasništva; slot bez ijednog izmerenog fajla nema svoj ključ, pa posao
    // pada na `MERENJE_NIJE_DOSTUPNO`.
    const measured = resolveMeasuredQuantity(
      source,
      params,
      measuredQuantityFromSeconds(source, uploads.seconds),
    );
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
    uploadIds: uploads.uploadIds,
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
    // Stari katalog nema ulazne slotove, pa nema ni šta da veže za sebe.
    uploadIds: [],
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
    // Trajanje okačenog snimka se OVDE VIŠE NE PRIMA (W5, nalaz R3). Meri ga
    // `studioActions.measureInputUpload` iz zaglavlja fajla i upisuje uz sam
    // upload; ono što je klijent pročitao iz `<video>` metapodataka služi samo
    // da cena na dugmetu stoji dok merenje ne stigne.
    // Kontekst lekcije (STUDIO-PLAN 1.1): kad Studio widget stoji u output
    // pane-u lekcije, izlaz treba da postane `labOutputs` red i dokaz da je
    // zadatak uradjen. Bez ovih polja ta veza se kasnije ne može rekonstruisati.
    lessonId: v.optional(v.id("lessons")),
    taskId: v.optional(v.id("lessonTasks")),
  },
  handler: async (ctx, args) => {
    // Uloga se čita zajedno sa korisnikom jer o pristupu odlučuje
    // `hasStudioAccess` niže - `requireUserId` bi vratio samo ID, pa bi
    // enrollment ostao jedini kriterijum.
    const { userId, role } = await getCurrentProfile(ctx);

    // Kill switch se čita prvi, pre svega ostalog. Red koji ne postoji znači
    // "nikad nije ni gašen" - podrazumevana vrednost seed-a je `true`.
    const flag = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", STUDIO_FLAG_KEY))
      .unique();
    if (flag && !flag.enabled) throw new Error("STUDIO_PAUZIRAN");

    // Studio je samo za upisane (STUDIO-PLAN 4.4). Dovoljan je jedan aktivan
    // upis - posao nije vezan za konkretan kurs. Admin i moderator prolaze bez
    // upisa, po istoj funkciji po kojoj se gasi i dugme u UI-ju; naplata ispod
    // ostaje ista za sve.
    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!hasStudioAccess(role, enrollment)) throw new Error("NIJE_UPISAN");

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
      ? await buildCatalogOrder(ctx, userId, v4Model, params, args)
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

    // Fajl koji je ušao u posao više ne ističe: rok od 24 h postoji samo za
    // uploade koje niko nije upotrebio, a ulaz posla mora da preživi koliko i
    // posao - galerija i "Generiši ponovo" ga potpisuju i mnogo kasnije.
    for (const uploadId of order.uploadIds) {
      await ctx.db.patch(uploadId, { expiresAt: undefined });
    }

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
      page: await Promise.all(result.page.map((job) => toGalleryJob(ctx, job))),
    };
  },
});

/**
 * Jedan red galerije. `falRequestId` i `actualCostUsd` su naša interna cena i
 * trag ka provajderu; korisniku ne trebaju i ne izlaze iz backend-a. `isMock`
 * je jedino što se iz `falRequestId`-ja izvodi, jer DEMO generacija ne sme da
 * se pomeša sa pravom.
 *
 * Isti oblik dobijaju i `listMyJobs` i `listAllJobs` - admin gleda tačno ono
 * što gleda i korisnik, plus vlasnika i provajdera koje `listAllJobs` dopisuje.
 */
async function toGalleryJob(ctx: QueryCtx, job: Doc<"generationJobs">) {
  return {
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
  };
}

/**
 * Lokalna kopija `generationJobs.status` unije, po istoj konvenciji kao
 * `studioModelKind` iznad - `schema.ts` je ne izvozi.
 */
const generationJobStatus = v.union(
  v.literal("reserved"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("refunded"),
);

/** Tri rute iz `models.provider` (STUDIO-CATALOG-V4 sekcija 7). */
const studioProvider = v.union(v.literal("fal"), v.literal("google"), v.literal("byteplus"));

/** Katalog se čita ceo da bi se `modelSlug` preveo u provajdera; isti kap kao `studioModels`. */
const MAX_CATALOG_MODELS = 200;

/** Koliko poslova unazad se gleda kad se pravi spisak vlasnika za filter. */
const MAX_OWNER_SCAN_JOBS = 300;

/**
 * Uloga koja sme da vidi TUĐE poslove. `requireCommunityModerator` iz
 * `helpers.ts` ide preko `ensureProfile`, koji profil upisuje i zato baca
 * unutar query-ja - isti obrazac rešava `studioAdmin.requireAdminRead`: uloga
 * se čita preko `getCurrentProfile`, bez upisa.
 */
async function requireStudioStaff(ctx: QueryCtx) {
  const { profile } = await getCurrentProfile(ctx);
  if (!isStudioStaff(profile.role)) throw new Error("Forbidden");
}

/** Red admin galerije: isto što vidi i korisnik, plus vlasnik i provajder. */
type StaffJob = Awaited<ReturnType<typeof toGalleryJob>> & {
  ownerEmail: string;
  provider: string;
};

/**
 * Poslovi SVIH korisnika, najnoviji prvi (W1). Ovo je jedini upit koji izlazi
 * iz jednog naloga, pa uloga stoji na SERVERU, ne u UI-ju - sakriven prekidač
 * nije provera.
 *
 * Indeks bira najuži zadat filter: korisnik je uži od statusa, pa `by_user`
 * ima prednost, a preostali predikat ide kroz `.filter()` (dozvoljeno za
 * predikate koje indeks ne izražava). Bez oba, poredak je najnoviji prvi po
 * ugrađenom `by_creation_time` indeksu - `createdAt` se upisuje istim
 * `Date.now()`-om, pa je isti redosled kao u `by_user`.
 *
 * Provajder se ne pamti na poslu nego na modelu, pa se filter po njemu
 * prevodi u spisak slugova iz kataloga.
 */
export const listAllJobs = query({
  args: {
    paginationOpts: paginationOptsValidator,
    userId: v.optional(v.id("users")),
    status: v.optional(generationJobStatus),
    provider: v.optional(studioProvider),
  },
  handler: async (ctx, args) => {
    await requireStudioStaff(ctx);

    const models = await ctx.db.query("models").take(MAX_CATALOG_MODELS);
    const providerBySlug = new Map(models.map((model) => [model.slug, model.provider]));
    const providerSlugs = args.provider
      ? models.filter((model) => model.provider === args.provider).map((model) => model.slug)
      : null;
    // Provajder bez ijednog modela u katalogu (nezasejana baza) nema šta da
    // vrati; `q.or()` bez ijednog izraza ne postoji, pa se prazna strana pravi
    // ovde umesto da se sastavi filter koji ne može da se izrazi.
    if (providerSlugs !== null && providerSlugs.length === 0) {
      return { page: [] as StaffJob[], isDone: true, continueCursor: "" };
    }

    const userId = args.userId;
    const status = args.status;
    let ordered =
      userId !== undefined
        ? ctx.db
            .query("generationJobs")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .order("desc")
        : status !== undefined
          ? ctx.db
              .query("generationJobs")
              .withIndex("by_status_created", (q) => q.eq("status", status))
              .order("desc")
          : ctx.db.query("generationJobs").order("desc");

    if (userId !== undefined && status !== undefined) {
      ordered = ordered.filter((q) => q.eq(q.field("status"), status));
    }
    if (providerSlugs !== null) {
      const slugs = providerSlugs;
      ordered = ordered.filter((q) => q.or(...slugs.map((slug) => q.eq(q.field("modelSlug"), slug))));
    }

    const result = await ordered.paginate(args.paginationOpts);

    // Mejl vlasnika se čita jednom po korisniku, ne jednom po poslu: strana od
    // dvanaest kartica jednog korisnika je jedno čitanje, ne dvanaest.
    const emailByUser = new Map<Id<"users">, string>();
    const page: StaffJob[] = [];
    for (const job of result.page) {
      if (!emailByUser.has(job.userId)) {
        const owner = await ctx.db.get(job.userId);
        emailByUser.set(job.userId, owner?.email ?? "");
      }
      page.push({
        ...(await toGalleryJob(ctx, job)),
        ownerEmail: emailByUser.get(job.userId) ?? "",
        provider: providerBySlug.get(job.modelSlug) ?? "",
      });
    }

    return { ...result, page };
  },
});

/**
 * Vlasnici za select "filter po korisniku". Distinct korisnici poslednjih
 * `MAX_OWNER_SCAN_JOBS` poslova, a ne cela tabela korisnika - filtrira se po
 * onome ko je stvarno nešto generisao, i čitanje ostaje ograničeno.
 */
export const listJobOwners = query({
  args: {},
  handler: async (ctx) => {
    await requireStudioStaff(ctx);

    const jobs = await ctx.db.query("generationJobs").order("desc").take(MAX_OWNER_SCAN_JOBS);
    const jobsByUser = new Map<Id<"users">, number>();
    for (const job of jobs) {
      jobsByUser.set(job.userId, (jobsByUser.get(job.userId) ?? 0) + 1);
    }

    const owners = await Promise.all(
      [...jobsByUser.entries()].map(async ([userId, jobCount]) => {
        const owner = await ctx.db.get(userId);
        return { userId, email: owner?.email ?? "", jobCount };
      }),
    );

    return owners.sort((a, b) => a.email.localeCompare(b.email));
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
      durationS?: number;
    }> = [];
    for (const [slot, ids] of Object.entries(inputs)) {
      for (const rawId of ids) {
        const storageId = rawId as Id<"_storage">;
        // Tip i veličina se čitaju iz sistemske tabele umesto da se pogadjaju
        // iz imena slota: forma po `mime`-u odlučuje šta je pregled a šta se
        // broji kao ulazna slika u ceni.
        const meta = await ctx.db.system.get(storageId);
        // Izmereno trajanje ide uz fajl: bez njega bi forma posle "Generiši
        // ponovo" mislila da fajl još nije izmeren i zaključala dugme, iako je
        // isti fajl već izmeren i posao bi prošao (W5).
        const upload = await ctx.db
          .query("studioUploads")
          .withIndex("by_storage", (q) => q.eq("storageId", storageId))
          .first();

        files.push({
          slot,
          storageId: rawId,
          url: await ctx.storage.getUrl(storageId),
          mime: meta?.contentType ?? "",
          size: meta?.size ?? 0,
          ...(upload?.durationS !== undefined ? { durationS: upload.durationS } : {}),
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
 * Slot, tip i veličinu proverava `<DropSlot>` PRE poziva. Ko je fajl okačio
 * pamti tek `registerInputUpload` ispod: ova mutacija vraća URL i ne zna ishod
 * uploada, pa ni `storageId` koji će iz njega ispasti.
 */
export const createInputUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);

    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Prijava okačenog fajla (nalaz R4). Klijent je zove ČIM upload prođe, i tek
 * ovaj red daje `createJob`-u pravo da taj `storageId` primi.
 *
 * Veličina i MIME tip se čitaju iz `_storage`, ne iz onoga što je klijent
 * poslao - to je ista cifra na koju se kasnije oslanja granica prijavljenog
 * trajanja. Fajl koji ne postoji se odbija ovde, dakle pre nego što uopšte
 * stigne do naplate.
 *
 * Rok od 24 h nose samo uploadi koje niko nije upotrebio; `createJob` ga
 * sklanja, a `crons.expireGenerationFiles` briše ono što ostane.
 */
export const registerInputUpload = mutation({
  args: { storageId: v.id("_storage"), slot: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) throw new Error("FAJL_NE_POSTOJI");

    const existing = await ctx.db
      .query("studioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (existing) {
      // Ponovljena prijava istog fajla (mrežni pokušaj iz drugog pokušaja) nije
      // greška; prijava tudjeg fajla jeste - ona je jedini način da se
      // vlasništvo prepiše.
      if (existing.userId !== userId) throw new Error("TUDJI_FAJL");

      return null;
    }

    const now = Date.now();
    await ctx.db.insert("studioUploads", {
      userId,
      storageId: args.storageId,
      slot: args.slot,
      bytes: meta.size,
      ...(meta.contentType ? { mimeType: meta.contentType } : {}),
      createdAt: now,
      expiresAt: now + INPUT_UPLOAD_TTL_MS,
    });

    return null;
  },
});

/**
 * Prijavljen upload SVOG fajla, za merenje trajanja (W5).
 *
 * Interno, a ipak proverava korisnika: `studioActions.measureInputUpload` je
 * javna akcija, pa bi bez ove provere tuđi `storageId` mogao da se pošalje na
 * merenje - a odgovor (trajanje) je podatak o tuđem fajlu.
 */
export const getOwnedUpload = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const upload = await ctx.db
      .query("studioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!upload || upload.userId !== userId) return null;

    return { uploadId: upload._id, bytes: upload.bytes, durationS: upload.durationS };
  },
});

/**
 * Izmereno trajanje se upisuje JEDNOM i ne prepisuje se: fajl u Convex
 * storage-u je nepromenljiv, pa drugo merenje istog `storageId`-ja ne može da
 * da drugi broj - a ponovljeni poziv akcije (mreža, dva slota nad istim fajlom)
 * sme da se desi.
 */
export const setUploadDuration = internalMutation({
  args: { uploadId: v.id("studioUploads"), seconds: v.number() },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.durationS !== undefined) return null;
    await ctx.db.patch(args.uploadId, { durationS: args.seconds });

    return null;
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
    const { userId, role } = await getCurrentProfile(ctx);

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
      // Ne "je li upisan" nego "sme li u Studio" - ista funkcija koju zove i
      // `createJob`, pa dugme ne može biti sivo korisniku kojeg bi server
      // pustio (ni obrnuto).
      hasStudioAccess: hasStudioAccess(role, enrollment),
      // Prekidač "Samo moji / Svi korisnici" u galeriji. Ovo je samo prikaz -
      // `listAllJobs` istu ulogu proverava ponovo, na serveru.
      isStaff: isStudioStaff(role),
      activeJobs: reserved.length + running.length,
      maxActiveJobs: MAX_ACTIVE_JOBS,
    };
  },
});
