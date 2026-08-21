# =====================================================================
#  NAUCI AI - STUDIO: zatvaranje rupa N1-N7 pre naplate
#  ---------------------------------------------------------------
#      cd "C:\Users\admin\Desktop\Web Dev Projects\nauciai"
#      powershell -ExecutionPolicy Bypass -File .\run-studio-hard.ps1 -DryRun
#      powershell -ExecutionPolicy Bypass -File .\run-studio-hard.ps1
#
#  X1  N2 prva polovina: donja granica trajanja iz bajtova
#  X2  N2 druga polovina: naplata po stvarnom trosku, poravnanje razlike
#  X3  N6: actualCostUsd da stvarno proizvodi podatke
#  X4  N1: moderator ne sme da vidi tudje promptove i snimke
#  X5  N3 i N4: vlasnistvo po izdatom tokenu, brava na merenje
#  X6  N5 i N7: plafon koji tiho pukne, ulazi koji ostaju zauvek
#  X7  Pravni tekst, 18+, PDV i tri Stripe dogadjaja kojih nema
#  XRV zavrsni review
#
#  Ovaj run je iskljucivo popravka. Nema nijednog novog feature-a.
#  Izvor istine je docs/STUDIO-FIX-REPORT.md, nalazi N1-N7.
#  Najskuplji je N2: 6,50 EUR kredita -> do 3.600 USD racuna, bez alarma.
#  X1 i X2 su zajedno njegov jedini odgovor, zato su oba na effort=max.
#
#  NE radi: deploy, git push. Grana ostaje lokalna.
# =====================================================================

param(
  [string] $RepoPath = "C:\Users\admin\Desktop\Web Dev Projects\nauciai",
  [string] $Branch   = "feat/studio-faza-a",
  [switch] $StopOnError,
  [switch] $DryRun,
  [string] $Only = "",
  [int]    $NetWaitSeconds = 180,
  [int]    $MaxNetRetries  = 5
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
foreach ($f in @("docs\STUDIO-FIX-REPORT.md", "docs\STUDIO-CATALOG-V4.md", "convex\studioPricing.ts", "lib\media-duration.ts")) {
  if (-not (Test-Path (Join-Path $RepoPath $f))) { throw "Nedostaje $f" }
}
if (Test-Path (Join-Path $RepoPath ".git\index.lock")) {
  Write-Host "Zatecen .git\index.lock - sklanjam ga (inace nijedan korak ne bi bio commitovan)."
  Remove-Item -LiteralPath (Join-Path $RepoPath ".git\index.lock") -Force -ErrorAction SilentlyContinue
  if (Test-Path (Join-Path $RepoPath ".git\index.lock")) { throw "Ne mogu da obrisem .git\index.lock. Obrisi ga rucno pa pokreni ponovo." }
}

Remove-Item Env:CLAUDE_CODE_EFFORT_LEVEL -ErrorAction SilentlyContinue
$env:API_TIMEOUT_MS      = "3600000"
$env:BASH_MAX_TIMEOUT_MS = "1200000"

$RunDir    = Join-Path $RepoPath ".studio-run"
$PromptDir = Join-Path $RunDir "prompts"
$LogDir    = Join-Path $RunDir "logs"
New-Item -ItemType Directory -Force -Path $PromptDir, $LogDir | Out-Null

$Stamp  = Get-Date -Format "yyyy-MM-dd_HH-mm"
$RunLog = Join-Path $LogDir "hard_$Stamp.log"

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

# Prepoznaje pad mreze / API-ja, koji nije greska koraka nego okoline.
function Test-NetworkFailure([string]$raw, [string]$err) {
  $hay = "$raw`n$err"
  foreach ($needle in @(
      "ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN",
      "reach the API server", "terminal_reason...api_error",
      "socket hang up", "getaddrinfo", "network error", "Service Unavailable",
      "Internal Server Error", "Overloaded", "rate_limit")) {
    if ($hay -match $needle) { return $true }
  }
  return $false
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

$Rules = @'
# Pravila za hard run - vaze za svaki korak

Radis nenadzirano. Kad naidjes na nejasnocu: izaberi najkonzervativniju opciju,
upisi je u `docs/STUDIO-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

Grana `feat/studio-faza-a` sadrzi ceo Studio: ledger, kredite, Stripe, tri
provajdera, katalog od 30 modela sa `paramSpec` i `priceRule`, deljene
komponente, sve stranice, globalni plafon troska i merenje trajanja iz zaglavlja.
**Ti zatvaras rupe, ne pises nista ispocetka i ne dodajes nijedan nov feature.**

Marza je algebarski osigurana na 2,5x i to ne smes da pokvaris: `computeCredits`
(`convex/studioPricing.ts:265-273`) radi `ceil(C * 216,25)` tacno jednom na kraju.
Ako ti izmena trazi da diras cenovni motor, stani i upisi zasto.

## Obavezno procitaj pre pisanja koda
1. `docs/STUDIO-FIX-REPORT.md` - **izvor istine za ovaj run.** Sekcija 2 su
   nalazi N1-N7 sa tacnim putanjama i brojevima linija, sekcija 5 je lista
   onoga sto blokira naplatu. Citas ga PRVI.
2. `docs/STUDIO-CATALOG-V4.md` - katalog, cene, ulazni rezimi.
3. `AGENTS.md` - 4 radiusa, "Simplicity First", hirurske izmene.
4. `convex/_generated/ai/guidelines.md` - pre bilo kog Convex koda.
5. `docs/STUDIO-PROGRESS.md` - dnevnik.
6. Za Next.js kod: `node_modules/next/dist/docs/`. Nije opciono.

## Apsolutne zabrane
- NE radi `git push`, `npx convex deploy`, `vercel deploy`
- NE pozivaj live Stripe, fal, Google ni BytePlus API
- NE postavljaj Convex env varijable
- NE menjaj ponasanje postojeceg subscription flow-a za kurseve
- NE diraj cenovni motor `convex/studioPricing.ts` osim gde korak to izricito trazi
- NE "popravljaj" susedni kod koji nema veze sa zadatkom
- NE komentarisi test i NE brisi assertion da bi suite prosao

## Konvencije repoa
- Cista logika u `convex/<ime>Core.ts` (bez `ctx`), testovi pored.
- `mutation`/`query`/`action` iz `./_generated/server`.
- Helperi iz `convex/helpers.ts`: `requireUserId`, `requireAdmin`, `requireSyncSecret`.
- Indeksi imenovani po poljima.
- Radiusi: samo `surface-card`, `surface-inset`, `surface-media`, `rounded-full`.

## Definicija zavrsenog koraka
Sve cetiri moraju da prodju cisto:
    npx convex codegen
    npm run lint
    npm run test
    npm run build
Neiskoriscen import je greska koju si ti napravio. Ako ne uspes posle nekoliko
pokusaja, upisi `BLOKADA:` sa tacnom porukom greske i stani na tom koraku.

## Na kraju SVAKOG koraka dopisi u `docs/STUDIO-PROGRESS.md`
```
## <ID> - <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Sta je uradjeno:** 3-6 recenica
**ODLUKE:** svaka nejasnoca koju si sam resio i zasto
**Testovi:** koje si napisao i sta pokrivaju
**Rezultat verifikacije:** codegen / lint / test / build
**BLOKADA:** nema - ili tacna poruka greske
**Za Jovana:** sta mora rucno da uradi ili proveri
```
Dopisujes na kraj, ne brises tudje sekcije.
'@

$RulesFile = Join-Path $RunDir "rules-hard.md"
Set-Content -LiteralPath $RulesFile -Value $Rules -Encoding utf8

# ---------------------------------------------------------------------

$Steps = @()

$Steps += @{
  Id = "X1"; Model = "opus"; Effort = "max"
  Title = "N2 prva polovina: donja granica trajanja iz bajtova"
  Prompt = @'
Procitaj `docs/STUDIO-FIX-REPORT.md`, nalaz **N2** i **R3** tacke 1-3.

Danas se sedam mernih modela naplacuje po broju iz ZAGLAVLJA fajla. Zaglavlje je
metapodatak, ne medij. Fajl kojem je `mvhd.duration` prepravljen na 6 sekundi
naplacuje se kao 6 sekundi, a provajder obradi 120 minuta. Marza 0,002x.
Oba plafona troska (`MAX_DAILY_COST_USD = 5` po korisniku, alarm 50 USD i kill
100 USD globalno) sabiraju `estimatedCostUsd`, koji je izveden iz tog istog
zaglavlja - dakle nijedan plafon ne opali.

Ovaj korak resava POLOVINU problema: cini da lazno zaglavlje ne prodje.
Drugu polovinu (naplata po stvarnom trosku) radi korak X2. Ne diraj X2 teritoriju.

## 1. Donja granica trajanja iz velicine fajla

Fizika: fajl od N bajtova ne moze da traje krace od `N * 8 / MAKSIMALAN_BITRATE`.
Napadac moze da lazira zaglavlje, ali ne moze da smanji fajl a da mediju ostane
sadrzaj koji provajder naplacuje.

U `lib/media-duration.ts` dodaj:

```
export const MAX_PLAUSIBLE_BITRATE_BPS: Record<string, number>
```

Predlog vrednosti, sa obrazlozenjem u komentaru iznad svake:
- `audio/mpeg`   320_000    (MP3 standard ne ide iznad 320 kbps)
- `audio/wav`    3_072_000  (24-bit 96 kHz stereo, gornja granica PCM-a)
- `audio/mp4`    512_000    (AAC praktican maksimum)
- `audio/webm`   512_000    (Opus praktican maksimum)
- `video/mp4`    50_000_000
- `video/quicktime` 200_000_000  (ProRes ume ovoliko)
- `video/webm`   50_000_000

Napisi funkciju:

```
export function lowerBoundSeconds(bytes: number, mimeType: string): number | null
```

Vraca `null` za nepoznat MIME. Za poznat: `(bytes * 8) / MAX_PLAUSIBLE_BITRATE_BPS[mime]`.

## 2. Ugradi je u naplatu

U `convex/studioJobCore.ts`, `resolveMeasuredQuantity` (`:327`) danas uzima
izmerene sekunde i zaokruzuje. Neka umesto toga radi nad
`Math.max(headerSeconds, lowerBoundSeconds(bytes, mimeType))`.

Bajtovi i MIME vec stoje na redu `studioUploads` (`bytes`, `mimeType`), upisani
iz `_storage`, ne iz onoga sto je klijent rekao - to je W4 vec resio. Prosledi ih
kroz `ownedInputUploads` (`convex/studio.ts:100`) zajedno sa `durationS`.

Kad donja granica **nadjaca** zaglavlje, to je signal. Upisi na red posla polje
`durationSource: "lower_bound" | "header"` i, kad je `lower_bound`, i oba broja.
Kasnije ce se po tome prepoznavati ko pokusava.

## 3. Gornja granica kao provera zdravog razuma

Isto tako: fajl od N bajtova ne moze da traje duze od `N * 8 / MINIMALAN_BITRATE`.
Sa `MIN_PLAUSIBLE_BITRATE_BPS` (npr. 8_000 za zvuk, 100_000 za video) odbij posao
sa `ZAGLAVLJE_NEMOGUCE` kad zaglavlje tvrdi trajanje iznad te granice. Ovo hvata
suprotan napad: mali fajl sa zaglavljem koje tvrdi 10 sati, da bi se pojeo dnevni
plafon nekog drugog ili napunio `studioUsageDaily`.

## 4. Popravi VBR MP3

`readMp3` (`lib/media-duration.ts:329-331`) kad nema Xing ni VBRI racuna
`(totalBytes - start) * 8 / bitrate_PRVOG_frejma`. VBR fajl ciji je prvi frejm
320 kbps a ostatak 32 kbps prijavi desetinu stvarnog trajanja, i to je legalan
MP3 koji svaki enkoder ume da napravi. To je jedini put na kojem parser vraca
POGRESAN broj umesto da odbije posao.

Popravka: prosetaj do 200 frejmova u ucitanoj glavi, uzmi **prosek** bitrate-a,
pa racunaj po njemu. Ako se bitrate-i razlikuju vise od 2x, ne veruj proseku -
vrati `ok: false` sa `VBR_NEPOUZDAN`, pa donja granica iz tacke 2 preuzima.

## 5. Poruke greske

`MERENJE_NIJE_DOSTUPNO`, `ZAGLAVLJE_NIJE_PROCITANO`, `ZAGLAVLJE_NEMOGUCE`,
`VBR_NEPOUZDAN` - svaka mora da ima ljudsku srpsku poruku u UI-ju koja kaze
sta korisnik da uradi (npr. "Ne mogu da procitam trajanje snimka. Probaj da ga
izvezes kao MP4 ili WAV."). Ne ostavljaj korisnika sa kodom greske.

## Testovi
Zaglavlje 6 s + 288 MB MP3 -> naplaceno 120 min, ne 6 s - pravi 3-minutni MP3
prolazi netaknut (donja granica je ispod zaglavlja) - WAV je tacan pa se granica
nikad ne aktivira - VBR bez Xing-a sa promenljivim bitrate-om vrati
`VBR_NEPOUZDAN` - fajl od 1 MB sa zaglavljem od 10 sati pada na
`ZAGLAVLJE_NEMOGUCE` - nepoznat MIME ne aktivira granicu nego postojecu putanju -
`durationSource` se upisuje tacno.

## Verifikacija
Sve cetiri. Dopisi `## X1`.
'@
}

$Steps += @{
  Id = "X2"; Model = "opus"; Effort = "max"
  Title = "N2 druga polovina: naplata po stvarnom trosku, poravnanje razlike"
  Prompt = @'
Procitaj `docs/STUDIO-FIX-REPORT.md`, nalaz **N2**, i sekciju 6 ("Preporuka").

X1 je ucinio da lazno zaglavlje tesko prodje. Ovaj korak cini da je i **prolaz
bezopasan**: sta god da je rezervisano na pocetku, na kraju se naplacuje ono sto
je stvarno potroseno.

## Princip

Danas je jedna naplata: `createJob` skine kredite po `estimatedCostUsd` i tu je
kraj. Uvedi dvofazno poravnanje, po ugledu na ono sto vec postoji za Stripe:

1. **Rezervacija** kod `createJob` - ostaje kako jeste, po proceni iz X1.
2. **Poravnanje** kad posao zavrsi - preracunaj cenu po **stvarnoj** kolicini i
   poravnaj razliku.

## Odakle stvarna kolicina

Po redu pouzdanosti:
1. Provajder je prijavio u odgovoru (ElevenLabs vraca trajanje obradjenog zvuka,
   fal vraca metapodatke o izlazu, video rute vracaju stvarno trajanje klipa).
   Prosiri `convex/studioActualCost.ts` `recordProviderUsage` da pored tokena
   hvata i **kolicinu**.
2. Ako provajder nije prijavio kolicinu ali jeste cenu (`actualCostUsd`),
   poravnaj po ceni direktno.
3. Ako nije prijavio nista - ostavi rezervaciju kakva jeste i upisi
   `settlementReason: "provajder nije prijavio"`. Ne izmisljaj broj.

Imena polja u odgovorima provajdera **nisu potvrdjena protiv zivog API-ja** i to
je zabelezeno u W6 ODLUKA 10. Zato parser mora da bude tolerantan: trazi kolicinu
po vise mogucih imena, i kad je ne nadje - to je slucaj 3, ne pad.

## Poravnanje

Nova internalMutation `settleJobCredits` u `convex/studio.ts`:
- **idempotentna po `jobId`** - drugi poziv ne radi nista. Ovo je obavezno, jer
  i webhook i poller mogu da je pozovu za isti posao.
- razlika navise: skini dodatne kredite. Ako korisnik nema dovoljno, skini koliko
  ima, upisi dug na red posla (`unsettledCredits`) i **onemoguci mu nove poslove**
  dok dug postoji. Ne blokiraj isporuku vec zavrsenog posla.
- razlika nanize: vrati kredite. Koristi isti mehanizam kao
  `credits.refundCredits` (`convex/credits.ts:336`), ali za DELIMICAN iznos -
  ako ta mutacija ume samo pun refund, izdvoji zajednicko jezgro umesto da
  duplira logiku.
- upisi u `creditTransactions` kao zaseban red sa tipom poravnanja, da se u
  istoriji vidi i rezervacija i korekcija.

## Plafoni moraju da mere poravnat broj

Ovo je poenta celog naloga N2. `studioUsageDaily.costUsd` (`convex/studio.ts:459`,
`:467`) danas sabira procenu. Neka `settleJobCredits` **koriguje** taj dan za
razliku. Posledica: i plafon po korisniku (`:412`) i globalni plafon
(`convex/crons.ts:181`) gledaju stvaran trosak cim on postane poznat.

Refundiran posao mora da **oduzme** svoj udeo iz `studioUsageDaily` - proveri da
li se to danas radi kod `credits.refundCredits`; ako ne, to je ista rupa u malom.

## Sta ovo NE resava

Prozor izmedju rezervacije i poravnanja i dalje postoji. Zato u `studioCore.ts`
dodaj drugi plafon: **zbir NEPORAVNATIH poslova po korisniku**
(`MAX_UNSETTLED_COST_USD`, predlog 3 USD). Cim korisnik ima toliko u vazduhu, novi
posao ceka. Ovo je jeftina brava koja zatvara paralelni napad iz N2 nezavisno
od X1.

## Testovi
Poravnanje navise skida razliku - nanize vraca - drugi poziv ne radi nista -
provajder bez kolicine ostavlja rezervaciju i upisuje razlog - korisnik bez
kredita dobija dug i blokadu novih poslova - `studioUsageDaily` posle poravnanja
sadrzi stvaran broj - refund oduzima iz dnevnog zbira - `MAX_UNSETTLED_COST_USD`
blokira 4. posao kad su 3 u vazduhu - ceo napad iz N2 (zaglavlje 0,1 min, fajl
120 min) zavrsi tako da je korisniku skinuto 120 minuta ili je posao odbijen,
nikad 0,1 minut.

## Verifikacija
Sve cetiri. Dopisi `## X2`.
'@
}

$Steps += @{
  Id = "X3"; Model = "opus"; Effort = "high"
  Title = "N6: actualCostUsd da stvarno proizvodi podatke, i da glasno cuti"
  Prompt = @'
Procitaj `docs/STUDIO-FIX-REPORT.md`, nalaz **N6**.

W6 je napisao ceo mehanizam za stvaran trosak, sa 24 testa, koji danas **ne
proizvodi nijedan podatak ni za jedan model**. Posledica: kolona "Stvarna marza"
je prazna za svih 30 modela, alarm na odstupanje preko 30% nema sta da poredi,
i nalaz N2 nema detektor.

## 1. Google - tri rupe

`tokenCostUsd` (`convex/studioActualCostCore.ts:157`) vraca `null` cim jedna
prijavljena kategorija tokena nema tarifu.

- `nano-banana-pro` (`convex/providers/googleImageModels.ts:138`) ima
  `tokenRatesUsdPerMillion: { output: 119.64, thinking: 12 }` - **nema `prompt`**,
  a Google `usageMetadata` uvek prijavi `promptTokenCount`. Dakle `null` za svaki
  Google posao.
- `veo-31-fast` i `gemini-omni` nemaju tarifu uopste.

Dopuni tarife iz `docs/STUDIO-CATALOG-V4.md`. **Ako tacna cifra za neku
kategoriju ne postoji u katalogu, NE izmisljaj je.** Umesto toga vidi tacku 3.

## 2. BytePlus - nula tarifa

Nijedan BytePlus red nema `tokenRatesUsdPerMillion`. Seedance se ionako ne
naplacuje po tokenima nego po sekundi izlaza, pa je za njega ispravno da stvaran
trosak dodje iz **prijavljene kolicine** (koliko je sekundi stvarno renderovano),
ne iz tokena. Napravi tu putanju: `actualCostUsd = computeCostUsd(rule, params)`
nad kolicinom koju je BytePlus prijavio.

## 3. Nikad tiho `null`

Ovo je jezgro koraka. Svaki zavrsen posao mora da izadje sa **jednim od dva**:
- `actualCostUsd` (broj), ili
- `actualCostReason` (string) - tacan razlog zasto ga nema.

Razlozi treba da budu razlikovni, ne jedan opsti: `nema tarife za kategoriju
prompt`, `provajder nije prijavio upotrebu`, `model se ne naplacuje po tokenima`,
`fal billing event nije stigao`, `nepoznat oblik odgovora`.

Na admin ekranu (`convex/studioAdmin.ts`) kolona vise ne sme da pise "nema
merenja" za sve. Prikazi razlog po modelu i **broj poslova po razlogu**. Jovan
mora da vidi razliku izmedju "ovaj model se ne meri po dizajnu" i "ovaj model bi
trebalo da se meri ali nesto ne radi".

## 4. fal - potvrdi oblik, ne pretpostavljaj

`reconcileFalCosts` (`convex/studioActualCost.ts:258`) zavisi od
`GET /v1/models/billing-events`, cija imena polja nisu potvrdjena. Ne mozes da
pozoves zivi API iz ovog koraka i ne treba. Umesto toga: kad odgovor ne odgovara
ocekivanom obliku, upisi **sirov JSON prvog neprepoznatog dogadjaja** u novu
tabelu `studioProviderSamples` (jedan red po provajderu i modelu, prepisuje se) i
podigni razlog `nepoznat oblik odgovora`. Tako ce Jovan posle prve prave
generacije imati tacan oblik pred sobom umesto da nagadja.

Isto uradi za Google `usageMetadata` i za BytePlus odgovor.

## 5. Alarm na odstupanje

`exceedsCostDeviation` (`:195`) i `COST_DEVIATION_STREAK = 5` su vec tu. Kad
poravnanje iz X2 pocne da radi, ovaj alarm treba da poredi **poravnat** trosak sa
prvobitnom procenom, ne obrnuto. Uskladi.

## Testovi
Google posao sa sve tri kategorije tokena daje broj - bez tarife za `prompt` daje
razlog, ne `null` - BytePlus posao daje broj iz prijavljene kolicine - neprepoznat
oblik upise uzorak i razlog - uzorak se prepisuje, ne gomila - admin agregat
grupise po razlogu - nijedan zavrsen posao nema ni cenu ni razlog (test koji to
tvrdi mora da postoji i da prolazi prazan).

## Verifikacija
Sve cetiri. Dopisi `## X3`.
'@
}

$Steps += @{
  Id = "X4"; Model = "opus"; Effort = "high"
  Title = "N1: moderator ne sme da vidi tudje promptove i tudje snimke"
  Prompt = @'
Procitaj `docs/STUDIO-FIX-REPORT.md`, nalaz **N1**.

Provera uloge na serveru JESTE ispravna - `requireStudioStaff`
(`convex/studio.ts:760`) radi svoj posao i testovi to pokrivaju. Rupa je u tome
**sta taj upit vraca**: `listAllJobs` koristi isti `toGalleryJob` (`:703`) kao i
korisnikova galerija, pa red o tudjem poslu nosi ceo prompt, potpisane URL-ove
tudjih okacenih fajlova (fotografije lica za `kling-avatar`, glasovni snimci za
`voice-changer`, video za `dubbing`) i tudji izlaz.

A `isStudioStaff` (`convex/studioCore.ts:24`) pusta i **moderatora** - ulogu
zajednice koju admin dodeljuje (`convex/profiles.ts` `setProfileRole:182`).
Poredjenja radi, `studioAdmin.*` trazi strogo `admin` (`convex/studioAdmin.ts:22`).
Ekran sa novcem je uzi od ekrana sa sadrzajem. To je naopako.

## 1. Dva nivoa, ne jedan

**Moderacijski red** (moderator i admin): model, provajder, status, kredit, cena,
mejl vlasnika, vreme, i **izlaz** - jer se izlaz moderira. Bez prompta, bez
ulaznih slicica.

**Pun red** (samo `admin`): sve iznad plus prompt, parametri i ulazne slicice.

Ne resavaj ovo filtriranjem u React-u. `listAllJobs` neka **ne dovlaci** polja
koja pozivalac ne sme da vidi. Ako podatak ne izadje iz Convex-a, ne moze da
iscuri.

## 2. Otkrivanje pojedinacnog posla se belezi

Novi query/mutation `revealJobDetail(jobId)` - samo `admin`, vraca prompt i
ulazne slicice za **jedan** posao i upisuje red u novu tabelu `studioAuditLog`:
ko, koji posao, ciji, kad, sta je otkriveno. Indeks `by_actor` i `by_job`.

U UI-ju to je dugme "Prikazi detalje" na kartici, ne automatski prikaz. Admin
mora da svesno klikne. Uz dugme stoji tiha napomena da se pristup belezi.

## 3. Moderator ne dobija spisak mejlova

`listJobOwners` (`:861`) danas vraca pun spisak mejlova svih korisnika Studija.
Za moderatora vrati anonimizovan identifikator (npr. prvih 6 znakova hesa
`userId`-ja) dovoljan za filtriranje, a pun mejl samo adminu.

## 4. Korisnik mora da zna

Na stranici Studija, u podnozju forme, jedna recenica: da se sadrzaj cuva, da ga
osoblje platforme moze pregledati zbog moderacije i da vazi politika privatnosti.
Link ka `/uslovi-studio` - tu stranicu pravi korak X7, dakle za sada neka link
postoji i vodi na rutu koja ce postojati. Ne pravi tu stranicu ovde.

## Testovi
Moderator dobija red bez prompta i bez `inputThumbs` - admin dobija pun red -
`revealJobDetail` moderatoru baca `Forbidden` - svaki uspesan `revealJobDetail`
upise tacno jedan audit red - `listJobOwners` moderatoru ne vraca nijedan znak
"@" - obican korisnik i dalje `Forbidden` na sve.

## Verifikacija
Sve cetiri. Dopisi `## X4`.
'@
}

$Steps += @{
  Id = "X5"; Model = "opus"; Effort = "high"
  Title = "N3 i N4: vlasnistvo po izdatom tokenu, i brava na merenje"
  Prompt = @'
Procitaj `docs/STUDIO-FIX-REPORT.md`, nalazi **N3** i **N4**.

## 1. N3 - `registerInputUpload` deli vlasnistvo po principu "ko prvi"

`registerInputUpload` (`convex/studio.ts:1020`) prima **bilo koji** `_storage` ID
koji jos nema red u `studioUploads` i upisuje pozivaoca kao vlasnika. Convex
`_storage` je jedan imenski prostor za celu aplikaciju: tu su naslovne slike
kurseva, video lekcija, avatari, slike objava. Ko dodje do sirovog ID-ja bilo
cega od toga moze da ga "prijavi" kao svoj studijski upload i dobije potpisan URL
kroz slicicu u svojoj galeriji.

Provereno je da danas nema prohodne staze - upiti van Studija sirov `storageId`
ne vracaju. Ali odbrana je **nepogodivost ID-ja**, a upravo to je prvobitni nalaz
R4 nazvao "nije kontrola pristupa".

Popravka: `createInputUploadUrl` neka uz URL izda i red u novoj tabeli
`studioUploadGrants` (`userId`, `slot`, `createdAt`, `expiresAt` = +1 h,
`usedAt`). `registerInputUpload` prima samo `storageId` **za koji postoji
neiskoriscen, neistekao grant tog korisnika**, i grant odmah oznaci kao
iskoriscen. Sve ostalo baca `NEDOZVOLJEN_UPLOAD`.

Convex ne daje ID unapred, pa grant nece moci da se veze za `storageId` pre
uploada - vezi ga za sam URL / token koji `generateUploadUrl` vrati, ili za
kratkotrajan nasumican `uploadToken` koji klijent vraca nazad uz `storageId`.
Izaberi ono sto Convex stvarno podrzava, procitaj `convex/_generated/ai/guidelines.md`
pre nego sto odlucis, i upisi izbor u ODLUKE.

Istekle i iskoriscene grantove cisti postojeci reaper cron.

## 2. N4 - `measureInputUpload` nema ogranicenje ponavljanja

Javna akcija (`convex/studioActions.ts:304`). Ako se zaglavlje ne procita,
`durationS` se nikad ne upise, pa kratko spajanje na `:317` nikad ne opali -
svaki sledeci poziv ponovo povuce do 1 MB iz storage-a. Prijavljen korisnik moze
da okaci jedan neparsabilan fajl i da akciju zove u petlji.

Popravka: `measureFailures: v.optional(v.number())` na `studioUploads`. Posle
3 neuspeha akcija odmah vraca `MERENJE_ODBIJENO` bez ijednog `fetch`-a. Uz to
jedan grubi rate limit po korisniku (npr. 30 poziva na sat) - ako u repou vec
postoji obrazac za rate limit, koristi njega, ne pravi drugi.

## 3. Poruka korisniku

`MERENJE_ODBIJENO` i `NEDOZVOLJEN_UPLOAD` moraju da imaju ljudsku srpsku poruku,
ne kod greske.

## Testovi
Prijava bez granta pada - grant drugog korisnika pada - iskoriscen grant pada -
istekao grant pada - posten tok prolazi - cetvrti pokusaj merenja ne poziva
`fetch` - brojac se resetuje kad merenje uspe - reaper cisti grantove.

## Verifikacija
Sve cetiri. Dopisi `## X5`.
'@
}

$Steps += @{
  Id = "X6"; Model = "sonnet"; Effort = "high"
  Title = "N5 i N7: plafon koji tiho pukne, i ulazi koji ostaju zauvek"
  Prompt = @'
Procitaj `docs/STUDIO-FIX-REPORT.md`, nalazi **N5** i **N7**.

## 1. N5 - plafon koji tiho prestane da radi

`applyGlobalCostAction` (`convex/crons.ts:180`) cita `studioUsageDaily` sa
`.collect()`, bez kapa. To je namerno i ispravno - odsecen zbir bi bio manji od
stvarnog. Ali preko Convex-ovog limita od 16.384 reda po transakciji prolaz
**baci**, i niko ne sazna. Cron koji puca svakih 15 minuta izgleda isto kao cron
koji nema sta da radi.

Popravka: `enforceGlobalCostCap` (`:300`) neka uhvati svaku gresku iz mutacije i:
- upise red u `studioCostAlarms` sa vrstom `cron_failed` (jedan po danu, ne po
  pokusaju - inace je 96 mejlova dnevno)
- posalje mejl sa tacnom porukom greske
- **ne guta** je tiho

Isto vazi za svaku drugu gresku u tom prolazu, ne samo za limit redova.

Dodaj i `heartbeat`: red koji svaki uspesan prolaz osvezi vremenom. Admin ekran
prikazuje "poslednja provera plafona: pre X minuta". Ako predje 60 minuta, crveno.
Tako se mrtav cron vidi i bez mejla.

## 2. N7 - ulazni fajlovi ostaju zauvek

`createJob` skida `expiresAt` sa svakog uploada koji udje u posao
(`convex/studio.ts:446-448`), a `deleteJob` brise izlaz i poster - **ulaze nikad**.
Od koraka W4 uz svaki takav fajl stoji i trajan red u `studioUploads`.

Popravka:
- `deleteJob` brise i ulazne fajlove tog posla, ali **samo one koje nijedan drugi
  posao ne koristi** (isti `storageId` moze da udje u vise poslova - proveri pre
  brisanja, ovo je jedini deo koraka gde greska trajno unistava tudje podatke).
- Retencija: ulazi prate rok izlaza istog posla. Postojeci cron za istek fajlova
  neka ih cisti zajedno.
- Kad je ulaz obrisan, "Generisi ponovo" mora da javi ljudski, ne da pukne.

## Testovi
Cron koji baci upise `cron_failed` i posalje tacno jedan mejl dnevno - drugi pad
istog dana ne salje drugi mejl - `heartbeat` se osvezava - `deleteJob` brise
ulaz koji koristi samo taj posao - **ne** brise ulaz koji koristi i drugi posao -
istek fajlova cisti ulaze zajedno sa izlazom - "Generisi ponovo" nad obrisanim
ulazom daje poruku, ne izuzetak.

## Verifikacija
Sve cetiri. Dopisi `## X6`.
'@
}

$Steps += @{
  Id = "X7"; Model = "opus"; Effort = "high"
  Title = "Pravni tekst, 18+, PDV i tri Stripe dogadjaja kojih nema"
  Prompt = @'
Procitaj `docs/STUDIO-FIX-REPORT.md`, sekcija 5, tabela "Blokiralo bi naplatu",
stavke 1 i 4.

Ovo je jedini korak u celom projektu koji nije kod nego **uslov da se Stripe
uopste sme upaliti**. Danas u repou ne postoji nijedan pravni tekst:
`find app -iname "*terms*" -o -iname "*privacy*"` vraca prazno, a string
"nepovratni" ne postoji nigde.

## 1. Stranice

`app/[locale]/(marketing)/uslovi-studio/page.tsx` i
`app/[locale]/(marketing)/politika-privatnosti/page.tsx`, srpski i engleski kroz
postojeci i18n obrazac. Prati stil postojecih marketing stranica, 4 radiusa,
bez novih zavisnosti.

Uslovi moraju izricito da pokriju:
- **krediti su nepovratni** i ne mogu se zameniti za novac
- krediti isticu **12 meseci** od dodele (`CREDIT_LIFETIME_MONTHS`)
- neuspeo posao se refundira automatski; uspeo se ne refundira zato sto se
  rezultat korisniku nije dopao
- **18+** - generativni modeli i odgovornost za sadrzaj
- zabranjen sadrzaj: tudji lik bez pristanka, maloletnici, sadrzaj koji krsi
  uslove provajdera (fal, Google, BytePlus, ElevenLabs) - navedi provajdere
  poimence, jer se podaci njima prosledjuju
- osoblje platforme moze pregledati generisan sadrzaj zbog moderacije (ovo je
  pravni osnov za korak X4)
- rok cuvanja fajlova: 30 dana video, 90 dana slike, metapodaci trajno
- pravo na gasenje Studija bez najave (kill switch iz W2)

Politika privatnosti: koji se podaci salju kom provajderu, gde se cuvaju, koliko,
kako se trazi brisanje, kontakt.

**Ne izmisljaj pravno lice, adresu, PIB ni maticni broj.** Gde ti taj podatak
treba, ostavi vidljiv `[POPUNITI: ...]` i nabroji sve takve rupe u sekciji
"Za Jovana". Bolje prazno polje nego izmisljen podatak u ugovoru.

## 2. Prihvatanje pre prvog posla

`acceptedStudioTermsAt: v.optional(v.number())` na `profiles`. Pre prvog posla u
Studiju korisnik mora da cekira "Imam 18+ godina i prihvatam uslove koriscenja
Studija" - jednom, sa vremenskim pecatom. `createJob` odbija `USLOVI_NEPRIHVACENI`
ako pecata nema. Admin i moderator nisu izuzetak.

## 3. PDV

`automatic_tax` se ne postavlja nigde u `lib/stripe.ts`. Prodaja digitalne usluge
fizickim licima u EU bez obracuna PDV-a je poreski problem od **prvog** racuna.

Na svakoj Checkout sesiji (i za pretplate i za pakete kredita):
`automatic_tax: { enabled: true }`, `customer_update: { address: "auto" }`,
`tax_id_collection: { enabled: true }`.

Ovo trazi da Stripe Tax bude ukljucen na nalogu - nije nesto sto ti mozes da
uradis. Upisi to u "Za Jovana" kao izricit korak sa linkom na Stripe Tax
podesavanja, i napomeni da dok Tax nije ukljucen Checkout moze da odbije sesiju.

## 4. Tri Stripe dogadjaja kojih nema

`app/api/stripe/webhook/route.ts` nema:
- `charge.refunded` - vrati kredite koje je ta uplata dodelila; ako su vec
  potroseni, upisi negativan saldo i onemoguci Studio dok se ne poravna
- `charge.dispute.created` - **odmah** zamrzni kredite iz te uplate i onemoguci
  nove poslove tom korisniku; chargeback traje nedeljama i za to vreme ne sme da
  se generise
- `invoice.payment_failed` - obelezi pretplatu i ne dodeljuj ciklusne kredite

Sve tri idempotentne po `event.id`, isto kao postojeci `case`-ovi. Postojecih
sedam `case`-ova ne diraj.

## Testovi
`createJob` bez prihvacenih uslova pada - posle prihvatanja prolazi - pecat se
upisuje jednom - `charge.refunded` oduzima tacno dodeljen iznos - dvaput
isporucen isti dogadjaj ne oduzme dvaput - `dispute.created` blokira nove poslove
- `payment_failed` ne dodeljuje kredite - stranice se renderuju na oba jezika.

## Verifikacija
Sve cetiri. Dopisi `## X7`.
'@
}

$Steps += @{
  Id = "XRV"; Model = "opus"; Effort = "xhigh"
  Title = "Zavrsni review"
  Prompt = @'
Ne pisi nove feature. Revizija X1-X7.

1. Pokreni sve cetiri komande i **prepisi tacan izlaz**, ukljucujuci broj
   upozorenja, broj testova i vreme build-a.
2. Procitaj `docs/STUDIO-FIX-REPORT.md` - nalazi N1-N7 i R3, R6, R7, R8.
3. Za svaki od njih odgovori: **zatvoren, delimican ili otvoren**, i to
   citanjem koda na koji nalaz pokazuje, ne sekcije dnevnika koja tvrdi da je
   popravljen. Navedi fajl i liniju za svaku tvrdnju.
4. Poseban naglasak na **N2**, jer su X1 i X2 zajedno njegov jedini odgovor.
   Simuliraj napad brojkama: nalog sa 650 kredita, `dubbing`, zaglavlje 0,1 min,
   fajl 120 min. Sta se tacno desi na svakom koraku - rezervacija, donja granica,
   poravnanje, plafon. Ako igde ostane prolaz, to je glavni nalaz izvestaja.
5. Ponovi enumeraciju marze preko svih modela i svih kombinacija parametara.
   Potvrdi ili obori tvrdnju da je globalni minimum 2,5000x. Privremeni alat
   obrisi posle merenja.
6. Nabroji **nove rupe** koje je ovaj run otvorio, istom ostrinom kojom je
   `STUDIO-FIX-REPORT.md` nabrojao N1-N7. Ako ih nema, reci to i objasni kako si
   se uverio - ali podrazumevana pretpostavka je da ih ima.
7. Odgovori na pitanje **"sme li se Stripe upaliti"**, sa tri liste: mora pre
   prvog evra, rucni koraci na deployment-u po redu, i backlog.

Upisi u `docs/STUDIO-HARD-REPORT.md`. Budi strog. Korak koji je prijavio vise
nego sto je isporucio imenuj. Dopisi i `## XRV` u progress.
'@
}

if ($Only) {
  $wanted = $Only.Split(",") | ForEach-Object { $_.Trim().ToUpper() }
  $Steps  = @($Steps | Where-Object { $wanted -contains $_.Id })
  Log "Filtrirano na: $(($Steps | ForEach-Object { $_.Id }) -join ', ')"
}

Log "=================================================="
Log " STUDIO - zatvaranje rupa N1-N7"
Log " Grana:  $Branch"
Log " Koraka: $($Steps.Count)"
Log " Mrezni pad: cekanje ${NetWaitSeconds}s, do $MaxNetRetries pokusaja"
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
  Invoke-Git @("commit", "-m", "wip: stanje pre hard run-a") | Out-Null
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

  $started    = Get-Date
  $attempt    = 0
  $codeFails  = 0
  $netFails   = 0
  $ok         = $false
  $cost       = 0.0

  while (-not $ok) {
    $attempt++

    $outFile = Join-Path $LogDir "$($id)_a$attempt.json"
    $errFile = Join-Path $LogDir "$($id)_a$attempt.err.txt"

    $taskLine = "Read the file .studio-run/prompts/$id.md and carry out every instruction in it, completely. That file is your entire task for this session. Also read .studio-run/rules-hard.md if it is not already in your context."

    $claudeArgs = @(
      "-p", $taskLine,
      "--model", $step.Model,
      "--effort", $step.Effort,
      "--dangerously-skip-permissions",
      "--disallowedTools", $Denied,
      "--append-system-prompt-file", $RulesFile,
      "--output-format", "json",
      "--max-turns", "600"
    )

    $stdout = & claude @claudeArgs 2> $errFile
    $exit   = $LASTEXITCODE

    $raw = ($stdout | Out-String)
    Set-Content -LiteralPath $outFile -Value $raw -Encoding utf8
    $errTxt = if (Test-Path $errFile) { (Get-Content -LiteralPath $errFile -Raw) } else { "" }

    if ($exit -eq 0 -and $raw.Trim()) {
      try {
        $json = $raw | ConvertFrom-Json
        if ($json.is_error -eq $true) {
          throw "is_error"
        }
        if ($null -ne $json.total_cost_usd) { $cost = [double]$json.total_cost_usd }
        $ok = $true
        break
      } catch {
        # pada u granu ispod
      }
    }

    # Mrezni pad nije greska koraka nego okoline - ceka se i pokusava ponovo.
    if (Test-NetworkFailure $raw $errTxt) {
      $netFails++
      if ($netFails -ge $MaxNetRetries) {
        Log "MREZA: $netFails puta zaredom, odustajem od koraka $id."
        break
      }
      Log "MREZA pala (pokusaj $netFails/$MaxNetRetries). Cekam $NetWaitSeconds s pa ponovo."
      Start-Sleep -Seconds $NetWaitSeconds
      continue
    }

    $codeFails++
    Log "claude izasao sa kodom $exit (greska $codeFails/2)"
    if ($errTxt) { Log ("stderr: " + $errTxt.Substring(0, [Math]::Min(400, $errTxt.Length))) }
    if ($codeFails -ge 2) { break }
  }

  $elapsed    = [int]((Get-Date) - $started).TotalMinutes
  $TotalCost += $cost

  if (Test-Path (Join-Path $RepoPath ".git\index.lock")) {
    Log "UPOZORENJE: .git\index.lock postoji - sklanjam ga da commit prodje."
    Remove-Item -LiteralPath (Join-Path $RepoPath ".git\index.lock") -Force -ErrorAction SilentlyContinue
  }

  $changed = @((Invoke-Git @("status", "--porcelain")).Out -split "`r?`n" | Where-Object { $_ })
  if ($changed.Count -gt 0) {
    Invoke-Git @("add", "-A") | Out-Null
    $c = Invoke-Git @("commit", "-m", "studio($id): $($step.Title)")
    if ($c.Code -ne 0) { Log "GRESKA: git commit nije prosao: $($c.Out)"; $commit = "-" }
    else {
      $commit = (Invoke-Git @("rev-parse", "--short", "HEAD")).Out
      Log "Commit $commit - $($changed.Count) putanja"
    }
  } else {
    $commit = "-"
    if ($ok) { Log "UPOZORENJE: korak je uspeo ali nije napravio nijednu izmenu."; $ok = $false }
  }

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
          if ($line -notmatch '^\s*\*{0,2}BLOKADA') { continue }
          $rest = ($line -replace '^\s*\*{0,2}BLOKADA[:\*\s]*', '').Trim().ToLower()
          if ($rest -and $rest -notmatch '^(nema|nije|ne postoji|nijedna|n/a|-)') { $blocked = $true }
        }
      }
    } finally { $fs.Close() }
  }

  $status = if ($netFails -ge $MaxNetRetries) { "MREZA" }
            elseif (-not $ok) { "GRESKA" }
            elseif ($blocked) { "BLOKADA" }
            else { "OK" }

  $Results += [pscustomobject]@{
    Korak = $id; Status = $status; Minuta = $elapsed
    CenaUSD = "{0:N2}" -f $cost; Pokusaja = $attempt; Commit = $commit
  }
  Log "$id -> $status  ($elapsed min, $attempt pokusaja, USD $("{0:N2}" -f $cost))"

  if (-not $ok -and $StopOnError) { Log "STOP: -StopOnError."; break }
}

Log ""
Log "=================================================="
Log " GOTOVO"
Log "=================================================="
if ($Results.Count -gt 0) {
  ($Results | Format-Table -AutoSize | Out-String) -split "`r?`n" |
    Where-Object { $_ } | ForEach-Object { Log $_ }
  $Results | Export-Csv -LiteralPath (Join-Path $LogDir "hard_summary_$Stamp.csv") -NoTypeInformation -Encoding utf8
}
Log ("Ukupna cena: USD " + ("{0:N2}" -f $TotalCost))
Log "Grana: $Branch  (NIJE push-ovana, NIJE deploy-ovana)"
Log ""
Log "Kad se vratis:"
Log "  1. docs\STUDIO-HARD-REPORT.md  - nov status N1-N7, sme li se Stripe upaliti"
Log "  2. docs\STUDIO-PROGRESS.md     - dnevnik X1-X7"
Log "  3. npm run dev  pa  /sr/app/studio"
