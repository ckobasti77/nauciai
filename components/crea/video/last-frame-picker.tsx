"use client";

import { Film, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { VideoJobGrid } from "@/components/crea/video/video-job-grid";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_VIDEO_COPY as T } from "@/lib/crea-video-copy";
import { frameFileName } from "@/lib/crea-video-frames";
import type { Locale } from "@/lib/i18n";

/** Kadar spreman za slot: fajl slike i rad iz kojeg je izvučen (ako je iz galerije). */
export type PickedFrame = { file: File; sourceJobId: Id<"generationJobs"> | null };

const BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 motion-reduce:transition-none";

/**
 * „Poslednji kadar iz videa" u composeru (Crea K18, V4): izaberi svoj video (ili
 * fajl sa uređaja), kadar se izvuče NA UREĐAJU (mediabunny, a bez WebCodecs-a
 * `<video>`), pa composer od njega pravi prvi kadar novog posla. Učitava se lenjo,
 * a motor (mediabunny) tek na izbor videa.
 */
export default function LastFramePicker({
  locale,
  onPicked,
  onClose,
}: {
  locale: Locale;
  onPicked: (frame: PickedFrame) => Promise<void>;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function take(source: Blob | string, key: string, sourceJobId: Id<"generationJobs"> | null) {
    setBusy(key);
    setError(null);
    try {
      const { extractFrame } = await import("@/components/crea/video/engine/frames");
      const frame = await extractFrame(source, "last");
      const file = new File([frame.blob], frameFileName(frame.timeS, frame.blob.type), { type: frame.blob.type });
      await onPicked({ file, sourceJobId });
    } catch {
      setError(T.frameError[locale]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label={T.lastFrame[locale]} className="surface-inset mt-3 space-y-3 border border-line bg-paper p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <Film aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink" />
        <p className="min-w-0 flex-1 text-sm font-bold text-ink">{T.lastFrameTitle[locale]}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={T.cancel[locale]}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <p className="type-body-sm font-black text-ink">{T.fromGallery[locale]}</p>
      <VideoJobGrid locale={locale} value={busy} disabled={busy !== null} onPick={(job) => void take(job.outputUrl, job._id, job._id)} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void take(file, "uredjaj", null);
          }}
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
          className={cn(BUTTON, "border-ink bg-paper-strong text-ink hover:-translate-y-0.5")}
        >
          <Upload aria-hidden="true" className="size-4" />
          {T.fromDevice[locale]}
        </button>
      </div>
      <div aria-live="polite">
        {busy ? (
          <p className="inline-flex items-center gap-2 type-body-sm font-bold text-ink">
            <Spinner size="xs" />
            {T.extracting[locale]}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
