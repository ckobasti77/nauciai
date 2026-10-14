import { belgradeDayKey } from "../convex/leaderboardCore";
import { HEARTBEAT_STALE_MS } from "../convex/studioCore";
import { shiftDayKey } from "./crea-streak";
import { IGRA_ADMIN_COPY } from "./igra-admin-copy";
import { IGRA_POST_FORMS } from "./igra-copy";
import { pluralize, type Locale, type LocalizedText } from "./i18n";

/**
 * Admin „Kontrolna soba" (K21, plan K20): čista logika nad POSTOJEĆIM upitima. Ništa ovde
 * ne čita bazu ni sat; status sistema se sklapa iz `studioAdmin.getKillSwitchState`,
 * `studioAdmin.getUsageSummary` i `notifications.getUserNotificationSummary`, a dnevni niz
 * iz `createdAt` redova `studioAdmin.listPromptLog` / `listModerationEvents`.
 */

export type AdminTone = "ok" | "paznja" | "problem";
export type AdminSignalKey = "crea" | "cuvar" | "trosak" | "moderacija";
export type AdminSignal = {
  key: AdminSignalKey;
  tone: AdminTone;
  label: string;
  /** Rečenica koju Robi kaže kad je ovo najvažnije stanje. */
  line: string;
  /** Putanja bez jezika; komponenta je provlači kroz `withLocale`. */
  path: string;
};

/** `notifications.pendingApprovals` čita `take(100)`: 100 znači „100 ili više". */
export const ADMIN_PENDING_CAP = 100;

/** `studioAdmin.listPromptLog` i `listModerationEvents` vraćaju najviše 200 najnovijih redova. */
export const ADMIN_LOG_LIMIT = 200;

/** Današnji dan po Beogradu, isti ključ kao ostali „dnevni" ključevi u repou. */
export function adminTodayKey(now: number): string {
  return belgradeDayKey(now);
}

const text = (copy: LocalizedText, locale: Locale) => copy[locale];

/** Isto pravilo kao `ProminentHealthAlert` u Crea adminu (`HEARTBEAT_STALE_MS`). */
export function adminHeartbeatState(
  heartbeatAt: number | null,
  failure: { message: string } | null,
  now: number,
): "radi" | "kasni" | "nikad" | "greska" {
  if (failure) return "greska";
  if (heartbeatAt === null) return "nikad";
  return now - heartbeatAt > HEARTBEAT_STALE_MS ? "kasni" : "radi";
}

/** Isti pragovi kao boja iznosa u Crea adminu: strogo preko alarma / preko gašenja. */
export function adminSpendTone(totalCostUsd: number, alarmUsd: number, killUsd: number): AdminTone {
  if (totalCostUsd > killUsd) return "problem";
  if (totalCostUsd > alarmUsd) return "paznja";
  return "ok";
}

/** Isti zapis iznosa kao Crea admin (`$12.40`, prag `$50`). */
export function adminUsd(value: number, decimals = 2): string {
  return `$${value.toFixed(decimals)}`;
}

export function adminPendingLabel(count: number): string {
  return count >= ADMIN_PENDING_CAP ? `${ADMIN_PENDING_CAP}+` : String(count);
}

export type AdminSignalInput = {
  creaEnabled: boolean | undefined;
  usage:
    | {
        totalCostUsd: number;
        alarmUsd: number;
        killUsd: number;
        costCapHeartbeatAt: number | null;
        costCapCronFailure: { message: string } | null;
      }
    | undefined;
  pendingApprovals: number | undefined;
  now: number;
};

/** Četiri stanja sistema, redom kako stoje u heroju. `null` dok bilo koji upit nije stigao. */
export function adminSignals(input: AdminSignalInput, locale: Locale): AdminSignal[] | null {
  const { creaEnabled, usage, pendingApprovals, now } = input;
  if (creaEnabled === undefined || usage === undefined || pendingApprovals === undefined) return null;
  const c = IGRA_ADMIN_COPY;

  const heartbeat = adminHeartbeatState(usage.costCapHeartbeatAt, usage.costCapCronFailure, now);
  const minutes = usage.costCapHeartbeatAt === null ? 0 : Math.round((now - usage.costCapHeartbeatAt) / 60_000);
  const guardLabel =
    heartbeat === "radi"
      ? text(c.guardOk, locale)
      : heartbeat === "greska"
        ? text(c.guardFailed, locale)
        : heartbeat === "nikad"
          ? text(c.guardNever, locale)
          : `${text(c.guardLate, locale)} · ${minutes} min`;

  const spendTone = adminSpendTone(usage.totalCostUsd, usage.alarmUsd, usage.killUsd);
  const pendingText = adminPendingLabel(pendingApprovals);
  const pendingNoun = pluralize(locale, Math.min(pendingApprovals, ADMIN_PENDING_CAP), IGRA_POST_FORMS[locale]);

  return [
    {
      key: "crea",
      tone: creaEnabled ? "ok" : "paznja",
      label: text(creaEnabled ? c.creaOn : c.creaOff, locale),
      line: text(c.robiCreaOff, locale),
      path: "/app/admin/studio",
    },
    {
      key: "cuvar",
      tone: heartbeat === "radi" ? "ok" : "problem",
      label: guardLabel,
      line: text(heartbeat === "greska" ? c.robiGuardFailed : c.robiGuardLate, locale),
      path: "/app/admin/studio",
    },
    {
      key: "trosak",
      tone: spendTone,
      label: `${text(c.spendToday, locale)} ${adminUsd(usage.totalCostUsd)} ${text(c.spendOf, locale)} ${adminUsd(usage.alarmUsd, 0)}`,
      line: text(spendTone === "problem" ? c.robiSpendKill : c.robiSpendAlarm, locale),
      path: "/app/admin/studio",
    },
    {
      key: "moderacija",
      tone: pendingApprovals > 0 ? "paznja" : "ok",
      label: pendingApprovals > 0 ? `${pendingText} ${text(c.queueWaiting, locale)}` : text(c.queueClear, locale),
      line: `${pendingText} ${pendingNoun} ${text(c.robiPending, locale)}`,
      path: "/app/community/moderation",
    },
  ];
}

const KEY_PRIORITY: Record<AdminSignalKey, number> = { cuvar: 0, trosak: 1, crea: 2, moderacija: 3 };

/** Robi: `tuzan` kad nešto ne radi, `misli` kad nešto čeka, inače `mase` i „Sve radi." */
export function adminRobiMood(
  signals: AdminSignal[] | null,
  locale: Locale,
): { poza: "mase" | "misli" | "tuzan"; line: string; tone: AdminTone } | null {
  if (!signals) return null;
  const pick = (tone: AdminTone) =>
    signals.filter((signal) => signal.tone === tone).sort((a, b) => KEY_PRIORITY[a.key] - KEY_PRIORITY[b.key])[0];
  const problem = pick("problem");
  if (problem) return { poza: "tuzan", line: problem.line, tone: "problem" };
  const attention = pick("paznja");
  if (attention) return { poza: "misli", line: attention.line, tone: "paznja" };
  return { poza: "mase", line: text(IGRA_ADMIN_COPY.robiAllGood, locale), tone: "ok" };
}

/** Jedan red „100 % složene trake": udeo svakog dela u ukupnom zbiru reda. */
export function stackedShares<Key extends string>(parts: ReadonlyArray<{ key: Key; value: number }>) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  return {
    total,
    parts: parts.map((part) => ({ ...part, share: total > 0 ? Math.max(0, part.value) / total : 0 })),
  };
}

export type AdminDay = { day: string; count: number | null; partial: boolean };

/**
 * Dnevni niz iz vremena zapisa (Beograd). Kad je lista pogodila plafon (`capped`), dani
 * stariji od najstarijeg zapisa NISU nula nego nepoznati (`null`), a dan najstarijeg zapisa
 * je samo donja granica (`partial`). Inače su svi dani u prozoru tačni.
 */
export function dailyCountSeries(
  timestamps: readonly number[],
  { todayKey, days, capped }: { todayKey: string; days: number; capped: boolean },
): { days: AdminDay[]; total: number; today: AdminDay; completeDays: number; max: number } {
  const counts = new Map<string, number>();
  let oldest = Number.POSITIVE_INFINITY;
  for (const at of timestamps) {
    const key = belgradeDayKey(at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (at < oldest) oldest = at;
  }
  const cutoff = capped && timestamps.length > 0 ? belgradeDayKey(oldest) : null;

  const series: AdminDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = shiftDayKey(todayKey, -offset);
    if (cutoff !== null && day < cutoff) series.push({ day, count: null, partial: false });
    else series.push({ day, count: counts.get(day) ?? 0, partial: cutoff !== null && day === cutoff });
  }

  let total = 0;
  let max = 0;
  let completeDays = 0;
  for (const entry of series) {
    if (entry.count === null) continue;
    total += entry.count;
    max = Math.max(max, entry.count);
    if (!entry.partial) completeDays += 1;
  }
  return { days: series, total, today: series[series.length - 1]!, completeDays, max };
}

/** Visina stubića u procentima (0..100), od nule do najveće vrednosti: bez lažnog zuma. */
export function columnHeight(count: number | null, max: number): number {
  if (count === null || max <= 0) return 0;
  return Math.round((Math.max(0, count) / max) * 1000) / 10;
}
