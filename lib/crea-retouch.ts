/**
 * Retuš i stare fotke (S22, K12). Blag retuš kože je filter na uređaju (0 kr):
 * zamućena kopija se meša sa fotkom samo tamo gde je boja kože i gde nema
 * ivice (oči, obrve, usne i kosa ostaju oštri). „Vrati staru fotku" je plaćeno -
 * Nano Banana Pro sa opisom restauracije (model za obnovu lica GFPGAN/CodeFormer
 * ima nekomercijalnu licencu, §6, pa se ne koristi).
 *
 * Čista logika nad RGBA baferom; platno je u `components/crea/tools/retouch-tool.tsx`.
 */

import type { Locale } from "./i18n";

export type RetouchLevel = "blago" | "srednje" | "jace";

/** Najveći udeo zamućene kopije u pikselu kože - koža mora da ostane koža, ne plastika. */
export const RETOUCH_STRENGTH: Record<RetouchLevel, number> = { blago: 0.35, srednje: 0.55, jace: 0.75 };

/** Telefon: najviše ~4 MP (memorija), računar ~12 MP. */
export const RETOUCH_MAX_PIXELS = { phone: 4_000_000, desktop: 12_000_000 } as const;

/**
 * Koliko je piksel „koža" (0..1), po hromi u YCbCr prostoru (klasičan opseg
 * Cb 77-127, Cr 133-173) sa mekim rubom, i bez vrlo tamnih/svetlih piksela.
 */
export function skinWeight(r: number, g: number, b: number): number {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (y < 40 || y > 245) return 0;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const soft = 6;
  const inside = (value: number, min: number, max: number) => {
    if (value < min - soft || value > max + soft) return 0;
    if (value < min) return (value - (min - soft)) / soft;
    if (value > max) return (max + soft - value) / soft;
    return 1;
  };
  return Math.min(inside(cb, 77, 127), inside(cr, 133, 173));
}

/** Poluprečnik zamućenja po veličini fotke: ~0,5 % kraće stranice, 2-12 px. */
export function retouchRadius(width: number, height: number): number {
  return Math.max(2, Math.min(12, Math.round(Math.min(width, height) * 0.005)));
}

/** Kutijasto zamućenje (vodoravno pa uspravno), RGB; alfa se ne dira. */
export function boxBlur(rgba: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  if (radius < 1) return out;
  const temp = new Float32Array(width * height * 3);
  const size = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += rgba[(y * width + Math.min(width - 1, Math.max(0, k))) * 4 + c]!;
      for (let x = 0; x < width; x++) {
        temp[(y * width + x) * 3 + c] = sum / size;
        const add = Math.min(width - 1, x + radius + 1);
        const remove = Math.max(0, x - radius);
        sum += rgba[(y * width + add) * 4 + c]! - rgba[(y * width + remove) * 4 + c]!;
      }
    }
  }
  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += temp[(Math.min(height - 1, Math.max(0, k)) * width + x) * 3 + c]!;
      for (let y = 0; y < height; y++) {
        out[(y * width + x) * 4 + c] = Math.round(sum / size);
        const add = Math.min(height - 1, y + radius + 1);
        const remove = Math.max(0, y - radius);
        sum += temp[(add * width + x) * 3 + c]! - temp[(remove * width + x) * 3 + c]!;
      }
    }
  }
  return out;
}

/**
 * Razlika svetline (0-255) od koje se piksel smatra ivicom (pora i fleka su
 * ispod, oko, obrva i usna iznad) - tu se ne zamućuje.
 */
export const RETOUCH_EDGE = { soft: 14, hard: 34 } as const;

/**
 * Blag retuš kože. Zamućenje dvaput (bliže Gausu), pa mešanje po pikselu:
 * jačina × koža × (nije ivica). Vraća nov bafer; `strength` 0 = ista slika.
 */
export function retouchPixels(rgba: Uint8ClampedArray, width: number, height: number, strength: number): Uint8ClampedArray {
  const amountMax = Math.min(1, Math.max(0, strength));
  if (amountMax === 0) return new Uint8ClampedArray(rgba);
  const radius = retouchRadius(width, height);
  const blurred = boxBlur(boxBlur(rgba, width, height, radius), width, height, Math.max(1, Math.round(radius / 2)));
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const skin = skinWeight(r, g, b);
    if (skin === 0) continue;
    const lumOriginal = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const lumBlurred = 0.2126 * blurred[i]! + 0.7152 * blurred[i + 1]! + 0.0722 * blurred[i + 2]!;
    const difference = Math.abs(lumOriginal - lumBlurred);
    const flat =
      difference <= RETOUCH_EDGE.soft ? 1 : difference >= RETOUCH_EDGE.hard ? 0 : 1 - (difference - RETOUCH_EDGE.soft) / (RETOUCH_EDGE.hard - RETOUCH_EDGE.soft);
    const amount = amountMax * skin * flat;
    if (amount === 0) continue;
    out[i] = Math.round(r + (blurred[i]! - r) * amount);
    out[i + 1] = Math.round(g + (blurred[i + 1]! - g) * amount);
    out[i + 2] = Math.round(b + (blurred[i + 2]! - b) * amount);
  }
  return out;
}

/** Udeo piksela koji izgledaju kao koža - ispod 1 % retuš nema šta da radi. */
export function skinShare(rgba: Uint8ClampedArray, step = 4): number {
  let skin = 0;
  let total = 0;
  for (let i = 0; i < rgba.length; i += 4 * step) {
    total += 1;
    if (skinWeight(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!) > 0.5) skin += 1;
  }
  return total === 0 ? 0 : skin / total;
}

export const MIN_SKIN_SHARE = 0.01;

/** Opis za „Vrati staru fotku" (Nano Banana Pro). */
export function restorePrompt(colorize: boolean, extra: string, locale: Locale): string {
  const said = extra.trim();
  if (locale === "sr") {
    return (
      "Restauriraj ovu staru fotografiju: ukloni ogrebotine, pukotine, mrlje, prašinu, pregibe i izbledele delove, vrati prirodan kontrast i blago izoštri. " +
      (colorize ? "Oboji je prirodnim, verodostojnim bojama tog vremena. " : "Zadrži njene boje (crno-bela ostaje crno-bela). ") +
      "Lica, crte lica, izrazi, frizure, odeća, kompozicija i kadar ostaju potpuno isti; ništa ne dodaj i ne uklanjaj." +
      (said ? ` Dodatno: ${said}.` : "")
    );
  }
  return (
    "Restore this old photo: remove scratches, cracks, stains, dust, creases and faded patches, bring back natural contrast and sharpen gently. " +
    (colorize ? "Colourise it with natural, believable colours of its era. " : "Keep its colours (a black-and-white photo stays black and white). ") +
    "Faces, facial features, expressions, hairstyles, clothes, composition and framing stay exactly the same; add or remove nothing." +
    (said ? ` Also: ${said}.` : "")
  );
}
