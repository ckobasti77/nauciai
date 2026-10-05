"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { BrainCircuit } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { StudioTileJob } from "@/components/app/studio-media-tile";
import { useCreaDeviceCaps } from "@/components/crea/use-crea-device";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CLIP_IMAGE_SIZE, clipCropRect } from "@/lib/crea-clip";
import { fillCopy } from "@/lib/crea-copy";
import { classifyDevice } from "@/lib/crea-device";
import { CREA_LIBRARY_COPY as L } from "@/lib/crea-library-copy";
import { CLIP_TEXT_AUX_FILES, CREA_LOCAL_MODELS, CREA_LOCAL_RUNTIMES } from "@/lib/crea-local-ai/models";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import type { ClipEncoder } from "@/lib/crea-local-ai/runtime";
import type { Locale } from "@/lib/i18n";

const STORAGE_KEY = "crea-smart-search";
const DOWNLOAD_BYTES =
  CREA_LOCAL_MODELS["clip-vit-b32"].bytes +
  CREA_LOCAL_MODELS["mclip-text"].bytes +
  CLIP_TEXT_AUX_FILES.vocab.bytes +
  CLIP_TEXT_AUX_FILES.dense.bytes +
  CREA_LOCAL_RUNTIMES.onnx.bytes;
/** Koliko čeka posle poslednjeg slova pre nego što pita CLIP (ms). */
const QUERY_DEBOUNCE_MS = 450;

export type SmartSearchFilters = {
  kind?: "image" | "video" | "audio";
  projectId?: Id<"studioProjects">;
  modelSlug?: string;
  favorite?: boolean;
  cost?: "free" | "paid";
};

function wantedBefore(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type Phase =
  | { name: "off" }
  | { name: "loading"; percent: number | null }
  | { name: "ready"; encoder: ClipEncoder }
  | { name: "failed" };

/** Slika iz galerije → 224 × 224 RGBA (centralni kvadrat, kao CLIP pretprocesor). */
async function clipPixels(url: string): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const crop = clipCropRect(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = CLIP_IMAGE_SIZE;
  canvas.height = CLIP_IMAGE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("CANVAS");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, crop.x, crop.y, crop.size, crop.size, 0, 0, CLIP_IMAGE_SIZE, CLIP_IMAGE_SIZE);
  bitmap.close();
  return context.getImageData(0, 0, CLIP_IMAGE_SIZE, CLIP_IMAGE_SIZE).data;
}

/**
 * Pametna pretraga (K16, S43): višejezični CLIP na uređaju (računar sa WebGPU-om).
 * Kad se uključi: preuzme modele (jednom, keš), „upozna" slike korisnika (vektori
 * idu u Convex vektorski indeks) i za svaki upit vrati slike po onome što se na
 * njima VIDI. Na ostalim uređajima samo kaže da radi obična pretraga po opisu.
 */
export function SmartSearch({
  locale,
  query,
  filters,
  onResults,
}: {
  locale: Locale;
  query: string;
  filters: SmartSearchFilters;
  onResults: (jobs: StudioTileJob[] | null) => void;
}) {
  const caps = useCreaDeviceCaps();
  const capable = caps !== null && classifyDevice(caps) === "desktop-gpu";
  // Ko je već uključio pametnu pretragu, dobija je odmah (modeli su u kešu uređaja).
  const [phase, setPhase] = useState<Phase>(() => (wantedBefore() ? { name: "loading", percent: null } : { name: "off" }));
  const pending = useQuery(api.creaSearch.pendingEmbeddings, phase.name === "ready" ? { limit: 8 } : "skip");
  const saveEmbeddings = useMutation(api.creaSearch.saveEmbeddings);
  const semanticSearch = useAction(api.creaSearch.semanticSearch);
  const indexingRef = useRef(false);
  const failedRef = useRef(new Set<string>());

  async function load() {
    try {
      const { loadClip } = await import("@/lib/crea-local-ai/runtime");
      const encoder = await loadClip({
        onProgress: (progress) => setPhase({ name: "loading", percent: progress.percent }),
      });
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {}
      setPhase({ name: "ready", encoder });
    } catch {
      setPhase({ name: "failed" });
    }
  }

  const resumeRef = useRef(false);
  useEffect(() => {
    if (!capable || resumeRef.current || phase.name !== "loading") return;
    resumeRef.current = true;
    void load();
  });

  // „Upoznavanje" slika: tura po tura, dok `pendingEmbeddings` ima šta da vrati.
  useEffect(() => {
    if (phase.name !== "ready" || !pending || indexingRef.current) return;
    const batch = pending.pending.filter((item) => !failedRef.current.has(item.jobId));
    if (batch.length === 0) return;
    indexingRef.current = true;
    const encoder = phase.encoder;
    void (async () => {
      const items: Array<{ jobId: Id<"generationJobs">; embedding: number[] }> = [];
      for (const item of batch) {
        try {
          items.push({ jobId: item.jobId, embedding: await encoder.embedImage(await clipPixels(item.url)) });
        } catch {
          failedRef.current.add(item.jobId);
        }
      }
      try {
        if (items.length > 0) await saveEmbeddings({ items });
      } catch {
        for (const item of items) failedRef.current.add(item.jobId);
      } finally {
        indexingRef.current = false;
      }
    })();
  }, [phase, pending, saveEmbeddings]);

  // Upit → vektor → slične slike. Prazan upit ili ugašena pretraga = bez pogodaka „po slici".
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    const text = query.trim();
    if (phase.name !== "ready" || text.length < 2) {
      onResults(null);
      return;
    }
    let alive = true;
    const encoder = phase.encoder;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const embedding = await encoder.embedText(text);
          const jobs = await semanticSearch({ embedding, ...(JSON.parse(filterKey) as SmartSearchFilters) });
          if (alive) onResults(jobs as unknown as StudioTileJob[]);
        } catch {
          if (alive) onResults(null);
        }
      })();
    }, QUERY_DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, phase, filterKey, semanticSearch, onResults]);

  if (caps === null) return null;
  if (!capable) {
    return <p className="type-caption font-semibold text-muted">{L.smartUnavailable[locale]}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-live="polite">
      {phase.name === "off" || phase.name === "failed" ? (
        <>
          <button
            type="button"
            onClick={() => {
              resumeRef.current = true;
              setPhase({ name: "loading", percent: 0 });
              void load();
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 pointer-coarse:min-h-11 studio-focus-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <BrainCircuit aria-hidden="true" className="size-3.5" />
            {L.smartToggle[locale]} · {L.smartStart[locale]}
          </button>
          <span className="type-caption font-semibold text-muted">
            {phase.name === "failed"
              ? L.smartFailed[locale]
              : `${L.smartHint[locale]} ${fillCopy(L.smartDownload[locale], { size: formatBytes(DOWNLOAD_BYTES, locale) })}`}
          </span>
        </>
      ) : phase.name === "loading" ? (
        <span className="inline-flex items-center gap-2 type-caption font-extrabold text-ink">
          <Spinner size="xs" />
          {fillCopy(L.smartLoading[locale], { percent: phase.percent === null ? "" : `${Math.round(phase.percent)} %` })}
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 type-caption font-extrabold text-ink">
          <BrainCircuit aria-hidden="true" className="size-3.5" />
          {pending && pending.embedded < pending.total && pending.pending.length > 0
            ? fillCopy(L.smartIndexing[locale], { done: pending.embedded, total: pending.total })
            : fillCopy(L.smartReady[locale], { n: pending?.embedded ?? 0 })}
        </span>
      )}
    </div>
  );
}
