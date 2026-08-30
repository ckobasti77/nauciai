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

/**
 * Ključ idempotencije bonusa visi na KORISNIKU, ne na fakturi. Sa `invoice.id`
 * je otkazivanje pa ponovna pretplata značilo novih 150 kredita - a uz
 * `allow_promotion_codes` i kupon od 100%, faktura na 0 € se i dalje vodi kao
 * plaćena, pa je to bila besplatna petlja.
 */
export function welcomeBonusKey(userId: string): string {
  return `welcome:${userId}`;
}

/**
 * Bonus dobrodošlice JAVNOG Studija (studio-public F2): dodeljuje se kroz
 * `studio.claimSignupBonus` TEK posle potvrde emaila, tačno jednom po
 * korisniku. ODLUKA o iznosu: 25 kredita = 2-3 najjeftinije slike iz v4
 * kataloga (BytePlus ~5 kr, Seedream ~8-9 kr po `creditsFromUsd` nad seed
 * `baseUsd`), a NIJEDAN video (najjeftiniji je ~55 kr) - dovoljno da se
 * proizvod oseti, premalo da se farmuje. Odvojen izvor od `welcome_bonus`
 * (150, prva plaćena pretplata): korisnik koji je uzeo signup bonus i dalje
 * dobija subscription bonus kad plati - dva različita obećanja, dva ključa.
 */
export const SIGNUP_BONUS_CREDITS = 25;

/** Isti obrazac kao `welcomeBonusKey` - idempotencija visi na korisniku. */
export function signupBonusKey(userId: string): string {
  return `signup:${userId}`;
}

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

/**
 * `maxLength` postoji zbog v4 kataloga: ElevenLabs `text` kontrola ide do
 * 5 000 znakova (STUDIO-CATALOG-V4 4.1), a `MAX_PROMPT_LENGTH` je granica
 * prompta za slike. Podrazumevana vrednost je stara granica, pa se ni jedan
 * postojeći pozivalac ne ponaša drugačije - i moderacija se u oba slučaja
 * radi nad CELIM tekstom, ne nad odsečenim.
 */
export function validatePrompt(text: string, maxLength = MAX_PROMPT_LENGTH): PromptValidation {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "PRAZAN_PROMPT" };
  if (trimmed.length > maxLength) return { ok: false, reason: "PREDUGACAK_PROMPT" };

  const normalized = normalizeForModeration(trimmed);
  if (BLOCKED_TERMS.some((term) => normalized.includes(` ${term}`))) {
    return { ok: false, reason: "ZABRANJEN_POJAM" };
  }

  return { ok: true };
}

// ── Stripe -> grantovi ─────────────────────────────────────────────────────

/**
 * Jedan grant koji webhook prosleđuje `applyStripeGrant`-u, bez `syncSecret`.
 * `stripeInvoiceId` / `stripeSessionId` su ujedno i ključ idempotencije, pa
 * tačno jedan od njih mora da bude postavljen.
 */
export type StripeGrant = {
  userId: string;
  amount: number;
  source: "purchase" | "plan_grant" | "welcome_bonus";
  stripeInvoiceId?: string;
  stripeSessionId?: string;
  packId?: string;
};

type StripeMetadata = Record<string, string> | null | undefined;

function trimmed(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

/**
 * `planSlug` sa pretplate koja je zaista Studio plan. Pretplate na kurseve
 * (postojeći flow) nemaju `kind` u metapodacima, pa uvek daju `null` i nikad
 * ne dobiju kredite.
 */
export function studioPlanSlug(metadata: StripeMetadata): string | null {
  if (metadata?.kind !== "plan") return null;
  return trimmed(metadata.planSlug) ?? null;
}

/**
 * Krediti za jednu plaćenu `checkout.session.completed` sesiju paketa. Iznos se
 * čita iz metapodataka sesije, jer je to ponuda koju je korisnik prihvatio - a
 * ne trenutno stanje `creditPacks` reda, koje je admin u međuvremenu mogao da
 * promeni. Prazan niz znači "ovo nije (ispravan) paket kredita".
 */
export function creditPackGrants(session: {
  sessionId: string;
  metadata: StripeMetadata;
}): StripeGrant[] {
  const metadata = session.metadata;
  if (metadata?.kind !== "credit_pack") return [];

  const userId = trimmed(metadata.userId);
  const sessionId = trimmed(session.sessionId);
  const amount = Number(metadata.credits);
  if (!userId || !sessionId || !isValidCreditAmount(amount)) return [];

  return [
    {
      userId,
      amount,
      source: "purchase",
      stripeSessionId: sessionId,
      packId: trimmed(metadata.packId),
    },
  ];
}

/**
 * Krediti za jednu plaćenu `invoice.paid` fakturu Studio plana. Mesečna doza
 * visi na fakturi, ne na `checkout.session.completed`, jer taj event puca samo
 * pri prvom plaćanju (STUDIO-PLAN D.5). Ključ idempotencije doze je
 * `invoice.id`, a bonusa `welcome:<userId>` - dva odvojena lota koja se
 * ponavljaju nezavisno jedan od drugog.
 *
 * `planCredits <= 0` (Basic nema mesečnu dozu) preskače dozu, ali ne i bonus.
 *
 * `amountPaid` je iznos koji je Stripe stvarno naplatio, u najmanjoj jedinici
 * valute. Faktura na 0 € (kupon od 100%) je i dalje `invoice.paid` sa novim
 * `invoice.id` svakog meseca, pa bi bez ove provere doza tekla besplatno i
 * neograničeno - polje je zato obavezno, da ga nov pozivalac ne zaboravi.
 */
export function invoicePaidGrants(invoice: {
  invoiceId: string;
  billingReason: string | null | undefined;
  subscriptionMetadata: StripeMetadata;
  planCredits: number;
  planPackId?: string;
  amountPaid: number | null | undefined;
}): StripeGrant[] {
  if (!studioPlanSlug(invoice.subscriptionMetadata)) return [];
  if (typeof invoice.amountPaid !== "number" || invoice.amountPaid <= 0) return [];

  const userId = trimmed(invoice.subscriptionMetadata?.userId);
  const invoiceId = trimmed(invoice.invoiceId);
  if (!userId || !invoiceId) return [];

  const grants: StripeGrant[] = [];
  if (isValidCreditAmount(invoice.planCredits)) {
    grants.push({
      userId,
      amount: invoice.planCredits,
      source: "plan_grant",
      stripeInvoiceId: invoiceId,
      packId: invoice.planPackId,
    });
  }
  if (invoice.billingReason === "subscription_create") {
    grants.push({
      userId,
      amount: WELCOME_BONUS_CREDITS,
      source: "welcome_bonus",
      stripeInvoiceId: welcomeBonusKey(userId),
    });
  }

  return grants;
}

// ── Stripe -> povraćaji ────────────────────────────────────────────────────

/**
 * `refund` je vraćen novac, `dispute` je osporena uplata. Oba oduzimaju kredite
 * iste uplate, ali `dispute` uz to i zaključava nalog: chargeback traje
 * nedeljama, a za to vreme se ne sme generisati na tudji račun.
 */
export type StripeReversalKind = "refund" | "dispute";

/**
 * Ono što webhook prosleđuje `applyStripeReversal`-u, bez `syncSecret`.
 * `eventId` je ključ idempotencije SAMOG DOGADJAJA (Stripe isti dogadjaj
 * isporučuje ponovo posle svake 500-ke), a `stripeInvoiceId`/`stripeSessionId`
 * je ključ pod kojim je lot otvoren - tačno jedan od ta dva mora da postoji.
 */
export type StripeReversal = {
  eventId: string;
  kind: StripeReversalKind;
  stripeInvoiceId?: string;
  stripeSessionId?: string;
};

/**
 * Po kom ključu se traži lot koji je osporena uplata otvorila.
 *
 * Faktura ima prednost nad sesijom: naplata pretplate otvara lot pod
 * `invoice.id` (`invoicePaidGrants`), pa i kad ista naplata ima i sesiju,
 * lot pod sesijom ne postoji. Jednokratan paket kredita nema fakturu i ide
 * pod `checkout.session.id` (`creditPackGrants`).
 *
 * `null` znači "ovoj uplati se ne zna ključ" - naplata koja nikad nije
 * dodelila kredite (pretplata na kurs) izgleda upravo tako, i webhook je zato
 * preskače umesto da baca.
 */
export function chargeReversal(charge: {
  eventId: string;
  kind: StripeReversalKind;
  invoiceId?: string | null;
  sessionId?: string | null;
}): StripeReversal | null {
  const eventId = trimmed(charge.eventId);
  if (!eventId) return null;

  const invoiceId = trimmed(charge.invoiceId ?? undefined);
  if (invoiceId) return { eventId, kind: charge.kind, stripeInvoiceId: invoiceId };

  const sessionId = trimmed(charge.sessionId ?? undefined);
  if (sessionId) return { eventId, kind: charge.kind, stripeSessionId: sessionId };

  return null;
}
