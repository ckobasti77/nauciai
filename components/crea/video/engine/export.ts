import {
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  Quality,
  UrlSource,
  WEBM,
} from "mediabunny";

import { loadCanvasFonts } from "@/components/crea/editor/fonts";
import { drawFrame, type LayerImage } from "@/components/crea/video/engine/compositor";
import { drawVideoFrame, loadVideoElement, seekVideo } from "@/components/crea/video/engine/video-element";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { frameAt, reversedKey, timelineDuration, type CreaTimelineV1, type FrameLayer, type MediaRef } from "@/lib/crea-timeline";
import { AUDIO_BITRATE, pickVideoBitrate } from "@/lib/crea-video-caps";

/**
 * Izvoz montaže na uređaju (Crea K19, V24/V30; plan K17 §1.5): MP4 kroz
 * mediabunny + WebCodecs (H.264 kad ga pregledač ume, zvuk AAC ili Opus) i
 * GIF kroz `gifenc`. Kadar po kadar: `frameAt` → `drawFrame` → koder, uz
 * `await` (koder sam drži tempo), bez `requestAnimationFrame` - radi i dok je
 * kartica u pozadini. Svaki klip se čita REDOM (`canvasesAtTimestamps`),
 * najviše dva kadra u memoriji po klipu.
 *
 * GIF bez WebCodecs-a čita kadrove kroz `<video>` + premotavanje (nivo C, K17-3).
 */

export type ExportMedia = {
  /** Izvor za dekoder: fajl sa uređaja (`Blob`) ili adresa rada iz galerije. */
  sourceFor(ref: MediaRef): Blob | string | null;
  /** Pomoćni obrnut snimak (K17-9) po `reversedKey`. */
  reversedFor(key: string): Blob | null;
  imageFor(ref: MediaRef): ImageBitmap | null;
  stickerFor(id: string): CanvasImageSource | null;
};

export type ExportRequest = {
  timeline: CreaTimelineV1;
  format: "mp4" | "gif";
  width: number;
  height: number;
  fps: number;
  /** Miks (`renderMix`); `null` = bez zvuka. GIF ga ignoriše. */
  audio: AudioBuffer | null;
  media: ExportMedia;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
};

export type ExportResult = { blob: Blob; mime: string; durationS: number; hasAudio: boolean; audioDropped: boolean };

const VIDEO_FORMATS = [MP4, QTFF, WEBM, MATROSKA];

type FrameStream = { next(): Promise<LayerImage | null>; close(): Promise<void> };

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw new CreaLocalAiError("ABORTED");
}

/** Klip čitan dekoderom: kadrovi tačno na traženim vremenima, redom. */
async function decoderStream(source: Blob | string, times: number[], need: { width: number; height: number }): Promise<FrameStream> {
  const input = new Input({ source: typeof source === "string" ? new UrlSource(source) : new BlobSource(source), formats: VIDEO_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track || !(await track.canDecode())) {
    input.dispose();
    throw new CreaLocalAiError("UNSUPPORTED");
  }
  // Dekoder crta u veličini koja je dovoljna za kadar (4K izvor se ne drži ceo u memoriji).
  const scale = Math.min(1, Math.max(need.width / track.displayWidth, need.height / track.displayHeight) * 1.25);
  const width = Math.max(2, Math.round((track.displayWidth * scale) / 2) * 2);
  const height = Math.max(2, Math.round((track.displayHeight * scale) / 2) * 2);
  const sink = new CanvasSink(track, { width, height, fit: "fill", poolSize: 2 });
  const iterator = sink.canvasesAtTimestamps(times);
  return {
    async next() {
      const result = await iterator.next();
      if (result.done || !result.value) return null;
      return { image: result.value.canvas, width: result.value.canvas.width, height: result.value.canvas.height };
    },
    async close() {
      await iterator.return(undefined).catch(() => undefined);
      input.dispose();
    },
  };
}

/** Rezervni put bez WebCodecs-a (GIF): `<video>` + premotavanje na svaki kadar. */
async function elementStream(source: Blob | string, times: number[], signal: AbortSignal): Promise<FrameStream> {
  const { video, release } = await loadVideoElement(source, signal);
  let index = 0;
  return {
    async next() {
      const time = times[index++];
      if (time === undefined) return null;
      await seekVideo(video, time, signal);
      const canvas = drawVideoFrame(video);
      return { image: canvas, width: canvas.width, height: canvas.height };
    },
    async close() {
      release();
    },
  };
}

type StreamPlan = { layer: FrameLayer; times: number[]; last: number };

function streamKey(layer: FrameLayer): string {
  return `${layer.clipId}:${layer.reversed ? "r" : "f"}`;
}

/** Koliki deo kadra sloj zauzima (za veličinu dekodera). */
function needFor(layer: FrameLayer, width: number, height: number) {
  const zoom = layer.kenBurns ? 2 : 1;
  return { width: layer.rect.w * width * zoom, height: layer.rect.h * height * zoom };
}

/** Prvi prolaz: koja vremena traži svaki klip (redom kadrova izvoza). */
function planStreams(timeline: CreaTimelineV1, frames: number, fps: number): Map<string, StreamPlan> {
  const streams = new Map<string, StreamPlan>();
  for (let index = 0; index < frames; index++) {
    for (const layer of frameAt(timeline, index / fps).layers) {
      if (layer.media !== "video") continue;
      const key = streamKey(layer);
      const entry = streams.get(key) ?? { layer, times: [], last: index };
      entry.times.push(layer.time);
      entry.last = index;
      streams.set(key, entry);
    }
  }
  return streams;
}

async function openStream(plan: StreamPlan, request: ExportRequest, useDecoder: boolean): Promise<FrameStream | null> {
  const { layer } = plan;
  let source: Blob | string | null = null;
  let times = plan.times;
  if (layer.reversed) {
    source = request.media.reversedFor(reversedKey(layer.src, layer.range));
    if (!source) {
      // Nema obrnutog snimka: isti kadrovi iz izvora, unazad (sporije, ali tačno).
      source = request.media.sourceFor(layer.src);
      times = plan.times.map((time) => Math.max(layer.range.in, layer.range.out - time - 1 / request.fps));
    }
  } else {
    source = request.media.sourceFor(layer.src);
  }
  if (!source) return null;
  return useDecoder
    ? decoderStream(source, times, needFor(layer, request.width, request.height))
    : elementStream(source, times, request.signal);
}

/** Zajednička petlja kadrova za MP4 i GIF. */
async function renderFrames(
  request: ExportRequest,
  frames: number,
  fps: number,
  onFrame: (canvas: HTMLCanvasElement, index: number) => Promise<void>,
) {
  const canvas = document.createElement("canvas");
  canvas.width = request.width;
  canvas.height = request.height;
  const context = canvas.getContext("2d", { willReadFrequently: request.format === "gif" });
  if (!context) throw new CreaLocalAiError("UNSUPPORTED");
  const useDecoder = typeof VideoDecoder === "function";
  const plans = planStreams(request.timeline, frames, fps);
  const open = new Map<string, FrameStream | null>();
  try {
    for (let index = 0; index < frames; index++) {
      aborted(request.signal);
      const plan = frameAt(request.timeline, index / fps);
      const sources = new Map<FrameLayer, LayerImage | null>();
      for (const layer of plan.layers) {
        if (layer.media === "image") {
          const bitmap = request.media.imageFor(layer.src);
          sources.set(layer, bitmap ? { image: bitmap, width: bitmap.width, height: bitmap.height } : null);
          continue;
        }
        const key = streamKey(layer);
        if (!open.has(key)) {
          const streamPlan = plans.get(key);
          open.set(key, streamPlan ? await openStream(streamPlan, request, useDecoder) : null);
        }
        const stream = open.get(key);
        sources.set(layer, stream ? await stream.next() : null);
      }
      drawFrame(context, plan, canvas.width, canvas.height, (layer) => sources.get(layer) ?? null, (id) => request.media.stickerFor(id));
      await onFrame(canvas, index);
      // Klip koji se više ne pojavljuje odmah oslobađa dekoder.
      for (const [key, streamPlan] of plans) {
        if (streamPlan.last === index && open.has(key)) {
          await open.get(key)?.close();
          open.set(key, null);
        }
      }
      request.onProgress((index + 1) / frames);
    }
  } finally {
    for (const stream of open.values()) await stream?.close();
  }
}

/** Deo miksa [start, end) kao zaseban `AudioBuffer` (koder ga prima po komadima). */
function sliceAudio(buffer: AudioBuffer, start: number, end: number): AudioBuffer | null {
  const from = Math.floor(start * buffer.sampleRate);
  const to = Math.min(buffer.length, Math.floor(end * buffer.sampleRate));
  if (to <= from) return null;
  const out = new AudioBuffer({ length: to - from, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    out.copyToChannel(buffer.getChannelData(channel).subarray(from, to), channel);
  }
  return out;
}

async function exportMp4(request: ExportRequest, durationS: number): Promise<ExportResult> {
  const format = new Mp4OutputFormat({ fastStart: "in-memory" });
  const bitrate = pickVideoBitrate(request.width, request.height);
  const videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
    width: request.width,
    height: request.height,
    bitrate,
  });
  if (!videoCodec) throw new CreaLocalAiError("UNSUPPORTED");
  const audioCodec = request.audio
    ? await getFirstEncodableAudioCodec(["aac", "opus"], {
        numberOfChannels: request.audio.numberOfChannels,
        sampleRate: request.audio.sampleRate,
        bitrate: AUDIO_BITRATE,
      })
    : null;

  const canvasHolder: { source: CanvasSource | null } = { source: null };
  const output = new Output({ format, target: new BufferTarget() });
  let audioSource: AudioBufferSource | null = null;
  if (request.audio && audioCodec) {
    audioSource = new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: AUDIO_BITRATE }) });
    output.addAudioTrack(audioSource);
  }
  let audioDone = 0;
  const pushAudio = async (until: number) => {
    if (!audioSource || !request.audio) return;
    while (audioDone < Math.min(until, durationS)) {
      const end = Math.min(durationS, audioDone + 1);
      const chunk = sliceAudio(request.audio, audioDone, end);
      if (chunk) await audioSource.add(chunk);
      audioDone = end;
    }
  };

  const frames = Math.max(1, Math.round(durationS * request.fps));
  try {
    await renderFrames(request, frames, request.fps, async (canvas, index) => {
      if (!canvasHolder.source) {
        canvasHolder.source = new CanvasSource(canvas, { codec: videoCodec, quality: new Quality({ bitrate }), keyFrameInterval: 2 });
        output.addVideoTrack(canvasHolder.source, { frameRate: request.fps });
        await output.start();
      }
      const time = index / request.fps;
      // Zvuk ide ispred slike najviše sekundu - memorija ostaje ravna.
      await pushAudio(time + 1);
      await canvasHolder.source.add(time, 1 / request.fps);
    });
    await pushAudio(durationS);
    audioSource?.close();
    canvasHolder.source?.close();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    if (request.signal.aborted) throw new CreaLocalAiError("ABORTED");
    throw toLocalAiError(error, "INFERENCE_FAILED");
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new CreaLocalAiError("INFERENCE_FAILED");
  return {
    blob: new Blob([buffer], { type: "video/mp4" }),
    mime: "video/mp4",
    durationS,
    hasAudio: audioSource !== null,
    audioDropped: request.audio !== null && audioSource === null,
  };
}

async function exportGif(request: ExportRequest, durationS: number): Promise<ExportResult> {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const encoder = GIFEncoder();
  const frames = Math.max(1, Math.round(durationS * request.fps));
  // GIF pamti pauzu u stotinkama: naizmenično 8 i 9 stotinki daje tačnih 12 kadrova u sekundi.
  const delayMs = (index: number) => (Math.round(((index + 1) * 100) / request.fps) - Math.round((index * 100) / request.fps)) * 10;
  try {
    await renderFrames(request, frames, request.fps, async (canvas, index) => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new CreaLocalAiError("UNSUPPORTED");
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const palette = quantize(data, 256);
      encoder.writeFrame(applyPalette(data, palette), canvas.width, canvas.height, { palette, delay: delayMs(index) });
      // GIF kodiranje je na glavnoj niti: kratka pauza da ekran ostane živ.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } catch (error) {
    if (request.signal.aborted) throw new CreaLocalAiError("ABORTED");
    throw toLocalAiError(error, "INFERENCE_FAILED");
  }
  encoder.finish();
  return { blob: new Blob([encoder.bytes()], { type: "image/gif" }), mime: "image/gif", durationS, hasAudio: false, audioDropped: false };
}

/** Izvoz cele montaže. Ekran ostaje upaljen dok traje (gde pregledač ume). */
export async function exportTimeline(request: ExportRequest): Promise<ExportResult> {
  const durationS = timelineDuration(request.timeline);
  if (durationS <= 0) throw new CreaLocalAiError("BAD_INPUT");
  await loadCanvasFonts();
  let wakeLock: { release(): Promise<void> } | null = null;
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    wakeLock = (await nav.wakeLock?.request("screen").catch(() => null)) ?? null;
    return request.format === "gif" ? await exportGif(request, durationS) : await exportMp4(request, durationS);
  } finally {
    await wakeLock?.release().catch(() => undefined);
  }
}
