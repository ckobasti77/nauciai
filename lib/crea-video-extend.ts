import type { LocalizedText } from "./i18n";

/**
 * „Produži klip" (Crea K18, V5; plan K17-11). Tri puta, redom koji UI nudi:
 *
 * - Seedance 2.5 - napred ILI nazad, 4-30 s. Postojeći red kataloga (BytePlus,
 *   režim `reference`): izvorni video ide kao referenca 1, a smer kaže opis
 *   („Extend video 1 forward/backward…") - isti način koji opisuju vodiči za
 *   Seedance 2.5 produženje. Nije proveren živim pozivom (nema BytePlus ključa).
 * - Veo 3.1 - samo napred, 4-30 s, režim `video` (postojeći „extend"). Google
 *   prima ulaz ugrađen u zahtev do 15 MB, a produžava klipove koje je napravio Veo,
 *   pa se nudi samo za Veo rad koji staje u tu granicu.
 * - Bilo koji model - poslednji kadar postaje prvi kadar novog klipa (V4, lokalno).
 *   Taj put je alat „Nastavi od poslednjeg kadra", ne posao ovde.
 */

export type ExtendDirection = "napred" | "nazad";

export type ExtendRoute = {
  id: "seedance" | "veo";
  modelSlug: string;
  inputMode: string;
  /** Slot u koji ide izvorni video. */
  slot: "video";
  directions: readonly ExtendDirection[];
  label: LocalizedText;
  /** Najveći izvorni fajl (Google: ulaz ugrađen u zahtev). */
  maxBytes?: number;
  /** Prefiks modela izvornog klipa koji ova ruta ume da produži. */
  sourceModelPrefix?: string;
};

export const VEO_INLINE_MAX_BYTES = 15 * 1024 * 1024;

export const EXTEND_ROUTES: readonly ExtendRoute[] = [
  {
    id: "seedance",
    modelSlug: "seedance-25",
    inputMode: "reference",
    slot: "video",
    directions: ["napred", "nazad"],
    label: { sr: "Seedance 2.5 · napred ili nazad", en: "Seedance 2.5 · forward or backward" },
  },
  {
    id: "veo",
    modelSlug: "veo-31",
    inputMode: "video",
    slot: "video",
    directions: ["napred"],
    label: { sr: "Veo 3.1 · napred", en: "Veo 3.1 · forward" },
    maxBytes: VEO_INLINE_MAX_BYTES,
    sourceModelPrefix: "veo-",
  },
];

export type ExtendSource = { modelSlug: string; bytes: number | null };

/** Zašto ruta ne prima ovaj klip (ili `null`). */
export function extendRouteProblem(route: ExtendRoute, source: ExtendSource): "drugi-model" | "prevelik" | null {
  if (route.sourceModelPrefix && !source.modelSlug.startsWith(route.sourceModelPrefix)) return "drugi-model";
  if (route.maxBytes !== undefined && source.bytes !== null && source.bytes > route.maxBytes) return "prevelik";
  return null;
}

/**
 * Opis za model. Seedance dobija uputstvo sa smerom i šta ostaje isto; Veo
 * produžava sam (uvek napred), pa dobija samo korisnikove reči ili „nastavi
 * prirodno".
 */
export function extendPrompt(route: ExtendRoute, direction: ExtendDirection, text: string): string {
  const said = text.trim().replace(/[.\s]+$/, "");
  if (route.id === "veo") return said || "Continue the scene naturally";
  const how =
    direction === "nazad"
      ? "Extend video 1 backward: show what happens right before its first frame, ending exactly where video 1 begins"
      : "Extend video 1 forward: continue the action right after its last frame";
  const keep = "Keep the same characters, place, lighting, style and aspect ratio";
  return said ? `${how}. ${said}. ${keep}.` : `${how}. ${keep}.`;
}

/** Parametri posla (bez cene): opis i trajanje produžetka. */
export function extendParams(route: ExtendRoute, direction: ExtendDirection, text: string, seconds: number): Record<string, string | number> {
  return { prompt: extendPrompt(route, direction, text), duration: seconds };
}
