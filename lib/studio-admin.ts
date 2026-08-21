/**
 * Čiste funkcije za admin ekran Studija (P8). Matematika je namerno
 * DUPLIRANA iz `convex/studioCore.ts`, ne uvezena - "use client" komponente u
 * ovom repou ne uvoze `convex/*.ts` module direktno (isti obrazac kao
 * `PROMPT_MAX_LENGTH` u `lib/studio-form.ts`). `lib/studio-admin.test.ts`
 * uvozi OBE strane i tvrdi da se poklapaju, da razilaženje ne prođe nezapaženo.
 */

/** ECB kurs iz STUDIO-PLAN §2 (14.08.2026): 1 $ = 0,865 €. */
export const EUR_PER_USD = 0.865;

/** Ispod ovog množioca se marža boji upozoravajuće. */
export const LOW_MARGIN_THRESHOLD = 2;

/**
 * Marža modela = maloprodajna vrednost `creditCost`-a u evrima (100 kr = 1 €)
 * podeljena nabavnom cenom u evrima. `null` kad nabavna cena nije upisana (0
 * ili manje) - to je "nema podatka", ne "beskonačna marža".
 */
export function computeMargin(creditCost: number, estimatedCostUsd: number): number | null {
  const costEur = estimatedCostUsd * EUR_PER_USD;
  if (costEur <= 0) return null;
  return creditCost / 100 / costEur;
}

export type MarginTone = "warn" | "ok" | "unknown";

export function marginTone(margin: number | null): MarginTone {
  if (margin === null) return "unknown";
  return margin < LOW_MARGIN_THRESHOLD ? "warn" : "ok";
}

export function formatMargin(margin: number | null): string {
  return margin === null ? "—" : `${margin.toFixed(1)}x`;
}

const JOB_STATUS_LABELS: Record<string, string> = {
  reserved: "Rezervisano",
  running: "U toku",
  done: "Završeno",
  failed: "Neuspešno",
  refunded: "Vraćeno",
};

export function jobStatusLabel(status: string): string {
  return JOB_STATUS_LABELS[status] ?? status;
}
