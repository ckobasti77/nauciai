import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, type ActionCtx, internalAction, internalQuery } from "./_generated/server";
import { submitToFal } from "../lib/fal";
import {
  type DurationRead,
  MEDIA_HEAD_BYTES,
  MEDIA_TAIL_BYTES,
  readMediaDuration,
} from "../lib/media-duration";
import { submitBytePlusJob } from "./providers/byteplus";
import { falInputFields, resolveEndpointTier } from "./providers/falInputs";
import { parseJobInputs } from "./providers/jobInputs";
import { submitGoogleJob } from "./providers/google";
import { googleDownloadHeaders } from "./providers/googleCore";
import {
  extractPrompt,
  MOCK_REQUEST_PREFIX,
  mockJobSucceeds,
  mockOutputDataUrl,
  parseParams,
} from "./studioCore";

export const getJobForSubmit = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.jobId);
  },
});

/** Koliko dugo "traje" mock generacija pre nego što se javi ishod. */
const MOCK_JOB_DELAY_MS = 3000;

/**
 * Predaje rezervisan posao fal.ai queue API-ju. Uspeh -> `studio.markJobRunning`.
 * Bilo koja greška (fali FAL_KEY/CONVEX_SITE_URL, fal vrati ne-2xx, mrežna
 * greška) -> `studio.failJob`, koja odmah refundira. Ne baca dalje - poziv je
 * uvek "obrađen", ili je posao `running` ili je `refunded`.
 */
export const submitJob = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    // Sve od učitavanja do fal poziva ide u JEDAN try: posao ne sme da ostane
    // zaglavljen u "reserved" (krediti već skinuti) ako bilo šta ovde padne -
    // fali model u katalogu, fali FAL_KEY, malformisan JSON, mrežna greška.
    try {
      const job = await ctx.runQuery(internal.studioActions.getJobForSubmit, { jobId: args.jobId });
      if (!job) throw new Error("Posao nije pronađen.");

      // Druga predaja istog posla (dvostruko zakazivanje, ručni poziv, budući
      // retry wrapper) platila bi fal-u dvaput na jedan naplaćen kredit, i
      // ostavila webhook prve predaje bez posla. Izlazak je bez ikakvog
      // dejstva - posao je već `running`, `done` ili refundiran.
      if (job.status !== "reserved") return null;

      // Rutiranje po provajderu (STUDIO-CATALOG-V4 sekcija 7). v4 katalog
      // (`models`) zna svog provajdera; stari `modelCatalog` je uvek fal, pa
      // model kojeg u `models` nema pada na fal put nepromenjen.
      const v4Model = await ctx.runQuery(internal.studioModels.getModelBySlug, {
        slug: job.modelSlug,
      });
      if (v4Model?.provider === "byteplus") {
        await submitBytePlusJob(ctx, args.jobId);

        return null;
      }
      if (v4Model?.provider === "google") {
        await submitGoogleJob(ctx, args.jobId);

        return null;
      }
      // fal iz v4 kataloga: ruta i ulazi dolaze iz REDA (`endpoints`,
      // `inputs`), ne iz starog `modelCatalog`-a - taj te modele i ne poznaje,
      // pa bi bez ove grane svaki od njih završio refundom.
      if (v4Model?.provider === "fal") {
        await submitFalCatalogJob(ctx, args.jobId, job, v4Model);

        return null;
      }

      const model = await ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: job.modelSlug });
      if (!model) throw new Error("Model nije pronađen u katalogu.");

      const apiKey = process.env.FAL_KEY;

      // Mock provajder (STUDIO-PLAN dan, P4): dok Jovan nema FAL_KEY, posao i
      // dalje prolazi kroz IDENTIČAN ledger put (reserved -> running ->
      // done/refunded) - samo fal poziv zamenjuje zakazana simulacija.
      // `STUDIO_MOCK=1` je izričit override za ručno testiranje i kad ključ
      // već postoji; odsustvo ključa SAMO PO SEBI je uvek dovoljno za mock.
      if (!apiKey || process.env.STUDIO_MOCK === "1") {
        await ctx.runMutation(internal.studio.markJobRunning, {
          jobId: args.jobId,
          providerRequestId: `${MOCK_REQUEST_PREFIX}${args.jobId}`,
        });
        await ctx.scheduler.runAfter(MOCK_JOB_DELAY_MS, internal.studioActions.completeMockJob, {
          jobId: args.jobId,
        });

        return null;
      }

      const siteUrl = process.env.CONVEX_SITE_URL;
      if (!siteUrl) throw new Error("CONVEX_SITE_URL nije postavljen");

      const input: Record<string, unknown> = {
        ...JSON.parse(model.defaultParams),
        ...JSON.parse(job.params),
      };

      const result = await submitToFal({
        endpoint: model.falEndpoint,
        input,
        webhookUrl: `${siteUrl}/fal/webhook`,
        apiKey,
      });

      await ctx.runMutation(internal.studio.markJobRunning, {
        jobId: args.jobId,
        providerRequestId: result.requestId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.studio.failJob, { jobId: args.jobId, error: message });
    }

    return null;
  },
});

/**
 * Predaja fal-u za model iz v4 kataloga. Isti tok kao stara grana (mock kad
 * nema ključa, `markJobRunning` na uspeh, `failJob` na grešku - hvata ga
 * `submitJob` iznad), samo se ruta i ulazi čitaju iz reda `models`.
 */
async function submitFalCatalogJob(
  ctx: ActionCtx,
  jobId: Id<"generationJobs">,
  job: Doc<"generationJobs">,
  model: Doc<"models">,
) {
  const apiKey = process.env.FAL_KEY;

  // Mock provajder (P4) važi i ovde: bez ključa posao ide kroz IDENTIČAN
  // ledger put, samo fal poziv zamenjuje zakazana simulacija.
  if (!apiKey || process.env.STUDIO_MOCK === "1") {
    await ctx.runMutation(internal.studio.markJobRunning, {
      jobId,
      providerRequestId: `${MOCK_REQUEST_PREFIX}${jobId}`,
    });
    await ctx.scheduler.runAfter(MOCK_JOB_DELAY_MS, internal.studioActions.completeMockJob, { jobId });

    return;
  }

  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) throw new Error("CONVEX_SITE_URL nije postavljen");

  const endpoints = parseParams(model.endpoints) ?? {};
  const inputMode = job.inputMode ?? Object.keys(endpoints)[0];
  const endpoint = inputMode === undefined ? undefined : endpoints[inputMode];
  if (typeof endpoint !== "string") throw new Error(`RUTA_NE_POSTOJI:${inputMode ?? "-"}`);

  const params = parseParams(job.params) ?? {};
  const capabilities = parseParams(model.capabilities) ?? {};
  const urls = await resolveFalInputUrls(ctx, job.inputs);

  const result = await submitToFal({
    endpoint: resolveEndpointTier(endpoint, params, capabilities),
    input: { ...params, ...falInputFields(inputMode ?? "", urls) },
    webhookUrl: `${siteUrl}/fal/webhook`,
    apiKey,
  });

  await ctx.runMutation(internal.studio.markJobRunning, {
    jobId,
    providerRequestId: result.requestId,
  });
}

/**
 * Ulazi žive u Convex storage-u, a fal ume da čita samo URL. Potpisuje se
 * ovde jer `ctx.storage.getUrl` postoji samo u akciji; fajl koji je u
 * medjuvremenu nestao se preskače, pa posao ide sa onim što stvarno postoji
 * umesto da padne na `null`-u u telu zahteva.
 */
async function resolveFalInputUrls(ctx: ActionCtx, rawInputs: string | undefined) {
  const inputs = parseJobInputs(rawInputs);
  const urls: Record<string, string[]> = {};

  for (const [slot, ids] of Object.entries(inputs)) {
    const resolved: string[] = [];
    for (const storageId of ids.slice(0, MAX_FAL_INPUT_URLS)) {
      const url = await ctx.storage.getUrl(storageId as Id<"_storage">);
      if (url) resolved.push(url);
    }
    if (resolved.length > 0) urls[slot] = resolved;
  }

  return urls;
}

/** Isti kap kao kod BytePlus-a: ni jedan režim u katalogu ne traži više. */
const MAX_FAL_INPUT_URLS = 10;

/**
 * Simulira fal webhook za mock posao, zakazana iz `submitJob` na
 * `MOCK_JOB_DELAY_MS`. Ishod ide kroz ISTU internu mutaciju kao pravi fal
 * webhook (`falWebhook.applyWebhookResult`) - dakle isti refund, isti
 * `persistOutput`, ista idempotencija na `job.status !== "running"`. Ovo je
 * demo PROVAJDERA, ne demo ledgera.
 */
export const completeMockJob = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.studioActions.getJobForSubmit, { jobId: args.jobId });
    if (!job || job.status !== "running" || !job.falRequestId?.startsWith(MOCK_REQUEST_PREFIX)) return null;

    if (mockJobSucceeds(args.jobId)) {
      await ctx.runMutation(internal.falWebhook.applyWebhookResult, {
        falRequestId: job.falRequestId,
        status: "OK",
        outputUrl: mockOutputDataUrl(extractPrompt(parseParams(job.params) ?? {}), job.promptHash),
      });
    } else {
      await ctx.runMutation(internal.falWebhook.applyWebhookResult, {
        falRequestId: job.falRequestId,
        status: "ERROR",
        error: "MOCK_NEUSPEH: demo posao je namerno neuspeo (deterministički po jobId-u, ~15% poslova).",
      });
    }

    return null;
  },
});

/**
 * Skida gotov izlaz sa fal-a u Convex storage. Webhook je zakazuje čim posao
 * stigne kao uspešan, da se skidanje ne bi radilo u samom handleru - fal daje
 * 15 s na prvi pokušaj, a fal URL živi kratko: bez ovog koraka korisnik ne
 * može da dodje do onoga što je platio.
 *
 * Ceo upis radi `studio.finalizeOutput` u jednoj transakciji. Neuspeh se ne
 * refundira (videti `studio.markOutputFailed`).
 */
export const persistOutput = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.studioActions.getJobForSubmit, { jobId: args.jobId });
    // fal ponavlja isti webhook do 31 put, a webhook zakazuje ovu akciju -
    // dakle svaki ulaz posle prvog mora da izadje bez ijednog dejstva.
    if (!job || job.status !== "done" || !job.falOutputUrl || job.outputStorageId) return null;

    try {
      // Google-ov izlaz stoji na `generativelanguage.googleapis.com` i traži
      // ključ; fal i BytePlus daju potpisan URL i ne smeju da ga vide. Bez ovog
      // zaglavlja bi Google posao ostao `done` bez fajla, a plaćen je.
      const response = await fetch(job.falOutputUrl, {
        headers: googleDownloadHeaders(job.falOutputUrl, process.env.GOOGLE_AI_API_KEY),
      });
      if (!response.ok) {
        throw new Error(`fal je vratio ${response.status} pri preuzimanju izlaza.`);
      }

      const blob = await response.blob();
      const storageId = await ctx.storage.store(blob);
      const stored = await ctx.runMutation(internal.studio.finalizeOutput, {
        jobId: args.jobId,
        storageId,
        // Prazan `type` je "ne znam", a ne "prazan MIME": polje je opciono, pa
        // se ne upisuje umesto da se izmišlja.
        mimeType: blob.type || undefined,
        byteSize: blob.size,
      });
      if (!stored) await ctx.storage.delete(storageId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.studio.markOutputFailed, {
        jobId: args.jobId,
        error: `IZLAZ_NIJE_SACUVAN: ${message}`,
      });
    }

    return null;
  },
});

/**
 * Trajanje okačenog snimka, izmereno na SERVERU (W5, nalaz R3).
 *
 * Klijent je zove odmah posle `studio.registerInputUpload`-a, za audio i video
 * fajlove. Do ovog koraka je dužinu prijavljivao browser, pa je jedan poziv sa
 * `measuredQuantity: 0.1` kupovao dva sata sinhronizacije za 13 kredita. Od sada
 * `createJob` naplaćuje isključivo ono što je ovde upisano u
 * `studioUploads.durationS`, a klijentov broj služi samo da cena na dugmetu
 * stoji dok merenje ne stigne.
 *
 * Vraća ishod umesto da baca: forma prikazuje stvarno trajanje i cenu pre
 * potvrde, a fajl koji se ne može izmeriti nije neuspeo upload - samo se po
 * njemu ne može naplatiti, pa `createJob` odbija posao.
 *
 * Ponavljanje je ograničeno (X5, nalaz N4). Fajl čije se zaglavlje ne pročita
 * nikad ne dobije `durationS`, pa kratko spajanje ispod nikad ne opali - do
 * sada je svaki sledeći poziv iznova povlačio do 1 MB iz storage-a, koliko god
 * puta. Od sada tri neuspeha gase merenje tog fajla, a broj uploada u
 * poslednjem satu gasi merenje uopšte; oba javljaju `MERENJE_ODBIJENO` PRE
 * ijednog `fetch`-a.
 */
export const measureInputUpload = action({
  args: { storageId: v.id("_storage") },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; seconds: number } | { ok: false; reason: string }> => {
    const upload = await ctx.runQuery(internal.studio.getOwnedUpload, {
      storageId: args.storageId,
      now: Date.now(),
    });
    if (!upload) return { ok: false, reason: "TUDJI_FAJL" };
    // Fajl u storage-u je nepromenljiv: jednom izmeren, uvek isti broj. Drugi
    // poziv (mreža, isti fajl u dva slota) ne čita bajtove ponovo.
    if (upload.durationS !== undefined) return { ok: true, seconds: upload.durationS };
    if (upload.measureBlocked) return { ok: false, reason: "MERENJE_ODBIJENO" };

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) return { ok: false, reason: "FAJL_NE_POSTOJI" };

    const read = await readDurationOverRange(url, upload.bytes);
    if (!read.ok) {
      await ctx.runMutation(internal.studio.recordMeasureFailure, { uploadId: upload.uploadId });

      return { ok: false, reason: read.reason };
    }

    await ctx.runMutation(internal.studio.setUploadDuration, {
      uploadId: upload.uploadId,
      seconds: read.seconds,
    });

    return { ok: true, seconds: read.seconds };
  },
});

/**
 * Zaglavlje se čita opsegom, ne celim fajlom: video sme da bude 200 MB, a
 * trajanje stoji u prvih (ili poslednjih) pola megabajta.
 *
 * `moov` atom MP4 fajla je na početku samo kad je fajl prošao kroz
 * `-movflags faststart`; izlaz telefona i kamere ga nosi na kraju. Zato se
 * posle neuspelog čitanja početka - i samo za MP4 - proba i rep.
 */
async function readDurationOverRange(url: string, totalBytes: number): Promise<DurationRead> {
  const head = await readRange(url, 0, Math.min(MEDIA_HEAD_BYTES, totalBytes));
  if (!head) return { ok: false, format: null, reason: "ZAGLAVLJE_NIJE_PROCITANO" };

  const fromHead = readMediaDuration(head, totalBytes);
  if (fromHead.ok || fromHead.format !== "mp4" || totalBytes <= MEDIA_HEAD_BYTES) return fromHead;

  const length = Math.min(MEDIA_TAIL_BYTES, totalBytes);
  const tail = await readRange(url, totalBytes - length, length);
  if (!tail) return fromHead;
  const fromTail = readMediaDuration(tail, totalBytes);

  return fromTail.ok ? fromTail : fromHead;
}

/**
 * Jedan `Range` zahtev. Prihvata se ISKLJUČIVO 206: status 200 znači da opseg
 * nije ispoštovan i da telo nosi ceo fajl, pa bi ga `arrayBuffer()` uvukao u
 * memoriju akcije ceo. Neizmeren fajl je odbijen posao, što je ispravan ishod;
 * 200 MB u memoriji nije.
 *
 * Mrežna greška se hvata ovde, a ne pušta iz akcije: fajl JESTE okačen, pa
 * upload ne sme da se prikaže kao neuspeo zato što merenje nije prošlo.
 */
async function readRange(url: string, start: number, length: number): Promise<Uint8Array | null> {
  if (length <= 0) return null;

  try {
    const response = await fetch(url, {
      headers: { Range: `bytes=${start}-${start + length - 1}` },
    });
    if (response.status !== 206) return null;

    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}
