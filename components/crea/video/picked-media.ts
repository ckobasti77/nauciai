"use client";

import { useEffect, useMemo, useState } from "react";

import type { PickedImage } from "@/components/crea/tools/image-input";
import type { PickedVideo } from "@/components/crea/tools/video-input";
import type { StageFile } from "@/components/crea/video/timeline-stage";
import type { MediaRef, TimelineAspect } from "@/lib/crea-timeline";

/**
 * Izabran video ili fotka kao izvor montaže (K21): rad iz galerije ide kao
 * `{ jobId }` (bez kopije), fajl sa uređaja kao `{ localFileId }` + fajl za
 * pozornicu/IndexedDB. Id fajla je stabilan za isti izbor (ime, veličina, vreme).
 */

function stableId(prefix: string, key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `${prefix}-${(hash >>> 0).toString(36)}-${key.length.toString(36)}`;
}

export function videoAsMedia(picked: PickedVideo | null): { ref: MediaRef; file: StageFile | null } | null {
  if (!picked) return null;
  if (picked.sourceJobId) return { ref: { jobId: picked.sourceJobId }, file: null };
  const id = stableId("video", picked.key);
  return { ref: { localFileId: id }, file: { id, blob: picked.source as Blob, name: picked.name, kind: "video" } };
}

export function imageAsMedia(picked: PickedImage | null): { ref: MediaRef; file: StageFile | null } | null {
  if (!picked) return null;
  if (picked.sourceJobId) return { ref: { jobId: picked.sourceJobId }, file: null };
  const id = stableId("slika", picked.key);
  return { ref: { localFileId: id }, file: { id, blob: picked.file, name: picked.file.name, kind: "image" } };
}

export type VideoInfo = { durationS: number; width: number; height: number };

/** Trajanje i veličina izabranog videa kroz `<video>` (radi i bez WebCodecs-a). */
export function useVideoInfo(picked: PickedVideo | null): { status: "idle" | "loading" | "error" } | { status: "ready"; info: VideoInfo } {
  const [state, setState] = useState<{ key: string; info: VideoInfo | null } | null>(null);
  const key = picked?.key ?? null;
  const source = picked?.source ?? null;
  useEffect(() => {
    if (!key || !source) return;
    let alive = true;
    void (async () => {
      const { probeMedia } = await import("@/components/crea/video/engine/media");
      const probed = await probeMedia("video", source);
      if (!alive) return;
      const info = probed && probed.durationS && probed.width && probed.height ? { durationS: probed.durationS, width: probed.width, height: probed.height } : null;
      setState({ key, info });
    })();
    return () => {
      alive = false;
    };
  }, [key, source]);
  return useMemo(() => {
    if (!key) return { status: "idle" as const };
    if (!state || state.key !== key) return { status: "loading" as const };
    return state.info ? { status: "ready" as const, info: state.info } : { status: "error" as const };
  }, [key, state]);
}

/** Oblik montaže po videu: položen, uspravan ili kvadrat. */
export function aspectOf(width: number, height: number): TimelineAspect {
  const ratio = width / Math.max(1, height);
  return ratio > 1.2 ? "16:9" : ratio < 0.83 ? "9:16" : "1:1";
}

/** Preuzimanje tekstualnog fajla (SRT/VTT) bez servera. */
export function downloadText(text: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
