import {
  CREA_PROMPT_PARAM,
  CREA_PROMPT_PARAM_MAX,
  creaShellQuery,
  modelsForMode,
  modeOfModel,
  type CreaArea,
  type CreaModelLike,
  type CreaModeId,
} from "@/lib/crea-shell";
import { toolById, toolOfJob } from "@/lib/crea-tools";
import { CREA_INPUT_PARAM, referenceTarget, versionInputTarget } from "@/lib/crea-versions";
import type { LocalizedText } from "@/lib/i18n";
import { jobPrompt } from "@/lib/studio-form";
import type { InputSpec } from "@/lib/studio-slots";

/**
 * Brze akcije na svakom radu (K16, S44): kuda vodi „Animiraj", „Ozvuči", „Izmeni",
 * „Uvećaj", „Ukloni pozadinu", „Napravi sličnu" i „Koristi kao referencu" - tačan
 * alat ili režim sa već popunjenim ulazom (`?ulaz=<rad>`, alias izlaza iz K05) ili
 * opisom (`?opis=`). Čista funkcija nad katalogom; UI je samo pretvara u link.
 */

export const QUICK_ACTION_IDS = ["animiraj", "ozvuci", "izmeni", "uvecaj", "pozadina", "slicna", "referenca"] as const;
export type QuickActionId = (typeof QUICK_ACTION_IDS)[number];

export const QUICK_ACTION_LABELS: Record<QuickActionId, LocalizedText> = {
  animiraj: { sr: "Animiraj", en: "Animate" },
  ozvuci: { sr: "Ozvuči", en: "Add sound" },
  izmeni: { sr: "Izmeni", en: "Edit" },
  uvecaj: { sr: "Uvećaj", en: "Upscale" },
  pozadina: { sr: "Ukloni pozadinu", en: "Remove background" },
  slicna: { sr: "Napravi sličnu", en: "Make a similar one" },
  referenca: { sr: "Koristi kao referencu", en: "Use as reference" },
};

export type QuickTarget = {
  area: CreaArea;
  mode: CreaModeId;
  tool?: string;
  model?: string;
  /** Rad čiji izlaz postaje ulaz (`?ulaz=`). */
  input?: string;
  /** Opis koji se upisuje u composer (`?opis=`). */
  prompt?: string;
};

export type QuickAction = { id: QuickActionId; target: QuickTarget };

export type QuickJob = {
  _id: string;
  kind: "image" | "video" | "audio";
  status: string;
  outputUrl: string | null;
  params: string;
  modelSlug: string;
  isMock: boolean;
  inputMode?: string;
};

type QuickModel = CreaModelLike & { inputSpec: InputSpec; badge?: string };

/** Izlaz koji sme da bude ulaz: gotov, sa fajlom, a ne DEMO poster (SVG ne prima nijedan slot). */
function canBeInput(job: QuickJob): boolean {
  if (job.status !== "done" || !job.outputUrl || job.isMock) return false;
  return !job.outputUrl.startsWith("data:image/svg+xml");
}

function toolTarget(toolId: string, input: string): QuickTarget | null {
  const tool = toolById(toolId);
  if (!tool || tool.status !== "ready") return null;
  return { area: tool.area, mode: tool.mode, tool: tool.id, input };
}

/**
 * Akcije koje ovaj rad ima, redom kako ih UI nudi. Akcija bez cilja (npr. nema
 * modela koji prima video) se ne nudi - nikad dugme koje ne vodi nigde.
 *
 * „Napravi sličnu": rad sa opisom → isti model i opis u svom režimu; slika bez
 * opisa (besplatan alat, okačena fotka) → „Kako je ovo napravljeno?" (S45) sa tom
 * slikom, koji opiše sliku rečima i odatle pravi sličnu.
 */
export function quickActionsFor(job: QuickJob, catalog: readonly QuickModel[]): QuickAction[] {
  const actions: QuickAction[] = [];
  const add = (id: QuickActionId, target: QuickTarget | null) => {
    if (target) actions.push({ id, target });
  };
  const usable = canBeInput(job);
  const prompt = jobPrompt(job.params).trim();

  if (usable) {
    if (job.kind === "image") {
      const animate = versionInputTarget(catalog, "image", "animate");
      add("animiraj", animate && { area: animate.area, mode: animate.mode, model: animate.modelSlug, input: job._id });
    }
    if (job.kind === "video") {
      const sound = versionInputTarget(catalog, "video", "sound");
      add("ozvuci", sound && { area: sound.area, mode: sound.mode, model: sound.modelSlug, input: job._id });
    }
    if (job.kind !== "audio") {
      const edit = versionInputTarget(catalog, job.kind, "input");
      add("izmeni", edit && { area: edit.area, mode: edit.mode, model: edit.modelSlug, input: job._id });
    }
    if (job.kind === "image") {
      add("uvecaj", toolTarget("slika.uvecaj", job._id));
      add("pozadina", toolTarget("slika.pozadina", job._id));
    }
  }

  // Slika ozvučena opisom (nema modela koji od slike pravi zvuk): Zvuk · Efekti sa istim opisom.
  const sfx = job.kind === "image" && prompt ? modelsForMode(catalog, "zvuk", "efekti").find((entry) => entry.inputModes.includes("text")) : undefined;
  if (sfx) add("ozvuci", { area: "zvuk", mode: "efekti", model: sfx.slug, prompt: prompt.slice(0, CREA_PROMPT_PARAM_MAX) });

  const model = toolOfJob(job) ? undefined : catalog.find((entry) => entry.slug === job.modelSlug);
  const home = model ? modeOfModel(model, job.inputMode) : null;
  if (prompt && model && home) {
    add("slicna", { area: home.area, mode: home.mode, model: model.slug, prompt: prompt.slice(0, CREA_PROMPT_PARAM_MAX) });
  } else if (prompt && job.kind !== "audio") {
    // Model rada više nije uključen: isti opis u Napravi, sa modelom koji radionica ponudi.
    add("slicna", { area: job.kind === "image" ? "slika" : "video", mode: "napravi", prompt: prompt.slice(0, CREA_PROMPT_PARAM_MAX) });
  } else if (usable && job.kind === "image") {
    add("slicna", toolTarget("slika.opis", job._id));
  }

  if (usable && job.kind === "image") {
    const reference = referenceTarget(catalog);
    add("referenca", reference && { area: reference.area, mode: reference.mode, model: reference.modelSlug, input: job._id });
  }
  return actions.sort((a, b) => QUICK_ACTION_IDS.indexOf(a.id) - QUICK_ACTION_IDS.indexOf(b.id));
}

/** Query string cilja: ljuska (oblast, režim, alat, model) + `?ulaz=` / `?opis=`. Recept i cilj se brišu. */
export function quickActionQuery(target: QuickTarget, current: URLSearchParams): string {
  const query = new URLSearchParams(
    creaShellQuery(
      { area: target.area, mode: target.mode, tool: target.tool ?? null, goal: null, recipe: null, model: target.model ?? null },
      current,
    ),
  );
  query.delete("regenerate");
  query.delete(CREA_INPUT_PARAM);
  query.delete(CREA_PROMPT_PARAM);
  if (target.input) query.set(CREA_INPUT_PARAM, target.input);
  if (target.prompt) query.set(CREA_PROMPT_PARAM, target.prompt);
  return query.toString();
}
