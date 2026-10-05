import {
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
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

import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { exportSize, pickVideoBitrate } from "@/lib/crea-video-caps";

/**
 * Obrnut klip za „unazad" i bumerang (Crea K19; plan K17-9): deo izvora
 * [in, out] se dekodira u komadima od pola sekunde OD KRAJA, svaki komad se
 * okrene i kodira u nov MP4 (bez zvuka). Taj pomoćni snimak posle i pregled
 * (`<video>`) i izvoz čitaju unapred, kao običan klip.
 *
 * U memoriji je najviše jedan komad (~15 kadrova u veličini izvoza), pa
 * granica dužine (`EXPORT_LIMITS.reverseMaxS`) čuva vreme, ne memoriju.
 */

const VIDEO_FORMATS = [MP4, QTFF, WEBM, MATROSKA];
const CHUNK_S = 0.5;

export async function buildReversedClip(
  source: Blob | string,
  range: { in: number; out: number },
  options: { maxLongSide: number; signal: AbortSignal; onProgress?: (fraction: number) => void },
): Promise<Blob> {
  const input = new Input({ source: typeof source === "string" ? new UrlSource(source) : new BlobSource(source), formats: VIDEO_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new CreaLocalAiError("UNSUPPORTED");
    const stats = await track.computePacketStats(90).catch(() => null);
    const fps = Math.min(60, Math.max(12, Math.round(stats?.averagePacketRate ?? 30)));
    const size = exportSize(track.displayWidth, track.displayHeight, options.maxLongSide);
    const bitrate = pickVideoBitrate(size.width, size.height);
    const codec = await getFirstEncodableVideoCodec(new Mp4OutputFormat().getSupportedVideoCodecs(), { ...size, bitrate });
    if (!codec) throw new CreaLocalAiError("UNSUPPORTED");

    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new CreaLocalAiError("UNSUPPORTED");
    const encoderSource = new CanvasSource(canvas, { codec, quality: new Quality({ bitrate }), keyFrameInterval: 1 });
    output.addVideoTrack(encoderSource, { frameRate: fps });
    await output.start();

    const sink = new CanvasSink(track, { width: size.width, height: size.height, fit: "fill" });
    const length = Math.max(1 / fps, range.out - range.in);
    const total = Math.max(1, Math.round(length * fps));
    let written = 0;
    // Kadar k obrnutog snimka je kadar izvora na `out - (k + 0.5) / fps`.
    for (let chunkStart = 0; chunkStart < total; chunkStart += Math.round(CHUNK_S * fps)) {
      if (options.signal.aborted) throw new CreaLocalAiError("ABORTED");
      const chunkEnd = Math.min(total, chunkStart + Math.round(CHUNK_S * fps));
      const times: number[] = [];
      for (let k = chunkEnd - 1; k >= chunkStart; k--) times.push(Math.max(range.in, range.out - (k + 0.5) / fps));
      const frames: ImageBitmap[] = [];
      for await (const wrapped of sink.canvasesAtTimestamps(times)) {
        if (wrapped) frames.push(await createImageBitmap(wrapped.canvas));
      }
      // Dekoder je dao komad unapred; u izlaz ide od kraja ka početku.
      for (const frame of frames.reverse()) {
        context.drawImage(frame, 0, 0, size.width, size.height);
        frame.close();
        await encoderSource.add(written / fps, 1 / fps);
        written += 1;
      }
      options.onProgress?.(chunkEnd / total);
    }
    encoderSource.close();
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new CreaLocalAiError("INFERENCE_FAILED");
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    await output.cancel().catch(() => undefined);
    if (options.signal.aborted) throw new CreaLocalAiError("ABORTED");
    throw toLocalAiError(error, "INFERENCE_FAILED");
  } finally {
    input.dispose();
  }
}
