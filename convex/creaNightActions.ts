"use node";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction } from "./_generated/server";
import { fromBase64 } from "../lib/google-image";
import { googleHttpErrorMessage, readGoogleConfig } from "../lib/google-video";
import { isRetriableProviderError } from "./creaFallbackCore";
import {
  buildGeminiBatchLine,
  buildOpenAiBatchLine,
  createLineSplitter,
  geminiBatchUrls,
  NIGHT_ERRORS,
  NIGHT_INGEST_GRACE_MS,
  type NightBatchStatus,
  type NightInputFile,
  type NightProvider,
  type NightResultLine,
  parseGeminiResultLine,
  parseOpenAiResultLine,
  readGeminiBatchName,
  readGeminiBatchStatus,
  readGeminiFileName,
  readOpenAiBatchStatus,
} from "./creaNightCore";
import { toBase64 } from "./providers/googleCore";
import { parseJobInputs } from "./providers/jobInputs";
import { parseParams } from "./studioCore";

/**
 * Noćna tura (Crea K08, C2) - mreža. Dve akcije koje zove cron (`crons.ts`):
 * predaja na 30 minuta (K06-5) i praćenje na 10. Upisi su u `creaNight.ts`.
 *
 * Node runtime (512 MB) zato što se ulazne slike šalju ugrađene u JSONL, a
 * rezultat sa stotinu slika se čita kao tok, red po red (`createLineSplitter`).
 * Nijedan test ne zove pravu mrežu - `fetch` je u testovima uvek lažan.
 */

const OPENAI_BASE_URL = "https://api.openai.com/v1";

/** Isto kao dnevni Google put (`providers/google.ts`): ulaz preko ovoga Google odbija posle naplate. */
const MAX_INPUT_FILES = 10;
const MAX_INLINE_BYTES = 15 * 1024 * 1024;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `fetch` sa porukom greške koju razume `isRetriableProviderError`: status u
 * zagradi. Pad same mreže (DNS, prekinuta veza) je prolazan kao 503.
 */
async function call(provider: NightProvider, url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(`${provider === "google" ? "Google" : "OpenAI"} nije dostupan (503): ${messageOf(error)}`);
  }
  if (response.ok) return response;
  const body = await response.text().catch(() => "");
  throw new Error(
    provider === "google"
      ? googleHttpErrorMessage(response.status, body)
      : `OpenAI API nije uspeo (${response.status}): ${body.slice(0, 300)}`,
  );
}

function openAiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY nije postavljen.");

  return key;
}

function openAiId(payload: unknown): string {
  const id = payload && typeof payload === "object" ? (payload as Record<string, unknown>).id : null;
  if (typeof id !== "string" || id.length === 0) throw new Error("OpenAI nije vratio id.");

  return id;
}

// ── Predaja ────────────────────────────────────────────────────────────────────

/**
 * Ulazne slike jednog posla iz Convex storage-a, ugrađene (base64). Nestao fajl
 * (obrisan izvor, istekao rok) obara posao uz povraćaj (K30, nalaz K29-07) -
 * inače bi se platila izmena koja je stigla do modela bez slike.
 */
async function loadImages(ctx: ActionCtx, rawInputs: string | null): Promise<NightInputFile[]> {
  const files: NightInputFile[] = [];
  for (const storageId of (parseJobInputs(rawInputs ?? undefined).image ?? []).slice(0, MAX_INPUT_FILES)) {
    const blob = await ctx.storage.get(storageId as Id<"_storage">);
    if (!blob) throw new Error(NIGHT_ERRORS.input);
    if (blob.size > MAX_INLINE_BYTES) {
      throw new Error(`FAJL_JE_PREVELIK: Google prima ulaz do ${MAX_INLINE_BYTES / (1024 * 1024)} MB po fajlu.`);
    }
    files.push({ mimeType: blob.type || "image/png", base64: toBase64(new Uint8Array(await blob.arrayBuffer())) });
  }

  return files;
}

async function submitGemini(batchId: Id<"creaBatches">, model: string, jsonl: Blob) {
  const config = readGoogleConfig(process.env);
  const urls = geminiBatchUrls(config.baseUrl);

  // Resumable upload u File API, pa batch nad tim fajlom (https://ai.google.dev/gemini-api/docs/batch-mode).
  const start = await call("google", urls.upload, {
    method: "POST",
    headers: {
      "x-goog-api-key": config.apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(jsonl.size),
      "X-Goog-Upload-Header-Content-Type": "application/jsonl",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: `crea-${batchId}` } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Google nije vratio adresu za slanje fajla.");

  const uploaded = await call("google", uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: jsonl,
  });
  const inputFileName = readGeminiFileName(await uploaded.json());
  if (!inputFileName) throw new Error("Google nije vratio ime fajla.");

  const created = await call("google", urls.create(model), {
    method: "POST",
    headers: { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ batch: { display_name: `crea-${batchId}`, input_config: { file_name: inputFileName } } }),
  });
  const providerBatchId = readGeminiBatchName(await created.json());
  if (!providerBatchId) throw new Error("Google nije vratio ime batch-a.");

  return { providerBatchId, inputFileName };
}

async function submitOpenAi(batchId: Id<"creaBatches">, jsonl: Blob) {
  const key = openAiKey();
  const form = new FormData();
  form.append("purpose", "batch");
  form.append("file", jsonl, `crea-${batchId}.jsonl`);
  const uploaded = await call("openai", `${OPENAI_BASE_URL}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const inputFileName = openAiId(await uploaded.json());

  const created = await call("openai", `${OPENAI_BASE_URL}/batches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input_file_id: inputFileName,
      endpoint: "/v1/images/generations",
      completion_window: "24h",
    }),
  });

  return { providerBatchId: openAiId(await created.json()), inputFileName };
}

async function cancelAtProvider(provider: NightProvider, providerBatchId: string): Promise<void> {
  if (provider === "google") {
    const config = readGoogleConfig(process.env);
    await call("google", geminiBatchUrls(config.baseUrl).cancel(providerBatchId), {
      method: "POST",
      headers: { "x-goog-api-key": config.apiKey },
    });

    return;
  }
  await call("openai", `${OPENAI_BASE_URL}/batches/${encodeURIComponent(providerBatchId)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey()}` },
  });
}

/**
 * Jedan batch: red po poslu (posao čiji red ne može da se napravi ide na refund
 * odmah), JSONL fajl, batch kod provajdera, pa `submitted`. Ako je batch u
 * međuvremenu oboren, upravo predat batch se otkazuje da ne bismo platili rad
 * koji više niko ne čeka.
 */
async function submitOne(ctx: ActionCtx, batchId: Id<"creaBatches">): Promise<void> {
  const batch = await ctx.runQuery(internal.creaNight.getBatchForSubmit, { batchId });
  if (!batch) return;

  const lines: string[] = [];
  for (const job of batch.jobs) {
    try {
      const params = parseParams(job.params) ?? {};
      lines.push(
        batch.provider === "google"
          ? buildGeminiBatchLine({
              key: job.jobId,
              params,
              inputMode: job.inputMode,
              images: job.inputMode === "text" ? [] : await loadImages(ctx, job.inputs),
            })
          : buildOpenAiBatchLine({ key: job.jobId, model: batch.providerModel, params }),
      );
    } catch (error) {
      await ctx.runMutation(internal.creaNight.failNightJob, { jobId: job.jobId, batchId, error: messageOf(error) });
    }
  }
  if (lines.length === 0) {
    await ctx.runMutation(internal.creaNight.failBatch, { batchId, state: "failed", error: NIGHT_ERRORS.empty });

    return;
  }

  const jsonl = new Blob([`${lines.join("\n")}\n`], { type: "application/jsonl" });
  const submitted =
    batch.provider === "google"
      ? await submitGemini(batchId, batch.providerModel, jsonl)
      : await submitOpenAi(batchId, jsonl);
  const accepted: boolean = await ctx.runMutation(internal.creaNight.markBatchSubmitted, { batchId, ...submitted });
  if (!accepted) await cancelAtProvider(batch.provider, submitted.providerBatchId).catch(() => undefined);
}

/**
 * Cron predaje (K06-5): preuzmi poslove koji čekaju u batch-eve i pošalji ih.
 * Prolazna greška (429/5xx/mreža) vraća poslove u red za sledeći prolaz; svaka
 * druga refundira ceo batch.
 */
export const submitNightBatches = internalAction({
  args: {},
  handler: async (ctx): Promise<{ batches: number }> => {
    const { batchIds }: { batchIds: Array<Id<"creaBatches">> } = await ctx.runMutation(
      internal.creaNight.claimNightJobs,
      {},
    );
    for (const batchId of batchIds) {
      try {
        await submitOne(ctx, batchId);
      } catch (error) {
        const message = messageOf(error);
        if (isRetriableProviderError(message)) {
          await ctx.runMutation(internal.creaNight.releaseBatch, { batchId, error: message });
        } else {
          await ctx.runMutation(internal.creaNight.failBatch, {
            batchId,
            state: "failed",
            error: `NOCNA_TURA_NIJE_PREDATA: ${message}`,
          });
        }
      }
    }

    return { batches: batchIds.length };
  },
});

// ── Praćenje i preuzimanje ─────────────────────────────────────────────────────

async function fetchStatus(provider: NightProvider, providerBatchId: string): Promise<NightBatchStatus> {
  if (provider === "google") {
    const config = readGoogleConfig(process.env);
    const response = await call("google", geminiBatchUrls(config.baseUrl).status(providerBatchId), {
      method: "GET",
      headers: { "x-goog-api-key": config.apiKey },
    });

    return readGeminiBatchStatus(await response.json());
  }
  const response = await call("openai", `${OPENAI_BASE_URL}/batches/${encodeURIComponent(providerBatchId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${openAiKey()}` },
  });

  return readOpenAiBatchStatus(await response.json());
}

async function downloadResults(provider: NightProvider, file: string): Promise<Response> {
  if (provider === "google") {
    const config = readGoogleConfig(process.env);

    return call("google", geminiBatchUrls(config.baseUrl).download(file), {
      method: "GET",
      headers: { "x-goog-api-key": config.apiKey },
    });
  }

  return call("openai", `${OPENAI_BASE_URL}/files/${encodeURIComponent(file)}/content`, {
    method: "GET",
    headers: { Authorization: `Bearer ${openAiKey()}` },
  });
}

/** Jedan red rezultata → slika u storage + `done`, ili refund tog posla. */
async function applyResultLine(ctx: ActionCtx, batchId: Id<"creaBatches">, row: NightResultLine): Promise<void> {
  const jobId = row.key as Id<"generationJobs">;
  if (!row.ok) {
    await ctx.runMutation(internal.creaNight.failNightJob, { jobId, batchId, error: row.error });

    return;
  }

  const blob = new Blob([fromBase64(row.data) as BlobPart], { type: row.mimeType });
  const storageId = await ctx.storage.store(blob);
  const stored: boolean = await ctx.runMutation(internal.creaNight.completeNightJob, {
    jobId,
    batchId,
    storageId,
    mimeType: row.mimeType,
    byteSize: blob.size,
    ...(row.usage ? { usage: row.usage } : {}),
  });
  // Posao je već upisan (ponovljeno preuzimanje) ili nije iz ovog batch-a - bajtovi bi bili siroče.
  if (!stored) await ctx.storage.delete(storageId);
}

/**
 * Preuzimanje rezultata kao tok, red po red: u memoriji je najviše jedan red
 * (jedna slika). Greška jednog reda ne obara ostale. Na kraju posao bez svog
 * reda ide na refund i batch je `ingested`.
 */
async function ingest(
  ctx: ActionCtx,
  batchId: Id<"creaBatches">,
  provider: NightProvider,
  files: readonly string[],
): Promise<void> {
  const parse = provider === "google" ? parseGeminiResultLine : parseOpenAiResultLine;
  const handle = async (line: string) => {
    const row = parse(line);
    if (!row) return;
    try {
      await applyResultLine(ctx, batchId, row);
    } catch (error) {
      console.error(`creaNight: red ${row.key} iz batch-a ${batchId} nije upisan`, error);
    }
  };

  for (const file of files) {
    const response = await downloadResults(provider, file);
    const splitter = createLineSplitter();
    const decoder = new TextDecoder();
    const reader = response.body?.getReader();
    if (!reader) {
      for (const line of splitter.push(await response.text())) await handle(line);
    } else {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of splitter.push(decoder.decode(value, { stream: true }))) await handle(line);
      }
      for (const line of splitter.push(decoder.decode())) await handle(line);
    }
    for (const line of splitter.flush()) await handle(line);
  }

  await ctx.runMutation(internal.creaNight.finishBatchIngest, { batchId });
}

type PolledBatch = {
  batchId: Id<"creaBatches">;
  provider: NightProvider;
  state: string;
  providerBatchId: string | null;
  resultFiles: string[];
  deadlineAt: number;
};

/**
 * Jedan predat batch. Gotov rezultat se preuzima i posle roka - posao je i dalje
 * `queued`, pa je isporuka ispravnija od refunda. Tek batch koji do roka nije
 * gotov se otkazuje kod provajdera i refundira (K01-12).
 */
async function pollOne(ctx: ActionCtx, batch: PolledBatch, now: number): Promise<void> {
  if (batch.state === "succeeded") {
    try {
      await ingest(ctx, batch.batchId, batch.provider, batch.resultFiles);
    } catch (error) {
      // Gotov batch čiji se rezultat ni posle roka + 6 h ne može preuzeti: ostatak
      // poslova na povraćaj, umesto da zauvek drže kredite i mesto u redu (K29-07).
      if (now < batch.deadlineAt + NIGHT_INGEST_GRACE_MS) throw error;
      await ctx.runMutation(internal.creaNight.finishBatchIngest, { batchId: batch.batchId });
    }

    return;
  }
  if (!batch.providerBatchId) return;

  let status: NightBatchStatus;
  try {
    status = await fetchStatus(batch.provider, batch.providerBatchId);
  } catch (error) {
    // Provajder ne odgovara (uklonjen ključ, nepoznato ime batch-a): rok i dalje
    // važi - ranije se proveravao tek POSLE uspešnog odgovora (K29-07).
    if (now < batch.deadlineAt) throw error;
    await cancelAtProvider(batch.provider, batch.providerBatchId).catch(() => undefined);
    await ctx.runMutation(internal.creaNight.failBatch, {
      batchId: batch.batchId,
      state: "expired",
      error: NIGHT_ERRORS.deadline,
    });

    return;
  }
  await ctx.runMutation(internal.creaNight.touchBatch, { batchId: batch.batchId });

  // OpenAI i kod isteka/otkazivanja daje delimičan izlaz - ono što je gotovo se isporučuje.
  const partial =
    batch.provider === "openai" &&
    (status.state === "expired" || status.state === "cancelled") &&
    status.resultFiles.length > 0;
  if (status.state === "succeeded" || partial) {
    const ready: boolean = await ctx.runMutation(internal.creaNight.markBatchSucceeded, {
      batchId: batch.batchId,
      resultFiles: status.resultFiles,
    });
    if (ready) await ingest(ctx, batch.batchId, batch.provider, status.resultFiles);

    return;
  }
  if (status.state === "failed" || status.state === "cancelled" || status.state === "expired") {
    await ctx.runMutation(internal.creaNight.failBatch, {
      batchId: batch.batchId,
      state: status.state === "expired" ? "expired" : "failed",
      error: `NOCNA_TURA_PALA: ${status.error ?? status.state}. Krediti su vraćeni.`,
    });

    return;
  }
  if (now >= batch.deadlineAt) {
    await cancelAtProvider(batch.provider, batch.providerBatchId).catch(() => undefined);
    await ctx.runMutation(internal.creaNight.failBatch, {
      batchId: batch.batchId,
      state: "expired",
      error: NIGHT_ERRORS.deadline,
    });
  }
}

/** Cron praćenja (10 min): zaglavljene pripreme na refund, predati batch-evi na proveru. */
export const pollNightBatches = internalAction({
  args: {},
  handler: async (ctx): Promise<{ stale: number; polled: number }> => {
    const now = Date.now();
    const { stalePreparing, active }: { stalePreparing: Array<Id<"creaBatches">>; active: PolledBatch[] } =
      await ctx.runQuery(internal.creaNight.listBatchesToPoll, { now });
    for (const batchId of stalePreparing) {
      await ctx.runMutation(internal.creaNight.failBatch, { batchId, state: "failed", error: NIGHT_ERRORS.stale });
    }
    for (const batch of active) {
      try {
        await pollOne(ctx, batch, now);
      } catch (error) {
        // Mreža ili provajder je pao - batch ostaje kako je i proba se sledeći put; rok važi.
        console.error(`creaNight: batch ${batch.batchId} nije proveren`, error);
      }
    }

    return { stale: stalePreparing.length, polled: active.length };
  },
});
