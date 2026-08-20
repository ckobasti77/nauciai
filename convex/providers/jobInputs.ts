/**
 * `generationJobs.inputs` je JSON `{ slot: [storageId, ...] }` (STUDIO-CATALOG-V4
 * sekcija 5) i taj oblik je isti za sva tri provajdera. Čitanje je zato ovde, a
 * ne u `bytePlusCore.ts` gde je prvi put napisano - sa Google-om je postao
 * drugi pozivalac, a funkcija ne zna ništa ni o jednom provajderu.
 */

/**
 * Redosled unutar slota je značajan (prompt citira "slika 2"), pa se čuva
 * kakav jeste. Sve što nije taj oblik je prazan skup - posao tada ide bez ulaza
 * umesto da pukne.
 */
export function parseJobInputs(raw: string | undefined): Record<string, string[]> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const inputs: Record<string, string[]> = {};
  for (const [slot, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    inputs[slot] = value.filter((entry): entry is string => typeof entry === "string");
  }

  return inputs;
}
