/**
 * Google Interactions API za SLIKE (Nano Banana 2 i Pro, STUDIO-CATALOG-V4 2.1
 * i 2.2). Odvojen fajl od `google-video.ts` jer je tok drugi po prirodi:
 *
 * - video (Veo) je `predictLongRunning` -> operacija koja se ispituje;
 * - slika je **sinhrona**: odgovor istog `POST`-a nosi same bajtove slike,
 *   base64, u `steps[].content[]`. Nema ni webhooka ni pollera.
 *
 * Oblik je prepisan iz zvanicne dokumentacije Interactions API-ja
 * (`ai.google.dev/gemini-api/docs/image-generation`), ukljucujuci i
 * `Api-Revision` zaglavlje koje ta dokumentacija trazi. Kad se prvi odgovor
 * uzivo bude razlikovao, menja se JEDNO mesto - `readInteractionMedia`.
 */

import { readTokenUsage, sampleJson, type TokenUsage } from "../convex/studioActualCostCore";
import { googleHttpErrorMessage, type GoogleConfig } from "./google-video";

/**
 * Interactions API je verzionisan zaglavljem, ne putanjom. Bez njega Google ume
 * da odgovori oblikom starije revizije, pa citac ispod ne nadje sliku iako je
 * generacija uspela - i placena.
 */
export const GOOGLE_API_REVISION = "2026-05-20";

/** Sta je procitano iz jednog gotovog `interaction` odgovora. */
export type GoogleInteractionMedia = {
  /** Bajtovi izlaza, base64, tacno kako ih je Google poslao. */
  data: string;
  mimeType: string;
};

export type GoogleInteractionResult = {
  media: GoogleInteractionMedia | null;
  /** `id` interakcije - ulaz za `previous_interaction_id` kod izmena. */
  interactionId: string | null;
  error: string | null;
  usage: TokenUsage | null;
  /** Sirov odgovor, samo kad iz njega nije procitana ni slika ni potrosnja. */
  sample: string | null;
};

/** Koliko teksta greske ide dalje - isto kao kod ostalih provajdera. */
const MAX_ERROR_LENGTH = 300;

/**
 * Vrste sadrzaja koje smatramo IZLAZOM. `thought` i `user_input` koraci se
 * preskacu: Pro je misleci model i njegov odgovor sadrzi i njih.
 */
const MEDIA_TYPES = new Set(["image", "video", "audio"]);

const DEFAULT_MIME: Record<string, string> = {
  image: "image/png",
  video: "video/mp4",
  audio: "audio/mpeg",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Nadje prvi blok sa bajtovima u `steps[].content[]`.
 *
 * Trazi se po OBLIKU (`type` je medij i postoji `data`), ne po tacnoj putanji:
 * dokumentacija istu stvar pokazuje i kao `steps[].content[]` i kao
 * `output_image.data`, pa se propusta i jedno i drugo. Promasen citac znaci
 * placena generacija bez fajla - to je najskuplji nacin da se pogresi.
 */
export function readInteractionMedia(payload: unknown): GoogleInteractionMedia | null {
  const root = asRecord(payload);
  if (!root) return null;

  const fromSteps = Array.isArray(root.steps) ? readFromSteps(root.steps) : null;
  if (fromSteps) return fromSteps;

  // Skraceni oblik iz istog dokumenta: `output_image` / `output_video`.
  for (const [key, kind] of [
    ["output_image", "image"],
    ["output_video", "video"],
    ["output_audio", "audio"],
  ] as const) {
    const block = asRecord(root[key]);
    const data = block ? stringField(block, "data") : null;
    if (data) {
      return { data, mimeType: (block && stringField(block, "mime_type")) ?? DEFAULT_MIME[kind] };
    }
  }

  return null;
}

function readFromSteps(steps: unknown[]): GoogleInteractionMedia | null {
  for (const step of steps) {
    const stepRecord = asRecord(step);
    if (!stepRecord || !Array.isArray(stepRecord.content)) continue;
    for (const block of stepRecord.content) {
      const blockRecord = asRecord(block);
      if (!blockRecord) continue;
      const type = stringField(blockRecord, "type");
      if (!type || !MEDIA_TYPES.has(type)) continue;
      const data = stringField(blockRecord, "data");
      if (!data) continue;

      return { data, mimeType: stringField(blockRecord, "mime_type") ?? DEFAULT_MIME[type] };
    }
  }

  return null;
}

/**
 * Greska unutar uspesnog HTTP odgovora. Interactions API ume da vrati
 * `status: "failed"` sa 200, pa posao mora da se refundira i tada.
 */
function readInteractionError(root: Record<string, unknown>): string | null {
  const error = asRecord(root.error);
  if (error) {
    const message = stringField(error, "message") ?? stringField(error, "status");
    if (message) return message.slice(0, MAX_ERROR_LENGTH);
  }
  if (typeof root.error === "string" && root.error.length > 0) {
    return root.error.slice(0, MAX_ERROR_LENGTH);
  }

  const status = stringField(root, "status");
  if (status && /fail|error|cancel|blocked/i.test(status)) {
    return `Google je javio stanje ${status}.`;
  }

  return null;
}

export function parseInteraction(payload: unknown): GoogleInteractionResult {
  const root = asRecord(payload);
  if (!root) {
    return { media: null, interactionId: null, error: null, usage: null, sample: sampleJson(payload) };
  }

  const media = readInteractionMedia(root);
  const usage = readTokenUsage(root);
  const error = readInteractionError(root);

  return {
    media,
    interactionId: stringField(root, "id"),
    error,
    usage,
    // Uzorak samo kad odgovor nije dao NI sliku NI potrosnju NI jasnu gresku:
    // tada je oblik nepoznat, a ne "nema podatka".
    sample: media === null && usage === null && error === null ? sampleJson(root) : null,
  };
}

/**
 * Jedan sinhroni poziv Interactions API-ja. Vraca vec raspakovan rezultat, pa
 * pozivalac ne dodiruje sirov JSON.
 */
export async function runGoogleInteraction(params: {
  config: GoogleConfig;
  body: unknown;
}): Promise<GoogleInteractionResult> {
  const response = await fetch(`${params.config.baseUrl}/interactions`, {
    method: "POST",
    headers: {
      // Kljuc ide u zaglavlje, ne u `?key=`: URL-ovi zavrse u logovima.
      "x-goog-api-key": params.config.apiKey,
      "Api-Revision": GOOGLE_API_REVISION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.body),
  });

  if (!response.ok) {
    throw new Error(googleHttpErrorMessage(response.status, await response.text()));
  }

  return parseInteraction(await response.json());
}

/**
 * base64 -> bajtovi, bez `Buffer`-a (Convex V8 runtime ga nema). Ogledalo
 * `toBase64` iz `googleCore.ts`.
 */
export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  return bytes;
}
