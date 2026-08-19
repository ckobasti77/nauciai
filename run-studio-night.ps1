# =====================================================================
#  NAUČI AI - STUDIO, FAZA A: noćni batch run
#  ---------------------------------------------------------------
#  Pusti pre spavanja:
#      cd "C:\Users\admin\Desktop\Web Dev Projects\nauciai"
#      powershell -ExecutionPolicy Bypass -File .\run-studio-night.ps1
#
#  Prvo probaj suvo (ništa ne pokreće, samo ispiše plan i napiše promptove):
#      powershell -ExecutionPolicy Bypass -File .\run-studio-night.ps1 -DryRun
#
#  Radi: pravi granu, pušta 10 koraka backend implementacije + završni review.
#        Posle svakog koraka commituje i loguje.
#  NE radi: deploy, git push, Stripe live pozive, UI. Sve to ostaje za ujutru.
# =====================================================================

param(
  [string] $RepoPath = "C:\Users\admin\Desktop\Web Dev Projects\nauciai",
  [string] $Branch   = "feat/studio-faza-a",
  [switch] $ContinueOnError,   # bez ovoga: staje na prvoj grešci (posle 1 retry-ja)
  [switch] $DryRun,            # samo ispiše plan i napiše prompt fajlove
  [string] $Only = ""          # npr. -Only "A2,A6" da pustiš samo neke korake
)

# Namerno "Continue": git piše informativne poruke na stderr, a sa "Stop"
# bi to oborilo ceo noćni run. Greške hvatamo preko exit kodova, ručno.
$ErrorActionPreference = "Continue"

# Da srpska slova prežive kroz konzolu i fajlove.
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding           = [System.Text.Encoding]::UTF8
} catch { }

# ---------------------------------------------------------------------
# 0. Provere pre starta
# ---------------------------------------------------------------------

if (-not (Test-Path $RepoPath)) { throw "Repo ne postoji: $RepoPath" }
Set-Location -LiteralPath $RepoPath

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  throw "Claude Code nije u PATH-u. Instaliraj: irm https://claude.ai/install.ps1 | iex"
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "git nije u PATH-u."
}
if (-not (Test-Path (Join-Path $RepoPath "docs\STUDIO-PLAN.md"))) {
  throw "Nedostaje docs\STUDIO-PLAN.md - svaki korak se oslanja na njega."
}

# VAŽNO: CLAUDE_CODE_EFFORT_LEVEL ima VEĆI prioritet od --effort flaga.
# Ako je postavljen, pregazio bi per-korak podešavanja - zato ga sklanjamo.
Remove-Item Env:CLAUDE_CODE_EFFORT_LEVEL -ErrorAction SilentlyContinue

$env:API_TIMEOUT_MS      = "3600000"   # 1h po API zahtevu
$env:BASH_MAX_TIMEOUT_MS = "900000"    # 15 min po bash komandi (test suite)

$RunDir    = Join-Path $RepoPath ".studio-run"
$PromptDir = Join-Path $RunDir "prompts"
$LogDir    = Join-Path $RunDir "logs"
New-Item -ItemType Directory -Force -Path $PromptDir, $LogDir | Out-Null

$Stamp  = Get-Date -Format "yyyy-MM-dd_HH-mm"
$RunLog = Join-Path $LogDir "run_$Stamp.log"

function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
  Write-Host $line
  Add-Content -LiteralPath $RunLog -Value $line -Encoding utf8
}

function Invoke-Git {
  param([string[]]$GitArgs)
  $out = & git @GitArgs 2>&1
  return @{ Code = $LASTEXITCODE; Out = ($out | Out-String).Trim() }
}

# Alati koje agent NIKAKO ne sme da pozove noću.
# (Deny pravila važe i u bypass režimu.)
$Denied = @(
  "Bash(git push *)",
  "Bash(npx convex deploy *)",
  "Bash(convex deploy *)",
  "Bash(npx vercel *)",
  "Bash(vercel *)",
  "Bash(stripe *)",
  "Bash(rm -rf *)",
  "Bash(npx convex env set *)"
) -join ","

# ---------------------------------------------------------------------
# 1. Zajednička pravila - idu kao --append-system-prompt-file u svaki korak
# ---------------------------------------------------------------------

$Rules = @'
# Pravila za ovaj noćni run - važe za svaki korak

Radiš nenadzirano dok Jovan spava. Niko ne može da ti odgovori na pitanje.
Zato: kad naidješ na nejasnoću, izaberi najkonzervativniju opciju, NAPIŠI je u
`docs/STUDIO-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

## Obavezno pročitaj pre pisanja koda
1. `AGENTS.md` - posebno pravilo o 4 radiusa i "Simplicity First / Surgical Changes"
2. `convex/_generated/ai/guidelines.md` - obavezno pre bilo kog Convex koda
3. `docs/STUDIO-PLAN.md` - specifikacija celog Studija; ovo je izvor istine
4. `docs/STUDIO-PROGRESS.md` - šta su prethodni koraci već uradili (ako postoji)
5. Ako pišeš Next.js kod: `node_modules/next/dist/docs/` - ovaj Next ima
   breaking changes u odnosu na ono što misliš da znaš

## Apsolutne zabrane
- NE radi `git push`, `npx convex deploy`, `vercel deploy` - ništa ne ide na produkciju
- NE pozivaj `stripe` CLI niti bilo koji live Stripe API
- NE postavljaj Convex env varijable
- NE pravi UI komponente ni stranice (osim ako korak to izričito traži)
- NE menjaj postojeći subscription flow za kurseve tako da promeniš ponašanje -
  samo ga proširuješ
- NE "popravljaj" susedni kod koji nema veze sa tvojim zadatkom
- NE komentariši test i NE briši assertion da bi suite prošao

## Konvencije repoa koje moraš da pratiš
- Čista logika ide u `convex/<ime>Core.ts` (bez `ctx`, bez baze), testovi u
  `convex/<ime>.test.ts`. Uzor: `leaderboardCore.ts`, `profileActivityCore.ts`.
- Koristi `mutation` / `query` / `action` iz `./_generated/server` (kao `lab.ts`),
  ne `mutationGeneric` (stariji stil iz `billing.ts`).
- Koristi postojeće helpere iz `convex/helpers.ts`: `requireUserId`,
  `requireAdmin`, `requireCourseAccess`, `requireSyncSecret`.
- Indekse imenuj po poljima: `by_user_status`, `by_fal_request`, ...

## Definicija završenog koraka
Korak nije gotov dok sve tri komande ne prodju čisto:
    npx convex codegen
    npm run lint
    npm run test
Ako ne možeš da ih popraviš posle nekoliko pokušaja, upiši `BLOKADA:` u progress
fajl sa tačnom porukom greške i stani. Blokada je ispravan ishod - hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/STUDIO-PROGRESS.md`
```
## <ID koraka> - <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je uradjeno:** 3-6 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Testovi:** koje si napisao i šta pokrivaju
**Rezultat verifikacije:** codegen / lint / test - prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom greške
**Za Jovana ujutru:** šta mora ručno da uradi ili proveri zbog ovog koraka
```
Dopisuješ na kraj. Ne briši tudje sekcije.
'@

$RulesFile = Join-Path $RunDir "rules.md"
Set-Content -LiteralPath $RulesFile -Value $Rules -Encoding utf8

# ---------------------------------------------------------------------
# 2. Koraci
#    model:  opus svuda gde se dodiruje novac, sonnet na mehaničkom
#    effort: max na ledger / rezervaciju / webhook, niže na ostalom
# ---------------------------------------------------------------------

$Steps = @()

$Steps += @{
  Id = "A1"; Model = "sonnet"; Effort = "high"
  Title = "Convex sema za kredite, katalog modela i poslove"
  Prompt = @'
Dodaj u `convex/schema.ts` sve tabele za Studio. Specifikacija je u
`docs/STUDIO-PLAN.md`, sekcija 4.1 - ali sa DVE izmene koje je Jovan odlučio
posle pisanja tog dokumenta:

### Izmena 1: krediti se drže u lotovima, ne kao jedan broj
Umesto da `creditBalances.balance` bude jedini izvor istine, dodaj tabelu
`creditLots`. Razlog: krediti stižu iz tri izvora u različito vreme, i svaki
lot ima svoj datum isteka.

```ts
creditLots: defineTable({
  userId: v.id("users"),
  source: v.union(
    v.literal("purchase"),      // kupljen paket
    v.literal("plan_grant"),    // mesečna doza iz Premium pretplate
    v.literal("welcome_bonus"), // jednokratno, prva uplata
    v.literal("admin_grant"),
  ),
  granted: v.number(),          // koliko je originalno stiglo
  remaining: v.number(),        // koliko je ostalo nepotrošeno
  expiresAt: v.number(),        // UVEK grantedAt + 12 meseci
  grantedAt: v.number(),
  stripeInvoiceId: v.optional(v.string()),
  stripeSessionId: v.optional(v.string()),
  packId: v.optional(v.id("creditPacks")),
  exhaustedAt: v.optional(v.number()),
})
  .index("by_user_expiry", ["userId", "expiresAt"])     // FIFO trosenje
  .index("by_user_active", ["userId", "exhaustedAt"])
  .index("by_stripe_invoice", ["stripeInvoiceId"])      // idempotencija
  .index("by_stripe_session", ["stripeSessionId"])      // idempotencija
  .index("by_expiry", ["expiresAt"]),                   // cron za istek
```

Pravilo isteka je JEDNO i važi za sve izvore: **12 meseci od datuma dodele.**
Nema mesečnog propadanja, nema plafona na rollover - Jovan je to izričito
izabrao. Trošenje ide FIFO po `expiresAt` rastuće (prvo ono što pre ističe).

`creditBalances` ostaje, ali je sad denormalizovan keš:
`balance` (= suma `remaining` po nezastarelim lotovima), `lifetimePurchased`,
`lifetimeSpent`, `updatedAt`.

### Izmena 2: planovi Basic / Premium
Dodaj `plan` polje u `enrollments`:
```ts
plan: v.optional(v.union(v.literal("basic"), v.literal("premium"))),
```
Opciono je namerno - postojeći redovi ga nemaju, pa migracija ne puca.
Odsustvo tretiraj kao `"basic"`.

### Ostale tabele
Sve ostalo prepiši iz sekcije 4.1 plana: `creditTransactions`, `creditBalances`,
`creditPacks`, `modelCatalog`, `generationJobs`, `studioUsageDaily`.

U `creditTransactions` dodaj i `lotId: v.optional(v.id("creditLots"))` da se
svaka potrošnja može vezati za lot iz kog je skinuta.

U `creditPacks` dodaj `kind: v.union(v.literal("pack"), v.literal("plan"))` i
`planTier: v.optional(v.union(v.literal("basic"), v.literal("premium")))` - da
ista tabela može da opiše i paket kredita i pretplatnički plan.

### Verifikacija
`npx convex codegen` i `npm run lint` moraju da prodju.
Postojeći `npm run test` mora i dalje da bude zelen - ako neki test pukne zbog
promene šeme, to je znak da si promenio nešto što nisi smeo. Ne diraj test da
bi prošao; popravi šemu.

Ovaj korak NE piše nikakvu logiku - samo šemu. Ne diraj druge fajlove.
'@
}

$Steps += @{
  Id = "A2"; Model = "opus"; Effort = "max"
  Title = "Ledger: creditsCore + credits.ts + testovi"
  Prompt = @'
Ovo je najvažniji korak u celom projektu. Ovde se gubi pravi novac ako se
pogreši. Radi sporo i temeljno.

Napravi `convex/creditsCore.ts` (čiste funkcije, bez `ctx`, bez baze),
`convex/credits.ts` (Convex sloj) i `convex/credits.test.ts`.

### `convex/creditsCore.ts` - čista logika
```ts
export type Lot = { id: string; remaining: number; expiresAt: number };

// Koliko je upotrebljivo u trenutku `now` (lotovi koji nisu istekli)
export function usableBalance(lots: Lot[], now: number): number

// FIFO plan trosenja: koje lotove i koliko iz svakog.
// Vraca null ako nema dovoljno - pozivalac tad NE SME nista da upise.
export function planSpend(lots: Lot[], amount: number, now: number):
  Array<{ lotId: string; take: number }> | null

// grantedAt + 12 meseci, kalendarski (ne 365 dana)
export function computeExpiry(grantedAt: number): number

// Validacija prompta pre generacije: duzina, blok lista, prazan string
export function validatePrompt(text: string): { ok: true } | { ok: false; reason: string }

export const WELCOME_BONUS_CREDITS = 150;
```
`planSpend` sortira po `expiresAt` rastuće, pa po `id` kao tie-breaker
(determinizam je bitan za testove). Istekle lotove potpuno ignoriše.

### `convex/credits.ts` - Convex sloj
Query-ji: `getBalance`, `getLots`, `getTransactions` (paginated, najnovije prvo).

Interne mutacije:
- `grantCredits({ userId, amount, source, idempotencyKey, meta })`
  Upiše `creditLots` red + `creditTransactions` red + patch balansa - SVE u
  jednoj mutaciji. `idempotencyKey` je `stripeInvoiceId` ili `stripeSessionId`;
  pre inserta proveri odgovarajući indeks - ako red postoji, vrati njegov ID i
  ne upisuj ništa.
- `spendCredits({ userId, amount, jobId })`
  Učitaj aktivne lotove, pozovi `planSpend`. Ako vrati `null` -> baci grešku
  `NEDOVOLJNO_KREDITA` i NE upisuj ništa. Inače dekrementiraj `remaining` na
  pogodjenim lotovima (postavi `exhaustedAt` kad padne na 0), upiši jedan
  `creditTransactions` red `type: "spend"`, patch-uj balans.
- `refundCredits({ jobId })`
  Idempotentno preko indeksa `by_job_type`: ako već postoji red `(jobId, "refund")`,
  vrati bez ikakve izmene. Inače vrati kredite u NOVI lot sa istekom 12 meseci
  od sad - ne pokušavaj da ih vratiš u originalne lotove (previše komplikacije
  za premalo koristi; upiši to kao ODLUKU u progress).

Svaka transakcija upisuje `balanceAfter` snapshot.

### `convex/credits.test.ts` - obavezni testovi
Koristi `convex-test` (već je u devDependencies; vidi kako ga koristi
`convex/profiles.test.ts`).

Nad `creditsCore`:
1. `planSpend` troši prvo lot koji pre ističe
2. `planSpend` preseca preko više lotova kad prvi nije dovoljan
3. `planSpend` vraća `null` kad je ukupno nedovoljno - i kad bi bilo dovoljno
   samo ako se broje istekli lotovi
4. `usableBalance` ne broji istekle
5. `computeExpiry` na 29. februar i na kraj meseca ne pravi nevažeći datum

Nad Convex slojem:
6. **INVARIJANTA (najvažniji test u fajlu):** posle 200 nasumičnih
   grant/spend/refund operacija važi
   `creditBalances.balance` === suma `remaining` nezastarelih lotova
   === suma svih `creditTransactions.amount`
7. Dupli `grantCredits` sa istim `stripeInvoiceId` -> tačno jedan lot
8. Dupli `refundCredits` za isti `jobId` -> tačno jedan red
9. `spendCredits` preko balansa baca grešku I NE MENJA NIŠTA - proveri i lotove
   i balans i broj transakcija
10. `spendCredits` tačno na balans prolazi i ostavlja balans 0

### Verifikacija
`npm run test` mora biti zelen. Ne prelazi dalje dok nije.
Ako test ne prolazi jer je logika pogrešna - popravi logiku, ne test.
'@
}

$Steps += @{
  Id = "A3"; Model = "opus"; Effort = "high"
  Title = "Planovi Basic/Premium i pristup Pro lekcijama"
  Prompt = @'
Poveži pretplatničke planove sa pristupom Pro lekcijama.

### Problem koji rešavaš (postojeći bug)
`lib/lesson-access.ts` ima `canUseProLesson(role, proEnabled)` koja gleda
`users.role === "pro_student"`. Ali `convex/billing.ts` -> `syncStripeSubscription`
NIKAD ne postavlja `role`. Znači niko nikad ne postane `pro_student` i Pro
lekcije su nedostupne svima osim adminima.

### Rešenje
Ne popravljaj to preko `role`. `role` je globalan, a pretplata je po kursu
(`subscriptions.courseId`) - sa dva kursa bi Premium na jednom otključao Pro
sadržaj na oba. Koristi `enrollments.plan` koji je dodat u koraku A1.

1. **`lib/plan.ts`** (nov, + `lib/plan.test.ts`):
   ```ts
   export type Plan = "basic" | "premium";
   export function normalizePlan(plan: string | undefined): Plan  // undefined -> "basic"
   export function planFromPriceId(priceId: string, map: Record<string, Plan>): Plan
   ```

2. **`lib/lesson-access.ts`**: novi potpis
   `canUseProLesson(plan: string | undefined, role: string | undefined, proEnabled = true)`.
   Vraća `true` ako je `proEnabled` i (`role` je admin/moderator ILI
   `normalizePlan(plan) === "premium"`). Zadrži i legacy `role === "pro_student"`
   da ništa ne pukne tokom prelaza.

3. **`convex/lab.ts` (~linija 123)**: jedini pozivalac. Učitaj `enrollments` red
   za taj `userId` + `courseId` i prosledi `enrollment?.plan`. Minimalna izmena.

4. **`convex/billing.ts` -> `syncStripeSubscription`**: dodaj opcioni argument
   `plan: v.optional(v.union(v.literal("basic"), v.literal("premium")))` i upiši
   ga u `enrollments.plan` u istom patch-u koji već postoji. Ako `plan` nije
   prosledjen, NE diraj postojeću vrednost.

5. **Testovi**:
   - `normalizePlan(undefined) === "basic"`
   - admin vidi Pro lekciju bez obzira na plan
   - basic ne vidi Pro lekciju
   - premium vidi Pro lekciju
   - `proEnabled: false` sakriva lekciju i premium korisniku

### Verifikacija
`npm run lint` i `npm run test` zeleno. Ako postojeći testovi pucaju zbog novog
potpisa, popravi pozive - ali proveri da nisi promenio očekivano ponašanje.
'@
}

$Steps += @{
  Id = "A4"; Model = "sonnet"; Effort = "high"
  Title = "Paketi kredita i planovi u bazi + seed"
  Prompt = @'
Napuni `creditPacks` tabelu i napiši pristupne funkcije.

### Podaci (Jovan ih je zaključao 18.08.2026)
Planovi (`kind: "plan"`, mesečna pretplata):
| slug | naziv SR | cena | krediti po ciklusu | planTier |
|---|---|---|---|---|
| `basic` | Basic | 9,99 € | 0 | basic |
| `premium` | Premium | 24,99 € | 2000 | premium |

Paketi kredita (`kind: "pack"`, jednokratna kupovina):
| slug | naziv SR | cena | krediti | bonus |
|---|---|---|---|---|
| `starter` | Starter | 5 € | 500 | 0% |
| `creator` | Creator | 15 € | 1650 | 10% |
| `pro` | Pro | 40 € | 4800 | 20% |

Bonus dobrodošlice (150 kredita, jednokratno, na prvoj uspešnoj uplati, oba
plana) NE ide u ovu tabelu - već je konstanta `WELCOME_BONUS_CREDITS` u
`convex/creditsCore.ts` iz koraka A2.

Cene drži u centima (`priceEurCents`), nikad kao float.

### Šta napisati
- `convex/creditPacks.ts`: `listPacks({ kind? })` javni query (samo `isActive`,
  sortirano po `sortOrder`), `getPackBySlug`, i admin mutacije `upsertPack` /
  `setPackActive` zaštićene sa `requireAdmin`.
- Dopuni `convex/seed.ts` funkcijom koja upisuje svih 5 redova IDEMPOTENTNO
  (upsert po `slug`, ne insert - ponovljen seed ne sme da duplira).
- `stripePriceId` ostavi prazan. Jovan ga popunjava ujutru iz Stripe dashboarda.
  U progress fajl napiši tačnu listu slug-ova koje mora da poveže.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test` zeleno.
Dodaj test da `listPacks` vraća samo aktivne, u ispravnom redosledu, i da
ponovljen seed ne duplira redove.
'@
}

$Steps += @{
  Id = "A5"; Model = "opus"; Effort = "high"
  Title = "Stripe checkout: paketi kredita i planovi"
  Prompt = @'
Proširi Stripe integraciju. **Ne diraj `createCourseCheckoutSession`** - radi i
ostaje kakva jeste.

### `lib/stripe.ts` - dodaj dve funkcije

1. `createCreditPackCheckoutSession({ packSlug, packId, credits, priceId, userId, locale, customerEmail })`
   - `mode: "payment"` (JEDNOKRATNO, ne subscription)
   - `metadata: { kind: "credit_pack", packId, packSlug, userId, credits }`
   - `success_url` -> `/{locale}/app/credits?checkout=success`
   - `cancel_url`  -> `/{locale}/app/credits?checkout=cancelled`
   - `allow_promotion_codes: true`, kao postojeća funkcija

2. `createPlanCheckoutSession({ planSlug, courseId, courseSlug, priceId, userId, locale, customerEmail })`
   - `mode: "subscription"`
   - `subscription_data.metadata` MORA da sadrži
     `{ kind: "plan", planSlug, courseId, userId }` - bez toga webhook na obnovi
     ne zna kome šta da doda
   - isto i u `metadata` (za `checkout.session.completed`)

### `app/api/stripe/credits/route.ts` - nova ruta
Prati TAČNO pattern iz `app/api/stripe/checkout/route.ts`:
`convexAuthNextjsToken()` -> `getConvexHttpClient(token)` -> `viewer` query ->
provera da je ulogovan -> provera `emailVerifiedForCourses` -> učitaj pack preko
`getPackBySlug` -> ako nema `stripePriceId`, vrati jasnu 400 sa imenom koje fali
-> napravi sesiju -> vrati `{ url }`.

Poruke o greškama bilingvalno (sr/en), isti stil kao postojeća ruta.

### `lib/convex-http.ts`
Dodaj reference na nove query-je/mutacije, prateći postojeći `convexQueries` /
`convexMutations` pattern.

### Verifikacija
`npm run lint` i `npm run test` zeleno. NE pozivaj Stripe uživo - nijedan
mrežni poziv u testovima. Ako pišeš test, mockuj `getStripe`.
'@
}

$Steps += @{
  Id = "A6"; Model = "opus"; Effort = "max"
  Title = "Stripe webhook: dodela kredita, idempotentno"
  Prompt = @'
Drugi korak gde se gubi pravi novac. Radi temeljno.

### Ključna stvar koju moraš da razumeš pre koda
`checkout.session.completed` puca SAMO JEDNOM, pri prvom plaćanju. Obnove
pretplate pucaju `invoice.paid`. Ako mesečne kredite vežeš za
`checkout.session.completed`, Premium pretplatnik dobije kredite prvog meseca
i nikad više.

| Event | Šta radi |
|---|---|
| `checkout.session.completed`, `mode: "payment"`, `metadata.kind === "credit_pack"` | dodeli kredite iz paketa; idempotencija po `session.id` |
| `checkout.session.completed` sa `subscription` | postojeći flow - NE DIRAJ ponašanje |
| `invoice.paid` | ako pretplata ima `metadata.kind === "plan"` -> dodeli mesečnu dozu za taj plan, idempotencija po `invoice.id`. Ako je `invoice.billing_reason === "subscription_create"` dodeli i welcome bonus (150 kr), idempotencija po `invoice.id + ":welcome"` |
| `customer.subscription.*` | postojeći flow; samo dopuni prosledjivanje `plan` u `syncStripeSubscription`, izvedeno iz `metadata.planSlug` |

### Izmene u `app/api/stripe/webhook/route.ts`
Postojeći `case "checkout.session.completed"` proširi tako da PRVO proveri
credit_pack granu, pa tek onda postojeću subscription granu. Postojeće
ponašanje za pretplate mora ostati identično - to je tvrd zahtev.
Dodaj nov `case "invoice.paid"`.

Svaki poziv ka Convexu ide preko `requireWebhookSyncSecret()`, isti pattern kao
`syncStripeSubscription`.

### Izmene u `convex/credits.ts`
Dodaj sync-secret zaštićenu mutaciju `applyStripeGrant`
`({ syncSecret, userId, amount, source, stripeInvoiceId?, stripeSessionId?, packId? })`
koja interno zove `grantCredits`. Ne dupliraj idempotencijsku logiku - prosledi je.

### Testovi (dopuni `convex/credits.test.ts`)
1. Isti `invoice.paid` obradjen dvaput -> tačno jedan lot, balans se ne udvostruči
2. Isti `checkout.session.completed` obradjen dvaput -> tačno jedan lot
3. `subscription_create` faktura dodeli i dozu plana I welcome bonus - dva
   odvojena lota, oba idempotentna nezavisno
4. `invoice.paid` za obnovu (`billing_reason: "subscription_cycle"`) dodeli
   SAMO dozu plana, bez welcome bonusa
5. `invoice.paid` bez `metadata.kind === "plan"` ne dodeli ništa i ne pukne

### Verifikacija
`npm run lint`, `npm run test` zeleno. Ne pozivaj Stripe uživo.
U progress fajl napiši TAČNU listu Stripe event tipova koje Jovan mora da
uključi na postojećem webhook endpointu u dashboardu.
'@
}

$Steps += @{
  Id = "A7"; Model = "sonnet"; Effort = "medium"
  Title = "Katalog modela sa cenama"
  Prompt = @'
Napuni `modelCatalog` tabelu i napiši pristupne funkcije.

Cene su u `docs/STUDIO-PLAN.md`, sekcija 2.3 - prepiši ih TAČNO odatle. Ne
računaj ponovo i ne zaokružuj drugačije; to su proverene fal.ai cene od
18.08.2026.

Upiši SVE modele (slike, video, zvuk), ali:
- `isEnabled: true` samo za modele iz sekcije SLIKE
- `isEnabled: false` za video i zvuk - uključuju se u Fazi B i C
- `badge: "preporuceno"` na Nano Banana 2
- `badge: "skupo"` na svaki označen sa (!) u planu

Popuni i `estimatedCostUsd` (nabavna cena iz plana) - to je osnova za kasnije
alarme o marži.

`paramSchema` neka bude JSON string koji opisuje polja forme; za slike:
`prompt` (textarea, obavezno, max 2000), `aspect_ratio` (select),
`num_images` (number 1-4). Drži ga minimalnim - UI se piše kasnije.

### Šta napisati
- `convex/modelCatalog.ts`: `listModels({ kind? })` javni query koji vraća samo
  `isEnabled: true`, sortirano po `sortOrder`; `getModelBySlug` interni; admin
  mutacije `upsertModel`, `setModelEnabled`, `setModelCost` sa `requireAdmin`.
- Seed u `convex/seed.ts`, idempotentan upsert po `slug`.
- Test: `listModels` ne vraća isključene modele; `getModelBySlug` vraća cenu
  koja se poklapa sa planom za bar 3 nasumična modela.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test` zeleno.
'@
}

$Steps += @{
  Id = "A8"; Model = "sonnet"; Effort = "high"
  Title = "fal.ai klijent i submit akcija"
  Prompt = @'
Napiši sloj koji priča sa fal.ai. **Ne koristi fal SDK** - običan `fetch` je
manje zavisnosti i lakše se testira.

### `lib/fal.ts`
```ts
export type FalSubmitResult = { requestId: string };

export function buildQueueUrl(endpoint: string, webhookUrl: string): string
// -> https://queue.fal.run/{endpoint}?fal_webhook={encoded}

export async function submitToFal(params: {
  endpoint: string; input: Record<string, unknown>;
  webhookUrl: string; apiKey: string;
}): Promise<FalSubmitResult>
```
Header je `Authorization: Key ${apiKey}` - tačno tako, sa rečju `Key`.
Odgovor je `{ request_id, gateway_request_id }`; koristi `request_id`
(`gateway_request_id` se menja pri retry-ju).
Ako fal vrati ne-2xx, baci grešku sa statusom i telom odgovora u poruci.

Test `lib/fal.test.ts`: `buildQueueUrl` pravilno enkoduje webhook URL i ne pravi
dupli `?`; `submitToFal` sa mock-ovanim `fetch` - uspeh vraća requestId, 422
baca grešku sa telom u poruci.

### `convex/studioActions.ts`
Interna akcija `submitJob({ jobId })`:
1. `runQuery` - učitaj job + model iz kataloga
2. Sastavi `input` iz `job.params` i `model.defaultParams`
3. Webhook URL: `${process.env.CONVEX_SITE_URL}/fal/webhook` - iz env, NE hardkoduj
4. `submitToFal` sa `process.env.FAL_KEY`
5. Uspeh -> `runMutation` `markJobRunning({ jobId, falRequestId })`
6. Greška -> `runMutation` `failJob({ jobId, error })` koja odmah refundira

`FAL_KEY` još NE postoji u Convex env-u. Kod mora da baci jasnu grešku
`"FAL_KEY nije postavljen"` ako fali - ne sme tiho da padne. Ne pokušavaj da ga
postaviš i ne pozivaj fal uživo ni u jednom testu.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test` zeleno.
U progress fajl napiši tačne komande za postavljanje `FAL_KEY` i
`CONVEX_SITE_URL` u Convex env (dev i prod).
'@
}

$Steps += @{
  Id = "A9"; Model = "opus"; Effort = "max"
  Title = "createJob sa rezervacijom kredita"
  Prompt = @'
Treći korak gde se gubi novac. Poenta: **rezervacija i upis posla moraju biti
jedna atomska transakcija.** Ne sme da ostane ni skinut kredit bez posla, ni
posao bez skinutog kredita.

Napravi `convex/studio.ts` i `convex/studio.test.ts`.

### `createJob` mutacija - tačan redosled
```
1.  requireUserId
2.  platformFlags: ako je Studio pauziran -> greska STUDIO_PAUZIRAN
    (napravi tabelu platformFlags { key: string, enabled: boolean } sa indeksom
     by_key i seeduj red "studio_enabled": true)
3.  enrollment provera - korisnik mora imati aktivan enrollment na kursu
4.  validatePrompt() iz creditsCore -> NEISPRAVAN_PROMPT
5.  model iz kataloga; ako !isEnabled -> MODEL_NEDOSTUPAN
6.  broj aktivnih poslova (reserved|running) < 3 -> inace PREVISE_POSLOVA
7.  dnevni limit iz studioUsageDaily < 50 -> inace DNEVNI_LIMIT
8.  izracunaj creditCost SERVERSKI iz kataloga (video: costPerSecond * duration).
    NIKAD ne veruj ceni koju je klijent poslao.
9.  spendCredits() -> ako baci NEDOVOLJNO_KREDITA, cela mutacija se rollback-uje
10. insert generationJobs (status: "reserved")
11. inkrementiraj studioUsageDaily
12. ctx.scheduler.runAfter(0, internal.studioActions.submitJob, { jobId })
13. vrati jobId
```
Koraci 9-12 su u istoj mutaciji, dakle jedna transakcija. Ako korak 10 pukne,
korak 9 se poništava sam - to je Convex garancija. Oslanjaj se na nju umesto da
praviš ručni rollback.

Dodaj i `markJobRunning`, `failJob` (poziva `refundCredits`) i `listMyJobs`
(paginated query sa realtime pretplatom).

### Testovi
1. Nedovoljno kredita -> nema `generationJobs` reda I nema `creditTransactions`
   reda I balans nepromenjen (proveri sva tri)
2. Četvrti paralelni posao odbijen, prva tri prošla
3. Zabranjen pojam u promptu odbijen pre nego što se skine ijedan kredit
4. Isključen model odbijen
5. Cena se računa iz kataloga i kad klijent pošalje drugu vrednost u params
6. `failJob` vrati tačno onoliko kredita koliko je skinuto
7. `failJob` pozvan dvaput vrati kredite samo jednom
8. Prekoračen dnevni limit odbijen

### Verifikacija
`npm run test` zeleno. Ovde je bolje stati sa BLOKADOM nego ostaviti test koji
ne prolazi.
'@
}

$Steps += @{
  Id = "A10"; Model = "opus"; Effort = "max"
  Title = "fal webhook: ED25519 verifikacija i idempotentna obrada"
  Prompt = @'
Poslednji korak gde se gubi novac. Napravi `convex/falWebhook.ts`, registruj ga
u `convex/http.ts`, testovi u `convex/falWebhook.test.ts`.

Tačan algoritam je u `docs/STUDIO-PLAN.md` sekcija 4.3. Pročitaj ga pažljivo -
ovo NIJE HMAC kao Stripe, nego ED25519 preko JWKS-a.

### Sitnice koje se najčešće zeznu
1. SHA-256 se računa nad **sirovim bajtovima tela**, ne nad re-serijalizovanim
   JSON-om. U `httpAction`: `const raw = await request.arrayBuffer()` PRE bilo
   kakvog `.json()`. Parsiraj tek posle verifikacije.
2. Poruka za potpis je tačno ova konkatenacija sa `\n` izmedju:
   `requestId + "\n" + userId + "\n" + timestamp + "\n" + hexSha256(rawBody)`
3. Tolerancija timestampa je +/-300 sekundi. Van toga -> 401.
4. Ako bilo koji od 4 `X-Fal-Webhook-*` headera fali -> 401.
5. JWKS sa `https://rest.fal.ai/.well-known/jwks.json`, keširaj NAJVIŠE 24h.
   Bilo koji ključ iz seta koji verifikuje potpis -> validno.
6. Potpis je hex; JWKS `x` polje je base64url.

Za ED25519 koristi Web Crypto (`crypto.subtle.importKey` sa `Ed25519`). Ako to
ne radi u Convex runtime-u, napiši BLOKADU sa tačnom greškom umesto da uvlačiš
novu npm zavisnost.

### Obrada posle verifikacije
```
lookup generationJobs by_fal_request(request_id)
  nema ga              -> 200 (nije nas posao, ne pravi buku)
  status nije running   -> 200 ODMAH (idempotencija: webhook je retry)
  status === "OK"       -> job.status = "done", sacuvaj fal output URL,
                           scheduler -> persistOutput akcija (stub je dovoljan)
  status === "ERROR"    -> job.status = "failed", error poruka,
                           refundCredits(jobId), job.status = "refunded"
vrati 200 ODMAH - fal daje samo 15s na prvi pokusaj
```
Skidanje fajla NE radi ovde - zakaži akciju. Handler mora biti brz.

### Testovi
1. Neispravan potpis -> 401, job nepromenjen
2. Timestamp stariji od 300s -> 401
3. Fali `X-Fal-Webhook-Signature` -> 401
4. Validan ERROR webhook -> job refunded, kredit vraćen tačno jednom
5. **Isti validan ERROR webhook poslat 5 puta -> kredit vraćen tačno jednom**
6. Validan OK webhook -> job done, refunda NEMA
7. Nepoznat `request_id` -> 200, ništa se ne desi

Za testove napravi test par ED25519 ključeva i potpiši telo lokalno; mockuj
JWKS fetch da vrati tvoj javni ključ.

### Verifikacija
`npm run test` zeleno. Ovo je najosetljiviji kod u projektu.
'@
}

$Steps += @{
  Id = "RV"; Model = "opus"; Effort = "xhigh"
  Title = "Zavrsni review i izvestaj"
  Prompt = @'
Ne piši nove feature. Ovo je revizija svega što je noćas uradjeno.

1. Pusti `npx convex codegen`, `npm run lint`, `npm run test` i zabeleži TAČAN
   izlaz svake komande.
2. Pusti `git log --oneline` za ovu granu i `git diff --stat main...HEAD`.
3. Pročitaj `docs/STUDIO-PROGRESS.md` u celini.
4. Pročitaj sav novi kod u `convex/credits.ts`, `convex/creditsCore.ts`,
   `convex/studio.ts`, `convex/falWebhook.ts`, `app/api/stripe/webhook/route.ts`.

Onda napiši `docs/STUDIO-NIGHT-REPORT.md` sa ovim sekcijama:

**STANJE** - koji koraci su završeni, koji blokirani, koji nisu ni počeli.

**RIZICI PO NOVAC** - prodji kroz svaki put kojim kredit može da se izgubi ili
udvostruči i reci da li je pokriven testom. Napiši nalaz za svaku od ovih 6:
  a) rezervacija bez posla (mutacija pukla posle spend-a)
  b) posao bez rezervacije
  c) dupli refund na fal retry-ju
  d) dupla dodela na Stripe retry-ju
  e) posao koji zauvek visi u `running` (ima li reaper - ako nema, reci)
  f) klijent koji pošalje lažnu cenu

**NEDOSLEDNOSTI** - sve gde se kod razlikuje od `docs/STUDIO-PLAN.md`, i da li
je odstupanje opravdano.

**RUČNI KORACI ZA JOVANA** - numerisana lista svega što mora sam da uradi
(Stripe price ID-jevi, env varijable, Stripe event tipovi, fal nalog...).
Za svaku stavku tačna komanda ili tačan put kroz dashboard.

**ŠTA NIJE URADjENO** - sve iz Faze A što je ostalo (UI koraci, persistOutput,
retencija) sa procenom koliko još treba.

Budi strog. Ako je nešto klimavo, napiši da je klimavo. Bolje da Jovan ujutru
zna gde je tanko nego da otkrije kad naplati prvi evro.

Na kraju dopiši sekciju i u `docs/STUDIO-PROGRESS.md`, kao svaki drugi korak.
'@
}

# ---------------------------------------------------------------------
# 3. Izvršavanje
# ---------------------------------------------------------------------

if ($Only) {
  $wanted = $Only.Split(",") | ForEach-Object { $_.Trim().ToUpper() }
  $Steps  = @($Steps | Where-Object { $wanted -contains $_.Id })
  Log "Filtrirano na korake: $(($Steps | ForEach-Object { $_.Id }) -join ', ')"
}

Log "=================================================="
Log " STUDIO FAZA A - nocni run"
Log " Repo:   $RepoPath"
Log " Grana:  $Branch"
Log " Koraka: $($Steps.Count)"
Log " Log:    $RunLog"
Log "=================================================="

# --- Grana ---
$cur = Invoke-Git @("rev-parse", "--abbrev-ref", "HEAD")
if ($cur.Out -ne $Branch) {
  $has = Invoke-Git @("branch", "--list", $Branch)
  if ($has.Out) { $r = Invoke-Git @("checkout", $Branch) }
  else          { $r = Invoke-Git @("checkout", "-b", $Branch) }
  if ($r.Code -ne 0) { throw "Ne mogu da predjem na granu ${Branch}: $($r.Out)" }
  Log "Grana: $Branch"
} else {
  Log "Vec na grani $Branch"
}

# --- Cist radni direktorijum ---
$dirty = (Invoke-Git @("status", "--porcelain")).Out
if ($dirty -and -not $DryRun) {
  Log "Nekomitovane izmene zatecene - commitujem ih pre starta."
  Invoke-Git @("add", "-A") | Out-Null
  Invoke-Git @("commit", "-m", "wip: stanje pre nocnog studio run-a") | Out-Null
}

# --- Progress fajl ---
$ProgressFile = Join-Path $RepoPath "docs\STUDIO-PROGRESS.md"
if (-not (Test-Path $ProgressFile)) {
  New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "docs") | Out-Null
  Set-Content -LiteralPath $ProgressFile -Encoding utf8 -Value @"
# Studio - dnevnik implementacije

Svaki korak dopisuje svoju sekciju na kraj. Ne brisati ranije sekcije.

Run pokrenut: $Stamp
"@
}

$Results   = @()
$TotalCost = 0.0

foreach ($step in $Steps) {

  $id = $step.Id
  Log ""
  Log "--------------------------------------------------"
  Log " $id  |  $($step.Title)"
  Log " model=$($step.Model)  effort=$($step.Effort)"
  Log "--------------------------------------------------"

  # Prompt ide u fajl, a agentu se prosledjuje samo ASCII putanja.
  # Time se izbegava mangling srpskih slova kroz argv na Windows konzoli.
  $promptFile = Join-Path $PromptDir "$id.md"
  Set-Content -LiteralPath $promptFile -Value $step.Prompt -Encoding utf8

  if ($DryRun) { Log "DRY RUN - prompt zapisan, izvrsavanje preskoceno."; continue }

  $progLenBefore = if (Test-Path $ProgressFile) { (Get-Item $ProgressFile).Length } else { 0 }

  $started = Get-Date
  $attempt = 0
  $ok      = $false
  $cost    = 0.0

  while ($attempt -lt 2 -and -not $ok) {
    $attempt++
    if ($attempt -gt 1) { Log "Pokusaj $attempt (retry posle greske)..." }

    $outFile = Join-Path $LogDir "$($id)_a$attempt.json"
    $errFile = Join-Path $LogDir "$($id)_a$attempt.err.txt"

    $taskLine = "Read the file .studio-run/prompts/$id.md and carry out every instruction in it, completely. That file is your entire task for this session. Also read .studio-run/rules.md if it is not already in your context."

    $claudeArgs = @(
      "-p", $taskLine,
      "--model", $step.Model,
      "--effort", $step.Effort,
      "--dangerously-skip-permissions",
      "--disallowedTools", $Denied,
      "--append-system-prompt-file", $RulesFile,
      "--output-format", "json",
      "--max-turns", "400"
    )

    $stdout = & claude @claudeArgs 2> $errFile
    $exit   = $LASTEXITCODE

    $raw = ($stdout | Out-String)
    Set-Content -LiteralPath $outFile -Value $raw -Encoding utf8

    if ($exit -eq 0 -and $raw.Trim()) {
      try {
        $json = $raw | ConvertFrom-Json
        if ($null -ne $json.total_cost_usd) { $cost = [double]$json.total_cost_usd }
        $ok = $true
      } catch {
        Log "Izlaz nije validan JSON - tretiram kao neuspeh."
      }
    } else {
      Log "claude izasao sa kodom $exit"
      if (Test-Path $errFile) {
        $e = (Get-Content -LiteralPath $errFile -Raw)
        if ($e) { Log ("stderr: " + $e.Substring(0, [Math]::Min(400, $e.Length))) }
      }
    }
  }

  $elapsed    = [int]((Get-Date) - $started).TotalMinutes
  $TotalCost += $cost

  # --- Commit onoga sto je korak napravio ---
  $changed = @((Invoke-Git @("status", "--porcelain")).Out -split "`r?`n" | Where-Object { $_ })
  if ($changed.Count -gt 0) {
    Invoke-Git @("add", "-A") | Out-Null
    Invoke-Git @("commit", "-m", "studio($id): $($step.Title)") | Out-Null
    $commit = (Invoke-Git @("rev-parse", "--short", "HEAD")).Out
    Log "Commit $commit - $($changed.Count) izmenjenih putanja"
  } else {
    $commit = "-"
    Log "UPOZORENJE: korak nije napravio nijednu izmenu u fajlovima."
    $ok = $false
  }

  # --- Da li je korak sam prijavio blokadu (samo u novododatom delu) ---
  $blocked = $false
  if (Test-Path $ProgressFile) {
    $fs = [System.IO.File]::OpenRead($ProgressFile)
    try {
      if ($fs.Length -gt $progLenBefore) {
        $fs.Seek($progLenBefore, [System.IO.SeekOrigin]::Begin) | Out-Null
        $buf = New-Object byte[] ($fs.Length - $progLenBefore)
        $fs.Read($buf, 0, $buf.Length) | Out-Null
        $tail = [System.Text.Encoding]::UTF8.GetString($buf)
        foreach ($line in ($tail -split "`r?`n")) {
          # Samo redovi koji POCINJU poljem BLOKADA; recenice koje je pominju
          # usput ("nije BLOKADA ovog koraka") se preskacu.
          if ($line -notmatch '^\s*\*{0,2}BLOKADA') { continue }
          $rest = ($line -replace '^\s*\*{0,2}BLOKADA[:\*\s]*', '').Trim().ToLower()
          if ($rest -and $rest -notmatch '^(nema|nije|ne postoji|nijedna|n/a|-)') {
            $blocked = $true
          }
        }
      }
    } finally { $fs.Close() }
  }

  $status = if (-not $ok) { "GRESKA" } elseif ($blocked) { "BLOKADA" } else { "OK" }

  $Results += [pscustomobject]@{
    Korak  = $id
    Status = $status
    Minuta = $elapsed
    CenaUSD = "{0:N2}" -f $cost
    Commit = $commit
  }

  Log "$id -> $status  ($elapsed min, USD $("{0:N2}" -f $cost))"

  if (-not $ok -and -not $ContinueOnError) {
    Log ""
    Log "STOP: korak $id nije uspeo, a -ContinueOnError nije postavljen."
    Log "Sve do ovde je commitovano na grani $Branch."
    break
  }
}

# ---------------------------------------------------------------------
# 4. Sazetak
# ---------------------------------------------------------------------

Log ""
Log "=================================================="
Log " GOTOVO"
Log "=================================================="
if ($Results.Count -gt 0) {
  ($Results | Format-Table -AutoSize | Out-String) -split "`r?`n" |
    Where-Object { $_ } | ForEach-Object { Log $_ }
  $Results | Export-Csv -LiteralPath (Join-Path $LogDir "summary_$Stamp.csv") -NoTypeInformation -Encoding utf8
}
Log ("Ukupna cena: USD " + ("{0:N2}" -f $TotalCost))
Log "Grana: $Branch  (NIJE push-ovana, NIJE deploy-ovana)"
Log ""
Log "Ujutru:"
Log "  1. docs\STUDIO-NIGHT-REPORT.md   - izvestaj i rucni koraci"
Log "  2. docs\STUDIO-PROGRESS.md       - dnevnik po koracima"
Log "  3. .studio-run\logs\             - sirovi logovi"
Log "  4. Javi Claude-u da je gotovo."
