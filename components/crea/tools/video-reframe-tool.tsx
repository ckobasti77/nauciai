"use client";

import { Crop } from "lucide-react";
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
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadFaceDetector } from "@/lib/crea-local-ai/runtime";
import {
  cropAt,
  detectionTiles,
  faceCoverage,
  mergeFaces,
  reframeOutputSize,
  reframePath,
  reframeSampleTimes,
  reframeWindow,
  targetAspect,
  VIDEO_REFRAME_TARGETS,
  type FaceBox,
  type FaceSample,
  type VideoReframeTarget,
} from "@/lib/crea-video-reframe";
import { CREA_VIDEO_TOOLS_COPY as T } from "@/lib/crea-video-tools-copy";
import type { Locale } from "@/lib/i18n";
import type { CreaDeviceCaps } from "@/lib/crea-device";

/** Detektor gleda umanjen kadar - lice je i dalje jasno, a brzo je. */
const DETECT_MAX_SIDE = 640;
/** Kvadratni isečak za malo lice (detektor ga ionako gleda kao 128 × 128). */
const TILE_SIDE = 256;
/** Analiza lica je ~35 % posla, kodiranje ostatak. */
const ANALYSIS_SHARE = 0.35;

async function reframeVideo(
  picked: PickedVideo,
  target: VideoReframeTarget,
  caps: CreaDeviceCaps | null,
  locale: Locale,
  context: ToolRunContext,
): Promise<CreaToolOutput<VideoOutputExtra>> {
  const [engine, detector] = await Promise.all([
    import("@/components/crea/video/engine/transform"),
    loadFaceDetector({ signal: context.signal, onProgress: context.reportDownload }),
  ]);
  context.reportRunning();
  const info = await engine.probeVideo(picked.source);
  const aspect = targetAspect(target);

  // 1) Lica na ~5 kadrova u sekundi.
  const times = reframeSampleTimes(info.durationS);
  const samples: FaceSample[] = [];
  const { canvas: tileCanvas, ctx: tileCtx } = engine.workCanvas(TILE_SIDE, TILE_SIDE);
  await engine.forEachFrameAt(
    picked.source,
    times,
    DETECT_MAX_SIDE,
    (canvas, time, index) => {
      const frame = canvas as HTMLCanvasElement;
      const found = (image: HTMLCanvasElement, offset: { x: number; y: number }, scale: number): FaceBox[] =>
        detector.detect(image).detections.flatMap((detection) => {
          const box = detection.boundingBox;
          if (!box) return [];
          return [
            {
              x: (offset.x + box.originX * scale) / frame.width,
              y: (offset.y + box.originY * scale) / frame.height,
              w: (box.width * scale) / frame.width,
              h: (box.height * scale) / frame.height,
              score: detection.categories[0]?.score ?? 0,
            },
          ];
        });
      let faces = found(frame, { x: 0, y: 0 }, 1);
      if (faces.length === 0) {
        // Malo lice u širokom kadru: kvadratni isečci duž duže stranice.
        for (const tile of detectionTiles(frame.width, frame.height)) {
          tileCtx.drawImage(frame, tile.x, tile.y, tile.size, tile.size, 0, 0, TILE_SIDE, TILE_SIDE);
          faces = faces.concat(found(tileCanvas, tile, tile.size / TILE_SIDE));
        }
        faces = mergeFaces(faces);
      }
      samples.push({ t: time, faces });
      context.reportProgress(((index + 1) / Math.max(1, times.length)) * ANALYSIS_SHARE * 100);
    },
    context.signal,
  );

  // 2) Putanja isečka, 3) svaki kadar isečen i umanjen na izlaz.
  const path = reframePath(samples, { width: info.width, height: info.height }, aspect);
  const size = reframeOutputSize({ width: path.width, height: path.height }, outputLongSide(caps));
  const { canvas, ctx } = engine.workCanvas(size.width, size.height);
  ctx.imageSmoothingQuality = "high";
  const result = await engine.transformVideo({
    source: picked.source,
    width: size.width,
    height: size.height,
    audio: "copy",
    signal: context.signal,
    onProgress: (fraction) => context.reportProgress((ANALYSIS_SHARE + fraction * (1 - ANALYSIS_SHARE)) * 100),
    render: ({ sample, time }) => {
      const crop = cropAt(path, time);
      sample.draw(ctx, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
      return canvas;
    },
  });
  if (context.signal.aborted) throw new CreaLocalAiError("ABORTED");
  const coverage = faceCoverage(samples);
  return {
    blob: result.blob,
    kind: "video",
    fileName: videoFileName("reframe", target),
    previewUrl: URL.createObjectURL(result.blob),
    params: { odnos: target, lice_procenat: Math.round(coverage * 100), sirina: size.width, visina: size.height },
    extra: {
      width: size.width,
      height: size.height,
      durationS: info.durationS,
      hasAudio: result.hasAudio,
      audioDropped: result.audioDropped,
      note: coverage < 0.2 ? T.reframeNoFace[locale] : fillCopy(T.reframeFaces[locale], { p: Math.round(coverage * 100) }),
    },
  };
}

/**
 * Prekroji kadar videa (Crea K20, V15): 9:16, 1:1, 16:9 ili 4:5, a lice ostaje u
 * kadru. Na uređaju: MediaPipe nađe lice ~5 puta u sekundi, `lib/crea-video-reframe.ts`
 * izgladi putanju (mrtva zona, opruga, najveća brzina, lice uvek celo), mediabunny
 * iseče i kodira svaki kadar; zvuk ostaje. 0 kredita, rezultat je verzija izvora.
 */
export default function VideoReframeTool({ tool, locale, caps, canSave, projectId, source }: CreaToolProps) {
  const video = useVideoInput(source);
  const probe = useVideoProbe(video.picked);
  const [target, setTarget] = useState<VideoReframeTarget>("9:16");
  const picked = video.picked;
  const frame = probe.status === "ready" ? reframeWindow(probe.info.width, probe.info.height, targetAspect(target)) : null;
  const same = probe.status === "ready" && frame !== null && frame.width >= probe.info.width - 2 && frame.height >= probe.info.height - 2;
  const tooLong =
    probe.status === "ready" && frame ? videoTooLong(caps, reframeOutputSize(frame, outputLongSide(caps)), probe.info.durationS, locale) : null;

  return (
    <ToolRunner
      tool={tool}
      locale={locale}
      caps={caps}
      canSave={canSave}
      projectId={projectId}
      parentJobId={picked?.sourceJobId ?? null}
      canRun={picked !== null && probe.status === "ready" && !same && tooLong === null}
      inputKey={picked ? `${picked.key}:${target}` : null}
      runLabel={T.reframeRun[locale]}
      icon={<Crop aria-hidden="true" className="size-5" />}
      run={(context) => reframeVideo(picked!, target, caps, locale, context)}
      renderResult={(output) => <VideoResult locale={locale} output={output} />}
    >
      {({ busy }) => (
        <div className="space-y-4">
          <VideoInput locale={locale} input={video} disabled={busy} />
          <VideoProbeLine locale={locale} probe={probe} />
          <ChoiceChips<VideoReframeTarget>
            legend={T.reframeTarget[locale]}
            name="crea-video-reframe-target"
            options={VIDEO_REFRAME_TARGETS.map((id) => ({ id, label: T.reframeTargets[id][locale] }))}
            value={target}
            onChange={setTarget}
            disabled={busy}
          />
          {same ? <p className="type-body-sm font-black text-ink">{T.reframeSame[locale]}</p> : null}
          {tooLong ? <p className="type-body-sm font-black text-ink">{tooLong}</p> : null}
          <p className="type-body-sm font-semibold text-muted">{T.reframeHow[locale]}</p>
          {busy ? <p className="type-body-sm font-semibold text-muted">{T.keepTabOpen[locale]}</p> : null}
        </div>
      )}
    </ToolRunner>
  );
}
