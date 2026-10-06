import { CREA_MINI_LESSONS, type CreaMiniLesson } from "./crea-mini-lessons";
import type { CreaArea } from "./crea-shell";
import type { CreaTool } from "./crea-tools";

/**
 * Mapa veština i postepeno otkrivanje (Crea K26, G7 + U10).
 *
 * Početnik u spiskovima alata vidi samo osnovni komplet (`CREA_STARTER_TOOLS`, 6 alata);
 * ostali se otključavaju mini-lekcijom ili testom - nikad naplatom - a iskusan korisnik
 * može da uključi „Otključaj sve". Gost, osoblje i korisnik koji je Creu koristio pre
 * ovog koraka vide sve, kao i do sada. Direktan link na alat (`?alat=`, recept,
 * inspiracija) uvek radi - zaključavanje skraćuje spiskove, ne zabranjuje alat.
 */

export const CREA_STARTER_TOOLS: readonly string[] = [
  "slika.pozadina",
  "slika.iseci",
  "slika.editor",
  "video.montaza",
  "zvuk.govor",
  "zvuk.snimac",
];

/** Poslovi stariji od ovoga znače da je korisnik Creu koristio pre postepenog otkrivanja. */
export const CREA_DISCLOSURE_SINCE = Date.UTC(2026, 9, 6);

export type CreaUnlockState =
  | { all: true }
  | { all: false; lessons: readonly string[] };

const LESSON_OF_TOOL = new Map<string, CreaMiniLesson>();
for (const lesson of CREA_MINI_LESSONS) for (const toolId of lesson.unlocks) LESSON_OF_TOOL.set(toolId, lesson);

/** Mini-lekcija koja otključava alat (`undefined` za osnovni komplet). */
export function lessonForTool(toolId: string): CreaMiniLesson | undefined {
  return LESSON_OF_TOOL.get(toolId);
}

export function isToolUnlocked(toolId: string, state: CreaUnlockState): boolean {
  if (state.all || CREA_STARTER_TOOLS.includes(toolId)) return true;
  const lesson = LESSON_OF_TOOL.get(toolId);
  return lesson !== undefined && state.lessons.includes(lesson.id);
}

/** Spisak alata za prikaz: otključani redom registra, plus koliko ih čeka i koja lekcija ih otvara. */
export function splitToolsByUnlock(tools: readonly CreaTool[], state: CreaUnlockState) {
  const visible = tools.filter((tool) => isToolUnlocked(tool.id, state));
  const locked = tools.filter((tool) => !isToolUnlocked(tool.id, state));
  const lessons: CreaMiniLesson[] = [];
  for (const tool of locked) {
    const lesson = LESSON_OF_TOOL.get(tool.id);
    if (lesson && !lessons.includes(lesson)) lessons.push(lesson);
  }
  return { visible, locked, lessons };
}

export type CreaSkillNode = {
  lesson: CreaMiniLesson;
  unlocked: boolean;
  /** Koliko alata ove veštine je korisnik već probao (sličice albuma). */
  tried: number;
  total: number;
};

/** Mapa veština jedne oblasti: osnovni komplet je koren, lekcije su grane. */
export function skillMap(
  area: CreaArea,
  state: CreaUnlockState,
  ownedStickers: ReadonlySet<string>,
): { starter: { tools: string[]; tried: number }; nodes: CreaSkillNode[] } {
  const starterTools = CREA_STARTER_TOOLS.filter((id) => id.startsWith(`${area}.`));
  const tried = (ids: readonly string[]) => ids.filter((id) => ownedStickers.has(`alat:${id}`)).length;
  return {
    starter: { tools: starterTools, tried: tried(starterTools) },
    nodes: CREA_MINI_LESSONS.filter((lesson) => lesson.area === area).map((lesson) => ({
      lesson,
      unlocked: state.all || state.lessons.includes(lesson.id),
      tried: tried(lesson.unlocks),
      total: lesson.unlocks.length,
    })),
  };
}
