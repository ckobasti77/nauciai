/**
 * Čista logika Studija: bez `ctx`, bez baze, bez čitanja sata. Ovde se
 * odlučuje koliko posao košta, u `studio.ts` se samo upisuje.
 */

/** STUDIO-PLAN 4.4 - najviše 3 posla u letu (`reserved` + `running`). */
export const MAX_ACTIVE_JOBS = 3;

/** STUDIO-PLAN 4.4 - najviše 50 generacija po korisniku dnevno. */
export const MAX_DAILY_GENERATIONS = 50;

/** Ključ reda u `studioUsageDaily`: UTC dan, "2026-08-18". */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * `generationJobs.params` je JSON objekat koji ide fal-u (prompt, seed,
 * trajanje...). Sve što nije JSON objekat je `null` - pozivalac tada odbija
 * posao umesto da nagađa šta je klijent mislio.
 */
export function parseParams(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

/** Prompt koji ide u moderaciju; nedostajuće polje je prazan string, ne greška. */
export function extractPrompt(params: Record<string, unknown>): string {
  return typeof params.prompt === "string" ? params.prompt : "";
}

/**
 * FNV-1a u dve trake po 32 bita -> 16 heksadecimalnih znakova. Namerno nije
 * kriptografski: `generationJobs.promptHash` služi samo za dedup i grupisanje
 * u moderaciji, a ovako je funkcija čista, sinhrona i deterministička (bez
 * `crypto.subtle`, koji je async i vezan za runtime).
 */
export function promptHash(prompt: string): string {
  let low = 0x811c9dc5;
  let high = 0x01000193;
  for (let index = 0; index < prompt.length; index += 1) {
    const code = prompt.charCodeAt(index);
    low = Math.imul(low ^ code, 0x01000193) >>> 0;
    high = Math.imul(high ^ code, 0x85ebca6b) >>> 0;
  }

  return low.toString(16).padStart(8, "0") + high.toString(16).padStart(8, "0");
}

export type PricedModel = {
  creditCost: number;
  costPerSecond?: number;
};

/**
 * Cena se UVEK računa ovde, iz kataloga - nikad iz onoga što je klijent
 * poslao u `params`. Model sa `costPerSecond` (video promenljivog trajanja,
 * STUDIO-PLAN B2) košta `ceil(costPerSecond * duration)`; sve ostalo ima
 * fiksni `creditCost`.
 *
 * Model koji naplaćuje po sekundi, a `duration` nije poslat kao pozitivan
 * broj, baca umesto da padne na fiksnu cenu: naplatiti baznu cenu za klip
 * nepoznate dužine je tiho potkradanje kase.
 */
export function computeCreditCost(model: PricedModel, params: Record<string, unknown>): number {
  if (model.costPerSecond === undefined) return model.creditCost;

  const duration = params.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("NEISPRAVNO_TRAJANJE");
  }

  return Math.ceil(model.costPerSecond * duration);
}
