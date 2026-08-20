/**
 * Tanak fetch-klijent za fal.ai queue API. Namerno bez fal SDK-a - manje
 * zavisnosti i lakše za test (.studio-run/prompts/A8.md).
 */

export type FalSubmitResult = { requestId: string };

/**
 * `https://queue.fal.run/{endpoint}?fal_webhook={encoded webhookUrl}`.
 * `webhookUrl` se enkoduje da upitni znakovi iz njega (npr. iz nekog budućeg
 * query parametra) ne otvore drugi `?` u konačnom URL-u.
 */
export function buildQueueUrl(endpoint: string, webhookUrl: string): string {
  return `https://queue.fal.run/${endpoint}?fal_webhook=${encodeURIComponent(webhookUrl)}`;
}

export async function submitToFal(params: {
  endpoint: string;
  input: Record<string, unknown>;
  webhookUrl: string;
  apiKey: string;
}): Promise<FalSubmitResult> {
  const response = await fetch(buildQueueUrl(params.endpoint, params.webhookUrl), {
    method: "POST",
    headers: {
      // Doslovno "Key", ne "Bearer" - tako fal queue API zahteva.
      Authorization: `Key ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.input),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`fal request failed (${response.status}): ${body}`);
  }

  // `gateway_request_id` se menja pri retry-ju - `request_id` je stabilan.
  const data = (await response.json()) as { request_id: string; gateway_request_id?: string };
  return { requestId: data.request_id };
}

/**
 * fal Platform API: `GET /v1/models/billing-events` (W6). Za razliku od
 * Google-a i BytePlus-a, fal u odgovoru posla NE nosi cenu - stvaran trošak se
 * saznaje tek iz ovog spiska, i to **po `request_id`-ju**, što je tačno ono što
 * `generationJobs.providerRequestId` čuva.
 *
 * Baza je odvojiva (`FAL_REST_BASE_URL`) iz istog razloga iz kojeg je odvojiva
 * i kod BytePlus-a: nijedan poziv fal-u u ovom repou nije napravljen uživo, pa
 * je putanja koju treba ispraviti jedno polje u okruženju, a ne novi deploy.
 */
const DEFAULT_FAL_REST_BASE_URL = "https://rest.alpha.fal.ai";

/** Koliko događaja se traži u jednom pozivu; preko toga se glasno loguje. */
export const FAL_BILLING_PAGE_LIMIT = 1000;

export type FalBillingEvent = { requestId: string; usd: number };

/**
 * IMENA POLJA NISU POTVRDJENA PROTIV ŽIVOG API-JA - isto upozorenje koje nosi
 * `convex/providers/falInputs.ts`. Zato se prihvata svaki poznat zapis, a
 * događaj iz kojeg se ne pročita ni ID ni iznos se preskače umesto da obori
 * ceo prolaz: jedan nepoznat red ne sme da pojede celu noćnu rekonsilijaciju.
 */
const REQUEST_ID_KEYS = ["request_id", "requestId", "fal_request_id", "falRequestId"];
const COST_KEYS = ["total_cost_usd", "cost_usd", "amount_usd", "usd", "cost", "amount"];

function readEventString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }

  return null;
}

function readEventNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    // Iznos u JSON-u ume da stigne kao string ("0.0123"); prazan string i
    // tekst koji nije broj ostaju "nema podatka".
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

/** Telo odgovora -> događaji. Prihvata go niz, `{ events: [] }` i `{ data: [] }`. */
export function parseFalBillingEvents(payload: unknown): FalBillingEvent[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? ((payload as { events?: unknown; data?: unknown }).events ??
        (payload as { data?: unknown }).data)
      : null;
  if (!Array.isArray(list)) return [];

  const events: FalBillingEvent[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const requestId = readEventString(source, REQUEST_ID_KEYS);
    const usd = readEventNumber(source, COST_KEYS);
    if (requestId === null || usd === null || usd <= 0) continue;
    events.push({ requestId, usd });
  }

  return events;
}

export function buildFalBillingUrl(params: {
  baseUrl?: string;
  startTime: string;
  endTime: string;
}): string {
  const base = (params.baseUrl || DEFAULT_FAL_REST_BASE_URL).replace(/\/+$/, "");
  const query = new URLSearchParams({
    start_time: params.startTime,
    end_time: params.endTime,
    limit: String(FAL_BILLING_PAGE_LIMIT),
  });

  return `${base}/v1/models/billing-events?${query.toString()}`;
}

export async function fetchFalBillingEvents(params: {
  apiKey: string;
  baseUrl?: string;
  startTime: string;
  endTime: string;
}): Promise<FalBillingEvent[]> {
  const response = await fetch(
    buildFalBillingUrl({
      baseUrl: params.baseUrl,
      startTime: params.startTime,
      endTime: params.endTime,
    }),
    { headers: { Authorization: `Key ${params.apiKey}` } },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`fal billing-events nije uspeo (${response.status}): ${body.slice(0, 300)}`);
  }

  return parseFalBillingEvents(await response.json());
}
