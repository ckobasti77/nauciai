import type { IgraLik } from "./igra-art";
import type { LocalizedText } from "./i18n";

/**
 * Kurs kao „svet" (K09, plan K07 §2.1): koji lik ekipe stoji na kartici kursa i u kom je
 * stanju kartica. Čista logika, bez React-a; crtaju je kartice kursa u učionici.
 */

/**
 * Lik po temi kursa. Pravila se proveravaju REDOM i prvo koje pogodi pobeđuje, pa kurs
 * „Video i audio" ide Kadru, a ne Ehu. Bez pogotka kurs pripada Sovi (učenje).
 * Ključna reč mora da POČINJE reč: „reel" ne sme da pogodi „freelance", „bot" „robot",
 * a „glas" „oglas".
 */
const LIK_RULES: ReadonlyArray<readonly [IgraLik, readonly string[]]> = [
  ["kadar", ["video", "film", "montaz", "reel"]],
  ["eho", ["zvuk", "audio", "muzik", "music", "glas", "voice", "podcast", "podkast"]],
  ["piksi", ["slik", "image", "foto", "photo", "dizajn", "design"]],
  ["bajt", ["kod", "cod", "sajt", "web", "site", "program", "automat", "api", "bot"]],
];

/** Reči malim slovima, bez kvačica („montaža" → „montaza", „đ" → „dj"). */
function courseWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function likFor(text: string): IgraLik | null {
  const words = courseWords(text);
  for (const [lik, prefixes] of LIK_RULES) {
    if (words.some((word) => prefixes.some((prefix) => word.startsWith(prefix)))) return lik;
  }
  return null;
}

/**
 * Prvo odlučuju slug i naslov samog kursa; smer se pita tek kad oni ne kažu ništa. Inače
 * bi smer „video-audio" svaki svoj kurs dao Kadru, i onaj o glasu i onaj o slikama.
 */
export function courseLik(course: { slug: string; trackSlug?: string; title: LocalizedText }): IgraLik {
  return likFor(`${course.slug} ${course.title.sr} ${course.title.en}`) ?? likFor(course.trackSlug ?? "") ?? "sova";
}

/** Stanje kartice otključanog kursa: nije počet, u toku, završen (sa pečatom). */
export type CourseCardState = "new" | "progress" | "done";

/** „Završen" traži da kurs uopšte ima lekcije: prazan kurs nije završen, nego prazan. */
export function courseCardState({ completedLessons, totalLessons }: { completedLessons: number; totalLessons: number }): CourseCardState {
  if (totalLessons > 0 && completedLessons >= totalLessons) return "done";
  return completedLessons > 0 ? "progress" : "new";
}
