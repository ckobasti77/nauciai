import { AudioBufferSource, BufferTarget, CanvasSource, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, Quality } from "mediabunny";

import { canvasFont, loadCanvasFonts } from "@/components/crea/editor/fonts";
import { drawCaptions } from "@/components/crea/video/engine/compositor";
import { AUDIOGRAM_PALETTE, type AudiogramLayout, type AudiogramTheme, type AudiogramWave } from "@/lib/crea-audiogram";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { captionsAt, type CreaTimelineV1, type Rect01 } from "@/lib/crea-timeline";
import { AUDIO_BITRATE, pickVideoBitrate } from "@/lib/crea-video-caps";

/**
 * Audiogram na uređaju (Crea K24, A20): isti crtač za pregled i za MP4.
 * Kadar = pozadina teme, slika (kartica sa tvrdom senkom ili krug), talas
 * (stubići, talas ili prsten oko slike), naslov i titlovi (crtač titlova montaže
 * K21). MP4: mediabunny + WebCodecs (H.264 + AAC), kadar po kadar.
 */

export type AudiogramScene = {
  layout: AudiogramLayout;
  wave: AudiogramWave;
  theme: AudiogramTheme;
  image: ImageBitmap | null;
  title: string;
  /** Titlovi kao u montaži (`captionsAt`); `null` = bez titlova. */
  captions: CreaTimelineV1 | null;
};

function px(rect: Rect01, width: number, height: number) {
  return { x: rect.x * width, y: rect.y * height, w: rect.w * width, h: rect.h * height };
}

function drawCover(ctx: CanvasRenderingContext2D, image: ImageBitmap, box: { x: number; y: number; w: number; h: number }) {
  const scale = Math.max(box.w / image.width, box.h / image.height);
  const sw = box.w / scale;
  const sh = box.h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, box.x, box.y, box.w, box.h);
}

function drawImageCard(ctx: CanvasRenderingContext2D, scene: AudiogramScene, width: number, height: number) {
  const palette = AUDIOGRAM_PALETTE[scene.theme];
  const box = px(scene.layout.image, width, height);
  const round = scene.wave === "krug";
  const radius = round ? box.w / 2 : Math.min(box.w, box.h) * 0.08;
  const shadow = Math.max(4, box.w * 0.035);
  const path = (dx: number, dy: number) => {
    ctx.beginPath();
    if (round) ctx.arc(box.x + box.w / 2 + dx, box.y + box.h / 2 + dy, radius, 0, Math.PI * 2);
    else ctx.roundRect(box.x + dx, box.y + dy, box.w, box.h, radius);
  };
  ctx.save();
  // Tvrda ofset senka brenda (bez zamućenja).
  ctx.fillStyle = scene.theme === "mastilo" ? "#000000" : palette.text;
  path(shadow, shadow);
  ctx.fill();
  ctx.fillStyle = palette.card;
  path(0, 0);
  ctx.fill();
  if (scene.image) {
    path(0, 0);
    ctx.clip();
    drawCover(ctx, scene.image, box);
  }
  ctx.restore();
  ctx.save();
  ctx.lineWidth = Math.max(2, box.w * 0.012);
  ctx.strokeStyle = scene.theme === "mastilo" ? palette.accent : palette.text;
  path(0, 0);
  ctx.stroke();
  ctx.restore();
}

function drawWave(ctx: CanvasRenderingContext2D, scene: AudiogramScene, levels: Float32Array, width: number, height: number) {
  const color = AUDIOGRAM_PALETTE[scene.theme].wave;
  const box = px(scene.layout.wave, width, height);
  const bars = levels.length;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  if (scene.wave === "krug") {
    const image = px(scene.layout.image, width, height);
    const cx = image.x + image.w / 2;
    const cy = image.y + image.h / 2;
    const inner = image.w / 2 + Math.max(6, image.w * 0.04);
    const reach = Math.max(4, box.w / 2 - inner);
    ctx.lineWidth = Math.max(2, (Math.PI * 2 * inner) / (bars * 2) * 0.9);
    // Pola krugova ima „ogledalo": talas ide oko cele slike.
    for (let index = 0; index < bars * 2; index++) {
      const level = levels[index < bars ? index : bars * 2 - 1 - index]!;
      const angle = (index / (bars * 2)) * Math.PI * 2 - Math.PI / 2;
      const length = Math.max(ctx.lineWidth, level * reach);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * (inner + length), cy + Math.sin(angle) * (inner + length));
      ctx.stroke();
    }
  } else if (scene.wave === "stubici") {
    const step = box.w / bars;
    ctx.lineWidth = Math.max(2, step * 0.62);
    const mid = box.y + box.h / 2;
    for (let index = 0; index < bars; index++) {
      const half = Math.max(ctx.lineWidth / 2, (levels[index]! * box.h) / 2);
      const x = box.x + step * (index + 0.5);
      ctx.beginPath();
      ctx.moveTo(x, mid - half + ctx.lineWidth / 2);
      ctx.lineTo(x, mid + half - ctx.lineWidth / 2);
      ctx.stroke();
    }
  } else {
    const mid = box.y + box.h / 2;
    const point = (index: number) => box.x + (box.w * index) / (bars - 1);
    ctx.beginPath();
    ctx.moveTo(point(0), mid);
    for (let index = 0; index < bars; index++) ctx.lineTo(point(index), mid - Math.max(1, (levels[index]! * box.h) / 2));
    for (let index = bars - 1; index >= 0; index--) ctx.lineTo(point(index), mid + Math.max(1, (levels[index]! * box.h) / 2));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawTitle(ctx: CanvasRenderingContext2D, scene: AudiogramScene, width: number, height: number) {
  const rect = scene.layout.title;
  const text = scene.title.trim();
  if (!rect || !text) return;
  const box = px(rect, width, height);
  ctx.save();
  ctx.fillStyle = AUDIOGRAM_PALETTE[scene.theme].text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Najveća veličina pri kojoj staje u najviše dva reda.
  let size = box.h * 0.55;
  let lines: string[] = [text];
  for (; size > 10; size *= 0.92) {
    ctx.font = canvasFont("nunito", 900, size);
    if (ctx.measureText(text).width <= box.w) {
      lines = [text];
      break;
    }
    const words = text.split(/\s+/);
    let split = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let at = 1; at < words.length; at++) {
      const widest = Math.max(ctx.measureText(words.slice(0, at).join(" ")).width, ctx.measureText(words.slice(at).join(" ")).width);
      if (widest < best) {
        best = widest;
        split = at;
      }
    }
    if (split > 0 && best <= box.w && size * 2.3 <= box.h * 1.1) {
      lines = [words.slice(0, split).join(" "), words.slice(split).join(" ")];
      break;
    }
  }
  const lineHeight = size * 1.15;
  lines.forEach((line, index) => ctx.fillText(line, box.x + box.w / 2, box.y + box.h / 2 + (index - (lines.length - 1) / 2) * lineHeight));
  ctx.restore();
}

/** Ceo kadar u trenutku `t` (s od početka izabranog dela). */
export function drawAudiogram(ctx: CanvasRenderingContext2D, scene: AudiogramScene, t: number, levels: Float32Array, width: number, height: number) {
  ctx.save();
  ctx.fillStyle = AUDIOGRAM_PALETTE[scene.theme].background;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  if (scene.wave === "krug") drawWave(ctx, scene, levels, width, height);
  drawImageCard(ctx, scene, width, height);
  if (scene.wave !== "krug") drawWave(ctx, scene, levels, width, height);
  drawTitle(ctx, scene, width, height);
  if (scene.captions) {
    const captions = captionsAt(scene.captions, t);
    if (captions) drawCaptions(ctx, { ...captions, rect: scene.layout.captions }, width, height);
  }
}

export type AudiogramExport = {
  scene: AudiogramScene;
  width: number;
  height: number;
  fps: number;
  audio: AudioBuffer;
  levelsAt: (frame: number) => Float32Array;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
};

function sliceAudio(buffer: AudioBuffer, start: number, end: number): AudioBuffer | null {
  const from = Math.floor(start * buffer.sampleRate);
  const to = Math.min(buffer.length, Math.floor(end * buffer.sampleRate));
  if (to <= from) return null;
  const out = new AudioBuffer({ length: to - from, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) out.copyToChannel(buffer.getChannelData(channel).subarray(from, to), channel);
  return out;
}

/** MP4 audiograma (H.264 + AAC/Opus). Kadar po kadar, zvuk najviše sekundu ispred slike. */
export async function exportAudiogram(request: AudiogramExport): Promise<Blob> {
  await loadCanvasFonts();
  const { width, height, fps, audio, signal } = request;
  const durationS = audio.duration;
  const format = new Mp4OutputFormat({ fastStart: "in-memory" });
  const bitrate = pickVideoBitrate(width, height);
  const videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height, bitrate });
  if (!videoCodec) throw new CreaLocalAiError("UNSUPPORTED");
  const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate, bitrate: AUDIO_BITRATE });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new CreaLocalAiError("UNSUPPORTED");
  const output = new Output({ format, target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: videoCodec, quality: new Quality({ bitrate }), keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });
  const sound = audioCodec ? new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: AUDIO_BITRATE }) }) : null;
  if (sound) output.addAudioTrack(sound);

  let wakeLock: { release(): Promise<void> } | null = null;
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    wakeLock = (await nav.wakeLock?.request("screen").catch(() => null)) ?? null;
    await output.start();
    let audioDone = 0;
    const frames = Math.max(1, Math.round(durationS * fps));
    for (let frame = 0; frame < frames; frame++) {
      if (signal.aborted) throw new CreaLocalAiError("ABORTED");
      const t = frame / fps;
      while (sound && audioDone < Math.min(durationS, t + 1)) {
        const end = Math.min(durationS, audioDone + 1);
        const chunk = sliceAudio(audio, audioDone, end);
        if (chunk) await sound.add(chunk);
        audioDone = end;
      }
      drawAudiogram(context, request.scene, t, request.levelsAt(frame), width, height);
      await video.add(t, 1 / fps);
      request.onProgress((frame + 1) / frames);
    }
    while (sound && audioDone < durationS) {
      const end = Math.min(durationS, audioDone + 1);
      const chunk = sliceAudio(audio, audioDone, end);
      if (chunk) await sound.add(chunk);
      audioDone = end;
    }
    sound?.close();
    video.close();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    if (signal.aborted) throw new CreaLocalAiError("ABORTED");
    throw toLocalAiError(error, "INFERENCE_FAILED");
  } finally {
    await wakeLock?.release().catch(() => undefined);
  }
  const bytes = output.target.buffer;
  if (!bytes) throw new CreaLocalAiError("INFERENCE_FAILED");
  return new Blob([bytes], { type: "video/mp4" });
}
