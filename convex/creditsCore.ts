/**
 * Čista logika kredit-ledgera: bez `ctx`, bez baze, bez čitanja sata.
 * Ovde se novac računa, u `credits.ts` se samo upisuje.
 */

export type Lot = { id: string; remaining: number; expiresAt: number };

export type SpendStep = { lotId: string; take: number };

export type PromptValidation = { ok: true } | { ok: false; reason: string };

/** Svaki kredit ističe 12 meseci od dodele, bez obzira na izvor (STUDIO-PLAN D.2). */
export const CREDIT_LIFETIME_MONTHS = 12;

/** Jednokratno, na prvoj uspešnoj uplati, za oba plana (STUDIO-PLAN D.1). */
export const WELCOME_BONUS_CREDITS = 150;

/** STUDIO-PLAN 4.4 - gornja granica dužine prompta. */
export const MAX_PROMPT_LENGTH = 2000;

/** Krediti su celi brojevi; pola kredita ne postoji. */
export function isValidCreditAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0;
}

function isUsable(lot: Lot, now: number): boolean {
  return lot.expiresAt > now && lot.remaining > 0;
}

/** Zbir onoga što se u trenutku `now` stvarno može potrošiti. */
export function usableBalance(lots: Lot[], now: number): number {
  return lots.reduce((sum, lot) => (isUsable(lot, now) ? sum + lot.remaining : sum), 0);
}

/**
 * FIFO plan trošenja: prvo lot koji pre ističe, pa `id` kao tie-breaker da bi
 * plan bio deterministički. Istekli lotovi se ne broje uopšte.
 * `null` znači "nema dovoljno" - pozivalac tada NE SME ništa da upiše.
 */
export function planSpend(lots: Lot[], amount: number, now: number): SpendStep[] | null {
  if (!isValidCreditAmount(amount)) return null;

  const usable = lots
    .filter((lot) => isUsable(lot, now))
    .sort((a, b) => a.expiresAt - b.expiresAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const plan: SpendStep[] = [];
  let left = amount;
  for (const lot of usable) {
    if (left === 0) break;
    const take = Math.min(lot.remaining, left);
    plan.push({ lotId: lot.id, take });
    left -= take;
  }

  return left === 0 ? plan : null;
}

/**
 * `grantedAt` + 12 kalendarskih meseci u UTC-u, uz čuvanje doba dana. Dan se
 * seče na poslednji postojeći dan ciljnog meseca (29.02.2028 -> 28.02.2029),
 * pa istek nikad ne odluta u naredni mesec.
 */
export function computeExpiry(grantedAt: number): number {
  const granted = new Date(grantedAt);
  const monthOffset = granted.getUTCMonth() + CREDIT_LIFETIME_MONTHS;
  const targetYear = granted.getUTCFullYear() + Math.floor(monthOffset / 12);
  const targetMonth = ((monthOffset % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  return Date.UTC(
    targetYear,
    targetMonth,
    Math.min(granted.getUTCDate(), lastDayOfTargetMonth),
    granted.getUTCHours(),
    granted.getUTCMinutes(),
    granted.getUTCSeconds(),
    granted.getUTCMilliseconds(),
  );
}

/**
 * Gruba prva linija odbrane, po zabranama iz STUDIO-PLAN 3.3 (prosleđena fal
 * Acceptable Use Policy): NSFW, deepfake stvarnih osoba, sadržaj sa
 * maloletnicima, ilegalan sadržaj. Pojmovi su već normalizovani (mala slova,
 * bez dijakritika) i porede se od početka reči, pa koren "porn" hvata i
 * "pornografija". Namerno bez kratkih višeznačnih korena ("gol" je i gol na
 * fudbalu) - lažno odbijen prompt košta poverenje isto koliko propušten.
 */
const BLOCKED_TERMS = [
  // NSFW
  "porn",
  "hentai",
  "nsfw",
  "xxx",
  "erotik",
  "erotic",
  "seksualn",
  "sexual",
  "naked",
  "nude",
  "gola devojka",
  "gola zena",
  "golo telo",
  "goli muskarac",
  // maloletnici
  "csam",
  "loli",
  "shota",
  "underage",
  "maloletnick",
  "child porn",
  "child sexual",
  "child abuse",
  "decija pornografija",
  "decja pornografija",
  "golo dete",
  "gola deca",
  "zlostavljanje dece",
  // deepfake stvarnih osoba
  "deepfake",
  "deep fake",
  "dipfejk",
  "faceswap",
  "face swap",
  "zamena lica",
  "revenge porn",
  "nonconsensual",
  // ilegalan sadržaj
  "napravi bombu",
  "kako napraviti bombu",
  "bomb making",
  "how to make a bomb",
  "teroristick",
  "terrorist attack",
  "falsifikovan novac",
  "counterfeit money",
  "kako napraviti drogu",
  "how to make meth",
];

/**
 * Mala slova, bez dijakritika, sve što nije slovo ili cifra postaje razmak,
 * pa se rezultat oivičuje razmacima. Tako `" " + pojam` može da se traži kao
 * podniz, a poređenje ostaje vezano za početak reči.
 */
function normalizeForModeration(text: string): string {
  const stripped = text
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return ` ${stripped.replace(/[^a-z0-9]+/g, " ").trim()} `;
}

export function validatePrompt(text: string): PromptValidation {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "PRAZAN_PROMPT" };
  if (trimmed.length > MAX_PROMPT_LENGTH) return { ok: false, reason: "PREDUGACAK_PROMPT" };

  const normalized = normalizeForModeration(trimmed);
  if (BLOCKED_TERMS.some((term) => normalized.includes(` ${term}`))) {
    return { ok: false, reason: "ZABRANJEN_POJAM" };
  }

  return { ok: true };
}
