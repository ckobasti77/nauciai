/**
 * Rezervni put za čitanje videa kad pregledač nema WebCodecs (npr. Firefox za
 * Android, plan K17-3 nivo C): običan `<video>` element, premotavanje (`seeked`)
 * i crtanje kadra na platno. Sporije i manje tačno od mediabunny-ja, ali radi svuda.
 */

export type LoadedVideo = { video: HTMLVideoElement; release: () => void };

function waitFor(target: HTMLVideoElement, event: "loadedmetadata" | "seeked" | "loadeddata", signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("VIDEO_NE_MOZE"));
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    function cleanup() {
      target.removeEventListener(event, done);
      target.removeEventListener("error", fail);
      signal?.removeEventListener("abort", abort);
    }
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", fail, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Video spreman za premotavanje; `release` oslobađa `blob:` adresu i element. */
export async function loadVideoElement(source: Blob | string, signal?: AbortSignal): Promise<LoadedVideo> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  // Radovi iz galerije su na Convex storage-u, koji šalje CORS (K04) - bez ovoga bi platno bilo „zaprljano".
  if (typeof source === "string") video.crossOrigin = "anonymous";
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const loaded = waitFor(video, "loadeddata", signal);
  video.src = url;
  await loaded;
  return {
    video,
    release: () => {
      video.removeAttribute("src");
      video.load();
      if (typeof source !== "string") URL.revokeObjectURL(url);
    },
  };
}

export async function seekVideo(video: HTMLVideoElement, timeS: number, signal?: AbortSignal): Promise<void> {
  const target = Math.max(0, Math.min(timeS, Number.isFinite(video.duration) ? video.duration : timeS));
  if (Math.abs(video.currentTime - target) < 0.0005) return;
  const seeked = waitFor(video, "seeked", signal);
  video.currentTime = target;
  await seeked;
}

/** Trenutni kadar na novo platno pune veličine. */
export function drawVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PLATNO");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}
