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
 * Konzervativan MINIMALNI bitrate po vrsti fajla, u bitovima u sekundi. Iz
 * njega izlazi najduže trajanje koje u dati broj bajtova uopšte može da stane:
 * `sekunde = bajtovi × 8 / bitrate`.
 *
 * Brojevi su namerno niski - niži nego što iko stvarno kodira - jer greška na
 * ovu stranu samo propusti previsoku prijavu, a greška na drugu odbija pošten
 * posao. 32 kbps je donji kraj govornog MP3/Opus-a (ispod toga se govor više ne
 * razume), 200 kbps donji kraj 480p H.264. WAV, ProRes i svaki bogatiji format
 * daju KRAĆE trajanje po bajtu, pa granicu samo produbljuju.
 */
const MIN_BITRATE_BPS: Record<string, number> = {
  [AUDIO_SLOT]: 32_000,
  [VIDEO_SLOT]: 200_000,
};

/**
 * Gornja granica prijavljene količine, izvedena iz VELIČINE fajla koju server
 * stvarno vidi (`_storage.size`). Nije merenje - fajl od 2 MB i dalje može biti
 * bilo šta ispod ~8 minuta zvuka - ali je jedina serverska činjenica o trajanju
 * koja danas postoji, i obara prijavu koja je fizički nemoguća.
 *
 * `null` znači "nema se šta izmeriti": nijedan merni slot nije okačen, ili
 * pozivalac nije uspeo da pročita metapodatke ijednog fajla. Tada
 * `resolveMeasuredQuantity` odbija posao umesto da veruje klijentu.
 */
export function maxQuantityFromBytes(
  source: QuantitySource,
  bytesBySlot: Record<string, number> | null,
): number | null {
  if (bytesBySlot === null) return null;

  let seconds = 0;
  let measured = false;
  for (const slot of measuredSlotsFor(source)) {
    const bytes = bytesBySlot[slot];
    if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) continue;
    measured = true;
    seconds += (bytes * 8) / MIN_BITRATE_BPS[slot];
  }
  if (!measured) return null;

  return source.from === "input_media_minutes" ? seconds / 60 : seconds;
}

export type MeasuredQuantity = { ok: true; quantity: number } | { ok: false; reason: string };

/**
 * Izmerena količina za naplatu.
 *
 * Tekst server meri sam - ukucan je u `params` i tu je ceo. Dužinu okačenog
 * fajla ne može: Convex storage zna veličinu u bajtovima, ne trajanje, a
 * dekodiranje medija u mutaciji ne postoji. Zato je `reported` (klijent je
 * pročitao `duration` iz `<video>`/`<audio>` metapodataka) jedini izvor
 * trajanja - i baš zato ne sme da bude i jedina reč o tome koliko se naplaćuje.
 *
 * Kapije, ovim redom:
 * 1. `MERENJE_NIJE_DOSTUPNO` - `maxFromFile` je `null`, dakle nijedan merni
 *    slot nije okačen ili se metapodaci ne mogu pročitati. Bez ijednog bajta
 *    koji je server video nema se šta proveriti, pa se posao ODBIJA umesto da
 *    tiho prođe. Kapija ostaje i kad merenje postane tačno, kao mreža: ono što
 *    server nije video, ne naplaćuje se.
 * 2. mora biti pozitivan broj;
 * 3. zaokružuje se NAVIŠE na celu jedinicu (zaokruživanje nikad u korist
 *    klijenta);
 * 4. `KOLICINA_VECA_OD_FAJLA` - prijava veća od onoga što u toliko bajtova može
 *    da stane (`maxQuantityFromBytes`). Proverava se PRE sečenja na `max`, jer
 *    bi `clamp` inače sakrio nemoguću prijavu iza kataloškog plafona;
 * 5. seče se na `min`/`max` iz kataloga.
 *
 * Ono što ovo NE hvata je prijava MANJA od stvarnog fajla - granica po veličini
 * je jednostrana. Zato sedam modela koji se po ovoj količini naplaćuju stoje
 * ugašeni dok se trajanje ne bude merilo tačno.
 */
export function resolveMeasuredQuantity(
  source: QuantitySource,
  params: Record<string, unknown>,
  reported: number | undefined,
  maxFromFile: number | null,
): MeasuredQuantity {
  if (source.from === "text_length") {
    const value = params[source.measuredFrom ?? "text"];
    const length = typeof value === "string" ? value.length : 0;
    if (length <= 0) return { ok: false, reason: `NEDOSTAJE_KOLICINA:${source.param}` };

    return { ok: true, quantity: clampQuantity(length, source) };
  }

  if (maxFromFile === null) return { ok: false, reason: "MERENJE_NIJE_DOSTUPNO" };

  if (reported === undefined || !Number.isFinite(reported) || reported <= 0) {
    return { ok: false, reason: `NEDOSTAJE_KOLICINA:${source.param}` };
  }

  // Minuti se zaokružuju na desetinku (pravilo ih naplaćuje sa dve decimale
  // tarife), sekunde na celu sekundu - u oba slučaja naviše.
  const rounded =
    source.from === "input_media_minutes" ? Math.ceil(reported * 10) / 10 : Math.ceil(reported);
  if (rounded > maxFromFile) return { ok: false, reason: `KOLICINA_VECA_OD_FAJLA:${source.param}` };

  return { ok: true, quantity: clampQuantity(rounded, source) };
}

function clampQuantity(value: number, source: QuantitySource): number {
  return Math.min(Math.max(value, source.min), source.max);
}
