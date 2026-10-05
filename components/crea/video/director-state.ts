import type { CameraMove, CameraMoveIntensity } from "@/lib/crea-camera-moves";
import { deskIsEmpty, type DirectorDesk } from "@/lib/crea-director";
import type { VideoEffect } from "@/lib/crea-video-effects";

/**
 * Režija videa u composeru (Crea K18, V6-V9): izabran pokret kamere, efekat (jedan
 * ili već spojena dva) i pult. Zaseban mali modul, kao `look-state.ts` (K13):
 * spiskovi pokreta i efekata žive u lenjom panelu, a composer nosi izabrane objekte.
 */
export type DirectorState = {
  move: CameraMove | null;
  moveIntensity: CameraMoveIntensity;
  /** Izabrani efekti (0-2), redom izbora - za oznaku u panelu i čipove. */
  picked: VideoEffect[];
  /** Ono što ide u opis: jedan efekat ili spoj dva (`combineEffects`). */
  effect: VideoEffect | null;
  desk: DirectorDesk;
};

export const EMPTY_DIRECTOR: DirectorState = { move: null, moveIntensity: "blago", picked: [], effect: null, desk: {} };

export function directorIsEmpty(state: DirectorState): boolean {
  return state.move === null && state.effect === null && deskIsEmpty(state.desk);
}

/** Koliko stavki pulta je izabrano (za čip „Pult: 3"). */
export function deskCount(desk: DirectorDesk): number {
  const keys: Array<keyof DirectorDesk> = ["genre", "era", "tempo", "lens", "aperture", "light", "emotion", "sound"];
  return keys.filter((key) => desk[key] !== undefined).length + ((desk.palette?.length ?? 0) > 0 ? 1 : 0);
}
