"use client";

import { useCallback, useMemo } from "react";

import type { MediaLibrary } from "@/components/crea/montaza/media-library";
import { useStickerImages } from "@/components/crea/montaza/use-sticker-images";
import type { ExportMedia } from "@/components/crea/video/engine/export";
import type { PlayerMedia } from "@/components/crea/video/engine/player";
import { mediaKey, reversedKey, type CreaTimelineV1, type MainClip, type MediaRef } from "@/lib/crea-timeline";

/**
 * Isti izvori za pregled i izvoz (K19): adrese i fajlovi iz biblioteke medija,
 * slike nalepnica i obrnuti snimci. `prepareReversed` pre izvoza obezbedi
 * obrnut snimak za svaki klip unazad/bumerang.
 */
export function useMontageMedia(timeline: CreaTimelineV1, library: MediaLibrary, maxLongSide: number) {
  const stickers = useStickerImages(timeline.stickers.map((sticker) => sticker.sticker));
  const { entries, reversed, ensureReversed, sourceFor } = library;

  const playerMedia = useMemo<PlayerMedia>(
    () => ({
      urlFor: (ref: MediaRef) => {
        const entry = entries.get(mediaKey(ref));
        return entry && entry.status === "ready" ? entry.url : null;
      },
      reversedUrlFor: (key: string) => reversed.get(key)?.url ?? null,
      imageFor: (ref: MediaRef) => entries.get(mediaKey(ref))?.bitmap ?? null,
      stickerFor: (id: string) => stickers.get(id) ?? null,
    }),
    [entries, reversed, stickers],
  );

  const exportMedia = useMemo<ExportMedia>(
    () => ({
      sourceFor,
      reversedFor: (key: string) => reversed.get(key)?.blob ?? null,
      imageFor: (ref: MediaRef) => entries.get(mediaKey(ref))?.bitmap ?? null,
      stickerFor: (id: string) => stickers.get(id) ?? null,
    }),
    [entries, reversed, sourceFor, stickers],
  );

  const reverseClip = useCallback(
    async (clip: MainClip, signal: AbortSignal, onProgress: (fraction: number) => void) => {
      const source = sourceFor(clip.src);
      if (!source) throw new Error("NEMA_IZVORA");
      return ensureReversed(reversedKey(clip.src, clip), source, { in: clip.in, out: clip.out }, { maxLongSide, signal, onProgress });
    },
    [ensureReversed, maxLongSide, sourceFor],
  );

  const prepareReversed = useCallback(
    async (clips: MainClip[], signal: AbortSignal) => {
      for (const clip of clips) await reverseClip(clip, signal, () => undefined);
    },
    [reverseClip],
  );

  return { playerMedia, exportMedia, reverseClip, prepareReversed };
}
