/**
 * Keš istih zahteva (Crea C4, plan K06 §13). Čista logika: otisak zahteva i
 * odluka da li postojeći rad sme da se ponudi umesto novog.
 *
 * Pravila (K01-13, K06-8):
 * - keš NIKAD ne ide između korisnika (upit čita indeks `by_user_requestHash`);
 * - blob se ne deli - pogodak samo OTVARA postojeći rad, nov red se ne pravi;
 * - otisak ne zavisi od cene (`creditFactor` NE ulazi) ni od semena: isti opis,
 *   parametri i ulazi daju isti rad bez obzira na to po kojoj je ceni naručen.
 */

import { promptHash } from "./studioCore";

/** Ključevi koje upisuje server (seme, merene količine, brojači ulaza) - u otisak ne ulaze. */
export const SERVER_PARAM_KEYS = new Set(["seed", "input_images", "reference_images"]);

/** Stabilan JSON: ključevi sortirani na svakom nivou, pa redosled ne menja otisak. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stableStringify(inner)}`).join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

export type RequestHashInput = {
  modelSlug: string;
  inputMode: string;
  /** Parametri POSLE `sanitizeSpecParams` (podrazumevane vrednosti su već popunjene). */
  params: Record<string, unknown>;
  /** sha256 svakog ulaza po slotu, redom kojim su okačeni (iz `_storage`). */
  inputShas: Record<string, string[]>;
};

/**
 * FNV-1a otisak (kao `promptHash`) nad modelom, režimom, parametrima bez
 * serverskih ključeva i SADRŽAJEM ulaza (sha256, ne `storageId`: isti fajl
 * okačen dvaput je isti ulaz).
 */
export function requestHash(input: RequestHashInput): string {
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.params)) {
    if (!SERVER_PARAM_KEYS.has(key)) params[key] = value;
  }
  const inputs: Record<string, string[]> = {};
  for (const [slot, shas] of Object.entries(input.inputShas)) {
    if (shas.length > 0) inputs[slot] = shas;
  }

  return promptHash(
    stableStringify({ model: input.modelSlug, mode: input.inputMode, params, inputs }),
  );
}

/** Ono što pogodak mora da ispuni da bi se ponudio umesto novog posla. */
export type CachedJobCandidate = {
  userId: string;
  status: string;
  provider: string;
  outputStorageId?: string;
  expiresAt?: number;
  /** `true` za DEMO (mock) izlaz - SVG plakat nije rad koji se ponavlja. */
  isMock: boolean;
};

/**
 * Sme li postojeći rad da se ponudi kao „Već imaš isti rad". Samo gotov rad
 * ISTOG korisnika, sa izlazom koji još postoji, koji nije probni (DEMO) i nije
 * lokalni alat (taj je ionako besplatan).
 */
export function isReusableJob(job: CachedJobCandidate, userId: string, now: number): boolean {
  if (job.userId !== userId) return false;
  if (job.status !== "done") return false;
  if (job.provider === "local") return false;
  if (job.isMock) return false;
  if (!job.outputStorageId) return false;
  if (job.expiresAt !== undefined && job.expiresAt <= now) return false;

  return true;
}
