/**
 * Noćna tura (Crea C2, O7) i jutarnje iznenađenje (G13) - čista logika: bez
 * `ctx`, bez baze, bez mreže, bez sata. Isti fajl uvoze i Convex i browser, pa
 * cena na prekidaču i naplaćena cena idu kroz istu funkciju.
 *
 * Tok jednog posla (K01 §6.6, K06 §12):
 *   createJob(night) → `queued` (krediti već skinuti) → cron grupiše po modelu u
 *   `creaBatches` (`preparing` → `submitted`) → cron prati stanje kod provajdera →
 *   rezultat po redu: slika → `done` + poravnanje; greška → refund. Batch koji
 *   padne ili istekne, i posao stariji od 36 h, idu na refund.
 *
 * Batch API činjenice (pročitano 2026-10-05):
 * - Gemini: https://ai.google.dev/gemini-api/docs/batch-mode i
 *   https://ai.google.dev/api/batch-api - JSONL kroz File API, `batchGenerateContent`,
 *   `batches.get` vraća Operation (stanje u `metadata.state`, fajl rezultata u
 *   `response.responsesFile`), stanja `JOB_STATE_*` u vodiču, `BATCH_STATE_*` u
 *   referenci - prihvataju se oba. Posao duži od 48 h u redu Google sam ističe.
 * - `generationConfig.imageConfig { aspectRatio, imageSize }` za 3.x slike kroz
 *   `generateContent` nije na zvaničnoj strani (ona pokazuje Interactions API);
 *   oblik je iz js-genai `ImageConfig` tipa (sekundarni izvor, nepotvrđeno).
 * - OpenAI: https://developers.openai.com/api/docs/guides/batch - `/v1/images/generations`
 *   je podržan, `completion_window: "24h"`, izlaz i greške su JSONL po `custom_id`.
 */

import { resolveCreditFactor } from "./creaPricingCore";
import { GOOGLE_IMAGE_SIZES } from "./providers/googleCore";
import {
  type ActualCostOutcome,
  parseTokenRates,
  readTokenUsage,
  tokenCostOutcome,
  type TokenRates,
  type TokenUsage,
} from "./studioActualCostCore";
import { providerKeyPresent } from "./studioCore";
import { computeCostUsd, creditsFromUsd, type PriceRule } from "./studioPricing";

// ── Ponuda i cena ──────────────────────────────────────────────────────────────

export type NightProvider = "google" | "openai";

/** `capabilities.batch` reda kataloga (K06 §1). */
export type NightBatchSpec = {
  provider: NightProvider;
  /** Ime modela kod provajdera, npr. `gemini-3.1-flash-image`. */
  model: string;
  /** Batch nabavna cena kao deo dnevne (Gemini i OpenAI: 0,5). */
  discount: number;
  /**
   * Tarifa batch-a po milionu tokena kad je provajder objavljuje zasebno
   * (OpenAI). Bez nje stvaran trošak je tarifa reda × `discount`.
   */
  tokenRatesUsdPerMillion?: TokenRates;
};

export function parseNightBatch(capabilities: Record<string, unknown> | null | undefined): NightBatchSpec | null {
  const raw = capabilities?.batch;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const batch = raw as Record<string, unknown>;
  if (batch.provider !== "google" && batch.provider !== "openai") return null;
  if (typeof batch.model !== "string" || batch.model.length === 0) return null;
  if (typeof batch.discount !== "number" || !(batch.discount > 0 && batch.discount < 1)) return null;
  const rates = parseTokenRates(batch);

  return {
    provider: batch.provider,
    model: batch.model,
    discount: batch.discount,
    ...(rates ? { tokenRatesUsdPerMillion: rates } : {}),
  };
}

/** Koji ulazni režimi idu u noćnu turu. OpenAI batch ide samo iz opisa (K06 §12.3). */
export const NIGHT_INPUT_MODES: Readonly<Record<NightProvider, readonly string[]>> = {
  google: ["text", "image_multi"],
  openai: ["text"],
};

export type NightProviderStatus = Record<NightProvider, boolean>;

/**
 * Ima li provajder batch-a ključ. Google je isti ključ kao za dnevne poslove;
 * OpenAI postoji SAMO zbog noćne ture (O7) i bez `OPENAI_API_KEY` opcija se ne
 * vidi. `STUDIO_MOCK=1` gasi oba, kao i svaku drugu kapiju ključa. Vrednost
 * ključa nikad ne napušta funkciju.
 */
export function nightProviderStatus(env: Record<string, string | undefined>): NightProviderStatus {
  const openaiKey = env.OPENAI_API_KEY;

  return {
    google: providerKeyPresent("google", env),
    openai: env.STUDIO_MOCK !== "1" && typeof openaiKey === "string" && openaiKey.trim().length > 0,
  };
}

/**
 * Da li model u ovom režimu nudi noćnu turu, i preko čega. Jedina odluka - zove
 * je i server (`createJob`) i prekidač u composeru. Bez cena v2 nema noćne ture
 * (K06-4: noćna cena je nova cena, a nove cene su iza flega).
 */
export function nightOptionFor(input: {
  pricingV2: boolean;
  capabilities: Record<string, unknown> | null | undefined;
  inputMode: string;
  providers: Partial<NightProviderStatus> | undefined;
}): NightBatchSpec | null {
  if (!input.pricingV2) return null;
  const spec = parseNightBatch(input.capabilities);
  if (!spec) return null;
  if (input.providers?.[spec.provider] !== true) return null;
  if (!NIGHT_INPUT_MODES[spec.provider].includes(input.inputMode)) return null;

  return spec;
}

/** Faktor kategorije `image_batch` pod v2 (×2,0 = 173). Noćna tura postoji samo pod v2. */
export const NIGHT_CREDIT_FACTOR = resolveCreditFactor({ pricingV2: true, category: "image_batch" });

/**
 * Noćni posao je uvek JEDNA slika: batch vraća jednu po zahtevu, a posao ima jedno
 * izlazno polje (K01 0.2-5) - četiri naplaćene slike bi bile jedna isporučena.
 * `num_images` ostaje (kod GPT Image 2 je količina u ceni), ali na 1.
 */
export function nightParams(params: Record<string, unknown>): Record<string, unknown> {
  return "num_images" in params ? { ...params, num_images: 1 } : { ...params };
}

/**
 * Cena noćnog posla: dnevna nabavna cena × popust batch-a, pa faktor `image_batch`.
 * Baca kad pravilo ne ume da izračuna cenu (isto kao `computeCredits`).
 */
export function nightQuote(
  rule: PriceRule,
  params: Record<string, unknown>,
  pricingMode: string | undefined,
  discount: number,
): { costUsd: number; credits: number } {
  const costUsd = computeCostUsd(rule, params, pricingMode) * discount;

  return { costUsd, credits: creditsFromUsd(costUsd, NIGHT_CREDIT_FACTOR) };
}

/** Koliko je noćna tura jeftinija od dnevne cene, u celim procentima naniže (ne obećava više nego što jeste). */
export function nightSavingsPercent(dayCredits: number, nightCredits: number): number {
  if (!(dayCredits > 0) || !(nightCredits < dayCredits)) return 0;

  return Math.floor((1 - nightCredits / dayCredits) * 100);
}

// ── Limiti i rokovi ────────────────────────────────────────────────────────────

/** Najviše noćnih poslova u redu po korisniku (K06 §12.3); ne broje se u paralelni limit. */
export const NIGHT_MAX_QUEUED_PER_USER = 20;

/** Najviše zahteva u jednom batch-u (K06 §12.3). */
export const NIGHT_BATCH_MAX_REQUESTS = 100;

/**
 * Najviše bajtova ulaznih slika u jednom batch-u. Slike idu u JSONL kao base64,
 * a ceo fajl se pravi u memoriji akcije - granica drži jedno slanje daleko ispod
 * memorije Node akcije. Jedan posao koji je sam veći ide sam.
 */
export const NIGHT_BATCH_MAX_INPUT_BYTES = 64 * 1024 * 1024;

const HOUR_MS = 60 * 60 * 1000;

/** Posao u `queued` stariji od ovoga ide na refund (K01-12), a batch se otkazuje. */
export const NIGHT_JOB_DEADLINE_MS = 36 * HOUR_MS;

/**
 * Greške koje noćni posao nosi u `error` kad se refundira - prefiks je kod, ostatak
 * rečenica za podršku; korisnik vidi „krediti su vraćeni" (`jobStatusText`).
 */
export const NIGHT_ERRORS = {
  deadline: "NOCNA_TURA_ISTEKLA: Posao nije stigao na red u roku od 36 sati. Krediti su vraćeni.",
  missing: "NOCNA_TURA_BEZ_REZULTATA: Batch je završen, ali rezultat za ovaj rad nije stigao. Krediti su vraćeni.",
  stale: "NOCNA_TURA_NIJE_PREDATA: Slanje u noćnu turu nije završeno. Krediti su vraćeni.",
  empty: "NOCNA_TURA_PRAZNA: Nijedan rad iz ove grupe nije mogao da se pošalje. Krediti su vraćeni.",
} as const;

/** Batch koji je preuzet a nikad predat (akcija pukla na pola) - posle ovoga refund. */
export const NIGHT_PREPARING_STALE_MS = HOUR_MS;

export function nightDeadlineAt(createdAt: number): number {
  return createdAt + NIGHT_JOB_DEADLINE_MS;
}

export type NightCandidate = {
  jobId: string;
  modelSlug: string;
  spec: NightBatchSpec;
  inputBytes: number;
  createdAt: number;
};

export type NightGroup = {
  modelSlug: string;
  spec: NightBatchSpec;
  jobIds: string[];
  inputBytes: number;
  oldestCreatedAt: number;
};

/**
 * Grupisanje poslova u batch-eve: po modelu, od najstarijeg, najviše
 * `maxRequests` zahteva i `maxInputBytes` ulaza po batch-u.
 */
export function groupNightJobs(
  candidates: readonly NightCandidate[],
  limits: { maxRequests: number; maxInputBytes: number } = {
    maxRequests: NIGHT_BATCH_MAX_REQUESTS,
    maxInputBytes: NIGHT_BATCH_MAX_INPUT_BYTES,
  },
): NightGroup[] {
  const ordered = [...candidates].sort((a, b) => a.createdAt - b.createdAt);
  const open = new Map<string, NightGroup>();
  const groups: NightGroup[] = [];

  for (const candidate of ordered) {
    const current = open.get(candidate.modelSlug);
    const fits =
      current !== undefined &&
      current.jobIds.length < limits.maxRequests &&
      current.inputBytes + candidate.inputBytes <= limits.maxInputBytes;
    if (current && fits) {
      current.jobIds.push(candidate.jobId);
      current.inputBytes += candidate.inputBytes;
      continue;
    }
    const group: NightGroup = {
      modelSlug: candidate.modelSlug,
      spec: candidate.spec,
      jobIds: [candidate.jobId],
      inputBytes: candidate.inputBytes,
      oldestCreatedAt: candidate.createdAt,
    };
    open.set(candidate.modelSlug, group);
    groups.push(group);
  }

  return groups;
}

// ── Stanja batch-a ─────────────────────────────────────────────────────────────

export const NIGHT_BATCH_STATES = ["preparing", "submitted", "succeeded", "ingested", "failed", "expired"] as const;
export type NightBatchState = (typeof NIGHT_BATCH_STATES)[number];

/** Prelazi idu samo napred; `ingested`, `failed` i `expired` su kraj. */
const NEXT_STATES: Readonly<Record<NightBatchState, readonly NightBatchState[]>> = {
  preparing: ["submitted", "failed"],
  submitted: ["succeeded", "failed", "expired"],
  succeeded: ["ingested"],
  ingested: [],
  failed: [],
  expired: [],
};

export function canAdvanceBatch(from: NightBatchState, to: NightBatchState): boolean {
  return NEXT_STATES[from].includes(to);
}

/** Stanje kod provajdera, svedeno na jedan rečnik za Gemini i OpenAI. */
export type NightProviderState = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "expired";

const PROVIDER_STATES: Record<string, NightProviderState> = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  // OpenAI
  validating: "pending",
  in_progress: "running",
  finalizing: "running",
  // Otkazivanje traje - rezultat (delimičan) stiže tek kad pređe u `cancelled`.
  cancelling: "running",
  completed: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
  expired: "expired",
};

/** `null` = stanje koje ne poznajemo; posao tada čeka, a rok ga na kraju refundira. */
export function normalizeProviderState(raw: unknown): NightProviderState | null {
  if (typeof raw !== "string") return null;
  const key = raw.replace(/^(JOB_STATE_|BATCH_STATE_)/, "");

  return Object.hasOwn(PROVIDER_STATES, key) ? PROVIDER_STATES[key] : null;
}

export type NightBatchStatus = {
  state: NightProviderState | null;
  /** Fajlovi sa rezultatima (OpenAI ima i zaseban fajl grešaka). */
  resultFiles: string[];
  error: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function errorText(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  const node = record(value);
  if (!node) return null;

  return nonEmptyString(node.message) ?? JSON.stringify(node).slice(0, 300);
}

/**
 * Odgovor `GET /v1beta/batches/{id}` (Operation). Vodič i referenca se ne slažu
 * oko mesta stanja i fajla, pa se čita svako dokumentovano mesto.
 */
export function readGeminiBatchStatus(payload: unknown): NightBatchStatus {
  const root = record(payload) ?? {};
  const metadata = record(root.metadata) ?? {};
  const response = record(root.response) ?? {};
  const output = record(metadata.output) ?? record(root.output) ?? {};
  const dest = record(root.dest) ?? record(metadata.dest) ?? {};
  const state = normalizeProviderState(metadata.state ?? root.state ?? response.state);
  const file =
    nonEmptyString(response.responsesFile) ??
    nonEmptyString(output.responsesFile) ??
    nonEmptyString(dest.fileName) ??
    nonEmptyString(dest.file_name);

  return { state, resultFiles: file ? [file] : [], error: errorText(root.error) };
}

/** Ime batch-a iz odgovora `batchGenerateContent` (`batches/…`), ili `null`. */
export function readGeminiBatchName(payload: unknown): string | null {
  const root = record(payload) ?? {};
  const name = nonEmptyString(root.name) ?? nonEmptyString(record(root.metadata)?.name);

  return name && /^batches\/[A-Za-z0-9_-]+$/.test(name) ? name : null;
}

/** Ime fajla iz odgovora File API-ja (`files/…`), ili `null`. */
export function readGeminiFileName(payload: unknown): string | null {
  const root = record(payload) ?? {};
  const name = nonEmptyString(record(root.file)?.name) ?? nonEmptyString(root.name);

  return name && /^files\/[A-Za-z0-9_-]+$/.test(name) ? name : null;
}

/** `GET /v1/batches/{id}` kod OpenAI-ja. */
export function readOpenAiBatchStatus(payload: unknown): NightBatchStatus {
  const root = record(payload) ?? {};
  const files = [nonEmptyString(root.output_file_id), nonEmptyString(root.error_file_id)].filter(
    (file): file is string => file !== null,
  );
  const errors = record(root.errors);
  const firstError = Array.isArray(errors?.data) ? errors.data[0] : null;

  return { state: normalizeProviderState(root.status), resultFiles: files, error: errorText(firstError) };
}

/** Adrese Gemini Batch toka izvedene iz istog `baseUrl`-a kao dnevni pozivi. */
export function geminiBatchUrls(baseUrl: string) {
  const url = new URL(baseUrl);
  const version = url.pathname.replace(/\/+$/, "") || "/v1beta";
  const root = `${url.origin}${version}`;

  return {
    upload: `${url.origin}/upload${version}/files`,
    download: (fileName: string) => `${url.origin}/download${version}/${fileName}:download?alt=media`,
    create: (model: string) => `${root}/models/${encodeURIComponent(model)}:batchGenerateContent`,
    status: (batchName: string) => `${root}/${batchName}`,
    cancel: (batchName: string) => `${root}/${batchName}:cancel`,
  };
}

// ── Zahtevi i rezultati ────────────────────────────────────────────────────────

export type NightInputFile = { mimeType: string; base64: string };

/**
 * Jedan red JSONL-a za Gemini Batch: `{ key, request: GenerateContentRequest }`.
 * `key` je `jobId` - po njemu se rezultat vraća pravom poslu.
 */
export function buildGeminiBatchLine(job: {
  key: string;
  params: Record<string, unknown>;
  inputMode: string;
  images: readonly NightInputFile[];
}): string {
  const prompt = typeof job.params.prompt === "string" ? job.params.prompt : "";
  const parts: unknown[] = [{ text: prompt }];
  if (job.inputMode !== "text") {
    if (job.images.length === 0) throw new Error("NEPOTPUN_ULAZ: Dodaj bar jednu sliku.");
    for (const image of job.images) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
  }

  const imageConfig: Record<string, string> = {};
  if (typeof job.params.aspect_ratio === "string") imageConfig.aspectRatio = job.params.aspect_ratio;
  if (typeof job.params.resolution === "string") {
    const size = GOOGLE_IMAGE_SIZES[job.params.resolution];
    if (!size) throw new Error(`NEPOZNATA_REZOLUCIJA:${job.params.resolution}`);
    imageConfig.imageSize = size;
  }

  return JSON.stringify({
    key: job.key,
    request: {
      contents: [{ role: "user", parts }],
      // `TEXT` + `IMAGE` je oblik iz primera za slike u batch vodiču.
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
      },
    },
  });
}

/** Jedan red JSONL-a za OpenAI Batch; samo slika iz opisa, uvek jedna slika (`n: 1`). */
export function buildOpenAiBatchLine(job: { key: string; model: string; params: Record<string, unknown> }): string {
  const prompt = typeof job.params.prompt === "string" ? job.params.prompt : "";
  const body: Record<string, unknown> = { model: job.model, prompt, n: 1 };
  if (typeof job.params.size === "string") body.size = job.params.size;
  if (typeof job.params.quality === "string") body.quality = job.params.quality;

  return JSON.stringify({ custom_id: job.key, method: "POST", url: "/v1/images/generations", body });
}

export type NightResultLine =
  | { key: string; ok: true; mimeType: string; data: string; usage: TokenUsage | null }
  | { key: string; ok: false; error: string };

function parseLine(line: string): Record<string, unknown> | null {
  try {
    return record(JSON.parse(line));
  } catch {
    return null;
  }
}

/** Red izlaza Gemini Batch-a: `{ key, response: GenerateContentResponse }` ili `{ key, error }`. */
export function parseGeminiResultLine(line: string): NightResultLine | null {
  const row = parseLine(line);
  if (!row) return null;
  const key = nonEmptyString(row.key) ?? nonEmptyString(record(row.metadata)?.key);
  if (!key) return null;

  const failure = errorText(row.error);
  if (failure) return { key, ok: false, error: `Google je odbio sliku: ${failure}` };

  const response = record(row.response) ?? {};
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  const first = record(candidates[0]);
  const parts = Array.isArray(record(first?.content)?.parts) ? (record(first?.content)?.parts as unknown[]) : [];
  for (const part of parts) {
    const inline = record(record(part)?.inlineData) ?? record(record(part)?.inline_data);
    const data = nonEmptyString(inline?.data);
    const mimeType = nonEmptyString(inline?.mimeType) ?? nonEmptyString(inline?.mime_type);
    if (data && mimeType?.startsWith("image/")) {
      return { key, ok: true, mimeType, data, usage: readTokenUsage(response) };
    }
  }

  const reason =
    nonEmptyString(record(response.promptFeedback)?.blockReason) ?? nonEmptyString(first?.finishReason);

  return { key, ok: false, error: `Google je vratio odgovor bez slike${reason ? ` (${reason})` : ""}.` };
}

const OPENAI_OUTPUT_MIME: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

/** Red izlaza (ili fajla grešaka) OpenAI Batch-a, spojen po `custom_id`. */
export function parseOpenAiResultLine(line: string): NightResultLine | null {
  const row = parseLine(line);
  if (!row) return null;
  const key = nonEmptyString(row.custom_id);
  if (!key) return null;

  const failure = errorText(row.error);
  if (failure) return { key, ok: false, error: `OpenAI je odbio sliku: ${failure}` };
  const response = record(row.response) ?? {};
  const body = record(response.body) ?? {};
  if (response.status_code !== 200) {
    return { key, ok: false, error: `OpenAI je odbio sliku: ${errorText(body.error) ?? `HTTP ${String(response.status_code)}`}` };
  }

  const first = Array.isArray(body.data) ? record(body.data[0]) : null;
  const data = nonEmptyString(first?.b64_json);
  if (!data) return { key, ok: false, error: "OpenAI je vratio odgovor bez slike." };
  const format = typeof body.output_format === "string" ? body.output_format : "png";

  return { key, ok: true, mimeType: OPENAI_OUTPUT_MIME[format] ?? "image/png", data, usage: readTokenUsage(body) };
}

/**
 * Stvaran trošak noćnog posla iz prijavljenih tokena. Batch je deo dnevne cene
 * („50% of the standard interactive API cost"), pa je tarifa reda × popust;
 * OpenAI objavljuje batch tarifu zasebno i ona se uzima kakva jeste.
 */
export function nightActualCost(
  usage: TokenUsage | null,
  spec: NightBatchSpec,
  rowRates: TokenRates | null,
): ActualCostOutcome {
  if (spec.tokenRatesUsdPerMillion) return tokenCostOutcome(usage, spec.tokenRatesUsdPerMillion);
  const outcome = tokenCostOutcome(usage, rowRates);

  return outcome.ok ? { ok: true, usd: outcome.usd * spec.discount } : outcome;
}

/**
 * Deli tok teksta na cele redove. Rezultat batch-a se čita u delovima - ceo fajl
 * sa stotinu slika ne sme da stane u memoriju akcije odjednom.
 */
export function createLineSplitter() {
  let pending = "";

  return {
    push(chunk: string): string[] {
      const lines: string[] = [];
      let start = 0;
      let index = chunk.indexOf("\n");
      while (index !== -1) {
        const line = (pending + chunk.slice(start, index)).trim();
        pending = "";
        if (line) lines.push(line);
        start = index + 1;
        index = chunk.indexOf("\n", start);
      }
      pending += chunk.slice(start);

      return lines;
    },
    flush(): string[] {
      const line = pending.trim();
      pending = "";

      return line ? [line] : [];
    },
  };
}

// ── Jutarnje iznenađenje (G13) ─────────────────────────────────────────────────

/** `notifications.kind` obaveštenja o gotovoj noćnoj turi. */
export const NIGHT_NOTIFICATION_KIND = "crea_nocna_tura";

/** Kuda vodi push: radionica Slika (urlPath mora da počne sa `/app/`, `chatCore`). */
export const NIGHT_PUSH_URL_PATH = "/app/studio?oblast=slika";

const DAY_MS = 24 * HOUR_MS;

/** Poslednja nedelja meseca u 01:00 UTC - EU pravilo za početak i kraj letnjeg vremena. */
function lastSundayAt0100Utc(year: number, monthIndex: number): number {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));

  return Date.UTC(year, monthIndex, lastDay.getUTCDate() - lastDay.getUTCDay(), 1);
}

/** Pomak Beograda od UTC-a: +2 h leti (CEST), +1 h zimi (CET). Bez `Intl`-a, deterministički. */
export function belgradeOffsetMs(utc: number): number {
  const year = new Date(utc).getUTCFullYear();
  const summer = utc >= lastSundayAt0100Utc(year, 2) && utc < lastSundayAt0100Utc(year, 9);

  return (summer ? 2 : 1) * HOUR_MS;
}

/** Između 23:00 i 07:59 po Beogradu push čeka jutro (K06-5). */
export const MORNING_HOUR = 8;
export const QUIET_FROM_HOUR = 23;

/**
 * Kada da ode push o gotovoj noćnoj turi: `null` = odmah, inače UTC trenutak
 * 08:00 po Beogradu (danas ako je posle ponoći, sutra ako je posle 23 h).
 */
export function morningPushAt(now: number): number | null {
  const local = new Date(now + belgradeOffsetMs(now));
  const hour = local.getUTCHours();
  if (hour >= MORNING_HOUR && hour < QUIET_FROM_HOUR) return null;

  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const targetLocal = localMidnight + (hour >= QUIET_FROM_HOUR ? DAY_MS : 0) + MORNING_HOUR * HOUR_MS;

  // Letnje vreme se menja u 01:00 UTC, daleko od 08:00 po Beogradu, pa je pomak
  // u trenutku cilja isti kao sat ranije.
  return targetLocal - belgradeOffsetMs(targetLocal - HOUR_MS);
}

/** „Stigao je 1 rad" / „Stigla su 3 rada" / „Stiglo je 5 radova" (srpska množina). */
export function nightArrivalsText(count: number, locale: "sr" | "en"): string {
  if (locale === "en") return count === 1 ? "1 new piece arrived" : `${count} new pieces arrived`;
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return `Stigao je ${count} rad`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `Stigla su ${count} rada`;

  return `Stiglo je ${count} radova`;
}

/** Naslov i telo obaveštenja (i push-a) kad je noćna tura gotova. */
export function nightNotificationCopy(count: number, locale: "sr" | "en"): { title: string; body: string } {
  const arrived = nightArrivalsText(count, locale);
  if (locale === "en") return { title: "Your night run is done", body: `${arrived}. Open Crea to see.` };

  return { title: "Noćna tura je gotova", body: `${arrived}. Otvori Creu i pogledaj.` };
}
