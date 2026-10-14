# IGRA - napredak

Noćni run IGRA (gejmifikovan izgled posle prijave). Plan: `docs/IGRA-PLAN.md`. Pravila: `.igra-run/rules.md`.
Slike: `docs/igra/SLIKE.md` (status u `public/brand/igra/manifest.json`).

## ODLUKE

### K01 (plan; pun tekst u `docs/igra/planovi/K01.md` §0)
1. `@gsap/react` se uvodi (K02 ga je instalirao; prvi ga koristi K03).
2. Mesto na listi NIJE u `igra:getMyProgress` (do 1.000 dokumenata + reaguje na tuđi XP). Koristi se postojeći `leaderboard.getViewerLeaderboardRow` (panel tek kad se otvori) i `overview.leaderboard` na tabli.
3. `igraSeen` je i trajni dnevnik osvojenog: bedž je otključan ako je u dnevniku ILI ga pravilo trenutno ispunjava.
4. `igra:markSeen` na serveru proverava da je ključ stvarno zarađen.
5. Nijedan bedž nije „uskoro" zbog cene upita; `izazov` je „uskoro" samo dok je fleg `crea_public_gallery` ugašen.
6. `deset-radova` / `sto-radova` broje `profileActivityDays.creaWorks` u prozoru od 400 dana (isto čitanje kao niz).
7. `omiljen` = 10+ glasova „za" na jednoj od poslednjih 20 objavljenih tema autora.
8. `mentor` = 5+ korisnih odgovora ILI bar jedno partnerstvo za učenje.
9. `top-10` traži i ≥ 100 XP te nedelje; gleda tekuću i prethodnu nedelju.
10. Tuđi profil: bedževi samo iz dnevnika i samo javni; Crea grupa uz `reportCardPublic`; `nocna-sova` i `rani-pevac` se drugima ne prikazuju.
11. Filter Sve / Učenje / Crea na rang listi se ne uvodi (nema jeftinog razdvajanja XP-a).
12. Stringovi IGRA-e idu u `lib/igra-copy.ts` (oblik `{ sr, en }`, tipovi iz `lib/i18n`), ne u `lib/i18n.ts`.
13. Krediti nemaju odometar ni slavlje.
14. `identityMerge` se ne dira; redovi `igraSeen` spojenog naloga ostaju siročići.
15. Indeks tabele `igraSeen` se zove `by_user_key`.
16. „Prvi rad svake vrste" u Crei ne ide u `igraSeen` (to već radi `creaMoments.momentForJob`).


## K01 - Arhitektura IGRA (plan)   (2026-10-14 00:33)
**Plan korak.** Plan je upisan u `docs/igra/planovi/K01.md`. Nije menjan kod.

## SLIKE — stanje (Claude, 2026-10-14 00:55)
- Sve slike iz `docs/igra/SLIKE.md` su napravljene: **120/120 `ready: true`** u manifestu (runner ih kopira u `public/brand/igra/` pre svakog koraka).
- TRAŽENE SLIKE iz K01 su gotove: `lik.piksi.radi`, `lik.kadar.radi`, `lik.eho.radi` (sada su u manifestu, pa im ne treba zapis u `IGRA_PLANNED_ART`; ako ga K02 doda, sledeći korak koji dira `lib/igra-art.ts` ga uklanja).
- Scene su ≤ 160 KB, baneri ≤ 110 KB, nalepnice ≤ 80 KB.

## K02 — Temelj: slike, tokeni, IgraArt   (2026-10-14 01:00)
**Fajlovi:**
- novi: `lib/igra-art.ts`, `lib/igra-art.test.ts`, `lib/igra-css.test.ts`, `components/igra/igra-art.tsx`, `components/igra/igra-fallback-icons.ts`, `components/igra/izlog/izlog-slike.tsx`, `app/[locale]/igra-izlog/page.tsx`, `scripts/check-igra-assets.mjs`, `docs/igra/snimci/K02-*.png` (6)
- izmenjeni: `app/globals.css` (tokeni + klase), `package.json` (`check:igra`, `@gsap/react`), `package-lock.json`, `scripts/check-frames.mjs` (`ROOTS`)

**Šta je urađeno:** U `app/globals.css` su IGRA tokeni za obe teme (`--igra-marker`, `-marker-wash`, `-track`, `-sticker-edge`, `-sticker-shadow`, `-stamp`, `-locked-filter`, `-medal-gold|silver|bronze`, `-paper-grain` + `-opacity` / `-blend`), pet boja je dostupno kao Tailwind klase (`bg-igra-marker`, `bg-igra-marker-wash`, `bg-igra-track`, `bg-igra-stamp`, `bg-igra-sticker-edge`), a u `@layer components` su klase `.igra-sticker` (+ `[data-locked="true"]` silueta), `.igra-paper`, `.igra-marker`, `.igra-stamp`, `.igra-tape`. `lib/igra-art.ts` je tipizovan registar nad manifestom (`igraArt`, `igraArtOrNull`, `isIgraArtId`, `igraArtIds`, porodice `igraLikArt` / `igraNivoArt` / `igraBedzArt`, čista logika veličine, alt-a i fallback-a). `<IgraArt>` crta AVIF `<img>` sa `width`/`height` u kutiji fiksnog odnosa strana; kad slika nije spremna, kad je planirana ili kad fajl vrati 404 (i pre hidratacije) crta fallback iste veličine. `npm run check:igra` ispisuje stanje slika koje kod koristi. Napravljen je i minimalni izlog (`/igra-izlog`, deo „slike i tokeni") da bi se prihvatanje proverilo u pregledaču.

**Površine:** nijedna površina aplikacije nije dirana (temelj). Izlog: deo „slike i tokeni" gotov; ljusku izloga, registar delova i ostale delove pravi K05.

**ODLUKE:**
1. **Izlog je započet već u K02** (K01 §7 ga daje K05): bez rute nema gde da se proveri `<IgraArt>` u pregledaču. Ruta ima `notFound()` u produkciji i `noindex`; K05 je proširuje (ne pravi novu).
2. **`app/[locale]/igra-izlog` je u `ROOTS`** (`check:frames`) odmah, jer ruta sada postoji (K01 je to ostavio za K05).
3. **Tekstura papira je `soft-light` u obe teme** (svetla 0,6, tamna 0,35) umesto `multiply` 0,5 iz K01 §1.1: `multiply` je vidno prljao papir (siva umesto krem). Tokeni `--igra-paper-grain-opacity` / `-blend` su ostali.
4. **Fallback ikona se bira kroz komponentu `IgraFallbackIcon`** (`createElement`), jer lint pravilo `react-hooks/static-components` ne dozvoljava komponentu izabranu pozivom funkcije u renderu. Iz istog razloga `IgraArt` nema `useCallback` (React Compiler).
5. **`IgraBedzKey`** je tip izveden iz manifesta (`bedz.<kljuc>` bez prefiksa). K04 ga koristi kao tip ključa bedža ili ga testom veže za svoj katalog.
6. **Bez `size`:** nalepnica je `md` (64 px), scena i baner cela širina roditelja. Scena i baner dobijaju `paper-island` i `overflow-hidden`; radijus bira pozivalac (`surface-card` / `surface-media`).
7. **`check:igra` ne broji registar i mapu fallback ikona kao upotrebu slike** (samo proverava da ID-jevi u njima postoje). Test fajlovi se preskaču.
8. **`IGRA_PLANNED_ART` sadrži `lik.piksi.radi`, `lik.kadar.radi`, `lik.eho.radi`**: manifest u repou ih još nema (107/117), iako su prema belešci iznad već napravljene. Kad runner prekopira manifest, manifest pobeđuje i tri reda mogu da se obrišu (prvi korak koji dira `lib/igra-art.ts`).
9. **Dev server:** `next dev` (Turbopack) na ovoj mašini stane na „Compiling" uz `ERR_SOCKET_BAD_PORT` (zatečeno; `next.config.ts` nije diran). Za vizuelnu proveru radi **`npx next dev --webpack -p 3123`**. `npm run build` nije pogođen.
10. **Playwright MCP** pri svakoj navigaciji ostavlja `page-*.yml` i `console-*.log` u `docs/igra/snimci/`; obrisani su, sledeći koraci treba da urade isto.

**Novi paketi:** `@gsap/react@2.1.2` — GSAP standardna licenca („no charge", nije MIT; unapred dozvoljen u rules.md), 19 KB raspakovano. Još se nigde ne uvozi.

**Testovi:**
- `lib/igra-art.test.ts` (16): svaki red manifesta ima poznatu vrstu, AVIF adresu, dimenzije i alt na oba jezika; prefiks ID-ja odgovara vrsti; `igraArt` vraća red; alt po jeziku; nepoznat ID (i `toString`) nije slika; planirana slika nema fajl; fallback po vrsti; veličine (imenovane, broj, hero, besmislen broj); 7 likova × 4 poze; amblemi 1–12 sa stezanjem; 24 bedža.
- `lib/igra-css.test.ts` (8): svetla tema ima ceo skup tokena; token koji zavisi od teme ima tamnog parnjaka; tamna ne uvodi nov token; žuta markera se ne menja; boje su Tailwind klase; `.igra-*` klasa sa animacijom ili prelazom je samo u `no-preference` bloku; nijedna `.igra-*` klasa ne crta okvir niti uvodi svoj radijus.

**Slike:** izlog prikazuje sve ID-jeve iz manifesta preko `igraArtIds()`; literalno se koriste `lik.robi.mase`, `bedz.prva-lekcija`, `nivo.03` i uzorci fallback-a. TRAŽENE SLIKE: nema novih (tri iz K01 su napravljene).

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran)
- typecheck: prošlo
- lint: prošlo (0 grešaka, 26 zatečenih upozorenja; dve greške iz osnove više se ne javljaju)
- test: prošlo (288 fajlova, 3.126 testova)
- check:frames: prošlo; check:corners i check:white: prošlo
- check:igra: radi; 12 ID-jeva u kodu, 11 spremno, 1 planirana; `--strict` izlaz 0
- build: prošao; `next start` (produkcioni build, port 3124) vraća 404 za `/igra-izlog` i `/en/igra-izlog`, a 200 za `/`; `check:bundle` isti brojevi kao pre (465 / 541 / 130 / 139 KB)
- **napomena o buildu:** od tri pokretanja `npm run build` dva su prošla, a jedno je palo sa `Segmentation fault` (izlaz 139) u fazi „Collecting page data using 15 workers", posle uspešne kompilacije i TypeScript provere. Nema poruke o grešci u kodu i isti kod se odmah potom izgradio; uzrok nije utvrđen (pad Node procesa na ovoj mašini). Ako runner dobije 139 na buildu, prvo ponoviti build.
- pregledač (Playwright, 1440 × 900 i 390 × 844, obe teme, sr i en): 116 slika učitano, nijedna slomljena; kutija spremne i planirane slike su iste (96 × 96); slika čiji `src` vrati 404 prelazi u fallback bez promene veličine, sa `role="img"` i nazivom; nema vodoravnog skrola na 390 px; konzola bez upozorenja o hidrataciji

**Za Jovana ujutru:**
- Pogledaj `docs/igra/snimci/K02-vrh-1440-svetla.png` i `-tamna.png`: da li su jačina teksture papira (namerno jedva vidljiva), nagib pečata i silueta zaključanog bedža po ukusu. Sve tri stvari su po jedan token ili jedna linija u `app/globals.css`.
- `next dev` bez `--webpack` ne radi na ovoj mašini (ODLUKA 9). Nisam dirao `next.config.ts`; ako želiš Turbopack u razvoju, to je posebna odluka.

## K03 — Pokret i 3D temelj   (2026-10-14 01:45)
**Fajlovi:**
- novi (lib): `lib/igra-motion.ts`, `lib/igra-celebrations.ts`, `lib/igra-sound.ts`, `lib/igra-three.ts`, `lib/igra-copy.ts` + testovi `lib/igra-motion.test.ts`, `lib/igra-celebrations.test.ts`, `lib/igra-sound.test.ts`, `lib/igra-three.test.ts`
- novi (pokret): `components/igra/motion/gsap.ts`, `use-count-up.ts`, `use-marker-fill.ts`, `use-stamp-in.ts`, `use-sticker-peel.ts`, `use-enter-stagger.ts`
- novi (slavlje): `components/igra/celebration-host.tsx`, `components/igra/celebration-card.tsx`
- novi (3D): `components/igra/three/igra-three-stage.tsx` (ljuska, bez three), `igra-three-canvas.tsx`, `trophy.tsx`, `medal.tsx`, `toon.tsx`
- novi (izlog): `components/igra/izlog/izlog-pokret.tsx`, `docs/igra/snimci/K03-*.png` (15)
- izmenjeni: `app/[locale]/igra-izlog/page.tsx` (`?deo=pokret` + navigacija delova), `scripts/check-crea-bundle.mjs` (markeri + budžeti), `components/crea/reveal/fire-confetti.ts` (opcioni `zIndex`)

**Šta je urađeno:** `lib/igra-motion.ts` drži trajanja i krive (ulaz i stagger iz `pageMotionContract.standard`), jednu odluku `shouldAnimate({ reduced, inView, hidden })`, lenji `loadIgraPlugin("Flip" | "DrawSVG" | "SplitText")` (dinamički uvoz + `registerPlugin` jednom, na serveru odbija) i `formatOdometer` / `odometerWidthCh` / `odometerCells`. Pet hookova u `components/igra/motion` rade preko `useGSAP` sa čišćenjem i granom za smanjen pokret (krajnje stanje odmah). `lib/igra-celebrations.ts` je čist red slavlja (`planCelebrations`, `createCelebrationQueue`, `celebrationSeenKeys`, `celebrationView`, `celebrationAnnouncement`), a `CelebrationHost` ga crta: uz pokret preklop sa karticom (lik ili scena, pečat, konfete, zvuk ako je uključen, 3D pehar na računaru za nivo i kurs), uz smanjen pokret mirna kartica u uglu; uvek `aria-live` rečenica. 3D pehar i tri medalje su proceduralni (bez GLB-a i tekstura), toon materijal u 3 stepena + ink outline, a `IgraThreeStage` odlučuje 3D ili nalepnica i platno uvozi samo kroz `next/dynamic` (`ssr: false`). Izlog je dobio deo „Pokret i 3D" (`/igra-izlog?deo=pokret`) gde se sve ovo vidi i okida.

**Površine:** nijedna površina aplikacije nije dirana (temelj). `CelebrationHost` još NIJE montiran u ljusci (to radi K06, kad K04 donese `igra:getMyProgress` i `igra:markSeen`). Izlog: deo „pokret i 3D" gotov; ljusku i registar delova pravi K05.

**Kako se koristi (za K04–K06):**
- Ljuska (K06): `<CelebrationHost locale={locale} fresh={progress?.fresh} onSeen={(keys) => void markSeen({ keys })} />`. `fresh` je oblika `IgraProgressFresh` iz `lib/igra-celebrations.ts` (`{ level, badges, courses: [{ key: "course:<id>", title }], ledgerEmpty }`) — K04 neka vrati baš taj oblik (`badges` kao `IgraBedzKey[]`).
- Odometar (K05): element `inline-block tabular-nums` sa jednim tekstualnim detetom, `aria-hidden`, a pored njega `sr-only` krajnja vrednost; `useCountUp(ref, value, { locale })`. Primer: `XpDemo` u `izlog-pokret.tsx`.
- XP traka (K05): `useMarkerFill(fillRef, progress)` na elementu ispune (`block h-full bg-igra-marker` u traci sa `overflow-hidden`).
- Nalepnica (K05): `useStickerPeel(ref)` na dugmetu; pomera se dete `[data-igra-peel]`, sjaj je `[data-igra-shine]` (podrazumevano `opacity-0`, omotač maskiran slikom nalepnice).
- Liste iz Convex-a: `useEnterStagger(listRef, { selector: "li", deps: [rows.length] })`.
- Flip / DrawSVG / SplitText: samo `await loadIgraPlugin("…")`, nikad `import … from "gsap/…"` (test `lib/igra-motion.test.ts` to hvata).
- 3D: `<IgraThreeStage kind="pehar" spin="once" />` ili `kind="medalja" tone="srebro" spin="idle"`; kutija je kvadrat, širina kroz `className`; `allow3d={false}` = uvek nalepnica.

**ODLUKE:**
1. **Domaćin slavlja prima `fresh` i `onSeen` kroz props** (K01 §3.3 ga vezuje za `useIgraProgress()` i `igra.markSeen`, a to dolazi tek u K04/K06). Tako je i prezentacioni, pa radi u izlogu sa test podacima.
2. **Ključ bedža je `IgraBedzKey` iz K02** (K04 ga koristi ili ga testom veže za svoj katalog). `fresh.courses[].key` je ključ dnevnika; ako stigne bez prefiksa, `planCelebrations` dodaje `course:`.
3. **Imena nivoa i bedževa u slavlju dolaze iz alt teksta manifesta** („Nivo 3: Skicar" → „Skicar", „Bedž: Prva lekcija" → „Prva lekcija"), jer katalog (K04) još ne postoji. Oblik „vrsta: ime" čuva test nad svih 36 redova; K04/K05 može da prebaci na katalog, ali ne mora.
4. **`summary` nosi `seenKeys`, a `celebrationSeenKeys(c)` daje ključeve za `markSeen` slavlje po slavlje.** Plan je imao samo `markKeys` na nivou plana; pošto plafon od 3 po sesiji neka slavlja ostavlja za sledeću, upis mora da ide tek kad se svako stvarno prikaže.
5. **Red:** noviji `level` / `badges` / `summary` zamenjuje isti koji još čeka (više nivoa → samo najviši i kad stignu jedan za drugim); ono što čeka ređa se kurs → nivo → bedževi.
6. **`useCountUp` NE postavlja `aria-label`** (K01 §3.2 ga je tražio): `aria-label` na `span` bez uloge je zabranjen atribut (axe `aria-prohibited-attr`). Krajnju vrednost čitaču daje `sr-only` tekst, a cifre u pokretu su `aria-hidden`.
7. **`useCountUp` i `useMarkerFill` rade BEZ `revertOnUpdate`** (K01 §3.2 kaže „svi sa `revertOnUpdate: true`"): sa vraćanjem bi svaka nova vrednost prvo skočila na početno stanje. Ovako nastavljaju od onoga što je na ekranu, i usred animacije. Ostala tri hooka su po planu.
8. **`useStickerPeel`:** `ref` je meta hovera i miruje, pomera se dete `[data-igra-peel]`. Da se pomera sam element pod mišem, na ivici bi pobegao ispod pokazivača i treperio.
9. **`useEnterStagger`:** posmatrač gleda prvu novu stavku (ne koren, da radi i sa `display: contents`), a stavka koja je jednom ušla nosi `data-igra-entered` i ne animira se ponovo (osvežen upit ne trese listu).
10. **`useStampIn` animira GSAP `rotation` −8° → 0**, jer `.igra-stamp` svoj nagib nosi kroz CSS `rotate`; zbir je traženih −14° → −6°. Isto važi šire: Tailwind v4 `translate-*` / `rotate-*` su zasebna CSS svojstva i SABIRAJU se sa GSAP transformom.
11. **Dijalog slavlja:** naziv čine nadnaslov i naslov (`aria-labelledby`), `aria-live` red je stalno montiran van dijaloga (region koji se pojavi zajedno sa tekstom čitači često preskoče). Tekst kartice ulazi kroz `opacity`, ne `autoAlpha`: sa `visibility: hidden` dugme „Nastavi" tiho odbija fokus (uhvaćeno u pregledaču).
12. **`fireConfetti(anchor, big, zIndex?)`:** jedina izmena Crea koda, opcioni treći parametar; postojeći pozivi su isti. Bez njega konfete (z 100) lete ISPOD preklopa slavlja (z 110). Ulaz se uvozi lenjo, pa `canvas-confetti` i `lib/crea-reveal` ne ulaze u početni JS ljuske.
13. **Slavlje čeka** dok je otvoren drugi modal, dok je tab u pozadini i dok traje Crea pečat. Pečat se prepoznaje po postojećoj klasi `.crea-stamp-note` (Crea fajl nije diran); ako K16 hoće čvršću vezu, neka doda `data-` atribut.
14. **3D pehar u slavlju** samo od `lg` i samo za nivo i kraj kursa; na telefonu ga nema (ni kao nalepnice), a u kartici uz smanjen pokret nema ni 3D-a ni konfeta.
15. **Izgled 3D-a:** dve boje (metal + mastilo). Zvezda je u boji mastila i bez outline-a (outline preko izvučene zvezde se lomio), traka medalje je mastilo. Boje se čitaju SA PLATNA, ne sa `<html>`, pa u svetlom ostrvu mastilo ostaje tamno i u tamnoj temi; na tamnoj podlozi outline je svetao (kao krem ivica nalepnice). Svetlo: ambient 0,9 + jedno usmereno 2,2 (da najsvetliji stepen bude tačno boja tokena).
16. **`gradientMap` se pravi po platnu** (K01 §4 kaže „jednom"): svako platno ima svoj WebGL kontekst, pa zajednička tekstura ništa ne štedi. Oslobađa se pri skidanju platna.
17. **Provera „server ili pregledač" je `typeof document`**, ne `typeof window`: u vitest okruženju `edge-runtime` `window` postoji.
18. **Izlog je dobio deo „pokret i 3D" već u K03** (K01 §7 slavlja i 3D daje K05): bez njega prihvatanje ne može da se proveri u pregledaču. K05 ga prenosi u svoj registar.
19. **`check:bundle` markeri za GSAP pluginove su tekst iz koda plugina** (`Not a valid state object.`, `0px, 999999px`, `chars,words,lines`), ne `data-flip-id` / `drawSVG` iz K01 §4, jer te reči pišemo i mi pa bi provera lažno padala. Budžeti: 10 app ruta = merenje pre IGRA-e + 25 KB.
20. **Novi fajlovi van spiska K01:** `lib/igra-three.ts` (čiste odluke za 3D, testirane) i `lib/igra-copy.ts` (stringovi, po ODLUCI K01-12). `lib/igra-art.ts` nisam dirao, pa su tri reda `IGRA_PLANNED_ART` i dalje tu (manifest ih već ima; uklanja ih prvi korak koji dira taj fajl).
21. **Zvuk:** nivo `pojacanje`, bedž / bedževi / zbir `potvrda`, kurs `dzingl-pizzicato` (postojeći CC0 fajlovi, glasnoća 0,4). Adresa se sklapa bez uvoza kataloga zvukova; test je veže za `lib/crea-sfx-library.ts`.

**Novi paketi:** nema (`@gsap/react@2.1.2` iz K02 se sada prvi put uvozi).

**Testovi (4 nova fajla, 61 test):**
- `lib/igra-motion.test.ts` (19): trajanja iz ugovora i u granicama plana; `shouldAnimate`; `loadIgraPlugin` odbija na serveru; `formatOdometer` (sr/en, granice, zaokruživanje, loš ulaz); širina i ćelije odometra; **čitanje izvora**: nigde statički `gsap/*`, three samo u platnu i modelima, do njih samo `next/dynamic` sa `ssr: false`, konfete samo lenjo.
- `lib/igra-celebrations.test.ts` (29): plan (redosled, najviši nivo, grupa od 3+ bedža, zbir pri praznom dnevniku, duplikati, loš nivo, prefiks kursa); red (jedno po jedno, bez ponavljanja ključa, prioritet, zamena nivoa koji čeka, plafon 3, pretplata); poruka za čitač ekrana po vrsti i jeziku; svaka slika prikaza je u manifestu; oblik alt teksta.
- `lib/igra-three.test.ts` (9): uslovi za 3D, petlja crtanja, fallback nalepnice u manifestu, DPR ≤ 1,5, okret staje na punom krugu, ljuljanje ±12°.
- `lib/igra-sound.test.ts` (4): zvuci postoje u katalogu i kratki su, glasnoća, isključeno na serveru.

**Slike:** `scena.nivo-gore`, `scena.kurs-zavrsen`, `lik.robi.slavi`, `rang.pehar`, `rang.zlato|srebro|bronza`, porodice `nivo.*` i `bedz.*`. TRAŽENE SLIKE: nema.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran)
- typecheck: prošlo
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (292 fajla, 3.187 testova)
- check:frames, check:corners, check:white, check:igra: prošlo
- build: prošao iz prvog pokušaja; `next start` (port 3124) vraća 404 za `/igra-izlog`, `/igra-izlog?deo=pokret` i `/en/igra-izlog`, a 200 za `/`
- **check:bundle: prošlo.** three (`THREE.WebGLRenderer`), Flip, DrawSVG, SplitText i `canvas-confetti` su samo u async chunk-ovima; svaki marker je nađen u bar jednom chunk-u.

| Šta (gzip) | Pre (build K02) | Posle K03 | Granica |
|---|---|---|---|
| `/app` početni JS | 268,6 KB | 269,0 KB | 294 |
| `/app/classroom` | 289,9 | 290,3 | 315 |
| `/app/community/leaderboard` | 277,8 | 278,2 | 303 |
| `/app/members/[username]` | 346,2 | 346,7 | 371 |
| Crea radionica `/studio/(shell)/app` | 465,0 | 465,5 | 512 |
| `/app/studio` | 541,1 | 541,5 | 595 |
| IGRA 3D kod (platno + pehar + medalja + outline), async | — | 5,8 KB | 12 |
| GSAP Flip / DrawSVG / SplitText, async | — | 9,0 / 1,9 / 3,2 KB | 12 / 3 / 5 |
| three + fiber + drei (postojeći chunk maskote, isti fajl) | 180,8 KB | 180,8 KB | 0 u početnom |

- **pregledač (Playwright, 1440 × 900 i 390 × 844, obe teme, sr i en), izmereno:**
  - odometar 240 → 1.490 (usred brojanja 947, `min-width: 5ch`), ispuna `scaleX` 0,24 → 0,49; pečat i lista ulaze i čiste svoje stilove; drugi talas liste animira samo nove redove; DrawSVG chunk se skida tek na klik (0 → 1 zahtev)
  - slavlje: otvara se ~0,8 s posle događaja, fokus na „Nastavi", Tab ostaje u dijalogu, Esc / klik na podlogu / Enter zatvaraju, samo se gasi za 2,5 s, fokus se vraća; „tri zaredom" ide kurs → nivo → bedž, jedno po jedno, a `onSeen` stiže redom; zbir upisuje sve ključeve + `summary`; konfete na z 130
  - smanjen pokret: vrednost i ispuna odmah, bez inline stilova na pečatu, listi i nalepnici; slavlje je kartica u uglu (bez dijaloga, konfeta i platna, bez zaključavanja skrola, fokus ostaje gde je bio), dugme „Zatvori" 44 × 44, nestaje za 6,5 s; three se uopšte ne skida
  - 3D: platno se montira tek kad kutija dođe u kadar; medalje crtaju ~60 fps dok su u kadru, **0 crtanja van kadra i u pozadinskom tabu**; pehar posle okreta od 1,4 s staje (0 crtanja); na 390 px nema platna ni zahteva za three, ostaju nalepnice; nema vodoravnog skrola
  - konzola bez grešaka i bez upozorenja o hidrataciji. Jedino upozorenje je `THREE.Clock: This module has been deprecated` iz `@react-three/fiber` 9.7 uz three 0.186 (javlja ga i postojeća maskota; nije naš kod).
- dev server i `next start` su ugašeni; Playwright `page-*.yml` i `console-*.log` su obrisani.

**Za Jovana ujutru:**
- Otvori `/igra-izlog?deo=pokret` (`npx next dev --webpack -p 3123`) i okini slavlja. Proceni da li je **2,5 s** dovoljno da se pročita naslov (trajanje je `IGRA_MOTION.celebrate` u `lib/igra-motion.ts`; plan kaže „≤ 2,5 s", pa nisam išao preko) i da li ti se sviđa raspored: scena u sredini, 3D pehar levo, amblem desno.
- **Zvuk nisam čuo** (Playwright nema zvučni izlaz): proveri glasnoću (0,4) i izbor tri zvuka.
- **Pravi čitač ekrana nisam imao** (NVDA / VoiceOver): provereni su DOM, fokus i `aria-live` tekst, ne sam izgovor.
- 3D pehar i medalje su proceduralni i namerno jednostavni (snimci `K03-3d-1440-svetla.png` / `-tamna.png`). Ako hoćeš bogatiji oblik ili drugu debljinu mastila, to su `PROFILE` u `components/igra/three/trophy.tsx` i `OUTLINE_PX` u `toon.tsx`.
- Dok je slavlje otvoreno strana je zaključana za skrol (isti `useModalFocus` kao svaki `Dialog`); na Windows-u sa klasičnim skrol-barom to pomeri stranu za širinu bara. U Playwright-u bar nema širinu, pa to nisam mogao da izmerim.

## K04 — Napredak: nivoi, bedževi, niz, igraSeen   (2026-10-14 02:10)
**Fajlovi:**
- novi (lib): `lib/igra-level.ts`, `lib/igra-badges.ts`, `lib/igra-time.ts` + testovi `lib/igra-level.test.ts`, `lib/igra-badges.test.ts`, `lib/igra-time.test.ts`
- novi (convex): `convex/igra.ts` (javni API), `convex/igraCore.ts` (čitanja), `convex/igra.test.ts`
- izmenjeni: `convex/schema.ts` (samo nova tabela `igraSeen`), `convex/_generated/api.d.ts` (codegen: moduli `igra`, `igraCore`)

**Šta je urađeno:** `lib/igra-level.ts` drži 12 nivoa (imena sr/en iz plana, pragovi iz K01 §5.2) i `levelFromXp(xp)` → `{ level, name, minXp, nextMinXp, xpIntoLevel, xpForNext, progress }`. `lib/igra-badges.ts` je katalog 24 bedža (grupa, naziv sr/en, tekst uslova, cilj) i čista `evaluateBadges(brojači)`; `lib/igra-time.ts` daje sat u Beogradu za „Noćnu sovu" i „Ranog pevca". Šema je dobila jednu tabelu, `igraSeen` (`userId`, `key`, `seenAt`, indeks `by_user_key`). `igra:getMyProgress({ todayKey })` vraća XP (ukupno i nedeljno), moje mesto na nedeljnoj listi (`weekRank`), nivo, niz dana, svih 24 bedža sa stanjem (`unlocked` / `fresh` / `locked` / `soon`, `unlockedAt`, brojač napretka) i `fresh` (nov nivo, novi bedževi, završeni kursevi, `ledgerEmpty`) u obliku koji `CelebrationHost` iz K03 već prima. `igra:getMemberProgress({ username })` vraća samo ono što je i danas javno na profilu, a `igra:markSeen({ keys })` upisuje u dnevnik samo ono što je server ponovo izračunao kao stvarno zarađeno. Ništa od ovoga ne dodeljuje XP, kredite ni nagrade: jedini upis u celom modulu je red u `igraSeen` (to čuva i test koji čita izvor).

**Površine:** nijedna površina aplikacije nije dirana (podaci). Upite povezuje K05 (fixtures tipizovani preko `FunctionReturnType<typeof api.igra.getMyProgress>`) i K06 (ljuska, `CelebrationHost` + `markSeen`).

**Kako se koristi (za K05, K06, K13):**
- Ljuska: `useQuery(api.igra.getMyProgress, { todayKey })` sa `useBelgradeToday()`; gost dobija `null`. `progress.level` je ceo `levelFromXp` (ime nivoa je u odgovoru), `progress.streak` je `StreakSummary` iz `lib/crea-streak`.
- Slavlje: `<CelebrationHost fresh={progress.fresh} onSeen={(keys) => void markSeen({ keys })} />`. Oblik `fresh` se slaže sa `IgraProgressFresh` (proverava ga typecheck u `convex/igra.test.ts`).
- Polica bedževa: `progress.badges` je uvek 24, redom iz kataloga; naziv, grupa i tekst uslova su u `igraBadge(key)` (`lib/igra-badges.ts`), a „uskoro" bedž uslov ne prikazuje.
- Mesto na nedeljnoj listi: `progress.weekRank` (`number | null`), isto brojanje kao rang-lista (isti XP deli mesto). `null` znači: osoblje, 0 XP ove nedelje ili više od 100 redova ispred. Ceo red (ime, avatar, mesto dalje od 100, period „ukupno") i dalje daje postojeći `api.leaderboard.getViewerLeaderboardRow`.
- Tuđi profil: `api.igra.getMemberProgress({ username })` → `{ xp, level, banner, badges: [{ key, state: "unlocked" | "locked" | "hidden" }] }`.

### Pragovi nivoa (`lib/igra-level.ts`)
| Nivo | Ime (sr / en) | Prag XP | Korak do sledećeg |
|---|---|---|---|
| 1 | Početnik / Beginner | 0 | 100 |
| 2 | Radoznalac / Curious | 100 | 200 |
| 3 | Skicar / Sketcher | 300 | 400 |
| 4 | Istraživač / Explorer | 700 | 700 |
| 5 | Graditelj / Builder | 1.400 | 1.000 |
| 6 | Pronalazač / Inventor | 2.400 | 1.400 |
| 7 | Kreator / Creator | 3.800 | 1.800 |
| 8 | Majstor / Master | 5.600 | 2.400 |
| 9 | Vizionar / Visionary | 8.000 | 3.000 |
| 10 | Mentor / Mentor | 11.000 | 4.000 |
| 11 | Šampion / Champion | 15.000 | 5.000 |
| 12 | Legenda / Legend | 20.000 | — |

Prag pripada višem nivou (99 XP = nivo 1, 100 XP = nivo 2). Na nivou 12 je `progress = 1`, `xpForNext = null`. Test nad uvezenim `LEADERBOARD_XP`: prva lekcija = nivo 2; tipičan prvi dan (260 XP) = nivo 2; redovna nedelja = 655 XP; dve nedelje + prvi radovi (1.400 XP) = nivo 5; nivo 12 traži bar 26 redovnih nedelja. Serverski `levelForXp` (500 XP po nivou) i `LEADERBOARD_XP` nisu dirani.

### Pravila bedževa (`lib/igra-badges.ts` + čitanja u `convex/igraCore.ts`)
| Bedž | Uslov (tekst, sr) | Pravilo | Čitanje (indeks · limit) |
|---|---|---|---|
| `prva-lekcija` | Završi prvu lekciju | `completedLessons ≥ 1` | `leaderboardStats` global / ukupno, `.unique()` (isti red kao XP) |
| `prvi-zadatak` | Uradi prvi obavezan zadatak | `completedTasks ≥ 1` | isti red |
| `pet-lekcija` | Završi 5 lekcija | `completedLessons ≥ 5` | isti red |
| `prvi-kurs` | Završi ceo kurs | završenih kurseva ≥ 1 | `courses.by_status` (`published`) `take(60)` + po kursu `leaderboardStats` `course:<id>` / ukupno `.unique()`; završen ⇔ `publishedLessonCount > 0` i `completedLessons ≥ publishedLessonCount` |
| `tri-kursa` | Završi 3 kursa | završenih kurseva ≥ 3 | isto čitanje |
| `staza` | Završi sve kurseve jedne staze | svi objavljeni kursevi neke staze su završeni | isto čitanje (0 dodatnih) |
| `nocna-sova` | Završi lekciju posle 22 h | aktivan događaj `lesson` sa satom ≥ 22 ili < 4 (Beograd) | `leaderboardEvents.by_userId_and_sourceType_and_sourceId` `take(250)` |
| `rani-pevac` | Završi lekciju pre 8 h | sat u [5, 8) | isto čitanje |
| `prvi-rad` | Napravi prvi rad u Crei | postoji `crea_first_work` | isti indeks, `take(3)` (`sourceId` = oblast) |
| `prvi-video` | Napravi prvi video | `crea_first_work` sa `sourceId = "video"` | isto čitanje |
| `prvi-zvuk` | Napravi prvi zvuk | `sourceId = "zvuk"` | isto čitanje |
| `deset-radova` | Napravi 10 radova u Crei | Σ `creaWorks` ≥ 10 u prozoru od 400 dana | `profileActivityDays.by_userId_and_dayKey` `take(401)` (isto čitanje kao niz) |
| `sto-radova` | Napravi 100 radova u Crei | Σ `creaWorks` ≥ 100 | isto čitanje |
| `recept` | Napravi rad po receptu | sličica `prvi:recept` | `creaStickers.by_userId_and_stickerId` `.unique()` |
| `tehnika` | Isprobaj novu tehniku u Crei | postoji `crea_technique` | `leaderboardEvents` `take(1)` |
| `izazov` | Učestvuj u dnevnom izazovu | aktivan `crea_challenge`; **„uskoro"** dok je fleg `crea_public_gallery` ugašen | `platformFlags.by_key` + `leaderboardEvents` `take(20)` |
| `prva-objava` | Objavi prvu temu u zajednici | postoji tema | `profileContributions.by_userId_and_hasThread_and_lastActivityAt` `take(1)` |
| `koristan-odgovor` | Napiši odgovor koji je označen kao koristan | `helpfulAnswers ≥ 1` | red rang-liste (0 dodatnih) |
| `omiljen` | Skupi 10 glasova na jednoj temi | `upvoteCount ≥ 10` na jednoj od poslednjih 20 objavljenih tema | `communityPosts.by_authorId_and_status_and_updatedAt` `desc` `take(20)` |
| `mentor` | Daj 5 korisnih odgovora ili uči sa partnerom za učenje | `helpfulAnswers ≥ 5` ILI bar jedno partnerstvo | red rang-liste + `studyPartnershipMembers.by_userId_and_createdAt` `take(1)` |
| `niz-3` / `niz-7` / `niz-30` | Uči ili stvaraj N dana zaredom | `computeStreak(...).best ≥ N` | isto čitanje kao niz |
| `top-10` | Uđi u prvih 10 na nedeljnoj listi | ulazi u rang-liste, ≥ 100 XP te nedelje i manje od 10 redova sa više XP-a (ova ili prošla nedelja) | ova nedelja: isto čitanje kao `weekRank` (`by_scopeKey_and_period_and_periodKey_and_eligible_and_xp` sa `.gt("xp", moj)` `take(100)`); prošla: nedeljni red `.unique()` + isti indeks `take(10)` |

- **Stanja:** `unlocked` = ključ `badge:<kljuc>` je u dnevniku (`unlockedAt` = kada je viđen); `fresh` = pravilo je ispunjeno, a nije u dnevniku (ovo se slavi); `locked` = sa `progress { current, target }` za bedževe koji se broje (9 od 24); `soon` = izvor ne radi (samo `izazov`).
- **Kapija:** pravilo čiji su svi bedževi već u dnevniku se ne čita. Bedž iz dnevnika ostaje i kad pravilo prestane da važi (top 10, vraćena lekcija).
- **Cena `getMyProgress`:** nov korisnik oko 5 dokumenata; najgori slučaj oko 1.100 malih dokumenata (150 dnevnik + 401 dan + 60 kurseva + 60 brojača + 250 događaja + 100 redova liste + ostalo). Nigde `.collect()`, `.paginate()` ni `for await` (čuva test).
- **Dnevnik (`igraSeen`):** ključevi `level:<n>`, `badge:<kljuc>`, `course:<courseId>`, `summary`.

**ODLUKE:**
1. **Mesto na nedeljnoj listi JESTE u `getMyProgress` (`weekRank`), ali kao ograničeno čitanje.** Zadatak K04 ga traži, a K01 ODLUKA 2 ga je izbacila zbog cene (do 1.000 dokumenata i ponovno izvršavanje na svaki tuđi XP). Rešenje drži obe strane: čita se najviše 100 redova neposredno ispred korisnika, i to isto čitanje koje već treba bedžu „Top 10". Do 100. mesta broj je tačan i isti kao na rang-listi (test ga poredi sa `leaderboard.getViewerLeaderboardRow` na 10. i 100. mestu); dalje je `null`, dok rang-lista i dalje kaže 101. Posledica koju K01 pominje ostaje, samo manja: upit se ponovo izvršava kad se promeni XP nekome od tih (najviše 100) redova ispred. Ako to na produkciji bude skupo, `RANK_LIMIT` u `convex/igraCore.ts` je jedna konstanta.
2. **Nijedan bedž nije „uskoro" zbog cene čitanja** (K01-5); jedini „uskoro" je `izazov` dok je fleg galerije ugašen. Dok je ugašen, događaji izazova se ne čitaju.
3. **Završeni kursevi se čitaju drugačije nego u K01 §5.3:** objavljeni kursevi (`take(60)`) pa po jedan red brojača za svaki, umesto `take(300)` po opsegu `course:` korisnika. Taj opseg hvata i nedeljne redove (10 kurseva × 30 nedelja prelazi 300), pa bi kursevi sa kasnijim ID-jem tiho ispadali. Pravilo je isto; staza se računa iz istog čitanja. Preskače se dok korisnik nema nijednu završenu lekciju.
4. **Kurs bez objavljenih lekcija ili bez popunjenog `publishedLessonCount` nije „završen"** i zato drži „Celu stazu" svoje staze zaključanom (strogo po K01). Arhiviran kurs se ne gleda; ono što je već u dnevniku ostaje.
5. **`izazov` gleda do 20 događaja** (K01: 3), da jedna skinuta prijava ne sakrije odobrenu.
6. **`banner` je za sada uvek `null`** (i u `getMemberProgress`): polje `users.igraBanner` i `igra:setBanner` pravi K13. Šema je dobila samo `igraSeen`.
7. **`getMyProgress` ne zove `streakFor`** nego radi isto čitanje i `computeStreak` direktno, jer isti redovi daju i zbir radova (jedno čitanje umesto dva). `creaGameCore.ts` nije diran.
8. **`getMemberProgress` traži prijavu preko `requireUserId`** (K01 pominje `getCurrentProfile`; isto ponašanje, jedno čitanje manje). Vlasnik na sopstvenom profilu nema skrivenih bedževa. `unlockedAt` se drugima ne šalje (to je trenutak kada je vlasnik otvorio aplikaciju).
9. **Ključ bedža je `IgraBadgeKey` iz kataloga**, a test ga tipom (u oba smera) i slikom veže za `IgraBedzKey` iz manifesta. `lib/igra-badges.ts` namerno ne uvozi `lib/igra-art.ts`, da manifest slika ne uđe u Convex bundle.
10. **`markSeen`:** `todayKey` računa server; preko 40 ključeva se odseca (bez greške); nepoznat ili nezarađen ključ se tiho preskače; `summary` se uvek prihvata (samo gasi zbir prvog kontakta).
11. **Tekstovi uslova** su rodno neutralni i bez nagrade i straha („Uči ili stvaraj 7 dana zaredom"), a „Mentor" navodi oba puta. Nazivi su isti kao alt tekstovi u manifestu (čuva test), pa se slavlje iz K03 i katalog ne mogu razići.
12. **Nije pušteno na DEV** (`npx convex dev --once`): korak traži samo codegen. Pre prve provere ljuske na pravom nalogu (K06) treba ga pustiti, inače `igra:*` ne postoji na DEV-u.
13. `IGRA_PLANNED_ART` i dalje ima tri reda (`lib/igra-art.ts` nisam dirao).

**Novi paketi:** nema.

**Testovi (4 nova fajla, 61 test):**
- `lib/igra-level.test.ts` (12): 12 nivoa, pragovi i koraci strogo rastu, imena jednaka amblemima u manifestu, granice svakog praga, napredak u [0, 1), poslednji nivo, loš ulaz, scenariji „prvi dan" i „14 dana" iz `LEADERBOARD_XP`.
- `lib/igra-badges.test.ts` (20): 24 jedinstvena ključa po 8 u grupi, redosled iz `SLIKE.md`, slika i ime u manifestu, uslov na oba jezika, bez reči nagrade i straha, granica svakog pravila, „uskoro", brojači napretka, loš brojač.
- `lib/igra-time.test.ts` (8): sat u Beogradu zimi i leti, ponoć, oba prelaska letnjeg vremena, pragovi 21:59 / 22:00, 03:59 / 04:00, 04:59 / 05:00, 07:59 / 08:00.
- `convex/igra.test.ts` (21, convex-test): gost i neispravan dan; prazan korisnik; **aktivan korisnik kroz prave mutacije** (`courses.markProgress`, `studio.finalizeOutput`): 540 XP, nivo 3, niz 3, osam svežih bedževa, dva završena kursa, zbir prvog kontakta iz `planCelebrations`, pa drugi talas (treći kurs, nivo 4); granice nivoa i viđen nivo; **niz preko ponoći u Beogradu** (23:30 i 00:30 su isti dan po UTC-u, a dva dana niza); Crea bedževi; izazov i fleg; zajednica (nacrt se ne računa, 9 / 10 glasova, 5 korisnih odgovora, partner); top 10 sa 12 korisnika (izjednačen XP, osoblje, prag 100 XP, prošla nedelja); mesto na nedeljnoj listi (1, 2, 10, 11, 100. mesto, `null` posle 100 redova, isto kao postojeća rang-lista); `markSeen` (prijava, samo zarađeno, jednom, samo svoje, bedž ostaje, 40 ključeva); `getMemberProgress` (prijava, nepostojeći i spojen nalog, samo dnevnik, skrivena Crea grupa i vreme učenja, vlasnik, osoblje); tri provere izvora (bez kredita i XP-a, jedini upis `igraSeen`, nijedno neograničeno čitanje).

**Slike:** nema novih u kodu; katalog se oslanja na `bedz.*` (24) i `nivo.*` (12) iz manifesta. TRAŽENE SLIKE: nema.

**Rezultat provere:**
- codegen: prošlo (`api.d.ts` +4 linije)
- typecheck: prošlo
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (296 fajlova, 3.248 testova)
- check:frames: prošlo; check:igra: prošlo
- build i pregledač: nisu pokretani (korak ne menja UI ni rute)
- dev server: nijedan nije pokretan u ovom koraku. Provereni su svi `node` procesi (7: Playwright MCP, Penpot MCP i Adobe; nijedan `next` ni `convex dev`) i portovi 3000–3999 (ništa ne sluša)

**Prihvatanje (K04):**
- `getMyProgress` vraća sve što treba primitivima i ljusci, uz test sa realnim podacima: **ispunjeno** (test „aktivan korisnik" ide kroz `courses.markProgress` i `studio.finalizeOutput`). U odgovoru su XP (ukupno i nedeljno), nivo, niz, bedževi sa `unlockedAt`, mesto na nedeljnoj listi (`weekRank`, ODLUKA 1) i `fresh`.
- Nema promene `LEADERBOARD_XP`, kredita ni cena: **ispunjeno** (`git status`: izmenjeni su samo `convex/schema.ts`, `convex/_generated/api.d.ts` i ovaj fajl; ostalo su novi fajlovi).
- typecheck / lint / test prolaze, sekcija K04 sa tabelom pragova i pravilima bedževa: **ispunjeno**.

**Za Jovana ujutru:**
- **„Top 10" na maloj listi:** dok te nedelje manje od 10 učenika ima više XP-a, bedž dobija svako sa 100 XP nedeljno, dakle uz prvu lekciju. To je pravilo iz K01 (ODLUKA 9). Ako treba da bude ređi, menja se `TOP10_MIN_WEEK_XP` u `lib/igra-badges.ts` (jedna konstanta).
- **Prvo otvaranje posle uvođenja:** postojeći korisnici imaju prazan dnevnik, pa dobijaju jedan zbir („Tvoj napredak do sada") umesto niza slavlja. Tek kad ga vide, bedževi postaju vidljivi drugima na profilu.
- **Staza:** proveri da li na produkciji ima objavljenih kurseva bez lekcija ili bez `publishedLessonCount` (migracija `backfillPublishedLessonCount`); takav kurs drži bedž „Cela staza" zaključanim (ODLUKA 4).
- **„10 / 100 radova"** broji radove iz poslednjih 400 dana (K01-6), ne od početka; tekst uslova to ne pominje.
- Pragovi nivoa su jedan niz u `lib/igra-level.ts`; ako ih menjaš, test sa scenarijima („prvi dan = nivo 2", „dve nedelje = nivo 5") će reći da li kriva i dalje drži.
