/**
 * Ulazni režimi i slotovi za fajlove - ugovor za UI iz STUDIO-CATALOG-V4
 * sekcije 5, kao čista logika. `<DropSlot>`, `<DropSlotGrid>`,
 * `<FrameSlotPair>`, `<ReferenceSlots>` i `<ModeSwitcher>` crtaju ono što ove
 * funkcije kažu, pa se validacija, čišćenje pri promeni režima i poruka "šta
 * fali" tvrde testom bez renderovanja.
 *
 * Nijedna funkcija ne zna ime nijednog modela - sve dolazi iz `inputSpec`-a i
 * `inputModes`-a reda kataloga.
 */

import type { InputSpec, SlotSpec } from "@/convex/studioJobCore";
import type { PriceRule } from "@/convex/studioPricing";

import type { Locale } from "./i18n";

/**
 * Slotovi i njihov parser stoje u `convex/studioJobCore.ts` i uvoze se odande:
 * server proverava ISTI `inputSpec` po kojem forma crta slotove, a dva parsera
 * istog polja su dva ugovora koja se mogu razići.
 */
export type { SlotSpec, ModeSpec, InputSpec } from "@/convex/studioJobCore";

/** Fajl koji je već otišao u Convex storage i sad stoji u slotu. */
export type SlotFile = {
  storageId: string;
  name: string;
  mime: string;
  size: number;
  /** Potpisan URL za pregled sličice; `null` dok se ne dobije. */
  url?: string | null;
  /**
   * Trajanje u sekundama koje je SERVER pročitao iz zaglavlja fajla
   * (`studioActions.measureInputUpload`). Po njemu se naplaćuje, pa se po njemu
   * i prikazuje cena; polja nema dok merenje ne stigne, i dotle je dugme
   * zaključano na modelima koji se po trajanju naplaćuju.
   */
  measuredSeconds?: number;
  /**
   * Zašto merenje nije uspelo, kad nije (`ZAGLAVLJE_NIJE_PROCITANO`,
   * `VBR_NEPOUZDAN`, `NEPOZNAT_FORMAT`). Upload JESTE prošao, pa fajl stoji u
   * slotu - ali dugme na modelu koji se naplaćuje po dužini ostaje zaključano,
   * i korisnik mora da sazna zbog čega (`measureFailureMessage`).
   */
  measureFailure?: string;
};

/** Sadržaj svih slotova jednog režima: `{ image: [...], audio: [...] }`. */
export type SlotFiles = Record<string, SlotFile[]>;

/**
 * Gornja granica po vrsti fajla. Slika je ista kao avatar (5 MB je premalo za
 * referencu iz fotoaparata, pa je duplo), video prati Convex storage a ne
 * strpljenje mreže, zvuk je izmedju. Provera je PRE uploada - poruka o
 * prevelikom fajlu posle dva minuta čekanja je gora nego nikakva.
 */
export const MAX_SLOT_BYTES: Record<SlotKind, number> = {
  image: 10 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  file: 25 * 1024 * 1024,
};

export type SlotKind = "image" | "video" | "audio" | "file";

export { parseInputSpec, parseInputModes } from "@/convex/studioJobCore";

export function slotsForMode(spec: InputSpec, mode: string): Array<{ slot: string } & SlotSpec> {
  const modeSpec = Object.hasOwn(spec, mode) ? spec[mode] : undefined;
  if (!modeSpec) return [];

  return Object.entries(modeSpec).map(([slot, entry]) => ({ slot, ...entry }));
}

export function slotKind(accept: string[]): SlotKind {
  if (accept.some((mime) => mime.startsWith("image/"))) return "image";
  if (accept.some((mime) => mime.startsWith("video/"))) return "video";
  if (accept.some((mime) => mime.startsWith("audio/"))) return "audio";

  return "file";
}

/**
 * Režim koji ima tačno JEDAN slot je "jedan smislen drop cilj" iz AGENTS.md -
 * tada cela površina ekrana prima fajl. Režim sa dva slota (video + zvuk) ga
 * nema, jer se iz samog fajla ne vidi u koji slot ide.
 */
export function singleDropSlot(spec: InputSpec, mode: string): ({ slot: string } & SlotSpec) | null {
  const slots = slotsForMode(spec, mode);

  return slots.length === 1 ? slots[0] : null;
}

const MODE_LABELS: Record<string, { sr: string; en: string }> = {
  text: { sr: "Samo opis", en: "Prompt only" },
  image: { sr: "Iz slike", en: "From an image" },
  image_multi: { sr: "Iz više slika", en: "From several images" },
  first_last: { sr: "Prvi i poslednji kadar", en: "First and last frame" },
  reference: { sr: "Sa referencama", en: "With references" },
  video: { sr: "Iz videa", en: "From a video" },
  video_image: { sr: "Video i slika", en: "Video and image" },
  image_audio: { sr: "Slika i zvuk", en: "Image and audio" },
  video_audio: { sr: "Video i zvuk", en: "Video and audio" },
  audio: { sr: "Iz zvuka", en: "From audio" },
  layerize: { sr: "U slojeve", en: "Into layers" },
};

export function modeLabel(mode: string, locale: Locale): string {
  const label = Object.hasOwn(MODE_LABELS, mode) ? MODE_LABELS[mode] : undefined;

  return label ? label[locale] : mode;
}

const SLOT_LABELS: Record<string, { sr: string; en: string }> = {
  image: { sr: "Slika", en: "Image" },
  video: { sr: "Video", en: "Video" },
  audio: { sr: "Zvuk", en: "Audio" },
  person: { sr: "Osoba", en: "Person" },
  garment: { sr: "Odevni predmet", en: "Garment" },
};

export function slotLabel(slot: string, locale: Locale): string {
  const label = Object.hasOwn(SLOT_LABELS, slot) ? SLOT_LABELS[slot] : undefined;

  return label ? label[locale] : slot;
}

/** Imena dva kadra u `first_last` režimu (katalog sekcija 5). */
export const FRAME_LABELS = {
  first: { sr: "Početni kadar", en: "First frame" },
  last: { sr: "Završni kadar", en: "Last frame" },
} as const;

export function formatBytes(bytes: number, locale: Locale): string {
  const mb = bytes / (1024 * 1024);
  const text = mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1).replace(".", locale === "sr" ? "," : ".");

  return `${text} MB`;
}

/**
 * Validacija PRE uploada: pogrešan tip i prevelik fajl dobijaju svoju rečenicu
 * sa spiskom onoga što slot prima. `null` znači da fajl može da krene.
 */
export function validateSlotFile(
  file: { type: string; size: number },
  slot: SlotSpec,
  locale: Locale,
): string | null {
  const kind = slotKind(slot.accept);

  if (slot.accept.length > 0 && !slot.accept.includes(file.type)) {
    const extensions = slot.accept.map((mime) => mime.split("/")[1].toUpperCase()).join(", ");

    return locale === "sr"
      ? `Ovaj slot prima ${extensions}. Izaberi drugi fajl.`
      : `This slot accepts ${extensions}. Pick another file.`;
  }

  const limit = MAX_SLOT_BYTES[kind];
  if (file.size > limit) {
    return locale === "sr"
      ? `Fajl je veći od ${formatBytes(limit, locale)}. Smanji ga pa pokušaj ponovo.`
      : `The file is larger than ${formatBytes(limit, locale)}. Shrink it and try again.`;
  }

  if (file.size === 0) {
    return locale === "sr" ? "Fajl je prazan." : "The file is empty.";
  }

  return null;
}

export function canAcceptMore(files: SlotFile[] | undefined, slot: SlotSpec): boolean {
  return (files?.length ?? 0) < slot.max;
}

/**
 * Šta ostaje u slotovima posle promene režima. Slot koji novi režim ne
 * poznaje ispada, a slot koji prima manje fajlova se skraćuje - i jedno i
 * drugo se vraća u `removed`, da prekidač režima može tiho da potvrdi šta je
 * sklonio umesto da fajlovi nestanu bez reči (katalog sekcija 5).
 */
export function pruneFilesForMode(
  files: SlotFiles,
  spec: InputSpec,
  mode: string,
): { files: SlotFiles; removed: string[] } {
  const modeSpec = Object.hasOwn(spec, mode) ? spec[mode] : undefined;
  const kept: SlotFiles = {};
  const removed: string[] = [];

  for (const [slot, slotFiles] of Object.entries(files)) {
    if (slotFiles.length === 0) continue;
    const allowed = modeSpec && Object.hasOwn(modeSpec, slot) ? modeSpec[slot] : undefined;
    if (!allowed) {
      removed.push(slot);
      continue;
    }
    kept[slot] = slotFiles.slice(0, allowed.max);
    if (kept[slot].length < slotFiles.length) removed.push(slot);
  }

  return { files: kept, removed };
}

export type MissingInput =
  | { kind: "slot"; slot: string }
  | { kind: "frame"; frame: "first" | "last" }
  | { kind: "any" };

/**
 * Prvi i poslednji kadar (`first_last`). Par se drži imenovano, a ne kao niz
 * od dva elementa, jer prazan PRVI kadar uz popunjen poslednji u nizu ne može
 * da se razlikuje od popunjenog prvog - a poruka "Dodaj završni kadar" kad
 * fali početni je pogrešna poruka.
 */
export type FramePair = { first: SlotFile | null; last: SlotFile | null };

/** Redosled koji ide u `generationJobs.inputs`: prvo početni, pa završni kadar. */
export function framePairFiles(pair: FramePair): SlotFile[] {
  return [pair.first, pair.last].filter((file): file is SlotFile => file !== null);
}

/**
 * Prvi nepopunjen obavezan ulaz, ili `null` kad je sve na broju.
 *
 * Tri pravila, sva iz sekcije 5:
 * - `first_last` traži OBA kadra, i kaže koji fali;
 * - `reference` traži bar jednu referencu bilo koje vrste (model koji prima i
 *   slike i video ne sme da traži oboje);
 * - svaki drugi režim traži po jedan fajl u svakom svom slotu.
 *
 * `optional` je za slot koji parametar isključi - Kling lipsync sa izvorom
 * govora "tekst" ne traži zvuk. Odluka je pozivaočeva jer zavisi od vrednosti
 * kontrole, ali se prosledjuje kao spisak slotova, ne kao ime modela.
 */
export function missingInput(
  spec: InputSpec,
  mode: string,
  files: SlotFiles,
  optional: string[] = [],
  frames?: FramePair,
): MissingInput | null {
  const slots = slotsForMode(spec, mode).filter((entry) => !optional.includes(entry.slot));
  if (slots.length === 0) return null;

  if (mode === "first_last") {
    if (frames) {
      if (frames.first === null) return { kind: "frame", frame: "first" };
      if (frames.last === null) return { kind: "frame", frame: "last" };

      return null;
    }

    const uploaded = files.image ?? [];
    if (uploaded.length < 1) return { kind: "frame", frame: "first" };
    if (uploaded.length < 2) return { kind: "frame", frame: "last" };

    return null;
  }

  if (mode === "reference") {
    const total = slots.reduce((sum, entry) => sum + (files[entry.slot]?.length ?? 0), 0);

    return total > 0 ? null : { kind: "any" };
  }

  for (const entry of slots) {
    if ((files[entry.slot]?.length ?? 0) === 0) return { kind: "slot", slot: entry.slot };
  }

  return null;
}

/** Poruka na dugmetu: "Dodaj završni kadar", a ne "nedostaju ulazi". */
export function missingInputMessage(missing: MissingInput | null, locale: Locale): string | null {
  if (missing === null) return null;

  if (missing.kind === "frame") {
    const label = FRAME_LABELS[missing.frame][locale].toLowerCase();

    return locale === "sr" ? `Dodaj ${label}` : `Add the ${label}`;
  }

  if (missing.kind === "any") {
    return locale === "sr" ? "Dodaj bar jednu referencu" : "Add at least one reference";
  }

  const label = slotLabel(missing.slot, locale).toLowerCase();

  return locale === "sr" ? `Dodaj ${label}` : `Add the ${label}`;
}

/**
 * Količine koje cenovno pravilo naplaćuje preko besplatne kvote (`extras`):
 * šesta referentna slika kod MiniMax-a, druga ulazna slika kod Seedream-a.
 * Broje se okačene slike, jer su `extras` u katalogu uvek ulazne slike.
 *
 * Ovo je PRIKAZ cene pre klika; server istu količinu meri sam pre naplate.
 */
export function measuredExtraCounts(rule: PriceRule, files: SlotFiles): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!rule.extras) return counts;

  let images = 0;
  for (const slotFiles of Object.values(files)) {
    images += slotFiles.filter((file) => file.mime.startsWith("image/")).length;
  }

  for (const extra of rule.extras) counts[extra.param] = images;

  return counts;
}
