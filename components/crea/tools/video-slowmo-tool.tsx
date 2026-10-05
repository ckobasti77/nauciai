"use client";

import { Snail } from "lucide-react";
import { useState } from "react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
import { ChoiceChips } from "@/components/crea/tools/choice-chips";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { useVideoInput, VideoInput, type PickedVideo } from "@/components/crea/tools/video-input";
import {
  outputLongSide,
  useVideoProbe,
  VideoProbeLine,
  VideoResult,
  videoFileName,
  videoTooLong,
  type VideoOutputExtra,
} from "@/components/crea/tools/video-tool-kit";
import { fillCopy } from "@/lib/crea-copy";
import type { CreaDeviceCaps } from "@/lib/crea-device";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { SLOWMO_FACTORS, SLOWMO_MAX_INPUT_S, slowmoDuration, slowmoFrames, type SlowmoFactor } from "@/lib/crea-slowmo";
import { exportSize } from "@/lib/crea-video-caps";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";

type Range = { start: number; end: number };

async function slowVideo(
  picked: PickedVideo,
  factor: SlowmoFactor,
  range: Range,
  caps: CreaDeviceCaps | null,
  context: ToolRunContext,
): Promise<CreaToolOutput<VideoOutputExtra>> {
  context.reportRunning();
  const engine = await import("@/components/crea/video/engine/transform");
  const info = await engine.probeVideo(picked.source);
  const size = exportSize(info.width, info.height, outputLongSide(caps));
  const { width, height } = size;
  const canvas = () => engine.workCanvas(width, height);

  // Dva izvorna kadra (prethodni i trenutni) i najviše 2 × factor izlaznih platna po pozivu.
  let previous = canvas();
  let current = canvas();
  let previousFrame: { timestamp: number; duration: number } | null = null;
  const outputs = Array.from({ length: factor * 2 }, canvas);
  let done = false;

  const emit = (from: { canvas: HTMLCanvasElement }, to: { canvas: HTMLCanvasElement } | null, frame: { timestamp: number; duration: number }, slot: number) =>
    slowmoFrames(frame, factor, to !== null).map((out, step) => {
      const target = outputs[slot + step]!;
      target.ctx.globalAlpha = 1;
      target.ctx.drawImage(from.canvas, 0, 0);
      if (to && out.blend > 0) {
        target.ctx.globalAlpha = out.blend;
        target.ctx.drawImage(to.canvas, 0, 0);
        target.ctx.globalAlpha = 1;
      }
      return { canvas: target.canvas, timestamp: out.timestamp, duration: out.duration };
    });

  const result = await engine.transformVideo({
    source: picked.source,
    width,
    height,
    audio: "drop",
    signal: context.signal,
    onProgress: (fraction) => context.reportProgress(fraction * 100),
    render: ({ sample, time, duration }) => {
      if (done || time + duration <= range.start + 1e-4) return null;
      sample.draw(current.ctx, 0, 0, width, height);
      const frame = { timestamp: Math.max(0, time - range.start), duration };
      const out = previousFrame ? emit(previous, current, previousFrame, 0) : [];
      const last = time + duration >= Math.min(range.end, info.durationS) - 1e-3;
      if (last) {
        out.push(...emit(current, null, frame, factor));
        done = true;
      }
      [previous, current] = [current, previous];
      previousFrame = frame;
      return out;
    },
  });
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
  const seconds = Math.min(range.end, info.durationS) - range.start;
  return {
    blob: result.blob,
    kind: "video",
    fileName: videoFileName("usporeno", `${factor}x`),
    previewUrl: URL.createObjectURL(result.blob),
    params: { puta: factor, od_s: Math.round(range.start * 10) / 10, sirina: width, visina: height },
    extra: { width, height, durationS: slowmoDuration(seconds, factor), hasAudio: false, audioDropped: false },
  };
}

/**
 * Usporeni snimak (Crea K20, V17): 2× ili 4× sporije, do 10 s izvora. Između
 * dva prava kadra idu meko stopljeni kadrovi (`lib/crea-slowmo.ts`), na uređaju,
 * bez AI-a - RIFE čeka zakucanu reviziju (ODLUKA K20). Zvuk se izbacuje.
 */
export default function VideoSlowmoTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const video = useVideoInput(source);
  const probe = useVideoProbe(video.picked);
  const [factor, setFactor] = useState<SlowmoFactor>(2);
  const [start, setStart] = useState(0);
  const picked = video.picked;
  const duration = probe.status === "ready" ? probe.info.durationS : 0;
  const maxStart = Math.max(0, Math.floor((duration - SLOWMO_MAX_INPUT_S) * 10) / 10);
  const from = Math.min(start, maxStart);
  const range = { start: from, end: Math.min(duration, from + SLOWMO_MAX_INPUT_S) };
  const tooLong =
    probe.status === "ready"
      ? videoTooLong(caps, exportSize(probe.info.width, probe.info.height, outputLongSide(caps)), slowmoDuration(range.end - range.start, factor), locale, false)
      : null;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={picked?.sourceJobId ?? null}
      canRun={picked !== null && probe.status === "ready" && tooLong === null}
      inputKey={picked ? `${picked.key}:${factor}:${from}` : null}
      runLabel={T.slowRun[locale]}
      icon={<Snail aria-hidden="true" className="size-5" />}
      run={(context) => slowVideo(picked!, factor, range, caps, context)}
      renderResult={(output) => <VideoResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-4">
          <VideoInput locale={locale} input={video} disabled={busy} />
          <VideoProbeLine locale={locale} probe={probe} />
          {tooLong ? <p className="type-body-sm font-black text-ink">{tooLong}</p> : null}
          <ChoiceChips<SlowmoFactor>
            legend={T.slowFactor[locale]}
            name="crea-video-slowmo-factor"
            options={SLOWMO_FACTORS.map((id) => ({ id, label: T.slowFactors[id][locale] }))}
            value={factor}
            onChange={setFactor}
            disabled={busy}
          />
          {maxStart > 0 ? (
            <label className="block">
              <span className="type-body-sm font-black text-ink">
                {fillCopy(T.slowStart[locale], { s: from.toLocaleString(locale === "sr" ? "sr-Latn-RS" : "en-GB") })}
              </span>
              <input
                type="range"
                min={0}
                max={Math.round(maxStart * 10)}
                step={1}
                value={Math.round(from * 10)}
                disabled={busy}
                onChange={(event) => setStart(Number(event.target.value) / 10)}
                className="mt-2 block h-11 w-full accent-ink"
              />
            </label>
          ) : null}
          <p className="type-body-sm font-semibold text-muted">{T.slowHow[locale]}</p>
          <p className="type-body-sm font-semibold text-muted">{T.slowAiSoon[locale]}</p>
          {busy ? <p className="type-body-sm font-semibold text-muted">{T.keepTabOpen[locale]}</p> : null}
        </div>
      )}
    </ToolRunner>
  );
}
