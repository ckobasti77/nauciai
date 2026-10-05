import type { CreaDeviceClass } from "./crea-device";

/**
 * Uvećanje 2× na uređaju (S16, K11): Swin2SR lightweight ×2 nad pločicama.
 * Model traži stranice deljive sa 8, a memorija i vreme rastu sa brojem
 * piksela - zato slika ide u pločice sa preklopom (bez šavova), a granica
 * veličine zavisi od uređaja. Čista logika: raspored pločica, uzorkovanje i
 * upis - geometrija se testira bez modela.
 */

/** Stranica ulaza modela mora biti deljiva sa ovim (Swin2SR `pad_size`). */
export const SWIN_MULTIPLE = 8;
/** Koliko piksela okoline svaka pločica vidi sa svake strane (da šav ne bude vidljiv). */
export const UPSCALE_OVERLAP = 8;

/**
 * Najveći ulaz (u pikselima) po uređaju. Izmereno na WASM-u (jedna nit):
 * ~0,16 ms po pikselu ulaza, pa 0,6 MP ≈ 100 s na računaru; telefon je 2-3×
 * sporiji i ima malo memorije. Sa WebGPU-om ide i 2 MP (1920×1080 → 4K).
 */
export const UPSCALE_MAX_INPUT_PIXELS: Record<CreaDeviceClass, number> = {
  weak: 120_000,
  phone: 250_000,
  desktop: 600_000,
  "desktop-gpu": 2_100_000,
};

/** Unutrašnja stranica pločice: na WebGPU-u veća (manje poziva), na WASM-u manja (češći napredak). */
export function upscaleTileSide(backend: "wasm" | "webgpu"): number {
  return backend === "webgpu" ? 240 : 112;
}

export type UpscaleCheck = { ok: true } | { ok: false; maxPixels: number; maxSide: number };

/** Da li slika sme da se uveća na ovom uređaju; ako ne, do koje veličine bi smela (kvadrat iste površine). */
export function checkUpscale(width: number, height: number, deviceClass: CreaDeviceClass): UpscaleCheck {
  const maxPixels = UPSCALE_MAX_INPUT_PIXELS[deviceClass];
  if (width * height <= maxPixels) return { ok: true };
  return { ok: false, maxPixels, maxSide: Math.floor(Math.sqrt(maxPixels)) };
}

export type TileRect = { x: number; y: number; width: number; height: number };
/** `inner`: deo slike koji pločica upisuje; `input`: šta model vidi (sa okolinom, deljivo sa 8; sme da viri van slike). */
export type UpscaleTile = { inner: TileRect; input: TileRect };

function roundUp(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

/** Raspored pločica koje zajedno pokrivaju celu sliku tačno jednom (po `inner`). */
export function planTiles(width: number, height: number, side: number, overlap = UPSCALE_OVERLAP): UpscaleTile[] {
  const tiles: UpscaleTile[] = [];
  for (let y = 0; y < height; y += side) {
    for (let x = 0; x < width; x += side) {
      const inner = { x, y, width: Math.min(side, width - x), height: Math.min(side, height - y) };
      tiles.push({
        inner,
        input: {
          x: x - overlap,
          y: y - overlap,
          width: roundUp(inner.width + 2 * overlap, SWIN_MULTIPLE),
          height: roundUp(inner.height + 2 * overlap, SWIN_MULTIPLE),
        },
      });
    }
  }
  return tiles;
}

/**
 * Ulaz pločice za model: NCHW float 0..1. Piksel van slike uzima najbliži
 * piksel ivice (kao `edge` padding), pa ivica fotke ne dobija tamni okvir.
 */
export function sampleTile(rgba: Uint8ClampedArray, width: number, height: number, rect: TileRect): Float32Array {
  const plane = rect.width * rect.height;
  const out = new Float32Array(plane * 3);
  for (let ty = 0; ty < rect.height; ty++) {
    const sy = Math.min(height - 1, Math.max(0, rect.y + ty));
    for (let tx = 0; tx < rect.width; tx++) {
      const sx = Math.min(width - 1, Math.max(0, rect.x + tx));
      const s = (sy * width + sx) * 4;
      const t = ty * rect.width + tx;
      out[t] = rgba[s] / 255;
      out[plane + t] = rgba[s + 1] / 255;
      out[2 * plane + t] = rgba[s + 2] / 255;
    }
  }
  return out;
}

/**
 * Izlaz modela (NCHW, `factor`× veći od `tile.input`) → samo `inner` deo, u
 * izlaznu sliku (`factor`× veću od originala). Alfa ostaje neprovidna.
 */
export function writeTile(
  out: Uint8ClampedArray,
  outWidth: number,
  output: Float32Array,
  tile: UpscaleTile,
  factor = 2,
): void {
  const inW = tile.input.width * factor;
  const plane = inW * tile.input.height * factor;
  const offX = (tile.inner.x - tile.input.x) * factor;
  const offY = (tile.inner.y - tile.input.y) * factor;
  const w = tile.inner.width * factor;
  const h = tile.inner.height * factor;
  for (let y = 0; y < h; y++) {
    const src = (offY + y) * inW + offX;
    const dst = ((tile.inner.y * factor + y) * outWidth + tile.inner.x * factor) * 4;
    for (let x = 0; x < w; x++) {
      const s = src + x;
      const d = dst + x * 4;
      out[d] = Math.round(output[s] * 255);
      out[d + 1] = Math.round(output[plane + s] * 255);
      out[d + 2] = Math.round(output[2 * plane + s] * 255);
      out[d + 3] = 255;
    }
  }
}
