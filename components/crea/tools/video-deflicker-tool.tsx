"use client";

import { SunDim } from "lucide-react";

import { ToolRunner, type CreaToolOutput, type ToolRunContext } from "@/components/crea/tool-runner";
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
import { deflickerGains, flickerAmount, FLICKER_VISIBLE, frameLuma } from "@/lib/crea-deflicker";
import type { CreaDeviceCaps } from "@/lib/crea-device";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { exportSize } from "@/lib/crea-video-caps";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";
import type { Locale } from "@/lib/i18n";

/** Svetlina se meri na sličici - dovoljno za prosek, brzo. */
const LUMA_SIDE = 64;
const ANALYSIS_SHARE = 0.3;

function percent(value: number, locale: Locale): string {
  return (value * 100).toLocaleString(locale === "sr" ? "sr-Latn-RS" : "en-GB", { maximumFractionDigits: 1 });
}

async function deflickerVideo(picked: PickedVideo, caps: CreaDeviceCaps | null, locale: Locale, context: ToolRunContext): Promise<CreaToolOutput<VideoOutputExtra>> {
  context.reportRunning();
  const engine = await import("@/components/crea/video/engine/transform");
  const info = await engine.probeVideo(picked.source);
  const fps = info.fps;
  const count = Math.max(1, Math.round(info.durationS * fps));
  const times = Array.from({ length: count }, (_, index) => (index + 0.5) / fps);

  // 1) Svetlina svakog kadra.
  const lumas = new Array<number>(count).fill(0);
  const probe = engine.workCanvas(LUMA_SIDE, LUMA_SIDE, true);
  await engine.forEachFrameAt(
    picked.source,
    times,
    LUMA_SIDE,
    (canvas, _time, index) => {
      probe.ctx.drawImage(canvas, 0, 0, LUMA_SIDE, LUMA_SIDE);
      lumas[index] = frameLuma(probe.ctx.getImageData(0, 0, LUMA_SIDE, LUMA_SIDE).data);
      if (index % 10 === 0) context.reportProgress(((index + 1) / count) * ANALYSIS_SHARE * 100);
    },
    context.signal,
  );
  const gains = deflickerGains(lumas, fps);
  const before = flickerAmount(lumas, fps);
  const after = flickerAmount(lumas.map((luma, index) => luma * gains[index]!), fps);

  // 2) Svaki kadar pomnožen svojim pojačanjem (GPU kompozicija, bez čitanja piksela).
  const size = exportSize(info.width, info.height, outputLongSide(caps));
  const { canvas, ctx } = engine.workCanvas(size.width, size.height);
  const copy = engine.workCanvas(size.width, size.height);
  const result = await engine.transformVideo({
    source: picked.source,
    width: size.width,
    height: size.height,
    audio: "copy",
    signal: context.signal,
    onProgress: (fraction) => context.reportProgress((ANALYSIS_SHARE + fraction * (1 - ANALYSIS_SHARE)) * 100),
    render: ({ sample, time }) => {
      const gain = gains[Math.min(count - 1, Math.max(0, Math.floor(time * fps)))] ?? 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      sample.draw(ctx, 0, 0, size.width, size.height);
      if (gain > 1.001) {
        // src + src·(g-1) = src·g
        copy.ctx.drawImage(canvas, 0, 0);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = gain - 1;
        ctx.drawImage(copy.canvas, 0, 0);
      } else if (gain < 0.999) {
        // src·(1-(1-g)) = src·g
        ctx.globalAlpha = 1 - gain;
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, size.width, size.height);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      return canvas;
    },
  });
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
  return {
    blob: result.blob,
    kind: "video",
    fileName: videoFileName("bez-treperenja", ""),
    previewUrl: URL.createObjectURL(result.blob),
    params: { treperenje_pre: Math.round(before * 1000) / 10, treperenje_posle: Math.round(after * 1000) / 10 },
    extra: {
      width: size.width,
      height: size.height,
      durationS: info.durationS,
      hasAudio: result.hasAudio,
      audioDropped: result.audioDropped,
      note: before < FLICKER_VISIBLE
        ? T.flickerNone[locale]
        : `${fillCopy(T.flickerBefore[locale], { p: percent(before, locale) })} · ${fillCopy(T.flickerAfter[locale], { p: percent(after, locale) })}`,
    },
  };
}

/**
 * Ukloni treperenje (Crea K20, V17): svetlina svakog kadra se ujednači sa
 * susednim kadrovima (`lib/crea-deflicker.ts`), a spora promena svetla i rez
 * između scena ostaju. Na uređaju, 0 kredita; zvuk ostaje.
 */
export default function VideoDeflickerTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const video = useVideoInput(source);
  const probe = useVideoProbe(video.picked);
  const picked = video.picked;
  const tooLong =
    probe.status === "ready"
      ? videoTooLong(caps, exportSize(probe.info.width, probe.info.height, outputLongSide(caps)), probe.info.durationS, locale)
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
      inputKey={picked?.key ?? null}
      runLabel={T.flickerRun[locale]}
      icon={<SunDim aria-hidden="true" className="size-5" />}
      run={(context) => deflickerVideo(picked!, caps, locale, context)}
      renderResult={(output) => <VideoResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-4">
          <VideoInput locale={locale} input={video} disabled={busy} />
          <VideoProbeLine locale={locale} probe={probe} />
          {tooLong ? <p className="type-body-sm font-black text-ink">{tooLong}</p> : null}
          <p className="type-body-sm font-semibold text-muted">{T.flickerHow[locale]}</p>
          {busy ? <p className="type-body-sm font-semibold text-muted">{T.keepTabOpen[locale]}</p> : null}
        </div>
      )}
    </ToolRunner>
  );
}
