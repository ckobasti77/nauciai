/**
 * Šta model PRIMA (SP2) - izvedeno iz `inputModes` + `inputSpec` reda kataloga,
 * ne iz `capabilities` (koje je netipizirano i nesinhronizovano sa spec-om).
 *
 * Razlog što postoji: composer radi u JEDNOM režimu (`inputMode` bira
 * endpoint, parametre, cenu i obavezne ulaze), pa polja za slike/kadrove
 * nisu vidljiva dok korisnik ne promeni režim. Ova traka ih čini vidljivim
 * unapred: šta model može (klik vodi u režim) i šta NE može (sivo, „nije
 * moguće"). Čista logika, bez DOM-a, da bi se testirala nad celim katalogom.
 */

import { parseContinuationSource } from "@/convex/studioJobCore";
import type { Locale } from "@/lib/i18n";
import type { StudioModel } from "@/lib/studio-models";
import { slotKind, slotsForMode } from "@/lib/studio-slots";

export type InputCapabilities = {
  /** Slike kao ulaz (image / image_multi / layerize / video_image …); `slots` ≠ ["image"] kod alata kao što je tryon. */
  image: { max: number; slots: string[] } | null;
  /** Režim `first_last` - po imenu, jer ga spec ne razlikuje od `image_multi` (isti slot `image`). */
  firstLast: boolean;
  /** Režim `reference` sa brojem slotova po vrsti. */
  reference: { images: number; videos: number; audio: number } | null;
  /** Video fajl kao ulaz, ili nastavak prethodne generacije (režim bez slota + `capabilities.continuation`). */
  video: "upload" | "continuation" | null;
  /** Zvučni fajl kao ulaz. */
  audio: boolean;
};

export type InputCapabilityKey = keyof InputCapabilities;

const IMAGE_MODES_EXCLUDED = new Set(["first_last", "reference"]);

export function modelInputCapabilities(model: StudioModel): InputCapabilities {
  const result: InputCapabilities = {
    image: null,
    firstLast: false,
    reference: null,
    video: null,
    audio: false,
  };
  const continuation = parseContinuationSource(JSON.stringify(model.capabilities));

  for (const mode of model.inputModes) {
    const slots = slotsForMode(model.inputSpec, mode);

    if (mode === "first_last") {
      result.firstLast = slots.some((entry) => slotKind(entry.accept) === "image");
      continue;
    }

    if (mode === "reference") {
      const count = (kind: "image" | "video" | "audio") =>
        slots.filter((entry) => slotKind(entry.accept) === kind).reduce((sum, entry) => sum + entry.max, 0);
      result.reference = { images: count("image"), videos: count("video"), audio: count("audio") };
      continue;
    }

    if (slots.length === 0) {
      if (continuation && continuation.mode === mode && result.video === null) result.video = "continuation";
      continue;
    }

    const imageSlots = slots.filter((entry) => slotKind(entry.accept) === "image");
    if (imageSlots.length > 0 && !IMAGE_MODES_EXCLUDED.has(mode)) {
      const max = imageSlots.reduce((sum, entry) => sum + entry.max, 0);
      if (!result.image || max > result.image.max) {
        result.image = { max, slots: imageSlots.map((entry) => entry.slot) };
      }
    }
    if (slots.some((entry) => slotKind(entry.accept) === "video")) result.video = "upload";
    if (slots.some((entry) => slotKind(entry.accept) === "audio")) result.audio = true;
  }

  return result;
}

/**
 * Prvi `inputMode` koji daje traženu sposobnost - za klik na čip i za `+`
 * dugme. `null` kad model to ne može (ili kad je video „nastavak", jer tada
 * nema fajla koji bi se prilagao - tim režimom upravlja `SourceJobPicker`).
 */
export function modeProviding(model: StudioModel, capability: InputCapabilityKey): string | null {
  for (const mode of model.inputModes) {
    const slots = slotsForMode(model.inputSpec, mode);
    const has = (kind: "image" | "video" | "audio") => slots.some((entry) => slotKind(entry.accept) === kind);

    switch (capability) {
      case "firstLast":
        if (mode === "first_last" && has("image")) return mode;
        break;
      case "reference":
        if (mode === "reference" && slots.length > 0) return mode;
        break;
      // Fajl-sposobnosti se broje samo u „običnim" režimima - reference i
      // kadrovi imaju svoje čipove, isto kao u `modelInputCapabilities`.
      case "image":
        if (!IMAGE_MODES_EXCLUDED.has(mode) && has("image")) return mode;
        break;
      case "video":
        if (!IMAGE_MODES_EXCLUDED.has(mode) && has("video")) return mode;
        break;
      case "audio":
        if (!IMAGE_MODES_EXCLUDED.has(mode) && has("audio")) return mode;
        break;
    }
  }

  return null;
}

/** Prvi režim koji uopšte prima fajl - cilj za `+` kad je trenutni režim „Samo opis". */
export function firstFileMode(model: StudioModel): string | null {
  return model.inputModes.find((mode) => slotsForMode(model.inputSpec, mode).length > 0) ?? null;
}

/**
 * `capabilities.restrictionsSr/En` (gemini-omni) - stoje u redu baš da bi se
 * videle PRE upload-a, a nigde nisu bile prikazane. Type-guard nad
 * netipiziranim objektom: sve što nije niz stringova je prazna lista.
 */
export function modelRestrictions(model: StudioModel, locale: Locale): string[] {
  const raw = model.capabilities[locale === "sr" ? "restrictionsSr" : "restrictionsEn"];
  if (!Array.isArray(raw)) return [];

  return raw.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

/**
 * Koje čipove traka prikazuje za model te vrste, i kad nisu podržani (sivo).
 * Siva „Slika" na TTS-u je šum - audio modeli pokazuju samo ono što imaju.
 */
export const EXPECTED_CAPABILITIES: Record<StudioModel["kind"], InputCapabilityKey[]> = {
  image: ["image", "firstLast"],
  video: ["image", "firstLast", "reference", "video"],
  audio: [],
};

export function isCapabilitySupported(caps: InputCapabilities, key: InputCapabilityKey): boolean {
  const value = caps[key];

  return value !== null && value !== false;
}

/** Čipovi za traku: podržani uvek, nepodržani samo ako su očekivani za vrstu. */
export function capabilityChips(model: StudioModel): Array<{ key: InputCapabilityKey; supported: boolean }> {
  const caps = modelInputCapabilities(model);
  const order: InputCapabilityKey[] = ["image", "firstLast", "reference", "video", "audio"];
  const expected = EXPECTED_CAPABILITIES[model.kind];

  return order
    .map((key) => ({ key, supported: isCapabilitySupported(caps, key) }))
    .filter((chip) => chip.supported || expected.includes(chip.key));
}
