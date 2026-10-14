/* eslint-disable @next/next/no-img-element -- rezultat je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

import { ArrowRight, Film } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput, type PickedVideo } from "@/components/crea/tools/video-input";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { creaShellQuery } from "@/lib/crea-shell";
import { CREA_INPUT_PARAM } from "@/lib/crea-versions";
import { CREA_VIDEO_COPY as T } from "@/lib/crea-video-copy";
import { frameFileName } from "@/lib/crea-video-frames";

type FrameExtra = { timeS: number; durationS: number };

async function pullFrame(picked: PickedVideo, fraction: number, context: ToolRunContext): Promise<CreaToolOutput<FrameExtra>> {
  context.reportRunning();
  const { extractFrame } = await import("@/components/crea/video/engine/frames");
  const frame = await extractFrame(picked.source, fraction >= 1 ? "last" : { fraction }, context.signal);
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
  return {
    blob: frame.blob,
    kind: "image",
    fileName: frameFileName(frame.timeS, frame.blob.type),
    previewUrl: URL.createObjectURL(frame.blob),
    params: { kadar_s: Math.round(frame.timeS * 100) / 100, sirina: frame.width, visina: frame.height },
    extra: { timeS: frame.timeS, durationS: frame.durationS },
  };
}

/**
 * „Nastavi od poslednjeg kadra" (Crea K18, V4): kadar videa (podrazumevano
 * poslednji, ili bilo koji klizačem) izvuče se NA UREĐAJU - mediabunny sa
 * WebCodecs-om, a bez njega običan `<video>` - i sačuva kao slika-verzija videa.
 * „Nastavi odavde" otvara Video · Napravi sa tom slikom kao prvim kadrom (`?ulaz=`).
 */
export default function LastFrameTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const video = useVideoInput(source);
  const [percent, setPercent] = useState(100);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const picked = video.picked;
  const runKey = picked ? `${picked.key}:${percent}` : null;
  // Sačuvan kadar važi samo za ulaz iz kojeg je izvučen (drugi video ili drugi kadar = novi rezultat).
  const [saved, setSaved] = useState<{ key: string | null; jobId: Id<"generationJobs"> } | null>(null);
  const savedJobId = saved !== null && saved.key === runKey ? saved.jobId : null;

  const continueHref = savedJobId
    ? (() => {
        const query = new URLSearchParams(creaShellQuery({ area: "video", mode: "napravi", tool: null }, searchParams));
        query.set(CREA_INPUT_PARAM, savedJobId);
        return `${pathname}?${query.toString()}`;
      })()
    : null;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={picked?.sourceJobId ?? null}
      canRun={picked !== null}
      inputKey={runKey}
      runLabel={T.extract[locale]}
      icon={<Film aria-hidden="true" className="size-5" />}
      onSaved={(jobId) => setSaved({ key: runKey, jobId })}
      run={(context) => pullFrame(picked!, percent / 100, context)}
      renderResult={(output) => (
        <div className="space-y-3">
          <img
            src={output.previewUrl}
            alt=""
            className="surface-media max-h-[420px] w-full bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
          />
          <p className="type-body-sm font-bold text-muted">
            {fillCopy(T.pickedFrame[locale], { s: output.extra.timeS.toFixed(2) })} · {fillCopy(T.durationOf[locale], { s: output.extra.durationS.toFixed(1) })}
          </p>
          {continueHref ? (
            <Link
              href={continueHref}
              className="igra-press igra-shadow-ink inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {T.continueHere[locale]}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <p className="type-body-sm font-semibold text-muted">{T.continueHint[locale]}</p>
          )}
        </div>
      )}
    >
      {({ busy }) => (
        <div className="space-y-4">
          <VideoInput locale={locale} input={video} disabled={busy} />
          {picked ? (
            <label className="block">
              <span className="type-body-sm font-black text-ink">
                {T.whichFrame[locale]}: {percent >= 100 ? T.lastFrameChoice[locale] : `${percent} %`}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={percent}
                disabled={busy}
                onChange={(event) => setPercent(Number(event.target.value))}
                className="mt-2 block h-11 w-full accent-ink"
              />
            </label>
          ) : null}
        </div>
      )}
    </ToolRunner>
  );
}
