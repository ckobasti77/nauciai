import type { Locale } from "./i18n";

export type CreditPackRow = {
  slug: string;
  priceEurCents: number;
  credits: number;
  bonusPercent: number;
  kind: "pack" | "plan";
  planTier?: "basic" | "premium";
};

export type CatalogModelRow = {
  kind: "image" | "video" | "audio";
  creditCost: number;
  badge?: "preporuceno" | "skupo" | "novo";
};

export type CreditLotRow = {
  remaining: number;
  expiresAt: number;
};

export type ReferenceCosts = {
  image: number | null;
  video: number | null;
  audio: number | null;
};

export type CreditTransactionType =
  | "purchase"
  | "spend"
  | "refund"
  | "bonus"
  | "trial"
  | "expiry"
  | "admin_adjust";

/** Lot koji ističe unutar ovog prozora dobija svoj red iznad paketa. */
export const EXPIRY_WARNING_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Referentna cena po vrsti modela: onaj sa badge-om "preporuceno", a kad ga
 * nema - najjeftiniji. Ulaz je ono što `modelCatalog:listModels` vrati, dakle
 * samo UKLJUČENI modeli. Zato stranica danas ne obećava "9 video klipova" dok
 * su video modeli isključeni (Faza B), a počne da ih pominje čim se uključe -
 * bez ijedne izmene koda.
 */
export function referenceCreditCosts(models: CatalogModelRow[]): ReferenceCosts {
  const pick = (kind: CatalogModelRow["kind"]) => {
    const ofKind = models.filter((model) => model.kind === kind && model.creditCost > 0);
    if (ofKind.length === 0) return null;
    const recommended = ofKind.find((model) => model.badge === "preporuceno");
    return recommended ? recommended.creditCost : Math.min(...ofKind.map((model) => model.creditCost));
  };

  return { image: pick("image"), video: pick("video"), audio: pick("audio") };
}

/** Koliko celih generacija se plati datim brojem kredita. */
export function unitsFor(credits: number, cost: number | null): number {
  if (!cost || cost <= 0) return 0;
  return Math.floor(credits / cost);
}

function pluralSr(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function imagesLabel(count: number, locale: Locale): string {
  if (locale === "sr") return `${count} ${pluralSr(count, "slika", "slike", "slika")}`;
  return `${count} ${count === 1 ? "image" : "images"}`;
}

export function videosLabel(count: number, locale: Locale): string {
  if (locale === "sr") return `${count} ${pluralSr(count, "video klip", "video klipa", "video klipova")}`;
  return `${count} ${count === 1 ? "video clip" : "video clips"}`;
}

export function imageGenerationsLabel(count: number, locale: Locale): string {
  if (locale === "sr") {
    return `${count} ${pluralSr(count, "generacija slike", "generacije slike", "generacija slika")}`;
  }
  return `${count} ${count === 1 ? "image generation" : "image generations"}`;
}

/** "otprilike: 25 slika ili 9 video klipova"; `null` kad katalog nema nijednu referencu. */
export function packValueLine(credits: number, reference: ReferenceCosts, locale: Locale): string | null {
  const parts: string[] = [];
  const images = unitsFor(credits, reference.image);
  const videos = unitsFor(credits, reference.video);

  if (images > 0) parts.push(imagesLabel(images, locale));
  if (videos > 0) parts.push(videosLabel(videos, locale));
  if (parts.length === 0) return null;

  return `${locale === "sr" ? "otprilike" : "roughly"}: ${parts.join(locale === "sr" ? " ili " : " or ")}`;
}

/**
 * Najviše kredita koje isti novac (ili manje) kupuje u paketu - to je broj koji
 * stoji uz Premium karticu. Računa se iz kataloga, jer cena po pravilu iz
 * STUDIO-PLAN 2.5 nikad ne sme da bude prepisana u kod.
 */
export function bestPackCreditsWithin(packs: CreditPackRow[], budgetEurCents: number): number | null {
  const affordable = packs.filter((pack) => pack.kind === "pack" && pack.priceEurCents <= budgetEurCents);
  if (affordable.length === 0) return null;
  return Math.max(...affordable.map((pack) => pack.credits));
}

/**
 * Lotovi koji ističu u narednih 30 dana, spojeni po danu isteka. Sabiranje svih
 * u jedan red bi uz kasniji lot ispisalo raniji datum, dakle broj koji nije
 * istinit - a upozorenje o isteku je jedino zbog datuma i napisano.
 */
export function expiringSoon(
  lots: CreditLotRow[],
  now: number,
): Array<{ credits: number; expiresAt: number }> {
  const byDay = new Map<string, { credits: number; expiresAt: number }>();

  for (const lot of lots) {
    if (lot.remaining <= 0) continue;
    if (lot.expiresAt <= now || lot.expiresAt - now >= EXPIRY_WARNING_MS) continue;

    const day = new Date(lot.expiresAt).toISOString().slice(0, 10);
    const row = byDay.get(day);
    if (row) {
      row.credits += lot.remaining;
      row.expiresAt = Math.min(row.expiresAt, lot.expiresAt);
    } else {
      byDay.set(day, { credits: lot.remaining, expiresAt: lot.expiresAt });
    }
  }

  return [...byDay.values()].sort((a, b) => a.expiresAt - b.expiresAt);
}

export function formatEur(cents: number, locale: Locale): string {
  const value = (cents / 100).toFixed(2);
  return `${locale === "sr" ? value.replace(".", ",") : value} EUR`;
}

const TRANSACTION_LABELS: Record<CreditTransactionType, { sr: string; en: string }> = {
  purchase: { sr: "Kupovina", en: "Purchase" },
  spend: { sr: "Potrošnja", en: "Spend" },
  refund: { sr: "Povraćaj", en: "Refund" },
  bonus: { sr: "Bonus", en: "Bonus" },
  trial: { sr: "Probni krediti", en: "Trial" },
  expiry: { sr: "Istek", en: "Expiry" },
  admin_adjust: { sr: "Ručna korekcija", en: "Manual adjustment" },
};

export function transactionTypeLabel(type: CreditTransactionType, locale: Locale): string {
  return TRANSACTION_LABELS[type][locale];
}

/** Iznos uvek nosi znak, i kad je pozitivan - inače se dodela i potrošnja čitaju isto. */
export function signedAmount(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}
