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
