/* eslint-disable @next/next/no-img-element -- pregled je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

import { ImageUp, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { ToolSource } from "@/components/crea/tools/types";
import { FullScreenDropOverlay, useFullScreenDrop } from "@/components/studio/drop-slot";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_TOOL_COPY, CREA_VERSION_COPY } from "@/lib/crea-copy";
import { FORMAT_INPUT_MAX_BYTES, looksLikeHeic } from "@/lib/crea-image-format";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import type { Locale } from "@/lib/i18n";

/**
 * `sourceJobId`: slika je izlaz rada iz galerije (K05), pa rezultat alata postaje njegova verzija.
 * `original`: HEIC sa iPhone-a pre pretvaranja u JPG (K09) - iz njega se čitaju skriveni podaci.
 */
export type PickedImage = {
  file: File;
  url: string;
  key: string;
  sourceJobId?: Id<"generationJobs">;
  original?: File;
};

/** Izbor fajla prihvata i HEIC, koji neki sistemi ne prijavljuju kao `image/*`. */
export const IMAGE_INPUT_ACCEPT = "image/*,.heic,.heif";

/**
 * Jedan ulaz slike za lokalne alate. Alat ima tačno jednu metu za sliku, pa
 * ceo ekran prima prevučen fajl (konvencija iz AGENTS.md, isti obrazac kao
 * avatar i composer); tek posle provere da je to slika do 50 MB fajl ulazi u alat.
 * Ništa se ne šalje - pregled je lokalni `blob:` URL.
 *
 * `source` (K05, „Besplatno sredi u alatu" iz detalja rada): slika se jednom preuzme
 * iz galerije (Convex storage šalje CORS, vidi K04) i ulazi kao da je izabrana.
 */
export function useImageInput(source?: ToolSource | null) {
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [problem, setProblem] = useState<"notImage" | "tooBig" | "heicFailed" | null>(null);
  const [failedSourceId, setFailedSourceId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  // Poslednji izbor pobeđuje: HEIC koji se još pretvara ne sme da pregazi noviji fajl.
  const pickSeq = useRef(0);

  useEffect(
    () => () => {
      if (picked) URL.revokeObjectURL(picked.url);
    },
    [picked],
  );

  const choose = useCallback((file: File | undefined, sourceJobId?: Id<"generationJobs">) => {
    if (!file) return;
    const seq = ++pickSeq.current;
    const heic = looksLikeHeic(file.name, file.type);
    if (!heic && !file.type.startsWith("image/")) {
      setProblem("notImage");
      return;
    }
    if (file.size > FORMAT_INPUT_MAX_BYTES) {
      setProblem("tooBig");
      return;
    }
    setProblem(null);
    const accept = (ready: File, original?: File) =>
      setPicked({
        file: ready,
        url: URL.createObjectURL(ready),
        key: `${file.name}:${file.size}:${file.lastModified}:${Date.now()}`,
        ...(sourceJobId ? { sourceJobId } : {}),
        ...(original ? { original } : {}),
      });
    if (!heic) {
      setConverting(false);
      accept(file);
      return;
    }
    // HEIC sa iPhone-a: pretvori u JPG na uređaju (lenjo učitan dekoder), pa nastavi kao sa svakom slikom.
    setConverting(true);
    void import("@/components/crea/tools/heic")
      .then(({ heicToJpeg }) => heicToJpeg(file))
      .then((jpeg) => {
        if (seq === pickSeq.current) accept(jpeg, file);
      })
      .catch(() => {
        if (seq === pickSeq.current) setProblem("heicFailed");
      })
      .finally(() => {
        if (seq === pickSeq.current) setConverting(false);
      });
  }, []);

  const sourceJobId = source?.jobId ?? null;
  const sourceUrl = source?.url ?? null;
  const [loadedSourceId, setLoadedSourceId] = useState<string | null>(null);
  useEffect(() => {
    if (!sourceJobId || !sourceUrl) return;
    let alive = true;
    void fetch(sourceUrl)
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
      .then((blob) => {
        if (!alive) return;
        const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
        choose(new File([blob], `crea-${sourceJobId.slice(-6)}.${extension}`, { type: blob.type }), sourceJobId);
        setLoadedSourceId(sourceJobId);
      })
      .catch(() => {
        if (alive) setFailedSourceId(sourceJobId);
      });
    return () => {
      alive = false;
    };
  }, [sourceJobId, sourceUrl, choose]);

  const sourceStatus: "loading" | "failed" | null =
    sourceJobId === null || loadedSourceId === sourceJobId ? null : failedSourceId === sourceJobId ? "failed" : "loading";

  return { picked, problem, choose, sourceStatus, converting };
}

export function ImageInput({
  locale,
  input,
  disabled,
  fullScreenDrop = true,
  chooseLabel,
}: {
  locale: Locale;
  input: ReturnType<typeof useImageInput>;
  disabled: boolean;
  /** Druga slika u istom alatu (npr. pozadina, K11) ne prima prevlačenje preko celog ekrana - meta je samo jedna. */
  fullScreenDrop?: boolean;
  chooseLabel?: string;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { picked, problem, sourceStatus, converting } = input;
  const locked = disabled || converting;
  const dragging = useFullScreenDrop(!locked && fullScreenDrop, (files) => input.choose(files[0]));

  return (
    <div>
      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          input.choose(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {picked ? (
        <div className="flex flex-wrap items-center gap-4">
          <img
            src={picked.url}
            alt=""
            className="surface-media size-24 shrink-0 bg-paper object-cover shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate type-body-sm font-black text-ink">{picked.file.name}</p>
            <p className="font-mono text-xs font-bold text-muted">{formatBytes(picked.file.size, locale)}</p>
            <button
              type="button"
              disabled={locked}
              onClick={() => fileRef.current?.click()}
              className="igra-press mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              {CREA_TOOL_COPY.otherFile[locale]}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={locked}
          onClick={() => fileRef.current?.click()}
          className="surface-inset flex min-h-36 w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-line bg-paper p-5 text-center text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
        >
          <span className="grid size-12 place-items-center rounded-full border-2 border-ink bg-paper-strong">
            <ImageUp aria-hidden="true" className="size-6" />
          </span>
          <span className="type-body font-black">{chooseLabel ?? CREA_TOOL_COPY.chooseFile[locale]}</span>
          {fullScreenDrop ? <span className="type-body-sm font-semibold text-muted">{CREA_TOOL_COPY.dropHint[locale]}</span> : null}
        </button>
      )}

      {converting ? (
        <p role="status" className="mt-2 inline-flex items-center gap-2 type-body-sm font-bold text-muted">
          <Spinner size="xs" />
          {CREA_TOOL_COPY.heicConverting[locale]}
        </p>
      ) : null}

      {sourceStatus ? (
        <p role="status" className="mt-2 type-body-sm font-bold text-muted">
          {CREA_VERSION_COPY[sourceStatus === "loading" ? "sourceLoading" : "sourceFailed"][locale]}
        </p>
      ) : null}

      {problem ? (
        <p role="alert" className="mt-2 type-body-sm font-black text-red-700 dark:text-red-300">
          {CREA_TOOL_COPY[problem][locale]}
        </p>
      ) : null}

      {dragging ? (
        <FullScreenDropOverlay label={CREA_TOOL_COPY.dropLabel[locale]} hint={CREA_TOOL_COPY.dropBody[locale]} />
      ) : null}
    </div>
  );
}
