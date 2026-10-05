/**
 * „Odglumi" (Crea K20, V20; plan K17 §5): snimiš se kamerom u browseru, a lik sa
 * tvoje slike ponovi pokret (postojeći Kling prenos pokreta, `kling-motion`).
 * Snimak je referentni POKRET - na njemu si uvek ti (čekboks, K17-15); lice koje
 * se pomera je samo tvoj Lik sa pristankom ili rad koji je Crea napravila (server).
 *
 * Čiste funkcije za snimanje: granice trajanja, odbrojavanje, izbor formata.
 * Test: `crea-act.test.ts`.
 */

/** Snimak traje 3-10 s (podrazumevano 5) - Kling prenos se naplaćuje po sekundi. */
export const ACT_SECONDS = { min: 3, max: 10, default: 5 } as const;
/** Odbrojavanje pre snimanja: 3-2-1. */
export const ACT_COUNTDOWN_S = 3;

export const ACT_MOTION_MODEL = { slug: "kling-motion", inputMode: "video_image" } as const;

/**
 * Format snimka koji pregledač ume (prvi podržan). MP4/H.264 (Safari, novi Chrome)
 * ide pravo; WebM se posle snimanja prepakuje (MediaRecorder WebM nema trajanje u
 * zaglavlju, a server po trajanju naplaćuje - plan K17 §7 K20 zamke).
 */
export const ACT_RECORDER_TYPES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export function pickRecorderType(isTypeSupported: (type: string) => boolean): string | null {
  for (const type of ACT_RECORDER_TYPES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // Stari pregledači bacaju za nepoznat tip - znači „ne".
    }
  }
  return null;
}

/** Izabrana dužina snimka, uvek u granicama. */
export function clampActSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return ACT_SECONDS.default;
  return Math.min(ACT_SECONDS.max, Math.max(ACT_SECONDS.min, Math.round(seconds)));
}

/** Snimak koji ne može u prenos pokreta (ili `null`). */
export function actClipProblem(seconds: number | null): "prekratko" | "predugo" | "nema" | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "nema";
  if (seconds < ACT_SECONDS.min - 0.25) return "prekratko";
  // Fajl sa uređaja sme duže (Kling prenos prima do 60 s), snimak kamerom staje na 10 s sam.
  if (seconds > 60.05) return "predugo";
  return null;
}

/** Faza snimanja u trenutku `elapsedS` od klika: odbrojavanje, snimanje ili kraj. */
export function actPhaseAt(elapsedS: number, recordSeconds: number): { phase: "odbrojavanje" | "snimanje" | "kraj"; left: number } {
  if (elapsedS < ACT_COUNTDOWN_S) return { phase: "odbrojavanje", left: Math.ceil(ACT_COUNTDOWN_S - elapsedS) };
  const recorded = elapsedS - ACT_COUNTDOWN_S;
  if (recorded < recordSeconds) return { phase: "snimanje", left: Math.ceil(recordSeconds - recorded) };
  return { phase: "kraj", left: 0 };
}
