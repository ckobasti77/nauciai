/**
 * Čista logika playground stranice (S7): šta zaključava dugme, koji slot je
 * isključila vrednost kontrole, iz kog fajla se meri količina i šta tačno ide
 * u `createJob`.
 *
 * Ista pravila po kojima server odbija posao (`convex/studio.ts`,
 * `buildCatalogOrder`) - ovde su da bi korisnik saznao PRE klika, ne iz greške
 * posle njega. Nijedna funkcija ne zna ime nijednog modela.
 */

import { roundAndClampQuantity, type QuantitySource } from "@/convex/studioJobCore";
import type { ParamControl } from "@/convex/studioParamSpec";

import type { GenerateBlock } from "./studio-messages";
import { visibleControls, type ParamValues } from "./studio-params";
import { slotsForMode, type InputSpec, type SlotFile, type SlotFiles } from "./studio-slots";

/**
 * Prompt je obavezan samo tamo gde je JEDINI ulaz - režim bez ijednog slota.
 * Isto pravilo drži i server: Kling lipsync sa okačenim zvukom ne mora da ima
 * ukucan tekst, a generacija iz samog opisa mora.
 */
export function promptRequired(spec: InputSpec, mode: string): boolean {
  return slotsForMode(spec, mode).length === 0;
}

/**
 * Slotovi koje je isključila VREDNOST kontrole (STUDIO-CATALOG-V4 sekcija 5).
 *
 * Pravilo je opšte, ne spisak: kontrola čija bar jedna opcija nosi ime slota
 * bira izmedju izvora, pa svaki takav slot koji NIJE izabran postaje opcion.
 * Kling lipsync sa izvorom govora "tekst" tako ne traži zvuk, a sa izvorom
 * "zvuk" ga traži - i nigde ne piše "lipsync".
 */
export function optionalSlots(
  spec: ParamControl[],
  values: ParamValues,
  inputSpec: InputSpec,
  mode: string,
): string[] {
  const slots = slotsForMode(inputSpec, mode).map((entry) => entry.slot);
  const optional: string[] = [];

  for (const control of visibleControls(spec, mode)) {
    const options = (control.options ?? []).map((option) => option.value);
    const named = options.filter((option) => slots.includes(option));
    if (named.length === 0) continue;

    const chosen = String(values[control.key] ?? control.default);
    for (const slot of named) {
      if (slot !== chosen && !optional.includes(slot)) optional.push(slot);
    }
  }

  return optional;
}

/**
 * Fajl iz kojeg se meri količina. `input_media_minutes` prima i zvuk i video
 * (transkripcija radi oba), pa se uzima onaj koji je okačen - prvi po
 * redosledu slotova režima, da izbor ne zavisi od redosleda kačenja.
 */
export function measuredFile(
  source: QuantitySource,
  inputSpec: InputSpec,
  mode: string,
  files: SlotFiles,
): SlotFile | null {
  const wanted =
    source.from === "input_audio_seconds"
      ? ["audio"]
      : source.from === "input_video_seconds"
        ? ["video"]
        : source.from === "input_media_minutes"
          ? slotsForMode(inputSpec, mode).map((entry) => entry.slot)
          : [];

  for (const slot of wanted) {
    const file = files[slot]?.[0];
    if (file) return file;
  }

  return null;
}

/**
 * Sirove izmerene sekunde -> količina u jedinici pravila (minuti za
 * `..._minutes`), BEZ zaokruživanja i klampovanja. Ceo broj za naplatu daje tek
 * `roundAndClampQuantity` (deljeno sa serverom, nalaz C1) - vidi `measuredParams`.
 */
export function measuredQuantityFrom(source: QuantitySource, seconds: number): number {
  return source.from === "input_media_minutes" ? seconds / 60 : seconds;
}

/**
 * Koliko sme da se razidju dužina koju je pročitao browser i ona koju je
 * izmerio server pre nego što se korisniku to i kaže. Sitna razlika je normalna
 * - `<video>.duration` vraća dužinu prikaza, a `mvhd` dužinu zapisa - ali
 * razlika od desetine dužine znači da cena na dugmetu nije ono što je korisnik
 * očekivao dok je birao fajl.
 */
export const MEASURE_MISMATCH_RATIO = 0.05;

export function measureMismatch(browserSeconds: number | null, serverSeconds: number | null): boolean {
  if (browserSeconds === null || serverSeconds === null || serverSeconds <= 0) return false;

  return Math.abs(browserSeconds - serverSeconds) / serverSeconds > MEASURE_MISMATCH_RATIO;
}

/**
 * Količina koja se MERI ide i u cenu na dugmetu, pod svojim ključem iz
 * `capabilities.quantity`. Bez nje cena je `null` ("ne znam"), nikad nula.
 */
export function measuredParams(
  source: QuantitySource | null,
  seconds: number | null,
  textLength: number,
): Record<string, number> {
  if (!source) return {};

  // C1: ista `roundAndClampQuantity` kojom server izračuna NAPLAĆENU količinu -
  // zaokruženo naviše na jedinicu pravila i isečeno na `min`/`max`. Bez toga je
  // cifra na dugmetu bila sirov razlomak (klip 7,4 s davao 7,4 umesto 8), pa se
  // naplaćivalo više nego što na dugmetu piše.
  if (source.from === "text_length") {
    return textLength > 0 ? { [source.param]: roundAndClampQuantity(source, textLength) } : {};
  }

  return seconds !== null && seconds > 0
    ? { [source.param]: roundAndClampQuantity(source, measuredQuantityFrom(source, seconds)) }
    : {};
}

export type PlaygroundState = {
  enabled: boolean;
  /**
   * Sme li u Studio (`hasStudioAccess` u `convex/studioCore.ts`). Dok je
   * Studio privremeno suženo na osoblje (`STUDIO_STAFF_ONLY`), ovo je "ima li
   * ulogu osoblja"; kad se fleg ugasi, vraća se na "aktivan upis ILI uloga".
   */
  hasStudioAccess: boolean;
  activeJobs: number;
  maxActiveJobs: number;
};

/**
 * Zašto dugme ne radi, ili `null` kad radi. Redosled je od najšireg razloga ka
 * najužem: ugašen Studio je isti za svaki model, a nedostajuća referenca je
 * stvar ovog jednog izbora. Kredit se proverava POSLEDNJI - poruka "dopuni
 * kredite" ima smisla tek kad je poznato koliko posao košta.
 */
export function generateBlock(input: {
  state: PlaygroundState | undefined;
  balance: number | undefined;
  credits: number | null;
  missingInputMessage: string | null;
  promptMissing: boolean;
  quantityMissing: boolean;
  sourceMissing?: boolean;
}): GenerateBlock | null {
  const { state, balance, credits } = input;

  if (state && !state.enabled) return { kind: "paused" };
  if (state && !state.hasStudioAccess) return { kind: "not_enrolled" };
  if (state && state.activeJobs >= state.maxActiveJobs) {
    return { kind: "active", max: state.maxActiveJobs };
  }
  if (input.missingInputMessage !== null) {
    return { kind: "inputs", message: input.missingInputMessage };
  }
  // Rezim koji se naručuje izborom prethodne generacije (Gemini Omni "video",
  // nalaz S3) nema slotove, pa ne prolazi kroz `missingInputMessage` iznad -
  // treba mu sopstvena provera pre prompta, koji taj rezim takodje traži.
  if (input.sourceMissing) return { kind: "source" };
  if (input.promptMissing) return { kind: "prompt" };
  // Redosled prati formu odozgo nadole: prvo ulazi, pa prompt, pa cena. Fajl
  // kojem server još nije izmerio dužinu ima svoju poruku, jer to nije stvar
  // podešavanja nego čekanja (ili formata koji se ne čita).
  if (input.quantityMissing) return { kind: "measure" };
  if (credits === null) return { kind: "price" };
  if (balance !== undefined && balance < credits) return { kind: "credits", needed: credits };

  return null;
}

/** `{ slot: [storageId] }` - tačno ono što `createJob` prima kao `inputs`. */
export function inputsPayload(files: SlotFiles): Record<string, string[]> {
  const payload: Record<string, string[]> = {};

  for (const [slot, slotFiles] of Object.entries(files)) {
    if (slotFiles.length > 0) payload[slot] = slotFiles.map((file) => file.storageId);
  }

  return payload;
}
