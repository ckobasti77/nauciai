import { brandPromptLine, type CreaBrandKit } from "./crea-brand-kit";
import type { CreaPaidRoute } from "./crea-paid-edit";
import type { LocalizedText } from "./i18n";

/**
 * Logo i ikone (S41, K15). Plaćeni deo pravi znak, a vektor (SVG) dolazi na dva
 * načina: Recraft V4.1 vektor odmah vraća SVG (model je u katalogu, ali ugašen
 * dok se SVG izlaz ne proveri sa pravim ključem - K07), a slika iz Recrafta ili
 * Nano Banane se na uređaju pretvara u SVG istim VTracer-om kao alat „Vektor"
 * (K09), 0 kredita.
 */

/** Redosled = prednost: pravi vektor, pa Recraft (najjeftiniji za znak), pa NB2. */
export const LOGO_ROUTES: readonly CreaPaidRoute[] = [
  { modelSlug: "recraft-41-vector", inputMode: "text", kind: "photo", label: { sr: "Recraft · odmah vektor (SVG)", en: "Recraft · vector (SVG) right away" } },
  { modelSlug: "recraft-41", inputMode: "text", kind: "photo", label: { sr: "Recraft · najjeftinije", en: "Recraft · cheapest" } },
  { modelSlug: "nano-banana-2", inputMode: "text", kind: "photo", label: { sr: "Nano Banana 2", en: "Nano Banana 2" } },
];

/** Modeli čiji izlaz je već SVG (ne treba ga vektorisati na uređaju). */
export const VECTOR_OUTPUT_MODELS: readonly string[] = ["recraft-41-vector"];

export type LogoKind = "logo" | "ikonica";

export const LOGO_KINDS: ReadonlyArray<{ id: LogoKind; label: LocalizedText; hint: LocalizedText }> = [
  { id: "logo", label: { sr: "Logo sa imenom", en: "Logo with a name" }, hint: { sr: "Znak i ime firme.", en: "A mark and the business name." } },
  { id: "ikonica", label: { sr: "Ikonica", en: "Icon" }, hint: { sr: "Samo znak - za aplikaciju, profil ili dugme.", en: "Just the mark - for an app, a profile or a button." } },
];

export const LOGO_STYLES: ReadonlyArray<{ id: string; label: LocalizedText; prompt: string }> = [
  { id: "jednostavno", label: { sr: "Jednostavno", en: "Simple" }, prompt: "simple flat minimal" },
  { id: "rukom", label: { sr: "Rukom crtano", en: "Hand-drawn" }, prompt: "friendly hand-drawn" },
  { id: "zanatski", label: { sr: "Zanatski", en: "Craft" }, prompt: "classic craft badge, like an old shop sign," },
  { id: "geometrijski", label: { sr: "Geometrijski", en: "Geometric" }, prompt: "bold modern geometric" },
];

export const LOGO_NAME_MAX = 40;
export const LOGO_ABOUT_MAX = 120;

export type LogoInput = { kind: LogoKind; name: string; about: string; styleId: string };

/** Šta još fali (prazno ime kod logoa sa imenom, ili prazan opis delatnosti). */
export function logoMissing(input: LogoInput): "name" | "about" | null {
  if (input.kind === "logo" && input.name.trim().length === 0) return "name";
  if (input.about.trim().length === 0) return "about";
  return null;
}

/**
 * Opis za model: ravne boje, bez senki i prelaza, bela pozadina - tako se i
 * SVG iz VTracer-a dobija čist (malo boja, oštre ivice).
 */
export function logoPrompt(input: LogoInput, brand: Pick<CreaBrandKit, "name" | "colors" | "fonts" | "tone"> | null): string {
  const style = LOGO_STYLES.find((entry) => entry.id === input.styleId) ?? LOGO_STYLES[0]!;
  const about = input.about.trim().slice(0, LOGO_ABOUT_MAX);
  const name = input.name.trim().slice(0, LOGO_NAME_MAX);
  const base =
    input.kind === "logo"
      ? `A ${style.prompt} logo for “${name}”, ${about}: one memorable icon above or beside the name. Spell the name exactly as given between the quotes, with correct Serbian letters (č, ć, š, ž, đ); no other text.`
      : `A ${style.prompt} app icon for ${about}: one bold, simple symbol centred in a rounded square, readable at small sizes, no text and no letters.`;
  const finish = " Flat solid colours (at most four), no gradients, no shadows, no textures, plain white background, generous empty space around it.";
  return `${base}${finish}${brand ? `\n\n${brandPromptLine(brand)}` : ""}`;
}

/** Parametri po modelu: kvadrat (fal preset kod Recrafta, 1:1 i 1K kod Nano Banane). */
export function logoParams(route: CreaPaidRoute, prompt: string): Record<string, string> {
  if (route.modelSlug.startsWith("recraft-")) return { prompt, image_size: "square_hd" };
  return { prompt, aspect_ratio: "1:1", resolution: "1K" };
}

/** Ime SVG fajla: `crea-logo-pekara-klas.svg`. */
export function logoFileName(name: string, kind: LogoKind): string {
  const slug = name
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `crea-${kind}${slug ? `-${slug}` : ""}.svg`;
}
