/**
 * „Crtaj i gledaj" (Crea K13, S9): dok korisnik crta, skica se povremeno šalje
 * jeftinom brzom modelu. Svako osvežavanje je pravi posao sa cenom, pa su
 * pravila stroga i čista (testirana):
 * - šalje se tek kad je crtež promenjen i ruka miruje (`idleMs`);
 * - između dva slanja prođe bar `minIntervalMs`;
 * - nikad dok prethodno osvežavanje još traje;
 * - najviše `limit` osvežavanja po sesiji alata - cena tog maksimuma piše
 *   na ekranu PRE nego što se uživo uključi.
 */

export const LIVE_DRAW_DEFAULTS = {
  idleMs: 1200,
  minIntervalMs: 5000,
  limit: 10,
} as const;

export type LiveDrawState = {
  /** Broj promena crteža (poteza) do sada. */
  revision: number;
  /** Revizija koja je poslednja poslata (`-1` = još ništa). */
  sentRevision: number;
  lastChangeAt: number;
  lastSentAt: number | null;
  inFlight: boolean;
  sent: number;
};

export type LiveDrawDecision =
  | { action: "send" }
  | { action: "wait"; ms: number }
  | { action: "idle"; reason: "unchanged" | "in-flight" | "limit" };

export function liveDrawDecision(
  state: LiveDrawState,
  now: number,
  rules: { idleMs: number; minIntervalMs: number; limit: number } = LIVE_DRAW_DEFAULTS,
): LiveDrawDecision {
  if (state.sent >= rules.limit) return { action: "idle", reason: "limit" };
  if (state.revision === state.sentRevision || state.revision === 0) return { action: "idle", reason: "unchanged" };
  if (state.inFlight) return { action: "idle", reason: "in-flight" };
  const idleLeft = state.lastChangeAt + rules.idleMs - now;
  const intervalLeft = state.lastSentAt === null ? 0 : state.lastSentAt + rules.minIntervalMs - now;
  const wait = Math.max(idleLeft, intervalLeft);
  return wait > 0 ? { action: "wait", ms: wait } : { action: "send" };
}

/** Najviše koliko sesija može da košta, za natpis pre uključivanja. */
export function liveDrawMaxCredits(creditsPerRefresh: number | null, limit: number = LIVE_DRAW_DEFAULTS.limit): number | null {
  return creditsPerRefresh === null ? null : creditsPerRefresh * limit;
}
