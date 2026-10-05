import type { StudioModel } from "./studio-models";

/**
 * Varijacije (Crea K13, S5) i probni list (S4): koliko poslova i po koliko slika.
 *
 * Model koji u jednom pozivu vraća više slika (`num_images`, sad se čuvaju svi
 * izlazi - K01-17) dobija JEDAN posao sa N slika. Model koji to ne ume dobija N
 * zasebnih poslova; oni idu redom kroz slobodna mesta (javni korisnik ima najviše
 * 2 posla u toku), pa se ostatak drži u redu na klijentu.
 */

export const VARIATION_COUNTS = [1, 2, 3, 4] as const;
export const VARIATION_MAX = 4;

/** Veličine probnog lista. */
export const SHEET_SIZES = [4, 8, 12, 16] as const;
export type SheetSize = (typeof SHEET_SIZES)[number];

type CountModel = Pick<StudioModel, "paramSpec">;

/** Najviše slika u jednom pozivu u ovom ulaznom režimu (1 kad model nema `num_images`). */
export function imagesPerRun(model: CountModel, inputMode: string): number {
  const control = model.paramSpec.find(
    (entry) => entry.key === "num_images" && (!entry.showInModes || entry.showInModes.includes(inputMode)),
  );
  return control && typeof control.max === "number" && control.max > 1 ? Math.floor(control.max) : 1;
}

export type VariationPlan =
  | { kind: "single" }
  /** Jedan posao, `num_images` = broj varijacija. */
  | { kind: "num_images"; count: number }
  /** N zasebnih poslova sa po jednom slikom. */
  | { kind: "parallel"; count: number };

export function variationPlan(model: CountModel, inputMode: string, count: number): VariationPlan {
  const wanted = Math.max(1, Math.min(VARIATION_MAX, Math.round(count) || 1));
  if (wanted === 1) return { kind: "single" };
  return imagesPerRun(model, inputMode) >= wanted ? { kind: "num_images", count: wanted } : { kind: "parallel", count: wanted };
}

/** Cena varijacija = cena jedne slike × broj (kod `num_images` to već računa pravilo cene). */
export function variationsCredits(plan: VariationPlan, oneJobCredits: number | null): number | null {
  if (oneJobCredits === null) return null;
  return plan.kind === "parallel" ? oneJobCredits * plan.count : oneJobCredits;
}

/** Probni list: poslovi po `perRun` slika dok se ne skupi `size` skica (npr. 16 = 4 × 4). */
export function sheetPlan(size: number, perRun: number): number[] {
  const total = Math.max(1, Math.round(size) || 1);
  const step = Math.max(1, Math.floor(perRun) || 1);
  const jobs: number[] = [];
  for (let left = total; left > 0; left -= step) jobs.push(Math.min(step, left));
  return jobs;
}

/**
 * Skica u probnom listu je mala: fal `square_hd` (2 MP po ceni) postaje `square`,
 * pa kvadratna skica košta kao svaka druga. Ostalo ostaje kako je.
 */
export function smallSketchParams(params: Record<string, unknown>): Record<string, unknown> {
  return params.image_size === "square_hd" ? { ...params, image_size: "square" } : params;
}
