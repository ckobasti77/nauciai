import { useEffect, useState } from "react";

import { canvasToBlob, createCanvas, decodeImage } from "@/components/crea/tools/canvas";
import type { PaidEditFiles } from "@/components/crea/tools/paid-edit";
import type { CreaPaidRoute } from "@/lib/crea-paid-edit";
import { dilateMask, maskFromAlpha, MASK_WORK_MAX_SIDE, providerMaskRgba, tintMasked, workSize } from "@/lib/crea-mask";

/**
 * Platno za alate sa maskom (K11). Čista matematika je u `lib/crea-mask.ts`;
 * ovde je samo ono što traži browser (dekodiranje, crtanje, kodiranje).
 */

/** Slika za editor maske: puna (za konačan rad) i radna, smanjena na ≤ 1536 px (za crtanje i klik). */
export type WorkImage = {
  full: ImageBitmap;
  work: HTMLCanvasElement;
  width: number;
  height: number;
};

export async function loadWorkImage(file: Blob): Promise<WorkImage> {
  const full = await decodeImage(file);
  const size = workSize(full.width, full.height, MASK_WORK_MAX_SIDE);
  const { canvas, ctx } = createCanvas(size.width, size.height);
  ctx.drawImage(full, 0, 0, size.width, size.height);
  return { full, work: canvas, width: full.width, height: full.height };
}

/** Izlaz u punoj veličini, ali ne veći od `maxSide` (telefon ima manje memorije). */
export function renderSized(source: CanvasImageSource & { width: number; height: number }, maxSide: number) {
  const size = workSize(source.width, source.height, maxSide);
  const { canvas, ctx } = createCanvas(size.width, size.height);
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return { canvas, ctx };
}

/** Najduža stranica konačnog rada: računar 4096, telefon 2048 (granica platna i memorije). */
export function outputMaxSide(mobile: boolean): number {
  return mobile ? 2048 : 4096;
}

/**
 * Maska (alfa platna editora) razvučena na `width × height`. Razvlačenje je
 * glatko, pa ivica dobija blag prelaz; `binary` je seče na 0/255 (provajder).
 */
export function scaleMask(maskCanvas: HTMLCanvasElement, width: number, height: number, binary: boolean): Uint8ClampedArray {
  const { ctx } = createCanvas(width, height);
  ctx.drawImage(maskCanvas, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  if (binary) return maskFromAlpha(rgba);
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return alpha;
}

/** Maska (0..255) kao platno čija je alfa maska - za `destination-in` slaganje. */
export function maskToCanvas(mask: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(width, height);
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < mask.length; i++) {
    image.data[i * 4 + 3] = mask[i];
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Proširena maska sa mekom ivicom (za lepljenje zakrpe bez vidljivog šava). */
export function softMask(mask: Uint8ClampedArray, width: number, height: number, radius: number): HTMLCanvasElement {
  const grown = dilateMask(mask, width, height, radius);
  // Meka ivica bez `ctx.filter` (Safari ga nema): umanji pa razvuci glatko.
  const small = Math.max(1, Math.round(radius / 2));
  const hard = maskToCanvas(grown, width, height);
  const { canvas: tiny, ctx: tinyCtx } = createCanvas(Math.max(1, Math.round(width / small)), Math.max(1, Math.round(height / small)));
  tinyCtx.drawImage(hard, 0, 0, tiny.width, tiny.height);
  const { canvas, ctx } = createCanvas(width, height);
  ctx.drawImage(tiny, 0, 0, width, height);
  // Jezgro maske ostaje potpuno pokriveno; omekšan je samo prelaz napolje.
  ctx.drawImage(maskToCanvas(mask, width, height), 0, 0);
  return canvas;
}

/** Maska za Ideogram kao PNG: crno = menja se, belo = ostaje. */
export async function providerMaskBlob(mask: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const { canvas, ctx } = createCanvas(width, height);
  const image = ctx.createImageData(width, height);
  image.data.set(providerMaskRgba(mask));
  ctx.putImageData(image, 0, 0);
  return canvasToBlob(canvas, "image/png");
}

/** Druga slika za model bez maske: original sa obojenim delom koji se menja. */
export async function zoneBlob(source: HTMLCanvasElement, mask: Uint8ClampedArray): Promise<Blob> {
  const ctx = source.getContext("2d");
  if (!ctx) throw new Error("UNSUPPORTED");
  const pixels = ctx.getImageData(0, 0, source.width, source.height);
  const { canvas, ctx: out } = createCanvas(source.width, source.height);
  const tinted = out.createImageData(source.width, source.height);
  tinted.data.set(tintMasked(pixels.data, mask));
  out.putImageData(tinted, 0, 0);
  return canvasToBlob(canvas, "image/jpeg", 0.92);
}

/** Bez providnosti: JPG; sa providnošću (PNG ulaz) ostaje PNG. */
export function outputTypeFor(file: Blob): "image/png" | "image/jpeg" {
  return file.type === "image/png" || file.type === "image/webp" ? "image/png" : "image/jpeg";
}

/** Ime fajla rezultata: `crea-<alat>-<ime>.<ekstenzija>`. */
export function resultFileName(tool: string, file: { name: string }, type: string): string {
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase().slice(0, 40) || "slika";
  return `crea-${tool}-${base}.${type === "image/png" ? "png" : "jpg"}`;
}

/** Najduža stranica slike koja ide provajderu (Ideogram ionako smanjuje veće). */
const PROVIDER_MAX_SIDE = 2048;

/** Slika i maska iz editora, u veličini koja ide provajderu; `mask` je uvek iste veličine kao slika. */
export async function prepareMaskEdit(work: WorkImage, maskCanvas: HTMLCanvasElement, route: CreaPaidRoute): Promise<PaidEditFiles> {
  const { canvas } = renderSized(work.full, PROVIDER_MAX_SIDE);
  const mask = scaleMask(maskCanvas, canvas.width, canvas.height, true);
  const image = await canvasToBlob(canvas, "image/jpeg", 0.92);
  if (route.kind === "mask") {
    return { files: { image: [image], mask: [await providerMaskBlob(mask, canvas.width, canvas.height)] }, width: canvas.width, height: canvas.height };
  }
  return { files: { image: [image, await zoneBlob(canvas, mask)] }, width: canvas.width, height: canvas.height };
}

/** Radna slika (puna + ≤ 1536 px) za izabran fajl; stara se zatvara. */
export function useWorkImage(file: File | null) {
  const [work, setWork] = useState<WorkImage | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!file) return;
    let alive = true;
    let loaded: WorkImage | null = null;
    void loadWorkImage(file)
      .then((next) => {
        loaded = next;
        if (alive) {
          setWork(next);
          setFailed(false);
        } else next.full.close();
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      loaded?.full.close();
    };
  }, [file]);
  return { work: file ? work : null, failed };
}

