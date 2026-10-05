import { BlobSource, BufferTarget, Conversion, Input, MATROSKA, MP4, Mp4OutputFormat, Output, QTFF, WEBM, WebMOutputFormat } from "mediabunny";

import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";

/**
 * Snimanje kamerom u browseru (Crea K20, V20 „Odglumi"; plan K17 §1.1
 * `recorder.ts`): kamera → `MediaRecorder` → prepakovanje kroz mediabunny.
 * `MediaRecorder` WebM nema trajanje u zaglavlju, a server po trajanju naplaćuje
 * (`measureInputUpload` bi tri puta pao i zaključao fajl) - zato snimak UVEK ide
 * kroz `Conversion`: u MP4 (H.264, bez zvuka, najviše 1280 px) kad pregledač
 * ume da kodira, inače kopija u WebM sa trajanjem (bez ponovnog kodiranja).
 * Pokret ne treba zvuk, pa se zvuk ni ne snima.
 */

export type CameraProblem = "dozvola" | "nema-kamere" | "nebezbedno" | "ne-podrzava";

export class CameraError extends Error {
  readonly problem: CameraProblem;
  constructor(problem: CameraProblem, cause?: unknown) {
    super(problem, cause === undefined ? undefined : { cause });
    this.name = "CameraError";
    this.problem = problem;
  }
}

/** Prednja kamera, do 720p. Greške se prevode u razloge koje UI objašnjava. */
export async function openCamera(): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) throw new CameraError("nebezbedno");
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new CameraError("ne-podrzava");
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: false,
    });
  } catch (error) {
    const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new CameraError("dozvola", error);
    if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") throw new CameraError("nema-kamere", error);
    throw new CameraError("ne-podrzava", error);
  }
}

export function stopCamera(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/** Snimi `seconds` sekundi toka. Odustajanje zaustavlja snimanje i baca ABORTED. */
export function recordStream(stream: MediaStream, seconds: number, mimeType: string, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
    } catch (error) {
      reject(new CameraError("ne-podrzava", error));
      return;
    }
    const chunks: Blob[] = [];
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, seconds * 1000);
    const onAbort = () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (recorder.state !== "inactive") recorder.stop();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new CreaLocalAiError("INFERENCE_FAILED"));
    };
    recorder.onstop = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (cancelled) reject(new CreaLocalAiError("ABORTED"));
      else resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
    };
    recorder.start(250);
  });
}

async function convert(blob: Blob, mp4: boolean): Promise<Blob | null> {
  const input = new Input({ source: new BlobSource(blob), formats: [MP4, QTFF, WEBM, MATROSKA] });
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  try {
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      video: (track) => {
        if (!mp4) return {};
        const scale = Math.min(1, 1280 / Math.max(track.displayWidth, track.displayHeight));
        const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);
        return { codec: "avc", width: even(track.displayWidth), height: even(track.displayHeight), fit: "fill", frameRate: 30, forceTranscode: true };
      },
      audio: { discard: true },
    });
    if (!conversion.isValid) return null;
    await conversion.execute();
    const buffer = output.target.buffer;
    return buffer ? new Blob([buffer], { type: mp4 ? "video/mp4" : "video/webm" }) : null;
  } finally {
    input.dispose();
  }
}

/**
 * Snimak → fajl sa trajanjem u zaglavlju: MP4/H.264 gde pregledač kodira, inače
 * WebM kopija. Duža stranica najviše 1280 px.
 */
export async function finishRecording(blob: Blob): Promise<Blob> {
  try {
    if (typeof VideoEncoder === "function" && typeof VideoDecoder === "function") {
      const mp4 = await convert(blob, true).catch(() => null);
      if (mp4 && mp4.size > 0) return mp4;
    }
    const webm = await convert(blob, false);
    if (!webm || webm.size === 0) throw new CreaLocalAiError("UNSUPPORTED");
    return webm;
  } catch (error) {
    throw toLocalAiError(error, "INFERENCE_FAILED");
  }
}
