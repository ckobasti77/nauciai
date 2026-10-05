import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";

/**
 * Sitni pomoćnici platna za lokalne alate (K09). Bez teških biblioteka: `pica`
 * se uvozi tek u `resizeCanvas`, pa ovaj modul ne vuče ništa u chunk alata.
 */

/** Slika iz fajla, okrenuta po EXIF orijentaciji (kao što je korisnik vidi). */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    throw new CreaLocalAiError("BAD_INPUT", error);
  }
}

export function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new CreaLocalAiError("UNSUPPORTED");
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

/** Slika smanjena tako da joj duža stranica bude najviše `maxSide` (nikad uvećana). */
export function drawScaled(source: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const { canvas, ctx } = createCanvas(source.width * scale, source.height * scale);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, scale };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new CreaLocalAiError("INFERENCE_FAILED"))), type, quality),
  );
}

/**
 * Kvalitetna promena veličine (`pica`, Lanczos + blago izoštravanje). Platno
 * samo smanjuje „stepenasto" kad je razlika velika; pica daje oštriji rezultat.
 */
export async function resizeCanvas(from: HTMLCanvasElement, width: number, height: number): Promise<HTMLCanvasElement> {
  if (from.width === width && from.height === height) return from;
  const { canvas } = createCanvas(width, height);
  try {
    const { default: pica } = await import("pica");
    await pica().resize(from, canvas, { filter: "mks2013" });
  } catch (error) {
    throw toLocalAiError(error, "INFERENCE_FAILED");
  }
  return canvas;
}

/** Kopiranje u clipboard; `false` kad browser ne da (stari browser, nije HTTPS). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
