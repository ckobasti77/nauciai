import type { ParamControl } from "@/convex/studioParamSpec";

import type { Locale } from "./i18n";
import { controlLabel, controlUnit, optionLabel } from "./studio-params";

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

/**
 * "Generiši ponovo" vodi u playground sa ID-jem posla, ne sa promptom u URL-u:
 * forma mora da vrati MODEL, REŽIM, PARAMETRE I ULAZE (S7), a spisak
 * `storageId`-jeva u query stringu bi bio duži od svakog razumnog linka.
 * Metapodatak posla živi i posle isteka fajla, pa link radi i na isteklom redu.
 */
export function regenerateHref(studioHref: string, jobId: string): string {
  return `${studioHref}?regenerate=${encodeURIComponent(jobId)}`;
}

/** Naslov iznad sličica ulaza na kartici; broj se piše samo kad ih ima više od prikazanih. */
export function inputsLabel(shown: number, total: number, locale: Locale): string {
  const base = locale === "sr" ? "Ulazi" : "Inputs";

  return total > shown ? `${base} · ${shown}/${total}` : base;
}

/**
 * Podešavanja kojima je posao naručen, jednim redom: `1080p · 8 s · sa zvukom`.
 * Imena i jedinice dolaze iz `paramSpec`-a tog modela, pa kartica piše ono što
 * je pisalo i u formi - a ne sirove ključeve. Model kojeg u katalogu više nema
 * (ugašen red) ostaje bez opisa umesto da ispiše `resolution=1080p`.
 *
 * Tekstualne kontrole se preskaču: prompt već stoji iznad, a drugi tekst bi
 * progutao ceo red.
 */
export function jobParamSummary(
  paramsJson: string,
  spec: ParamControl[] | undefined,
  locale: Locale,
): string {
  if (!spec) return "";

  let params: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(paramsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
    params = parsed as Record<string, unknown>;
  } catch {
    return "";
  }

  const parts: string[] = [];
  for (const control of spec) {
    if (control.type === "textarea" || control.type === "text") continue;
    const value = params[control.key];
    if (value === undefined) continue;

    if (control.type === "switch") {
      if (value === true) parts.push(controlLabel(control, locale));
      continue;
    }

    if (typeof value === "number") {
      const unit = controlUnit(control, locale);
      parts.push(unit ? `${value} ${unit}` : `${controlLabel(control, locale)} ${value}`);
      continue;
    }

    const option = (control.options ?? []).find((entry) => entry.value === value);
    parts.push(option ? optionLabel(option, locale) : String(value));
  }

  return parts.join(" · ");
}

/**
 * Prekidač "Samo moji" / "Svi korisnici" (W1). Vidi ga samo admin i moderator,
 * a i tada `listAllJobs` ulogu proverava ponovo na serveru - ovo je prikaz.
 */
export const GALLERY_SCOPES = ["mine", "all"] as const;
export type GalleryScope = (typeof GALLERY_SCOPES)[number];

export const GALLERY_SCOPE_LABELS: Record<GalleryScope, { sr: string; en: string }> = {
  mine: { sr: "Samo moji", en: "Only mine" },
  all: { sr: "Svi korisnici", en: "All users" },
};

/** Statusi posla za red filter-čipova; isti spisak kao `generationJobs.status`. */
export const JOB_STATUSES = ["reserved", "running", "done", "failed", "refunded"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, { sr: string; en: string }> = {
  reserved: { sr: "Rezervisan", en: "Reserved" },
  running: { sr: "U radu", en: "Running" },
  done: { sr: "Gotov", en: "Done" },
  failed: { sr: "Pao", en: "Failed" },
  refunded: { sr: "Refundiran", en: "Refunded" },
};

/** Tri rute iz `models.provider`; filter po njima je koristan kad jedan provajder krene da pada. */
export const STUDIO_PROVIDERS = ["fal", "google", "byteplus"] as const;
export type StudioProvider = (typeof STUDIO_PROVIDERS)[number];

export const STUDIO_PROVIDER_LABELS: Record<StudioProvider, string> = {
  fal: "fal",
  google: "Google",
  byteplus: "BytePlus",
};

/**
 * Korisnici ponuđeni u selectu, suženi na ono što je ukucano. Pretraga je po
 * mejlu jer je mejl i ono što piše na kartici - admin traži isti niz znakova
 * koji je upravo pročitao.
 */
export function filterJobOwners<T extends { email: string }>(owners: T[], search: string): T[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") return owners;

  return owners.filter((owner) => owner.email.toLowerCase().includes(needle));
}
