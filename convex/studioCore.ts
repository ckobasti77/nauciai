/**
 * Čista logika Studija: bez `ctx`, bez baze, bez čitanja sata. Ovde se
 * odlučuje koliko posao košta, u `studio.ts` se samo upisuje.
 */

/** STUDIO-PLAN 4.4 - najviše 3 posla u letu (`reserved` + `running`). */
export const MAX_ACTIVE_JOBS = 3;

/** STUDIO-PLAN 4.4 - najviše 50 generacija po korisniku dnevno. */
export const MAX_DAILY_GENERATIONS = 50;

/**
 * Kill switch iz STUDIO-PLAN 4.4; red živi u `platformFlags`. Ovde, a ne u
 * `studio.ts`, jer ga čita i admin ekran (P8) - dva query/mutation modula ne
 * smeju da drže dva odvojena literala za isti ključ.
 */
export const STUDIO_FLAG_KEY = "studio_enabled";

/**
 * Uloge koje Studio vide i bez upisa na kurs. Admin i moderator su ti koji
 * Studio proveravaju - kad bi i njih zaustavljao `enrollment`, jedini način da
 * se uđe u sopstvenu platformu bio bi upis na sopstveni kurs.
 */
export function isStudioStaff(role: unknown): boolean {
  return role === "admin" || role === "moderator";
}

/**
 * Naplata za Studio još ne postoji: Stripe ne radi u Srbiji, a srpski paywall
 * čeka da se otvori firma. Dok toga nema, svaka generacija je pravi trošak kod
 * fal-a koji niko ne plaća, pa je Studio PRIVREMENO zatvoreno testiranje - samo
 * za osoblje, bez obzira na upis. Logika upisa ispod ostaje netaknuta jer se
 * vraća čim naplata proradi: da se ugasi, promeni SAMO ovaj red u
 * `STUDIO_STAFF_ONLY = false`.
 */
export const STUDIO_STAFF_ONLY = true;

/**
 * Jedino mesto na kojem se odlučuje sme li neko u Studio: aktivan upis, ili
 * uloga koja upis ne traži. Isti odgovor dobijaju `createJob` (koji baca
 * `NEMA_PRISTUPA`) i `getStudioState` (po kojem se gasi dugme), pa UI i server ne
 * mogu da tvrde suprotno.
 *
 * Dok je `STUDIO_STAFF_ONLY` upaljen, upis se uopšte ne pita - prolazi samo
 * osoblje. To je PRIVREMENO (vidi komentar iznad fleg): kad se ugasi, upis se
 * vraća kao dovoljan uslov, u potpunosti kao pre.
 *
 * **Pristup nije popust.** Krediti se skidaju istom putanjom svakome - videti
 * `applySpend` u `createJob`-u, gde uloga ne učestvuje.
 *
 * Treći argument postoji SAMO za `studioCore.test.ts`: `STUDIO_STAFF_ONLY` je
 * `const`, pa ga test ne može da promeni izvana bez ovoga - a upravo taj test
 * ("gašenje flega vraća staro ponašanje u potpunosti") je jedini dokaz da je
 * gašenje flega dovoljno. `createJob` i `getStudioState` ga NE prosleđuju -
 * za njih uvek važi pravi fleg.
 */
export function hasStudioAccess(
  role: unknown,
  enrollment: unknown,
  staffOnly: boolean = STUDIO_STAFF_ONLY,
): boolean {
  if (staffOnly) return isStudioStaff(role);
  return enrollment !== null && enrollment !== undefined ? true : isStudioStaff(role);
}

// ── JAVNI STUDIO (studio-public F1) ─────────────────────────────────────────

/**
 * Fleg koji Studio otvara ŠIROJ javnosti: svaki prijavljen korisnik sa
 * potvrđenim emailom, bez upisa na kurs. Red u `platformFlags`, ali sa
 * SUPROTNIM podrazumevanjem od `studio_enabled`: kill switch bez reda znači
 * "radi" (osoblje ne sme da ostane zaključano zbog praznog seed-a), a javni
 * fleg bez reda znači "OFF" — svet se ne pušta unutra dok Jovan ručno ne
 * upiše red preko `studioAdmin.setStudioPublicFlag`. Zato ovaj ključ NE SME
 * u `platformFlagKeys` u `seed.ts` — seed ubacuje `enabled: true`.
 */
export const STUDIO_PUBLIC_FLAG_KEY = "studio_public";

/**
 * Numerički konfig redovi u istoj tabeli kao fleg (zahtev brifa). Override
 * važi samo kad je red `enabled: true` sa celim brojem > 0 — `enabled: false`
 * je besplatan "vrati na podrazumevano" bez brisanja reda.
 */
export const STUDIO_PUBLIC_CONFIG_KEYS = {
  maxConcurrentJobs: "studio_public_max_concurrent_jobs",
  maxJobsPerMinute: "studio_public_max_jobs_per_minute",
  maxJobsPerDay: "studio_public_max_jobs_per_day",
  maxDailyCredits: "studio_public_max_daily_credits",
} as const;

/**
 * Podrazumevani javni limiti (brif F2.4): 2 istovremena posla, 6 u minutu,
 * 200 dnevno, 500 kredita potrošnje dnevno (≈ 5 € maloprodajno — soft cap sa
 * jasnom porukom, krediti ostaju). Osoblje NIKAD ne ide kroz ove limite —
 * vidi `resolveStudioLimits`.
 */
export const PUBLIC_LIMIT_DEFAULTS = {
  maxConcurrentJobs: 2,
  maxJobsPerMinute: 6,
  maxJobsPerDay: 200,
  maxDailyCredits: 500,
} as const;

/** Učitani override-ovi iz `platformFlags`; odsutno polje = podrazumevano. */
export type StudioPublicConfig = Partial<{
  maxConcurrentJobs: number;
  maxJobsPerMinute: number;
  maxJobsPerDay: number;
  maxDailyCredits: number;
}>;

/** `null` = limit se ne primenjuje (osoblje nema minutni ni kreditni kap). */
export type ResolvedStudioLimits = {
  maxConcurrentJobs: number;
  maxJobsPerMinute: number | null;
  maxJobsPerDay: number;
  maxDailyCredits: number | null;
};

function positiveInt(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Osoblje zadržava DANAŠNJE granice bez obzira na fleg (3 posla, 50/dan, bez
 * minutnog i kreditnog kapa) — "fleg OFF ⇒ ništa se ne menja" time važi
 * trivijalno, a admin/moderator testiranje kataloga ne udara u javne kapove.
 * Javni korisnici postoje kao pozivaoci tek kad je fleg ON i dobijaju javni
 * okvir {2, 6, 200, 500} sa config override-om.
 */
export function resolveStudioLimits(
  config: StudioPublicConfig,
  isStaff: boolean,
): ResolvedStudioLimits {
  if (isStaff) {
    return {
      maxConcurrentJobs: MAX_ACTIVE_JOBS,
      maxJobsPerMinute: null,
      maxJobsPerDay: MAX_DAILY_GENERATIONS,
      maxDailyCredits: null,
    };
  }
  return {
    maxConcurrentJobs:
      positiveInt(config.maxConcurrentJobs) ?? PUBLIC_LIMIT_DEFAULTS.maxConcurrentJobs,
    maxJobsPerMinute:
      positiveInt(config.maxJobsPerMinute) ?? PUBLIC_LIMIT_DEFAULTS.maxJobsPerMinute,
    maxJobsPerDay: positiveInt(config.maxJobsPerDay) ?? PUBLIC_LIMIT_DEFAULTS.maxJobsPerDay,
    maxDailyCredits:
      positiveInt(config.maxDailyCredits) ?? PUBLIC_LIMIT_DEFAULTS.maxDailyCredits,
  };
}

/**
 * Predikat "potvrđen email" ZA STUDIO — namerno širi od kursnog
 * `emailVerifiedForCourses` (helpers.ts / profiles.ts), koji za Google-only
 * naloge ignoriše `emailVerificationTime`. Studio ga priznaje: Google je
 * inbox već verifikovao (`email_verified` claim iz IdP-a, vidi
 * `auth.ts` profile()), pa "Probaj besplatno → Google prijava → Studio" ne
 * sme da traži drugu potvrdu. Kursni predikat se NE dira — on čuva i
 * postavljanje lozinke, gde je app-kontrolisan dokaz o inboxu namerno stroži.
 */
export function isEmailVerifiedForStudio(
  user: {
    appEmailVerificationTime?: number;
    passwordEmailVerificationTime?: number;
    emailVerificationTime?: number;
  } | null,
): boolean {
  if (!user) return false;
  return Boolean(
    user.appEmailVerificationTime ||
      user.passwordEmailVerificationTime ||
      user.emailVerificationTime,
  );
}

export type StudioAccessReason = "NEMA_PRISTUPA" | "EMAIL_NIJE_POTVRDJEN";

export type StudioAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: StudioAccessReason };

/**
 * Jedina tačka odluke o pristupu otkad postoji javni fleg — `createJob`,
 * `getStudioState` i gejtovane pomoćne mutacije zovu OVU funkciju, nikad više
 * `hasStudioAccess` direktno. Fleg OFF grana DELEGIRA na netaknut
 * `hasStudioAccess`, pa X8 semantika (`STUDIO_STAFF_ONLY`, upis kao uspavana
 * formula, treći test-only argument) važi u potpunosti i dalje. Fleg ON:
 * osoblje uvek; ostali sa potvrđenim emailom (upisan-ali-nepotvrđen NE
 * zaobilazi potvrdu — brif traži "prijavljen korisnik sa POTVRĐENIM emailom").
 */
export function decideStudioAccess(
  input: {
    role: unknown;
    enrollment: unknown;
    publicEnabled: boolean;
    emailVerified: boolean;
  },
  staffOnly: boolean = STUDIO_STAFF_ONLY,
): StudioAccessDecision {
  if (input.publicEnabled) {
    if (isStudioStaff(input.role)) return { allowed: true };
    return input.emailVerified
      ? { allowed: true }
      : { allowed: false, reason: "EMAIL_NIJE_POTVRDJEN" };
  }
  return hasStudioAccess(input.role, input.enrollment, staffOnly)
    ? { allowed: true }
    : { allowed: false, reason: "NEMA_PRISTUPA" };
}

/** Ključ reda u `studioUsageDaily`: UTC dan, "2026-08-18". */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** UTC ponoć dana kom `now` pripada - donja granica za "poslovi napravljeni danas". */
export function dayStart(now: number): number {
  return new Date(`${dayKey(now)}T00:00:00.000Z`).getTime();
}

/**
 * `generationJobs.params` je JSON objekat koji ide fal-u (prompt, seed,
 * trajanje...). Sve što nije JSON objekat je `null` - pozivalac tada odbija
 * posao umesto da nagađa šta je klijent mislio.
 */
export function parseParams(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

/** Prompt koji ide u moderaciju; nedostajuće polje je prazan string, ne greška. */
export function extractPrompt(params: Record<string, unknown>): string {
  return typeof params.prompt === "string" ? params.prompt : "";
}

/**
 * FNV-1a u dve trake po 32 bita -> 16 heksadecimalnih znakova. Namerno nije
 * kriptografski: `generationJobs.promptHash` služi samo za dedup i grupisanje
 * u moderaciji, a ovako je funkcija čista, sinhrona i deterministička (bez
 * `crypto.subtle`, koji je async i vezan za runtime).
 */
export function promptHash(prompt: string): string {
  let low = 0x811c9dc5;
  let high = 0x01000193;
  for (let index = 0; index < prompt.length; index += 1) {
    const code = prompt.charCodeAt(index);
    low = Math.imul(low ^ code, 0x01000193) >>> 0;
    high = Math.imul(high ^ code, 0x85ebca6b) >>> 0;
  }

  return low.toString(16).padStart(8, "0") + high.toString(16).padStart(8, "0");
}

/**
 * Vlasnik posla za oči MODERATORA (X4, nalaz N1, tačka 3): dovoljno da se
 * poslovi jednog naloga izdvoje u filteru, a nedovoljno da se sazna ko je taj
 * nalog. Mejlove vidi samo admin.
 *
 * Šest heksadecimalnih znakova `promptHash`-a - ista funkcija, jer je već ovde
 * i jer joj je posao isti: stabilan, sinhron, deterministički otisak. Nije
 * kriptografska i ne pretvara se da jeste; `userId` se iz nje ne vraća, ali se
 * ni ne tvrdi da je neprobojna.
 */
export function ownerHandle(userId: string): string {
  return promptHash(userId).slice(0, 6);
}

export type PricedModel = {
  creditCost: number;
  costPerSecond?: number;
};

/**
 * Koliko izlaza posao naručuje. fal naplaćuje po IZLAZNOJ slici, ne po
 * zahtevu, pa je `num_images: 4` četiri puta veći račun - i cena mora da ga
 * prati. Polje koje šema ne izlaže znači jedan izlaz. Ulaz su OČIŠĆENI
 * parametri, dakle vrednost je već odsečena na `min`/`max` iz šeme.
 */
export function requestedImageCount(params: Record<string, unknown>): number {
  const count = params.num_images;
  if (typeof count !== "number" || !Number.isFinite(count)) return 1;
  // Nikad ispod 1: šema bez `min`-a bi inače `num_images: 0` pretvorila u
  // besplatnu generaciju.
  return Math.max(1, Math.floor(count));
}

/**
 * Cena se UVEK računa ovde, iz kataloga - nikad iz onoga što je klijent
 * poslao u `params`. Model sa `costPerSecond` (video promenljivog trajanja,
 * STUDIO-PLAN B2) košta `ceil(costPerSecond * duration)`; sve ostalo ima
 * fiksni `creditCost`. Oba se množe brojem naručenih slika, jer se toliko puta
 * množi i fal račun.
 *
 * Model koji naplaćuje po sekundi, a `duration` nije poslat kao pozitivan
 * broj, baca umesto da padne na fiksnu cenu: naplatiti baznu cenu za klip
 * nepoznate dužine je tiho potkradanje kase.
 */
export function computeCreditCost(model: PricedModel, params: Record<string, unknown>): number {
  const images = requestedImageCount(params);
  if (model.costPerSecond === undefined) return model.creditCost * images;

  const duration = params.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("NEISPRAVNO_TRAJANJE");
  }

  return Math.ceil(model.costPerSecond * duration) * images;
}

/** ECB kurs iz STUDIO-PLAN §2 (14.08.2026): 1 $ = 0,865 €. Nije uživo - ista pretpostavka kao seed cena. */
export const EUR_PER_USD = 0.865;

/** Ispod ovog množioca admin ekran boji maržu upozoravajuće (P8). */
export const LOW_MARGIN_THRESHOLD = 2;

/**
 * Marža modela = maloprodajna vrednost `creditCost`-a u evrima (100 kr = 1 €,
 * STUDIO-PLAN §2.3) podeljena nabavnom cenom u evrima. `null` kad nabavna
 * cena nije upisana (0 ili manje) - deljenje nulom bi dalo `Infinity`, a to bi
 * admin ekran pogrešno obojio kao "odlična marža" umesto "nema podatka".
 */
export function computeMargin(creditCost: number, estimatedCostUsd: number): number | null {
  const costEur = estimatedCostUsd * EUR_PER_USD;
  if (costEur <= 0) return null;
  return creditCost / 100 / costEur;
}

/**
 * STUDIO-PLAN 4.4 - dnevni plafon STVARNOG troška po korisniku, u dolarima.
 * Limit od 50 generacija dnevno nije plafon dok korisnik sam bira model:
 * 50 × `veo-31-standard-1080p` je preko 100 $ nabavno.
 */
export const MAX_DAILY_COST_USD = 5;

/**
 * Sabira u centima jer `0.1 + 0.2` u binarnom zapisu nije `0.3` - bez toga bi
 * prag umeo da pukne na tačnoj petici, u jednu ili u drugu stranu.
 */
export function exceedsDailyCostLimit(spentUsd: number, addedUsd: number): boolean {
  return Math.round((spentUsd + addedUsd) * 100) > MAX_DAILY_COST_USD * 100;
}

/**
 * Koliko procenjenog troška sme da stoji NEPORAVNATO po korisniku (X2, nalaz
 * N2). Poravnanje ispravlja cenu tek kad je posao gotov, pa između rezervacije
 * i tog trenutka postoji prozor u kojem oba plafona i dalje gledaju procenu.
 * Ovo je jeftina brava nad tim prozorom: čim korisnik ima toliko u vazduhu, nov
 * posao čeka da se prethodni završe.
 *
 * Tri dolara je namerno ispod dnevnog plafona od pet: ovo nije drugi dnevni
 * plafon nego granica PARALELNE izloženosti, a `MAX_ACTIVE_JOBS` je ograničava
 * na najviše tri posla.
 */
export const MAX_UNSETTLED_COST_USD = 3;

/**
 * Meri se samo ono što je VEĆ u letu, bez cene posla koji se upravo naručuje:
 * ovo nije drugi dnevni plafon i ne sme da obori jedan skup posao koji staje u
 * plafon od 5 $. Prvi posao od 72 $ prolazi (i biće poravnat), drugi čeka.
 *
 * Poredi se u centima iz istog razloga kao `exceedsDailyCostLimit`.
 */
export function exceedsUnsettledCostLimit(unsettledUsd: number): boolean {
  return Math.round(unsettledUsd * 100) > MAX_UNSETTLED_COST_USD * 100;
}

/**
 * STUDIO-PLAN 4.4 - GLOBALNI dnevni plafon troška, preko svih korisnika. Dnevni
 * limit po korisniku (`MAX_DAILY_COST_USD`) ne vidi zbir: deset korisnika koji
 * svaki udari u svojih 5 $ je 50 $ koje niko ne primeti. Ova dva praga su
 * jedina AUTOMATSKA zaštita nad ukupnim fal računom - alarm da neko pogleda,
 * kill switch da se Studio sam ugasi u 3 ujutru. Admin ekran (P8) samo
 * prikazuje trošak; prikaz nije zaštita.
 */
export const GLOBAL_DAILY_ALARM_USD = 50;
export const GLOBAL_DAILY_KILL_USD = 100;

/**
 * Red u `studioCronHeartbeats` koji `crons.applyGlobalCostAction` osvežava na
 * svaki uspešan prolaz (X6, nalaz N5). Ključ, ne novi tip reda - isti obrazac
 * kao `STUDIO_FLAG_KEY`.
 */
export const GLOBAL_COST_HEARTBEAT_KEY = "global_cost_cap";

/**
 * Cron se vrti na 15 minuta; 60 je daleko iznad svakog pojedinačnog kašnjenja
 * i ostavlja prostora za spor deploy ili trenutni zastoj Convex-a bez lažnog
 * alarma na admin ekranu.
 */
export const HEARTBEAT_STALE_MS = 60 * 60 * 1000;

/** Šta cron treba da uradi na osnovu današnjeg globalnog troška. */
export type GlobalCostAction = "none" | "alarm" | "kill";

export type GlobalCostState = {
  /** Je li alarm od 50 $ za TAJ dan već poslat (cron se vrti na 15 min). */
  alarmSentToday: boolean;
  /** Je li Studio trenutno upaljen (`platformFlags.studio_enabled`). */
  studioEnabled: boolean;
};

/**
 * Čista odluka, odvojena od crona i baze. Kill ima prednost i vezan je za
 * `studioEnabled`: već ugašen Studio se ne gasi drugi put i ne šalje drugi
 * mejl. Alarm ide najviše jednom po danu i takođe samo dok Studio radi - čim
 * ga kill ugasi, prestaje i alarm. Nov dan resetuje oboje sam od sebe:
 * `costUsd` se sabira po danu, a `alarmSentToday` se pamti po danu.
 *
 * Poredi se u centima iz istog razloga kao `exceedsDailyCostLimit` - zbir
 * mnogo malih `costUsd` vrednosti u binarnom zapisu ume da promaši ceo prag.
 */
export function decideGlobalCostAction(
  totalCostUsd: number,
  state: GlobalCostState,
): GlobalCostAction {
  const cents = Math.round(totalCostUsd * 100);
  if (state.studioEnabled && cents > GLOBAL_DAILY_KILL_USD * 100) return "kill";
  if (state.studioEnabled && !state.alarmSentToday && cents > GLOBAL_DAILY_ALARM_USD * 100) {
    return "alarm";
  }
  return "none";
}

/**
 * Koliko puta preko `max` je još "promašaj forme" (pa se odseca), a odakle je
 * "neko gađa naš fal račun" (pa se odbija). `num_images: 20` uz `max: 4` je
 * prvo, `num_images: 200` je drugo.
 */
const PARAM_MAGNITUDE_FACTOR = 10;

/** Polje iz `modelCatalog.paramSchema`; nepoznat `type` se ne propušta. */
type ParamField = {
  key: string;
  type: string;
  min?: number;
  max?: number;
  options?: unknown;
};

export type SanitizedParams =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; reason: string };

/** Prompt je jedino polje koje prolazi i kad ga šema ne pominje. */
const IMPLICIT_PROMPT_FIELD: ParamField = { key: "prompt", type: "textarea" };

function readParamFields(schemaJson: string): Map<string, ParamField> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaJson);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const fields = new Map<string, ParamField>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const field = entry as Record<string, unknown>;
    if (typeof field.key !== "string" || typeof field.type !== "string") continue;
    fields.set(field.key, {
      key: field.key,
      type: field.type,
      min: typeof field.min === "number" ? field.min : undefined,
      max: typeof field.max === "number" ? field.max : undefined,
      options: field.options,
    });
  }

  return fields;
}

/**
 * Jedina kapija između onoga što je klijent poslao i onoga što fal naplaćuje.
 * Cena posla je fiksna (iz kataloga), pa svaka poluga koja množi fal račun -
 * `num_images`, rezolucija, broj koraka - mora da bude ili u šemi i ograničena,
 * ili da nikad ne stigne do fal-a.
 *
 * Pravila, redom: nepoznat ključ tiho ispada (klijent ne dobija mapu polja
 * koja postoje); broj se odseca na `min`/`max`, ali se odbija ako je van reda
 * veličine; `select` mora da bude iz svog skupa, inače se odbija - odsecanje
 * na "najbližu dozvoljenu vrednost" bi tiho generisalo nešto što niko nije
 * tražio. Vrednost pogrešnog tipa ispada kao i nepoznat ključ, pa se posao
 * odradi sa podrazumevanom vrednošću modela.
 */
export function sanitizeParams(
  schemaJson: string,
  raw: Record<string, unknown>,
): SanitizedParams {
  const fields = readParamFields(schemaJson);
  if (!fields) return { ok: false, reason: "NEISPRAVNA_SEMA" };

  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = fields.get(key) ?? (key === "prompt" ? IMPLICIT_PROMPT_FIELD : undefined);
    if (!field) continue;

    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      // Odbija se samo skupa strana. Ispod `min` nema šta da se izgubi -
      // `num_images: 0` je prazno polje u formi, a ne napad na fal račun.
      if (field.max !== undefined && value > field.max * PARAM_MAGNITUDE_FACTOR) {
        return { ok: false, reason: `VAN_OPSEGA:${key}` };
      }
      const clampedLow = field.min !== undefined ? Math.max(value, field.min) : value;
      params[key] = field.max !== undefined ? Math.min(clampedLow, field.max) : clampedLow;
      continue;
    }

    if (field.type === "select") {
      const options = Array.isArray(field.options) ? field.options : [];
      if (!options.includes(value)) return { ok: false, reason: `NEDOZVOLJENA_VREDNOST:${key}` };
      params[key] = value;
      continue;
    }

    if (field.type === "textarea" || field.type === "text") {
      if (typeof value !== "string") continue;
      params[key] = value;
      continue;
    }
  }

  return { ok: true, params };
}

/**
 * STUDIO-PLAN 0.2 - tiered retencija. Video je jedini tip koji stvarno jede
 * bajtove, pa živi 30 dana; slike i zvuk 90. Red u bazi ostaje i posle isteka
 * fajla (`crons.expireGenerationFiles`) - prompt i model nose "Generiši
 * ponovo", pa je istek proizvod, a ne gubitak.
 */
export const OUTPUT_RETENTION_DAYS = { image: 90, audio: 90, video: 30 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function outputExpiresAt(kind: keyof typeof OUTPUT_RETENTION_DAYS, now: number): number {
  return now + OUTPUT_RETENTION_DAYS[kind] * DAY_MS;
}

/**
 * Koliko živi okačen ulazni fajl koji nije ušao ni u jedan posao (nalaz R4).
 * Sesija u kojoj se bira model, pišu parametri i tek onda pritiska dugme staje
 * u sat vremena; 24 h je zato daleko iznad svake poštene upotrebe, a i dalje
 * ne ostavlja napušten upload da se plaća zauvek. Čim `storageId` udje u posao,
 * `expiresAt` se sklanja i fajl više ne ističe.
 */
export const INPUT_UPLOAD_TTL_MS = DAY_MS;

/**
 * Koliko važi dozvola za jedan ulazni upload (X5, nalaz N3). Grant se izdaje
 * uz upload URL i troši se prijavom okačenog fajla, pa mora da pokrije samo
 * jedan upload - sat vremena je i za video od 200 MB preko slabe veze daleko
 * iznad potrebnog, a ostavlja daleko manji prozor od TTL-a samog uploada.
 */
export const UPLOAD_GRANT_TTL_MS = 60 * 60 * 1000;

/**
 * Koliko sme da bude STARIJI fajl od dozvole kojom se prijavljuje (X5).
 *
 * Dozvola sama po sebi ne kaže KOJI fajl je okačen - `createInputUploadUrl` ih
 * izdaje koliko ko traži, pa bi bez ovog uslova jedna dozvola i dalje kupovala
 * jedan tuđi `_storage` ID. Veza se zato pravi preko vremena: fajl koji je u
 * storage-u stajao pre nego što je dozvola izdata sigurno nije nastao iz nje.
 * Prozor u kojem se tuđi ID uopšte može pogoditi time pada sa "zauvek" na
 * "koliko traje jedan upload".
 *
 * Minut tolerancije je zato što `createdAt` čita sat funkcije koja dozvolu
 * upisuje, a `_creationTime` sat koji fajl upisuje - poštena prijava ne sme da
 * padne zbog razlike među njima.
 */
export const UPLOAD_GRANT_CLOCK_SLACK_MS = 60 * 1000;

/**
 * Posle koliko neuspelih merenja se ISTI fajl više ne čita (X5, nalaz N4).
 * Fajl u Convex storage-u je nepromenljiv: ako mu se zaglavlje ne pročita iz
 * prvog pokušaja, neće ni iz stotog. Tri pokušaja su tu samo zbog mrežnih
 * grešaka i `Range` zahteva koji padne.
 */
export const MAX_MEASURE_FAILURES = 3;

/**
 * Grubi rate limit merenja, po korisniku (X5, nalaz N4). Ne broje se pozivi
 * akcije nego uploadi koje je korisnik napravio u poslednjem satu: svaki poziv
 * koji stvarno čita bajtove mora da ima svoj red u `studioUploads`, pa je ovo
 * gornja granica broja fajlova nad kojima se u tom satu uopšte može meriti.
 * Zajedno sa `MAX_MEASURE_FAILURES` to je najviše 90 čitanja na sat.
 *
 * Isti obrazac kao rate limiti u `chatCore.ts`: prebroj redove u prozoru preko
 * indeksa, sa `take`-om odmah iznad granice.
 */
export const MEASURE_UPLOAD_HOURLY_LIMIT = 30;

export const MEASURE_RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Sme li `measureInputUpload` da povuče bajtove. Oba razloga zabrane vraćaju
 * isti ishod korisniku (`MERENJE_ODBIJENO`), jer je sledeći korak isti:
 * sačekaj, pa okači drugi fajl.
 */
export function isMeasureBlocked(
  measureFailures: number | undefined,
  uploadsInWindow: number,
): boolean {
  return (
    (measureFailures ?? 0) >= MAX_MEASURE_FAILURES ||
    uploadsInWindow >= MEASURE_UPLOAD_HOURLY_LIMIT
  );
}

/**
 * Prefiks `falRequestId`-ja mock posla. Živi ovde, a ne u `studioActions.ts`,
 * jer ga čita i `studio.listMyJobs` (DEMO značka u galeriji) - a query modul ne
 * sme da uvlači akcioni modul samo zbog jednog stringa.
 */
export const MOCK_REQUEST_PREFIX = "mock-";

/** Je li posao odradio mock provajder; posao bez `falRequestId`-ja nije. */
export function isMockRequestId(falRequestId: string | undefined): boolean {
  return falRequestId !== undefined && falRequestId.startsWith(MOCK_REQUEST_PREFIX);
}

export type StudioProviderName = "fal" | "google" | "byteplus";

const PROVIDER_KEY_VARIABLE: Record<StudioProviderName, string> = {
  fal: "FAL_KEY",
  google: "GOOGLE_AI_API_KEY",
  byteplus: "BYTEPLUS_API_KEY",
};

/**
 * Da li provajder ima ključ (SP2). Jedna kapija za sva tri provajdera: bez
 * ključa posao ide kroz mock (DEMO), umesto da fal tiho vrati mock a BytePlus
 * baci grešku pa refundira. `STUDIO_MOCK=1` je izričit override i kad ključ
 * postoji. Čita samo PRISUSTVO - vrednost nikad ne napušta ovu funkciju.
 */
export function providerKeyPresent(
  provider: StudioProviderName,
  env: Record<string, string | undefined>,
): boolean {
  if (env.STUDIO_MOCK === "1") return false;
  const value = env[PROVIDER_KEY_VARIABLE[provider]];

  return typeof value === "string" && value.trim().length > 0;
}

/** Boolean-i po provajderu za klijenta (DEMO pilula u biraču), bez tajni. */
export function providerStatus(
  env: Record<string, string | undefined>,
): Record<StudioProviderName, boolean> {
  return {
    fal: providerKeyPresent("fal", env),
    google: providerKeyPresent("google", env),
    byteplus: providerKeyPresent("byteplus", env),
  };
}

/**
 * STUDIO-PLAN mock provajder (P4) - koliko poslova "uspe" dok Jovan nema
 * `FAL_KEY`. 15% neuspeha je namerno: mora da se vidi da refund stvarno radi,
 * ne samo srećan put.
 */
const MOCK_SUCCESS_RATE = 0.85;

/**
 * Deterministički ishod mock posla, izveden iz `jobId`-a - NIKAD
 * `Math.random()`, da isti posao uvek daje isti ishod i da testovi budu
 * ponovljivi. Ista FNV-1a konstrukcija kao `promptHash`, jedna traka je
 * dovoljna jer ovde nije bitna otpornost na koliziju, samo raspodela.
 */
export function mockJobSucceeds(jobId: string): boolean {
  let hash = 0x811c9dc5;
  for (let index = 0; index < jobId.length; index += 1) {
    hash = Math.imul(hash ^ jobId.charCodeAt(index), 0x01000193) >>> 0;
  }

  return (hash % 100) / 100 < MOCK_SUCCESS_RATE;
}

/**
 * Demo izlaz mock provajdera: SVG sa promptom ispisanim preko obojene
 * pozadine (boja izvedena iz `hash`, tj. iz `generationJobs.promptHash`),
 * kodiran kao `data:` URL. Bez mrežnog poziva i bez zavisnosti - radi
 * offline, a boja odmah pokazuje koji prompt je dao koju "sliku".
 */
export function mockOutputDataUrl(prompt: string, hash: string, kind?: string): string {
  const hue = parseInt(hash.slice(0, 4) || "0", 16) % 360;
  const label = (prompt.trim() || "DEMO").slice(0, 80).replace(/[&<>]/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;",
  );
  // Poster je samoopisan i kad se preuzme: video/zvuk DEMO posao nema pravi
  // fajl, pa i sam SVG kaže šta je (SP2).
  const caption = kind ? `DEMO · ${kind}` : "DEMO";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
    `<rect width="512" height="512" fill="hsl(${hue},65%,45%)"/>` +
    `<text x="24" y="48" fill="white" fill-opacity="0.85" font-family="sans-serif" font-size="16" font-weight="700">${caption}</text>` +
    `<text x="24" y="256" fill="white" font-family="sans-serif" font-size="22">${label}</text>` +
    `</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Koliko znakova prompta stane u naslov `labOutputs` reda. */
export const OUTPUT_TITLE_MAX_LENGTH = 60;

/**
 * Naslov izlaza je početak prompta - to je jedino što korisnik prepoznaje u
 * galeriji. Prompt koji je prazan (model bez teksta, ili prompt sam od
 * razmaka) pada na `fallback`, jer je `labOutputs.title` obavezno polje i
 * prazan naslov bi u listi izgledao kao pokvaren red.
 */
export function outputTitle(prompt: string, fallback: string): string {
  const trimmed = prompt.trim().slice(0, OUTPUT_TITLE_MAX_LENGTH).trim();
  return trimmed || fallback;
}
