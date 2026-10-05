/**
 * Poništi / ponovi za editor (S28, K10). Čuva cele scene (mali JSON, slike su
 * samo id-jevi), najviše `HISTORY_LIMIT` koraka unazad.
 *
 * Kucanje u polju ili pomeranje klizača pravi mnogo sitnih izmena; one se
 * spajaju u jedan korak kad nose isti `key` i stignu u roku od
 * `COALESCE_MS` - tako „Poništi" vraća celu reč, ne slovo po slovo.
 */

export const HISTORY_LIMIT = 60;
export const COALESCE_MS = 1000;

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  /** Ključ i vreme poslednje izmene (za spajanje). */
  lastKey: string | null;
  lastAt: number;
};

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

/**
 * Nova vrednost. Ista vrednost (isti objekat) ne pravi korak. Izmena posle
 * „Poništi" briše „Ponovi" (grana se odbacuje, kao u svakom editoru).
 */
export function pushHistory<T>(history: History<T>, next: T, options: { key?: string; now?: number } = {}): History<T> {
  if (next === history.present) return history;
  const now = options.now ?? Date.now();
  const key = options.key ?? null;
  const coalesce = key !== null && key === history.lastKey && now - history.lastAt <= COALESCE_MS && history.future.length === 0;
  if (coalesce) return { ...history, present: next, lastAt: now };
  const past = [...history.past, history.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: key, lastAt: now };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastKey: null,
    lastAt: 0,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: rest,
    lastKey: null,
    lastAt: 0,
  };
}

export function canUndo(history: History<unknown>): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History<unknown>): boolean {
  return history.future.length > 0;
}
