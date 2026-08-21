# =====================================================================
#  NAUCI AI - STUDIO: otkljucavanje, blokeri i dovrsavanje
#  ---------------------------------------------------------------
#      cd "C:\Users\admin\Desktop\Web Dev Projects\nauciai"
#      powershell -ExecutionPolicy Bypass -File .\run-studio-fix.ps1 -DryRun
#      powershell -ExecutionPolicy Bypass -File .\run-studio-fix.ps1
#
#  W1  otkljucaj Studio za admina i moderatore + pregled svih poslova
#  W2  R1: globalni dnevni plafon troska (mrtav kod)
#  W3  R2 + R3: popust bez osnova, i merena kolicina koju bira klijent
#  W4  R4: vlasnistvo nad uploadovanim fajlom
#  W5  R3 pravo resenje: trajanje iz zaglavlja fajla, vrati 7 modela
#  W6  actualCostUsd za sva tri provajdera + nocna rekonsilijacija
#  W7  sitnice iz sekcije 6 izvestaja
#  WRV zavrsni review
#
#  NOVO u odnosu na prethodne skripte: mrezni pad (ENOTFOUND, api_error)
#  se NE broji kao greska koraka. Ceka 3 minuta i pokusava ponovo, do 5 puta.
#  Nocas su S0-S3 izgoreli za 90 sekundi jer je DNS pukao a retry je odmah
#  ponovio istu stvar.
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
foreach ($f in @("docs\STUDIO-CATALOG-REPORT.md", "docs\STUDIO-CATALOG-V4.md", "convex\studioPricing.ts")) {
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
$RunLog = Join-Path $LogDir "fix_$Stamp.log"

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
# Pravila za fix run - vaze za svaki korak

Radis nenadzirano. Kad naidjes na nejasnocu: izaberi najkonzervativniju opciju,
upisi je u `docs/STUDIO-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

Grana `feat/studio-faza-a` sadrzi ceo Studio: ledger, kredite, Stripe, tri
provajdera, katalog od 30 modela sa `paramSpec` i `priceRule`, deljene
komponente i sve stranice. **Ti zatvaras rupe, ne pises nista ispocetka.**

## Obavezno procitaj pre pisanja koda
1. `docs/STUDIO-CATALOG-REPORT.md` - **izvor istine za ovaj run.** Sekcija 5.3
   su nalazi R1-R5 sa tacnim putanjama i brojevima linija, sekcija 6 je lista
   neuradjenog sa procenama. Citas ga PRVI.
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

$RulesFile = Join-Path $RunDir "rules-fix.md"
Set-Content -LiteralPath $RulesFile -Value $Rules -Encoding utf8

# ---------------------------------------------------------------------

$Steps = @()

$Steps += @{
  Id = "W1"; Model = "opus"; Effort = "high"
  Title = "Otkljucaj Studio za admina i moderatore"
  Prompt = @'
Jovan trenutno **ne moze da udje u sopstveni Studio**. `createJob` trazi aktivan
`enrollment`, i admin ga ne zaobilazi - to je izricito zabelezeno u
`docs/STUDIO-DAY-REPORT.md`, sekcija NEDOSLEDNOSTI, tacka 2.

## 1. Pristup
`role === "admin"` i `role === "moderator"` prolaze **bez** enrollment provere:
- u `createJob` (`convex/studio.ts`)
- u svim query-jima Studija: `listMyJobs`, galerija, katalog modela
- u guard-u stranica `/{locale}/app/studio`, `/studio/gallery`, `/credits`

Napravi jedan helper (npr. `hasStudioAccess(profile, enrollment)`) pa ga koristi
na sva cetiri mesta - ne ponavljaj uslov.

## 2. Pregled svih poslova
Ovo je poenta zahteva: Jovan hoce da **vidi sta se desava**, ne samo da moze da
klikne Generisi.

U galeriji, za admina i moderatora, dodaj prekidac **"Samo moji" / "Svi
korisnici"**. U rezimu "Svi":
- prikazi poslove svih korisnika, najnoviji prvi
- po kartici i **mejl vlasnika**, potroseni krediti, model, provajder i status
- filter po korisniku (select sa pretragom) i po statusu
- filter po provajderu (fal / google / byteplus) - korisno kad jedan provajder
  krene da pada

Novi query mora biti **iza provere uloge na serveru**, ne samo sakriven u UI-ju.
Obicna korisnicka putanja ostaje netaknuta.

## 3. Krediti se i dalje trose
Admin nije besplatan - nemoj praviti izuzetak u naplati. Za testiranje bez
trosenja vec postoji `seed:grantDemoCredits`. Ako u progress fajlu pise kako se
poziva, ponovi tu komandu u sekciji "Za Jovana".

## Testovi
Admin bez enrollment-a moze da napravi posao - moderator isto - obican korisnik
bez enrollment-a i dalje dobija `NIJE_UPISAN` - admin vidi tudje poslove -
obican korisnik ne vidi tudje ni kad pozove query direktno - admin placa kredite
kao i svi.

## Verifikacija
Sve cetiri. Dopisi `## W1`.
'@
}

$Steps += @{
  Id = "W2"; Model = "opus"; Effort = "max"
  Title = "R1: globalni dnevni plafon troska"
  Prompt = @'
Procitaj `docs/STUDIO-CATALOG-REPORT.md`, nalaz **R1**.

`convex/crons.ts:6-14` uvozi `decideGlobalCostAction`, `GLOBAL_DAILY_ALARM_USD`,
`GLOBAL_DAILY_KILL_USD`, `GlobalCostAction`, `STUDIO_FLAG_KEY`, `dayKey`,
`parseAdminEmails`, `env`, `internalAction` - i **ne koristi nijedno**. To je
devet od sedamnaest lint upozorenja u repou. Registrovana su cetiri crona,
nijedan nije ovaj.

`decideGlobalCostAction` postoji u `studioCore.ts:175` i pokriven je testovima.
Postoji funkcija koja odlucuje, ne postoji niko ko je pita.

## Sta napisati
`internalAction` i **peti cron, na 15 minuta**:
1. saberi `studioUsageDaily.costUsd` za tekuci UTC dan preko indeksa `by_day`
2. pozovi postojeci `decideGlobalCostAction` - **ne pisi novu logiku odluke**
3. `"alarm"` -> mejl adminima, i zapamti da je za taj dan poslat da ne stize
   svakih 15 minuta
4. `"kill"` -> `platformFlags.studio_enabled = false` + drugi mejl sa porukom
   kako se Studio vraca
5. mejl preko Resend-a, istim putem kao `convex/emailVerification.ts`; primaoci
   iz `INITIAL_ADMIN_EMAILS` preko postojece `parseAdminEmails`
6. **ako Resend kljuc fali, zaloguj gresku i nastavi** - gasenje Studija ne sme
   da zavisi od toga da li je mejl otisao

Za zapamceno stanje alarma napravi najmanju stvar koja radi. Odluci i obrazlozi.

Ako neki od uvoza i posle ovoga nema pozivaoca, obrisi ga. **Lint mora da bude
bez ijednog upozorenja iz `crons.ts`** - ako ih ima, korak nije gotov.

## Zasto ovo nije opciono
Dnevni plafon po korisniku (5 $) radi, ali njegov sopstveni komentar
(`studioCore.ts:145`) kaze zasto nije dovoljan: deset korisnika koji svaki udari
u svojih 5 $ je 50 $ koje niko ne primeti. Sa tri provajdera, fal plafon u
njihovom dashboardu ne pokriva ni Google ni BytePlus.

## Testovi
Ispod praga se ne desava nista - preko 50 $ alarm ide tacno jednom po danu -
preko 100 $ se flag gasi - vec ugasen Studio se ne gasi ponovo i ne salje drugi
mejl - nov dan resetuje oba - pad Resend-a ne sprecava gasenje.

## Verifikacija
Sve cetiri. Dopisi `## W2`.
'@
}

$Steps += @{
  Id = "W3"; Model = "opus"; Effort = "max"
  Title = "R2 i R3: popust bez osnova i merena kolicina"
  Prompt = @'
Dva najskuplja nalaza iz `docs/STUDIO-CATALOG-REPORT.md`, sekcija 5.3.

## 1. R2 - ukloni popust koji nema osnov

`referenceVideoBillableSeconds` (`studioPricing.ts:315`) ima **nula pozivalaca**
osim sopstvenog testa. Njen doc-komentar tvrdi da je zove `createJob` - ne zove
je niko.

Posledica: Seedance `reference` rezim primenjuje `modeMultipliers: 0.6` (40%
popusta) a **ne naplacuje ulazni video zbog koga popust postoji**. Katalog 3.4
kaze da snizena tarifa vazi zato sto se naplacuju i ulazni i izlazni video.
Marza pada na **0,50x** - placa se duplo vise nego sto se naplati.

**Ne pokusavaj da naplatis ulazni video u ovom koraku.** Njegovo trajanje danas
dolazi od klijenta, a to je tacno rupa iz tacke 2 ispod.

Umesto toga: **ukloni `modeMultipliers` za `reference_with_video`** iz oba
Seedance pravila (`bytePlusModels.ts`). Naplacivati punu cenu nikad nije
gubitak; naplacivati snizenu bez osnova jeste.

`referenceVideoBillableSeconds` ostavi, ali joj prepisi doc-komentar da kaze da
ceka pouzdano serversko merenje trajanja i da referise na R3. Test koji je
pokriva prepisi da tvrdi da se popust **ne** primenjuje dok merenje ne postoji.

## 2. R3 - klijent bira koliko ce mu se naplatiti

`createJob` prima `measuredQuantity: v.optional(v.number())` (`studio.ts:209`) i
`resolveMeasuredQuantity` (`studioJobCore.ts:249`) je propusta kroz tri kapije
od kojih **nijedna ne poredi broj sa stvarnim fajlom**.

Sedam modela naplacuje po toj kolicini: `kling-avatar`, `kling-lipsync`,
`kling-motion`, `stt`, `voice-changer`, `audio-isolation`, `dubbing`.
`createJob` sa `measuredQuantity: 0.1` daje **$72 posla kod ElevenLabs-a za 13
evrocenti** - marza 0,002x. Ne treba ni izmena UI-ja.

### Odmah, u ovom koraku
1. **Iskljuci tih sedam modela** (`isEnabled: false` u seed-u).
2. U `createJob` dodaj tvrdu kapiju: model cije pravilo zavisi od merene
   kolicine ne moze da se pokrene bez serverskog merenja - greska
   `MERENJE_NIJE_DOSTUPNO`, ne tiho propustanje. Ta kapija ostaje i posle W5,
   kao mreza.
3. **Gruba granica po velicini fajla, koja se moze uraditi sad:** iz
   `ctx.db.system.get(storageId)` procitaj velicinu u bajtovima i izracunaj
   najvece moguce trajanje uz konzervativan minimalni bitrate (predlog: 32 kbps
   audio, 200 kbps video - odluci i obrazlozi). Prijavljeno trajanje preko te
   granice se **odbija**. Fajl od 2 MB ne moze biti 120 minuta audija.
   Ovo ne resava problem tacno, ali obara napad sa 0,002x na blizu 1x.

Napomena za kontekst: `extras` (`input_images`, `reference_images`) su ovo
uradili **kako treba** - `extraCounts` (`studioJobCore.ts:158`) broji fajlove
koje je server stvarno video. Isti princip nije primenjen na trajanje.

## Testovi
Popust se ne primenjuje na `reference_with_video` - sedam modela je iskljuceno -
model sa merenom kolicinom bez merenja daje `MERENJE_NIJE_DOSTUPNO` -
`measuredQuantity` preko granice po velicini fajla se odbija pre skidanja
kredita - realan odnos velicine i trajanja prolazi.

## Verifikacija
Sve cetiri. Dopisi `## W3`.
'@
}

$Steps += @{
  Id = "W4"; Model = "opus"; Effort = "high"
  Title = "R4: vlasnistvo nad uploadovanim fajlom"
  Prompt = @'
Procitaj `docs/STUDIO-CATALOG-REPORT.md`, nalaz **R4**.

`createInputUploadUrl` (`studio.ts:696`) trazi prijavu i vraca gol Convex upload
URL. **Nigde se ne pamti ko je sta okacio.** `sanitizeJobInputs` proverava imena
slotova i broj fajlova ali ne vlasnistvo - i ne moze, cista je funkcija bez
`ctx`. `studio.ts` tu proveru ne dodaje.

Posledica: prijavljen korisnik koji zna tudji `storageId` moze da ga stavi u svoj
posao, pa mu galerija i `getJobForRegenerate` vrate `ctx.storage.getUrl(...)` za
taj fajl - **citanje tudjeg fajla**, placeno sopstvenim kreditima. Jedina
odbrana danas je nepogodivost ID-ja, a to nije kontrola pristupa.

## Sta napisati
Tabela `studioUploads { userId, storageId, slot, bytes, mimeType, createdAt, expiresAt }`
sa indeksom `by_storage` i `by_user`.

Upis ide u mutaciju koju klijent zove **posle** uploada - `createInputUploadUrl`
vraca URL i ne zna ishod, pa ne moze da upise. Ta mutacija proverava da
`storageId` stvarno postoji (`ctx.db.system.get`), upisuje vlasnika, velicinu i
MIME tip, i vraca potvrdu.

`createJob` proverava da **svaki** `storageId` iz `inputs` postoji u toj tabeli
**i pripada tom korisniku** - inace `TUDJI_FAJL`, pre skidanja kredita.

Uz to resi i drugu polovinu nalaza: **nepostojeci `storageId` danas prolazi
`createJob`, skine kredite, pa padne na predaji i refundira se.** Sa ovom
tabelom provera postojanja je ionako tu - iskoristi je.

Nevezani uploadi: `expiresAt` +24h, brise ih postojeci cron za istek fajlova.
Kad `storageId` udje u posao, `expiresAt` se sklanja.

Ovo se dobro spaja sa W3 tackom 3 - `bytes` koji ovde upisujes je isti broj koji
tamo sluzi kao granica prijavljenog trajanja. Uradi to jednom.

## Testovi
Tudji `storageId` odbijen pre skidanja kredita - nepostojeci odbijen - svoj
prolazi - nevezan upload se brise posle 24h - vezan upload se ne brise.

## Verifikacija
Sve cetiri. Dopisi `## W4`.
'@
}

$Steps += @{
  Id = "W5"; Model = "opus"; Effort = "max"
  Title = "R3 pravo resenje: trajanje iz zaglavlja fajla"
  Prompt = @'
W3 je zatvorio rupu grubom granicom po velicini fajla i iskljucio sedam modela.
Ovaj korak meri trajanje **tacno** i vraca ih.

Procitaj `docs/STUDIO-CATALOG-REPORT.md` sekcija 6, stavka 3 - tamo su tri puta
i njihove cene. Ovo je put (b).

## Merenje na serveru
Convex storage ne zna trajanje medija, pa ga citas iz zaglavlja fajla u akciji.
Ne uvlaci tesku zavisnost - dovoljno je parsirati zaglavlja:

- **MP4/M4A/MOV:** `moov` -> `mvhd` atom nosi `timescale` i `duration`.
  Trajanje = `duration / timescale`. Atom je obicno u prvih ili poslednjih par
  stotina KB - citaj opseg, ne ceo fajl.
- **WAV:** `fmt ` chunk daje `byteRate`, `data` chunk daje velicinu.
  Trajanje = `dataSize / byteRate`.
- **MP3:** ili Xing/VBRI zaglavlje, ili procena iz bitrate-a prvog frame-a.
- **WebM/MKV:** `Duration` element u `Info` segmentu.

Ako format nije prepoznat ili zaglavlje ne moze da se procita: **odbij posao**
sa jasnom porukom, ne padaj na klijentov broj i ne pretpostavljaj.

Napisi parser kao cistu funkciju u `lib/media-duration.ts` (bez `ctx`), sa
testovima nad malim sintetickim zaglavljima koje sam napravis u testu. Akcija
samo dovlaci bajtove i zove je.

## Tok
Merenje mora da se desi **pre** skidanja kredita. Ali `createJob` je mutacija, a
citanje fajla trazi akciju. Dva puta, izaberi i obrazlozi u ODLUKE:
(a) klijent posle uploada zove akciju koja izmeri i upise `durationS` u
    `studioUploads`; `createJob` cita gotovu vrednost iz baze - jednostavno,
    merenje je vezano za fajl a ne za posao;
(b) `createJob` upisuje posao u stanju `measuring`, akcija meri pa tek onda
    rezervise kredite - tacnije ali menja tok rezervacije.
Naginjem (a): merenje je svojstvo fajla, i uklapa se u `studioUploads` iz W4.

Klijentov `measuredQuantity` posle ovoga sluzi samo za **prikaz cene pre
generisanja**. Server ga ignorise i koristi svoju izmerenu vrednost. Ako se
razlikuju za vise od 5%, prikazi korisniku stvarnu cenu pre potvrde.

## Vrati sedam modela
`kling-avatar`, `kling-lipsync`, `kling-motion`, `stt`, `voice-changer`,
`audio-isolation`, `dubbing` -> `isEnabled: true`, ali **samo one ciji ulazni
format parser stvarno podrzava**. Ako `kling-motion` prima format koji ne umes
da izmeris, ostavi ga ugasenog i napisi zasto.

Kapija `MERENJE_NIJE_DOSTUPNO` iz W3 ostaje kao mreza.

## Testovi
MP4 sa poznatim `mvhd` daje tacno trajanje - WAV isto - nepoznat format se
odbija - fajl kraci od zaglavlja se odbija - naplacuje se izmereno trajanje a ne
prijavljeno - razlika preko 5% se prikazuje korisniku - sedam modela je vraceno.

## Verifikacija
Sve cetiri. Dopisi `## W5`.
'@
}

$Steps += @{
  Id = "W6"; Model = "opus"; Effort = "high"
  Title = "actualCostUsd i nocna rekonsilijacija"
  Prompt = @'
Procitaj `docs/STUDIO-CATALOG-REPORT.md` sekcija 6, stavka 6.

`generationJobs.actualCostUsd` postoji u semi i **ne puni ga nijedan provajder**.
Posledica: marza u admin ekranu je samo procena iz kataloga, a odstupanje
stvarnog troska od pretpostavke - tacno ono kroz sta novac curi - ne moze ni da
se primeti.

## Po provajderu
- **Google:** odgovor nosi potrosene tokene (ukljucujuci thinking). Preracunaj u
  USD po objavljenim tarifama iz kataloga i upisi. Ovo je najvaznije jer je
  thinking kod Nano Banana Pro promenljiv i katalog ga procenjuje na $0,015.
- **BytePlus:** odgovor zadatka nosi potrosene tokene. Isto.
- **fal:** odgovor ne nosi cenu. fal ima Platform API
  `GET /v1/models/billing-events` koji vraca stvarni USD trosak **po
  `request_id`**. Napisi nocni cron koji povuce dogadjaje za prethodni dan i
  spoji ih sa `generationJobs.providerRequestId`.

Ako neki provajder ne vrati podatak, ostavi `actualCostUsd` prazan - **ne
pogadjaj**. Prazno polje je posteno, izmisljen broj nije.

## Alarm na odstupanje
Kad je `actualCostUsd` upisan, uporedi ga sa `estimatedCostUsd`. Ako stvarni
trosak premasi procenu za vise od **30%** na istom modelu u **pet uzastopnih
poslova**, posalji alarm adminima sa imenom modela i oba broja. To je jedina
stvar koja hvata gresku u katalogu pre nego sto je uhvati bankovni izvod.

## Admin ekran
Na `/{locale}/app/admin/studio`, pored procenjene marze, prikazi i **stvarnu
marzu** iz `actualCostUsd` gde postoji, i broj poslova iz kojih je izracunata.
Model bez ijednog stvarnog podatka mora vizuelno da se razlikuje od modela sa
sto merenja - inace admin veruje broju koji nije merenje.

## Testovi
Google odgovor sa tokenima upisuje `actualCostUsd` - BytePlus isto - fal cron
spaja po `providerRequestId` - nepoznat `request_id` se preskace bez greske -
alarm puca posle petog uzastopnog odstupanja preko 30% - ne puca na cetiri.

## Verifikacija
Sve cetiri. Dopisi `## W6`.
'@
}

$Steps += @{
  Id = "W7"; Model = "sonnet"; Effort = "high"
  Title = "Sitnice iz sekcije 6 izvestaja"
  Prompt = @'
Sedam stavki iz `docs/STUDIO-CATALOG-REPORT.md` sekcija 6. Svaka je mala, sve
zajedno su pola dana. Radi ih redom i svaku pokrij testom gde ima smisla.

**1. R5 - legacy `modelCatalog` put je i dalje dostupan po slugu.**
Izbaci `flux-*` iz `modelCatalogSeeds`, i odbij legacy put u `createJob` kad
model postoji u `models` po istoj `family`. Najcistije: ugasi sve legacy redove
(`isEnabled: false`) cim v4 pokrije njihove modele. Odluci i obrazlozi.

**2. `seedance-25` prosledjuje 10 od 50 referenci.** Katalog kaze do 50.
Popravi `inputSpec` i granicu u klijentu ka BytePlus-u.

**3. `gemini-omni` rezim `video` je corsokak** - nema izbora prethodnog klipa.
Povezi ga sa `generationJobs` izlazima tog korisnika: bira se prethodna
generacija iz galerije, ne upload. Podseti se ogranicenja iz kataloga 3.8 -
izmena **uploadovanog** videa nije dozvoljena iz EEA/CH/UK, ali izmena videa
koji je model sam napravio jeste. To ovu izmenu cini i pravno cistijom.

**4. `kling-lipsync` nema rezim `video`+`text` iz kataloga.** Ili ga dodaj, ili
odluci da `source` kontrola ostane umesto zasebnog rezima - i upisi odluku.

**5. Kreditne tabele u `STUDIO-CATALOG-V4.md` ne odgovaraju motoru.** Kolone
"kr/s" i "5s" su racunate po sekundi pa mnozene, a motor radi `ceil` na kraju.
Preracunaj ih po motoru, ili u zaglavlje kataloga upisi da su orijentacione a da
je merodavan `computeCredits`. Drugo je postenije i manje posla.

**6. Poller skenira 200 najstarijih `running` poslova bez indeksa po provajderu.**
Zaostatak od 200+ fal poslova bi izgurao Google posao iz prozora, pa bi ga reaper
refundirao iako je uspeo i naplacen je. Dodaj indeks `by_provider_status`.

**7. `kling-tryon` i `kling-v2a` imaju po jednu kombinaciju parametara.**
Proveri da im UI ne prikazuje praznu formu sa nula kontrola - ako je tako, neka
prikazu samo prompt/upload i dugme.

## Verifikacija
Sve cetiri. Dopisi `## W7` sa listom sta je od sedam uradjeno i sta je odlozeno.
'@
}

$Steps += @{
  Id = "WRV"; Model = "opus"; Effort = "xhigh"
  Title = "Zavrsni review"
  Prompt = @'
Ne pisi nove feature. Revizija W1-W7.

1. Pusti sve cetiri komande, zabelezi tacan izlaz.
2. `git log --oneline` i `git diff --stat main...HEAD`.
3. Procitaj sekcije W1-W7 u `docs/STUDIO-PROGRESS.md`.
4. Procitaj `docs/STUDIO-CATALOG-REPORT.md` sekciju 5.3 i za **svaki** nalog
   R1-R5 daj nov status sa dokazom iz koda, ne iz dnevnika.

Napisi `docs/STUDIO-FIX-REPORT.md`:

**R1-R5, nov status** - za svaki: zatvoren, delimicno, ili otvoren. Ako je
zatvoren, kojim kodom i kojim testom. Ako je delimicno, sta tacno ostaje.

**NOVE RUPE** - sta je ovaj run otvorio. Posebno: da li admin pregled svih
poslova propusta nesto sto ne bi smeo (tudji promptovi, tudji fajlovi) i da li
je provera uloge na serveru a ne samo u UI-ju.

**MARZA** - najgora kombinacija po modelu, kao u prethodnom izvestaju. Posebno
proveri da uklanjanje popusta iz R2 nije negde ostavilo dvostruko naplacivanje.

**MERENJE** - za svaki od sedam modela sa merenom kolicinom reci da li je vracen
i da li mu je format pokriven parserom. Model koji je vracen a nije pokriven je
gora greska od modela koji je ostao ugasen.

**SPREMNO ZA NAPLATU?** - jedna recenica, sa listom onoga sto jos stoji izmedju
Jovana i prvog naplacenog evra, ukljucujuci rucne korake i pravno.

Budi strog. Dopisi i `## WRV` u progress.
'@
}

# ---------------------------------------------------------------------

if ($Only) {
  $wanted = $Only.Split(",") | ForEach-Object { $_.Trim().ToUpper() }
  $Steps  = @($Steps | Where-Object { $wanted -contains $_.Id })
  Log "Filtrirano na: $(($Steps | ForEach-Object { $_.Id }) -join ', ')"
}

Log "=================================================="
Log " STUDIO - otkljucavanje i blokeri"
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
  Invoke-Git @("commit", "-m", "wip: stanje pre fix run-a") | Out-Null
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

    $taskLine = "Read the file .studio-run/prompts/$id.md and carry out every instruction in it, completely. That file is your entire task for this session. Also read .studio-run/rules-fix.md if it is not already in your context."

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
  $Results | Export-Csv -LiteralPath (Join-Path $LogDir "fix_summary_$Stamp.csv") -NoTypeInformation -Encoding utf8
}
Log ("Ukupna cena: USD " + ("{0:N2}" -f $TotalCost))
Log "Grana: $Branch  (NIJE push-ovana, NIJE deploy-ovana)"
Log ""
Log "Kad se vratis:"
Log "  1. docs\STUDIO-FIX-REPORT.md   - nov status R1-R5, spremnost za naplatu"
Log "  2. docs\STUDIO-PROGRESS.md     - dnevnik W1-W7"
Log "  3. npm run dev  pa  /sr/app/studio"
