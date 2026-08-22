/**
 * Šta je „osnovno", a šta „napredno" podešavanje u panelu (SP1, tačka 3).
 * NIJE fiksna lista po modelu - izvodi se iz `paramSpec`-a, pa 32. model radi
 * bez izmene komponente. Pravilo je pokriveno testom.
 *
 * Osnovno = kontrola koja menja CENU (`affectsPrice`) ili bira OBLIK IZLAZA
 * (`aspect_ratio`) - dve odluke koje početnik mora da vidi odmah, jer nose i
 * novac i kadar. Sve ostalo (seed, negativan prompt, fini tonovi glasa, LoRA…)
 * je napredno i stoji sklopljeno iza „Napredno · N".
 *
 * Prompt (`textarea` / ključ `prompt`) se NE računa ni u jedno - on živi na
 * baru composera, ne u telu panela.
 */

import type { ParamControl } from "@/convex/studioParamSpec";

/** Ključevi koji biraju oblik izlaza - osnovni iako ne moraju da menjaju cenu. */
const OUTPUT_SHAPE_KEYS = new Set(["aspect_ratio"]);

function isPromptControl(control: ParamControl): boolean {
  return control.type === "textarea" || control.key === "prompt";
}

/** Da li je kontrola osnovna (menja cenu ili oblik izlaza). */
export function isBasicControl(control: ParamControl): boolean {
  if (isPromptControl(control)) return false;
  return control.affectsPrice === true || OUTPUT_SHAPE_KEYS.has(control.key);
}

export type ControlSplit = {
  /** Prikazuju se odmah, redosledom iz `paramSpec`-a. */
  basic: ParamControl[];
  /** Sklopljene iza „Napredno · N". */
  advanced: ParamControl[];
};

/**
 * Deli VEĆ vidljive kontrole (filtrirane po režimu) na osnovne i napredne.
 * Prompt se izostavlja iz obe grupe. Redosled unutar grupa prati `paramSpec`.
 */
export function splitControlsByImportance(controls: ParamControl[]): ControlSplit {
  const basic: ParamControl[] = [];
  const advanced: ParamControl[] = [];

  for (const control of controls) {
    if (isPromptControl(control)) continue;
    if (isBasicControl(control)) basic.push(control);
    else advanced.push(control);
  }

  return { basic, advanced };
}
