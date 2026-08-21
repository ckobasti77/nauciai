/**
 * Tanak fetch-klijent za BytePlus ModelArk. Bez SDK-a, iz istog razloga kao
 * `lib/fal.ts` - manje zavisnosti i lakše za test.
 *
 * BytePlus se zove direktno, a ne preko fal-a, jer fal na Seedream 5 Pro uzima
 * 1,50x a na Seedance TAČNO DUPLO (STUDIO-CATALOG-V4 sekcija 7). Ovo je najveći
 * pojedinačan novčani dobitak u celom katalogu.
 *
 * Dva oblika posla:
 * - slike (`dola-seedream-*`) su SINHRONE: odgovor nosi izlaz;
 * - video (`dreamina-seedance-*`) je ASINHRON: odgovor nosi `id` zadatka, a
 *   ishod stiže na `callback_url` (i, obavezno, proverava se ponovnim upitom).
 */

import { readTokenUsage, sampleJson, type TokenUsage } from "../convex/studioActualCostCore";
import { readReportedSeconds } from "../convex/studioSettlementCore";

export type BytePlusConfig = { baseUrl: string; apiKey: string };

/** Poruka je namerno doslovna - ovo je prvo što Jovan vidi ako env fali. */
const MISSING_BASE_URL =
  "BYTEPLUS_BASE_URL nije postavljen (npr. https://ark.ap-southeast.bytepluses.com/api/v3).";
const MISSING_API_KEY = "BYTEPLUS_API_KEY nije postavljen.";

/**
 * Oba su OBAVEZNA i nema podrazumevane vrednosti za `baseUrl`: BytePlus ima
 * regione (ap-southeast, cn-beijing...), a pogrešan region ne pukne odmah nego
 * vrati 404 na model - grešku koja liči na "model ne postoji", a nije.
 *
 * Baca PRE bilo kakvog mrežnog poziva; pozivalac to pretvara u `failJob`, pa
 * korisnik odmah dobija kredite nazad.
 */
export function readBytePlusConfig(env: Record<string, string | undefined>): BytePlusConfig {
  const baseUrl = env.BYTEPLUS_BASE_URL?.trim();
  if (!baseUrl) throw new Error(MISSING_BASE_URL);
  const apiKey = env.BYTEPLUS_API_KEY?.trim();
  if (!apiKey) throw new Error(MISSING_API_KEY);

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

async function callBytePlus(
  config: BytePlusConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<unknown> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BytePlus ${path} nije uspeo (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json();
}

function readString(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * `usage` su potroseni tokeni iz odgovora (W6) - jedini podatak iz kojeg se
 * sazna STVARAN trosak, jer BytePlus ne vraca cenu. Polje je zamenilo nekadasnji
 * `usdSpent`, koji je stajao u tipu a niko ga nije punio.
 */
export type BytePlusImageResult = {
  url: string;
  usage: TokenUsage | null;
  /**
   * Sirov odgovor, i to SAMO kad potrosnja iz njega nije procitana (X3, tacka 4).
   * BytePlus oblik nije potvrdjen protiv zivog API-ja, pa se prvi neprepoznat
   * odgovor pamti u `studioProviderSamples` umesto da se nagadja.
   */
  sample: string | null;
};

/**
 * Slike: `POST /images/generations`, OpenAI-kompatibilan oblik, odgovor je
 * `{ data: [{ url }] }`. Uzima se PRVI izlaz - `persistOutput` u ovoj fazi
 * čuva jedan fajl po poslu, pa bi ostali URL-ovi bili obećanje koje galerija
 * ne ume da ispuni.
 */
export async function generateBytePlusImage(params: {
  config: BytePlusConfig;
  model: string;
  input: Record<string, unknown>;
}): Promise<BytePlusImageResult> {
  const data = await callBytePlus(params.config, "/images/generations", {
    method: "POST",
    body: { model: params.model, ...params.input },
  });

  const list = (data as { data?: unknown })?.data;
  const url = Array.isArray(list) ? readString(list[0], "url") : null;
  if (!url) throw new Error("BytePlus je vratio odgovor bez URL-a slike.");

  const usage = readTokenUsage(data);

  return { url, usage, sample: usage === null ? sampleJson(data) : null };
}

export type BytePlusTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type BytePlusTask = {
  id: string;
  status: BytePlusTaskStatus | "unknown";
  videoUrl: string | null;
  error: string | null;
  /** Potroseni tokeni zadatka (W6); `null` kad ih odgovor nema. */
  usage: TokenUsage | null;
  /**
   * Stvarno trajanje klipa u sekundama, kad ga zadatak javi (X2, nalaz N2).
   * Ulaz u poravnanje; `null` znaci da provajder nije prijavio nista. Seedance
   * se ne naplacuje po tokenima nego po sekundi izlaza, pa je ovo i jedini
   * izvor njegovog STVARNOG troska (X3, tacka 2).
   */
  seconds: number | null;
  /** Sirov odgovor, samo kad iz njega nije procitano ni jedno ni drugo (X3). */
  sample: string | null;
};

/**
 * Video: `POST /contents/generations/tasks`. `callback_url` je jedini razlog
 * zašto ovaj posao ne mora da se anketira - ali callback se NE uzima zdravo za
 * gotovo (videti `convex/providers/byteplus.ts`).
 */
export async function createBytePlusVideoTask(params: {
  config: BytePlusConfig;
  model: string;
  content: unknown[];
  callbackUrl: string;
}): Promise<{ taskId: string }> {
  const data = await callBytePlus(params.config, "/contents/generations/tasks", {
    method: "POST",
    body: {
      model: params.model,
      content: params.content,
      callback_url: params.callbackUrl,
    },
  });

  const taskId = readString(data, "id");
  if (!taskId) throw new Error("BytePlus je vratio zadatak bez `id`-ja.");

  return { taskId };
}

const TASK_STATUSES: readonly BytePlusTaskStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

/** Status koji ne prepoznajemo je `"unknown"`, ne pretpostavljen uspeh. */
function readTaskStatus(value: unknown): BytePlusTaskStatus | "unknown" {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value)
    ? (value as BytePlusTaskStatus)
    : "unknown";
}

/**
 * `GET /contents/generations/tasks/{id}` - ovo je izvor istine o poslu, a ne
 * telo callback-a. `taskId` se enkoduje: dolazi iz mreže, pa ne sme da izadje
 * iz svog segmenta putanje.
 */
export async function fetchBytePlusVideoTask(params: {
  config: BytePlusConfig;
  taskId: string;
}): Promise<BytePlusTask> {
  const data = await callBytePlus(
    params.config,
    `/contents/generations/tasks/${encodeURIComponent(params.taskId)}`,
    { method: "GET" },
  );

  const content = (data as { content?: unknown })?.content;
  const error = (data as { error?: unknown })?.error;
  const usage = readTokenUsage(data);
  const seconds = readReportedSeconds(data);

  return {
    id: readString(data, "id") ?? params.taskId,
    status: readTaskStatus((data as { status?: unknown })?.status),
    videoUrl: readString(content, "video_url"),
    error: readString(error, "message") ?? readString(error, "code"),
    usage,
    seconds,
    // Odgovor iz kojeg je bar jedan broj izasao je oblik koji razumemo.
    sample: usage === null && seconds === null ? sampleJson(data) : null,
  };
}
