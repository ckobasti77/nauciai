/**
 * Poslednji korišćen model PO VRSTI, u `localStorage` (SP1, tačka 8). Kad
 * korisnik u biraču prebaci Slika -> Video, ne sme da završi na modelu koji ne
 * poznaje - biramo mu nazad onaj kojim je poslednji put radio tu vrstu.
 *
 * Čisto klijentski, bez backend izmena. Sve je iza `try/catch` i provere
 * `window`-a, da render na serveru i zaključan `localStorage` (privatni prozor)
 * ne obore Studio.
 */

import type { StudioSectionKind } from "./studio-sections";

const KEY = "studio:last-model-by-kind";

type LastModelMap = Partial<Record<StudioSectionKind, string>>;

function isKind(value: string): value is StudioSectionKind {
  return value === "image" || value === "video" || value === "audio";
}

export function readLastModelByKind(): LastModelMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const out: LastModelMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isKind(key) && typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLastModel(kind: StudioSectionKind, slug: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readLastModelByKind(), [kind]: slug };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage nedostupan (privatni prozor / kvota) - pamćenje je bonus,
    // ne sme da obori izbor modela.
  }
}
