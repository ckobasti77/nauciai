# =====================================================================
#  NAUČI AI - UX BOOST: noćni batch run (10 koraka)
#  ---------------------------------------------------------------
#  Pusti pre spavanja:
#      cd "C:\Users\admin\Desktop\Web Dev Projects\nauciai"
#      powershell -ExecutionPolicy Bypass -File .\run-ux-boost.ps1
#
#  Prvo probaj suvo (ništa ne pokreće, samo ispiše plan i napiše promptove):
#      powershell -ExecutionPolicy Bypass -File .\run-ux-boost.ps1 -DryRun
#
#  Radi: pravi granu, pušta 10 UX/UI koraka (student + admin, svi tierovi).
#        Posle svakog koraka commituje i loguje.
#  NE radi: deploy, git push, Stripe live pozive, Convex env. Sve za ujutru.
# =====================================================================

param(
  [string] $RepoPath = "C:\Users\admin\Desktop\Web Dev Projects\nauciai",
  [string] $Branch   = "feat/ux-boost",
  [switch] $ContinueOnError,   # bez ovoga: staje na prvoj grešci (posle 1 retry-ja)
  [switch] $DryRun,            # samo ispiše plan i napiše prompt fajlove
  [string] $Only = ""          # npr. -Only "U3,U4" da pustiš samo neke korake
)

# Namerno "Continue": git piše informativne poruke na stderr, a sa "Stop"
# bi to oborilo ceo noćni run. Greške hvatamo preko exit kodova, ručno.
$ErrorActionPreference = "Continue"

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
if (-not (Test-Path (Join-Path $RepoPath "AGENTS.md"))) {
  throw "Nedostaje AGENTS.md - svaki korak se oslanja na njega."
}

# VAŽNO: CLAUDE_CODE_EFFORT_LEVEL ima VEĆI prioritet od --effort flaga.
Remove-Item Env:CLAUDE_CODE_EFFORT_LEVEL -ErrorAction SilentlyContinue

$env:API_TIMEOUT_MS      = "3600000"   # 1h po API zahtevu
$env:BASH_MAX_TIMEOUT_MS = "900000"    # 15 min po bash komandi (test suite / build)

$RunDir    = Join-Path $RepoPath ".ux-run"
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
# Pravila za ovaj noćni UX run - važe za svaki korak

Radiš nenadzirano dok Jovan spava. Niko ne može da ti odgovori na pitanje.
Kad naiđeš na nejasnoću: izaberi najkonzervativniju opciju, NAPIŠI je u
`docs/UX-BOOST-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

## Kontekst projekta
Nauči AI je platforma za učenje AI veština. Ciljna publika su studenti
POČETNICI koji slabo poznaju računare - svaki ekran mora da odgovori na
"šta sad da uradim", jednostavnim srpskim, bez žargona. Vizuelni identitet
(papir/mastilo/žuta, školski sketch fazon, Nunito + Patrick Hand, tvrde
ofset senke) se NE menja - pojačava se i čini doslednijim.

## Obavezno pročitaj pre pisanja koda
1. `AGENTS.md` - pravilo o 4 radiusa i "Simplicity First / Surgical Changes"
2. `convex/_generated/ai/guidelines.md` - obavezno pre bilo kog Convex koda
3. `docs/UX-BOOST-PLAN.md` - audit inventar (piše ga korak U1; postoji od U2 nadalje)
4. `docs/UX-BOOST-PROGRESS.md` - šta su prethodni koraci već uradili (ako postoji)
5. `docs/design-system-proposal.md` - izmereni dug (modali, fokus, hexovi)
6. Ako pišeš Next.js kod: `node_modules/next/dist/docs/` - ovaj Next ima
   breaking changes u odnosu na ono što misliš da znaš

## Apsolutne zabrane
- NE radi `git push`, `npx convex deploy`, `vercel deploy` - ništa na produkciju
- NE pozivaj `stripe` CLI niti bilo koji live Stripe API
- NE postavljaj Convex env varijable
- NE menjaj Convex šemu osim ako korak to izričito traži
- NE menjaj cene, checkout logiku, auth ni bezbednosna pravila - checkout samo
  POZIVAŠ kroz postojeće komponente (CheckoutButton)
- NE redizajniraj marketing stranice - one nisu tema ovog run-a
- NE "popravljaj" susedni kod koji nema veze sa tvojim zadatkom
- NE komentariši test i NE briši assertion da bi suite prošao
- NE uvodi nove npm zavisnosti bez stvarne potrebe (upiši ODLUKU ako moraš)
- NE koristi `rounded-*!` escape niti inline `borderRadius` (AGENTS.md)

## Konvencije repoa
- Radius: 4 sankcionisana tiera (surface-card 16 / surface-inset 12 /
  surface-media 8 / rounded-full). Ništa van toga.
- Boje: SAMO tokeni (--color-ink, --color-paper, --color-yellow, --color-muted,
  --color-line...). Nikad goli hex u className.
- Svaki UI string ide kroz `lib/i18n` (sr primaran, en sekundaran). Nijedan
  string hardkodovan u JSX bez t()/localized().
- Sve promene rade u OBE teme (svetla i tamna - proveri tokene, ne pretpostavljaj)
  i na mobilnom (bottom nav ostaje TAČNO 4 slota - komentar u kodu kaže zašto).
- Poštuj `prefers-reduced-motion` za svaku novu animaciju (vidi lib/motion-contract.ts).
- Čista logika u lib/ ili convex/<ime>Core.ts sa vitest testovima, po uzoru
  na postojeće parove fajl + fajl.test.ts.

## Definicija završenog koraka
Korak nije gotov dok sve tri komande ne prođu čisto:
    npm run typecheck
    npm run lint
    npm run test
Ako si dirao Convex fajlove, prvo i: npx convex codegen
Ako ne možeš da ih popraviš posle nekoliko pokušaja, upiši `BLOKADA:` u progress
fajl sa tačnom porukom greške i stani. Blokada je ispravan ishod - hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/UX-BOOST-PROGRESS.md`
```
## <ID koraka> - <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je urađeno:** 3-6 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Testovi:** koje si napisao/menjao i šta pokrivaju
**Rezultat verifikacije:** typecheck / lint / test - prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom greške
**Za Jovana ujutru:** šta mora ručno da proveri zbog ovog koraka
```
Dopisuješ na kraj. Ne briši tuđe sekcije.
'@

$RulesFile = Join-Path $RunDir "rules.md"
Set-Content -LiteralPath $RulesFile -Value $Rules -Encoding utf8

# ---------------------------------------------------------------------
# 2. Koraci
#    model:  opus na svemu što donosi dizajnerske odluke, sonnet na sweep-ovima
#    effort: max na primitivima/katalogu, high na ostalim opus koracima
# ---------------------------------------------------------------------

$Steps = @()

$Steps += @{
  Id = "U1"; Model = "opus"; Effort = "high"
  Title = "Audit: verifikacija problema + UX-BOOST-PLAN.md"
  Prompt = @'
Korak U1 od 10. SAMO ČITANJE koda + pisanje JEDNOG dokumenta. Ne menjaj
nijedan drugi fajl.

Napravi `docs/UX-BOOST-PLAN.md` - audit inventar koji će koraci U2-U10
koristiti kao izvor istine. Za svaku stavku verifikuj u kodu i upiši tačan
fajl:linija. Šta ne potvrdiš - upiši kao "NIJE POTVRĐENO" i ne izmišljaj.

Polazne hipoteze (proverene spolja, ti ih potvrdi iznutra):

1. `DashboardFirstRun` "ima prednost nad svime" - components/app/
   dashboard-content.tsx oko :1261 i classroom-hub.tsx oko :139. Korisnik bez
   otključanog kursa (i ADMIN!) vidi samo first-run blok; cela komandna tabla
   (DashboardWindowsGrid iz Faze 3b) nikad se ne renderuje. Učionica →
   Pregled/Smerovi/Kursevi (?view=courses) sve tri prikazuju isti blok.
2. "Pogledaj kurseve" CTA vodi na marketing `/sr#pricing` i izbacuje studenta
   iz aplikacije. Ne postoji in-app katalog kurseva. Popiši SVE CTA u app
   delu koji vode na marketing rute.
3. Admin Kontrolni centar (/app/admin/content): tri gola native `<select>`-a,
   bez pregleda stanja, ogromna praznina. Users/Growth/Analytics su
   FutureModule placeholderi.
4. Iz docs/design-system-proposal.md: 19 od 20 modala bez focus trap-a
   (jedini ispravan: useModalFocus u member-profile.tsx:35-89); 57×
   outline-none bez focus-visible zamene; 154 hardkodovana hexa uklj.
   nedeklarisani #2e6f9f ×23; ~38 radiusa van skale; window.confirm u
   dashboard-content.tsx:344. Proveri da li su brojevi i dalje tačni i
   popiši SVA konkretna mesta (fajl:linija).
5. Horizontalni overflow na /app/studio (vidljiv horizontalni scrollbar) i
   toast "Studio je u zatvorenom testiranju" koji izlazi van desne ivice
   viewporta. Nađi uzrok u kodu.
6. Inventar SVIH empty state-ova u app delu (fajl:linija + trenutna poruka)
   i SVIH modala (fajl:linija + da li ima focus management).

Struktura dokumenta: po jedna sekcija po stavci, pa na kraju "Redosled
zavisnosti za U2-U10" - kratko, šta od čega zavisi.

Verifikacija: typecheck/lint/test moraju biti zeleni (ništa nisi menjao,
pa je ovo samo potvrda baseline-a - ako je baseline crven, upiši BLOKADA).
'@
}

$Steps += @{
  Id = "U2"; Model = "opus"; Effort = "max"
  Title = "UI primitivi: Button, Spinner, Dialog, Input, Badge, EmptyState"
  Prompt = @'
Korak U2 od 10. Pročitaj docs/UX-BOOST-PLAN.md (inventar modala i fokusa)
i docs/design-system-proposal.md (sekcija "Proposed primitives" + sekvenca).

Napravi u `components/ui/` primitive koje repo nema, tačno po duhu postojećeg
`primitives.tsx` (cn, Panel, LinkButton - prati taj stil API-ja):

1. `Button` - varijante primary (žuta, ink tekst) / secondary (okvir) /
   ghost / destructive; veličine; `loading` prop koji renderuje Spinner i
   disable-uje; ispravan focus-visible ring (≥3:1 kontrast, ring-2 + offset);
   pill oblik po konvenciji (bez rounded-* jer ga @layer base već daje).
2. `Spinner` - jedan Loader2 recept umesto 21 različitog.
3. `Dialog` + `ConfirmDialog` - PODIGNI `useModalFocus` iz
   components/app/member-profile.tsx:35-89 VERBATIM u components/ui/dialog.tsx
   (ne piši novi focus trap - postojeći je kompletan: Escape, Tab ciklus,
   overflow lock, vraćanje fokusa). Dialog: scrim preko --color-scrim,
   surface-card povrsina, aria-modal, labelledby. ConfirmDialog povrh toga
   za potvrde brisanja.
4. `Input` / `Field` (label + hint + error) - `outline-none` SME da postoji
   samo uz `focus-visible:ring-2 focus-visible:ring-offset-2`; error stanje
   ne sme biti samo boja (dodaj ikonu/tekst).
5. `Badge` - pill čip (status, tier, brojači).
6. `EmptyState` - ikona + naslov + objašnjenje + opciono CTA dugme; topao
   školski ton; ovo će U4/U5/U9 koristiti svuda.

Migracije u OVOM koraku (ostalo rade kasniji koraci):
- SVIH 20 modala iz inventara → Dialog/ConfirmDialog. To odmah rešava 19
  a11y defekata. member-profile.tsx importuje hook sa novog mesta.
- `window.confirm` u dashboard-content.tsx:344 (i druga mesta iz inventara)
  → ConfirmDialog.
- Kao pilot za Button/Input: sign-in-panel.tsx (svih 6 polja sa liste u
  design-system-proposal.md - linije ~298-426) i profile-editor.tsx.
- NE migriraj svih 329 dugmadi noćas. Ostatak popiši u progress kao dug.

Vizuelni paritet je uslov: migrirani modali i polja moraju izgledati isto
kao pre (osim što fokus sada radi). Proveri obe teme.

Dodaj vitest za čistu logiku ako je ima (npr. varijanta → klase mapiranje
nije vredno testa; fokus hook jeste ako ga možeš testirati bez browsera -
ako ne, preskoči i zapiši ODLUKU).

Verifikacija: typecheck / lint / test zeleni.
'@
}

$Steps += @{
  Id = "U3"; Model = "opus"; Effort = "max"
  Title = "In-app katalog kurseva - kraj slepe ulice"
  Prompt = @'
Korak U3 od 10. Pročitaj docs/UX-BOOST-PLAN.md (sekcije 1 i 2) i
docs/IA-REDESIGN-PLAN.md (Faza 2 - Učionica; već implementirana).

Najveći UX problem sajta: student bez kursa nema ŠTA da vidi u aplikaciji,
a "Pogledaj kurseve" ga izbaci na marketing /sr#pricing. Rešenje: pravi
in-app katalog u Učionici.

1. Convex podaci: proširi postojeći `courses.getAppNavigation` payload ili
   dodaj mali query (po convex/_generated/ai/guidelines.md) tako da vraća i
   OBJAVLJENE kurseve koje korisnik NEMA, sa: naslov, podnaslov, cover,
   cena (stripePriceId → prikazna cena postoji već na marketing strani -
   nađi izvor), smer, broj lekcija, ukupno trajanje. Ne dupliraj logiku
   pristupa - koristi lib/lesson-access.ts i postojeće helpere.
2. Učionica → view "Kursevi" (classroom-hub.tsx, ?view=courses): umesto
   first-run bloka renderuj katalog SVIH objavljenih kurseva. Kurs koji
   korisnik ima → postojeća DashboardCourseCard sa progresom. Kurs koji
   nema → nova "zaključana" kartica: cover, naslov, šta se uči, cena,
   Badge "Zaključano", CTA "Otključaj" koji otvara postojeći checkout tok
   (CheckoutButton / api/stripe/checkout) BEZ napuštanja aplikacije, i
   sekundarni CTA "Pogledaj uvod" ako kurs ima videoUrl (Dialog sa
   videom - primitiv iz U2).
3. View "Smerovi": isto, grupisano po smerovima (trackMeta već postoji u
   classroom-hub.tsx).
4. Zameni SVE CTA iz inventara koji vode na marketing #pricing da vode na
   ovaj katalog (classroomPath sa ?view=courses). Marketing stranice ne diraš.
5. Prazan katalog (nijedan objavljen kurs) → EmptyState primitiv.

Sve kroz lib/i18n, obe teme, mobilni (kartice se slažu u kolonu).
Ako si dirao Convex: npx convex codegen pa testovi za novu čistu logiku
(read-core pattern kao dashboard.test.ts).

Verifikacija: typecheck / lint / test zeleni.
'@
}

$Steps += @{
  Id = "U4"; Model = "opus"; Effort = "high"
  Title = "Dashboard za sve tierove (FREE, plaćeni, admin)"
  Prompt = @'
Korak U4 od 10. Pročitaj docs/UX-BOOST-PLAN.md (sekcija 1) i commit istoriju
Faze 3a/3b (getDashboardOverview + DashboardWindowsGrid već postoje).

Problem: DashboardFirstRun ZAMENJUJE ceo dashboard kad nema otključanih
kurseva (dashboard-content.tsx ~:1261) - pa FREE korisnik i admin nikad ne
vide komandnu tablu. Isto u classroom-hub.tsx ~:139.

1. FirstRun prestaje da bude zamena: postaje KOMPAKTAN pozdravni hero na
   vrhu dashboarda - pozdrav + checklist prvih koraka (Izaberi kurs /
   Odgledaj lekciju / Pitaj u zajednici) gde se završeni koraci štikliraju
   iz stvarnih podataka (ima li enrollments / progress / community post).
   CTA "Pogledaj kurseve" → in-app katalog iz U3.
2. DashboardWindowsGrid se renderuje UVEK. Zona bez podataka dobija
   EmptyState primitiv sa sledećim korakom umesto da se sakrije:
   - Učenje: "Još nemaš kurs - pogledaj šta te čeka" → katalog
   - Zajednica/Poruke/Krediti/Studio: postojeći podaci već rade za FREE
     korisnika - proveri i prikaži.
3. Kad korisnik IMA kurseve, hero se zameni postojećim ResumeHero tokom
   (ne diraj taj put osim ako inventar kaže drugačije).
4. Admin (profile.role === "admin") dodatno dobija admin-prozor u gridu:
   draft sadržaj (broj + linkovi), poslednji registrovani korisnici,
   moderacija na čekanju - IZ POSTOJEĆIH queries gde postoje; ako nekog
   podatka nema u postojećim queries, prikaži šta ima i zapiši ODLUKU
   (novi agregat pravi U6 ako zatreba, ne ti).
5. classroom-hub.tsx: umesto first-run bloka, hub za korisnika bez kurseva
   prikazuje isti kompakt hero + katalog iz U3.

Sve kroz lib/i18n, obe teme, mobilni. Ažuriraj/dodaj testove za novu čistu
logiku (npr. checklist izvedenica iz overview payloada - čista funkcija +
vitest).

Verifikacija: typecheck / lint / test zeleni.
'@
}

$Steps += @{
  Id = "U5"; Model = "opus"; Effort = "medium"
  Title = "Onboarding i mikrocopy za početnike"
  Prompt = @'
Korak U5 od 10. Pročitaj docs/UX-BOOST-PLAN.md (inventar empty state-ova)
i docs/UX-BOOST-PROGRESS.md (šta su U2-U4 već napravili).

Prolaz kroz SVE tekstove app dela očima čoveka koji slabo zna računare:

1. Mikrocopy audit + prepravka: kratke rečenice, bez žargona ("generacija",
   "workflow", "thread" → objasni ili zameni), svako dugme kaže ŠTA će se
   desiti, svaki ekran odgovara na "šta sad da uradim". Fokus na: dashboard,
   učionica, course player, zajednica (compose tok), poruke, krediti, profil.
2. Svaki empty state iz inventara koji U4 nije pokrio → EmptyState primitiv
   sa konkretnim sledećim korakom (ne "Nema sadržaja" nego "Postavi prvo
   pitanje - evo kako").
3. Potvrde i greške: svaka destruktivna akcija ima jasan ConfirmDialog tekst
   (šta se briše, da li je nepovratno); svaka poruka o grešci kaže šta
   korisnik može da uradi.
4. Prvi ulazak u Zajednicu i Studio: po jedan kratak uvodni panel (šta je
   ovo, čemu služi, prvi korak) koji se može zatvoriti; stanje zatvorenosti
   u postojećem preference mehanizmu (vidi lib/app-sidebar-preferences.ts
   pattern) - localStorage, bez novih Convex tabela.
5. SVE kroz lib/i18n (sr primaran, en preveden). Nijedan novi hardkodovan
   string u JSX.

NE menjaj strukturu stranica ni komponente osim tekstova, EmptyState
zamena i uvodnih panela. Surgical changes.

Verifikacija: typecheck / lint / test zeleni.
'@
}

$Steps += @{
  Id = "U6"; Model = "opus"; Effort = "high"
  Title = "Admin Kontrolni centar redizajn"
  Prompt = @'
Korak U6 od 10. Pročitaj docs/UX-BOOST-PLAN.md (sekcija 3) i postojeći
components/app/admin-content-manager.tsx + app/[locale]/app/admin/*.

Admin sadržaj (/app/admin/content) je danas: tri gola native select-a
(smer/kurs/lekcija) i praznina. Redizajn:

1. Vrh stranice - pregled stanja platforme: broj smerova / kurseva / lekcija
   po statusu (draft/published/archived) + broj studenata. Ako postojeći
   queries to ne daju, dodaj JEDAN mali admin agregatni query po
   convex/_generated/ai/guidelines.md (requireAdmin helper), sa read-core
   čistom logikom + vitest po uzoru na convex/dashboard.test.ts.
2. Umesto golih select-ova: master-detail prikaz hijerarhije smer → kurs →
   lekcija. Levo lista (Panel, surface-inset stavke) sa statusom kao Badge
   i brojem dece; desno postojeći editor za izabranu stavku (NE piši novi
   editor - preveži postojeći admin-content-manager tok na novu navigaciju).
   Na mobilnom: nivoi se slažu kao koraci sa "Nazad".
3. "Novi smer / Novi kurs / Nova lekcija" dugmad → Button primitiv, uvek
   vidljive i jasne u kontekstu (nova lekcija zna u kom je kursu).
4. Draft stavke vizuelno jasno odvojene (ink-hatch pattern ili Badge) da
   admin na prvi pogled vidi šta studenti NE vide.
5. /app/admin (home), users, growth, analytics: NE razrađuj module - samo
   pristojan EmptyState primitiv ("U pripremi" + šta će tu biti) umesto
   sirovih placeholdera, i linkovi ka postojećim funkcionalnim stranicama.

Sve kroz lib/i18n, obe teme. Admin gate na svakoj ruti ostaje netaknut.

Verifikacija: (codegen ako je Convex diran) + typecheck / lint / test zeleni.
'@
}

$Steps += @{
  Id = "U7"; Model = "sonnet"; Effort = "medium"
  Title = "A11y sweep: fokus, kontrast, aria, tastatura"
  Prompt = @'
Korak U7 od 10. Pročitaj docs/UX-BOOST-PLAN.md (sekcija 4 - fokus inventar)
i docs/UX-BOOST-PROGRESS.md (U2 je napravio Input/Button primitive).

Mehanički a11y prolaz kroz ceo app deo:

1. Svih 57 `outline-none` mesta iz inventara: gde je forma → migriraj polje
   na Input primitiv iz U2; gde primitiv ne odgovara → dodaj eksplicitan
   `focus-visible:ring-2 focus-visible:ring-offset-2` (ili studio-focus-ink
   klasu gde već postoji taj pattern). NIJEDNO `outline-none` bez zamene.
2. Fokus afordansa mora imati ≥3:1 kontrast prema pozadini u OBE teme
   (žuti ring na beloj pozadini NE prolazi - koristi ink).
3. Interaktivne ikonice bez teksta → aria-label (sr). Slike sadržaja →
   smisleni alt iz postojećih imageAlt polja gde postoje.
4. Tastatura: proveri da se kroz glavne tokove (sidebar, katalog kartica,
   dashboard prozori, community compose) može proći Tab-om logičnim redom;
   popravi tabIndex/redosled gde je slomljen. Modali su već rešeni u U2 -
   ne diraj ih.
5. `aria-current="page"` na aktivnim nav linkovima ako fali;
   `aria-expanded` na disclosure dugmadima ako fali.

NE menjaj vizuelni izgled osim fokus prstenova. Surgical changes - ovo je
sweep, ne redizajn.

Verifikacija: typecheck / lint / test zeleni.
'@
}

$Steps += @{
  Id = "U8"; Model = "sonnet"; Effort = "medium"
  Title = "Token + radius sweep"
  Prompt = @'
Korak U8 od 10. Pročitaj docs/UX-BOOST-PLAN.md (sekcija 4 - hex i radius
inventar) i AGENTS.md (radius konvencija - OBAVEZNO).

Mehanički sweep, nula vizuelnih promena osim gde je vrednost bila očigledna
greška:

1. `#2e6f9f` (×23): promoviši u token - dodaj `--blue-mid: #2e6f9f;` u
   :root u app/globals.css, tamni parnjak u [data-theme="dark"] bloku
   (izvedi svetliju nijansu doslednu postojećem tamnom sistemu; uporedi
   kako se ponašaju --muted/--line parovi), registruj u @theme inline kao
   --color-blue-mid, pa zameni sva 23 mesta klasama (text-blue-mid itd.).
2. Retyped hexovi: #0e3158 → ink token, #f4be30 → yellow token, i ostale
   iz inventara koje POSTOJEĆI tokeni pokrivaju. Hex koji nema token i
   koristi se ≤2 puta - ostavi, popiši u progress.
3. Radiusi van skale (6/10/18/28/7/5/4/3px iz inventara): migriraj na
   najbliži sankcionisani tier (16/12/8/full). NIKAD rounded-*! niti
   inline borderRadius. Ako neki radius ne primenjuje - to je bug za
   dijagnozu, ne za override (AGENTS.md).
4. rgba() u senkama NE diraj - --shadow-hard sistem je namerno takav.

Posle svake grupe zamena: typecheck. Na kraju: typecheck / lint / test
zeleni. U progress upiši tačan broj zamenjenih mesta po kategoriji.
'@
}

$Steps += @{
  Id = "U9"; Model = "opus"; Effort = "high"
  Title = "Polish: motion, mikro-interakcije, školski šarm, poznati bagovi"
  Prompt = @'
Korak U9 od 10. Pročitaj docs/UX-BOOST-PLAN.md (sekcije 5 i 6),
lib/motion-contract.ts i lib/studio-motion.ts (rečnik pokreta - JEDAN izvor
istine, ne izmišljaj nove easinge/trajanja).

1. Poznati bagovi iz inventara: horizontalni overflow na /app/studio
   (nađi uzrok, popravi bez overflow-hidden hacka ako je moguće) i toast
   koji izlazi van desne ivice viewporta (toast-provider.tsx - max-width +
   safe pozicioniranje, radi i na mobilnom).
2. Mikro-interakcije po postojećem rečniku: hover/press na karticama
   kataloga i dashboard prozorima (podizanje + senka, kao postojeće
   kartice), tranzicije disclosure elemenata. Sve kroz postojeće tokene
   (--motion-mikro, studio-anim-mikro pattern) i uz prefers-reduced-motion.
3. Progres kao motivacija: tamo gde postoji procenat kursa, prikaz mora
   biti topao i ohrabrujuć - proveri CourseProgress i dashboard Pulse;
   dodaj sitne "proslave" (npr. štikliranje koraka u checklisti iz U4 sa
   kratkom animacijom). Bez konfeta biblioteka - CSS/motion rečnik.
4. Školski šarm, umereno: HandUnderline/sketch elementi na naslovima
   ključnih sekcija (dashboard hero, katalog, zajednica hero) gde ih još
   nema - dosledno postojećem stilu marketinga. Ne pretrpavaj.
5. Loading stanja: skeleton za katalog (po uzoru na DashboardHomeSkeleton)
   umesto praznog ekrana; Spinner primitiv gde su ostali ad-hoc Loader2.

Obe teme, mobilni, reduced-motion. Surgical - poliraš, ne prepravljaš.

Verifikacija: typecheck / lint / test zeleni.
'@
}

$Steps += @{
  Id = "U10"; Model = "sonnet"; Effort = "high"
  Title = "Responsive prolaz + finalna verifikacija + izveštaj"
  Prompt = @'
Korak U10 od 10 - poslednji. Pročitaj docs/UX-BOOST-PROGRESS.md ceo.

1. Responsive prolaz kroz kod SVIH ekrana koje su U2-U9 dirali (dashboard,
   učionica/katalog, admin content, zajednica, krediti): proveri grid/flex
   prelome na sm/md/lg, da nijedan red dugmadi ne prelama ružno, da bottom
   nav i dalje ima TAČNO 4 slota, da modali staju u mali viewport
   (max-h + scroll unutar), da tabele/liste u admin master-detail prikazu
   rade na uskom ekranu. Popravi šta nađeš.
2. Finalna verifikacija - sve mora zeleno:
       npx convex codegen
       npm run typecheck
       npm run lint
       npm run test
       npm run build
   Ako build padne zbog env varijabli koje noću nemaš, upiši tačnu poruku
   u BLOKADA i nastavi na tačku 3 (build zbog env-a nije tvoja greška).
3. Napiši `docs/UX-BOOST-REPORT.md`:
   - rezime po koracima U1-U9 (šta je urađeno, iz progress fajla)
   - SVE ODLUKE donete noću, na jednom mestu
   - popisani preostali dug (nemigrirana dugmad, hexovi bez tokena...)
   - "Za Jovana ujutru": šta ručno proveriti u browseru, redom po
     prioritetu (očekivani ekrani: /sr/app kao FREE korisnik i kao admin,
     /sr/app/classroom?view=courses, checkout tok do Stripe stranice,
     /sr/app/admin/content, obe teme, mobilni viewport)
   - predlog sledećih koraka po prioritetu.

NE dodaješ nove funkcionalnosti u ovom koraku. Popravke + izveštaj.
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
Log " UX BOOST - nocni run"
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
  Invoke-Git @("commit", "-m", "wip: stanje pre nocnog ux-boost run-a") | Out-Null
}

# --- Progress fajl ---
$ProgressFile = Join-Path $RepoPath "docs\UX-BOOST-PROGRESS.md"
if (-not (Test-Path $ProgressFile)) {
  New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "docs") | Out-Null
  Set-Content -LiteralPath $ProgressFile -Encoding utf8 -Value @"
# UX Boost - dnevnik implementacije

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

    $taskLine = "Read the file .ux-run/prompts/$id.md and carry out every instruction in it, completely. That file is your entire task for this session. Also read .ux-run/rules.md if it is not already in your context."

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
    Invoke-Git @("commit", "-m", "ux($id): $($step.Title)") | Out-Null
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
Log "  1. docs\UX-BOOST-REPORT.md    - izvestaj i rucni koraci"
Log "  2. docs\UX-BOOST-PROGRESS.md  - dnevnik po koracima"
Log "  3. .ux-run\logs\              - sirovi logovi"
Log "  4. Javi Claude-u da je gotovo."
