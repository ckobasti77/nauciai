import {
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  Quality,
  UrlSource,
  VideoSample,
  WEBM,
} from "mediabunny";

import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { pickVideoBitrate } from "@/lib/crea-video-caps";

/**
 * Kadar po kadar preko celog videa, na uređaju (Crea K20, plan K17 §1.1
 * `transform.ts`): reframe, boje, pozadina, usporeno i treperenje koriste isti
 * motor. Ulaz se dekodira, alat nacrta svaki kadar na svoje platno, a mediabunny
 * `Conversion` ga kodira u MP4 i zvuk prenese bez ponovnog kodiranja kad ume
 * (ili ga izbaci, `audio: "drop"`). Sve je `await` petlja koju koder sam tempira -
 * bez `requestAnimationFrame`, pa radi i kad je kartica u pozadini (K17-1).
 *
 * Imenovani uvozi (K10) i samo video kontejneri; učitava se kroz `import()` iz alata.
 */

export type VideoSource = Blob | string;

const VIDEO_FORMATS = [MP4, QTFF, WEBM, MATROSKA];

function openInput(source: VideoSource): Input {
  return new Input({ source: typeof source === "string" ? new UrlSource(source) : new BlobSource(source), formats: VIDEO_FORMATS });
}

export type ProbedVideo = { durationS: number; width: number; height: number; fps: number; hasAudio: boolean };

/** Trajanje, veličina (posle rotacije), kadrovi u sekundi i da li ima zvuk. */
export async function probeVideo(source: VideoSource): Promise<ProbedVideo> {
  const input = openInput(source);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new CreaLocalAiError("UNSUPPORTED");
    const [durationS, stats, audio] = await Promise.all([
      track.computeDuration(),
      track.computePacketStats(90).catch(() => null),
      input.getPrimaryAudioTrack(),
    ]);
    const fps = stats && Number.isFinite(stats.averagePacketRate) && stats.averagePacketRate > 0 ? stats.averagePacketRate : 30;
    return { durationS, width: track.displayWidth, height: track.displayHeight, fps, hasAudio: audio !== null };
  } catch (error) {
    throw toLocalAiError(error, "BAD_INPUT");
  } finally {
    input.dispose();
  }
}

/**
 * Kadrovi u traženim trenucima, smanjeni na `maxSide` (za analizu: lica,
 * svetlina). Čitaju se REDOM; svaki kadar dobija pozivalac pa platno ide dalje.
 */
export async function forEachFrameAt(
  source: VideoSource,
  times: readonly number[],
  maxSide: number,
  onFrame: (canvas: HTMLCanvasElement | OffscreenCanvas, time: number, index: number) => void | Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  const input = openInput(source);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new CreaLocalAiError("UNSUPPORTED");
    const scale = Math.min(1, maxSide / Math.max(track.displayWidth, track.displayHeight));
    const sink = new CanvasSink(track, {
      width: Math.max(2, Math.round(track.displayWidth * scale)),
      height: Math.max(2, Math.round(track.displayHeight * scale)),
      fit: "fill",
      poolSize: 1,
    });
    let index = 0;
    for await (const wrapped of sink.canvasesAtTimestamps([...times])) {
      if (signal.aborted) throw new CreaLocalAiError("ABORTED");
      if (wrapped) await onFrame(wrapped.canvas, times[index]!, index);
      index += 1;
    }
  } catch (error) {
    if (signal.aborted) throw new CreaLocalAiError("ABORTED");
    throw toLocalAiError(error, "INFERENCE_FAILED");
  } finally {
    input.dispose();
  }
}

/** Kadar za alat: uzorak dekodera (već okrenut), vreme i redni broj. */
export type TransformFrame = { sample: VideoSample; time: number; duration: number; index: number };

/** Ono što alat vrati za jedan ulazni kadar: platno (isto vreme) ili niz platna sa svojim vremenima. */
export type TransformResult = CanvasImageSource | Array<{ canvas: CanvasImageSource; timestamp: number; duration: number }> | null;

export type TransformRequest = {
  source: VideoSource;
  /** Veličina izlaza (parne stranice). */
  width: number;
  height: number;
  render: (frame: TransformFrame) => TransformResult | Promise<TransformResult>;
  /** `copy`: zvuk ostaje (prenos bez kodiranja gde može); `drop`: bez zvuka. */
  audio: "copy" | "drop";
  trim?: { start: number; end: number };
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
};

export type TransformOutput = { blob: Blob; hasAudio: boolean; audioDropped: boolean };

/** Snimak platna kao kadar sa vremenom (VideoFrame „zamrzne" sadržaj odmah - platno sme dalje). */
function snapshot(canvas: CanvasImageSource, timestamp: number, duration: number): VideoSample {
  return new VideoSample(
    new VideoFrame(canvas as CanvasImageSource & VideoFrame, {
      timestamp: Math.round(timestamp * 1e6),
      duration: Math.max(1, Math.round(duration * 1e6)),
    }),
  );
}

/** Ceo video kroz `render`, u MP4 (H.264 kad ga pregledač ume). */
export async function transformVideo(request: TransformRequest): Promise<TransformOutput> {
  if (typeof VideoEncoder !== "function" || typeof VideoDecoder !== "function") throw new CreaLocalAiError("UNSUPPORTED");
  const input = openInput(request.source);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  let index = 0;
  let conversion: Conversion | null = null;
  const abort = () => void conversion?.cancel();
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      ...(request.trim ? { trim: request.trim } : {}),
      video: {
        forceTranscode: true,
        processedWidth: request.width,
        processedHeight: request.height,
        quality: new Quality({ bitrate: pickVideoBitrate(request.width, request.height) }),
        keyFrameInterval: 2,
        process: async (sample) => {
          if (request.signal.aborted) throw new CreaLocalAiError("ABORTED");
          const result = await request.render({ sample, time: sample.timestamp, duration: sample.duration, index: index++ });
          if (result === null) return null;
          if (Array.isArray(result)) return result.map((frame) => snapshot(frame.canvas, frame.timestamp, frame.duration));
          return snapshot(result, sample.timestamp, sample.duration);
        },
      },
      audio: request.audio === "drop" ? { discard: true } : {},
    });
    if (!conversion.isValid) throw new CreaLocalAiError("UNSUPPORTED");
    conversion.onProgress = (progress) => request.onProgress(progress);
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new CreaLocalAiError("INFERENCE_FAILED");
    return {
      blob: new Blob([buffer], { type: "video/mp4" }),
      hasAudio: conversion.utilizedTracks.some((track) => track.isAudioTrack()),
      audioDropped:
        request.audio === "copy" &&
        conversion.discardedTracks.some((entry) => entry.track.isAudioTrack() && entry.reason !== "discarded_by_user"),
    };
  } catch (error) {
    if (request.signal.aborted) throw new CreaLocalAiError("ABORTED");
    throw toLocalAiError(error, "INFERENCE_FAILED");
  } finally {
    request.signal.removeEventListener("abort", abort);
    input.dispose();
  }
}

/** Radno platno (2D, čest `getImageData` po želji). */
export function workCanvas(width: number, height: number, readback = false) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", readback ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new CreaLocalAiError("UNSUPPORTED");
  return { canvas, ctx };
}
