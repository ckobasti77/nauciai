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
import { applySettlement, applySpend } from "./credits";
import { MAX_PROMPT_LENGTH, validatePrompt } from "./creditsCore";
import { getCurrentProfile, requireUserId } from "./helpers";
import { applyTaskCompletion, assertLessonAccess } from "./lab";
import { parseJobInputs } from "./providers/jobInputs";
import {
  boundedInputSeconds,
  type DurationSource,
  extraCounts,
  hasVideoInput,
  type JobInputs,
  jobInputStorageIds,
  type MeasuredUpload,
  measuredQuantityFromSeconds,
  parseClientInputs,
  parseContinuationSource,
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
import { planSettlement } from "./studioSettlementCore";
import {
  computeCreditCost,
  dayKey,
  exceedsDailyCostLimit,
  exceedsUnsettledCostLimit,
  extractPrompt,
  hasStudioAccess,
  INPUT_UPLOAD_TTL_MS,
  isMeasureBlocked,
  isMockRequestId,
  isStudioStaff,
  MAX_ACTIVE_JOBS,
  MAX_DAILY_GENERATIONS,
  MEASURE_RATE_WINDOW_MS,
  MEASURE_UPLOAD_HOURLY_LIMIT,
  outputExpiresAt,
  outputTitle,
  ownerHandle,
  parseParams,
  promptHash,
  requestedImageCount,
  sanitizeParams,
  STUDIO_FLAG_KEY,
  UPLOAD_GRANT_CLOCK_SLACK_MS,
  UPLOAD_GRANT_TTL_MS,
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
  /** Ko posao izvršava (nalaz W7-6) - `models.provider` za v4, uvek "fal" za legacy. */
  provider: "fal" | "google" | "byteplus";
  params: Record<string, unknown>;
  prompt: string;
  creditCost: number;
  estimatedCostUsd: number;
  inputMode?: string;
  inputs?: string;
  /** Redovi `studioUploads` koje ovaj posao veže za sebe - njima se sklanja `expiresAt`. */
  uploadIds: Array<Id<"studioUploads">>;
  /** Odakle je došlo trajanje po kojem je naplaćeno (X1, nalaz N2). */
  durationSource?: DurationSource;
  headerDurationS?: number;
  billedDurationS?: number;
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
 * `files` nosi trajanje koje je `studioActions.measureInputUpload` pročitao iz
 * zaglavlja fajla, zajedno sa veličinom i MIME tipom iz `_storage` - granice iz
 * X1 traže sva tri broja, jer zaglavlje samo tvrdi, a bajtovi dokazuju. Slot bez
 * ijednog izmerenog fajla nema svoj ključ, pa posao koji se po trajanju
 * naplaćuje pada na `MERENJE_NIJE_DOSTUPNO` umesto da se naplati po broju koji
 * je poslao klijent.
 */
async function ownedInputUploads(
  ctx: MutationCtx,
  userId: Id<"users">,
  inputs: JobInputs,
): Promise<{ files: Record<string, MeasuredUpload[]>; uploadIds: Array<Id<"studioUploads">> }> {
  const files: Record<string, MeasuredUpload[]> = {};
  const uploadIds: Array<Id<"studioUploads">> = [];

  for (const [slot, ids] of Object.entries(inputs)) {
    if (ids.length === 0) continue;

    const measured: MeasuredUpload[] = [];
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
        measured.push({
          seconds: upload.durationS,
          bytes: upload.bytes,
          ...(upload.mimeType !== undefined ? { mimeType: upload.mimeType } : {}),
        });
      }
    }
    if (measured.length > 0) files[slot] = measured;
  }

  return { files, uploadIds };
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
  args: { inputMode?: string; inputs?: string; sourceJobId?: Id<"generationJobs"> },
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
  let duration: { source: DurationSource; headerSeconds: number; billedSeconds: number } | null =
    null;
  if (source) {
    // Naplaćuje se trajanje koje je SERVER pročitao iz zaglavlja okačenog fajla
    // - isti princip po kojem se `extras` broje iz `inputs`-a, a ne iz onoga
    // što je klijent naveo. Sekunde su već pročitane iznad, uz proveru
    // vlasništva; slot bez ijednog izmerenog fajla nema svoj ključ, pa posao
    // pada na `MERENJE_NIJE_DOSTUPNO`.
    //
    // Zaglavlje samo tvrdi, pa pre naplate ide kroz granice iz veličine fajla
    // (nalaz N2): prekratko se podiže na donju granicu, nemoguće obara posao.
    const bounded = boundedInputSeconds(source, uploads.files);
    if (!bounded.ok) throw new Error(bounded.reason);
    const measured = resolveMeasuredQuantity(
      source,
      params,
      measuredQuantityFromSeconds(source, bounded.seconds),
    );
    if (!measured.ok) throw new Error(measured.reason);
    params[source.param] = measured.quantity;
    // Modeli koji se mere iz TEKSTA nemaju trajanje, pa nemaju ni izvor.
    if (bounded.headerSeconds > 0) {
      duration = {
        source: bounded.durationSource,
        headerSeconds: bounded.headerSeconds,
        billedSeconds: bounded.billedSeconds,
      };
    }
  }
  Object.assign(params, extraCounts(rule, inputs.inputs));

  // Rezim koji se naručuje IZBOROM prethodne generacije, ne uploadom (nalaz S3:
  // Gemini Omni "video" - izmena klipa koji je model sam napravio, katalog 3.8).
  // `sourceJobId` nije kontrola forme ni slot, pa ide kao zaseban argument
  // `createJob`-a; ovde se proverava vlasništvo i da je izvor STVARNO ovog istog
  // modela pre nego što njegov `providerRequestId` udje u zahtev ka provajderu.
  const continuation = parseContinuationSource(model.capabilities);
  if (continuation && inputMode === continuation.mode) {
    if (!args.sourceJobId) throw new Error("IZVOR_NIJE_IZABRAN");
    const sourceJob = await ctx.db.get(args.sourceJobId);
    if (
      !sourceJob ||
      sourceJob.userId !== userId ||
      sourceJob.modelSlug !== model.slug ||
      sourceJob.status !== "done" ||
      !sourceJob.providerRequestId
    ) {
      throw new Error("IZVOR_NIJE_DOSTUPAN");
    }
    params[continuation.param] = sourceJob.providerRequestId;
  } else if (args.sourceJobId) {
    // Poslat mimo forme, za režim koji ga ne traži - forma ga nikad ne šalje.
    throw new Error("IZVOR_NIJE_PODRZAN");
  }

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
    provider: model.provider,
    params,
    prompt,
    creditCost,
    estimatedCostUsd,
    inputMode,
    uploadIds: uploads.uploadIds,
    ...(storageIds.length > 0 ? { inputs: JSON.stringify(inputs.inputs) } : {}),
    // Oba broja se pamte samo kad je donja granica nadjačala zaglavlje: tada
    // razlika između njih JESTE nalaz, a kad zaglavlje pobedi, `headerDurationS`
    // bi bio isti podatak koji već stoji u naplaćenoj količini.
    ...(duration
      ? {
          durationSource: duration.source,
          ...(duration.source === "lower_bound"
            ? {
                headerDurationS: duration.headerSeconds,
                billedDurationS: duration.billedSeconds,
              }
            : {}),
        }
      : {}),
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
    // Stari katalog ima samo fal redove (§7 kataloga) - `modelCatalog.provider`
    // je slobodan string iz istog razloga kao `paramSchema`, pa se ovde piše
    // doslovno umesto da se veruje sadržaju polja.
    provider: "fal",
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
    // ID prethodne generacije OVOG modela iz `generationJobs`, izabran u galeriji
    // - jedini ulaz koji rezimi sa `capabilities.continuation` primaju (nalaz S3,
    // Gemini Omni "video"). Nije upload, pa ne ide kroz `inputs`.
    sourceJobId: v.optional(v.id("generationJobs")),
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

    // Dug iz poravnanja (X2, nalaz N2): posao čiji je stvaran trošak premašio
    // ono što je korisnik imao ostavlja `unsettledCredits` na svom redu. Dok dug
    // stoji, novih poslova nema - bez ove brave bi nalog sa 6,50 € kredita mogao
    // ceo dan da radi na dug.
    const debt = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_unsettled", (q) => q.eq("userId", userId).gt("unsettledCredits", 0))
      .first();
    if (debt) throw new Error("NEPORAVNAT_DUG");

    const reserved = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "reserved"))
      .take(MAX_ACTIVE_JOBS);
    const running = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "running"))
      .take(MAX_ACTIVE_JOBS);
    if (reserved.length + running.length >= MAX_ACTIVE_JOBS) throw new Error("PREVISE_POSLOVA");

    // Prozor između rezervacije i poravnanja (X2). Poslovi u letu su jedini o
    // kojima se još ništa ne zna osim procene, pa se njihov zbir drži nisko:
    // tri paralelna posla od po 72 $ su isti napad kao pedeset uzastopnih, a
    // poravnanje ih ispravlja tek kad se završe. `take` iznad je vratio SVE
    // takve poslove (inače bi provera reda gore već bacila), pa je zbir tačan.
    const inFlightCostUsd = [...reserved, ...running].reduce(
      (sum, job) => sum + (job.estimatedCostUsd ?? 0),
      0,
    );
    if (exceedsUnsettledCostLimit(inFlightCostUsd)) throw new Error("PREVISE_NEPORAVNATOG");

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
      provider: order.provider,
      params: JSON.stringify(cleanParams),
      promptHash: promptHash(order.prompt),
      status: "reserved",
      creditCost,
      // Procena iz kataloga se pamti UZ POSAO, ne samo u dnevnom zbiru: bez nje
      // se stvaran trošak (`actualCostUsd`, W6) nema sa čim porediti, jer
      // `studioUsageDaily.costUsd` je već sabran po korisniku i danu.
      estimatedCostUsd,
      ...(order.inputMode ? { inputMode: order.inputMode } : {}),
      ...(order.inputs ? { inputs: order.inputs } : {}),
      // Po čemu je naplaćeno trajanje ispalo onakvo kakvo jeste (X1). Kad je
      // donja granica iz bajtova nadjačala zaglavlje, uz posao stoje i oba
      // broja - to je jedini trag o tome ko je zaglavlje prepravljao.
      ...(order.durationSource ? { durationSource: order.durationSource } : {}),
      ...(order.headerDurationS !== undefined
        ? { headerDurationS: order.headerDurationS }
        : {}),
      ...(order.billedDurationS !== undefined
        ? { billedDurationS: order.billedDurationS }
        : {}),
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
 *
 * `actualCostUsd` NE upisuje ovde: stvaran trošak ima svoj jedini ulaz
 * (`studioActualCost.recordJobActualCost`), koji uz polje održava i zbir po
 * modelu. Drugi put do istog polja bi značio zbir koji ne vidi sve poslove.
 */
export const markJobDone = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    outputUrl: v.string(),
    providerRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "reserved") return false;

    await ctx.db.patch(args.jobId, {
      status: "done",
      falOutputUrl: args.outputUrl,
      completedAt: Date.now(),
      ...(args.providerRequestId ? { providerRequestId: args.providerRequestId } : {}),
    });
    // Skidanje fajla ide u zakazanu akciju, kao i kod webhook puta - akcija
    // koja je upravo pričala sa provajderom ne sme da čeka i na preuzimanje.
    await ctx.scheduler.runAfter(0, internal.studioActions.persistOutput, { jobId: args.jobId });

    return true;
  },
});

/**
 * Korekcija dnevnog zbira jednog korisnika (X2, nalaz N2). `createJob` u
 * `studioUsageDaily` upisuje PROCENU, a iz tog istog polja čitaju i dnevni
 * plafon po korisniku (`MAX_DAILY_COST_USD`) i globalni plafon
 * (`crons.applyGlobalCostAction`). Dok se procena nije ispravljala, oba plafona
 * su merila broj koji napadač bira.
 *
 * Zbog toga ovuda prolaze OBE ispravke: poravnanje (razlika do stvarne cene) i
 * refund (posao koji je vraćen ne sme da ostane u zbiru). Dan je dan
 * REZERVACIJE, ne dan poravnanja - inače bi posao započet pred ponoć popravljao
 * tuđi sutrašnji plafon.
 *
 * Ne pada ispod nule: zbir dana je zbir troška, a negativan trošak bi bio
 * kredit koji plafon poklanja narednim poslovima.
 */
async function applyDailyUsageDelta(
  ctx: MutationCtx,
  userId: Id<"users">,
  day: string,
  delta: { costUsd: number; creditsSpent: number },
) {
  if (delta.costUsd === 0 && delta.creditsSpent === 0) return;

  const usage = await ctx.db
    .query("studioUsageDaily")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
    .unique();
  if (!usage) return;

  await ctx.db.patch(usage._id, {
    costUsd: Math.max(0, usage.costUsd + delta.costUsd),
    creditsSpent: Math.max(0, usage.creditsSpent + delta.creditsSpent),
  });
}

/**
 * PORAVNANJE posla (X2, nalaz N2): rezervacija je skinula kredite po proceni iz
 * kataloga, ovde se naplaćuje ono što je stvarno potrošeno.
 *
 * **Idempotentno je preko `settledAt`.** I fal webhook, i Google poller, i
 * BytePlus callback, i noćna rekonsilijacija umeju da stignu do istog posla, a
 * razlika sme da se naplati tačno jednom. Posao za koji provajder nije prijavio
 * ni količinu ni cenu dobija samo `settlementReason` - `settledAt` ostaje
 * prazan, jer takav posao još nije poravnat i noćna rekonsilijacija sme da
 * proba ponovo sa cenom sa fakture.
 *
 * Razlika naviše se skida koliko korisnik ima; ostatak je dug na redu posla i
 * zaključava mu nove poslove. Već završen posao se ISPORUČUJE i sa dugom -
 * naplata i isporuka su dva pitanja.
 *
 * Zbog istog razloga se i zakazuje, a ne zove ugnježdeno iz mutacije koja posao
 * zatvara: greška u poravnanju ne sme da povuče `done` i izlaz sa njim.
 */
export const settleJobCredits = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    // Trajanje koje je provajder prijavio, u sekundama. Nema ga kad provajder
    // ništa nije javio - tada se poravnava po ceni, ili nikako.
    reportedSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.settledAt !== undefined) return null;

    const model = await ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", job.modelSlug))
      .unique();
    const params = parseParams(job.params) ?? {};

    const plan = planSettlement({
      // Posao iz starog kataloga nema pravilo, pa se poravnava samo po ceni.
      rule: model ? parsePriceRule(model.priceRule) : null,
      params,
      // Isti ključ režima koji je koristila i rezervacija - `reference` sa
      // video ulazom se i tada naplaćivao po svojoj tarifi.
      pricingMode:
        job.inputMode === undefined
          ? undefined
          : pricingModeFor(job.inputMode, hasVideoInput(parseJobInputs(job.inputs))),
      source: model ? parseQuantitySource(model.capabilities) : null,
      reportedSeconds: args.reportedSeconds ?? null,
      reportedCostUsd: job.actualCostUsd ?? null,
      reservedCredits: job.creditCost,
      reservedCostUsd: job.estimatedCostUsd ?? 0,
    });

    if (!plan.settled) {
      if (job.settlementReason === undefined) {
        await ctx.db.patch(args.jobId, { settlementReason: plan.reason });
      }

      return null;
    }

    const { applied, unsettled } = await applySettlement(ctx, {
      userId: job.userId,
      jobId: args.jobId,
      credits: plan.creditDelta,
    });

    await ctx.db.patch(args.jobId, {
      settledAt: Date.now(),
      settlementReason: plan.reason,
      settledCostUsd: plan.costUsd,
      ...(unsettled > 0 ? { unsettledCredits: unsettled } : {}),
    });

    // Tek posle ovoga oba plafona gledaju stvaran trošak: `costUsd` dana više
    // nije procena nego poravnat broj.
    await applyDailyUsageDelta(ctx, job.userId, dayKey(job.createdAt), {
      costUsd: plan.costDeltaUsd,
      creditsSpent: -applied,
    });

    return { reason: plan.reason, credits: -applied, unsettled };
  },
});

/**
 * Označava posao kao neuspeo i odmah refundira preko `credits.refundCredits`
 * (idempotentno preko `by_job_type` - videti `convex/credits.ts`). Poziva se
 * kad `submitJob` ne uspe da preda zahtev fal-u, pre nego što je bilo šta
 * poslato - posao nikad nije ušao u `running`.
 *
 * Refundiran posao IZLAZI i iz dnevnog zbira (X2): trošak koji je vraćen
 * korisniku nije trošak, a dok se nije oduzimao, plafon je punio poslovima koji
 * nikad nisu ni obrađeni. Broj generacija se namerno NE vraća - to je brojač
 * pokušaja, a ne novca.
 */
export const failJob = internalMutation({
  args: { jobId: v.id("generationJobs"), error: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Posao nije pronađen.");
    await ctx.db.patch(args.jobId, { status: "failed", error: args.error, completedAt: Date.now() });
    const refund: { lotId: Id<"creditLots">; credits: number } | null = await ctx.runMutation(
      internal.credits.refundCredits,
      { jobId: args.jobId },
    );
    await ctx.db.patch(args.jobId, { status: "refunded" });

    if (refund) {
      await applyDailyUsageDelta(ctx, job.userId, dayKey(job.createdAt), {
        // Poravnat posao je u zbiru sa poravnatom cenom, neporavnat sa procenom
        // - oduzima se ono što je stvarno i upisano.
        costUsd: -(job.settledCostUsd ?? job.estimatedCostUsd ?? 0),
        creditsSpent: -refund.credits,
      });
    }

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
    ...(await toModerationJob(ctx, job)),
    params: job.params,
    // Ulazi kao sličice na kartici: bez njih "Generiši ponovo" kod modela
    // sa slikama nema smisla, jer se ne vidi šta je uopšte bio ulaz.
    // Potpisuje se najviše `GALLERY_INPUT_THUMBS` po poslu - stranica od
    // dvanaest kartica sa devet referenci je sto osam potpisa za mrežu
    // sličica; ceo spisak vraća `getJobForRegenerate`, jedan posao.
    inputThumbs: await resolveInputThumbs(ctx, job.inputs),
  };
}

/**
 * Isti red BEZ prompta i BEZ ulaznih sličica (X4, nalaz N1). Ovo je sve što
 * moderacija traži: šta je pušteno, ko je pustio, koliko je koštalo i kako
 * izgleda IZLAZ - jer se izlaz moderira. Prompt koji je korisnik otkucao i
 * fotografija lica koju je okačio nisu deo tog posla.
 *
 * Razdvojeno na dve funkcije, a ne na jednu koja polja briše na kraju, iz
 * jednog razloga: `resolveInputThumbs` POTPISUJE tuđe fajlove
 * (`ctx.storage.getUrl`). Potpis koji se napravi pa odbaci je i dalje bio
 * napravljen; ovako se ne pravi.
 */
async function toModerationJob(ctx: QueryCtx, job: Doc<"generationJobs">) {
  return {
    _id: job._id,
    modelSlug: job.modelSlug,
    kind: job.kind,
    status: job.status,
    creditCost: job.creditCost,
    outputStorageId: job.outputStorageId,
    posterStorageId: job.posterStorageId,
    // Bez URL-a galerija ima `storageId` koji ne ume da prikaže; potpisan
    // URL se pravi ovde, kao svuda u repou (`courses.ts`, `community.ts`).
    // Fajl kojem je istekla retencija (`crons.expireGenerationFiles`)
    // vrati `null` - kartica tada pokazuje istek, ne pokvarenu sliku.
    outputUrl: job.outputStorageId ? await ctx.storage.getUrl(job.outputStorageId) : null,
    // Ime režima, ne sadržaj: "reference" ne odaje šta je na referenci.
    inputMode: job.inputMode,
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
 *
 * Vraća KOJA je od dve uloge prošla, jer od X4 (nalaz N1) ne dobijaju istu
 * količinu podataka: moderator je uloga zajednice koju admin dodeljuje
 * (`profiles.setProfileRole`), pa nema šta da traži u tuđim promptovima.
 */
async function requireStudioStaff(ctx: QueryCtx): Promise<"admin" | "moderator"> {
  const { profile } = await getCurrentProfile(ctx);
  if (!isStudioStaff(profile.role)) throw new Error("Forbidden");
  return profile.role === "admin" ? "admin" : "moderator";
}

/**
 * Strogo `admin`, isti prag koji već važi za ekran sa novcem
 * (`studioAdmin.requireAdminRead`). Piše se u mutaciji, pa `getCurrentProfile`
 * ovde nije zbog upisa nego zbog `userId`-ja aktera koji ide u dnevnik.
 */
async function requireStudioAdmin(ctx: MutationCtx): Promise<Id<"users">> {
  const { profile, userId } = await getCurrentProfile(ctx);
  if (profile.role !== "admin") throw new Error("Forbidden");
  return userId;
}

/**
 * Red staff galerije: moderacijski podskup plus vlasnik i provajder. Admin uz
 * njega dobija i prompt i ulazne sličice - moderator ne, pa su ta dva polja
 * opciona u tipu, a ne opciona u praksi.
 */
type StaffJob = Awaited<ReturnType<typeof toModerationJob>> & {
  ownerEmail: string;
  provider: string;
  params?: string;
  inputThumbs?: Awaited<ReturnType<typeof resolveInputThumbs>>;
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
 *
 * DVA NIVOA (X4, nalaz N1). Moderator dobija `toModerationJob` - bez prompta i
 * bez potpisanih URL-ova tuđih okačenih fajlova. Admin dobija pun red. Razlika
 * se pravi OVDE, a ne u React-u: podatak koji ne izađe iz Convex-a ne može da
 * iscuri.
 */
export const listAllJobs = query({
  args: {
    paginationOpts: paginationOptsValidator,
    userId: v.optional(v.id("users")),
    status: v.optional(generationJobStatus),
    provider: v.optional(studioProvider),
  },
  handler: async (ctx, args) => {
    const role = await requireStudioStaff(ctx);

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
        ...(role === "admin" ? await toGalleryJob(ctx, job) : await toModerationJob(ctx, job)),
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
 *
 * `label` je mejl SAMO adminu (X4, nalaz N1, tačka 3). Moderatoru je to bio
 * spisak mejlova svih korisnika Studija u jednom pozivu - a njemu za filter
 * treba samo nešto po čemu se poslovi jednog naloga razlikuju od drugog, i to
 * je `ownerHandle`. Polje se zato ne zove `email`: pola vremena to nije.
 */
export const listJobOwners = query({
  args: {},
  handler: async (ctx) => {
    const role = await requireStudioStaff(ctx);

    const jobs = await ctx.db.query("generationJobs").order("desc").take(MAX_OWNER_SCAN_JOBS);
    const jobsByUser = new Map<Id<"users">, number>();
    for (const job of jobs) {
      jobsByUser.set(job.userId, (jobsByUser.get(job.userId) ?? 0) + 1);
    }

    const owners = await Promise.all(
      [...jobsByUser.entries()].map(async ([userId, jobCount]) => {
        // Moderatoru se red korisnika uopšte ne čita - otisak se računa iz
        // `userId`-ja, pa mejl ne izlazi iz baze ni da bi bio odbačen.
        if (role !== "admin") return { userId, label: ownerHandle(userId), jobCount };
        const owner = await ctx.db.get(userId);
        return { userId, label: owner?.email ?? "", jobCount };
      }),
    );

    return owners.sort((a, b) => a.label.localeCompare(b.label));
  },
});

/**
 * Prompt, parametri i ULAZNE SLIČICE jednog tuđeg posla - i red u
 * `studioAuditLog` o tome (X4, nalaz N1, tačka 2).
 *
 * Mutacija, a ne query, iz jednog razloga: query ne može da upiše trag. Otkriće
 * bez traga je stanje koje je ovaj nalaz i prijavio, pa se to dvoje ovde
 * dešava u JEDNOJ transakciji - ako upis padne, podatak se ne vraća.
 *
 * Strogo `admin`. Moderator do ovoga ne dolazi ni klikom ni pozivom.
 *
 * Za razliku od galerijske kartice, ovde se potpisuje CEO spisak ulaza, ne
 * prva četiri: ovo je jedan posao na zahtev, ne mreža od dvanaest kartica.
 */
export const revealJobDetail = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const actorId = await requireStudioAdmin(ctx);

    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Posao nije pronađen.");

    const inputs = parseJobInputs(job.inputs);
    const thumbs: Array<{ slot: string; storageId: string; url: string | null }> = [];
    for (const [slot, ids] of Object.entries(inputs)) {
      for (const storageId of ids) {
        thumbs.push({
          slot,
          storageId,
          url: await ctx.storage.getUrl(storageId as Id<"_storage">),
        });
      }
    }

    await ctx.db.insert("studioAuditLog", {
      actorId,
      jobId: args.jobId,
      ownerId: job.userId,
      revealed: thumbs.length > 0 ? ["params", "inputs"] : ["params"],
      createdAt: Date.now(),
    });

    return {
      params: job.params,
      inputMode: job.inputMode,
      inputThumbs: { items: thumbs, total: thumbs.length },
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
 * Uz URL ide i DOZVOLA (X5, nalaz N3): jedan red u `studioUploadGrants`, čiji
 * `_id` klijent vraća nazad kroz `registerInputUpload`. Convex `storageId` ne
 * postoji pre uploada, pa se dozvola ne može vezati za fajl - vezuje se za ovaj
 * poziv, i bez nje se nijedan tuđi `_storage` ID ne može prijaviti kao svoj.
 *
 * Slot, tip i veličinu proverava `<DropSlot>` PRE poziva; slot ipak ide i ovde,
 * jer ga od sada `registerInputUpload` čita iz dozvole umesto sa klijenta.
 */
export const createInputUploadUrl = mutation({
  args: { slot: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const now = Date.now();
    const grantId = await ctx.db.insert("studioUploadGrants", {
      userId,
      slot: args.slot,
      createdAt: now,
      expiresAt: now + UPLOAD_GRANT_TTL_MS,
    });

    return { uploadUrl: await ctx.storage.generateUploadUrl(), grantId };
  },
});

/**
 * Prijava okačenog fajla (nalaz R4, pooštreno u X5 zbog N3). Klijent je zove
 * ČIM upload prođe, i tek ovaj red daje `createJob`-u pravo da taj `storageId`
 * primi.
 *
 * Prima se ISKLJUČIVO `storageId` uz neiskorišćenu, neisteklu dozvolu tog
 * korisnika, i to fajl koji je nastao POSLE nje; dozvola se odmah troši. Bez
 * toga je jedina odbrana bila nepogodivost ID-ja, a `_storage` je zajednički
 * imenski prostor - naslovna slika kursa je isto tako `_storage` ID.
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
  args: { storageId: v.id("_storage"), grantId: v.id("studioUploadGrants") },
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
      // vlasništvo prepiše. Dozvola se ovde namerno ne traži: ponovljeni poziv
      // nosi istu, već potrošenu dozvolu, a red je ionako već napravljen.
      if (existing.userId !== userId) throw new Error("TUDJI_FAJL");

      return null;
    }

    const now = Date.now();
    const grant = await ctx.db.get(args.grantId);
    if (!grant || grant.userId !== userId || grant.usedAt !== undefined || grant.expiresAt <= now) {
      throw new Error("NEDOZVOLJEN_UPLOAD");
    }
    // Dozvola ne zna svoj `storageId` - Convex ga ne daje pre uploada - pa se
    // veza pravi preko vremena: fajl koji je postojao pre nego što je dozvola
    // izdata nije nastao iz nje. Bez ovoga bi jedna sveže izdata dozvola i
    // dalje mogla da prisvoji bilo koji zatečen `_storage` ID.
    if (meta._creationTime < grant.createdAt - UPLOAD_GRANT_CLOCK_SLACK_MS) {
      throw new Error("NEDOZVOLJEN_UPLOAD");
    }
    await ctx.db.patch(grant._id, { usedAt: now });

    await ctx.db.insert("studioUploads", {
      userId,
      storageId: args.storageId,
      slot: grant.slot,
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
  // `now` dolazi iz akcije: prozor rate limita je vreme, a query se ne pokreće
  // ponovo samo zato što je sat odmakao (Convex guidelines).
  args: { storageId: v.id("_storage"), now: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const upload = await ctx.db
      .query("studioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!upload || upload.userId !== userId) return null;

    // Isti obrazac kao rate limiti u `chatCore.ts`: prozor preko indeksa,
    // `take` odmah iznad granice, pa se nikad ne pročita više od 30 redova.
    const recent = await ctx.db
      .query("studioUploads")
      .withIndex("by_user", (q) =>
        q.eq("userId", userId).gte("createdAt", args.now - MEASURE_RATE_WINDOW_MS),
      )
      .take(MEASURE_UPLOAD_HOURLY_LIMIT);

    return {
      uploadId: upload._id,
      bytes: upload.bytes,
      durationS: upload.durationS,
      measureBlocked: isMeasureBlocked(upload.measureFailures, recent.length),
    };
  },
});

/**
 * Izmereno trajanje se upisuje JEDNOM i ne prepisuje se: fajl u Convex
 * storage-u je nepromenljiv, pa drugo merenje istog `storageId`-ja ne može da
 * da drugi broj - a ponovljeni poziv akcije (mreža, dva slota nad istim fajlom)
 * sme da se desi.
 *
 * Uspeh briše brojač neuspeha (X5): od upisanog `durationS`-a akcija kratko
 * spaja svaki naredni poziv, pa brojač više nema šta da čuva.
 */
export const setUploadDuration = internalMutation({
  args: { uploadId: v.id("studioUploads"), seconds: v.number() },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.durationS !== undefined) return null;
    await ctx.db.patch(args.uploadId, { durationS: args.seconds, measureFailures: undefined });

    return null;
  },
});

/**
 * Jedno neuspelo čitanje zaglavlja (X5, nalaz N4). Brojač raste samo kad su
 * bajtovi stvarno povučeni - tuđi fajl i fajl kojeg u storage-u nema ne troše
 * pokušaj, jer ni ne dođu do `fetch`-a.
 */
export const recordMeasureFailure = internalMutation({
  args: { uploadId: v.id("studioUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) return null;
    await ctx.db.patch(args.uploadId, { measureFailures: (upload.measureFailures ?? 0) + 1 });

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
      // Dugme "Prikaži detalje" na tuđoj kartici (X4). Isto samo prikaz -
      // `revealJobDetail` traži strogo `admin`, na serveru.
      isStudioAdmin: role === "admin",
      activeJobs: reserved.length + running.length,
      maxActiveJobs: MAX_ACTIVE_JOBS,
    };
  },
});
