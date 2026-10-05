/**
 * Proširi ili iseci kadar (S15, K12): dugmad „za Instagram, TikTok, YouTube".
 * Iseci je besplatno i na uređaju (najveći isečak ciljnog odnosa, pomeren gde
 * korisnik želi); proširenje je plaćeno - Nano Banana 2 dobija celu fotku na
 * sivom „platnu" ciljnog odnosa i dosliku prazan deo.
 *
 * Zašto ne FLUX.2 Pro outpaint (plan K06 §4): on naplaćuje po megapikselu ulaza,
 * a server još ne meri dimenzije okačene slike (K06-9, N7). Nano Banana ima cenu
 * po slici, pa je cena na dugmetu tačna.
 */

import { cropPreset, type CropPreset, type CropPresetId } from "./crea-crop";
import { nearestAspectRatio, ZONE_ASPECT_RATIOS } from "./crea-paid-edit";
import type { Locale } from "./i18n";

/** Preseti „za Instagram, TikTok, YouTube" - isti kao u alatu za isecanje (K09). */
export const REFRAME_PRESET_IDS = ["objava", "kvadrat", "prica", "youtube"] as const satisfies readonly CropPresetId[];
export type ReframePresetId = (typeof REFRAME_PRESET_IDS)[number];

const RATIO_LABELS: Record<ReframePresetId, string> = { objava: "4:5", kvadrat: "1:1", prica: "9:16", youtube: "16:9" };

/** Preset sa sigurnim odnosom i njegovim zapisom („9:16"), kao što ga model prima. */
export function reframePreset(id: ReframePresetId): CropPreset & { aspect: number; ratio: string } {
  const preset = cropPreset(id);
  return { ...preset, aspect: preset.aspect ?? 1, ratio: RATIO_LABELS[id] };
}

export type Box = { x: number; y: number; width: number; height: number };

/** Odnos se računa kao „isti" do 2 % razlike - tad nema šta da se proširuje ni seče. */
export const SAME_ASPECT_TOLERANCE = 0.02;

export function sameAspect(width: number, height: number, aspect: number, tolerance = SAME_ASPECT_TOLERANCE): boolean {
  return Math.abs(Math.log(width / height / aspect)) <= tolerance;
}

/**
 * Najveći isečak odnosa `aspect` u slici `width × height`, pomeren duž ose koja
 * ima viška: `shift` -1 = skroz levo/gore, 0 = sredina, 1 = skroz desno/dole.
 */
export function reframeCrop(width: number, height: number, aspect: number, shift = 0): Box {
  const offset = Math.max(-1, Math.min(1, Number.isFinite(shift) ? shift : 0));
  if (width / height > aspect) {
    const cropWidth = Math.max(1, Math.min(width, Math.round(height * aspect)));
    const slack = width - cropWidth;
    return { x: Math.round((slack * (offset + 1)) / 2), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.max(1, Math.min(height, Math.round(width / aspect)));
  const slack = height - cropHeight;
  return { x: 0, y: Math.round((slack * (offset + 1)) / 2), width, height: cropHeight };
}

/** Na kojoj osi isečak ima slobodu (za klizač „pomeri kadar"); `null` kad je odnos isti. */
export function cropAxis(width: number, height: number, aspect: number): "x" | "y" | null {
  if (sameAspect(width, height, aspect)) return null;
  return width / height > aspect ? "x" : "y";
}

/**
 * Odnos koji ide modelu: ciljni kad ga Nano Banana 2 prima, inače najbliži
 * (Instagram objava 4:5 → 2:3; posle se iseče na 4:5 besplatno).
 */
export function expandModelRatio(aspect: number, options: readonly string[] = ZONE_ASPECT_RATIOS): string {
  return nearestAspectRatio(aspect * 1000, 1000, options);
}

export function ratioValue(ratio: string): number {
  const [w, h] = ratio.split(":").map(Number);
  return w && h ? w / h : 1;
}

/** Najduža stranica „platna" koje ide provajderu. */
export const EXPAND_CANVAS_MAX_SIDE = 2048;

/** Boja praznog dela platna: neutralna siva, koju opis imenuje kao „prazno". */
export const EXPAND_FILL = "#808080";

export type ExpandLayout = {
  canvasWidth: number;
  canvasHeight: number;
  /** Gde je fotka na platnu (cela, nesečena, u sredini). */
  photo: Box;
  /** Koja strana se doslikava: gore/dole ili levo/desno. */
  grows: "vertical" | "horizontal";
};

/**
 * Platno odnosa `ratio` u koje cela fotka staje u sredinu; prazan deo je ono što
 * AI dosliku. Platno se smanjuje do `maxSide`, nikad ne uvećava.
 */
export function expandLayout(width: number, height: number, ratio: string, maxSide = EXPAND_CANVAS_MAX_SIDE): ExpandLayout {
  const target = ratioValue(ratio);
  const wider = width / height > target;
  let canvasWidth = wider ? width : height * target;
  let canvasHeight = wider ? width / target : height;
  const scale = Math.min(1, maxSide / Math.max(canvasWidth, canvasHeight));
  canvasWidth = Math.max(1, Math.round(canvasWidth * scale));
  canvasHeight = Math.max(1, Math.round(canvasHeight * scale));
  const photoWidth = Math.min(canvasWidth, Math.round(width * scale));
  const photoHeight = Math.min(canvasHeight, Math.round(height * scale));
  return {
    canvasWidth,
    canvasHeight,
    photo: {
      x: Math.round((canvasWidth - photoWidth) / 2),
      y: Math.round((canvasHeight - photoHeight) / 2),
      width: photoWidth,
      height: photoHeight,
    },
    grows: wider ? "vertical" : "horizontal",
  };
}

/**
 * Opis za Nano Bananu 2: šta je prazno, šta ostaje isto, šta sme da se doda.
 * `extra` je ono što je korisnik dopisao („više neba", „ulica se nastavlja").
 */
export function expandPrompt(ratio: string, grows: ExpandLayout["grows"], extra: string, locale: Locale): string {
  const said = extra.trim();
  if (locale === "sr") {
    const where = grows === "vertical" ? "iznad i ispod fotografije" : "levo i desno od fotografije";
    return (
      `Proširi ovu fotografiju na kadar ${ratio}. Sivi delovi ${where} su prazni: popuni ih tako da se scena prirodno nastavlja - ista perspektiva, svetlo, boje i stil, bez vidljivog šava. ` +
      `Postojeći deo fotografije ostaje potpuno isti; ne dodaj tekst, okvire ni vodeni žig.` +
      (said ? ` U novom delu: ${said}.` : "")
    );
  }
  const where = grows === "vertical" ? "above and below the photo" : "to the left and right of the photo";
  return (
    `Expand this photo to a ${ratio} frame. The grey areas ${where} are empty: fill them so the scene continues naturally - same perspective, light, colours and style, with no visible seam. ` +
    `The existing part of the photo stays exactly the same; do not add text, borders or a watermark.` +
    (said ? ` In the new part: ${said}.` : "")
  );
}
