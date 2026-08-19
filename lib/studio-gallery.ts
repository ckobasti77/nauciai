import type { Locale } from "./i18n";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Koliko izabranih dana unazad prozor obuhvata; `"all"` ne filtrira ništa. */
export type DateRangePreset = "all" | "7d" | "30d";

export const DATE_RANGE_PRESETS: DateRangePreset[] = ["all", "7d", "30d"];

/**
 * Donja granica `createdAt`-a za dati preset, računata od `now` (zamrznut
 * `Date.now()` sa klijenta - servera se sat ovde uopšte ne tiče). `"all"` vraća
 * `undefined`, što `listMyJobs` čita kao "bez donje granice".
 */
export function dateRangeCutoff(preset: DateRangePreset, now: number): number | undefined {
  if (preset === "7d") return now - 7 * DAY_MS;
  if (preset === "30d") return now - 30 * DAY_MS;
  return undefined;
}

/**
 * Značka "ističe za N dana" (STUDIO-PLAN gallery, A13): samo za posao koji
 * IMA fajl (istekao fajl ima svoju sopstvenu poruku, ne značku) i samo kad je
 * manje od 7 dana do isteka. Zaokruženo naviše - "manje od 7 dana" je
 * upozorenje, pa je bolje da najavi jedan dan ranije nego kasnije.
 */
export function expiryBadgeDays(
  job: { outputUrl?: string | null; expiresAt?: number },
  now: number,
): number | null {
  if (!job.outputUrl || job.expiresAt === undefined) return null;
  const msLeft = job.expiresAt - now;
  if (msLeft <= 0) return null;
  const days = Math.ceil(msLeft / DAY_MS);
  return days < 7 ? days : null;
}

export function expiryBadgeText(days: number, locale: Locale): string {
  if (days <= 0) return locale === "sr" ? "ističe danas" : "expires today";
  if (locale === "sr") return `ističe za ${days} ${days === 1 ? "dan" : "dana"}`;
  return `expires in ${days} ${days === 1 ? "day" : "days"}`;
}

/** Dugme na isteklom fajlu (STUDIO-PLAN 0.2): cena je uvek na dugmetu. */
export function regenerateButtonLabel(creditCost: number, locale: Locale): string {
  return locale === "sr" ? `Generiši ponovo - ${creditCost} kr` : `Generate again - ${creditCost} cr`;
}

/** Vrste generacije za red filter-čipova. */
export const GALLERY_KINDS = ["image", "video", "audio"] as const;
export type GalleryKind = (typeof GALLERY_KINDS)[number];

export const GALLERY_KIND_LABELS: Record<GalleryKind, { sr: string; en: string }> = {
  image: { sr: "Slika", en: "Image" },
  video: { sr: "Video", en: "Video" },
  audio: { sr: "Zvuk", en: "Audio" },
};

export const DATE_RANGE_LABELS: Record<DateRangePreset, { sr: string; en: string }> = {
  all: { sr: "Sve", en: "All time" },
  "7d": { sr: "Poslednjih 7 dana", en: "Last 7 days" },
  "30d": { sr: "Poslednjih 30 dana", en: "Last 30 days" },
};

/** Fajl se sme izabrati za preuzimanje samo dok stvarno postoji. */
export function isDownloadable(job: { outputUrl?: string | null }): boolean {
  return Boolean(job.outputUrl);
}
