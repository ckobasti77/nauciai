/**
 * Čista logika PORAVNANJA posla (X2, nalaz N2). Bez `ctx`, bez baze, bez sata,
 * bez mreže - `studio.settleJobCredits` ovo samo upisuje.
 *
 * `createJob` skida kredite po PROCENI: koliko će posao koštati zna se tek kad
 * je gotov, a količina po kojoj se procena računa dolazi iz zaglavlja fajla koje
 * korisnik kači. X1 je to zaglavlje ograničio odozdo, ovaj korak zatvara drugu
 * polovinu: šta god da je rezervisano na početku, na kraju se naplaćuje ono što
 * je stvarno potrošeno.
 *
 * Tri izvora stvarne količine, po redu pouzdanosti:
 * 1. provajder je prijavio KOLIČINU (trajanje obrađenog snimka) - cena se
 *    preračuna po katalogu, istom funkcijom kojom je i rezervisana;
 * 2. provajder nije prijavio količinu ali jeste CENU (`actualCostUsd`) -
 *    poravnava se po njoj direktno;
 * 3. nije prijavio ništa - rezervacija ostaje kakva jeste. **Broj se ne
 *    izmišlja**, isto pravilo kao u `studioActualCostCore.ts`.
 */

import { resolveMeasuredQuantity, type QuantitySource } from "./studioJobCore";
import { computeCostUsd, computeCredits, creditsFromUsd, type PriceRule } from "./studioPricing";

/** Zašto je poravnanje ispalo ovakvo; stoji na `generationJobs.settlementReason`. */
export const SETTLEMENT_REASON = {
  quantity: "prijavljena kolicina",
  cost: "prijavljena cena",
  missing: "provajder nije prijavio",
} as const;

/**
 * Imena pod kojima provajderi javljaju trajanje obrađenog medija, i koliko
 * SEKUNDI nosi jedna njihova jedinica. Ključevi su normalizovani (mala slova,
 * bez `_` i `-`), kao u `readTokenUsage`.
 *
 * Imena NISU potvrđena protiv živog API-ja - ista ograda koju W6 ODLUKA 10 već
 * nosi za tokene - pa se prihvata svaki poznat zapis, a nepoznat ispada kao
 * "nema podatka". Jedinica se čita iz SUFIKSA imena: `duration_ms` je
 * milisekunda, `duration_minutes` minut, golo `duration` sekunda (konvencija
 * koju drže i ElevenLabs i fal i Google).
 */
const DURATION_KEYS: Record<string, number> = {
  // sekunde
  duration: 1,
  durations: 1,
  durationsec: 1,
  durationsecs: 1,
  durationsecond: 1,
  durationseconds: 1,
  durationinseconds: 1,
  audioduration: 1,
  audiodurationseconds: 1,
  videoduration: 1,
  videodurationseconds: 1,
  outputduration: 1,
  clipduration: 1,
  mediaduration: 1,
  processedseconds: 1,
  lengthseconds: 1,
  totalseconds: 1,
  seconds: 1,
  // milisekunde
  durationms: 1 / 1000,
  durationmillis: 1 / 1000,
  durationmilliseconds: 1 / 1000,
  audiodurationms: 1 / 1000,
  videodurationms: 1 / 1000,
  lengthms: 1 / 1000,
  milliseconds: 1 / 1000,
  // minuti
  durationmin: 60,
  durationmins: 60,
  durationminutes: 60,
  audiodurationminutes: 60,
  videodurationminutes: 60,
  processedminutes: 60,
  minutes: 60,
};

const MAX_SEARCH_DEPTH = 6;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/**
 * Trajanje izlaza, u sekundama, bilo gde u odgovoru provajdera. Rekurzivno i
 * tolerantno, iz istog razloga kao `readTokenUsage`: fal ga drži uz izlazni
 * fajl (`audio.duration`), Google uz operaciju, BytePlus uz `content`.
 *
 * `null` je pun i pošten odgovor - tada poravnanje ide na drugi izvor ili
 * ostavlja rezervaciju.
 */
export function readReportedSeconds(node: unknown, depth = 0): number | null {
  if (depth > MAX_SEARCH_DEPTH || node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = readReportedSeconds(item, depth + 1);
      if (found !== null) return found;
    }

    return null;
  }

  const entries = Object.entries(node as Record<string, unknown>);
  for (const [key, value] of entries) {
    const factor = Object.hasOwn(DURATION_KEYS, normalizeKey(key))
      ? DURATION_KEYS[normalizeKey(key)]
      : undefined;
    if (factor === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;

    return value * factor;
  }
  for (const [, value] of entries) {
    const found = readReportedSeconds(value, depth + 1);
    if (found !== null) return found;
  }

  return null;
}

export type SettlementInput = {
  /** `models.priceRule`; `null` za posao iz starog kataloga - takav ide samo po ceni. */
  rule: PriceRule | null;
  /** Parametri POSLA, sa količinom po kojoj je rezervisan. */
  params: Record<string, unknown>;
  /** Ključ režima za cenu (`pricingModeFor`), isti koji je koristila rezervacija. */
  pricingMode?: string;
  /** `capabilities.quantity` reda kataloga; `null` za modele koji se ne mere. */
  source: QuantitySource | null;
  /** Sekunde koje je provajder prijavio; `null` kad ih u odgovoru nema. */
  reportedSeconds: number | null;
  /** `generationJobs.actualCostUsd` - cena koju je provajder prijavio. */
  reportedCostUsd: number | null;
  reservedCredits: number;
  reservedCostUsd: number;
};

export type SettlementPlan =
  | { settled: false; reason: string }
  | {
      settled: true;
      reason: string;
      /** Nabavna cena po STVARNOJ količini - broj koji plafoni od sada mere. */
      costUsd: number;
      credits: number;
      /** Koliko kredita još treba skinuti (+) ili vratiti (-). */
      creditDelta: number;
      costDeltaUsd: number;
    };

type SettlementTarget = { reason: string; costUsd: number; credits: number };

/**
 * Cena po količini koju je provajder prijavio. Prolazi kroz ISTI
 * `resolveMeasuredQuantity` kroz koji je prošla i rezervacija - dakle
 * zaokruživanje naviše i odsecanje na `min`/`max` iz kataloga. To odsecanje je
 * ovde i zaštita: pogrešno pročitana jedinica ne može da naplati preko onoga
 * što katalog za taj model uopšte dozvoljava.
 *
 * Tekst se ne poravnava - njega server meri sam, iz `params`-a, pa tu nema šta
 * da se ispravi.
 */
function fromQuantity(input: SettlementInput): SettlementTarget | null {
  const { rule, source, reportedSeconds } = input;
  if (!rule || !source || source.from === "text_length") return null;
  if (reportedSeconds === null || !Number.isFinite(reportedSeconds) || reportedSeconds <= 0) {
    return null;
  }

  const measured = source.from === "input_media_minutes" ? reportedSeconds / 60 : reportedSeconds;
  const resolved = resolveMeasuredQuantity(source, input.params, measured);
  if (!resolved.ok) return null;

  const params = { ...input.params, [source.param]: resolved.quantity };
  try {
    return {
      reason: SETTLEMENT_REASON.quantity,
      costUsd: computeCostUsd(rule, params, input.pricingMode),
      credits: computeCredits(rule, params, input.pricingMode),
    };
  } catch {
    // Pravilo koje za prijavljenu količinu ne ume da izračuna cenu ne sme da
    // obori poravnanje: rezervacija tada ostaje kakva jeste.
    return null;
  }
}

/**
 * Poravnanje po ceni koju je provajder prijavio. Krediti idu kroz
 * `creditsFromUsd` - isti `ceil(C × 216,25)` koji radi i `computeCredits`, tačno
 * jednom, pa marža od 2,5× važi i za korekciju kao i za rezervaciju.
 */
function fromCost(input: SettlementInput): SettlementTarget | null {
  const usd = input.reportedCostUsd;
  if (usd === null || !Number.isFinite(usd) || usd <= 0) return null;

  return { reason: SETTLEMENT_REASON.cost, costUsd: usd, credits: creditsFromUsd(usd) };
}

/**
 * Šta poravnanje treba da uradi. Redosled izvora je redosled pouzdanosti:
 * prijavljena količina pobeđuje prijavljenu cenu, jer je cena kod fal-a zbir
 * događaja naplate koji ume da stigne nepotpun, a količina je jedan broj o
 * jednom poslu.
 */
export function planSettlement(input: SettlementInput): SettlementPlan {
  const target = fromQuantity(input) ?? fromCost(input);
  if (!target) return { settled: false, reason: SETTLEMENT_REASON.missing };

  return {
    settled: true,
    reason: target.reason,
    costUsd: target.costUsd,
    credits: target.credits,
    creditDelta: target.credits - input.reservedCredits,
    costDeltaUsd: target.costUsd - input.reservedCostUsd,
  };
}
