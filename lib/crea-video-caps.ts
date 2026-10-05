import { classifyDevice, type CreaDeviceCaps, type CreaDeviceClass } from "./crea-device";

/**
 * Šta ovaj browser ume sa videom i koliko sme da izveze (Crea K19; plan K17-3,
 * K17-4, §1.5). Čiste funkcije nad opisom uređaja (`lib/crea-device.ts`).
 *
 * Nivoi (K17-3):
 * - `webcodecs` - pravi MP4 na uređaju (H.264 / AAC ili Opus), brže od reprodukcije;
 * - `preview`   - nema `VideoEncoder`-a (npr. Firefox za Android): pregled radi,
 *                 GIF radi, a MP4 se završava na računaru ili u Chrome-u.
 * Snimanje u realnom vremenu (`MediaRecorder`) nije uključeno u K19 (ODLUKA u
 * `docs/CREA-PROGRESS.md`).
 */

export type VideoSupportTier = "webcodecs" | "preview";

export function videoSupport(caps: CreaDeviceCaps): VideoSupportTier {
  return caps.webcodecsVideo ? "webcodecs" : "preview";
}

export type ExportLimits = {
  /** Najveća duža stranica izvoza (px). */
  maxLongSide: number;
  /** Najduži izvoz u najvećoj rezoluciji (s). */
  maxDurationS: number;
  /** Najduži izvoz u 720p (računar sme duže u manjoj rezoluciji). */
  maxDurationAt720S: number;
  maxClips: number;
  /** Najveći fajl sa uređaja po klipu. */
  maxInputBytes: number;
  /** Najduži klip koji sme unazad / bumerang (0 = ne sme). */
  reverseMaxS: number;
};

const MB = 1024 * 1024;

/**
 * Granice po klasi uređaja (K17-4, §1.5). Telefon ima kraći izvoz i obrnut klip
 * samo do 10 s (iOS gasi karticu kad memorija pređe granicu); slab uređaj radi u
 * 480p, ali bez obrtanja.
 */
export const EXPORT_LIMITS: Record<CreaDeviceClass, ExportLimits> = {
  weak: { maxLongSide: 854, maxDurationS: 30, maxDurationAt720S: 30, maxClips: 8, maxInputBytes: 100 * MB, reverseMaxS: 0 },
  phone: { maxLongSide: 1280, maxDurationS: 60, maxDurationAt720S: 60, maxClips: 20, maxInputBytes: 200 * MB, reverseMaxS: 10 },
  desktop: { maxLongSide: 1920, maxDurationS: 240, maxDurationAt720S: 480, maxClips: 60, maxInputBytes: 200 * MB, reverseMaxS: 30 },
  "desktop-gpu": { maxLongSide: 1920, maxDurationS: 240, maxDurationAt720S: 480, maxClips: 60, maxInputBytes: 200 * MB, reverseMaxS: 30 },
};

export function exportLimits(caps: CreaDeviceCaps): ExportLimits {
  return EXPORT_LIMITS[classifyDevice(caps)];
}

/** Izvoz ne sme preko ovoga: galerija prima video do 200 MB (`LOCAL_RESULT_MAX_BYTES`). */
export const EXPORT_MAX_BYTES = 190 * MB;
export const AUDIO_BITRATE = 128_000;

/** Bitrate videa po kraćoj stranici (H.264, plan §1.5): 480p 1,2 · 720p 3 · 1080p 6 Mb/s. */
export function pickVideoBitrate(width: number, height: number): number {
  const short = Math.min(width, height);
  if (short <= 480) return 1_200_000;
  if (short <= 720) return 3_000_000;
  return 6_000_000;
}

/** Procena veličine MP4 (bitrate × trajanje + ~3 % kontejnera). */
export function estimateBytes(width: number, height: number, seconds: number, withAudio: boolean): number {
  const bitsPerSecond = pickVideoBitrate(width, height) + (withAudio ? AUDIO_BITRATE : 0);
  return Math.ceil(((bitsPerSecond * Math.max(0, seconds)) / 8) * 1.03);
}

/** Najduži izvoz za datu rezoluciju na ovoj klasi uređaja. */
export function maxDurationFor(limits: ExportLimits, width: number, height: number): number {
  return Math.min(width, height) <= 720 ? limits.maxDurationAt720S : limits.maxDurationS;
}

/** Parna stranica (koder traži parne dimenzije), najmanje 2. */
export function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * Dimenzije izvoza: željena veličina preseta smanjena srazmerno do granice
 * uređaja (duža stranica), parne stranice.
 */
export function exportSize(width: number, height: number, maxLongSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxLongSide / Math.max(width, height));
  return { width: even(width * scale), height: even(height * scale) };
}
