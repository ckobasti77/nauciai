/**
 * Čista pravila za rezultate lokalnih alata Cree (K04, plan K01 §4.3): šta
 * galerija prima, koliko je veliko i koliko često. `creaLocal.ts` ih primenjuje
 * nad brojevima iz `_storage` i baze - nikad nad onim što je klijent rekao.
 */

import { savesLocalResults, toolById, type CreaMediaKind } from "../lib/crea-tools";

export type LocalResultKind = CreaMediaKind;

const MB = 1024 * 1024;

/** SVG namerno NIJE ovde: može da nosi skriptu, pa se vektor samo preuzima. */
export const LOCAL_RESULT_ACCEPT: Record<LocalResultKind, readonly string[]> = {
  image: ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"],
  video: ["video/mp4", "video/webm"],
  audio: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mp4"],
};

export const LOCAL_RESULT_MAX_BYTES: Record<LocalResultKind, number> = {
  image: 15 * MB,
  video: 200 * MB,
  audio: 50 * MB,
};

/**
 * Alati su besplatni, ali storage nije. Limiti po korisniku važe samo za
 * čuvanje u galeriju - pokretanje alata na uređaju nema limit.
 */
export const LOCAL_RESULT_LIMITS = { perMinute: 10, perDay: 100, bytesPerDay: 500 * MB } as const;

export const MINUTE_MS = 60 * 1000;

export type LocalRejectReason =
  | "NEPOZNAT_ALAT"
  | "NEISPRAVAN_TIP_FAJLA"
  | "FAJL_PREVELIK"
  | "PRAZAN_FAJL"
  | "MINUTNI_LIMIT"
  | "DNEVNI_LIMIT"
  | "DNEVNI_LIMIT_PROSTORA"
  | "PROJEKAT_NIJE_DOSTUPAN"
  | "IZVOR_NIJE_DOSTUPAN";

/**
 * Alat postoji, gotov je, radi lokalno (ili ima besplatan korak na uređaju,
 * `localSave`, K12), čuva u galeriju i pravi baš ovu vrstu medija. Alat sa
 * izlazom „images" (9 uglova, slojevi) čuva sliku po sliku.
 */
export function localToolProblem(toolId: string, kind: LocalResultKind): "NEPOZNAT_ALAT" | null {
  const tool = toolById(toolId);
  const output = tool?.output === "images" ? "image" : tool?.output;
  // Montaža (K19) čuva i GIF kao sliku (`alsoSaves`).
  const saves = output === kind || (tool?.alsoSaves ?? []).includes(kind);
  if (!tool || tool.status !== "ready" || !savesLocalResults(tool) || !tool.savesToGallery || !saves) {
    return "NEPOZNAT_ALAT";
  }
  return null;
}

/** Najviše izvora (radova iz galerije) uz jedan lokalni rezultat (K19: izvezena montaža). */
export const LOCAL_RESULT_MAX_SOURCES = 40;

/** Parametri rada uz broj izvora iz galerije (`izvori`), koji upisuje server. */
export function withSourceCount(params: string, sources: number): string {
  if (sources <= 0) return params;
  const parsed = JSON.parse(params) as Record<string, string | number | boolean>;
  return JSON.stringify({ ...parsed, izvori: sources });
}

/** Tip i veličina iz `_storage`. Fajl bez zabeleženog tipa se odbija - browser ga uvek šalje. */
export function localResultProblem(file: {
  kind: LocalResultKind;
  contentType?: string;
  size: number;
}): "NEISPRAVAN_TIP_FAJLA" | "FAJL_PREVELIK" | "PRAZAN_FAJL" | null {
  if (file.size <= 0) return "PRAZAN_FAJL";
  const type = file.contentType?.split(";")[0].trim().toLowerCase();
  if (!type || !LOCAL_RESULT_ACCEPT[file.kind].includes(type)) return "NEISPRAVAN_TIP_FAJLA";
  if (file.size > LOCAL_RESULT_MAX_BYTES[file.kind]) return "FAJL_PREVELIK";
  return null;
}

export function localLimitProblem(usage: {
  lastMinute: number;
  today: number;
  todayBytes: number;
  addBytes: number;
}): "MINUTNI_LIMIT" | "DNEVNI_LIMIT" | "DNEVNI_LIMIT_PROSTORA" | null {
  if (usage.lastMinute >= LOCAL_RESULT_LIMITS.perMinute) return "MINUTNI_LIMIT";
  if (usage.today >= LOCAL_RESULT_LIMITS.perDay) return "DNEVNI_LIMIT";
  if (usage.todayBytes + usage.addBytes > LOCAL_RESULT_LIMITS.bytesPerDay) return "DNEVNI_LIMIT_PROSTORA";
  return null;
}

const PARAM_MAX_KEYS = 30;
const PARAM_MAX_BYTES = 2048;
const PARAM_MAX_STRING = 200;
const PARAM_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

/**
 * Parametri lokalnog posla (format, kvalitet, rezultat provere…) se vide u
 * „Istoriji" rada. Prima se samo JSON objekat primitiva: do 30 ključeva i 2 KB.
 * Sve ostalo (niz, ugnežđen objekat, predug tekst) tiho otpada - parametri su
 * opis, ne ulaz u bilo kakvu naplatu.
 */
export function sanitizeLocalParams(raw: string | undefined): string {
  if (!raw) return "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "{}";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "{}";

  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (Object.keys(clean).length >= PARAM_MAX_KEYS) break;
    if (!PARAM_KEY.test(key)) continue;
    if (typeof value === "string") clean[key] = value.slice(0, PARAM_MAX_STRING);
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean") clean[key] = value;
  }
  const json = JSON.stringify(clean);
  return new TextEncoder().encode(json).length > PARAM_MAX_BYTES ? "{}" : json;
}
