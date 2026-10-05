"use client";

import { useCallback, useState } from "react";

import { canRedo, canUndo, createHistory, pushHistory, redo, undo, type History } from "@/lib/crea-editor-history";
import type { CreaScene } from "@/lib/crea-editor-scene";

type State = { history: History<CreaScene> | null; revision: number };

/**
 * Scena editora sa poništi/ponovi (S28, K10). `revision` raste sa svakom
 * promenom scene - alat ga koristi kao ključ ulaza, pa gotov izvoz nestane
 * čim se slika promeni (ne može se sačuvati nešto što više nije na platnu).
 */
export function useSceneHistory(initial: CreaScene | null = null) {
  const [state, setState] = useState<State>(() => ({ history: initial ? createHistory(initial) : null, revision: 0 }));

  /** Izmena trenutne scene; ista scena (bez promene) ne pravi korak. */
  const apply = useCallback((update: (scene: CreaScene) => CreaScene, key?: string) => {
    setState((current) => {
      if (!current.history) return current;
      const next = update(current.history.present);
      if (next === current.history.present) return current;
      return { history: pushHistory(current.history, next, { key }), revision: current.revision + 1 };
    });
  }, []);

  /** Nova scena od nule (nov početak, drugi šablon) - bez istorije. */
  const reset = useCallback((scene: CreaScene | null) => {
    setState((current) => ({ history: scene ? createHistory(scene) : null, revision: current.revision + 1 }));
  }, []);

  const doUndo = useCallback(() => {
    setState((current) =>
      current.history && canUndo(current.history) ? { history: undo(current.history), revision: current.revision + 1 } : current,
    );
  }, []);

  const doRedo = useCallback(() => {
    setState((current) =>
      current.history && canRedo(current.history) ? { history: redo(current.history), revision: current.revision + 1 } : current,
    );
  }, []);

  return {
    scene: state.history?.present ?? null,
    revision: state.revision,
    canUndo: state.history ? canUndo(state.history) : false,
    canRedo: state.history ? canRedo(state.history) : false,
    apply,
    reset,
    undo: doUndo,
    redo: doRedo,
  };
}

export type SceneHistory = ReturnType<typeof useSceneHistory>;
