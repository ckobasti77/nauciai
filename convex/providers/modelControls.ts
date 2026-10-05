/**
 * Kontrole i slotovi koji se ponavljaju kroz ceo katalog v4 (STUDIO-CATALOG-V4
 * sekcije 1.2 i 5). Pisano jednom da bi trideset redova kataloga imalo iste
 * ključeve, iste podrazumevane vrednosti i iste MIME liste - forma iz sekcije 6
 * gradi kontrolu po `type`-u, pa dva reda sa istim parametrom moraju da daju
 * doslovno istu kontrolu, ne "skoro istu".
 *
 * Čista logika, bez `ctx` i bez baze - isti fajl se uvozi i u Convex i u browser.
 */

import type { ParamControl } from "../studioParamSpec";
import type { StudioModelSeed } from "./modelSeed";

export const IMAGE_ACCEPT = ["image/png", "image/jpeg", "image/webp"];
export const VIDEO_ACCEPT = ["video/mp4", "video/quicktime", "video/webm"];
export const AUDIO_ACCEPT = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/webm"];

/** Isti gornji limit prompta koji katalog propisuje za Nano Bananu 2 (2.1). */
export const PROMPT_MAX_LENGTH = 2000;

/** ElevenLabs v3 prima do 5 000 znakova po generaciji (katalog 4.1). */
export const TEXT_MAX_LENGTH = 5000;

export function promptControl(): ParamControl {
  return {
    key: "prompt",
    type: "textarea",
    labelSr: "Opis",
    labelEn: "Prompt",
    default: "",
    max: PROMPT_MAX_LENGTH,
    affectsPrice: false,
  };
}

/**
 * Prekidač zvuka. Kod modela gde je zvuk stavka na računu (Kling 3, Veo) stoji
 * u `lookup` mapi, pa `affectsPrice` mora da bude `true` - značka uz kontrolu
 * pokazuje razliku PRE klika (katalog 1.2).
 */
export function audioControl(helpSr?: string, helpEn?: string): ParamControl {
  return {
    key: "audio",
    type: "switch",
    labelSr: "Zvuk",
    labelEn: "Audio",
    helpSr: helpSr ?? "Nativni zvuk iz modela. Poskupljuje generaciju.",
    helpEn: helpEn ?? "Native audio from the model. It raises the price.",
    default: true,
    affectsPrice: true,
  };
}

export function resolutionControl(opts: {
  values: string[];
  default?: string;
  labels?: Record<string, string>;
  showInModes?: string[];
  helpSr?: string;
  helpEn?: string;
}): ParamControl {
  return {
    key: "resolution",
    type: "segmented",
    labelSr: "Rezolucija",
    labelEn: "Resolution",
    default: opts.default ?? opts.values[0],
    options: opts.values.map((value) => ({
      value,
      labelSr: opts.labels?.[value] ?? value,
      labelEn: opts.labels?.[value] ?? value,
    })),
    ...(opts.showInModes ? { showInModes: opts.showInModes } : {}),
    ...(opts.helpSr ? { helpSr: opts.helpSr } : {}),
    ...(opts.helpEn ? { helpEn: opts.helpEn } : {}),
    affectsPrice: true,
  };
}

export function durationControl(opts: {
  min: number;
  max: number;
  default?: number;
  step?: number;
  showInModes?: string[];
  labelSr?: string;
  labelEn?: string;
}): ParamControl {
  return {
    key: "duration",
    type: "slider",
    labelSr: opts.labelSr ?? "Trajanje",
    labelEn: opts.labelEn ?? "Duration",
    default: opts.default ?? opts.min,
    min: opts.min,
    max: opts.max,
    step: opts.step ?? 1,
    unitSr: "s",
    unitEn: "s",
    ...(opts.showInModes ? { showInModes: opts.showInModes } : {}),
    affectsPrice: true,
  };
}

export function numImagesControl(opts?: { max?: number; showInModes?: string[] }): ParamControl {
  return {
    key: "num_images",
    type: "number",
    labelSr: "Broj slika",
    labelEn: "Number of images",
    default: 1,
    min: 1,
    max: opts?.max ?? 4,
    step: 1,
    ...(opts?.showInModes ? { showInModes: opts.showInModes } : {}),
    affectsPrice: true,
  };
}

/**
 * fal-ovi preseti veličine slike (Crea K07). Svaki je ≤ 1 MP osim `square_hd`
 * (1024×1024 = 1,05 MP), pa modeli koji se naplaćuju po megapikselu imaju DVE
 * cene: kad fal broji MP naviše, `square_hd` su dva (konzervativno - da li je
 * MP 10^6 ili 2^20 piksela nije potvrđeno, `docs/crea/planovi/K06.md` §1).
 */
export const FAL_IMAGE_SIZES = [
  "landscape_4_3",
  "landscape_16_9",
  "square_hd",
  "square",
  "portrait_4_3",
  "portrait_16_9",
] as const;

const FAL_IMAGE_SIZE_LABELS: Record<string, { sr: string; en: string }> = {
  // Kratko, kao čip odnosa stranica kod ostalih modela - čip mora da stane u red na telefonu.
  landscape_4_3: { sr: "4:3", en: "4:3" },
  landscape_16_9: { sr: "16:9", en: "16:9" },
  square_hd: { sr: "1:1", en: "1:1" },
  square: { sr: "1:1 mala", en: "1:1 small" },
  portrait_4_3: { sr: "3:4", en: "3:4" },
  portrait_16_9: { sr: "9:16", en: "9:16" },
  auto_2K: { sr: "Auto 2K", en: "Auto 2K" },
};

/** `image_size` kontrola za fal modele; `affectsPrice` kad cena čita veličinu. */
export function imageSizeControl(
  values: readonly string[],
  defaultValue: string,
  opts: { affectsPrice: boolean; showInModes?: string[] },
): ParamControl {
  return {
    key: "image_size",
    type: "select",
    labelSr: "Veličina",
    labelEn: "Size",
    default: defaultValue,
    options: values.map((value) => ({
      value,
      labelSr: FAL_IMAGE_SIZE_LABELS[value]?.sr ?? value,
      labelEn: FAL_IMAGE_SIZE_LABELS[value]?.en ?? value,
    })),
    ...(opts.showInModes ? { showInModes: opts.showInModes } : {}),
    affectsPrice: opts.affectsPrice,
  };
}

/**
 * Cena po fal presetu kad se model naplaćuje po megapikselu: `square_hd` je
 * dva MP, ostali jedan (vidi `FAL_IMAGE_SIZES`).
 */
export function perMegapixelSizeMap(usdPerMegapixel: number): Record<string, number> {
  const map: Record<string, number> = {};
  for (const size of FAL_IMAGE_SIZES) {
    map[size] = Number((usdPerMegapixel * (size === "square_hd" ? 2 : 1)).toFixed(6));
  }

  return map;
}

/** Odnos stranica ne ulazi ni u jedno cenovno pravilo - zato `affectsPrice: false`. */
export function aspectRatioControl(values: string[], defaultValue?: string): ParamControl {
  return {
    key: "aspect_ratio",
    type: "select",
    labelSr: "Odnos stranica",
    labelEn: "Aspect ratio",
    default: defaultValue ?? values[0],
    options: values.map((value) => ({ value, labelSr: value, labelEn: value })),
    affectsPrice: false,
  };
}

/**
 * Odakle dolazi količina koju cenovno pravilo množi, kad ona NIJE kontrola iz
 * forme. Kling lipsync se naplaćuje po sekundi OKAČENOG videa, Scribe po minutu
 * okačenog snimka, ElevenLabs TTS po znaku UKUCANOG teksta - korisnik tu nema
 * šta da bira, meri se ulaz.
 *
 * Stoji u `capabilities` reda (a ne u `paramSpec`-u) baš zato što nije kontrola:
 * da jeste, klijent bi mogao da pošalje minut a okači sat. Broj upisuje server
 * pre `computeCredits`-a, isto kao `input_images` kod Seedream-a.
 */
export type QuantitySource = {
  param: string;
  from: "input_audio_seconds" | "input_video_seconds" | "input_media_minutes" | "text_length";
  /** Najmanja i najveća količina koja se uopšte prihvata - granice testira marža. */
  min: number;
  max: number;
  /** Ključ kontrole iz koje se meri, kad se meri iz teksta a ne iz fajla. */
  measuredFrom?: string;
};

export function quantitySourceOf(seed: StudioModelSeed): QuantitySource | null {
  const raw = seed.capabilities.quantity;
  if (!raw || typeof raw !== "object") return null;
  const source = raw as QuantitySource;

  return typeof source.param === "string" && Number.isFinite(source.min) ? source : null;
}
