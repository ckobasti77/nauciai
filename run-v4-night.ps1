<#
  NAUCI AI - NOCNI RUN v4  (redizajn i doterivanje cele platforme)
  Pokretanje:  powershell -ExecutionPolicy Bypass -File .\run-v4-night.ps1
  Zaustavljanje: Ctrl+C  (zapoceti korak ce se dovrsiti)

  PRAVILA RUNA
   - Svaki korak commit-uje ZASEBNO na main i push-uje.
   - Posle svakog koraka ide verifikacija; na PRVOJ gresci run STAJE.
   - Napredak se pise u docs/V4-PROGRESS.md posle svakog koraka.
#>

# Native komande (claude, npm) pisu na stderr i u redovnom radu.
# Zato NE koristimo "Stop" - neuspeh hvatamo iskljucivo preko $LASTEXITCODE.
$ErrorActionPreference = "Continue"
$repo = "C:\Users\admin\Desktop\Web Dev Projects\nauciai"
Set-Location $repo

$env:NODE_OPTIONS = "--no-use-system-ca"
Remove-Item Env:\CLAUDE_CODE_EFFORT_LEVEL -ErrorAction SilentlyContinue

$log = Join-Path $repo "docs\V4-RUN-LOG.txt"
$progress = Join-Path $repo "docs\V4-PROGRESS.md"
New-Item -ItemType Directory -Force -Path (Join-Path $repo "docs") | Out-Null
"" | Out-File -FilePath $log -Encoding utf8

function Write-Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding utf8
}

$deny = "Bash(rm -rf:*),Bash(git push --force:*),Bash(git reset --hard:*),Bash(npx convex env:*),Bash(npm publish:*)"

$RULES = @"
OPSTA PRAVILA ZA OVAJ ZADATAK (vaze uvek, bez izuzetka):
- Procitaj AGENTS.md pre bilo kakve izmene, i convex/_generated/ai/guidelines.md ako diras convex/.
- Koristi skillove iz .claude/skills: impeccable, ui-ux-pro-max, design-taste-frontend, motion-design. Za tekstove koristi skill design:ux-copy.
- Svi stringovi kroz lib/i18n (sr + en). Nikad hardkodovan tekst u komponenti.
- Sve rute kroz withLocale() iz lib/i18n. NIKAD ne pisi "/sr/..." rucno - struktura ruta se menja u kasnijem koraku i withLocale je jedina tacka istine.
- Boje samo kroz tokene (--color-ink/paper/yellow/muted/line, --blue-mid, --surface-a, --surface-b). Nema #ffffff nigde.
- 4 radius tiera (surface-card 16 / surface-inset 12 / surface-media 8 / rounded-full). Nema rounded-*! ni inline borderRadius.
- Obe teme moraju da rade. Kontrast teksta minimum 4.5:1.
- Klik mete minimum 44px na mobilnom. focus-visible vidljiv svuda.
- prefers-reduced-motion se postuje u svakoj animaciji.
- Hirurske izmene: ne refaktorisi ono sto zadatak ne trazi.
- Ako nesto iz zadatka nije izvodljivo bez rusenja postojeceg ponasanja, NEMOJ improvizovati - uradi ostatak i jasno napisi u zavrsnom izvestaju sta si preskocio i zasto.

ZAVRSNI BLOK (obavezno, na kraju svakog zadatka):
- npm run typecheck; npm run lint; npm test; npm run build - sve mora biti zeleno.
- git add -A; git commit -m "<poruka koju zadatak trazi>"; git push origin main
- Ako si dirao convex/: npx convex deploy -y
- Dopisi u docs/V4-PROGRESS.md red: "<oznaka koraka> | gotovo | <2-3 recenice sta je uradjeno> | <fajlovi>"
"@

# ── Provera prijave pre pocetka ──────────────────────────────────────────────
Write-Log "Provera Claude prijave..."
$probe = "ping" | & claude -p --model sonnet 2>&1
if ($LASTEXITCODE -ne 0 -or ($probe -match "OAuth session expired|Failed to authenticate|Invalid API key")) {
  Write-Log "STOP: Claude nije prijavljen."
  Write-Host ""
  Write-Host "  Pokreni:  claude     pa unutra:  /login" -ForegroundColor Yellow
  Write-Host "  Kad zavrsis prijavu, pusti run ponovo." -ForegroundColor Yellow
  Write-Host ""
  exit 1
}
Write-Log "Prijava OK. Krecem."

function Invoke-Step {
  param(
    [string]$Id,
    [string]$Title,
    [string]$Model,
    [string]$Effort,
    [string]$Mode,       # "auto" | "plan"
    [switch]$Continue,   # nastavlja prethodnu sesiju
    [string]$Prompt
  )

  Write-Log "=== $Id : $Title  (model=$Model effort=$Effort mode=$Mode continue=$($Continue.IsPresent)) ==="

  $file = Join-Path $env:TEMP "v4-$Id.txt"
  $body = "$RULES`r`n`r`n===== ZADATAK $Id : $Title =====`r`n$Prompt"
  [System.IO.File]::WriteAllText($file, $body, (New-Object System.Text.UTF8Encoding($true)))

  $cliArgs = @("-p", "--model", $Model, "--effort", $Effort, "--dangerously-skip-permissions", "--disallowedTools", $deny)
  if ($Mode -eq "plan") { $cliArgs += @("--permission-mode", "acceptEdits") }
  if ($Continue) { $cliArgs += "-c" }

  $started = Get-Date
  Get-Content -Raw -Encoding UTF8 $file | & claude @cliArgs 2>&1 | Tee-Object -FilePath $log -Append
  $code = $LASTEXITCODE
  $mins = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
  Write-Log "$Id zavrsen za $mins min (exit=$code)"

  if ($code -ne 0) { Write-Log "STOP: $Id je vratio exit $code."; exit 1 }

  Write-Log "$Id verifikacija..."
  & npm run typecheck 2>&1 | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) { Write-Log "STOP: typecheck pao posle $Id."; exit 1 }
  & npm run build 2>&1 | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) { Write-Log "STOP: build pao posle $Id."; exit 1 }
  Write-Log "$Id OK"
}

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N1" -Title "Admin: opste informacije platforme" -Model "opus" -Effort "high" -Mode "plan" -Prompt @"
Napravi jedinstveno mesto sa kog admin uredjuje opste podatke platforme. Ovo je TEMELJ - koraci N5 i N6 citaju odavde, pa mora biti gotovo i stabilno.

1) PODACI (convex)
- Nova tabela `platformSettings` kao singleton (jedan red, kljuc "default"):
  contact: { phone?: string, email?: string, address?: string }
  socials: { instagram?, facebook?, tiktok?, youtube?, threads? }  - svi opcioni URL-ovi
  pricing: { basicEur: string, premiumEur: string, currencyNote?: string }
  brand:   { supportHours?: string, legalName?: string, pib?: string }
- Query `platformSettings.get` je javan (cita ga i landing) ali vraca SAMO gornja polja - nista osetljivo.
- Mutation `platformSettings.update` sme SAMO admin (isti obrazac provere kao ostale admin mutacije u projektu). Validiraj: email mora biti email, telefon E.164 ili prazan, svaki social URL mora biti https i sa ocekivanog domena (instagram.com, facebook.com, tiktok.com, youtube.com, threads.net) - inace odbij sa jasnom porukom.
- Prazna polja su dozvoljena i znace "ne prikazuj to nigde".

2) ADMIN EKRAN
- Nova strana /app/admin/settings, dostupna samo adminu, uvedena u admin navigaciju uz postojece (Sadrzaj, Korisnici, Studio, Analitika, Rast).
- Forma podeljena u kartice: Kontakt, Drustvene mreze, Cene, Pravni podaci. Koristi postojece primitive iz components/ui (Field/Input, Button, Callout) - ne pravi nove.
- Cuvanje po kartici, optimisticki prikaz, toast na uspeh i na gresku, disabled dugme dok traje upis.
- Pored svakog polja sitna napomena gde se to prikazuje na sajtu (npr. "Prikazuje se u levoj traci i u podnozju").

3) CITANJE NA SAJTU
- lib/platform-settings.ts: tip + STATIC_FALLBACK sa trenutnim vrednostima (email kontakt@nauciai.com, cene iz lib/pricing.ts) i helper `resolveSettings(live, fallback)` koji spaja live vrednosti preko fallback-a i izbacuje prazna polja.
- lib/pricing.ts vise NIJE izvor cena za #pricing sekciju - postaje samo fallback. Sekcija cena na landingu cita iz platformSettings preko resolveSettings.
- Dodaj vitest za resolveSettings (prazno polje pada na fallback; nevalidan URL se ignorise; live vrednost pobedjuje).

Commit: "admin(N1): opste informacije platforme - kontakt, mreze, cene"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N2" -Title "Navbar: centriranje, svetli linkovi na vrhu, dropdown, wrapper" -Model "opus" -Effort "high" -Mode "auto" -Prompt @"
Cetiri izmene na gornjoj navigaciji javnih strana.

1) NAVBAR JE WRAPPER ZA SVE JAVNE STRANE
- Header sada zivi u components/marketing/marketing-page.tsx i vidi se samo na landingu. Izdvoji ga u components/marketing/public-header.tsx i renderuj ga u app/[locale]/(marketing)/layout.tsx, iznad {children}, tako da isti navbar stoji na SVIM javnim stranama (/, /courses, /courses/[slug], /community, /community/[slug], /studio, /sign-in, pravne strane) - isto kao sto je sidebar wrapper za dashboard.
- Landing prestaje da renderuje svoj header. Ponasanje na skrol (providan na vrhu, pun posle skrola) ostaje isto i vazi na svim javnim stranama.

2) LINKOVI NA VRHU LANDINGA NISU OSETLJIVI NA TEMU
- Dok je header providan (scrollY = 0) i dok je ispod njega SVETLA hero podloga, logo, nav linkovi i ikonice moraju biti u boji mastila kao u svetloj temi, bez obzira sto je aktivna tamna tema - jer hero ostaje krem i u tamnoj temi, pa se sada u tamnoj temi linkovi ne vide.
- Cim korisnik skroluje (header dobija pozadinu), boje se vracaju na normalno reagovanje na temu.
- Implementiraj kao data atribut na headeru (npr. data-over-light="true") koji postavlja stranica sa svetlim herojem; strane bez svetlog heroja ga ne postavljaju. Stilove drzi u globals.css, ne inline.

3) TRI JEDNAKE KOLONE
- Sadrzaj navbara postaje mreza od tri kolone po 1fr (33.33% svaka) unutar postojeceg max-w-7xl kontejnera: levo logo (justify-start), sredina nav linkovi (justify-center), desno jezik + tema + Dashboard/Prijava + avatar (justify-end).
- Nav linkovi time padaju tacno na sredinu kontejnera. Na < md sredina se sakriva kao i sada.

4) DROPDOWN NALOGA (javne strane)
- Sada je gore odvojen blok isprekidanom linijom sa avatarom, imenom, @korisnickim imenom, mejlom i oznakom uloge, pa ispod linkovi Zajednica, Poruke, Profil, Pretplata i Odjavi se.
- Novo: taj gornji blok se BRISE. Umesto njega prvi red liste postaje link ka /app/profile:
   - levo, umesto lucide ikonice, PROFILNA SLIKA korisnika u krugu iste velicine kao krug oko ostalih ikonica (fallback inicijali ako nema slike),
   - u sredini ime i @korisnicko ime u dva reda,
   - desno oznaka uloge (ADMIN / STUDENT / …) kao Badge.
- Ispod njega ostaju preostala tri linka (Zajednica, Poruke, Pretplata) i Odjavi se na dnu, u istom stilu kao sada.
- Profil se time uklanja sa trece pozicije u listi. Dropdown je zbog toga osetno nizi - smanji i paddinge da deluje kompaktno.

Commit: "navbar(N2): wrapper za javne strane, tri kolone, svetli linkovi na vrhu, kompaktan dropdown"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N3" -Title "Hero: centriranje i zamena CTA" -Model "opus" -Effort "high" -Mode "auto" -Continue -Prompt @"
Dve izmene u hero sekciji landinga.

1) HERO NIJE HORIZONTALNO CENTRIRAN
- Na sirokim ekranima cela kompozicija (tekst levo + sveska desno) vuce u levo i desno ostaje visak praznog prostora; vidi .hero-cover-media u app/globals.css koji na >=1024px i sirokom odnosu zakacinje video za desnu ivicu VIEWPORT-a.
- Popravi tako da se video pozicionira u odnosu na isti centrirani kontejner u kom je i tekst (max-w-7xl, mx-auto), a ne u odnosu na viewport. Na ekranima sirim od kontejnera visak krem podloge mora ostati JEDNAK levo i desno.
- Ne diraj 3D kartice na svesci - one se racunaju iz geometrije videa preko lib/hero-cards.ts, pa posle promene pozicioniranja MORAJU i dalje da leze tacno na plocama. Proveri to na 1920x1080, 2560x1440, 1440x900 i 1536x695 (privremeno oboj quad crveno, screenshot, pa ukloni).
- Marquee traka ostaje puna sirina ekrana, ona se ne centrira.

2) ZAMENA DVA CTA DUGMETA
- Levo dugme: tekst postaje "Besplatan video" (en: "Free lesson"), ikonica postaje ona koja je sada na desnom dugmetu (PlayCircle). Ostaje ZUTO. Vodi na isto mesto gde i sada (#besplatan-video na strani kursa za video i audio).
- Desno dugme: tekst postaje "Otvori Studio" (en: "Open Studio"), ikonica postaje ona koja je sada na levom dugmetu (Sparkles). Ostaje BELO/paper. Vodi DIREKTNO u Studio, ne na marketing stranu Studija:
   - ulogovan korisnik -> withLocale(locale, "/app/studio")
   - gost -> ako je javni Studio upaljen, withLocale(locale, "/studio"); u suprotnom withLocale(locale, "/sign-in") sa next parametrom ka /app/studio.
- Oba dugmeta zadrzavaju postojece velicine, razmak i ponasanje na mobilnom.

Commit: "hero(N3): centriranje kompozicije i zamena CTA dugmadi"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N4" -Title "Footer: kompaktniji + isti language switch" -Model "sonnet" -Effort "high" -Mode "auto" -Prompt @"
Podnozje je previsoko i prazno.

1) VISINA I GUSTINA
- Smanji ukupnu visinu podnozja za oko polovinu. Vertikalne paddinge secii, razmak izmedju linkova u koloni smanji (gap sa trenutnog na 0.25-0.5rem), a min-h na linkovima zadrzi na 44px SAMO na dodirnim uredjajima (@media (pointer: coarse)); na desktopu linkovi mogu biti gusci.
- Kolone linkova poravnaj po vrhu, naslove kolona smanji na type-eyebrow.
- Donji red (copyright, jezik, tema) spoji u jedan red na >=640px.

2) LANGUAGE SWITCH
- Prebacivac jezika u podnozju mora IZGLEDATI I RADITI identicno kao onaj u navbaru (components/marketing/language-toggle.tsx). Izdvoji ga u jednu komponentu koja se koristi na oba mesta i svuda drugde na platformi gde postoji prebacivanje jezika (ukljucujuci dashboard).
- Ne menjaj sada nacin rada rutiranja - to radi kasniji korak. Samo ujednaci izgled i mesto komponente.

3) TALAS
- Talasasta linija iznad podnozja ostaje, i dalje jedna tamna linija, bez svetle druge i bez prave linije.

Commit: "footer(N4): kompaktnije podnozje i jedinstven prebacivac jezika"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N5" -Title "Leva traka: telefon, email, mreze" -Model "sonnet" -Effort "high" -Mode "auto" -Continue -Prompt @"
Nova vertikalna traka sa kontaktima, na LEVOJ ivici ekrana, pandan postojecem scrollToTop dugmetu na desnoj.

- Nova komponenta components/marketing/contact-rail.tsx, fixed uz levu ivicu, vertikalno na istoj visini kao scrollToTop dugme desno, z-index ispod modala i dropdown-a.
- Redosled ODOZDO NAGORE: 1) Telefon, 2) Email, 3) Drustvene mreze.
- Dugmad su okrugla, iste velicine kao scrollToTop, border-2 border-ink, bg-paper-strong, tvrda senka - isti jezik kao ostatak sajta. Svako ima aria-label i tooltip na hover.
- Telefon vodi na tel:, email na mailto:. Podaci se citaju iz platformSettings (korak N1) preko resolveSettings. AKO polje nije popunjeno, to dugme se NE RENDERUJE uopste - nikakvi mrtvi linkovi.
- Dugme "Drustvene mreze" na klik OTVARA nagore kolonu ikonica: Instagram, Facebook, TikTok, YouTube, Threads - opet samo one koje imaju popunjen URL u podesavanjima. Otvaraju se u novom tabu sa rel="noopener noreferrer".
- Otvaranje: ikonice izlaze jedna po jedna odozdo nagore, stagger 40ms, translateY 8px -> 0 i opacity 0 -> 1, 200ms, ease iz lib/motion-contract. Zatvaranje je isto obrnuto, brze (140ms).
- Zatvara se na: ponovni klik na isto dugme, klik BILO GDE drugde, Escape, i na skrol. NEMA zasebnog dugmeta za zatvaranje.
- Pristupacnost: dugme ima aria-expanded, lista je u fokus zamci dok je otvorena samo za Tab unutar nje, Escape vraca fokus na dugme.
- Na < 640px traka se ne prikazuje (nema mesta pored sadrzaja) - umesto toga isti kontakti vec postoje u podnozju.
- prefers-reduced-motion: bez stagger-a, samo prikaz/sakrivanje.
- Renderuje se u istom wrapperu gde i scrollToTop, dakle na svim javnim stranama.

Commit: "ui(N5): leva kontakt traka sa telefonom, mejlom i mrezama"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N6" -Title "Stranica Pretplata" -Model "opus" -Effort "high" -Mode "auto" -Prompt @"
Nova javna strana /pretplata (en: /pricing) - detaljnija od sekcije cena na landingu.

SADRZAJ, redom:
1) Hero blok strane: naslov "Izaberi kako učis" sa markerom na poslednjoj kljucnoj reci (isti MarkerHighlight obrazac koji je vec na naslovima sekcija), podnaslov u jednoj recenici, bez slike.
2) Poredjenje planova: iste kartice Basic/Premium kao na landingu (ukljucujuci robote iz public/images/landing/plan-*-loop.mp4 sa istim pravilima petlje i faznog pomaka), ali sa duzim spiskom stavki.
3) Tabela razlika: dve kolone (Basic, Premium) i redovi po mogucnostima - Sve lekcije, Zajednica, Pro lekcije, Studio krediti mesecno, Prioritetni odgovori, Rani pristup novim kursevima. Kvacica / crtica. Na mobilnom se tabela pretvara u dve kartice jedna ispod druge, ne u horizontalni skrol.
4) Pojedinacni kursevi: kartice postojecih kurseva iz lib/content sa jednokratnom cenom (cita se iz platformSettings ako postoji polje, inace iz lib/pricing.ts fallback-a) i CTA "Pogledaj kurs".
5) Cesta pitanja o naplati - 5 pitanja, napisana skillom design:ux-copy, u istom tonu kao FAQ na landingu, sa istom animacijom otvaranja:
   - Kada pocinje naplata? - Trenutno je sav objavljeni sadrzaj besplatan uz registraciju; kad naplata krene, javljamo ti mejlom najmanje sedam dana ranije i nista ti se ne skida bez tvoje potvrde.
   - Kako se placa? - Karticom, preko domaceg platnog operatera. Racun stize na mejl odmah posle uplate.
   - Mogu li da promenim plan? - Mozes u svakom trenutku. Prelazak na Premium vazi odmah, a razlika se obracuna srazmerno danima do kraja meseca.
   - Sta se desava kad otkazem? - Pretplata radi do kraja placenog meseca. Sve sto si napravio u Studiju i sve tvoje teme u zajednici ostaju tvoji.
   - Da li izdajete racun za firmu? - Da. U podesavanjima naloga upises podatke firme i racun stize sa njima.
   (EN verzije u istom tonu.)
6) Zavrsni CTA blok.

PRAVILA:
- Strana koristi isti sistem naizmenicnih povrsina (surface-a / surface-b) i talasastu liniju izmedju sekcija kao landing, bez ravnih bordera.
- Cene se citaju iz platformSettings (N1) preko resolveSettings, nikad hardkodovane u komponenti.
- Postojeci link "Pretplata" u navbaru i u podnozju vodi na ovu stranu umesto na #pricing. Sekcija #pricing na landingu ostaje i dobija dugme "Uporedi planove detaljno" koje vodi ovde.
- Metapodaci strane kroz postojeci helper za metadata, sr i en.

Commit: "pretplata(N6): posebna strana sa planovima, kursevima i pitanjima o naplati"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N7" -Title "Hero za Kursevi i Zajednicu, centriranje Studija" -Model "opus" -Effort "high" -Mode "auto" -Continue -Prompt @"
Strane /courses i /community trenutno pocinju naslovom bez heroja, a /studio hero nije centriran kao landing.

1) ZAJEDNICKI HERO ZA JAVNE STRANE
- Napravi components/marketing/page-hero.tsx: isti jezik kao hero landinga (krem podloga #FDEED8, tekst levo u centriranom max-w-7xl kontejneru, ilustracija/video desno, ivice maskirane), ali NIZI - oko 62svh, ne 100svh, jer ispod njega odmah ide sadrzaj.
- Prima: naslovLead + naslovHighlight (marker), podnaslov, do dva CTA, i medij (poster + opcioni mp4 loop).
- Kompozicija se centrira po ISTOM pravilu koje je uvedeno u koraku N3 - visak podloge jednak levo i desno na sirokim ekranima.
- Ispod heroja NEMA talasaste linije (isto pravilo kao na landingu), prva sledeca granica sekcija je talas.

2) PRIMENA
- /courses: naslov "Dva kursa, jedan " + "gotov rad", podnaslov o tome da se svaki kurs zavrsava pravim radom, CTA "Pogledaj kurseve" (skrol na listu) i "Uporedi planove" (/pretplata). Medij: public/images/landing/courses-hero-poster.webp + courses-hero-loop.mp4.
- /community: naslov "Uci javno, " + "napreduj brze", podnaslov o pitanjima i deljenju radova, CTA "Udji u zajednicu" i "Pogledaj diskusije". Medij: public/images/landing/community-hero-poster.webp + community-hero-loop.mp4.
- /studio (javni): postojeci hero prelazi na istu komponentu i time dobija centriranje; tekst i CTA ostaju kakvi jesu.
- AKO neki od navedenih fajlova ne postoji u public/images/landing/, komponenta mora graciozno da prikaze samo poster, a ako ni njega nema - samo krem podlogu bez praznog crnog pravougaonika. Nikad polomljen <video>.

3) SIRINA
- Sve tri strane koriste isti max-w-7xl kontejner kao landing, sa istim horizontalnim paddinzima (px-4 sm:px-6 lg:px-8), da se sirina sadrzaja poklapa kroz ceo sajt.

Commit: "hero(N7): hero sekcije za kurseve i zajednicu, centriran Studio hero"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N8" -Title "Sidebar: dugme, sirina, ikone, animacija" -Model "opus" -Effort "max" -Mode "plan" -Prompt @"
Bocna navigacija dashboarda (components/app/app-sidebar.tsx, app-shell.tsx, app-sidebar-context.tsx). Cetiri povezane stvari - resi ih kao jednu celinu.

1) DUGME ZA KOLAPS
- Sada je dugme sa borderom i pozadinom. Novo: samo ikonica, bez bordera, bez pozadine, bez senke, u boji mastila; hover daje samo blagi background-color na 6% mastila i nista vise.
- Kad je sidebar zatvoren, isto to dugme stoji na istom mestu, i dalje bez ikakve boje i bordera, samo je ikonica okrenuta na suprotnu stranu (rotacija 180 stepeni, animirana 200ms).

2) SIRINA OTVORENOG SIDEBARA
- Otvoren sidebar je sada preroko. Suzi ga na najmanju sirinu na kojoj: dugme za kolaps NE prelazi preko logotipa u gornjem levom uglu, i svaki nav link staje u jedan red bez preloma i bez tri tackice. Izmeri najduzi link u sr I u en (npr. "Obavestenja", "Notifications", "Rang lista") i iz toga izvedi sirinu; upisi izmerenu vrednost kao token --sidebar-w u globals.css sa kratkim komentarom kako je dobijena.
- Zatvorena sirina je --sidebar-w-collapsed = tacno sirina kruga ikonice + horizontalni padding.
- Rucno "resizovanje" prozora i klik na dugme moraju da daju ISTI prelaz izmedju te dve sirine. Ne sme postojati nijedna druga prelomna tacka na kojoj sidebar menja izgled.

3) IKONICE SE NE POMERAJU
- Kad se sidebar zatvori, ikonice nav linkova ostaju iste velicine i na ISTOJ x poziciji kao kad je otvoren. Trenutno se povecavaju/pomeraju.
- Postizi to tako da je ikonica u fiksnom kontejneru sirine --sidebar-w-collapsed poravnatom levo, a tekst je poseban element DESNO od njega koji se samo pojavljuje/nestaje. Ni ikonica ni njen kontejner ne ucestvuju u animaciji sirine.

4) ANIMACIJA
- Sirina sidebara animira 260ms sa ease iz lib/motion-contract. Tekst linkova: opacity 0->1 i translateX -4px->0, 160ms, sa kasnjenjem 80ms pri OTVARANJU (prvo se sirina otvori, pa se tekst pojavi) i bez kasnjenja pri ZATVARANJU (tekst prvo nestane, pa se sirina skupi) - tako nema preloma teksta u pola animacije.
- Glavni sadrzaj desno prati istu krivu i isto trajanje, bez skoka i bez horizontalnog scrollbar-a tokom prelaza.
- Bez layout shift-a: nista se ne sme pomeriti vertikalno.
- prefers-reduced-motion: trenutna promena bez animacije.

PROVERA
- Screenshotovi otvoreno/zatvoreno na 1920, 1536x695 i 1280x720, i snimak ponasanja tokom prelaza (3 kadra). Proveri sr i en.

Commit: "sidebar(N8): uze otvoreno stanje, stabilne ikonice, cistije dugme i glatka animacija"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N9" -Title "Dashboard popup, notifikacije, ispadi" -Model "opus" -Effort "high" -Mode "auto" -Continue -Prompt @"
Tri sitnije, ali vidljive stvari u dashboardu.

1) POPUP NALOGA U DASHBOARDU
- Popup korisnika u dashboardu (dole u sidebaru) treba da izgleda kao dropdown naloga sa javnih strana posle koraka N2, ali sa svojim sadrzajem.
- Redosled odozgo: prvi red je link ka /app/profile sa PROFILNOM SLIKOM u krugu umesto ikonice, imenom i @korisnickim imenom, i oznakom uloge desno (isto kao na javnim stranama). Ispod njega linkovi Podesavanja i Pretplata.
- Ispod linkova red sa alatkama: broj tokena/kredita, prebacivac zvuka, prebacivac teme i OBAVEZNO prebacivac jezika (ista komponenta iz koraka N4).
- Na dnu, preko cele sirine, dugme "Odjavi se" u punom mastilu, tacno kao na javnim stranama.
- Isti radius, ista senka, isti "repic" ka dugmetu koje ga otvara.

2) ISPADI NA IVICAMA PANELA
- Na vise mesta u aplikaciji vide se sitni ispadi na uglovima panela: zaobljeni ugao unutrasnjeg elementa viri izvan roditelja, ili se dva bordera preklapaju i prave rogalj (najuocljivije na vrhu panela "Razgovori" u porukama).
- Nadji uzrok (najcesce: dete ima svoj border i radius, a roditelj nema overflow-hidden, ili dete ima veci radius od roditelja) i popravi ga sistemski, ne zakrpom po ekranu: roditelj koji secka decu dobija overflow-hidden, a radius deteta nikad ne sme biti veci od radiusa roditelja.
- Prodji CELU platformu i ukloni svaki takav ispad: dashboard, poruke, zajednica, Studio, ucionica, admin. Napisi u izvestaju gde si ih sve nasao.

3) PODESAVANJA OBAVESTENJA
- Popup podesavanja obavestenja je preroko za svoj sadrzaj - suzi ga tako da dugmad "U aplikaciji / Push / Zvuk" popune red bez velikog praznog prostora desno; kartice po tipu obavestenja neka budu kompaktnije (manji padding, manji razmak).
- Glavno zvono (ono iznad, koje gasi sva obavestenja) i pojedinacni prekidaci po tipu MORAJU biti sinhronizovani: gasenje glavnog zvona gasi sve pojedinacne i vizuelno ih prikazuje kao ugasene; kad se glavno upali, vraca se prethodno stanje pojedinacnih. Ako je bilo koji pojedinacni upaljen, glavno zvono je upaljeno. Uvedi jasno stanje "sve ugaseno / delimicno / sve upaljeno" i prikazi ga na zvonu.

Commit: "dashboard(N9): jedinstven popup naloga, uklonjeni ispadi panela, sredjena obavestenja"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N10" -Title "Hijerarhija Smer > Kurs > Lekcija i redizajn Ucionice" -Model "opus" -Effort "high" -Mode "auto" -Prompt @"
Dve povezane stvari oko ucenja.

1) HIJERARHIJA U BOCNOJ NAVIGACIJI
- Hijerarhija je Smer > Kurs > Lekcija. Sada u sidebaru ispod dugmeta "Nazad" stoji kartica aktivnog kursa sa strelicom nadole koja izgleda kao nesto izmedju dugmeta i dropdown-a i ne komunicira hijerarhiju.
- Redizajniraj je kao "putanju konteksta": tri nivoa jedan ispod drugog, uvuceni levo, povezani tankom vertikalnom linijom u boji --line:
   SMER  (nadnaslov, type-eyebrow, muted)  ->  naziv smera
   KURS  ->  naziv aktivnog kursa, sa oznakom "AKTIVAN"
   LEKCIJA -> naziv lekcije koju trenutno gleda, ako je otvorena
  Klik na bilo koji nivo otvara popover sa listom stavki tog nivoa (smerovi / kursevi u tom smeru / lekcije u tom kursu) i prebacuje kontekst. Dugme "+" ostaje, ali pored nivoa KURS, kao "dodaj kurs".
- Kada je sidebar zatvoren, ovaj blok se svodi na jednu ikonicu koja otvara isti popover.
- Ako korisnik nema nijedan upisan kurs, prikazi jedan red "Izaberi smer" koji vodi u Ucionicu.

2) UCIONICA
- Strana Ucionica je monotona: nizovi kartica bez ritma. Prepravi je:
   - Zona A (vrh): "Nastavi gde si stao" postaje sirok blok sa VELIKIM medijem levo (koristi postojece loop videe kursa iz public/images/landing/course-*-loop.mp4 sa posterima, isti mehanizam kao na javnim stranama - IntersectionObserver, pauza van kadra, poster uz reduced-motion) i sa desne strane naziv lekcije, napredak i CTA "Nastavi".
   - Zona B: Smerovi kao horizontalne trake sa naslovom smera i minijaturama kurseva u njemu.
   - Zona C: Kursevi kao mreza od dve kolone; svaka kartica dobija svoj loop video umesto staticne slike, u odnosu 16:9, i ceo je klikabilna.
   - Uvedi ritam: naizmenicne povrsine (surface-a / surface-b) izmedju zona i talasastu liniju izmedju njih, isto kao na javnim stranama - time strana prestaje da bude jednolicna.
- Prazna stanja ostaju kakva jesu po tekstu, ali dobijaju isti vizuelni jezik.
- Sve mora da radi i za korisnika bez ijednog kursa i za admina koji vidi i nacrte.

Commit: "ucionica(N10): hijerarhija smer-kurs-lekcija i ozivljena Ucionica"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N11" -Title "Studio: komande oko polja za unos" -Model "sonnet" -Effort "high" -Mode "auto" -Prompt @"
Polje za unos u Studiju (i u dashboardu /app/studio i na javnom /studio - ista komponenta, promeni je na jednom mestu).

- Dugme "Sakrij polje za unos" sada stoji ISPOD polja. Premesti ga IZNAD polja, poravnato po sredini, i neka bude vidljivo SAMO kad je polje (ili bilo sta u njemu) hoverovano ili fokusirano - opacity 0 -> 1, 140ms; na tastaturi se pojavljuje na focus-within, da ostane dostupno bez misa.
- Na mobilnom (< 640px): sve komande ispod polja (dugme "+", izbor modela, rezolucija, odnos, dugme "Generisi" sa brojem kredita) moraju stati u JEDAN red bez prelamanja - smanji ih na ikonice sa kratkim labelama gde treba, i dozvoli horizontalni skrol samo unutar tog reda ako bas ne staje, nikad prelom u novi red.
- Na mobilnom umesto tekstualnog dugmeta "Sakrij polje za unos" stavi suptilno malo "caret" dugme (ChevronDown) iznad polja, po sredini: klik kolapsuje ili otvara polje, a sam caret se rotira 180 stepeni animirano (200ms). Kad je polje kolapsovano, caret ostaje vidljiv.
- Stanje otvoreno/kolapsovano pamti se po korisniku u localStorage, odvojeno za mobilni i desktop.
- Ne diraj logiku generisanja, cene kredita ni validaciju - samo raspored i vidljivost komandi.

Commit: "studio(N11): komande oko polja za unos - sakrivanje iznad polja i jedan red na mobilnom"
"@

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N12" -Title "Zajednica: blaga gamifikacija i manje okvira" -Model "opus" -Effort "high" -Mode "auto" -Prompt @"
Dva zahteva koja idu zajedno jer diraju iste ekrane.

1) MANJE OKVIRA NA CELOJ PLATFORMI
- Na dosta mesta imamo visak: kartica sa border-2 unutar panela koji vec ima border-2, slike sa duplim okvirom (okvir na omotacu I na samoj slici), komentari u zajednici gde svaki komentar ima pun okvir pa lista izgleda kao resetka.
- Pravilo koje uvodis i dokumentujes u AGENTS.md: unutar elementa koji vec ima border-2 border-ink, deca se odvajaju POZADINOM (naizmenicne povrsine) ili tankom linijom --line, a ne novim border-2. Pun border-2 border-ink nosi samo NAJSPOLJASNJI element grupe.
- Prodji javnu zajednicu, komentare, kartice diskusija, profil clana, ucionicu, Studio galeriju i admin liste i primeni pravilo. Slike i mediji dobijaju tacno jedan okvir - na omotacu, ne na oba.
- Nemoj skidati bordere sa dugmadi, polja za unos i modala - tamo su nosioci stila.

2) BLAGA GAMIFIKACIJA ZAJEDNICE (CSS/Tailwind, bez novih biblioteka)
- Cilj: ubiti monotoniju, ne pretvoriti zajednicu u igricu. Sve suptilno, u duhu obojenih ilustracija sa landinga.
- a) Traka napretka nivoa u profilu clana i pored avatara u listi clanova: tanka traka u akcentnoj boji nivoa, sa brojem do sledeceg nivoa; boja se bira iz malog seta akcenata definisanih kao tokeni, po nivou.
- b) Kad korisnik dobije upvote na svoju temu ili komentar dok je na strani: jednom sevne mala iskra (Sparkles) iznad brojaca i broj se prebroji nagore (count-up 400ms). Bez zvuka, bez konfeta preko celog ekrana.
- c) Znacke: mali skup znacki (prva tema, prvih 10 komentara, prvi koristan odgovor, 7 dana zaredom) - prikazuju se kao sitne okrugle oznake pored imena, sa tooltipom. Podatke racunaj iz postojecih polja (broj tema, komentara, helpfulAnswerCount, lastSeenAt) - NE uvodi nove Convex tabele u ovom koraku; ako neki podatak ne postoji, tu znacku preskoci.
- d) Rang lista dobija blagi gradijent akcenta na prva tri mesta i tanku animaciju ulaska redova (stagger 30ms) kad sekcija udje u kadar.
- e) Sve animacije postuju prefers-reduced-motion i ne pokrecu se van kadra.
- Nista od ovoga ne sme da uspori listu diskusija ni da doda zahtev ka bazi po redu.

Commit: "zajednica(N12): blaga gamifikacija i uklonjeni suvisni okviri"
"@

# ─────────────────────────────────────────────────────────────────────────────
# N13 (jezik: srpski bez prefiksa, /en za engleski) je NAMERNO izostavljen iz nocnog
# runa - to je jedini korak koji, ako pukne, obara ceo sajt a ne jedan ekran.
# Radi se rucno, uz nadzor. Ne dodavati ovde bez dogovora.

# ─────────────────────────────────────────────────────────────────────────────
Invoke-Step -Id "N14" -Title "QA prolaz i izvestaj" -Model "sonnet" -Effort "high" -Mode "auto" -Prompt @"
Zavrsna kontrola posle celog runa. NE uvodi nove funkcije - samo nalazi i popravlja greske nastale u koracima N1-N13.

- Pokreni produkcijski build i prodji Playwright-om (Chromium je u projektu) sve javne strane i glavne ekrane dashboarda, u sr i en, u svetloj i tamnoj temi, na 1920x1080, 1536x695, 1280x720, 768x1024 i 390x844.
- Trazi: horizontalni skrol (scrollWidth > clientWidth), preklapanja teksta, ispade na uglovima panela, elemente van ekrana, prelome CTA dugmadi, nevidljive nav linkove na vrhu stranica sa svetlim herojem u tamnoj temi, i bilo koju cistu belu povrsinu.
- Konzola mora biti bez gresaka i bez React upozorenja na svakoj strani; nijedan zahtev ne sme vratiti 404 ili 500.
- axe-core: nula critical i serious nalaza. Tab redosled prolazan kroz navbar, hero, levu traku i sidebar.
- Lighthouse mobile na / i na /pretplata: ako je Performance ispod 85 ili Accessibility ispod 95, popravi sta obara rezultat.
- Screenshotovi u docs/qa/v4/.
- Napisi docs/V4-REPORT.md: tabela svih 14 koraka sa statusom, spisak nalaza (strana, rezolucija, tema, opis, popravljeno da/ne), Lighthouse brojevi, i posebna sekcija "Za Jovana" sa stvarima koje trazе njegovu odluku ili podatke (telefon i linkovi mreza u /app/admin/settings, cene, tekstovi).

Commit: "qa(N14): zavrsni prolaz posle redizajna v4 i izvestaj"
"@

Write-Log "==================== RUN ZAVRSEN ===================="
Write-Log "13 koraka (N13/jezik izostavljen namerno)."
Write-Log "Izvestaj: docs/V4-REPORT.md   Napredak: docs/V4-PROGRESS.md   Log: docs/V4-RUN-LOG.txt"
