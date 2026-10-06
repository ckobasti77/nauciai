/**
 * Pošteni krediti Cree (K28: U7, C8). Čista logika bez baze: lični dnevni limit
 * potrošnje, besplatno ponavljanje pokvarenog rada, otkazivanje uz povraćaj i
 * pošteno „neograničeno" na jeftinim modelima. Bazu radi `creaFairDb.ts`
 * (pomoćnici za `studio.createJobForUser`) i `creaFair.ts` (javne funkcije).
 */

import { isMockRequestId } from "./studioCore";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ── Lični dnevni limit potrošnje (U7) ────────────────────────────────────────

/** Granice limita koji korisnik sam postavi (krediti po UTC danu, isti dan kao `studioUsageDaily`). */
export const SPEND_LIMIT_BOUNDS = { min: 10, max: 100_000 } as const;

/** Ceo broj u granicama; `null` = bez ličnog limita. Broj van granica je greška, ne tiho sečenje. */
export function normalizeDailyLimit(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new Error("NEISPRAVAN_LIMIT");
  const rounded = Math.round(value);
  if (rounded < SPEND_LIMIT_BOUNDS.min || rounded > SPEND_LIMIT_BOUNDS.max) throw new Error("NEISPRAVAN_LIMIT");
  return rounded;
}

/** Da li bi OVAJ posao prešao limit: meri se današnja potrošnja + cena posla. */
export function exceedsPersonalLimit(spentToday: number, cost: number, limit: number | null): boolean {
  return limit !== null && cost > 0 && spentToday + cost > limit;
}

// ── Besplatni poslovi (0 kredita) ────────────────────────────────────────────

/** Posao koji nije skinuo kredite: proba iz lekcije (K26), ponavljanje i „neograničeno" (K28). */
export function isUnpaidJob(job: { freeTryLessonId?: string; freeRedoOfJobId?: string; fairUnlimited?: true }): boolean {
  return job.freeTryLessonId !== undefined || job.freeRedoOfJobId !== undefined || job.fairUnlimited === true;
}

// ── Besplatno ponavljanje pokvarenog rada (U7) ───────────────────────────────

/** Šta je „očigledno pokvareno" - korisnik bira jedno; tekst je u `lib/crea-fair-copy.ts`. */
export const FREE_REDO_REASONS = ["prazno", "iskrivljeno", "pogresno", "tekst", "pokret", "zvuk"] as const;
export type FreeRedoReason = (typeof FREE_REDO_REASONS)[number];

/**
 * Limit i zaštita: najviše 2 ponavljanja u 24 h i 6 u 30 dana, samo za rad mlađi
 * od 48 h, jedno ponavljanje po radu, ne za besplatne radove i ne za skupe (iznad
 * 200 kr - tu se piše podršci). Ponavlja se TAČNO isti zahtev (model, opis,
 * podešavanja, ulazi), pa ponavljanje ne može da posluži kao besplatan nov rad.
 */
export const FREE_REDO_LIMITS = { perDay: 2, per30Days: 6, maxAgeMs: 48 * HOUR_MS, maxCredits: 200 } as const;
export const FREE_REDO_WINDOW_MS = { day: DAY_MS, month: 30 * DAY_MS } as const;

export type FreeRedoBlock =
  | "NOCNI_RAD"
  | "NIJE_GOTOV"
  | "BESPLATAN_RAD"
  | "PRESTARO"
  | "VEC_PONOVLJENO"
  | "PRESKUPO_ZA_PONAVLJANJE"
  | "DNEVNI_LIMIT_PONAVLJANJA"
  | "MESECNI_LIMIT_PONAVLJANJA"
  | "NEPOZNAT_RAZLOG";

export function freeRedoBlock(input: {
  job: {
    status: string;
    provider?: string;
    creditCost: number;
    createdAt: number;
    freeTryLessonId?: string;
    freeRedoOfJobId?: string;
    fairUnlimited?: true;
    deliveryMode?: "night";
  };
  reason: string;
  now: number;
  alreadyRedone: boolean;
  usedToday: number;
  used30Days: number;
}): FreeRedoBlock | null {
  const { job } = input;
  if (!(FREE_REDO_REASONS as readonly string[]).includes(input.reason)) return "NEPOZNAT_RAZLOG";
  if (job.status !== "done") return "NIJE_GOTOV";
  if (job.provider === "local" || job.creditCost <= 0 || isUnpaidJob(job)) return "BESPLATAN_RAD";
  // Noćni rad bi se ponovio kao skuplji dnevni (K29-09) - ne nudi se.
  if (job.deliveryMode === "night") return "NOCNI_RAD";
  if (input.now - job.createdAt > FREE_REDO_LIMITS.maxAgeMs) return "PRESTARO";
  if (input.alreadyRedone) return "VEC_PONOVLJENO";
  if (job.creditCost > FREE_REDO_LIMITS.maxCredits) return "PRESKUPO_ZA_PONAVLJANJE";
  if (input.usedToday >= FREE_REDO_LIMITS.perDay) return "DNEVNI_LIMIT_PONAVLJANJA";
  if (input.used30Days >= FREE_REDO_LIMITS.per30Days) return "MESECNI_LIMIT_PONAVLJANJA";
  return null;
}

// ── Otkazivanje uz povraćaj (U7) ─────────────────────────────────────────────

/**
 * Kojim putem se posao sme otkazati (`null` = ne sme):
 * - `local`: provajder za posao još ne zna - noćni posao koji čeka predaju, posao
 *   „neograničenog" u sporom redu, DEMO posao. Povraćaj ide odmah kroz `failJob`.
 * - `fal`: posao je u fal redu; otkazuje se tek kad fal potvrdi da još NIJE počeo
 *   (`IN_QUEUE`) i prihvati otkaz (202). Posao koji je počeo fal svejedno naplati.
 * Google i BytePlus nemaju otkaz (sinhrona slika ili operacija koja se ne zaustavlja).
 */
export type CancelRoute = "local" | "fal";

export function cancelRouteOf(job: {
  status: string;
  /** Stari poslovi nemaju polje - to su fal poslovi (`studio.submitJob`). */
  provider?: string;
  batchId?: string;
  falRequestId?: string;
  fairUnlimited?: true;
}): CancelRoute | null {
  if (job.status === "queued") return job.batchId === undefined ? "local" : null;
  if (job.status === "reserved") return job.fairUnlimited === true ? "local" : null;
  if (job.status !== "running" || job.falRequestId === undefined) return null;
  if (isMockRequestId(job.falRequestId)) return "local";
  return (job.provider ?? "fal") === "fal" ? "fal" : null;
}

/** Greška koju dobija otkazan posao (`studio-messages` je prevodi). */
export const CANCELLED_ERROR = "OTKAZAO_KORISNIK";

/**
 * fal queue: stanje i otkaz zahteva - `GET|PUT https://queue.fal.run/{endpoint}/requests/{id}/status|cancel`,
 * gde je `endpoint` puna putanja modela (https://fal.ai/docs/model-apis/model-endpoints/queue,
 * pročitano 2026-10-06). 202 = otkaz prihvaćen, 400 = već gotov, 404 = ne postoji.
 */
export function falRequestUrl(endpoint: string, requestId: string, action: "status" | "cancel"): string {
  return `https://queue.fal.run/${endpoint}/requests/${encodeURIComponent(requestId)}/${action}`;
}

/** `status` iz odgovora fal-a (`IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`); `null` za nepoznat oblik. */
export function falQueueStatus(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const status = (body as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

// ── Pošteno „neograničeno" (C8) ──────────────────────────────────────────────

/**
 * Plan od €24,99 (Premium) dobija jeftine modele bez kredita, iza flega
 * `crea_fair_unlimited`: samo spisak modela ispod, jedna slika po poslu, jedan
 * takav posao u isto vreme, spori red (predaja posle 45 s) i 200 poslova u 30
 * dana. Najgori mesec nas košta ~200 × 0,034 $ ≈ 7 $ (NB2 Lite); `maxCostUsd`
 * čuva granicu i kad se cena modela promeni.
 */
export const FAIR_UNLIMITED = {
  models: ["nano-banana-2-lite", "z-image-turbo", "flux-2-klein"],
  monthlyJobs: 200,
  windowMs: 30 * DAY_MS,
  maxCostUsd: 0.04,
  queueDelayMs: 45_000,
} as const;

export type FairUnlimitedBlock =
  | "NEOGRANICENO_ISKLJUCENO"
  | "NEOGRANICENO_SAMO_PREMIUM"
  | "NEOGRANICENO_MODEL"
  | "NEOGRANICENO_JEDNA_SLIKA"
  | "NEOGRANICENO_JEDAN_POSAO"
  | "NEOGRANICENO_MESECNI_LIMIT";

export function fairUnlimitedBlock(input: {
  flagOn: boolean;
  premium: boolean;
  modelSlug: string;
  estimatedCostUsd: number;
  numImages: number;
  otherDiscount: boolean;
  inFlight: number;
  used: number;
}): FairUnlimitedBlock | null {
  if (!input.flagOn) return "NEOGRANICENO_ISKLJUCENO";
  if (!input.premium) return "NEOGRANICENO_SAMO_PREMIUM";
  if (!(FAIR_UNLIMITED.models as readonly string[]).includes(input.modelSlug)) return "NEOGRANICENO_MODEL";
  if (input.otherDiscount || input.estimatedCostUsd > FAIR_UNLIMITED.maxCostUsd) return "NEOGRANICENO_MODEL";
  if (input.numImages > 1) return "NEOGRANICENO_JEDNA_SLIKA";
  if (input.inFlight > 0) return "NEOGRANICENO_JEDAN_POSAO";
  if (input.used >= FAIR_UNLIMITED.monthlyJobs) return "NEOGRANICENO_MESECNI_LIMIT";
  return null;
}
