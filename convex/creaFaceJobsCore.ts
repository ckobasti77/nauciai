/**
 * Lice u video alatima Cree (K20: V14 zamena lika, V20 Odglumi, V21/V23 lik
 * koji govori, V22 lipsync; plan K17-15, O5). Lice koje se pomera, govori ili
 * ulazi u tuđi video sme biti SAMO:
 *
 * - sopstveni Lik sa pristankom (`creaElements`, `canSwapWith`), ili
 * - rad iz sopstvene galerije koji je napravila Crea, i to samo od tvojih Likova
 *   sa pristankom ili samo iz opisa (bez okačene tuđe fotke).
 *
 * Ovo su čista pravila nad jednim redom; `creaFaceJobs.ts` ih primenjuje kroz
 * stablo (izlaz ranijeg rada koji je ušao kao ulaz se proverava rekurzivno).
 */

import { isMockRequestId } from "./studioCore";

/** Koliko koraka unazad se prati poreklo lica (scena → avatar → lipsync…). */
export const FACE_TRACE_DEPTH = 4;

/** Slotovi koji ne nose lice: zvuk i maska (crtež korisnika). */
const FACELESS_SLOTS = new Set(["audio", "mask"]);

/** Svi `storageId`-jevi iz ulaza posla koji mogu da nose lice. */
export function faceInputIds(inputs: Record<string, readonly string[]>): string[] {
  const ids: string[] = [];
  for (const [slot, list] of Object.entries(inputs)) {
    if (FACELESS_SLOTS.has(slot)) continue;
    for (const id of list) if (typeof id === "string") ids.push(id);
  }
  return ids;
}

export type FaceJobLike = {
  userId: string;
  status: string;
  kind: string;
  provider?: string;
  falRequestId?: string;
  outputStorageId?: string;
  parentJobId?: string;
};

/**
 * Može li ovaj rad uopšte da nosi lice za video alat: moj, gotov, sa izlazom,
 * pravi (ne DEMO plakat) i tražene vrste. Lokalni alat (reframe, boje…) sme
 * samo kao verzija drugog rada (roditelj) - fajl sa uređaja bez roditelja ne.
 */
export function jobMayCarryFace(job: FaceJobLike, userId: string, kinds: readonly string[]): boolean {
  if (job.userId !== userId || job.status !== "done" || !job.outputStorageId) return false;
  if (isMockRequestId(job.falRequestId)) return false;
  if (!kinds.includes(job.kind)) return false;
  if (job.provider === "local" && !job.parentJobId) return false;
  return true;
}

export type FaceJobKind = "avatar" | "pokret" | "usne" | "zamena";

/** Model i režim po vrsti posla - svi postojeći redovi kataloga. */
export const FACE_JOB_MODELS: Record<FaceJobKind, { slug: string; inputMode: string; faceSlot: string; mediaSlot: string }> = {
  avatar: { slug: "kling-avatar", inputMode: "image_audio", faceSlot: "image", mediaSlot: "audio" },
  pokret: { slug: "kling-motion", inputMode: "video_image", faceSlot: "image", mediaSlot: "video" },
  usne: { slug: "kling-lipsync", inputMode: "video_audio", faceSlot: "video", mediaSlot: "audio" },
  zamena: { slug: "kling-o3-edit", inputMode: "video", faceSlot: "image", mediaSlot: "video" },
};

/** Koliko slika Lika ide uz zamenu u videu (Kling O3: najviše 4 slike). */
export const VIDEO_SWAP_REFS = 3;

/**
 * Opis zamene glavne osobe u videu Likom (V14). Sastavlja ga server, kao i kod
 * „Zameni lik" na slici - klijent ne može da podmetne drugi opis.
 */
export function videoSwapPrompt(element: { name: string; description?: string | null }, refCount: number): string {
  const refs = refCount <= 1 ? "@Image1" : `${Array.from({ length: refCount - 1 }, (_, index) => `@Image${index + 1}`).join(", ")} and @Image${refCount}`;
  const note = element.description?.trim() ? ` (${element.description.trim()})` : "";
  return [
    `Replace the main person in the video with ${element.name}${note}, shown in ${refs}.`,
    `${element.name} must have the same face, hairstyle and body as in the reference images.`,
    "Keep the motion, pose, camera, lighting, background and timing exactly the same.",
  ].join(" ");
}
