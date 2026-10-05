"use client";

import { Lora, Montserrat, Pangolin } from "next/font/google";

import type { CreaFontId } from "@/lib/crea-editor-scene";
import type { MeasureText } from "@/lib/crea-text-fit";

/**
 * Slova na platnu (S28, K10). Nunito i Patrick Hand već učitava sajt
 * (`app/[locale]/layout.tsx`, promenljive `--font-nunito` i `--font-patrick-hand`).
 * Nunito ima latinicu sa č ć š ž đ i ćirilicu. Patrick Hand ima č ć š ž đ, ali
 * NEMA ćirilicu - bez zamene bi ćirilica u rukopisu pala na Arial. Zato iza
 * njega stoji Pangolin (OFL, sličan rukopis, ima ćirilicu): browser crta latinicu
 * Patrick Handom, a ćirilična slova Pangolinom. Pangolin se učitava samo ovde,
 * u chunk-u editora, i samo kad se pojavi ćirilica (`unicode-range`).
 */
const pangolin = Pangolin({ weight: "400", subsets: ["cyrillic"], display: "swap", preload: false });

/**
 * Fontovi brend kita (K15): Montserrat i Lora (oba OFL, latinica sa č ć š ž đ i
 * ćirilica). Kao i Pangolin, učitavaju se samo u chunk-u editora i tek kad ih
 * platno zatraži.
 */
const montserrat = Montserrat({ weight: ["400", "700", "900"], subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", preload: false });
const lora = Lora({ weight: ["400", "700"], subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", preload: false });

/** Uzorak koji tera browser da učita sve podskupove: latinicu, č ć š ž đ i ćirilicu. */
const FONT_SAMPLE = "AaČčĆćŠšŽžĐđ Ђђ Ћћ Љљ Њњ Џџ Жж";

function cssVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function firstFamily(stack: string, fallback: string): string {
  return stack.split(",")[0]?.trim() || fallback;
}

/** Porodica fonta za platno (isti niz koji Konva upisuje u `ctx.font`). */
export function fontFamilyFor(font: CreaFontId): string {
  if (font === "nunito") return cssVar("--font-nunito") || "Nunito, sans-serif";
  if (font === "montserrat") return montserrat.style.fontFamily;
  if (font === "lora") return lora.style.fontFamily;
  const hand = firstFamily(cssVar("--font-patrick-hand"), "'Patrick Hand'");
  return `${hand}, ${pangolin.style.fontFamily}`;
}

export function canvasFont(font: CreaFontId, weight: number, fontSize: number): string {
  // Isti redosled kao Konva: stil (debljina), varijanta, veličina, porodica.
  return `${weight} normal ${fontSize}px ${fontFamilyFor(font)}`;
}

let loading: Promise<void> | null = null;

/**
 * Učitaj sve debljine i podskupove PRE crtanja: platno ne čeka font kao CSS,
 * već odmah crta zamenskim fontom (i meri pogrešne širine).
 */
export function loadCanvasFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  loading ??= Promise.all([
    ...[400, 700, 900].map((weight) => document.fonts.load(canvasFont("nunito", weight, 48), FONT_SAMPLE)),
    document.fonts.load(canvasFont("rukopis", 400, 48), FONT_SAMPLE),
    ...[400, 700, 900].map((weight) => document.fonts.load(canvasFont("montserrat", weight, 48), FONT_SAMPLE)),
    ...[400, 700].map((weight) => document.fonts.load(canvasFont("lora", weight, 48), FONT_SAMPLE)),
  ])
    .then(() => undefined)
    .catch(() => undefined);
  return loading;
}

let measureContext: CanvasRenderingContext2D | null = null;

/** Merenje širine teksta istim fontom kojim crta Konva. */
export function measurerFor(font: CreaFontId, weight: number): MeasureText {
  return (text, fontSize) => {
    measureContext ??= document.createElement("canvas").getContext("2d");
    if (!measureContext) return text.length * fontSize * 0.55;
    measureContext.font = canvasFont(font, weight, fontSize);
    return measureContext.measureText(text).width;
  };
}
