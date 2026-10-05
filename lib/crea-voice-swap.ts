import { jobCredits, type PricedModel } from "./crea-job-price";
import { compactPlan, speakersOf, type SpeechSegment } from "./crea-speech-segments";
import { voiceById, voicesOf } from "./crea-voices";

/**
 * Promena glasa po govorniku (Crea K23, A9): koraci i cena pre klika.
 *
 * 1. (po želji) `stems` - glas se odvoji od muzike, pa muzika ostaje netaknuta;
 * 2. (po želji) `stt` - ko kada govori (Scribe V2 sa `diarize`);
 * 3. `voice-changer` po govorniku - šalju se SAMO njegovi delovi spojeni jedan za
 *    drugim (`compactPlan`), jer se promena glasa plaća po minutu;
 * 4. spajanje na uređaju (0 kr): nov glas na stara mesta, ostali govornici i muzika.
 *
 * Bez koraka 2 ceo glas ide jednim poslom u jedan novi glas (današnji `voice-changer`).
 */

/** Glasovi promene glasa: ElevenLabs glasovi iz biblioteke (isti spisak kao red `voice-changer`). */
export function swapVoices(): string[] {
  return voicesOf("eleven").map((voice) => voice.id);
}

export type SwapChoices = Readonly<Record<string, string | null>>;

export type SwapStepId = "trake" | "govornici" | `glas:${string}`;

export type SwapStep = {
  id: SwapStepId;
  modelSlug: "stems" | "stt" | "voice-changer";
  inputMode: "audio";
  /** Minuta koje server meri i naplaćuje (procena pre slanja). */
  minutes: number;
  params: Record<string, string>;
};

export type SwapInput = {
  durationS: number;
  keepMusic: boolean;
  perSpeaker: boolean;
  /** Delovi po govorniku - poznati tek posle koraka „govornici". */
  segments: readonly SpeechSegment[] | null;
  /** Novi glas po govorniku; `null` = ostaje svoj glas. */
  choices: SwapChoices;
  /** Glas za ceo snimak kad nema podele po govornicima. */
  voice: string;
};

/** Govornici kojima se menja glas (izabran postojeći glas). */
export function changedSpeakers(choices: SwapChoices): string[] {
  return Object.entries(choices)
    .filter(([, voice]) => typeof voice === "string" && voiceById("eleven", voice) !== undefined)
    .map(([speaker]) => speaker);
}

export function swapSteps(input: SwapInput): SwapStep[] {
  const minutes = Math.max(0, input.durationS) / 60;
  const steps: SwapStep[] = [];
  if (input.keepMusic) steps.push({ id: "trake", modelSlug: "stems", inputMode: "audio", minutes, params: {} });
  if (!input.perSpeaker) {
    const voice = voiceById("eleven", input.voice) ? input.voice : swapVoices()[0]!;
    steps.push({ id: "glas:sve", modelSlug: "voice-changer", inputMode: "audio", minutes, params: { voice } });
    return steps;
  }
  steps.push({ id: "govornici", modelSlug: "stt", inputMode: "audio", minutes, params: {} });
  if (!input.segments) return steps;
  for (const speaker of speakersOf(input.segments)) {
    const voice = input.choices[speaker.id];
    if (typeof voice !== "string" || !voiceById("eleven", voice)) continue;
    const plan = compactPlan(input.segments, speaker.id, input.durationS);
    if (plan.pieces.length === 0) continue;
    steps.push({ id: `glas:${speaker.id}`, modelSlug: "voice-changer", inputMode: "audio", minutes: plan.durationS / 60, params: { voice } });
  }
  return steps;
}

export function stepCredits(step: SwapStep, catalog: readonly PricedModel[]): number | null {
  return jobCredits({ modelSlug: step.modelSlug, inputMode: step.inputMode, params: step.params, measured: { minutes: step.minutes } }, catalog);
}

/** Zbir cena koraka; `null` kad neki model nije u katalogu. */
export function swapCredits(steps: readonly SwapStep[], catalog: readonly PricedModel[]): number | null {
  let total = 0;
  for (const step of steps) {
    const price = stepCredits(step, catalog);
    if (price === null) return null;
    total += price;
  }
  return total;
}
