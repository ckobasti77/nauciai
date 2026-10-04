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
