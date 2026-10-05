import { cameraFragment, type CreaCamera } from "./crea-camera";
import type { Locale } from "./i18n";
import { normalizePalette, styleById } from "./crea-styles";

/**
 * Sklapanje opisa za „Napravi" (Crea K13). Čista logika - ista funkcija pravi
 * pregled „ovo ide modelu" i opis koji se stvarno šalje, pa korisnik vidi tačno
 * ono za šta plaća.
 */

/** Ista granica kao kontrola opisa u katalogu (`modelControls.PROMPT_MAX_LENGTH`). */
export const COMPOSED_PROMPT_MAX = 2000;

export type CreateLook = {
  styleId?: string | null;
  camera?: CreaCamera | null;
  palette?: readonly string[] | null;
  /** „Moji stilovi": dodatak koji je korisnik sam dopisao. */
  extra?: string | null;
};

/** Delovi koji se dodaju opisu, redom: stil, kamera, paleta, sopstveni dodatak. */
export function lookFragments(look: CreateLook): string[] {
  const parts: string[] = [];
  const style = styleById(look.styleId);
  if (style) parts.push(style.fragment);
  if (look.camera) parts.push(cameraFragment(look.camera));
  const palette = normalizePalette(look.palette ?? []);
  if (palette.length > 0) parts.push(`color palette: ${palette.join(", ")}`);
  const extra = look.extra?.trim().replace(/\s+/g, " ");
  if (extra) parts.push(extra.slice(0, 300));
  return parts;
}

/**
 * Konačan opis: korisnikove reči, pa dodaci izgleda. `overBy` > 0 znači da je
 * zajedno preko granice - UI tada traži kraći opis umesto da tiho seče.
 */
export function composeCreatePrompt(prompt: string, look: CreateLook): { text: string; overBy: number } {
  const said = prompt.trim();
  const fragments = lookFragments(look);
  if (fragments.length === 0) return { text: said, overBy: Math.max(0, said.length - COMPOSED_PROMPT_MAX) };
  const base = said.replace(/[.\s]+$/, "");
  const text = base ? `${base}. ${fragments.join(". ")}.` : `${fragments.join(". ")}.`;
  return { text, overBy: Math.max(0, text.length - COMPOSED_PROMPT_MAX) };
}

// ── S7: slotovi Ko · Gde · Kako ──────────────────────────────────────────────

export const CREA_SLOT_IDS = ["ko", "gde", "kako"] as const;
export type CreaSlotId = (typeof CREA_SLOT_IDS)[number];

const ORDINAL = {
  sr: ["prve", "druge", "treće"],
  en: ["first", "second", "third"],
} as const;

/**
 * Tri slike (lik, mesto, stil) i opis koji ih vezuje. Slike idu modelu redom
 * popunjenih slotova (`order`), a opis ih zove po rednom broju - modeli sa više
 * referenci (Nano Banana, Seedream, FLUX.2) razumeju „osoba sa prve slike".
 */
export function assembleSlotsPrompt(
  filled: Readonly<Partial<Record<CreaSlotId, boolean>>>,
  text: string,
  locale: Locale,
): { order: CreaSlotId[]; prompt: string } {
  const order = CREA_SLOT_IDS.filter((slot) => filled[slot]);
  const ord = (slot: CreaSlotId) => ORDINAL[locale][order.indexOf(slot)]!;
  const said = text.trim().replace(/[.\s]+$/, "");
  const parts: string[] = [];
  if (locale === "sr") {
    if (filled.ko) parts.push(`Glavni lik je osoba (ili predmet) sa ${ord("ko")} slike - isto lice, crte, frizura i odeća.`);
    if (filled.gde) parts.push(`Mesto radnje je prostor sa ${ord("gde")} slike.`);
    if (filled.kako) parts.push(`Stil, boje i svetlo preuzmi sa ${ord("kako")} slike, ali ne i njen sadržaj.`);
    if (said) parts.push(`${said}.`);
    else if (filled.ko && filled.gde) parts.push("Prirodno ga smesti u to mesto.");
  } else {
    if (filled.ko) parts.push(`The main subject is the person (or object) from the ${ord("ko")} image - same face, features, hair and clothes.`);
    if (filled.gde) parts.push(`The setting is the place from the ${ord("gde")} image.`);
    if (filled.kako) parts.push(`Take the style, colours and lighting from the ${ord("kako")} image, but not its content.`);
    if (said) parts.push(`${said}.`);
    else if (filled.ko && filled.gde) parts.push("Place them naturally in that setting.");
  }
  return { order, prompt: parts.join(" ") };
}

// ── S9/S10: skica → slika ────────────────────────────────────────────────────

export type SketchSource = "platno" | "sveska";

/**
 * Opis za skicu: kompozicija skice ostaje (raspored, oblici, poza), a model je
 * pretvara u gotovu sliku u izabranom stilu. Za fotku sveske se dodaje da linije
 * papira i rukopis nisu deo slike.
 */
export function sketchToImagePrompt(
  options: { source: SketchSource; styleId?: string | null; text: string },
  locale: Locale,
): string {
  const style = styleById(options.styleId);
  const said = options.text.trim().replace(/[.\s]+$/, "");
  if (locale === "sr") {
    const what = options.source === "sveska" ? "fotografija skice iz sveske" : "gruba skica";
    const look = style ? `u stilu: ${style.fragment}` : "kao realna fotografija";
    return [
      `Ova slika je ${what}. Pretvori je u gotovu sliku ${look}.`,
      "Zadrži isti raspored, oblike, pozu i mesto svakog predmeta iz skice.",
      said ? `Na slici je: ${said}.` : "",
      options.source === "sveska" ? "Linije papira, mrlje i rukopis nisu deo slike." : "",
    ].filter(Boolean).join(" ");
  }
  const what = options.source === "sveska" ? "a photo of a sketch in a notebook" : "a rough sketch";
  const look = style ? `in this style: ${style.fragment}` : "as a realistic photograph";
  return [
    `This image is ${what}. Turn it into a finished image ${look}.`,
    "Keep the same layout, shapes, pose and placement of every object in the sketch.",
    said ? `It shows: ${said}.` : "",
    options.source === "sveska" ? "Paper lines, smudges and handwriting are not part of the picture." : "",
  ].filter(Boolean).join(" ");
}
