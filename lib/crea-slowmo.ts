/**
 * Usporeni snimak (Crea K20, V17; plan K17 §5): video 2× ili 4× sporiji, bez
 * seckanja. Na uređaju, bez AI modela - između dva prava kadra ubacuju se
 * STOPLJENI kadrovi (meko pretapanje susednih kadrova). RIFE (pravo „izmišljanje"
 * kadrova) nema zakucanu reviziju sa MIT licencom, pa čeka (ODLUKA K20).
 *
 * Tajming: kadar `i` (vreme `t`, trajanje `d`) daje `factor` izlaznih kadrova
 * od `t·factor` na korak `d`; `blend` je udeo SLEDEĆEG kadra (0 = čist kadar).
 * Izlaz ima isti broj kadrova u sekundi kao ulaz, a traje `factor` puta duže.
 * Zvuk se izbacuje (usporen zvuk je neprepoznatljiv).
 *
 * Čiste funkcije - testira ih `crea-slowmo.test.ts`.
 */

export const SLOWMO_FACTORS = [2, 4] as const;
export type SlowmoFactor = (typeof SLOWMO_FACTORS)[number];

/** Najduži ulaz (plan K17 §5: „Slow-mo 2× / 4× samo ≤ 10 s"). */
export const SLOWMO_MAX_INPUT_S = 10;

export type SlowmoFrame = { timestamp: number; duration: number; blend: number };

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Izlazni kadrovi za interval između kadra `frame` i sledećeg. `hasNext = false`
 * (poslednji kadar) daje iste trenutke bez stapanja.
 */
export function slowmoFrames(frame: { timestamp: number; duration: number }, factor: number, hasNext: boolean): SlowmoFrame[] {
  const duration = frame.duration > 0 ? frame.duration : 1 / 30;
  const start = frame.timestamp * factor;
  return Array.from({ length: factor }, (_, step) => ({
    timestamp: round6(start + step * duration),
    duration: round6(duration),
    blend: hasNext ? step / factor : 0,
  }));
}

/** Trajanje izlaza. */
export function slowmoDuration(seconds: number, factor: number): number {
  return seconds * factor;
}

/** Zašto ulaz ne može (ili `null`). */
export function slowmoProblem(seconds: number): "predugo" | "prazno" | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return "prazno";
  if (seconds > SLOWMO_MAX_INPUT_S + 0.05) return "predugo";
  return null;
}

/** Da li je kadar poslednji u videu (posle njega nema sledećeg za stapanje). */
export function isLastFrame(frame: { timestamp: number; duration: number }, durationS: number): boolean {
  return frame.timestamp + Math.max(frame.duration, 1e-3) >= durationS - 1e-3;
}
