/**
 * STVARAN trošak posla, odvojen od procene (W6, sekcija 6 stavka 6
 * `docs/STUDIO-CATALOG-REPORT.md`). Čista logika: bez `ctx`, bez baze, bez
 * mreže, bez sata.
 *
 * `generationJobs.estimatedCostUsd` je ono što je katalog obećao PRE posla,
 * `generationJobs.actualCostUsd` je ono što je provajder stvarno naplatio. Dok
 * drugog broja nema, marža u admin ekranu je samo prepričan katalog, pa se
 * greška u katalogu vidi tek na bankovnom izvodu.
 *
 * **Pravilo koje se ne pregovara: prazno polje je pošteno, izmišljen broj
 * nije.** Svaka funkcija ovde vraća `null` čim jedan sabirak nedostaje - nikad
 * nulu i nikad delimičan zbir, jer bi delimičan zbir bio trošak MANJI od
 * stvarnog i tiho popravio maržu koja je u stvari loša.
 */

/** Koliko tokena je posao potrošio, po kategorijama koje se različito tarifiraju. */
export type TokenUsage = {
  /** Ulazni tokeni (prompt, ugrađene slike). */
  prompt?: number;
  /** Izlazni tokeni (slika, video, tekst). */
  output?: number;
  /** Tokeni "razmišljanja" - Google ih naplaćuje posebno (katalog 2.2). */
  thinking?: number;
};

/** Tarifa u dolarima po MILIONU tokena, po istim kategorijama. */
export type TokenRates = {
  prompt?: number;
  output?: number;
  thinking?: number;
};

const TOKEN_CATEGORIES = ["prompt", "output", "thinking"] as const;

/**
 * Imena pod kojima provajderi javljaju iste tri kategorije. Google piše
 * `usageMetadata.promptTokenCount`, BytePlus (OpenAI-kompatibilan oblik)
 * `usage.prompt_tokens`. Nijedno od ovoga nije potvrđeno protiv živog API-ja -
 * pravila run-a zabranjuju poziv - pa se prihvata svaki od poznatih zapisa,
 * a nepoznat zapis ispada kao "nema podatka", ne kao nula.
 */
const USAGE_KEYS: Record<(typeof TOKEN_CATEGORIES)[number], string[]> = {
  prompt: ["prompttokencount", "prompttokens", "inputtokens", "inputtokencount"],
  output: [
    "candidatestokencount",
    "completiontokens",
    "outputtokens",
    "outputtokencount",
    "generatedtokens",
  ],
  thinking: ["thoughtstokencount", "thinkingtokens", "reasoningtokens", "thoughtstokens"],
};

/** Ključevi ispod kojih provajderi drže objekat sa potrošnjom. */
const USAGE_CONTAINER_KEYS = new Set(["usage", "usagemetadata", "usagedetails", "tokenusage"]);

const MAX_SEARCH_DEPTH = 6;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Jedan objekat sa potrošnjom -> `TokenUsage`. Kategorija koje nema u objektu
 * ostaje nedefinisana; kategorija sa nulom je isto što i "nema je" - nula
 * tokena ne košta ništa ni u jednoj tarifi.
 */
function usageFromContainer(container: Record<string, unknown>): TokenUsage | null {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(container)) normalized.set(normalizeKey(key), value);

  const usage: TokenUsage = {};
  let found = false;
  for (const category of TOKEN_CATEGORIES) {
    for (const key of USAGE_KEYS[category]) {
      const count = positiveNumber(normalized.get(key));
      if (count === null) continue;
      usage[category] = count;
      found = true;
      break;
    }
  }

  return found ? usage : null;
}

/**
 * Traži potrošnju bilo gde u odgovoru. Rekurzivno, kao `findOutputUrl` u
 * `lib/google-video.ts` i iz istog razloga: isti podatak stoji na
 * `usageMetadata` kod Google-a, na `usage` kod BytePlus-a, a kod asinhronog
 * zadatka ume da bude i jedan nivo dublje, u telu rezultata.
 */
export function readTokenUsage(node: unknown, depth = 0): TokenUsage | null {
  if (depth > MAX_SEARCH_DEPTH || node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = readTokenUsage(item, depth + 1);
      if (found) return found;
    }

    return null;
  }

  const entries = Object.entries(node as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (!USAGE_CONTAINER_KEYS.has(normalizeKey(key))) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const usage = usageFromContainer(value as Record<string, unknown>);
    if (usage) return usage;
  }
  for (const [, value] of entries) {
    const found = readTokenUsage(value, depth + 1);
    if (found) return found;
  }

  return null;
}

/**
 * Tarife jednog modela stoje u njegovom `capabilities` JSON-u, pod
 * `tokenRatesUsdPerMillion`. Tamo su iz istog razloga iz kojeg je tamo i
 * `api: "interactions"`: to je svojstvo REDA kataloga, ne kontrola u formi, a
 * `capabilities` je jedino slobodno JSON polje koje red već ima.
 *
 * Red bez tarife nije greška - to je model za koji katalog ne objavljuje cenu
 * po tokenu. Takav model ostaje bez `actualCostUsd`, i to je tačan ishod.
 */
export function parseTokenRates(capabilities: Record<string, unknown> | null): TokenRates | null {
  if (!capabilities) return null;
  const raw = capabilities.tokenRatesUsdPerMillion;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const source = raw as Record<string, unknown>;
  const rates: TokenRates = {};
  let found = false;
  for (const category of TOKEN_CATEGORIES) {
    const rate = positiveNumber(source[category]);
    if (rate === null) continue;
    rates[category] = rate;
    found = true;
  }

  return found ? rates : null;
}

/**
 * Tokeni -> dolari. `null` kad JEDNA prijavljena kategorija nema svoju tarifu:
 * zbir bez nje bi bio trošak manji od stvarnog, a to je upravo broj koji
 * popravlja lošu maržu i sakriva grešku u katalogu.
 */
export function tokenCostUsd(usage: TokenUsage, rates: TokenRates | null): number | null {
  if (!rates) return null;

  let usd = 0;
  let counted = false;
  for (const category of TOKEN_CATEGORIES) {
    const tokens = usage[category];
    if (tokens === undefined) continue;
    const rate = rates[category];
    if (rate === undefined) return null;
    usd += (tokens * rate) / 1_000_000;
    counted = true;
  }

  return counted ? usd : null;
}

/**
 * Koliko puta preko procene je "greška u katalogu", a ne šum. 30% je iz W6;
 * ispod toga se kreće svaka razlika u tokenima između dva prompta.
 */
export const COST_DEVIATION_RATIO = 1.3;

/**
 * Koliko UZASTOPNIH poslova istog modela mora da premaši prag pre alarma. Jedan
 * složen prompt kod mislećeg modela ume da premaši sam - pet uzastopnih je
 * pravilo, ne slučaj.
 */
export const COST_DEVIATION_STREAK = 5;

/**
 * Poredi se u mikrodolarima iz istog razloga iz kojeg `exceedsDailyCostLimit`
 * poredi u centima: `0,1 + 0,2` u binarnom zapisu nije `0,3`, pa bi prag umeo
 * da pukne na tačnoj granici u jednu ili u drugu stranu.
 *
 * Procena od nule ili niže nema odstupanje: bez osnove se ne može reći da je
 * nešto trideset posto skuplje.
 */
export function exceedsCostDeviation(actualCostUsd: number, estimatedCostUsd: number): boolean {
  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd <= 0) return false;
  if (!Number.isFinite(actualCostUsd)) return false;

  return Math.round(actualCostUsd * 1e6) > Math.round(estimatedCostUsd * COST_DEVIATION_RATIO * 1e6);
}

/**
 * Zbir po modelu, jedan red na ceo model. Admin ekran iz njega crta STVARNU
 * maržu, a niz uzastopnih odstupanja se broji ovde umesto da se svaki put
 * skenira istorija poslova.
 */
export type ModelCostState = {
  /** Koliko poslova ovog modela ima izmeren trošak. Nula = marža je samo procena. */
  measuredJobs: number;
  actualCostUsd: number;
  /** Procena za TE ISTE poslove, da se dva broja porede na istom uzorku. */
  estimatedCostUsd: number;
  /** Naplaćeni krediti tih poslova - brojilac stvarne marže. */
  creditCost: number;
  deviationStreak: number;
  /** Je li alarm za tekući niz već poslat; niz koji se prekine ga oslobađa. */
  alarmSent: boolean;
};

export const EMPTY_MODEL_COST_STATE: ModelCostState = {
  measuredJobs: 0,
  actualCostUsd: 0,
  estimatedCostUsd: 0,
  creditCost: 0,
  deviationStreak: 0,
  alarmSent: false,
};

export type MeasuredJob = {
  actualCostUsd: number;
  /** Poslovi upisani pre W6 je nemaju - takav posao ulazi u zbir, ali ne i u niz. */
  estimatedCostUsd?: number;
  creditCost: number;
};

export type ModelCostUpdate = { state: ModelCostState; alarm: boolean };

/**
 * Jedan izmeren posao -> novo stanje modela, plus odgovor "da li sad ide
 * alarm". Alarm puca TAČNO na petom uzastopnom odstupanju i ne ponavlja se dok
 * se niz ne prekine - poslednji posao koji je pod pragom vraća brojač na nulu i
 * oslobađa alarm za sledeći niz.
 *
 * Posao bez procene (stari red) uvećava zbirove, ali NE dira niz: odstupanje
 * bez osnove nije ni odstupanje ni dokaz da ga nema.
 */
export function nextModelCostState(
  previous: ModelCostState | null,
  job: MeasuredJob,
): ModelCostUpdate {
  const base = previous ?? EMPTY_MODEL_COST_STATE;
  const state: ModelCostState = {
    measuredJobs: base.measuredJobs + 1,
    actualCostUsd: base.actualCostUsd + job.actualCostUsd,
    estimatedCostUsd: base.estimatedCostUsd + (job.estimatedCostUsd ?? 0),
    creditCost: base.creditCost + job.creditCost,
    deviationStreak: base.deviationStreak,
    alarmSent: base.alarmSent,
  };

  if (job.estimatedCostUsd === undefined) return { state, alarm: false };

  if (!exceedsCostDeviation(job.actualCostUsd, job.estimatedCostUsd)) {
    state.deviationStreak = 0;
    state.alarmSent = false;

    return { state, alarm: false };
  }

  state.deviationStreak = base.deviationStreak + 1;
  const alarm = state.deviationStreak >= COST_DEVIATION_STREAK && !base.alarmSent;
  if (alarm) state.alarmSent = true;

  return { state, alarm };
}

/** UTC dan pre onog kom `now` pripada - prozor noćne rekonsilijacije. */
export function previousDayKey(now: number): string {
  return new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * fal ume da naplati jedan `request_id` kroz više događaja (ponovljen pokušaj,
 * zaseban red za ulaz i za izlaz), pa se sabiraju pre nego što dodirnu posao -
 * inače bi prvi događaj upisao deo troška, a `recordActualCost` je namerno
 * jednokratan i ostatak bi tiho propao.
 */
export function sumByRequestId(
  events: Array<{ requestId: string; usd: number }>,
): Array<{ requestId: string; usd: number }> {
  const totals = new Map<string, number>();
  for (const event of events) {
    if (!event.requestId || !Number.isFinite(event.usd) || event.usd <= 0) continue;
    totals.set(event.requestId, (totals.get(event.requestId) ?? 0) + event.usd);
  }

  return [...totals].map(([requestId, usd]) => ({ requestId, usd }));
}
