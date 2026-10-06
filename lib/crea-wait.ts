import type { Locale } from "./i18n";

/**
 * Ekran čekanja Cree (K25, U3): koraci na srpskom (U redu → Crta → Boji → Gotovo),
 * mesto u redu i procena vremena. Čista logika - komponenta je
 * `components/crea/wait/wait-screen.tsx`.
 *
 * Pošteno izveštavanje: provajderi nam ne javljaju napredak (fal webhook, Google i
 * BytePlus vraćaju samo gotov rezultat), pa su „Crta" i „Boji" polovine PROCENE
 * vremena, a procena je medijana tvojih ranijih radova istog modela (ili tipično
 * vreme vrste kad ih nema). Kad posao pređe procenu, ekran to kaže umesto da laže
 * napredak.
 */

export type CreaWaitPhase = "red" | "crta" | "boji" | "gotovo";
export const CREA_WAIT_STEPS: readonly CreaWaitPhase[] = ["red", "crta", "boji", "gotovo"];

export type CreaWaitKind = "image" | "video" | "audio";

/** Polja posla koja ekran čekanja čita (podskup reda galerije). */
export type CreaWaitJob = {
  _id: string;
  status: string;
  kind: CreaWaitKind;
  modelSlug: string;
  createdAt: number;
  completedAt?: number;
  isMock: boolean;
};

export type CreaWaitState = {
  phase: CreaWaitPhase;
  /** Indeks u `CREA_WAIT_STEPS`. */
  step: number;
  /** Koliko je skice nacrtano, 0..1. Do kraja (1) stiže tek kad je rad gotov. */
  progress: number;
  /** Posao traje duže od procene. */
  overdue: boolean;
  /** Noćna tura (K08): čeka batch do jutra - bez sata i bez procene. */
  night: boolean;
  elapsedMs: number;
};

/** Status posla koji je „u toku" (ekran čekanja se crta samo za njih). */
export function isWaitingStatus(status: string): boolean {
  return status === "reserved" || status === "running" || status === "queued";
}

/** Skica nikad ne stigne do kraja dok rad nije gotov - poslednji potez čeka rezultat. */
const MAX_PROGRESS_WHILE_RUNNING = 0.94;

export function waitState(job: Pick<CreaWaitJob, "status" | "createdAt">, now: number, estimateMs: number): CreaWaitState | null {
  const elapsedMs = Math.max(0, now - job.createdAt);
  if (job.status === "done") {
    return { phase: "gotovo", step: 3, progress: 1, overdue: false, night: false, elapsedMs };
  }
  if (job.status === "queued") {
    return { phase: "red", step: 0, progress: 0, overdue: false, night: true, elapsedMs };
  }
  if (job.status === "reserved") {
    return { phase: "red", step: 0, progress: 0, overdue: false, night: false, elapsedMs };
  }
  if (job.status !== "running") return null;
  const ratio = estimateMs > 0 ? elapsedMs / estimateMs : 1;
  const phase: CreaWaitPhase = ratio < 0.5 ? "crta" : "boji";
  return {
    phase,
    step: CREA_WAIT_STEPS.indexOf(phase),
    progress: Math.min(MAX_PROGRESS_WHILE_RUNNING, Math.max(0, ratio)),
    overdue: ratio >= 1,
    night: false,
    elapsedMs,
  };
}

/** Tipično trajanje kad nema ranijih radova istog modela (sekunde, po vrsti). DEMO stiže za par sekundi. */
export const CREA_TYPICAL_WAIT_MS: Record<CreaWaitKind, number> = {
  image: 25_000,
  video: 120_000,
  audio: 35_000,
};
export const CREA_DEMO_WAIT_MS = 6_000;

const MIN_ESTIMATE_MS = 3_000;
const MAX_ESTIMATE_MS = 20 * 60_000;
const MAX_SAMPLES = 10;
const MIN_SAMPLES = 2;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type CreaWaitEstimate = { ms: number; basis: "history" | "typical" };

/**
 * Procena trajanja: medijana poslednjih (do 10) gotovih radova ISTOG modela iz tvoje
 * istorije (DEMO se ne meša sa pravim radovima), a bez bar dva takva - tipično vreme
 * vrste. Istorija stiže od najnovijeg ka najstarijem (redosled galerije).
 */
export function estimateWait(job: CreaWaitJob, history: readonly CreaWaitJob[]): CreaWaitEstimate {
  const samples: number[] = [];
  for (const other of history) {
    if (samples.length >= MAX_SAMPLES) break;
    if (other._id === job._id || other.status !== "done" || other.modelSlug !== job.modelSlug) continue;
    if (other.isMock !== job.isMock || other.completedAt === undefined) continue;
    const took = other.completedAt - other.createdAt;
    if (took > 0 && took <= MAX_ESTIMATE_MS) samples.push(took);
  }
  if (samples.length >= MIN_SAMPLES) {
    return { ms: Math.min(MAX_ESTIMATE_MS, Math.max(MIN_ESTIMATE_MS, median(samples))), basis: "history" };
  }
  return { ms: job.isMock ? CREA_DEMO_WAIT_MS : CREA_TYPICAL_WAIT_MS[job.kind], basis: "typical" };
}

/**
 * Mesto u redu: posao koji server još nije predao provajderu (`reserved`) čeka iza tvojih
 * starijih poslova u istom stanju. Za posao koji se već radi (ili noćnu turu) - `null`.
 */
export function queuePlace(job: Pick<CreaWaitJob, "_id" | "status" | "createdAt">, jobs: readonly Pick<CreaWaitJob, "_id" | "status" | "createdAt">[]): number | null {
  if (job.status !== "reserved") return null;
  return 1 + jobs.filter((other) => other._id !== job._id && other.status === "reserved" && other.createdAt < job.createdAt).length;
}

function roundedSeconds(ms: number): number {
  // Do minuta zaokružuje se naviše na 5 s: „još oko 15 s" deluje pošteno, „još 13 s" kao obećanje.
  return Math.max(5, Math.ceil(ms / 5_000) * 5);
}

/** „oko 25 s" / „oko 2 min" - trajanje bez lažne preciznosti. */
export function formatAbout(ms: number, locale: Locale): string {
  if (ms < 60_000) return locale === "sr" ? `oko ${roundedSeconds(ms)} s` : `about ${roundedSeconds(ms)} s`;
  const minutes = Math.ceil(ms / 60_000);
  return locale === "sr" ? `oko ${minutes} min` : `about ${minutes} min`;
}

/** Rečenica o preostalom vremenu, ili poštena poruka kad je procena prošla. */
export function remainingText(estimateMs: number, elapsedMs: number, locale: Locale): string {
  const left = estimateMs - elapsedMs;
  if (left <= 0) {
    return locale === "sr" ? "Traje duže nego obično - Crea i dalje radi." : "Taking longer than usual - Crea is still working.";
  }
  return locale === "sr" ? `Još ${formatAbout(left, locale)}` : `${formatAbout(left, locale)} left`.replace(/^a/, "A");
}
