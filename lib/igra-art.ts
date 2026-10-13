import manifest from "../public/brand/igra/manifest.json";
import type { Locale, LocalizedText } from "./i18n";

/**
 * Registar IGRA slika (K02). Jedini izvor istine je `public/brand/igra/manifest.json`
 * (runner ga kopira zajedno sa slikama pre svakog koraka); ovde je samo tipizovan pristup
 * i čista logika koju `<IgraArt>` crta. ID-jevi su stabilni (`docs/igra/SLIKE.md`).
 *
 * `ready` se čita pri build-u: slika koja stigne posle build-a čeka sledeći, a fajl koji
 * fali (404) hvata sama komponenta.
 */

export const IGRA_ART_KINDS = [
  "lik",
  "nivo",
  "bedz",
  "rang",
  "scena",
  "scena-nalepnica",
  "baner",
  "prazno",
  "admin",
  "ikona",
] as const;
export type IgraArtKind = (typeof IGRA_ART_KINDS)[number];

export type IgraManifestId = keyof typeof manifest.assets;

type PlannedArt = { w: number; h: number; kind: IgraArtKind; alt: LocalizedText };

/**
 * Slike koje kod već koristi, a još nisu u manifestu (TRAŽENE SLIKE u
 * `docs/IGRA-PROGRESS.md`). Dok ne stignu crta se fallback; kad uđu u manifest, manifest
 * pobeđuje i red odavde može da se obriše.
 */
export const IGRA_PLANNED_ART = {
  "lik.piksi.radi": { w: 768, h: 768, kind: "lik", alt: { sr: "Piksi slika", en: "Piksi painting" } },
  "lik.kadar.radi": { w: 768, h: 768, kind: "lik", alt: { sr: "Kadar snima", en: "Kadar filming" } },
  "lik.eho.radi": { w: 768, h: 768, kind: "lik", alt: { sr: "Eho hvata zvuk", en: "Eho capturing sound" } },
} as const satisfies Record<string, PlannedArt>;

export type IgraArtId = IgraManifestId | keyof typeof IGRA_PLANNED_ART;

export type IgraArtInfo = {
  id: IgraArtId;
  /** Prazno za planiranu sliku (nema fajla). */
  src: string;
  w: number;
  h: number;
  kind: IgraArtKind;
  ready: boolean;
  alt: LocalizedText;
};

type ManifestEntry = { src: string; w: number; h: number; kind: string; ready: boolean; alt: LocalizedText };

const MANIFEST: Record<string, ManifestEntry | undefined> = manifest.assets;
const PLANNED: Record<string, PlannedArt | undefined> = IGRA_PLANNED_ART;

function isIgraArtKind(kind: string): kind is IgraArtKind {
  return (IGRA_ART_KINDS as readonly string[]).includes(kind);
}

/** Slika po ID-ju iz podataka (nepoznat ID ili nepoznata vrsta → `null`). */
export function igraArtOrNull(id: string): IgraArtInfo | null {
  const entry = MANIFEST[id];
  if (entry) {
    if (!isIgraArtKind(entry.kind)) return null;
    return { id: id as IgraArtId, src: entry.src, w: entry.w, h: entry.h, kind: entry.kind, ready: entry.ready, alt: entry.alt };
  }
  const planned = PLANNED[id];
  if (planned) return { id: id as IgraArtId, src: "", ready: false, ...planned };
  return null;
}

export function isIgraArtId(id: string): id is IgraArtId {
  return igraArtOrNull(id) !== null;
}

export function igraArt(id: IgraArtId): IgraArtInfo {
  const info = igraArtOrNull(id);
  if (!info) throw new Error(`IGRA: nepoznata slika ${id}`);
  return info;
}

/** Svi ID-jevi: manifest redom, pa planirane koje još nisu u njemu. */
export function igraArtIds(): IgraArtId[] {
  const ids = Object.keys(manifest.assets);
  for (const id of Object.keys(IGRA_PLANNED_ART)) if (!MANIFEST[id]) ids.push(id);
  return ids as IgraArtId[];
}

// ── Porodice ID-jeva ─────────────────────────────────────────────────────────

export const IGRA_LIKOVI = ["robi", "piksi", "kadar", "eho", "bajt", "sova", "iskra"] as const;
export type IgraLik = (typeof IGRA_LIKOVI)[number];
export const IGRA_POZE = ["mase", "slavi", "misli", "tuzan"] as const;
export type IgraPoza = (typeof IGRA_POZE)[number];

export function igraLikArt(lik: IgraLik, poza: IgraPoza): IgraArtId {
  return `lik.${lik}.${poza}`;
}

export const IGRA_NIVO_COUNT = 12;

/** Amblem nivoa; nivo van 1..12 se steže na najbliži. */
export function igraNivoArt(level: number): IgraArtId {
  const safe = Number.isFinite(level) ? Math.min(IGRA_NIVO_COUNT, Math.max(1, Math.trunc(level))) : 1;
  return `nivo.${String(safe).padStart(2, "0")}` as IgraArtId;
}

/** Ključ bedža = ID bez prefiksa `bedz.` (`prva-lekcija`, `niz-7`…). */
export type IgraBedzKey = IgraManifestId extends infer Id ? (Id extends `bedz.${infer Key}` ? Key : never) : never;

export function igraBedzArt(key: IgraBedzKey): IgraArtId {
  return `bedz.${key}`;
}

// ── Čista logika prikaza (crta je `components/igra/igra-art.tsx`) ────────────

export const IGRA_ART_SIZES = { xs: 24, sm: 40, md: 64, lg: 96 } as const;
/** Imenovana veličina, `hero` (cela širina roditelja) ili širina u pikselima. */
export type IgraArtSize = keyof typeof IGRA_ART_SIZES | "hero" | number;

/** Die-cut nalepnica (providna pozadina, krem ivica); scene i baneri su listovi papira. */
export function isIgraSticker(kind: IgraArtKind): boolean {
  return kind !== "scena" && kind !== "baner";
}

/** Širina kutije u px; `null` = cela širina roditelja. Bez `size`: nalepnica `md`, scena/baner `hero`. */
export function igraArtWidth(size: IgraArtSize | undefined, kind: IgraArtKind): number | null {
  const resolved = size ?? (isIgraSticker(kind) ? "md" : "hero");
  if (resolved === "hero") return null;
  if (typeof resolved === "number") return Number.isFinite(resolved) && resolved > 0 ? Math.round(resolved) : IGRA_ART_SIZES.md;
  return IGRA_ART_SIZES[resolved];
}

/** Sme li da se crta `<img>`: fajl je stigao i ima adresu. */
export function igraArtRenderable(info: Pick<IgraArtInfo, "ready" | "src">): boolean {
  return info.ready && info.src.length > 0;
}

export function igraArtAlt(info: Pick<IgraArtInfo, "alt">, locale: Locale): string {
  return info.alt[locale];
}

export type IgraArtFallbackShape = "sticker" | "level" | "paper";

/** Šta stoji umesto slike: krem krug sa ikonom, krug sa brojem nivoa ili list papira. */
export function igraArtFallbackShape(kind: IgraArtKind): IgraArtFallbackShape {
  if (kind === "nivo") return "level";
  return isIgraSticker(kind) ? "sticker" : "paper";
}

/** Broj nivoa iz `nivo.07` (za fallback); sve ostalo → `null`. */
export function igraNivoOf(id: string): number | null {
  const match = /^nivo\.(\d{2})$/.exec(id);
  return match ? Number(match[1]) : null;
}
