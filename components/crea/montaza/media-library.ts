"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getFile, putFile, reversedFileId } from "@/components/crea/montaza/draft-store";
import { loadImageBitmap, probeMedia, videoThumbnail, type MediaKind } from "@/components/crea/video/engine/media";
import { api } from "@/convex/_generated/api";
import { mediaKey, timelineJobIds, timelineLocalFileIds, type CreaTimelineV1, type MediaRef } from "@/lib/crea-timeline";

/**
 * Mediji montaže (K19): za svaki izvor iz vremenske linije - adresa za `<video>`,
 * fajl (sa uređaja), trajanje, veličina, sličica i (za fotke) slika za crtanje.
 * Radovi iz galerije dobijaju potpisanu adresu iz `creaMontages.resolveMedia`
 * (istekao/obrisan = `expired`), fajlovi sa uređaja dolaze iz IndexedDB-a
 * (nema ih = `missing`: projekat je otvoren na drugom uređaju).
 *
 * Stanje je samo ono što je stiglo asinhrono (`known`); sve ostalo (npr. „učitava
 * se") izvodi se pri renderu, pa efekti nikad ne postavljaju stanje sinhrono.
 */

export type MediaStatus = "loading" | "ready" | "expired" | "missing" | "unreadable";

export type MediaEntry = {
  key: string;
  ref: MediaRef;
  kind: MediaKind;
  name: string;
  status: MediaStatus;
  url: string | null;
  blob: Blob | null;
  durationS: number | null;
  width: number | null;
  height: number | null;
  thumbUrl: string | null;
  bitmap: ImageBitmap | null;
};

export type NewMedia = { ref: MediaRef; kind: MediaKind; name: string; url: string; blob: Blob | null };

/** Najduža stranica fotke u memoriji: dovoljno za 1080p i Ken Burns do 2×. */
const IMAGE_MAX_SIDE = 2400;

export function kindOfFile(file: Blob): MediaKind | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

function baseEntry(media: NewMedia, status: MediaStatus): MediaEntry {
  return {
    key: mediaKey(media.ref),
    ref: media.ref,
    kind: media.kind,
    name: media.name,
    status,
    url: media.url || null,
    blob: media.blob,
    durationS: null,
    width: null,
    height: null,
    thumbUrl: null,
    bitmap: null,
  };
}

/** Trajanje, veličina, sličica i slika za crtanje (bez stanja - samo rezultat). */
async function probeEntry(entry: MediaEntry, track: (url: string) => string): Promise<MediaEntry> {
  const source = entry.blob ?? entry.url;
  if (!source) return entry;
  const probed = await probeMedia(entry.kind, source);
  if (!probed) return { ...entry, status: "unreadable" };
  let bitmap: ImageBitmap | null = null;
  let thumbUrl = entry.kind === "image" ? entry.url : null;
  if (entry.kind === "image") bitmap = await loadImageBitmap(source, IMAGE_MAX_SIDE).catch(() => null);
  if (entry.kind === "video") {
    const thumb = await videoThumbnail(source, 0.2, 96);
    thumbUrl = thumb ? track(thumb) : null;
  }
  return { ...entry, ...probed, bitmap, thumbUrl, status: entry.kind === "image" && !bitmap ? "unreadable" : "ready" };
}

export function useMediaLibrary(timeline: CreaTimelineV1, enabled: boolean) {
  const [known, setKnown] = useState<ReadonlyMap<string, MediaEntry>>(() => new Map());
  const [reversed, setReversed] = useState<ReadonlyMap<string, { blob: Blob; url: string }>>(() => new Map());
  const objectUrls = useRef<string[]>([]);
  const inflight = useRef(new Map<string, Promise<MediaEntry>>());
  const reversedRef = useRef(reversed);
  useEffect(() => {
    reversedRef.current = reversed;
  }, [reversed]);

  const track = useCallback((url: string) => {
    objectUrls.current.push(url);
    return url;
  }, []);
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const remember = useCallback((entry: MediaEntry) => {
    setKnown((previous) => new Map(previous).set(entry.key, entry));
  }, []);

  /** Nov izvor (iz galerije ili sa uređaja): provera da ga pregledač ume. Jednom po izvoru. */
  const prepare = useCallback(
    (media: NewMedia): Promise<MediaEntry> => {
      const key = mediaKey(media.ref);
      const running = inflight.current.get(key);
      // Fajl koji alat preda uz blob (K21: glas, slike, isečen klip) ne sme da sačeka
      // pretragu IndexedDB-a koja je za isti id već krenula - ona bi ga proglasila „nema".
      if (running && !media.blob) return running;
      const promise = probeEntry(baseEntry(media, "loading"), track).then((entry) => {
        remember(entry);
        return entry;
      });
      inflight.current.set(key, promise);
      return promise;
    },
    [remember, track],
  );

  // Radovi iz galerije koje montaža koristi: potpisane adrese (i „istekao").
  const jobKey = useMemo(() => timelineJobIds(timeline).join(","), [timeline]);
  const jobIds = useMemo(() => (jobKey ? jobKey.split(",") : []), [jobKey]);
  // Bez prijave nema galerije (upit bi bacio `Unauthorized`).
  const { isAuthenticated } = useConvexAuth();
  const resolved = useQuery(api.creaMontages.resolveMedia, isAuthenticated && enabled && jobIds.length > 0 ? { jobIds } : "skip");

  useEffect(() => {
    if (!resolved) return;
    for (const [jobId, media] of Object.entries(resolved)) {
      const kind: MediaKind = media.kind === "image" ? "image" : media.kind === "audio" ? "audio" : "video";
      if (media.expired || !media.url) continue;
      void prepare({ ref: { jobId }, kind, name: "", url: media.url, blob: null });
    }
  }, [resolved, prepare]);

  // Fajlovi sa uređaja iz nacrta: iz IndexedDB-a (na drugom uređaju ih nema).
  const fileKey = useMemo(() => timelineLocalFileIds(timeline).join(","), [timeline]);
  const [missingFiles, setMissingFiles] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!fileKey) return;
    for (const fileId of fileKey.split(",")) {
      const key = `file:${fileId}`;
      if (inflight.current.has(key)) continue;
      const loading = getFile(fileId)
        .catch(() => null)
        .then((stored) => {
          if (!stored) {
            setMissingFiles((previous) => new Set(previous).add(fileId));
            return baseEntry({ ref: { localFileId: fileId }, kind: "video", name: "", url: "", blob: null }, "missing");
          }
          inflight.current.delete(key);
          return prepare({
            ref: { localFileId: fileId },
            kind: kindOfFile(stored.blob) ?? "video",
            name: stored.name,
            url: track(URL.createObjectURL(stored.blob)),
            blob: stored.blob,
          });
        });
      inflight.current.set(key, loading);
    }
  }, [fileKey, prepare, track]);

  /** Sve što montaža zna o izvorima: stiglo + izvedeno („učitava se", „istekao", „nema fajla"). */
  const entries = useMemo(() => {
    const all = new Map(known);
    for (const jobId of jobIds) {
      const key = `job:${jobId}`;
      if (all.has(key)) continue;
      const media = resolved?.[jobId];
      const kind: MediaKind = media?.kind === "image" ? "image" : media?.kind === "audio" ? "audio" : "video";
      all.set(key, baseEntry({ ref: { jobId }, kind, name: "", url: media?.url ?? "", blob: null }, media && (media.expired || !media.url) ? "expired" : "loading"));
    }
    for (const fileId of fileKey ? fileKey.split(",") : []) {
      const key = `file:${fileId}`;
      if (all.has(key)) continue;
      all.set(key, baseEntry({ ref: { localFileId: fileId }, kind: "video", name: "", url: "", blob: null }, missingFiles.has(fileId) ? "missing" : "loading"));
    }
    return all as ReadonlyMap<string, MediaEntry>;
  }, [known, jobIds, resolved, fileKey, missingFiles]);

  /** Sačuvaj fajl sa uređaja u nacrt (IndexedDB); bez IndexedDB-a ostaje samo u memoriji. */
  const storeFile = useCallback(async (id: string, file: File) => {
    await putFile(id, file, file.name).catch(() => undefined);
  }, []);

  /** Obrnut pomoćni snimak (K17-9): iz memorije, iz IndexedDB-a ili nov. */
  const ensureReversed = useCallback(
    async (
      key: string,
      source: Blob | string,
      range: { in: number; out: number },
      options: { maxLongSide: number; signal: AbortSignal; onProgress: (fraction: number) => void },
    ): Promise<Blob> => {
      const inMemory = reversedRef.current.get(key);
      if (inMemory) return inMemory.blob;
      const stored = await getFile(reversedFileId(key)).catch(() => null);
      let blob = stored?.blob ?? null;
      if (!blob) {
        const { buildReversedClip } = await import("@/components/crea/video/engine/reverse");
        blob = await buildReversedClip(source, range, options);
        await putFile(reversedFileId(key), blob, "obrnuto.mp4").catch(() => undefined);
      }
      const ready = blob;
      const url = track(URL.createObjectURL(ready));
      setReversed((previous) => new Map(previous).set(key, { blob: ready, url }));
      return ready;
    },
    [track],
  );

  /** Već napravljeni obrnuti snimci iz IndexedDB-a (posle otvaranja nacrta). */
  const loadReversed = useCallback(
    async (keys: readonly string[]) => {
      for (const key of keys) {
        if (reversedRef.current.has(key)) continue;
        const stored = await getFile(reversedFileId(key)).catch(() => null);
        if (!stored) continue;
        const url = track(URL.createObjectURL(stored.blob));
        setReversed((previous) => new Map(previous).set(key, { blob: stored.blob, url }));
      }
    },
    [track],
  );

  const get = useCallback((ref: MediaRef) => entries.get(mediaKey(ref)), [entries]);
  const sourceFor = useCallback(
    (ref: MediaRef): Blob | string | null => {
      const entry = entries.get(mediaKey(ref));
      return entry && entry.status === "ready" ? (entry.blob ?? entry.url) : null;
    },
    [entries],
  );

  return { entries, reversed, get, prepare, storeFile, sourceFor, ensureReversed, loadReversed, track };
}

export type MediaLibrary = ReturnType<typeof useMediaLibrary>;
