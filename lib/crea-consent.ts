/**
 * Izgovoreni pristanak za kloniranje SOPSTVENOG glasa (Crea K22, A7; odluka O5).
 *
 * Server bira rečenicu sa dve nasumične reči (da se ne pusti tuđi stari snimak),
 * korisnik je izgovori, transkript snimka se poredi sa rečenicom. Prolazi samo
 * kad je izgovoreno bar 80 % reči rečenice, redom, i OBE nasumične reči.
 *
 * Čist modul - uvozi ga Convex (`creaVoices`), proveru radi server.
 */

export type ConsentLocale = "sr" | "en";

const CODE_WORDS: Record<ConsentLocale, readonly string[]> = {
  sr: ["jabuka", "reka", "lampa", "sunce", "most", "oblak", "knjiga", "more", "planina", "cvet", "prozor", "olovka", "kapa", "voz", "zvezda", "trava", "sat", "grad", "kafa", "mleko"],
  en: ["apple", "river", "lamp", "sun", "bridge", "cloud", "book", "sea", "mountain", "flower", "window", "pencil", "hat", "train", "star", "grass", "clock", "city", "coffee", "milk"],
};

export const CONSENT_PASS_SCORE = 0.8;

/** Koliko dugo važi provereni pristanak (ms) - posle toga se izgovara ponovo. */
export const CONSENT_VALID_MS = 30 * 60 * 1000;
/** Koliko dugo se čeka snimak za izdatu rečenicu (ms). */
export const CONSENT_WAIT_MS = 15 * 60 * 1000;

/** Dve različite reči iz spiska; `random` vraća [0, 1). */
export function pickConsentWords(locale: ConsentLocale, random: () => number): [string, string] {
  const words = CODE_WORDS[locale];
  const first = Math.min(words.length - 1, Math.floor(random() * words.length));
  let second = Math.min(words.length - 2, Math.floor(random() * (words.length - 1)));
  if (second >= first) second += 1;
  return [words[first]!, words[second]!];
}

export function consentPhrase(locale: ConsentLocale, words: readonly [string, string]): string {
  return locale === "sr"
    ? `Ja pristajem da Crea napravi kopiju mog glasa. Ovo je moj glas. Moje reči su ${words[0]} ${words[1]}.`
    : `I agree that Crea may make a copy of my voice. This is my own voice. My words are ${words[0]} ${words[1]}.`;
}

/** Dve nasumične reči sa kraja rečenice. */
export function consentCodeWords(phrase: string): [string, string] | null {
  const words = normalizeSpeech(phrase).split(" ");
  return words.length >= 2 ? [words[words.length - 2]!, words[words.length - 1]!] : null;
}

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "dj", е: "e", ж: "z", з: "z", и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m",
  н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ћ: "c", у: "u", ф: "f", х: "h", ц: "c", ч: "c", џ: "dz", ш: "s",
};

/** Mala slova, ćirilica → latinica, bez kvačica i interpunkcije. */
export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[Ѐ-ӿ]/g, (letter) => CYRILLIC[letter] ?? "")
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Najduži zajednički podniz reči (redosled se čuva, preskakanje je dozvoljeno). */
function commonWords(a: readonly string[], b: readonly string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (const wordA of a) {
    let previous = 0;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j]!;
      row[j] = wordA === b[j - 1] ? previous + 1 : Math.max(row[j]!, row[j - 1]!);
      previous = saved;
    }
  }
  return row[b.length]!;
}

export type ConsentCheck = { passed: boolean; score: number; codeWords: boolean };

export function checkConsentTranscript(transcript: string, phrase: string): ConsentCheck {
  const said = normalizeSpeech(transcript).split(" ").filter(Boolean);
  const expected = normalizeSpeech(phrase).split(" ").filter(Boolean);
  if (said.length === 0 || expected.length === 0) return { passed: false, score: 0, codeWords: false };
  const score = Math.round((commonWords(expected, said) / expected.length) * 100) / 100;
  const code = consentCodeWords(phrase);
  const codeWords = code !== null && code.every((word) => said.includes(word));
  return { passed: codeWords && score >= CONSENT_PASS_SCORE, score, codeWords };
}
