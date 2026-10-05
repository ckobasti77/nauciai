/**
 * Maska osobe kroz video (Crea K20, V18): MediaPipe selfie segmenter daje
 * poverenje 0..1 po kadru (256 × 256). Da ivica ne „trepće" od kadra do kadra,
 * maska se meša sa prethodnom (eksponencijalno izglađivanje), a poverenje se
 * pretvara u providnost mekim pragom (meka ivica, bez stepenica).
 *
 * Čiste funkcije - test: `crea-video-matte.test.ts`.
 */

/** Koliko prethodne maske ostaje u novoj (0 = bez izglađivanja). */
export const MATTE_MEMORY = 0.45;
/** Meki prag: ispod `low` je pozadina, iznad `high` osoba, između blag prelaz. */
export const MATTE_EDGE = { low: 0.35, high: 0.75 } as const;

/** Nova maska izmešana sa prethodnom (iste veličine); prva maska ostaje kakva jeste. */
export function blendMatte(previous: Float32Array | null, next: Float32Array, memory = MATTE_MEMORY): Float32Array {
  if (!previous || previous.length !== next.length || memory <= 0) return next;
  const out = new Float32Array(next.length);
  for (let index = 0; index < next.length; index++) out[index] = previous[index]! * memory + next[index]! * (1 - memory);
  return out;
}

/** Poverenje → providnost 0..255 (smoothstep između `low` i `high`). */
export function matteAlpha(confidence: Float32Array, edge: { low: number; high: number } = MATTE_EDGE): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(confidence.length);
  const span = Math.max(1e-6, edge.high - edge.low);
  for (let index = 0; index < confidence.length; index++) {
    const x = Math.min(1, Math.max(0, (confidence[index]! - edge.low) / span));
    alpha[index] = Math.round(x * x * (3 - 2 * x) * 255);
  }
  return alpha;
}

/** Koliki deo kadra je osoba (0..1) - „osoba nije nađena" kad je skoro nula u celom videu. */
export function matteCoverage(alpha: Uint8ClampedArray): number {
  if (alpha.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < alpha.length; index++) sum += alpha[index]!;
  return sum / (alpha.length * 255);
}
