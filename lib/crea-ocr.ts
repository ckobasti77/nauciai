/**
 * Tekst sa slike (S32, K09): sređivanje onoga što vrati `tesseract.js` (srpski
 * `srp` i `srp_latn`) i prebacivanje pisma. Prepoznavanje radi
 * `components/crea/tools/ocr-tool.tsx`.
 *
 * Kad se istovremeno čitaju oba pisma, Tesseract ume da u latiničnu reč ubaci
 * ćirilično slovo istog oblika („Beоgrad" sa ćiriličnim „о"). Takva reč
 * izgleda dobro, ali je pretraga i spell-check ne nalaze - zato se slova istog
 * oblika vraćaju u pismo ostatka reči.
 */

export type OcrScript = "oba" | "latinica" | "cirilica";
export const OCR_SCRIPTS: readonly OcrScript[] = ["oba", "latinica", "cirilica"];

/** Jezici za Tesseract; prvi je jači kad se dvoumi. */
export function ocrLanguages(script: OcrScript): string[] {
  if (script === "latinica") return ["srp_latn"];
  if (script === "cirilica") return ["srp"];
  return ["srp_latn", "srp"];
}

const CYR_TO_LAT_LOOKALIKE: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", Ј: "J",
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", ј: "j", у: "y",
};
const LAT_TO_CYR_LOOKALIKE: Record<string, string> = Object.fromEntries(
  Object.entries(CYR_TO_LAT_LOOKALIKE).map(([cyr, lat]) => [lat, cyr]),
);

const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-zčćšžđČĆŠŽĐ]/;

/** Slova istog oblika u pismu većine slova te reči. */
export function fixLookalikes(text: string): string {
  return text.replace(/[\p{L}]+/gu, (word) => {
    let cyr = 0;
    let lat = 0;
    for (const char of word) {
      // Slova istog oblika ne odlučuju - broje se samo ona koja postoje u jednom pismu.
      if (CYRILLIC.test(char) && !(char in CYR_TO_LAT_LOOKALIKE)) cyr += 1;
      else if (LATIN.test(char) && !(char in LAT_TO_CYR_LOOKALIKE)) lat += 1;
    }
    if (cyr === lat) return word;
    const map = lat > cyr ? CYR_TO_LAT_LOOKALIKE : LAT_TO_CYR_LOOKALIKE;
    return [...word].map((char) => map[char] ?? char).join("");
  });
}

/**
 * Sredi sirov tekst: Windows/Mac kraj reda, razmaci na kraju reda, reč
 * prelomljena crticom na kraju reda („pro-\nčitaj" → „pročitaj"), najviše jedan
 * prazan red između pasusa.
 */
export function cleanOcrText(raw: string): string {
  return fixLookalikes(
    raw
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

export type ScriptStats = { latin: number; cyrillic: number; dominant: "latinica" | "cirilica" | "mesano" | "nema" };

export function scriptStats(text: string): ScriptStats {
  let latin = 0;
  let cyrillic = 0;
  for (const char of text) {
    if (CYRILLIC.test(char)) cyrillic += 1;
    else if (LATIN.test(char)) latin += 1;
  }
  const total = latin + cyrillic;
  const dominant =
    total === 0 ? "nema" : latin / total >= 0.8 ? "latinica" : cyrillic / total >= 0.8 ? "cirilica" : "mesano";
  return { latin, cyrillic, dominant };
}

const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z", и: "i", ј: "j", к: "k", л: "l", љ: "lj",
  м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č",
  џ: "dž", ш: "š",
};

/** Ćirilica → latinica. „Љ" na početku reči koja nije sva velikim slovima postaje „Lj", inače „LJ". */
export function toLatin(text: string): string {
  return text.replace(/[Ѐ-ӿ]/g, (char, offset: number, whole: string) => {
    const lower = char.toLowerCase();
    const mapped = CYR_TO_LAT[lower];
    if (!mapped) return char;
    if (char === lower) return mapped;
    if (mapped.length === 1) return mapped.toUpperCase();
    // Dvoslovno veliko slovo: susedno veliko slovo znači da je cela reč velikim slovima.
    const next = whole[offset + 1] ?? "";
    const prev = whole[offset - 1] ?? "";
    const shouting = (next !== next.toLowerCase() && next !== "") || (prev !== prev.toLowerCase() && prev !== "");
    return shouting ? mapped.toUpperCase() : mapped[0].toUpperCase() + mapped.slice(1);
  });
}

const LAT_TO_CYR: Record<string, string> = Object.fromEntries(
  Object.entries(CYR_TO_LAT).map(([cyr, lat]) => [lat, cyr]),
);

/**
 * Latinica → ćirilica. „lj", „nj" i „dž" se čitaju kao jedno slovo. Poznata
 * granica: retke reči gde su to dva slova („injekcija", „nadživeti") treba
 * ručno ispraviti - zato UI ostavlja tekst da se menja.
 */
export function toCyrillic(text: string): string {
  return text.replace(/(dž|lj|nj|[a-zčćšžđ])/gi, (match: string) => {
    const lower = match.toLowerCase();
    const mapped = LAT_TO_CYR[lower];
    if (!mapped) return match;
    return match[0] === match[0].toLowerCase() ? mapped : mapped.toUpperCase();
  });
}

/** Ispod ovoga (0-100) tekst je verovatno pogrešno pročitan - savet za bolju fotku. */
export const OCR_LOW_CONFIDENCE = 60;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}
