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

## K05 — Gejmifikovani primitivi + izlog   (2026-10-14 02:50)
**Fajlovi:**
- novi (primitivi): `components/igra/xp-bar.tsx`, `level-stamp.tsx`, `badge-sticker.tsx`, `streak-flame.tsx`, `rank-chip.tsx`, `odometer.tsx`, `daily-mission.tsx`, `trophy-shelf.tsx`, `progress-card.tsx`, `igra-lik.tsx`, `igra-skeleton.tsx`
- novi (lib): `lib/igra-a11y.ts`, `lib/igra-fixtures.ts` + testovi `lib/igra-a11y.test.ts`, `lib/igra-fixtures.test.ts`, `lib/igra-izlog.test.ts`
- novi (izlog): `components/igra/izlog/izlog-primitivi.tsx`, `izlog-kit.tsx`, `registry.ts`, `docs/igra/snimci/K05-*.png` (10)
- izmenjeni: `app/[locale]/igra-izlog/page.tsx` (čita registar, `?stanje=`), `components/igra/izlog/izlog-pokret.tsx` (izvozi `IzlogSlavlja` i `Izlog3d`, sadržaj isti), `components/igra/motion/use-count-up.ts` (ODLUKA 14), `lib/igra-copy.ts` (`IGRA_PRIMITIVE_COPY`, `IGRA_DAY_FORMS`)

**Šta je urađeno:** Napravljeno je svih deset primitiva iz zadatka kao prezentacione komponente (podaci samo kroz props, bez upita): XP traka, pečat nivoa, nalepnica bedža, plamen niza, rang čip, odometar, misija dana, trofejna polica, kartica napretka i lik. Svaki ima stanje „učitava se" (skelet iste veličine), prazno stanje sa pozivom na prvi korak, granu za smanjen pokret (vrednost odmah) i radi u obe teme i na 390 px. Sav tekst i a11y atributi su čiste funkcije u `lib/igra-a11y.ts` (formatiranje XP-a i nivoa, natpis i `aria-*` trake, četiri stanja bedža, plamen, rang, redosled police), pa ih pokriva vitest. `lib/igra-fixtures.ts` daje tri korisnika (novi, aktivan, legenda) tipizovana odgovorom `igra:getMyProgress`; nivo, niz i bedževe računaju iste čiste funkcije kao server. Izlog je dobio registar delova i deo „Primitivi" (`/igra-izlog?deo=primitivi&stanje=novi|aktivan|legenda`): sekcija po primitivu sa svim stanjima i veličinama, a na dnu dugmad za slavlja i 3D pehar.

**Površine:** nijedna površina aplikacije nije dirana. Izlog: delovi „slike", „pokret" i „primitivi" gotovi; delove površina dodaju K06–K24 (jedan fajl `izlog-<deo>.tsx` + jedan red u `registry.ts`).

**Kako se koristi (za K06 i dalje):**
- Sve prima `locale`; dok upit ne stigne: `<ProgressCard loading locale={locale} />`, kad stigne `<ProgressCard progress={progress} locale={locale} />` (isto `loading` važi za svaki primitiv; tip `Loadable` u `igra-skeleton.tsx`).
- `<XpBar xp={progress.xp} size="sm|md|lg" />` (nivo i procenat računa sam; `sm` je bez natpisa), `<Odometer value={n} size="hero|lg|md" suffix="XP" />`, `<LevelStamp level={n} size="xs|sm|md|lg" showName stampKey={…} />`, `<StreakFlame current todayDone size="sm|md|lg" />`, `<RankChip rank={progress.weekRank} size="sm|md" />`.
- `<TrophyShelf badges={progress.badges} />` je red od 3 (novi, poslednji osvojeni, sledeći ciljevi), `variant="grid"` su sva 24 po grupama; `moreHref` dodaje link „Svi bedževi".
- `<DailyMission mission={{ title, body, cta, href, lik, poza }} />`; `href` je već provučen kroz `withLocale`, `mission={null}` je mirno stanje bez dugmeta.
- `<IgraLik lik="robi" poza="mase" bubble="…" locale={locale} />` (ili `decorative`).
- Sekcije izloga za gotove kartice: `IzlogSection` / `IzlogDemo` iz `izlog-kit.tsx` (bez okvira, jer kartice nose svoj).

**ODLUKE:**
1. **Napravljeno je tačno deset primitiva iz zadatka K05.** K01 §6 nabraja i `LevelRing`, `InkCalendar`, `IgraState` i `IgraHero`; zadatak ih ne traži, pa ih pravi korak koji ih prvi koristi (K06 `LevelRing`, K08 `IgraHero` i `InkCalendar`, K23 `IgraState`).
2. **`lib/igra-a11y.ts` drži sve što primitivi kažu i prikazuju**, ne samo a11y: formatiranje XP-a i nivoa, tekst stanja, `aria-*` atribute i redosled police. Jedan fajl, jedan test.
3. **`aria-valuenow` XP trake je procenat 0–100 kroz tekući nivo (zaokružen nadole), a XP je u `aria-valuetext`** („Nivo 5, 490 od 1.000 XP"). Tako poslednji nivo nema `valuemax` nula; pred sam prag traka ne kaže „100".
4. **Učitavanje:** list-primitivi su tihi (`aria-busy`, skelet `aria-hidden`), a kartica napretka, polica i misija imaju po jedan `role="status"` („Učitava se"), da ugnježđeni primitivi ne najavljuju isto više puta.
5. **Nalepnica bedža je dugme sa oblačićem** (miš, fokus, dodir; Esc i dodir pored zatvaraju; uz ivicu ekrana se pomeri da ostane ceo). Ceo tekst je u `aria-label` („naziv — uslov, 3 od 5"), pa je oblačić `aria-hidden`. Stanje `hidden` iz K01 nije uvedeno: `getMyProgress` ga ne vraća, treba tek tuđem profilu (K13).
6. **Broj na pečatu nivoa je krug mastila, ne žut** (žuto je nagrada, K01 §1.4) i crta se samo preko slike (`group-has-[img]`): fallback amblema već nosi broj u krugu.
7. **`StreakFlame` nema `freezes`** (K01 ga nabraja, zadatak ne). „Tinja" je ista nalepnica sa smanjenom zasićenošću i providnošću; nema petlje ni treperenja.
8. **Rang čip:** žuto je samo prvo mesto; drugo i treće imaju medalju na mirnoj podlozi. Bez mesta je crta i naziv „Još bez mesta na listi".
9. **Misija dana:** naslov je `<p>` (kao `EmptyState`), jer kartica staje na razne dubine naslova. Nema XP-a, roka ni brojača (O9).
10. **Trofejna polica:** red nikad nije prazan (nov korisnik vidi siluete prvih bedževa i poziv); nema `groupFilter`; red se prelama umesto da skroluje, jer bi `overflow` odsekao oblačić.
11. **`ProgressCard` prima `{ xp, streak }`**, ne ceo odgovor upita, i nivo računa iz XP-a. Mesto na listi nije u kartici (zadatak: nivo + XP + niz).
12. **Ljuska izloga je ostala u `page.tsx`** (K01 predviđa `izlog-shell.tsx`): zaglavlje i navigacija su dvadesetak linija, a stranica sada čita `registry.ts`. Podrazumevani deo je i dalje „slike", podrazumevani korisnik „aktivan".
13. **Slavlja i 3D nisu posebni delovi izloga** (K01 §7 ima `slavlja` i `3d`): K03 ih već drži u delu „pokret", a deo „primitivi" ih ponavlja na dnu istim komponentama (`IzlogSlavlja`, `Izlog3d`), bez dupliranja koda.
14. **Izmenjen `use-count-up.ts` iz K03:** širina broja se sada meri (početni i krajnji tekst) umesto procene u `ch`, a `min-width` se skida kad brojanje stane. Procena je ostavljala vidljivu prazninu između broja i jedinice („1.890  XP"), jer separator hiljada nije širok kao cifra. `odometerWidthCh` ostaje u `lib/igra-motion.ts` (koristi ga `odometerCells`).
15. **Test podaci su tri korisnika i tri misije.** `fixtureLeaderboard`, kursevi, profil i obaveštenja iz K01 §7 dodaju koraci tih površina. „Danas" test podataka je fiksno 2026-10-14.
16. **„Bez slika" nema prekidač u izlogu:** provereno je u Playwright-u blokiranjem svih zahteva ka `/brand/igra/**` (prava 404 putanja kroz `onError`), uz dva snimka.
17. **Tekstovi:** stalne fraze su u `lib/igra-copy.ts` (`IGRA_PRIMITIVE_COPY`), rečenice sa brojevima sklapa `lib/igra-a11y.ts`. Tekstovi samog izloga idu kroz `t()` kao u K02 i K03.
18. `IGRA_PLANNED_ART` i dalje ima tri reda (`lib/igra-art.ts` nisam dirao); manifest ih već ima (120/120).

**Novi paketi:** nema.

**Testovi (3 nova fajla, 46 testova):**
- `lib/igra-a11y.test.ts` (31): XP sa separatorom po jeziku i loš ulaz; stezanje nivoa na 1–12; naziv nivoa; natpis i razlomak trake; `role`, `aria-label`, `aria-valuemin/max/now/valuetext` (granice 99 → 100, 19.999, poslednji nivo, loš XP); četiri stanja bedža (naziv, silueta, sjaj, etiketa, napredak sa stezanjem, „uskoro" bez uslova) i svih 24 bedža × 4 stanja × 2 jezika; redosled i `max` police, zbir; plamen (gori / tinja / prazno, množina dana, bez reči pretnje); rang (medalje, separator, bez mesta).
- `lib/igra-fixtures.test.ts` (7): oblik odgovora `igra:getMyProgress`, nivo jednak `levelFromXp`, 24 bedža redom, slaganje stanja i polja, novi / aktivan (sva četiri stanja bedža, niz 6 i najduži 9) / legenda, slavlja iz `planCelebrations`, misije sa slikom lika.
- `lib/igra-izlog.test.ts` (8, čitanje izvora): `notFound()` u produkciji pre prvog `await`, `noindex`, izlog nije u sitemap-u, jedinstveni delovi sa svojim fajlom, izlog ne zove Convex; primitivi postoje, nemaju upite ni test podatke, slike idu samo kroz `IgraArt`, bez forsiranog radijusa i golog hex-a.

**Slike:** `rang.plamen`, `rang.zlato`, `rang.srebro`, `rang.bronza`, porodice `nivo.*` (12), `bedz.*` (24) i `lik.*` (28 u izlogu). TRAŽENE SLIKE: nema.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran)
- typecheck: prošlo (i posle build-a)
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (299 fajlova, 3.294 testa)
- check:frames, check:corners, check:white, check:igra: prošlo (19 ID-jeva u kodu, svi spremni)
- build: prošao iz prvog pokušaja; `next start` (port 3124) vraća **404** za `/igra-izlog`, `/igra-izlog?deo=primitivi`, `…&stanje=legenda`, `/en/igra-izlog` i `/en/igra-izlog?deo=pokret`, a 200 za `/`; `sitemap.xml` ne sadrži `igra-izlog`
- check:bundle: prošlo, brojevi isti kao posle K03 (`/app` 269, učionica 290, rang lista 278, profil člana 347, Crea 466 / 542 KB)
- **pregledač (Playwright, 1440 × 900 i 390 × 844, obe teme, sr i en), izmereno:**
  - 110 slika u delu „primitivi", nijedna slomljena; nema vodoravnog skrola ni na jednoj širini i temi; konzola bez grešaka, a upozorenja na pregledanom učitavanju (1440, svetla) su samo zatečeno `THREE.Clock`
  - kartica aktivnog korisnika: „1.890 XP", traka `aria-valuenow="49"`, `aria-valuetext="Nivo 5, 490 od 1.000 XP"`, ispuna `scaleX(0.49)`; posle „+100 XP" 1.990 i 59; odometar posle brojanja nema `min-width`
  - novi korisnik: 0 XP, prazna traka, „0 dana" sa pozivom, polica sa tri siluete i „Prvi bedž stiže uz prvu lekciju."; legenda: puna traka, `aria-valuenow="100"`, „Najviši nivo", 24 / 24
  - oblačić bedža: otvara se na miš i fokus, Esc ga zatvara; na 390 px uz levu ivicu stoji na 8 px, uz desnu na 382 od 390 px; dodir pored ga zatvara
  - smanjen pokret: broj i ispuna odmah na vrednosti (i posle „+100 XP"), pečat bez inline stilova, skelet ne pulsira
  - bez slika (svi zahtevi blokirani): 0 `<img>`, 110 od 110 fallback-a, ista visina kartice (148 px) i cele strane (5.909 px) kao sa slikama
  - tamna tema, kontrast na kartici: natpisi 6,78:1, ime nivoa i broj na pečatu 12,62:1
  - mete: interaktivni delovi primitiva (nalepnica bedža, link police, dugme misije) imaju ≥ 44 px po klasama (`size-11`, `min-h-11`); merenje u pregledaču sa pragom od 40 px našlo je ispod praga samo zatečeni prekidač teme (36 × 36)
  - delovi „slike" i „pokret" rade kao pre; nepoznat `?deo=` pada na „slike"; slavlje iz dela „primitivi" se otvara i zatvara na Esc, četiri 3D platna na računaru
- dev server i `next start` su ugašeni (portovi 3000–3999 slobodni); Playwright `page-*.yml` i `console-*.log` su obrisani.

**Prihvatanje (K05):**
- Izlog radi lokalno, a u produkcionom buildu vraća 404: **ispunjeno**.
- Svi primitivi imaju stanja iz tačke 1 i rade bez slika i sa slikama: **ispunjeno** (snimci `K05-primitivi-*`, uključujući `-bez-slika-*` i `-smanjen-pokret-*`).
- typecheck / lint / test / check:frames prolaze, sekcija K05 u progress-u: **ispunjeno**.

**Za Jovana ujutru:**
- Otvori `/igra-izlog?deo=primitivi` (`npx next dev --webpack -p 3123`) i prođi sva tri test korisnika. Proceni raspored kartice napretka (pečat levo, XP u sredini, plamen desno) i da li je silueta zaključanog bedža dovoljno vidljiva (to je token `--igra-locked-filter` iz K02).
- **Tekstovi za ton:** „Jedna lekcija ili rad i plamen gori.", „Jedna lekcija ili rad i niz počinje.", „Završi prvu lekciju i kreni ka nivou 2.", „Za danas je sve na mestu". Svi su u `IGRA_PRIMITIVE_COPY` (`lib/igra-copy.ts`).
- **Dodir na pravom telefonu nisam imao:** oblačić bedža je proveren na širini 390 px mišem i tastaturom. Na iPhone-u proveri da dodir na nalepnicu otvara oblačić, a dodir pored ga zatvara.
- **Pravi čitač ekrana nisam imao:** provereni su DOM i atributi, ne izgovor.
- Prekidač teme u izlogu je 36 × 36 px (zatečena komponenta `ThemeToggle`, nisam je dirao).

## K06 — Ljuska aplikacije i „Moj napredak"   (2026-10-14 03:35)
**Fajlovi:**
- novi (lib): `lib/igra-shell.ts`, `lib/igra-shell.test.ts`, `lib/igra-badge-view.ts` (izdvojeno iz `igra-a11y`, ODLUKA 12)
- novi (komponente): `components/igra/level-ring.tsx`, `shell-progress.tsx`, `progress-panel.tsx`, `igra-progress-context.tsx`, `igra-progress-provider.tsx`
- novi (izlog): `components/igra/izlog/izlog-ljuska.tsx`, `docs/igra/snimci/K06-*.png` (18)
- izmenjeni (ljuska): `components/app/app-shell.tsx` (provider), `components/app/app-sidebar.tsx` (čip, red, krug u rail-u, prsten oko avatara; `AppSidebarContent` je izvezen), `components/app/app-account-menu.tsx` (red „Moj napredak")
- izmenjeni (ostalo): `lib/igra-copy.ts` (`IGRA_SHELL_COPY`), `lib/igra-a11y.ts` + `lib/igra-a11y.test.ts` (bedževi izdvojeni, samo uvozi), `components/igra/badge-sticker.tsx` (oblačić u dijalogu + uvoz), `components/igra/trophy-shelf.tsx` (uvoz), `components/igra/izlog/registry.ts`, `lib/igra-izlog.test.ts` (deo „ljuska")

**Šta je urađeno:** Napredak je vidljiv na svakoj strani posle prijave. U proširenom sidebaru je red od 48 px (pečat nivoa sa prstenom, ime nivoa, plamen niza, XP traka sa „490 / 1.000 XP"), u skupljenom isti pečat kao krug na istom mestu, a na telefonu čip u zaglavlju; avatar u kartici profila i u rail-u ima prsten nivoa (SVG u kodu). Sve to je jedno dugme koje otvara panel „Moj napredak" (`Dialog align="sheet"`: list na telefonu, dijalog na računaru): amblem i ime nivoa, ukupan XP kao odometar, traka do sledećeg nivoa, plamen sa poslednjih 14 dana i najdužim nizom, poslednja tri bedža, mesto na nedeljnoj listi i XP nedelje, linkovi na profil i rang listu. `IgraProgressProvider` u `AppShell` drži JEDAN upit `igra:getMyProgress` za celu ljusku i montira domaćina slavlja: novo neviđeno (nivo, bedž, kurs) se slavi jednom, jedno po jedno, i u trenutku prikaza zove `igra:markSeen`. Ljuska ne učitava nijednu sliku; slavlje i panel se učitavaju lenjo. Donji meni na telefonu nije diran (4 slota). Izlog je dobio deo „Ljuska aplikacije" (`/igra-izlog?deo=ljuska&stanje=novi|aktivan|legenda`) koji crta PRAVU ljusku (`AppSidebarContent`) nad test podacima.

**Površine:**
- gotovo: ljuska aplikacije 6.1 (sidebar, rail, mobilno zaglavlje, fioka, meni naloga, panel, domaćin slavlja).
- nije u ovom koraku: Crea radionica (`StudioShell`) nema domaćina slavlja ni red napretka (K16 po planu K01 §3.3); polica svih 24 bedža na profilu, na koju vodi „Svi bedževi", stiže u K13.

**Kako se koristi (za K07 i dalje):**
- Podaci: `const { progress, openPanel } = useIgraProgress()` iz `components/igra/igra-progress-context.tsx`. `undefined` = učitava se, `null` = nema ga (gost, bez Convex-a, upit pao). Stranice unutar `/app` NE prave svoj `useQuery(api.igra.getMyProgress)`: isti podatak već stoji u kontekstu.
- `openPanel()` otvara panel sa bilo kog mesta (npr. sa kartice napretka na tabli).
- Izlog sa pravom ljuskom: omotaj `IgraProgressContext.Provider` test podacima (primer u `izlog-ljuska.tsx`).
- `lib/igra-a11y.ts` i `lib/igra-shell.ts` učitava svaka strana: ne uvoziti u njih `igra-badges`, `igra-art` ni `igra-celebrations` (čuva test). Tekst bedževa je u `lib/igra-badge-view.ts`.

**ODLUKE:**
1. **Pečat nivoa u ljusci je crtan u kodu** (broj u krugu mastila + prsten napretka), a amblem `nivo.NN` se vidi tek u panelu. Zadatak kaže „pečat nivoa", K01 §6.1 kaže „u ljusci nema slika"; izabrano je K01 (ljuska je na svakoj strani, slika bi ušla u svako učitavanje).
2. **Mesto na nedeljnoj listi je iz `getMyProgress.weekRank`** (K04 ODLUKA 1), ne iz `leaderboard.getViewerLeaderboardRow` kako piše K01 §6.1: zadatak traži podatke iz `getMyProgress`, a tako nema drugog upita. Kad mesta nema, ispod stoji rečenica: bez XP-a ove nedelje blag poziv, dalje od 100. mesta „Tačno mesto je na rang listi", za naloge tima „Nalozi tima nisu na rang listi" (tada bez čipa).
3. **Upit ide kroz `useQueries`, ne `useQuery`:** greška stiže kao vrednost umesto da sruši ljusku. Napredak je ukras; ako `igra:*` nije objavljen ili upit padne, aplikacija radi bez njega (nema reda, čipa ni prstena).
4. **Domaćin slavlja i panel su lenji** (`next/dynamic`, `ssr: false`). Domaćin se učitava tek kad `fresh` nije prazan i posle toga ostaje montiran (da se otvoreno slavlje ne ugasi kad `markSeen` isprazni `fresh`); panel se učitava na prvi klik. Greška u `markSeen` se guta: najgore je jedno ponovljeno slavlje pri sledećem otvaranju.
5. **Čip u mobilnom zaglavlju se sam prilagođava** umesto praga iz K01 („ispod 360 px bez broja niza"). Izmereno: zaglavlje od 390 px sa logotipom (120), kreditima (58–83 px, zavisi od broja cifara) i „Više" (94) nema mesta ni za fiksni čip sa brojem. Zato je čip jedini element reda koji sme da se skupi: pečat ostaje uvek, plamen i broj dana se pojavljuju kad ima mesta (prelom reda + fiksna visina, bez JS-a). Ispod 375 px čipa nema (ni sam pečat ne staje pored logotipa).
6. **Red napretka je i u fioci „Više" na telefonu** (K01 ga predviđa samo od `md`): tako i telefon od 360 px ima ulaz u panel, a svi vide ime nivoa, broj dana i XP traku. Klik prvo zatvara fioku.
7. **Dve izmene postojećeg mobilnog zaglavlja** (`app-sidebar.tsx`): red je dobio `gap-2`, a desna grupa `min-w-0 flex-1 justify-end`. Bez čipa se crta isto kao pre; sa čipom logo zadržava širinu.
8. **Prsten oko avatara je oreol od 58 px** preko omotača (krug avatara ostaje 48 px na istom mestu). Zbog njega je tekst u kartici profila pomeren za 8 px (`pl-2 pr-1` umesto `pr-3`, širina teksta ista), a avatar u rail-u nema tvrdu senku dok IGRA kontekst postoji (senka bi virila ispod oreola). Avatar od 28 px u meniju naloga nije dobio prsten.
9. **Meni naloga ima red „Moj napredak"** (K01 §6.1), iznad „Podešavanja". Pre otvaranja panela fokus ide na dugme koje je otvorilo meni, pa se tamo i vraća kad se panel zatvori.
10. **Panel je otvoren samo na strani na kojoj je otvoren** (stanje je vezano za `pathname`): prelazak na drugu stranu ga zatvara bez efekta; zatvara ga i svaki link u njemu.
11. **`AppSidebarContent` je izvezen** da bi izlog crtao pravu ljusku (Playwright nije prijavljen, pa je to jedini način da se vide stvarno zaglavlje, rail i 4 slota). Skupljanje sidebara u izlogu upisuje pravi kolačić `nauci_app_sidebar`.
12. **Tekst bedževa je izdvojen iz `lib/igra-a11y.ts` u `lib/igra-badge-view.ts`** (`badgeStickerView`, `shelfBadges`, `badgeTally`; ponašanje i testovi isti, promenjeni samo uvozi). Razlog: `igra-a11y` sada čita ljuska na svakoj strani, a sa njim je u početni JS ulazio ceo katalog bedževa.
13. **Oblačić bedža se drži i ivica dijaloga** (`badge-sticker.tsx`): u panelu bi ga sadržaj dijaloga sekao sleva.
14. **`scrollbar-gutter: stable` NIJE dodat.** Na Windows-u sa klasičnim skrol-barom strana skoči za širinu bara između kratke i duge strane i kad se otvori dijalog; to je jedini skok layouta koji nisam mogao da uklonim, jer u Playwright-u bar nema širinu (izmereno `innerWidth === clientWidth`), pa izmena ne može da se proveri. Predlog je dole, pod „Za Jovana".
15. **Pečat u panelu ne „udara" pri svakom otvaranju** (K05 pominje `stampKey` kao broj otvaranja): udar je za promenu nivoa, a nju pokriva slavlje. „Najduži niz" se ne ispisuje dok je 0.
16. **Pušteno na DEV:** `npx convex dev --once` (deployment `wandering-fox-41`, `CONVEX_DEPLOY_KEY` nije bio postavljen); `function-spec` pokazuje `igra:getMyProgress`, `igra:markSeen`, `igra:getMemberProgress`. To je K04 ostavio ovom koraku (K04 ODLUKA 12). Podaci nisu dirani; šema je dobila samo tabelu `igraSeen`.
17. `IGRA_PLANNED_ART` i dalje ima tri reda (`lib/igra-art.ts` nisam dirao).

**Novi paketi:** nema.

**Testovi:**
- novi `lib/igra-shell.test.ts` (21): geometrija prstena (linija u kutiji, prazan / pun / pola, stezanje, loš ulaz); red napretka za tri test korisnika na oba jezika (nivo, napredak, XP, niz, naziv dugmeta, poslednji nivo, „tinja", loš ulaz, bez reči pretnje); traka niza i najduži niz; rečenica uz nedeljnu listu (četiri slučaja, bez reči pretnje); **čitanje izvora**: donji meni ima `grid-cols-4` i ista četiri slota i ništa od napretka u njemu, napredak je u zaglavlju / sidebaru / rail-u, ljuska ne učitava slike, početni JS ljuske ne uvozi katalog bedževa ni manifest, delovi ljuske i panel nemaju upite, slavlje i panel su `next/dynamic` sa `ssr: false`, provider uvozi samo `app-shell.tsx`, a `AppShell` samo `app/[locale]/app/*`.
- izmenjeni: `lib/igra-izlog.test.ts` (spisak delova sada ima „ljuska"), `lib/igra-a11y.test.ts` (samo uvozi posle izdvajanja; tvrdnje iste).

**Slike:** ljuska ne koristi nijednu. Panel: porodice `nivo.*` i `bedz.*`, `rang.plamen`, `rang.zlato|srebro|bronza` (kroz postojeće primitive). TRAŽENE SLIKE: nema.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran); `convex dev --once` nije promenio `_generated`
- typecheck: prošlo (i posle build-a)
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (300 fajlova, 3.315 testova)
- check:frames, check:corners, check:white, check:igra: prošlo
- build: prošao (dva puta, oba iz prvog pokušaja)
- **check:bundle: prošlo.** Ljuska je dodala oko 6 KB gz svakoj app ruti (pre izdvajanja bedževa 8 KB); slavlje, panel, manifest slika i katalog bedževa su u async chunk-ovima.

| Šta (gzip) | Posle K05 | Posle K06 | Granica |
|---|---|---|---|
| `/app` početni JS | 269 KB | 275 KB | 294 |
| `/app/classroom` | 290 | 297 | 315 |
| `/app/community/leaderboard` | 278 | 284 | 303 |
| `/app/members/[username]` | 347 | 352 | 371 |
| `/app/studio` | 542 | 546 | 595 |
| Crea radionica `/studio/(shell)/app` (ljuska je ne dira) | 466 | 465 | 512 |
| javna početna | 139 | 139 | 153 |

- **pregledač (Playwright, 1440 × 900 i 390 × 844, obe teme, sr i en), izmereno u izlogu nad pravom ljuskom:**
  - računar: pečat u redu napretka i ikonice menija su na istom x-u (centar 72 px); red napretka je na y 88–136 i u proširenom i u skupljenom stanju, prva stavka menija na 157, avatar na 836 u oba stanja (ništa se ne pomera pri sklapanju); sidebar 246 / 82 px
  - učitavanje ↔ podaci: **0 unosa `layout-shift`** na obe širine; meni, pločica kredita i sadržaj strane ostaju na istim koordinatama
  - telefon: donji meni ima 4 slota (Dashboard, Učionica, Zajednica, Poruke); nema vodoravnog skrola na 340–430 px; meta čipa 44–76 × 44 px
  - čip po širini i broju cifara kredita (šta je vidljivo):

| Širina | krediti 2 cifre | 4 cifre | 5 cifara |
|---|---|---|---|
| 360 | bez čipa | bez čipa | bez čipa |
| 375 | pečat + plamen | pečat | pečat (2 px do logotipa) |
| 390 | pečat + plamen + broj | pečat + plamen | pečat |
| 412 | sve | sve | pečat + plamen |
| 430 | sve | sve | sve |

  - panel: otvara se sa reda, kruga u rail-u, čipa, reda u fioci i reda u meniju naloga; fokus ide na „Zatvori", Esc i klik pored zatvaraju, fokus se vraća na dugme koje ga je otvorilo (iz menija naloga na dugme profila, iz fioke na „Više"); na 390 px je list uz donju ivicu (776 px, sadržaj se skroluje), linkovi su visine 44 px; oblačić prvog bedža ostaje u dijalogu (8 px od ivice)
  - slavlje u ljusci (test korisnik „aktivan": nivo 5 + dva nova bedža): dok je panel otvoren slavlje čeka; zatim ide jedno po jedno (uvek 1 dijalog), `markSeen` dobija `level:5`, `badge:niz-7`, `badge:top-10` svaki jednom; Esc zatvara za 0,2 s, samo se gasi za 2,7 s, klik pored zatvara; posle toga se ništa ne otvara ponovo i skrol strane je otključan
  - smanjen pokret: prsten i traka odmah na vrednosti (prelazi isključeni), XP u panelu odmah ispisan
  - tamna tema, kontrast u redu napretka: ime nivoa i broj na pečatu 12,62:1, „490 / 1.000 XP" 6,78:1
  - engleski: „My progress: Legend. Level 12, top level, 23,480 XP. Streak: 64 days. …", linkovi vode na `/en/app/members/<korisnik>` i `/en/app/community/leaderboard`
  - konzola bez grešaka i upozorenja u običnom radu; uz „smanji pokrete" React javlja nepoklapanje hidratacije u `SidebarNavSwap` (zatečeno, vidi dole)
- dev server je ugašen (portovi 3000 / 3123 / 3124 slobodni, nijedan `next` ni `convex` proces); Playwright `page-*.yml` i `console-*.log` su obrisani.

**Prihvatanje (K06):**
- Ljuska radi na desktopu i telefonu, u obe teme; 4 slota na telefonu: **ispunjeno** (snimci `K06-ljuska-*`, `K06-fioka-*`, `K06-panel-*`; test nad izvorom čuva 4 slota).
- Slavlje se pojavljuje jednom po događaju i ne ometa rad (Esc, auto): **ispunjeno u izlogu** (pravi domaćin, `markSeen` simuliran); sa pravim nalogom nije provereno, jer Playwright nije prijavljen.
- typecheck / lint / test / check:frames prolaze, sekcija K06 u progress-u: **ispunjeno**.

**BLOKADA (samo provera, ne kod):** ljuska i slavlje nad PRAVIM nalogom nisu provereni u pregledaču. Playwright MCP nije prijavljen, a prijava ide kroz auth tok koji se po pravilima ne dira (i u Playwright se ne unose tuđe lozinke). Zato je stavka „slavlje jednom po događaju" potvrđena ovako: pravi `CelebrationHost` u izlogu nad pravom ljuskom (jedno po jedno, svaki ključ jednom, Esc i samogašenje), `convex/igra.test.ts` (`markSeen` upisuje samo zarađeno i samo jednom) i `function-spec` na DEV-u (`igra:*` postoje). Nije potvrđen jedino spoj u `IgraProgressProvider` (upit → domaćin → `markSeen`) nad živim Convex-om; prva stavka ispod je tačno ta provera.

**Za Jovana ujutru:**
- **Prijavi se na DEV i otvori `/app`** (`npx next dev --webpack -p 3123`): ovo je prvi put da ljuska radi nad pravim nalogom. Očekuj red napretka u sidebaru i JEDNO slavlje „Tvoj napredak do sada" (prvi kontakt, dnevnik je prazan); posle osvežavanja ne sme da se ponovi.
- **Produkcija:** Convex funkcije (`igra:*` + tabela `igraSeen`) moraju da odu pre ili zajedno sa frontendom. Ako frontend ode prvi, aplikacija radi, samo bez napretka u ljusci (ODLUKA 3).
- **Telefon od 360 px nema čip u zaglavlju** (nema mesta pored logotipa, kredita i „Više"); napredak je tu u fioci „Više". Ako hoćeš čip i tamo, nešto postojeće mora da se smanji (logo ili natpis „Više"): to je tvoja odluka, nisam dirao.
- **Skok strane za širinu skrol-bara na Windows-u** (ODLUKA 14). Predlog od jedne linije u `app/globals.css`: `html:has(.app-sidebar) { scrollbar-gutter: stable; }`. Cena: uz otvoren dijalog ostaje traka od 10 px bez zatamnjenja uz desnu ivicu. Probaj u pravom Chrome-u pre nego što uđe.
- **Zatečeno, nisam dirao:** (a) uz „smanji pokrete" `SidebarNavSwap` crta drugačiji HTML nego server, pa React prijavi nepoklapanje hidratacije i ponovo iscrta sidebar; (b) u tamnoj temi inicijali u avataru sidebara su svetli na žutoj (boja se nasleđuje sa dugmeta).
- **Ukus:** pečat u ljusci je broj u krugu mastila sa žutim prstenom (ODLUKA 1). Ako ipak hoćeš amblem `nivo.NN` u sidebaru, to je zamena jedne komponente (`LevelSeal` u `shell-progress.tsx`), uz jednu sliku više na svakoj strani.
- **Dodir na pravom telefonu i pravi čitač ekrana nisam imao:** provereni su veličine meta, fokus i atributi.

## K07 - Plan: kontrolna tabla i učionica   (2026-10-14 03:53)
**Plan korak.** Plan je upisan u `docs/igra/planovi/K07.md`. Nije menjan kod.

## K08 — Kontrolna tabla   (2026-10-14 04:35)
**Fajlovi:**
- novi (tabla): `components/app/dashboard-home.tsx` (`DashboardHome`, `LiveDashboardHome`, traka „sve spremno")
- novi (IGRA komponente): `components/igra/igra-hero.tsx`, `ink-calendar.tsx`, `progress-ring.tsx`, `components/igra/dashboard/dashboard-hero.tsx`, `dashboard-mascot.tsx`, `crea-quick-start.tsx`
- novi (lib): `lib/igra-daypart.ts`, `lib/igra-mission.ts`, `lib/igra-calendar.ts` + testovi `lib/igra-daypart.test.ts`, `lib/igra-mission.test.ts`, `lib/igra-calendar.test.ts`, `lib/igra-dashboard.test.ts`
- novi (izlog): `components/igra/izlog/izlog-tabla.tsx`, `docs/igra/snimci/K08-*.png` (14)
- izmenjeni (tabla): `app/[locale]/app/page.tsx` (doba dana + sklapanje table), `components/app/dashboard.tsx` i `dashboard-live.tsx` (sada samo stranica kursa), `components/app/dashboard-content.tsx` (tabla i stari heroj izašli, `DashboardFirstRun embedded`, skeleti), `components/app/dashboard-windows.tsx` (samo 4. pločica pulsa)
- izmenjeni (ostalo): `app/globals.css` (token `--igra-scene-paper` + klasa `bg-igra-scene-paper`), `lib/igra-copy.ts` (`IGRA_DASHBOARD_COPY`), `lib/igra-fixtures.ts` (`DASHBOARD_OVERVIEW_FIXTURES`), `lib/igra-css.test.ts`, `lib/igra-izlog.test.ts`, `components/igra/izlog/registry.ts`, `scripts/check-frames.mjs` (`ROOTS`)

**Šta je urađeno:** Kontrolna tabla (`/app`) ima nov raspored po planu K07: heroj (scena po dobu dana u Beogradu, pozdrav, Robijeva rečenica i misija dana sa jednim dugmetom), prvi koraci dok ih ima, kartica napretka (pečat nivoa, XP kao odometar, traka, plamen niza), puls od 4 pločice (četvrta je mesto na nedeljnoj listi, sa medaljom za prva tri mesta), polica bedževa + Crea brzi start (Piksi / Kadar / Eho), postojeći prozori i mastilo-kalendar umesto stubića. „Nastavi kurs" je misija dana: kad lekcija čeka, heroj nosi prsten mesta u kursu („4/9") i dugme „Nastavi lekciju". Doba dana računa server (`igraDaypartNow()` u `page.tsx`), pa su scena i pozdrav u HTML-u pre podataka; misija, napredak i ostalo dok čekaju crtaju skelete iste visine u ISTOM stablu (heroj se ne zamenjuje). Tabla ne pravi svoj upit za napredak: čita `useIgraProgress()` iz ljuske, a kad napretka nema (`null`) njegove sekcije se ne crtaju i ostatak radi. 3D maskota (postojeći `CreaMascot`) se montira samo na širokom ekranu sa mišem, uz dozvoljen pokret, bez štednje podataka i tek kad pregledač miruje. Izlog je dobio deo „Kontrolna tabla" (`/igra-izlog?deo=tabla&stanje=novi|aktivan|legenda`) koji crta PRAVU `DashboardHome` nad test podacima, sa prekidačima za doba dana, učitavanje, tablu bez napretka i dan koji još nije upisan.

**Površine:**
- gotovo: kontrolna tabla 6.2 (heroj, misija, napredak, puls, bedževi, Crea brzi start, kalendar; prazna stanja novog korisnika; učitavanje; tamna tema; 390 px; engleski).
- nije dirano (po planu): `DashboardWindowsGrid` i admin prozori (K21), `convex/dashboard.ts`, `lib/dashboard-first-run.ts`, `lib/dashboard-zones.ts`, rute, auth.
- stranica kursa (`DashboardContent`) je ista; promenio se samo fajl koji je sklapa (vidi ODLUKU 2).

**Kako se koristi (za K09–K13):**
- `<IgraHero art="scena.…" locale greeting={…} aside={…}>{sadržaj}</IgraHero>`: scena je pozadina cele kartice (crtež desno, prazan papir levo), kartica je svetlo ostrvo. Jedini `priority` na strani. Važi za scene koje imaju prazan levi deo; pre upotrebe druge scene pogledati sliku.
- `<ProgressRing progress={0..1} label="…">33 %</ProgressRing>` (56 px, naziv za čitač ekrana daje pozivalac): za kartice kurseva u K09.
- `<InkCalendar activity={[{ day, completed }]} todayKey recent? note? locale />`: za profil u K13 (isti oblik `activity` kao `overview.activity`).
- Nov IGRA kod za jednu stranu NE uvoziti u `components/app/dashboard-content.tsx`: taj fajl se preko `app/[locale]/app/loading.tsx` učitava na svakoj ruti aplikacije (čuva test u `lib/igra-dashboard.test.ts`).
- `pickDailyMission(input, locale)` u `lib/igra-mission.ts` vraća gotov tekst i adresu; prsten kroz `missionRingProgress` / `missionRingLabel`.

**ODLUKE K07 (iz plana `docs/igra/planovi/K07.md` §6, sprovedene ovde):**
1. „Nastavi kurs" je misija dana u heroju, ne posebna kartica; `ResumeHero` je uklonjen.
2. Misija se u heroju crta bez primitiva `DailyMission` (primitiv nosi svoj okvir i svog lika).
3. U heroju nema nalepnice Robija (Robi je na sceni).
4. Pozdrav i Robijeva rečenica zavise samo od doba dana.
5. Mesto na listi je 4. pločica pulsa iz `overview.leaderboard`; `ProgressCard` je u svom redu.
6. Kalendar čita `overview.activity` (UTC dan, samo lekcije) i dopunjuje poslednjih 14 dana iz `streak.recent`; `convex/dashboard.ts` nije diran. Lekcija između 00:00 i 02:00 po Beogradu pada u prethodni dan (zatečeno).
7. Misija: nepoznat podatak preskače pravilo; Crea se predlaže pre „još jedne lekcije" kad je dan već upisan.
8. Bez novih slika.
(Odluke 8–11 iz plana tiču se K09 i K10.)

**ODLUKE K08 (odstupanja od plana i ono što plan nije rekao):**
1. **Scena je pozadina CELE kartice heroja, ne medij u desnoj koloni.** Sve četiri `scena.dashboard-*` su crtane sa crtežom u desnih ~55 % i praznim papirom levo; kao slika u okviru ostavljale bi pola kadra praznog. Zato je heroj jedan list papira: scena uz desnu ivicu (leva ivica se pretapa maskom), tekst levo. Za to je uveden token `--igra-scene-paper: #fcf5e1` (prosek praznog dela četiri scene, izmereno #fbf3de–#fdf6e3), isti u obe teme. Heroj je `paper-island`, dakle svetao list i u tamnoj temi. Na telefonu i tabletu scena je traka na vrhu, a pozdrav stoji u njenom levom, praznom delu.
2. **Tabla je izdvojena u `components/app/dashboard-home.tsx`.** `dashboard-content.tsx` se preko `loading.tsx` i kartica kurseva učitava na svakoj ruti aplikacije, pa bi heroj, kalendar, manifest slika i katalog bedževa ušli svuda. Posledice: `StudentDashboard` i `LiveStudentDashboard` sada crtaju samo stranicu kursa (`courseSlug` je obavezan), a `/app/page.tsx` sam bira živu ili statičku tablu. Ponašanje stranice kursa je isto. Ostale rute su zbog toga LAKŠE za 4–6 KB (tabela dole).
3. **Kalendar je 26 nedelja (na telefonu poslednjih 13), bez prekidača.** Plan je predviđao 5 ili 13 nedelja uz prekidač 30d / 90d; mreža od 5 nedelja je 156 px u kartici od 1.100 px. Ovako je jedna mirna slika i jedna kontrola manje. Bez dana u nedelji i meseci na osama: ispod stoje samo prvi datum i „danas".
4. **Pločica mesta zadržava natpis „Rang"** (plan: „Ova nedelja"): „OVA NEDELJA" se na 390 px lomi u dva reda i broj spušta ispod suseda. XP nedelje se u pločici ne ispisuje (pločice bi imale različite visine). Čitač ekrana čuje „7. mesto na listi"; bez mesta stoji crta i „Još bez mesta na listi".
5. **3D maskota tek od 1.400 px širine** (ne od `lg`): tek tu između teksta i crteža ima mesta. `CreaMascot` ispod platna drži poster dok 3D ne stigne (plan je rekao „bez postera"): to je podloga istog kadra na trenutak, a ostaje ako WebGL ne proradi.
6. **Polica bedževa i kalendar stižu kroz `next/dynamic`.** Bez toga je `/app` bio 296 KB (budžet 294); sa tim je 291. Budžet nije diran. Obe sekcije su ispod prevoja, a mesto im dok ne stignu drži blok iste visine.
7. **Misija čeka i napredak** (`igra === undefined` → skelet), jer `todayDone` menja izbor; inače bi se naslov promenio pred očima. Kad napretka nema (`null`), računa se kao da dan nije upisan.
8. **Pozdrav koristi ime, ne ime i prezime**, kad `firstName` postoji (na telefonu pozdrav staje u levi deo scene). Bez imena ostaje sam pozdrav; „Student" se više ne ispisuje.
9. **`DashboardFirstRun` je dobio `embedded`** (tabla): bez pozdrava i žutog dugmeta, naslov kao `<h2>`. Učionica ga crta kao i pre. Naslov strane (`<h1>`) je naslov misije.
10. **Uklonjeno jer je ostalo bez pozivaoca:** `ResumeHero`, `HeroCover`, `ActivityPanel`, `dailyActivitySeries`. Traka „sve spremno" je premeštena u `dashboard-home.tsx` bez izmene.
11. **Skeleti table** su usklađeni sa novim rasporedom i prebačeni sa `rounded-[16px]` / `rounded-[8px]` na `surface-card` (pločice pulsa su i inače 16 px); skelet prozora ima 6 blokova, koliko tabla ima prozora.
12. **`ProgressRing` prima gotov naziv** (plan je predviđao `progressRingView` u `lib/igra-a11y.ts`): tekst prstena misije je u `lib/igra-mission.ts`, a `igra-a11y` ostaje lagan (čita ga ljuska).
13. **`IgraHero` ima manji API nego u K01 §6** (`art`, `greeting`, `children`, `aside`): bez `eyebrow` / `subtitle` / `actions` i bez `.igra-paper` teksture (scena već nosi papir). Proširuje ga korak kome zatreba.
14. **`check:frames`:** u `ROOTS` su dodati `components/app/dashboard-home.tsx` i `components/app/dashboard-windows.tsx` (oba prolaze). `dashboard-content.tsx` nije dodat (stranica kursa nosi stari dug).
15. **Datum ispod kalendara je numerički** („20.04."), kao na starom grafikonu, da server i pregledač ne ispišu različitu skraćenicu meseca.
16. `IGRA_PLANNED_ART` i dalje ima tri reda (`lib/igra-art.ts` nisam dirao).

**Novi paketi:** nema.

**Testovi (4 nova fajla, 43 testa; +1 u postojećem):**
- `lib/igra-daypart.test.ts` (7): granice doba dana, loš ulaz, sat u Beogradu zimi i leti (04:59 / 05:00 / 10:59 / 11:00 / 16:59 / 17:00 / 21:59 / 22:00), scena u manifestu, pozdrav sa imenom i bez, Robijeve rečenice na oba jezika bez reči pretnje.
- `lib/igra-mission.test.ts` (13): svih šest pravila i njihov redosled, prva lekcija, nepoznat podatak, engleski i adrese kroz `lib/app-routes`, ceo tekst + slika lika + bez reči pretnje i nagrade, prsten (udeo, loš ulaz, naziv).
- `lib/igra-calendar.test.ts` (11): stepeni mastila, pune nedelje od ponedeljka, dani posle današnjeg, ponedeljak i nedelja, dopuna iz niza (samo aktivni dani, zamrznut ne), stara aktivnost, 13 nedelja za telefon, rečenica za čitač ekrana, neispravan dan.
- `lib/igra-dashboard.test.ts` (12): test korisnici kroz ista pravila kao tabla (misija novog / aktivnog / legende, dani niza = dani lekcija) + čitanje izvora: delovi table bez upita i test podataka, slike samo kroz `IgraArt`, jedna prioritetna slika, maskota samo kroz `next/dynamic` bez SSR-a, tabla čita napredak iz ljuske (jedan `useQuery` u celom fajlu), IGRA kod nije u `dashboard-content.tsx`, doba dana računa server.
- izmenjeni: `lib/igra-css.test.ts` (token `--igra-scene-paper` u svetlom skupu i kao klasa, nema tamnog parnjaka), `lib/igra-izlog.test.ts` (deo „tabla").

**Slike:** `scena.dashboard-jutro|dan|vece|noc`, `lik.piksi.mase`, `lik.kadar.mase`, `lik.eho.mase`, likovi misije (`lik.sova.mase|misli`, `lik.piksi.mase`, `lik.iskra.mase`), `rang.zlato|srebro|bronza`, a kroz primitive porodice `nivo.*`, `bedz.*` i `rang.plamen`. TRAŽENE SLIKE: nema.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran)
- typecheck: prošlo (i posle build-a)
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (304 fajla, 3.359 testova)
- check:frames, check:corners, check:white, check:igra (i `--strict`): prošlo
- build: prošao (tri puta, svaki iz prvog pokušaja); `next start` (port 3124): `/` 200, `/igra-izlog`, `/igra-izlog?deo=tabla` i `/en/igra-izlog?deo=tabla` 404, `/app` 307 na prijavu, `sitemap.xml` bez izloga
- **check:bundle: prošlo.**

| Šta (gzip) | Posle K06 | Posle K08 | Granica |
|---|---|---|---|
| `/app` početni JS | 275 KB | 291 KB | 294 |
| `/app/classroom` | 297 | 291 | 315 |
| `/app/classroom/courses/[courseSlug]` | — | 285 | 309 |
| `/app/community/leaderboard` | 284 | 280 | 303 |
| `/app/members/[username]` | 352 | 347 | 371 |
| `/app/studio` | 546 | 542 | 595 |
| javna početna | 139 | 139 | 153 |

- **pregledač (Playwright, 1440 × 900 i 390 × 844, obe teme, sr i en), izmereno u izlogu nad pravom `DashboardHome`:**
  - scena je u HTML-u sa servera (`loading="eager"`, `fetchPriority="high"`) i React za nju sam dodaje `<link rel="preload" as="image">`; to je jedina prioritetna slika na strani
  - LCP element je scena heroja i crta se u istom frejmu kao prvi sadržaj (220 ms na 1440, 184 ms na 390, razvojni server); CLS 0 na 390 i 0,0012 na 1440
  - LCP pod usporenom mrežom (CDP, bez keša, razvojni server; scena je 99 KB): brza 4G (9 Mbit/s, 60 ms) prvi sadržaj 508 ms / LCP 592 ms na 1440 i 536 / 576 ms na 390; spora 4G (1,6 Mbit/s, 150 ms) prvi sadržaj 748 ms / LCP 1.744 ms na 1440 i 748 / 1.740 ms na 390. Na sporoj vezi scena dakle stiže oko 1 s posle prvog teksta. U oba slučaja LCP pada PRE nego što stigne JavaScript strane (razvojni bundle od 6 MB: 6,3 s, odnosno 34 s; produkcioni je 291 KB gz), jer slika ne čeka ni hidrataciju ni upit
  - učitavanje ↔ podaci (aktivan korisnik), visine sekcija u px: računar 396 / 148 / 94 / 244 / 1.296 / 259 naspram 404 / 148 / 94 / 244 / 1.279 / 256; telefon 611 / 356 / 188 / 405 naspram 617 / 345 / 187 / 459 (polica na telefonu je 54 px viša od svog skeleta: skelet primitiva iz K05 nema link „Svi bedževi"; to je ispod prevoja)
  - telefon: nema nijednog zahteva za GLB, Draco ni poster maskote, nema platna; nema vodoravnog skrola (i na 768, 1024 i 1280); dugme misije je 508 px od vrha heroja, pa je u prvom ekranu
  - računar: GLB i Draco se traže tek kad pregledač miruje, jedno platno; uz „smanji pokrete" maskota se ne montira (0 platna, u heroju samo slika scene), a XP je odmah ispisan
  - bez slika (blokiran `/brand/igra/**`): 0 slika, 9 fallback-a, ista visina heroja (404 px) i cele strane (2.909 px); scena postaje papir sa mrežom
  - širine sadržaja kao u aplikaciji: 714 px (ekran 1024 sa sidebarom) heroj je 580 px visok i crtež je krupno isečen uz desnu ivicu; 970 px (ekran 1280) 439 px; 1.130 px (ekran 1440) 404 px
  - pločice pulsa na 390 px: sve četiri 87 px, broj na istoj visini (41 px od vrha)
  - mete: u novim delovima table sve su ≥ 44 px; ispod praga su samo zatečeni redovi u prozorima (40 px, `DashboardWindowsGrid`, nije diran)
  - naslovi: jedan `<h1>` (misija), `<h2>` „Šta praviš danas?" i „Tvoj trag"; redosled fokusa u heroju: dugme misije, pa „Otvori učionicu"
  - konzola bez grešaka i bez upozorenja o hidrataciji; jedino upozorenje je zatečeno `THREE.Clock` iz maskote
- impeccable detektor nad novim fajlovima: bez nalaza
- dev server i `next start` su ugašeni (portovi 3000 / 3123 / 3124 slobodni, nijedan `next` ni `convex` proces); Playwright `page-*.yml` i `console-*.log` su obrisani.

**Prihvatanje (K08):**
- Izgleda kao „igra u svesci", radi bez slika: **ispunjeno** (snimci `K08-tabla-*`, `K08-heroj-*`, `K08-tabla-bez-slika-*`).
- Brza je: **delimično ispunjeno.** Početni JS je u budžetu (291 / 294 KB), 3D i GLB se ne traže na telefonu, CLS je 0–0,0012, a LCP nove table je izmeren (gore). Deo „LCP ne gori od pre" je **BLOKADA 1** (dole): poređenja sa starom tablom nema.
- typecheck / lint / test / check:frames prolaze, sekcija K08 u progress-u: **ispunjeno**.

**BLOKADA 1 — „LCP ne gori od pre" nije izmereno kao poređenje.** Razlog: i stara i nova tabla žive iza prijave, a Playwright nije prijavljen (auth tok se ne dira, tuđe lozinke se ne unose). Stara tabla se ne može izmeriti ni u izlogu, jer je njen LCP zavisio od onoga čega u izlogu nema: do odgovora upita `getDashboardOverview` crtala je prazne blokove, pa je najveći element stizao tek posle celog početnog JS-a (275 KB gz), hidratacije i Convex upita. Šta JESTE izmereno: LCP nove table je scena heroja, koja je u HTML-u sa servera i ne čeka ni JS ni upit (brza 4G 0,6 s, spora 4G 1,7 s, razvojni server). Iz toga sledi da nova tabla ne može imati gori LCP od stare na istoj vezi, ali to je zaključak iz redosleda učitavanja, ne broj „pre / posle". Šta treba da se uradi: Lighthouse nad `/app` na prijavljenom nalogu, pre i posle ovog commita (K28 ili Jovan ručno).

**BLOKADA 2 (samo provera, ne kod):** prava strana `/app` nad živim nalogom nije gledana u pregledaču, iz istog razloga kao u K06 (Playwright nije prijavljen, a auth tok se ne dira). Sve iznad je mereno u izlogu, koji crta istu `DashboardHome`. Nije potvrđen jedino tanak sloj `LiveDashboardHome` (upit `getDashboardOverview` + `useIgraProgress` → tabla) i `daypart` sa servera na pravoj ruti; pokriva ih typecheck i test nad izvorom, ne pregledač.

**Za Jovana ujutru:**
- **Prijavi se na DEV i otvori `/app`** (`npx next dev --webpack -p 3123`): ovo je prvi put da nova tabla radi nad pravim nalogom. Proveri da scena odgovara satu, da misija ima smisla za tvoj nalog i da se ništa ne pomera kad podaci stignu.
- **3D maskota pored nacrtanog Robija** (snimci `K08-heroj-*`): dva Robija u različitom stilu, jedan do drugog. Zadatak je tražio maskotu na računaru, pa je tu; ako ti smeta, gasi se jednim propom (`mascot={false}` na `DashboardHero` u `dashboard-home.tsx`).
- **Heroj je svetao list i u tamnoj temi** (ODLUKA 1, snimak `K08-tabla-1440-tamna.png`). Druga mogućnost bi tražila tamne verzije scena.
- **Ton tekstova** u `IGRA_DASHBOARD_COPY` (`lib/igra-copy.ts`): četiri Robijeve rečenice, noćni pozdrav je samo „Zdravo, {ime}", misije „Još jedna lekcija?" i „Javi se zajednici".
- **Redosled misije:** kad je dan već upisan, prvi rad u Crei i prva objava idu PRE „još jedne lekcije". Redosled je jedna funkcija (`pickDailyMission`), a test ga zaključava.
- **Kalendar** broji lekcije po UTC danu (K07 ODLUKA 6) i prikazuje pola godine bez prekidača (ODLUKA 3).
- **Zatečeno, nisam dirao:** redovi u prozorima table su visoki 40 px (ispod 44 px za dodir); u pločici „Obaveštenja" na 390 px natpis stoji tik uz ikonicu.
- **Dodir na pravom telefonu i pravi čitač ekrana nisam imao.**
