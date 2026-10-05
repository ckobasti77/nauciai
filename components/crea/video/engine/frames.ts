import { BlobSource, CanvasSink, Input, MATROSKA, MP4, QTFF, UrlSource, WEBM } from "mediabunny";

import { drawVideoFrame, loadVideoElement, seekVideo } from "@/components/crea/video/engine/video-element";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import {
  averageLuma,
  BLACK_FRAME_LUMA,
  FRAME_JPEG_QUALITY,
  frameMimeType,
  frameTimeAt,
  lastFrameCandidates,
} from "@/lib/crea-video-frames";

/**
 * Kadar iz videa na uređaju (Crea K18, V4; plan K17 §1.6). Prvi put je mediabunny
 * (WebCodecs, tačan kadar po vremenu), a kad pregledač nema `VideoDecoder` ili
 * mediabunny ne ume fajl - običan `<video>` element. Zaseban modul sa IMENOVANIM
 * uvozima (K10): alat ga učitava tek na „Izvuci kadar", pa mediabunny nikad ne
 * ulazi u početni JS radionice.
 *
 * Izvor je `Blob` (fajl sa uređaja) ili adresa rada iz galerije (Convex storage
 * šalje CORS i prima Range zahteve, pa se ceo video ne preuzima u memoriju).
 */

export type VideoSource = Blob | string;
export type FrameRequest = "last" | { fraction: number };
export type ExtractedFrame = { blob: Blob; width: number; height: number; timeS: number; durationS: number };

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Samo video kontejneri koje primamo (MP4, MOV, WebM/MKV) - `ALL_FORMATS` bi uvukao i
 * demuksere za zvuk i HLS (+~25 KB gzip, budžet motora je 120 KB, plan K17 §8).
 */
const VIDEO_FORMATS = [MP4, QTFF, WEBM, MATROSKA];

function hasWebCodecs(): boolean {
  return typeof VideoDecoder === "function";
}

function lumaOf(canvas: AnyCanvas): number {
  const sample = document.createElement("canvas");
  sample.width = 32;
  sample.height = 32;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return 255;
  context.drawImage(canvas, 0, 0, 32, 32);
  return averageLuma(context.getImageData(0, 0, 32, 32).data);
}

async function toBlob(canvas: AnyCanvas): Promise<Blob> {
  const type = frameMimeType(canvas.width, canvas.height);
  const quality = type === "image/jpeg" ? FRAME_JPEG_QUALITY : undefined;
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PLATNO"))), type, quality);
  });
}

/** Kopija (platno iz `CanvasSink`-a se ponovo koristi za sledeći kadar). */
function copyCanvas(source: AnyCanvas): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d")?.drawImage(source, 0, 0);
  return canvas;
}

async function withMediabunny(source: VideoSource, request: FrameRequest, signal?: AbortSignal): Promise<ExtractedFrame | null> {
  const input = new Input({
    source: typeof source === "string" ? new UrlSource(source) : new BlobSource(source),
    formats: VIDEO_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const durationS = await track.computeDuration();
    const fps = request === "last" ? (await track.computePacketStats(60).catch(() => null))?.averagePacketRate ?? null : null;
    const sink = new CanvasSink(track, { poolSize: 1 });
    const times = request === "last" ? lastFrameCandidates(durationS, fps) : [frameTimeAt(durationS, request.fraction)];
    for (const time of times) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const wrapped = await sink.getCanvas(time);
      if (!wrapped) continue;
      if (request === "last" && lumaOf(wrapped.canvas) < BLACK_FRAME_LUMA && time !== times[times.length - 1]) continue;
      const canvas = copyCanvas(wrapped.canvas);
      return { blob: await toBlob(canvas), width: canvas.width, height: canvas.height, timeS: wrapped.timestamp, durationS };
    }
    return null;
  } finally {
    input.dispose();
  }
}

async function withVideoElement(source: VideoSource, request: FrameRequest, signal?: AbortSignal): Promise<ExtractedFrame> {
  const { video, release } = await loadVideoElement(source, signal);
  try {
    const durationS = video.duration;
    // Safari ponekad za sam kraj vrati crn kadar - tada 0,1 s unazad (do tri puta).
    const start = request === "last" ? Math.max(0, durationS - 0.05) : frameTimeAt(durationS, request.fraction);
    let time = start;
    let canvas = drawVideoFrame(video);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await seekVideo(video, time, signal);
      canvas = drawVideoFrame(video);
      if (request !== "last" || lumaOf(canvas) >= BLACK_FRAME_LUMA) break;
      time = Math.max(0, time - 0.1);
    }
    return { blob: await toBlob(canvas), width: canvas.width, height: canvas.height, timeS: time, durationS };
  } finally {
    release();
  }
}

/** Poslednji (ili izabran) kadar videa kao slika pune rezolucije. */
export async function extractFrame(source: VideoSource, request: FrameRequest, signal?: AbortSignal): Promise<ExtractedFrame> {
  try {
    if (hasWebCodecs()) {
      const frame = await withMediabunny(source, request, signal).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return null;
      });
      if (frame) return frame;
    }
    return await withVideoElement(source, request, signal);
  } catch (error) {
    if (error instanceof CreaLocalAiError) throw error;
    throw toLocalAiError(error, "INFERENCE_FAILED");
  }
}

/** Trajanje videa u sekundama (za klizač „izaberi kadar"). */
export async function videoDuration(source: VideoSource, signal?: AbortSignal): Promise<number> {
  if (hasWebCodecs()) {
    const input = new Input({
      source: typeof source === "string" ? new UrlSource(source) : new BlobSource(source),
      formats: VIDEO_FORMATS,
    });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (track) return await track.computeDuration();
    } catch {
      // pada na `<video>` ispod
    } finally {
      input.dispose();
    }
  }
  const { video, release } = await loadVideoElement(source, signal);
  try {
    return video.duration;
  } finally {
    release();
  }
}
