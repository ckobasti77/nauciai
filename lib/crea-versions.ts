import { referenceModeOf } from "@/convex/creaElementsCore";
import { CREA_AREA_KIND, creaModeDef, modelsForMode, usableInputModes } from "@/lib/crea-shell";
import type { CreaArea, CreaKind, CreaModeId, CreaModelLike } from "@/lib/crea-shell";
import { CREA_TOOLS, isLocalTier, type CreaTool } from "@/lib/crea-tools";
import { slotsForMode, type InputSpec } from "@/lib/studio-slots";

/**
 * Stablo verzija u radionici (K05): kuda vodi „Koristi kao ulaz" i „Animiraj" za
 * gotov rad, i koji besplatni alati ga primaju. Rad postaje ulaz kroz URL
 * (`?ulaz=<jobId>`), jer se radionica i detalj rada montiraju kao dve strane.
 */

/** Query ključ: rad čiji izlaz ulazi u composer (ili u alat, uz `?alat=`). */
export const CREA_INPUT_PARAM = "ulaz";
/** Query ključ u detalju: korisnik se „Vrati"-o na ovaj rad (pokazuje se poziv da nastavi od njega). */
export const CREA_RESTORED_PARAM = "vraceno";

/** `sound` (K16, „Ozvuči"): video dobija zvuk (Zvuk · Efekti, model koji prima video). */
export type VersionIntent = "input" | "animate" | "sound";

/** Režimi ljuske, redom prednosti, u koje izlaz date vrste ulazi. */
const TARGETS: Record<VersionIntent, Record<CreaKind, ReadonlyArray<readonly [CreaArea, CreaModeId]>>> = {
  input: {
    image: [
      ["slika", "izmeni"],
      ["video", "napravi"],
    ],
    video: [
      ["video", "izmeni"],
      ["video", "pokret"],
    ],
    audio: [
      ["zvuk", "promena"],
      ["zvuk", "uredjivac"],
      ["video", "govor"],
    ],
  },
  animate: {
    image: [
      ["video", "napravi"],
      ["video", "pokret"],
    ],
    video: [["video", "izmeni"]],
    audio: [["video", "govor"]],
  },
  sound: {
    image: [],
    video: [["zvuk", "efekti"]],
    audio: [],
  },
};

type VersionModel = CreaModelLike & { inputSpec: InputSpec; badge?: string };

/** Ulazni režim modela u ovom režimu ljuske koji ima slot `slot` (npr. `image`). */
export function inputModeWithSlot(
  model: VersionModel,
  area: CreaArea,
  mode: CreaModeId | null,
  slot: string,
): string | undefined {
  const rule = creaModeDef(area, mode).models;
  if (!rule || model.kind !== CREA_AREA_KIND[area]) return undefined;
  if (rule.slugs && !rule.slugs.includes(model.slug)) return undefined;
  return usableInputModes(model)
    .filter((inputMode) => rule.slugs !== undefined || rule.inputModes?.includes(inputMode))
    .find((inputMode) => slotsForMode(model.inputSpec, inputMode).some((entry) => entry.slot === slot));
}

export type VersionInputTarget = { area: CreaArea; mode: CreaModeId; modelSlug: string; inputMode: string };

/**
 * Gde izlaz rada vrste `kind` može da bude ulaz: prvi režim (redom iz `TARGETS`) koji
 * ima model sa slotom te vrste; preporučen model ima prednost. `null` kad nijedan
 * uključen model ne prima tu vrstu fajla.
 */
export function versionInputTarget<T extends VersionModel>(
  catalog: readonly T[],
  kind: CreaKind,
  intent: VersionIntent,
): VersionInputTarget | null {
  for (const [area, mode] of TARGETS[intent][kind]) {
    const fitting = modelsForMode(catalog, area, mode).filter(
      (model) => inputModeWithSlot(model, area, mode, kind) !== undefined,
    );
    const model = fitting.find((entry) => entry.badge === "preporuceno") ?? fitting[0];
    if (model) return { area, mode, modelSlug: model.slug, inputMode: inputModeWithSlot(model, area, mode, kind)! };
  }
  return null;
}

/**
 * „Koristi kao referencu" (K16, S44): slika ide u Slika · Napravi kao referenca nove
 * slike - model tog režima koji ima režim sa referencama (`image_multi`/`reference`,
 * isti izbor kao @pominjanje Lika), preporučen ima prednost.
 */
export function referenceTarget<T extends VersionModel>(catalog: readonly T[]): VersionInputTarget | null {
  const fitting = modelsForMode(catalog, "slika", "napravi").filter((model) => referenceModeOf(model) !== null);
  const model = fitting.find((entry) => entry.badge === "preporuceno") ?? fitting[0];
  return model ? { area: "slika", mode: "napravi", modelSlug: model.slug, inputMode: referenceModeOf(model)!.inputMode } : null;
}

/** Gotovi besplatni alati koji primaju izlaz ove vrste i čuvaju rezultat u galeriju. */
export function toolsForWork(kind: CreaKind): CreaTool[] {
  return CREA_TOOLS.filter(
    (tool) => tool.status === "ready" && isLocalTier(tool.tier) && tool.savesToGallery && tool.inputs.includes(kind),
  );
}
