/**
 * JEDINA računica cene u celom projektu (STUDIO-CATALOG-V4 sekcija 1.3).
 * Čista funkcija: bez `ctx`, bez baze, bez sata, bez ijednog uvoza iz
 * `convex/_generated` - zato se isti fajl uvozi i u Convex i u browser, pa
 * cena na dugmetu i cena koju server naplati ne mogu da se raziđu.
 *
 * Ako negde u projektu nadješ drugu funkciju koja računa cenu, ona je bug.
 */

/** `0,865 (EUR/USD) × 2,5 (marža) × 100 (kredita po evru)` - STUDIO-CATALOG-V4 zaglavlje. */
export const CREDIT_FACTOR = 216.25;

export type PriceUnit = "image" | "second" | "chars1k" | "layer" | "minute" | "generation";

export type PriceRule = {
  unit: PriceUnit;

  /** Osnovna cena. `lookup` ima prednost nad njom kad oba postoje. */
  baseUsd?: number;

  /**
   * Konstantan dodatak PO GENERACIJI, ne po komadu (npr. Google thinking
   * tokeni: model misli jednom bez obzira na `num_images`). Zato se sabira
   * POSLE množenja količinom.
   */
  addUsd?: number;

  /** Množioci po parametru, primenjuju se redom. */
  multipliers?: Array<{ param: string; map: Record<string, number> }>;

  /**
   * Tabela za cene koje nisu monotone (GPT Image, Kling, Seedance tier).
   * Ključ = vrednosti parametara spojene sa "|" po redosledu iz `params`.
   */
  lookup?: { params: string[]; map: Record<string, number> };

  /** Parametar koji množi rezultat (trajanje, broj slojeva, broj slika). */
  quantityParam?: string;

  /** Kling lipsync se naplaćuje na pun peti sekund - video od 3 s košta kao 5 s. */
  roundUpTo?: number;

  /** Dodatne stavke preko besplatne kvote (referentne slike). */
  extras?: Array<{ param: string; freeCount: number; usdEach: number }>;

  /** Množilac koji zavisi od ulaznog režima, ne od parametra. Režim koji nije u mapi je 1. */
  modeMultipliers?: Record<string, number>;

  /**
   * Ceo drugi obračun za jedan režim. Katalog (2.6) kaže "Layerize ima svoje
   * pravilo" - drugi `unit`, drugi `baseUsd` i drugi `quantityParam` (`layers`
   * umesto `num_images`), a to nijedno polje iz sekcije 1.3 ne može da izrazi.
   * Ugnježdeno pravilo se koristi CELO umesto roditelja; ne meša se sa njim i
   * ne gleda se dublje od jednog nivoa.
   */
  modeRules?: Record<string, PriceRule>;
};

/**
 * Vrednost parametra -> deo ključa u `lookup`/`multipliers` mapi. Boolean je
 * "on"/"off" jer katalog tako piše Kling (`"720p|on|on"`) i MiniMax LoRA
 * (`{ "off": 1, "on": 1.25 }`), a switch kontrola šalje pravi boolean.
 * Vrednost koju ne umemo da pretvorimo u ključ je `null`, i pozivalac je
 * pretvara u grešku - nikad u nulu.
 */
function keyPart(value: unknown): string | null {
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  return null;
}

/**
 * Čita broj iz mape ključ->broj. `typeof !== "number"` hvata i nepostojeći
 * ključ i ključ koji dolazi sa `Object.prototype` (`"constructor"`,
 * `"toString"`): vrednosti parametara dolaze sa klijenta, pa bi bez ove
 * provere `map["constructor"]` vratio funkciju umesto `undefined`.
 */
function numberFromMap(map: Record<string, number>, key: string): number | null {
  if (!Object.hasOwn(map, key)) return null;
  const value = map[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Pravilo koje stvarno važi za dati režim (videti `modeRules`). */
function ruleForMode(rule: PriceRule, inputMode: string | undefined): PriceRule {
  // `Object.hasOwn` PRE čitanja: `inputMode` dolazi sa klijenta, pa bi
  // `modeRules["constructor"]` inače vratio funkciju umesto `undefined`.
  if (inputMode === undefined || !rule.modeRules) return rule;
  if (!Object.hasOwn(rule.modeRules, inputMode)) return rule;
  const scoped = rule.modeRules[inputMode];

  return scoped && typeof scoped === "object" ? scoped : rule;
}

function lookupKey(rule: PriceRule, params: Record<string, unknown>): string | null {
  if (!rule.lookup) return null;
  const parts: string[] = [];
  for (const param of rule.lookup.params) {
    const part = keyPart(params[param]);
    if (part === null) return null;
    parts.push(part);
  }

  return parts.join("|");
}

/**
 * Postoji li cena za IZABRANU KOMBINACIJU parametara, bez obzira na količinu.
 * Ovo je poluga za "Mini nema 1080p ni 4K": kombinacija `mini|1080p` prosto ne
 * postoji u `lookup` mapi, pa nema šta ni da se sakrije ručno - i UI i server
 * pitaju isto pitanje i dobijaju isti odgovor.
 *
 * Namerno NE gleda `quantityParam` ni `extras`: nepopunjeno trajanje je druga
 * vrsta greške i ne sme da prijavi rezoluciju kao nedostupnu.
 */
export function isCombinationPriceable(
  rule: PriceRule,
  params: Record<string, unknown>,
  inputMode?: string,
): boolean {
  const active = ruleForMode(rule, inputMode);

  if (active.lookup) {
    const key = lookupKey(active, params);
    if (key === null || numberFromMap(active.lookup.map, key) === null) return false;
  } else if (typeof active.baseUsd !== "number" || !Number.isFinite(active.baseUsd)) {
    return false;
  }

  for (const multiplier of active.multipliers ?? []) {
    const part = keyPart(params[multiplier.param]);
    if (part === null || numberFromMap(multiplier.map, part) === null) return false;
  }

  return true;
}

function baseUsdFor(rule: PriceRule, params: Record<string, unknown>): number {
  if (rule.lookup) {
    const key = lookupKey(rule, params);
    const found = key === null ? null : numberFromMap(rule.lookup.map, key);
    if (found === null) {
      throw new Error(`NEPOZNATA_KOMBINACIJA:${key ?? rule.lookup.params.join("|")}`);
    }

    return found;
  }

  if (typeof rule.baseUsd !== "number" || !Number.isFinite(rule.baseUsd)) {
    throw new Error("PRAVILO_BEZ_CENE");
  }

  return rule.baseUsd;
}

/**
 * Koliko izmerenih jedinica ide u JEDNU naplativu jedinicu pravila. Svuda je 1
 * osim kod `chars1k`: ElevenLabs tarifa (katalog 4.1) je $0,10 po HILJADI
 * znakova, a `quantityParam` je broj znakova - bez ovog deljenja bi jedan
 * pasus koštao kao hiljadu pasusa.
 *
 * Nepoznata jedinica pada na 1: bolje naplatiti po izmerenoj jedinici nego
 * podeliti cenu nečim što ne znamo.
 */
const QUANTITY_PER_UNIT: Record<PriceUnit, number> = {
  image: 1,
  second: 1,
  chars1k: 1000,
  layer: 1,
  minute: 1,
  generation: 1,
};

function quantityFor(rule: PriceRule, params: Record<string, unknown>): number {
  if (rule.quantityParam === undefined) return 1;

  const raw = params[rule.quantityParam];
  // Naplatiti baznu cenu za klip nepoznate dužine je tiho potkradanje kase,
  // pa se ovde baca umesto da se pada na 1.
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw new Error(`NEISPRAVNA_KOLICINA:${rule.quantityParam}`);
  }

  if (rule.roundUpTo !== undefined && rule.roundUpTo > 0) {
    return Math.ceil(raw / rule.roundUpTo) * rule.roundUpTo;
  }

  return raw;
}

/**
 * Stavke preko besplatne kvote (šesta referentna slika kod MiniMax-a, druga
 * ulazna slika kod Seedream-a). Sabiraju se na kraju, van količine: dodatna
 * ulazna slika se šalje jednom po generaciji, ne po izlaznoj slici.
 */
function extrasUsdFor(rule: PriceRule, params: Record<string, unknown>): number {
  let usd = 0;
  for (const extra of rule.extras ?? []) {
    const raw = params[extra.param];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const over = Math.floor(raw) - extra.freeCount;
    if (over > 0) usd += over * extra.usdEach;
  }

  return usd;
}

/**
 * Nabavna cena u dolarima za izabrane parametre i ulazni režim.
 *
 * Redosled je normativan i mora da ostane ovakav, jer se iz njega izvode sve
 * tabele u katalogu: `(osnova × množioci × množilac režima × količina) +
 * konstantan dodatak + dodatne stavke`. Provera na Nano Banani 2
 * (`baseUsd 0.067`, `addUsd 0.003`, 4K množilac 2): `0,067 × 2 + 0,003 =
 * 0,137` - tačno cifra iz kataloga, što ne bi bio slučaj da se `addUsd`
 * sabira pre množenja.
 *
 * Količina se pre množenja svodi na jedinicu pravila (`QUANTITY_PER_UNIT`) -
 * jedino `chars1k` tu nije 1.
 */
export function computeCostUsd(
  rule: PriceRule,
  params: Record<string, unknown>,
  inputMode?: string,
): number {
  const active = ruleForMode(rule, inputMode);

  let usd = baseUsdFor(active, params);

  for (const multiplier of active.multipliers ?? []) {
    const part = keyPart(params[multiplier.param]);
    const factor = part === null ? null : numberFromMap(multiplier.map, part);
    if (factor === null) throw new Error(`NEPOZNATA_VREDNOST_PARAMETRA:${multiplier.param}`);
    usd *= factor;
  }

  // Režim koji mapa ne pominje je množilac 1 - `modeMultipliers` postoji samo
  // da izdvoji režime koji se naplaćuju drugačije od podrazumevanog.
  if (inputMode !== undefined && active.modeMultipliers) {
    const modeFactor = numberFromMap(active.modeMultipliers, inputMode);
    if (modeFactor !== null) usd *= modeFactor;
  }

  usd *= quantityFor(active, params) / (QUANTITY_PER_UNIT[active.unit] ?? 1);
  usd += active.addUsd ?? 0;
  usd += extrasUsdFor(active, params);

  return usd;
}

/**
 * `ceil(nabavno × 216,25)`, i to ceil TAČNO JEDNOM, na kraju - zaokruživanje
 * po sekundi pa množenje trajanjem bi naplatilo do sekunde više nego što
 * pravilo kaže.
 *
 * Proizvod se pre `ceil`-a seče na šest decimala: `0,05 × 3 × 216,25` u
 * binarnom zapisu ume da ispadne `32,437500000000004`, a onda bi `ceil` dao
 * 33 umesto 33... i, gore, tamo gde proizvod treba da bude ceo broj, ceo
 * kredit više. Šest decimala je daleko ispod svake stvarne razlike u ceni, a
 * iznad svakog binarnog šuma.
 */
export function computeCredits(
  rule: PriceRule,
  params: Record<string, unknown>,
  inputMode?: string,
): number {
  return creditsFromUsd(computeCostUsd(rule, params, inputMode));
}

/**
 * Drugi i poslednji ulaz u istu formulu, izdvojen zbog poravnanja (X2): kad
 * provajder prijavi CENU a ne količinu, katalog nema šta da preračuna - a
 * krediti moraju da izađu iz istog `ceil`-a, jednom i na kraju. Bez ovoga bi
 * `ceil(C × 216,25)` postojao na dva mesta, a marža od 2,5× visi baš o tome da
 * postoji na jednom.
 */
export function creditsFromUsd(costUsd: number): number {
  return Math.ceil(Math.round(costUsd * CREDIT_FACTOR * 1e6) / 1e6);
}

/**
 * `models.priceRule` je JSON string u bazi. Sve što nije objekat sa poznatim
 * `unit`-om je `null` - pozivalac tada odbija posao umesto da nagadja cenu.
 * Oblik polja se NE proverava u dubinu: pravilo upisuje admin/seed, ne
 * korisnik, a `computeCostUsd` svaku nepoznatu vrednost ionako pretvara u
 * grešku umesto u nulu.
 */
const PRICE_UNITS = new Set<string>([
  "image",
  "second",
  "chars1k",
  "layer",
  "minute",
  "generation",
]);

export function parsePriceRule(raw: string): PriceRule | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const rule = parsed as PriceRule;
  if (typeof rule.unit !== "string" || !PRICE_UNITS.has(rule.unit)) return null;

  return rule;
}

/**
 * Seedance u `reference` režimu sa VIDEO ulazom (STUDIO-CATALOG-V4 3.4/3.5)
 * naplaćuje i ulazni i izlazni video, po sniženoj tarifi. Ovo je druga polovina
 * tog uslova - koliko sekundi uopšte ulazi u `duration`.
 *
 * **Ne poziva je niko, i to je namerno.** Prva polovina uslova - množilac 0,6 u
 * `modeMultipliers`-ima oba Seedance pravila - uklonjena je zato što je snižena
 * tarifa važila bez svoje osnove: ulazni video se nije naplaćivao, jer server
 * nije umeo da izmeri koliko traje. Dok tog merenja nema, Seedance se naplaćuje
 * po punoj tarifi, samo po izlaznom trajanju.
 *
 * Funkcija čeka pouzdano SERVERSKO merenje trajanja okačenog fajla (isti uslov
 * koji drži sedam modela sa merenom količinom ugašenim - videti
 * `resolveMeasuredQuantity` i `MERENJE_NIJE_DOSTUPNO`). Kad merenje postoji,
 * vraćaju se zajedno: prvo ovaj sabirak, pa množilac.
 */
export function referenceVideoBillableSeconds(
  outputSeconds: number,
  inputVideoSeconds: number,
): number {
  const input = Number.isFinite(inputVideoSeconds) && inputVideoSeconds > 0 ? inputVideoSeconds : 0;

  return outputSeconds + input;
}

/**
 * Ključ režima za cenu nije uvek isti kao `inputMode`: `reference` se
 * naplaćuje po sniženoj tarifi SAMO kad je medju referencama video
 * (STUDIO-CATALOG-V4 3.4). Zato pravilo poznaje `reference_with_video`, a
 * `inputModes` modela i dalje poznaje samo `reference`.
 */
export const REFERENCE_WITH_VIDEO_MODE = "reference_with_video";

export function pricingModeFor(inputMode: string, hasVideoInput: boolean): string {
  return inputMode === "reference" && hasVideoInput ? REFERENCE_WITH_VIDEO_MODE : inputMode;
}

export type PriceEdit = { baseUsd?: number; addUsd?: number };

export type PriceEditResult = { ok: true; rule: PriceRule } | { ok: false; reason: string };

/**
 * Izmena nabavne cene iz admin ekrana (S7): jedan broj pomera celu porodicu
 * varijanti, jer se sve cene računaju iz pravila.
 *
 * Dve stvari se ODBIJAJU umesto da tiho ne urade ništa:
 * - `baseUsd` na pravilu koje cenu čita iz `lookup` tabele - tabela ima
 *   prednost (katalog 1.3), pa bi upisan broj stajao u redu a ne bi se video
 *   ni u jednoj ceni;
 * - negativan broj - nabavna cena ispod nule je marža koja raste sa
 *   potrošnjom.
 *
 * Ugnježdena pravila (`modeRules`, layerize kod Seedream-a 5 Pro) se NE diraju:
 * to je drugi obračun sa svojom osnovom, i menja se svojim redom. Admin ekran
 * prikazuje cenu za svaku kombinaciju, pa se odmah vidi šta se pomerilo a šta nije.
 */
export function applyPriceEdit(rule: PriceRule, edit: PriceEdit): PriceEditResult {
  const next: PriceRule = { ...rule };

  if (edit.baseUsd !== undefined) {
    if (!Number.isFinite(edit.baseUsd) || edit.baseUsd < 0) return { ok: false, reason: "NEISPRAVNA_CENA" };
    if (rule.lookup) return { ok: false, reason: "CENA_IZ_TABELE" };
    next.baseUsd = edit.baseUsd;
  }

  if (edit.addUsd !== undefined) {
    if (!Number.isFinite(edit.addUsd) || edit.addUsd < 0) return { ok: false, reason: "NEISPRAVNA_CENA" };
    if (edit.addUsd === 0) delete next.addUsd;
    else next.addUsd = edit.addUsd;
  }

  return { ok: true, rule: next };
}
