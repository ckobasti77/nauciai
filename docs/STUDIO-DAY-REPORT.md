# Studio - revizija dnevnog run-a (19.08.2026, 15:15-15:40)

Ovo nije nastavak implementacije. Ovo je nezavisna provera svega što je danas
napisano (koraci P1-P10), sa istim ciljem kao noćni izveštaj: da znaš gde je
tanko **pre** nego što naplatiš prvi evro.

Metod: ponovo su puštene sve četiri verifikacione komande, pročitane su sekcije
P1-P10 u `docs/STUDIO-PROGRESS.md`, sekcija RIZICI PO NOVAC iz
`docs/STUDIO-NIGHT-REPORT.md`, i **ponovo je pročitan sav kod** - nije se
verovalo dnevniku na reč. Konkretno: `convex/studio.ts`, `convex/studioCore.ts`,
`convex/studioActions.ts`, `convex/crons.ts`, `convex/credits.ts`,
`convex/creditsCore.ts`, `convex/studioAdmin.ts`, `convex/modelCatalog.ts`,
`convex/creditPacks.ts`, `convex/seed.ts`, `app/api/stripe/webhook/route.ts`,
`app/api/stripe/plan/route.ts`, `app/api/stripe/credits/route.ts`, sve četiri
nove stranice i njihove komponente, i `lib/studio-*.ts`.

---

## STANJE

### Verifikacija, pokrenuta ponovo nad zatečenim stanjem grane

| Komanda | Ishod | Tačan izlaz |
|---|---|---|
| `npx convex codegen` | **prošlo** | `Finding component definitions... / Generating server code... / Bundling component definitions... / Bundling component schemas and implementations... / Downloading current deployment state... / Uploading functions to Convex... / Generating TypeScript bindings... / Running TypeScript...` (exit 0) |
| `npm run lint` | **prošlo** | `✖ 7 problems (0 errors, 7 warnings)` - svih 7 su zatečena upozorenja u `admin-inline-actions.tsx` (3), `dashboard-content.tsx` (2) i `public-course-intro-video.tsx` (2); nijedno iz Studio koda |
| `npm run test` | **prošlo** | `Test Files 41 passed (41) / Tests 394 passed (394) / Duration 6.13s` - na podrazumevanom timeout-u, bez `--testTimeout` |
| `npm run build` | **prošlo** | `✓ Compiled successfully in 8.5s`, `Finished TypeScript in 16.3s`, `Generating static pages (60/60)`; u tabeli ruta stoje sve nove: `/[locale]/app/studio`, `/[locale]/app/studio/gallery`, `/[locale]/app/credits`, `/[locale]/app/admin/studio`, `/api/stripe/plan` |

Sve četiri prolaze čisto.

**O stabilnosti test suite-a, precizno:** pušteno je **sedam** punih prolaza.
**Šest** je dalo 394/394. **Jedan** je dao `Tests 1 failed | 393 passed (394)`,
i to je bio jedini prolaz koji je išao **paralelno sa `npm run lint`-om** na
istoj mašini. Ime tog testa nije uhvaćeno (izlaz je bio odsečen na sažetak), pa
ga **ne pripisujem** `convex/chat.test.ts`-u iako je on jedini koji su P1-P3 i
P8-P10 beležili kao flaky pod opterećenjem - to bi bila pretpostavka, ne nalaz.
Namerni pokušaj reprodukcije (suite pušten uz `npm run lint` u pozadini) nije
oborio nijedan test.

Šta iz toga sledi: **suite je zelen, ali nije dokazano determinističan pod
opterećenjem.** Pre nego što ovo ode u CI (gde paralelno opterećenje jeste
pravilo, a ne izuzetak), vredi jedan prolaz sa `--reporter=verbose` snimljen u
fajl, da se ime uhvati prvi put kad padne. Dok se to ne desi, tvrdnja "394/394"
važi za lokalnu mašinu bez konkurentnog posla.

### Grana i obim

`feat/studio-faza-a`, i dalje **12 commit-ova iznad `main`** - poslednji je
`c351c2f studio(RV): Zavrsni review i izvestaj`, dakle **iz noći.**

> **Ceo današnji rad (P1-P10) je NEKOMITOVAN.** 23 izmenjena praćena fajla
> (+4183 / -201) i 25 novih produkcijskih putanja (~5433 linije) stoje u radnom
> stablu. Jedan `git checkout .` briše ceo dan. Ovo je prva stavka u
> "PREOSTALO", i nije stilska.

Testova: noć je završila na 208, dan završava na **394** (+186).

---

## ZATVORENE RUPE

Ocene: 🟢 zatvoreno i pokriveno testom · 🟡 delimično · 🔴 i dalje otvoreno.

### Šest rupa iz P1

**1. Validacija `params` prema `paramSchema` - rizik (f)** · 🟡 **delimično**

Zatvoreno: `sanitizeParams` (`convex/studioCore.ts:172-231`) je jedina kapija
između klijenta i fal-a. Nepoznat ključ tiho ispada, broj se odseca na
`min`/`max`, preko `max × 10` se odbija (`VAN_OPSEGA`), `select` van skupa se
odbija, vrednost pogrešnog tipa ispada. `createJob` upisuje **očišćen** objekat
(`studio.ts:139`) i cenu računa iz njega, pa `submitJob`
(`studioActions.ts:71-74`) šalje fal-u tačno ono po čemu je naplaćeno.
Rezolucija je prebačena u `defaultParams` skupljeg sluga
(`seed.ts:512-519`) i nije u `paramSchema`, pa `nano-banana-2` više ne može da
odglumi `nano-banana-2-2k` - provereno u kodu, `defaultParams` se u `submitJob`
spread-uje prvi, a `job.params` `resolution` ne može ni da sadrži.

Testovi: `sanitizeParams odseca broj na min/max iz šeme` ·
`... odbija broj koji je van reda veličine, umesto da ga odseče` ·
`... tiho izbacuje ključ koji šema ne poznaje` ·
`... propušta select samo iz dozvoljenog skupa` ·
`createJob upisuje očišćene parametre - to je isto ono što ide fal-u` ·
`createJob odbija nedozvoljen select pre nego što skine ijedan kredit` · plus
round-trip test u `lib/studio-form.test.ts` koji tvrdi da sve što forma pošalje
`sanitizeParams` vrati nepromenjeno.

**Zašto samo delimično:** noćni izveštaj je pod (f) imenovao `num_images` kao
konkretan mehanizam gubitka. P1 ga je **ograničio na 4, ali ga nije naplatio.**
Cena je i dalje fiksna po pozivu. Detaljno u NOVE RUPE / N1 - to je danas
najveća otvorena stavka u celom izveštaju.

**2. `submitJob` i `markJobRunning` gledaju status - rizik (b)** · 🟢

`submitJob` izlazi bez ijednog dejstva ako posao nije `reserved`
(`studioActions.ts:47`). `markJobRunning` odbija svaki prelaz koji ne kreće iz
`reserved` (`studio.ts:169`) sa `POSAO_NIJE_REZERVISAN:<status>`. To je tačno
zid koji reaper iz P2 traži: zakasnela predaja ne može da vrati refundiran posao
u `running`.

Testovi: `submitJob ne šalje ništa kad posao više nije reserved` ·
`submitJob ne dira refundiran posao - ni novom predajom ni drugim refundom` ·
`markJobRunning odbija prelaz kad posao nije reserved` ·
`markJobRunning odbija i drugi poziv za isti posao`.

**3. Webhook baca umesto da ćuti - rizik (d1)** · 🟡 **delimično**

Zatvoreno za **kredite**: `applyStripeGrants`
(`app/api/stripe/webhook/route.ts:72-95`) loguje `event.id` i tip pa **baca**;
`grantInvoiceCredits` isto (`:146-153`); svaka greška iz `applyStripeGrant`
se loguje pa propagira; `POST` ima `try/catch` koji vraća 500 sa logom
(`:214-221`). Stripe ponavlja, a ponavljanje je bezbedno jer je grant
idempotentan.

Testovi (`app/api/stripe/webhook/route.test.ts`):
`missing Convex client answers 500 so Stripe retries instead of dropping the grant` ·
`missing WEBHOOK_SYNC_SECRET answers 500 instead of a silent 200` ·
`a grant rejected by Convex answers 500 - the retry is safe because grants are idempotent`.
Uz to je `vitest.config.ts` proširen na `app/**/*.test.ts` - bez toga ova tri
testa ne bi ni radila.

**Zašto samo delimično:** `syncSubscription` (`route.ts:27-30`) i dalje ima
`if (!convex || !process.env.WEBHOOK_SYNC_SECRET) return;` - tiho, sa 200.
Isti oblik rupe, samo za pretplate na kurseve. Pravila dana zabranjuju menjanje
postojećeg subscription flow-a, pa je izostavljanje formalno ispravno, ali rupa
postoji i posle današnjeg rada. Vidi N4.

**4. `payment_status` se proverava - rizik (d2)** · 🟢

`grantCreditPackCredits` (`route.ts:105-114`) izlazi sa logom kad
`payment_status !== "paid"` i vraća `true` (dakle ne propada u subscription
granu). Dodati su `checkout.session.async_payment_succeeded` (dodeljuje) i
`checkout.session.async_payment_failed` (samo log).

Testovi: `unpaid credit pack session grants nothing - deferred payments settle later` ·
`async_payment_succeeded grants the credits the deferred payment waited for` ·
`async_payment_failed grants nothing and only logs`.

**5. Welcome bonus po korisniku, ne po pretplati - rizik (d3)** · 🟢

Ključ je `welcomeBonusKey(userId)` = `welcome:<userId>`
(`creditsCore.ts:271-277`), dakle nezavisan od `invoice.id`. Drugi sloj je u
`grantCredits` (`credits.ts:182-191`): pre inserta se preko novog indeksa
`by_user_source` traži postojeći `welcome_bonus` lot, pa se hvataju i lotovi
otvoreni starim ključem. Otkaži-pa-se-pretplati petlja daje 150 kredita ukupno.

Testovi: `subscription_create faktura dodeli dozu plana I welcome bonus, oba
nezavisno idempotentna` (tvrdi izričito da je ključ bonusa `welcomeBonusKey(userId)`,
a doze `invoice.id`) · `obnova pretplate dodeli SAMO dozu plana, bez welcome
bonusa` · `bonus se ne dodeljuje drugi put ni kad lot nosi stari ključ po fakturi`.

Sitna napomena: test ne pušta doslovno **drugu** `subscription_create` fakturu
sa drugim `invoice.id`-jem, nego tvrdi oblik ključa. Pošto ključ bonusa uopšte
ne zavisi od fakture, druga faktura proizvodi identičan grant objekat, pa je
zaključak isti - a drugi sloj (`by_user_source`) drži i bez toga.

**6. Dnevni limit troška - plan 4.4** · 🟡 **delimično**

`MAX_DAILY_COST_USD = 5` i `exceedsDailyCostLimit` (`studioCore.ts:118-126`,
poređenje u centima da `0.1+0.2` ne obori prag), čita se u `createJob`
(`studio.ts:114-117`) i baca `DNEVNI_LIMIT_TROSKA`.

Testovi: `dnevni limit troška odbija posao koji bi prešao 5 USD tog dana` ·
`dnevni limit troška je vezan za dan`.

**Zašto samo delimično, dva razloga:**
- Limit sabira `model.estimatedCostUsd` **po pozivu**, a ne po slici. Uz
  `num_images: 4` stvarni fal trošak je četvorostruk, pa plafon od 5 $ u praksi
  propušta do 20 $ po korisniku dnevno. Vidi N1.
- **Globalni plafon (alarm na 50 $, kill switch na 100 $) i dalje ne postoji.**
  Provereno grep-om: `MAX_DAILY_COST_USD` je jedina konstanta te vrste u celom
  `convex/`. P8 je dao admin ekran koji **prikazuje** današnji ukupan trošak i
  ručni kill switch - to je pregled, ne zaštita. Ako se 30 korisnika pojavi u
  isto vreme dok spavaš, ništa ih ne zaustavlja na 100 $.

**Otvrdnjavanje (nosivi zid):** 🟢 `applySpend` je sada obična funkcija
(`credits.ts:242-286`) koju `createJob` zove direktno u svojoj transakciji;
`spendCredits` je ostao kao tanak omotač. Atomičnost više ne visi o tome što
oko poziva slučajno nema `try/catch`. Mutaciono testiranje iz P1 to i dokazuje:
`try/catch` koji grešku proguta obara test.

### Tri crona iz P2

**`reapStuckJobs`** · 🟢 - `crons.interval("studio: zaglavljeni poslovi",
{ minutes: 15 })`, ide preko indeksa `by_status_created` koji je od A1 stajao
neupotrebljen. `running` stariji od 30 min i `reserved` stariji od 5 min idu u
`internal.studio.failJob` sa `ISTEKAO_BEZ_ODGOVORA`. Budžet od 100 poslova je
deljen za ceo prolaz (jedna transakcija), a refund pojedinačnog posla je u
`try/catch` - i to je ovde ispravno, jer poslovi jedni s drugima nemaju veze.

Testovi (`convex/crons.test.ts`): `running star 31 minut se refundira sa porukom
ISTEKAO_BEZ_ODGOVORA` · `reserved star 6 minuta se refundira, star 4 minuta ne` ·
`reaper pušten dvaput refundira samo jednom` · plus dva testa da se `done` posao
i posao mladji od praga ne diraju.

**`expireCredits`** · 🟢 - `crons.cron("studio: istek kredita", "15 3 * * *")`.
`applyLotExpiry` (`credits.ts:294-317`) gasi lot, upisuje `expiry` transakciju
sa negativnim iznosom **i smanjuje keširan balans** - taj poslednji korak drži
invarijantu. `lifetimeSpent` se namerno ne diče (istekli krediti nisu potrošeni
nego propali). Već ugašeni lotovi se odbacuju `filter`-om pre `take`-a, inače bi
posle prve godine prolaz trošio ceo budžet na nule.

Testovi: `lot koji je istekao juče se gasi, balans padne, expiry red je upisan` ·
`invarijanta posle isteka: balans === zbir potrošivih lotova === zbir transakcija` ·
plus dva testa za lot koji nije zastareo i za već ugašen lot.

**`expireGenerationFiles`** · 🟡 - `crons.cron("studio: istek fajlova",
"45 3 * * *")`. Briše fajl i poster iz storage-a, prazni oba polja, **red
ostavlja** (prompt i model nose "Generiši ponovo"). Donja granica
`gt("expiresAt", 0)` je obavezna i postoji - bez nje bi poslovi bez roka stajali
u indeksu ispod svakog broja i svi bili pokupljeni.

Testovi: `istekao fajl se briše iz storage-a, red i metapodaci ostaju` · plus
tri za prazan skup, posao bez roka i posao kome rok tek ističe.

**Zašto samo delimično:** cron ne dira `labOutputs.storageId`. Vidi N5.

### Ponovni prolaz kroz listu a-f iz noćnog izveštaja

| # | Rizik | Bilo noćas | Danas | Šta je promenilo status |
|---|---|---|---|---|
| a | rezervacija bez posla | 🟢 u transakciji · 🔴 posle commit-a | **🟢** | reaper (P2) hvata i `reserved` star 5 min i `running` star 30 min; `applySpend` kao obična funkcija čini atomičnost strukturnom |
| b | posao bez rezervacije | 🟢 na ulazu · 🔴 na ponovnom slanju | **🟢** | status-provere u `submitJob` i `markJobRunning` (P1), 4 testa |
| c | dupli refund | 🟢 dvoslojno | **🟢 · 🟡 istek** | mehanizam nedirаn i i dalje najbolje pokriven. Tanko mesto ostaje: refund otvara **nov** lot sa **novih 12 meseci** (`credits.ts:352-360`), pa korisnik koji obara poslove produžava rok svojim kreditima. Nije dirano danas. |
| d | dupla dodela na Stripe retry-ju | 🟢 mehanizam · 🔴 d1-d5 | **🟡** | d1 zatvoren za kredite, otvoren za pretplate (N4) · d2 🟢 · d3 🟢 · d4 (clawback) 🔴 nedirano · d5 (`applyStripeGrant` javna, samo `WEBHOOK_SYNC_SECRET`) 🔴 nedirano, ostaje ručna rotacija |
| e | posao zauvek u `running` | 🔴 reaper ne postoji | **🟢** | `reapStuckJobs`, 5 testova. Uz to `getStudioState` sada UI-ju kaže koliko poslova je u letu, pa korisnik vidi zašto mu je dugme ugašeno. |
| f | lažna cena | 🟢 cena · 🔴 `params`, nema USD limita | **🟡** | `sanitizeParams` + rezolucija u `defaultParams` (🟢) · dnevni USD limit postoji ali broji po pozivu, ne po slici (🟡) · **`num_images` ograničen ali ne naplaćen (🔴, N1)** · globalni plafon i dalje ne postoji (🔴) |

**Sažetak:** od šest noćnih rizika, tri su danas stvarno zatvorena (a, b, e),
jedan je i dalje najčvršći deo koda (c, uz poznato tanko mesto), a dva su
delimična (d, f). Rupa koju je noćni izveštaj proglasio najskupljom -
`num_images` - **nije zatvorena, nego ograničena.**

---

## NOVE RUPE

### N1. 🔴 `num_images` - cena je po pozivu, fal naplaćuje po slici

**Ovo je najveća otvorena stavka dana i nije napad - to je podrazumevano
ponašanje proizvoda.**

`IMAGE_PARAM_SCHEMA` (`seed.ts:497-508`) izlaže `num_images` sa `min: 1, max: 4`.
`lib/studio-form.ts` iz šeme gradi number input, `components/app/studio-page.tsx:190-210`
ga renderuje kao polje "Broj slika". `computeCreditCost` (`studioCore.ts:82-92`)
vraća **fiksan** `model.creditCost` bez obzira na `num_images`, a
`studioUsageDaily.costUsd` raste za **flat** `model.estimatedCostUsd`
(`studio.ts:150,157`).

Marža po modelu (100 kr = 1 €, 1 $ = 0,865 € iz plana §2.3), za uključene
modele:

| Model | kr | $ /slika | marža N=1 | N=2 | N=3 | N=4 |
|---|---|---|---|---|---|---|
| flux-2-flash | 3 | 0,005 | 6,94x | 3,47x | 2,31x | 1,73x |
| flux-2-pro | 7 | 0,03 | 2,70x | 1,35x | **0,90x** | **0,67x** |
| seedream-45 | 10 | 0,04 | 2,89x | 1,45x | **0,96x** | **0,72x** |
| nano-banana-2 | 20 | 0,08 | 2,89x | 1,45x | **0,96x** | **0,72x** |
| nano-banana-2-2k | 30 | 0,12 | 2,89x | 1,45x | **0,96x** | **0,72x** |
| nano-banana-pro | 35 | 0,15 | 2,70x | 1,35x | **0,90x** | **0,67x** |
| nano-banana-pro-4k | 65 | 0,30 | 2,50x | 1,25x | **0,83x** | **0,63x** |
| gpt-image-15 | 30 | 0,133 | 2,61x | 1,30x | **0,87x** | **0,65x** |

**Gubitak počinje na `num_images: 3`** za sedam od osam uključenih modela, i to
kroz normalnu formu, jednim klikom na strelicu gore. Ne treba `curl`.

Dnevni plafon ne pomaže jer broji pogrešnu stvar:
- `nano-banana-2`: plafon od 50 generacija se dostigne pre plafona od 5 $
  (50 × 0,08 = 4,00 $ obračunato). Stvarni fal trošak sa `num_images: 4`:
  **16,00 $**. Naplaćeno: 1000 kr = 10 € ≈ 11,56 $. **Neto minus ≈ 4,44 $ po
  korisniku dnevno.**
- `nano-banana-pro-4k`: plafon od 5 $ staje na 16 generacija (4,80 $
  obračunato). Stvarni trošak: **19,20 $**. Naplaćeno: 1040 kr = 10,40 € ≈
  12,02 $. **Neto minus ≈ 7,18 $ po korisniku dnevno.**

Drugim rečima: **plafon od 5 $ je u stvarnosti plafon od 20 $.**

**Uslov pod kojim ovo važi:** da fal naplaćuje po izlaznoj slici, a ne po
zahtevu. Cene iz plana §2.3 su po slici (`nano-banana-2` = 0,08 $/slika), pa je
to i konzervativna pretpostavka - ali **nije provereno** protiv živog fal API-ja
(pravila dana to zabranjuju). Ako fal naplaćuje po zahtevu bez obzira na
`num_images`, ove rupe nema.

Popravka, koja god od tri:
1. `computeCreditCost` množi sa `num_images` (i UI cena na dugmetu se sama
   pomera - `generateButtonLabel` već prima broj);
2. ili `num_images` ispada iz `paramSchema` i pinuje se na 1 u `defaultParams`,
   isto kao `resolution`;
3. ili `max: 1` u šemi.

Najmanja je (2) - jedan red u `seed.ts`, ista tehnika koja je već primenjena na
rezoluciju, i nula izmena u ceni. **Preporuka: uradi (2) danas, (1) kad
potvrdiš fal-ov model naplate.**

### N2. 🔴 `modelCatalog.listModels` je javan upit i vraća ceo red

`convex/modelCatalog.ts:17-25`: nema `requireUserId`, nema `.map` projekcije -
vraća `falEndpoint`, `estimatedCostUsd`, `costPerSecond`, `defaultParams`
(uključujući pinovanu rezoluciju), `provider`, sve. `NEXT_PUBLIC_CONVEX_URL` je
po definiciji javan (u browser bundle-u), pa ovo može da pročita bilo ko sa
interneta, bez naloga.

To je doslovno tvoja kalkulacija marže. Konkurent vidi koje endpointe voziš i po
kojoj nabavnoj ceni; napadač iz N1 vidi tačno koji slug ima najgori odnos
`creditCost / estimatedCostUsd` (`nano-banana-pro-4k`) i cilja baš njega.

Susedni `creditPacks.listPacks` (`creditPacks.ts:14-33`) je **pažljivo**
`.map`-projektovan. `listModels` nije - i to je nedoslednost unutar istog
noćnog koraka (A7), ne odluka.

**Danas je postala dostižna:** do jutros `listModels` nije imao nijednog
pozivaoca. Sada ga zovu tri klijentske stranice (`studio-page.tsx:356`,
`credits-page.tsx:125`, `studio-gallery-page.tsx:258`), pa red stoji u Network
tabu svakog posetioca.

Popravka: `.map` projekcija koja vraća samo `slug, kind, labelSr/En,
descriptionSr/En, creditCost, badge, paramSchema, defaultParams, sortOrder`.
Admin varijanta `listAllModels` već postoji i već je iza provere uloge, pa admin
ekran ne gubi ništa.

### N3. 🔴 Nijedna grana ne proverava koliko je STVARNO naplaćeno

`invoicePaidGrants` (`creditsCore.ts:246-279`) ne gleda `invoice.amount_paid`.
`grantCreditPackCredits` gleda `payment_status === "paid"`, ali kupon od 100%
proizvodi sesiju koja je uredno `paid` na 0 €. Uz to je
`allow_promotion_codes: true` na **obe** sesije (`lib/stripe.ts:89` za pakete,
`:118` za planove).

Posledica:
- Kupon od 100% na paket → pun broj kredita za 0 €. Jednokratno po sesiji, ali
  kupon koji nije `max_redemptions: 1` radi to svakome ko ga zna.
- Kupon od 100% **forever** na Premium → `invoice.paid` sa
  `billing_reason: subscription_cycle` svakog meseca, svaki sa novim
  `invoice.id`, dakle **2000 kredita mesečno, neograničeno.** Welcome bonus je
  P1 zatvorio (jednom po korisniku), mesečnu dozu nije - a doza je ta koja se
  ponavlja.

Ovo je noćni izveštaj naslutio pod d3, ali samo kroz bonus. Doza je veći deo
iznosa i ostala je nedirnuta. Rupa je danas prvi put **dostižna kroz aplikaciju**,
jer je `/api/stripe/plan` (P5) ono što uopšte omogućava kupovinu Premiuma.

Popravka, jedno od dvoje: `allow_promotion_codes: false` na obe sesije dok ne
postoji kuponska politika, **ili** uslov `invoice.amount_paid > 0` u
`invoicePaidGrants` i `session.amount_total > 0` u `grantCreditPackCredits`.
Prvo je jedan red i ništa ne gubiš dok nemaš kampanju.

### N4. 🟡 `syncSubscription` i dalje ćuti kad ne može da upiše

`app/api/stripe/webhook/route.ts:27-30` - isti oblik koji je P1 popravio za
kredite, ostao za pretplate na kurseve. Ako fali `NEXT_PUBLIC_CONVEX_URL` ili
`WEBHOOK_SYNC_SECRET`, funkcija se tiho vrati, ruta odgovori 200, Stripe nikad
ne ponovi, a upis u `enrollments` se ne desi. Naplaćeno, nedostavljeno, bez loga.

Pravila dana zabranjuju menjanje postojećeg subscription flow-a, pa je P1
ispravno stao - ali to je odluka o **obimu**, ne zatvorena rupa. Kad se bude
dirala, popravka je identična onoj iz P1 (log + `throw`), i bezbedna je jer je
`syncStripeSubscription` idempotentna po `stripeSubscriptionId`.

### N5. 🟡 Istekao izlaz iz lekcije ostavlja `labOutputs.storageId` da pokazuje u prazno

`crons.expireGenerationFiles` prazni `outputStorageId` na **poslu**, ali
`labOutputs` red (koji `finalizeOutput` puni **istim** `storageId`-jem,
`studio.ts:225`) ostaje netaknut. Posle 90 dana (30 za video) output pane u
lekciji dobija `storageId` bez fajla → `ctx.storage.getUrl` vraća `null` →
prazna kartica bez objašnjenja, a `taskProgress.evidenceOutputId` i dalje
zeleni zadatak dokazom kojeg nema.

P3 je ovo zabeležio kao otvorenu proizvodnu odluku, P7 je s druge strane
`deleteJob`-u zabranio brisanje takvog posla baš da dokaz ne nestane - dakle
ručno brisanje je zaštićeno, a cron radi tačno ono što je ručno zabranjeno.
Ta nedoslednost je sama po sebi znak da odluka nije donesena, nego odložena.

Prva pojava je za 90 dana od prve generacije u lekciji, pa ne blokira lansiranje
- ali odluku (nestati ili ostati sa porukom "fajl je istekao") treba doneti pre
nego što je neko primeti u produkciji.

### N6. 🟡 Reaper refundira posao za koji fal može još da naplati

Reaper u 30 minuta prebaci `running` u `refunded`. Ako fal isporuči u 35.
minutu, webhook stigne, `applyWebhookResult` vidi `status !== "running"` i
izadje bez dejstva (ispravno) - ali fal je **već naplatio**, a korisnik je
**već dobio refund**. Plaćeno dvaput, ništa isporučeno.

To je svesna cena reaper-a i bolja je od poslova koji vise zauvek. Problem je
što se **nigde ne broji**: nema metrike, nema alarma, `reaped` postoji samo u
povratnoj vrednosti poziva. Ako fal počne sistematski da kasni preko 30 minuta
(ili JWKS rotacija iz noćne tačke e3 obori verifikaciju), gubitak je tih i
konstantan, a prvo mesto gde bi se video je fal račun na kraju meseca.

Minimum pre lansiranja: gledaj `reaped` u Convex logovima prvih nedelju dana.
Vrednost veća od nule je signal, ne rutina.

### N7. 🟡 Moderacija je sad prvi put dostižna - i ima dve poznate greške

Do jutros niko nije mogao da otkuca prompt (nije bilo UI-ja). Od danas može,
pa dve stavke iz noćnog ručnog koraka 10 prestaju da budu teoretske:

- **`nude` je i srpski oblik glagola "nuditi".** `BLOCKED_TERMS`
  (`creditsCore.ts:105`) se poredi od početka reči
  (`normalized.includes(" " + term)`), pa prompt "ljudi koji nude pomoć" dobija
  `ZABRANJEN_POJAM`. Prvi lažno odbijen prompt je i prvi tiket podršci.
- **Ćirilica prolazi moderaciju bez ijedne provere.** `normalizeForModeration`
  (`creditsCore.ts:157-165`) radi `replace(/[^a-z0-9]+/g, " ")` posle NFD
  normalizacije - ćirilični znaci nisu `a-z`, pa se ceo prompt svede na prazan
  string i nijedan pojam ne pogodi. Prompt na ćirilici može da traži bilo šta.

Nijedno nije dirano danas (nije bilo u obimu P1-P10) i nijedno neće oboriti
test ako ga popraviš.

### N8. 🔴 Stranica kredita prodaje bez 18+ checkbox-a i bez uslova korišćenja

Grep kroz `app/`, `components/`, `convex/`, `lib/`: nema `/uslovi-studio`
stranice, nema checkbox-a "18+ i prihvatam uslove", nema polja u bazi u koje bi
se pristanak upisao sa timestampom. Plan 3.3 i ručni korak 12 iz noćnog
izveštaja oba to traže **pre** prvog naplaćenog evra, a ToS §2 te na to
obavezuje.

`/app/credits` je danas potpuno funkcionalna prodajna stranica - čim upišeš
`stripePriceId`, dugmad se pale i naplata radi. Ovo je jedina stavka u izveštaju
koja nije tehnička nego pravna, i jedina koju ne može da zatvori nijedan prompt.

### N9. 🔴 Ceo dan je nekomitovan

Vidi "Grana i obim". `git log main..HEAD` završava na noćnom `c351c2f`.

### N10. 🟡 `.studio-run/` i `run-studio-day.ps1` nisu u `.gitignore`

Prvi `git add -A` uvlači 47 log/prompt fajlova i dva PowerShell skripta u
istoriju grane. Nije šteta po novac, jeste po diff koji ćeš gledati kad budeš
pravio PR.

### N11. 🟢 Sitno, ali vredi znati

`CheckoutAction.startCheckout` (`components/app/credits-page.tsx:66-86`) nema
`try/catch` oko `fetch`-a. Mrežni pad ostavlja dugme u `isPending` zauvek i
baca neuhvaćen promise. Ne gubi novac, ali izgleda kao da je kupovina pukla.

### Šta je provereno i NIJE rupa

RV2 imenuje četiri konkretne sumnje. Sve četiri su proverene u kodu:

- **Da li neki query vraća tudje poslove?** Ne. `listMyJobs`
  (`studio.ts:288-297`) ide isključivo preko `by_user` indeksa sa `requireUserId`;
  filteri su dodatni predikati, ne zamena za indeks. `deleteJob` proverava
  `job.userId !== userId` **pre** svega ostalog. `getStudioState`, `getBalance`,
  `getLots`, `getTransactions` - svi `by_user`. Pokriveno testovima
  `listMyJobs vraća samo poslove prijavljenog korisnika` i `deleteJob odbija
  tudji posao i nepostojeći posao`.
- **Da li admin ekran proverava ulogu na serveru?** Da, na oba sloja.
  `app/[locale]/app/admin/studio/page.tsx:17-19` je server komponenta sa
  `getCurrentViewerProfile()` i redirect-om - isti obrazac kao postojeći
  `/app/admin`. Nezavisno od toga, **svaka** funkcija iza ekrana proverava sama:
  `listAllModels`, `listAllPacks`, `getUsageSummary`, `getKillSwitchState` kroz
  `getCurrentProfile` + `role !== "admin"` → `Forbidden`; `setStudioEnabled`,
  `upsertModel`, `setModelEnabled`, `setModelCost`, `upsertPack`, `setPackActive`
  kroz `requireAdmin`. Skidanje redirect-a ne otvara ništa. Testovi
  `listAllModels vraća i isključene modele, zaštićen requireAdmin`,
  `listAllPacks ...` i tri u `studioAdmin.test.ts`.
  P8 je uz to pronašao i ispravio stvarnu grešku: `requireAdmin` iz `helpers.ts`
  radi `db.patch` (bootstrap profila) i **ne sme** se zvati iz query-ja - baca
  "Profile bootstrap requires a write-capable Convex context" i za admina.
- **Da li `/api/stripe/plan` proverava sve što proverava `/api/stripe/credits`?**
  Da, red po red: prazan slug → 400 · `AUTH_REQUIRED` → 401 ·
  `EMAIL_VERIFICATION_REQUIRED` → 403 · nepostojeći/ugašen → 404 · pogrešan
  `kind` → 400 · nedostajući `stripePriceId` → 400 · `missingServerEnvName` →
  503/500. **Plus jedna koje kod kredita nema:** `COURSE_NOT_AVAILABLE`, jer
  `syncStripeSubscription` bez `courseId` ne upiše ništa. Pokriveno sa 13
  testova u `app/api/stripe/plan/route.test.ts`, i svaki tvrdi i da
  `createPlanCheckoutSession` **nije** pozvan na odbijenoj putanji.
  Jedina razlika u ponašanju koja ostaje: nijedna ruta ne proverava da korisnik
  već ima aktivnu pretplatu, pa se Premium može kupiti dvaput. To nije gubitak
  (plaćeno je dvaput, doza stiže dvaput), nego tiket za podršku.
- **Da li neka stranica čita podatke koje ne bi smela?** Jedna - vidi N2. Ostale
  ne: `credits-page` čita `getBalance`/`getLots`/`getTransactions`/`listPacks`,
  sve svoje ili projektovano; `studio-admin-page` čita admin varijante iza
  provere uloge; `listMyJobs` izričito **ne** pušta `falRequestId` ni
  `actualCostUsd` napolje, i to je pokriveno testom.

---

## ŠTA SE STVARNO VIDI

Bez ulepšavanja. Ovo je stanje na `npm run dev` sa praznom bazom.

**Postoji i radi odmah, bez ijednog podešavanja:**
- ništa. Prazna baza nema modele, pa `/app/studio` piše "Nijedan model trenutno
  nije uključen", a `/app/credits` nema nijedan paket.

**Postoji i radi posle `npm run convex:seed` + `grantDemoCredits`:**
- `/{locale}/app/studio` - izbor modela sa cenom na svakoj kartici, forma
  gradjena iz `paramSchema`, dugme "Generiši - 20 kr", panel rezultata sa
  skeletonom, traka poslednjih 6 generacija. **Generacije su mock**: bez
  `FAL_KEY` `submitJob` posle 3 sekunde vrati generisan SVG sa ispisanim
  promptom preko obojene pozadine, i pločica dobije DEMO značku. 15% mock
  poslova namerno "padne" da se vidi refund. Ledger je pravi - krediti se
  stvarno skidaju i stvarno vraćaju.
- `/{locale}/app/studio/gallery` - mreža, filteri (tip/model/datum), preuzimanje,
  "Generiši ponovo", brisanje sa inline potvrdom. Radi nad mock izlazima.
- `/{locale}/app/credits` - balans, "≈ N generacija", lotovi pred istek, paketi,
  Premium kartica, paginirana istorija. **Sva dugmad pišu "Uskoro"** dok
  `stripePriceId` nije upisan.
- `/{locale}/app/admin/studio` - katalog sa inline izmenom cena i marže, paketi
  sa inline `stripePriceId`, dnevna potrošnja, kill switch. Vidljivo samo
  `role === "admin"`. **Srpski-only**, namerno (uklapa se u postojeći admin).
- Navigacija - Studio i Krediti su u proširenom sidebar-u i u rail-u; balans u
  zaglavlju je pretplata i pada sam. Mobilni donji tab bar (4 slota) namerno
  nije menjan, pa se do Studija na telefonu stiže preko "Više".
- Dugme "Otvori u Studiju" u lekciji, za korake sa `outputKind !== "text"`.

**Traži podešavanje pre nego što išta uradi:**
- Kupovina bilo čega - 5 Stripe cena + upis `stripePriceId` u `creditPacks`
  (ručni koraci 3 i 4 iz noćnog izveštaja).
- Prava generacija - `FAL_KEY` u Convex env. Do tada je sve mock.
- Mesečna doza i bonus - `invoice.paid` uključen na Stripe endpointu, plus
  `checkout.session.async_payment_succeeded` i `..._failed` (nove danas).
- Cronovi - ulaze u raspored tek prvim `npx convex deploy`.

**Nikad nije probano protiv stvarnog sveta:**
- **Nijedna prava fal generacija.** Ceo lanac `submitToFal` → webhook →
  `persistOutput` postoji, testiran je mock-ovanim `fetch`-om, i nijednom nije
  video fal.
- **Ed25519 na živom Convex runtime-u** (noćna stavka 8, i dalje najvažnija).
  Ako `crypto.subtle` u Convex izolatu nema Ed25519, ceo fal webhook je mrtav i
  svaki posao ide kroz reaper u refund.
- **`fetch()` na `data:` URL u Convex akciji** (P4 stavka 1). Ako ne radi, mock
  posao završi kao `done` sa `IZLAZ_NIJE_SACUVAN:` i demo slika se ne vidi -
  bez izgubljenih kredita, ali i bez demoa.
- **Ime parametra rezolucije** (`resolution`, vrednosti `1K`/`2K`/`4K`) je
  pretpostavka. Ako je pogrešno, `nano-banana-2-2k` naplaćuje 30 kredita za 1K
  sliku. Eksploatacija u obrnutom smeru je zatvorena bez obzira na ime.
- **Veza lekcija → Studio → zeleni zadatak** je pokrivena testovima ali nikad
  nije prošla kroz browser.
- **Nijedan Stripe event nije stvarno primljen.** Sve je `constructEvent` nad
  sintetičkim telom.

---

## PREOSTALO PRE PRVOG EVRA

Redom po riziku po novac, ne po redosledu izvodjenja. "Prompt" = jedan korak
veličine današnjih P1-P10 (30-45 min rada agenta).

1. **Zatvori `num_images` (N1).** `num_images` iz `paramSchema` u
   `defaultParams` sa vrednošću 1, isto kao rezolucija. **pola prompta.**
   Uz to potvrdi kod fal-a da li se naplaćuje po slici - `genmedia schema
   fal-ai/nano-banana-2 --json` (**15 min ručno**). Ako da, prava popravka je
   `computeCreditCost × num_images` i vraćanje polja u formu (**1 prompt**).
2. **Globalni dnevni plafon troška: alarm na 50 $, kill switch na 100 $**
   (plan 4.4, jedini red iz tabele zaštita koji i dalje nedostaje). Cron na
   15 min koji sabira `studioUsageDaily.costUsd` za tekući dan i, preko praga,
   sam obara `platformFlags.studio_enabled`. **1 prompt.**
3. **Kuponi i iznos (N3).** `allow_promotion_codes: false` na obe sesije, ili
   provera `amount_paid > 0` / `amount_total > 0`. **pola prompta.**
4. **Projektuj `listModels` (N2).** `.map` sa poljima koja UI stvarno koristi.
   **pola prompta.**
5. **Potvrdi Ed25519 i `data:` URL na živom Convex runtime-u.** Dve komande
   kroz Convex dashboard → Functions → Run. Ako Ed25519 padne, rešenje je
   `@noble/ed25519` i to je onda **1 prompt** povrh ovoga. **30 min ručno.**
6. **fal nalog: ključ + tvrd mesečni plafon u fal dashboard-u.** Plafon je
   jedina zaštita koja stoji iznad svega što si sam napisao, uključujući (1) i
   (2). Kupi kredite mesec dana ranije zbog concurrency limita. **1 h ručno.**
7. **Stripe: 5 cena, upis `stripePriceId` u `creditPacks`, i 7 event-ova na
   postojećem endpointu** (`checkout.session.completed`, `invoice.paid`, tri
   `customer.subscription.*`, plus nove `checkout.session.async_payment_succeeded`
   i `async_payment_failed`). Bez poslednje dve, odloženo plaćanje više nikad ne
   dobije kredite - `payment_status` provera iz P1 to sad izričito čeka.
   **1 h ručno.**
8. **Pravno: `/uslovi-studio` + 18+ checkbox upisan u bazu sa timestampom
   (N8).** Bez ovoga ne naplaćuj. **1 prompt + pravni pregled.**
9. **Pregledaj blok listu (N7):** izbaci `nude` ili ga zameni srpski
   nedvosmislenim oblikom, i odluči šta sa ćirilicom (najmanje: transliteracija
   pre normalizacije). **pola prompta + pravni pregled liste.**
10. **`labOutputs.storageId` posle isteka (N5).** Odluči i implementiraj.
    **pola prompta.**
11. **Rotiraj `WEBHOOK_SYNC_SECRET`** (noćni rizik d5, nedirano).
    **10 min ručno.**
12. **Komituj dan, dodaj `.studio-run/` u `.gitignore`, pa `npx convex deploy` i
    prodji QA checklist iz plana 9 nad pravim podacima.** **pola prompta +
    ručno.**
13. **Van obima Faze A, ali mora u backlog pre nego što se zaboravi:** clawback
    na `charge.refunded` / `charge.dispute.created` (noćni d4), `syncSubscription`
    da baca umesto da ćuti (N4), brojanje reaper-ovanih poslova kao metrika (N6),
    istek refundiranog lota koji produžava rok (rizik c).

Ukupno pre prvog evra: **≈ 4 prompta + ≈ 3 h ručnog rada**, uz pravni pregled
koji ne mogu da procenim.

---

## PREPORUKA

**Još jedan krug** - Faza A je funkcionalno gotova i tehnički čista (394 testa,
sve četiri komande zelene, četiri stranice koje rade), ali tri stvari koje
propuštaju novac su i dalje otvorene: `num_images` naplaćuje jednu sliku a
poručuje četiri, globalni plafon troška ne postoji, i kupon od 100% daje
neograničene mesečne kredite - a sve tri se zatvaraju sa oko dva prompta, što je
jeftinije od jednog dana u produkciji sa njima.
