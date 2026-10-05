import { toolOfJob } from "./crea-tools";

/**
 * Pretraga radova na srpskom (K16, S43): tekst po kojem Convex search indeks
 * (`generationJobs.search_searchText`) nalazi rad, i isti oblik upita.
 *
 * Oba kraja prolaze kroz ISTU normalizaciju, pa se nalazi:
 * - bez obzira na pismo: „мачка" = „mačka" = „macka";
 * - bez obzira na kvačice: „šarena" = „sarena";
 * - bez obzira na padež: „mačka", „mačke", „mački", „mačkama" → koren „mack".
 *
 * Koren je grub (skidanje najčešćih nastavaka), ali dovoljan za opis od
 * nekoliko rečenica: indeks čuva i celu reč i koren, a upit traži koren. Convex
 * vraća rad koji sadrži BILO KOJU reč upita, rangirano po tome koliko ih sadrži,
 * a poslednju reč upita traži i kao početak reči (kucanje u toku).
 *
 * Čista funkcija bez browser API-ja - uvoze je i Convex (`studio.ts`,
 * `creaLocal.ts`, `creaLayers.ts`, migracija) i UI.
 */

/** Najviše reči u upitu (Convex prima do 16 pojmova). */
export const SEARCH_QUERY_MAX_TERMS = 16;
/** Najduži tekst indeksa po radu (znakova) - opis od par pasusa staje ceo. */
export const SEARCH_TEXT_MAX = 4000;

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "dj", е: "e", ж: "z", з: "z", и: "i", ј: "j",
  к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t",
  ћ: "c", у: "u", ф: "f", х: "h", ц: "c", ч: "c", џ: "dz", ш: "s",
};

/** Mala slova, latinica bez kvačica, samo slova i cifre razdvojeni jednim razmakom. */
export function normalizeSearchText(text: string): string {
  const lower = text.toLowerCase();
  let latin = "";
  for (const char of lower) latin += CYRILLIC[char] ?? (char === "đ" ? "dj" : char);
  return latin
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Nastavci koji se skidaju, od najdužeg; koren ostaje bar 3 slova. */
const SUFFIXES = ["ovima", "evima", "ama", "ima", "ova", "eva", "ovi", "evi", "om", "em", "og", "oj", "ih", "im", "u", "a", "e", "i", "o"];

/** Grub koren srpske reči (`mačkama` → `mack`); kratke reči i brojevi ostaju isti. */
export function searchStem(word: string): string {
  if (word.length < 4 || /\d/.test(word)) return word;
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length);
  }
  return word;
}

function words(text: string): string[] {
  const normalized = normalizeSearchText(text);
  return normalized ? normalized.split(" ") : [];
}

/** Tekst za indeks: svaka reč i njen koren (bez ponavljanja), najviše `SEARCH_TEXT_MAX` znakova. */
export function searchIndexText(parts: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  let length = 0;
  for (const word of parts.flatMap(words)) {
    for (const term of [word, searchStem(word)]) {
      if (seen.has(term)) continue;
      if (length + term.length + 1 > SEARCH_TEXT_MAX) return out.join(" ");
      seen.add(term);
      out.push(term);
      length += term.length + 1;
    }
  }
  return out.join(" ");
}

/**
 * Upit za `q.search(...)`: koreni reči, bez ponavljanja; prazan string = nema šta da se
 * traži. Reči kraće od 3 slova („na", „u", „i", „sa") se izostave kad upit ima i duže -
 * Convex vraća rad sa BILO KOJOM reči, pa bi „na" vratilo skoro sve.
 */
export function searchQueryText(query: string): string {
  const all = words(query);
  const meaningful = all.filter((word) => word.length >= 3);
  const terms: string[] = [];
  for (const word of meaningful.length > 0 ? meaningful : all) {
    const stem = searchStem(word);
    if (!terms.includes(stem)) terms.push(stem);
    if (terms.length === SEARCH_QUERY_MAX_TERMS) break;
  }
  return terms.join(" ");
}

/** Opis iz parametara posla (`prompt`, a kod govora `text`). */
function promptsOf(params: string): string[] {
  try {
    const parsed: unknown = JSON.parse(params);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const record = parsed as Record<string, unknown>;
    return [record.prompt, record.text].filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

const KIND_WORDS: Record<"image" | "video" | "audio", string> = {
  image: "slika image",
  video: "video",
  audio: "zvuk audio",
};

/**
 * Šta se indeksira za jedan rad: opis, model (slug u rečima, npr. „nano banana 2"),
 * vrsta i - za rad besplatnog alata (K04) - ime alata na oba jezika, jer taj rad
 * nema opis.
 */
export function searchTextForJob(job: { params: string; modelSlug: string; kind: "image" | "video" | "audio" }): string {
  const tool = toolOfJob(job);
  return searchIndexText([
    ...promptsOf(job.params),
    ...(tool ? [tool.title.sr, tool.title.en] : [job.modelSlug.replace(/^local:/, "")]),
    KIND_WORDS[job.kind],
  ]);
}
