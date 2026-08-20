/**
 * Čista logika naručivanja posla iz v4 kataloga (`models`): ulazni slotovi,
 * merene količine i prompt. Bez `ctx`, bez baze, bez čitanja sata - `studio.ts`
 * ovo samo upisuje.
 *
 * Ovde su i `parseInputSpec`/`parseInputModes`, koje su do sada stajale u
 * `lib/studio-slots.ts`. Server mora da proveri isti `inputSpec` po kojem
 * forma crta slotove, a dva parsera istog polja su dva ugovora - pa parser
 * živi na strani koja naplaćuje, a `lib/studio-slots.ts` ga uvozi.
 */

import { lowerBoundSeconds, upperBoundSeconds } from "../lib/media-duration";
import { isControlVisible, type ParamControl } from "./studioParamSpec";
import type { PriceRule } from "./studioPricing";

/** Jedan slot jednog režima: koliko fajlova prima i koje MIME tipove. */
export type SlotSpec = { max: number; accept: string[] };

/** Slotovi jednog režima: `{ image: { max: 9, accept: [...] }, video: {...} }`. */
export type ModeSpec = Record<string, SlotSpec>;

/** Ceo `models.inputSpec`: `{ inputMode: { slot: SlotSpec } }`. */
export type InputSpec = Record<string, ModeSpec>;

export function parseInputSpec(raw: string): InputSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const spec: InputSpec = {};
  for (const [mode, slots] of Object.entries(parsed as Record<string, unknown>)) {
    if (!slots || typeof slots !== "object" || Array.isArray(slots)) continue;
    const modeSpec: ModeSpec = {};
    for (const [slot, value] of Object.entries(slots as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as { max?: unknown; accept?: unknown };
      const max = typeof entry.max === "number" && entry.max > 0 ? Math.floor(entry.max) : 1;
      const accept = Array.isArray(entry.accept)
        ? entry.accept.filter((mime): mime is string => typeof mime === "string")
        : [];
      modeSpec[slot] = { max, accept };
    }
    spec[mode] = modeSpec;
  }

  return spec;
}

export function parseInputModes(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  return Array.isArray(parsed) ? parsed.filter((mode): mode is string => typeof mode === "string") : [];
}

/**
 * Ulazi jednog posla: `{ slot: [storageId, ...] }`. Redosled je značajan -
 * prompt citira reference po broju ("slika 2") - pa je niz, ne skup.
 */
export type JobInputs = Record<string, string[]>;

/**
 * Ono što je klijent poslao uz `createJob`. Strogo: sve što nije `{ slot:
 * [storageId] }` je `null`, dakle odbijen posao - `providers/jobInputs.ts`
 * čita ISTO polje kasnije, ali blago, jer tada je zapis već prošao ovu kapiju
 * i tiho preskakanje pokvarenog reda je bolje od pada predaje.
 */
export function parseClientInputs(raw: string | undefined): JobInputs | null {
  if (raw === undefined) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const inputs: JobInputs = {};
  for (const [slot, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) return null;
    if (!value.every((id): id is string => typeof id === "string" && id.length > 0)) return null;
    if (value.length > 0) inputs[slot] = value;
  }

  return inputs;
}

export type SanitizedInputs = { ok: true; inputs: JobInputs } | { ok: false; reason: string };

/**
 * Ulazi su ispravni samo ako ih režim poznaje i ako ih nema više nego što slot
 * prima. Slot kojeg režim nema se ODBIJA, ne izbacuje tiho: forma ga ne bi ni
 * ponudila, pa je jedini način da stigne poziv mimo forme - a taj poziv bi
 * inače naručio kod provajdera fajl koji nije naplaćen.
 */
export function sanitizeJobInputs(inputs: JobInputs, spec: InputSpec, mode: string): SanitizedInputs {
  const modeSpec = Object.hasOwn(spec, mode) ? spec[mode] : undefined;
  const clean: JobInputs = {};

  for (const [slot, ids] of Object.entries(inputs)) {
    const allowed = modeSpec && Object.hasOwn(modeSpec, slot) ? modeSpec[slot] : undefined;
    if (!allowed) return { ok: false, reason: `NEPOZNAT_SLOT:${slot}` };
    if (ids.length > allowed.max) return { ok: false, reason: `PREVISE_FAJLOVA:${slot}` };
    clean[slot] = ids;
  }

  return { ok: true, inputs: clean };
}

/** Svi okačeni fajlovi jednog posla, redom po slotovima. */
export function jobInputStorageIds(inputs: JobInputs): string[] {
  return Object.values(inputs).flat();
}

/**
 * Slotovi koji nose video odnosno zvuk. Vrsta se čita iz IMENA slota, ne iz
 * `accept` liste: katalog imenuje slotove po sadržaju (`image`, `video`,
 * `audio`, `person`, `garment`), pa je ime jedini podatak koji posao nosi i
 * posle upisa - `inputs` u bazi ima samo slot i `storageId`.
 */
const VIDEO_SLOT = "video";
const AUDIO_SLOT = "audio";

/**
 * Ima li posao video medju ulazima. Seedance u `reference` režimu sa video
 * ulazom ide po sniženoj tarifi (STUDIO-CATALOG-V4 3.4), a to zna samo onaj ko
 * vidi ulaze - pravilo zna tarifu, ne i fajlove.
 */
export function hasVideoInput(inputs: JobInputs): boolean {
  return (inputs[VIDEO_SLOT]?.length ?? 0) > 0;
}

/** Koliko je ULAZNIH SLIKA okačeno - `extras` u katalogu su uvek slike. */
export function countInputImages(inputs: JobInputs): number {
  let images = 0;
  for (const [slot, ids] of Object.entries(inputs)) {
    if (slot === VIDEO_SLOT || slot === AUDIO_SLOT) continue;
    images += ids.length;
  }

  return images;
}

/**
 * Količine koje pravilo naplaćuje preko besplatne kvote (`extras`): šesta
 * referentna slika kod MiniMax-a, druga ulazna slika kod Seedream-a. Forma ih
 * broji da bi cena na dugmetu bila tačna, ali naplaćuje se OVAJ broj - onaj
 * koji server vidi u `inputs`-ima.
 */
export function extraCounts(rule: PriceRule, inputs: JobInputs): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!rule.extras) return counts;

  const images = countInputImages(inputs);
  for (const extra of rule.extras) counts[extra.param] = images;

  return counts;
}

/**
 * Kontrola iz koje se čita prompt: prva vidljiva `textarea`. Ključ nije uvek
 * `prompt` (ElevenLabs ima `text`), a model bez ijedne `textarea` kontrole
 * (proba odeće) uopšte nema prompt - tada je `null`, i moderacija se preskače
 * umesto da posao padne na "prazan prompt".
 */
export function promptControlOf(spec: ParamControl[], inputMode?: string): ParamControl | null {
  for (const control of spec) {
    if (control.type !== "textarea") continue;
    if (!isControlVisible(control, inputMode)) continue;

    return control;
  }

  return null;
}

export function promptFromParams(
  spec: ParamControl[],
  params: Record<string, unknown>,
  inputMode?: string,
): string | null {
  const control = promptControlOf(spec, inputMode);
  if (!control) return null;
  const value = params[control.key];

  return typeof value === "string" ? value : "";
}

/**
 * Količina koja se MERI, a ne bira (STUDIO-CATALOG-V4 3.9 i 4.2): sekunde
 * okačenog zvuka/videa, minuti snimka, broj znakova ukucanog teksta. Stoji u
 * `capabilities.quantity` reda kataloga.
 */
export type QuantitySource = {
  param: string;
  from: "input_audio_seconds" | "input_video_seconds" | "input_media_minutes" | "text_length";
  min: number;
  max: number;
  /** Ključ kontrole iz koje se meri, kad se meri iz teksta a ne iz fajla. */
  measuredFrom?: string;
};

const QUANTITY_SOURCES = new Set([
  "input_audio_seconds",
  "input_video_seconds",
  "input_media_minutes",
  "text_length",
]);

export function parseQuantitySource(capabilities: string): QuantitySource | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(capabilities);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const raw = (parsed as { quantity?: unknown }).quantity;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as QuantitySource;
  if (typeof source.param !== "string" || !QUANTITY_SOURCES.has(source.from)) return null;
  if (!Number.isFinite(source.min) || !Number.isFinite(source.max)) return null;

  return source;
}

/**
 * Rezim koji se ne naručuje uploadom nego IZBOROM prethodne generacije ISTOG
 * modela iz `generationJobs` (STUDIO-CATALOG-V4 3.8, nalaz S3: Gemini Omni
 * "video" - izmena klipa koji je model sam napravio). Stoji u
 * `capabilities.continuation` reda kataloga; `mode` je ime ulaznog režima na
 * koji se odnosi, `param` ključ pod kojim se ID prethodne generacije upisuje u
 * `params` da bi ga provajder pročitao (`providers/google.ts`).
 */
export type ContinuationSource = { mode: string; param: string };

export function parseContinuationSource(capabilities: string): ContinuationSource | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(capabilities);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const raw = (parsed as { continuation?: unknown }).continuation;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as ContinuationSource;
  if (typeof source.mode !== "string" || typeof source.param !== "string") return null;

  return source;
}

/**
 * Iz kojih slotova se koja količina meri. `stt` i `dubbing` primaju i video i
 * zvuk pod istim pravilom po minutu, pa `input_media_minutes` gleda oba slota.
 */
const MEASURED_SLOTS: Record<QuantitySource["from"], string[]> = {
  input_audio_seconds: [AUDIO_SLOT],
  input_video_seconds: [VIDEO_SLOT],
  input_media_minutes: [VIDEO_SLOT, AUDIO_SLOT],
  text_length: [],
};

export function measuredSlotsFor(source: QuantitySource): string[] {
  return MEASURED_SLOTS[source.from] ?? [];
}

/**
 * Jedan okačen fajl u mernom slotu, onako kako stoji na redu `studioUploads`:
 * šta ZAGLAVLJE tvrdi (`durationS`), i koliko fajl stvarno ima bajtova. Oba
 * broja su upisana iz `_storage`, ne iz onoga što je klijent rekao (W4).
 */
export type MeasuredUpload = { seconds: number; bytes: number; mimeType?: string };

/** Po čemu je naplaćeno trajanje ispalo onakvo kakvo jeste. */
export type DurationSource = "header" | "lower_bound";

export type BoundedSeconds =
  | {
      ok: true;
      /** Sekunde po mernom slotu, posle donje granice - ulaz u `measuredQuantityFromSeconds`. */
      seconds: Record<string, number>;
      /** Zbir onoga što zaglavlja tvrde, preko svih mernih slotova. */
      headerSeconds: number;
      /** Zbir onoga po čemu se naplaćuje. Jednak `headerSeconds` kad zaglavlje nadjača granicu. */
      billedSeconds: number;
      durationSource: DurationSource;
    }
  | { ok: false; reason: string };

/**
 * Trajanje mernih slotova, provučeno kroz granice iz VELIČINE fajla (nalaz N2).
 *
 * Zaglavlje je metapodatak, a naplaćuje se medij: `mvhd.duration` prepravljen
 * na 6 sekundi je i dalje fajl od 288 MB koji provajder obradi dva sata i
 * naplati $72. Bajtovi se ne mogu lagati bez izbacivanja sadržaja, pa dva
 * količnika iz `lib/media-duration.ts` zatvaraju obe strane:
 *
 * - `lowerBoundSeconds` (bajtovi / MAKSIMALAN bitrate) je najkraće trajanje
 *   koje fajl te veličine može da ima. Kad nadjača zaglavlje, naplaćuje se ono
 *   i posao nosi `durationSource: "lower_bound"` - po tome se kasnije prepoznaje
 *   ko je pokušao.
 * - `upperBoundSeconds` (bajtovi / MINIMALAN bitrate) je najduže trajanje koje
 *   fajl te veličine može da ima. Zaglavlje iznad njega je nemoguće, pa posao
 *   pada na `ZAGLAVLJE_NEMOGUCE` - to je suprotan napad, fajl od megabajta sa
 *   zaglavljem od deset sati kojim se puni tuđi dnevni plafon.
 *
 * MIME tip koji nijedna tabela ne poznaje nema granicu i ostaje na zatečenom
 * putu. Fajl bez pročitanog zaglavlja se ni ovde ne pojavljuje: granica podiže
 * izmereno trajanje, ne izmišlja ga.
 */
export function boundedInputSeconds(
  source: QuantitySource,
  uploads: Record<string, MeasuredUpload[]>,
): BoundedSeconds {
  const seconds: Record<string, number> = {};
  let headerSeconds = 0;
  let billedSeconds = 0;
  let raised = false;

  for (const slot of measuredSlotsFor(source)) {
    const files = Object.hasOwn(uploads, slot) ? uploads[slot] : undefined;
    if (!files) continue;

    let total = 0;
    let measured = false;
    for (const file of files) {
      if (!Number.isFinite(file.seconds) || file.seconds <= 0) continue;

      const mimeType = file.mimeType ?? "";
      const impossible = upperBoundSeconds(file.bytes, mimeType);
      if (impossible !== null && file.seconds > impossible) {
        return { ok: false, reason: "ZAGLAVLJE_NEMOGUCE" };
      }

      let billable = file.seconds;
      const floor = lowerBoundSeconds(file.bytes, mimeType);
      if (floor !== null && floor > billable) {
        billable = floor;
        raised = true;
      }

      measured = true;
      headerSeconds += file.seconds;
      total += billable;
    }
    if (measured) {
      seconds[slot] = total;
      billedSeconds += total;
    }
  }

  return {
    ok: true,
    seconds,
    headerSeconds,
    billedSeconds,
    durationSource: raised ? "lower_bound" : "header",
  };
}

/**
 * Trajanje mernih slotova, sabrano i prevedeno u jedinicu pravila.
 *
 * Ulaz su SEKUNDE koje je `boundedInputSeconds` već provukao kroz granice iz
 * veličine fajla - dakle ono što je server pročitao iz zaglavlja
 * (`studioUploads.durationS`, W5), podignuto na donju granicu kad je zaglavlje
 * ispod nje. Ono što je klijent pročitao iz `<video>` metapodataka ne ulazi
 * nigde. `stt` i `dubbing` primaju i video i zvuk pod istim pravilom po minutu,
 * pa se oba slota sabiraju.
 *
 * `null` znači "nema se šta naplatiti": nijedan merni slot nije okačen, ili
 * nijedan okačen fajl nije izmeren (nepoznat format, nečitljivo zaglavlje).
 * Tada `resolveMeasuredQuantity` odbija posao.
 */
export function measuredQuantityFromSeconds(
  source: QuantitySource,
  secondsBySlot: Record<string, number>,
): number | null {
  let seconds = 0;
  let measured = false;
  for (const slot of measuredSlotsFor(source)) {
    const value = secondsBySlot[slot];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    measured = true;
    seconds += value;
  }
  if (!measured) return null;

  return source.from === "input_media_minutes" ? seconds / 60 : seconds;
}

export type MeasuredQuantity = { ok: true; quantity: number } | { ok: false; reason: string };

/**
 * Izmerena količina za naplatu.
 *
 * Tekst server meri sam - ukucan je u `params` i tu je ceo. Trajanje okačenog
 * snimka meri `studioActions.measureInputUpload`, koja pročita zaglavlje fajla
 * i upiše sekunde uz sam upload; ovde stiže gotov broj. **Ono što je klijent
 * prijavio ne ulazi u ovu funkciju uopšte** - njegov broj služi samo da cena
 * na dugmetu stoji dok merenje ne stigne (nalaz R3).
 *
 * Granice iz veličine fajla su primenjene pre ovoga, u `boundedInputSeconds` -
 * ovde stiže već podignut broj, a fajl sa nemogućim zaglavljem uopšte ne stiže.
 *
 * Kapije, ovim redom:
 * 1. `MERENJE_NIJE_DOSTUPNO` - nema izmerenog trajanja: nijedan merni slot nije
 *    okačen, ili se nijednom zaglavlje ne može pročitati. Posao se ODBIJA umesto
 *    da se padne na pretpostavku. Kapija je zatečena iz W3 i ostaje kao mreža:
 *    ono što server nije izmerio, ne naplaćuje se.
 * 2. zaokružuje se NAVIŠE na celu jedinicu (zaokruživanje nikad u korist
 *    klijenta);
 * 3. seče se na `min`/`max` iz kataloga.
 */
export function resolveMeasuredQuantity(
  source: QuantitySource,
  params: Record<string, unknown>,
  measured: number | null,
): MeasuredQuantity {
  if (source.from === "text_length") {
    const value = params[source.measuredFrom ?? "text"];
    const length = typeof value === "string" ? value.length : 0;
    if (length <= 0) return { ok: false, reason: `NEDOSTAJE_KOLICINA:${source.param}` };

    return { ok: true, quantity: clampQuantity(length, source) };
  }

  if (measured === null || !Number.isFinite(measured) || measured <= 0) {
    return { ok: false, reason: "MERENJE_NIJE_DOSTUPNO" };
  }

  // Minuti se zaokružuju na desetinku (pravilo ih naplaćuje sa dve decimale
  // tarife), sekunde na celu sekundu - u oba slučaja naviše.
  const rounded =
    source.from === "input_media_minutes" ? Math.ceil(measured * 10) / 10 : Math.ceil(measured);

  return { ok: true, quantity: clampQuantity(rounded, source) };
}

function clampQuantity(value: number, source: QuantitySource): number {
  return Math.min(Math.max(value, source.min), source.max);
}
