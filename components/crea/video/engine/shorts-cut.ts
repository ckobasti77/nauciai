import { forEachFrameAt, probeVideo, transformVideo, workCanvas, type VideoSource } from "@/components/crea/video/engine/transform";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadFaceDetector, type LocalLoadOptions } from "@/lib/crea-local-ai/runtime";
import {
  cropAt,
  detectionTiles,
  faceCoverage,
  mergeFaces,
  reframeOutputSize,
  reframePath,
  reframeSampleTimes,
  targetAspect,
  type FaceBox,
  type FaceSample,
} from "@/lib/crea-video-reframe";

/**
 * Kratak klip iz dugog videa (Crea K21, V26): deo `[start, end]` se iseče i
 * prekroji na 9:16 tako da lice ostane u kadru - isti motor kao „Prekroji kadar"
 * (K20: BlazeFace ~5 puta u sekundi, `lib/crea-video-reframe.ts` putanja isečka),
 * ali samo nad tim delom (dekodira se od najbližeg ključnog kadra, nikad ceo
 * snimak od 30 min). Zvuk se prenosi. Titlovi se utiskuju posle, u montaži.
 */

const DETECT_MAX_SIDE = 640;
const TILE_SIDE = 256;
const ANALYSIS_SHARE = 0.3;

export type ShortCut = { blob: Blob; width: number; height: number; durationS: number; hasAudio: boolean; faceCoverage: number };

export async function cutShort(
  source: VideoSource,
  range: { start: number; end: number },
  options: { maxLongSide: number; signal: AbortSignal; onProgress: (fraction: number, phase: "lica" | "video") => void; onDownload?: LocalLoadOptions["onProgress"] },
): Promise<ShortCut> {
  const detector = await loadFaceDetector({ signal: options.signal, ...(options.onDownload ? { onProgress: options.onDownload } : {}) });
  const info = await probeVideo(source);
  const start = Math.max(0, Math.min(range.start, info.durationS));
  const end = Math.max(start + 0.5, Math.min(range.end, info.durationS));
  const length = end - start;

  // 1) Lica u delu klipa; vremena su od početka isečka (posle sečenja video kreće od 0).
  const times = reframeSampleTimes(length).map((t) => start + t);
  const samples: FaceSample[] = [];
  const { canvas: tileCanvas, ctx: tileCtx } = workCanvas(TILE_SIDE, TILE_SIDE);
  await forEachFrameAt(
    source,
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
        for (const tile of detectionTiles(frame.width, frame.height)) {
          tileCtx.drawImage(frame, tile.x, tile.y, tile.size, tile.size, 0, 0, TILE_SIDE, TILE_SIDE);
          faces = faces.concat(found(tileCanvas, tile, tile.size / TILE_SIDE));
        }
        faces = mergeFaces(faces);
      }
      samples.push({ t: time - start, faces });
      options.onProgress(((index + 1) / Math.max(1, times.length)) * ANALYSIS_SHARE, "lica");
    },
    options.signal,
  );

  // 2) Putanja isečka 9:16 i 3) sečenje + prekrajanje svakog kadra.
  const path = reframePath(samples, { width: info.width, height: info.height }, targetAspect("9:16"));
  const size = reframeOutputSize({ width: path.width, height: path.height }, options.maxLongSide);
  const { canvas, ctx } = workCanvas(size.width, size.height);
  ctx.imageSmoothingQuality = "high";
  const result = await transformVideo({
    source,
    width: size.width,
    height: size.height,
    audio: "copy",
    trim: { start, end },
    signal: options.signal,
    onProgress: (fraction) => options.onProgress(ANALYSIS_SHARE + fraction * (1 - ANALYSIS_SHARE), "video"),
    render: ({ sample, time }) => {
      const crop = cropAt(path, time);
      sample.draw(ctx, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
      return canvas;
    },
  });
  if (options.signal.aborted) throw new CreaLocalAiError("ABORTED");
  return { blob: result.blob, width: size.width, height: size.height, durationS: length, hasAudio: result.hasAudio, faceCoverage: faceCoverage(samples) };
}
