/**
 * Sklopljeno/rasklopljeno stanje polja za unos u Studiju, u `localStorage` (N11).
 * Mobilni i desktop pamte NEZAVISNO stanje - da kolaps na telefonu ne kolabuje
 * polje kad se isti nalog otvori na širem ekranu.
 *
 * Čisto klijentski, bez backend izmena. Sve je iza `try/catch` i provere
 * `window`-a, da render na serveru i zaključan `localStorage` (privatni prozor)
 * ne obore Studio.
 */

export type ComposerBreakpoint = "mobile" | "desktop";

const KEY_PREFIX = "studio:composer-collapsed:";

export function readComposerCollapsed(breakpoint: ComposerBreakpoint): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY_PREFIX + breakpoint) === "1";
  } catch {
    return false;
  }
}

export function writeComposerCollapsed(breakpoint: ComposerBreakpoint, collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + breakpoint, collapsed ? "1" : "0");
  } catch {
    // localStorage nedostupan (privatni prozor / kvota) - pamćenje je bonus,
    // ne sme da obori sklapanje polja.
  }
}
