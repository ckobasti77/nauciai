import { STEP_JOB_KIND, type AssistantStep } from "../convex/creaAssistantCore";
import { promptControlOf } from "../convex/studioJobCore";
import { pickAuto, type AutoJob } from "./crea-auto";
import type { StudioModel } from "./studio-models";

/**
 * Pomoćnik (K28, U12) na klijentu: svaki korak plana dobija model i cenu ISTIM
 * Auto pravilima kao composer (`pickAuto`), pa je cena koju korisnik potvrđuje
 * ona koju bi platio i ručno. Server tu cenu čuva kao gornju granicu koraka.
 */

export type PricedStep = {
  step: AssistantStep;
  /** `null` = nema dostupnog modela za ovaj korak (preskače se). */
  model: StudioModel | null;
  inputMode: string;
  params: Record<string, unknown>;
  credits: number;
  /** Indeks koraka-slike iz plana NAKON preskakanja (šalje se serveru kao `fromStep`). */
  fromStep?: number;
};

function autoJobFor(step: AssistantStep): AutoJob {
  const none = { images: 0, videos: 0, audio: 0, mask: false };
  if (step.kind === "slika") return { area: "slika", prompt: step.prompt, inputs: none };
  if (step.kind === "video") return { area: "video", prompt: step.prompt, inputs: { ...none, images: step.from !== null ? 1 : 0 } };
  return { area: "zvuk", prompt: step.prompt, inputs: none, shellMode: step.kind === "muzika" ? "muzika" : "govor" };
}

export function priceAssistantSteps(
  steps: readonly AssistantStep[],
  models: readonly StudioModel[],
  available: (model: StudioModel) => boolean,
): PricedStep[] {
  const catalog = [...models];
  const priced: PricedStep[] = [];
  // Stari indeks (iz plana) → nov indeks (među koracima koji imaju model).
  const kept = new Map<number, number>();
  steps.forEach((step, index) => {
    const pick = pickAuto(autoJobFor(step), catalog, { available });
    if (!pick || pick.model.kind !== STEP_JOB_KIND[step.kind]) {
      priced.push({ step, model: null, inputMode: "", params: {}, credits: 0 });
      return;
    }
    const promptControl = promptControlOf(pick.model.paramSpec, pick.inputMode);
    const params = promptControl ? { ...pick.params, [promptControl.key]: step.prompt } : pick.params;
    const fromStep = step.from !== null ? kept.get(step.from) : undefined;
    // Video iz slike koja je preskočena nema ulaz - preskače se i on.
    if (step.from !== null && fromStep === undefined) {
      priced.push({ step, model: null, inputMode: "", params: {}, credits: 0 });
      return;
    }
    kept.set(index, kept.size);
    priced.push({ step, model: pick.model, inputMode: pick.inputMode, params, credits: pick.credits, ...(fromStep !== undefined ? { fromStep } : {}) });
  });
  return priced;
}

/** Ukupna cena koraka koji se zaista pokreću. */
export function assistantTotal(priced: readonly PricedStep[]): number {
  return priced.reduce((sum, entry) => sum + (entry.model ? entry.credits : 0), 0);
}
