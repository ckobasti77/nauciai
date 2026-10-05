/**
 * Uklanjanje pozadine (S14, K11): priprema ulaza i čitanje izlaza MODNet-a
 * (isecanje osobe na svakom uređaju). Čista logika nad pikselima; model i
 * platno su u alatu.
 */

/** MODNet: kraća stranica 512, obe deljive sa 32 (preprocessor_config modela); duža najviše 1024. */
export const MODNET_SHORT_SIDE = 512;
const MODNET_MAX_SIDE = 1024;
const MODNET_MULTIPLE = 32;

/** Ulaz MODNet-a za sliku date veličine (stranice deljive sa 32 - inače model pada). */
export function modnetInputSize(width: number, height: number): { width: number; height: number } {
  const short = Math.min(width, height);
  let scale = MODNET_SHORT_SIDE / short;
  if (Math.max(width, height) * scale > MODNET_MAX_SIDE) scale = MODNET_MAX_SIDE / Math.max(width, height);
  const fit = (side: number) => Math.max(MODNET_MULTIPLE, Math.round((side * scale) / MODNET_MULTIPLE) * MODNET_MULTIPLE);
  return { width: fit(width), height: fit(height) };
}

/** MODNet: RGBA → NCHW float `(v/255 - 0,5) / 0,5`, tj. opseg -1..1. */
export function modnetTensor(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const plane = width * height;
  const out = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (rgba[i * 4 + c] / 255 - 0.5) / 0.5;
  }
  return out;
}

/**
 * Izlaz modela → providnost 0..255. Neki izvozi vraćaju verovatnoću (0..1), neki
 * „logite" - ista provera kao u transformers.js (`ImageSegmentationPipeline`):
 * ako ima vrednosti van [0, 1], primeni sigmoid.
 */
export function matteFromOutput(output: Float32Array): Uint8ClampedArray {
  const epsilon = 1e-5;
  let logits = false;
  for (let i = 0; i < output.length; i++) {
    if (output[i] < -epsilon || output[i] > 1 + epsilon) {
      logits = true;
      break;
    }
  }
  const alpha = new Uint8ClampedArray(output.length);
  for (let i = 0; i < output.length; i++) {
    const v = logits ? 1 / (1 + Math.exp(-output[i])) : output[i];
    alpha[i] = Math.round(v * 255);
  }
  return alpha;
}

/** Nova pozadina: providna, boja, zamućena fotka, tvoja slika - ili AI scena (plaćeno). */
export type CreaBackgroundKind = "providno" | "boja" | "zamuceno" | "slika" | "ai";

/** Boje za brz izbor: brend sveske + neutralne koje se traže za dokumenta i prodaju. */
export const BACKGROUND_SWATCHES = ["#ffffff", "#fffdf8", "#f4be30", "#0e3158", "#e8eef5", "#111827", "#d9f2e6", "#ffd6dc"] as const;

/** `#rgb`/`#rrggbb` → `#rrggbb` malim slovima, ili `null`. */
export function normalizeHex(value: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((ch) => ch + ch).join("") : match[1];
  return `#${hex.toLowerCase()}`;
}

/** Koliko se fotka zamuti iza osobe: poluprečnik u pikselima, srazmerno slici. */
export function backgroundBlurRadius(width: number, height: number, strength: number): number {
  return Math.max(2, Math.round((Math.max(width, height) / 100) * Math.max(0.5, strength)));
}

/** Da li isečak ima smisla: model nije našao ništa (ili je sve prednji plan). */
export function matteCoverage(alpha: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < alpha.length; i++) sum += alpha[i];
  return alpha.length > 0 ? sum / (alpha.length * 255) : 0;
}
