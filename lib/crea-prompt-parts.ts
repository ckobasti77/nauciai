import type { PromptPartKind } from "@/convex/creaLlmCore";
import { normalizeSearchText } from "@/lib/crea-search-text";

/**
 * „Kako je ovo napravljeno?" (K16, S45): opis rada podeljen na delove i obojen
 * istim bojama kao Pomoćnik za opis (K13) - Ko · Šta · Stil · Svetlo · Kamera.
 * Postojeći opisi nisu pisani po delovima, pa se deli po zarezima i rečenicama,
 * a vrsta dela se pogađa po rečima (srpski i engleski). Prvi deo bez druge vrste
 * je „ko" (glavni predmet), ostali „šta". Heuristika: pogrešna boja ne kvari
 * ništa, opis ostaje doslovno isti.
 */

export type PromptSegment = { kind: PromptPartKind; text: string };

/**
 * Ključne reči po vrsti (porede se normalizovane, `normalizeSearchText`): cela reč
 * ili fraza, a sa `*` na kraju početak reči (srpski koren: `svetl*` = svetlo, svetlost…).
 */
const KEYWORDS: Array<[PromptPartKind, readonly string[]]> = [
  [
    "kamera",
    [
      "shot", "close up", "closeup", "wide angle", "angle", "lens", "aperture", "bokeh", "depth of field", "aerial", "drone",
      "macro", "telephoto", "eye level", "framing", "camera", "kadar", "objektiv*", "ugao", "uglom", "krupni plan",
      "iz ptic*", "kamer*", "blend*",
    ],
  ],
  [
    "svetlo",
    [
      "light", "lights", "lighting", "lit", "sunset", "sunrise", "golden hour", "backlit", "glow", "glowing", "shadows",
      "neon", "moody", "svetl*", "zalaz*", "izlaz* sunca", "senk*", "osvetlj*", "sjaj*",
    ],
  ],
  [
    "stil",
    [
      "style", "styled", "photo", "photograph", "photography", "illustration", "painting", "watercolor", "watercolour",
      "oil", "render", "3d", "anime", "cartoon", "pixel art", "sketch", "cinematic", "realistic", "photorealistic",
      "vintage", "film", "kodak", "minimalist", "drawing", "comic", "stil*", "fotograf*", "ilustrac*", "akvarel*",
      "crtez*", "crtan*", "realistic*", "slikars*", "strip*", "uljan*",
    ],
  ],
];

function matches(text: string, keyword: string): boolean {
  const prefix = keyword.endsWith("*");
  const word = normalizeSearchText(prefix ? keyword.slice(0, -1) : keyword);
  return text.includes(prefix ? ` ${word}` : ` ${word} `);
}

function kindOf(segment: string): PromptPartKind | null {
  const text = ` ${normalizeSearchText(segment)} `;
  // „50mm", „85 mm", „f/1.8" - podatak o objektivu.
  if (/\d\s*mm\b|\bf\/\d/i.test(segment)) return "kamera";
  for (const [kind, words] of KEYWORDS) {
    if (words.some((word) => matches(text, word))) return kind;
  }
  return null;
}

/** Delovi opisa redom; spojeni nazad (sa istim razdvajačima) daju isti tekst. */
export function promptSegments(prompt: string): PromptSegment[] {
  const pieces = prompt.match(/[^,.;!?\n]+[,.;!?\n]*/g) ?? [];
  const segments: PromptSegment[] = [];
  let sawSubject = false;
  for (const piece of pieces) {
    if (!piece.trim()) {
      if (segments.length > 0) segments[segments.length - 1].text += piece;
      continue;
    }
    const guessed = kindOf(piece);
    const kind = guessed ?? (sawSubject ? "sta" : "ko");
    if (kind === "ko") sawSubject = true;
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) last.text += piece;
    else segments.push({ kind, text: piece });
  }
  return segments;
}
