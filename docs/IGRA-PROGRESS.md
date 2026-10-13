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
