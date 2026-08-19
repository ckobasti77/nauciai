/**
 * Čista logika fal webhook-a: bez `ctx`, bez baze, bez mreže i bez čitanja
 * sata. Kriptografija (SHA-256, Ed25519) i dohvat JWKS-a ostaju u
 * `falWebhook.ts` jer su asinhroni i vezani za runtime; ovde je sve što se
 * može proveriti bez njih. Algoritam je iz STUDIO-PLAN 4.3.
 */

/** STUDIO-PLAN 4.3 - potpis vredi +/-300 sekundi (zaštita od replay-a). */
export const TIMESTAMP_TOLERANCE_SECONDS = 300;

/** STUDIO-PLAN 4.3 - JWKS se kešira NAJVIŠE 24h. */
export const JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const FAL_JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";

export type FalWebhookHeaders = {
  requestId: string;
  userId: string;
  timestamp: string;
  signature: string;
};

/**
 * Sva četiri `X-Fal-Webhook-*` headera moraju da postoje; ako bilo koji fali,
 * poziv se odbija sa 401 (STUDIO-PLAN 4.3). `Headers.get` je case-insensitive,
 * pa su imena ovde mala slova.
 */
export function readWebhookHeaders(headers: {
  get(name: string): string | null;
}): FalWebhookHeaders | null {
  const requestId = headers.get("x-fal-webhook-request-id");
  const userId = headers.get("x-fal-webhook-user-id");
  const timestamp = headers.get("x-fal-webhook-timestamp");
  const signature = headers.get("x-fal-webhook-signature");
  if (!requestId || !userId || !timestamp || !signature) return null;

  return { requestId, userId, timestamp, signature };
}

/** `timestamp` je unix vreme u SEKUNDAMA, onako kako ga fal šalje. */
export function isTimestampFresh(timestamp: string, nowMs: number): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;

  return Math.abs(Math.floor(nowMs / 1000) - seconds) <= TIMESTAMP_TOLERANCE_SECONDS;
}

/**
 * Poruka koja je potpisana je tačno ova konkatenacija sa `\n` izmedju.
 * `bodyHashHex` je SHA-256 nad SIROVIM bajtovima tela, nikad nad
 * re-serijalizovanim JSON-om - fal potpisuje bajtove koje je poslao.
 */
export function buildSignedMessage(headers: FalWebhookHeaders, bodyHashHex: string): string {
  return `${headers.requestId}\n${headers.userId}\n${headers.timestamp}\n${bodyHashHex}`;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");

  return hex;
}

/**
 * Potpis stiže kao hex string. Sve što nije paran niz hex cifara je `null`.
 * Povratni tip je `Uint8Array<ArrayBuffer>` (a ne šire `ArrayBufferLike`) da bi
 * niz mogao da udje pravo u `crypto.subtle`, koje traži `BufferSource`.
 */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

/** JWKS `x` polje je base64url (bez `=` dopune, sa `-` i `_` umesto `+` i `/`). */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  return bytes;
}

/**
 * Iz JWKS odgovora vadi base64url `x` vrednosti. Namerno ne filtrira po `kty`
 * ni `crv`: STUDIO-PLAN 4.3 kaže "bilo koji ključ iz seta koji verifikuje
 * potpis", a ključ pogrešnog tipa svakako padne na `importKey`. Filtriranje bi
 * značilo da promena oblika JWKS-a kod fal-a tiho obori sve webhookove.
 */
export function extractJwkPublicKeys(jwks: unknown): string[] {
  if (!jwks || typeof jwks !== "object") return [];
  const keys = (jwks as { keys?: unknown }).keys;
  if (!Array.isArray(keys)) return [];

  return keys
    .map((key) => (key && typeof key === "object" ? (key as { x?: unknown }).x : undefined))
    .filter((x): x is string => typeof x === "string" && x.length > 0);
}

export type FalWebhookBody = {
  status: string | null;
  payload: unknown;
  error: string | null;
};

/** Telo se parsira TEK posle verifikacije potpisa. */
export function parseWebhookBody(raw: string): FalWebhookBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const body = parsed as Record<string, unknown>;

  return {
    status: typeof body.status === "string" ? body.status : null,
    payload: body.payload,
    error: typeof body.error === "string" ? body.error : null,
  };
}

/** Objekti u payload-u koji nose jedan izlaz. */
const SINGLE_OUTPUT_KEYS = ["video", "image", "audio", "audio_file"] as const;

/** Polja u payload-u koja nose listu izlaza; uzima se prvi. */
const LIST_OUTPUT_KEYS = ["images", "videos", "audios", "audio_files"] as const;

function readUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const url = (value as { url?: unknown }).url;

  return typeof url === "string" && url.length > 0 ? url : null;
}

/**
 * fal vraća izlaz pod različitim ključem po modelu (`images[0].url` kod slika,
 * `video.url` kod videa, `audio.url` kod zvuka). Vraća prvi koji nadje, ili
 * `null` ako ni jedan oblik ne prepozna - tada posao ostaje `done` bez URL-a,
 * a A11 (`persistOutput`) odlučuje šta sa tim.
 */
export function extractOutputUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  for (const key of SINGLE_OUTPUT_KEYS) {
    const url = readUrl(record[key]);
    if (url) return url;
  }

  for (const key of LIST_OUTPUT_KEYS) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    const url = readUrl(list[0]);
    if (url) return url;
  }

  return readUrl(record);
}

/** Koliko teksta greške ide u `generationJobs.error` - dovoljno za dijagnozu. */
const MAX_ERROR_LENGTH = 500;

/**
 * Kod `status: "ERROR"` fal stavlja tip greške u `error`, a detalje u
 * `payload`. Uzima oba kad postoje da poruka ne bude samo "ValidationError".
 */
export function extractErrorMessage(body: FalWebhookBody): string {
  const parts: string[] = [];
  if (body.error) parts.push(body.error);
  if (body.payload !== undefined && body.payload !== null) {
    parts.push(typeof body.payload === "string" ? body.payload : JSON.stringify(body.payload));
  }

  const message = parts.join(": ");
  if (message.length === 0) return "fal je vratio grešku bez opisa.";

  return message.slice(0, MAX_ERROR_LENGTH);
}
