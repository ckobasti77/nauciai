/**
 * Izvlačenje kadra iz videa na uređaju (Crea K18, V4; plan K17 §1.6) - čista
 * logika oko vremena i formata. Sam rad (mediabunny + WebCodecs, ili `<video>`
 * kad WebCodecs nema) je u `components/crea/video/engine/frames.ts`.
 */

/** Najviše piksela izvučenog kadra koji ide kao PNG; veći ide kao JPG (manji fajl, ulaz modela ≤ 10 MB). */
export const FRAME_PNG_MAX_PIXELS = 4_000_000;
/** Kvalitet JPG kadra. */
export const FRAME_JPEG_QUALITY = 0.92;
/** Podrazumevan fps kad ga video ne prijavi. */
export const FALLBACK_FPS = 30;

/**
 * Vremena (u sekundama) koja se probaju za POSLEDNJI kadar, redom: tik pred kraj,
 * pa po jedan kadar unazad (poslednji paket je ponekad kadar bez prikaza, pa
 * dekoder za tačan kraj ne vrati ništa). Nikad ispod nule, bez ponavljanja.
 */
export function lastFrameCandidates(durationS: number, fps: number | null | undefined): number[] {
  if (!Number.isFinite(durationS) || durationS <= 0) return [0];
  const step = 1 / (fps && fps > 0 ? fps : FALLBACK_FPS);
  const times = [durationS - 0.001, durationS - step, durationS - 2 * step, durationS - 3 * step].map((time) =>
    Math.max(0, Math.round(time * 1_000_000) / 1_000_000),
  );
  return [...new Set(times)];
}

/** Vreme za klizač „izaberi kadar" (0..1 dužine), uvek unutar klipa. */
export function frameTimeAt(durationS: number, fraction: number): number {
  if (!Number.isFinite(durationS) || durationS <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 1));
  return Math.min(durationS - 0.001, clamped * durationS);
}

/** PNG za manje kadrove (bez gubitka), JPG za velike. */
export function frameMimeType(width: number, height: number): "image/png" | "image/jpeg" {
  return width * height <= FRAME_PNG_MAX_PIXELS ? "image/png" : "image/jpeg";
}

/** Ime fajla kadra: `kadar-12_4s.png`. */
export function frameFileName(timeS: number, mime: string): string {
  const seconds = (Math.round(timeS * 10) / 10).toFixed(1).replace(".", "_");
  return `kadar-${seconds}s.${mime === "image/png" ? "png" : "jpg"}`;
}

/** Srednja svetlina (0-255) iz RGBA uzorka - crn kadar na kraju (Safari) se odbacuje. */
export function averageLuma(rgba: Uint8ClampedArray): number {
  let sum = 0;
  let count = 0;
  for (let index = 0; index + 3 < rgba.length; index += 4) {
    sum += 0.2126 * rgba[index] + 0.7152 * rgba[index + 1] + 0.0722 * rgba[index + 2];
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/** Ispod ovoga kadar smatramo praznim (crnim). */
export const BLACK_FRAME_LUMA = 4;
