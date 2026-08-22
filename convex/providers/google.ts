import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import {
  fetchGoogleOperation,
  type GoogleConfig,
  readGoogleConfig,
  startGoogleOperation,
} from "../../lib/google-video";
import {
  fromBase64,
  runGoogleInteraction,
} from "../../lib/google-image";
import {
  bareInteractionId,
  buildGoogleImageRequest,
  buildOmniRequest,
  buildVeoRequest,
  type GoogleInputFile,
  type GoogleInputs,
  omniInputRestriction,
  toBase64,
} from "./googleCore";
import { parseJobInputs } from "./jobInputs";
import { recordProviderCost, tokenUsageValidator } from "../studioActualCost";
import { parseParams } from "../studioCore";

/**
 * Google video provajder (STUDIO-CATALOG-V4 3.7 i 3.8): Veo 3.1 **Fast** i
 * Gemini Omni Flash. Veo Lite i Standard su parity i ostaju na fal-u - Veo je
 * jedini model u katalogu gde tarifa menja provajdera, pa su to tri odvojena
 * reda u `models`, a ne jedan sa parametrom.
 *
 * **Ovo je jedini tok bez webhooka u celom Studiju.** Google za video nema
 * `callback_url` (BytePlus) ni potpisan webhook (fal) - vraća operaciju koja se
 * ispituje. Posao ide `reserved` -> `running`, a `pollGoogleVideoJobs` (cron na
 * 1 minut, Convex minimum) ga izvodi u `done` ili `refunded`.
 *
 * Postojeći `crons.reapStuckJobs` ostaje mreža ispod pollera: ako poller padne,
 * zamukne ili promaši oblik odgovora, posao se posle 30 minuta refundira sam.
 */

/** Koliko ulaznih fajlova PO SLOTU ide provajderu; iznad toga se seče. */
const MAX_INPUT_FILES = 10;

/**
 * Google prima ulaze ugradjene u telo zahteva (base64), pa veliki fajl ne pukne
 * kod nas nego kod njih - i to posle rezervacije kredita. Granica je zato ovde,
 * pre mreže, sa porukom koja kaže šta da se uradi.
 */
const MAX_INLINE_BYTES = 15 * 1024 * 1024;

/** MIME koji Convex storage nije zapamtio; Google ga traži uz svaki ulaz. */
const FALLBACK_MIME: Record<string, string> = { image: "image/png", video: "video/mp4" };

/**
 * Obična funkcija, ne `internalAction` - isti razlog kao kod BytePlus-a: zove je
 * `studioActions.submitJob`, koja je i sama akcija u istom runtime-u.
 *
 * Greške hvata sama i pretvara ih u `failJob`, pa je poziv uvek obradjen: posao
 * je ili `running` ili refundiran. Nikad ne ostaje `reserved` sa skinutim
 * kreditima.
 */
export async function submitGoogleJob(ctx: ActionCtx, jobId: Id<"generationJobs">): Promise<void> {
  try {
    const job = await ctx.runQuery(internal.studioActions.getJobForSubmit, { jobId });
    if (!job) throw new Error("Posao nije pronađen.");
    // Druga predaja istog posla platila bi Google-u dvaput na jedan naplaćen
    // kredit. Izlazak je bez ijednog dejstva.
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

    const config = readGoogleConfig(process.env);
    const params = parseParams(job.params) ?? {};
    const inputs = await resolveInputs(ctx, job.inputs);
    const capabilities = parseParams(model.capabilities) ?? {};

    // Koji Google API vozi ovaj red pise u samom redu (`capabilities.api`), a ne
    // u `if (slug === ...)`.
    //
    // **Interactions API je SINHRON** - i za sliku (Nano Banana) i za video
    // (Gemini Omni): odgovor istog poziva nosi bajtove, pa posao ide
    // `reserved` -> `done` i nikad ne prolazi kroz `running` ni kroz poller.
    // Veo ide na `predictLongRunning`, koji vraca operaciju koju poller ispituje.
    if (capabilities.api === "interactions") {
      await runGoogleSyncJob(ctx, jobId, {
        config,
        providerModel,
        params,
        inputs,
        inputMode,
        kind: model.kind,
      });

      return;
    }

    const operation = await startVeo(config, providerModel, params, inputs, inputMode);

    await ctx.runMutation(internal.studio.markJobRunning, {
      jobId,
      providerRequestId: operation.operationPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.runMutation(internal.studio.failJob, { jobId, error: message });
  }
}

/**
 * Ceo tok jednog SINHRONOG Google posla, u JEDNOM pozivu: Nano Banana (slika,
 * katalog 2.1 i 2.2) i Gemini Omni (video, 3.8). Isti endpoint
 * (`POST /interactions`), isti oblik odgovora - razlikuje se samo telo zahteva.
 *
 * Redosled je namerno ovakav:
 * 1. poziv Google-u - ako pukne, `submitGoogleJob` ga hvata i refundira;
 * 2. bajtovi u Convex storage - fajl postoji PRE nego sto je posao `done`, pa
 *    ne moze da postoji `done` posao bez izlaza;
 * 3. jedna mutacija zatvara posao, upise trosak i zakaze poravnanje.
 *
 * Ako treci korak ne uspe da zaveze fajl za posao (druga predaja istog posla),
 * bajtovi se brisu - inace bi storage rastao na svaki ponovljeni poziv.
 */
async function runGoogleSyncJob(
  ctx: ActionCtx,
  jobId: Id<"generationJobs">,
  args: {
    config: GoogleConfig;
    providerModel: string;
    params: Record<string, unknown>;
    inputs: GoogleInputs;
    inputMode: string;
    kind: string;
  },
): Promise<void> {
  const { config, providerModel, params, inputs, inputMode, kind } = args;
  const isVideo = kind === "video";

  if (isVideo) {
    // Tri ogranicenja Omnija (katalog 3.8) su poruka, ne tiha greska - i
    // proveravaju se PRE mreze, pa se posao refundira bez ijednog poziva.
    const restriction = omniInputRestriction(inputMode, inputs);
    if (restriction) throw new Error(restriction);
  }

  // `studio.ts` je vec proverio vlasnistvo i model izvorne generacije i upisao
  // njen SIROV `providerRequestId` u `params` (nalaz S3) - oblik tog polja je
  // Google-ova stvar, pa se tumaci tek ovde.
  const rawSourceId = params.previous_interaction_id;
  const previousInteractionId =
    typeof rawSourceId === "string" ? bareInteractionId(rawSourceId) : undefined;

  const result = await runGoogleInteraction({
    config,
    body: isVideo
      ? buildOmniRequest(providerModel, params, inputs, inputMode, previousInteractionId)
      : buildGoogleImageRequest(providerModel, params, inputs, inputMode),
  });

  // Interactions API ume da vrati gresku sa HTTP 200 (`status: "failed"`), pa
  // odgovor bez bajtova NIJE uspeh - posao se refundira sa razlogom.
  if (!result.media) {
    throw new Error(
      result.error ??
        `Google je vratio odgovor bez ${isVideo ? "videa" : "slike"}. Krediti su ti vraćeni.`,
    );
  }

  const bytes = fromBase64(result.media.data);
  const storageId = await ctx.storage.store(
    new Blob([bytes as BlobPart], { type: result.media.mimeType }),
  );

  const stored = await ctx.runMutation(internal.providers.google.completeGoogleImageJob, {
    jobId,
    storageId,
    mimeType: result.media.mimeType,
    byteSize: bytes.byteLength,
    ...(result.interactionId ? { providerRequestId: `interactions/${result.interactionId}` } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.sample !== null ? { sample: result.sample } : {}),
  });
  if (!stored) await ctx.storage.delete(storageId);
}

/**
 * Zatvaranje sinhronog Google posla. Ogledalo `applyOperationResult`-a, samo bez
 * mreze: izlaz je vec u storage-u, pa nema ni `persistOutput`-a.
 *
 * Idempotencija stoji na `job.status !== "reserved"` - isto pravilo kao kod
 * `studio.markJobDone`. Druga predaja istog posla vraca `false` i njeni bajtovi
 * se brisu.
 */
export const completeGoogleImageJob = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    storageId: v.id("_storage"),
    mimeType: v.optional(v.string()),
    byteSize: v.number(),
    providerRequestId: v.optional(v.string()),
    usage: v.optional(tokenUsageValidator),
    sample: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "reserved") return false;

    await ctx.db.patch(args.jobId, {
      status: "done",
      completedAt: Date.now(),
      ...(args.providerRequestId
        ? { providerRequestId: args.providerRequestId, falRequestId: args.providerRequestId }
        : {}),
    });
    // Trosak ide u ISTU transakciju u kojoj se posao zatvara: sinhroni posao
    // vise niko ne ispituje, pa kasnije nema ko da ga izmeri.
    await recordProviderCost(ctx, job, {
      ...(args.usage !== undefined ? { usage: args.usage } : {}),
      ...(args.sample !== undefined ? { sample: args.sample } : {}),
    });

    const finalized: boolean = await ctx.runMutation(internal.studio.finalizeOutput, {
      jobId: args.jobId,
      storageId: args.storageId,
      ...(args.mimeType ? { mimeType: args.mimeType } : {}),
      byteSize: args.byteSize,
    });
    // Poravnanje se ZAKAZUJE: naplata razlike ne sme da povuce zatvoren posao
    // sa sobom ako pukne.
    await ctx.scheduler.runAfter(0, internal.studio.settleJobCredits, { jobId: args.jobId });

    return finalized;
  },
});

function startVeo(
  config: GoogleConfig,
  providerModel: string,
  params: Record<string, unknown>,
  inputs: GoogleInputs,
  inputMode: string,
) {
  return startGoogleOperation({
    config,
    path: `/models/${encodeURIComponent(providerModel)}:predictLongRunning`,
    body: buildVeoRequest(params, inputs, inputMode),
    fallbackCollection: "operations",
  });
}

/**
 * Ulazi žive u Convex storage-u, a Google ih prima ugradjene u telo zahteva
 * (base64) - za razliku od BytePlus-a, koji čita URL. Fajl kojem je istekla
 * retencija vrati `null` i tiho ispada; posao tada ide sa manje referenci
 * umesto da pukne.
 */
async function resolveInputs(
  ctx: ActionCtx,
  rawInputs: string | undefined,
): Promise<GoogleInputs> {
  const inputs = parseJobInputs(rawInputs);

  const filesFor = async (slot: string): Promise<GoogleInputFile[]> => {
    const files: GoogleInputFile[] = [];
    for (const storageId of (inputs[slot] ?? []).slice(0, MAX_INPUT_FILES)) {
      const blob = await ctx.storage.get(storageId as Id<"_storage">);
      if (!blob) continue;
      if (blob.size > MAX_INLINE_BYTES) {
        throw new Error(
          `FAJL_JE_PREVELIK: Google prima ulaz do ${Math.floor(MAX_INLINE_BYTES / (1024 * 1024))} MB po fajlu.`,
        );
      }
      files.push({
        mimeType: blob.type || FALLBACK_MIME[slot] || "application/octet-stream",
        base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
      });
    }

    return files;
  };

  return {
    image: await filesFor("image"),
    video: await filesFor("video"),
    audio: await filesFor("audio"),
  };
}

/**
 * Koliko `running` poslova se uopšte pročita u jednom prolazu. `by_status_created`
 * ide od najstarijeg, a najstariji `running` je i onaj koji je najverovatnije
 * gotov - ali kroz taj indeks prolaze i fal i BytePlus poslovi, pa se čita šire
 * nego što se ispituje.
 */
const POLL_SCAN_LIMIT = 200;

/**
 * Koliko poslova se ispita mrežnim pozivom po prolazu. Manje je od budžeta
 * ostalih cronova (100) jer je ovde svaka stavka jedan HTTPS poziv, a ne upis u
 * bazu; ostatak sačeka sledeći minut, a i to samo ako ih ikad bude toliko
 * istovremeno.
 */
const POLL_BATCH_LIMIT = 25;

/**
 * Poslovi koje treba pitati Google za stanje: `running`, sa upisanim
 * `providerRequestId`-jem, sa `provider: "google"` (nalaz W7-6).
 *
 * `by_provider_status` skenira SAMO google poslove, ne sve provajdere - stari
 * put (`by_status_created` + učitavanje modela po poslu) je čitao šire nego
 * što je ispitivao: zaostatak od 200+ fal poslova starijih od jednog google
 * posla bi ga izgurao iz prozora od `scanLimit`, a reaper bi ga posle 30
 * minuta refundirao iako je uspeo i naplaćen. Posao upisan pre ovog polja
 * (`provider === undefined`) čeka `migrations.backfillGenerationJobProvider`;
 * dotle ga i dalje pokriva reaper.
 */
export const listPollableGoogleJobs = internalQuery({
  args: { scanLimit: v.number(), batchLimit: v.number() },
  handler: async (ctx, args) => {
    const running = await ctx.db
      .query("generationJobs")
      .withIndex("by_provider_status", (q) => q.eq("provider", "google").eq("status", "running"))
      .take(args.scanLimit);

    const pollable: Array<{ jobId: Id<"generationJobs">; providerRequestId: string }> = [];
    for (const job of running) {
      if (pollable.length >= args.batchLimit) break;
      if (!job.providerRequestId) continue;
      pollable.push({ jobId: job._id, providerRequestId: job.providerRequestId });
    }

    return pollable;
  },
});

/**
 * Cron na 1 minut (Convex minimum). Jedina nova mašinerija u katalogu: Google
 * nema webhookove za video, pa je ovo jedini put kojim gotov posao stiže do
 * korisnika.
 *
 * Šta se NE radi ovde, i zašto:
 * - **Mrežna greška pri ispitivanju ne refundira.** 500 ili 429 na `GET`-u znači
 *   da ne znamo stanje, a ne da je posao propao; refund bi vratio kredite za
 *   generaciju koju Google možda i naplati. Takav posao se pokušava ponovo za
 *   minut, a ako se nikad ne razreši, refundira ga reaper posle 30 minuta.
 * - **Gotova operacija bez izlaza i bez greške se samo loguje.** Oblik odgovora
 *   nije potvrdjen protiv živog API-ja; da ovde refundiramo, jedan promašen
 *   ključ u odgovoru bi tiho vraćao kredite za uspešne generacije. Reaper je
 *   ispod i takav posao neće ostati zaglavljen.
 */
export const pollGoogleVideoJobs = internalAction({
  args: { scanLimit: v.optional(v.number()), batchLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const jobs = await ctx.runQuery(internal.providers.google.listPollableGoogleJobs, {
      scanLimit: args.scanLimit ?? POLL_SCAN_LIMIT,
      batchLimit: args.batchLimit ?? POLL_BATCH_LIMIT,
    });
    // Ključ se traži tek kad ima šta da se pita: bez Google modela u letu nema
    // ni razloga da prolaz puca svakog minuta zato što env nije postavljen.
    if (jobs.length === 0) return { polled: 0, finished: 0, failed: 0 };

    const config = readGoogleConfig(process.env);
    let polled = 0;
    let finished = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        const operation = await fetchGoogleOperation({
          config,
          operationPath: job.providerRequestId,
        });
        polled += 1;
        if (!operation.done) continue;

        if (operation.videoUrl) {
          await ctx.runMutation(internal.providers.google.applyOperationResult, {
            providerRequestId: job.providerRequestId,
            status: "OK",
            outputUrl: operation.videoUrl,
            ...(operation.usage ? { usage: operation.usage } : {}),
            ...(operation.seconds !== null ? { reportedSeconds: operation.seconds } : {}),
            ...(operation.sample !== null ? { sample: operation.sample } : {}),
          });
          finished += 1;
          continue;
        }

        if (operation.error) {
          await ctx.runMutation(internal.providers.google.applyOperationResult, {
            providerRequestId: job.providerRequestId,
            status: "ERROR",
            error: operation.error,
          });
          failed += 1;
          continue;
        }

        console.error(
          `pollGoogleVideoJobs: operacija ${job.providerRequestId} je gotova bez izlaza i bez greške`,
        );
      } catch (error) {
        console.error(`pollGoogleVideoJobs: ${job.providerRequestId} nije ispitan`, error);
      }
    }

    return { polled, finished, failed };
  },
});

/**
 * Jedini upis koji Google tok radi posle predaje. Idempotencija stoji na
 * `job.status !== "running"`, isto kao kod fal-a i BytePlus-a: dva prolaza
 * pollera nad istom gotovom operacijom menjaju posao TAČNO JEDNOM, pa i refund
 * ide tačno jednom (a `credits.refundCredits` je i sam idempotentan preko
 * `by_job_type` - dva sloja).
 */
export const applyOperationResult = internalMutation({
  args: {
    providerRequestId: v.string(),
    status: v.union(v.literal("OK"), v.literal("ERROR")),
    outputUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    // Tokeni iz `usageMetadata` - jedini podatak o STVARNOM trosku koji Google
    // uopste vraca (W6). Preracunava ih `studioActualCost.recordTokenUsage`, po
    // tarifi reda kataloga; model bez tarife ostaje bez `actualCostUsd`.
    usage: v.optional(tokenUsageValidator),
    // Stvarno trajanje klipa, kad ga operacija javi (X2) - ulaz u poravnanje, a
    // za modele koji se naplacuju po sekundi i jedini izvor stvarnog troska (X3).
    reportedSeconds: v.optional(v.number()),
    // Sirov odgovor, samo kad iz njega nije procitano ni jedno ni drugo (X3).
    sample: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("generationJobs")
      .withIndex("by_provider_request", (q) => q.eq("providerRequestId", args.providerRequestId))
      .unique();
    if (!job) return null;
    if (job.status !== "running") return null;

    if (args.status === "ERROR") {
      // `studio.failJob` radi ceo neuspeh: failed -> refund -> refunded.
      await ctx.runMutation(internal.studio.failJob, {
        jobId: job._id,
        error: args.error ?? "Google je vratio grešku bez opisa.",
      });

      return null;
    }

    await ctx.db.patch(job._id, {
      status: "done",
      falOutputUrl: args.outputUrl,
      completedAt: Date.now(),
    });
    // Trosak ide u ISTU transakciju u kojoj se posao zatvara: posao koji je
    // `done` a nema izmeren trosak ne bi imao ko kasnije da izmeri, jer Google
    // operaciju vise ne ispitujemo. Kad troska nema, izlazi RAZLOG (X3).
    await recordProviderCost(ctx, job, {
      ...(args.usage !== undefined ? { usage: args.usage } : {}),
      ...(args.reportedSeconds !== undefined ? { reportedSeconds: args.reportedSeconds } : {}),
      ...(args.sample !== undefined ? { sample: args.sample } : {}),
    });
    await ctx.scheduler.runAfter(0, internal.studioActions.persistOutput, { jobId: job._id });
    // Poravnanje (X2) se ZAKAZUJE: naplata razlike ne sme da povuce vec zatvoren
    // posao sa sobom ako pukne.
    await ctx.scheduler.runAfter(0, internal.studio.settleJobCredits, {
      jobId: job._id,
      ...(args.reportedSeconds !== undefined ? { reportedSeconds: args.reportedSeconds } : {}),
    });

    return null;
  },
});
