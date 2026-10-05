import { drawVideoFrame, loadVideoElement, seekVideo } from "@/components/crea/video/engine/video-element";

/**
 * Šta je u fajlu koji ulazi u montažu (Crea K19): trajanje, veličina i sličica
 * za traku. Bez mediabunny-ja - samo `<video>`, `<audio>` i `createImageBitmap`,
 * pa radi na svakom pregledaču (i bez WebCodecs-a) i ne vuče motor u UI.
 */

export type MediaKind = "video" | "image" | "audio";
export type ProbedMedia = { durationS: number | null; width: number | null; height: number | null };

function audioDuration(source: Blob | string, signal?: AbortSignal): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const done = (value: number | null) => {
      audio.removeAttribute("src");
      audio.load();
      if (typeof source !== "string") URL.revokeObjectURL(url);
      resolve(value);
    };
    signal?.addEventListener("abort", () => done(null), { once: true });
    audio.preload = "metadata";
    if (typeof source === "string") audio.crossOrigin = "anonymous";
    audio.addEventListener("loadedmetadata", () => done(Number.isFinite(audio.duration) ? audio.duration : null), { once: true });
    audio.addEventListener("error", () => done(null), { once: true });
    audio.src = url;
  });
}

/** Trajanje (video, zvuk) i veličina (video, slika); `null` kad pregledač ne ume da otvori fajl. */
export async function probeMedia(kind: MediaKind, source: Blob | string, signal?: AbortSignal): Promise<ProbedMedia | null> {
  try {
    if (kind === "image") {
      const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const probed = { durationS: null, width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return probed;
    }
    if (kind === "audio") {
      const durationS = await audioDuration(source, signal);
      return durationS === null ? null : { durationS, width: null, height: null };
    }
    const { video, release } = await loadVideoElement(source, signal);
    try {
      return {
        durationS: Number.isFinite(video.duration) ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      };
    } finally {
      release();
    }
  } catch {
    return null;
  }
}

/** Slika za traku i spiskove (EXIF orijentacija, duža stranica ≤ `maxSide`). */
export async function loadImageBitmap(source: Blob | string, maxSide: number): Promise<ImageBitmap> {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const full = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(full.width, full.height));
  if (scale >= 1) return full;
  const resized = await createImageBitmap(full, {
    resizeWidth: Math.max(1, Math.round(full.width * scale)),
    resizeHeight: Math.max(1, Math.round(full.height * scale)),
    resizeQuality: "high",
  });
  full.close();
  return resized;
}

/** Sličica kadra videa u trenutku `timeS` kao `blob:` JPG (visina `height`). */
export async function videoThumbnail(source: Blob | string, timeS: number, height: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const { video, release } = await loadVideoElement(source, signal);
    try {
      await seekVideo(video, Math.min(Math.max(0, timeS), Math.max(0, video.duration - 0.05)), signal);
      const frame = drawVideoFrame(video);
      const canvas = document.createElement("canvas");
      canvas.height = height;
      canvas.width = Math.max(1, Math.round((frame.width / Math.max(1, frame.height)) * height));
      canvas.getContext("2d")?.drawImage(frame, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
      return blob ? URL.createObjectURL(blob) : null;
    } finally {
      release();
    }
  } catch {
    return null;
  }
}
