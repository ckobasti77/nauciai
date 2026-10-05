/**
 * Čista pravila za sačuvane projekte montaže (Crea K19, plan K17-6 i §2.3).
 * Dokument je `CreaTimelineV1` iz `lib/crea-timeline.ts` (isti `parseTimeline`
 * kao na klijentu); ovde je samo ono što server dodatno zna: koji radovi iz
 * galerije su u montaži i kakve vrste moraju biti.
 */

import {
  parseTimeline,
  timelineDuration,
  timelineJobIds,
  type CreaTimelineV1,
} from "../lib/crea-timeline";

export const MONTAGE_LIMITS = {
  /** Sačuvanih projekata po korisniku. */
  perUser: 50,
  titleChars: 80,
  /** Radova iz galerije u jednom projektu. */
  jobIds: 80,
} as const;

export const MONTAGE_ORIGINS = ["rucno", "strip", "objasnjenje", "reklama", "ritam", "shorts"] as const;
export type MontageOrigin = (typeof MONTAGE_ORIGINS)[number];

export type MontageRejectReason =
  | "NEISPRAVAN_DOKUMENT"
  | "PREVISE_RADOVA"
  | "RAD_NIJE_DOSTUPAN"
  | "LIMIT_PROJEKATA"
  | "PROJEKAT_NIJE_DOSTUPAN";

/** Ime projekta: jedan red, bez viška razmaka, najviše 80 znakova; prazno = „Montaža". */
export function cleanMontageTitle(title: string): string {
  const clean = Array.from(title.replace(/\s+/g, " ").trim()).slice(0, MONTAGE_LIMITS.titleChars).join("");
  return clean.length > 0 ? clean : "Montaža";
}

type JobKind = "image" | "video" | "audio";

/**
 * Za svaki rad iz galerije: koje vrste sme da bude. Klip na glavnoj traci i
 * slika u slici su video ili slika (tačno ona vrsta koju dokument kaže), a zvuk
 * je zvuk ili video (muzika iz videa).
 */
export function jobKindNeeds(timeline: CreaTimelineV1): Map<string, Set<JobKind>> {
  const needs = new Map<string, Set<JobKind>>();
  const require = (jobId: string, kinds: JobKind[]) => {
    const current = needs.get(jobId);
    if (!current) {
      needs.set(jobId, new Set(kinds));
      return;
    }
    // Isti rad na dva mesta mora da zadovolji oba.
    for (const kind of [...current]) if (!kinds.includes(kind)) current.delete(kind);
  };
  for (const clip of [...timeline.main, ...timeline.overlay]) {
    if ("jobId" in clip.src) require(clip.src.jobId, [clip.media]);
  }
  for (const clip of timeline.audio) {
    if ("jobId" in clip.src) require(clip.src.jobId, ["audio", "video"]);
  }
  return needs;
}

export type ParsedMontage = {
  timeline: CreaTimelineV1;
  durationS: number;
  jobIds: string[];
  needs: Map<string, Set<JobKind>>;
};

/** Dokument sa klijenta → montaža koju server sme da sačuva, ili razlog odbijanja. */
export function parseMontageDoc(doc: string): { ok: true; montage: ParsedMontage } | { ok: false; reason: MontageRejectReason } {
  const parsed = parseTimeline(doc);
  if (!parsed.ok) return { ok: false, reason: "NEISPRAVAN_DOKUMENT" };
  const jobIds = timelineJobIds(parsed.timeline);
  if (jobIds.length > MONTAGE_LIMITS.jobIds) return { ok: false, reason: "PREVISE_RADOVA" };
  return {
    ok: true,
    montage: {
      timeline: parsed.timeline,
      durationS: Math.round(timelineDuration(parsed.timeline) * 1000) / 1000,
      jobIds,
      needs: jobKindNeeds(parsed.timeline),
    },
  };
}

/** Rad iz galerije sme u montažu: moj, gotov, nije DEMO i prave je vrste. */
export function jobUsableInMontage(
  job: { userId: string; status: string; kind: JobKind; isMock: boolean } | null,
  userId: string,
  kinds: ReadonlySet<JobKind>,
): boolean {
  return job !== null && job.userId === userId && job.status === "done" && !job.isMock && kinds.has(job.kind);
}

