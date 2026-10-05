/**
 * Snimač u browseru (Crea K24, A17): izbor formata i granice. Čista logika;
 * `MediaRecorder` je u alatu.
 */

/** Redom: Opus u WebM-u (Chrome, Firefox, Android), AAC u MP4-u (Safari, iPhone), Opus u Ogg-u. */
export const RECORDER_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"] as const;

/** Prvi format koji pregledač ume da snimi; `""` = neka pregledač izabere sam. */
export function pickRecorderMime(isTypeSupported: (mime: string) => boolean): string {
  for (const mime of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(mime)) return mime;
    } catch {
      // Stari Safari baca umesto da vrati `false`.
    }
  }
  return "";
}

/** Tip bez parametara kodeka (`audio/webm;codecs=opus` → `audio/webm`) - takav čuva galerija. */
export function baseMime(mime: string): string {
  return mime.split(";")[0]!.trim().toLowerCase() || "audio/webm";
}

export function recordingExtension(mime: string): "webm" | "m4a" | "ogg" {
  const base = baseMime(mime);
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/ogg") return "ogg";
  return "webm";
}

export const RECORDER_LIMITS = {
  /** Najduži snimak (s); Opus ~32 kb/s → ~2,4 MB za 10 minuta. */
  maxSeconds: 10 * 60,
  /** Koliko pokušaja se pamti na ekranu (stariji se brišu). */
  takes: 5,
} as const;

/** „Tiho" / „Dobro" / „Preglasno" za merač (nivo 0..1 iz `meterLevel`: −60..0 dB RMS; govor je oko −30..−12). */
export function meterZone(level: number): "tiho" | "dobro" | "preglasno" {
  if (level >= 0.9) return "preglasno";
  if (level >= 0.4) return "dobro";
  return "tiho";
}
