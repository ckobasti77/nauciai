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

## K09 — Učionica: kursevi, lekcije, slavlja   (2026-10-14 05:25)
**Fajlovi:**
- novi (lib): `lib/igra-course-art.ts`, `lib/igra-lesson.ts` + testovi `lib/igra-course-art.test.ts`, `lib/igra-lesson.test.ts`, `lib/igra-classroom.test.ts`
- novi (IGRA komponente): `components/igra/lesson-steps-bar.tsx` (traka + hook `useActiveLessonStep`), `components/igra/lesson-done.tsx`, `components/igra/motion/use-xp-gain.ts`
- novi (učionica): `components/app/dashboard-course-card.tsx` (kartica otključanog kursa, izašla iz `dashboard-content.tsx`), `components/app/classroom-hub-skeleton.tsx` (trake i kostur učionice, izašli iz `classroom-hub.tsx`)
- novi (izlog): `components/igra/izlog/izlog-ucionica.tsx`, `docs/igra/snimci/K09-*.png` (22)
- izmenjeni (učionica): `components/app/classroom-hub.tsx` (Sova, prstenovi, smer karticama), `course-catalog-card.tsx` (samo nalepnica lika), `course-player.tsx` (traka koraka, mali kraj, „šta je sledeće"), `course-lab.tsx` (traka + mali kraj umesto poruke), `dashboard-content.tsx` (pečat uz 100 %, kartica izašla), `track-experience.tsx` (uvoz kartice + smer), `app/[locale]/app/classroom/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx` (jedan prop), `app/[locale]/app/classroom/loading.tsx` (uvoz kostura)
- izmenjeni (ostalo): `lib/igra-copy.ts` (`IGRA_CLASSROOM_COPY`), `lib/igra-fixtures.ts` (`CLASSROOM_FIXTURES`, `CLASSROOM_TRACK_FIXTURES`), `components/igra/izlog/registry.ts`, `lib/igra-izlog.test.ts`, `lib/igra-shell.test.ts`, `scripts/check-frames.mjs` (`ROOTS`)

**Šta je urađeno:** Kartice kurseva u učionici su „svetovi": na naslovnoj slici stoji lik ekipe po temi kursa (Kadar za video, Eho za zvuk, Piksi za slike, Bajt za sajt i kod, Sova za sve ostalo), umesto trake je prsten napretka, a stanje se čita bez teksta: prazan prsten i „Otvori kurs" (nije počet), prsten sa procentom i „Nastavi" (u toku), pun prsten sa kvačicom, pečat „Završeno" i „Ponovi" (završen). Zaključana kartica je dobila samo nalepnicu lika; cena, tekst i dugme za kupovinu su isti. U vrhu učionice Sova maše sa ivice kartice „Nastavi gde si stao", a ta kartica i trake smerova nose isti prsten. Lekcija ima lepljivu traku koraka („Korak 3 od 5", marker se razliva kako čitalac skroluje), a klik na „Završio/la sam ovu lekciju" otvara mali kraj u istoj kartici: „Lekcija završena", „+N XP" kao odometar na markeru, traka nivoa i dugme „Sledeća lekcija". N se meri iz porasta XP-a u ljusci, pa ponovljen klik pokaže samo „Lekcija je zapisana." Veliko slavlje na kraju kursa nije pravljeno ponovo: i dalje ga vodi ljuska iz K06 (scena `scena.kurs-zavrsen`, konfete, 3D pehar od `lg`, jednom preko `igraSeen`); ovde je ceo tok proveren u izlogu, a stranica kursa uz 100 % nosi isti pečat. `convex/`, rute, `courses.markProgress` i sadržaj kurseva nisu dirani.

**Površine:**
- gotovo: učionica 6.3 — hub (zona „nastavi", smerovi, katalog), kartica otključanog i zaključanog kursa, plejer lekcije (Light), stranica kursa (pečat), stranica smera (ista kartica; sama strana smera nije gledana u pregledaču).
- delimično: Pro prikaz lekcije (`CourseLab`) ima traku i mali kraj u kodu, ali NIJE gledan u pregledaču (traži Pro plan i podatke vežbe iz baze; vidi BLOKADU).
- nije u ovom koraku (po planu): mapa puta na stranici kursa i smera (K10), prazna stanja učionice (K23), `DashboardFirstRun`, filteri i zone učionice.

**Kako se koristi (za K10 i dalje):**
- `courseLik({ slug, trackSlug?, title })` → `IgraLik` ime; `courseCardState({ completedLessons, totalLessons })` → `"new" | "progress" | "done"` (`lib/igra-course-art.ts`).
- `<LessonStepsBar step total locale floating? />`; `useActiveLessonStep(ids)` vraća indeks bloka do kog je čitalac stigao.
- `const xpGain = useXpGain(); xpGain.start()` PRE mutacije, pa `<LessonDone done gain={xpGain.gain} xp={xpGain.xp} … />`.
- `lessonRefs(course)` + `nextLessonAfter(lessons, slug)` (`lib/igra-lesson.ts`) nad odgovorom `courses:getAppNavigation`.
- **Dva fajla se učitavaju šire nego što izgleda:** `dashboard-content.tsx` na svakoj ruti aplikacije (K08), a sve što uvozi `app/[locale]/app/classroom/loading.tsx` na svakoj ruti ispod `/app/classroom` (kurs, lekcija, smer). IGRA kod za jednu stranu ne ide ni u jedan od ta dva lanca; kostur učionice je zato u `classroom-hub-skeleton.tsx`. Oba čuva test.

**ODLUKE (odstupanja od plana K07 §2 i ono što plan nije rekao):**
1. **Kartica otključanog kursa je izdvojena u `components/app/dashboard-course-card.tsx`.** Plan je menja u `dashboard-content.tsx`, ali taj fajl ne sme da uvozi IGRA kod (test iz K08: učitava se na svakoj ruti). Ime komponente je isto (`DashboardCourseCard`); promenjena su dva uvoza (`classroom-hub.tsx`, `track-experience.tsx`). Sa karticom su prešli `formatLastActivity` i `courseCommunityHref`; `statusCopy` je izvezen. Iz `dashboard-content.tsx` su uklonjeni uvozi koji su ostali bez korisnika (`Clock3`, `Lock`, `PartyPopper`, `progressEncouragement`, `lib/surface`).
2. **Kostur učionice i konstante traka su izdvojeni u `components/app/classroom-hub-skeleton.tsx`.** `classroom/loading.tsx` važi za sve rute ispod učionice, pa je ceo hub (sada sa likovima i manifestom slika) ulazio u početni JS lekcije, kursa i smera: lekcija 307 KB, kurs 295 KB. Posle izdvajanja: lekcija 280, kurs 268 (tabela dole). Kostur je dobio red visine Sove (64 px / 168 px), da se strana ne pomeri kad podaci stignu.
3. **Lik: ključna reč mora da POČINJE reč** (plan: podniz). Podniz bi „freelance" dao Kadru („reel"), „robot" Bajtu („bot"), „oglas" Ehu („glas"), a „terapija" Bajtu („api"). Kvačice se skidaju pre poređenja („montaža" → „montaza").
4. **Lik: prvo odlučuju slug i naslov kursa, smer tek kad oni ne kažu ništa** (plan: sve zajedno). Inače smer „video-audio" svaki svoj kurs daje Kadru, i „Glas i muzika" i „AI slike" (uhvaćeno u izlogu).
5. **`code` je skraćen na `cod`**, da pogodi i „coding" (slug `vibe-coding`).
6. **Nalepnica lika stoji UNUTAR naslovne slike** (donji desni ugao, 64 px), ne visi preko ivice: odmah ispod je prsten.
7. **Naslovna slika otključane kartice više nema svoj `border-2 border-ink`**, nego tanku unutrašnju ivicu kao zaključana kartica; okvir reda „Sledeće" je `border border-line`. Razlog: nov fajl je u `check:frames` (`ROOTS`), a pravilo je jedan okvir po grupi.
8. **Pečat „Završeno": prsten je koral (`--igra-stamp`), tekst mastilo.** Koral na papiru je 2,8:1, ispod 4,5:1 za sitan tekst. Pečat miruje (udar pripada slavlju).
9. **Završena kartica:** dugme „Ponovi" (vodi na prvu lekciju, kao i do sada), bez reda „Sledeće"; ikonica `PartyPopper` je uklonjena, jer to sada kažu pečat i kvačica. Red sa datumom poslednje aktivnosti je ostao.
10. **Sova stoji na ivici kartice u zoni „nastavi"** (200 px od `lg`, 96 px na telefonu, 8 px preko kartice) i jedini je `data-igra-hero` učionice. Nije `priority` (učionica nema IGRA scenu; LCP ostaje kartica). Zona je zbog nje viša za 131 px na računaru i 33 px na telefonu. Sova nema oblačić: nov tekst nije tražen.
11. **Aktivan korak meri slušalac skrola (jednom po frejmu) i čista funkcija `activeLessonStep`, ne IntersectionObserver** (plan). Kratak završni blok nikad ne bi stigao do linije čitanja (40 % visine ekrana), pa bi traka stala na „4 od 5"; pravilo zato kaže: kad strana nema više kuda da skroluje, to je poslednji korak. Čista funkcija je pod testom.
12. **Traka koraka je pilula sa svojim okvirom** (lebdi): `top-[4.5rem]` na telefonu (8 px ispod zaglavlja, izmereno 64 px), `md:top-3` na računaru; plan je rekao `top-16` / `top-0`. Stoji samo iznad leve kolone, da ne pokrije panel „Materijali" (`xl:sticky`). Nema je kad lekcija ima jedan blok ni u admin pregledu (`inlinePreview`).
13. **Posle završetka dugme „Završio/la sam ovu lekciju" postaje mirno** („Lekcija je završena", papir umesto žute), a žuto je „Sledeća lekcija". Naslov sledeće lekcije je red IZNAD dugmeta, ne u njemu (dugme sa naslovom ne staje na 390 px).
14. **„Lekcija je zapisana." stoji odmah** kad je lekcija već bila završena (`initialCompleted` sa servera ili raniji klik u istoj poseti); 4 s iz plana je samo rok do kog se čeka broj. Bez porasta XP-a broja nema, naslov ostaje „Lekcija završena".
15. **Sledeća lekcija** je naredna po redu, i kad je već završena (ponavljanje gradiva ide redom, kao knjiga). Posle poslednje lekcije nudi se prva nezavršena. „Kurs je završen" i samo „Nazad na kurs" stoje kad je lekcija upravo zatvorila kurs (plan je to vezao za poslednju lekciju po redu, što nije isto ako je student neku preskočio).
16. **`LessonDone` se montira i pre kraja** kao prazan `role="status"`: nov element sa gotovim tekstom čitač ekrana ne najavljuje.
17. **Plejer je dobio `useQuery(api.courses.getAppNavigation, {})`** (plan): isti upit i argumenti kao sidebar, pa je to ista pretplata. Bez Convex-a (`"skip"`) mali kraj ima samo „Nazad na kurs".
18. **Pro prikaz (`CourseLab`):** traka je red bez okvira ispod zaglavlja vežbe (žuti čip „1/3" je ostao); mali kraj stoji ispod donje trake, umesto poruke „Lekcija je zavrsena."; `handleNext` i ostala logika su isti.
19. **Pečat na stranici kursa** stoji uz „100%" u tamnom panelu „Pregled kursa" i ne crta se adminu (njemu tu piše „Admin"). Tekst ide kroz `tr()` u samom fajlu, ne kroz `lib/igra-copy`, jer `dashboard-content.tsx` ne sme da uvozi `lib/igra-*`.
20. **Link „Zajednica" na kartici ima `min-h-11`** (bio je visok 16 px, ispod mete za dodir).
21. **Veliko slavlje nije dirano.** `CelebrationHost`, `celebration-card.tsx` i `lib/igra-celebrations.ts` su isti; test čuva da učionica ne montira svoje slavlje ni konfete.
22. **Izlog:** hub, kartice i stranica kursa su PRAVE komponente nad test podacima. Plejer nije (piše u bazu), pa je lekcija u izlogu sklopljena od istih delova (traka, hook koraka, `useXpGain`, `LessonDone`), a „server" je tajmer koji posle 450 ms doda 100 XP. `DashboardContent` u izlogu dobija kurs bez `id`, da ne pita bazu za izdvojene teme.
23. **Test podaci:** sedam kurseva u tri smera; dva nose slug iz `lib/content.ts` (`vibe-coding`, `video-audio-ai`), pa imaju pravu naslovnu petlju i cenu. „Aktivan" ima iste brojeve kao tabla iz K08 (14 od 31 lekcije, lekcija 4 od 9).
24. **`lib/igra-shell.test.ts` (K06)** je u spisku dozvoljenih uvoznika domaćina slavlja dobio `izlog-ucionica.tsx`; tvrdnja je ista (ljuska + izlog, nigde drugde).
25. **Žuto dugme kartice (`tone="smoke"`) NIJE menjano**, iako je žut tekst na papiru oko 1,5:1 u svetloj temi. To je zatečen izbor boje glavnog dugmeta na kartici kursa; zamena je jedna reč (`quiet`) i ostavljena je Jovanu.
26. **Skillove iz pravila (`impeccable`, `design-taste-frontend`, `design-dna`, `motion-design`) nisam čitao cele pre pisanja UI-ja u ovom koraku**: radio sam po planu K07 §2 i obrascima iz K05–K08, a posle sam pročitao `impeccable/reference/craft-floor.md` i pustio detektor nad novim fajlovima (bez nalaza).
27. `IGRA_PLANNED_ART` i dalje ima tri reda (`lib/igra-art.ts` nisam dirao).

**Novi paketi:** nema.

**Testovi (3 nova fajla, 38 testova; 2 postojeća dopunjena):**
- `lib/igra-course-art.test.ts` (9): lik po temi na oba jezika, Sova bez pogotka, redosled pravila, ključna reč na početku reči (četiri lažna pogotka), smer tek kad kurs ne kaže ništa, kvačice i velika slova, kursevi iz kataloga i slika za svaki lik; tri stanja kartice i kurs bez lekcija.
- `lib/igra-lesson.test.ts` (15): aktivan korak (linija čitanja na piksel, kratak završni blok, kraj strane, bez blokova), natpis i `aria-*` trake sa stezanjem i lošim ulazom, `xpGain` (razlika, nikad negativna, loš ulaz), `nextLessonAfter` (naredna, naredna već završena, posle poslednje, kurs zatvoren, nepoznata lekcija), `lessonRefs` (redosled modula i lekcija, nacrti, stanje, prazan ulaz).
- `lib/igra-classroom.test.ts` (14): test korisnici (isti katalog, pet likova, novi / legenda, tri stanja i isti brojevi kao tabla, sledeća lekcija), tekstovi na oba jezika bez pretnje i nagrade, i čitanje izvora: novi delovi bez upita i test podataka, slike samo kroz `IgraArt`, obe kartice nose lik, jedan `data-igra-hero`, kostur ne vuče hub, „+N XP" se meri (nema `LEADERBOARD_XP` u UI-ju), plejer i Pro prikaz pamte XP PRE mutacije, kraj kursa slavi samo ljuska, plejer i dalje zove samo `courses.markProgress`.
- izmenjeni: `lib/igra-izlog.test.ts` (deo „ucionica"), `lib/igra-shell.test.ts` (ODLUKA 24).

**Slike:** `lik.sova.mase` (hub), `lik.sova|bajt|kadar|eho|piksi.mase` (kartice, kroz `igraLikArt`); u slavlju kao i do sada `scena.kurs-zavrsen` i `rang.pehar`. TRAŽENE SLIKE: nema.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran)
- typecheck: prošlo (i posle build-a)
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (307 fajlova, 3.397 testova)
- check:frames (u `ROOTS` su dodati `dashboard-course-card.tsx` i `classroom-hub-skeleton.tsx`), check:corners, check:white, check:igra (i `--strict`): prošlo
- build: prošao (dva puta, oba iz prvog pokušaja)
- **check:bundle: prošlo.**

| Šta (gzip) | Posle K08 | Posle K09 | Granica |
|---|---|---|---|
| `/app` početni JS | 291 KB | 290 KB | 294 |
| `/app/classroom` | 291 | 285 | 315 |
| `/app/classroom/courses/[courseSlug]` | 285 | 268 | 309 |
| `/app/classroom/courses/[courseSlug]/lessons/[lessonSlug]` | nije mereno | 280 | 317 |
| `/app/classroom/tracks/[trackSlug]` | nije mereno | 281 | 311 |
| `/app/community/leaderboard` | 280 | 278 | 303 |
| `/app/members/[username]` | 347 | 345 | 371 |
| javna početna | 139 | 139 | 153 |

  Pre izdvajanja kostura (ODLUKA 2) isti build je dao: učionica 296, kurs 295, lekcija 307, smer 292.
- **pregledač (Playwright, 1440 × 900 i 390 × 844, obe teme, sr i en), izmereno u izlogu:**
  - učionica: nema vodoravnog skrola ni na jednoj širini i temi; 0 slomljenih slika; jedan `data-igra-hero`; likovi na sedam kartica redom: sova, sova, sova, bajt, kadar, eho, piksi
  - Sova: 200 × 200 px na 1440 i 1024, 96 × 96 na 390; red sa pozdravom 168 px, odnosno 64 px (isto kao u kosturu); 8 px preko kartice
  - bez slika (blokiran `/brand/igra/**`): 0 slika, 8 od 8 fallback-a, ista visina učionice (5.503 px)
  - traka koraka: skrol kroz pet blokova daje 1, 2, 3, 4, 5; ispuna `scaleX` 0,2 → 1; lepljiva na 12 px od vrha u izlogu
  - mali kraj: 450 ms posle klika nema dijaloga; „Lekcija završena", „+100 XP", traka „Nivo 5, 590 od 1.000 XP", „Sledeće: Primeri u promptu"; XP test korisnika 1.890 → 1.990
  - ponovljen klik: „Lekcija je zapisana." bez broja, XP ostaje 1.990, i posle 4,5 s isto
  - kraj kursa: prvo mali kraj („Ovo je bila poslednja lekcija. Kurs je završen.", samo „Nazad na kurs"), zatim JEDAN dijalog „Kurs završen · Promptovi koji rade" sa `scena.kurs-zavrsen`, jednim 3D platnom i konfetama; `markSeen` dobija `course:fixture-course-promptovi-koji-rade` jednom; posle samogašenja i ponovljenog klika nema novog dijaloga
  - smanjen pokret: traka i XP odmah na vrednosti (`scale(0.2)`, `scale(0.59)`), „+100 XP" odmah; slavlje je mirna kartica u uglu, 0 dijaloga i 0 platna
  - telefon: dugmad malog kraja 306 × 44, 166 × 44 i 96 × 44 px; glavno dugme kartice 44 px visoko, link „Zajednica” po klasi `min-h-11`; mobilno zaglavlje prave ljuske je 64 px, pa traka koraka (72 px) stoji 8 px ispod njega
  - engleski: „Completed", „Review", „Progress for Prompts that work: completed", „Lesson complete", „Step 1 of 5 / Lesson steps", „Level 12, top level"; adrese kroz `/en/app/classroom/...`
  - stranica kursa: pečat uz „100%" u obe teme (snimci `K09-kurs-pecat-*`)
  - konzola: bez grešaka u običnom radu; jedino upozorenje je zatečeno `THREE.Clock`. Uz „smanji pokrete" React javlja nepoklapanje hidratacije na karticama kursa (zatečeno, vidi dole)
- impeccable detektor nad novim fajlovima: bez nalaza
- dev server je ugašen (portovi 3000 / 3123 / 3124 slobodni); Playwright `page-*.yml` i `console-*.log` i pomoćne skripte iz `.igra-run/` su obrisani.

**Prihvatanje (K09):**
- Učionica i plejer kursa rade u obe teme i na telefonu: **ispunjeno u izlogu** za učionicu, kartice, stranicu kursa i delove lekcije (snimci `K09-ucionica-*`, `K09-kartice-*`, `K09-lekcija-*`, `K09-kurs-pecat-*`); pravi plejer nad živim nalogom i Pro prikaz nisu gledani (BLOKADA).
- Slavlja se pojavljuju jednom: **ispunjeno u izlogu** (pravi `CelebrationHost`, jedan dijalog, ključ upisan jednom; snimci `K09-slavlje-*`), uz `convex/igra.test.ts` iz K04 koji čuva da `markSeen` upisuje jednom.
- typecheck / lint / test / check:frames prolaze, sekcija K09 u progress-u: **ispunjeno**.

**BLOKADA (samo provera, ne kod):** pravi plejer lekcije (`/app/classroom/courses/<kurs>/lessons/<lekcija>`) i Pro prikaz (`CourseLab`) nisu gledani u pregledaču. Razlog je isti kao u K06 i K08: žive iza prijave, a Playwright nije prijavljen (auth tok se ne dira, tuđe lozinke se ne unose); Pro prikaz uz to traži Pro plan i vežbu u bazi. Šta JESTE provereno: isti delovi u izlogu (traka, hook koraka, `useXpGain`, `LessonDone`, domaćin slavlja), typecheck nad povezivanjem i testovi nad izvorom (XP se pamti pre mutacije, plejer zove samo `markProgress`). Nije potvrđeno: (a) položaj lepljive trake ispod pravog mobilnog zaglavlja i uz panel „Materijali" na `xl`; (b) da XP iz `igra:getMyProgress` stigne pre nego što se `markProgress` vrati (ako stigne kasnije, broj se pojavi do 4 s posle naslova); (c) izgled trake i malog kraja u Pro prikazu; (d) stranica smera sa novom karticom (ista komponenta kao u učionici, ali bez nivoa površine).

**Za Jovana ujutru:**
- **Prijavi se na DEV i otvori lekciju koju nisi završio** (`npx next dev --webpack -p 3123`): klik na „Završio/la sam ovu lekciju" treba da pokaže „+100 XP" i „Sledeća lekcija"; drugi klik „Lekcija je zapisana." bez broja. Na telefonu pogledaj da traka koraka stoji tik ispod zaglavlja.
- **Završi poslednju lekciju nekog kursa:** prvo mali kraj, pa JEDNO slavlje „Kurs završen"; posle osvežavanja ne sme da se ponovi. Na kartici tog kursa i na njegovoj stranici treba da stoji pečat.
- **Pro prikaz lekcije** nisam video (BLOKADA): traka je ispod zaglavlja vežbe, mali kraj ispod donje trake sa „Back / Next".
- **Ukus:** Sova od 200 px spušta karticu „Nastavi gde si stao" za oko 130 px na računaru (snimak `K09-ucionica-1440-svetla.png`); ako je previše, širina je jedna klasa (`lg:w-[12.5rem]` u `classroom-hub.tsx`). Pečat je koral prsten sa tekstom u mastilu (ODLUKA 8). Nalepnica lika od 64 px na telefonu pokriva ugao naslovne slike.
- **Pravilo lika** je spisak reči u `lib/igra-course-art.ts`; kurs koji nijedna ne pogodi dobija Sovu. Kad dodaš nov kurs, pogledaj da li je dobio pravog lika.
- **Tekstovi za ton** (`IGRA_CLASSROOM_COPY`): „Lekcija završena", „Lekcija je zapisana.", „Ovo je bila poslednja lekcija. Kurs je završen.", „Ponovi".
- **Zatečeno, nisam dirao:**
  - žuto dugme na kartici kursa (`tone="smoke"`) je u svetloj temi oko 1,5:1 (ODLUKA 25);
  - „Sledece:" i „Jos nema aktivnosti" na kartici su bez kvačica;
  - nov korisnik u učionici vidi „Zdravo, …" dva puta (hub i blok „Tvoji prvi koraci");
  - korisnik koji je završio sve i dalje vidi „Nastavi gde si stao" sa 100 %, jer `getProgressSummary` za sledeću lekciju vraća prvu kad nezavršenih nema; blok „Sve lekcije su završene" se zato praktično ne prikazuje;
  - uz „smanji pokrete" kartice kursa (otključana i zaključana) crtaju `tabindex` na serveru, a ne u pregledaču (`whileTap`), pa React prijavi nepoklapanje hidratacije;
  - kostur kartice „Nastavi" je 256 px, a kartica 309–337 px (i pre ovog koraka).
- **Dodir na pravom telefonu i pravi čitač ekrana nisam imao.**

## K10 — Mapa puta (staze i kursevi)   (2026-10-14 06:15)
**Fajlovi:**
- novi (lib): `lib/igra-journey.ts` + test `lib/igra-journey.test.ts`
- novi (IGRA komponente): `components/igra/journey-map.tsx` (`JourneyMap`), `components/igra/course-journey.tsx` (`CourseJourney`: lekcije kursa → mapa)
- novi (izlog): `components/igra/izlog/izlog-mapa.tsx`, `docs/igra/snimci/K10-*.png` (22)
- izmenjeni (površine): `components/app/track-experience.tsx` (mapa iznad mreže kurseva), `components/app/dashboard-content.tsx` (samo prop `journey` i jedno mesto u panelu „Nastavni tok"), `components/app/dashboard-live.tsx` (`LazyCourseJourney` + prosleđivanje), `components/app/dashboard.tsx` (prosleđivanje u grani bez Convex-a)
- izmenjeni (ostalo): `app/globals.css` (klasa `.igra-journey-pulse` + keyframes), `lib/igra-copy.ts` (`IGRA_JOURNEY_COPY`, `IGRA_LESSON_FORMS`), `components/igra/izlog/registry.ts`, `lib/igra-izlog.test.ts`

**Šta je urađeno:** Staza i kurs imaju mapu puta: rukom nacrtanu liniju kroz stanice, na listu papira sa scenom `scena.mapa-puta` u pozadini. Na stranici kursa stanice su lekcije (mapa stoji u panelu „Nastavni tok", iznad postojećeg spiska), na stranici smera kursevi (iznad mreže kartica). Stanica je urađena (krug u mastilu sa kvačicom), sledeća (žut krug, Robi i pilula „Ti si ovde"), dostupna (prazan krug sa brojem) ili zaključana (isprekidan krug sa katancem). Pređeni deo puta je puna linija mastilom, ostatak tačkast; kad mapa uđe u kadar pređeni deo se iscrta (GSAP DrawSVG, koji se tek tada i skida), Robi iskoči, a žuta stanica otkuca tri puta i stane. Mapa ima dva rasporeda u istom HTML-u i bira ih CSS po širini same mape: uspravna linija sa stanicom na svakih 88 px (telefon) i vijugava putanja u redovima do pet stanica (šire od 40rem). Geometrija je čista funkcija broja stanica (`journeyLayout`), ista na serveru i u pregledaču, pa nema merenja u JavaScript-u, skoka posle hidratacije ni vodoravnog skrola. Stanice su jedna `<ol>` redom kojim ide put. `convex/`, rute i logika napretka nisu dirani.

**Površine:**
- gotovo: mapa puta 6.3 kao komponenta (1, 5 i 20 stanica, obe teme, 390 i 1440 px, sr i en, bez slika, smanjen pokret), stranica kursa (u izlogu, prava `DashboardContent` sa istim lenjim chunk-om), stranica smera (mapa u izlogu nad istom funkcijom `courseStations`).
- delimično: prava stranica smera i prava stranica kursa nad živim nalogom nisu gledane u pregledaču (BLOKADA dole).
- nije dirano: spisak lekcija ispod mape (ostaje zbog sažetaka i admin uređivanja), kartice kurseva, plejer, `convex/`.

**Kako se koristi (za K11 i dalje):**
- `<JourneyMap stations={…} locale label="…" className="…" />`; okvir i radijus daje pozivalac (`surface-inset` + tanka ivica u tuđem okviru, `surface-card border-2 border-ink` kad stoji sama).
- Stanice: `lessonStations({ courseSlug, lessons, canOpen, locale })` i `courseStations({ courses, locale })` iz `lib/igra-journey.ts`; proizvoljan niz kroz `journeyStates([{ done, locked }])`.
- `components/app/dashboard.tsx` i `dashboard-live.tsx` uvoze i `/app` i učionica (zbog `staticDashboardCourses` i re-exporta): IGRA kod sme u njih samo kroz `next/dynamic` (čuva test).

**ODLUKE (odstupanja od plana K07 §3 i ono što plan nije rekao):**
1. **Stanice kursa su objavljene lekcije, ne moduli.** Zadatak i IGRA-PLAN §2.3 kažu „moduli", K07 §3 kaže lekcije. Stranica kursa prikazuje kurs kao ravan spisak lekcija i naslove modula nigde ne ispisuje, a kurs sa jednim modulom imao bi mapu od jedne stanice. Radio sam po K07.
2. **Put su dve putanje (pređeni deo i ostatak), ne jedna sa `pathLength` i crticama do udela.** Tako je pređeni deo tačno do stanice bez numeričkog uzorkovanja dužine, vidi se i bez JavaScript-a, a DrawSVG ga samo otkriva od 0 do 100 %. `pathLength` i DrawSVG se uz to sudaraju (DrawSVG piše crtice u pikselima). Zato `journeyLayout` ne vraća udele dužine nego delove puta po stanicama.
3. **Raspored bira širina SAME mape (container query, prag 40rem), ne `md:` ekrana.** Ista mapa stoji u panelu kursa i na stranici smera, sa sidebarom i bez njega; na ekranu od 1024 px panel kursa je širok oko 660 px (računato iz 714 px sadržaja, K08) i dobija široki raspored.
4. **Široki raspored se skalira srazmerno** (viewBox širine 1000, najviše 65rem), jer DrawSVG ne ume da izmeri nesrazmerno razvučenu putanju. Posledica: razmak redova raste sa širinom (oko 158 px na mapi od 650 px, 275 px na mapi od 1.128 px). Zato od 60rem krug stanice raste sa 44 na 56 px, natpis sa 14 na 16 px, a Robi sa 56 na 80 px.
5. **Redovi su ujednačeni:** 7 stanica je 4 + 3, 6 je 3 + 3, 11 je 4 + 4 + 3 (plan: uvek po 5, pa ostatak).
6. **„Ti si ovde" je pilula u mastilu i Robi** (56 / 80 px, ne `md` 64): široko iznad stanice, uspravno uz desnu ivicu reda. Par je dekorativan; čitač ekrana isto čuje kao tekst u linku, a link nosi `aria-current="step"`.
7. **Scena je na 30 % (na telefonu 20 %),** plan je rekao oko 35 %. Na telefonu Robi stoji baš preko crteža kule, pa je tamo slabija. Natpisi imaju oreol u boji papira (kao na štampanoj mapi), da ostanu čitljivi preko crteža i preko krivine puta.
8. **Mapa kursa zaključava po vlasništvu (`isCourseOwned`), ne po `hasAccess`.** `hasAccess` je tačan za svaki objavljen kurs, pa bi kurs koji student nema imao „sledeću" stanicu i linkove ka lekcijama. Ovako je ceo zaključan i nijedna stanica nije link, isto pravilo kao katalog učionice. Admin vidi sve otključano.
9. **Smer crta mapu tek kad stigne vlasništvo** (`getAppNavigation`, isti upit i argumenti kao sidebar). Do tada mape nema i nema ni kostura: kurs koji student nema ne sme ni na trenutak da izgleda otključano. Admin (i admin pregled sadržaja) mapu dobija odmah.
10. **Mapa kursa je lenji chunk** (`LazyCourseJourney` u `dashboard-live.tsx`, `next/dynamic` sa SSR-om). Sa običnim uvozom mapa je preko `dashboard.tsx` ulazila u početni JS table i učionice: `/app` je bio 293 od 294 KB. Posledica: na stranici kursa mapa stigne trenutak posle spiska lekcija (ispod prevoja je).
11. **`DashboardContent` je dobio prop `journey?: ReactNode`** umesto uvoza mape: fajl se učitava na svakoj ruti aplikacije i ne sme da uvozi IGRA kod (test iz K08).
12. **Crtanje traje 0,6–1,6 s, po dužini pređenog puta** (plan: uvek 1,2 s): potez do prve stanice inače bi se crtao isto koliko i put kroz 15 stanica.
13. **Puls kreće tek kad se put iscrta** (`data-journey-drawn`), tri otkucaja po 1,4 s. Da je čist CSS, otkucao bi dok je mapa još ispod prevoja.
14. **Pređeni deo ide do „sledeće" stanice** i kad je pre nje zaključana ili preskočena; bez „sledeće" do poslednje urađene.
15. **Stanica smera uvek vodi na stranicu kursa** (i zaključana: tamo je kupovina). Ispod naslova piše „3/9 lekcija", za zaključan kurs samo „6 lekcija"; kod lekcija trajanje.
16. **Put počinje kratkim potezom pre prve stanice**, pa je mapa od jedne stanice „tačka i potez". Na kraju puta nema cilja ni zastavice (`rang.meta` nije upotrebljen).
17. **Mapa je svetao list i u tamnoj temi** (`paper-island`, boja `--igra-scene-paper`), kao heroj table.
18. **Skillovi:** pre UI koda sam pročitao `impeccable/SKILL.md` i `reference/craft-floor.md`, `design-taste-frontend/SKILL.md`, `design-dna/SKILL.md`, `gsap-react` i deo `gsap-plugins` o DrawSVG-u. Nisam čitao `design-dna-platform.json` ni `motion-design`, i nisam pokretao impeccable `context.mjs`.
19. `IGRA_PLANNED_ART` i dalje ima tri reda (`lib/igra-art.ts` nisam dirao).

**Novi paketi:** nema.

**Testovi (1 nov fajl, 40 testova; 1 postojeći dopunjen):**
- `lib/igra-journey.test.ts` (40): geometrija za 1, 2, 5, 6, 7, 9, 20 i 23 stanice (broj tačaka i delova, cela putanja u kutiji, svaki deo se završava u svojoj stanici), jedna stanica, pet u redu, dvadeset u četiri reda sa smenom smera, ujednačeni redovi, uspravni raspored na 88 px, susedne stanice susedne na putu, determinizam (bez `Math.random` i `Math.sin`), loš ulaz; podela puta na pređeni deo i ostatak; stanja stanica i dokle je put pređen; trajanje crtanja; stanice kursa i smera nad test korisnicima (stanja, adrese kroz `lib/app-routes`, nacrti, oba jezika, množina); tekstovi bez pretnje i nagrade; čitanje izvora: komponenta je prezentaciona, slike samo kroz `IgraArt`, DrawSVG samo lenjo i tek posle provere pokreta i ulaska u kadar, nema `pathLength`, `<ol>` sa `aria-current="step"`, raspored bez merenja u JavaScript-u, puls u no-preference bloku sa tri otkucaja, `dashboard-content.tsx` bez IGRA uvoza, mapa kursa samo kao lenji chunk, smer čeka vlasništvo.
- izmenjen: `lib/igra-izlog.test.ts` (deo „mapa").

**Slike:** `scena.mapa-puta` (pozadina), `lik.robi.mase` („Ti si ovde"). TRAŽENE SLIKE: nema.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran)
- typecheck: prošlo (i posle build-a)
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (308 fajlova, 3.437 testova)
- check:frames, check:corners, check:white, check:igra (i `--strict`): prošlo
- build: prošao (tri puta, svaki iz prvog pokušaja)
- **check:bundle: prošlo.**

| Šta (gzip) | Posle K09 | Posle K10 | Granica |
|---|---|---|---|
| `/app` početni JS | 290 KB | 290 KB | 294 |
| `/app/classroom` | 285 | 286 | 315 |
| `/app/classroom/courses/[courseSlug]` | 268 | 269 | 309 |
| `/app/classroom/courses/[courseSlug]/lessons/[lessonSlug]` | 280 | 281 | 317 |
| `/app/classroom/tracks/[trackSlug]` | 281 | 287 | 311 |
| `/app/community/leaderboard` | 278 | 279 | 303 |
| `/app/members/[username]` | 345 | 346 | 371 |
| javna početna | 139 | 139 | 153 |

  Pre lenjog chunk-a (ODLUKA 10) isti build je dao: `/app` 293, učionica 289, kurs 280.
- **pregledač (Playwright, 1440 × 900 i 390 × 844, obe teme, sr i en), izmereno u izlogu:**
  - 1, 5 i 20 stanica na 390, 700 i 1440 px: nijedna stanica ne prelazi preko druge ni van mape, „Ti si ovde" je uvek u mapi, nema vodoravnog skrola (strana 390 / 390, mapa 354 / 354), 0 slomljenih slika
  - visina mape: 1 stanica 124 px (telefon) / 297 px (1440); 5 stanica 476 / 297 px; 20 stanica 1.796 / 1.121 px; na 700 px (najuži široki raspored) 20 stanica 669 px
  - mete: red stanice na telefonu 88 px visok, široko 88–102 px
  - DrawSVG: pre nego što mapa uđe u kadar 0 zahteva, pređeni deo sakriven, drugi raspored netaknut; posle skrola jedan zahtev (`DrawSVGPlugin`), put se iscrta, zatim puls `igra-journey-pulse` × 3
  - smanjen pokret: 0 zahteva za DrawSVG, put i Robi odmah vidljivi, bez pulsa
  - fokus: Tab kroz 20 stanica ide redom kojim ide put, na 1440 i na 390 px; obrub fokusa 2 px u mastilu
  - čitač ekrana: lista „Mapa puta kroz kurs", 20 stavki, jedna `aria-current="step"` sa tekstom „Završni zadatak 7 min (Ti si ovde)", urađena „Šta je prompt 7 min (Urađeno)" (broj u krugu je skriven od čitača, redni broj daje lista)
  - bez slika (blokiran `/brand/igra/**`): papir sa mrežom, ista visina mape, Robi kao rezervna ikonica
  - stranica kursa: mapa je u HTML-u sa servera (3 mape u odgovoru), crta se kroz lenji chunk, 9 stanica; test korisnik bez kursa vidi sve stanice zaključane i bez linkova
  - kontrast (izračunato): sitan tekst na papiru mape 5,7:1, broj na žutoj stanici 7,7:1
  - konzola bez grešaka i bez upozorenja o hidrataciji; jedino upozorenje je poruka biblioteke `motion` dok je uključen smanjen pokret
- impeccable detektor nad novim fajlovima: bez nalaza
- dev server je ugašen (portovi 3000 / 3123 / 3124 slobodni, nijedan `next` ni `convex` proces); Playwright `page-*.yml` i `console-*.log` i pomoćni fajlovi iz `.igra-run/tmp` su obrisani.

**Prihvatanje (K10):**
- Mapa radi za kurs sa 1, 5 i 20 stanica, u obe teme i na telefonu: **ispunjeno u izlogu** (snimci `K10-mapa-1-*`, `K10-mapa-5-*`, `K10-mapa-20-*`, `K10-kurs-*`, `K10-smer-*`).
- typecheck / lint / test / check:frames prolaze, sekcija K10 u progress-u: **ispunjeno**.

**BLOKADA (samo provera, ne kod):** prava stranica kursa i prava stranica smera nad živim nalogom nisu gledane u pregledaču. Razlog je isti kao u K06, K08 i K09: žive iza prijave, a Playwright nije prijavljen (auth tok se ne dira, tuđe lozinke se ne unose). Šta JESTE provereno: ista mapa, iste funkcije za stanice i isti lenji chunk u izlogu, typecheck nad povezivanjem i testovi nad izvorom. Nije potvrđeno: (a) da `LiveStudentDashboard` posle upita prosledi mapu u panel; (b) da na stranici smera vlasništvo iz `getAppNavigation` stigne i da se mapa tada pojavi iznad kartica; (c) izgled mape u admin pregledu sadržaja (`admin-content-manager.tsx` crta istu `TrackExperience`).

**Za Jovana ujutru:**
- **Prijavi se na DEV i otvori stranicu kursa i stranicu smera** (`npx next dev --webpack -p 3123`): mapa treba da stoji u panelu „Nastavni tok", odnosno iznad kartica kurseva, sa Robijem na lekciji ili kursu koji ti je sledeći. Na smeru se pojavi trenutak posle ostatka strane (čeka vlasništvo, ODLUKA 9).
- **Lekcije, ne moduli** (ODLUKA 1): ako želiš module kao stanice, menja se samo `CourseJourney` (jedna funkcija za stanice), mapa ostaje ista.
- **Visina:** kurs od 20 lekcija ima mapu visoku 1.120 px na računaru i 1.800 px na telefonu, iznad spiska lekcija. Ako je previše, razmak redova (`rowGap`) i korak na telefonu (`step`) su dve konstante u `lib/igra-journey.ts`.
- **Kurs koji student nema** je na svojoj stranici ceo zaključan na mapi (ODLUKA 8), dok dugme „Nastavi lekciju" u zaglavlju i dalje postoji (zatečeno, `hasAccess`).
- **Ukus:** jačina scene (30 %, na telefonu 20 %), veličina Robija i pilula „Ti si ovde" u mastilu su po jedna klasa u `journey-map.tsx`. Snimci za poređenje: `K10-mapa-5-1440-svetla.png`, `K10-mapa-20-700-svetla.png` (najgušći slučaj), `K10-kurs-390-svetla.png`.
- **Zatečeno, nisam dirao:** spisak lekcija ispod mape ponavlja iste lekcije (ostao je zbog sažetaka i admin uređivanja, K07 ODLUKA 11); „Zdravo, student" i „Objavljen smer" na stranici smera nisu kroz `lib/i18n`.
- **Dodir na pravom telefonu i pravi čitač ekrana nisam imao.**

## K11 — Zajednica: heroj, objave, obaveštenja   (2026-10-14 06:45)
**Fajlovi:**
- novi (lib): `lib/igra-community.ts` + test `lib/igra-community.test.ts`
- novi (komponente): `components/igra/community/community-hero.tsx` (`CommunityHero`), `components/igra/community/author-rank-chip.tsx` (`AuthorRankChip`), `components/app/community-member-progress.tsx` (`LevelMeter` i `CommunityBadgeRow`, premešteni iz `community-gamification.tsx`)
- novi (izlog): `components/igra/izlog/izlog-zajednica.tsx`, `docs/igra/snimci/K11-*.png` (16)
- izmenjeni (zajednica): `components/app/community-v2/community-shell.tsx` (heroj), `community-shared.tsx` (čip na kartici teme, `art` u praznom stanju), `community-members.tsx` (`MemberCardView`), `community-mentions.tsx` (`NotificationFeed`, „pristiglo"), `community-discussions.tsx` (slika praznog stanja), `components/app/community-comments.tsx` i `community-thread-detail.tsx` (čip autora), `community-gamification.tsx` (ostali samo `VoteScore` i `useEnterOnView`), `member-profile.tsx` (uvoz + jedan izvor nivoa)
- izmenjeni (ostalo): `components/ui/empty-state.tsx` (opcioni `art`), `app/globals.css` (`.igra-arrive`), `lib/i18n.ts` (tekstovi koje je čitao stari `LevelMeter` / `CommunityBadgeRow`), `lib/igra-copy.ts` (`IGRA_COMMUNITY_COPY`), `lib/igra-fixtures.ts` (`COMMUNITY_FIXTURES`), `components/igra/izlog/registry.ts`, `lib/igra-izlog.test.ts`, `scripts/check-frames.mjs` (`ROOTS`)

**Šta je urađeno:** Zajednica ima nov heroj: list papira sa scenom trga (`scena.zajednica`) uz desnu ivicu, naslov sekcije, uvodna rečenica i Iskra sa kratkim pozivom po sekciji („Zapelo je? Pitaj. Neko je to već rešio.", „Zaprati nekoga ko uči isto što i ti."…); na telefonu je kompaktan (naslov + Iskra 64 px sa pozivom, bez scene, 165 px visine). Teme, komentari i detalj teme nose čip autora („17 lekcija") u redu sa imenom, iz `authorRank` koji red već nosi. Kartica člana ima nalepnicu nivoa (`nivo.NN` + „Nivo 4 · Istraživač") i XP traku, računate iz `xp` koji red liste već nosi, a značke su nalepnice bedževa (`BadgeSticker`) u podnožju. `LevelMeter` je sada sklopljen od `LevelStamp` + `XpBar` (nivo iz `levelFromXp`), pa član ima isti nivo u zajednici, na profilu i u ljusci. Obaveštenja: prazna stanja nose Iskru („Još nema obaveštenja") i uspavano zvono (`prazno.obavestenja`, „Sve je pročitano"); obaveštenje koje stigne dok je lista otvorena „doleti" odozgo, nosi marker „Upravo stiglo", a iznad liste se javi Iskra („Stiglo je nešto novo za tebe."). Pravila objava, moderacija, reakcije, upiti i `convex/` nisu dirani; nijedan upit nije dodat.

**Površine:**
- gotovo: heroj zajednice (sve sekcije, i detalj / nova / izmena teme), kartica teme, komentar i zaglavlje detalja teme (čip autora), lista članova (kartice), obaveštenja i pomeni (prazna stanja, „pristiglo"), prazna stanja diskusija i članova; nivo i značke na profilu člana (samo usklađeni, profil je K13).
- nije dirano: rang lista (K12; do tada nosi isti heroj sa scenom trga, `CommunityHero` ima prop `art`), moderacija i pregled u editoru (i dalje stari „Nivo N" ispod avatara, ODLUKA 2), prazna stanja „Moje teme" i komentara (K23), javne stranice zajednice.

**ODLUKE:**
1. **Na temi i komentaru NEMA pečata IGRA nivoa, nego čip sa brojem završenih lekcija.** Red teme i komentara nosi samo `authorRank` (`completedLessons` i stepen 1–5), ne XP. `getMemberProgress` po autoru je N+1; zbirni upit po strani bi dodao čitanje po temi i komentaru (i po strani odgovora), a `convex/community.ts` se po planu ne dira. Zato je prikazano samo ono što se već učitava (K01 §8). Čip namerno ne kaže „Nivo": stepen 1–5 iz lekcija je druga skala od 12 nivoa iz XP-a, pa bi isti čovek u temi bio „Nivo 3", a na profilu „Nivo 6". Autor bez lekcija i nalog tima nemaju čip.
2. **`RankBadge` i `community-identity.tsx` nisu dirani**, jer ih uvoze javne stranice zajednice (`(marketing)/community`). Teme, komentari i detalj teme sada crtaju avatar sa `showRank={false}` i čip u redu sa imenom. Moderacija i pregled u editoru i dalje imaju stari „Nivo N" (i na engleskom) ispod avatara.
3. **Heroj je nova komponenta, ne `IgraHero`.** Scena trga je crtana preko celog lista (nema prazan levi deo kao scene table), pa je ovde medij uz desnu ivicu sa levom ivicom pretopljenom u papir. Isto svetlo ostrvo i u tamnoj temi kao heroj table.
4. **Scena se crta tek od `lg`, NIJE `priority`, a unapred je traži `<link rel="preload" media="(min-width: 64rem)" fetchpriority="high">`** (`preload` iz `react-dom`, adresa iz registra slika). Telefon je zato ne skida (lenja slika u skrivenoj kutiji se ne traži, a preload ima `media`), a računar je dobija iz HTML-a. Prva verzija bila je samo lenja slika: merenje je pokazalo da na računaru LCP čeka scenu (brza 4G 1,98 s, spora 4G 8,97 s), pa je dodat preload (posle: 0,61 s i 3,36 s; brojevi su sa razvojnog servera, dole).
5. **Etikete iznad naslova heroja su uklonjene** („AI Studio Commons", „Moj napredak"…); umesto njih Iskra kaže poziv. Naslovi i uvodne rečenice su isti; uvodna rečenica se ispod `sm` ne prikazuje (kompaktno na telefonu, a panel „Ovo je Zajednica" je odmah ispod).
6. **Iskra je nalepnica i na računaru**, iako je nacrtana i u sceni (zadatak traži Iskru sa pozivom). U sceni je mala, u donjem desnom uglu.
7. **`LevelMeter` i `CommunityBadgeRow` su premešteni u `components/app/community-member-progress.tsx`** (ista imena, nije duplikat). U `community-gamification.tsx` su vukli pečat nivoa, GSAP hookove i katalog bedževa u svaku stranu koja uvozi samo `VoteScore` (feed, detalj teme, rang lista). Izmereno: rang lista 289 → 285 KB, detalj teme 309 → 304 KB posle premeštanja.
8. **Profil člana:** broj nivoa na avataru je sada IGRA nivo (`levelFromXp`), a iz reda „1.890 XP · Nivo 4" je izbačen deo sa nivoom (serverski `levelForXp`, 500 XP po nivou), jer odmah ispod `LevelMeter` ispisuje IGRA nivo. Inače bi ista kartica pokazala dva različita nivoa. Ostatak profila je K13.
9. **Značke zajednice su nalepnice bedževa sa istim uslovom** (K01 §8): `first_thread` → `prva-objava`, `first_helpful` → `koristan-odgovor`, `week_streak` → `niz-7`; „Deset komentara" ostaje ikonica. Računaju se iz signala koje strana već čita (kao i pre), ne iz dnevnika `igraSeen`, pa mogu da se vide pre nego što ih vlasnik „vidi" u aplikaciji. Test zaključava da se značka i bedž pale na istom pragu.
10. **Kartica člana je preuređena:** značke su u podnožju (dugme bedža ne sme da stoji u linku na profil), drugi `RoleBadge` u podnožju je uklonjen (uloga je i na avataru i u naslovu grupe), nalozi tima nemaju nivo (isto kao profil). Kartica je 221–229 px visoka (bila je oko 170–190).
11. **Prazna stanja:** `EmptyState` je dobio opcioni `art` (ilustracija umesto kruga sa ikonom; postojeći pozivi isti), a `EmptyCommunityState` prima `art` (IGRA ID, 96 px jer ekran ima heroja, K01 §1.3). Slike su dobili obaveštenja, diskusije (`prazno.objave`, uz pretragu `prazno.pretraga`) i članovi. „Moje teme" i komentari ostaju za K23.
12. **„Pristiglo":** polazna tačka je najnovije `createdAt` zatečeno pri otvaranju liste (serversko vreme sa obe strane, pa sat uređaja ne utiče); novije je „pristiglo", starije strane nikad. Lista se ponovo montira kad se promeni filter. Iskra se javlja JEDNOM iznad liste (ne po redu, K01 §1.3) i `aria-hidden` je, jer `aria-live` lista već čita novi red. Marker „Upravo stiglo" stoji umesto „Nepročitano" dok se ne pročita. Brojači u sidebaru nisu dirani.
13. **`lib/i18n.ts`:** iz `communityGamificationContent` su obrisani tekstovi koje je čitao samo stari `LevelMeter` (`levelLabel`, `toNextLevel`, `meterLabel`) i tri značke koje sada nose nalepnice; `badges` je postao `tenComments`. `lib/community-gamification.ts` se po planu ne menja: `levelProgress` i `XP_PER_LEVEL` sada čitaju samo njegovi testovi.
14. **Kartica obaveštenja:** `rounded-[16px]` → `surface-card` (ista vrednost) u redu koji je ionako menjan.
15. **Izlog:** `COMMUNITY_HERO_COPY`, `MemberCardView`, `NotificationFeed` i `NotificationCard` su izvezeni, da izlog crta prave komponente. Komentar nije prava komponenta (`CommentsSection` čita bazu), pa je red komentara sklopljen od istih delova (avatar + `AuthorRankChip`).
16. **Skillovi:** pročitani `impeccable/SKILL.md` i `reference/craft-floor.md`, `design-taste-frontend/SKILL.md` i početak `design-dna/SKILL.md`; `design-dna-platform.json` i `motion-design` nisam čitao. Gde se saveti sudaraju sa brendom (eyebrow, tvrde senke), važe brend i postojeći obrasci.
17. `IGRA_PLANNED_ART` i dalje ima tri reda (`lib/igra-art.ts` nisam dirao).

**Novi paketi:** nema.

**Testovi (1 nov fajl, 20 testova; 1 postojeći dopunjen):**
- `lib/igra-community.test.ts` (20): Iskrin poziv za svih šest sekcija na oba jezika (kratak, različit, bez pretnje; nepoznata sekcija i `toString`); čip autora (množina sr/en, separator hiljada, razlomak, bez ranga / nula / loš ulaz, nikad reč „nivo"); mapiranje značaka na bedževe i isti prag za „Koristan odgovor" i „Niz 7"; polazna tačka i „pristiglo" (strogo novije, prazna lista, starije strane); test podaci (prazno za novog, čip i bez čipa, sve uloge, nivoi 1–12, pročitano); **čitanje izvora:** nijedna površina zajednice ne zove `api.igra.*` / `getMemberProgress`, nove komponente su prezentacione i slike crtaju samo kroz `IgraArt`, `community-identity.tsx` (javne stranice) je bez IGRA koda, `community-gamification.tsx` ne vuče IGRA kod, `lib/igra-community` katalog uvozi samo kao tip, heroj je jedini `data-igra-hero` i scena nije `priority`, avatar sa `rank` ima `showRank={false}`, `.igra-arrive` je samo u no-preference bloku.
- izmenjen: `lib/igra-izlog.test.ts` (deo „zajednica").

**Slike:** `scena.zajednica` (heroj, od `lg`), `lik.iskra.mase` (heroj, prazna obaveštenja), `lik.iskra.slavi` („pristiglo"), `prazno.obavestenja`, `prazno.objave`, `prazno.pretraga`, porodica `nivo.*` (kartica i profil člana), `bedz.prva-objava`, `bedz.koristan-odgovor`, `bedz.niz-7`. TRAŽENE SLIKE: nema.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran; `git diff -- convex/` prazan)
- typecheck: prošlo
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (309 fajlova, 3.457 testova)
- check:frames (u `ROOTS` dodati `community-gamification.tsx` i `community-member-progress.tsx`), check:corners, check:white, check:igra (`--strict`): prošlo
- `lib/igra-community.test.ts` čuva i preload (`media: "(min-width: 64rem)"`, `fetchPriority: "high"`)
- build: prošao (tri puta, svaki iz prvog pokušaja; poslednji posle preload-a, brojevi u tabeli isti)
- **check:bundle: prošlo.**

| Šta (gzip) | Posle K10 | Posle K11 | Granica |
|---|---|---|---|
| `/app` početni JS | 290 KB | 290 KB | 294 |
| `/app/community` (preusmerenje) | — | 278 | 294 |
| `/app/community/discussions` | nije mereno | 292 | 309 |
| `/app/community/[postId]` | nije mereno | 304 | 321 |
| `/app/community/leaderboard` | 279 | 285 | 303 |
| `/app/members/[username]` | 346 | 359 | 371 |
| javna početna | 139 | 139 | 153 |

  Heroj (manifest slika + `IgraArt` + Iskra) dodaje oko 6 KB svakoj ruti zajednice; profil člana dobija još nalepnice bedževa i pečat nivoa (+13 KB). Pre premeštanja `LevelMeter`-a (ODLUKA 7) isti build je dao: rang lista 289, diskusije 298, detalj teme 309, profil 360.
- **pregledač (Playwright, 1440 × 900 i 390 × 844, obe teme, sr i en), izmereno u izlogu:**
  - heroj: 1180 × 267 px na 1440, 165 px na 390; na 390 scena je `display: none` i ne skida se (sveži kontekst: 0 zahteva, posle širenja na 1440 jedan); nema vodoravnog skrola (390 / 390)
  - čipovi na pet tema: „64 lekcije", „1 lekcija", „17 lekcija", admin bez čipa, autor bez lekcija bez čipa; engleski „64 lessons", čitač „Lessons completed: 64"
  - kartice članova: nivoi 12, 8, 5, 4, 2, 1 (amblemi `nivo.12` … `nivo.01`), admin i moderator bez nivoa; bedž „Koristan odgovor" kao nalepnica sa nazivom dugmeta
  - „pristiglo": 100 ms posle dodavanja red ima animaciju `igra-arrive` (providnost 0,76, pomeraj −2,8 px), posle 0,9 s stoji (1, bez pomeraja); marker „Upravo stiglo" i Iskra iznad liste; „Označi pročitano" skida i marker i Iskru; promena filtera ne obeležava ništa kao pristiglo
  - smanjen pokret: `animation-name: none`, red odmah vidljiv, marker i dalje stoji
  - prazna stanja (test korisnik „novi"): `prazno.objave`, `prazno.pretraga`, `lik.iskra.mase`, svaka 96 px; 0 slomljenih slika
  - konzola: bez grešaka posle učitavanja (jedina greška u logu je prolazna sintaksna greška dok je HMR hvatao fajl usred izmene)
  - **brzina heroja** (CDP, bez keša, razvojni server sa oko 6 MB razvojnog JS-a; isto merenje kao K08), FCP / LCP / CLS:

| | brza 4G (9 Mbit/s, 60 ms) | spora 4G (1,6 Mbit/s, 150 ms) |
|---|---|---|
| 1440, samo lenja scena (prva verzija) | 564 / 1.980 ms / 0,002 | 768 / 8.968 ms / 0,002 |
| 1440, lenja scena + preload od `lg` (predato) | 428 / 612 ms / 0,002 | 820 / 3.356 ms / 0,002 |
| 390 (predato) | 388 / 388 ms / 0,002 | 784 / 784 ms / 0,002 |

    Na računaru je LCP element scena (preload kreće na 180 ms, uz `fetchpriority=high`); na telefonu je LCP tekst heroja i za scenu nema nijednog zahteva (ni preload, ni slika). Spora 4G na računaru je 3,4 s jer se scena od 142 KB deli vezu sa 6 MB razvojnog JS-a; produkcioni početni JS je oko 300 KB gz, a izlog u produkciji ne postoji, pa produkcioni broj nije izmeren (BLOKADA).
- dev server je ugašen (portovi 3000 / 3123 / 3124 slobodni); Playwright `page-*.yml` i `console-*.log` obrisani. Pomoćni fajlovi iz `.igra-run/tmp/` su obrisani, a prazni folderi `.igra-run/tmp/` i `.igra-run/tmp/__pycache__/` su ostali (bezbednosna provera nije dala da se folder obriše; git ih ne vidi).

**Prihvatanje (K11), stavku po stavku:**
1. „Zajednica je vizuelno pojačana u obe teme": **ispunjeno** — heroj, teme, komentari, članovi i obaveštenja u svetloj i tamnoj temi, izlog nad pravim komponentama (snimci `K11-*-svetla.png` / `K11-*-tamna.png`).
2. „… i na telefonu": **ispunjeno** — 390 × 844 bez vodoravnog skrola, heroj 165 px, prazna stanja i kartice (snimci `K11-*-390-*`).
3. „… bez gubitka brzine": **ispunjeno za ono što je merljivo, ostatak je BLOKADA 1.** Nijedan nov upit ni čitanje u bazi (test nad izvorom); početni JS svih ruta u budžetu (heroj +6 KB rutama zajednice); telefon ne skida scenu i LCP mu je tekst (388 ms brza 4G); na računaru scena stiže kroz preload (LCP 612 ms brza 4G); CLS 0,002. Poređenje pre / posle na produkcionom buildu nad pravim nalogom nije moguće (BLOKADA 1).
4. „typecheck / lint / test / check:frames prolaze": **ispunjeno** (lint 0 grešaka, 309 fajlova / 3.457 testova).
5. „sekcija K11 u progress-u": **ispunjeno** (ova sekcija).
6. Uz to: prave strane zajednice nad živim nalogom nisu gledane u pregledaču — **BLOKADA 2**.

**BLOKADA 1 — „bez gubitka brzine" nije izmereno kao poređenje pre / posle u produkciji.** Razlog: strane zajednice žive iza prijave (`/app/community/*` vraća 307 na prijavu), Playwright nije prijavljen, a auth tok se po pravilima ne dira i tuđe lozinke se ne unose; izlog, gde su komponente izmerene, u produkcionom buildu vraća 404 (po pravilu). Izmereno je na razvojnom serveru (tabela gore) i iz build-a (početni JS po ruti). Šta treba: Lighthouse nad `/app/community/discussions` na prijavljenom nalogu, pre i posle ovog commita (K28 ili Jovan ručno).

**BLOKADA 2 (samo provera, ne kod):** prave strane zajednice nad živim nalogom nisu gledane u pregledaču, iz istog razloga kao u K06–K10. Izlog crta prave komponente (`CommunityHero`, `ThreadCard`, `MemberCardView`, `NotificationFeed`, `LevelMeter`, `CommunityBadgeRow`), a typecheck pokriva povezivanje. Nije potvrđeno: (a) da `authorRank` sa servera stiže na svaku temu i komentar kao u test podacima; (b) „pristiglo" nad pravim Convex-om (novo obaveštenje dok je strana otvorena).

**Za Jovana ujutru:**
- **Prijavi se na DEV i otvori `/app/community/discussions`, `/members` i `/notifications`** (`npx next dev --webpack -p 3123`). Za „pristiglo": sa drugog naloga odgovori na svoju temu dok su obaveštenja otvorena — red treba da doleti sa markerom „Upravo stiglo", a Iskra da se javi iznad liste.
- **Pečat nivoa na temama i komentarima ne postoji (ODLUKA 1).** Ako ga hoćeš, cena je jedno `leaderboardStats` čitanje po temi i po komentaru u `convex/community.ts` (polje sa XP-om autora u redu); posle toga je `LevelStamp size="xs"` u redu sa imenom jedna linija. Do tada čip kaže broj lekcija.
- **Moderacija i pregled u editoru** još pokazuju stari „Nivo N" ispod avatara (ODLUKA 2); javne stranice zajednice takođe.
- **Ukus:** heroj na računaru (snimak `K11-heroj-1440-svetla.png`): scena zauzima desnih 46 %, Iskra je nalepnica od 64 px sa oblačićem. Pozivi po sekciji su u `IGRA_COMMUNITY_COPY` (`lib/igra-copy.ts`).
- **Profil člana:** `members/[username]` ima još 12 KB do budžeta (359 / 371); K13 tu dodaje policu bedževa.
- **Prazni folderi** `.igra-run/tmp/` i `.igra-run/tmp/__pycache__/` mogu da se obrišu ručno.
- **Zatečeno, nisam dirao:** vreme na karticama ispisuje mesec ćirilicom („14. окт", `sr-RS`); „1 doprinosa" nema množinu; toast „Zapratiio/la si" ima dva „i".
- **Dodir na pravom telefonu i pravi čitač ekrana nisam imao.**

## K12 — Rang liste i podijum   (2026-10-14 07:40)
**Fajlovi:**
- novi (lib): `lib/igra-leaderboard.ts` + test `lib/igra-leaderboard.test.ts`
- novi (komponente): `components/igra/podium.tsx` (`Podium`), `components/igra/leaderboard/rank-avatar.tsx`, `week-countdown.tsx`, `flip-order.tsx`
- novi (izlog): `components/igra/izlog/izlog-rang.tsx`, `docs/igra/snimci/K12-*.png` (9)
- izmenjeni (rang lista): `components/app/community-v2/community-leaderboard.tsx` (podijum, lista, „ti" red, odbrojavanje, kostur; izvezeni `LeaderboardView`, `useLeaderboardPeriod`, tip `LeaderboardViewer`), `community-shell.tsx` (scena `scena.podijum` na rang listi)
- izmenjeni (isti izvor mesta): `components/app/dashboard-home.tsx`, `components/app/dashboard-windows.tsx` (pločica „Rang"), `lib/igra-shell.ts` (`weekPlaceView`)
- izmenjeni (ostalo): `components/igra/motion/use-enter-stagger.ts` (ODLUKA 7), `components/igra/odometer.tsx` (veličina `sm`), `lib/igra-copy.ts` (`IGRA_LEADERBOARD_COPY`, oblici „sat" i „minut"), `lib/igra-fixtures.ts` (`fixtureLeaderboard`, `rankFixtureRows`), `components/igra/izlog/registry.ts`, `lib/igra-izlog.test.ts`
- uklonjeno jer je ostalo bez korisnika: `useEnterOnView` iz `components/app/community-gamification.tsx` i `.community-rank-row` (+ keyframes) iz `app/globals.css`

**Šta je urađeno:** Rang lista (`/app/community/leaderboard`) ima podijum: prva tri mesta sa medaljom (`rang.zlato|srebro|bronza`) prikačenom na avatar, avatarom u prstenu nivoa (kad je nivo poznat, ODLUKA 2) i XP-om kao odometrom. Od `md` su to tri stuba na stepenicima koji stoje na donjoj ivici kartice (drugo levo, prvo u sredini na žutom stepeniku, treće desno; prazno mesto je isprekidan stepenik), a iznad prvog mesta je 3D pehar (lenjo, samo računar sa mišem; inače nalepnica `rang.pehar`). Na telefonu je podijum tri reda sa medaljama, bez 3D-a. Lista ispod ulazi stagger-om, a kad osvežen upit promeni redosled, redovi klize na novo mesto kroz GSAP Flip (plugin se skida lenjo, samo uz dozvoljen pokret). XP se vrti samo pri prvom prikazu liste; redovi koji stignu posle („Učitaj još", osvežen upit) odmah stoje na vrednosti. „Ti" red je lepljiv na dnu ekrana dok se gleda lista (iznad donjeg menija na telefonu): kad sam van učitanog dela liste uvek stoji, kad je moj pravi red (ili moje mesto na podijumu) u kadru povuče se, a bez XP-a u tom periodu je blag poziv („Još nisi na ovoj listi · Prva lekcija ili rad ove nedelje i na listi si."). Iznad podijuma je odbrojavanje do stvarnog kraja nedelje iz `weekKey` liste („Nedelja se završava za 4 dana i 16 sati · u ponedeljak u 00:00"), na minut, bez sekundi i bez boje hitnosti. Pločica „Rang" na kontrolnoj tabli sada čita mesto iz istog izvora kao ljuska (`igra:getMyProgress.weekRank`). Upiti, XP pravila i `convex/` nisu dirani.

**Površine:**
- gotovo: rang lista 6.4 / §5 — podijum (1, 2 i 3 člana, izjednačeni), lista (stagger, Flip, odometar pri prvom prikazu, nivo na „Ukupno"), „ti" red (na podijumu, u listi, van učitanog dela, bez XP-a, nalog tima), filteri Ova nedelja / Ukupno (postojeći), odbrojavanje, prazno stanje (link vodi u učionicu umesto na nepostojeći `/app/courses`), kostur iste visine; heroj rang liste sa scenom podijuma; pločica „Rang" na tabli.
- nije dirano: filteri opsega (globalno / smer / kurs), `LearningSpine` i „Kako se dobija XP", javne stranice zajednice, `convex/leaderboard*.ts`, `convex/dashboard.ts`.

**ODLUKE:**
1. **Filter Sve / Učenje / Crea se ne uvodi.** `leaderboardStats` ima jedno polje `xp` (provereno u `convex/schema.ts`); razdvajanje bi tražilo nov agregat i promenu obračuna. Ista odluka kao K01-11.
2. **Nivo (prsten oko avatara i „Nivo N") se prikazuje samo na listi „Ukupno" za celu platformu.** Red liste nosi XP svog perioda i opsega, pa je samo tada to ukupan XP iz kog se računa 12 nivoa (`rowXpIsTotal`). Na nedeljnoj listi i u smeru ili kursu nivo bi bio izmišljen (nivo iz nedeljnog XP-a), a tačan bi tražio novo čitanje po redu (zadatak zabranjuje menjanje rang upita). Serverski `row.level` (500 XP po nivou) se više ne ispisuje (isto kao K11 na profilu). Ako želiš prsten i na nedeljnoj listi: jedan nov upit `igra:levelsOf({ userIds })` sa ≤ 23 indeksirana `.unique()` čitanja po strani — nisam ga pravio.
3. **Isti izvor mesta (tačka 6) je `igra:getMyProgress.weekRank`**, koji ljuska već drži; pločica „Rang" na tabli ga čita kroz `weekPlaceView` (`lib/igra-shell.ts`) umesto `overview.leaderboard`. Dalje od 100 redova ispred, gde `weekRank` namerno nema broj (K04 ODLUKA 1), pločica kaže „100+" sa rečenicom „Van prvih 100 ove nedelje. Tačno mesto je na rang listi."; nalog tima i nula XP-a dobijaju crtu sa istom rečenicom kao panel. Puls čeka i napredak (kao misija u K08), da se ne prikaže crta pa broj. `convex/dashboard.ts` nije diran, pa `getDashboardOverview` i dalje računa `leaderboard` (do 1.000 malih dokumenata) koji UI više ne čita — vidi „Za Jovana".
4. **„Ti" red je u toku strane (sticky), sa rezervisanim mestom**, i samo se providnošću povuče kad je moj pravi red u kadru (bez skoka strane). Posledica: na kratkoj listi kad sam na podijumu ispod liste ostaje prazan pojas od 72 px. Desno ostavlja 56 px za globalno dugme „Nazad na vrh" (`ScrollToTop`, fiksno, isto mesto i u aplikaciji), koje bi inače pokrilo XP.
5. **3D pehar se okrene jednom (`spin="once"`)**, ne ljulja se stalno (K01 §4 je za podijum predvideo `idle`): IGRA-PLAN §2.4 kaže da se ništa ne vrti u petlji bez potrebe, a petlja bi crtala 60 fps dok je podijum u kadru.
6. **Flip hvata stanje u `getSnapshotBeforeUpdate`** (mala klasa u `flip-order.tsx`): to je jedini trenutak u kom DOM još stoji po starom redosledu, pa skrol između dva osvežavanja ne kvari animaciju. Flip ide samo kad se promeni redosled redova koji postoje i pre i posle (`rankOrderChanged`); „Učitaj još" ne pokreće Flip. Prelazak između podijuma i liste (npr. 4. → 3.) nije Flip (dve različite liste), red se samo pojavi na novom mestu.
7. **Izmenjen `useEnterStagger` iz K03:** posmatrač sada gleda SVAKU novu stavku, ne samo prvu. Kad se skrolom uskoči usred duge liste (500 redova, povratak na stranu), prva stavka nikad ne pređe u kadar i cela lista je ostajala nevidljiva (uhvaćeno u izlogu). Za ostale liste ponašanje je isto.
8. **Ulaz redova je GSAP (`useEnterStagger`), ne više CSS `.community-rank-row`** (K01 je rekao da ostane): CSS animacija sa `forwards` drži `transform: none` iznad inline stilova, pa Flip ne bi bio vidljiv. Stara klasa i `useEnterOnView` su ostali bez korisnika i obrisani. `podiumAccentVar` u `lib/community-gamification.ts` sada čita samo njegov test (K01: taj fajl i testovi se ne menjaju).
9. **Odbrojavanje:** kraj je ponedeljak 00:00 po Beogradu iz `weekKey` koji vraća `getViewerLeaderboardRow` (`periodKey`); dok ne stigne, isti ključ se računa u pregledaču (`belgradeWeekKey`). Tekst je zaokružen nadole i računa se od kraja tekućeg minuta (nikad ne obeća više vremena). Kad je kraj prošao, a lista se još nije osvežila, odbrojavanja nema. Ne crta se na serveru (nema nepoklapanja pri hidrataciji) i stoji VAN `aria-live` oblasti liste, da ga čitač ne izgovara svakog minuta. Na „Ukupno" ga nema.
10. **Mesto u listi broji isto kao server** (isti XP deli mesto, sledeći XP je sledeće mesto: 5, 5, 6). Na podijum idu prva tri reda sa mestom ≤ 3; četvrti izjednačen ide u listu sa istim brojem.
11. **Medalja na avataru** se na telefonu smanjuje kroz `scale` (nalepnica nosi širinu u inline stilu), da ne pokrije inicijale.
12. **Izlog:** deo „Rang lista" (`/igra-izlog?deo=rang&stanje=novi|aktivan|legenda`) crta PRAVU `LeaderboardView` i `CommunityHero`; prekidači 0 / 3 / 50 / 500 članova, „Nalog tima", „Učitava se" i dva dugmeta koja rade ono što radi Convex („Deveti pretekne petog", „Ja: tri mesta gore"). Test podaci: legenda je #1, aktivan je #2 (3 člana), #11 (50) i daleko iza učitanog dela (500), novi nema XP-a.
13. **Skillovi:** pročitani `impeccable/SKILL.md` + `reference/craft-floor.md` (pušten i `context.mjs`: nema PRODUCT.md, sužena dorada postojeće površine), `design-taste-frontend`, početak `design-dna-platform.json`, `gsap-plugins` (Flip). Detektor nad novim fajlovima: bez nalaza.
14. `IGRA_PLANNED_ART` i dalje ima tri reda (`lib/igra-art.ts` nisam dirao).

**Novi paketi:** nema.

**Testovi (1 nov fajl, 25 testova; 1 postojeći dopunjen):**
- `lib/igra-leaderboard.test.ts` (25): kraj nedelje zimi i leti, nedelje sa promenom sata (167 i 169 sati), slaganje sa serverskim `belgradeWeekKey`, loš ključ; tekst odbrojavanja (na minut, nadole, množina sr/en, loš ulaz), odbrojavanje u sredu, posle kraja i iz budućnosti, bez sekundi i bez reči žurbe i pretnje u svakom koraku od 15 min kroz celu nedelju; podijum i izjednačeni, stepenici, kada je nivo poznat, kada ide Flip; „ti" red (nalog tima, prazna lista, bez XP-a, na listi / van nje) i poziv po opsegu; `weekPlaceView` (mesto, medalja, „100+", nalog tima, nula XP-a, bez napretka) i da tabla čita mesto iz napretka ljuske; test podaci za 0 / 3 / 50 / 500 (broj redova, mesta kao na serveru, izjednačeni, jedinstvena imena, gde stoji „ti"); izvor: podijum, Flip, odbrojavanje, lepljiv red iznad donjeg menija, prazno stanje vodi u učionicu, Flip i 3D samo lenjo, komponente bez upita i test podataka, odbrojavanje bez serverskog crtanja, rang upit nepromenjen.
- izmenjen: `lib/igra-izlog.test.ts` (deo „rang").

**Slike:** `scena.podijum` (heroj rang liste, od `lg`), `rang.zlato|srebro|bronza` (podijum), `rang.pehar` (nalepnica ispod 3D pehara i prazno stanje), `lik.iskra.mase` (heroj, postojeće). TRAŽENE SLIKE: nema.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran)
- typecheck: prošlo (i posle build-a)
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (310 fajlova, 3.482 testa)
- check:frames, check:corners, check:white, check:igra (`--strict`): prošlo
- build: prošao iz prvog pokušaja; `next start` (port 3124): `/` 200, `/igra-izlog?deo=rang` i `/en/igra-izlog?deo=rang&stanje=legenda` 404, `/app/community/leaderboard` 307 na prijavu
- **check:bundle: prošlo.** `/app/community/leaderboard` 285 → 291 KB gz (budžet 303); `/app` 291 (isto, budžet 294); ostale rute iste. three i GSAP Flip samo u async chunk-ovima.
- **pregledač (Playwright, izlog, 1440 × 900 i 390 × 844, obe teme, sr i en), izmereno:**
  - nema vodoravnog skrola ni u jednom slučaju; 0 slomljenih slika; 1 platno (3D pehar) na 1440, 0 na 390
  - odometar: 350 ms posle prikaza podijum pokazuje 788 / 753 / 721, posle 2 s 1.240 / 1.185 / 1.135
  - „ti" red (#11 od 50): vidljiv dok je moj red van kadra, povučen (`opacity 0`, `inert`) kad je moj red u kadru, ponovo vidljiv kad se skroluje dalje; kod 500 članova stoji #222 stalno (van učitanih redova)
  - Flip: posle „Deveti pretekne petog" red Marko Simić (#9 → #5) je 120 ms kasnije na `translateY(67,8 px)`, a četiri preskočena reda na `−16,9 px`; posle 0,9 s svi bez transformacije; GSAP Flip chunk skinut jednom
  - „Učitaj još" kod 500: 17 → 37 redova; nalog tima: nema „ti" reda, stoji napomena da se tim ne rangira; 0 članova: prazno stanje sa `rang.pehar`, link „Otvori kurseve" → `/app/classroom`
  - smanjen pokret: XP odmah krajnji, 0 skrivenih redova, 0 platna, Flip se ne skida
  - engleski: „This week ends in 4 days and 16 hours · Monday at 00:00", „You are not on this list yet", „Rank 1 on the leaderboard: …", linkovi `/en/app/members/…`
  - tabla (izlog „tabla"): pločica „Rang" aktivan `#7`, legenda `#1` sa medaljom, novi `—` sa „Prva lekcija ili rad ove nedelje i na listi si."
  - kostur: podijum 224 / 432 px naspram 222 / 431 px kad podaci stignu
  - konzola: bez grešaka; jedino upozorenje je zatečeno `THREE.Clock`
- dev server i `next start` su ugašeni (portovi 3000 / 3123 / 3124 slobodni); Playwright `page-*.yml` i `console-*.log` i pomoćni fajlovi iz `.igra-run/tmp/` su obrisani.

**Prihvatanje (K12):**
- „Rang lista radi sa 0, 3, 50 i 500 korisnika (fixtures), u obe teme i na telefonu": **ispunjeno u izlogu** (snimci `K12-rang-0-*`, `K12-rang-3-*`, `K12-rang-1440-*` i `K12-rang-390-*` (50), `K12-rang-500-390-*`, `K12-rang-novi-390-tamna`, `K12-rang-ukupno-1440-*`; merenja gore).
- typecheck / lint / test / check:frames prolaze, sekcija K12 u progress-u: **ispunjeno**.

**BLOKADA (samo provera, ne kod):** prava rang lista nad živim nalogom nije gledana u pregledaču, iz istog razloga kao u K06–K11 (Playwright nije prijavljen; auth tok se ne dira). Izlog crta pravu `LeaderboardView`; nije potvrđeno: (a) da `periodKey` iz `getViewerLeaderboardRow` stiže i vodi odbrojavanje po serverskoj nedelji; (b) Flip nad pravim reaktivnim osvežavanjem `usePaginatedQuery`; (c) pločica „Rang" na pravoj tabli.

**Za Jovana ujutru:**
- **Prijavi se na DEV i otvori `/app/community/leaderboard`** (`npx next dev --webpack -p 3123`): podijum, odbrojavanje i „ti" red; prebaci na „Ukupno" (tek tada prstenovi nivoa, ODLUKA 2).
- **`getDashboardOverview` i dalje računa mesto na listi koje tabla više ne prikazuje** (ODLUKA 3). Uklanjanje `leaderboard` iz tog upita štedi do 1.000 čitanja pri svakom otvaranju table, ali to je izmena rang čitanja koju ovaj korak nije smeo da napravi — tvoja odluka.
- **Nivo na nedeljnoj listi:** ako ga želiš, to je jedan nov mali upit (ODLUKA 2).
- **Ukus:** stepenici (žut za prvo mesto, siv za drugo i treće), veličina 3D pehara (`w-24 lg:w-28` u `podium.tsx`), tekst odbrojavanja u `IGRA_LEADERBOARD_COPY` (`lib/igra-copy.ts`). Snimci: `K12-rang-1440-svetla.png`, `K12-rang-ukupno-1440-svetla.png`, `K12-rang-390-tamna.png`.
- **Zatečeno, nisam dirao:** tekst praznog stanja kaže „Završi jednu lekciju na ovom kursu" i na globalnoj listi; napomena za tim i pojedini natpisi liste su i dalje `locale === "sr" ? …` u samom fajlu (nisu u `lib/i18n`).
- **Dodir na pravom telefonu i pravi čitač ekrana nisam imao.**

## NAPOMENE ZA SLEDEĆE KORAKE (Claude, nadzor runa, 2026-10-14 07:55)
- **K26 (telefon):** na rang listi na 390 px traka filtera seče drugi prekidač („Ova nedelja | Ukupno" viri preko desne ivice, snimak `docs/igra/snimci/K12-rang-390-tamna.png`). Proveri da li je to namerni vodoravni skrol; ako nije, prelomi traku u dva reda ili skrati natpise.
- **K24/K26:** na računaru natpis „Ova nedelja" u prekidaču se lomi u dva reda (`K12-rang-1440-svetla.png`); prekidač treba da drži natpis u jednom redu (`whitespace-nowrap` ili šire dugme).

## K13 — Profil (moj i tuđi) i trofejna polica   (2026-10-14 08:20)
**Fajlovi:**
- novi (lib): `lib/igra-banners.ts`, `lib/igra-profile.ts` + testovi `lib/igra-banners.test.ts`, `lib/igra-profile.test.ts`
- novi (komponente): `components/igra/profile/profile-banner.tsx` (`ProfileBanner`), `banner-picker.tsx` (`BannerPicker`), `player-stats.tsx` (`PlayerStats`), `profile-activity.tsx` (`ProfileActivity`), `components/app/member-profile-igra.ts` (hook `useMemberIgra`, jedini upit profila)
- novi (izlog): `components/igra/izlog/izlog-profil.tsx`, `docs/igra/snimci/K13-*.png` (12)
- izmenjeni (Convex): `convex/schema.ts` (samo opciono polje `users.igraBanner`), `convex/igra.ts` (`setBanner`; `getMemberProgress` dobija `todayKey`), `convex/igraCore.ts` (`banner` u oba upita, `works` za godinu, `levelOf`), `convex/igra.test.ts`
- izmenjeni (profil): `components/app/member-profile.tsx` (zaglavlje sa banerom, karta igrača, polica, aktivnost; stari `ActivityHeatmap` i red značaka uklonjeni)
- izmenjeni (primitivi): `components/igra/trophy-shelf.tsx` (filter po grupi, naslov sekcije, skelet mreže), `components/igra/ink-calendar.tsx` (`title`, `empty`, `weeks`, `stacked`, `children`), `lib/igra-badge-view.ts` (stanje `hidden`), `lib/igra-calendar.ts` (gramatika „u poslednje 52 nedelje“)
- izmenjeni (ostalo): `lib/igra-copy.ts` (`IGRA_PROFILE_COPY`, `badgeNotShown`, oblici zadatak / rad / objava), `lib/igra-fixtures.ts` (baneri test korisnika, `PROFILE_FIXTURES`, `memberProgressFixture`), `components/igra/izlog/registry.ts`, `lib/igra-izlog.test.ts`, `components/igra/izlog/izlog-zajednica.tsx` (jedna rečenica opisa), `scripts/check-igra-assets.mjs` (porodica `igraBannerArt`)

**Šta je urađeno:** Profil člana (`/app/members/[username]`) je „karta igrača“. Na vrhu je zaglavlje: baner `baner.<kljuc>` preko cele širine (3:1 na telefonu, 4:1 od `md`), avatar u prstenu nivoa preko donje ivice banera, ime, korisničko ime i uloga, a desno pečat nivoa („Nivo 5 · Graditelj“). Na sopstvenom profilu dugme „Promeni baner“ otvara izbor od šest banera: otključani se biraju jednim klikom, zaključani su bledi sa katancem i „Od nivoa 7“; izbor upisuje `igra:setBanner`, koji sam proverava katalog i nivo iz XP-a. Bočna kartica počinje kartom igrača (ukupan XP kao odometar, XP traka sa „još N XP do nivoa X“, a na svom profilu i plamen niza i najduži niz), pa ide postojeći sadržaj (biografija, linkovi, praćenje, dugmad). U glavnoj koloni je trofejna polica sa svih 24 bedža u tri grupe i filterom „Sve / Učenje / Crea / Zajednica i nizovi“ (sa brojem osvojenih po grupi), pa „Aktivnost“: četiri brojača kao odometri (lekcije, zadaci, radovi, objave) i mastilo-kalendar od 52 nedelje (na telefonu poslednjih 13). Tuđi profil prikazuje samo ono što je i danas javno (ODLUKE 3–6). Kursevi, doprinosi, đačka knjižica, praćenje, poruke, prijava profila i admin blok su isti. Izlog ima deo „Profil“ (`/igra-izlog?deo=profil&stanje=novi|aktivan|legenda`) sa prekidačima moj / tuđi profil, javna knjižica, nalog tima, učitavanje i neuspeo izbor banera.

**Površine:**
- gotovo: profil 6.5 — zaglavlje sa banerom i pečatom, izbor banera, karta igrača, polica sa filterom (moj: sva četiri stanja; tuđi: osvojeno + neutralne siluete), brojači i kalendar godine, učitavanje (skeleti iste visine), nalog tima (bez nivoa i XP-a, kao danas), obe teme, 390 px, engleski.
- nije dirano: `publicProfiles.getPublicProfile` i ostali upiti profila, praćenje, poruke, „Uči zajedno“, prijava profila, uloge, `ProfileEditor` (baner se bira na samom profilu, ODLUKA 1), `dmPrivacy`, auth.

**ODLUKE:**
1. **Baner se bira na sopstvenom profilu (dugme na baneru), ne u `profile-editor.tsx`** kako predviđa K01 §6.5: zadatak kaže „bira se na sopstvenom profilu“, a jedno mesto je jednostavnije. Editor nije diran.
2. **Izbor se čuva u novom opcionom polju `users.igraBanner`** (ključ bez `baner.`; postojećeg polja nije bilo, nova tabela nije pravljena). Čitanja vraćaju baner samo dok je otključan na tekućem nivou; ako XP padne ispod praga, profil se tiho vraća na „Svesku“, a izbor ostaje sačuvan. `banner: null` u odgovoru znači podrazumevani (zato K04 test `toBeNull()` za nov nalog i dalje važi).
3. **Brojači pokrivaju poslednjih 12 meseci, isto što i kalendar ispod njih**, a ne celu istoriju. Lekcije, zadaci i objave su zbir javnog kalendara koji `getPublicProfile` već šalje (0 novih čitanja, ništa novo ne postaje javno); „objave“ su teme iz istog kalendara (K01: „objave iz `activity.days`“). Ukupne brojke bi tražile ili izmenu `getPublicProfile` (zabranjeno) ili novo brojanje.
4. **Radovi u Crei** (`getMemberProgress.works`, zbir `profileActivityDays.creaWorks` za 365 dana, `take(365)`) vide se vlasniku i drugima samo uz javnu đačku knjižicu (isto pravilo kao Crea bedževi). Bez javne knjižice tuđi profil ima tri pločice.
5. **Tuđi niz se ne prikazuje.** Niz IGRA-e broji i rad u Crei, a to je drugima javno samo kroz knjižicu (koja na profilu već prikazuje niz kad je javna). Plamen i najduži niz su samo na sopstvenom profilu.
6. **Tuđi bedž koji nije u dnevniku je neutralna silueta bez uslova** (novo stanje prikaza `hidden`: bez uslova, bez napretka i bez „zaključano“; za čitač ekrana „naziv — nije na polici“). Zaključan, privatan i još neviđen bedž izgledaju isto, pa se iz police ne može zaključiti ni šta član nema ni šta krije. Brojač „14 / 24“ broji samo osvojeno.
7. **Red značaka zajednice pored korisničkog imena (`CommunityBadgeRow`) je uklonjen sa profila**: računao se iz javnih signala, a polica drugima pokazuje samo dnevnik, pa bi ista strana mogla da pokaže „Prva objava“ kao osvojenu pored imena i kao siluetu na polici. Polica je sada jedino mesto bedževa na profilu; komponenta ostaje na karticama članova. Posledica: `activityStreakDays` i `activityTotal` iz `lib/community-gamification.ts` sada čita samo njihov test (fajl se po K01 ne menja, nisam ih brisao).
8. **Nivo, XP i prsten se računaju iz `getPublicProfile.progress.xp`** (isti XP koji profil već čita; osoblje ga nema), a ne iz IGRA upita: zaglavlje i karta igrača ne čekaju nijedan nov upit. IGRA upit daje samo baner, bedževe i radove.
9. **Jedan nov upit po strani, kroz `useQueries`** (`components/app/member-profile-igra.ts`): greška stiže kao vrednost, pa profil radi i ako `igra:*` nije objavljen (bez police, sa podrazumevanim banerom). Vlasnik bedževe, niz i baner čita iz ljuske (K06), bez sopstvenog `getMyProgress`. Hook je u posebnom fajlu, pa K11 provera „zajednica ne pita napredak po redu i kartici“ (`member-profile.tsx` bez `api.igra.`) i dalje važi; nova provera u `lib/igra-profile.test.ts` zaključava da je poziv tačno jedan.
10. **`getMemberProgress` je dobio obavezan argument `todayKey`** (upit ne čita sat, kao `getMyProgress`). Funkciju do sada niko nije zvao; K04 testovi su dopunjeni tim argumentom, tvrdnje su iste.
11. **K04 test „jedini upis je dnevnik viđenog“ je proširen na dva upisa** (`patch "users"` iz `setBanner` i `insert "igraSeen"`), uz proveru da `setBanner` menja samo polje `igraBanner`. To je upis koji je K01 §5.5 predvideo za K13; provere „bez XP-a i kredita“ i „bez neograničenih čitanja“ su iste.
12. **Kalendar je postojeći `InkCalendar` sa pet novih opcionih propova** (naslov, prazan tekst, broj nedelja, `stacked` raspored, brojači kao `children`), umesto drugog kalendara. Tabla se crta isto. Na profilu kalendar broji svaku javnu aktivnost dana (lekcije, zadaci, teme, komentari, kao stari grafikon), a vlasniku poslednjih 14 dana dopunjuje niz (rad u Crei). Ćelije od oko 9 px sa radijusom od 8 px izgledaju kao kapi mastila; radijus nije menjan (samo 4 tiera).
13. **Filter police je u `TrophyShelf` (`variant="grid"` + `filter`)**, ne u zasebnoj komponenti; `title` sada crta `h2` (polica na profilu je sekcija strane). Skelet mreže je sada isti raspored kao učitana polica (izmereno: 594 / 608 px na 1440, 954 / 1.006 px na 390; razlika na telefonu je prelom filtera i dužih naziva).
14. **Baner je `priority` i `data-igra-hero`** (jedina velika slika strane). Dok se baner ne zna crta se prazan papir iste veličine, da ne blesne „Sveska“ pa pravi baner.
15. **Slike `ikona.profil`, `prazno.zakljucano` i `prazno.uskoro` iz K01 §6.5 nisu korišćene:** polica nikad nije prazna (siluete su i za novog korisnika), a profil nema prazno stanje koje bi ih tražilo.
16. **`check:igra` sada zna porodicu `igraBannerArt(…)`** (baneri se sklapaju šablonom, pa ih skripta nije videla kao korišćene).
17. `IGRA_PLANNED_ART` i dalje ima tri reda (`lib/igra-art.ts` nisam dirao).

**Novi paketi:** nema.

**Testovi (2 nova fajla, 24 testa; 2 postojeća dopunjena):**
- `lib/igra-banners.test.ts` (6): šest banera i nivoi iz plana; svaki je `baner` u manifestu sa istim nazivom kao alt; prepoznavanje ključa; prag otključavanja i loš nivo; prikaz samo otključanog izbora (pad XP-a); katalog ne uvozi manifest.
- `lib/igra-profile.test.ts` (18): polica vlasnika (sva četiri stanja), učitavanje i pad na `getMemberProgress`; **privatnost tuđe police** za tri korisnika × javna / privatna knjižica (samo osvojeno ili neutralna silueta, bez uslova, napretka i vremena, „Noćna sova“ uvek skrivena, Crea samo uz knjižicu); nov neviđen bedž drugi ne vide; filter i brojevi po grupi (sr / en); zbir bez skrivenih; brojači (oblici množine, učitavanje, bez pločice, loš broj); kalendar 52 nedelje i gramatika rečenice; test podaci; baner (vlasnik / drugi / učitavanje / pao upit) i izbor (otključani, izabran, „Od nivoa 7“, nazivi za čitač); **izvor:** delovi profila prezentacioni, slike samo kroz `IgraArt` (jedini `<img>` je avatar), jedan hero i jedna prioritetna slika, jedan IGRA upit po strani kroz `useQueries`, stranica ne zove `getMyProgress`, `publicProfiles.ts` nije diran.
- `convex/igra.test.ts` (21 → 26): `setBanner` (prijava, nepoznat baner, zaključan na nivou 1, laboratorija na 300 XP pa studio odbijen, vidi se i u `getMyProgress` i drugima, pad XP-a vraća podrazumevani a izbor ostaje, nivo 12 → okean; menja samo svoj profil, ne dira XP ni dnevnik); `getMemberProgress` (neispravan dan; radovi za godinu: 364. dan ulazi, 365. ne, drugima samo uz javnu knjižicu); izmenjen test upisa (ODLUKA 11).
- `lib/igra-izlog.test.ts`: deo „profil“.

**Slike:** `baner.sveska|laboratorija|studio|svemir|grad|okean` (zaglavlje i izbor), porodice `nivo.*` i `bedz.*` (24), `rang.plamen`. TRAŽENE SLIKE: nema.

**Rezultat provere:**
- codegen: prošlo (`_generated` bez izmena: nema novog modula)
- **DEV:** `npx convex dev --once` (deployment `wandering-fox-41`, `CONVEX_DEPLOY_KEY` nije postavljen); `function-spec` pokazuje `igra:setBanner` i `igra:getMemberProgress` sa argumentima `username` + `todayKey`. Podaci nisu dirani; šema je dobila samo opciono polje.
- typecheck: prošlo
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (312 fajlova, 3.511 testova)
- check:frames, check:corners, check:white, check:igra (`--strict`): prošlo
- build: prošao iz prvog pokušaja; `next start` (port 3124): `/` 200, `/igra-izlog?deo=profil` i `/en/igra-izlog?deo=profil` 404
- **check:bundle: prošlo.** `/app/members/[username]` 359 → **366 KB** gz (budžet 371); ostale rute iste (`/app` 291, rang lista 291, Crea 465 / 542).
- **pregledač (Playwright, izlog, 1440 × 900 i 390 × 844, obe teme, sr), izmereno:**
  - nema vodoravnog skrola na 390; 0 slomljenih slika; konzola bez grešaka i upozorenja (uz „smanji pokrete“ samo zatečena poruka biblioteke `motion`)
  - moj profil (aktivan): baner „Studio“, prsten 49 %, „Nivo 5 · Graditelj“, 1.890 XP, plamen 6 dana, najduži niz 9; polica 15 / 24 sa „Novo“ na dva bedža i „Uskoro“ na „Izazovu“; brojači 14 / 5 / 12 / 3
  - tuđi profil (legenda, privatna knjižica): Crea 0 / 8 (sve siluete), „Noćna sova“ i „Rani pevac“ siluete, 14 / 24, tri pločice brojača, bez plamena; sa javnom knjižicom Crea grupa i pločica radova se pojave
  - izbor banera (nivo 5): Sveska / Laboratorija / Studio otključani, Svemir / Grad / Okean `disabled` sa „zaključan, od nivoa 7 / 9 / 11“; fokus ide na „Zatvori“; izbor menja baner u zaglavlju; Esc zatvara; neuspeh pokazuje `role="alert"` „Baner nije sačuvan. Pokušaj ponovo.“; dugmad u izboru 173 px visoka, dugme na baneru 44 px
  - smanjen pokret: brojači i XP odmah na vrednosti (137 / 50 / 186 / 7, „23.480 XP“), ispuna trake bez animacije
- dev server i `next start` su ugašeni (portovi 3000 / 3123 / 3124 slobodni, nijedan `next` ni `convex` proces); Playwright `page-*.yml` i `console-*.log` i pomoćni fajlovi iz `.igra-run/tmp/k13/` su obrisani.

**Prihvatanje (K13):**
- „Moj i tuđi profil rade u obe teme i na telefonu“: **ispunjeno u izlogu** (snimci `K13-profil-moj-*`, `K13-profil-tudji-*`, `K13-baner-izbor-*`, `K13-profil-novi-1440-svetla.png`, `K13-profil-tudji-javna-knjizica-1440-svetla.png`).
- „Ništa privatno ne curi“: **ispunjeno** — tuđi profil ne dobija nijedan nov podatak osim banera (izgled) i radova uz javnu knjižicu; bedževi samo iz dnevnika; testovi u `convex/igra.test.ts` i `lib/igra-profile.test.ts` (ODLUKE 3–6).
- typecheck / lint / test / check:frames prolaze, sekcija K13 u progress-u: **ispunjeno**.

**BLOKADA (samo provera, ne kod):** pravi profil nad živim nalogom nije gledan u pregledaču, iz istog razloga kao u K06–K12 (Playwright nije prijavljen; auth tok se ne dira). Izlog crta iste komponente; nije potvrđeno: (a) `useMemberIgra` nad živim Convex-om (DEV ima nove funkcije); (b) izbor banera kroz pravi `igra:setBanner` i reaktivno osvežavanje zaglavlja; (c) raspored sa pravim kursevima, doprinosima i knjižicom ispod police.

**Za Jovana ujutru:**
- **Prijavi se na DEV i otvori svoj profil** (meni naloga → „Moj napredak“ → „Moj profil“, `npx next dev --webpack -p 3123`): promeni baner (na nivou 1 je otključana samo „Sveska“), pa otvori nečiji tuđi profil.
- **Zatečeno, važno (nisam dirao, auth / proxy):** korisničko ime sme da ima tačku (`lib/username-policy.ts`), a matcher u `proxy.ts` (`/((?!.*\..*|_next).*)`) preskače svaku putanju sa tačkom. U produkcionom buildu `/app/members/nikola.stanic` vraća **404**, a `/en/app/members/nikola.stanic` vraća 200 **bez preusmerenja na prijavu** (stranica posle traži prijavu kroz Convex, pa podaci ne cure). Bez tačke (`/app/members/nikola`) sve radi (307 na prijavu). Profili korisnika sa tačkom u imenu su dakle nedostupni na srpskom.
- **Brojači su za poslednjih 12 meseci** (ODLUKA 3), a ne od početka; ako hoćeš ukupne, to traži izmenu `getPublicProfile` ili nov brojač.
- **Ukus:** visina banera na računaru (4:1, u aplikaciji oko 280 px; `md:aspect-[4/1]` u `profile-banner.tsx`), kalendar od 52 nedelje sa „kapima“ mastila, i da li ti fali red značaka pored imena (ODLUKA 7). Snimci: `K13-profil-moj-1440-svetla.png`, `K13-profil-tudji-1440-tamna.png`, `K13-baner-izbor-1440-svetla.png`.
- **Budžet profila:** 366 / 371 KB; sledeći korak koji nešto doda profilu treba da gleda `check:bundle`.
- **Dodir na pravom telefonu i pravi čitač ekrana nisam imao.**

## K14 - Plan: Crea   (2026-10-14 08:38)
**Plan korak.** Plan je upisan u `docs/igra/planovi/K14.md`. Nije menjan kod.

## SLIKE — TRAŽENE SLIKE (K14) su gotove (Claude, 2026-10-14 09:06)
- `prazno.galerija`, `prazno.izazov`, `prazno.par` su napravljene i u manifestu su `ready: true` (123/123). Runner ih kopira u `public/brand/igra/` pre sledećeg koraka, pa K17 crta prave slike umesto zamena iz K14 ODLUKE 16. Ako je K15 dodao ova tri ID-ja u `IGRA_PLANNED_ART`, prvi korak koji dira `lib/igra-art.ts` ih uklanja (manifest ih već ima).

### ODLUKE K14 (plan Crea; prepisao K15, pun tekst u `docs/igra/planovi/K14.md`)
1. Likovi i ilustracije važe na obe rute radionice (`/app/studio` i `/crea/app`, i za goste); napredak, XP i slavlja samo za prijavljene. `/crea` landing se ne dira.
2. Mapa oblast → lik je jedna konstanta `CREA_AREA_LIK` (`lib/igra-crea.ts`); `CreaQuickStart` (K08) je prešao na nju.
3. Poza „radi" se ne dodaje u `IGRA_POZE`; `lib/igra-crea.ts` drži literalne ID-jeve `lik.piksi|kadar|eho.radi`.
4. Ulaz nema drugi red napretka: pečat nivoa i plamen su u postojećoj `CreaGameStrip`.
5. Nivo u Crei je uvek `levelFromXp(game.xp)`, nikad `game.level` (stari obračun 500 / nivo). `convex/creaGame.ts` se ne menja.
6. „Prvi rad svake vrste": mini slavlje iz postojećeg `momentForJob` (bez upisa) + bedž `prvi-rad|prvi-video|prvi-zvuk` kroz `CelebrationHost` i `igraSeen` (K16).
7. Mini slavlje je u oblačiću `StageCompanion`, ne preklop (K16).
8. XP odometar posle SVAKOG rada kod kog je XP porastao, meren od početka do 8 s posle kraja rada (K16).
9. `IgraProgressProvider` u `StudioShell` samo za prijavljene i uz Convex (K16).
10. Domaćin slavlja čeka i `[data-igra-busy]` (tost albuma, `CreaStreakBurst`) (K16).
11. Postojeća 3D maskota je Robi; jedina 3D figura u Crei; Piksi, Kadar i Eho su samo 2D nalepnice.
12. Prazna stanja Cree idu kroz postojeći `EmptyState` sa `art` (K17); ilustracija 120 px bez heroja, 96 px uz heroja.
13. Lik „radi" samo u velikom prikazu čekanja (`size="stage"`) (K16).
14. Animacija „radi" je CSS `.igra-lik-radi` u `no-preference` bloku; staje za noćni posao (K16).
15. Galerija, izazov, sveska i parovi nemaju scenu-heroja; nalepnica 64 px u zaglavlju (K17).
16. Tri nove slike su tražene (dole) i upisane u `IGRA_PLANNED_ART`; tri zastarela reda `*.radi` su obrisana (manifest ih ima).

### TRAŽENE SLIKE (K14)
- prazno.galerija | Prazan zid izložbe sa tri prazna rama; Piksi na merdevinama kači prvi ram, veseo i pun nade | nalepnica | Crea galerija bez objavljenih radova (K17)
- prazno.izazov | Štafelaj sa praznim platnom i mali pehar pored; Kadar drži klapu i čeka, strpljiv osmeh | nalepnica | Crea izazov, glasanje bez radova (K17)
- prazno.par | Dva stočića sa skicama, jedna stolica prazna; Iskra iznad pali sijalicu kao poziv | nalepnica | Crea parovi, još nema para (K17)

## K15 — Crea ulaz i radionice   (2026-10-14 09:05)
**Fajlovi:**
- novi: `lib/igra-crea.ts`, `lib/igra-crea.test.ts`, `components/igra/crea/crea-start-hero.tsx`, `components/igra/crea/crea-area-header.tsx`, `components/igra/izlog/izlog-crea.tsx`, `docs/igra/snimci/K15-*.png` (10)
- izmenjeni (Crea): `components/crea/crea-start-screen.tsx`, `components/crea/crea-workshop.tsx`, `components/crea/crea-stage.tsx`, `components/crea/crea-tool-stage.tsx` (nov prop `area`), `components/app/studio-page.tsx` (samo `area={area}` za `CreaToolStage`), `components/crea/game/crea-game-strip.tsx`
- izmenjeni (IGRA): `components/igra/igra-hero.tsx` (opcioni `greetingAs` / `greetingId`), `components/igra/dashboard/crea-quick-start.tsx` (mapa iz `CREA_AREA_LIK`), `lib/igra-copy.ts` (`IGRA_CREA_COPY`), `lib/igra-art.ts` (planirane slike), `lib/igra-fixtures.ts` (`CREA_GAME_FIXTURES`), `components/igra/izlog/registry.ts`, `components/igra/izlog/izlog-slike.tsx` (uzorak planirane slike), `lib/igra-izlog.test.ts` (deo „crea")

**Šta je urađeno:** Ulaz u Creu „Šta praviš danas?" je sada heroj sa scenom `scena.crea-radionica` (scena desno, naslov levo; na telefonu traka sa scenom gore) i tri velika ulaza u radionice, svaki sa svojim likom: Piksi slika, Kadar video, Eho zvuk. Pločica je pravi link (`creaShellQuery({ area, mode: null })`), pa ulaz u radionicu briše stari cilj, alat, recept i model, isto kao pilule oblasti. Ispod heroja su postojeće kartice ciljeva i recepti, nepromenjeni; rečenica „Izaberi cilj…" je sada uvod u ciljeve. Svaka radionica ima zaglavlje između pilula oblasti i režima: lik oblasti (40 px na telefonu, 64 px od `sm`) sa kratkim savetom u oblačiću. Prazna pozornica i prazni koraci alata (gost, „izaberi alat") umesto znaka Cree imaju lika oblasti (`misli` / `mase`, 96 px). Traka napretka u gornjem redu radionice počinje pečatom nivoa iz ljuske (broj u krugu + prsten napretka), računatim iz istog XP-a istim pravilom kao ljuska. Izlog ima deo „Crea" (`/igra-izlog?deo=crea&stanje=novi|aktivan|legenda`) sa PRAVOM radionicom uživo (pilule, pločice likova i kartice ciljeva menjaju oblast u izlogu), zaglavljima sve tri radionice i trakom za tri test korisnika.

**Površine:**
- gotovo: Crea ulaz (heroj, tri radionice, obe teme, 390 px), zaglavlja radionica sa likovima, prazne pozornice (režimi sa modelima i sa alatima), traka napretka sa nivoom.
- nije u ovom koraku (po planu K14): čekanje, rezultat i slavlja (K16); biblioteka, galerija, izazovi, parovi, sveska (K17). `CreaComingSoon` i `CreaHistoryEmpty` nisu dirani (plan K14 §2.2).

**ODLUKE:**
1. **Nivo u traci je pečat iz ljuske (`LevelSeal` iz `shell-progress.tsx`), ne amblem `nivo.NN`** (plan je dozvoljavao oba): „isti izvor kao ljuska" i bez još jedne slike u gornjem redu. Računa se iz `game.xp` (isti `leaderboardStats` XP koji čita `igra:getMyProgress`), jer na `/crea/app` još nema IGRA provider-a (K16); `game.level` se ne prikazuje. Pečat je vidljiv i na telefonu (28 px).
2. **Prazno stanje „alat stiže uskoro" nije dobilo sliku:** u kodu tu nije bilo znaka Cree koji plan menja (plan je pretpostavio da jeste), a nijedan alat danas nije „uskoro". Hirurški: ništa nije dodato.
3. **Rečenica `CREA_START_COPY.body` („Izaberi cilj…") je premeštena ispod heroja**, kao uvod u kartice ciljeva, jer govori o ciljevima, a ne o pločicama radionica. U heroju iznad pločica stoji „Izaberi radionicu".
4. **Pločice su lik od 72 px + naziv + „sa Piksijem"**, visoke 145 px; na 390 px u pravoj radionici široke oko 100 px (plan je naveo ≥ 104 px; razlika su unutrašnje margine heroja). Meta je daleko iznad 44 px.
5. **Zaglavlje oblasti ima dve instance lika (telefon / od `sm`) u omotačima koji nose prikaz.** `hidden` na samom `IgraLik`-u bi izgubio od njegovog `inline-flex` (Tailwind redosled, poznat problem u repou).
6. **Izlog ne crta `CreaToolStage`**: alati vuku `vectortracer` WASM, koji `next dev --webpack` ne ume da učita (strana bi pala sa 500). Režim sa alatima u izlogu crta praznu pozornicu; prazna stanja alata su provereni testom nad izvorom i typecheck-om.
7. **Bundle (`check:bundle` prolazi, ali preko cilja K14 od +10 KB):** `/crea/app` 465 → **485 KB** gz (budžet 512), `/app/studio` 542–546 → **553 KB** (budžet 595), `/app` 291 → 292 (294). Ceo rast je zajednički sloj slika IGRA-e koji Crea do sada nije učitavala: `IgraArt` + manifest (~3,3 KB gz) + mapa od 38 lucide fallback ikona + pečat ljuske. To je jednokratna cena: K16/K17 koriste iste module, pa treba da dodaju još najviše oko 5 KB. Bez ovoga Crea ne može da ima nijednu IGRA sliku. Budžeti ruta nisu dirani. Predlog za K28: `IgraFallbackIcon` učitavati lenjo (fallback se crta samo kad slike nema), što bi skinulo nekoliko KB sa svake rute koja crta `IgraArt`.
8. **Scena ulaza nije u SSR HTML-u:** u produkcionom buildu (`next start`) `/crea/app` server crta gornju traku, a radionicu tek klijent (zatečeno ponašanje `StudioPage`). `priority` (eager + `fetchPriority="high"`) je zadržan, jer je scena najveća slika prvog kadra kad se radionica nacrta.
9. **`lib/igra-crea.ts` ne uvozi `lib/crea-shell` ni manifest u vreme izvršavanja** (samo tipove): `CreaQuickStart` ga uvozi, a `/app` je na 292 / 294 KB. Test to čuva.
10. Uzorak „planirane slike" u izlogu (deo „slike") sada je `prazno.galerija` (`lik.piksi.radi` je stigao u manifest).

**Novi paketi:** nema.

**Testovi:**
- novi `lib/igra-crea.test.ts` (13): mapa oblast → lik i vrsta posla → lik; sve poze koje Crea koristi (`mase`, `misli`, `slavi`, `radi`) i `scena.crea-radionica` su u manifestu i spremne; modul bez manifesta i bez `crea-shell` u vreme izvršavanja; tekstovi sr/en, različiti, bez pretnje i bez priče o ceni; href pločice briše cilj, alat, recept i model a čuva projekat; ulaz crta heroja sa `h2#crea-start-title`; u celoj radionici tačno jedan `IgraHero` i nijedan drugi `priority`; `components/igra/crea/*` prezentacioni (bez upita, `<img>`, hex-a, forsiranog radijusa i `border-2`); zaglavlje stoji između pilula oblasti i režima; prazne pozornice nose lika oblasti; traka računa nivo iz XP-a (`levelFromXp`), nikad `game.level` (test korisnik „aktivan": 1.890 XP = nivo 5, stari obračun bi rekao 4).
- izmenjen `lib/igra-izlog.test.ts`: spisak delova ima „crea".

**Slike:** `scena.crea-radionica` (heroj ulaza, jedini `priority`), `lik.piksi|kadar|eho.mase|misli` (pločice, zaglavlja, prazne pozornice). `lik.*.radi` su u `CREA_RADI_ART` za K16. TRAŽENE SLIKE: tri iz K14 (gore), upisane u `IGRA_PLANNED_ART`.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran)
- typecheck: prošlo
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (313 fajlova, 3.524 testa)
- check:frames, check:corners, check:white: prošlo; check:igra `--strict`: 0 za popravku, 1 upozorenje (planirana `prazno.galerija` u izlogu)
- build: prošao iz prvog pokušaja; `next start` (port 3124): `/crea/app` 200, `/igra-izlog?deo=crea` 404
- check:bundle: prošlo (brojevi u ODLUCI 7)
- **pregledač (Playwright, izlog, 1440 × 900 i 390 × 844, obe teme), izmereno:** jedno `data-igra-hero`, naslov `h2#crea-start-title`; pločice 138 × 145 px (1440) i 91 × 145 px (390, izlog ima dodatnu marginu); nema vodoravnog skrola; 0 slomljenih slika; kontrast u heroju u tamnoj temi (svetlo ostrvo): naslov 12,6:1, „sa Piksijem" i „Izaberi radionicu" oko 5,7:1; naziv trake počinje sa „Nivo 5: Graditelj", traka 298 × 44 px; klik na pločicu i pilule menja radionicu, zaglavlje i lika prazne pozornice; konzola bez grešaka i upozorenja (i uz smanjen pokret). Snimci: `K15-crea-ulaz-1440|390-svetla|tamna`, `K15-crea-radionica-1440|390-svetla|tamna`, `K15-crea-zaglavlja-1440-svetla`, `K15-crea-traka-1440-svetla`.
- dev server i `next start` su ugašeni (portovi 3123 / 3124 slobodni); Playwright `page-*.yml` i `console-*.log` su obrisani.

- **prava radionica (produkcioni build, `next start -p 3124`, `/crea/app` kao gost), izmereno:** heroj se crta (jedno `data-igra-hero`, scena `crea-radionica.avif` učitana sa `fetchpriority="high"`), pločice vode na `/crea/app?oblast=slika|video|zvuk` (145 × 145 px na 1440, 99 × 145 px na 390); klik na „Video" otvara radionicu sa Kadrovim zaglavljem i savetom, levim panelom i Kadrom (`misli`) u praznoj pozornici; `?oblast=slika&rezim=alati` kao gost crta Piksija (`mase`) u praznom stanju „Prijavi se i koristi besplatne alate"; 0 slomljenih slika, bez vodoravnog skrola, konzola bez grešaka. Snimci: `K15-crea-prava-ulaz-1440-svetla`, `K15-crea-prava-radionica-1440-tamna`, `K15-crea-prava-ulaz-390-svetla`, `K15-crea-prava-alati-390-tamna`. Server je posle ugašen.

**BLOKADA (samo provera, ne kod):** prijavljeni deo radionice (`/app/studio` i traka napretka sa pečatom nivoa, koju gost ne vidi) nije gledan u pregledaču: Playwright nije prijavljen (isto kao K06–K13), a prijava ide kroz auth tok koji se ne dira. Isti `StudioPage` je proveren kao gost na `/crea/app` (gore), a traka u izlogu nad test podacima. `next dev --webpack` na ovoj mašini vraća 500 za radionicu zbog `vectortracer` WASM-a (zatečeno), pa je prava ruta gledana na produkcionom buildu.

**Za Jovana ujutru:**
- **Otvori `/app/studio` prijavljen** (`/crea/app` kao gost je proveren na produkcionom buildu): heroj sa scenom i tri lika, klik na lika vodi u radionicu, zaglavlje sa savetom iznad režima, lik u praznoj pozornici, pečat nivoa na početku trake (mora da se slaže sa nivoom u sidebaru).
- **Bundle Cree +20 KB** (ODLUKA 7): u budžetu rute, ali preko cilja K14. Ako ti je to previše, najjeftinija ušteda za sve rute je lenja mapa fallback ikona u `IgraArt` (K28).
- **Ukus:** saveti likova u `IGRA_CREA_COPY` (`lib/igra-copy.ts`), veličina likova u pločicama (72 px), i da li „Izaberi radionicu" iznad pločica treba. Snimci: `K15-crea-ulaz-1440-svetla.png`, `K15-crea-radionica-1440-tamna.png`, `K15-crea-ulaz-390-svetla.png`.
- **Zatečeno, nisam dirao:** naziv trake za čitač ekrana ima dve tačke („Danas je upisano..") jer `CREA_STREAK_COPY.done` već završava tačkom.

## K16 — Crea čekanje, rezultat, slavlja   (2026-10-14 09:45)
**Fajlovi:**
- novi: `lib/igra-crea-xp.ts` (reduktor „+N XP"), `components/igra/crea/use-crea-xp-gain.ts`, `docs/igra/snimci/K16-*.png` (17)
- izmenjeni (Crea): `components/crea/wait/wait-screen.tsx` (lik „radi"), `components/crea/wait/stage-companion.tsx` (mini slavlje, „+N XP", `data-igra-busy`), `components/crea/crea-stage.tsx` (lik slavlja, merenje XP-a, opcioni `loadMoment`), `components/app/studio-media-tile.tsx` (tužan lik na pozornici), `components/crea/game/crea-stamp-host.tsx` i `crea-streak-burst.tsx` (`data-igra-busy`), `components/studio/studio-shell.tsx` (provider za prijavljene), `lib/crea-experience-copy.ts` (natpis „Robi")
- izmenjeni (IGRA): `components/igra/celebration-host.tsx` (`BUSY_SELECTOR`), `lib/igra-crea.ts` (`creaMomentLik`, `isCreaGenerationError`), `lib/igra-copy.ts` (`failHint`), `lib/igra-fixtures.ts` (`creaJobFixture`), `app/globals.css` (`.igra-lik-radi`), `components/igra/izlog/izlog-crea.tsx` (4 nove sekcije), testovi `lib/igra-crea.test.ts`, `lib/igra-shell.test.ts`

**Šta je urađeno:** Dok Crea pravi rad, na velikom prikazu čekanja (pozornica) lik radionice „radi": Piksi, Kadar ili Eho (`lik.*.radi`) stoji preko donjeg levog ugla lista sa skicom i blago se njiše (CSS, 1,8 s). Postojeći list, koraci, procena i sat su netaknuti, procenta nema; za noćni posao i uz smanjen pokret lik stoji. Kad rad stigne, posle postojećeg otkrivanja (polaroid / traka / kaseta) oblačić pored Robija za prvi rad i prvi rad svake vrste dobija lika te vrste koji „udari" kao pečat (`useStampIn`) i žuti marker iza poruke; konfete su postojeće. Svaki rad posle kog je XP iz ljuske porastao (u 8 s posle kraja) dobija „+N XP" (odometar); broj se meri, nije upisan, a bez porasta (dnevni plafon) se ne crta. Neuspeh na pozornici prikazuje tužnog lika vrste (`lik.*.tuzan`), postojeću poruku o povraćaju kredita (doslovno ista) i blag poziv „Desi se, nije strašno. Probaj ponovo."; otkazan posao i pločice u istoriji ostaju bez lika. `/crea/app` za prijavljene sada ima isti napredak i slavlja kao `/app/studio`, a domaćin slavlja čeka i oblačić, pečat albuma i Crea niz, pa bedž „Prvi rad" (`igraSeen`, jednom) dolazi tek kad se oni sklone.

**Površine:**
- gotovo: čekanje na pozornici (sve tri vrste, noćni posao, smanjen pokret), rezultat (prvi rad, prvi rad vrste × 3, jubilej, običan rad, sa i bez XP-a), neuspeh na pozornici, redosled slavlja, napredak na `/crea/app`.
- ne menja se namerno: pločice istorije (čekanje i neuspeh bez lika, plan K14 ODLUKA 13), `CreaReveal` (medij ostaje čist), `SketchPaper`, `LearnCard`, logika konfeta i trenutaka.
- K17: biblioteka, galerija, izazovi, parovi, sveska.

**ODLUKE:**
1. **„Otkrivanje dobija marker i nalepnicu" je urađeno u oblačiću koji se pojavljuje zajedno sa otkrivanjem, ne preko samog rada** (plan K14 §3.2 i ODLUKA 7): nalepnica i marker preko slike ili videa bi pokrili korisnikov rad. `components/crea/reveal/*` nije menjan.
2. **Zadatak traži `lik.*.tuzan` za grešku, a plan K14 §5 je rekao „poza tuzan se ne koristi"**; zadatak pobeđuje. Tužan lik stoji u stanju neuspeha same pločice na pozornici (`waitSize="stage"`), jer to stanje ostaje vidljivo; oblačić posle neuspeha (Robi tužan + ista poruka, 5 s) je ostao kakav je bio, da ne budu dva tužna lika odjednom. Tekst o povraćaju (`jobStatusText`) se ne menja; test ga drži doslovno. Posao koji je korisnik sam otkazao (`OTKAZAO_KORISNIK`) nije greška i nema lika (`isCreaGenerationError`).
3. **Oblačić posle rada nosi `data-igra-busy`** (pored tosta albuma i Crea niza, plan ODLUKA 10). Bez toga bi bedž „Prvi rad" mogao da se otvori 600 ms posle rada, pre tosta albuma (1,4 s), i dva slavlja bi se preklopila. Izmereno u izlogu: oblačić 3,7 s → +40 XP 3,9 s → pečat albuma 5,1 s → oblačić nestaje 8,0 s → bedž 11,6 s, `markSeen` jednom, u svakom trenutku najviše jedan preklop.
4. **Reduktor XP-a je u zasebnom `lib/igra-crea-xp.ts`**, ne u `lib/igra-crea.ts`: ponovo koristi `xpGain` iz `lib/igra-lesson.ts`, koji vuče `igra-copy`, a `lib/igra-crea.ts` uvozi i tabla (test čuva da su mu svi uvozi `import type`). Prozor od 8 s zatvara tajmer (događaj `close`), ne sat u reduktoru; porast koji stigne malo pre nego što klijent vidi kraj rada se računa.
5. **Mini slavlje je funkcija `creaMomentLik(moment, kind)`** (vraća lika ili `null`) umesto `creaMomentView` iz plana: oblik `{ lik, poza: "slavi", celebrate }` nije nosio ništa više.
6. **`CreaStage` dobija opcioni prop `loadMoment`** (podrazumevano isti `creaMoments.momentForJob`), da izlog pokrene PRAVU pozornicu sa test trenutkom (pravilo „prezentacione komponente, podaci kroz props"). Aplikacija ga ne prosleđuje, ponašanje je isto.
7. **Lik „radi" je 64 px na svim širinama** (na 390 staje bez guranja lista, izmereno), postavljen `-bottom-3`, jer je `-bottom-5` iz plana preklapao red koraka.
8. **„+N XP" je napisan kao „+40 XP" običnim tekstom** (isti obrazac kao `LessonDone`), ne `suffix` odometra: sufiks od pola veličine je na `type-body-sm` bio nečitljiv.
9. **Izlog:** primeri oblačića nose `data-igra-busy`, pa se sakriju dok traje „Prvi rad (uživo)" (inače bi zadržali slavlje bedža u izlogu). Primeri u izlogu su bez 3D maskote (desetak WebGL platna), osim živog toka.
10. **Bundle:** `/crea/app` 485 → 488 KB gz (budžet 512), `/app/studio` 553 → 555 (595), `/app` 292 → 293 (294). Rast Cree je GSAP hook pečata + odometar + reduktor (~2–3 KB); `three` i GSAP pluginovi i dalje nisu u početnim chunk-ovima (`check:bundle` prolazi). K17 ima još oko 2–3 KB do cilja iz K15 ODLUKE 7. `/app` je na 1 KB od budžeta (od K16 ta ruta dobija samo `IGRA_CREA_COPY.failHint`, verovatno zaokruživanje); sledeći korak koji dira tablu treba da pazi.

**Novi paketi:** nema.

**Testovi:**
- `lib/igra-crea.test.ts` (+16): `creaMomentLik` (prvi rad, prvi rad vrste × 3, jubilej, null); `isCreaGenerationError` (otkazano nije greška); poruka o povraćaju ostaje doslovno ista i stoji uz tužnog lika; oblačić ima pečat, marker i „+N XP" samo uz porast; reduktor XP-a (porast u prozoru, porast pre kraja, bez porasta, posle zatvorenog prozora, drugi porast, nov posao, tuđ posao, rad neviđen u izradi, loš ulaz, ista referenca); hook čita samo napredak ljuske i nijedan XP iznos nije upisan; lik „radi" samo na pozornici, staje za noćni posao, CSS samo u `no-preference` bloku; čekanje bez `%` i bez `* 100`; `BUSY_SELECTOR` i `data-igra-busy` na tri Crea preklopa; maskota je „Robi"; manifest ima i `lik.*.tuzan`.
- `lib/igra-shell.test.ts`: provider uvoze `app-shell.tsx` i `studio-shell.tsx` (namerno, plan K14 ODLUKA 9; studio ga montira samo uz `viewerProfile`); domaćina slavlja uvozi i `izlog-crea.tsx`.

**Slike:** `lik.piksi|kadar|eho.radi` (čekanje), `lik.*.slavi` (mini slavlje), `lik.*.tuzan` (neuspeh). Nove slike nisu tražene.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran)
- typecheck: prošlo
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (313 fajlova, 3.540 testova)
- check:frames, check:corners, check:white: prošlo; check:igra `--strict`: sve slike koje kod koristi su na mestu
- build: prošao; check:bundle: prošlo (brojevi u ODLUCI 10)
- **pregledač (Playwright, izlog `/igra-izlog?deo=crea&stanje=aktivan`, 1440 × 900 i 390 × 844, obe teme), izmereno:** lik „radi" animiran (`igra-lik-radi`) na tri prikaza pozornice, `none` za noćni posao, `animated=false` i uz `prefers-reduced-motion: reduce` (sva tri); u tekstu čekanja nema `%`; nema vodoravnog skrola na 390 (obe teme); 0 slomljenih slika; tamna tema: marker poruke mastilo na žutom (~9:1), „+N XP" svetlo mastilo na tamnom oblačiću; živi tok prvog rada kao u ODLUCI 3, jedno slavlje bedža, `markSeen: badge:prvi-rad`; konzola bez grešaka i bez upozorenja o hidrataciji (samo zatečeno `THREE.Clock` upozorenje 3D maskote). Snimci: `K16-crea-cekanje|rezultat|neuspeh-1440|390-svetla|tamna`, `K16-crea-cekanje-1440-smanjen-pokret`, `K16-crea-prvi-rad-cekanje|oblacic|pecat|bedz-1440-svetla`.
- dev server je ugašen (port 3123 slobodan); Playwright `page-*.yml` i `console-*.log` obrisani.

**BLOKADA (samo provera, ne kod):** pravi rad na DEV-u nije pokrenut: Playwright nije prijavljen (isto kao K06–K15), a `next dev --webpack` vraća 500 za radionicu zbog `vectortracer` WASM-a (zatečeno, K15). Tok je proveren na PRAVOJ pozornici (`CreaStage` + `StudioMediaTile` + `StageCompanion` + `CreaStampToast` + `CelebrationHost`) u izlogu sa test podacima.

**Za Jovana ujutru:**
- **Napravi rad prijavljen na `/app/studio` i na `/crea/app`** (DEV): Piksi se njiše uz list dok se crta; posle otkrivanja oblačić sa „+N XP" (ako je XP porastao); na novom nalogu prvi rad → Piksi „udari" u oblačiću, pa pečat albuma, pa tek onda slavlje bedža „Prvi rad". Na `/crea/app` proveri i da slavlje radi bez sidebar-a.
- **Neuspeh:** tužan lik + „Generacija nije uspela - krediti su ti vraćeni." + „Desi se, nije strašno. Probaj ponovo."
- **Ukus:** tekst `IGRA_CREA_COPY.failHint` (`lib/igra-copy.ts`), mesto lika „radi" (donji levi ugao lista). Snimci: `K16-crea-cekanje-1440-svetla.png`, `K16-crea-prvi-rad-oblacic-1440-svetla.png`, `K16-crea-neuspeh-1440-tamna.png`.
- **Budžet `/app` 293 / 294 KB** (ODLUKA 10).

## K17 — Crea biblioteka, galerija, izazovi (izgled)   (2026-10-14 10:05)
**Fajlovi:**
- novi: `components/igra/crea/crea-cover.tsx` (`CreaCover`, naslovnica), `components/igra/crea/work-sticker.tsx` (`WorkSticker`, „novo"/„omiljeno"), `components/igra/crea/winner-crown.tsx` (`WinnerCrown`), `docs/igra/snimci/K17-*.png` (11)
- izmenjeni (biblioteka): `components/app/studio-media-grid.tsx` (ilustracije praznih stanja, `fresh` samo u biblioteci), `components/app/studio-media-tile.tsx` (nalepnice, prop `fresh`, hover bez podizanja uz smanjen pokret)
- izmenjeni (galerija, izazov): `components/crea/community/crea-community-ui.tsx` (`CommunityHeader` → naslovnica, `WorkCard` opcioni `sticker`), `crea-gallery.tsx` (`GalleryEmpty` izvezen, `prazno.galerija`), `crea-challenge.tsx` (kruna, marker, `prazno.izazov`, `bedz.izazov` u bedževima), `crea-league-panel.tsx` (`RankChip`), `crea-pair-panel.tsx` (`prazno.par`), `crea-public-work.tsx` (`prazno.404`)
- izmenjeni (sveska, knjižica): `components/crea/game/crea-notebook.tsx` (naslovnica sa Robijem, gost `prazno.zakljucano`), `crea-streak-panel.tsx` (`rang.plamen`), `crea-report-card.tsx` (korica sa `lik.robi.misli`), `app/[locale]/studio/(shell)/knjizica/[username]/page.tsx` (nedeljena knjižica `prazno.zakljucano`)
- izmenjeni (IGRA): `lib/igra-crea.ts` (`isFreshCreaWork`, `CREA_FRESH_MS`), `lib/igra-copy.ts` (`stickerNew`), `lib/igra-art.ts` (obrisana tri planirana reda), `lib/igra-fixtures.ts` (javni rad, tabla izazova, liga, par, knjižica), `components/igra/izlog/izlog-crea.tsx` (4 nove sekcije), `lib/igra-crea.test.ts`

**Šta je urađeno:** Biblioteka: prazna biblioteka i prazan projekat imaju `prazno.radovi`, filter bez rezultata `prazno.pretraga` (120 px, kroz postojeći `EmptyState`). Kartice radova dobile su suptilne die-cut nalepnice: krem „Novo" za rad koji je stigao u poslednja 24 h (samo u biblioteci, ne u koloni istorije) i žuto srce za omiljeno (zamenjuje staru žutu pilulu). Hover je ostao miran (2 px i senka), a uz smanjen pokret kartica se više ne podiže. Galerija, izazov i sveska umesto znaka Cree imaju naslovnicu: traku papira sa teksturom i washi trakom, naslov levo i jednu nalepnicu desno (Piksi slavi, pehar, Robi maše). Pobednik izazova dobija krunu `rang.kruna` koja jednom „udari" kao pečat kad kartica uđe u vidno polje, i žuti marker na „Pobednik". Bedževi izazova nose `bedz.izazov`, prazno glasanje ima jednu ilustraciju za ceo deo. Liga u svesci ima rang čipove (medalje za postolje, `#N` za ostale), plamen niza je nalepnica koja tinja dok danas nije upisano, đačka knjižica ima koricu sa Robijem, a parovi, javni rad koji ne postoji, gost u svesci i nedeljena knjižica dobili su ilustracije.

**Površine:**
- gotovo: biblioteka (prazna stanja, nalepnice), galerija (naslovnica, prazno, rad ne postoji), izazov (naslovnica, kruna i marker pobednika, prazno glasanje, bedževi), sveska (naslovnica, niz, liga, par, gost), knjižica (korica, nedeljena).
- ne menja se namerno: glasanje, prijava na izazov, nagrade, pravila, moderacija, lajk, remiks; kartice javnih radova (`WorkCard`) osim nalepnice pobednika; album, mapa veština, zaglavlje biblioteke (alat, plan K14 §4).

**ODLUKE:**
1. **Rang čipovi autora samo u ligi.** Javni rad nosi autora bez ikakvog ranga (`publicAuthor`: ime, korisničko ime, avatar). Dodati rang u galeriju bi značilo nov upit i javni prikaz podatka koji danas nije javan (zabrana §4 plana). Zadatak kaže „gde već postoji rang", a postoji samo u tabeli lige (`row.rank`).
2. **„Novo" = gotov rad koji je stigao u poslednja 24 h** (`completedAt`, za stare radove `createdAt`), računato prema trenutku otvaranja mreže (postojeći `now` u `StudioMediaGrid`). Bez nove tabele i bez pamćenja „viđenog". Samo u biblioteci (`library`), jer bi u koloni istorije skoro svaki rad bio „nov".
3. **„Mirni hover":** zatečeni hover je već miran (podizanje 2 px + senka, 120 ms). Dodato je samo `motion-reduce:hover:translate-y-0`; ništa se ne skalira niti treperi.
4. **Naslovnica je bez okvira** (`bg-surface-b`, tekstura `igra-paper`, washi traka). Test K15 brani `border-2` u `components/igra/crea/*`, a okvir ostaje karticama sadržaja ispod (jedan okvir po grupi). Ovo je „heroj traka" iz zadatka; scene-heroja nema (plan K14 ODLUKA 15). Nalepnica: 64 px na telefonu, 96 px od `sm`.
5. **Slavlje pobednika je samo izgled:** kruna (pečat kroz postojeći `useStampIn`, jednom, kad je kartica 60 % vidljiva; uz smanjen pokret odmah stoji) i marker. Nema konfeta ni preklopa, jer stranu izazova vide svi, a ne samo pobednik.
6. **Prazno glasanje: jedna ilustracija za ceo deo**, i to samo kad su OBE grupe prazne. Tekst „nije bilo prijava" po grupi ostaje kakav je bio. Sa dve grupe bi `EmptyState` po grupi crtao dve iste slike jednu ispod druge.
7. **Gost u svesci dobija `prazno.zakljucano`, a ne Robija** (plan je predlagao `lik.robi.misli`). Robi već maše sa naslovnice odmah iznad, pa bi bila dva Robija. Knjižica ima `lik.robi.misli` (Robi „ocenjuje"); u svesci je to drugi list, pa nije pored naslovnice.
8. **Galerija bez radova zadržava svoju isprekidanu kutiju**, a ikona `Sparkles` je zamenjena sa `prazno.galerija` (plan je predlagao `EmptyState`). `EmptyState` traži naslov i telo, a postoji samo jedna rečenica (`CREA_GALLERY_COPY.empty`), pa nisam izmišljao nov tekst. Kutija je izvezena kao `GalleryEmpty`, da je izlog crta.
9. **Tri planirana reda (`prazno.galerija|izazov|par`) obrisana su iz `IGRA_PLANNED_ART`**, jer su u manifestu (napomena „SLIKE (K14)": to radi prvi korak koji dira `lib/igra-art.ts`).
10. **Bundle:** `/crea/app` 488 → 489 KB gz (budžet 512), `/app/studio` 555 → 557 (595), `/app` ostaje 293 (294). `three` i GSAP pluginovi nisu u početnim chunk-ovima. Galerija, izazov i sveska nemaju budžet; dobile su `RankChip`, `useStampIn` i `CreaCover`.

**Novi paketi:** nema.

**Testovi:** `lib/igra-crea.test.ts` (+8):
- `isFreshCreaWork`: 24 h granica, bez `completedAt`, statusi koji nisu gotovi, sat u budućnosti, NaN;
- „Novo" samo u biblioteci i nalepnice na kartici; ilustracije praznih stanja biblioteke; hover uz smanjen pokret;
- naslovnice galerije, izazova i sveske (Piksi, pehar, Robi), bez `CreaLogo`;
- kruna i marker na pobedniku; jedna ilustracija praznog glasanja; pozivi `vote`, `enterChallenge` i nagrada ostaju doslovno isti; kruna ide kroz `useStampIn`, bez svog GSAP-a;
- `RankChip` u ligi, a nijedan u galeriji;
- plamen, korica knjižice i prazna stanja parova, javnog rada i knjižice;
- sve K17 slike su u manifestu i spremne;
- test podaci izloga.

**Slike:** `prazno.radovi`, `prazno.pretraga`, `prazno.galerija`, `prazno.izazov`, `prazno.par`, `prazno.404`, `prazno.zakljucano`, `rang.kruna`, `rang.pehar`, `rang.plamen`, `bedz.izazov`, `lik.piksi.slavi`, `lik.robi.mase`, `lik.robi.misli`. Nove slike nisu tražene.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije diran)
- typecheck: prošlo
- lint: prošlo (0 grešaka, istih 26 zatečenih upozorenja)
- test: prošlo (313 fajlova, 3.548 testova)
- check:frames, check:corners, check:white: prošlo; check:igra `--strict`: sve slike koje kod koristi su na mestu (nema više upozorenja o planiranoj slici)
- build: prošao; check:bundle: prošlo (brojevi u ODLUCI 10)
- **pregledač (Playwright, izlog `/igra-izlog?deo=crea&stanje=aktivan`, sekcije Biblioteka / Galerija / Izazov / Sveska i knjižica), 1440 × 900 i 390 × 844, obe teme:**
  - 0 slomljenih slika i nema vodoravnog skrola na 390;
  - nalepnica „Novo" je mastilo na kremu (~12:1) u obe teme;
  - kruna uz `prefers-reduced-motion: reduce` odmah stoji (opacity 1, bez transforma);
  - konzola bez grešaka i bez upozorenja o hidrataciji (jedino dev upozorenje je LCP slike test kartice u izlogu);
  - snimci: `K17-crea-biblioteka-1440-svetla|tamna`, `K17-crea-biblioteka-390-svetla`, `K17-crea-galerija-1440-svetla`, `K17-crea-galerija-390-tamna`, `K17-crea-izazov-1440-svetla|tamna`, `K17-crea-izazov-390-svetla`, `K17-crea-sveska-1440-svetla|tamna`, `K17-crea-sveska-390-tamna`.
- dev server je ugašen (port 3123 slobodan); Playwright `page-*.yml` i `console-*.log` su obrisani.

- **prave strane (produkcioni build, `next start -p 3124`, kao gost), izmereno:**
  - `/crea/sveska`: naslovnica sa Robijem (`lik.robi.mase`) i gost-kartica sa katancem (`prazno.zakljucano`), na 1440 svetla i 390 tamna; 0 slomljenih slika, nema vodoravnog skrola;
  - `/crea/knjizica/<ime koje nije javno>`: katanac i „Ova knjižica nije javna.", na 390; slika učitana;
  - konzola bez grešaka i upozorenja;
  - snimci: `K17-crea-prava-sveska-1440-svetla`, `K17-crea-prava-sveska-390-tamna`, `K17-crea-prava-knjizica-390-svetla`;
  - server je posle ugašen.

**BLOKADA (prihvatanje „Ekrani rade u obe teme i na telefonu", delimično):** delovi koje je moguće otvoriti bez prijave i flega (sveska kao gost, nedeljena knjižica) provereni su na pravoj strani u obe teme i na 390 px; svi ostali ekrani su provereni samo u izlogu, sa istim komponentama nad test podacima (390 i 1440 px, obe teme). Na pravoj strani nisu gledani:
- **galerija i izazov** (`/crea/galerija`, `/crea/izazov`): fleg `crea_public_gallery` je na DEV-u isključen, pa obe strane vraćaju „Ova stranica je zalutala" (`notFound()`). Flegove ne smem da menjam (pravila runa: bez `npx convex env`, ne diraj flegove);
- **prijavljeni delovi** (biblioteka u `/app/studio`, sveska sa niz/liga/par/knjižica, glasanje): Playwright nije prijavljen (isto kao K06–K16), a prijava ide kroz auth tok koji se ne dira.

U izlogu su proverene iste komponente: `ChallengeView`, `LeagueView`, `PairView`, `PublicWorkView`, `StudioMediaTile`, `CreaReportCardView` i `CreaStreakPanel`.

Pokušaji pre BLOKADE (12; svaki dozvoljen put je iskorišćen):
1. izlog na `next dev --webpack` (sve K17 sekcije, 390 i 1440 px, obe teme);
2. produkcioni build `next start` kao gost: sveska i knjižica rade;
3. galerija i izazov na istom buildu: oba vraćaju `notFound()`;
4. provera izvora flega: `isCreaGalleryEnabled` → `creaGallery.galleryState` → `readCreaFlag(crea_public_gallery)`.
5. Playwright MCP kao prijavljen: ne može. `.igra-run/mcp.json` pokreće ga sa `--isolated`, bez sačuvane sesije ili profila.
6. dev prijava ili zamena identiteta u kodu (`dev-login`, `impersonat…` u `app/`, `lib/`, `convex/`): ne postoji.
7. sačuvan Playwright `storageState` u repou: ne postoji.
8. pregled galerije bez flega preko parametra: ne postoji. Galerija čita samo `prikaz`, `vrsta` i `sezona`; fleg se ne zaobilazi.
9. vrednost flega na DEV-u, javni upit samo za čitanje (`POST /api/query creaGallery:galleryState` na `wandering-fox-41`): `{"enabled":false,"isStaff":false,"signedIn":false}`. `npx convex run` u ovoj ljusci ne ispisuje rezultat.
10. sveska iza prijave (`/app/studio/sveska`): ista `CreaNotebook` kao `/crea/sveska`, a `/app/*` traži prijavu (proxy).
11. `/app/studio/gallery`: samo `redirect` u biblioteku radionice, koja je takođe iza prijave.
12. auth provajderi (`convex/auth.ts`): samo `Password` i `ConvexCredentials` („password-login"). Prijava traži lozinku postojećeg naloga, a pravljenje test naloga je upis kroz auth tok, što je zabranjeno.

Fleg je red u DEV bazi, a ne lokalna env varijabla. Uključiti ga znači upisati podatke u Convex, a to pravila runa zabranjuju.

Prijavljene strane traže prijavu kroz auth tok, koji se ne dira, a bez tajni drugog puta nema. Ponovni pokušaji bi udarili u ista dva ograničenja, pa se BLOKADA ne može razrešiti u ovom koraku.

Jovan ručno: uključi `crea_public_gallery` na DEV-u i otvori `/crea/galerija` i `/crea/izazov`, pa kao prijavljen otvori biblioteku i svesku.

**Za Jovana ujutru:**
- **Biblioteka** (`/app/studio`, „Biblioteka"): radovi od danas nose „Novo", omiljeni srce; isprazni filter → Robi sa lupom.
- **Galerija i izazov** (uz upaljen `crea_public_gallery`): naslovnica sa Piksijem / peharom; kod pobednika kruna „udari" kad skroluješ do rezultata.
- **Sveska** (`/crea/sveska`): naslovnica sa Robijem, plamen niza, rang čipovi u ligi, korica knjižice; nedeljena knjižica na `/crea/knjizica/<ime>` prikazuje katanac.
- **Ukus:** da li je „Novo" 24 h pravi prozor i da li naslovnica treba okvir (sada je bez, ODLUKA 4). Snimci: `K17-crea-izazov-1440-svetla.png`, `K17-crea-sveska-1440-svetla.png`, `K17-crea-biblioteka-1440-tamna.png`.

## K18 — Poruke i obaveštenja   (2026-10-14 10:25)
**Fajlovi:**
- novi: `components/igra/chat/chat-empty.tsx` (`MessagesPickEmpty`, `InboxEmpty`, `InboxSearchEmpty`, `ThreadEmpty`, `StudyEmptyArt`), `components/igra/izlog/izlog-poruke.tsx`, `lib/igra-messages.test.ts`, `docs/igra/snimci/K18-poruke-1440-svetla|tamna.png`, `K18-poruke-390-tamna.png`
- izmenjeni: `components/app/chat/messages-hub.tsx`, `chat-inbox.tsx`, `chat-thread.tsx`, `chat-composer.tsx`, `study-hub.tsx`, `components/igra/izlog/registry.ts` (deo „poruke"), `lib/igra-copy.ts` (`IGRA_MESSAGES_COPY`), `lib/igra-izlog.test.ts` (spisak delova), `scripts/check-frames.mjs` (`components/igra/chat` u `ROOTS`)

**Šta je urađeno:** Prazna stanja četa dobila su ilustracije, a tekstovi i pozivi dugmadi su isti kao pre: strana bez izabranog razgovora (`prazno.poruke`, 160 px), prazna lista (na telefonu `prazno.poruke` 120 px, od `lg` Eho), pretraga bez rezultata (`prazno.pretraga`), razgovor bez poruka (Eho 64 px + „Dovoljno je i „Zdravo“.“) i svih pet praznih stanja „Uči zajedno" (Sova u pozama mase/misli/slavi). Obaveštenja (`prazno.obavestenja`, Iskra, „pristiglo") je već u K11 uradio, pa u K18 nisu dirana. Mikrointerakcije: dugme „Pošalji" se utisne (`active:scale-90`, bez toga uz smanjen pokret), a nova reakcija na poruci „iskoči" jednom kroz postojeći `ChatMotionScope`. Nova poruka (poslata i primljena) već je igrala kroz isti sistem, pa je ostavljena. Ništa ne menja visinu redova; izmereno u izlogu: visina liste ista pre i posle slanja i reakcije.

**Površine:** gotovo: poruke (prazna stanja, slanje, reakcije), Uči zajedno (prazna stanja), obaveštenja (iz K11). Nije dirano: logika četa, `ChatDock`, push, moderacija, privatnost, upiti, `convex/`.

**ODLUKE:**
1. **Obaveštenja nisu ponovo rađena.** `prazno.obavestenja` i Iskra su K11; zadatak K18 za njih je već ispunjen.
2. **Prazna lista nosi `prazno.poruke` samo ispod `lg`**, a od `lg` Eha: desna strana tada već crta `prazno.poruke` i ista slika ne bi smela da stoji dvaput. Na telefonu desna strana ne postoji.
3. **Pretraga poruka unutar razgovora** (`Nema pronađenih poruka.`) ostaje čist tekst: to je red u traci, ne ekran.
4. **Nova reakcija se pokreće efektom koji upoređuje skup emodžija** (isti obrazac kao `read-status`), a ne `data-chat-motion-new` na čipu, jer bi se svaki čip animirao pri učitavanju starijih poruka. Brojač na postojećem čipu se ne animira (klik ga već pulsira); reakcija drugog korisnika na postojeći emodži takođe ostaje bez pokreta.
5. **Zvuk nije dodat.** Ping nove poruke je i dalje samo u `chat-notifications.tsx` iza prekidača zvuka i podešavanja kategorije.
6. **Jedna nova rečenica** (Ehova u praznom razgovoru), u `lib/igra-copy.ts` (ODLUKA 12 iz K01). Ostali tekstovi su preneti doslovno.
7. **Izlog crta prave komponente praznih stanja**; baloniće u deo „Mikrointerakcije" sklapa izlog od istih `data-chat-motion` atributa (pravi `MessageBubble` čita Convex). Prazna stanja „Uči zajedno" u izlogu pokazuju jedan primer, ostala četiri su ista komponenta slike nad Convex podacima.
8. **Pregledač: samo izlog.** Prava `/app/messages` traži prijavu, a Playwright je neprijavljen (isto kao K06–K17), pa nije gledana.

**Novi paketi:** nema.

**Testovi:** `lib/igra-messages.test.ts` (9): slike u manifestu i spremne; sva četiri prazna stanja i pet Sova povezani; pozivi dugmadi nepromenjeni; tekstovi sr/en; komponente bez Convexa i zvuka; dugme „Pošalji" i smanjen pokret; reakcija igra samo za novi emodži; ping čeka prekidač zvuka. `lib/igra-izlog.test.ts`: spisak delova + „poruke".

**Slike:** `prazno.poruke`, `prazno.pretraga`, `lik.eho.mase`, `lik.sova.mase|misli|slavi`. Nove slike nisu tražene. `ikona.poruke` nije korišćena (nema naslovne trake u ovom koraku).

**Rezultat provere:** codegen: nije potreban (`convex/` nije diran) / typecheck: prošlo / lint: prošlo (0 grešaka, istih 26 upozorenja) / test: prošlo (314 fajlova, 3.557 testova) / check:frames, check:corners, check:white, check:igra `--strict`: prošlo. `npm run build` nisam puštao (runner ga pušta posle koraka).
- Izlog (`/igra-izlog?deo=poruke`), 1440 × 900 svetla i tamna, 390 × 844 tamna: sve slike učitane (lenje u sakrivenom `lg:hidden` ostaju neučitane, kako treba), nema vodoravnog skrola; slanje i reakcija: visina liste 288 → 288 px; uz `prefers-reduced-motion` samo fade (transform `none`). Dev server je ugašen.

**BLOKADA (prihvatanje „obe teme i telefon", delimično):** prave strane `/app/messages` i „Uči zajedno" traže prijavu kroz auth tok koji se ne dira, a Playwright MCP radi sa `--isolated` bez sačuvane sesije (isto ograničenje kao K06–K17). Zato su ekrani provereni u izlogu sa istim komponentama: 1440 svetla i tamna, 390 svetla (`K18-poruke-390-svetla.png`) i tamna, bez slomljenih slika i bez vodoravnog skrola.
**Za Jovana ujutru:** kao prijavljen otvori `/app/messages` sa praznim nalogom (lista, desna strana, pretraga „zzzz", novi razgovor bez poruka, „Uči zajedno") i pošalji poruku i reaguj sa 👍; uporedi sa `K18-poruke-1440-svetla.png`. Ukus: da li je Eho u listi na računaru bolji od iste slike dvaput (ODLUKA 2).

## K19 — Krediti, naplata, podešavanja   (2026-10-14 10:40)
**Fajlovi:**
- novi: `components/igra/account/account-head.tsx` (`AccountHead`), `components/igra/account/account-empty.tsx` (`CreditsNoPacks`, `CreditsNoHistory`, `ApiKeysEmpty`, `HelpTopicsEmpty`), `components/igra/izlog/izlog-krediti.tsx`, `lib/igra-credits.test.ts`, `docs/igra/snimci/K19-krediti-1440-svetla|tamna.png`, `K19-krediti-390-tamna.png`, `K19-krediti-novi-390-svetla.png`
- izmenjeni: `components/app/credits-page.tsx` (prikaz izdvojen u `CreditsView`), `profile-billing.tsx`, `api-keys-page.tsx`, `help-settings.tsx`, `profile-editor.tsx` (samo zaglavlje), `app/[locale]/app/credits/page.tsx` i `app/[locale]/app/profile/api-keys/page.tsx` (zaglavlje u strani bez backenda), `components/igra/izlog/registry.ts` (deo „krediti"), `lib/igra-fixtures.ts` (`CREDITS_FIXTURES`), `lib/igra-izlog.test.ts`, `scripts/check-frames.mjs` (4 fajla u `ROOTS`)

**Šta je urađeno:** Krediti, pretplata, profil i API ključevi imaju isto zaglavlje (`AccountHead`): ikona strane uz naslov (`ikona.krediti` za kredite i pretplatu, `ikona.podesavanja` za profil i ključeve), a na kreditima i Robi koji razmišlja od `lg`. Pomoć zajednice nosi `ikona.pomoc` umesto kruga sa ikonom. Prazna stanja imaju ilustracije: paketi (`prazno.uskoro`), istorija (`ikona.krediti`), API ključevi (`prazno.zakljucano`), teme pomoći (`prazno.uskoro`). Hijerarhija je mirnija: pretplata više nije žuti blok sa debelim okvirom, dugme „Izaberi paket" kad je stanje 0 više nije žuto, a kartice paketa i redovi istorije se odvajaju tankom `--line` linijom umesto punog okvira. Nema odometra, slavlja ni markera. Stranica kredita je razdvojena na `CreditsPage` (Convex pretplate) i `CreditsView` (prikaz iz props), pa je izlog crta sa test podacima.

**Površine:** gotovo: krediti, pretplata (`/app/billing`), profil (zaglavlje), API ključevi, pomoć zajednice, studio krediti (isti `CreditsPage`). Nije dirano: Stripe rute, `CheckoutAction`, paketi, cene, `credits.*` upiti, `SpendLimitCard`.

**ODLUKE:**
1. **Jedna rečenica izmenjena:** gostu se više ne kaže „…i mogao/la da kupiš još" (sada samo „…koliko kredita imaš."), jer plan traži bez „kupi još" pritiska. To nije tekst uslova.
2. **Dugme „Izaberi paket" (stanje 0) je papirno**, ne žuto, i pretplata je obična kartica; ostala dugmad za kupovinu su ista (tok plaćanja se ne dira).
3. **Naslov „Nijedan paket nije u prodaji" + ilustracija** u praznim paketima: tekst je već postojao u `CREDITS_NO_PACKS`, ranije se prikazivao samo telo.
4. **Povezane aplikacije** (prazna lista OAuth) zadržavaju ikonu `Plug`: nijedna spremna slika ne znači „nema veza", a `prazno.offline` bi zavaralo.
5. **Cena „9,99 EUR" u pretplati** je `rounded-full` (čip cene, AGENTS.md); iznos je isti. Okviri u `help-settings.tsx` i `credits-page.tsx` su preseljeni na `border border-line`, a ta četiri fajla su u `check:frames` ROOTS.
6. **Zatečeno, nije diran:** datumi na kreditima koriste `sr-RS` (ćirilica u mesecu, „октобар"); `api-keys-page.tsx` već koristi `sr-Latn-RS` sa komentarom. Brojevi i cene ostaju, pa to ostavljam Jovanu. `/app` budžet je sada 294/294 KB (zaokruživanje, K19 ne dira tu rutu).
7. **Profil (`profile-editor.tsx`) menja samo zaglavlje**; ostatak je zatečen i van `check:frames` opsega.

**Novi paketi:** nema.

**Testovi:** `lib/igra-credits.test.ts` (9): slike spremne u manifestu; ikone po stranama; Robi samo na kreditima i samo od `lg`; bez odometra/slavlja/markera/XP-a; bez „kupiš još" i bez žutog CTA/debelog okvira; iste Stripe rute, cene, iznosi i redosled kartica; demo cena u pretplati; pozivi API ključeva i pomoći; test podaci izloga (stanje = zbir lotova, cene i krediti kao u `convex/seed.ts`). `lib/igra-izlog.test.ts`: deo „krediti".

**Slike:** `ikona.krediti`, `ikona.podesavanja`, `ikona.pomoc`, `lik.robi.misli`, `prazno.uskoro`, `prazno.zakljucano`. Nove slike nisu tražene.

**Rezultat provere:** codegen: nije potreban (`convex/` nije diran) / typecheck: prošlo / lint: prošlo (0 grešaka, istih 26 upozorenja) / test: prošlo (315 fajlova, 3.567 testova) / check:frames, check:corners, check:white, check:igra `--strict`: prošlo / build + check:bundle: prošlo.
- Izlog (`/igra-izlog?deo=krediti`, stanja novi i aktivan), 1440 × 900 svetla i tamna, 390 × 844 tamna i svetla: 0 slomljenih slika, nema vodoravnog skrola, Robi sakriven na telefonu; isti iznosi na ekranu (1.250 kredita ≈ 104 slike; Starter 5,00 / Creator 15,00 / Pro 40,00 EUR; Premium 24,99 EUR). Dev server je ugašen (port 3123 slobodan), Playwright `page-*.yml` i `console-*.log` obrisani.

**BLOKADA (samo provera, ne kod):** prave strane (`/app/credits`, `/app/billing`, `/app/profile`, API ključevi) traže prijavu kroz auth tok koji se ne dira, a Playwright MCP radi `--isolated` bez sesije (isto kao K06–K18). `CreditsView` u izlogu je ista komponenta koju prava strana renderuje; limit potrošnje (Convex kartica) u izlogu nije prikazan. Zaglavlja profila, ključeva i pomoći proverena su preko `AccountHead` i praznih stanja u izlogu, ne na pravim stranama.

**Za Jovana ujutru:** kao prijavljen otvori `/app/credits` (stanje 0 i sa kreditima), `/app/billing`, `/app/profile` (zaglavlje i „Pomoć zajednice"), `/app/profile/api-keys`; uporedi sa `K19-krediti-1440-svetla.png`. Proveri da se nijedan broj ni cena nisu promenili. Ukus: `prazno.uskoro` (poklon) na praznim temama pomoći i paketima; Robi iznad kartice stanja na desktopu; datumi na ćirilici (ODLUKA 6).

## K20 - Plan: admin „Kontrolna soba”   (2026-10-14 10:54)
**Plan korak.** Plan je upisan u `docs/igra/planovi/K20.md`. Nije menjan kod.

### ODLUKE K20 (plan admin; prepisao K21, pun tekst u `docs/igra/planovi/K20.md`)
1. Kontrolna soba je vrh `/app/admin/content`; `/app/admin` ostaje 307 na `/content`, naslov strane ostaje „Sadržaj", „Kontrolna soba" je eyebrow heroja.
2. Na pregledu nema sparkline-a: nijedan postojeći upit nema dnevni niz za sadržaj, studente ili moderaciju. Nov upit nad `studioUsageDaily.by_day` je predlog za Jovana.
3. Jedini dnevni niz su `createdAt` redovi `studioAdmin.listPromptLog` / `listModerationEvents` (≤ 200): dan koji 200 redova ne pokriva je nepoznat (`null`), ne nula; dan najstarijeg reda na plafonu je donja granica. Dani po Beogradu.
4. Status sistema čita samo postojeće upite (`getKillSwitchState`, `getUsageSummary({ now })` sa zamrznutim `now`, `getUserNotificationSummary({})` deljen sa sidebarom). `convex/` se ne dira.
5. KPI: tri brojača sadržaja su jedna kartica `admin.sadrzaj` (kolone deli `divide-line`), Studenti `admin.korisnici`, nova pločica „Čeka pregled" `admin.zajednica` (link na red moderacije).
6. Novac nema odometar. 7. `Odometer` se ne menja (vrti se pri prvom prikazu i pri stvarnoj promeni). 8. Scena heroja nije `priority`; telefon je ne preuzima.
9. `IgraState` ne postoji → `EmptyState art` (Bajt 120 px na stranama „U pripremi").
10. Nalepnice: Sadržaj `admin.sadrzaj`, Korisnici `admin.korisnici`, Rast `admin.prihod`, Analitika `admin.sistem`, Chat sigurnost i red misija `admin.moderacija`, Crea admin `admin.generacije` (+ `admin.troskovi`), „Čeka pregled" `admin.zajednica`, Opšte informacije `ikona.podesavanja`.
11. Stanja: `Badge` tonovi (`neutral` ok, `ink` pažnja, `danger` problem) + ikona + reč; bez novih boja, bez žute za stanja. 12. Robi miran, bez uzvičnika; `mase` / `misli` / `tuzan`.
13. Red misija je samo izgled („N čeka" iz `pendingApprovals`, redni broj u učitanom redu, iste akcije). 14. Fajlovi sa zatečenim ugnežđenim okvirima ne ulaze u `check:frames` ROOTS.
15. `DashboardWindow` dobija opcioni `art`, samo za dva admin prozora; `/app` ≤ 294 KB. 16. Zatečeno, ne dira se: CTA „Otvori korisnike" vodi na „U pripremi"; `animate-pulse` u `KillSwitchCard`; tekstovi chat konzole i reda moderacije van `lib/i18n`.

## K21 — Admin: pregled, analitika, korisnici   (2026-10-14 11:20)
**Fajlovi:**
- novi: `lib/igra-admin.ts`, `lib/igra-admin.test.ts`, `lib/igra-admin-copy.ts`, `components/igra/admin/admin-head.tsx`, `admin-control-hero.tsx`, `admin-hero-scene.tsx`, `admin-kpi.tsx`, `admin-charts.tsx`, `admin-analytics.tsx`, `components/igra/izlog/izlog-admin.tsx`, `docs/igra/snimci/K21-admin-*.png` (9)
- izmenjeni: `components/app/admin-content-manager.tsx` (`AdminPageFrame` sa nalepnicom, `AdminControlRoom`, KPI, strane „U pripremi", Analitika sa grafikonima, obrisan `StatCard`), `components/app/dashboard-windows.tsx` (`art` prop + dva admin prozora), `app/globals.css` (`.igra-chart-hatch`), `lib/igra-fixtures.ts` (`ADMIN_FIXTURES`), `components/igra/izlog/registry.ts` (deo „admin"), `lib/igra-izlog.test.ts`, `scripts/check-crea-bundle.mjs` (budžeti admin ruta)

**Šta je urađeno:** Vrh strane Sadržaj (`/app/admin/content`) je „Kontrolna soba": heroj na listu papira (jedan okvir) sa scenom `scena.kontrolna-soba` desno (samo od `lg`), naslovom „Sadržaj", Robijem koji u oblačiću javlja najvažnije stanje sistema („Sve radi." / „3 objave na čekanju." / „Čuvar troška se ne javlja. Pogledaj Crea admin.") i četiri pilule stanja (Crea radi/ugašena, čuvar troška, današnji trošak prema alarmu, red na čekanju); svaka pilula je veza na stranu koja to rešava. Ispod je KPI red sa nalepnicama i odometrima: kartica Sadržaj (Smerovi, Kursevi, Lekcije sa istim bedževima statusa), Studenti i nova pločica „Čeka pregled" (veza na red moderacije). Analitika više nije samo „U pripremi": crta tri grafikona u stilu sveske iz postojećih upita — stanje sadržaja (100 % složene trake sa legendom: puno mastilo / šrafura / `--muted`), Crea poslovi danas po statusu (trake) i Crea upiti po danu za 14 dana (stubići propuštenih i odbijenih, sa poštenim „nepoznat dan" kad zapisi pogode plafon od 200) — a ispod ostaje „U pripremi" za posete iz Google Analytics-a. Korisnici, Rast i Analitika imaju `admin.*` nalepnicu uz naslov, Bajta u praznom stanju i nalepnice na vezama „Dotle možeš ovde". Dva admin prozora na tabli nose nalepnice `admin.sadrzaj` / `admin.moderacija`. Sve je u izlogu (`/igra-izlog?deo=admin&stanje=novi|aktivan|legenda`, sa prekidačem „Učitava se").

**Površine:** gotovo: Kontrolna soba (heroj, stanje sistema, KPI), Analitika, Korisnici i Rast („U pripremi" sa ilustracijom), admin prozori na tabli. Nije dirano (K22): ostatak strane Sadržaj (navigator, spremnost, pregled), red moderacije, Crea admin, chat konzola, podešavanja. Nije dirano nikad: akcije, dozvole, `convex/`, rute.

**ODLUKE:**
1. **Analitika dobija grafikone**, iako je plan K20 za nju predvideo samo Bajta: prompt K21 ih traži („grafikoni u stilu sveske … bez novih skupih upita"). Crtaju samo ono što baza već zna kroz POSTOJEĆE admin upite (`getAdminOverview`, `getUsageSummary`, `listPromptLog`, `listModerationEvents`); posete ostaju „U pripremi" (tekst isti), ništa se ne izmišlja.
2. **Na pregledu i dalje nema sparkline-a** (ODLUKA K20-2): dnevni niz postoji samo za Crea upite, pa živi na Analitici kao stubići od 14 dana, ne kao sparkline na strani Sadržaj (tamo bi `listPromptLog` ponovo čitao 200 redova pri svakom radu u Crei, a strana je urednik). **Za K22:** `InkColumns`, `InkBarList`, `InkStackedBars` (`components/igra/admin/admin-charts.tsx`) i `dailyCountSeries` već postoje; isti niz na Crea adminu bio bi duplikat Analitike. Preporuka: Crea admin dobija zaglavlje i nalepnicu `admin.troskovi`, a za niz samo vezu ka Analitici.
3. **Korisnici: nema liste koja bi „ostala gusta"** — strana je i dalje „U pripremi". `profiles.listProfilesForAdmin` postoji, ali ga nijedan ekran ne koristi; spisak naloga bio bi nova funkcija i nov prikaz ličnih podataka, ne izgled. Zato nema ni pečata nivoa po korisniku (nema reda za njega).
4. **Tekstovi admina su u `lib/igra-admin-copy.ts`, ne u `lib/igra-copy.ts`.** Sa njima u `igra-copy` početni JS table (`/app`) je izmeren 294,2 KB (budžet 294), jer se `igra-copy` ceo uvozi na tabli. Posle selidbe `/app` je 292,9 KB. Oblik je isti `{ sr, en }` (K01 ODLUKA 12).
5. **Scena heroja se crta tek kad `matchMedia("(min-width: 1024px)")` kaže da je ekran širok** (`AdminHeroScene`, `useSyncExternalStore`, serverski snimak „bez scene"). Plan je predvideo `hidden lg:block` + lenju sliku, ali je izlog na 390 px pokazao da Chromium ipak preuzima lenju sliku u `display:none`. Sada na 390 px nema ni `<img>` ni zahteva (izmereno: 0 zahteva), na 1440 se scena učitava; kutija je apsolutna, pa dolazak slike ne pomera tekst.
6. **Convex upiti Kontrolne sobe su u `admin-content-manager.tsx`** (`AdminControlRoom`), ne u `components/igra/admin/admin-control-room.tsx` kako je plan rekao: `components/igra/admin/*` ostaje čisto prezentaciono (test). `AdminControlRoom` je zasebna komponenta, pa promena današnjih poslova (`getUsageSummary`) ne crta ponovo urednik ispod.
7. **Pragovi troška su strogo „preko"** (`> alarm` pažnja, `> gašenje` problem), isto kao boja iznosa u Crea adminu; plan je pisao `≥`.
8. **Čuvar troška koji se nikad nije javio** (`costCapHeartbeatAt: null`) je „Čuvar troška se nije javio" i problem (Robi tužan), isto kao „nikad" u `ProminentHealthAlert`. Na DEV deploymentu bez crona to je stvarno stanje, ne greška prikaza.
9. **Robi i pilula reda pišu „N objava na čekanju"** (bez glagola), da ne bi bilo „3 objave čeka". 100 (plafon `take(100)`) piše „100+".
10. **„+" uz broj na plafonu** (studenti 2.000+, red 100+) je iste veličine kao broj, ne sufiks odometra (sufiks je za jedinicu i izgledao je kao „2.000 +").
11. **Boje grafikona samo iz mastila i papira**: objavljeno puno mastilo, nacrt šrafura (isti znak kao nacrt u navigatoru), arhivirano `--muted`; današnji stubić pun, raniji `ink/40`, nepotpun dan šrafiran, nepoznat dan tačkasta linija. Nova klasa `.igra-chart-hatch` u `@layer components` (`var(--ink)` / `var(--paper)`, radi u obe teme). Svaka vrednost postoji i kao tekst, svaki znak ima `title`, stubići imaju `sr-only` tabelu, trake `role="img"` sa opisom.
12. **Admin prozori**: nalepnica 32 px u istoj pločici `size-10` (pozadina zone ostaje), ostali prozori bez izmene.
13. **Budžeti admin ruta** (`check:bundle`): početni JS pre K21 nije izmeren (izmene su napravljene pre prvog build-a, a `git stash` je zabranjen). Posle K21: Sadržaj / Analitika / Korisnici dele modul, 321 KB; Crea admin 283 KB (K21 ga ne dira). Budžeti: 325 / 325 / 288 KB.

**Novi paketi:** nema.

**Testovi:** `lib/igra-admin.test.ts` (21): čuvar troška na granici 60 min, greška i „nikad"; pragovi troška i zapis iznosa; „100+"; pilule redom sa putanjama, `null` dok bilo koji upit nije stigao; Robi (prioritet problem > pažnja > ok, unutar tona čuvar > trošak > Crea > red), tekstovi sr/en bez uzvičnika; test podaci daju `mase` / `misli` / `tuzan`; beogradski dan oko ponoći i oba prelaska vremena; dnevni niz bez i sa plafonom (nepoznati dani, donja granica), plafon 200 isti kao `take(200)` u `convex/studioAdmin.ts`; visina stubića i udeli složene trake; slike u manifestu i spremne; scena na jednom mestu, bez `priority`, samo uz `matchMedia`; prezentacione komponente bez Convexa, bez 3D/GSAP pluginova/animacije po redu; admin čita TAČNO postojeće upite i iste mutacije; tekstovi „U pripremi" doslovno isti; novac bez odometra; samo dva admin prozora sa nalepnicom. `lib/igra-izlog.test.ts`: deo „admin".

**Slike:** `scena.kontrolna-soba`, `admin.sadrzaj|korisnici|prihod|sistem|moderacija|generacije|zajednica`, `lik.robi.mase|misli|tuzan`, `lik.bajt.misli`. `admin.troskovi` čeka K22 (Crea admin). Nove slike nisu tražene.

**Rezultat provere:** codegen: nije potreban (`convex/` nije diran) / typecheck: prošlo / lint: prošlo (0 grešaka, istih 26 upozorenja) / test: prošlo (316 fajlova, 3.588 testova) / check:frames, check:corners, check:white, check:igra `--strict`: prošlo / build + check:bundle: prošlo (`/app` 293/294, admin 321/325, Crea admin 283/288).
- Izlog (`/igra-izlog?deo=admin`), `next dev --webpack` na 3123: 1440 × 900 svetla i tamna (aktivan), 390 × 844 tamna (aktivan) i svetla (legenda): 0 slomljenih slika, nema vodoravnog skrola, pilule visoke 44 px, scena na 390 bez zahteva; uz `prefers-reduced-motion` brojevi odmah stoje (4 / 12 / 86 / 240 / 3 posle 150 ms). Konzola bez grešaka (samo `motion` upozorenje o smanjenom pokretu). Dev server je ugašen (port 3123 slobodan), Playwright `page-*.yml` i `console-*.log` obrisani.

**BLOKADA (samo provera, ne kod):** prave admin strane traže prijavu kao admin kroz auth tok koji se ne dira, a Playwright MCP radi bez sesije (isto kao K06–K19). Heroj, KPI, Analitika, „U pripremi" i admin prozori su provereni u izlogu sa istim komponentama; povezivanje sa upitima je provereno typecheck-om i testom nad izvorom.

**Za Jovana ujutru:** kao admin otvori `/app/admin/content` (Robi i četiri pilule odgovaraju stvarnom stanju: Crea uključena, čuvar troška, današnji trošak, red; brojevi Smerovi/Kursevi/Lekcije/Studenti isti kao pre), `/app/admin/analytics` (grafikoni, napomena „iz poslednjih 200 zapisa" kad je plafon), `/app/admin/users` i `/growth` (Bajt) i tablu `/app` (dva admin prozora sa nalepnicama). Uporedi sa `K21-admin-pregled-1440-svetla.png` i `K21-admin-analitika-1440-svetla.png`. Odluči: da li želiš pravi spisak korisnika (nova funkcija nad `profiles.listProfilesForAdmin`, ODLUKA 3) i dnevni niz troška (nov upit, ODLUKA K20-2). Ukus: veličina Robija (64 px) u heroju.


## K22 — Admin: sadržaj, moderacija, Crea, čet, podešavanja   (2026-10-14 11:37)
**Fajlovi:**
- novi: `components/igra/admin/mission-queue-head.tsx` (`MissionQueueHead`, `MissionNumber`), `components/igra/admin/ready-stamp.tsx` (`ReadyStamp`), `docs/igra/snimci/K22-admin-*.png` (8)
- izmenjeni: `components/app/admin-content-manager.tsx` (pečat spremnosti, Bajt u praznom stanju), `components/app/community-thread-moderation.tsx` (glava „Red misija", redni broj misije, Robi u praznom redu), `components/app/studio-moderation-grid.tsx` (prazno stanje sa `prazno.pretraga`), `components/app/studio-admin-page.tsx` (`AdminHead` sa `admin.generacije`, nalepnica `admin.troskovi` uz Potrošnju, veza ka Analitici), `components/app/chat/chat-moderation-console.tsx` (nalepnica u zaglavlju, Robi u praznom panelu, status prijave rečju), `components/app/admin-platform-settings.tsx` (`AdminHead` sa `ikona.podesavanja`), `lib/igra-admin-copy.ts` (5 ključeva), `components/igra/izlog/izlog-admin.tsx` (sekcije „Red misija", „Spremnost", „Zaglavlja"), `lib/igra-admin.test.ts`, `scripts/check-frames.mjs` (+ `admin-platform-settings.tsx` u ROOTS)

**Šta je urađeno:** Red moderacije zajednice (`/app/community/moderation`) je „Red misija": ispod postojećeg toolbara stoji glava sa nalepnicom `admin.moderacija`, naslovom (`h1`), jednom rečenicom i brojem „N na čekanju" (odometar, `pendingApprovals` iz iste pretplate kao sidebar, 100 → „100+"); svaki red dobija malu pilulu rednog broja pored avatara (sr-only „Misija"), a prazan red Robija koji slavi. Redovi, redosled, `initialNumItems: 8`, „Učitaj još", obe akcije i dijalog su isti, bez animacije po redu. U uredniku Sadržaja spremna stavka dobija pečat „Spremno · 5/5" (`.igra-stamp`, ikona + reč; udari samo kad stavka postane spremna, uz smanjen pokret odmah stoji), nespremna zadržava istu žutu pilulu `x/y`; prazno „Izaberi šta uređuješ" ima Bajta (96 px). Crea admin, Chat sigurnost i Opšte informacije imaju ilustrovana zaglavlja (nalepnica + isti naslov), Crea pregled poslova i chat konzola imaju ilustrovana prazna stanja. Tabele, filteri, forme, prekidač za gašenje i alarm su netaknuti.

**Površine:** gotovo: red misija, spremnost i prazno stanje urednika, zaglavlja Crea admina / Chat sigurnosti / Opštih informacija, prazna stanja Crea poslova i chat konzole. Svesno nije rađeno: sparkline-ovi u Crea adminu (ODLUKA 1). Nije dirano: akcije, dozvole, `convex/`, flegovi, cene, rute.

**ODLUKE:**
1. **Crea admin nema sparkline-ove** (plan K20 §5.2 ih je predviđao). K21 je isti niz (Crea upiti po danu, 14 dana, iz `listPromptLog`/`listModerationEvents`) već nacrtao na Analitici i preporučio da Crea admin dobije samo zaglavlje, `admin.troskovi` i vezu. Konzervativno: bez duplikata i bez dve nove pretplate od po 200 redova na Crea adminu; ispod naslova „Crea" stoji veza „Crea upiti po danu su na Analitici". Zato ni `dailyCountSeries`/`sparklinePath` nisu menjani (prvi već postoji iz K21, drugi nije potreban).
2. **„Jasni statusi" u chat konzoli:** status prijave u listi i u detalju je ranije bio sirov enum (`open`, `reviewing`…); sada ide kroz postojeću `reportStatusLabel` („Otvoreno", „U pregledu"…). Samo prikaz, iste vrednosti i iste akcije. `targetType` i ostali tekstovi konzole ostaju zatečeni (ODLUKA K20-16).
3. **Pečat spremnosti nosi i broj** („Spremno · 5/5") i ikonu, da stanje nikad nije samo boja i da se ne izgubi informacija koju je stara zelena pilula imala. Boja je postojeći `--igra-stamp`; zelena `bg-emerald-100` više nije u upotrebi u tom elementu. Stavke spremnosti (zelene/crvene/žute kartice) nisu menjane.
4. **Glava reda misija se crta samo kad red nije prazan** (plan §4.1); prazno stanje tada govori samo. Na telefonu broj „N na čekanju" prelazi u novi red (`basis-56` na tekstu), jer je tekst pored broja bio stisnut na ~110 px (viđeno u izlogu).
5. **Pretplata na `getUserNotificationSummary` u redu misija je `isStaff ? {} : "skip"`**: za osoblje su argumenti isti kao u sidebaru (`{}`), pa Convex deli pretplatu (0 novih čitanja); ne-osoblje ništa ne čita.
6. **Nalepnica u Chat sigurnosti** je ubačena zamenom tačnih podnizova u jednolinijskom JSX-u; fajl i dalje nije u `check:frames` ROOTS (zatečeni ugnežđeni okviri, ODLUKA K20-14). `admin-platform-settings.tsx` je ušao u ROOTS — `check:frames` prolazi.
7. **Redni broj misije** je `index + 1` u učitanom redu (ključ ostaje `post._id`); pilula ima tanku `border-line` ivicu, ne `border-2` (jedan okvir po grupi).

**Novi paketi:** nema.

**Testovi:** `lib/igra-admin.test.ts` + 5 testova (K22): sve nove slike (`admin.troskovi`, `admin.generacije`, `admin.moderacija`, `ikona.podesavanja`, `prazno.pretraga`, `lik.robi.slavi|misli`, `lik.bajt.misli`) su u manifestu i spremne; red misija čita deljenu pretplatu, „100+", redni broj ne menja ključ, iste akcije i isti `initialNumItems`/`loadMore(8)`, bez `useEnterStagger`/GSAP pluginova/three u svim K22 fajlovima; pečat samo kad je spremno, pilula `x/y` ostaje; Crea admin bez odometra i sa istih 6 mutacija, Crea poslovi sa `revealJobDetail`; chat konzola sa istih 6 mutacija i statusom rečju; podešavanja sa `platformSettings.update`. Postojeći test „bez uzvičnika, sr i en za svaki ključ" pokriva i nove tekstove.

**Slike:** `admin.moderacija`, `admin.generacije`, `admin.troskovi` (sada je svih 8 `admin.*` u upotrebi), `ikona.podesavanja`, `prazno.pretraga`, `lik.robi.slavi`, `lik.robi.misli`, `lik.bajt.misli`. Nove slike nisu tražene.

**Rezultat provere:** codegen: nije potreban (`convex/` nije diran) / typecheck: prošlo / lint: prošlo (0 grešaka, istih 26 upozorenja) / test: prošlo (316 fajlova, 3.593 testa) / check:frames, check:corners, check:white, check:igra `--strict`: prošlo / build + check:bundle: prošlo (Sadržaj i Analitika 321/325, Crea admin 284/288 (+1 KB: `AdminHead` + nalepnice), `/app` 294/294 — K22 ne dira module table, isti broj kao pre zaokruživanja).
- Izlog (`/igra-izlog?deo=admin`, sekcije „Red misija", „Spremnost", „Zaglavlja"), `next dev --webpack` na 3123: 1440 × 900 svetla (aktivan) i tamna (legenda), 390 × 844 svetla (legenda) uz `prefers-reduced-motion` (pečat bez transformacije, broj odmah stoji): 0 slomljenih slika, nema vodoravnog skrola, konzola bez grešaka. Dev server ugašen (3123 slobodan), Playwright `page-*.yml`/`console-*.log` obrisani.

**BLOKADA (samo provera, ne kod):** prave strane (`/app/admin/*`, `/app/community/moderation`, Crea pregled poslova) traže prijavu kao admin/moderator kroz auth tok koji se ne dira, a Playwright MCP radi bez sesije (isto kao K06–K21). Komponente su proverene u izlogu; povezivanje sa stranama typecheck-om i testovima nad izvorom.

**Za Jovana ujutru:** kao admin otvori `/app/community/moderation` (glava „Red misija", „N na čekanju" = broj u sidebaru, redni brojevi 1…8, „Učitaj još" nastavlja brojanje), `/app/admin/content` (izaberi spremnu lekciju → pečat „Spremno · n/n"; nespremna → žuta pilula), `/app/admin/studio` (nalepnice u zaglavlju i uz Potrošnju, veza ka Analitici), `/app/admin/chat` (nalepnica, Robi kad nije izabrana prijava, statusi „Otvoreno/U pregledu…") i `/app/admin/settings`. Crea pregled poslova (Crea za osoblje) sa filterom bez rezultata → ilustracija. Odluči: da li ipak želiš sparkline-ove i na Crea adminu (ODLUKA 1). Uporedi sa `K22-admin-red-misija-1440-svetla.png` i `K22-admin-zaglavlja-1440-tamna.png`.

## K23 — Prazna stanja, greške, učitavanje   (2026-10-14 12:15)
**Fajlovi:**
- novi: `components/igra/igra-state.tsx` (`IgraState`), `components/igra/igra-error-state.tsx` (`IgraErrorState`), `components/igra/igra-offline-notice.tsx` + `igra-offline-bar.tsx`, `components/igra/use-online.ts`, `lib/igra-state.ts` + `lib/igra-state.test.ts`, `app/[locale]/app/not-found.tsx`, `app/[locale]/app/[...notFound]/page.tsx`, `app/[locale]/studio/(shell)/app/error.tsx`, `components/igra/izlog/izlog-stanja.tsx`, `docs/igra/snimci/K23-stanja-*.png` (4)
- izmenjeni: `lib/igra-copy.ts` (`IGRA_STATE_COPY`), `components/igra/izlog/registry.ts`, `lib/igra-izlog.test.ts`, `components/igra/igra-art.tsx` (fallback ikone lenjo), `components/app/app-shell.tsx`, tri `error.tsx` (`app`, `community`, `messages`), mesta iz spiska ispod

**Šta je urađeno:** Jedna zajednička komponenta `IgraState` (nad postojećim `EmptyState`) ima sedam varijanti: prazno, greška, 404, učitavanje, offline, zaključano, uskoro. Slika, tekst i ARIA uloga po varijanti stoje u `lib/igra-state.ts` + `IGRA_STATE_COPY` (sr/en, kratko, bez krivice korisnika). Uz `page` je ceo ekran, uz `compact` stoji unutar liste/dijaloga bez okvira. Granice greške (`/app`, zajednica, poruke, Crea `/app`) idu preko `IgraErrorState`: bez mreže (`navigator.onLine`) prikazuje „Nema interneta" umesto „greška". Unutar ljuske je ilustrovan 404 (`app/not-found.tsx` + hvatač `[...notFound]` pod `/app`; javni 404 netaknut), a tiha traka „Nema interneta" stoji na vrhu sadržaja ljuske samo dok veze nema.

**Spisak zamenjenih mesta:**
- *Granice greške i 404:* `app/error.tsx`, `community/error.tsx`, `messages/error.tsx`, novi `studio/(shell)/app/error.tsx`, novi `app/not-found.tsx` + `[...notFound]`.
- *Offline („baza nije povezana"):* `/app/credits`, `/app/studio`, `/app/studio/m/[jobId]`, `/crea/app`, `/crea/app/m/[jobId]`, `/crea/krediti`; traka bez veze u ljusci.
- *Prazno / 404 / zaključano / uskoro (cela površina):* profil člana „nije pronađen", tema „nije dostupna", editor „nije dostupan", razgovor „nije dostupan", pretraga poruka, novi razgovor „nema članova", slike grupe, odlazni pozivi, pretraga četa (greška), lekcije bez sadržaja (slika/video/tekst), materijali, kurs bez lekcija (tabla), Crea katalog alata i način rada bez modela, nalog suspendovan (slika umesto ikone).
- *Dodata ilustracija na postojeći `EmptyState`:* smerovi, kursevi, filter kurseva (učionica), komentari, povezane aplikacije (API ključevi), zajednički kurs (profil), „moje teme", šest prozora table (`DASHBOARD_EMPTY_ART`), Crea sačuvani likovi.
- *Učitavanje (gol tekst → `compact` `ucitavanje`):* Crea album, galerija (3 mesta), javni rad, poziv, izbor medija (montaža, zvuk); prazna stanja montaže, izbora iz table, pozivnica 404.

**Površine:** gotovo: sve gore. Nije rađeno (ODLUKE 1–5): sidebar lista, admin tabele, inline poruke, `loading.tsx`, Crea istorija.

**ODLUKE:**
1. **`loading.tsx` ostaju skeleti** (`DashboardHomeSkeleton`, `ClassroomHubSkeleton`, poruke): K08/K09 su ih napravili da layout ne skače; ilustracija bi taj skok vratila. Varijanta `ucitavanje` postoji za gole „Učitavam…" redove, ne za skelete.
2. **Sidebar (`app-sidebar.tsx`) ne dobija slike.** Kratke poruke u uskoj šini (smerovi, lekcije, „zaključano") bi ilustracijom pojele visinu, a fajl je na svakoj ruti (`/app` budžet).
3. **Admin ekrani i inline statusi** (admin-inline-actions, lesson-steps-editor, `studio-admin-page` „Katalog je prazan", izbori u Crea alatima, „Nije uspelo - krediti su vraćeni", značke „istekao") nisu dirani: guste tabele i jednolinijske poruke nisu „prazno stanje" (plan 6.9: tabele ostaju guste). Crea istorija (`crea-history.tsx`) je jedna rečenica u podnožju, ostaje.
4. **`dashboard-content.tsx` učitava `IgraState` kroz `next/dynamic`** (test iz K08: fajl na svakoj ruti ne uvozi IGRA kod).
5. **Uskoro/zaključano** u lekcijama koristi `variant="uskoro"` (poklon) i za „video nije dodat" jer je to stanje koje će se rešiti samo.
6. **Stringovi u `IGRA_STATE_COPY`** (ne u `lib/i18n.ts`), po ODLUCI 12 iz K01.
7. **Fallback ikone `IgraArt` su sada lenjo učitane** (`next/dynamic`, predlog iz K16): bez toga je `/app` bio 295,2 KB (budžet 294); sada 291,4. Sve rute su pale za 2–4 KB. Fallback se i dalje crta (SSR), samo se mapa od ~40 lucide ikona ne šalje unapred.
8. **Traka bez veze** čeka pregledač (`navigator.onLine`) jer Convex ne javlja prekid; telo trake je `next/dynamic` da ne ide u početni JS ljuske.
9. **Poruke u grešci**: zadržani su specifični naslovi svake granice („Pregled nije učitan" itd.), sa novim rečenicama „To nije do tebe…".

**Novi paketi:** nema.

**Testovi:** `lib/igra-state.test.ts` (9): svaka varijanta ima spremnu sliku iz manifesta, sr/en tekst bez uzvičnika i krivice, dugme samo na greška/404/offline, ARIA uloge, offline umesto greške bez mreže, granice greške koriste `IgraErrorState` bez ručnog okvira, 404 u ljusci + javni 404 netaknut, traka samo bez veze (lenja), bez GSAP/three. `lib/igra-izlog.test.ts` dobio deo „stanja".

**Slike:** `prazno.greska`, `prazno.404`, `prazno.ucitavanje`, `prazno.offline`, `prazno.zakljucano`, `prazno.uskoro`, `prazno.kursevi`, `prazno.objave`, `prazno.obavestenja`, `prazno.poruke`, `prazno.radovi`, `prazno.par`, `prazno.pretraga`, `lik.robi.misli`, `lik.robi.slavi`, `lik.sova.misli`, `lik.kadar.misli`, `lik.piksi.misli`. Nove slike nisu tražene.

**Rezultat provere:** codegen: nije potreban (`convex/` nije diran) / typecheck: prošlo / lint: prošlo (0 grešaka, istih 26 upozorenja) / test: prošlo (317 fajlova, 3.602 testa) / check:frames, check:corners, check:white, check:igra: prošlo / build + check:bundle: prošlo (`/app` 291,4/294 — pre lenjih fallback ikona 295,2; Crea `/app` 495/512; `/app/studio` 556/595).
- Izlog (`/igra-izlog?deo=stanja`), `next dev --webpack` na 3123: 1440 × 900 svetla i tamna, 390 × 844 svetla: sve varijante, `compact` i `page`; 0 grešaka u konzoli, bez vodoravnog skrola. Dev server ugašen, Playwright `page-*.yml`/`console-*.log` obrisani.

**BLOKADA (samo provera, ne kod):** prave strane iza prijave (granice greške, `/app/xyz` 404, profil bez korisnika, razgovor koji ne postoji) Playwright MCP bez sesije ne vidi (kao K06–K22), a granicu greške ne mogu da izazovem bez menjanja koda. Komponente su proverene u izlogu, povezivanje typecheck-om i testovima nad izvorom. Tamna tema na 390 i traka „Nema interneta" nisu snimljene (traka se pojavljuje samo bez veze).

**Za Jovana ujutru:** otvori `/app/nepostoji` (ilustrovan 404 unutar ljuske, „Nazad na tablu") i `/en/app/nepostoji`; u DevTools isključi mrežu (Offline) na bilo kojoj `/app` strani → traka „Nema interneta"; profil `/app/members/ne-postoji`; temu `/app/community/<loš id>`; `/app/classroom` filter bez kurseva. Uporedi sa `K23-stanja-1440-svetla.png` i `K23-stanja-1440-tamna.png`. Odluči: da li želiš ilustracije i u sidebar listi (ODLUKA 2) i da li admin „Katalog je prazan" (ODLUKA 3) treba da dobije Bajta.

**Spisak zamenjenih mesta po fajlovima (K23, potpun):**
- Granice greške i 404: `app/[locale]/app/error.tsx`, `app/[locale]/app/community/error.tsx`, `app/[locale]/app/messages/error.tsx` (→ `IgraErrorState`); novi `app/[locale]/studio/(shell)/app/error.tsx`, `app/[locale]/app/not-found.tsx`, `app/[locale]/app/[...notFound]/page.tsx`.
- „Baza nije povezana" (→ `IgraState offline`): `app/[locale]/app/credits/page.tsx`, `app/[locale]/app/studio/page.tsx`, `app/[locale]/app/studio/m/[jobId]/page.tsx`, `app/[locale]/studio/(shell)/app/page.tsx`, `.../app/m/[jobId]/page.tsx`, `.../krediti/page.tsx`.
- Ljuska: `components/app/app-shell.tsx` (traka bez veze).
- Prazno/404/zaključano/uskoro: `components/app/member-profile.tsx` (profil nije pronađen), `components/app/community-thread-detail.tsx` (editor nedostupan, tema nedostupna), `components/app/chat/chat-thread.tsx` (razgovor nedostupan, pretraga poruka), `components/app/chat/chat-dialogs.tsx` (nema članova), `components/app/chat/chat-group-details.tsx` (nema slika), `components/app/chat/chat-inbox.tsx` (pretraga u grešci), `components/app/chat/study-hub.tsx` (nema poziva), `components/app/course-player.tsx` (slika/video/tekst/materijali), `components/app/dashboard-content.tsx` (kurs bez lekcija), `components/app/studio-page.tsx` (nema alata / nema modela), `components/app/suspension-gate.tsx` (slika umesto ikone).
- Ilustracija dodata postojećem `EmptyState`: `components/app/classroom-hub.tsx` (3), `components/app/community-comments.tsx`, `components/app/api-keys-page.tsx`, `components/app/community-v2/community-my-threads.tsx`, `components/app/dashboard-windows.tsx` (6 zona), `components/crea/tools/elements-tool.tsx`, `components/app/member-profile.tsx` (zajednički kurs).
- Učitavanje i prazno u Crei (→ `compact`): `components/crea/game/crea-album-view.tsx`, `components/crea/community/crea-gallery.tsx` (3), `crea-public-work.tsx`, `crea-invite-landing.tsx` (+ ilustracija 404), `components/crea/montaza/media-picker.tsx`, `montage-tool.tsx`, `components/crea/zvuk/sound-input.tsx`, `components/crea/board/crea-board.tsx`.
- Provera na kraju koraka: nijedan `node` proces ne sluša ni na jednom portu (provereno po PID-u); preostali `node` procesi su MCP/Adobe/Playwright pomoćnici.


## K24 — Mikrointerakcije i zvuk   (2026-10-14 12:50)
**Fajlovi:**
- novi: `components/igra/peel-link.tsx` (`PeelLink`), `components/igra/izlog/izlog-mikro.tsx`, `lib/igra-micro.test.ts`, `docs/igra/snimci/K24-mikro-{1440,390}-{svetla,tamna}.png`
- izmenjeni (temelj): `app/globals.css` (`.igra-press`, `.igra-lift`, modifikatori senke, podrazumevano u `[data-igra-ui]`), `components/ui/button.tsx`, `components/ui/toast-provider.tsx`, `lib/igra-sound.ts`, `components/app/app-shell.tsx` + `components/studio/studio-shell.tsx` + `app/[locale]/igra-izlog/page.tsx` (`data-igra-ui`), `components/igra/izlog/registry.ts`, `lib/igra-izlog.test.ts`, `lib/igra-crea.test.ts` (ODLUKA 8)
- izmenjeni (peel): `components/igra/dashboard/crea-quick-start.tsx`, `components/igra/crea/crea-start-hero.tsx`
- izmenjeni (zamena ručnog recepta klasom, mehanički): 113 fajlova u `components/app`, `components/crea`, `components/igra`, `components/studio` (215 `className` stringova), plus `components/app/studio-media-tile.tsx` ručno i `community-leaderboard.tsx` (`whitespace-nowrap` na „Ova nedelja", napomena nadzora za K24/K26)

**Šta je urađeno:** Svi ručni recepti „`shadow-[…] transition hover:-translate-y-0.5 motion-reduce:…`" posle prijave zamenjeni su sa dve zajedničke klase u `@layer components`. `.igra-press` (dugmad i sve što liči na dugme): hover podigne 2 px i produži tvrdu senku za 2 px (donja ivica senke stoji), pritisak spusti 1 px i skrati senku na 1 px, `:disabled`/`aria-disabled` ne reaguju, fokus prsten mastilom. `.igra-lift` (kartice-linkovi): isti mirni hover bez pritiska; pomera se samo `translate`, pa veličina, okvir i tekst stoje (izmereno: visina i širina teksta iste pre i posle hovera). Senka se bira modifikatorom (`igra-shadow` / `-soft` / `-ink` / `-yellow`, dubina 3 px ili `igra-depth-2` / `-4`) i ide kroz `--tw-shadow`, pa se slaže sa `ring-*`, a svaki utility i dalje pobeđuje. Pomeranje i prelaz postoje samo u `prefers-reduced-motion: no-preference`; uz smanjen pokret menja se samo senka. `Button` aplikacije (87 uvoza) koristi isti recept, uz 2 px senku na primary/secondary/destructive; API je isti. Unutar ljuske (`[data-igra-ui]`, nema ga na javnom sajtu) `@layer base` daje jezičcima, prekidačima i dugmadima-prekidačima isti fokus prsten i miran prelaz boje, a obično dugme bez svog pomeranja se na pritisak spusti 1 px. Ulazi u stvaranje (Crea brzi start na tabli i pločice Crea heroja) su `PeelLink`: nalepnica lika se odlepi kroz postojeći `useStickerPeel`. Tost uspeha je sveska: papir, mastilo, marker preko naslova i mali Robi (`lik.robi.slavi`, lenjo), uz kratak zvon kroz postojeći prekidač; greška ostaje crvena sa ikonom, `role="alert"` i bez zvuka; dugme za zatvaranje je 44 × 44 i ima natpis po jeziku.

**Mapa zvuka (sve kroz `playIgraSfx`, ćuti kad je prekidač isključen):** uspeh (tost) `stakleni-zvon` · nivo `pojacanje` · bedž `potvrda` · kraj kursa `dzingl-pizzicato`. Sve su postojeći CC0 fajlovi iz `public/brand/crea/sfx`, glasnoća 0,4. Novih fajlova nema.

**Površine:** gotovo — ljuska aplikacije, tabla, učionica, zajednica, profil, poruke, krediti/podešavanja, admin i cela Crea (svi fajlovi posle prijave koji su imali ručni hover-lift; test čuva da nijedan ne ostane). Nije dirano (javno/auth/plaćanje): `theme-toggle.tsx` (javno zaglavlje), `checkout-button.tsx` (javna strana kursa), `public-community-comments.tsx`, `sign-in-panel.tsx`, `components/ui/primitives.tsx` (`LinkButton`/`Button` javnog sajta već imaju isti recept: +2 px senka na hover, kraća na pritisak), `scroll-to-top.tsx`.

**ODLUKE:**
1. **Codemod umesto ručnog prepisivanja 215 stringova** (skripta `.igra-run/tmp/k24-codemod.mjs`, ignorisana): briše `hover:-translate-y-0.5`, `transition*`, `duration-*`, `ease-*`, `motion-reduce:{transition-none,hover:translate-y-0,transform-none}`, `active:translate-y-*`, `disabled:{hover,active}:translate-y-0`, `studio-anim-mikro` i tvrdu senku `shadow-[Npx_Npx_0_0_var(--token)]` (sa njom i `hover:`/`active:shadow-*`), a dodaje `igra-press`/`igra-lift` + modifikatore. Vrsta po tagu: `button`/`label`/konstante → press; `div`/`article`/`li` i `Link` koji izgleda kao kartica (`flex-col`, `p-3+`, `surface-*`) → lift. Spisak je pregledan ručno.
2. **Senke `--shadow-hard-08…16` su sjedinjene u `igra-shadow-soft` (14 %)**, `--shadow-hard`/`-20…24` u `igra-shadow` (18 %). Razlika je do ±4 % providnosti; doslednost je cilj koraka.
3. **Hover je 2 px za oba recepta** (plan dozvoljava 1–2 px; ceo repo je već bio na 2 px). Kartica nema pritisak; dugme se spušta 1 px.
4. **Kad senka nije u istom stringu** (npr. bira je uslov), stanja senke (`hover:shadow-*`, `active:shadow-*`) ostaju gde su: utility senka pobeđuje, recept daje samo pomeranje.
5. **`studio-anim-mikro` se uklanja sa recepta**: van sloja je i gazio bi `translate` prelaz (pomeranje bi skočilo bez animacije).
6. **Podrazumevano ponašanje je ograničeno na `[data-igra-ui]`** (koren `AppShell`-a, Crea ljuske i izloga), u `@layer base` sa `:where()`, da javni sajt ostane netaknut i da svaki autorski utility pobedi.
7. **Zvuk uspeha:** `stakleni-zvon` (0,28 s, „obaveštenje"), jer je `potvrda` već zvuk bedža. Zvuk svira samo za tost uspeha; mali kraj lekcije ostaje tih (ODLUKA K09: „bez preklopa, konfeta i zvuka"), čet i slavlja su kao pre.
8. **`lib/igra-crea.test.ts`:** tvrdnja `toContain("motion-reduce:hover:translate-y-0")` za Crea pločicu zamenjena je tvrdnjom da pločica nosi `igra-lift igra-shadow-soft`; ista namera (pokret staje uz smanjen pokret) sada je proverena za ceo recept u `lib/igra-micro.test.ts`.
9. **Peel samo na ulazima u stvaranje** (Crea brzi start, Crea heroj); misija dana nema nalepnicu u CTA-u, pa nije dirana. Sve ostalo je `igra-press`/`igra-lift`.
10. **Lik u tostu je `next/dynamic`**: provajder tosta stoji na svakoj strani, a manifest slika ne sme u početni JS javnog sajta.

**Novi paketi:** nema.

**Testovi:** `lib/igra-micro.test.ts` (17; 17. = svi automatski zvuci kroz prekidač): klase i modifikatori su u `@layer components`; senka kroz `--tw-shadow` bez golog hex-a; `translate`/`transition` samo u `no-preference` bloku; pritisak skraćuje senku, hover je produži, `igra-lift` nema pritisak; podrazumevano važi samo pod `[data-igra-ui]`; nijedan fajl posle prijave nema ručni `hover:-translate-y-0.5`; recept se ne kombinuje sa sopstvenim pomeranjem; `Button` koristi recept i čuva API; ljuske nose `data-igra-ui`, javni sajt ne; peel kroz `useStickerPeel`; tost (marker, lenj lik, zvuk samo za uspeh kroz `playIgraSfx`, `role=alert`, 44 px, natpis po jeziku); isključen zvuk ne pravi ni `Audio`, uključen pušta `stakleni-zvon`. Izmenjeni: `lib/igra-izlog.test.ts` (deo `mikro`), `lib/igra-crea.test.ts` (ODLUKA 8).

**Slike:** `lik.robi.slavi` (tost), `lik.piksi|kadar|eho.mase` (peel). TRAŽENE SLIKE: nema.

**Rezultat provere:** codegen: nije potreban (`convex/` nije diran) / typecheck: prošlo (i posle build-a) / lint: prošlo (0 grešaka, istih 26 upozorenja) / test: prošlo (318 fajlova, 3.618 testova) / check:frames, check:corners, check:white, check:igra: prošlo / build: prošao / check:bundle: prošlo (`/app` 291/294 kao pre, javna početna 140/153, gsap samo u async chunk-ovima).
- **Pregledač (Playwright, izlog `?deo=mikro`, `next dev --webpack` na 3123), izmereno:** `igra-press` mirno 3 px → hover `0 -2px` + 5 px → pritisak `0 1px` + 1 px; `Button` primary 2 → 4 px; kartica 4 → 6 px uz −2 px, visina (85,4 px) i širina naslova (352 px) iste; jezičak bez sopstvenih klasa dobija prsten `2px solid` mastilom i prelaz boje; peel nalepnice `translate(0,-3px) rotate(-3deg)`; uz smanjen pokret `translate: none`, senka se i dalje menja (5 px / 1 px), peel nema inline stil. Tost uspeha: marker, `robi-slavi.avif`, „Zatvori obaveštenje" 44 × 44, jedan `stakleni-zvon.mp3`; tost greške `role=alert` bez zvuka; posle „Isključi zvuk" (`nauciai-chat-sound=off`) novi tost uspeha ne pravi `Audio`. 1440 i 390, obe teme, bez vodoravnog skrola; konzola bez grešaka (jedino upozorenje je poruka `motion` biblioteke o smanjenom pokretu, izazvana emulacijom). Dev server ugašen, port 3123 slobodan, Playwright `page-*.yml`/`console-*.log` obrisani.

**BLOKADA (samo provera, ne kod):** prave strane iza prijave Playwright bez sesije ne vidi (kao K06–K23). Recept je proveren u izlogu, a zamena po fajlovima testom nad izvorom i typecheck-om; zvuk nije slušan (Playwright nema zvučni izlaz), proveren je poziv `Audio`.

**Za Jovana ujutru:**
- Otvori `/igra-izlog?deo=mikro` i prođi mišem dugmad, kartice, jezičke i Crea pločice; pritisni i drži dugme. Uporedi sa `K24-mikro-1440-svetla.png` / `-tamna.png`.
- U aplikaciji prođi par gustih ekrana (admin tabele, Crea composer, zajednica) i proveri da hover od 2 px nigde ne smeta. `Button` sada ima 2 px senku na primary/secondary/destructive; ako ti je previše, iz varijanti u `components/ui/button.tsx` se briše `igra-shadow igra-depth-2`.
- **Poslušaj zvon uspeha** (npr. sačuvaj profil) i odluči da li tost uspeha uopšte treba da ima zvuk; isključi zvuk u meniju naloga i proveri da je tišina.
- Prođi tastaturom (Tab) kroz jezičke poruka i filter rang liste: prsten mora biti vidljiv u obe teme.

**Prihvatanje (K24) — stavka po stavka:**
- *„Interakcije su dosledne na svim površinama"* — **ispunjeno u kodu, u pregledaču delimično (BLOKADA ispod).** Svi fajlovi posle prijave (`components/app`, `components/crea`, `components/igra`, `components/studio`, `app/[locale]/app`, `app/[locale]/studio`; izuzeta su samo 4 javna/auth fajla) koriste `igra-press` / `igra-lift` ili `Button` sa istim receptom; `lib/igra-micro.test.ts` pada ako se bilo gde vrati ručni `hover:-translate-y-0.5` ili ako se recept pomeša sa sopstvenim pomeranjem. Ponašanje recepta je izmereno u pregledaču (izlog `?deo=mikro`).
- *„Ništa ne treperi"* — **ispunjeno.** Pomera se samo `translate` (bez promene veličine, okvira i težine slova; izmereno: visina kartice i širina naslova iste pre i posle hovera); prelaz je 120 ms na `translate`/senci/bojama; nema petlji. Uklonjeno je 24 mesta gde je hover-lift skakao bez prelaza (stari recept bez `transition`). Uz smanjen pokret nema pomeranja.
- *„Zvuk ne svira ako je isključen"* — **ispunjeno za sve automatske zvuke.** Izmereno u pregledaču sa `nauciai-chat-sound=off`: tost uspeha 0 zvukova, slavlje nivoa / bedža / kraja kursa (izlog `?deo=pokret`) 0 zvukova; uključeno: tačno `stakleni-zvon`, `pojacanje`, `potvrda`, `dzingl-pizzicato`. Test: `playIgraSfx` ne pravi `Audio` kad je isključeno; `playIgraSfx` zovu samo `celebration-host.tsx` i `toast-provider.tsx`; jedini drugi automatski zvuk (ping četa) čuva isti prekidač (`soundEnabled && …`), isti ključ u sva tri fajla; nijedan fajl ne pušta `brand/crea/sfx` mimo `lib/igra-sound.ts`. Ostali `play()` pozivi u Crei su reprodukcija sadržaja na klik korisnika (pregled zvuka, snimanje, montaža), ne zvuci interfejsa.
- *„typecheck / lint / test / check:frames prolaze; sekcija K24 u progress-u"* — **ispunjeno** (typecheck 0, lint 0 grešaka / 26 zatečenih upozorenja, test 318 fajlova / 3.619 testova, check:frames čist; sekcija ovde).

**BLOKADA (K24, provera na pravim stranama):** stavka „dosledne na svim površinama" nije proverena u pregledaču na pravim stranama posle prijave (`/app`, učionica, zajednica, profil, poruke, krediti, admin, Crea). Razlog: Playwright MCP radi bez sesije, a pravila runa zabranjuju druge pregledače i diranje auth toka, pa proxy svaku `/app` i Crea stranu preusmerava na prijavu (isto kao K06–K23). Zamena: izlog `?deo=mikro` i `?deo=pokret` + testovi nad izvorom svih 113 izmenjenih fajlova + typecheck + build. Jovan ručno: proći mišem i tastaturom tablu, učionicu, zajednicu, poruke, kredite, admin i Crea composer (vidi „Za Jovana ujutru").

## K25 — Sve slike na mestu (manifest sweep)   (2026-10-14 13:10)
**Fajlovi:** `lib/igra-copy.ts` (+`badgeSoonTag`), `lib/igra-badge-view.ts` (tag „uskoro" koristi kratki natpis), `docs/igra/snimci/K25-*.png` (7)

**Šta je urađeno:** `check:igra` (i `--strict`): manifest 123/123 `ready`, svih 60 ID-jeva iz koda spremno, nema nepoznatih ni planiranih. Skripta `.igra-run/tmp/k25-audit.mjs` (sharp) prošla je svih 123 fajla: svi postoje, dimenzije fajla = `w`×`h` iz manifesta, nalepnice imaju alfa kanal, svaki red ima `alt` sr + en (jedina „ista" je `ikona.crea` = „Crea", ime brenda). Veličine u okviru budžeta (najveći: scena 155 KB, baner 105 KB, nalepnica 87 KB). Pregledač: svih 16 delova izloga × 1440/390 × svetla/tamna × sr/en (128 prolaza, uz skrol zbog lazy učitavanja): 0 slomljenih slika, 0 fallback krugova umesto spremne slike, nijedna slika nije razvučena preko prirodne veličine, najviše jedna `fetchpriority=high` po ekranu (samo `IgraHero` i baner profila; ostalo `lazy`). Jedini nalaz: engleski natpis „Coming soon" na nalepnici „uskoro" bio je širi (106 px) od nalepnice (44–72 px) i izbacivao strano na 390 px vodoravni skrol (izlog `primitivi`); sada je tag „Soon", a izgovoreni naziv (`aria-label`, tooltip) ostaje „coming soon". Posle ispravke vodoravnog skrola nema.

**Površine:** sve gotove (izlog, sve teme/jezici/širine). Prave strane iza prijave Playwright ne vidi (isto kao K06–K24), pa su proveravane kroz izlog.

**Još nedostaje:** ništa. Nema traženih slika; `IGRA_PLANNED_ART` nije dirano.

**Spremne slike koje kod ne koristi (7) — zašto:**
- `rang.xp`: nijedan plan (K01–K20) ga ne vezuje za površinu; XP se prikazuje odometrom i trakom, a „XP kristal" uz svaki broj bi ponovio isto. Ostaje rezerva.
- `rang.meta`: K10 ODLUKA 16 (put nema cilj/zastavicu); tabla (K08) ima sopstvenu misiju dana bez ikone mete.
- `ikona.ucionica`, `ikona.zajednica`, `ikona.crea`: ove površine već imaju scenu-heroja (`scena.*`), a pravilo je „jedna jaka ilustracija po ekranu" (K01 §1.3, K14 ODLUKA 15); ikona uz scenu bi bila druga.
- `ikona.profil`: K13 ODLUKA 15 (profil ima baner i policu).
- `ikona.poruke`: K18 (nema naslovne trake). Zaglavlje liste razgovora je gusto (tri dugmeta u istom redu na 390 px), pa 40 px nalepnica tu ne staje bez gubitka.
`check:igra` ih i dalje samo navodi (upozorenje, ne greška).

**ODLUKE:**
1. Ne dodajem nove upotrebe zaostalih 7 slika (gore); svaka bi bila druga ilustracija na ekranu ili bi gurala gustu traku. Najkonzervativnije.
2. Nalepnice su 768 px AVIF (≤ 87 KB) čak i kad se crtaju na 24–64 px (npr. 24 bedža na polici profila ≈ 1 MB, `lazy`). Ne menjam: slike pravi pipeline, a manjim kopijama bi trebao `srcset`/novi fajlovi. Predlog za posle runa: manje kopije bedževa/nivoa (192 px) u pipeline-u.
3. Kratki tag „Soon" je zaseban string (`badgeSoonTag`), ne izmena `badgeSoon`, da se izgovoreni naziv („Challenge — coming soon", test u `igra-a11y.test.ts`) ne promeni.

**Novi paketi:** nema.

**Testovi:** nisu dodavani ni menjani (postojeći `igra-a11y` i `igra-badge-view` testovi prolaze; promena je samo natpis).

**Slike:** nema novih; tražene: nema.

**Rezultat provere:** codegen: nije potreban / typecheck: prošlo / lint: prošlo (0 grešaka, istih 26 upozorenja) / test: prošlo (318 fajlova, 3.619 testova) / check:frames, check:igra (`--strict`): prošlo. Dev server (3123) ugašen.

**Snimci:** `K25-slike-1440-{svetla,tamna}.png`, `K25-slike-1440-tamna-vrh.png`, `K25-slike-390-tamna.png`, `K25-bedz-soon-390-svetla.png`, `K25-profil-1440-tamna.png`, `K25-tabla-390-svetla.png`.

**Za Jovana ujutru:** prođi pravu aplikaciju (tabla, učionica, profil/polica, Crea) u tamnoj temi i proveri da nijedna nalepnica ne ostaje prazan krug; reši da li želiš `ikona.*`/`rang.meta` negde (ako da, reci gde).

## K26 — Telefon (390 px) — ceo prolaz   (2026-10-14 13:40)
**Fajlovi:** `app/globals.css` (+`.igra-hit`), `components/ui/button.tsx`, `components/app/{app-sidebar,app-account-menu,sound-toggle,dashboard-windows,dashboard-content,dashboard-course-card,classroom-hub,community-comments,community-thread-detail}.tsx`, `components/app/community-v2/{community-filters,community-leaderboard,community-members,community-mentions,community-shared}.tsx`, `components/app/chat/chat-thread.tsx`, `components/studio/param-control.tsx`, izlog: `app/[locale]/igra-izlog/page.tsx`, `components/igra/izlog/{izlog-mikro,izlog-poruke}.tsx`; novo `lib/igra-touch.test.ts`; snimci `docs/igra/snimci/K26-*.png` (11).

**Šta je urađeno:** Svih 16 delova izloga je prođeno na 390 × 844 kao pravi telefon (Playwright kontekst `hasTouch` + `isMobile`, tj. `pointer: coarse`), sr i en, svetla i tamna, uz skrol do dna. Skripta je merila tri stvari: vodoravni skrol (`scrollWidth`), elemente van ekrana koje ne seče predak sa `overflow`, i svaku dodirnu metu (link, dugme, prekidač, polje) manju od 44 px. Zatim je 126 snimaka po segmentima pregledano okom: dva radnika su pregledala snimke, a svaki nalaz sam proverio na snimku. Pre ispravki je bilo oko 15 grupa meta ispod 44 px i šest vidljivih grešaka u rasporedu. Posle ispravki nijedan deo nema vodoravni skrol (64 prolaza). Ispod 44 px je ostao samo logotip u zaglavlju (ODLUKA 3).

**Provereni ekrani (nalaz → popravka):**
| Deo izloga | Nalaz na 390 px | Popravka |
|---|---|---|
| sve površine (ljuska) | **zatvorena fioka menija baca senku `18px 0 45px` preko leve ivice SVAKE strane posle prijave** (siva traka ~40 px) | senka samo uz `mobileOpen` (`app-sidebar.tsx`) |
| ljuska | čip kredita 76×32 px, prekidači zvuka i teme 36 px u meniju naloga i u fioci | `igra-hit` (meta 44 px, izgled isti) |
| ljuska | donji meni | **tačno 4 slota** (Dashboard, Učionica, Zajednica, Poruke), izmereno u obe teme |
| svi delovi sa `Button size="sm"` (58 poziva) | 40 px | `pointer-coarse:min-h-11` u `button.tsx` (na računaru isto) |
| tabla | redovi prozora (lekcije, obaveštenja) 40 px | `pointer-coarse:min-h-11` |
| tabla | natpis „Obaveštenja" (104 px; en „Notifications" 114 px) ulazi u ikonicu (mesta je 89 px) | natpis dobija ceo red, a ikonica stoji uz broj (sve širine) |
| tabla | „Otvori lekciju" i „Uredi u admin panelu" 40 px | `pointer-coarse:min-h-11` |
| učionica | filter čipovi „Svi / U toku / Završeni / Zaključani" 36 px; „Otvori smer" 16 px | čipovi: `pointer-coarse:min-h-11`; „Otvori smer": `igra-hit` |
| učionica | pečat „Završeno" leži preko „Aktivan pristup" na naslovnoj kursa | status i pečat u jednom `flex-wrap` redu: kad nema mesta, pečat pređe u drugi red (na računaru isto kao pre) |
| učionica, tabla | „Nastavi / Ponovi" na kartici kursa i „Zajednica" na tabli: žut tekst na papiru (~1,7:1, `tone="smoke"`) | `tone="quiet"`: mastilo 12,9:1, u tamnoj temi žuto 7,66:1. Sam komentar u `primitives.tsx` kaže da je `smoke` pao na tabli |
| zajednica | avatar linkovi 40 px, `@korisnik` 20–24 px, red člana 22 px, pomeni | `igra-hit` |
| rang | prekidač „Globalno / Podešavanja" 36 px, „Ova nedelja / Ukupno" 40 px | `pointer-coarse:min-h-11` |
| rang | **traka filtera: „Ova nedelja / Ukupno" van ekrana** (napomena nadzora posle K12): skrol je unutar trake, pa početnik ne vidi drugi prekidač | ispod `sm` traka se prelama u dva reda, a izbori smera i ciklusa idu u punu širinu. Od `sm` je jedan red kao pre (`K26-rang-1440-svetla.png`). Druga napomena je rešena ranije: „Ova nedelja" već ima `whitespace-nowrap` |
| poruke | reakcija 👍 34×24 px | `igra-hit` (pravi `chat-thread.tsx` i izlog) |
| Crea | dugmad na pločici rada 28 px | već imaju `pointer-coarse:size-11`, bez izmene |
| Crea parametri, mikro | prekidač 48×28 px (`param-control.tsx`) | `igra-hit` |
| profil, krediti, admin, stanja, mapa, slike, primitivi, pokret | bez nalaza | — |

**3D i slavlja:** na 390 px uz dodir deo `pokret` nema nijedan `<canvas>` (prikazuju se nalepnice), a na 1440 px ima 4. Uslov je `IGRA_THREE_MEDIA = (min-width: 1024px) and (pointer: fine)`. Slavlja „Kraj kursa", „Tri bedža" i „Novi nivo" su dijalog širok 358 px, ceo u ekranu i bez vodoravnog skrola. Posle 4,1 s ih više nema: sama se gase posle 2,5 s, a Esc i dodir podloge ih zatvaraju. Uz smanjen pokret prikazuje se kartica u uglu na 6,5 s.

**Heroji:**
- Tabla: CTA je 508 px od vrha heroja, tj. ≈ 590 px od vrha ekrana sa zaglavljem, iznad donjeg menija.
- Zajednica 165 px, rang 194 px, admin 417 px visine.
- Crea ulaz pokazuje sve tri pločice radionica na prvom ekranu.
- Nijedan heroj ne gura sadržaj previše ispod pregiba.

**Površine:** u izlogu su gotovi svih 16 delova. Prave strane iza prijave nisu gledane (BLOKADA).

**ODLUKE:**
1. **`.igra-hit` (novi recept u `globals.css`).** Guste mete (avatari, `@korisnik`, čipovi, prekidači, reakcije) dobijaju veću dodirnu površinu umesto većeg izgleda.
   - Radi samo uz `pointer: coarse`: nevidljivi `::after` se širi do 44 × 44 px, pa se na računaru ništa ne menja. Provereno sa `elementFromPoint` 21 px od centra.
   - Kad mete stoje gusto (npr. „Otvori smer" iznad kartica), sused može da pokrije deo proširenja. Meta je i tada široka ≥ 44 px i visoka ≥ 30 px.
   - Dugmad koja mogu da porastu (`Button sm`, čipovi, redovi) dobijaju `pointer-coarse:min-h-11`, po istom obrascu kao postojeći `pointer-coarse:size-11` u Crei.
2. `ThemeToggle` se koristi i na javnom sajtu (zaglavlje, podnožje), pa komponenta nije dirana. `igra-hit` stiže kroz `className` samo u meniju naloga i u fioci.
3. Logotip u mobilnom zaglavlju (`BrandMark`, 107–120 × 36 px) ostaje kakav je: deljen je sa javnim zaglavljem (ne diramo ga), širok je i ispunjava WCAG 2.5.8 AA (24 px).
4. Na pločicama table ikonica prelazi u red sa brojem na svim širinama, ne samo na telefonu. Jedan raspored je jednostavniji od dva, a na `sm` (4 kolone, ~110 px) bi isti natpis opet udario u ikonicu.
5. Traka rang liste na telefonu ima dva reda. Pravi omotač je `SmartStickyRegion`, koji se pri skrolu nadole sakriva, pa njena visina (~140 px) ne pokriva listu dok se čita. U izlogu je to običan `sticky`.
6. „Moj red" na dnu rang liste je namerni K12 obrazac i ostaje: uži je da bi zaobišao dugme „na vrh" i stoji preko reda ispod.
7. Pilula „Moderator" ispod avatara u kartici člana viri 2 px preko ivice kartice, na svim širinama (`CommunityAvatar`: `max-w-[4.8rem]` ispod avatara od 48 px). Nije vezano za telefon, a ispravka bi dirala deljenu komponentu, pa nije menjano; upisano za K29.

**Za sledeće korake (nađeno, nije vezano za telefon, nije menjano):**
- **K28 (smanjen pokret):** uz `prefers-reduced-motion` konzola javlja „A tree hydrated but some attributes … didn't match" na `CourseCatalogCard` i drugim `motion.article` sa `whileTap={reduceMotion ? undefined : …}`. Uzrok: `motion` na serveru dodaje `tabindex="0"` zbog `whileTap`, a klijent uz smanjen pokret ne dodaje (isto kao u memoriji za K09). Bez smanjenog pokreta `tabindex=0` ostaje na `<article>`, što je verovatno suvišan tab-stop.
- **K27/K29 (i18n):** datumi u sr izlaze ćirilicom („26. октобар 2026.", „11.окт" na tabli i u učionici), jer `toLocale…("sr-RS")` daje ćirilicu. Ima 17 fajlova sa `"sr-RS"` u `components`/`lib`; verovatno treba `sr-Latn-RS`.
- Plutajuće dugme „na vrh" (`components/ui/scroll-to-top.tsx`) na 390 px pokriva desni kraj sadržaja iznad donjeg menija, npr. poslednju cifru „1.890" u panelu napretka. Komponentu deli javni sajt, pa nije dirana.

**Novi paketi:** nema.

**Testovi:** `lib/igra-touch.test.ts` (5 testova nad izvorom):
- `.igra-hit` je u `@layer components` pod `pointer: coarse`, sa 44 px;
- `Button sm` raste na dodir;
- gusti natpisi i prekidači nose `igra-hit`;
- zatvorena fioka nema senku (senka je samo uz `mobileOpen`);
- traka rang liste se prelama ispod `sm`.

**Slike:** nema novih; tražene: nema.

**Rezultat provere:** codegen: nije potreban (`convex/` nije diran) / typecheck: prošlo / lint: prošlo (0 grešaka, istih 26 upozorenja) / test: prošlo (319 fajlova, 3.624 testa) / check:frames: prošlo. Dev server (`next dev --webpack`, port 3123) je ugašen i port je slobodan; Playwright `console-*.log` je obrisan.

**Snimci:** `K26-{rang,ucionica,tabla,ljuska}-390-{svetla,tamna}.png`; za proveru da je računar ostao isti: `K26-rang-1440-svetla.png`, `K26-tabla-1440-svetla.png`, `K26-ucionica-1440-tamna.png`.

**BLOKADA (samo provera, ne kod):** prave strane posle prijave (`/app`, učionica, zajednica, rang, profil, poruke, krediti, admin, Crea) nisu gledane na 390 px. Razlog je isti kao u K06–K25: Playwright MCP radi `--isolated` bez sesije, a auth tok se ne dira. Sve izmenjene komponente su iste one koje izlog crta. Fioku (`app-sidebar.tsx`) izlog crta kroz pravu ljusku iz K06; senka je tamo izmerena i snimljena (`K26-ljuska-390-*`).

**Za Jovana ujutru:** na pravom telefonu (ili u DevTools sa uređajem na dodir) proveri:
1. Leva ivica `/app` više nije siva dok je meni zatvoren, a senka se vidi kad se meni otvori.
2. Rang lista: traka filtera je u dva reda i oba prekidača se vide.
3. Dodir oko malih elemenata (avatar, `@korisnik`, čip kredita, reakcija u četu) pogađa metu.
4. Kartica završenog kursa: pečat „Završeno" ne leži preko statusa, a „Nastavi" / „Ponovi" se lako čita.

## K27 — Tamna tema — ceo prolaz   (2026-10-14 14:00)
**Fajlovi:** `app/globals.css` (pravilo „žuta nosi mastilo"; tamni `--igra-track` 16 → 28 %, `--igra-locked-filter` 0,22 → 0,4), `components/igra/ink-calendar.tsx`, `components/crea/game/crea-streak-panel.tsx`, `components/crea/community/crea-league-panel.tsx`, `components/app/{dashboard-content,admin-inline-actions,community-comments,credits-page}.tsx`, `components/app/community-v2/{community-mentions,community-shared}.tsx`, `components/igra/izlog/izlog-zajednica.tsx`; novo `lib/igra-dark.test.ts`; snimci `docs/igra/snimci/K27-*.png` (9).

**Šta je urađeno:** Svih 16 delova izloga je u tamnoj temi prošlo mernu proveru kontrasta teksta (Playwright, 1440 i 390 px: boja teksta × složena pozadina po elementu, prag 4,5:1, 3:1 za veliki tekst) i pregled snimaka (~70 segmenata, četiri radnika; svaki nalaz proveren u kodu ili na snimku). Merenje je našlo 5 pravih grešaka teksta, pregled snimaka 4 grupe ne-tekst elemenata. Sve je popravljeno tokenima ili `dark:` varijantom; svetla tema je ostala ista. Posle ispravki: 0 prekršaja na 1440 i 390 (ostaju samo lažni nalazi, vidi ODLUKE 5).

**Provereni ekrani (nalaz → popravka):**
| Ekran | Nalaz u tamnoj temi | Popravka |
|---|---|---|
| sve (dugme „Otvori lekciju", „Zaprati", brojevi koraka, „NS") | **svetli tekst na žutom, 1,47:1**: ostrvo `.bg-yellow` menja tokene, ali `color` se nasleđuje već razrešen | `@layer base`: `[data-theme="dark"] :is(.bg-yellow…) { color: var(--ink) }`; autorski `text-*` i dalje pobeđuje (7,66:1) |
| učionica, tabla (video placeholder) | podnaslov `text-paper-strong/75` na stalno tamnoplavom gradijentu = 1,26:1 | `text-white/75` (tekst preko medija ostaje bel, po pravilu iz memorije) |
| tabla/učionica (panel „Pregled kursa"), admin pregled | eyebrow `text-paper-strong/65` na svetlom mastilu 4,1–4,46:1 | `dark:text-paper-strong/75` |
| zajednica (vreme uz temu, komentar, obaveštenja) | `text-muted/75`, `text-ink/50` 4,07–4,47:1 | `dark:text-muted`, `dark:text-ink/65` |
| zajednica „Zakačeno", Crea liga „(ti)" | 4,45 / 4,38:1 na `bg-yellow/20` | `dark:text-ink/85`, `dark:text-ink/75` |
| krediti | `text-amber-900` na tamnoj kartici 1,62:1; zeleni `#0f7b4f` 2,78:1 | `dark:text-yellow`; `dark:text-[var(--level-accent-2)]` |
| profil, rang, ljuska, tabla, admin (staze) | prazan deo trake, prstena, tačke niza i stepenik podijuma 1,2–1,5:1 prema kartici | `--igra-track` u tamnoj temi 28 % mastila (≈ 2:1; žuto punjenje ostaje jasno) |
| tabla, profil (mastilo-kalendar) | nivo 1 mreže se stapao sa praznom ćelijom | `dark:bg-ink/50`, `dark:bg-ink/78` za nivoe 1 i 2 |
| profil, izlog (zaključani bedževi) | silueta 0,22 prozirnosti ≈ 2:1, bezoblična mrlja | 0,4 |
| Crea niz | žuti plamen u skoro belom krugu aktivnog dana, ~2:1 | `dark:fill-paper dark:text-paper` (tamni plamen na svetlom krugu) |
| zajednica (obaveštenja) | ikona navodnika `text-ink/20` nevidljiva | `dark:text-ink/45` |
| nalepnice (sve), krem ivica | ivica i senka se vide na tamnom u svih 16 delova | bez izmene |
| scene, baneri, korice, mapa puta, hero | krem „ostrva" sa tamnim okvirom usred tamne stranice | namerno (ODLUKE 2) |
| Studio „bunar" (Crea neuspeh/čekanje) | skoro crna ploča bez ivice | postojeći `--studio-well` za medije, bez izmene (ODLUKE 3) |

**Površine:** svih 16 delova izloga gotovo, obe širine, tamna tema (svetla ostala ista; proveren samo `check:white`). Prave strane iza prijave nisu gledane (BLOKADA).

**ODLUKE:**
1. **Jedno pravilo umesto popravke svakog dugmeta**: žuta površina u tamnoj temi uzima `--ink` ostrva kao `color`. Tekst na žutom bez svog `text-*` (npr. 17 mesta) tako više ne zavisi od roditelja. Pravilo je u `@layer base` (gubi od svakog utility-ja) i ne dira `.hero-paper-island`, `.paper-island` ni zaglavlje javnog sajta.
2. **Krem „ostrva" (scene, baneri, korice kursa, mapa puta, hero tabla/rang/admin/profil) ostaju svetla.** Tri radnika su ih prijavila kao „pali oči", ali plan (§ nalepnice i scene na papirnoj kartici) traži upravo to: slike su crtane na kremu, a svaka ima 2 px mastilo okvir (svetao u tamnoj). Tamna scena bi tražila novu sliku. Nije menjano.
3. **Studio „bunar" (`--studio-well`, Crea neuspeh/otkazano/čekanje) ostaje skoro crn**: to je postojeći medijski token iz TH1 (letterbox videa), tekst na njemu je čitljiv, a nalepnice se jasno vide.
4. **Isprekidani okviri praznih stanja i kartica (`--line` #2f4762 ≈ 1,5:1) nisu dirani.** Ukrasni su (tekst i nalepnica nose smisao), a `--line` je zajednički token cele aplikacije i javnog sajta; podizanje ide u poseban korak uz Jovanov pregled.
5. **Lažni nalazi merenja:** `sr-only` tekst (mapa) i dugme „Globalno" na rang listi (klizni žuti/mastilo indikator je sestrinski element, ne predak, pa merač vidi pogrešnu pozadinu; ručno proveren: 12:1).
6. Zakačene teme i nepročitana obaveštenja u tamnoj temi su maslinasto-braon (`bg-yellow/20` preko tamnog); čitljivo (≥ 4,5:1 posle ispravki), nije menjano jer je „blago žuto" po K11 i ne pali oči.
7. Boje `red-*`/`amber-*`/`emerald-*` ostaju netokenizovane (otvoreno pitanje iz TH1); u novim komponentama su samo svetle „status" pločice (`banner-picker` greška: tamni tekst na svetloj pločici, ≥ 7:1).
8. Goli heks u `components/igra`: samo `igra-three-canvas.tsx` (rezervne vrednosti za 3D materijale koje inače čita iz CSS promenljivih); ostalo su definicije tokena u `globals.css`. Ništa novo.
9. Nađeno, nije tamna tema, nije menjano: čip „Moderator" viri 2 px preko kartice (K26 ODLUKA 7, za K29); datumi ćirilicom (`sr-RS` → `sr-Latn-RS`, 17 fajlova, za K29); na mapi puta oznake „7 min" se preklapaju sa crtežom (isto u svetloj).

**Novi paketi:** nema.

**Testovi:** `lib/igra-dark.test.ts` (2 testa): pravilo „žuta nosi mastilo" stoji u `@layer base`; tamna staza trake ≥ 28 % i zaključana silueta ≥ 0,4.

**Slike:** nema novih; tražene: nema.

**Rezultat provere:** codegen: nije potreban / typecheck: prošlo / lint: prošlo (0 grešaka, istih 26 upozorenja) / test: prošlo (320 fajlova) / check:frames, check:white: prošlo. Dev server (3123) ugašen.

**Snimci:** `K27-{tabla-heatmap,rang-podijum,profil-polica,crea-niz,ucionica-koraci,ljuska-niz,slike}-1440-tamna.png`, `K27-{tabla,profil}-390-tamna.png`.

**BLOKADA (samo provera, ne kod):** prave strane posle prijave nisu gledane u tamnoj temi (Playwright MCP bez sesije, isto kao K06–K26); sve izmenjene komponente crta izlog.

**Za Jovana ujutru:** u pravoj aplikaciji, tamna tema: (1) žuta dugmad („Otvori lekciju", „Zaprati") imaju taman tekst; (2) trake XP/koraka, prsten nivoa i podijum se vide i kad su prazni; (3) zaključani bedževi na polici su prepoznatljive siluete; (4) Crea niz: aktivan dan ima tamni plamen na svetlom krugu. Odluči da li `--line` u tamnoj temi sme da bude jači (ODLUKE 4) i da li krem „ostrva" treba tamne verzije scena (ODLUKE 2).

## K28 — Performanse i pristupačnost   (2026-10-14 14:50)
**Fajlovi:**
- novi: `components/app/dashboard-home-skeleton.tsx` (kostur table, serverski), `lib/igra-state-copy.ts` (tekstovi stanja), `lib/igra-perf.test.ts`; snimci `docs/igra/snimci/K28-rang-fokus-{1440,390}-{svetla,tamna}.png`, `K28-slavlje-ugao-smanjen-pokret-1440-svetla.png`
- izmenjeni: `app/[locale]/app/loading.tsx`, `components/app/{dashboard-content,dashboard-home,dashboard-live}.tsx`, `lib/igra-copy.ts` (bez `IGRA_STATE_COPY`), `lib/igra-state.ts`, `components/igra/igra-offline-bar.tsx`, `components/crea/mascot/{crea-mascot,crea-mascot-canvas}.tsx`, `components/igra/celebration-host.tsx`, `lib/igra-celebrations.ts` (`isTypingTarget`), `components/ui/dialog.tsx` (žleb skrol-bara), `components/app/community-v2/community-leaderboard.tsx`, `components/igra/podium.tsx`, `components/igra/motion/use-enter-stagger.ts`, `components/igra/odometer.tsx`, `components/igra/progress-card.tsx`, `components/igra/trophy-shelf.tsx`, `components/igra/admin/admin-hero-scene.tsx`, `app/globals.css` (`--igra-stamp`), testovi `lib/igra-{celebrations,dashboard,state}.test.ts`

**Šta je urađeno:** Prošao sam pet oblasti iz zadatka: build sa `check:bundle` i Turbopack analizom (`next experimental-analyze --output`), 3D, pokret, fokus i Convex. Na reviziji su radila tri radnika (sonnet), svaki nalaz sam proverio u kodu ili Playwright-om. Najveći dobitak je kostur table. `app/[locale]/app/loading.tsx` važi za SVAKU rutu ispod `/app`, a uvozio je `DashboardHomeSkeleton` iz `dashboard-content.tsx`. Zato su ceo taj modul i njegove zavisnosti (katalog kurseva, rich text, video petlja, dijalozi; oko 17 KB gz) ulazili u početni JS zajednice, poruka, profila, kredita i Cree. Kostur je sada u svom serverskom fajlu. Granica greške Cree (`error.tsx` → `IgraErrorState`) nosila je drugu kopiju celog `lib/igra-copy.ts` (4,7 KB gz) u početnom JS-u radionice, pa su tekstovi stanja izdvojeni u `lib/igra-state-copy.ts`. Pristupačnost:
- Rang lista se tastaturom preskakala. `useEnterStagger` je redove ispod prevoja držao na `visibility: hidden` (`autoAlpha`) dok lista ne uđe u kadar, pa ih Tab i čitač ekrana nisu videli: Tab je od filtera skakao pravo na podijum, a od 17 redova samo je jedan bio dostupan. Sada je u igri samo `opacity`, i Tab ide redom kroz podijum 1–3 i svih 17 redova.
- Uklonjen je `aria-live` preko cele liste. Ta oblast je već postojala, ali je uz živu listu, Flip i „učitaj još" čitala svaki red.
- Nema više lažnih linkova `href="#"`: red bez korisničkog imena sada je `span`.
- Kopija „ti" reda više nije druga Tab meta kad je pravi red već na listi.
- Fokusiran red više ne ostaje ispod lepljivih traka (`scroll-mt` / `scroll-mb`).
- Slavlje ne otvara preklop dok korisnik kuca u polju, jer bi mu uzelo fokus. Kad mu korisnik priđe mišem ili tastaturom, više se ne gasi samo (WCAG 2.2.1).
- Zaključan skrol rezerviše žleb skrol-bara, pa strana ne skače na Windows-u.
- Mastilo pečata u svetloj temi je bilo 2,8:1, a sada je 4,8:1.

**Brojevi — početni JS (gzip, `check:bundle`; „pre IGRA" = build K02, „pre K28" = build posle K27):**
| Ruta | pre IGRA | pre K28 | **posle K28** | razlika od pre IGRA | dogovor (K01 §4) |
|---|---|---|---|---|---|
| `/app` | 268,6 | 291,4 | **284,5** | +15,9 | ≤ +25 ✔ (budžet 294) |
| `/app/community` | 269 | 279,3 | **262,2** | −6,8 | ≤ +25 ✔ (294) |
| `/app/community/leaderboard` | 278 | 291,0 | **274,0** | −4 | ✔ (303) |
| `/app/community/discussions` | 284 | 293,1 | **276,0** | −8 | ✔ (309) |
| `/app/community/[postId]` | 296 | 305,0 | **288,0** | −8 | ✔ (321) |
| `/app/members/[username]` | 346 | 365,8 | **348,8** | +2,8 | ✔ (371) |
| `/app/classroom` | 290 | 287,0 | **280,1** | −10 | ✔ (315) |
| `/app/messages` | — | 280,5 | **263,5** | — | — |
| `/app/credits` | — | 298,1 | **281,1** | — | — |
| `/app/studio` | 541,1 | 556,7 | **539,8** | −1,3 | ≤ +10 ✔ (595) |
| Crea radionica `/studio/(shell)/app` | 465,0 | 496,0 | **492,2** | **+27,2** | ≤ +10 ✘ → ODLUKA 1 (budžet 512 ✔) |
| admin sadržaj / analitika | — | 319,4 | **312,4** | — | (325) |

Svaka `/app` ruta koja ne crta tablu ni kartice kurseva je lakša za 17,0 KB. Tabla, učionica i admin sadržaj su lakši za oko 7 KB, a Crea za 3,8 KB. `three`, `@react-three/fiber` i GSAP pluginovi (Flip, DrawSVG, SplitText) nisu ni u jednom početnom chunk-u. Markeri iz `check:bundle` se nalaze samo u async chunk-ovima; za fiber sam proverio poruku „Hooks can only be used within the Canvas component". U početnom JS-u je samo `loadIgraPlugin` sa imenima pluginova.

**3D (provereno Playwright-om, `deviceScaleFactor: 2`):**
- Sva platna crtaju sa DPR 1,5 (odnos `canvas.width` / CSS širina = 1,5): pehar i medalje u izlogu, maskota na tabli. Maskota je pre K28 imala `dpr={[1, 2]}`, sada `[1, 1.5]` (važi i za Crea čekanje).
- Maskota posle povratka na tab nastavlja da crta: 61 → 0 → 60 rAF/s (sakriven → vraćen). Pre ispravke je ostajala zamrznuta, jer povratak na tab ne okida IntersectionObserver.
- Platno se montira tek kad uđe u kadar.
- Posle zatvaranja slavlja konzola beleži `THREE.WebGLRenderer: Context Lost` (R3F `forceContextLoss`), dakle GPU resursi se oslobađaju. Geometrije i materijale oslobađa R3F, `gradientMap` cleanup efekta.

**LCP / CLS:**
- Jedna `priority` slika po ekranu: heroj table, heroj Cree, baner profila. Zajednica koristi `preload` sa `media` od `lg`.
- Admin scena je na računaru najveći element heroja, pa je dobila isti `preload` sa `media`. Izmereno: na 390 px nema nijednog zahteva, na 1440 jedan (304).
- Lenja slika u `display:none` kutiji se u Chromiumu NE preuzima. Izmereno na izlogu na 390 px za zajednicu, kredite i poruke: svaki zahtev za „skrivenu" sliku dolazi od vidljive kopije iste slike.
- Kosturi table izmereni pre i posle podataka:

  | Širina | Odeljak | Pre ispravke | Posle |
  |---|---|---|---|
  | 390 px | polica bedževa | 405 ↔ 459 | 457 ↔ 459 (mesto za „Svi bedževi") |
  | 390 px | kartica napretka | 356 ↔ 345 | 346 ↔ 345 (skelet odometra je 1 em u tipu broja) |
  | 390 px | puls | 188 ↔ 202 | 202 ↔ 202 |
  | 1440 px | sve osim heroja | — | ±1 px |

  Heroj se i dalje razlikuje za 5–12 px, zavisno od dužine teksta misije.
- Slavlje je `fixed`, a odometar rezerviše širinu (`min-width` u px, `tabular-nums`). Red napretka u ljusci je iste veličine u skeletu i sa podacima, kao i od K06.

**Pristupačnost (izlog, Playwright, 1440 i 390, obe teme):**
- Slavlje. Dok je fokus u polju za kucanje, slavlje čeka; kad fokus izađe, otvara se sa fokusom na „Nastavi". Bez dodira se gasi za 2,5 s i fokus se vraća na okidač. Posle Tab-a ili kad je miš na kartici ostaje otvoreno, Esc ga zatvara i vraća fokus.
- Uz smanjen pokret: kartica u uglu ne uzima fokus i nestaje za 6,5 s, a pod mišem ostaje.
- Rang lista: 0 `a[href="#"]`, nijedan `aria-live` oko liste. „Ti" red je `aria-hidden` sa linkom `tabindex=-1` kad je pravi red na listi. Tab redom: podijum 3, lista 17.
- Fokus nije prekriven ni u jednom od 17 redova, ni Tab-om nadole ni Shift+Tab-om nagore, na obe širine.
- Mapa puta (stanice su linkovi redom putanje, `aria-current="step"`, putanja `aria-hidden`), pečat, bedževi (uslov je u nazivu dugmeta, oblačić se otvara na fokus) i panel „Moj napredak" (`Dialog`: zamka i vraćanje fokusa) prošli su reviziju bez izmena.
- Pokret: sav JS pokret IGRA-e (GSAP hookovi, `motion` u slavlju, konfete, 3D, odometar) ima granu za smanjen pokret. CSS pokreti `.igra-*` su u `no-preference` (čuva `lib/igra-css.test.ts`), a globalno pravilo `prefers-reduced-motion` gasi ostatak.
- Kontrast, izmeren u svetloj temi svih 16 delova izloga (isti merač kao K27), na 1440 i 390. Jedini IGRA prekršaj je bio tekst pečata, 2,8:1. Posle ispravke 0 prekršaja u svetloj i tamnoj temi u delovima slike, pokret, admin, učionica i tabla. Ostali nalazi nisu IGRA (ODLUKA 4).

**Convex (po `convex-performance-audit`, iz koda; uvida sa deploymenta nema):**
- IGRA ima četiri funkcije (`igra.getMyProgress`, `getMemberProgress`, `markSeen`, `setBanner`). Svako čitanje ide preko indeksa i ima `take` / `unique`: dnevnik 150, niz 401, kursevi 60, lekcije 250, izazovi 20, objave 20, „ispred mene" 100. Nijedan `.filter` ne ide posle skeniranja, a nijedan upit ne čita sat.
- Jedan upit napretka po ljusci (`useQueries` u `IgraProgressProvider`); nijedna druga komponenta se ne pretplaćuje.
- Promena: nema (ODLUKA 5).

**Površine:** gotovo: bundle svih app ruta, 3D (platno IGRA + maskota), slavlje, rang lista i podijum, kosturi table, pečat. Pregledano bez izmena: mapa puta, panel napretka, polica bedževa, alt tekstovi, dodirne mete. Nije menjano (nije IGRA ili traži odluku): ODLUKE 4–6.

**ODLUKE:**
1. **Crea radionica je i dalje +27 KB iznad merenja pre IGRA-e (cilj K01 +10 KB), u budžetu rute (492 / 512).** K28 je skinuo 3,8 KB (druga kopija `igra-copy`). Ostatak je zajednički sloj IGRA-e koji Crea namerno nosi od K15/K16: red napretka u zaglavlju, `IgraArt` sa manifestom (~3,3 KB), `igra-copy` (4,2 KB), stanja i greška, heroj i nalepnice radionice.
   - Sledeća ušteda bi bila podela `lib/igra-copy.ts` po površinama, jer Turbopack ne odbacuje neiskorišćene izvoze. To je oko 35 uvoza u 30 fajlova za ~2 KB, pa to ostavljam za posle runa.
   - Po ruti je ceo IGRA sloj sada lakši nego pre K28 (−17 KB na većini app ruta).
2. **Kostur table je serverski fajl bez uvoza.** `loading.tsx` ga crta bez klijentskog JS-a. Test `lib/igra-dashboard.test.ts` je ranije tvrdio da `loading.tsx` uvozi `dashboard-content`; sada tvrdi suprotno, uz nove provere (bez klijentske direktive, bez uvoza). Kartice kurseva i dalje uvoze `dashboard-content`.
3. **Zaključan skrol rezerviše žleb (`scrollbar-gutter: stable`) samo dok je modal otvoren i samo kad skrol-bar postoji.** Izmena je u zajedničkom `useModalFocus` (`components/ui/dialog.tsx`), pa važi za svaki `Dialog`. Jedina vidljiva razlika je da strana više ne skače; javne strane nisu dirane. U Playwright-u bar nema širinu, pa sam proverio samo logiku (test izvora), ne i piksele.
4. **Kontrast koji nije uveo IGRA nije diran.** Pronađeno u svetloj temi, sve postoji i u commit-u pre runa (`7ec283d`):
   - zajednica: vreme `text-muted/75` 3,3:1, `text-ink/50` 2,9:1, čipovi oblasti 4,3:1;
   - rang: neaktivan filter `text-ink/65` 4,1:1, „Gde se uči" `text-ink/60` 3,8:1;
   - korisničko ime u sidebaru `text-muted/80` 3,6:1.

   Pun `--muted` na `--paper-strong` je 4,48:1, dakle sam token je na ivici. To je odluka o zajedničkom tokenu (deli ga i javni sajt), za Jovana.
5. **Convex bez izmena.**
   - `completedCoursesOf` čita objavljene kurseve (≤ 60) i za svaki jedan red statistike po jedinstvenom indeksu, paralelno. To je ograničen paralelni niz čitanja po broju kurseva platforme, ne N+1 po podacima korisnika. Jedno čitanje bi tražilo novi indeks ili digest tabelu, a skill to bez izmerenog signala ne preporučuje.
   - `weekRank` (do 100 redova ispred) svesno reaguje na tuđi XP (K04 ODLUKA 1, jedna konstanta `RANK_LIMIT`).
   - Za proveru na produkciji: `npx convex insights --details` (`--prod`, ja ga ne pokrećem).
6. **Nije dirano:**
   - zastareli komentar u `admin-hero-scene.tsx` koji tvrdi da Chromium skida lenju sliku iz `display:none` kutije (izmereno je suprotno; komponenta je ionako ne pravi na telefonu);
   - `page-motion.tsx` i `chat-motion.tsx`, koji koriste `autoAlpha` (nisu IGRA, ulaz traje < 0,6 s i ne čeka skrol);
   - heroj table: misija različite dužine menja visinu za 5–12 px;
   - kostur mreže prozora na 390 px je viši od učitanog (ispod prevoja; postoji od pre IGRA-e);
   - umnoženi `aria-live` + naziv dijaloga u slavlju (plan K01 traži oba);
   - podijum ima DOM redosled 1-2-3, a izgled 2-1-3 na `md` (redosled ranga je smisleniji za tastaturu).

**Novi paketi:** nema.

**Testovi:**
- `lib/igra-perf.test.ts` (12, novi):
  - DPR ≤ 1,5 na svakom platnu u `components/igra` i `components/crea`;
  - maskota pamti kadar posle povratka na tab;
  - granice greške ne uvoze `igra-copy`;
  - slavlje čeka kucanje i ne gasi se samo kad ga korisnik koristi;
  - žleb skrol-bara;
  - rang lista bez lažnih linkova i bez `aria-live`, „ti" red kao jedna meta, `scroll-m*`, `useEnterStagger` bez `autoAlpha`;
  - kontrast pečata ≥ 4,5:1 na tri papira i tamni parnjak.
- `lib/igra-celebrations.test.ts`: `isTypingTarget`.
- `lib/igra-dashboard.test.ts`: tvrdnja o `loading.tsx` je obrnuta (ODLUKA 2).
- `lib/igra-state.test.ts`: uvoz iz `igra-state-copy`.

**Slike:** nema novih; tražene: nema.

**Rezultat provere:** codegen: nije potreban (`convex/` nije diran) / typecheck: prošlo (i posle build-a) / lint: prošlo (0 grešaka, istih 26 upozorenja) / test: prošlo (321 fajl, 3.640 testova) / check:frames, check:corners, check:white, check:igra: prošlo / build: prošao / check:bundle: prošlo (brojevi gore). Dev server (3123) ugašen; Playwright `page-*.yml` i `console-*.log` obrisani.

**BLOKADA:** „LCP ne gori od pre" (K08 BLOKADA 1) i dalje nije izmereno kao Lighthouse pre/posle na pravom nalogu: Playwright nije prijavljen, a auth tok se ne dira. Izmereno je ono što izlog dozvoljava (gore).

**Za Jovana ujutru:**
1. Na rang listi, na pravom nalogu, pređi Tab-om od filtera kroz podijum i listu. Svaki red treba da dobije fokus i da ostane vidljiv iznad „ti" reda.
2. Na Windows-u otvori panel „Moj napredak" ili slavlje. Strana ne sme da skoči udesno za širinu skrol-bara.
3. Pečati „Završeno" / „Spremno" su sada tamniji koral (`--igra-stamp: #b4441f` u svetloj temi). Proveri da li ti se nijansa sviđa.
4. Odluči o tokenu `--muted` na `--paper-strong` (ODLUKA 4).
5. Lighthouse nad `/app` na prijavljenom nalogu.
6. `npx convex insights --details --prod` za stvarnu cenu `igra:getMyProgress`.
