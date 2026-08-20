# Studio — revizija fix run-a (W1–W7)

> 20. avgust 2026 · grana `feat/studio-faza-a` · HEAD `a865dde`
> Revizija, ne nov kod. Nijedan fajl proizvoda nije menjan tokom ovog koraka.
> Privremeni revizorski alat (`convex/__wrv_audit.test.ts`) je obrisan posle
> merenja; brojevi u sekciji MARŽA su njegov izlaz.

---

## 0. Verifikacija — tačan izlaz

| Komanda | Izlaz | exit |
|---|---|---|
| `npx convex codegen` | `Running TypeScript...` | **0** |
| `npm run lint` | `✖ 8 problems (0 errors, 8 warnings)` | **0** |
| `npm run test` | `Test Files 58 passed (58)` · `Tests 741 passed (741)` | **0** |
| `npm run build` | `✓ Compiled successfully in 7.3s` · `✓ Generating static pages (60/60)` | **0** |

**Sve četiri prolaze čisto.** Lint je pao sa 17 na 8 upozorenja: devet iz
`convex/crons.ts` je nestalo jer su ti uvozi sada stvarno pozvani (nalaz R1).
Preostalih 8 su u `admin-inline-actions.tsx`, `dashboard-content.tsx`,
`public-course-intro-video.tsx` i `get_google_creds.js` — nijedan fajl ovog
run-a. Testova je +95 u odnosu na kraj kataloškog run-a (646 → 741).

### Obim

```
git diff --stat main...HEAD
289 files changed, 49334 insertions(+), 534 deletions(-)
```

```
a865dde studio(W7): Sitnice iz sekcije 6 izvestaja
a71eb35 studio(W6): actualCostUsd i nocna rekonsilijacija
497d774 studio(W5): R3 pravo resenje: trajanje iz zaglavlja fajla
6ed6662 studio(W5): R3 pravo resenje: trajanje iz zaglavlja fajla   ← duplikat poruke
b9bab2a studio(W4): R4: vlasnistvo nad uploadovanim fajlom
fd80709 studio(W4): R4: vlasnistvo nad okacenim fajlovima            ← duplikat poruke
363a7fe studio(W3): R2 i R3: popust bez osnova i merena kolicina
9cde1fa studio(W2): R1: globalni dnevni plafon troska
0b705a9 studio(W1): Otkljucaj Studio za admina i moderatore
2784f79 wip: stanje pre fix run-a
```

Dva koraka (W4, W5) imaju po dva commit-a sa skoro istom porukom. Nije kvar
koda, ali istorija grane laže o broju koraka — vredi squash-a pre merge-a.

---

## 1. R1–R5 — nov status, iz koda

Metod: za svaki nalaz je pročitan kod na koji nalaz pokazuje, a ne sekcija
dnevnika koja tvrdi da je popravljen.

| # | Bio | **Sad** | Jednom rečenicom |
|---|---|---|---|
| R1 | 🔴 mrtav kod | 🟢 **zatvoren** | peti cron postoji, poziva odluku, upisuje posledicu |
| R2 | 🔴 popust bez osnova | 🟢 **zatvoren** | množilac 0,6 uklonjen iz oba Seedance pravila |
| R3 | 🔴 klijent bira cenu | 🟠 **delimično** | klijent više ne šalje broj — ali zaglavlje fajla nije dokaz |
| R4 | 🟠 tuđi `storageId` | 🟢 **zatvoren** | `studioUploads` + provera pre cene i pre naplate |
| R5 | 🟠 legacy put po slugu | 🟢 **zatvoren** (uz seed) | FLUX izbačen, svih 20 preostalih redova ugašeno |

---

### 🟢 R1 — Globalni dnevni plafon troška — **ZATVOREN**

**Kojim kodom.** `convex/crons.ts:176` `applyGlobalCostAction` (internalMutation)
sabere `studioUsageDaily.costUsd` za tekući UTC dan preko indeksa `by_day`,
pročita `platformFlags.studio_enabled` i postojanje reda u `studioCostAlarms`,
pozove `decideGlobalCostAction` (`crons.ts:199`) i **odmah upiše posledicu** —
`kill` gasi flag, `alarm` upisuje red za taj dan. `crons.ts:295`
`enforceGlobalCostCap` (internalAction) zove tu mutaciju pa tek onda šalje mejl
preko Resend-a. Cron je registrovan: `crons.ts:322-327`,
`"studio: globalni plafon troska"`, svakih 15 minuta. Nijedan prag nije prepisan
— `GLOBAL_DAILY_ALARM_USD` i `GLOBAL_DAILY_KILL_USD` se čitaju iz
`studioCore.ts:174-175`, u `crons.ts` nema nijednog broja.

**Kojim testom.** `convex/crons.test.ts`, sekcija „4. globalni dnevni plafon
troška", 10 testova: 49,99 $ ne radi ništa · tačno 50,00 $ ne radi ništa (prag je
strogo preko) · preko 50 $ šalje **tačno jedan** mejl kroz tri prolaza · preko
100 $ gasi flag i preskače alarm red · već ugašen Studio ne šalje drugi mejl ·
nov dan resetuje oboje · Resend bez ključa / sa 500 / sa mrežnom greškom ne
sprečava gašenje.

**Nezavisan dokaz.** `grep decideGlobalCostAction convex/` više ne vraća samo
uvoz — vraća poziv na `crons.ts:199`. Devet lint upozorenja iz `crons.ts` je
nestalo bez ijednog obrisanog uvoza; to je merljiva posledica, ne tvrdnja.

> ⚠️ Mehanizam radi. **Ono što meri je forgeable** — zbir ide preko
> `estimatedCostUsd`-a, koji kod sedam mernih modela zavisi od zaglavlja koje je
> korisnik okačio. Videti **N2**.

---

### 🟢 R2 — `reference_with_video` popust bez osnova — **ZATVOREN**

**Kojim kodom.** `convex/providers/bytePlusModels.ts:215-218` i `:301` —
`modeMultipliers: { reference_with_video: 0.6 }` je uklonjen iz oba Seedance
pravila, sa obrazloženjem na mestu uklanjanja. `grep modeMultipliers convex/`
danas vraća tačno jedan živ množilac u celom katalogu:
`falVideoModels.ts:250 modeMultipliers: { video: 1.5 }` — poskupljenje za izmenu
videa, ne popust. Nijedan množilac ispod 1 ne postoji.

**Kojim testom.** `convex/studioPricing.test.ts:277-297` — `reference` sa videom
i bez videa daju **istih 164 kredita** (odnos 1,0), i eksplicitno
`expect(rule.modeMultipliers).toBeUndefined()` za oba Seedance pravila.
`convex/studioCatalogJob.test.ts:302` isto kroz ceo `createJob`.

**Nezavisan dokaz.** Enumeracija (sekcija MARŽA) prolazi kroz
`pricingModeFor(mode, true)` svuda gde režim ima video slot; `reference_with_video`
nigde ne daje maržu ispod 2,5000×.

**Šta ostaje (nije rizik po novac).** `referenceVideoBillableSeconds`
(`studioPricing.ts:322`) je i dalje mrtav kod — jedini uvoz je
`studioPricing.test.ts:13`. `STUDIO-CATALOG-V4.md` 3.4 i dalje opisuje sniženu
tarifu. **Kod je stroži od kataloga**, dakle greška ide u bezbednu stranu, ali
katalog i kod tvrde različito. Ako se snižena tarifa ikad vrati, mora zajedno sa
naplatom ulaznog videa — a ta naplata bi visila na istom zaglavlju iz **R3**,
pa danas nema šta da se vrati.

---

### 🟠 R3 — Klijent bira koliko će mu se naplatiti — **DELIMIČNO**

#### Šta jeste zatvoreno

**Klijentov broj više ne postoji na serveru.** `measuredQuantity` je uklonjen iz
`createJob` args-a (`studio.ts:316-337`); Convex validator odbija nepoznat
argument, pa je uklanjanje ujedno i dokaz — `studioCatalogJob.test.ts:377-388`
tvrdi da poziv sa `measuredQuantity: 0.1` **pada na validatoru**.

**Meri server.** `studioActions.measureInputUpload` (`studioActions.ts:304`)
dovuče `Range` opseg (512 kB glava, za MP4 i 512 kB rep), pročita zaglavlje
parserom `lib/media-duration.ts` i upiše sekunde u `studioUploads.durationS`.
`createJob` naplaćuje isključivo taj broj: `ownedInputUploads` (`studio.ts:100`)
sabere `durationS` po slotu, `measuredQuantityFromSeconds`
(`studioJobCore.ts:290`) ga prevede u jedinicu pravila,
`resolveMeasuredQuantity` (`studioJobCore.ts:325`) zaokruži naviše i seče na
kataloške granice. Slot bez izmerenog trajanja daje `MERENJE_NIJE_DOSTUPNO` i
posao pada **pre** skidanja kredita.

**Testovi.** `lib/media-duration.test.ts` (18 testova nad sintetičkim
zaglavljima, uključujući „tekst koji sadrži reč `mvhd` ne prolazi kao MP4"),
`convex/studioJobCore.test.ts:205-225`, `convex/studioCatalogJob.test.ts`
(ceo put upload → `registerInputUpload` → `measureInputUpload` sa `fetch`-om koji
poštuje `Range`; `dubbing` sa izmerenih 7 minuta se naplaćuje 7 minuta iako
`params` nosi `minutes: 0.1`).

**Napad od jednog API poziva je stvarno mrtav.** Nema polja u koje bi se broj
upisao.

#### Šta ostaje otvoreno

**1. Zaglavlje nije medij.** `mvhd` je metapodatak; dužina zvučnog zapisa stoji u
`mdhd`/`stts` tabelama koje parser ne čita. Fajl kojem je `mvhd.duration`
prepravljen na 6 sekundi naplaćuje se kao 6 sekundi, a ElevenLabs obradi ono što
je stvarno unutra. Ista računica kao u prvobitnom nalazu:

| model | zaglavlje kaže | fajl je | naplaćeno | stvarni trošak | **marža** |
|---|---:|---:|---:|---:|---:|
| `dubbing` | 0,1 min | 120 min | 13 kr | $72,00 | **0,002×** |
| `voice-changer` | 0,1 min | 120 min | 7 kr | $36,00 | **0,002×** |
| `audio-isolation` | 0,1 min | 120 min | 3 kr | $12,00 | **0,003×** |
| `kling-motion` | 1 s | 60 s | 28 kr | $7,56 | **0,043×** |

W5 je ovo zapisao pod „Za Jovana" tačka 5 i to je pošteno. Ali dnevnik nije
mesto na kojem stoji otvoren rizik od 0,002×, pa ga ovaj izveštaj vraća u status
**delimično**, ne zatvoreno. Razlika u odnosu na pre: napad sada traži hex editor
umesto jednog `curl`-a. To je viša prečka, ne zaključana vrata.

**2. MP3 bez Xing/VBRI ne traži ni hex editor.** `readMp3`
(`lib/media-duration.ts:329-331`) pada na `seconds = (totalBytes − start) × 8 /
bitrate_prvog_frejma`. VBR fajl čiji je prvi frejm 320 kbps a ostatak 32 kbps
prijavi desetinu stvarnog trajanja — a to je legalan MP3 koji svaki enkoder ume
da napravi. Ovo je **jedini put na kojem parser vraća pogrešan broj umesto da
odbije posao**, i jedini na kojem greška ide u našu štetu.

**3. Uklonjena je jedina unakrsna provera, a nije zamenjena.** W3 je uveo granicu
po veličini fajla; W5 ODLUKA 3 ju je uklonila jer je hvatala samo prijavu, a
prijave više nema. Time je nestala i jedina veza između broja i bajtova. Suprotna
granica — `bytes / MAKSIMALAN_RAZUMAN_BITRATE` kao **donja** granica trajanja —
nije uvedena. Ona je danas jeftina i sigurna: zvučni fajl od 200 MB ne može da
traje 6 sekundi osim na 266 Mbps. Plafon od, recimo, 50 Mbps ne dira nijedan
pošten upload, a obara i hex-editovan `mvhd` i podvaljen VBR MP3.

**4. Oba plafona troška mere isti forgeable broj.** Videti **N2** — to je
posledica ovog nalaza, ne zaseban.

**5. Pošten dug fajl se pod-naplaćuje.** `clampQuantity` i dalje seče **naviše**
na kataloški `max`: snimak od 180 minuta se naplati kao 120. Marža tada nije
gubitak nego 2,5 × 120/180 = **1,67×**. Zabeleženo, nije hitno.

---

### 🟢 R4 — Tuđi `storageId` — **ZATVOREN**

**Kojim kodom.** Nova tabela `studioUploads` (`schema.ts`) sa indeksima
`by_storage`, `by_user` i `by_expiry`. `registerInputUpload` (`studio.ts:1020`)
se zove odmah posle uploada, proverava da fajl stvarno postoji
(`ctx.db.system.get`) i upisuje vlasnika, `bytes` i `mimeType` **iz `_storage`**,
ne iz onoga što je klijent poslao. `ownedInputUploads` (`studio.ts:100-135`)
svaki `storageId` iz `inputs`-a traži u toj tabeli i baca `TUDJI_FAJL` ako reda
nema ili je tuđi — na `studio.ts:172`, dakle **pre** sanitizacije parametara,
pre cene, pre upisa posla i pre `applySpend`-a. `normalizeId` stoji pre upita, pa
niz koji nije `_storage` ID pada na istu grešku. Merenje je zaštićeno posebno:
`getOwnedUpload` (`studio.ts:1063`) je internalQuery koji **ipak** proverava
korisnika, jer je `measureInputUpload` javna akcija a trajanje je podatak o tuđem
fajlu.

**Kojim testom.** `convex/studioCatalogJob.test.ts` — tuđi `storageId` daje
`TUDJI_FAJL` bez posla i bez skinutog kredita, a tuđi upload ostaje nevezan sa
svojim rokom · okačen ali neprijavljen fajl ne prolazi · `storageId` koji ne
postoji pada **pre** naplate (0 poslova, balans netaknut) — čime pada i druga
polovina nalaza · prijava ne prepisuje vlasnika · `bytes` u redu je stvarna
veličina iz storage-a, ne ono što je klijent rekao. `convex/crons.test.ts` —
nevezan upload stariji od 24 h nestaje ceo, upload koji je ušao u posao preživi.
Uz to je 21 zatečen poziv test-helpera `storeFile` prebačen na pravu mutaciju, pa
ceo postojeći skup usput pokriva srećan tok prijave.

**Šta ostaje.** Dva repa, oba pod **NOVE RUPE**: prvi prijavilac dobija
vlasništvo nad bilo kojim još neprijavljenim `_storage` ID-jem u celoj aplikaciji
(**N3**), i ulazni fajlovi se i dalje nikad ne brišu (**N7**).

---

### 🟢 R5 — Legacy `modelCatalog` put — **ZATVOREN, uz obavezan seed**

**Kojim kodom.** `flux-2-flash` i `flux-2-pro` su izbačeni iz
`modelCatalogSeeds` (`convex/seed.ts:543`), a **svih 20 preostalih redova ima
`isEnabled: false`** — provereno nabrajanjem, ne uzorkom. `seedModelCatalog`
(`seed.ts:828`) na postojećem redu radi `ctx.db.patch(existing._id, patch)` gde
je `isEnabled: seed.isEnabled` (`seed.ts:860`), dakle seed **gasi** i red koji je
neko ranije upalio. `buildLegacyOrder` (`studio.ts:283`) odbija ugašen model sa
`MODEL_NEDOSTUPAN`. Posledica: proizvoljan `modelSlug` poslat mimo forme nema
više nijedan živ legacy red da pogodi, bez obzira na porodicu.

**Kojim testom.** `convex/modelCatalog.test.ts:67` i `:148` — seed upisuje 20
redova (22 − 2 FLUX), a javni `listModels` je **prazan** dok admin ručno ne upali
red; test to dokazuje paljenjem jednog reda direktno u testu.
`convex/studio.test.ts` — legacy posao upisuje `provider: "fal"`.

**Uslov.** Kod je promenjen, red u bazi nije. Do `npm run convex:seed` na
deployment-u legacy redovi su i dalje onakvi kakvi su upisani. To je jedini
nalaz čije zatvaranje zavisi od ručnog koraka.

---

### Dodatak: R6–R8, pošto diraju maržu

| # | Status | Zašto |
|---|---|---|
| R6 MiniMax H3 sporna tarifa | 🟡 **otvoren, nepromenjen** | pravilo i dalje `0,05 × 2,6 = $0,13/s`; nijedna faktura nije viđena. Ako je tačna cifra $0,26/s, marža na 2K je 1,25× |
| R7 Nano Banana Pro thinking tokeni | 🟠 **mehanizam da, podatak ne** | `actualCostUsd` postoji, ali se **nikad ne upisuje** za Google — videti **N6** |
| R8 serverske količine idu provajderu | 🟡 **otvoren, nepromenjen** | `studioActions.ts` i dalje šalje `{ ...params }` sa dopisanim `char_count`/`minutes`/`duration`; `duration` kod `kling-avatar`/`kling-lipsync` može da se sudari sa stvarnim poljem rute |

---

## 2. NOVE RUPE — šta je ovaj run otvorio

---

### 🔴 N2 — Oba plafona troška mere broj koji napadač bira

> Ovo je najskuplji nalaz izveštaja. Nosi ga zajedno **W2** (koji je plafon
> sagradio) i **W5** (koji je sedam mernih modela vratio u ponudu ispod njega).

`createJob` upisuje u `studioUsageDaily.costUsd` **procenu**
(`studio.ts:459`, `:467` — `estimatedCostUsd`). Iz tog istog polja čita i dnevni
plafon po korisniku (`studio.ts:412`, `MAX_DAILY_COST_USD = 5`) i **novi globalni
plafon** (`crons.ts:181-186`, alarm 50 $, kill 100 $). Kod sedam mernih modela
`estimatedCostUsd` je izveden iz `durationS`-a, dakle iz zaglavlja koje je
korisnik okačio (**R3**, tačke 1 i 2 iznad).

Konkretno, sa nalogom koji ima kredita i sa fajlom čije zaglavlje kaže 0,1 minut:

| | ono što plafoni vide | ono što fal naplati |
|---|---:|---:|
| jedan `dubbing` posao | $0,06 | $72,00 |
| 50 poslova (`MAX_DAILY_GENERATIONS`) | **$3,00** | **$3 600,00** |

$3,00 je ispod plafona po korisniku od 5 $, i 33× ispod globalnog kill-a od
100 $. **Nijedan plafon ne opali.** Cena napada je 650 kredita ≈ 6,50 €.
`MAX_ACTIVE_JOBS = 3` ograničava paralelizam, ne dnevni zbir. Sa više naloga je
linearno gore.

Detekcija koja je za ovo napisana — alarm na 5 uzastopnih odstupanja preko 30%
iz W6 — **danas ne radi ni za jedan model** (videti **N6**).

**Najjeftinije zatvaranje, po redu cene:**
1. donja granica trajanja iz bajtova (**R3**, tačka 3) — desetak linija u
   `studioJobCore.ts`, hvata i hex editor i podvaljen VBR MP3;
2. plafoni da sabiraju `actualCostUsd` tamo gde postoji, a procenu samo kao
   privremenu vrednost;
3. dok ni jedno ni drugo ne postoji: `dubbing`, `voice-changer` i
   `audio-isolation` (tri najskuplja od sedam) držati ugašenim.

---

### 🟠 N1 — Admin pregled propušta tuđe promptove i tuđe fajlove

**Provera uloge JESTE na serveru.** `requireStudioStaff` (`studio.ts:760`) čita
ulogu preko `getCurrentProfile`-a i baca `Forbidden`; zovu je i `listAllJobs`
(`studio.ts:793`) i `listJobOwners` (`studio.ts:861`), prva linija handler-a u
oba. Prekidač „Svi korisnici" u UI-ju je samo prikaz — to tvrde i testovi
(`studio.test.ts`: običan korisnik i neprijavljen dobijaju `Forbidden`, dok
`listMyJobs` istom korisniku i dalje vraća samo njegovo). **Ovde nema rupe.**

**Rupa je u tome ŠTA taj upit vraća.** `listAllJobs` koristi isti `toGalleryJob`
(`studio.ts:703`) kao i korisnikova galerija, pa red o tuđem poslu nosi:

- `params` — **ceo prompt**, prikazan na kartici (`studio-gallery-page.tsx:277`)
- `inputThumbs` — **potpisani URL-ovi tuđih okačenih fajlova**
  (`:281` → `resolveInputThumbs`): fotografije lica za `kling-avatar`, glasovni
  snimci za `voice-changer`, video za `dubbing`
- `outputUrl` — tuđi izlaz, pušta se inline u kartici
- `ownerEmail` — mejl, plus `listJobOwners` vraća pun spisak mejlova

Tri stvari koje uz to ne postoje:

1. **Obim je širi od admina.** `isStudioStaff` (`studioCore.ts:24`) pušta i
   `moderator`. To je uloga zajednice koju admin dodeljuje
   (`profiles.setProfileRole:182`) — dakle moderator foruma dobija pun uvid u
   privatne promptove i okačene lične snimke svih korisnika. Poređenja radi,
   `studioAdmin.*` (potrošnja, marža, kill switch) traži **strogo `admin`**
   (`studioAdmin.ts:22`). Ekran sa novcem je uži od ekrana sa sadržajem.
2. **Nema traga ko je šta gledao.** Nijedan audit log, nijedan brojač.
3. **Korisnik za to ne zna.** Nema uslova korišćenja ni politike privatnosti u
   repou — videti **SPREMNO ZA NAPLATU**.

Za moderaciju je dovoljan podskup (model, status, provajder, cena, vlasnik,
izlaz). Prompt i ulazne sličice su nadogradnja koju W1 ODLUKA 8 nije razmatrala
— ta odluka je govorila o **dugmadima** (brisanje, regeneracija), ne o podacima.

---

### 🟡 N6 — `actualCostUsd` je napisan, a ne upisuje se ni za jedan model

W6 tvrdi „za sva tri provajdera". Mehanizam jeste tu i jeste testiran
(`studioActualCostCore.test.ts` 14, `studioActualCost.test.ts` 10). Ali:

- **Google:** `tokenCostUsd` (`studioActualCostCore.ts:156`) vraća `null` čim
  jedna prijavljena kategorija tokena nema tarifu. Jedini red u celom katalogu sa
  `tokenRatesUsdPerMillion` je `nano-banana-pro`
  (`googleImageModels.ts:138`), i on ima `output` i `thinking` — **ali ne
  `prompt`**, a Google `usageMetadata` prijavljuje `promptTokenCount` uvek. Znači:
  `null` za svaki Google posao, uključujući i onaj zbog kojeg je nalaz R7 postojao.
  `veo-31-fast` i `gemini-omni` nemaju tarifu uopšte.
- **BytePlus:** nijedan red nema `tokenRatesUsdPerMillion`. Nula upisa.
- **fal:** zavisi od noćnog crona nad `GET /v1/models/billing-events`, čija imena
  polja **nisu potvrđena protiv živog API-ja** (W6 ODLUKA 10 to i kaže).

Posledica u tri koraka: kolona „Stvarna marža" na admin ekranu piše „nema
merenja" za svih 30 modela · alarm na odstupanje preko 30% nema šta da poredi ·
dakle **N2 nema detektor**, a R7 se i dalje ne može primetiti. W6 je ovo zapisao
pod „Za Jovana" 1 i 5, i tamo je tačno opisano — ali kao podešavanje, a ne kao
uslov bez kojeg ceo korak ne proizvodi nijedan podatak.

---

### 🟡 N3 — `registerInputUpload` deli vlasništvo po principu „ko prvi"

`registerInputUpload` (`studio.ts:1020`) prima **bilo koji** `_storage` ID koji
još nema red u `studioUploads` i upisuje pozivaoca kao vlasnika. Convex
`_storage` je jedan imenski prostor za celu aplikaciju — tu su i naslovne slike
kurseva, video lekcija, avatari i slike objava. Ko dođe do sirovog ID-ja bilo
čega od toga može da ga „prijavi" kao svoj studijski upload, izmeri mu trajanje
(`measureInputUpload`) i dobije potpisan URL kroz sličicu u svojoj galeriji.

**Zašto 🟡, a ne 🔴:** provereno je da upiti van Studija sirov `storageId` ne
vraćaju — `community.ts:204`, `courses.ts:131/239/375/488/559` svuda pretvaraju u
URL preko `ctx.storage.getUrl`. Jedino `avatarStorageId` izlazi sirov
(`profiles.ts:94`, `helpers.ts:220`), a avatari su ionako javni. Dakle danas nema
prohodne staze. Ali odbrana je opet **nepogodivost ID-ja**, a upravo to je
prvobitni nalaz R4 nazvao „nije kontrola pristupa". Ispravno bi bilo da
`registerInputUpload` primi samo ID koji je izdao `createInputUploadUrl` tom
korisniku.

---

### 🟡 N5 — Plafon koji tiho prestane da radi

`applyGlobalCostAction` (`crons.ts:180`) čita `studioUsageDaily` sa
`.collect()`, bez kapa. W2 ODLUKA 3 to brani ispravno — odsečen zbir bi bio
manji od stvarnog. Ali posledica nije dovršena: preko Convex-ovog limita od
16 384 reda po transakciji prolaz **baci**, a niko ne obaveštava da je bacio.
Cron koji puca svakih 15 minuta izgleda isto kao cron koji nema šta da radi.
Isto važi i za svaku drugu grešku u tom prolazu. Nedostaje alarm na *neuspeh*
plafona, ne samo na *okidanje* plafona.

---

### 🟡 N4 — `measureInputUpload` nema ograničenje ponavljanja

Javna akcija (`studioActions.ts:304`). Ako se zaglavlje ne pročita, `durationS`
se nikad ne upiše, pa kratko spajanje na `:317` (`if (upload.durationS !== undefined)`)
nikad ne opali — svaki sledeći poziv ponovo povuče do 1 MB (512 kB glava +
512 kB rep) iz storage-a. Prijavljen korisnik može da okači jedan neparsabilan
fajl i da akciju zove u petlji. Nema rate limita, nema brojača pokušaja.
Popravka je jedan brojač neuspeha na redu `studioUploads`.

---

### 🟡 N7 — Ulazni fajlovi ostaju zauvek

`createJob` skida `expiresAt` sa svakog uploada koji uđe u posao
(`studio.ts:446-448`), a `deleteJob` briše izlaz i poster — **ulaze nikad**. Od
W4 uz svaki takav fajl stoji i trajan red u `studioUploads`. Zatečeno ponašanje
koje je W4 pošteno prijavio („Za Jovana" 3), ali sada raste za jedan red po
fajlu. Retencija ulaza je zaseban korak i treba joj mesto u backlog-u pre nego
što račun za storage počne da smeta.

---

## 3. MARŽA — najgora kombinacija po modelu

Metod isti kao u prethodnom izveštaju, nad **zatečenim kodom grane**: nabrojan je
ceo prostor parametara svakog modela (svaka opcija svakog `select`/`segmented`,
oba stanja svakog `switch`, svaki korak svakog `slider`/`number`), svaki ulazni
režim, obe granice svake serverske količine, `extras` na 0 i na kataloški
maksimum, i **oba cenovna režima svuda gde režim ima video slot** — dakle
`reference` i `reference_with_video`. **3 073 806 cenjivih kombinacija preko 30
modela.** Marža = `krediti / 100 / (nabavno_USD × 0,865)`, isto kao
`computeMargin`.

| model | ruta | kombinacija | **najgora marža** | kr | nabavno $ | najgori slučaj |
|---|---|---:|---:|---:|---:|---|
| `gpt-image-15` | fal | 72 | **2,5000×** | 173 | 0,8000 | high 1024×1536, 4 slike |
| `minimax-h3` | fal | 5 376 | **2,5000×** | 173 | 0,8000 | 4K, bez LoRA, 5 s |
| `veo-31-fast` | google | 4 860 | **2,5000×** | 173 | 0,8000 | 720p nemo, 10 s |
| `veo-31` | fal | 4 860 | **2,5000×** | 173 | 0,8000 | 720p nemo, 4 s |
| `voice-changer` | fal | 20 | **2,5000×** | 7 785 | 36,0000 | 120 min |
| `dubbing` | fal | 42 | **2,5000×** | 15 570 | 72,0000 | 120 min |
| `music` | fal | 10 | **2,5000×** | 519 | 2,4000 | 4 min |
| `audio-isolation` | fal | 2 | **2,5000×** | 2 595 | 12,0000 | 120 min |
| `seedance-25` | byteplus | 324 | **2,5000×** | 2 584 | 11,9490 | 1080p, 21 s |
| `seedance-20` | byteplus | 288 | **2,5000×** | 157 | 0,7260 | fast 720p, 6 s |
| `kling-3` | fal | 108 | 2,5002× | 109 | 0,5040 | 720p nemo, 6 s |
| `kling-3-turbo` | fal | 36 | 2,5002× | 218 | 1,0080 | 720p, 9 s |
| `kling-omni` | fal | 216 | 2,5002× | 109 | 0,5040 | 720p nemo, 6 s |
| `kling-motion` | fal | 8 | 2,5002× | 1 635 | 7,5600 | 720p, 60 s videa |
| `seedream-5-pro` | byteplus | 768 | 2,5005× | 73 | 0,3375 | layerize 1.5K, 15 slojeva |
| `nano-banana-pro` | google | 80 | 2,5009× | 159 | 0,7350 | 4K, 3 slike |
| `gpt-image-2` | fal | 168 | 2,5010× | 347 | 1,6040 | high 3840×2160, 4 slike |
| `kling-avatar` | fal | 4 | 2,5015× | 1 493 | 6,9000 | 1080p, 60 s zvuka |
| `seedream-45` | fal | 56 | 2,5048× | 26 | 0,1200 | 3 slike |
| `veo-31-lite` | fal | 60 | 2,5048× | 26 | 0,1200 | 720p nemo, 4 s |
| `stt` | fal | 6 | 2,5048× | 208 | 0,9600 | 120 min |
| `kling-lipsync` | fal | 8 | 2,5048× | 182 | 0,8400 | 60 s videa |
| `nano-banana-2` | google | 160 | 2,5058× | 66 | 0,3045 | 2K, 3 slike |
| `gemini-omni` | google | 64 | 2,5092× | 66 | 0,3041 | 16:9, 3 s |
| `tts` | fal | 3 056 130 | 2,5202× | 109 | 0,5000 | 5 000 znakova |
| `dialogue` | fal | 3 | 2,5202× | 109 | 0,5000 | 5 000 znakova |
| `sfx` | fal | 18 | 2,5289× | 7 | 0,0320 | 16 s |
| `seedream-5-lite` | fal | 56 | 2,5323× | 23 | 0,1050 | 3 slike |
| `kling-tryon` | fal | 1 | 2,6424× | 16 | 0,0700 | jedina kombinacija |
| `kling-v2a` | fal | 2 | 2,6424× | 8 | 0,0350 | jedina kombinacija |

**Globalni minimum je 2,5000×. Nijedna od 3 073 806 kombinacija nije ispod.**
Algebra iz prethodnog izveštaja i dalje važi i nije je pokvarila nijedna izmena
W1–W7: `computeCredits` (`studioPricing.ts:265-273`) je netaknut, radi
`ceil(C × 216,25)` tačno jednom na kraju, pa je `marža ≥ 216,25 / 86,5 = 2,5` za
svako `C > 0`.

Promene u odnosu na prethodnu tabelu su sve **naviše**: `seedance-20` i
`seedance-25` su izgubili množilac 0,6 (bili bi 1,50× u `reference` režimu sa
videom, sada su 2,5000×), a `kling-avatar`, `kling-lipsync`, `kling-motion`,
`stt`, `voice-changer`, `audio-isolation` i `dubbing` su iz „ugašen" prešli u
tabelu sa svojim pravim brojevima. Broj kombinacija je veći nego ranije (3,07 M
prema 3 965) samo zato što ova enumeracija prolazi i kroz kontrole koje ne utiču
na cenu (`tts` slajderi) — to ne pomera nijedan minimum.

### Dvostruko naplaćivanje posle uklanjanja popusta iz R2 — **nema ga**

Provereno na četiri načina, jer je to bio izričit zadatak:

1. **Seedance nema mernu količinu.** `capabilities` oba Seedance reda
   (`bytePlusModels.ts`) nema `quantity`, pa `parseQuantitySource` vrati `null` i
   grana koja sabira izmerene sekunde (`studio.ts:182-196`) se **ne izvršava**.
   `duration` u ceni dolazi isključivo iz slajdera izlaznog trajanja.
2. **Množilac je zaista 1, nije zaboravljen negde drugde.** `reference_with_video`
   se ne pojavljuje ni u jednom `modeMultipliers`-u ni `modeRules`-u u celom
   katalogu; `computeCostUsd:242-245` na nepoznat režim ne dira cenu.
   `studioPricing.test.ts:286` to tvrdi brojem (164 kr u oba režima).
3. **Video i zvuk se ne mogu sabrati u istom poslu.** `MINUTE_QUANTITY` gleda oba
   slota, ali `sanitizeJobInputs` (`studioJobCore.ts:104-116`) odbija svaki slot
   koji nije u spec-u tog režima, a `stt` i `dubbing` imaju po jedan slot po
   režimu (`falAudioModels.ts:306-308`, `:381-383`). Dvostruko brojanje istog
   medija nije izrazivo.
4. **Empirijski.** Enumeracija prolazi kroz `pricingModeFor(mode, true)` svuda
   gde postoji video slot. Da je negde ostao dupli faktor, marža bi bila ~5×, ne
   2,5×. Najveća izmerena marža u celom katalogu je 2,6424× (`kling-tryon`,
   `kling-v2a`), i to je čisto zaokruživanje na malom iznosu.

> ⚠️ **Ova tabela nije mesto gde se gubi novac, i to nije promenjeno.** Ona meri
> odnos cene i tarife. Novac se gubi tamo gde je **količina** lažna — sekcija
> **N2**, gde marža ide do 0,002×.

---

## 4. MERENJE — sedam modela, jedan po jedan

Pitanje je dvodelno: **je li model vraćen u ponudu** i **je li njegov format
pokriven parserom**. Vraćen a nepokriven je gora greška od ugašenog.

| model | naplaćuje se iz | merni slot(ovi) | prihvata | pokriveno parserom | vraćen? |
|---|---|---|---|---|---|
| `kling-avatar` | `input_audio_seconds` | `audio` | mpeg · wav · mp4 · webm | ✅ sva 4 | ✅ da |
| `kling-lipsync` | `input_video_seconds` | `video` | mp4 · quicktime · webm | ✅ sva 3 | ✅ da |
| `kling-motion` | `input_video_seconds` | `video` | mp4 · quicktime · webm | ✅ sva 3 | ✅ da |
| `stt` | `input_media_minutes` | `video` + `audio` | sva 3 + sva 4 | ✅ svih 7 | ✅ da |
| `voice-changer` | `input_media_minutes` | `audio` | mpeg · wav · mp4 · webm | ✅ sva 4 | ✅ da |
| `audio-isolation` | `input_media_minutes` | `audio` | mpeg · wav · mp4 · webm | ✅ sva 4 | ✅ da |
| `dubbing` | `input_media_minutes` | `video` + `audio` | sva 3 + sva 4 | ✅ svih 7 | ✅ da |

**Nijedan model nije vraćen a nepokriven.** Svih sedam ima `isEnabled`
nedefinisan u seed-u (dakle uključen), i svaki MIME tip svakog mernog slota stoji
u `MEASURABLE_MIME` (`lib/media-duration.ts:58-67`). To nije zaključak čitanjem
— to tvrdi mašinski test `convex/providers/catalogModels.test.ts:390` i `:407`,
koji pukne čim neko doda format u `AUDIO_ACCEPT`/`VIDEO_ACCEPT` a ne doda ga u
parser. Uslov je pravilno pretvoren u podatak.

`tts` i `dialogue` mere se iz teksta (`text_length`) i nikad nisu ni gašeni.

### Ali „pokriven MIME tipom" nije „izmeren tačno"

Četiri stvari koje tabela iznad ne kaže:

1. **WebM/MKV bez `Duration` u Segment Info** → `ZAGLAVLJE_NIJE_PROCITANO`, posao
   odbijen. To je izlaz browserovog `MediaRecorder`-a, dakle **najverovatniji
   fajl koji će korisnik dobiti ako snimi zvuk u samoj aplikaciji**. Pada bezbedno
   (ne naplaćuje se), ali će se javljati često i poruka mora da bude jasna.
2. **Fragmentovan MP4 (`mvhd.duration` = 0 ili `0xFFFFFFFF`)** → odbijen. Bezbedno.
3. **`moov` dalje od 512 kB od oba kraja** → odbijen. Bezbedno.
4. **VBR MP3 bez Xing/VBRI** → **procenjen, i procena ume da bude pogrešna u obe
   strane** (`media-duration.ts:329-331`). Jedini od četiri koji vraća broj umesto
   da odbije. Videti **R3** tačka 2.

I iznad svega toga: zaglavlje je metapodatak, a naplaćuje se medij. Sedam modela
je vraćeno u ponudu na osnovu tvrdnje koju fajl sam o sebi daje. **Merenje jeste
neuporedivo bolje od klijentove prijave, ali nije dokaz** — i dok donja granica
iz bajtova ne postoji, ova tabela govori o pokrivenosti formata, ne o tačnosti
naplate.

---

## 5. SPREMNO ZA NAPLATU?

**Ne — grana je tehnički čista i marža je algebarski osigurana, ali tri stvari
stoje između Jovana i prvog naplaćenog evra: nijedan provajder nikad nije
pozvan uživo, sedam modela se naplaćuje po broju koji fajl sam o sebi tvrdi dok
oba plafona troška mere taj isti broj (N2), i u repou ne postoji nijedan pravni
tekst.**

### Blokiralo bi naplatu — mora pre prvog evra

| # | Šta | Zašto je blokada |
|---|---|---|
| 1 | **Uslovi korišćenja i politika privatnosti** — ne postoje. `find app -iname "*terms*" -o -iname "*privacy*"` vraća prazno; string „nepovratni"/„non-refundable" ne postoji nigde u repou | Prodaja kredita bez uslova je prodaja bez pravila. Bez klauzule „krediti su nepovratni" nemaš odgovor na chargeback (rupa **d4** iz noćnog izveštaja je i dalje otvorena — `charge.refunded`, `charge.dispute.created` i `invoice.payment_failed` se ne obrađuju: `app/api/stripe/webhook/route.ts` ima 6 `case`-ova i nijedan od ta tri). Bez politike privatnosti nemaš osnov za **N1** — admin i moderator vide tuđe promptove i tuđe okačene snimke |
| 2 | **Donja granica trajanja iz bajtova** (R3 tačka 3) ili gašenje `dubbing`, `voice-changer`, `audio-isolation` | **N2**: 6,50 € kredita → do $3 600 fal računa dnevno po nalogu, a nijedan plafon ne opali i nijedan alarm ne postoji |
| 3 | **Prva živa generacija po modelu, sa fakturom** | Nijedan poziv nijednom provajderu nikad nije napravljen. Imena polja u `falInputs.ts` su po konvenciji a nepotvrđena; `previous_interaction_id` kod `gemini-omni` je pretpostavka; `Range` na Convex storage-u (od kojeg zavisi celo merenje) je pretpostavka; MiniMax H3 tarifa je sporna (**R6**) i pri lošijoj cifri marža pada na 1,25× |
| 4 | **VAT/PDV** — `automatic_tax` se ne postavlja nigde u `lib/stripe.ts` | Prodaja digitalne usluge fizičkim licima u EU bez obračuna PDV-a je poreski problem od prvog računa, ne od stotog |

### Ručni koraci na deployment-u — bez njih pola grane ne radi

Redosled je namenski.

1. `npx convex env list` — moraju da postoje `INITIAL_ADMIN_EMAILS` (bez nje
   admin uloga ne postoji uopšte), `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM`
   (bez njih se plafon aktivira nemo), `WEBHOOK_SYNC_SECRET`, `FAL_KEY`.
   `SITE_URL` i `FAL_REST_BASE_URL` su opcioni.
2. **Rotiraj `WEBHOOK_SYNC_SECRET`** (rupa **d5** iz noćnog izveštaja). Ko zna
   taj string može da doda proizvoljno kredita proizvoljnom korisniku, sa bilo
   koje mašine.
3. `npm run convex:seed` — **bez ovoga R5 nije zatvoren** (legacy redovi ostaju
   upaljeni u bazi) i sedam vraćenih modela nema svež `paramSpec`/`priceRule`.
4. `npx convex run migrations:run '{"fn":"migrations:backfillStudioUploads"}'` —
   bez toga „Generiši ponovo" na svakom starom poslu vraća `TUDJI_FAJL`.
5. `npx convex run migrations:run '{"fn":"migrations:enableMeasuredModels"}'` —
   sedam modela je u kodu upaljeno, u bazi nije (seed sme da gasi, ne da pali).
   **Ne pokreći dok ne rešiš stavku 2 iz tabele iznad.**
6. `npx convex run migrations:run '{"fn":"migrations:backfillGenerationJobProvider"}'` —
   bez toga google poller ne vidi zatečene `running` poslove.
7. **Deploy** — šest crona (`crons.ts`) se registruje tek pri deploy-u; do tada
   globalni plafon, reaper, poller, istek kredita/fajlova i fal rekonsilijacija
   ne rade na deployment-u.
8. Proveri `Range`: `curl -s -o /dev/null -w "%{http_code}\n" -H "Range: bytes=0-99" "<potpisan storage URL>"`
   mora da vrati **206**. Ako vrati 200, merenje pada i sedam modela javlja da ne
   ume da pročita trajanje.
9. Dopiši `tokenRatesUsdPerMillion.prompt` na `nano-banana-pro` sa prve fakture,
   pa `npm run convex:seed` — dok toga nema, `actualCostUsd` je prazan za sve
   (**N6**) i ne postoji nijedan detektor za **N2**.

### Šta NE blokira, ali ide u backlog

Retencija ulaznih fajlova (**N7**) · audit log za admin pregled i sužavanje
`listAllJobs` payload-a (**N1**) · rate limit na `measureInputUpload` (**N4**) ·
alarm na neuspeh plafona (**N5**) · `registerInputUpload` da prima samo ID koji
je sam izdao (**N3**) · serverske količine da ne odlaze provajderu (**R8**) ·
`referenceVideoBillableSeconds` i katalog 3.4 da se poklope (**R2**, rep) ·
squash duplih commit-ova W4/W5.

---

## 6. Preporuka

Grana je u znatno boljem stanju nego posle kataloškog run-a: četiri od pet
nalaza su stvarno zatvorena, i zatvorena kodom koji test pokriva, a ne
komentarom. Lint je pao sa 17 na 8, testova je +95, marža je merena i drži se na
2,5000× kroz tri miliona kombinacija.

Ali dva koraka su prijavila više nego što su isporučila. **W5** je sedam modela
vratio u prodaju na osnovu merenja koje je bolje, a ne pouzdano — i pritom je
uklonio jedinu unakrsnu proveru koju je W3 uveo. **W6** je napisao ceo mehanizam
za stvarni trošak koji danas ne proizvodi nijedan podatak, pa je i alarm koji bi
prvi problem uhvatio — mrtav. Ta dva zajedno su **N2**: 6,50 € prema $3 600, bez
ijednog plafona koji to vidi.

Sledeći korak nije nov feature. To je donja granica trajanja iz bajtova
(desetak linija, hvata i hex editor i podvaljen MP3), pa tek onda prva živa
generacija po modelu sa fakturom u ruci. Do tada tri najskuplja merena modela
treba da stoje ugašena, a uslovi korišćenja da se napišu pre nego što se uključi
Stripe.
