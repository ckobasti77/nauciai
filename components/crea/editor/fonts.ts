"use client";

import type { CreaFontId } from "@/lib/crea-editor-scene";
import type { MeasureText } from "@/lib/crea-text-fit";

/**
 * Slova na platnu (S28, K10). Nunito i Patrick Hand već učitava sajt
 * (`app/[locale]/layout.tsx`, promenljive `--font-nunito` i `--font-patrick-hand`).
 * Nunito ima latinicu sa č ć š ž đ i ćirilicu. Patrick Hand ima č ć š ž đ, ali
 * NEMA ćirilicu - bez zamene bi ćirilica u rukopisu pala na Arial. Zato iza
 * njega stoji Pangolin (OFL, sličan rukopis, ima ćirilicu): browser crta latinicu
 * Patrick Handom, a ćirilična slova Pangolinom (`unicode-range`).
 *
 * Fontovi brend kita (K15): Montserrat i Lora (oba OFL, latinica sa č ć š ž đ i
 * ćirilica). Fajlovi su kod nas, u `public/brand/crea/fonts` (isti podskupovi
 * koje služi Google Fonts, uz OFL licence), a editor ih sam prijavljuje browseru
 * kroz `FontFace` tek kad mu zatrebaju.
 *
 * Namerno NE kroz `next/font/local`: njegovih 7 CSS modula je obaralo build na
 * Hostingeru (Turbopack ne uspe da pokrene Node proces za njihov CSS - „node
 * process exited before we could connect", 6. i 13. 10. 2026). Bez njih build ima
 * iste CSS ulaze kao pre Cree. Svaki podskup je svoj `FontFace` sa `unicodeRange`
 * (browser preuzima samo ono što tekst traži), a podskupovi jedne porodice dele ime.
 */
const FONT_DIR = "/brand/crea/fonts";

const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";
const CYRILLIC = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";

const FAMILY = { montserrat: "CreaMontserrat", lora: "CreaLora", pangolin: "CreaPangolin" } as const;

const FACES: ReadonlyArray<{ family: string; file: string; weight: string; unicodeRange: string }> = [
  { family: FAMILY.pangolin, file: "pangolin-cyrillic.woff2", weight: "400", unicodeRange: CYRILLIC },
  { family: FAMILY.montserrat, file: "montserrat-latin.woff2", weight: "400 900", unicodeRange: LATIN },
  { family: FAMILY.montserrat, file: "montserrat-latin-ext.woff2", weight: "400 900", unicodeRange: LATIN_EXT },
  { family: FAMILY.montserrat, file: "montserrat-cyrillic.woff2", weight: "400 900", unicodeRange: CYRILLIC },
  { family: FAMILY.lora, file: "lora-latin.woff2", weight: "400 700", unicodeRange: LATIN },
  { family: FAMILY.lora, file: "lora-latin-ext.woff2", weight: "400 700", unicodeRange: LATIN_EXT },
  { family: FAMILY.lora, file: "lora-cyrillic.woff2", weight: "400 700", unicodeRange: CYRILLIC },
];

let facesAdded = false;

/** Prijavi podskupove browseru jednom. Preuzimanje kreće tek kad tekst zatraži slovo iz opsega. */
function ensureFaces(): void {
  if (facesAdded || typeof document === "undefined" || !document.fonts || typeof FontFace === "undefined") return;
  facesAdded = true;
  for (const face of FACES) {
    document.fonts.add(
      new FontFace(face.family, `url(${FONT_DIR}/${face.file}) format("woff2")`, {
        weight: face.weight,
        unicodeRange: face.unicodeRange,
        display: "swap",
      }),
    );
  }
}

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
  ensureFaces();
  if (font === "montserrat") return FAMILY.montserrat;
  if (font === "lora") return FAMILY.lora;
  const hand = firstFamily(cssVar("--font-patrick-hand"), "'Patrick Hand'");
  return `${hand}, ${FAMILY.pangolin}`;
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
