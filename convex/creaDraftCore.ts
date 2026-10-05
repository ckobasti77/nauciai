/**
 * Seme (`seed`) za Proba → Usavrši (Crea S4/V3, odluke K06-6 i K06-7). Čista
 * logika; poziva je `studio.buildCatalogOrder`, a parove proba/usavrši drži
 * `lib/crea-draft.ts`.
 *
 * Seme upisuje SERVER, posle `sanitizeSpecParams` (isto kao `input_images`):
 * početnik ne zna šta je seme, pa ga forma ni ne nudi. Model ga prima samo ako
 * red kataloga ima `capabilities.seedParam`.
 */

/** Najveće seme koje primaju fal i BytePlus (2^31 - 1). */
export const MAX_SEED = 2_147_483_647;

/** Ime parametra za seme iz `capabilities` reda, ili `null` kad ga model nema. */
export function seedParamOf(capabilities: Record<string, unknown>): string | null {
  const raw = capabilities.seedParam;

  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Seme se NASLEĐUJE samo kad je posao „Usavrši" iste porodice modela (K06-7):
 * drugom modelu tuđe seme ne znači ništa, pa tamo kompoziciju nosi referentna
 * slika, ne seme. Vraća `null` kad nasleđivanja nema - pozivalac tada izvlači novo.
 */
export function inheritedSeed(p: {
  derivation: string | undefined;
  family: string;
  parentFamily: string | null;
  parentParams: Record<string, unknown> | null;
  seedParam: string;
}): number | null {
  if (p.derivation !== "usavrsavanje" || p.parentFamily !== p.family || !p.parentParams) return null;
  const value = p.parentParams[p.seedParam];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_SEED) return null;

  return value;
}

/** Novo seme iz broja u [0, 1) - `Math.random` je u Convex mutaciji dozvoljen i deterministički. */
export function seedFromUnit(unit: number): number {
  const clamped = Number.isFinite(unit) ? Math.min(Math.max(unit, 0), 0.999999999) : 0;

  return Math.floor(clamped * MAX_SEED);
}
