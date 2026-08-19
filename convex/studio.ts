import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { applySpend } from "./credits";
import { validatePrompt } from "./creditsCore";
import { requireUserId } from "./helpers";
import { applyTaskCompletion, assertLessonAccess } from "./lab";
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
  sanitizeParams,
  STUDIO_FLAG_KEY,
} from "./studioCore";

/**
 * Lokalna kopija `generationJobs.kind` unije, po istoj konvenciji koju već
 * koristi `modelCatalog.ts` - `schema.ts` je ne izvozi.
 */
const studioModelKind = v.union(v.literal("image"), v.literal("video"), v.literal("audio"));

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

    // Moderacija pre svake provere koja košta čitanje ledgera.
    const params = parseParams(args.params);
    if (!params) throw new Error("NEISPRAVNI_PARAMETRI");
    const prompt = extractPrompt(params);
    const promptCheck = validatePrompt(prompt);
    if (!promptCheck.ok) throw new Error(`NEISPRAVAN_PROMPT:${promptCheck.reason}`);

    // Model koji ne postoji i model koji je admin isključio su za korisnika
    // ista stvar: ne može se generisati na njemu.
    const model = await ctx.db
      .query("modelCatalog")
      .withIndex("by_slug", (q) => q.eq("slug", args.modelSlug))
      .unique();
    if (!model || !model.isEnabled) throw new Error("MODEL_NEDOSTUPAN");

    // Od ove tačke se radi ISKLJUČIVO sa očišćenim parametrima: i cena i ono
    // što `submitJob` pošalje fal-u moraju da izađu iz istog objekta, inače
    // naplaćujemo jedan posao a naručujemo drugi.
    const sanitized = sanitizeParams(model.paramSchema, params);
    if (!sanitized.ok) throw new Error(`NEISPRAVNI_PARAMETRI:${sanitized.reason}`);
    const cleanParams = sanitized.params;

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
    if (exceedsDailyCostLimit(usage?.costUsd ?? 0, model.estimatedCostUsd)) {
      throw new Error("DNEVNI_LIMIT_TROSKA");
    }

    const creditCost = computeCreditCost(model, cleanParams);

    // Upis posla ide PRE potrošnje jer `credits.applySpend` (A2) traži `jobId`
    // - to je ključ pod kojim se refund kasnije prepoznaje. Sve je i dalje
    // jedna transakcija: ako potrošnja pukne (NEDOVOLJNO_KREDITA), ovaj insert
    // se poništava sam, bez ručnog rollback-a.
    const jobId = await ctx.db.insert("generationJobs", {
      userId,
      modelSlug: model.slug,
      kind: model.kind,
      params: JSON.stringify(cleanParams),
      promptHash: promptHash(prompt),
      status: "reserved",
      creditCost,
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
        costUsd: usage.costUsd + model.estimatedCostUsd,
      });
    } else {
      await ctx.db.insert("studioUsageDaily", {
        userId,
        day,
        generations: 1,
        creditsSpent: creditCost,
        costUsd: model.estimatedCostUsd,
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
 */
export const markJobRunning = internalMutation({
  args: { jobId: v.id("generationJobs"), falRequestId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Posao nije pronađen.");
    if (job.status !== "reserved") throw new Error(`POSAO_NIJE_REZERVISAN:${job.status}`);
    await ctx.db.patch(args.jobId, { status: "running", falRequestId: args.falRequestId });
    return null;
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
