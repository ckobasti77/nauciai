import type { ParamControl } from "@/convex/studioParamSpec";

/**
 * „Više scena u klipu" (Crea K18, V11; plan K17-10): do 6 kartica (opis + pokret
 * kamere + sekunde) postaje JEDAN Kling 3.0 posao sa `multi_prompt` - fal ih
 * spaja u jedan klip sa rezovima. Potvrđeno na fal OpenAPI šemi (2026-10-05), pa
 * nije potreban lanac poslova ni montaža.
 *
 * Cena se ne menja: naplaćuje se UKUPNO trajanje (`duration`), a zbir sekundi
 * scena mora biti tačno to trajanje (isto pravilo proverava server,
 * `parseMultiShot`). Polje `scenes` je JSON koji server pretvara u niz.
 */

export const MULTI_SHOT_MODEL = "kling-3";
export const MULTI_SHOT_PARAM = "scenes";
export const SCENES_MIN = 2;
export const SCENES_MAX = 6;

export type SceneCard = {
  /** Šta se dešava u sceni (jezik korisnika ili engleski - model razume oba). */
  text: string;
  /** Rečenica pokreta kamere za model (već izabrana iz `crea-camera-moves`), ili prazno. */
  move: string;
  seconds: number;
};

/** Granice ukupnog trajanja iz kontrole modela (Kling 3.0: 5-10 s). */
export function totalSecondsRange(spec: readonly ParamControl[]): { min: number; max: number } {
  const control = spec.find((entry) => entry.key === "duration");
  return { min: control?.min ?? 5, max: control?.max ?? 10 };
}

/** Ravnomerno deli ukupno trajanje na scene (celi brojevi, zbir tačan, prve dobijaju višak). */
export function distributeSeconds(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

export type ScenesProblem = "premalo-scena" | "previse-scena" | "prazna-scena" | "kratka-scena" | "trajanje";

/** Šta ne valja (ili `null`): broj scena, prazan opis, sekunde i ukupno trajanje u granicama modela. */
export function scenesProblem(cards: readonly SceneCard[], range: { min: number; max: number }): ScenesProblem | null {
  if (cards.length < SCENES_MIN) return "premalo-scena";
  if (cards.length > SCENES_MAX) return "previse-scena";
  if (cards.some((card) => card.text.trim() === "")) return "prazna-scena";
  if (cards.some((card) => !Number.isInteger(card.seconds) || card.seconds < 1)) return "kratka-scena";
  const total = cards.reduce((sum, card) => sum + card.seconds, 0);
  if (total < range.min || total > range.max) return "trajanje";
  return null;
}

function sceneSentence(card: SceneCard): string {
  const text = card.text.trim().replace(/[.\s]+$/, "");
  return card.move.trim() ? `${text}, ${card.move.trim()}` : text;
}

/**
 * Parametri posla: `scenes` (JSON za fal) i `duration` (zbir). `prompt` nosi sve
 * scene u jednom redu - za istoriju, pretragu i „Napravi ovako"; fal ga ne dobija
 * kad su scene ispravne (ili jedno ili drugo).
 */
export function scenesParams(cards: readonly SceneCard[]): { prompt: string; duration: number; scenes: string } {
  const shots = cards.map((card) => ({ prompt: sceneSentence(card), duration: String(card.seconds) }));
  return {
    prompt: shots.map((shot, index) => `Scene ${index + 1}: ${shot.prompt}`).join(". "),
    duration: cards.reduce((sum, card) => sum + card.seconds, 0),
    scenes: JSON.stringify(shots),
  };
}
