"use client";

import { Download, FolderOpen, Save } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useSaveLocalResult } from "@/components/crea/use-save-local-result";
import { downloadBlob } from "@/components/crea/zvuk/audio-render";
import { FOCUS } from "@/components/crea/zvuk/uredjivac/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import type { Id } from "@/convex/_generated/dataModel";
import { exportFileName } from "@/lib/crea-audio-edit";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import { creaSaveErrorMessage } from "@/lib/crea-copy";
import { recordingExtension } from "@/lib/crea-recorder";
import { creaShellQuery } from "@/lib/crea-shell";
import { CREA_INPUT_PARAM } from "@/lib/crea-versions";
import type { Locale } from "@/lib/i18n";

/** Galerija prima zvuk do 50 MB (`LOCAL_RESULT_MAX_BYTES.audio`). */
const GALLERY_MAX_BYTES = 50 * 1024 * 1024;

export type AudioResult = { kind: "buffer"; buffer: AudioBuffer } | { kind: "blob"; blob: Blob };

async function asBuffer(result: AudioResult): Promise<AudioBuffer> {
  if (result.kind === "buffer") return result.buffer;
  const { decodeSound } = await import("@/components/crea/zvuk/audio-render");
  const buffer = await decodeSound(result.blob, 44100, 2);
  if (!buffer) throw new Error("NEMA_ZVUKA");
  return buffer;
}

/**
 * Gotov zvuk alata (Crea K24): preslušaj, preuzmi MP3/WAV, „Sačuvaj u galeriju"
 * (0 kr, kao verzija izvora kad je izvor iz galerije). U galeriju ide MP3 (manji),
 * a snimak iz snimača ide kakav jeste (Opus/AAC, već mali).
 */
export function AudioResultPanel({
  locale,
  result,
  toolId,
  fileBase,
  canSave,
  projectId,
  parentJobId,
  params,
  openInEditor = false,
  children,
}: {
  locale: Locale;
  result: AudioResult;
  toolId: string;
  fileBase: string;
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  parentJobId?: Id<"generationJobs"> | null;
  params?: Record<string, string | number | boolean>;
  openInEditor?: boolean;
  children?: ReactNode;
}) {
  const saveLocalResult = useSaveLocalResult();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState<"mp3" | "wav" | "save" | null>(null);
  const [saved, setSaved] = useState<{ for: AudioResult; jobId: Id<"generationJobs"> } | null>(null);
  const [error, setError] = useState<{ for: AudioResult; message: string } | null>(null);
  const savedJobId = saved && saved.for === result ? saved.jobId : null;
  const errorMessage = error && error.for === result ? error.message : null;

  const previewUrl = useMemo(() => {
    if (result.kind === "blob") return URL.createObjectURL(result.blob);
    return null;
  }, [result]);
  const [wavUrl, setWavUrl] = useState<{ for: AudioResult; url: string } | null>(null);
  useEffect(() => () => (previewUrl ? URL.revokeObjectURL(previewUrl) : undefined), [previewUrl]);
  useEffect(() => () => (wavUrl ? URL.revokeObjectURL(wavUrl.url) : undefined), [wavUrl]);
  // WAV za pregled se pravi na zahtev (dugme „Pusti" pregledača) - ovde odmah, jer je brz za kratke snimke.
  const [preparing, setPreparing] = useState<AudioResult | null>(null);
  if (result.kind === "buffer" && preparing !== result && (!wavUrl || wavUrl.for !== result)) {
    setPreparing(result);
    void import("@/components/crea/zvuk/uredjivac/encode").then(({ encodeWav }) => {
      setWavUrl({ for: result, url: URL.createObjectURL(encodeWav(result.buffer)) });
    });
  }
  const playUrl = result.kind === "blob" ? previewUrl : wavUrl && wavUrl.for === result ? wavUrl.url : null;

  async function download(format: "mp3" | "wav" | "original") {
    setError(null);
    if (format === "original" && result.kind === "blob") {
      downloadBlob(result.blob, exportFileName(fileBase, recordingExtension(result.blob.type)));
      return;
    }
    setBusy(format === "mp3" ? "mp3" : "wav");
    try {
      const [{ encodeMp3, encodeWav }, buffer] = await Promise.all([import("@/components/crea/zvuk/uredjivac/encode"), asBuffer(result)]);
      const blob = format === "mp3" ? await encodeMp3(buffer) : encodeWav(buffer);
      downloadBlob(blob, exportFileName(fileBase, format === "mp3" ? "mp3" : "wav"));
    } catch {
      setError({ for: result, message: T.common.failed[locale] });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setError(null);
    setBusy("save");
    try {
      let blob: Blob;
      if (result.kind === "blob") {
        blob = result.blob;
      } else {
        const { encodeMp3, encodeWav } = await import("@/components/crea/zvuk/uredjivac/encode");
        blob = await encodeMp3(result.buffer).catch(() => encodeWav(result.buffer));
      }
      if (blob.size > GALLERY_MAX_BYTES) {
        setError({ for: result, message: T.result.tooBigForGallery[locale] });
        return;
      }
      const outcome = await saveLocalResult({ toolId, kind: "audio", blob, params, projectId, parentJobId: parentJobId ?? null });
      if (outcome.ok) setSaved({ for: result, jobId: outcome.jobId });
      else setError({ for: result, message: creaSaveErrorMessage(outcome.reason, locale) });
    } catch (caught) {
      setError({ for: result, message: creaSaveErrorMessage(caught instanceof Error ? caught.message : String(caught), locale) });
    } finally {
      setBusy(null);
    }
  }

  const editorHref = savedJobId
    ? (() => {
        const query = new URLSearchParams(creaShellQuery({ area: "zvuk", mode: "uredjivac", tool: "zvuk.uredjivac" }, searchParams));
        query.set(CREA_INPUT_PARAM, savedJobId);
        return `${pathname}?${query.toString()}`;
      })()
    : null;

  return (
    <div className="space-y-3" aria-live="polite">
      <p className="type-body font-black text-ink">{T.result.title[locale]}</p>
      {playUrl ? <audio src={playUrl} controls preload="metadata" className="h-11 w-full max-w-xl" /> : null}
      {children}
      <div className="flex flex-wrap items-center gap-2">
        {result.kind === "blob" ? (
          <Button variant="secondary" icon={<Download aria-hidden="true" className="size-4" />} onClick={() => void download("original")}>
            {T.result.downloadOriginal[locale]}
          </Button>
        ) : null}
        <Button variant="secondary" loading={busy === "mp3"} disabled={busy !== null} icon={<Download aria-hidden="true" className="size-4" />} onClick={() => void download("mp3")}>
          {busy === "mp3" ? T.result.encoding[locale] : T.result.downloadMp3[locale]}
        </Button>
        <Button variant="secondary" loading={busy === "wav"} disabled={busy !== null} icon={<Download aria-hidden="true" className="size-4" />} onClick={() => void download("wav")}>
          {T.result.downloadWav[locale]}
        </Button>
        {canSave ? (
          <Button loading={busy === "save"} disabled={busy !== null || savedJobId !== null} icon={<Save aria-hidden="true" className="size-4" />} onClick={() => void save()}>
            {savedJobId ? T.result.saved[locale] : busy === "save" ? T.result.saving[locale] : T.result.save[locale]}
          </Button>
        ) : null}
        {openInEditor && editorHref ? (
          <Link href={editorHref} className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink", FOCUS)}>
            <FolderOpen aria-hidden="true" className="size-4" />
            {T.result.openInEditor[locale]}
          </Link>
        ) : null}
      </div>
      {!canSave ? <p className="type-body-sm font-semibold text-muted">{T.result.noAccess[locale]}</p> : null}
      <p className="type-body-sm font-semibold text-muted">
        {T.result.mp3Note[locale]}{" "}
        <a href="/licenses/THIRD-PARTY-NOTICES.txt" target="_blank" rel="noopener" className={cn("underline underline-offset-2", FOCUS)}>
          {T.result.licenses[locale]}
        </a>
      </p>
      {errorMessage ? (
        <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
