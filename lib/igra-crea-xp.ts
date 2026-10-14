import { xpGain } from "./igra-lesson";

/**
 * „+N XP" posle rada u Crei (K16, plan K14 ODLUKA 8): N se MERI, ne upisuje u kod. XP se
 * pamti kad rad krene; kad rad stigne, otvara se prozor od 8 s i prvi porast u njemu je
 * broj. Bez porasta (dnevni plafon) broja nema. Čist reduktor, React deo je
 * `components/igra/crea/use-crea-xp-gain.ts`.
 */

export const CREA_XP_WINDOW_MS = 8_000;

export type CreaXpRun = {
  jobId: string;
  /** XP u trenutku kad je rad viđen u izradi. */
  before: number;
  finished: boolean;
  /** Prozor posle kraja rada je otvoren. */
  open: boolean;
  gain: number | null;
} | null;

export type CreaXpEvent =
  | { type: "start"; jobId: string; xp: number }
  | { type: "finish"; jobId: string; xp: number }
  | { type: "xp"; xp: number }
  | { type: "close"; jobId: string }
  | { type: "reset" };

function measure(run: NonNullable<CreaXpRun>, xp: number): NonNullable<CreaXpRun> {
  const gain = xpGain(run.before, xp);
  return gain > 0 ? { ...run, gain, open: false } : run;
}

/** Nepromenjeno stanje vraća istu referencu (React tada ne crta ponovo). */
export function creaXpRun(run: CreaXpRun, event: CreaXpEvent): CreaXpRun {
  switch (event.type) {
    case "reset":
      return null;
    case "start":
      if (run?.jobId === event.jobId) return run;
      return Number.isFinite(event.xp) ? { jobId: event.jobId, before: event.xp, finished: false, open: false, gain: null } : null;
    case "finish":
      if (!run || run.jobId !== event.jobId || run.finished) return run;
      // XP i stanje rada stižu iz dva upita: porast koji je stigao malo pre kraja se računa.
      return measure({ ...run, finished: true, open: true }, event.xp);
    case "xp":
      return run?.open ? measure(run, event.xp) : run;
    case "close":
      return run?.jobId === event.jobId && run.open ? { ...run, open: false } : run;
  }
}
