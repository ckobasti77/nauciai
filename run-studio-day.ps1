# =====================================================================
#  NAUČI AI - STUDIO, FAZA A2: zakrpe + kompletan frontend
#  ---------------------------------------------------------------
#  Pusti i idi na posao:
#      cd "C:\Users\admin\Desktop\Web Dev Projects\nauciai"
#      powershell -ExecutionPolicy Bypass -File .\run-studio-day.ps1
#
#  Nastavlja na grani feat/studio-faza-a, tamo gde je noćni run stao.
#
#  Radi: 4 backend zakrpe (rupe kroz koje curi novac), mock provajder,
#        pa 5 UI koraka - krediti, playground, galerija, admin, navigacija.
#        Na kraju `npm run build` kao kapija i uputstvo za demo.
#  NE radi: deploy, git push. Kad se vratiš: `npm run dev` pa localhost:3000.
#
#  Razlika u odnosu na noćnu skriptu: ova NE staje na grešci. Cilj je da se
#  vratiš sa kuće na nešto što se vidi, pa i ako jedan korak zakaže.
# =====================================================================

param(
  [string] $RepoPath = "C:\Users\admin\Desktop\Web Dev Projects\nauciai",
  [string] $Branch   = "feat/studio-faza-a",
  [switch] $StopOnError,       # obrnuto od noćne skripte: staje samo ako to tražiš
  [switch] $DryRun,
  [string] $Only = ""
)

$ErrorActionPreference = "Continue"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding           = [System.Text.Encoding]::UTF8
} catch { }

if (-not (Test-Path $RepoPath)) { throw "Repo ne postoji: $RepoPath" }
Set-Location -LiteralPath $RepoPath

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw "Claude Code nije u PATH-u." }
if (-not (Get-Command git -ErrorAction SilentlyContinue))    { throw "git nije u PATH-u." }
foreach ($f in @("docs\STUDIO-PLAN.md", "docs\STUDIO-NIGHT-REPORT.md", "convex\studio.ts")) {
  if (-not (Test-Path (Join-Path $RepoPath $f))) { throw "Nedostaje $f - pusti prvo run-studio-night.ps1." }
}

Remove-Item Env:CLAUDE_CODE_EFFORT_LEVEL -ErrorAction SilentlyContinue
$env:API_TIMEOUT_MS      = "3600000"
$env:BASH_MAX_TIMEOUT_MS = "1200000"   # 20 min - `npm run build` ume da potraje

$RunDir    = Join-Path $RepoPath ".studio-run"
$PromptDir = Join-Path $RunDir "prompts"
$LogDir    = Join-Path $RunDir "logs"
New-Item -ItemType Directory -Force -Path $PromptDir, $LogDir | Out-Null

$Stamp  = Get-Date -Format "yyyy-MM-dd_HH-mm"
$RunLog = Join-Path $LogDir "day_$Stamp.log"

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
# Zajednička pravila
# ---------------------------------------------------------------------

$Rules = @'
# Pravila za dnevni run - važe za svaki korak

Radiš nenadzirano dok je Jovan na poslu. Niko ti ne može odgovoriti na pitanje.
Kad naidješ na nejasnoću: izaberi najkonzervativniju opciju, upiši je u
`docs/STUDIO-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

Grana `feat/studio-faza-a` već sadrži ceo backend iz noćnog run-a (koraci
A1-A10). Ti ga popravljaš i oblačiš u UI. Ne pišeš ga ispočetka.

## Obavezno pročitaj pre pisanja koda
1. `docs/STUDIO-NIGHT-REPORT.md` - revizija sinoćnjeg rada. Tu su tačne
   putanje i brojevi linija za svaku rupu koju danas krpiš. Ovo čitaš PRVO.
2. `AGENTS.md` - naročito sistem od 4 radiusa i "Simplicity First".
3. `convex/_generated/ai/guidelines.md` - pre bilo kog Convex koda.
4. `docs/STUDIO-PLAN.md` - specifikacija; sekcija 2.3 su cene, 4.x arhitektura.
5. `docs/STUDIO-PROGRESS.md` - dnevnik; šta su prethodni koraci uradili.
6. Za bilo koji Next.js kod: `node_modules/next/dist/docs/`. Ovaj Next ima
   breaking changes u odnosu na ono što misliš da znaš. Ovo nije opciono.

## Apsolutne zabrane
- NE radi `git push`, `npx convex deploy`, `vercel deploy`
- NE pozivaj Stripe CLI ni bilo koji live Stripe/fal API
- NE postavljaj Convex env varijable
- NE menjaj ponašanje postojećeg subscription flow-a za kurseve
- NE "popravljaj" susedni kod koji nema veze sa zadatkom
- NE komentariši test i NE briši assertion da bi suite prošao

## Pravila za UI korake - čitaj pažljivo, ovde se najviše greši
- **Radiusi, samo 4 vrednosti:** kartica `surface-card` (16px), ugnježden panel
  `surface-inset` (12px), medij `surface-media` (8px), pilula `rounded-full`.
  Ništa drugo. Nikad `rounded-*!` ni inline `style={{borderRadius}}`.
- **Prvo pogledaj kako izgledaju postojeće stranice**, pa se uklopi:
  `app/[locale]/app/billing/page.tsx`, `app/[locale]/app/community/page.tsx`,
  `app/[locale]/app/profile/page.tsx` i komponente u `components/`. Koristi iste
  primitive i isti raspored. Ne uvodi nov dizajn jezik.
- **Bilingvalno.** Svaka stranica je pod `[locale]`; svaki tekst ima sr i en
  varijantu, po obrascu koji repo već koristi.
- **Realtime, bez pollinga.** Convex `useQuery` je već pretplata - status posla
  se osvežava sam. Nikad `setInterval`.
- **Cena uvek na dugmetu.** Nikad skrivena. Dugme glasi "Generiši - 20 kr".
- **Prazna stanja se pišu, ne zaboravljaju.** Nema kredita, nema generacija,
  Studio pauziran, posao neuspeo - svaki ima svoj tekst i svoj sledeći korak.
- Server komponente po defaultu; `"use client"` samo gde stvarno treba.

## Definicija završenog koraka
Sve tri moraju da prodju čisto:
    npx convex codegen
    npm run lint
    npm run test
Za korake koji dodaju stranice ili komponente, i četvrta:
    npm run build
Ako ne uspeš posle nekoliko pokušaja, upiši `BLOKADA:` u progress fajl sa
tačnom porukom greške i stani na tom koraku. Blokada je ispravan ishod, hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/STUDIO-PROGRESS.md`
```
## <ID koraka> - <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je uradjeno:** 3-6 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Testovi:** koje si napisao i šta pokrivaju
**Rezultat verifikacije:** codegen / lint / test / build
**BLOKADA:** nema - ili tačna poruka greške
**Za Jovana:** šta mora ručno da uradi ili proveri
```
Dopisuješ na kraj, ne brišeš tudje sekcije.
'@

$RulesFile = Join-Path $RunDir "rules-day.md"
Set-Content -LiteralPath $RulesFile -Value $Rules -Encoding utf8

# ---------------------------------------------------------------------
# Koraci
# ---------------------------------------------------------------------

$Steps = @()

$Steps += @{
  Id = "P1"; Model = "opus"; Effort = "max"
  Title = "Zakrpe: sest rupa kroz koje curi novac"
  Prompt = @'
Pročitaj `docs/STUDIO-NIGHT-REPORT.md`, sekciju RIZICI PO NOVAC. Tamo su tačne
putanje i brojevi linija. Zatvori svih šest rupa. Svaka dobija svoj test.

### 1. `params` se ne validiraju - rizik (f), najskuplji
`studioActions.submitJob` radi `{...model.defaultParams, ...job.params}` i ceo
objekat šalje fal-u. Klijent pošalje `{"prompt":"x","num_images":20}` i plati
cenu za jednu sliku, a fal naplati dvadeset.

Napiši u `convex/studioCore.ts` čistu funkciju:
```ts
export function sanitizeParams(
  schemaJson: string,
  raw: Record<string, unknown>,
): { ok: true; params: Record<string, unknown> } | { ok: false; reason: string }
```
Pravila: propušta SAMO ključeve koje `paramSchema` poznaje; brojeve odseca na
`min`/`max` iz šeme (ne baca, nego skraćuje - osim ako je izvan reda veličine,
tad odbija); `select` polja moraju biti iz dozvoljenog skupa; nepoznat ključ
tiho ispada. Rezultat te funkcije je ono što se upisuje u `generationJobs.params`
- dakle sanitizacija je u `createJob`, a `submitJob` šalje već očišćen objekat.

Testovi: `num_images: 20` -> odsečeno na 4 · nepoznat ključ ispada ·
`aspect_ratio` van skupa se odbija · prazna šema propušta samo `prompt`.

**Uz to popravi i seed:** `nano-banana-2` i `nano-banana-2-2k` dele isti
`falEndpoint`, kao i `nano-banana-pro` i `nano-banana-pro-4k`. Skuplji slug se
danas zaobilazi tako što izabereš jeftiniji i sam pošalješ parametre za veću
rezoluciju. Reši tako što rezolucija ulazi u `defaultParams` skupljeg sluga i
u `paramSchema` se NE izlaže kao polje koje klijent može da menja.

### 2. `submitJob` i `markJobRunning` ne gledaju status - rizik (b)
`submitJob` mora da izadje bez ikakvog dejstva ako posao nije `reserved`.
`markJobRunning` mora da odbije prelaz ako posao nije `reserved`. Bez toga
reaper iz koraka P2 otvara novu rupu dok zatvara staru: zakasneli
`markJobRunning` vrati refundiran posao u `running`, pa korisnik dobije i
refund i sliku.

### 3. Stripe webhook ćuti kad ne može da upiše - rizik (d1)
`app/api/stripe/webhook/route.ts`, funkcije `applyStripeGrants` i
`grantInvoiceCredits`: `if (!convex || !secret) { return; }` pa ruta vrati 200.
Stripe zaključi da je sve u redu i **nikad ne ponovi**. Novac naplaćen, krediti
nedodeljeni, nijedan log.

Neka te grane **bace**. Ruta tada vrati 500, Stripe ponavlja, a ponavljanje je
bezbedno jer je dodela idempotentna. Dodaj `console.error` sa `event.id` i
tipom pre bacanja. Isto važi za svaku grešku iz `applyStripeGrant`.

### 4. `payment_status` se ne proverava - rizik (d2)
Grana paketa gleda samo `mode === "payment"`. Kod odloženih načina plaćanja
(SEPA, bank transfer) `checkout.session.completed` puca sa
`payment_status: "unpaid"` - krediti pre para. Dodaj uslov
`session.payment_status === "paid"`, i obradi
`checkout.session.async_payment_succeeded` (tada dodeli) i
`checkout.session.async_payment_failed` (tada ne radi ništa, samo log).

### 5. Welcome bonus je po pretplati, ne po korisniku - rizik (d3)
Ključ idempotencije je `invoice.id + ":welcome"`. Otkaži pa se pretplati ponovo
= novih 150 kredita. Uz `allow_promotion_codes: true` i kupon od 100%, faktura
na 0 EUR se i dalje vodi kao plaćena, pa je to besplatna petlja.

Prebaci idempotenciju na korisnika: ključ `welcome:<userId>`, i u
`grantCredits` proveri postoji li već lot izvora `welcome_bonus` za tog
`userId`. Test: dve različite `subscription_create` fakture za istog korisnika
daju tačno 150 kredita ukupno.

### 6. Dnevni limit troška ne postoji - plan 4.4
`studioUsageDaily.costUsd` se upisuje, ali ga niko ne čita. Danas je jedini
plafon 50 generacija dnevno - pomnoženo cenom koju korisnik sam bira.

U `createJob`: ako bi `costUsd + model.estimatedCostUsd` prešlo **5 USD** za
tog korisnika tog dana -> greška `DNEVNI_LIMIT_TROSKA`. Prag kao konstanta u
`studioCore.ts` pored postojećih.

### Uz to, jedno otvrdnjavanje koje nije rupa nego nosivi zid
`createJob` čuva atomičnost samo zato što oko
`ctx.runMutation(internal.credits.spendCredits)` **nema** `try/catch`. Neko će
za tri meseca dodati `try/catch` da poruka bude lepša i tiho razvaliti
transakciju. Prebaci `spendCredits` u običnu helper funkciju koja prima `ctx`
i zove se direktno (interna mutacija može da ostane kao tanak omotač ako je
neko drugi zove). Tada je atomičnost strukturna, a ne slučajna. Postojeći
testovi moraju da prodju nepromenjeni.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test` - sve zeleno.
'@
}

$Steps += @{
  Id = "P2"; Model = "opus"; Effort = "high"
  Title = "Cronovi: reaper, istek kredita, istek fajlova"
  Prompt = @'
Napravi `convex/crons.ts`. Danas ne postoji nijedan cron, a indeks
`by_status_created` na `generationJobs` stoji napravljen i neiskorišćen baš
za prvi od ova tri.

### 1. Reaper zaglavljenih poslova - svakih 15 minuta
Najveća otvorena rupa iz noćnog izveštaja (rizik e). Posao koji ostane u
`running` znači skinute kredite bez rezultata **i** trajno zauzeto jedno od 3
mesta u limitu paralelnih poslova. Tri takva = korisnik kome Studio više nikad
ne radi, bez ijedne poruke koja mu kaže zašto.

Preko `by_status_created`: `running` stariji od 30 minuta i `reserved` stariji
od 5 minuta -> `failJob` (koja već radi failed -> refund -> refunded), sa
porukom greške `ISTEKAO_BEZ_ODGOVORA`. Obradi najviše 100 poslova po prolazu da
jedan zaglavljen prolaz ne obori sledeći.

Testovi: posao star 31 min se refundira · star 29 min se ne dira · posao koji
je već `done` se ne dira · reaper pušten dvaput refundira samo jednom.

### 2. Istek kredita - jednom dnevno
Krediti dobijaju `expiresAt` = +12 meseci i `planSpend` ih ispravno ignoriše
kad isteknu, ali ih niko ne gasi. Posledica: keširan `creditBalances.balance`
posle godinu dana pokazuje broj veći od stvarno potrošivog - korisniku pišeš
broj koji nije istinit.

Preko `by_expiry`: lot sa `expiresAt <= now` i `remaining > 0` -> upiši
`creditTransactions` red tipa `expiry` sa negativnim iznosom, postavi
`remaining: 0` i `exhaustedAt`, i **smanji keširan balans za isti iznos**.
Ako ne smanjiš keš, invarijantni test iz `credits.test.ts` puca - i to namerno.

Test: lot koji je istekao juče se gasi i balans padne · nezastareo se ne dira ·
invarijanta i dalje važi posle prolaza.

### 3. Istek fajlova - jednom dnevno
Preko `by_expiry` na `generationJobs`: posao sa `expiresAt <= now` i
`outputStorageId` -> `ctx.storage.delete`, obriši `outputStorageId` i
`posterStorageId`, **ali red ostavi**. Metapodatak (prompt, model, cena) ostaje
zauvek, da galerija može da ponudi "Generiši ponovo" (STUDIO-PLAN 0.2).

Ovaj cron zavisi od P3 koji tek popunjava `expiresAt`; napiši ga tako da nad
praznim skupom ne radi ništa i ne puca.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test`.
'@
}

$Steps += @{
  Id = "P3"; Model = "opus"; Effort = "high"
  Title = "persistOutput: izlaz u storage, labOutputs, retencija"
  Prompt = @'
`convex/studioActions.ts` -> `persistOutput` je prazan stub. Posledica: uspešna
generacija završi kao `done` sa fal URL-om koji kod fal-a živi kratko, fajl
nikad ne udje u Convex storage, `labOutputs` red ne postoji, `expiresAt` se ne
popunjava. **Korisnik praktično ne može da dodje do onoga što je platio.**

### Šta persistOutput radi
1. Učita posao; ako nije `done` ili nema izlazni URL -> izadji bez dejstva
   (idempotentno; webhook ume da je zakaže više puta).
2. Ako `outputStorageId` već postoji -> izadji (isto).
3. `fetch(url)` -> `blob` -> `ctx.storage.store(blob)` -> `outputStorageId`.
4. `expiresAt`: video **30 dana**, slike i zvuk **90 dana** (STUDIO-PLAN 0.2).
   Konstante u `studioCore.ts`.
5. Upiši `labOutputs` red: `kind` iz posla, `status: "ready"`, `storageId`,
   `mimeType`, `byteSize`, `title` = prvih 60 znakova prompta.
6. Ako posao ima `lessonId`/`taskId` - popuni ih na `labOutputs` redu, pa
   pozovi postojeću logiku iz `convex/lab.ts` da se `taskProgress.evidenceOutputId`
   postavi i leaderboard dogadjaj sinhronizuje. **Pročitaj `lab.ts` i iskoristi
   ono što već postoji; ne pravi paralelan put.**
7. Ako skidanje padne -> posao ostaje `done`, upiši `error`, i ne refundiraj:
   generacija JESTE uspela i fal je JESTE naplatio. Refund bi ovde bio poklon.
   Upiši u `error` tako da admin vidi.

### Uz to: `createJob` treba da prima kontekst lekcije
Dodaj opcione argumente `lessonId` i `taskId` i upiši ih na posao. Bez toga se
veza sa lekcijom iz tačke 6 nikad ne može popuniti. To je jedina stvar koju
Higgsfield ne može da kopira (STUDIO-PLAN 1.1) - ne preskači je.

### Poster frame za video - NEMOJ
U Convex akciji nema ffmpeg-a. Ne uvlači zavisnost i ne pokušavaj da dekoduješ
video ručno. Umesto toga u galeriji (korak P6) koristi
`<video preload="metadata">` sa `#t=0.1` fragmentom u `src` - browser povuče
samo zaglavlje i prikaže prvi kadar. Napiši to kao ODLUKU u progress.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test`. Testovi sa mock-ovanim
`fetch`: uspeh upiše storage + labOutputs + expiresAt · dva poziva daju jedan
storage fajl · neuspeh ne refundira.
'@
}

$Steps += @{
  Id = "P4"; Model = "sonnet"; Effort = "high"
  Title = "Mock provajder - ceo tok radi i bez FAL_KEY"
  Prompt = @'
Jovan još nema `FAL_KEY`. Bez ovog koraka ne može da vidi da išta radi: klikne
Generiši, posao ode u `failed`, krediti se vrate, i to je sve.

Napravi mock provajder koji zamenjuje fal kad ključa nema.

### Ponašanje
U `studioActions.submitJob`: ako `process.env.FAL_KEY` nije postavljen ILI je
`process.env.STUDIO_MOCK === "1"`, ne zovi fal. Umesto toga:
1. `markJobRunning` sa `falRequestId` = `"mock-" + jobId`
2. `ctx.scheduler.runAfter(3000, internal.studioActions.completeMockJob, { jobId })`

`completeMockJob` (interna akcija):
- 85% poslova uspe, 15% padne - **deterministički po `jobId`**, ne preko
  `Math.random()`, da bi testovi bili ponovljivi. Neuspeh je tu namerno: Jovan
  mora da vidi i da refund stvarno radi, ne samo srećan put.
- uspeh -> ide kroz **isti** put kao pravi webhook (`applyWebhookResult` ili
  ekvivalent), sa izlaznim URL-om ka javnoj placeholder slici; onda se zakaže
  `persistOutput` kao i inače
- neuspeh -> isti put kao ERROR webhook, dakle refund

Kao izlaz koristi generisan **SVG data URL** (prompt ispisan preko obojene
pozadine, boja izvedena iz `promptHash`). Bez mrežnog poziva, bez zavisnosti,
radi offline, i odmah se vidi koji prompt je dao koju sliku.

### Tvrde granice
- Mock NIKAD ne sme da se aktivira kad `FAL_KEY` postoji, osim ako je
  `STUDIO_MOCK=1` postavljen izričito.
- Kredit se troši i refundira **potpuno isto** kao u pravom toku. Ovo je demo
  provajdera, ne demo ledgera.
- U UI-ju (koraci P5-P7) posao iz mocka nosi vidljivu oznaku **"DEMO"** na
  kartici, da se generacija iz mocka nikad ne pomeša sa pravom.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test`. Testovi: bez ključa ide
mock · sa ključem ide fal · mock neuspeh refundira tačno jednom · isti `jobId`
uvek daje isti ishod.
'@
}

$Steps += @{
  Id = "P5"; Model = "opus"; Effort = "high"
  Title = "Stranica /sr/app/credits - balans, paketi, istorija"
  Prompt = @'
Prva stranica Studija. Danas `/api/stripe/credits` radi ali je **niko ne
poziva** - nema načina da korisnik kupi ijedan kredit.

Pre pisanja pogledaj `app/[locale]/app/billing/page.tsx` i
`app/[locale]/app/profile/page.tsx` pa se uklopi u isti raspored i iste
primitive. Ne uvodi nov dizajn jezik.

### `app/[locale]/app/credits/page.tsx`

**Vrh - balans.** Broj velikim fontom, uz njega sitnije "≈ X generacija slika".
Ako neki lot ističe za manje od 30 dana, red ispod: "N kredita ističe
<datum>". Kartica `surface-card`.

**Sredina - paketi.** `creditPacks` sa `kind: "pack"`, iz `listPacks`. Po
kartici: naziv, cena u evrima, broj kredita, bonus kao `rounded-full` značka,
i jedan red "otprilike: 25 slika ili 9 video klipova" izračunat iz kataloga.
Dugme zove `/api/stripe/credits`. Ako pack nema `stripePriceId`, dugme je
onemogućeno sa tekstom "Uskoro" - Jovan ih još nije povezao i stranica ne sme
da puca zbog toga.

**Premium kartica.** Odvojeno od paketa, vizuelno istaknuto: 24,99 EUR/mes,
2000 kredita svakog ciklusa, pristup Pro lekcijama. Uz nju rečenica koja radi
posao: "Isti novac u paketu daje 1650 kredita." Dugme vodi na rutu za
pretplatu iz sledećeg pasusa.

**Dno - istorija.** `getTransactions`, paginirano. Datum, tip (kupovina /
potrošnja / povraćaj / bonus / istek), iznos sa znakom, balans posle.
Potrošnja linkuje na generaciju u galeriji.

### Ruta za pretplatu na plan
`lib/stripe.ts` -> `createPlanCheckoutSession` je napisana i testirana, ali
**nema pozivaoca ni rutu**. Premium se trenutno ne može kupiti nikako.
Napravi `app/api/stripe/plan/route.ts` po obrascu iz
`app/api/stripe/credits/route.ts`.

### Obavezno
- Bilingvalno sr/en.
- Realtime: balans skoči sam kad webhook upiše kredite, bez refresh-a.
- Radiusi: kartice `surface-card`, paketi unutra `surface-inset`, značke
  `rounded-full`.
- Prazno stanje: nema transakcija -> "Još nisi kupio kredite" + strelica ka
  paketima gore.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test`, `npm run build`.
'@
}

$Steps += @{
  Id = "P6"; Model = "opus"; Effort = "high"
  Title = "Stranica /sr/app/studio - playground"
  Prompt = @'
Glavni ekran. `createJob` danas nema nijednog pozivaoca - jedini način da se
napravi posao je `npx convex run` iz terminala.

### Raspored - dve kolone, na mobilnom jedna ispod druge

**Levo, izbor modela.** `listModels({ kind: "image" })`. Kartica po modelu:
naziv, jedna rečenica čemu služi, **cena u kreditima kao `rounded-full`
značka**, i značka `preporuceno` / `skupo` gde je ima. Izabran model je
vizuelno jasan. Video i zvuk su isključeni u katalogu - prikaži ih zasivljeno
sa oznakom "Uskoro", ne sakrivaj ih.

**Levo ispod, forma.** Gradi se iz `model.paramSchema` (JSON): `textarea` za
prompt sa brojačem do 2000 znakova, `select` za odnos stranica, `number` za
broj slika sa min/max iz šeme. **Forma mora da poštuje iste granice koje
server proverava u `sanitizeParams`** - klijent ne sme da nudi ono što će
server odbiti.

**Dugme.** Tekst je **"Generiši - 20 kr"**, cena uvek vidljiva i uvek iz
kataloga. Stanja:
- nema dovoljno kredita -> tekst postaje "Dopuni kredite", vodi na
  `/[locale]/app/credits`
- 3 posla u letu -> onemogućeno, "Sačekaj da se završi trenutna generacija"
- Studio pauziran (`platformFlags`) -> ceo panel zamenjen porukom
- svaka greška iz `createJob` (`DNEVNI_LIMIT`, `DNEVNI_LIMIT_TROSKA`,
  `NEISPRAVAN_PROMPT`, `MODEL_NEDOSTUPAN`) ima **svoju** ljudsku poruku na
  srpskom. Nikad ne prikazuj sirov kod greške.

**Desno, rezultat.** `listMyJobs`, najnoviji posao veliko. Skeleton dok je
`reserved`/`running`, slika kad je `done`, poruka i "krediti su ti vraćeni" kad
je `refunded`. Ispod, poslednjih 6 generacija kao sitne pločice.
Posao iz mock provajdera nosi vidljivu **DEMO** značku.

Sve realtime preko `useQuery` - **nikakav polling, nikakav `setInterval`**.

### Balans u zaglavlju stranice
Uvek vidljiv, i klikom vodi na `/credits`. Kad se generacija pokrene, broj mora
da padne odmah.

### Obavezno
Bilingvalno. Radiusi po `AGENTS.md`. Prazno stanje kad korisnik nema nijednu
generaciju: kratko objašnjenje šta je Studio i predlog prvog prompta koji se
jednim klikom ubacuje u polje.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test`, `npm run build`.
'@
}

$Steps += @{
  Id = "P7"; Model = "sonnet"; Effort = "high"
  Title = "Galerija /sr/app/studio/gallery"
  Prompt = @'
Sve generacije korisnika na jednom mestu.

`app/[locale]/app/studio/gallery/page.tsx`, mreža kartica, `listMyJobs`
paginirano sa infinite scroll ili dugmetom "Učitaj još".

### Po kartici
Slika (ili prvi kadar videa), model, datum, cena u kreditima, i akcije:
**Preuzmi** · **Generiši ponovo** (vodi na playground sa popunjenim istim
promptom i modelom) · **Obriši**.

### Video - pravilo koje se ne krši
**Nikad `<video src>` u mreži.** To povlači ceo mp4 za svaki tile i pojede
egress. Koristi `<video preload="metadata">` sa `#t=0.1` fragmentom u `src` -
browser povuče samo zaglavlje i prikaže prvi kadar. Ceo fajl se učitava tek na
klik.

### Filteri
Tip (slika / video / zvuk), model, opseg datuma. Držati jednostavno - jedan red
`rounded-full` čipova iznad mreže.

### Istek
Kartica nosi značku "ističe za N dana" kad je manje od 7. Kad je fajl istekao,
kartica ostaje ali umesto slike stoji prompt i dugme
**"Generiši ponovo - 20 kr"**. Istek je prilika, ne rupa (STUDIO-PLAN 0.2).

### Preuzmi sve
Čekboksovi + dugme "Preuzmi izabrano (ZIP)". ZIP se pravi **u browseru**
(`fflate`), nikad u Convex akciji. Ako ti se `fflate` čini kao previše za ovaj
korak, uradi sekvencijalno preuzimanje i napiši to kao ODLUKU.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test`, `npm run build`.
'@
}

$Steps += @{
  Id = "P8"; Model = "sonnet"; Effort = "high"
  Title = "Admin ekran /sr/app/admin/studio"
  Prompt = @'
Sve admin mutacije su napisane i testirane u noćnom run-u (`upsertModel`,
`setModelEnabled`, `setModelCost`, `upsertPack`, `setPackActive`), ali nemaju
ekran. Cena modela se danas menja iz Convex dashboarda.

Pogledaj `app/[locale]/app/admin/page.tsx` i `admin/chat/` pa se uklopi u isti
obrazac, uključujući način na koji se proverava admin uloga.

### Tri sekcije

**1. Katalog modela.** Tabela: slug, tip, cena u kreditima, nabavna cena u USD,
**izračunata marža**, prekidač uključen/isključen. Cena se menja inline.
Marža ispod 2x se boji upozoravajuće - to je jedini broj na ekranu koji ti
kaže da nešto nije u redu pre nego što ti kaže bankovni izvod.

**2. Paketi i planovi.** Isti oblik. `stripePriceId` je polje koje se uredjuje -
Jovan ga posle ovog ekrana više ne mora tražiti po Convex dashboardu.

**3. Potrošnja.** `studioUsageDaily` agregirano: današnji ukupan trošak u USD,
top 10 korisnika po trošku, broj poslova po statusu. Plus **kill switch** -
prekidač `platformFlags.studio_enabled` sa potvrdom pre gašenja.

Ako ti za agregaciju treba nov query, napiši ga; `@convex-dev/aggregate` je
već instaliran ali ga za ovaj obim ne moraš uvoditi - obična agregacija po
danu je dovoljna i jednostavnija.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test`, `npm run build`.
'@
}

$Steps += @{
  Id = "P9"; Model = "sonnet"; Effort = "high"
  Title = "Navigacija, ulazne tacke i tekstovi"
  Prompt = @'
Stranice postoje, ali do njih se ne može doći nijednim klikom. Ovaj korak ih
povezuje - bez njega je ceo dosadašnji rad nevidljiv.

### 1. Glavna navigacija aplikacije
Nadji navigaciju koju koristi `app/[locale]/app/layout.tsx` (sidebar ili
header, u `components/`) i dodaj dve stavke: **Studio** i **Krediti**. Ikone iz
`lucide-react`, koji je već zavisnost. Aktivno stanje kao i ostale stavke.

### 2. Balans u zaglavlju
Broj kredita vidljiv iz svake stranice pod `/app`, klik vodi na `/app/credits`.
Sitno, `rounded-full`, ne dominira. Ako je 0, blago upozoravajuće obojeno.

### 3. Ulaz iz lekcije
U player-u lekcije (`app/[locale]/app/courses/[courseSlug]/lessons/...`), tamo
gde `lessonSteps.outputKind` nije `text`, dodaj dugme **"Otvori u Studiju"**
koje vodi na `/app/studio` sa `lessonId` i `taskId` u query parametrima, a
playground ih prosledjuje u `createJob` (P3 je dodao te argumente).

Ovo je veza zbog koje ceo proizvod postoji: generacija iz lekcije upisuje
`labOutputs` sa `taskId`, zadatak se sam zeleni, leaderboard dobija poene.
**Ako ti se ovaj deo pokaže kao veći od jednog koraka, uradi samo dugme i
prosledjivanje parametara**, a ostalo upiši u progress kao preostalo. Nemoj
prepravljati player.

### 4. Prazna stanja i poruke grešaka na jednom mestu
Skupi sve tekstove Studija (sr i en) u jedan modul umesto da su rasuti po
komponentama, po obrascu koji repo već koristi za lokalizaciju. Svaka greška iz
`createJob` mora imati ljudsku rečenicu i predlog šta dalje.

### Verifikacija
`npx convex codegen`, `npm run lint`, `npm run test`, `npm run build`.
'@
}

$Steps += @{
  Id = "P10"; Model = "opus"; Effort = "high"
  Title = "Kapija: build, seed i uputstvo za demo"
  Prompt = @'
Ne piši nove feature. Ovaj korak dokazuje da se sve što je napisano stvarno
pokreće, i ostavlja Jovanu uputstvo od pet minuta.

### 1. Kapija
Pusti redom i zabeleži TAČAN izlaz svake:
```
npx convex codegen
npm run lint
npm run test
npm run build
```
`npm run build` je ovde najvažniji - hvata greške u Next.js rutama i tipovima
koje `lint` propušta. Ako padne, popravljaj dok ne prodje. Ako ne možeš,
BLOKADA sa tačnom greškom.

### 2. Seed mutacija za demo kredite
Napravi `seed:grantDemoCredits` (zaštićeno `requireSyncSecret`) koja prima
`{ syncSecret, email, amount }`, nadje korisnika po mejlu i doda lot izvora
`admin_grant`. Bez toga Jovan mora da prodje kroz ceo Stripe da bi uopšte imao
šta da potroši.

### 3. Napiši `docs/STUDIO-DEMO.md`
Uputstvo koje se izvršava od vrha do dna, bez razmišljanja:

- **Pokretanje:** tačne komande za `npx convex dev` i `npm run dev` u dva
  terminala, i napomena da `FAL_KEY` NIJE potreban - mock provajder radi bez
  njega.
- **Seedovi:** tačne `npx convex run` komande sa `syncSecret` placeholder-om.
- **Dodela demo kredita sebi:** tačna komanda sa njegovim mejlom
  (jovanm028@gmail.com) i 2000 kredita.
- **Šetnja kroz proizvod, korak po korak sa URL-ovima:**
  1. `http://localhost:3000/sr/app/credits` - vidiš balans i pakete
  2. `http://localhost:3000/sr/app/studio` - izabereš model, upišeš prompt,
     klikneš Generiši, gledaš kako balans padne i kako se posao za ~3 s
     završi (DEMO značka)
  3. generiši 6-7 puta - jedna od njih će pasti, i tu vidiš da refund radi
  4. `http://localhost:3000/sr/app/studio/gallery` - sve generacije
  5. `http://localhost:3000/sr/app/admin/studio` - marže, potrošnja, kill switch
  6. ugasi kill switch pa osveži playground - vidiš poruku o pauzi
- **Šta NEĆE raditi bez podešavanja:** kupovina kredita (nema Stripe price
  ID-jeva), prave generacije (nema `FAL_KEY`). Za svaku - tačan link na
  odgovarajuću stavku iz `docs/STUDIO-NIGHT-REPORT.md`, sekcija RUČNI KORACI.
- **Deploy:** izričito napiši da ništa nije deploy-ovano, da je grana
  `feat/studio-faza-a` samo lokalna, i da je deploy svesna odluka koju donosi
  tek pošto ovo prodje na `localhost`.

Piši kratko i izvršivo. Nikakva teorija.

### Verifikacija
Sve četiri komande zelene, `docs/STUDIO-DEMO.md` napisan.
'@
}

$Steps += @{
  Id = "RV2"; Model = "opus"; Effort = "xhigh"
  Title = "Zavrsni review dnevnog run-a"
  Prompt = @'
Ne piši nove feature. Revizija svega što je danas uradjeno.

1. Pusti sve četiri verifikacione komande, zabeleži tačan izlaz.
2. `git log --oneline` za granu, `git diff --stat main...HEAD`.
3. Pročitaj sekcije P1-P10 u `docs/STUDIO-PROGRESS.md`.
4. Pročitaj `docs/STUDIO-NIGHT-REPORT.md` sekciju RIZICI PO NOVAC.

Napiši `docs/STUDIO-DAY-REPORT.md`:

**ZATVORENE RUPE** - za svaku od šest iz P1 plus tri crona iz P2: da li je
stvarno zatvorena, kojim kodom, i kojim testom. Ako je neka samo delimično,
reci to izričito. Prodji ponovo kroz listu a-f iz noćnog izveštaja i daj nov
status za svaku.

**NOVE RUPE** - šta je današnji rad otvorio. UI je nov napadni ugao: da li
neka stranica čita podatke koje ne bi smela, da li neki query vraća tudje
poslove, da li admin ekran proverava ulogu na serveru a ne samo u UI-ju, da li
`/api/stripe/plan` proverava sve što proverava `/api/stripe/credits`.

**ŠTA SE STVARNO VIDI** - iskreno: koje stranice postoje, koje rade sa mock
provajderom, koje traže podešavanje pre nego što išta urade. Bez ulepšavanja.

**PREOSTALO PRE PRVOG EVRA** - numerisano, sa procenom.

**PREPORUKA** - jedna rečenica: da li je ovo spremno da se pusti na produkciju
posle ručnog podešavanja, ili treba još jedan krug.

Budi strog. Jovan se vraća s posla i mora da zna gde je tanko.
Na kraju dopiši sekciju i u `docs/STUDIO-PROGRESS.md`.
'@
}

# ---------------------------------------------------------------------
# Izvršavanje
# ---------------------------------------------------------------------

if ($Only) {
  $wanted = $Only.Split(",") | ForEach-Object { $_.Trim().ToUpper() }
  $Steps  = @($Steps | Where-Object { $wanted -contains $_.Id })
  Log "Filtrirano na: $(($Steps | ForEach-Object { $_.Id }) -join ', ')"
}

Log "=================================================="
Log " STUDIO FAZA A2 - zakrpe + frontend"
Log " Repo:   $RepoPath"
Log " Grana:  $Branch"
Log " Koraka: $($Steps.Count)"
Log " Nastavlja na grani, ne staje na gresci."
Log "=================================================="

$cur = Invoke-Git @("rev-parse", "--abbrev-ref", "HEAD")
if ($cur.Out -ne $Branch) {
  $has = Invoke-Git @("branch", "--list", $Branch)
  if ($has.Out) { $r = Invoke-Git @("checkout", $Branch) }
  else          { $r = Invoke-Git @("checkout", "-b", $Branch) }
  if ($r.Code -ne 0) { throw "Ne mogu na granu ${Branch}: $($r.Out)" }
}
Log "Grana: $Branch"

$dirty = (Invoke-Git @("status", "--porcelain")).Out
if ($dirty -and -not $DryRun) {
  Log "Nekomitovane izmene - commitujem pre starta."
  Invoke-Git @("add", "-A") | Out-Null
  Invoke-Git @("commit", "-m", "wip: stanje pre dnevnog studio run-a") | Out-Null
}

$ProgressFile = Join-Path $RepoPath "docs\STUDIO-PROGRESS.md"
$Results   = @()
$TotalCost = 0.0

foreach ($step in $Steps) {

  $id = $step.Id
  Log ""
  Log "--------------------------------------------------"
  Log " $id  |  $($step.Title)"
  Log " model=$($step.Model)  effort=$($step.Effort)"
  Log "--------------------------------------------------"

  $promptFile = Join-Path $PromptDir "$id.md"
  Set-Content -LiteralPath $promptFile -Value $step.Prompt -Encoding utf8

  if ($DryRun) { Log "DRY RUN - prompt zapisan."; continue }

  $progLenBefore = if (Test-Path $ProgressFile) { (Get-Item $ProgressFile).Length } else { 0 }

  $started = Get-Date
  $attempt = 0
  $ok      = $false
  $cost    = 0.0

  while ($attempt -lt 2 -and -not $ok) {
    $attempt++
    if ($attempt -gt 1) { Log "Pokusaj $attempt..." }

    $outFile = Join-Path $LogDir "$($id)_a$attempt.json"
    $errFile = Join-Path $LogDir "$($id)_a$attempt.err.txt"

    $taskLine = "Read the file .studio-run/prompts/$id.md and carry out every instruction in it, completely. That file is your entire task for this session. Also read .studio-run/rules-day.md if it is not already in your context."

    $claudeArgs = @(
      "-p", $taskLine,
      "--model", $step.Model,
      "--effort", $step.Effort,
      "--dangerously-skip-permissions",
      "--disallowedTools", $Denied,
      "--append-system-prompt-file", $RulesFile,
      "--output-format", "json",
      "--max-turns", "500"
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
      } catch { Log "Izlaz nije validan JSON - neuspeh." }
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

  $changed = @((Invoke-Git @("status", "--porcelain")).Out -split "`r?`n" | Where-Object { $_ })
  if ($changed.Count -gt 0) {
    Invoke-Git @("add", "-A") | Out-Null
    Invoke-Git @("commit", "-m", "studio($id): $($step.Title)") | Out-Null
    $commit = (Invoke-Git @("rev-parse", "--short", "HEAD")).Out
    Log "Commit $commit - $($changed.Count) putanja"
  } else {
    $commit = "-"
    Log "UPOZORENJE: korak nije napravio nijednu izmenu."
    $ok = $false
  }

  # Blokada se cita samo iz novododatog dela; "nema" nije blokada.
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
    Korak = $id; Status = $status; Minuta = $elapsed
    CenaUSD = "{0:N2}" -f $cost; Commit = $commit
  }
  Log "$id -> $status  ($elapsed min, USD $("{0:N2}" -f $cost))"

  if (-not $ok -and $StopOnError) {
    Log "STOP: -StopOnError je postavljen."
    break
  }
}

Log ""
Log "=================================================="
Log " GOTOVO"
Log "=================================================="
if ($Results.Count -gt 0) {
  ($Results | Format-Table -AutoSize | Out-String) -split "`r?`n" |
    Where-Object { $_ } | ForEach-Object { Log $_ }
  $Results | Export-Csv -LiteralPath (Join-Path $LogDir "day_summary_$Stamp.csv") -NoTypeInformation -Encoding utf8
}
Log ("Ukupna cena: USD " + ("{0:N2}" -f $TotalCost))
Log "Grana: $Branch  (NIJE push-ovana, NIJE deploy-ovana)"
Log ""
Log "Kad se vratis:"
Log "  1. docs\STUDIO-DEMO.md        - upali i klikaj, 5 minuta"
Log "  2. docs\STUDIO-DAY-REPORT.md  - sta je zatvoreno, sta nije"
Log "  3. npx convex dev   (terminal 1)"
Log "     npm run dev      (terminal 2)"
Log "     http://localhost:3000/sr/app/studio"
