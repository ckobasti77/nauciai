"use client";

import { decodeImage, drawScaled } from "@/components/crea/tools/canvas";
import { brandColorsFromPalette } from "@/lib/crea-brand-kit";
import { tidyPalette, type Rgb } from "@/lib/crea-palette";

/**
 * Boje brenda iz logoa (S38): `colorthief` (učitava se tek ovde) + sređivanje
 * palete; bela pozadina logoa nije boja brenda (`brandColorsFromPalette`).
 */
export async function colorsFromLogo(file: Blob): Promise<string[]> {
  const [{ getPaletteSync }, bitmap] = await Promise.all([import("colorthief"), decodeImage(file)]);
  const { canvas } = drawScaled(bitmap, 400);
  bitmap.close();
  const raw = getPaletteSync(canvas, { colorCount: 10, quality: 2 }) ?? [];
  return brandColorsFromPalette(tidyPalette(raw.map((color) => ({ rgb: color.array() as Rgb, share: color.proportion })), 8));
}

/**
 * Logo za upload: uvek PNG do 1024 px (providnost ostaje), jer server prima samo
 * PNG/JPG/WebP, a modeli bolje čitaju umerenu veličinu.
 */
export async function logoPng(file: Blob): Promise<File> {
  const bitmap = await decodeImage(file);
  const { canvas } = drawScaled(bitmap, 1024);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((out) => (out ? resolve(out) : reject(new Error("PNG"))), "image/png"));
  return new File([blob], "crea-logo.png", { type: "image/png" });
}
