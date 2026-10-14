# IGRA — završni izveštaj (noćni run 13. → 14. oktobar 2026.)

Za Jovana. Plan: `docs/IGRA-PLAN.md`. Pun dnevnik svakog koraka (fajlovi, merenja, sve ODLUKE):
`docs/IGRA-PROGRESS.md`. Tehnički planovi: `docs/igra/planovi/K01.md`, `K07.md`, `K14.md`, `K20.md`.

## 0. Ukratko

- **Svih 30 koraka (K01–K30) je prošlo** (`.igra-run/state.json`: sve `OK`). Ceo deo posle prijave ima
  gejmifikovan izgled: nivo (12), XP traka, niz, 24 bedža, slavlja, rang lista sa podijumom, mapa puta,
  likovi i ilustracije na svakoj površini, 3D pehar/medalje/maskota samo na računaru.
- **Ekonomija nije dirana:** nema promena `LEADERBOARD_XP`, kredita, cena, Stripe-a ni nagrada. Jedini
  novi upisi u bazu su dnevnik `igraSeen` (šta je proslavljeno) i izbor banera (`users.igraBanner`).
- **Javni sajt i auth nisu dirani** (K29 je pronašao i vratio dva slučajna curenja deljenog CSS-a na javni deo).
- **Glavna BLOKADA celog runa:** Playwright nije mogao da se prijavi (auth se ne dira), pa su **sve površine
  posle prijave proverene u izlogu** (`/igra-izlog`, iste komponente nad test podacima), a **ne nad tvojim
  pravim nalogom**. Zato je spisak u §8 važan: to je prvi put da sve ovo radi nad živim podacima.
- Provere na kraju (K30): `check:igra`, `check:frames`, `typecheck`, `lint`, `test`, sve prolaze (§10).

## 1. Kako da pregledaš granu

```bash
git log --oneline main..igra-run          # 31 commit + K30 (b5f4a80 = zatečene izmene pre runa, 89fe482 = K00)
git diff --stat main...igra-run           # ~781 fajl, +32k / −2,8k (veliki deo su slike, snimci i testovi)
git diff main...igra-run -- convex/       # sve backend izmene: igra.ts, igraCore.ts, igra.test.ts, schema.ts
```

Lokalno (Turbopack `next dev` na ovoj mašini visi):

```bash
npx next dev --webpack -p 3123
# izlog (samo u razvoju, u produkciji 404):  http://localhost:3123/igra-izlog?deo=tabla&stanje=aktivan
# delovi: slike, pokret, primitivi, ljuska, tabla, ucionica, mapa, zajednica, rang, profil,
#         crea, poruke, krediti, admin, stanja, mikro;  stanje = novi | aktivan | legenda
```

Napomena: `next dev --webpack` vraća 500 za pravu Crea radionicu zbog `vectortracer` WASM-a (zatečeno,
nije od runa); radionica radi na produkcionom buildu (`npm run build && npx next start -p 3124`).

## 2. Šta je urađeno, po površini

Finalni snimci (K30, iz izloga, test korisnik „aktivan"): `docs/igra/snimci/K30-<površina>-<1440|390>-<svetla|tamna>.png`
(40 snimaka, 10 površina × 2 širine × 2 teme; dugi delovi su odsečeni na 3.600 px / 5.200 px visine).
Snimci prethodnih koraka (`K02-…` do `K29-…`, ukupno 255) pokazuju stanja koja K30 ne ponavlja.

| Površina (plan §6) | Šta je urađeno | Koraci | Snimci |
|---|---|---|---|
| **Temelj** | IGRA tokeni za obe teme, `<IgraArt>` (AVIF + dostojanstven fallback), registar slika nad manifestom, GSAP hookovi (odometar, marker, pečat, peel, stagger), lenji GSAP pluginovi, domaćin slavlja (red, jednom, Esc, ≤ 2,5 s, `aria-live`), proceduralni 3D pehar/medalje (toon + ink outline), 12 nivoa, 24 bedža, niz, `igraSeen`, 10 primitiva, izlog | K02–K05 | `K02-*`, `K03-*`, `K05-*` |
| **6.1 Ljuska** | Red napretka u sidebaru (pečat sa prstenom, ime nivoa, plamen, XP traka), krug u skupljenom rail-u, čip u mobilnom zaglavlju, prsten nivoa oko avatara, panel „Moj napredak", jedan upit `igra:getMyProgress` za celu ljusku, slavlja; donji meni ostao **tačno 4 slota** | K06, K26 | `K30-ljuska-*`, `K06-*` |
| **6.2 Kontrolna tabla** | Heroj sa scenom po dobu dana (Beograd), Robijev pozdrav, misija dana („Nastavi lekciju" sa prstenom), kartica napretka, puls (4. pločica = mesto na listi), polica bedževa, Crea brzi start (Piksi/Kadar/Eho), mastilo-kalendar 26 nedelja, 3D maskota od 1.400 px sa mišem | K07, K08 | `K30-tabla-*`, `K08-*` |
| **6.3 Učionica** | Kartice kurseva kao „svetovi" (lik po temi kursa, prsten napretka, pečat „Završeno"), Sova u zoni „Nastavi", lepljiva traka koraka u lekciji, mali kraj lekcije („+N XP" meren iz XP-a), veliko slavlje kraja kursa preko ljuske | K09 | `K30-ucionica-*`, `K09-*` |
| **6.3 Mapa puta** | Ručno nacrtana putanja kroz lekcije (kurs) i kurseve (staza), DrawSVG iscrtavanje kad uđe u kadar, Robi „Ti si ovde", dva rasporeda bez merenja u JS-u | K10 | `K30-mapa-*`, `K10-*` |
| **6.4 Zajednica** | Heroj sa scenom trga i Iskrom, čip autora („17 lekcija") na temama i komentarima, kartice članova sa nivoom i XP trakom, značke kao nalepnice, obaveštenja sa „Upravo stiglo", ilustrovana prazna stanja | K11 | `K30-zajednica-*`, `K11-*` |
| **§5 Rang lista** | Podijum sa medaljama i 3D peharom (računar), stagger ulaz, GSAP Flip pri promeni mesta, lepljiv „ti" red, pošteno odbrojavanje do kraja nedelje (bez sekundi, bez boje hitnosti), tastatura prolazi kroz sve redove | K12, K26, K28 | `K30-rang-*`, `K12-*`, `K28-rang-fokus-*` |
| **6.5 Profil** | Baner (6, otključavaju se nivoom, bira se na svom profilu), pečat nivoa, karta igrača, trofejna polica sa svih 24 (filter po grupi), brojači + kalendar 52 nedelje; tuđi profil vidi samo ono što je i danas javno | K13, K29 | `K30-profil-*`, `K13-*`, `K29-*` |
| **6.6 Crea** | Ulaz „Šta praviš danas?" sa scenom i tri lika, zaglavlja radionica, lik „radi" dok čeka, mini slavlje prvog rada svake vrste, „+N XP", tužan lik na neuspehu (ista poruka o povraćaju kredita), nalepnice „Novo"/srce u biblioteci, naslovnice galerije/izazova/sveske, kruna pobednika, rang čipovi u ligi | K14–K17 | `K30-crea-*`, `K15-*`, `K16-*`, `K17-*` |
| **6.7 Poruke** | Ilustrovana prazna stanja (lista, razgovor, pretraga, „Uči zajedno"), utisnuto „Pošalji", reakcija „iskoči" jednom | K18 | `K18-poruke-*` |
| **6.8 Krediti i naplata** | Zajedničko zaglavlje sa ikonom (krediti, pretplata, profil, API ključevi), ilustrovana prazna stanja, mirnija hijerarhija; **bez** odometra, slavlja i „kupi još" | K19 | `K19-krediti-*` |
| **6.9 Admin „Kontrolna soba"** | Heroj sa Robijem i 4 pilule stanja sistema, KPI sa nalepnicama i odometrima, Analitika sa 3 grafikona u stilu sveske iz postojećih upita, „Red misija" u moderaciji, pečat „Spremno · n/n" u uredniku, ilustrovana zaglavlja Crea admina / Chat sigurnosti / podešavanja; tabele ostale guste | K20–K22 | `K30-admin-*`, `K21-*`, `K22-*` |
| **6.10 Stanja** | `IgraState` (prazno, greška, 404, učitavanje, offline, zaključano, uskoro), ilustrovan 404 unutar ljuske (`/app/[...notFound]`), granice greške, traka „Nema interneta" | K23 | `K30-stanja-*`, `K23-*` |
| **Prolazi** | Mikrointerakcije (`.igra-press` / `.igra-lift` u 113 fajlova, zvuk samo kroz prekidač), sve slike na mestu, telefon 390 px (mete ≥ 44 px, `.igra-hit`), tamna tema (kontrast), performanse i pristupačnost, revizija | K24–K29 | `K24-*`…`K29-*` |

## 3. Šta nije urađeno ili je delimično

- **Ništa nije gledano nad pravim nalogom** (BLOKADA 1, §4). Sve gore je „gotovo u izlogu + testovima".
- **Pečat IGRA nivoa na temama i komentarima ne postoji** (K11 ODLUKA 1): red teme nosi samo broj lekcija
  autora; pravi nivo bi tražio čitanje XP-a po temi/komentaru u `convex/community.ts`. Umesto toga je čip „N lekcija".
- **Nivo na nedeljnoj rang listi** se ne crta (samo na „Ukupno"), jer red nedeljne liste nosi nedeljni XP (K12 ODLUKA 2).
- **Filter Sve / Učenje / Crea na rang listi** nije uveden: XP nema jeftinu podelu (K01-11, K12-1).
- **Admin „Korisnici"** je i dalje „U pripremi" (sad sa ilustracijom): spisak naloga bi bio nova funkcija, ne izgled (K21-3).
- **Sparkline-ovi** nisu na pregledu admina ni na Crea adminu (nema dnevnog niza bez novog upita); niz Crea upita od 14 dana je na Analitici (K20-2, K22-1).
- **Moderacija i pregled u editoru** i javne stranice zajednice i dalje pokazuju stari „Nivo N" (500 XP/nivo) ispod avatara (K11-2).
- **Lighthouse „LCP pre/posle" na `/app` i zajednici** nije izmeren (traži prijavu); izmereno je samo u izlogu (§9).
- **Galerija i izazov** nisu gledani ni kao gost: fleg `crea_public_gallery` je na DEV-u isključen (K17).
- **7 spremnih slika se ne koristi** (§6) — namerno, ne propust.
- **Zvuk i pravi čitač ekrana** nisu provereni ušima (Playwright nema zvuk; NVDA/VoiceOver nije bio dostupan); provereni su pozivi `Audio`, DOM, fokus i `aria-*`.

## 4. BLOKADE

1. **Prijavljene strane nisu viđene u pregledaču** (K06–K29, ista blokada u svakom koraku).
   Playwright MCP radi `--isolated` bez sesije; prijava ide kroz auth tok koji se po pravilima ne dira, a test
   nalog bi bio upis kroz auth. Zamena: izlog crta **prave** komponente (često baš izvezene iz pravih fajlova:
   `AppSidebarContent`, `DashboardHome`, `LeaderboardView`, `CreaStage`…) nad tipizovanim test podacima, plus
   typecheck nad povezivanjem i testovi nad izvorom. Nepotvrđen je samo tanak sloj „upit → komponenta" na živom Convex-u.
2. **„LCP ne gori od pre"** (K08, K11, K28): nema poređenja pre/posle na produkcionom buildu sa prijavom. Izmereno:
   LCP table je scena heroja iz serverskog HTML-a (ne čeka JS ni upit), CLS 0–0,002.
3. **Galerija i izazov** (K17): fleg `crea_public_gallery` je red u DEV bazi; menjanje flegova je zabranjeno.

Nijedna blokada nije u kodu; sve su „provera traži tebe".

## 5. ODLUKE koje traže tvoj stav

Sve ODLUKE (preko 250) su u `docs/IGRA-PROGRESS.md` uz svoj korak. Ovde su samo one gde je izbor ukusa ili
politike, a run je uzeo najkonzervativniju opciju:

| # | Šta | Gde se menja | Korak |
|---|---|---|---|
| 1 | Pragovi nivoa (0 / 100 / 300 / 700 / 1.400 / … / 20.000 XP); prva lekcija = nivo 2, ~2 nedelje = nivo 5 | jedan niz u `lib/igra-level.ts` (test drži krivu) | K04 |
| 2 | „Top 10" na maloj listi dobija svako sa ≥ 100 XP nedeljno | `TOP10_MIN_WEEK_XP` u `lib/igra-badges.ts` | K04 |
| 3 | „10 / 100 radova" broji poslednjih 400 dana; brojači na profilu poslednjih 12 meseci | `convex/igraCore.ts` | K04, K13 |
| 4 | Postojeći korisnici prvi put dobijaju JEDNO zbirno slavlje („Tvoj napredak do sada"), ne niz | `lib/igra-celebrations.ts` | K03/K04 |
| 5 | Tuđi profil: nizovi samo uz javnu đačku knjižicu; broj radova nikad drugima; „Mentor" samo uz javnih 5+ korisnih odgovora | `isBadgePublic` u `lib/igra-badges.ts` | K13, K29 |
| 6 | 3D maskota na tabli pored nacrtanog Robija (dva Robija) | `DashboardMascot` u `components/igra/dashboard/dashboard-hero.tsx` (prop `mascot` je K29 uklonio kao mrtav) | K08 |
| 7 | Heroji, scene, baneri i mapa su **svetla ostrva i u tamnoj temi** (tamne scene bi tražile nove slike) | — | K08, K27 |
| 8 | Stanice mape kursa su **lekcije**, ne moduli | `CourseJourney` | K10 |
| 9 | Pečat u ljusci je broj u krugu (bez slike na svakoj strani); amblem `nivo.NN` se vidi u panelu | `LevelSeal` u `shell-progress.tsx` | K06 |
| 10 | Tost uspeha ima zvuk `stakleni-zvon` (kroz prekidač zvuka) | `components/ui/toast-provider.tsx` | K24 |
| 11 | `Button` u aplikaciji ima tvrdu senku od 2 px (primary/secondary/destructive) | `components/ui/button.tsx` | K24 |
| 12 | Boja pečata `--igra-stamp: #b4441f` (tamniji koral zbog kontrasta 4,8:1) | `app/globals.css` | K28 |
| 13 | Crea radionica je +27 KB gz od pre runa (cilj je bio +10), u budžetu rute (492/512) | podela `lib/igra-copy.ts` po površinama (~2 KB) | K15, K28 |
| 14 | `getDashboardOverview` i dalje računa mesto na listi koje tabla više ne prikazuje (do 1.000 čitanja po otvaranju) | `convex/dashboard.ts` (nije smelo u runu) | K12 |
| 15 | „Novo" na radu u Crei = poslednja 24 h | `CREA_FRESH_MS` u `lib/igra-crea.ts` | K17 |

## 6. Slike

- **Manifest: 123 / 123 spremno** (`public/brand/igra/manifest.json`), sve AVIF; kod koristi 60 ID-jeva + porodice
  (`lik.*` 31, `bedz.*` 24, `nivo.*` 12, `baner.*` 6), **sve spremno**. `npm run check:igra` prolazi.
- **Nedostaje: ništa.** Nema otvorenih „TRAŽENIH SLIKA"; tri iz K14 (`prazno.galerija|izazov|par`) su napravljene i u upotrebi.
- **Spremne, a nekorišćene (7):** `rang.xp`, `rang.meta`, `ikona.ucionica`, `ikona.zajednica`, `ikona.crea`,
  `ikona.profil`, `ikona.poruke` — svaka bi bila druga ilustracija na ekranu koji već ima scenu (K25). Reci gde ih želiš.
- **Predlog za posle runa:** nalepnice su 768 px (do 87 KB) i kad se crtaju na 24–64 px (polica od 24 bedža ≈ 1 MB, `lazy`);
  manje kopije (192 px) u pipeline-u (K25 ODLUKA 2).
- Tamnih verzija scena nema (§5 #7).

## 7. Paketi i Convex (deploy)

**Novi paketi:** samo `@gsap/react@2.1.2` (unapred dozvoljen; GSAP standardna licenca, „no charge", ~19 KB raspakovano).
Novi npm skript: `check:igra`.

**Convex — šta je novo:**
- tabela **`igraSeen`** (`userId`, `key`, `seenAt`; indeks `by_user_key`) — dnevnik proslavljenog (`level:<n>`, `badge:<kljuc>`, `course:<id>`, `summary`);
- polje **`users.igraBanner`** — `v.optional(v.string())`;
- moduli **`convex/igra.ts`** (javno: `getMyProgress`, `getMemberProgress`, `markSeen`, `setBanner`) i **`convex/igraCore.ts`**;
- nijedna postojeća tabela, funkcija, indeks ni `LEADERBOARD_XP` nisu menjani ni preimenovani.

**Deploy: samo `npx convex deploy`, bez migracije.** Nova tabela je prazna, novo polje je opciono, ništa ne treba
popunjavati. Prazan `igraSeen` je očekivan: svaki postojeći korisnik pri prvom otvaranju dobija jedno zbirno slavlje.
- Redosled: **Convex pre ili zajedno sa frontendom.** Ako frontend ode prvi, aplikacija radi, samo bez napretka
  (upit ide kroz `useQueries`, greška ne ruši ljusku — K06 ODLUKA 3).
- ⚠️ Pre `npx convex deploy` proveri `CONVEX_DEPLOY_KEY` u ljusci: na ovoj mašini zna da ostane ključ drugog projekta
  (beautybymasha). Cilj je prod `quick-yak-270`.
- Nema novih env varijabli ni flegova. DEV (`wandering-fox-41`) već ima sve IGRA funkcije (`convex dev --once` u K06, K13, K29; podaci nisu dirani).
- Posle deploy-a: `npx convex insights --details --prod` za stvarnu cenu `igra:getMyProgress` (najgori slučaj ~1.100 malih dokumenata; sva čitanja su indeksirana i ograničena).

## 8. Šta ručno proveravaš (prijavljen, DEV, `npx next dev --webpack -p 3123`)

Ovo je jedini deo koji run nije mogao da vidi. Redom po važnosti:

1. **`/app` (tabla)** — prvo otvaranje: JEDNO slavlje „Tvoj napredak do sada"; posle osvežavanja se ne ponavlja. Red napretka u sidebaru, scena odgovara satu, misija ima smisla, ništa ne skače kad podaci stignu. Dva admin prozora imaju nalepnice.
2. **Lekcija koju nisi završio** — „Završio/la sam" → „+100 XP" i „Sledeća lekcija"; drugi klik → „Lekcija je zapisana." bez broja; na telefonu traka koraka tik ispod zaglavlja. **Poslednja lekcija kursa** → mali kraj, pa jedno slavlje „Kurs završen" (+ pečat na kartici i stranici kursa). Pro prikaz lekcije (`CourseLab`) nije viđen ni u izlogu.
3. **Stranica kursa i stranica smera** — mapa puta u panelu „Nastavni tok" / iznad kartica; na smeru se pojavi trenutak kasnije (čeka vlasništvo).
4. **`/app/community/discussions`, `/members`, `/notifications`** — čip „N lekcija", kartice članova; sa drugog naloga odgovori na svoju temu dok su obaveštenja otvorena → „Upravo stiglo" + Iskra.
5. **`/app/community/leaderboard`** — podijum, odbrojavanje, „ti" red; prebaci na „Ukupno" (tek tada prstenovi nivoa); Tab kroz podijum i sve redove.
6. **Svoj profil** (meni naloga → „Moj napredak" → „Moj profil") — promeni baner (na nivou 1 samo „Sveska"); zatim **tuđi profil** sa javnom i privatnom knjižicom.
7. **`/app/studio` i `/crea/app`** — heroj sa tri lika, zaglavlja radionica, pečat nivoa u traci (isti kao u sidebaru); napravi rad: lik se njiše dok čeka, oblačić sa „+N XP", na novom nalogu „Prvi rad"; neuspeh → tužan lik + ista poruka o kreditima. Biblioteka: „Novo" i srce.
8. **Galerija i izazov** — uključi `crea_public_gallery` na DEV-u, otvori `/crea/galerija` i `/crea/izazov` (naslovnice, kruna pobednika).
9. **`/app/messages`** sa praznim nalogom; pošalji poruku i reaguj 👍.
10. **`/app/credits`** (stanje 0 i sa kreditima), `/app/billing`, `/app/profile`, `/app/profile/api-keys` — **nijedan broj ni cena se nisu promenili**.
11. **Admin:** `/app/admin/content` (Robi i 4 pilule = stvarno stanje; pečat „Spremno"), `/app/admin/analytics`, `/app/community/moderation` („Red misija", broj = sidebar), `/app/admin/studio`, `/app/admin/chat`, `/app/admin/settings`.
12. **Stanja:** `/app/nepostoji` i `/en/app/nepostoji` (ilustrovan 404), DevTools → Offline (traka „Nema interneta").
13. **Telefon** (pravi ili DevTools sa dodirom): leva ivica `/app` nije siva dok je meni zatvoren; donji meni 4 slota; rang filteri u dva reda; dodir oko avatara, `@korisnik`, čipa kredita.
14. **Tamna tema:** žuta dugmad imaju taman tekst; prazne trake/prstenovi se vide; zaključani bedževi su siluete.
15. **Windows:** otvori panel „Moj napredak" ili slavlje — strana ne sme da skoči za širinu skrol-bara.
16. **Zvuk:** poslušaj slavlje nivoa/bedža i tost uspeha; isključi zvuk u meniju naloga → tišina.
17. **OAuth pristanak** (`/oauth/authorize` sa MCP klijentom): dugmad bez tvrde senke, kao pre runa.
18. **Lighthouse** nad `/app` i `/app/community/discussions` na prijavljenom nalogu (BLOKADA 2).

## 9. Brojevi

**Početni JS (gzip, `check:bundle`, posle K29; sve u budžetu):**

| Ruta | Pre runa (K02) | Sada | Budžet |
|---|---|---|---|
| `/app` | 268,6 KB | 284 KB | 294 |
| `/app/classroom` | 290 | 280 | 315 |
| `/app/community/leaderboard` | 278 | 274 | 303 |
| `/app/members/[username]` | 346 | 349 | 371 |
| `/app/studio` | 541 | 540 | 595 |
| Crea radionica `/studio/(shell)/app` | 465 | 492 | 512 |
| javna početna | 139 | 140 | 153 |

`three`, `@react-three/fiber` i GSAP pluginovi (Flip, DrawSVG, SplitText) su samo u async chunk-ovima. 3D platna
DPR ≤ 1,5, montiraju se tek u kadru, ne crtaju u pozadinskom tabu, na telefonu i uz smanjen pokret ih nema.

**Testovi:** prvo merenje u runu (K02) 288 fajlova / 3.126 testova → sada **321 / 3.633**. Lint: pre runa je padao, sada 0 grešaka (26 zatečenih upozorenja).

## 10. Rezultat provera (K30, 2026-10-14)

| Provera | Rezultat |
|---|---|
| `npm run check:igra` | prošlo — manifest 123/123, u kodu 60 ID-jeva, svi spremni (7 spremnih nekorišćenih, upozorenje) |
| `npm run check:frames` | prošlo — nema duplih punih okvira |
| `npm run typecheck` | prošlo (0 grešaka) |
| `npm run lint` | prošlo — 0 grešaka, 26 zatečenih upozorenja (sva u starim fajlovima) |
| `npm run test` | prošlo — 321 fajl, 3.633 testa |
| snimci K30 | 40 snimaka; 0 slomljenih slika, bez vodoravnog skrola, konzola bez grešaka (samo zatečeno `THREE.Clock` i dev LCP upozorenje izloga) |

`npm run build` i `check:bundle` K30 nije puštao (K30 ne menja kod; poslednji build K29 je prošao, runner ga pušta posle koraka).

## 11. Zatečeno, nađeno usput (nije od runa, nije menjano)

- **Korisnička imena sa tačkom:** `proxy.ts` matcher preskače putanje sa tačkom → `/app/members/nikola.stanic` daje **404** na srpskom, a na `/en/…` 200 bez preusmerenja na prijavu (podaci ne cure, Convex traži prijavu). (K13)
- **Datumi ćirilicom** (`"sr-RS"` → „14. окт") u 18 fajlova, uključujući javni sajt; verovatno treba `sr-Latn-RS`. (K11, K19, K26, K29)
- **`--muted` na `--paper-strong` je 4,48:1** (na ivici); više mesta sa `text-muted/75`, `text-ink/50` ispod 4,5:1 u svetloj temi. Deljen token sa javnim sajtom. (K28)
- **Javni sajt u tamnoj temi:** svetao tekst na žutom (inicijali u zaglavlju, ime plana na ceni). Popravka je jedno pravilo (ukloniti `:has([data-igra-ui])` iz K27 pravila). (K29)
- `--line` u tamnoj temi ≈ 1,5:1 (isprekidani okviri); pitanje zajedničkog tokena. (K27)
- Uz „smanji pokrete" hydration upozorenje na karticama kursa (`whileTap` dodaje `tabindex` na serveru). (K09, K26)
- Plutajuće „na vrh" na 390 px pokriva desni kraj sadržaja iznad donjeg menija. (K26)
- Pilula „Moderator" viri 2 px preko kartice člana. (K26)
- Korisnik koji je završio sve i dalje vidi „Nastavi gde si stao" sa 100 %. (K09)
- `getDashboardOverview` računa mesto na listi koje tabla ne prikazuje (§5 #14).
- Sitnice u tekstu: „1 doprinosa", „Zapratiio/la", „Sledece:" bez kvačica, dve tačke u nazivu Crea trake. (K09, K11, K15)

## 12. Napomene o snimcima K30

- Snimci su iz izloga na `next dev --webpack` (oznaka „N" u levom delu je Next dev indikator, nije deo aplikacije).
- Na `K30-rang-390-*` „ti" red (#11) stoji preko podijuma: to je artefakt snimka cele strane (lepljiv red se snimi na vrhu), u pregledaču stoji na dnu ekrana.
- Dugi delovi (učionica, Crea, admin) su odsečeni; ceo deo vidiš u izlogu.
