import { toLatin } from "../lib/crea-ocr";
import type { InputSpec } from "./studioJobCore";

/**
 * Likovi i elementi Cree (K14, S34-S36, S24; plan K01 §7.1) - čista logika koju
 * dele server (`convex/creaElements.ts`) i UI (composer, ekran „Likovi", alati).
 *
 * - ime → `@pominjanje` (latinica, bez kvačica, jedinstveno po korisniku);
 * - pronalaženje `@pominjanja` u opisu i dopunjavanje dok korisnik kuca;
 * - mapiranje elementa u ulaze modela: koje slike idu u slot sa referencama
 *   (`image_multi` za sliku, `reference` za video) i rečenica koja modelu kaže
 *   koja slika je ko;
 * - opis za „Zameni lik" i ko sme da se menja (samo tvoj Lik sa pristankom, O5).
 */

export const ELEMENT_KINDS = ["lik", "mesto", "predmet"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** Odakle su slike: tvoje fotke ili list lika iz kreatora (S36, izmišljen lik). */
export type ElementOrigin = "foto" | "kreator";

export const ELEMENTS_MAX = 30;
export const ELEMENT_IMAGES_MAX = 8;
export const ELEMENT_NAME_MAX = 40;
export const ELEMENT_DESCRIPTION_MAX = 500;
export const ELEMENT_HANDLE_MAX = 24;
/**
 * Najviše slika jednog elementa u jednom poslu. Neki modeli naplaćuju svaku
 * ulaznu sliku (GPT Image 2, FLUX.2 klein, MiniMax H3 posle pete), a tri
 * ugla istog lika već drže lice - više ne pomaže toliko koliko košta.
 */
export const ELEMENT_REFS_PER_ELEMENT = 3;

/** Slika elementa onako kako je vidi composer (veličina i tip iz `_storage`). */
export type ElementImage = { storageId: string; mime: string; size: number; url?: string | null };

export type ElementLike = {
  kind: ElementKind;
  name: string;
  handle: string;
  description?: string | null;
  images: readonly ElementImage[];
};

// ── Ime i @pominjanje ───────────────────────────────────────────────────────

/** Ime kako se čuva: bez praznina na krajevima i duplih razmaka; `null` = neispravno. */
export function cleanElementName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > ELEMENT_NAME_MAX) return null;
  return name;
}

/** Opis (`""` = bez opisa); `null` = predugačak. */
export function cleanElementDescription(raw: string | undefined): string | null {
  const text = (raw ?? "").trim().replace(/[ \t]+/g, " ");
  return text.length > ELEMENT_DESCRIPTION_MAX ? null : text;
}

const FALLBACK_HANDLE: Record<ElementKind, string> = { lik: "lik", mesto: "mesto", predmet: "predmet" };

/**
 * Ime → osnova pominjanja: ćirilica u latinicu, bez kvačica (đ → dj), mala
 * slova, reči spojene donjom crtom. „Đorđe Mišić" → `djordje_misic`,
 * „Кафана код Мике" → `kafana_kod_mike`.
 */
export function handleBase(name: string, kind: ElementKind = "lik"): string {
  const latin = toLatin(name).replace(/đ/g, "dj").replace(/Đ/g, "Dj");
  const plain = latin
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, ELEMENT_HANDLE_MAX)
    .replace(/_+$/, "");
  return plain || FALLBACK_HANDLE[kind];
}

/** Prvo slobodno pominjanje: `maja`, pa `maja2`, `maja3`… (uvek ≤ `ELEMENT_HANDLE_MAX`). */
export function uniqueHandle(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const tail = String(suffix);
    const candidate = `${base.slice(0, ELEMENT_HANDLE_MAX - tail.length).replace(/_+$/, "")}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * `@` na početku ili posle razmaka/interpunkcije (ne u sred reči - „ana@mail.rs"
 * nije pominjanje), pa slova, cifre i donja crta. Ono što je otkucano se svodi na
 * oblik pominjanja (`@Đorđe` = `@djordje`).
 */
const MENTION_PATTERN = /(^|[^\p{L}\p{N}_@.])@([\p{L}\p{N}_]{1,40})/gu;

export type FoundMention<E> = { start: number; end: number; element: E };

/** Pominjanja POSTOJEĆIH elemenata u tekstu, redom; nepoznato `@nešto` ostaje običan tekst. */
export function findMentions<E extends { handle: string }>(text: string, elements: readonly E[]): FoundMention<E>[] {
  if (elements.length === 0 || !text.includes("@")) return [];
  const byHandle = new Map(elements.map((element) => [element.handle, element]));
  const found: FoundMention<E>[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const token = match[2];
    const element = byHandle.get(handleBase(token));
    if (!element) continue;
    const start = (match.index ?? 0) + match[1].length;
    found.push({ start, end: start + 1 + token.length, element });
  }
  return found;
}

/** Svaki pomenut element jednom, redom prvog pominjanja. */
export function mentionedElements<E extends { handle: string }>(text: string, elements: readonly E[]): E[] {
  const seen = new Set<string>();
  const result: E[] = [];
  for (const { element } of findMentions(text, elements)) {
    if (seen.has(element.handle)) continue;
    seen.add(element.handle);
    result.push(element);
  }
  return result;
}

/**
 * Dopunjavanje dok se kuca: ako je kursor odmah iza `@reč`, vraća šta je
 * otkucano posle `@` (može i prazno - tek je pritisnut `@`) i gde `@` počinje.
 */
export function mentionAtCaret(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const match = /(^|[^\p{L}\p{N}_@.])@([\p{L}\p{N}_]{0,40})$/u.exec(before);
  if (!match) return null;
  return { query: match[2], start: before.length - match[2].length - 1 };
}

/** Predlozi za otkucano: pominjanje ili ime počinje tim, pa ga sadrži; najviše `limit`. */
export function suggestElements<E extends { handle: string; name: string }>(
  elements: readonly E[],
  query: string,
  limit = 6,
): E[] {
  const wanted = query ? handleBase(query) : "";
  if (!wanted) return elements.slice(0, limit);
  const nameKey = (element: E) => handleBase(element.name);
  const starts = elements.filter((element) => element.handle.startsWith(wanted) || nameKey(element).startsWith(wanted));
  const contains = elements.filter(
    (element) => !starts.includes(element) && (element.handle.includes(wanted) || nameKey(element).includes(wanted)),
  );
  return [...starts, ...contains].slice(0, limit);
}

/** Upis izabranog pominjanja na mesto otkucanog `@…`, sa razmakom iza; vraća i novi položaj kursora. */
export function insertMention(text: string, start: number, caret: number, handle: string): { text: string; caret: number } {
  const after = text.slice(caret).replace(/^[\p{L}\p{N}_]*/u, "");
  const glue = after.startsWith(" ") ? "" : " ";
  const inserted = `@${handle}${glue}`;
  return { text: `${text.slice(0, start)}${inserted}${after}`, caret: start + inserted.length };
}

/** Briše sva pominjanja jednog elementa (čip „×"), bez duplih razmaka. */
export function removeMention<E extends { handle: string }>(text: string, element: E, elements: readonly E[]): string {
  const spans = findMentions(text, elements).filter((mention) => mention.element.handle === element.handle);
  let result = text;
  for (const span of [...spans].reverse()) {
    result = `${result.slice(0, span.start)}${result.slice(span.end)}`;
  }
  return result.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1").trim();
}

// ── Mapiranje u ulaze modela (S34, V6) ───────────────────────────────────────

/** Ulazni režimi sa referencama: slika - `image_multi`, video - `reference`. */
export const REFERENCE_INPUT_MODES = ["image_multi", "reference"] as const;

export type ReferenceModelLike = { inputModes: readonly string[]; inputSpec: InputSpec };

/** Režim modela u koji elementi idu kao slike, i koliko slika slot prima. */
export function referenceModeOf(model: ReferenceModelLike): { inputMode: string; max: number } | null {
  for (const inputMode of REFERENCE_INPUT_MODES) {
    if (!model.inputModes.includes(inputMode)) continue;
    const slot = model.inputSpec[inputMode]?.image;
    if (slot && slot.max > 0) return { inputMode, max: slot.max };
  }
  return null;
}

export type ElementRef<E> = { element: E; images: ElementImage[]; positions: number[] };

export type ElementMappingProblem = "BEZ_REFERENCI" | "DRUGI_REZIM" | "PREVISE_ELEMENATA";

export type ElementMapping<E> =
  | { ok: true; inputMode: string; slot: "image"; images: ElementImage[]; refs: ElementRef<E>[] }
  | { ok: false; reason: ElementMappingProblem; max: number };

/**
 * Koje slike elemenata idu modelu i gde. Postojeće slike u slotu (npr. fotka
 * koja se menja) ostaju prve; svaki element dobija bar jednu sliku (naslovnu),
 * pa se preostala mesta dele redom (najviše `ELEMENT_REFS_PER_ELEMENT` po
 * elementu). Slike jednog elementa stoje jedna do druge, pa rečenica za model
 * može da kaže „slike 2-3 su Maja".
 *
 * Elementi idu samo u režim sa referencama; iz „samo opis" (`text`) se prelazi
 * u njega, a režim sa kadrovima (početni/završni kadar, maska, video) se ne dira.
 */
export function elementInputs<E extends ElementLike>(
  elements: readonly E[],
  model: ReferenceModelLike,
  opts: { currentMode: string; existingImages: number },
): ElementMapping<E> {
  const reference = referenceModeOf(model);
  if (!reference) return { ok: false, reason: "BEZ_REFERENCI", max: 0 };
  if (opts.currentMode !== "text" && opts.currentMode !== reference.inputMode) {
    return { ok: false, reason: "DRUGI_REZIM", max: 0 };
  }
  const capacity = reference.max - opts.existingImages;
  const usable = elements.filter((element) => element.images.length > 0);
  if (usable.length > capacity) return { ok: false, reason: "PREVISE_ELEMENATA", max: Math.max(0, capacity) };

  const counts = usable.map(() => 0);
  let left = capacity;
  for (let round = 0; round < ELEMENT_REFS_PER_ELEMENT && left > 0; round += 1) {
    usable.forEach((element, index) => {
      if (left > 0 && element.images.length > round) {
        counts[index] += 1;
        left -= 1;
      }
    });
  }

  let position = opts.existingImages;
  const refs = usable.map((element, index) => {
    const images = element.images.slice(0, counts[index]);
    const positions = images.map(() => (position += 1));
    return { element, images, positions };
  });
  return { ok: true, inputMode: reference.inputMode, slot: "image", images: refs.flatMap((ref) => ref.images), refs };
}

function imageRange(positions: readonly number[]): string {
  if (positions.length === 1) return `image ${positions[0]}`;
  return `images ${positions[0]}-${positions[positions.length - 1]}`;
}

const KIND_GUIDE: Record<ElementKind, { noun: string; keep: string }> = {
  lik: { noun: "character", keep: "keep the same face, hairstyle, body and outfit" },
  mesto: { noun: "place", keep: "use this place as the setting" },
  predmet: { noun: "object", keep: "show this exact object with the same shape, colours and details" },
};

/**
 * Opis koji ide modelu: `@maja` postaje „Maja", a na kraj ide rečenica koja
 * kaže koja slika je ko. Uputstvo je na engleskom (kao dodaci stila, K13) -
 * razume ga svaki model u katalogu; korisnik ga vidi pre slanja.
 */
export function promptWithElements<E extends ElementLike>(
  prompt: string,
  allElements: readonly E[],
  refs: readonly ElementRef<E>[],
): string {
  let text = prompt;
  for (const mention of [...findMentions(prompt, allElements)].reverse()) {
    text = `${text.slice(0, mention.start)}${mention.element.name}${text.slice(mention.end)}`;
  }
  if (refs.length === 0) return text.trim();
  const lines = refs.map((ref) => {
    const guide = KIND_GUIDE[ref.element.kind];
    const note = ref.element.description?.trim() ? ` (${ref.element.description.trim()})` : "";
    const verb = ref.positions.length === 1 ? "shows" : "show";
    return `${imageRange(ref.positions)} ${verb} ${ref.element.name}, the ${guide.noun}${note}: ${guide.keep}.`;
  });
  const sentence = lines.map((line) => line.charAt(0).toUpperCase() + line.slice(1)).join(" ");
  return `${text.trim()}\n\nReference images: ${sentence}`;
}

// ── Zameni lik (S24, O5) ─────────────────────────────────────────────────────

/** Modeli koji menjaju lik (više slika u `image_multi`); isti spisak nudi alat. */
export const SWAP_MODEL_SLUGS = ["nano-banana-pro", "nano-banana-2"] as const;

/** Samo tvoj Lik, i to sa datim pristankom (O5). Vlasništvo proverava server. */
export function canSwapWith(element: { kind: ElementKind; consentAt?: number | null }): boolean {
  return element.kind === "lik" && typeof element.consentAt === "number";
}

/** Koliko slika lika ide uz fotku koja se menja (fotka zauzima prvo mesto). */
export function swapRefCount(imageCount: number, slotMax: number): number {
  return Math.max(0, Math.min(imageCount, ELEMENT_REFS_PER_ELEMENT, slotMax - 1));
}

/** Opis zamene: slika 1 je fotka, ostale su lik; sve osim lica i kose ostaje isto. */
export function swapPrompt(element: { name: string; description?: string | null }, refCount: number): string {
  const refs = refCount <= 1 ? "Image 2 shows" : `Images 2-${refCount + 1} show`;
  const note = element.description?.trim() ? ` (${element.description.trim()})` : "";
  return [
    `Image 1 is the photo to change. ${refs} ${element.name}${note}.`,
    `Replace the face and hair of the main person in image 1 with ${element.name}'s face and hair, so the person clearly becomes ${element.name}.`,
    "Keep everything else from image 1 exactly the same: pose, body, clothes, hands, background, lighting, colours and framing.",
    "Match the skin tone and light naturally. Photorealistic, no text.",
  ].join(" ");
}

// ── Kreator lika (S36) ───────────────────────────────────────────────────────

/**
 * Prvi deo opisa lista lika (`lib/crea-character.ts`). Po njemu server zna da je
 * rad nastao u kreatoru, pa ga „Sačuvaj kao Lik" prima kao izmišljen lik
 * (`origin: "kreator"`) bez provere fotke.
 */
export const CHARACTER_SHEET_MARKER = "Character turnaround sheet";

export function isCharacterSheetPrompt(prompt: string): boolean {
  return prompt.trimStart().startsWith(CHARACTER_SHEET_MARKER);
}

// ── Provera fotke (S35) ──────────────────────────────────────────────────────

export type ElementPhotoCheck = { faces: number; faceRatio: number; sharpness: number; ok: boolean };

/** Sažetak provere koji je poslao uređaj - samo brojevi u razumnim granicama. */
export function isValidPhotoCheck(check: ElementPhotoCheck): boolean {
  return (
    Number.isInteger(check.faces) &&
    check.faces >= 0 &&
    check.faces <= 100 &&
    Number.isFinite(check.faceRatio) &&
    check.faceRatio >= 0 &&
    check.faceRatio <= 1 &&
    Number.isFinite(check.sharpness) &&
    check.sharpness >= 0
  );
}

/**
 * Lik od tvojih fotki se čuva tek kad je provera prošla: tačno jedno lice na
 * svakoj fotki i nijedna nije pala. Provera radi na uređaju (MediaPipe), pa je
 * ovo granica za pošten klijent, ne dokaz - vidi ODLUKE K14.
 */
export function photoCheckAllowsLik(check: ElementPhotoCheck | undefined): boolean {
  return check !== undefined && isValidPhotoCheck(check) && check.ok && check.faces === 1;
}
