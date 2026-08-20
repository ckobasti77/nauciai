/**
 * Tanak fetch-klijent za Google video modele (STUDIO-CATALOG-V4 3.7 i 3.8).
 * Bez SDK-a, iz istog razloga kao `lib/fal.ts` i `lib/byteplus.ts`.
 *
 * Google se za Veo 3.1 **Fast** zove direktno jer fal na toj tarifi uzima
 * 17-50% (katalog 3.7); Lite i Standard su parity i ostaju na fal-u. Gemini
 * Omni kod fal-a nema parnjaka po ovoj ceni.
 *
 * **Ovo je jedini provajder bez webhooka.** Google za video vraća `operation`
 * koju treba ispitivati - nema `callback_url` kao BytePlus ni potpisan webhook
 * kao fal. Zato posao ide `reserved` -> `running`, a ishod donosi cron
 * (`providers/google.pollGoogleVideoJobs`) na svakih minut.
 *
 * Dva ulaza, jedan izlaz:
 * - Veo: `POST /models/{model}:predictLongRunning`
 * - Gemini Omni: `POST /interactions` (Interactions API, **ne**
 *   `generateContent` - katalog 3.8)
 *
 * Oba vraćaju resurs koji se ispituje istim `GET`-om, pa poller ne mora da zna
 * koji je od dva modela u pitanju.
 */

export type GoogleConfig = { baseUrl: string; apiKey: string };

/**
 * Google ima jedan globalni endpoint (za razliku od BytePlus-a, gde pogrešan
 * region vrati 404 na model), pa `baseUrl` sme da ima podrazumevanu vrednost i
 * nije obavezna env varijabla. Ključ jeste obavezan.
 */
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const MISSING_API_KEY = "GOOGLE_AI_API_KEY nije postavljen.";

export function readGoogleConfig(env: Record<string, string | undefined>): GoogleConfig {
  const apiKey = env.GOOGLE_AI_API_KEY?.trim();
  if (!apiKey) throw new Error(MISSING_API_KEY);
  const baseUrl = env.GOOGLE_AI_BASE_URL?.trim() || DEFAULT_BASE_URL;

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/**
 * Prefiks poruke koju korisnik vidi kad Google odbije posao zbog kvote.
 * Preview modeli (Veo Fast, Gemini Omni) imaju usku kvotu i to je najčešći
 * razlog odbijanja - katalog 3.8 izričito traži da kvotna greška **refundira i
 * kaže zašto**, a ne da posao visi.
 */
export const QUOTA_ERROR_PREFIX = "KVOTA_PREKORACENA";

export function isQuotaResponse(status: number, body: string): boolean {
  if (status === 429) return true;

  return /RESOURCE_EXHAUSTED|quota/i.test(body);
}

/** Koliko teksta greške ide dalje - isto kao kod fal-a i BytePlus-a. */
const MAX_ERROR_LENGTH = 300;

export function googleHttpErrorMessage(status: number, body: string): string {
  const detail = body.slice(0, MAX_ERROR_LENGTH);
  if (isQuotaResponse(status, body)) {
    return `${QUOTA_ERROR_PREFIX}: Google je odbio zahtev (${status}). Model je u javnom pregledu sa uskom kvotom - pokušaj ponovo kasnije. ${detail}`;
  }

  return `Google API nije uspeo (${status}): ${detail}`;
}

async function callGoogle(
  config: GoogleConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<unknown> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: init.method,
    headers: {
      // Ključ ide u zaglavlje, ne u `?key=`: URL-ovi završe u logovima i u
      // porukama grešaka, zaglavlje ne.
      "x-goog-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  if (!response.ok) {
    throw new Error(googleHttpErrorMessage(response.status, await response.text()));
  }

  return response.json();
}

function readString(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Ime resursa koji se ispituje. Veo vraća punu putanju
 * (`models/veo-.../operations/xyz`), a Interactions API ume da vrati go `id` -
 * pa se goj vrednosti dopisuje kolekcija kojoj pripada. Poller posle ne mora da
 * zna koji je od dva modela posao napravio: `providerRequestId` je putanja.
 */
export function normalizeOperationPath(raw: string, fallbackCollection: string): string {
  const trimmed = raw.replace(/^\/+/, "");

  return trimmed.includes("/") ? trimmed : `${fallbackCollection}/${trimmed}`;
}

/**
 * Putanja dolazi iz mreže i ide u URL, pa se propušta samo ono što u imenu
 * Google resursa i sme da stoji. Sve ostalo je greška, ne enkodovanje - jedan
 * `..` u putanji bi inače pogodio drugi endpoint sa našim ključem.
 */
const SAFE_OPERATION_PATH = /^[A-Za-z0-9._~:/-]+$/;

export type GoogleOperation = {
  path: string;
  done: boolean;
  videoUrl: string | null;
  error: string | null;
  quota: boolean;
};

export async function startGoogleOperation(params: {
  config: GoogleConfig;
  path: string;
  body: unknown;
  fallbackCollection: string;
}): Promise<{ operationPath: string }> {
  const data = await callGoogle(params.config, params.path, {
    method: "POST",
    body: params.body,
  });

  // `name` je oblik long-running operacije, `id` oblik Interactions API-ja.
  const raw = readString(data, "name") ?? readString(data, "id");
  if (!raw) throw new Error("Google je vratio odgovor bez imena operacije.");

  return { operationPath: normalizeOperationPath(raw, params.fallbackCollection) };
}

export async function fetchGoogleOperation(params: {
  config: GoogleConfig;
  operationPath: string;
}): Promise<GoogleOperation> {
  if (!SAFE_OPERATION_PATH.test(params.operationPath)) {
    throw new Error(`NEISPRAVNA_OPERACIJA:${params.operationPath.slice(0, 80)}`);
  }

  const data = await callGoogle(params.config, `/${params.operationPath}`, { method: "GET" });

  return parseOperation(params.operationPath, data);
}

/**
 * Stanja u kojima operacija više neće da se menja. Veo javlja `done: true`,
 * Interactions API tekstualno stanje - podržana su oba, jer se ovaj oblik nije
 * mogao potvrditi protiv živog API-ja (pravila run-a zabranjuju poziv).
 */
const DONE_STATES = new Set(["COMPLETED", "SUCCEEDED", "SUCCESS", "DONE", "FAILED", "CANCELLED"]);
const FAILED_STATES = new Set(["FAILED", "CANCELLED"]);

function stateOf(payload: Record<string, unknown>): string | null {
  const raw = readString(payload, "state") ?? readString(payload, "status");

  return raw ? raw.toUpperCase() : null;
}

/**
 * Ključevi pod kojima Google vraća izlazni fajl. Traži se rekurzivno umesto po
 * jednoj tačnoj putanji: ista operacija se u dokumentaciji pojavljuje kao
 * `response.generateVideoResponse.generatedSamples[].video.uri`, kao
 * `response.generatedVideos[].video.uri` i kao `outputs[].video.uri`, a nijedan
 * od tri oblika nije mogao da se potvrdi uživo. Promašen URL znači posao koji
 * visi do reaper-a; nabrajanje jedne putanje bi to učinilo verovatnijim.
 */
const OUTPUT_URL_KEYS = new Set(["uri", "url", "fileuri", "videouri", "downloaduri"]);
const MAX_SEARCH_DEPTH = 8;

function findOutputUrl(node: unknown, depth = 0): string | null {
  if (depth > MAX_SEARCH_DEPTH || node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findOutputUrl(item, depth + 1);
      if (found) return found;
    }

    return null;
  }

  const entries = Object.entries(node as Record<string, unknown>);
  // Prvo cela ravan, pa tek onda dublje: `uri` na bližem nivou je izlaz, a ne
  // neki ugnježdeni metapodatak.
  for (const [key, value] of entries) {
    const normalized = key.toLowerCase().replace(/_/g, "");
    if (typeof value === "string" && OUTPUT_URL_KEYS.has(normalized) && /^https?:\/\//.test(value)) {
      return value;
    }
  }
  for (const [, value] of entries) {
    const found = findOutputUrl(value, depth + 1);
    if (found) return found;
  }

  return null;
}

function errorTextOf(payload: Record<string, unknown>): string | null {
  const error = payload.error;
  if (typeof error === "string" && error.length > 0) return error;
  if (!error || typeof error !== "object") return null;

  const message = readString(error, "message");
  const status = readString(error, "status");
  const code = (error as Record<string, unknown>).code;
  const parts = [status, message, typeof code === "number" ? `code ${code}` : null].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );

  return parts.length > 0 ? parts.join(" - ") : "Google je vratio grešku bez opisa.";
}

/**
 * Odgovor `GET`-a nad operacijom -> jedan oblik koji poller razume. Nepoznat
 * odgovor je `done: false`: posao ostaje u `running`-u i pokušava se ponovo, a
 * ako se nikad ne razreši, pokupi ga postojeći reaper.
 */
export function parseOperation(path: string, data: unknown): GoogleOperation {
  const empty: GoogleOperation = { path, done: false, videoUrl: null, error: null, quota: false };
  if (!data || typeof data !== "object" || Array.isArray(data)) return empty;

  const payload = data as Record<string, unknown>;
  const state = stateOf(payload);
  const done = payload.done === true || (state !== null && DONE_STATES.has(state));

  const errorText = errorTextOf(payload);
  if (errorText || (state !== null && FAILED_STATES.has(state))) {
    const error = errorText ?? `Google je javio stanje ${state}.`;

    return {
      path,
      done: true,
      videoUrl: null,
      error: error.slice(0, MAX_ERROR_LENGTH),
      quota: isQuotaResponse(0, error),
    };
  }

  if (!done) return empty;

  return {
    path,
    done: true,
    videoUrl: findOutputUrl(payload.response ?? payload.outputs ?? payload.output ?? payload),
    error: null,
    quota: false,
  };
}
