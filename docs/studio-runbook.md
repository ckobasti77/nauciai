# Studio runbook — puštanje ljudima

Postupak koji pratim kad puštam Studio (šire nego samo osoblju). Pisano da se
izvrši u 2 ujutru bez razmišljanja — svaka komanda je copy-paste, svaka
provera kaže tačno šta da vidim.

Sve reference su `fajl:linija` u ovom repou, na dan pisanja (2026-09-09).
Kod se menja — ako neka linija ne odgovara, veruj kodu, ne ovom dokumentu.

**Dva odvojena prekidača, ne jedan.** Ovaj runbook pretpostavlja da je Studio
već deployovan i da radi za osoblje (`STUDIO_STAFF_ONLY = true`,
[studioCore.ts:36](../convex/studioCore.ts#L36) — hardkodovana konstanta,
menja se samo kroz deploy, van scope-a ovog dokumenta). "Puštanje" ovde znači:
**upali `studio_public` fleg** — jedini put kojim običan prijavljen korisnik
(bez upisa na kurs) dobija pristup, bez ijednog deploy-a.
**[ODLUKA 1]** Ako si mislio na nešto šire (npr. prvi deploy Studija uopšte,
ili gašenje `STUDIO_STAFF_ONLY`-a), reci — ovaj dokument pokriva samo
flip javnog flega na već živom kodu.

---

## 0. Dva flega — ne mešaj ih

| | `studio_enabled` (kill switch) | `studio_public` (javni pristup) |
|---|---|---|
| Ključ u `platformFlags` | [studioCore.ts:17](../convex/studioCore.ts#L17) | [studioCore.ts:77](../convex/studioCore.ts#L77) |
| Red koji NE POSTOJI znači | **UKLJUČEN** (fail-open — prazan seed ne sme da zaključa osoblje) | **ISKLJUČEN** (fail-closed — svet ne ulazi dok ga ručno ne pustiš) |
| Ko ga menja | Admin ekran, `/app/admin/studio`, dugme "Ugasi Studio" → `studioAdmin.setStudioEnabled` (public `mutation`, `requireAdmin`) — [studioAdmin.ts:221](../convex/studioAdmin.ts#L221) | SAMO CLI: `npx convex run studioAdmin:setStudioPublicFlag` (`internalMutation`, **nema UI** ni za pregled ni za izmenu) — [studioAdmin.ts:264](../convex/studioAdmin.ts#L264) |
| Ko ga čita | `createJobForUser`, prva provera, pre svega ostalog — [studio.ts:592-596](../convex/studio.ts#L592-L596) | `loadStudioPublicState`, čita se PRE `decideStudioAccess` — [studio.ts:422-444](../convex/studio.ts#L422-L444) |

---

## A) PRE PUŠTANJA — provere

### A1. Env promenljive (Convex produkcija)

Proveri sa (samo čita, ne menja ništa):
```bash
npx convex env list --prod
```
**Pre ovoga** proveri da ljuska nema stran `CONVEX_DEPLOY_KEY` (zna da tiho
prevuče `convex env`/`convex deploy` na DRUGI projekat):
```bash
echo "CONVEX_DEPLOY_KEY je podesen: ${CONVEX_DEPLOY_KEY:+DA — STANI I PROVERI}"
```

Stanje na dan pisanja (**vrednosti namerno nisu ispisane ovde** — samo
prisustvo):

- [x] `GOOGLE_AI_API_KEY` — **postavljen**. Google modeli rade uživo.
- [ ] `FAL_KEY` — **NIJE postavljen**. Svi fal modeli su u mock/DEMO režimu za
  osoblje ([studioCore.ts:666-674](../convex/studioCore.ts#L666-L674),
  `providerKeyPresent`), a za JAVNE korisnike su potpuno nedostupni
  (`MODEL_NEDOSTUPAN`, [studio.ts:695-701](../convex/studio.ts#L695-L701) —
  DEMO zaštita, SP2: javni korisnik ne sme da plati SVG mock).
- [ ] `BYTEPLUS_API_KEY` — **NIJE postavljen**. Isto ponašanje kao `FAL_KEY`.
- [ ] `BYTEPLUS_BASE_URL` — **NIJE postavljen**. Oba BytePlus polja su
  OBAVEZNA zajedno i nemaju podrazumevanu vrednost
  ([lib/byteplus.ts:20-39](../lib/byteplus.ts#L20-L39)); pogrešan region ne
  pukne odmah nego vraća 404 koji liči na "model ne postoji".
- [x] `STUDIO_MOCK` — **nije postavljen** (dobro — nije `"1"`, mock nije
  globalno prisilan; [studioCore.ts:670](../convex/studioCore.ts#L670)).
- [x] `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM` — postavljeni (mejl alarmi mogu da
  se pošalju).
- [x] `INITIAL_ADMIN_EMAILS` — postavljen (primaoci alarma i cost-deviation
  mejlova, [adminAlert.ts:25-27](../convex/adminAlert.ts#L25-L27),
  [crons.ts:333](../convex/crons.ts#L333)).
- [x] `SITE_URL` — postavljen (link ka admin panelu u alarm mejlovima,
  [crons.ts:278](../convex/crons.ts#L278)).
- `CONVEX_SITE_URL`, `CONVEX_CLOUD_URL` — **automatski, daje ih platforma**,
  ne pojavljuju se u `env list` i ne treba ih ručno postavljati
  ([convex/_generated/server.d.ts:30-33](../convex/_generated/server.d.ts#L30-L33)).
  Koristi ih `submitFalCatalogJob`/legacy fal put i BytePlus video put da
  sastave `webhookUrl`/`callbackUrl`
  ([studioActions.ts:113-114](../convex/studioActions.ts#L113-L114),
  [byteplus.ts:111-112](../convex/providers/byteplus.ts#L111-L112)) —
  odsutan bi bacio `"CONVEX_SITE_URL nije postavljen"` i posao bi se odmah
  refundirao, ali pošto je platformski, ovo se praktično ne dešava.
- `FAL_REST_BASE_URL`, `GOOGLE_AI_BASE_URL` — opcioni override-i, imaju
  podrazumevane vrednosti, ne treba ih dirati.
- `WEBHOOK_SYNC_SECRET` — postavljen; čuva `seed.ts` mutacije
  ([helpers.ts:379](../convex/helpers.ts#L379)), NIJE potpis fal/BytePlus
  webhook-a (fal koristi Ed25519/JWKS bez env tajne, BytePlus **nema nikakvu
  proveru potpisa** — namerno, videti E tabelu).

**Posledica za lansiranje:** ako pustiš javni pristup DANAS, javni korisnici
mogu da generišu SAMO na Google modelima. fal i BytePlus modeli će im
pisati kao nedostupni (ne mock, ne greška — čisto nedostupni). Osoblje i
dalje vidi fal/BytePlus kao mock/DEMO.
**[ODLUKA 2]** Da li je to prihvatljivo za lansiranje, ili čekaš `FAL_KEY`
i `BYTEPLUS_API_KEY`+`BYTEPLUS_BASE_URL` pre nego što pustiš javnost?

### A2. Webhook adrese

- fal: `POST /fal/webhook` na Convex HTTP ruteru, Ed25519 potpis protiv
  JWKS-a sa `https://rest.fal.ai/.well-known/jwks.json`, keširano 24h.
  Nema ručnog podešavanja — adresa se automatski sastavlja iz
  `CONVEX_SITE_URL` pri svakoj predaji posla.
- BytePlus: `POST /byteplus/webhook`. Ista putanja odgovara i na
  jednokratni `challenge` (mora da odgovori u 3s) i na svaku promenu statusa.
  **Poruke NISU potpisane** — hendler ne veruje telu, nego ponovo pita
  BytePlus status endpoint pre nego što bilo šta upiše.
- Ništa od ovoga ne treba ručno registrovati kod provajdera — oba se šalju
  kao deo `submit`/`create task` poziva, svaki put iznova.

### A3. Cronovi — provera da su registrovani

Convex Dashboard → deployment **quick-yak-270** (produkcija) → Schedules /
Cron Jobs. Očekuj tačno ovih 7 (svi UTC):

| Cron | Raspored | Radi |
|---|---|---|
| `studio: zaglavljeni poslovi` | na 15 min | refundira poslove zaglavljene u `running` >30 min ili `reserved` >5 min |
| `studio: globalni plafon troska` | na 15 min | zbraja dnevni trošak svih korisnika, alarm na 50 $, gasi Studio na 100 $ |
| `studio: google poller` | na 1 min | Google video nema webhook, ovo je jedini način da se posao završi |
| `studio: istek kredita` | 03:15 | istek kreditnih paketa |
| `studio: istek fajlova` | 03:45 | briše izlazne/ulazne fajlove posle retencije |
| `studio: fal rekonsilijacija` | 04:30 | noćno poravnanje stvarne fal cene |
| `oauth: ciscenje isteklih tokena` | 04:20 | čisti istekle MCP OAuth tokene |

Ako neki nedostaje — deploy funkcija nije prošao do kraja, ne puštaj ništa
dok se ne popravi.

### A4. Seed stanje

- `platformFlags`, red `studio_enabled` → mora biti `enabled: true` (ili
  odsutan — isto znače). Proveri u Convex Dashboard → Data → `platformFlags`.
- `platformFlags`, red `studio_public` → očekuj odsutan ili `enabled: false`
  PRE nego što počneš korak B. Ako je već `true`, neko je pre tebe pustio —
  stani i proveri sa Jovanom pre nego što nastaviš.
- **Seed se sme ponovo pokrenuti bez rizika** za `seedInitialContent`,
  `seedCreditPacks`, `seedModelCatalog`, `seedPlatformFlags` — sve su
  upsert-i po slug-u ili no-op kad red već postoji
  ([seed.ts:680-696](../convex/seed.ts#L680-L696) posebno pazi da NE
  prepiše ručno ugašen `studio_enabled` nazad na `true`).
- **`grantDemoCredits` NIJE idempotentan** — svaki poziv dodaje NOVU parcelu
  kredita datom mejlu ([seed.ts:707-737](../convex/seed.ts#L707-L737)).
  Ne pokrećeš ovo kao deo lansiranja osim ako namerno daješ nekome demo
  kredite.

### A5. Dimni test PRE javnog puštanja

Kao osoblje (admin/moderator nalog), napravi JEDNU pravu (ne-mock)
generaciju na modelu za koji ključ postoji (danas: Google) i prati je do
kraja u galeriji. Ovo dokazuje da je ceo lanac (predaja → webhook/poller →
`persistOutput` → poravnanje) živ PRE nego što mu izložiš javnost.

---

## B) PUŠTANJE — koraci

Redosled je namerno **kod pa fleg**: ako ovaj launch nosi bilo kakvu izmenu
u kodu (frontend kopija, novi model, promena limita u kodu), ta izmena mora
biti deployovana i proverena PRE flip-a flega — inače prvi javni korisnik
vidi staru UI poruku dok je pristup već otvoren.

1. **Ako ima code deploy** — pusti ga kroz uobičajeni deploy postupak
   (git push → Vercel; `convex deploy` za backend). **[ODLUKA 3]** Tačna
   komanda/redosled za deploy ovog repoa nije bila predmet ovog istraživanja
   — ako želiš da bude deo runbook-a, reci koju komandu koristiš i dodajem
   je ovde doslovno.
   Uspeh: build zelen na Vercel-u, `npx convex env list --prod` i dalje
   pokazuje očekivane promenljive (deploy ih ne dira).

2. **Odluči limite** — ili prihvati podrazumevane
   ([studioCore.ts:97-102](../convex/studioCore.ts#L97-L102)):
   `maxConcurrentJobs=2`, `maxJobsPerMinute=6`, `maxJobsPerDay=200`,
   `maxDailyCredits=500` (osoblje NIKAD ne prolazi kroz ove — zadržava
   `3` / bez minutnog kapa / `50`/dan / bez kreditnog kapa).
   **[ODLUKA 4]** Ako želiš druge brojeve od starta, reci koje — komanda je:
   ```bash
   npx convex run studioAdmin:setStudioPublicLimit '{"key":"maxJobsPerDay","value":200,"enabled":true}' --prod
   ```
   (ponovi po ključu: `maxConcurrentJobs`, `maxJobsPerMinute`,
   `maxJobsPerDay`, `maxDailyCredits`). Ovo je `internalMutation`, radi bez
   auth-a preko CLI-ja.
   Uspeh: nema izlaza (mutacija vraća `null`); proveri u Data tabu →
   `platformFlags`, red sa odgovarajućim ključem iz
   `STUDIO_PUBLIC_CONFIG_KEYS`.

3. **Flip javnog flega — poslednji korak, ovo je "upali":**
   ```bash
   npx convex run studioAdmin:setStudioPublicFlag '{"enabled":true}' --prod
   ```
   Uspeh: sledeća komanda vraća `true`
   ```bash
   npx convex run studio:isPublicEnabled '{}' --prod
   ```
   (`isPublicEnabled` je javan `query`, bez auth-a — [studio.ts:451-457](../convex/studio.ts#L451-L457) —
   siguran za proveru sa CLI-ja). Alternativa: Convex Dashboard → Data →
   `platformFlags` → red `studio_public` → `enabled: true`.

4. **Frontend ne treba poseban deploy za sam fleg** — Studio widget čita
   `isPublicEnabled`/`getStudioState` reaktivno preko Convex query-ja, pa se
   UI menja čim fleg promeni vrednost, bez rebuild-a.

5. **Otvori `/studio` u anonimnom prozoru** (ne-admin, ne-upisan nalog) i
   potvrdi da se widget otključava i da traži prihvatanje uslova (X7 —
   `acceptedStudioTermsAt`).

---

## C) PRVIH 30 MINUTA — šta gledam

Sve na `/app/admin/studio` (admin ekran, `studioAdmin.getUsageSummary`),
osvežava se na `useQuery`, ne treba ručni refresh.

- **`totalCostUsd`** (današnji, preko SVIH korisnika) — normalno je nisko i
  raste sporo. Ako u prvih 30 minuta pređe **10-15 $**, stani i pogledaj
  `topUsers` PRE nego što stigne do alarma na **50 $** (mejl) ili kill-a na
  **100 $** (Studio se sam gasi).
- **`jobCounts`** po statusu — `failed`/`refunded` naspram `done`. Nagli skok
  odbijenih znači da nešto sistemski puca (loš model, loš region kod
  BytePlus-a) pre nego što je pojedinačan korisnik kriv.
- **`reapedToday`** — koliko je poslova reaper morao da pokupi jer odgovor
  nikad nije stigao. Normalno je 0-1. Rastuće = webhook/poller ne stiže,
  proveri Convex function logs za `/fal/webhook`, `/byteplus/webhook`,
  `providers.google.pollGoogleVideoJobs`.
- **`costCapHeartbeatAt`** — poslednji uspešan prolaz "globalni plafon
  troška" crona (na 15 min). Ako je stariji od ~20-30 min, taj cron ne radi
  — to je AUTOMATSKA zaštita od $100 kill-a koja je trenutno mrtva.
- **`costCapCronFailure`** — ako nije `null`, taj cron je bacio grešku;
  poruka je tačno ono što je palo (Resend, DB, šta god).
- **`getModelCostSummary`** (ista stranica, kartica marže) — `deviationStreak`
  po modelu; niz odstupanja >30% šalje poseban mejl (cost-deviation alarm,
  `adminAlert.sendAdminAlertEmail`) — različit od globalnog dnevnog alarma.
- **`listModerationEvents` / `listPromptLog`** — nagli skok = neko sondira
  blok listu ili je našao bypass koji prolazi.
- **Inbox admin mejlova** (`INITIAL_ADMIN_EMAILS`) — traži naslove vezane za
  globalni plafon, cron_failed, i cost-deviation. Dva odvojena koda šalju
  ove mejlove (`crons.ts` sopstvena kopija za globalni plafon,
  `adminAlert.ts` za sve ostalo) — vidi RUPA 3.

---

## D) KAKO DA GASIM — tri nivoa

Bitno za sva tri: **nijedan od njih ne dira poslove koji su VEĆ u letu.**
Kill switch i javni fleg se čitaju SAMO u `createJobForUser`, na startu
novog posla. Posao koji je već `reserved`/`running` nastavlja normalno —
webhook/poller ga i dalje obrađuje, reaper ga i dalje refundira posle
timeout-a ako zaglavi, poravnanje i dalje ide. Već rezervisani krediti se
NE vraćaju automatski gašenjem — vraćaju se samo ako taj konkretan posao
propadne (refund) ili ako ga reaper pokupi.

### Nivo 1 — ugasi SAMO javni pristup (osoblje i dalje radi)

```bash
npx convex run studioAdmin:setStudioPublicFlag '{"enabled":false}' --prod
```
Provera: `npx convex run studio:isPublicEnabled '{}' --prod` → `false`.
Odmah momentalno vraća `STUDIO_STAFF_ONLY` ponašanje (osoblje + uspavana
formula upisa) — [studioAdmin.ts:256-263](../convex/studioAdmin.ts#L256-L263).

**Ako aplikacija/CLI ne rade** (fallback bez zavisnosti od Next.js-a ili
mreže do CLI-ja): Convex Dashboard → **izaberi produkcijski deployment
(quick-yak-270)** → Data → `platformFlags` → pronađi red `key: "studio_public"`
→ ručno postavi `enabled: false`. Ovo radi čak i ako je ceo sajt dole.

### Nivo 2 — ugasi CEO Studio (i osoblje)

Primarno: Admin ekran → `/app/admin/studio` → kartica "Studio zaštita" →
dugme **"Ugasi Studio"** → potvrda (dvoklik, namerno traži potvrdu pre
gašenja). Odmah — `createJob` počinje da baca `STUDIO_PAUZIRAN` svima.

Fallback (aplikacija dole ili admin nalog nedostupan): Convex Dashboard →
Data → `platformFlags` → red `key: "studio_enabled"` → `enabled: false`.
Ovo zaobilazi i UI i `requireAdmin` proveru u potpunosti — koristi samo kad
admin ekran nije dostupan.

### Nivo 3 — rollback deploy-a

**[RUPA 1]** Convex nema ugrađen "vrati prethodnu verziju" — nema
`convex rollback`. Jedini put je ručno vratiti kod na stariji commit i
ponovo deployovati (`git checkout <dobar-commit> -- convex/` pa deploy).
To vraća PONAŠANJE FUNKCIJA, ali **ne vraća šemu ni podatke** — ako je loš
deploy menjao šemu ili je nešto već upisano u novom obliku, stariji kod
može da padne na tim redovima. Ovaj put nije testiran u ovom repou.
**[ODLUKA 5]** Da li ovaj nivo uopšte treba da bude "korak koji se prati"
u runbook-u, ili ostaje eksplicitno "poslednja mera, ručno, uz nekoga ko
zna šemu"?

Za frontend (Vercel): Vercel Dashboard → projekat **nauciai** → Deployments
→ pronađi poslednji dobar produkcijski deploy → meni **"..."** →
**"Promote to Production"**. Vercel CLI nije instaliran lokalno na ovoj
mašini — ako ga instaliraš (`npm i -g vercel`), alternativa je
`vercel rollback`.

**U svakom slučaju**, Nivo 1 ili Nivo 2 (fleg) je BRŽE i BEZBEDNIJE od
rollback-a i zaustavlja štetu odmah — rollback tek POSLE toga, ako je uzrok
zaista u kodu, ne u trošku/zloupotrebi.

---

## E) ŠTA MOŽE DA PODJE NAOPAKO

| Simptom | Verovatan uzrok | Prva provera | Popravka |
|---|---|---|---|
| Posao stoji u **`running`** duže od 30 min | Webhook/callback nikad nije stigao (mrežni problem, fal/BytePlus outage, JWKS fetch pao pa je fal dobio 500 i ponovo pokušava) | Convex function logs za `/fal/webhook` ili `/byteplus/webhook` oko vremena kreiranja posla | Reaper (`studio: zaglavljeni poslovi`, na 15 min) sam refundira posle 30 min (`ISTEKAO_BEZ_ODGOVORA`). Ako se NI TO ne dešava, proveri da li taj cron uopšte postoji (A3) — **nema svoj heartbeat red**, pa ga admin ekran ne prikazuje kao "mrtav" ni na jedan način (RUPA 6). |
| Posao stoji u **`reserved`** duže od 5 min | `submitJob` akcija nije ni startovala/pukla pre nego što je uhvatila sopstvenu grešku | Convex function logs za `studioActions:submitJob` | Isti reaper, prag 5 min umesto 30. |
| **Webhook ne stiže nikad** (nula pogodaka u logu za taj posao) | Pogrešan/odsutan `CONVEX_SITE_URL` (platformski, retko), fal/BytePlus nema mrežni pristup do ove instance, ili je posao poslat dok je provajder imao outage | Convex logs; probaj ručan `fetch` ka `https://rest.fal.ai/.well-known/jwks.json` sa istog okruženja | Ako je JWKS fetch problem, sačekaj (keš je 24h, fal i dalje šalje 500 dok ne uspe) — posao se refundira reaper-om u međuvremenu. |
| **Provajder vraća grešku** (status `failed`/`ERROR`) | Loš parametar koji je prošao sanitizaciju, iscrpljen kvota kod provajdera, pogrešan `BYTEPLUS_BASE_URL` region (vraća 404 koji liči na "model ne postoji") | `job.error` polje u `generationJobs` (Data tab); `studioAdmin.getProviderSamples` za sirov odgovor provajdera | Auto-refund je već izvršen (`failJob` → `refundCredits`), korisniku ne treba ništa ručno. Ako je sistemsko (svi poslovi JEDNOG modela padaju) — isključi taj model (`isEnabled: false` u `models`/`modelCatalog`) dok se ne reši. |
| **Korisnik naplaćen, nema izlaz** | Generacija je uspela i naplaćena je, ali preuzimanje fajla (`persistOutput`) je palo POSLE `done` statusa | `job.error` na poslu koji je `status: "done"` ali nema `outputStorageId` | **Nema automatskog refunda — namerno** (fal JE naplatio; refund ovde bi bio poklon, ne popravka). `markOutputFailed` samo upisuje grešku, ne diraj kredit sistem. **[RUPA 2 / ODLUKA 6]** Nema ni koda ni gotove admin akcije za ručni refund ovog slučaja — treba odlučiti support politiku (koliko vratiti, gde upisati) pre nego što se prvi ovakav slučaj desi. |
| **Dnevni globalni limit troška probijen** ($100, svi korisnici zajedno) | Nagao saobraćaj ili bug u ceni (potcenjena tarifa) | Admin ekran, `totalCostUsd`; `topUsers` da vidiš da li je jedan nalog ili šira navala | Studio se VEĆ sam ugasio (`platformFlags.studio_enabled = false`, automatski). To je očekivano ponašanje sistema koji se štiti, ne kvar. Istraži uzrok, PA ručno vrati fleg preko admin ekrana (Nivo 2, obrnuto) tek kad je uzrok rešen. Nema posebnog "kill" reda u bazi — samo fleg + mejl (RUPA 4). |
| **MCP ključ troši previše** | MCP write-scope limiter (`create_generation`, 10 poziva/min) živi **u memoriji procesa, po Convex izolatu** — to je prigušivač, ne prava brava; stvarna granica može biti umnožak od 10/min ako Convex podigne više izolata ([mcp/rateLimit.ts:13-19](../convex/mcp/rateLimit.ts#L13-L19)) | Admin ekran, `topUsers` — traži nalog vezan za taj MCP ključ | Prave brave su iste kao za web: `MINUTNI_LIMIT`/`PREVISE_POSLOVA`/`DNEVNI_LIMIT`/`DNEVNI_LIMIT_KREDITA`/`DNEVNI_LIMIT_TROSKA` u `createJobForUser` važe IDENTIČNO za MCP pozive (isto telo funkcije, [studio.ts:886-910](../convex/studio.ts#L886-L910)) — jedini izuzetak je OSOBLJE, koje nema minutni ni kreditni kap. Ako je nalog vezan za MCP ključ osoblje, opozovi/rotiraj taj ključ. |

---

## F) BROJEVI NAPAMET

Svi iz [studioCore.ts](../convex/studioCore.ts), osim gde je drugačije
naznačeno.

**Po korisniku (osoblje — isto važi i za javne, gde nije drugačije rečeno):**
- `MAX_ACTIVE_JOBS = 3` — najviše `reserved`+`running` istovremeno. Probijeno
  → `PREVISE_POSLOVA`.
- `MAX_DAILY_GENERATIONS = 50` — dnevni broj generacija (osoblje/legacy).
  Probijeno → `DNEVNI_LIMIT`.
- `MAX_DAILY_COST_USD = 5` — dnevni STVARNI trošak po korisniku, u dolarima
  (veleprodajno). Probijeno → `DNEVNI_LIMIT_TROSKA`.
- `MAX_UNSETTLED_COST_USD = 3` — koliko procenjenog troška sme da stoji
  NEPORAVNATO (poslovi u letu). Probijeno → `PREVISE_NEPORAVNATOG`.

**Javni korisnici (kad je `studio_public` upaljen), podrazumevano — svaki
override-ljiv preko `setStudioPublicLimit`:**
- `maxConcurrentJobs = 2`
- `maxJobsPerMinute = 6` → probijeno: `MINUTNI_LIMIT`
- `maxJobsPerDay = 200` → probijeno: `DNEVNI_LIMIT`
- `maxDailyCredits = 500` (≈5 €) → probijeno: `DNEVNI_LIMIT_KREDITA`

**Globalno (svi korisnici zajedno, dnevno):**
- `GLOBAL_DAILY_ALARM_USD = 50` — šalje mejl, jednom dnevno.
- `GLOBAL_DAILY_KILL_USD = 100` — gasi `studio_enabled` automatski.

**Vremena:**
- Reaper: `running` stuck posle **30 min**, `reserved` posle **5 min**;
  cron na svakih **15 min**.
- Globalni plafon troška: cron na svakih **15 min**.
- Google poller: na svakog **1 min** (nema webhook).
- Heartbeat crona za globalni plafon: admin ekran ga crveni posle **60 min**
  bez uspešnog prolaza (`HEARTBEAT_STALE_MS`).
- Retencija izlaza: slika/zvuk **90 dana**, video **30 dana**
  (`OUTPUT_RETENTION_DAYS`) — red u bazi ostaje zauvek, briše se samo fajl.
- Nevezan ulazni upload ističe za **24h**; dozvola za upload (grant) za **1h**.
- Merenje ulaznog fajla: najviše **30/h** po korisniku, odustaje posle **3**
  uzastopna neuspešna merenja istog fajla.

**MCP (meki prigušivač, ne prava brava — videti E tabelu):**
- `mcp:read` — 60 zahteva/min po ključu.
- `mcp:write` — 10 poziva/min po ključu (npr. `create_generation`).

**Ostalo:**
- Mock/DEMO uspešnost: **85%** (namerno <100%, da se vidi da refund radi).
- Marža ispod koje admin ekran boji upozorenje: **2×** nabavne cene.

---

## ZAVRŠNI BLOK

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
