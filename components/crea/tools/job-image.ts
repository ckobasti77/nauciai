"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";

/**
 * Slika rada iz galerije za korak na uređaju (K12: mreža uglova, slojevi).
 * Convex storage šalje CORS (K04), pa `fetch → blob → <img>` ne prlja platno.
 * Ide preko `<img>`, ne `createImageBitmap`: DEMO izlaz (mock bez ključa) je
 * SVG, koji `createImageBitmap` u Chrome-u ne dekodira.
 */
export async function loadImageFromUrl(url: string, signal?: AbortSignal): Promise<{ image: HTMLImageElement; blob: Blob; release: () => void }> {
  let blob: Blob;
  try {
    const response = await fetch(url, signal ? { signal } : undefined);
    if (!response.ok) throw new Error(String(response.status));
    blob = await response.blob();
  } catch (error) {
    throw new CreaLocalAiError(signal?.aborted ? "ABORTED" : "NETWORK", error);
  }
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw new CreaLocalAiError("BAD_INPUT", error);
  }
  return { image, blob, release: () => URL.revokeObjectURL(objectUrl) };
}

/** Prirodna veličina slike (SVG bez `width`/`height` dobija 512, kao DEMO plakat). */
export function naturalSize(image: HTMLImageElement): { width: number; height: number } {
  return { width: image.naturalWidth || 512, height: image.naturalHeight || 512 };
}

/** Posao koji je alat upravo naručio (živ status iz Convex-a; `null` dok nema posla). */
export function useWatchedJob(jobId: Id<"generationJobs"> | null) {
  return useQuery(api.studio.getJobForDetail, jobId ? { jobId } : "skip") ?? null;
}
