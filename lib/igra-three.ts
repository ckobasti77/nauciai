import type { IgraArtId } from "./igra-art";

/**
 * 3D IGRA-e (K03, plan K01 §4) - čiste odluke i matematika. Ovaj fajl NE uvozi `three`:
 * ljuska (`components/igra/three/igra-three-stage.tsx`) po njemu odlučuje da li platno
 * uopšte treba, a three.js stiže tek sa platnom, kroz `next/dynamic`.
 */

export type IgraThreeKind = "pehar" | "medalja";
export type IgraMedalTone = "zlato" | "srebro" | "bronza";
/** `once`: jedan okret pa mir (slavlje). `idle`: blago ljuljanje dok je u kadru (podijum). */
export type IgraThreeSpin = "once" | "idle";

/** 3D samo na računaru (≥ 1024 px, miš) - isti uslov kao `CreaMascot`. */
export const IGRA_THREE_MEDIA = "(min-width: 1024px) and (pointer: fine)";
export const IGRA_THREE_DPR: [number, number] = [1, 1.5];

/** Sme li 3D: širok ekran sa mišem, bez smanjenog pokreta, WebGL radi. Inače nalepnica. */
export function canUseIgra3d({ wideFine, reduced, webgl }: { wideFine: boolean; reduced: boolean; webgl: boolean }): boolean {
  return wideFine && !reduced && webgl;
}

/** Petlja crtanja: stalno samo dok je u kadru, tab aktivan i nešto se kreće; inače na zahtev. */
export function igraFrameloop({ inView, hidden, animating }: { inView: boolean; hidden: boolean; animating: boolean }): "always" | "demand" {
  return inView && !hidden && animating ? "always" : "demand";
}

/** Nalepnica koja stoji ispod platna i ostaje kad 3D-a nema. */
export function igraThreeFallbackId(kind: IgraThreeKind, tone: IgraMedalTone = "zlato"): IgraArtId {
  return kind === "pehar" ? "rang.pehar" : `rang.${tone}`;
}

export const IGRA_SPIN_ONCE_SECONDS = 1.4;
const IDLE_SWAY_RADIANS = (12 * Math.PI) / 180;
/** Jedno ljuljanje levo-desno traje ~4,2 s. */
const IDLE_SWAY_SPEED = 1.5;

/** Ugao (rad) oko uspravne ose posle `seconds`. `once` staje tačno na punom krugu (lice napred). */
export function igraSpinAngle(spin: IgraThreeSpin, seconds: number): number {
  const time = Math.max(0, seconds);
  if (spin === "idle") return Math.sin(time * IDLE_SWAY_SPEED) * IDLE_SWAY_RADIANS;
  const progress = Math.min(1, time / IGRA_SPIN_ONCE_SECONDS);
  return (1 - (1 - progress) ** 3) * Math.PI * 2;
}

/** Da li se model još kreće (posle toga petlja prelazi na „na zahtev"). */
export function igraSpinRunning(spin: IgraThreeSpin, seconds: number): boolean {
  return spin === "idle" || seconds < IGRA_SPIN_ONCE_SECONDS;
}
