# CREA — napredak runa

Plan: `docs/CREA-PLAN.md` · Pravila: `.crea-run/rules.md` · Koraci: `.crea-run/steps.json` + `.crea-run/prompts/`

## ODLUKE (globalne)
- Važe podrazumevane odluke O1–O8 iz `docs/CREA-PLAN.md` §3 (izabrane konzervativno jer pitanja nisu odgovorena).

---

## K01 - Arhitektura Crea   (2026-10-05 01:15)
**Plan korak.** Plan je upisan u `docs/crea/planovi/K01.md`. Nije menjan kod.

## K02 — Brend Crea, rute i logo   (2026-10-05 01:40)
**Fajlovi:** `lib/routes.ts`(+test), `proxy.ts`, `eslint.config.mjs`, `convex/chat.test.ts` (timeout), `lib/security-headers.ts`(+test), `lib/crea-brand.ts` (nov),
`components/crea/crea-mark-icon.tsx` (nov), `components/crea/crea-logo.tsx`, `app/globals.css`,
`app/[locale]/(marketing)/studio/page.tsx`, `components/marketing/page-hero.tsx`, `components/marketing/site-footer.tsx`,
`app/[locale]/studio/(shell)/{layout,app/page,app/m/[jobId]/page,krediti/page}.tsx`,
`app/[locale]/app/{studio/page,studio/m/[jobId]/page,admin/studio/page,credits/page}.tsx`,
`components/studio/{studio-shell,project-picker}.tsx`, `components/app/{app-sidebar,dashboard-windows,course-lab,credits-page,studio-page,studio-media-detail,admin-content-manager,studio-admin-page}.tsx`,
`lib/{i18n,studio-landing,studio-messages,legal-copy,sidebar-contexts}.ts`, `lib/{legal-copy,stripe}.test.ts`,
`convex/mcp/{studioTools,resources,prompts}.ts`, `convex/crons.ts`, `convex/studioActualCost.ts`, snimci `docs/crea/snimci/K02-*.png`.

**Šta je urađeno:** Javni slug je `crea` (sr i en), uslovi `uslovi-crea` / `en/crea-terms`; kanonski segmenti i folderi ostaju `studio`. Stari `/studio/*`, `/en/studio/*`, `/uslovi-studio`, `/en/studio-terms` daju 308 kroz postojeću kanonizaciju (proveren curl-om na dev serveru, i query se čuva). `proxy.ts` sada rewrite-uje i `en` putanju kad se slug razlikuje od foldera (`needsInternalRewrite`) — bez toga bi `/en/crea/*` bio 404. Security headers DENY pogađa i `/crea/app`, `/crea/krediti` (sr/en), landing ostaje bez zaglavlja. Svi tekstovi koje korisnik vidi (navigacija, dashboard, hero CTA „Otvori Creu", cenovnik „Crea krediti", landing, radionica, krediti, uslovi i politika privatnosti — samo ime proizvoda, poruke grešaka, admin oznake i mejlovi adminima, MCP opisi) kažu „Crea" sa padežima. Wordmark je u zaglavlju radionice i u heru landinga sa potpisom „stvaraj.", znak u sidebaru i railu; dodat `@keyframes crea-ray`; ikonice (SVG + 16/32 PNG + apple 180) i OG slika za `/crea` rute kroz Next metadata. Detalj rada (`/crea/app/m/<id>`) se sad prepoznaje po kanonskoj putanji (`parsePath`), ne po javnoj.

**Feature ID-jevi:** §1 (brend, logo, keyframes, landing najava) — gotovo; §2 (rute, 308, interna imena ostaju) — gotovo. `animated` logo se pali tek u K25 (po planu).

**ODLUKE:**
- Odluke K01-1…K01-22 iz `docs/crea/planovi/K01.md` §0.1 važe za ceo run (ukratko): slug `crea`/`uslovi-crea`/`crea-terms` + legacy alias `uslovi-studio`; en rewrite u proxy-ju; `/app/studio` ostaje kao URL (samo natpis „Crea"); uslovi — samo ime, pečat `acceptedStudioTermsAt` važi; COOP/COEP isključen; lokalni rezultati kroz `creaLocal.saveLocalResult` sa `provider:"local"`; stablo verzija `parentJobId/rootJobId/derivation`; alias „izlaz kao ulaz" bez kopiranja bloba; `crea_pricing_v2` (odsutan = OFF) + `creditFactor` na poslu; noćna tura status `queued` + `creaBatches`; C4 samo isti korisnik; recepti u repou; gejmifikacija na postojećem `leaderboard*`/`profileActivityDays`; tekstovi u `lib/crea-copy.ts`; više izlaza = zasebni redovi; limiti brojanjem kroz indeks; jedan LLM modul `convex/creaLlm.ts`; push kategorija `crea`; moduli `crea<Ime>.ts`; lint baseline (2 greške iz `.crea-run/logs/failed-tests.cjs`) se ne dira.
- `CreaLogo` čita sirove tokene `var(--ink)`/`var(--yellow)` umesto `var(--color-*)`: `--color-ink` se razreši na korenu, pa je u svetlom „ostrvu" heroja u tamnoj temi wordmark bio svetao (vidljivo na snimku). Geometrija nije dirana.
- `ProjectPicker` preskače `listMyProjects` bez prijave (`"skip"`): gost na `/crea/app` je dobijao `Unauthorized` koji ruši stranicu (zatečen kvar, nalaz 0.2-10 u planu K01; prihvatanje traži da `/crea/app` radi).
- `PageHero` dobio opcioni slot `brand` (iznad naslova) — jedino mesto za wordmark + „stvaraj." bez menjanja ostalih heroja.
- Potpis „stvaraj." je isti u oba jezika (brend, kao na lockup-u); podnaslov heroja je skraćen da najava stane iznad ilustracije na telefonu.
- Sidebar: `NavLink.icon` tip proširen na `ComponentType<{ className?: string }>` da bi primio Crea znak; orphan `Wand2` uvoz uklonjen.
- Footer link uslova je kanonski `withLocale(locale, "/studio-terms")` (literal, da footer ne bi vukao `lib/studio-messages` u marketing bundle).
- Datum „Poslednja izmena" na uslovima nije pomeren — preimenovanje nije bitna izmena (K01-4).
- Favicon: Next uvek emituje root `app/favicon.ico` (256×256) prvi, posle njega idu Crea SVG i tačne 16/32 PNG veličine; Chrome bira tačnu veličinu, pa se očekuje Crea ikonica — file-based `icon` po segmentu nije uveden (root favicon bi ostao svejedno).
- Izuzeci koji svesno ostaju „Studio": ime MCP alata `get_studio_state` i JSON ključ `studio:` u `nauciai://credits` (ugovor sa klijentima), kodovi grešaka (`STUDIO_PAUZIRAN`…), flegovi `studio_*`, imena cronova, storage ključevi, CSS tokeni, komentari; nisu proizvod: „Studio je nakratko zastao" (`app/[locale]/app/community/error.tsx:30`, greška zajednice), bedž „AI Studio Commons" (`community-v2/community-shell.tsx:29`), modul kursa „Studio workflow" (`lib/content.ts:290`, `convex/seedData.ts:149`), „Studijske grupe" (study hub).
- `eslint.config.mjs`: `.crea-run/**` dodat u `globalIgnores` (isto kao postojeći `.ux-run/**`). Jedine 2 lint greške baseline-a dolazile su iz `.crea-run/logs/failed-tests.cjs` (pomoćna skripta runnera, nije kod aplikacije), pa `npm run lint` sada prolazi bez gašenja ijednog pravila.
- `convex/chat.test.ts` › „inbox summary stays exact beyond one thousand memberships": dodat eksplicitan timeout 30 s (treći argument `test`). Test sam prolazi za ~3 s, a pod paralelnim `npm run test` premaši podrazumevanih 5 s (baseline flake iz `.crea-run/baseline.txt`). Nijedna asercija nije dirana.
- Grep dokaz: `grep -rnE "(\"|'|\`|>)[^\"'\`<>]*\bStudi(o|ja|ju|jsk)[^\"'\`<>]*(\"|'|\`|<)" app components lib convex` (bez testova/komentara/uvoza) vraća SAMO gornje izuzetke.

**Novi paketi:** nema.

**Testovi:** `lib/routes.test.ts` — parsiranje `/crea*`, legacy alias, 308 za sve stare putanje (sr/en/`/sr/`), idempotentnost, `needsInternalRewrite` (sr uvek, en samo za Creu), alternates na `/crea`; `lib/security-headers.test.ts` — DENY na `/crea/app`, `/crea/app/m/…`, `/en/crea/app`, `/crea/krediti`, `/en/crea/krediti`, `/sr/studio/app`; bez DENY na `/crea`, `/en/crea`, `/uslovi-crea`, `/en/crea-terms`; plus test koji javne putanje izvodi iz `lib/routes.ts`; ažurirane asercije u `lib/legal-copy.test.ts` (nova imena i rod) i `lib/stripe.test.ts` (povratak na `/crea/krediti`).

**Rezultat provere:** codegen — prošao (bez izmena u `_generated`); typecheck — prošao; lint — prošao (0 grešaka, 27 zatečenih upozorenja, nijedno novo); test — prošao, 1629/1629 (117 fajlova); `check:frames` i `check:corners` — prošli. Playwright: 390×844 i 1440×900, svetla i tamna tema (snimci `docs/crea/snimci/K02-*.png`); dev server ugašen.

**Za Jovana ujutru:**
- Otvori `/crea`, `/crea/app`, `/crea/krediti`, `/uslovi-crea`, `/en/crea` u obe teme; proveri da tab pokazuje Crea ikonicu (root `favicon.ico` se i dalje emituje).
- Stari linkovi (`/studio/app`, `/uslovi-studio`) treba da vode na nove (308) — i na produkciji posle deploy-a proveri da LiteSpeed ne kešira stari 200 odgovor za `/studio`.
- Na telefonu bonus red („25 kredita na poklon…") u heru landinga leži preko ilustracije (zatečen raspored `PageHero`-a), čitljivost je slabija.
- Snimak `K02-landing-desktop-svetla.png` je napravljen pre skraćenja podnaslova (tekst je sada kraći).

## K03 — Ljuska tri radionice i „Šta praviš danas?"   (2026-10-05 02:17)
**Fajlovi:**
- novi: `lib/crea-shell.ts` (+`.test.ts`), `lib/crea-goals.ts` (+`.test.ts`), `lib/crea-copy.ts`, `components/crea/{crea-workshop,crea-area-tabs,crea-mode-tabs,crea-tool-panel,crea-stage,crea-history,crea-start-screen,crea-coming-soon,crea-icons}.tsx`, snimci `docs/crea/snimci/K03-*.png` (10);
- izmenjeni: `components/app/studio-page.tsx`, `components/studio/studio-composer.tsx`, `components/studio/model-picker.tsx`, `components/app/studio-media-grid.tsx`, `components/app/studio-media-tile.tsx`, `components/app/studio-media-detail.tsx`, `lib/studio-grid.ts` (+test), `lib/sidebar-contexts.ts` (+test), `scripts/check-frames.mjs` (gate proširen na `components/crea`).

**Šta je urađeno:** Radionica (`/crea/app` i školski `/app/studio`, ista `StudioPage`) je sada ljuska: veliki tabovi Početak · Slika · Video · Zvuk (ikona + tekst, žuta „nalepnica" klizi sa taba na tab kroz `motion` `layoutId`), ispod tabovi režima (Slika: Napravi · Izmeni · Alati · Likovi; Video: Napravi · Izmeni · Pokret · Govor · Montaža; Zvuk: Govor · Glasovi · Promena glasa · Prevod · Muzika · Efekti · Uređivač). Stanje je u URL-u (`?oblast=&rezim=`, podrazumevani režim se ne upisuje; stari `?kind=` znači oblast) i nosi se i kroz detalj `/m/<id>`. Raspored po širini RADIONICE (container query + isti prag u JS-u, `CREA_DOCK_MIN_PX = 896`): ≥1152 px levo panel sa composerom · sredina „Poslednji rad" (živ status, klik = pun prikaz) · desno istorija (postojeća galerija filtrirana na oblast, kolone po širini kolone); 896–1152 px istorija ide ispod scene; uže od toga jedna kolona (tabovi → scena → istorija), a composer je postojeća donja fioka sa sklapanjem. Izbor modela u composeru nudi samo modele tog režima (`modelsForMode`) i ne prikazuje izbor vrste (`lockedKind`); usidren composer otvara čipove nadole, a izbor modela desno preko scene. Režimi bez sadržaja (Alati, Likovi, Montaža, Glasovi) pokazuju list „Stiže uskoro" sa jednom rečenicom šta će raditi i prečicama ka režimima te radionice koji rade. Početni ekran „Šta praviš danas?" ima 12 kartica po cilju (pravi linkovi, deljivi): vode u tačnu oblast/režim sa popunjenim opisom (`?cilj=`), preporučenim modelom (`?model=`), po potrebi ulaznim režimom (Oživi fotku → `image`) i parametrom (TikTok → 9:16). Kuka za recepte: `CreaGoal.recipeId` → `goalHref` upisuje `?recept=` (K15), `toolId` → `?alat=` (K04+).

Popravljeni nalazi iz plana K01 §2.4: composer šalje model uz payload pa detalj generiše modelom POSLA (0.2-7); composer ima ključ po oblasti/režimu/cilju/semenu ponavljanja, ali ne po modelu — promena modela i dalje čuva opis (0.2-8); drop preko celog ekrana je ugašen dok je detalj otvoren (0.2-9); otvaranje/zatvaranje/listanje detalja čuva query (0.2-11); `?model=` se sinhronizuje i posle prvog rendera; „Upotrebi ponovo" prebacuje u režim u kojem model posla radi (`modeOfModel`). Školski sidebar: sekcije vode na `?oblast=slika|video|zvuk`, „Sav sadržaj" na početni ekran, stari `?kind=` se i dalje prepoznaje.

**Feature ID-jevi:**
- U1 — gotovo (tri radionice u jednoj ljusci, telefon: skrolabilni tabovi, composer kao donja fioka, istorija ispod).
- U2 — gotovo za ciljeve; recepti stižu u K15 (kuka `recipeId`/`?recept=` postoji, `lib/crea-recipes.ts` još ne).
- S1, V1, A1 — ljuska i režimi gotovi; sadržaj „uskoro" režima (Alati K04/K09/K11, Likovi K14, Montaža K19, Glasovi K22) i V1 „Napravi ovako" nisu deo K03.

**ODLUKE:**
- **Gost vidi ljusku.** Neprijavljen korisnik na `/crea/app` umesto jednog panela „Prijavi se" vidi tabove, „Šta praviš danas?" i režime; prijava stoji tamo gde bi bio composer, a istorija kaže da se radovi čuvaju posle prijave. Zašto: početni ekran po cilju je najkorisniji baš onome ko još nije počeo, ništa se ne poziva bez prijave (katalog, istorija i projekti su i dalje `"skip"`), a to je jedini način da se ljuska vidi i snimi bez naloga. Školski `/app/studio` gost ionako ne vidi (proxy ga šalje na prijavu).
- **Gemini Omni nije u „Video → Izmeni".** Njegov `video` režim je nastavak (traži izbor ranije generacije, `capabilities.continuation`), a forma taj izbor još nema (nalaz 0.2-13), pa bi dugme stalno bilo blokirano. `usableInputModes` ga izostavlja; model ostaje u „Video → Napravi". Vraća se kad K18/K20 uvedu `SourceJobPicker`.
- **Pravila režima:** Slika/Video po ulaznim režimima modela (`text` = Napravi, `image_multi`/`layerize` = Izmeni, `video` = Izmeni videa); Pokret, Govor (video) i svi zvučni režimi po slugovima (svi zvučni modeli imaju isti ulazni režim). Test tvrdi da SVAKI model iz `STUDIO_MODELS` ima bar jedan režim — K07 mora da doda nov zvučni model u spisak ili test pada.
- **Prelom rasporeda meri radionicu, ne prozor** (sidebar školskog omotača jede ~280 px). 3 kolone tek od 1152 px radionice, 2 od 896 px; ispod toga composer je donja fioka. Composer se ne crta do prvog merenja, da ne bi skočio sa dna u panel.
- Izbor modela u usidrenom composeru otvara se DESNO od polja (preko scene), ne nadole: nadole je visina od ~430 px izlazila iz ekrana. Panel dobija `z-20` jer sticky pravi sopstveni sloj.
- Merenja u `StudioPage` (visina fioke, granice sadržaja) prebačena sa `useRef` + efekta na mount-u na callback ref: na prvom renderu prijava još traje, pa ti elementi tada ne postoje i ResizeObserver se nikad nije kačio (zatečen kvar, ali u istom kodu koji ljuska menja).
- Polje za opis se samo širi i kad opis stigne spolja (cilj, „Upotrebi ponovo"), a u usidrenom položaju ima 3 reda — inače se od dugog opisa cilja vidi samo prvi red.
- Režim koji nema nijedan uključen model (admin ga ugasio) pokazuje poruku umesto praznog panela.
- `CreaStage` ponovo koristi `StudioMediaTile`; kartica dobija `domId` (`stage-<id>`) da poslednji rad na sceni i u istoriji ne dele isti DOM id.
- Tekstovi oblasti i režima su podaci u `lib/crea-shell.ts`, ciljevi u `lib/crea-goals.ts`, ostali UI tekstovi u `lib/crea-copy.ts` (K01-16). „Srpski glas" ima srpski primer i u en verziji (cilj je baš srpski izgovor).
- Snimci prijavljenog izgleda (composer u panelu, istorija sa radovima) su napravljeni na privremenoj strani `app/[locale]/k03-harness` sa lažnim radovima i pravim katalogom iz `STUDIO_MODELS` (pravi composer, prave komponente ljuske) — strana je obrisana pre kraja koraka. Snimci `K03-pocetak-*` i `K03-uskoro-*` su prava `/crea/app` kao gost.

**Novi paketi:** nema.

**Testovi:**
- `lib/crea-shell.test.ts` (21): režimi po planu, tekstovi na oba jezika, „uskoro" bez modela, prvi režim svake oblasti radi; **svaki model iz kataloga je dostupan u bar jednom režimu** svoje oblasti; režim nudi samo svoju vrstu; raspodela po §2.2; Omni nastavak nije u Izmeni; ulazni režim po režimu ljuske; `modeOfModel`; parsiranje URL-a (stari `?kind=`, režim van oblasti, nevažeći id-jevi); `creaShellQuery` (bez podrazumevanog režima, čuva projekat/lekciju/regenerate, briše cilj/alat/model pri promeni, povratak na početak, parse∘query = id).
- `lib/crea-goals.test.ts` (13): 8–12 kartica, jedinstveni id-jevi, sve tri oblasti, tekstovi, režim pripada oblasti, model postoji i režim ga nudi, kartica „uskoro" ne obećava model, ulazni režim i parametri postoje na modelu (i vrednost je dozvoljena opcija), `goalHref` (oblast, režim, cilj, model, čuvanje lekcije, alat).
- `lib/studio-grid.test.ts`: `columnsForContainerWidth`; `lib/sidebar-contexts.test.ts`: sekcije vode na `?oblast=`, aktivna sekcija iz `?oblast=`, stari `?kind=` i dalje radi.

**Rezultat provere:** codegen — nije potreban (`convex/` nije diran); typecheck — prošao; lint — prošao (0 grešaka, 27 zatečenih upozorenja, nijedno novo); test — prošao, 1667/1667 (119 fajlova); `check:frames` (sada pokriva i `components/crea`), `check:corners`, `check:white` — prošli; impeccable detektor nad novim komponentama — čist. Playwright: 390×844, 1180×860 i 1440×900, obe teme, bez vodoravnog skrola, svi tabovi ≥ 44 px, strelice šetaju fokus po tabovima; moj dev server (`next dev -p 3100`) ugašen. Zatečen `npx convex dev` (PID 20476, pokrenut 2026-10-04 23:11, pre runa) nije moj i nije diran.

**Za Jovana ujutru:**
- Prijavljen otvori `/crea/app`: „Šta praviš danas?" → npr. „Reklama za lokal" treba da otvori Slika · Napravi sa popunjenim opisom i GPT Image 2; „TikTok video" MiniMax H3 sa 9:16. Proveri da generisanje iz panela levo radi kao pre (i iz detalja: „Generiši ponovo" mora da ide modelom tog rada).
- Školski `/app/studio` na laptopu sa otvorenim sidebarom: radionica je tu uža, pa je istorija ispod scene (2 kolone); na širem ekranu 3 kolone.
- Lekcija → „Otvori u Crei" sada otvara početni ekran sa ciljevima (lekcija se čuva kroz sve tabove i kartice).
- Gost na `/crea/app` sada vidi ceo početni ekran (ODLUKA gore) — ako ti se ne sviđa, vrati rani izlazak u `StudioPage`.
- Gemini Omni se ne nudi u „Video → Izmeni" dok ne stigne izbor ranije generacije (K18/K20).
