# IGRA — gejmifikovan izgled Nauči AI (noćni run, 13. → 14. oktobar 2026.)

> Izvor istine za ceo run. Svaki korak ga čita pre rada. Tehnički detalji koje
> koraci sami dopišu idu u `docs/igra/planovi/<ID>.md`; ovaj fajl se ne prepisuje,
> samo se dopunjuju ODLUKE na dnu kad je to baš neophodno.

## 0. Šta pravimo, u jednoj rečenici

Ceo deo aplikacije **posle prijave** dobija **gejmifikovan izgled**: Crea,
kontrolna tabla, učionica, zajednica, profil, poruke, krediti i admin panel.
Izgled je **premium, čist i „brutalan"**, a i dalje je **sveska**: papir, mastilo
i žuti marker. **Ne pravimo igricu.** Igra je u izgledu, pokretu, likovima,
ilustracijama i osećaju napretka. Nema nove ekonomije.

Danas je unutrašnjost monotona: puno praznog prostora, malo slika, sve liči
jedno na drugo. Posle ovog runa svaki ekran ima **jednu jaku ilustraciju ili
lik**, jasan **osećaj napretka** (nivo, XP, niz, bedževi, mesto na listi) i
**pokret** koji nagrađuje (pečat, marker, konfete, 3D pehar). Pokret nikad ne
smeta i uvek poštuje „smanji pokrete".

## 1. Odluke (Jovan, 13. okt. 2026, 23:10–23:30)

| # | Odluka |
|---|---|
| O1 | Nije igrica. Gejmifikovan **izgled** preko Three.js-a, GSAP-a, animacija i ilustracija. Mehanike postoje samo koliko izgled traži. |
| O2 | Stil ostaje **sveska** (papir, mastilo, žuti marker), samo raskošnije: premium, clean, brutal. Likovi i ilustracije idu svuda gde je sada prazno. |
| O3 | Likove bira Claude („ne znam"). Ekipa od 7 likova je u §3. |
| O4 | Takmičenje: **samo rang liste**. Bez liga, timova i novih izazova. Postojeće Crea mehanike (izazovi, galerija, parovi) ostaju kakve jesu, dobijaju samo izgled. |
| O5 | Obim: **samo posle prijave**. Javni sajt se NE dira: početna, cene, kursevi za goste, `/crea` landing, prijava i registracija. |
| O6 | Nivo, XP traka i bedževi: **da, samo za prikaz**, iz postojećih poena. Bez nagrada, bez kredita, bez popusta. |
| O7 | Slike pravi Claude u ChatGPT-u tokom noći. Sve slike su **AVIF**. |
| O8 | Modeli: **Opus 5.5** je glavni. **Sonnet 5.5** radi manje korake i radnike. **Haiku 4.5** radi najsitnije radnike (Haiku 5.5 ne postoji). |
| O9 | Zarazno, ali pošteno. Bez kockanja, bez lažnih odbrojavanja, bez sramoćenja („izgubićeš sve!"), bez notifikacija koje plaše. Motivacija je napredak i lepota, ne strah. |

## 2. Vizuelni jezik: „Igra u svesci"

### 2.1 Materijali
- **Papir:** postojeći tokeni `--color-paper` i `--color-surface-a/b` i postojeća mreža (`sketch-grid`).
- **Mastilo:** postojeći `--color-ink`. Linije su ručne i samouverene, bez savršeno ravnih tankih okvira.
- **Žuti marker:** postojeći `--color-yellow`. Marker „prevlači" važne stvari: XP, nivo, novi bedž, prvo mesto. Žuto je nagrada, pa se ne troši na sve.
- **Nalepnice:** likovi, bedževi i ikone su *die-cut* nalepnice sa krem ivicom. Zbog te ivice rade i na tamnoj temi, gde mastilo ne bi bilo vidljivo na tamnom.
- **Pečat:** nivo je pečat, „udari" kad se dobije.
- **Washi traka, spajalice, ivica sveske:** sitni dekori za kartice. Ima ih malo, nikad dva na jednoj kartici.

### 2.2 Premium i čisto
- Jedna jaka ilustracija po ekranu. Ostalo diše.
- Jasna tipografska hijerarhija: veliki naslovi, kratki podnaslovi, brojevi kao heroji (odometar).
- **AGENTS.md važi bez izuzetka**: 4 radius tiera i jedan okvir po grupi (`npm run check:frames`). Okvire ne gomilamo, „igra" se ne pravi okvirima.
- Gustina: ekrani admina i liste ostaju gusti i brzi. Igra je u zaglavlju, brojačima i stanjima, ne u svakom redu.

### 2.3 Gejmifikovani primitivi (`components/igra/*`)

| Primitiv | Opis |
|---|---|
| **XP traka** | Marker se „razlije" kroz traku do vrednosti (GSAP). Iznad stoji „još N XP do nivoa X". |
| **Pečat nivoa** | Amblem nivoa (`nivo.01`–`nivo.12`) sa brojem. Animacija „stamp-in" kad se nivo promeni. |
| **Nalepnica bedža** | Otključan bedž je u boji sa „peel" sjajem na hover. Zaključan je siluetom mastila, sa uslovom u tooltipu („Završi 5 lekcija"). |
| **Plamen niza** | `rang.plamen` + broj dana. Danas završeno: plamen gori. Nije još: tinja, uz blag poziv bez straha. |
| **Rang čip** | `#N` sa medaljom za top 3. Koristi se u zajednici i na profilu. |
| **Odometar** | Broj se vrti do vrednosti. Za XP, brojače i admin KPI-jeve. |
| **Misija dana** | Kartica „sledeći korak" (nastavi lekciju, napravi prvi video, odgovori u zajednici). Ovo je vodič, nije zadatak sa nagradom. |
| **Trofejna polica** | Red ili mreža bedževa. Na profilu idu svi, sa zaključanima. |
| **Slavlje** | Preko celog ekrana: lik `slavi` + konfete (`canvas-confetti` postoji) + 3D pehar ili medalja kad je uključeno + zvuk samo ako je zvuk uključen. Ide jednom po događaju, Esc ga zatvara, sam se gasi za ≤ 2,5 s. |
| **Mapa puta** | SVG putanja koja se „iscrtava" (GSAP DrawSVG, deo `gsap` paketa) kroz stanice: moduli kursa i kursevi staze. |

### 2.4 Pokret
- **GSAP** (`gsap` ^3.15 sa pluginovima DrawSVG, SplitText i Flip) za sekvence i vremenske linije. `@gsap/react` (`useGSAP`) je dozvoljen novi paket.
- **`motion`** ostaje gde je već u upotrebi.
- **Obavezno:** `lib/motion-contract.ts` i `prefers-reduced-motion`. Uz smanjene pokrete nema konfeta, nema 3D-a i nema odometra: vrednost se odmah prikaže.
- Trajanja: mikro 120–220 ms, ulazi 300–600 ms, slavlje ≤ 2,5 s. Ništa ne treperi i ništa se ne vrti u petlji bez potrebe.

### 2.5 3D (Three.js)
- `three`, `@react-three/fiber` i `@react-three/drei` već postoje. **3D je ukras, nikad sadržaj.**
- **3D pehar i medalje** (low-poly, toon materijal i ink outline koji liči na mastilo) za slavlje nivoa i za rang podijum.
- **Postojeća 3D maskota** (`public/models/mascot-premium.glb`, `components/marketing/mascot-canvas.tsx`) na heroju kontrolne table, samo na desktopu.
- **Uvek:** `next/dynamic` sa `ssr: false`, učitavanje kad je vidljivo (IntersectionObserver), DPR ≤ 1,5, pauza kad tab nije aktivan.
- **Fallback:** nalepnica umesto 3D-a na telefonu i uz smanjene pokrete.

### 2.6 Zvuk
Postojeći `public/brand/crea/sfx` i `components/app/sound-toggle.tsx`. Podrazumevano ponašanje ostaje kao danas. Novi zvuci samo iz postojećeg skupa ili kao ODLUKA sa licencom.

## 3. Ekipa (likovi)

Svaki lik ima 4 poze: `mase` (pozdrav), `slavi` (slavlje), `misli` (razmišlja) i `tuzan` (zbunjen ili tužan, za greške i prazna stanja). ID slike je `lik.<lik>.<poza>`.

| Lik | Ime | Izgled | Gde živi |
|---|---|---|---|
| `robi` | **Robi** | robot sa sajta (antena sa žutim vrhom, lice-ekran, slušalice) | vodič svuda: kontrolna tabla, slavlja, greške, admin |
| `piksi` | **Piksi** | mrlja mastila sa četkicom | Crea: slika |
| `kadar` | **Kadar** | stara filmska kamera sa nogicama i klapom kao šeširom | Crea: video |
| `eho` | **Eho** | retro mikrofon sa zvučnim talasima | Crea: zvuk, glas |
| `bajt` | **Bajt** | stvorenje od `</>` zagrada | kursevi o kodu i sajtovima, admin „sistem" |
| `sova` | **Sova** | sova sa okruglim naočarima i olovkom | učionica, kursevi, noćna tura |
| `iskra` | **Iskra** | sijalica-iskra sa malim oblačićem | zajednica, obaveštenja, pomeni |

**Ton:** likovi su topli i duhoviti, nikad ne sramote korisnika. Govore kratko, na srpskom, ti-forma, kao i ostatak sajta.

## 4. Napredak (podaci, samo za prikaz)

| Šta | Kako |
|---|---|
| **XP** | `leaderboardStats` (scope `global`, period `all_time`) `.xp`. Već sabira lekcije, zadatke, korisne odgovore i Crea događaje (`LEADERBOARD_XP`, Crea K26 G1). Nedeljni XP je period `week`. **XP pravila se ne menjaju.** |
| **Nivoi** | 12 nivoa (tabela ispod). Prag je čista funkcija u `lib/igra-level.ts`, sa testovima. Kriva je takva da aktivan početnik prvog dana dobije nivo 2, za oko dve nedelje redovnog rada nivo 5, a nivo 12 je retkost. K01 predlaže tačne pragove iz stvarnih vrednosti `LEADERBOARD_XP`. |
| **Bedževi** | 24 (tabela ispod). Svaki je pravilo nad **postojećim** brojačima i čista funkcija u `lib/igra-badges.ts`. Upit čita samo indeksirano i ograničeno (`take`, postojeći agregati), **nikad ne skenira celu istoriju**. Ako brojač ne postoji jeftino, bedž ostaje „uskoro" (zaključan, bez uslova), uz ODLUKU. |
| **Niz dana** | `profileActivityDays`: lekcija ILI rad u Crei, isto pravilo kao Crea K26 G2. Ponovo se koristi `lib/crea-streak`. |
| **„Proslavi jednom"** | Jedna nova mala tabela `igraSeen` (`userId`, `key`, `seenAt`, indeks `by_user_key`). Nivo ili bedž se slavi jednom, pri prvom sledećem otvaranju. Druge nove tabele samo ako K01 dokaže potrebu. |
| **Mesto na listi** | Postojeći leaderboard upiti. |

**Ne sme:** krediti, nagrade, popusti, kupovina, promene cena, promene `LEADERBOARD_XP`, javni prikaz tuđih podataka koje danas ne prikazujemo.

### Nivoi

| # | Ime (sr) | Ime (en) | Amblem |
|---|---|---|---|
| 1 | Početnik | Beginner | `nivo.01` olovka-patrljak |
| 2 | Radoznalac | Curious | `nivo.02` lupa |
| 3 | Skicar | Sketcher | `nivo.03` olovka i papir |
| 4 | Istraživač | Explorer | `nivo.04` kompas |
| 5 | Graditelj | Builder | `nivo.05` zupčanik i kockice |
| 6 | Pronalazač | Inventor | `nivo.06` sijalica |
| 7 | Kreator | Creator | `nivo.07` paleta i kamera |
| 8 | Majstor | Master | `nivo.08` ključ i zvezda |
| 9 | Vizionar | Visionary | `nivo.09` teleskop |
| 10 | Mentor | Mentor | `nivo.10` knjiga i sova |
| 11 | Šampion | Champion | `nivo.11` pehar |
| 12 | Legenda | Legend | `nivo.12` kruna i antena |

### Bedževi (ID = `bedz.<kljuc>`)

| Grupa | Bedževi |
|---|---|
| **Učenje** | `prva-lekcija`, `prvi-zadatak`, `pet-lekcija`, `prvi-kurs`, `tri-kursa`, `staza` (cela staza), `nocna-sova` (lekcija posle 22 h), `rani-pevac` (lekcija pre 8 h) |
| **Crea** | `prvi-rad`, `deset-radova`, `sto-radova`, `prvi-video`, `prvi-zvuk`, `recept` (rad po receptu), `tehnika` (Crea tehnika), `izazov` (učešće u izazovu) |
| **Zajednica i nizovi** | `prva-objava`, `koristan-odgovor`, `omiljen` (10+ reakcija na objavu), `mentor` (pomogao drugima, partner za učenje), `niz-3`, `niz-7`, `niz-30`, `top-10` (top 10 nedeljne liste) |

**Napomena za 22 h i 8 h:** pragovi se računaju u vremenskoj zoni Beograda, kao i ostali „dnevni" ključevi u repou.

## 5. Rang liste

Postojeća lista zajednice (`community-leaderboard.tsx`, `convex/leaderboard*.ts`) dobija novi izgled:
- **Podijum:** top 3 sa medaljama (`rang.zlato`, `rang.srebro`, `rang.bronza`) i 3D peharom na desktopu.
- **Lista:** animirana. Ulaz je stagger, a promena mesta ide kroz GSAP Flip.
- **„Ti" red:** uvek vidljiv, lepljiv na dnu kad nisi u vidnom polju.
- **Filteri:** Ova nedelja / Ukupno. Sve / Učenje / Crea samo ako podaci to već razlikuju jeftino.
- **Odbrojavanje do kraja nedelje:** stvarni kraj nedelje (`weekKey`), bez lažne hitnosti.

Bez liga, bez grupa, bez nagrada.

## 6. Površine (šta se menja)

| # | Površina | Šta se menja |
|---|---|---|
| 6.1 | **Ljuska aplikacije** | U sidebaru i gornjoj traci: pečat nivoa, XP traka i plamen niza, kompaktno. Klik otvara panel „Moj napredak". Mobilni donji meni ostaje **tačno 4 slota**, a napredak ide u zaglavlje. Prelazi između strana su mirni (bez skakanja layouta). |
| 6.2 | **Kontrolna tabla** (`/app`) | Heroj scena po dobu dana (`scena.dashboard-jutro/dan/vece/noc`), Robijev pozdrav, misija dana, XP i nivo (odometar), niz, trofejna polica (poslednja 3 bedža), moje mesto na listi, „nastavi kurs", Crea brzi start (Piksi, Kadar, Eho), aktivnost kao mastilo-kalendar. Opciono 3D maskota na desktopu. |
| 6.3 | **Učionica** | Kursevi kao „svetovi": kartica sa ilustracijom i prstenom napretka. Staza i kurs imaju mapu puta (`scena.mapa-puta` + SVG putanja + stanice). Lekcija: traka napretka, a završetak donosi malo slavlje (XP odometar). Kraj kursa donosi veliko slavlje (`scena.kurs-zavrsen`). |
| 6.4 | **Zajednica** | Heroj (`scena.zajednica`), objave sa rang čipom i pečatom nivoa autora, bedževi u karticama članova, rang liste (§5), obaveštenja i pomeni sa Iskrom, prazna stanja. |
| 6.5 | **Profil** (moj i tuđi) | Baner, pečat nivoa, XP, trofejna polica sa **svih 24** bedža (zaključani kao siluete), brojači, mastilo-kalendar aktivnosti. Baner se bira i otključava nivoom (samo izgled): 1 `sveska`, 3 `laboratorija`, 5 `studio`, 7 `svemir`, 9 `grad`, 11 `okean`. Tuđi profil prikazuje samo ono što je i danas javno. |
| 6.6 | **Crea** | Ulaz „Šta praviš danas?" sa Piksijem, Kadrom i Ehom. Radionice imaju svoje ilustracije. Dok se generiše, lik „radi" (animirana nalepnica, bez lažnog procenta). Prvi rezultat svake vrste donosi mini slavlje. Prazna biblioteka je `prazno.radovi`. Crea niz i XP su vidljivi. Galerija, izazovi i parovi dobijaju samo vizuelno pojačanje. |
| 6.7 | **Poruke** | Prazna stanja (`prazno.poruke`) i suptilne mikrointerakcije. Ništa ne ometa razgovor. |
| 6.8 | **Krediti i naplata** | Ilustracije i jasnoća. **Nikakva gejmifikacija trošenja**: nema „kupi još", nema slavlja kupovine. |
| 6.9 | **Admin: „Kontrolna soba"** | Heroj (`scena.kontrolna-soba`), KPI pločice sa ikonama (`admin.*`), odometri, sparkline-ovi, moderacija prikazana kao „red misija" (samo vizuelno), statusi sistema sa Robijem. Tabele ostaju guste i brze. |
| 6.10 | **Greške, 404, učitavanje, offline** (unutar aplikacije) | `prazno.greska`, `prazno.404`, `prazno.ucitavanje`, `prazno.offline`. |

## 7. Slike (pipeline)

1. Claude ih pravi u ChatGPT-u tokom noći i stižu u `.igra-assets/ready/` (folder je u `.gitignore`).
2. **Runner ih pre svakog koraka kopira u `public/brand/igra/`**, zajedno sa `manifest.json`. Commit koraka ih nosi dalje.
3. **Manifest** je `public/brand/igra/manifest.json`. Svaki ID ima `src`, `w`, `h`, `kind`, `ready` i `alt` (`sr`/`en`). ID-jevi su **stabilni**; spisak je u `docs/igra/SLIKE.md`.
4. **Kod:**
   - `lib/igra-art.ts` je tipizovan registar nad manifestom.
   - `components/igra/igra-art.tsx` je `<IgraArt id="lik.robi.mase" />`: `<img>` (AVIF) sa `width`/`height`, `loading="lazy"`, `decoding="async"` i `alt` po jeziku. Dekorativna slika dobija `alt=""` i `aria-hidden`.
   - Kad je `ready: false` ili kad stigne 404, prikazuje se dostojanstven fallback (postojeća ikonica ili ništa). **Nikad slomljena slika.**
5. **Agent NE generiše slike**: nema image API-ja ni MCP-a za slike. Kad treba slika koje nema na spisku, upisuje se u `docs/IGRA-PROGRESS.md` pod **„TRAŽENE SLIKE"** (ID, opis, veličina, gde ide), a Claude je pravi tokom noći.
6. Sve slike su AVIF. Slike javnog sajta se ne diraju.

## 8. Tehnika i granice

- **Novi kod:** `lib/igra-*.ts` (čiste funkcije + vitest), `components/igra/*`, `convex/igra*.ts`. Postojeće komponente se menjaju na mestu, hirurški.
- **Izlog:** dev-only ruta `/{locale}/igra-izlog`.
  - U produkciji je `notFound()`, uz `noindex` i bez sitemap-a.
  - Prikazuje sve primitive i sve nove površine sa test podacima, zato je UI građen od prezentacionih komponenti.
  - Odatle se prave snimci ekrana bez prijave.
- **Paketi:** postojeći (`gsap`, `three`, `@react-three/fiber`, `@react-three/drei`, `motion`, `canvas-confetti`, `lucide-react`). Novi samo uz ODLUKU (MIT/Apache, veličina); `@gsap/react` je unapred dozvoljen.
- **Bundle:** Three.js i GSAP pluginovi samo kroz `dynamic import` / `next/dynamic` (`ssr: false`), nikad u zajednički bundle prvog učitavanja.
- **Performanse:** LCP ekrana se ne sme pogoršati. Heroj slika ima `fetchpriority="high"` samo kad je stvarno LCP. 3D ide tek posle prvog crtanja.
- **Pristupačnost:**
  - smanjeni pokreti
  - kontrast 4,5:1
  - vidljiv fokus
  - mete ≥ 44 px
  - slavlje se zatvara na Esc
  - alt tekstovi iz manifesta
  - čitač ekrana čuje „Novi nivo: Skicar" kroz `aria-live`, ne konfete
- **i18n:** svi stringovi idu kroz `lib/i18n`, sr primarno, en sekundarno.
- **Teme:** svetla i tamna moraju da rade.
- **Telefon:** 390 px. Mobilni donji meni ima tačno 4 slota.
- **Ne dirati:**
  - javni sajt
  - auth tok
  - Stripe i plaćanja
  - cene i krediti
  - `LEADERBOARD_XP`
  - Convex produkciju
  - imena Convex tabela i funkcija
  - interne `studio` foldere

## 9. Koraci

Tačne vrednosti modela, efforta, režima i sesije su u `.igra-run/steps.json`. Prompt svakog koraka je u `.igra-run/prompts/<ID>.md`.

| ID | Naslov | Model | Effort | Režim | Sesija |
|---|---|---|---|---|---|
| K01 | Arhitektura IGRA (plan) | Opus 5.5 | max | plan | nova |
| K02 | Temelj: slike, tokeni, `IgraArt` | Opus 5.5 | xhigh | goal | ista (K01) |
| K03 | Pokret i 3D temelj | Opus 5.5 | xhigh | goal | nova |
| K04 | Napredak: nivoi, bedževi, niz, `igraSeen` | Opus 5.5 | xhigh | goal | nova |
| K05 | Gejmifikovani primitivi + izlog | Opus 5.5 | xhigh | goal | nova |
| K06 | Ljuska aplikacije i „Moj napredak" | Opus 5.5 | xhigh | goal | nova |
| K07 | Plan: kontrolna tabla i učionica | Opus 5.5 | high | plan | nova |
| K08 | Kontrolna tabla | Opus 5.5 | xhigh | goal | ista (K07) |
| K09 | Učionica: kursevi, lekcije, slavlja | Opus 5.5 | xhigh | goal | nova |
| K10 | Mapa puta (staze i kursevi) | Opus 5.5 | xhigh | goal | nova |
| K11 | Zajednica: heroj, objave, obaveštenja | Opus 5.5 | xhigh | goal | nova |
| K12 | Rang liste i podijum | Opus 5.5 | xhigh | goal | nova |
| K13 | Profil (moj i tuđi) i trofejna polica | Opus 5.5 | xhigh | goal | nova |
| K14 | Plan: Crea | Opus 5.5 | high | plan | nova |
| K15 | Crea ulaz i radionice | Opus 5.5 | xhigh | goal | ista (K14) |
| K16 | Crea čekanje, rezultat, slavlja | Opus 5.5 | high | goal | nova |
| K17 | Crea biblioteka, galerija, izazovi (izgled) | Opus 5.5 | high | goal | nova |
| K18 | Poruke i obaveštenja | Sonnet 5.5 | high | goal | nova |
| K19 | Krediti, naplata, podešavanja | Sonnet 5.5 | high | goal | nova |
| K20 | Plan: admin „Kontrolna soba" | Opus 5.5 | high | plan | nova |
| K21 | Admin: pregled, analitika, korisnici | Opus 5.5 | xhigh | goal | ista (K20) |
| K22 | Admin: sadržaj, moderacija, Crea, čet, podešavanja | Opus 5.5 | high | goal | nova |
| K23 | Prazna stanja, greške, učitavanje | Sonnet 5.5 | high | goal | nova |
| K24 | Mikrointerakcije i zvuk | Opus 5.5 | high | goal | nova |
| K25 | Sve slike na mestu (manifest sweep) | Sonnet 5.5 | high | goal | nova |
| K26 | Telefon (390 px) — ceo prolaz | Opus 5.5 | high | goal | nova |
| K27 | Tamna tema — ceo prolaz | Sonnet 5.5 | high | goal | nova |
| K28 | Performanse i pristupačnost | Opus 5.5 | xhigh | goal | nova |
| K29 | Revizija: regresije, bezbednost, AGENTS.md | Opus 5.5 | max | goal | nova |
| K30 | Završni izveštaj i snimci | Opus 5.5 | high | auto | nova |

## 10. Kraj runa

- `docs/IGRA-REPORT.md`: šta je urađeno, šta nije, BLOKADE, šta Jovan ručno proverava i koje slike nedostaju.
- `docs/igra/snimci/`: snimci svih površina na 390 i 1440 px, u obe teme.

## ODLUKE (dopunjuju koraci)
