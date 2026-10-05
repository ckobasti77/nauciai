import type { Locale } from "../i18n";

/**
 * Napredak preuzimanja (K04): čiste funkcije, da traka u `ToolRunner`-u kaže
 * tačno koliko je stiglo i koliko još ima. Fajl čija veličina nije poznata
 * (`total: null`) ne pravi procenat - bolje „11,2 MB" nego izmišljenih 40 %.
 */

export type FileProgress = { loaded: number; total: number | null };
export type AggregateProgress = { loaded: number; total: number | null; percent: number | null };

export function aggregateProgress(files: readonly FileProgress[]): AggregateProgress {
  let loaded = 0;
  let total = 0;
  let known = true;
  for (const file of files) {
    loaded += Math.max(0, file.loaded);
    if (file.total === null || file.total <= 0) known = false;
    // Raspakovano zna da preraste prijavljeno (brotli sa CDN-a); traka ne sme preko 100 %.
    else total += Math.max(file.total, file.loaded);
  }
  if (!known || files.length === 0) return { loaded, total: null, percent: null };
  return { loaded, total, percent: total === 0 ? 100 : Math.min(100, Math.floor((loaded / total) * 100)) };
}

const UNITS = ["B", "KB", "MB", "GB"] as const;

/** „11,2 MB" na srpskom, „11.2 MB" na engleskom. */
export function formatBytes(bytes: number, locale: Locale): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const text = value.toLocaleString(locale === "sr" ? "sr-Latn-RS" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${text} ${UNITS[unit]}`;
}

/**
 * Procena preostalog vremena iz prosečne brzine od početka. `null` dok nema
 * dovoljno podataka (prve pola sekunde, nepoznata veličina, ništa nije stiglo).
 */
export function estimateSecondsLeft(progress: AggregateProgress, elapsedMs: number): number | null {
  if (progress.total === null || progress.loaded <= 0 || elapsedMs < 500) return null;
  const remaining = Math.max(0, progress.total - progress.loaded);
  const bytesPerMs = progress.loaded / elapsedMs;
  return Math.ceil(remaining / bytesPerMs / 1000);
}
