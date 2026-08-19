# =====================================================================
#  NAUČI AI - STUDIO: katalog v4, modeli i parametri, ulazni režimi
#  ---------------------------------------------------------------
#      cd "C:\Users\admin\Desktop\Web Dev Projects\nauciai"
#      powershell -ExecutionPolicy Bypass -File .\run-studio-catalog.ps1 -DryRun
#      powershell -ExecutionPolicy Bypass -File .\run-studio-catalog.ps1
#
#  Nastavlja na grani feat/studio-faza-a.
#
#  S0  dovršava Z2 (globalni plafon troška) - ostao nedovršen
#  S1  šema: provider, inputModes, inputSpec, upload ulaza
#  S2  Google slike (sinhrono) - Nano Banana 2 i Pro
#  S3  BytePlus - Seedream 5 Pro, Seedance 2.0/2.5
#  S4  Google video poller - Veo Fast, Gemini Omni
#  S5  seed kataloga (~30 modela, ne slugova)
#  S6  deljene komponente: ParamControl, DropSlot, FrameSlotPair
#  S7  playground, galerija i admin na novim komponentama
#  SRV zavrsni review
#
#  NE radi: deploy, git push. Grana ostaje lokalna.
# =====================================================================

param(
  [string] $RepoPath = "C:\Users\admin\Desktop\Web Dev Projects\nauciai",
  [string] $Branch   = "feat/studio-faza-a",
  [switch] $StopOnError,
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
foreach ($f in @("docs\STUDIO-CATALOG-V4.md", "docs\STUDIO-DAY-REPORT.md", "convex\studio.ts")) {
  if (-not (Test-Path (Join-Path $RepoPath $f))) { throw "Nedostaje $f" }
}

# Stale index.lock obara svaki commit u tisini - proveri pre starta.
if (Test-Path (Join-Path $RepoPath ".git\index.lock")) {
  throw "Postoji .git\index.lock. Obrisi ga pa pokreni ponovo - inace nijedan korak nece biti commitovan."
}

Remove-Item Env:CLAUDE_CODE_EFFORT_LEVEL -ErrorAction SilentlyContinue
$env:API_TIMEOUT_MS      = "3600000"
$env:BASH_MAX_TIMEOUT_MS = "1200000"

$RunDir    = Join-Path $RepoPath ".studio-run"
$PromptDir = Join-Path $RunDir "prompts"
$LogDir    = Join-Path $RunDir "logs"
New-Item -ItemType Directory -Force -Path $PromptDir, $LogDir | Out-Null

$Stamp  = Get-Date -Format "yyyy-MM-dd_HH-mm"
$RunLog = Join-Path $LogDir "cat_$Stamp.log"

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

$Rules = @'
# Pravila za katalog run - važe za svaki korak

Radiš nenadzirano. Kad naidješ na nejasnoću: izaberi najkonzervativniju opciju,
upiši je u `docs/STUDIO-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

Grana `feat/studio-faza-a` već sadrži ceo Studio: ledger, rezervaciju kredita,
Stripe, fal klijent, cronove, mock provajdera i četiri stranice. Ti to
proširuješ na tri provajdera i pun katalog. **Ne pišeš ništa ispočetka.**

## Obavezno pročitaj pre pisanja koda
1. `docs/STUDIO-CATALOG-V4.md` - **izvor istine za ovaj ceo run.** Cene, rute,
   ulazni režimi, zamke. Čitaš ga PRVI i u celini.
2. `docs/STUDIO-DAY-REPORT.md` - tačne putanje i brojevi linija postojećeg koda.
3. `AGENTS.md` - 4 radiusa, "Simplicity First", hirurške izmene.
4. `convex/_generated/ai/guidelines.md` - pre bilo kog Convex koda.
5. `docs/STUDIO-PROGRESS.md` - šta su prethodni koraci uradili.
6. Za Next.js kod: `node_modules/next/dist/docs/`. Nije opciono.

## Apsolutne zabrane
- NE radi `git push`, `npx convex deploy`, `vercel deploy`
- NE pozivaj live Stripe, fal, Google ni BytePlus API
- NE postavljaj Convex env varijable
- NE menjaj ponašanje postojećeg subscription flow-a za kurseve
- NE "popravljaj" susedni kod koji nema veze sa zadatkom
- NE komentariši test i NE briši assertion da bi suite prošao

## Cene - tvrdo pravilo
Cene se prepisuju iz `docs/STUDIO-CATALOG-V4.md` TAČNO. Ne računaš ih ponovo,
ne zaokružuješ drugačije, ne "popravljaš" ono što ti deluje čudno. Tabele su
izvedene iz cena povučenih sa provajdera i svaka je proverena. Ako naidješ na
nešto što ti deluje kao greška u katalogu, upiši to u ODLUKE i **koristi
vrednost iz kataloga**.

## Konvencije repoa
- Čista logika u `convex/<ime>Core.ts` (bez `ctx`), testovi pored.
- `mutation`/`query`/`action` iz `./_generated/server`.
- Helperi iz `convex/helpers.ts`: `requireUserId`, `requireAdmin`, `requireSyncSecret`.
- Indeksi imenovani po poljima.

## UI pravila
- **Radiusi, samo 4:** `surface-card` 16px, `surface-inset` 12px,
  `surface-media` 8px, `rounded-full`. Nikad `rounded-*!` ni inline stil.
- Uklopi se u postojeće stranice; ne uvodi nov dizajn jezik.
- Bilingvalno sr/en.
- Realtime preko `useQuery`, nikad `setInterval` za status posla.
- Cena uvek na dugmetu, i uvek prati trenutne parametre.
- Prazna stanja i poruke grešaka se pišu, ne zaboravljaju.

## Definicija završenog koraka
Sve četiri moraju da prodju čisto:
    npx convex codegen
    npm run lint
    npm run test
    npm run build
Neiskorišćen import je greška koju si ti napravio - popravi je, ne prijavljuj
čist rezultat. Ako ne uspeš posle nekoliko pokušaja, upiši `BLOKADA:` sa
tačnom porukom greške i stani na tom koraku.

## Na kraju SVAKOG koraka dopiši u `docs/STUDIO-PROGRESS.md`
```
## <ID> - <naslov>   (<datum vreme>)
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

$RulesFile = Join-Path $RunDir "rules-catalog.md"
Set-Content -LiteralPath $RulesFile -Value $Rules -Encoding utf8

# ---------------------------------------------------------------------

$Steps = @()

$Steps += @{
  Id = "S3"; Model = "opus"; Effort = "max"
  Title = "BytePlus - Seedream 5 Pro i Seedance 2.0/2.5"
  Prompt = @'
Najveći novčani dobitak - fal na Seedance uzima tačno duplo. Ovde se dodiruje
novac, radi temeljno. Pročitaj `docs/STUDIO-CATALOG-V4.md` sekcije 2.6, 3.4, 3.5.

## `convex/providers/byteplus.ts` + `lib/byteplus.ts`
`process.env.BYTEPLUS_BASE_URL` (`https://ark.ap-southeast.bytepluses.com/api/v3`)
i `process.env.BYTEPLUS_API_KEY`. Oba obavezna, jasna greška ako fale.

Modeli: `dola-seedream-5-0-pro-260628` (slike, **sinhrono**),
`dreamina-seedance-2-0-260128` i `dreamina-seedance-2-5-260628`
(video, **async sa `callback_url`**).

## Seedance callback - nije potpisan
BytePlus prvo šalje verifikacioni zahtev sa poljem `challenge` koje vraćaš
nepromenjeno **u roku od 3 sekunde**. Posle toga šalje POST na svaku promenu
statusa, ali **pojedinačne poruke nisu potpisane**.

Zato: kad callback stigne, **ne veruj mu** - ponovo pitaj task endpoint pa tek
onda menjaj posao. Napiši to kao komentar u kodu, ne samo u progress.

Nov HTTP handler u `convex/http.ts`, putanja `/byteplus/webhook`. Idempotentan
po `providerRequestId`. Vrati 200 odmah.

## Cenovna pravila koja moraju da rade
- **Seedance `tier` parametar** (standard/fast/mini) menja cenu preko `lookup`,
  a Mini nema 1080p ni 4K - `paramSpec` mora da sakrije nedostupne opcije kad je
  Mini izabran, i `sanitizeParams` mora da ih odbije na serveru.
- **`reference` režim sa video ulazom: množilac 0,6** i naplaćuje se i ulazni i
  izlazni video. To je `modeMultipliers` u pravilu. Obavezan test.
- **Seedream 5 Pro layerize se naplaćuje PO SLOJU** - `quantityParam: "layers"`,
  slider 2-17. Obavezan test da 8 slojeva naplaćuje 8x.
- Dodatna ulazna slika preko prve: `extras` sa `freeCount: 1`.

## Testovi
Callback bez `challenge` odgovora ne prolazi · dupli callback menja posao jednom
· callback za nepoznat `providerRequestId` vrati 200 i ne uradi ništa · layerize
sa 8 slojeva = 8x · reference sa videom = 0,6x · Mini + 1080p odbijeno ·
greška refundira jednom.

## Verifikacija
Sve četiri. Ne pozivaj BytePlus uživo. Dopiši `## S3`.

## Za progress
Jovan mora ručno: **$30 balansa po Seedance modelu ($60 za oba, zaključano dok
su aktivni)**, aktivacija u BytePlus konzoli, i provera da li Seedance nosi
"Restricted Model" oznaku - ako nosi, spisak zemalja na kome je Srbija ne važi.
'@
}

$Steps += @{
  Id = "S4"; Model = "opus"; Effort = "high"
  Title = "Google video poller - Veo Fast i Gemini Omni"
  Prompt = @'
Jedina nova mašinerija u katalogu. Google nema webhookove za video.
Pročitaj `docs/STUDIO-CATALOG-V4.md` sekcije 3.7 i 3.8.

## Poller
`submitJob` za `mode: "async_poll"` vrati `operationId` u `providerRequestId`,
posao ide u `running`. Nov cron **na 1 minut** (Convex minimum):
1. učitaj `running` poslove sa `provider: "google"`
2. pitaj Google za stanje
3. gotovo -> `done` + `persistOutput`; greška -> `failJob` (refundira)
4. batch limit kao postojeći cronovi
**Ne diraj postojeći reaper** - on je mreža ispod pollera i mora ostati.

## Veo 3.1 Fast - `google`, tri reda u katalogu
Veo je jedini model gde **tier menja provajdera**: Lite i Standard su parity pa
ostaju na fal-u, Fast ide direktno. To su tri odvojena reda u `models`, ne jedan
sa parametrom - jer `provider` je polje reda.
Režimi Fast-a: `text`, `image`, `first_last`, `reference`, `video` (extend).
**Lite nema `reference` ni `extend`** - to mora biti u njegovom `inputModes`.

## Gemini Omni - `gemini-omni-flash-preview`
**Interactions API** (`/v1beta/interactions`), ne `generateContent`.
Izlaz 3-10s, 720p, 24fps, nativni zvuk, samo 16:9 i 9:16.
Rezolucija je fiksna - **ne izlaži kontrolu sa jednom opcijom.**
Višekružna izmena preko `previous_interaction_id`.

Tri ograničenja moraju biti **poruka u UI-ju, ne tiha greška**:
1. izmena **uploadovanog** videa nije dozvoljena iz EEA/CH/UK
2. upload audio referenci **ne radi** iako je dokumentovan
3. nema produžavanja ni prvi/poslednji kadar

Preview kvota je uska. Kvotna greška -> refund + jasna poruka, ne visenje.

## Testovi
Poller pomera gotov posao u `done` · neuspelu operaciju refundira jednom · posao
koji nije `running` ne dira · kvotna greška refundira · batch limit se poštuje ·
Omni edit sa uploadovanim videom vraća jasnu grešku za zabranjen region.

## Verifikacija
Sve četiri. Dopiši `## S4`.
'@
}

$Steps += @{
  Id = "S5"; Model = "opus"; Effort = "high"
  Title = "Seed kataloga - oko 30 modela sa parametrima i cenama"
  Prompt = @'
Seeduj ceo katalog iz `docs/STUDIO-CATALOG-V4.md`. **~30 modela, ne 110 slugova.**

Ovo nije prekucavanje - za svaki model gradiš `paramSpec`, `priceRule`,
`inputSpec`, `endpoints` i `capabilities`. Čitaj sekcije 2, 3, 4 pažljivo.

## Tvrdo pravilo o cenama
`baseUsd`, `addUsd`, `lookup` mape i množioci se prepisuju iz kataloga TAČNO.
Ne računaš ih ponovo. Ako ti nešto deluje kao greška, upiši u ODLUKE i koristi
vrednost iz kataloga.

## Modeli
**Slike (7):** `nano-banana-2`, `nano-banana-pro` (google) · `gpt-image-2`,
`gpt-image-15`, `seedream-45`, `seedream-5-lite` (fal) · `seedream-5-pro` (byteplus)

**Video (11):** `kling-3`, `kling-3-turbo`, `kling-omni`, `minimax-h3`,
`veo-31-lite`, `veo-31` (fal) · `veo-31-fast`, `gemini-omni` (google) ·
`seedance-20`, `seedance-25` (byteplus)

**Kling alati (5):** `kling-avatar`, `kling-lipsync`, `kling-motion`,
`kling-tryon`, `kling-v2a` (fal)

**Zvuk (8):** `tts`, `dialogue`, `sfx`, `music`, `stt`, `voice-changer`,
`audio-isolation`, `dubbing` (fal)

Svi **uključeni**. Jovan hoće pun katalog.

## Zamke koje moraju u kod
1. **GPT Image: `lookup`, ne množioci** - cena nije monotona po rezoluciji.
   1024x1024 high ($0,211) je skuplji od 1536x1024 high ($0,165).
2. **fal podrazumeva `quality: high` kod GPT Image** - `defaultParams` pinuje
   i `quality` i `size`.
3. **Nano Banana Pro nema 1K opciju** - Google naplaćuje isto za 1K i 2K.
4. **Kling labele kažu rezoluciju**, ne "standard/pro".
5. **Kling Turbo nema 4K**, Kling 4K ne postaje jeftiniji bez zvuka.
6. **Seedance 2.5 nema 4K ni Fast/Mini**; Mini nema 1080p ni 4K.
7. **Veo Lite nema `reference` ni `extend`.**
8. **Gemini Omni: rezolucija fiksna 720p** - bez kontrole sa jednom opcijom.
9. **Kling lipsync se zaokružuje na 5s** - `roundUpTo: 5` u pravilu.
10. **`tts` naplaćuje po 1000 znakova** - `quantityParam` je broj znakova.

## Dva obavezna testa
**Marža nad CELIM prostorom parametara.** Za svaki uključen model prodji sve
kombinacije iz `paramSpec` (kombinatorika je mala) i tvrdi
`computeCredits(rule, params) >= computeCostUsd(rule, params) * 216.25`.
Nijedan model ne sme da se prodaje ispod nabavne cene ni u jednoj kombinaciji.

**Doslednost specifikacija.** Za svaki model: svaki režim iz `inputModes` ima
unos u `inputSpec` i u `endpoints`; svaki `param` koji `priceRule` pominje
postoji u `paramSpec`; svaka vrednost koju `lookup` očekuje postoji kao opcija.

## Verifikacija
Sve četiri. U `## S5` napiši ukupan broj modela po tipu i listu svakog modela
sa njegovim brojem kombinacija parametara.
'@
}

$Steps += @{
  Id = "S6"; Model = "opus"; Effort = "high"
  Title = "Deljene komponente: ParamControl, DropSlot, FrameSlotPair"
  Prompt = @'
Biblioteka komponenti koju ceo Studio deli. Pročitaj
`docs/STUDIO-CATALOG-V4.md` sekcije 1.2, 5 i 6.

**Tvrdo pravilo: nijedna komponenta ne sme da zna ime nijednog modela.**
Ako napišeš `if (slug === "...")`, to je bug. Sve dolazi iz `paramSpec`,
`inputSpec` i `priceRule`.

Repo koristi shadcn. Ako neka primitiva nedostaje, dodaj je standardnim
putem - ne piši svoju.

## Kontrole parametara
- `<ParamControl>` - grana po `type` na shadcn primitivu po tabeli iz sekcije 1.2:
  `segmented` -> `ToggleGroup` · `select` -> `Select` · `slider` -> `Slider`
  · `number` -> `Input` sa +/- · `switch` -> `Switch` · `textarea` -> `Textarea`
  sa brojačem · `text` -> `Input`
- `<ParamForm>` - gradi ceo set iz `paramSpec`, filtrira po `showInModes`,
  drži stanje, vraća očišćen objekat parametara
- `<PriceTag>` - značka uz kontrolu koja menja cenu: `+12 kr`, `x2`. Računa se
  iz `computeCredits` sa hipotetičkom vrednošću te opcije, da korisnik vidi šta
  ga skuplja **pre** klika

## Ulazni slotovi
- `<DropSlot>` - jedan fajl. **Drag&drop na celu površinu slota** plus klik.
  Pregled sličice, dugme za uklanjanje, traka napretka, validacija MIME i
  veličine pre uploada sa jasnom porukom.
- `<DropSlotGrid>` - više fajlova, **drag za promenu redosleda**, brojač `3/9`,
  dodavanje više odjednom.
- `<FrameSlotPair>` - **"Početni kadar"** i **"Završni kadar"** jedan pored
  drugog, vizuelno kao par sa strelicom izmedju. Oba obavezna.
- `<ReferenceSlots>` - tri grupe (slike / video / zvuk), **numerisane** jer ih
  prompt citira po broju.
- `<ModeSwitcher>` - `ToggleGroup` iznad forme, vidljiv **samo ako model ima
  više od jednog režima**. Prebacivanje čisti slotove kojih nema u novom režimu
  uz tihu potvrdu i preračunava cenu.

`AGENTS.md` opisuje konvenciju "full-screen single-target drop" iz profila i
avatara. Pročitaj je i primeni gde model ima tačno jedan smislen drop cilj.

## Dugme
`<GenerateButton>` - cena iz `computeCredits` nad **istim objektom parametara**
koji ide u `createJob`. Nikad dve računice. Zaključano dok obavezni slotovi nisu
popunjeni, sa porukom šta fali ("Dodaj završni kadar"). Stanja: nema kredita ->
"Dopuni kredite" · 3 posla u letu · Studio pauziran · svaka greška iz
`createJob` ima svoju ljudsku rečenicu na srpskom.

## Izbor modela
`<ModelPicker>` - grupisano po `family` u akordeonu, filter po tipu i po tome da
li ima zvuk, pretraga po imenu. Značke `preporuceno` / `skupo` / `novo`.
Za video: cena po sekundi **i** cena za trenutno izabrano trajanje.

## Radiusi
Samo četiri: `surface-card` 16px, `surface-inset` 12px, `surface-media` 8px,
`rounded-full`. Nikad `rounded-*!` ni inline stil.

## Verifikacija
Sve četiri, `npm run build` posebno pažljivo. Napiši i testove za `<ParamForm>`
i `<PriceTag>` koji tvrde da se prikazana cena poklapa sa `computeCredits`.
Dopiši `## S6`.
'@
}

$Steps += @{
  Id = "S7"; Model = "opus"; Effort = "high"
  Title = "Playground, galerija i admin na novim komponentama"
  Prompt = @'
Sastavi stranice od komponenti iz S6. Pročitaj `docs/STUDIO-CATALOG-V4.md`
sekcije 5 i 6, i pogledaj kako izgledaju postojeće stranice pa se uklopi.

## Playground `/{locale}/app/studio`
Levo: `<ModelPicker>`, pa `<ModeSwitcher>`, pa ulazni slotovi za izabran režim,
pa `<ParamForm>`, pa `<GenerateButton>`.
Desno: rezultat sa skeletonom, ispod poslednjih 6 generacija.
Balans u zaglavlju, pada odmah po pokretanju posla.
Sve realtime preko `useQuery` - **nikakav `setInterval`**.

Prazno stanje: kratko šta je Studio + predlog prvog prompta na jedan klik.

## Galerija `/{locale}/app/studio/gallery`
Mreža, filteri (tip / model / datum), infinite scroll.
Po kartici: **ulazi koji su korišćeni** kao sličice (bez toga "Generiši ponovo"
nema smisla kod modela sa slikama), model, parametri, datum, cena, i akcije
Preuzmi · Generiši ponovo · Obriši.
"Generiši ponovo" vraća **model, režim, parametre i ulaze** u formu.

**Nikad `<video src>` u mreži** - `preload="metadata"` sa `#t=0.1`.
Značka "ističe za N dana" kad je manje od 7; kad je fajl istekao, kartica ostaje
sa promptom i dugmetom "Generiši ponovo".

## Admin `/{locale}/app/admin/studio`
Tabela modela sa: slug, provajder, tip, **izračunata marža za podrazumevane
parametre**, prekidač uključen/isključen. Marža ispod 2,0x se boji upozoravajuće.
Inline izmena `baseUsd` i `addUsd` - i **odmah prikaži kako to menja cenu za
svaku kombinaciju**, jer jedan broj sad pomera celu porodicu varijanti.
Zadrži postojeće: paketi sa `stripePriceId`, dnevna potrošnja, kill switch,
reaper brojač, globalni trošak sa pragovima.

## Verifikacija
Sve četiri, `npm run build` pažljivo. Dopiši `## S7`.
'@
}

$Steps += @{
  Id = "SRV"; Model = "opus"; Effort = "xhigh"
  Title = "Zavrsni review kataloskog run-a"
  Prompt = @'
Ne piši nove feature. Revizija svega iz S0-S7.

1. Pusti sve četiri komande, zabeleži tačan izlaz.
2. `git log --oneline` i `git diff --stat main...HEAD`.
3. Pročitaj sekcije S0-S7 u `docs/STUDIO-PROGRESS.md`.
4. Pročitaj sav nov kod u `convex/providers/`, `convex/studioPricing.ts`,
   `convex/seed.ts`, `convex/studio.ts`, `convex/crons.ts` i nove komponente.

Napiši `docs/STUDIO-CATALOG-REPORT.md`:

**MARŽA** - za svaki uključen model **najgora kombinacija parametara** i njena
marža. Ne prosek - najgori slučaj. Označi crveno sve ispod 2,0x. Katalog od 30
modela sa po nekoliko desetina kombinacija je nekoliko stotina prilika za grešku
u ceni.

**JEDNA RAČUNICA** - potvrdi da `computeCostUsd` iz `convex/studioPricing.ts`
jedini računa cenu. Nadji svaku drugu računicu cene u projektu i prijavi je.
Potvrdi da UI i server dobijaju isti broj za iste parametre.

**RUTIRANJE** - za svaki model potvrdi da `provider` odgovara sekciji 7 kataloga.
Svako odstupanje je novac. Posebno proveri da Seedream 5 **Pro** ide na byteplus
a **Lite** na fal - to su različite rute za isto ime.

**SPECIFIKACIJE** - za svaki model potvrdi da `inputModes`, `inputSpec`,
`endpoints`, `paramSpec` i `priceRule` slažu medjusobno, i da UI nudi svaki
deklarisan režim.

**RIZICI PO NOVAC** - prodji ponovo a-f iz `docs/STUDIO-NIGHT-REPORT.md` i daj
nov status, plus nove puteve:
- može li klijent poslati vrednost parametra van `options`
- može li poslati `inputMode` koji model ne podržava
- može li vezati tudji `storageId`
- naplaćuje li se layerize po sloju, reference sa videom 0,6x, lipsync na 5s
- ostaje li posao da visi ako Google poller padne
- može li nepotpisan BytePlus callback lažno pomeriti posao

**ŠTA NIJE URADJENO** - numerisano, sa procenom.

**RUČNI KORACI ZA JOVANA** - svi ključevi, BytePlus aktivacija i $60
zaključanog balansa, Stripe cene, Ed25519 provera, fal plafon potrošnje.

**PREPORUKA** - jedna rečenica.

Budi strog. Dopiši i `## SRV` u progress.
'@
}


if ($Only) {
  $wanted = $Only.Split(",") | ForEach-Object { $_.Trim().ToUpper() }
  $Steps  = @($Steps | Where-Object { $wanted -contains $_.Id })
  Log "Filtrirano na: $(($Steps | ForEach-Object { $_.Id }) -join ', ')"
}

Log "=================================================="
Log " STUDIO - katalog v3, tri provajdera"
Log " Grana:  $Branch"
Log " Koraka: $($Steps.Count)"
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
  Invoke-Git @("commit", "-m", "wip: stanje pre kataloskog run-a") | Out-Null
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

    $taskLine = "Read the file .studio-run/prompts/$id.md and carry out every instruction in it, completely. That file is your entire task for this session. Also read .studio-run/rules-catalog.md if it is not already in your context."

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

  # Stale lock obara commit u tisini - proveri pre nego sto zakljucis da je korak prosao.
  if (Test-Path (Join-Path $RepoPath ".git\index.lock")) {
    Log "UPOZORENJE: .git\index.lock postoji - commit ce pasti. Sklanjam ga."
    Remove-Item -LiteralPath (Join-Path $RepoPath ".git\index.lock") -Force -ErrorAction SilentlyContinue
  }

  $changed = @((Invoke-Git @("status", "--porcelain")).Out -split "`r?`n" | Where-Object { $_ })
  if ($changed.Count -gt 0) {
    Invoke-Git @("add", "-A") | Out-Null
    $c = Invoke-Git @("commit", "-m", "studio($id): $($step.Title)")
    if ($c.Code -ne 0) {
      Log "GRESKA: git commit nije prosao: $($c.Out)"
      $commit = "-"
    } else {
      $commit = (Invoke-Git @("rev-parse", "--short", "HEAD")).Out
      Log "Commit $commit - $($changed.Count) putanja"
    }
  } else {
    $commit = "-"
    Log "UPOZORENJE: korak nije napravio nijednu izmenu."
    $ok = $false
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

  if (-not $ok -and $StopOnError) { Log "STOP: -StopOnError."; break }
}

Log ""
Log "=================================================="
Log " GOTOVO"
Log "=================================================="
if ($Results.Count -gt 0) {
  ($Results | Format-Table -AutoSize | Out-String) -split "`r?`n" |
    Where-Object { $_ } | ForEach-Object { Log $_ }
  $Results | Export-Csv -LiteralPath (Join-Path $LogDir "cat_summary_$Stamp.csv") -NoTypeInformation -Encoding utf8
}
Log ("Ukupna cena: USD " + ("{0:N2}" -f $TotalCost))
Log "Grana: $Branch  (NIJE push-ovana, NIJE deploy-ovana)"
Log ""
Log "Kad se vratis:"
Log "  1. docs\STUDIO-CATALOG-REPORT.md  - marze po modelu, rutiranje, rizici"
Log "  2. docs\STUDIO-PROGRESS.md        - dnevnik po koracima"
Log "  3. npm run dev  pa  /sr/app/studio"
