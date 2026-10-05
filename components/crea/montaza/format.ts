import type { Locale } from "@/lib/i18n";

/** Izbor na traci montaže (K19): šta je dodirnuto i šta inspektor uređuje. */
export type MontageSelection =
  | { kind: "main" | "overlay" | "audio" | "title" | "sticker"; id: string }
  | { kind: "transition"; id: string }
  | null;

/** Vreme kao sat: „0:03,2" (sr) ili „0:03.2" (en); duže od sata nema smisla u montaži. */
export function formatClock(seconds: number, locale: Locale, tenths = true): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const whole = Math.floor(rest);
  const base = `${minutes}:${String(whole).padStart(2, "0")}`;
  if (!tenths) return base;
  const tenth = Math.floor((rest - whole) * 10);
  return `${base}${locale === "sr" ? "," : "."}${tenth}`;
}

/** Kratko trajanje: „3,4 s" / „3.4 s". */
export function formatShort(seconds: number, locale: Locale): string {
  const text = `${Math.round(Math.max(0, seconds) * 10) / 10} s`;
  return locale === "sr" ? text.replace(".", ",") : text;
}
