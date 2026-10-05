import type { CreaCamera } from "@/lib/crea-camera";

/**
 * Izgled slike u composeru (K13, S8): stil, virtuelna kamera, paleta i sopstveni
 * dodatak. Zaseban mali modul, da composer ne vuče ceo panel (on se učitava lenjo).
 */
export type LookState = { styleId: string | null; camera: CreaCamera | null; palette: string[]; extra: string };

export const EMPTY_LOOK: LookState = { styleId: null, camera: null, palette: [], extra: "" };

export function lookIsEmpty(look: LookState): boolean {
  return look.styleId === null && look.camera === null && look.palette.length === 0 && look.extra.trim().length === 0;
}
