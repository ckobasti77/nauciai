import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  type ActionCtx,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import {
  createBytePlusVideoTask,
  fetchBytePlusVideoTask,
  generateBytePlusImage,
  readBytePlusConfig,
} from "../../lib/byteplus";
import {
  buildImageRequestBody,
  buildVideoContent,
  type BytePlusVideoInputs,
  bytePlusErrorMessage,
  challengeResponseBody,
  parseCallbackBody,
} from "./bytePlusCore";
import { parseJobInputs } from "./jobInputs";
import { recordProviderCost, tokenUsageValidator } from "../studioActualCost";
import { parseParams } from "../studioCore";
import { type ModeSpec, parseInputSpec } from "../studioJobCore";

/**
 * BytePlus provajder (STUDIO-CATALOG-V4 2.6, 3.4, 3.5). Seedream 5 Pro,
 * Seedance 2.0 i Seedance 2.5 idu direktno na BytePlus, a ne preko fal-a, jer
 * fal na Seedream-u uzima 1,50x a na Seedance-u TAČNO DUPLO.
 *
 * Dva toka, po vrsti modela:
 * - slika: sinhrono, posao ide `reserved` -> `done` u istoj akciji;
 * - video: asinhrono sa `callback_url`, posao ide `reserved` -> `running`, a
 *   ishod donosi callback - koji se NE uzima zdravo za gotovo (videti
 *   `bytePlusCore.ts` i `verifyAndApplyTask` niže).
 */

/**
 * Rezervna gornja granica ako model/režim nema svoj `inputSpec` unos (ne bi
 * trebalo da se desi - `sanitizeJobInputs` je već odbio posao sa više fajlova
 * nego što slot dozvoljava). Stvarna granica dole dolazi iz `inputSpec.max`
 * TOG modela i TOG slota (nalaz S1: `seedance-25` prima do 50 referenci, a
 * ovde je stajala fiksna granica od 10 za sve modele i slotove).
 */
const MAX_INPUT_URLS_FALLBACK = 10;

/**
 * Obična funkcija, ne `internalAction`: zove je `studioActions.submitJob`, koja
 * je i sama akcija u istom runtime-u, a `ctx.runAction` izmedju dve V8 akcije je
 * suvišan skok (guidelines.md, "Function calling").
 *
 * Greške hvata sama i pretvara ih u `failJob` - dakle poziv je uvek "obradjen",
 * ili je posao predat ili je refundiran.
 */
export async function submitBytePlusJob(ctx: ActionCtx, jobId: Id<"generationJobs">): Promise<void> {
  // Isti obrazac kao `studioActions.submitJob`: sve od učitavanja do poziva u
  // JEDAN try, da posao nikad ne ostane u `reserved` sa skinutim kreditima.
  try {
    const job = await ctx.runQuery(internal.studioActions.getJobForSubmit, { jobId });
    if (!job) throw new Error("Posao nije pronađen.");
    // Druga predaja istog posla platila bi BytePlus-u dvaput na jedan
    // naplaćen kredit. Izlazak je bez ijednog dejstva.
    if (job.status !== "reserved") return;

    const model = await ctx.runQuery(internal.studioModels.getModelBySlug, {
      slug: job.modelSlug,
    });
    if (!model) throw new Error("Model nije pronađen u katalogu.");

    const inputMode = job.inputMode ?? "text";
    const endpoints = parseParams(model.endpoints) ?? {};
    const providerModel = endpoints[inputMode];
    if (typeof providerModel !== "string" || providerModel.length === 0) {
      throw new Error(`NEDOZVOLJEN_REZIM:${inputMode}`);
    }

    const config = readBytePlusConfig(process.env);
    const params = parseParams(job.params) ?? {};
    const modeSpec = parseInputSpec(model.inputSpec)[inputMode] ?? {};
    const inputs = await resolveInputUrls(ctx, job.inputs, modeSpec);

    if (model.kind === "image") {
      const result = await generateBytePlusImage({
        config,
        model: providerModel,
        input: buildImageRequestBody(params, inputs.images),
      });
      // Sinhrono: posao NIKAD ne ulazi u `running`, jer nema šta da se čeka.
      await ctx.runMutation(internal.studio.markJobDone, {
        jobId,
        outputUrl: result.url,
      });
      // Trošak je zaseban upis, a ne argument `markJobDone`-a: `markJobDone`
      // sme da izađe bez dejstva (druga predaja istog posla), a upis stvarnog
      // troška ima svoju idempotenciju i svoj zbir po modelu. Isti poziv
      // zakazuje i poravnanje (X2).
      await ctx.runMutation(internal.studioActualCost.recordProviderUsage, {
        jobId,
        ...(result.usage ? { usage: result.usage } : {}),
        ...(result.sample !== null ? { sample: result.sample } : {}),
      });

      return;
    }

    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("CONVEX_SITE_URL nije postavljen");

    const task = await createBytePlusVideoTask({
      config,
      model: providerModel,
      content: buildVideoContent(params, inputs),
      callbackUrl: `${siteUrl}/byteplus/webhook`,
    });
    await ctx.runMutation(internal.studio.markJobRunning, {
      jobId,
      providerRequestId: task.taskId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.runMutation(internal.studio.failJob, { jobId, error: message });
  }
}

/**
 * Ulazi žive u Convex storage-u, a BytePlus ume da čita samo URL. Potpisan URL
 * se pravi ovde jer `ctx.storage.getUrl` postoji samo u akciji, a ne u čistoj
 * funkciji. Fajl kojem je istekla retencija vrati `null` i tiho ispada - posao
 * tada ide sa manje referenci umesto da pukne.
 *
 * Slotovi se broje ODVOJENO, a ne u jedan zajednički limit: u `reference`
 * režimu video je taj koji obara tarifu na 0,6 (katalog 3.4), pa ne sme da
 * ispadne zato što je korisnik pre njega okačio deset slika.
 */
async function resolveInputUrls(
  ctx: ActionCtx,
  rawInputs: string | undefined,
  modeSpec: ModeSpec,
): Promise<BytePlusVideoInputs> {
  const inputs = parseJobInputs(rawInputs);

  const urlsFor = async (slot: string): Promise<string[]> => {
    const max = modeSpec[slot]?.max ?? MAX_INPUT_URLS_FALLBACK;
    const urls: string[] = [];
    for (const storageId of (inputs[slot] ?? []).slice(0, max)) {
      const url = await ctx.storage.getUrl(storageId as Id<"_storage">);
      if (url) urls.push(url);
    }

    return urls;
  };

  return { images: await urlsFor("image"), videos: await urlsFor("video") };
}

/**
 * `/byteplus/webhook`. Dve vrste zahteva stižu na istu putanju:
 *
 * 1. VERIFIKACIJA PUTANJE, jednom, pri podešavanju u BytePlus konzoli: telo
 *    nosi `challenge` koji se vraća NEPROMENJEN u roku od 3 sekunde. Zato se
 *    odgovara pre ijednog čitanja baze i pre ijednog mrežnog poziva.
 *
 * 2. PROMENA STATUSA posla. Te poruke **nisu potpisane** - BytePlus ne šalje ni
 *    HMAC ni JWKS potpis kakav šalje fal. Zato se telu ne veruje: iz njega se
 *    uzima SAMO ID zadatka, pa se zadatak pita ponovo na task endpointu, i tek
 *    taj odgovor menja posao. Ko god zna našu putanju može da pošalje
 *    `{"status":"succeeded"}`; bez ponovnog upita bismo mu poverovali.
 *
 * Uvek 200: BytePlus ponavlja callback na ne-2xx, a ponavljanje ovde ne donosi
 * ništa novo - ako posla nema ili je već završen, neće ga biti ni sledeći put.
 */
export const handleBytePlusWebhook = httpAction(async (ctx, request) => {
  const callback = parseCallbackBody(await request.text());

  if (callback.kind === "challenge") {
    return new Response(challengeResponseBody(callback.challenge), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (callback.kind === "task") {
    // Provera ide u zakazanu akciju, ne u handler: task endpoint je mrežni
    // poziv, a odgovor na callback mora da bude odmah.
    await ctx.scheduler.runAfter(0, internal.providers.byteplus.verifyAndApplyTask, {
      providerRequestId: callback.taskId,
    });
  } else {
    console.error("BytePlus callback: nepoznat oblik tela");
  }

  return new Response(null, { status: 200 });
});

/**
 * Pita BytePlus šta se stvarno desilo sa zadatkom, pa tek onda menja posao.
 * Zadatak koji je još u redu ili u obradi ne radi ništa - stići će nov callback
 * na sledeću promenu statusa, a i da ne stigne, posao pokriva reaper
 * (`crons.reapStuckJobs`).
 */
export const verifyAndApplyTask = internalAction({
  args: { providerRequestId: v.string() },
  handler: async (ctx, args) => {
    // Poziv na task endpoint ide TEK kad znamo da zadatak pripada našem poslu
    // koji je još u letu. Callback nije potpisan, pa bi bez ove provere bilo ko
    // sa našom putanjom mogao da nas natera da zovemo BytePlus proizvoljan broj
    // puta sa proizvoljnim ID-jevima - na naš rate limit i naš nalog.
    //
    // Cena provere je zanemarljiv rizik: callback koji pretekne našu
    // `markJobRunning` mutaciju ispadne, ali posao tada pokupi sledeći callback
    // (BytePlus javlja svaku promenu statusa), a u najgorem slučaju reaper.
    const pending = await ctx.runQuery(internal.providers.byteplus.isTaskPending, {
      providerRequestId: args.providerRequestId,
    });
    if (!pending) return null;

    const config = readBytePlusConfig(process.env);
    const task = await fetchBytePlusVideoTask({ config, taskId: args.providerRequestId });

    if (task.status === "succeeded" && task.videoUrl) {
      await ctx.runMutation(internal.providers.byteplus.applyTaskResult, {
        providerRequestId: args.providerRequestId,
        status: "OK",
        outputUrl: task.videoUrl,
        ...(task.usage ? { usage: task.usage } : {}),
        ...(task.seconds !== null ? { reportedSeconds: task.seconds } : {}),
        ...(task.sample !== null ? { sample: task.sample } : {}),
      });

      return null;
    }

    if (task.status === "failed" || task.status === "cancelled") {
      await ctx.runMutation(internal.providers.byteplus.applyTaskResult, {
        providerRequestId: args.providerRequestId,
        status: "ERROR",
        error: bytePlusErrorMessage(task.error),
      });

      return null;
    }

    // `succeeded` bez URL-a je isto što i nedovršen posao: nemamo šta da
    // sačuvamo, a refund bi bio pogrešan jer je generacija možda naplaćena.
    return null;
  },
});

/**
 * Postoji li posao u `running`-u za ovaj zadatak. Odvojen upit, a ne deo
 * `applyTaskResult`-a, jer se čita PRE mrežnog poziva.
 */
export const isTaskPending = internalQuery({
  args: { providerRequestId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("generationJobs")
      .withIndex("by_provider_request", (q) => q.eq("providerRequestId", args.providerRequestId))
      .unique();

    return job?.status === "running";
  },
});

/**
 * Jedini upis koji BytePlus tok radi posle predaje. Interna je namerno: zove je
 * samo `verifyAndApplyTask`, POSLE ponovnog upita na task endpoint.
 *
 * Idempotencija stoji na `job.status !== "running"`, isto kao kod fal-a:
 * BytePlus šalje callback na SVAKU promenu statusa i ponavlja na ne-2xx, pa
 * prvi poziv posao izvede iz `running` (u `done` ili `refunded`) i svaki
 * sledeći izadje odmah. Refund je i sam idempotentan preko `by_job_type`
 * indeksa u `credits.refundCredits` - dva sloja.
 */
export const applyTaskResult = internalMutation({
  args: {
    providerRequestId: v.string(),
    status: v.union(v.literal("OK"), v.literal("ERROR")),
    outputUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    // Potrošeni tokeni zadatka (W6) - BytePlus ne vraća cenu, pa je ovo jedini
    // podatak iz kojeg se stvaran trošak uopšte može izračunati.
    usage: v.optional(tokenUsageValidator),
    // Stvarno trajanje klipa, kad ga zadatak javi (X2) - ulaz u poravnanje, a za
    // Seedance (naplata po sekundi izlaza) i jedini izvor stvarnog troska (X3).
    reportedSeconds: v.optional(v.number()),
    // Sirov odgovor, samo kad iz njega nije procitano ni jedno ni drugo (X3).
    sample: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("generationJobs")
      .withIndex("by_provider_request", (q) => q.eq("providerRequestId", args.providerRequestId))
      .unique();
    // Nije naš zadatak (tudji nalog, obrisan posao, lažan callback) - ništa se
    // ne menja i niko se ne obaveštava.
    if (!job) return null;
    if (job.status !== "running") return null;

    if (args.status === "ERROR") {
      // `studio.failJob` radi ceo neuspeh: failed -> refund -> refunded.
      await ctx.runMutation(internal.studio.failJob, {
        jobId: job._id,
        error: args.error ?? "BytePlus je vratio grešku bez opisa.",
      });

      return null;
    }

    await ctx.db.patch(job._id, {
      status: "done",
      falOutputUrl: args.outputUrl,
      completedAt: Date.now(),
    });
    // Ista transakcija u kojoj se posao zatvara: zadatak se posle ovoga više ne
    // pita, pa drugog trenutka za merenje troška nema. Kad troška nema, izlazi
    // RAZLOG umesto praznog polja (X3).
    await recordProviderCost(ctx, job, {
      ...(args.usage !== undefined ? { usage: args.usage } : {}),
      ...(args.reportedSeconds !== undefined ? { reportedSeconds: args.reportedSeconds } : {}),
      ...(args.sample !== undefined ? { sample: args.sample } : {}),
    });
    await ctx.scheduler.runAfter(0, internal.studioActions.persistOutput, { jobId: job._id });
    // Poravnanje (X2) se ZAKAZUJE: naplata razlike ne sme da povuče već zatvoren
    // posao sa sobom ako pukne.
    await ctx.scheduler.runAfter(0, internal.studio.settleJobCredits, {
      jobId: job._id,
      ...(args.reportedSeconds !== undefined ? { reportedSeconds: args.reportedSeconds } : {}),
    });

    return null;
  },
});
