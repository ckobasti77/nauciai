# Studio — revizija hard run-a (X1–X7)

> 21. avgust 2026 · grana `feat/studio-faza-a` · HEAD `e51c2c8`
> Revizija, ne nov kod. **Nijedan fajl proizvoda nije menjan tokom ovog koraka.**
> Privremeni revizorski alat (`convex/__xrv_audit.test.ts`) je obrisan posle
> merenja; svi brojevi u sekcijama 2 i 3 su njegov izlaz, ne procena.
> Metod za sekciju 1: čitan je **kod na koji nalaz pokazuje**, ne sekcija
> dnevnika koja tvrdi da je popravljen.

---

## 0. Verifikacija — tačan izlaz

Sve četiri komande su pokrenute nad čistim stablom (pre nego što je revizorski
alat uopšte napravljen), redom, na ovoj mašini.

| Komanda | Izlaz | exit |
|---|---|---|
| `npx convex codegen` | `Finding component definitions... / Generating server code... / Bundling component definitions... / Bundling component schemas and implementations... / Downloading current deployment state... / Uploading functions to Convex... / Generating TypeScript bindings... / Running TypeScript...` | **0** |
| `npm run lint` | `✖ 8 problems (0 errors, 8 warnings)` | **0** |
| `npm run test` | `Test Files  62 passed (62)` · `Tests  879 passed (879)` · `Duration  8.94s` | **0** |
| `npm run build` | `✓ Compiled successfully in 14.7s` · `Finished TypeScript in 18.9s` · `✓ Generating static pages using 15 workers (64/64) in 265ms` | **0** |

**Sve četiri prolaze čisto.**

**Osam upozorenja, imenovana:** `components/app/admin-inline-actions.tsx` (3:
`PlaybackTokenState`, `title`, `<img>`), `components/app/dashboard-content.tsx`
(2: `PlaybackTokenPayload`, `title`),
`components/marketing/public-course-intro-video.tsx` (2: `cn`, `title`),
`get_google_creds.js` (1). Nijedan nije u fajlu koji je X1–X7 dirao — isti
skup od 8 koji je nasledjen iz W run-a.

**Testova je 879, u 62 fajla** (zatečeno posle W run-a: 741 u 58). +138.

### Dve stvari koje se ne poklapaju sa dnevnikom

1. **`chat.test.ts` NE pada.** X7 je pod `BLOKADA:` prijavio
   `Test timed out in 5000ms` na
   `convex/chat.test.ts > inbox summary stays exact beyond one thousand memberships`
   i zapisao `Tests 1 failed | 878 passed (879)`. U ovom prolazu ceo suite
   prolazi za 8,94 s, uključujući taj test. Broj testova je isti (879), dakle
   nijedan nije dodat ni uklonjen. **Zaključak: to je bilo opterećenje mašine,
   tačno kako je X7 i pretpostavio, i taj `BLOKADA:` unos treba čitati kao
   „prolazi", ne kao otvoren kvar.** X7 je bio u pravu što nije „popravio" test
   podizanjem timeout-a.
2. **Build daje 64 stranice, ne 60.** X7 je prijavio
   `Generating static pages (60/60)`, a stvaran izlaz je `(64/64)` — jer je X7
   sam dodao dve rute na dva jezika (`/[locale]/uslovi-studio`,
   `/[locale]/politika-privatnosti`, obe u izlazu build-a). Sitnica, ali je
   prijavljen broj bio prepisan iz prethodnog koraka umesto pročitan.

### Obim

```
git diff --stat main...HEAD
333 files changed, 59788 insertions(+), 534 deletions(-)
```

```
e51c2c8 wip: stanje pre hard run-a
3a23a5d studio(X7): Pravni tekst, 18+, PDV i tri Stripe dogadjaja kojih nema
eeb157e studio(X6): N5 i N7: plafon koji tiho pukne, i ulazi koji ostaju zauvek
675a255 studio(X5): N3 i N4: vlasnistvo po izdatom tokenu, i brava na merenje
2fff0a8 studio(X4): N1: moderator ne sme da vidi tudje promptove i tudje snimke   ← duplikat
e40ffab studio(X4): N1: dva nivoa uvida u tudje poslove, dnevnik otkrivanja      ← duplikat
a32f431 studio(X3): N6: actualCostUsd da stvarno proizvodi podatke, i da glasno cuti
63f9f82 studio(X2): N2 druga polovina: naplata po stvarnom trosku, poravnanje razlike
b62f570 studio(X1): N2 prva polovina: donja granica trajanja iz bajtova
42649f3 wip: stanje pre hard run-a
```

X4 ima dva commit-a, isti obrazac koji je prethodni izveštaj već prijavio za
W4/W5. Squash pre merge-a i dalje stoji na spisku.

---

## 1. Status po nalazu — iz koda, sa linijom

| # | Bio | **Sad** | Jednom rečenicom |
|---|---|---|---|
| **N1** admin/moderator vidi tudje | 🟠 | 🟠 **delimično** | moderator je stvarno sužen; **admin i dalje dobija ceo red bez ijednog traga** |
| **N2** plafoni mere broj koji napadač bira | 🔴 | 🔴 **otvoren** | granica visi o MIME tipu koji **klijent sam pošalje**; napad prolazi sa istim brojkama kao pre |
| **N3** `registerInputUpload` „ko prvi" | 🟡 | 🟠 **delimično** | dozvola postoji, ali se izdaje neograničeno, pa je prozor „od sada pa nadalje", ne zatvoren |
| **N4** merenje bez ograničenja | 🟡 | 🟢 **zatvoren** | dva brojača pre ijednog `fetch`-a, najviše 90 čitanja na sat po korisniku |
| **N5** plafon koji tiho pukne | 🟡 | 🟢 **zatvoren** | `try/catch` + `cron_failed` red + mejl + heartbeat na admin ekranu, i greška se ponovo baca |
| **N6** `actualCostUsd` se ne upisuje | 🟡 | 🟠 **delimično** | rupa je zamenjena razlogom (dobro), ali broj koji izlazi je **naša sopstvena tarifa** |
| **N7** ulazi ostaju zauvek | 🟡 | 🟢 **zatvoren** (za nove poslove) | `deleteJob` briše, `finalizeOutput` postavlja rok, reaper kupi |
| **R3** klijent bira koliko plaća | 🟠 | 🟠 **delimično, nepromenjeno po suštini** | zaglavlje i dalje nije medij; nova granica se zaobilazi jednim HTTP zaglavljem |
| **R6** MiniMax H3 sporna tarifa | 🟡 | 🟡 **otvoren, nepromenjen** | `falVideoModels.ts:325` i dalje `baseUsd: 0.05`, `:327` `"2K": 2.6` |
| **R7** Nano Banana Pro thinking tokeni | 🟠 | 🟠 **nepromenjen po podatku, bolji po vidljivosti** | `googleImageModels.ts:141` i dalje bez `prompt` tarife |
| **R8** serverske količine idu provajderu | 🟡 | 🔴 **otvoren, i sada je OPASNIJI** | `studioActions.ts:172` i dalje šalje `{ ...params }`; X2 taj isti broj čita nazad kao istinu |

---

### 🔴 N2 — **OTVOREN.** Granica iz X1 visi o podatku koji klijent bira

Ovo je glavni nalaz izveštaja i razrađen je brojkama u sekciji 2. Ovde stoji
samo mehanika.

X1 je uveo dve granice iz veličine fajla
(`lib/media-duration.ts:93` `MAX_PLAUSIBLE_BITRATE_BPS`, `:125`
`MIN_PLAUSIBLE_BITRATE_BPS`, `:144` `lowerBoundSeconds`, `:149`
`upperBoundSeconds`), a `convex/studioJobCore.ts:323` `boundedInputSeconds` ih
primenjuje pre naplate. Račun je tačan i testovi ga pokrivaju.

**Ali obe tabele su ključevane po `mimeType`-u**, a taj string dolazi ovako:

1. `convex/studio.ts:1428` `createInputUploadUrl` izdaje upload URL.
2. Klijent radi `POST` sa zaglavljem `Content-Type` koje sam bira —
   `components/studio/use-slot-upload.ts:75`
   `request.setRequestHeader("Content-Type", file.type)`. Convex taj string
   upisuje kao `contentType` fajla.
3. `convex/studio.ts:1463` `registerInputUpload` prepiše ga na red:
   `...(meta.contentType ? { mimeType: meta.contentType } : {})`.
   **Nigde se ne poredi sa `accept` listom slota.** `accept` se u celom
   serverskom kodu čita samo kao tip (`studioJobCore.ts:17`, `:42`) — nijedna
   provera ga ne koristi. `sanitizeJobInputs` (`studioJobCore.ts:105`) proverava
   IME slota i BROJ fajlova, ne tip.
4. `convex/studio.ts:117` `ownedInputUploads` prosledi taj `mimeType` u granice.

A parser **ne gleda `mimeType` uopšte** — `lib/media-duration.ts:174`
`readMediaDuration` bira format po **potpisu u bajtovima** (`RIFF/WAVE`,
`\x1a\x45\xdf\xa3`, `isIsoBmff`, `isMp3`). `convex/studioActions.ts:354`
`readDurationOverRange(url, upload.bytes)` mu MIME ni ne prosledjuje.

**Dve polovine iste odbrane gledaju u dva različita podatka.** Napadač okači
fajl koji se čita kao MP4 (pa mu se `mvhd` pročita), a prijavi ga kao
`video/quicktime` — čija je gornja tarifa `200_000_000` bps
(`media-duration.ts:109`). Donja granica tada iznosi
`bajtovi × 8 / 200 Mbps`, dakle **2,3 sekunde za fajl od 57,6 MB**, i zaglavlje
od 6 sekundi je nadjača. Još jednostavnije: prijavi `application/octet-stream`
— tip nije ni u jednoj tabeli, `boundSeconds` vrati `null`
(`media-duration.ts:159`), pa **granice nema uopšte**, a merenje i dalje radi
jer sniff-uje bajtove.

`X1 ODLUKA 1` je ovu klasu dotakla („`registerInputUpload` upisuje `mimeType`
iz `_storage` bez poredjenja sa `accept` listom") i rešila je **jednim dodatim
redom u tabeli** (`audio/x-wav`). Zaključak koji je izostao je da klijent taj
string **bira**, pa dodavanje redova u tabelu ne pomaže — jedini red koji
napadaču treba je onaj sa najvišom tarifom, ili nijedan.

Druga polovina odgovora, poravnanje iz X2 (`convex/studio.ts:701`
`settleJobCredits`), radi tačno kako je opisano, ali **ne može da poravna ono
što provajder nije javio**: `planSettlement`
(`studioSettlementCore.ts:208`) na `reportedSeconds === null` i
`reportedCostUsd === null` vraća `{ settled: false }` i ostavlja rezervaciju.
Za `dubbing` je jedini izvor `readReportedSeconds(body.payload)`
(`falWebhook.ts:126`) nad oblikom koji **nije potvrđen protiv živog API-ja**
(X2 ODLUKA 6 to i kaže). Dakle: odbrana koja radi zavisi od pretpostavke, a
odbrana koja ne zavisi od pretpostavke (X1) se zaobilazi jednim HTTP zaglavljem.

---

### 🟠 N1 — **DELIMIČNO.** Moderator je zatvoren, admin nije

**Šta jeste zatvoreno.** `convex/studio.ts:990` `toModerationJob` vraća model,
vrstu, status, kredit, `outputUrl`, `inputMode`, greške i vremena — **bez
`params` i bez `inputThumbs`**. Razdvajanje je urađeno ispravno, kao dve
funkcije a ne kao brisanje polja na kraju, pa se tuđi fajlovi moderatoru
**ne potpisuju** (`resolveInputThumbs` se za njega ne zove uopšte).
`convex/studio.ts:1093` `listAllJobs` bira po ulozi:
`role === "admin" ? await toGalleryJob(...) : await toModerationJob(...)`.
`listJobOwners` moderatoru vraća `ownerHandle`, ne mejl.

**Šta je ostalo otvoreno, i to je bitno.** Za admina `listAllJobs` i dalje zove
`toGalleryJob` (`convex/studio.ts:966`), koji nosi **ceo prompt i četiri
potpisana URL-a tuđih fajlova** — i to **bez ijednog reda u dnevniku**. Dnevnik
(`studioAuditLog`) piše isključivo `revealJobDetail`
(`convex/studio.ts:1208`), dakle **klik u UI-ju**, a ne pristup podacima.
Admin koji otvori DevTools, ili koji pozove `listAllJobs` iz konzole, dobija sve
i ne ostavlja trag.

X4 ODLUKA 2 ovo otvoreno priznaje i objašnjava zašto (spisak testova u zadatku
tražio je „admin dobija pun red"). To je poštena prijava, ali **ne menja to da
sekcija N1 tačka 2 — „nema traga ko je šta gledao" — za ulogu koja stvarno
vidi sve i dalje važi.** Dnevnik danas beleži kad je admin kliknuo na dugme, a
ne kad je podatak izašao sa servera. Popravka je jedan red i jedan assertion,
tačno kako je X4 i napisao.

Uz to: moderator i dalje vidi **mejl vlasnika** na svakoj kartici
(`convex/studio.ts:1151`, `ownerEmail: emailByUser.get(job.userId) ?? ""`), pa
anonimizacija u `listJobOwners` sprečava masovan spisak u jednom pozivu, ali ne
i sakupljanje listanjem stranica. X4 ODLUKA 3 to takođe priznaje.

---

### 🟠 N3 — **DELIMIČNO.** Dozvola postoji, ali se štampa neograničeno

`convex/studio.ts:1463` `registerInputUpload` sada traži `grantId`, i traži
četiri stvari: dozvola je tog korisnika, neiskorišćena, neistekla, i fajl je
nastao POSLE nje (`meta._creationTime >= grant.createdAt − 60 s`). Slot dolazi
iz dozvole, ne sa klijenta. To je stvarna popravka i zatvara **prošlost**:
zatečen `_storage` ID (naslovna slika kursa, video lekcije, avatar) više se ne
može prisvojiti.

Ostaje **budućnost**. `convex/studio.ts:1428` `createInputUploadUrl` prima
`slot: v.string()` bez ijedne provere i **nema nikakav rate limit** — svaki
poziv upisuje nov red u `studioUploadGrants`. Napadač koji minutu po minutu
kuje sveže dozvole u svakom trenutku ima važeću, pa za svaki fajl koji bilo ko
okači POSLE tog trenutka i dalje važi stara odbrana: **nepogodivost ID-ja**. A
baš to je prvobitni nalaz R4 nazvao „nije kontrola pristupa".

Sporedna posledica iste rupe: neograničen broj upisa u tabelu iz jedne
korisničke sesije. Reaper ih kupi po `expiresAt`, ali tek na sat vremena.

---

### 🟢 N4 — **ZATVOREN**

`convex/studio.ts:1520` `getOwnedUpload` vraća `measureBlocked`, koji
`convex/studioCore.ts:438` `isMeasureBlocked` računa iz dva broja: tri neuspeha
nad istim redom (`MAX_MEASURE_FAILURES = 3`, `studioCore.ts:417`) i 30 uploada u
poslednjem satu (`MEASURE_UPLOAD_HOURLY_LIMIT = 30`, `:429`, prozor preko
indeksa sa `take` odmah iznad granice). `convex/studioActions.ts:325` proverava
to **pre `ctx.storage.getUrl` i pre ijednog `fetch`-a**. Gornja granica čitanja
je 30 × 3 × 1 MB = **90 MB na sat po korisniku**, i to je stvarna granica, ne
tvrdnja. Uspešno merenje briše brojač.

Cena koju je X5 ODLUKA 4 pošteno prijavio i dalje stoji: korisnik koji u jednom
satu okači 30 slika neće moći da izmeri 31. fajl. Ima poruku, nije gubitak
podataka.

---

### 🟢 N5 — **ZATVOREN**

`convex/crons.ts:389` `enforceGlobalCostCap` zove `applyGlobalCostAction` u
`try/catch`, na grešku upisuje `cron_failed` red (`crons.ts:262`
`recordCronFailure`, najviše jedan po danu), šalje mejl sa tačnim tekstom
greške, **i onda grešku ponovo baca** — pa i Convex-ov sopstveni dnevnik
funkcija vidi neuspeh. Uspešan prolaz upisuje heartbeat
(`crons.ts:250`, tabela `studioCronHeartbeats`), a `studioAdmin.ts:102`
`getUsageSummary` ga vraća admin ekranu, koji crveni preko 60 minuta.

Jedini rep: **cron koji se uopšte ne registruje** (npr. deploy nije urađen) ne
šalje ništa — samo stari heartbeat, koji se vidi tek kad neko otvori admin
ekran. Nije regresija, jeste granica dizajna.

---

### 🟠 N6 — **DELIMIČNO.** Rupa je zamenjena razlogom; broj koji izlazi je naš sopstveni

**Ono što jeste popravljeno je stvarno popravljeno.** Svaki završen posao sada
izlazi sa cenom ili sa razlogom (`convex/studioActualCost.ts:299`
`recordProviderCost`), sedam razloga je imenovano
(`studioActualCostCore.ts` `ACTUAL_COST_REASON`), nerazumljiv odgovor ostavlja
sirov JSON u `studioProviderSamples`, a test `assertNoSilentGaps` tvrdi da
nijedan `done` posao nema ni jedno ni drugo. Nema više tihe praznine. To je
tačno ono što je nalaz tražio.

**Ono što nije rečeno je da broj koji sada izlazi za dva od tri provajdera
nije cena provajdera nego naša.** `convex/studioActualCost.ts:257`
`quantityCostOutcome` računa:

```ts
return { ok: true, usd: computeCostUsd(rule, params, pricingMode) };
```

Dakle **naš `priceRule` primenjen na količinu koju je provajder javio**. Za
`veo-31-fast`, `gemini-omni`, `seedance-20` i `seedance-25` to znači da kolona
„Stvarna marža" pokazuje `krediti / (naša tarifa × naša količina)` — a to je po
konstrukciji **tačno 2,5×**, bez obzira na to šta je Google ili BytePlus
naplatio. Iz istog razloga alarm na odstupanje preko 30% za te modele
**ne može da opali**: poredi se `settledCostUsd ?? actualCostUsd` sa
`estimatedCostUsd`-om, a oba izlaze iz istog `computeCostUsd`-a nad istom
količinom.

Posledica po dva otvorena nalaza: **R6 (sporna MiniMax tarifa) i R7 (Google
thinking tokeni) su tačno one greške koje ovaj detektor po konstrukciji ne može
da vidi**, jer obe žive u `baseUsd`/`addUsd`-u koji detektor koristi kao merilo.

Stanje po provajderu, danas:

- **fal (23 od 30 modela):** `actualCostUsd` dolazi isključivo iz noćnog prolaza
  nad `GET /v1/models/billing-events`, čija imena polja nisu potvrđena. Do tada
  posao nosi razlog `fal billing event nije stigao` (`falWebhook.ts:186`).
  **Nula stvarnih cena.**
- **Google:** `nano-banana-pro` i dalje izlazi sa `nema tarife za kategoriju
  prompt`, jer `googleImageModels.ts:141` ima `output` i `thinking` a ne
  `prompt`. `veo-31-fast` i `gemini-omni` idu putem po količini — dakle našom
  tarifom.
- **BytePlus:** nijedan red nema `tokenRatesUsdPerMillion`; sve ide putem po
  količini — dakle našom tarifom.

**Nijedan model danas ne proizvodi cenu koju je provajder stvarno naplatio.**
X3 je to napisao kao „mehanizam radi, čeka prvu fakturu", što je tačno — ali
tabela „Stvarna marža" od sada za četiri modela pokazuje broj koji **izgleda
kao merenje a nije**, i to je gore od praznog polja, jer prazno polje niko ne
čita kao potvrdu.

---

### 🟢 N7 — **ZATVOREN, za poslove koji se završe posle deploy-a**

`convex/studio.ts:1381` `deleteJob` briše i ulazne fajlove (red u
`studioUploads` i sam blob), ali samo one koje nijedan drugi posao istog
korisnika ne navodi — `storageIdsUsedByOtherJobs` (`convex/studio.ts:1346`)
čita CEO spisak poslova korisnika, bez `take`-a. Konzervativno i ispravno: to je
jedino mesto gde bi promašaj trajno uništio fajl drugog posla.
`convex/studio.ts:871` u `finalizeOutput` postavlja rok ulazu na rok izlaza
`Math.max`-om — nikad ga ne skraćuje, pa deljen fajl preživi dok ga bar jedan
posao drži. Postojeći `crons.expireGenerationFiles` ih dalje kupi po istom
`by_expiry` indeksu; nov cron nije trebao.

Rep koji X6 sam prijavljuje: zatečen `done` posao od pre ovog koraka nikad neće
dobiti rok na svoj ulaz, jer se `finalizeOutput` za njega više ne pokreće.
Migracija za to ne postoji i nije tražena.

---

### 🟠 R3 — **DELIMIČNO, i po suštini nepromenjeno**

Tri tačke iz prethodnog izveštaja, jedna po jedna:

1. **„Zaglavlje nije medij."** Formalno popravljeno donjom granicom, stvarno
   zaobiđeno preko `mimeType`-a — videti **N2** i sekciju 2.
2. **„VBR MP3 bez Xing/VBRI."** **Stvarno popravljeno.** `readMp3` sada šeta do
   200 frejmova i računa po proseku, a kad se tarife razlikuju više od
   dvostruko vraća `VBR_NEPOUZDAN` i **odbija posao** umesto da vrati pogrešan
   broj. X1 ODLUKA 2 je izabrala strožu od dve moguće interpretacije zadatka i
   obrazložila je računicom (naplata po donjoj granici bi dala maržu 0,25×). To
   je jedini deo X1 koji je zatvoren bez ograde.
3. **„Uklonjena je jedina unakrsna provera."** Vraćena je, i to sa obe strane
   (donja i gornja granica). Da granica visi o `mimeType`-u — videti N2.
4. **„Pošten dug fajl se pod-naplaćuje."** Nepromenjeno.
   `convex/studioJobCore.ts:452` `clampQuantity` i dalje seče naviše na
   kataloški `max`: 180 minuta se naplati kao 120, marža 2,5 × 120/180 = **1,67×**.
   Zabeleženo, nije hitno, i dalje nije hitno.

---

### 🟡 R6 — **OTVOREN, NEPROMENJEN**

`convex/providers/falVideoModels.ts:325` `baseUsd: 0.05`, `:327`
`{ "480p": 1, "768p": 1.2, "2K": 2.6, "4K": 3.2 }`. Dakle 2K je i dalje
`0,05 × 2,6 = $0,13/s`. Nijedna faktura nije viđena. Ako je tačna cifra
$0,26/s, marža na 2K je 1,25×, a **detektor iz X3 to ne može da vidi**
(videti N6).

---

### 🟠 R7 — **PODATAK NEPROMENJEN, VIDLJIVOST BOLJA**

`convex/providers/googleImageModels.ts:141`
`tokenRatesUsdPerMillion: { output: 119.64, thinking: 12 }` — i dalje bez
`prompt`, pa `tokenCostOutcome` vraća `null` za svaki Google poziv, jer
`usageMetadata` uvek nosi `promptTokenCount`. Razlika u odnosu na pre: posao
sada izlazi sa **imenovanim** razlogom (`nema tarife za kategoriju prompt`)
umesto sa praznim poljem, i admin ekran pokazuje koja tačno jedna cifra fali.
X3 ODLUKA 1 je odbila da prepiše Flash cifru od $0,50/M na Pro — to je ispravna
odluka i treba je zadržati.

---

### 🔴 R8 — **OTVOREN, i sada je OPASNIJI nego kad je zapisan**

`convex/studioActions.ts:172`:

```ts
input: { ...params, ...falInputFields(inputMode ?? "", urls) },
```

`params` je ono što je `buildCatalogOrder` upisao, uključujući **serversku
količinu** koju je sam dopisao (`convex/studio.ts:220`
`params[source.param] = measured.quantity`). Dakle fal i dalje dobija
`minutes`, `char_count` i `duration` kao polja zahteva. To je nepromenjeno.

**Ono što jeste promenjeno je da smo taj isti broj počeli da čitamo nazad kao
istinu.** `convex/studioSettlementCore.ts:41` `DURATION_KEYS` sadrži
`minutes: 60`, `seconds: 1` i golo `duration: 1`, a
`convex/studioSettlementCore.ts:93` `readReportedSeconds` rekurzivno traži bilo
koji od njih **bilo gde u odgovoru provajdera, do dubine 6**. Videti **Y2** u
sekciji 4 — ovo je najskuplja od novih rupa.

---

## 2. N2 — napad brojkama, korak po korak

Traženi scenario: **nalog sa 650 kredita, model `dubbing`, zaglavlje 0,1 min,
fajl 120 min.** Sve brojke ispod su izlaz revizorskog alata nad zatečenim
kodom, ne procena.

Ulazni podaci iz kataloga: `dubbing` je `unit: "minute"`, `baseUsd: 0.6`,
`quantityParam: "minutes"` (`falAudioModels.ts:404`), a
`MINUTE_QUANTITY` ima `min: 0.1`, `max: 120` (`falAudioModels.ts:124`).
Stvaran trošak za 120 minuta: **$72,00 = 62,28 €**.

### Pet varijanti istog napada

| | fajl | prijavljen `Content-Type` | donja granica | naplaćeno | krediti | **marža** | poslova iz 650 kr |
|---|---|---|---:|---:|---:|---:|---:|
| **A** | 120 min MP3 128 kbps (115,2 MB) | `audio/mpeg` | 2 880 s | 48 min | 6 228 | **1,0000×** | **0** |
| **B** | 120 min Opus 12 kbps (10,8 MB) | `audio/webm` | 168,75 s | 2,9 min | 377 | **0,0605×** | 1 |
| **C** | 120 min MP4/AAC 64 kbps (57,6 MB) | **`video/quicktime`** | **2,30 s** | **0,1 min** | **13** | **0,0021×** | **50** |
| **D** | isti fajl kao C | **`application/octet-stream`** | **NEMA** | **0,1 min** | **13** | **0,0021×** | **50** |
| **E** | isti fajl kao C | *bez `Content-Type`-a* | **NEMA** | **0,1 min** | **13** | **0,0021×** | **50** |

Red **A** je ono što je X1 hteo da postigne i stvarno postiže: napadač koji
okači pošten MP3 i prepravi mu zaglavlje **ne prolazi** — 6 228 kredita mu
niko ne odobrava sa 650 na računu, posao pada na `NEDOVOLJNO_KREDITA`.
Da je `mimeType` bio podatak koji server zna, N2 bi ovim bio zatvoren.

Red **B** pokazuje da i unutar poštenog MIME tipa granica nije mreža nego sito:
Opus na 12 kbps je legalan govorni zapis, a granica ga vidi kao 2,9 minuta.

Redovi **C**, **D** i **E** su isti fajl sa različitim zaglavljem zahteva i
**vraćaju tačno prvobitne brojke iz N2**: 13 kredita za $72,00.

### Šta se tačno dešava na svakom koraku (scenario C)

1. **Dozvola.** `createInputUploadUrl({ slot: "audio" })` — bez provere imena
   slota, bez rate limita (`convex/studio.ts:1428`).
2. **Upload.** `POST` na izdati URL, telo je MP4 kontejner sa 120 minuta AAC-a
   na 64 kbps (57,6 MB) i `mvhd.duration` prepravljenim na 6 sekundi. Zaglavlje
   zahteva: `Content-Type: video/quicktime`.
3. **Prijava.** `registerInputUpload` (`:1463`) upiše red:
   `bytes = 57 600 000` (iz `_storage`, tačno), `mimeType = "video/quicktime"`
   (iz `_storage`, ali `_storage` ga je dobio od napadača). Slot iz dozvole je
   `audio`; **niko ne poredi `video/quicktime` sa `AUDIO_ACCEPT`.**
4. **Merenje.** `measureInputUpload` (`studioActions.ts:311`) povuče 512 kB
   glave, `readMediaDuration` sniff-uje `ftyp` → MP4 parser → `mvhd` →
   **6 sekundi**. Rate limit ga ne dira (prvi poziv). Upiše `durationS = 6`.
5. **Rezervacija.** `createJob` → `buildCatalogOrder` (`studio.ts:166`) →
   `ownedInputUploads` (`:117`) vrati `{ seconds: 6, bytes: 57 600 000,
   mimeType: "video/quicktime" }` → `boundedInputSeconds`
   (`studioJobCore.ts:323`):
   - `upperBoundSeconds` = 57,6 MB × 8 / 100 kbps = **4 608 s**; 6 < 4 608, pa
     `ZAGLAVLJE_NEMOGUCE` ne opali;
   - `lowerBoundSeconds` = 57,6 MB × 8 / **200 Mbps** = **2,30 s**;
     2,30 < 6, pa se **ništa ne podiže**;
   - `durationSource: "header"` — dakle **ni trag koji je X1 uveo ne postoji**,
     posao izgleda kao svaki pošten posao.
6. **Poravnanje količine.** `resolveMeasuredQuantity` (`:427`):
   6 s / 60 = 0,1 min → `Math.ceil(0,1 × 10)/10` = 0,1 → `clampQuantity` na
   `[0,1; 120]` → **0,1**.
7. **Cena.** `computeCredits` → `ceil(0,1 × 0,6 × 216,25)` = `ceil(12,975)` =
   **13 kredita**, `estimatedCostUsd = $0,06`.
8. **Kapije `createJob`-a, redom** (`convex/studio.ts:386-511`):
   - kill switch — ugašen nije;
   - `hasStudioAccess` — **napadač mora da ima aktivan upis** (ili da bude
     admin/moderator). Ovo je jedina stvarna prepreka i vredi je zapisati:
     napad košta pretplatu, ne samo 6,50 €;
   - `USLOVI_NEPRIHVACENI` — jedan klik;
   - `SPOR_U_TOKU`, `SALDO_U_MINUSU`, `NEPORAVNAT_DUG` — sve prazno;
   - `MAX_ACTIVE_JOBS = 3` — ograničava paralelizam, ne dnevni zbir;
   - `PREVISE_NEPORAVNATOG`: zbir `estimatedCostUsd`-a poslova u letu prema
     `MAX_UNSETTLED_COST_USD = 3`. Sa $0,06 po poslu to je **$0,18 za tri
     posla** — plafon ne opali nikad;
   - `MAX_DAILY_GENERATIONS = 50`;
   - `DNEVNI_LIMIT_TROSKA`: `MAX_DAILY_COST_USD = 5` prema $0,06 po poslu →
     **83 posla**, dakle brojčani plafon od 50 opali prvi.
9. **Skidanje kredita.** 13 × 50 = **650 kredita = 6,50 €**.
10. **Šta plafoni vide na kraju dana:** `studioUsageDaily.costUsd = $3,00`.
    **Šta fal naplati: $3 600,00.** Globalni alarm je na $50, kill na $100 — da
    bi se kill uopšte dotakao, jednom nalogu bi trebalo **1 667 poslova**.
11. **Poravnanje.** `settleJobCredits` se zakazuje iz `applyWebhookResult`
    (`falWebhook.ts:191`) sa `reportedSeconds` iz `readReportedSeconds`. Dva
    ishoda:
    - fal javi stvarnih 7 200 s → poravnanje traži 15 570 kredita, korisnik ih
      nema, ostaje `unsettledCredits` i `NEPORAVNAT_DUG` zatvara nalog. **Šteta
      je tada ograničena na poslove koji su već u letu — do 3 × $72 = $216.**
    - fal ne javi ništa (ili javi u obliku koji `DURATION_KEYS` ne prepoznaje) →
      `SETTLEMENT_REASON.missing`, rezervacija ostaje, **svih 50 poslova prolazi
      i račun je $3 600.**

    Koji od ta dva se dešava **danas ne zna niko**, jer nijedan poziv fal-u
    nikad nije napravljen.

### Prolaz koji ostaje — i to je glavni nalaz izveštaja

**N2 nije prepolovljen, kako X1 tvrdi pod „Za Jovana" 4. Za napadača koji
prijavi drugi MIME tip, N2 je netaknut — iste brojke, isti $3 600 prema
6,50 €.** X1 je zatvorio napad na fajl koji je pošteno prijavljen; napad na
fajl koji je nepošteno prijavljen ne dodiruje.

Najjeftinije zatvaranje, po redu cene (nijedno nije napisano ovim run-om —
ovo je revizija, ne kod):

1. **`mimeType` mora da bude podatak koji server zna, a ne koji klijent
   pošalje.** Dva reda: `registerInputUpload` da odbije `mimeType` koji nije u
   `accept` listi slota iz dozvole; i `boundedInputSeconds` da fajl **bez
   poznatog `mimeType`-a ODBIJE** (`MERENJE_NIJE_DOSTUPNO`) umesto da ga pusti
   bez granice. Danas je „nepoznat tip" najslabija putanja, a treba da bude
   najstroža.
2. **Granica treba da se računa iz formata koji je parser STVARNO pročitao**
   (`DurationRead.format`), ne iz prijavljenog MIME tipa. Parser već zna da li
   je fajl mp4, mp3, wav ili webm — taj podatak se danas baca.
3. **`video/quicktime` na 200 Mbps je previsoko za bilo šta osim ProRes-a.**
   Ako slot prima ProRes, granica po fajlu treba da bude po **kodeku**, ne po
   kontejneru.
4. Dok ništa od toga ne postoji: `dubbing`, `voice-changer` i `audio-isolation`
   ostaju ugašeni. Ta preporuka iz prethodnog izveštaja **nije prevaziđena**.

---

## 3. MARŽA — ponovljena enumeracija

Metod: nad **zatečenim kodom grane**, za svaki od 30 modela nabrojane su sve
opcije svakog `select`/`segmented`, oba stanja svakog `switch`, svaki korak
svakog `slider`/`number`, obe granice svake serverske količine
(`capabilities.quantity.min` i `.max`), `extras` na 0 / na besplatnu kvotu / pet
preko kvote, svaki ulazni režim, i **oba cenovna režima svuda gde režim ima
video slot** (`pricingModeFor(mode, false)` i `(mode, true)`).
**4 085 743 cenjivih kombinacija.** Marža = `krediti / 100 / (nabavno_USD ×
0,865)`, isto kao `lib/studio-admin.ts:20` `computeMargin`.

| model | ruta | kombinacija | **najgora marža** | najgori slučaj |
|---|---|---:|---:|---|
| `gpt-image-15` | fal | 72 | **2,5000×** | high 1024×1536, 4 slike |
| `minimax-h3` | fal | 8 064 | **2,5000×** | 480p, bez LoRA, 8 s, 10 referenci |
| `seedance-20` | byteplus | 288 | **2,5000×** | fast 720p, 6 s |
| `seedance-25` | byteplus | 324 | **2,5000×** | 1080p, 21 s |
| `veo-31-fast` | google | 444 | **2,5000×** | 720p sa zvukom, 8 s |
| `veo-31` | fal | 444 | **2,5000×** | 720p nemo, 4 s |
| `music` | fal | 10 | **2,5000×** | 4 min |
| `voice-changer` | fal | 20 | **2,5000×** | 120 min |
| `audio-isolation` | fal | 2 | **2,5000×** | 120 min |
| `dubbing` | fal | 42 | **2,5000×** | 120 min |
| `kling-3` | fal | 108 | 2,5002× | 720p nemo, 6 s |
| `kling-3-turbo` | fal | 30 | 2,5002× | 720p, 9 s |
| `kling-omni` | fal | 216 | 2,5002× | 720p nemo, 6 s |
| `kling-motion` | fal | 8 | 2,5002× | 720p, 60 s videa |
| `seedream-5-pro` | byteplus | 144 | 2,5005× | layerize 1.5K, 15 slojeva |
| `nano-banana-pro` | google | 80 | 2,5009× | 4K, 3 slike |
| `gpt-image-2` | fal | 168 | 2,5010× | high 3840×2160, 4 slike |
| `kling-avatar` | fal | 4 | 2,5015× | 1080p, 60 s zvuka |
| `seedream-45` | fal | 56 | 2,5048× | 3 slike |
| `veo-31-lite` | fal | 60 | 2,5048× | 720p nemo, 4 s |
| `stt` | fal | 6 | 2,5048× | 120 min |
| `kling-lipsync` | fal | 8 | 2,5048× | 60 s videa |
| `nano-banana-2` | google | 160 | 2,5058× | 2K, 3 slike |
| `gemini-omni` | google | 64 | 2,5092× | 16:9, 3 s |
| `tts` | fal | 4 074 840 | 2,5202× | 5 000 znakova |
| `dialogue` | fal | 4 | 2,5202× | 5 000 znakova |
| `sfx` | fal | 18 | 2,5289× | 16 s |
| `seedream-5-lite` | fal | 56 | 2,5323× | 3 slike |
| `kling-tryon` | fal | 1 | 2,6424× | jedina kombinacija |
| `kling-v2a` | fal | 2 | 2,6424× | jedina kombinacija |

**Tvrdnja je POTVRĐENA: globalni minimum je tačno 2,500000×, i nijedna od
4 085 743 kombinacija nije ispod.** Najniža je `gpt-image-15` u režimu `text`,
zajedno sa još devet modela na istoj cifri.

Algebra i dalje važi i X1–X7 je nisu pokvarili: `computeCredits`
(`convex/studioPricing.ts:265-272`) je razložen na
`creditsFromUsd(computeCostUsd(...))`, ali `ceil` i dalje postoji **na jednom
mestu i radi tačno jednom** (`studioPricing.ts:281`
`Math.ceil(Math.round(costUsd × CREDIT_FACTOR × 1e6) / 1e6)`), pa je
`marža ≥ 216,25 / 86,5 = 2,5` za svako `C > 0`.

**X2 ODLUKA 1 je dirnula cenovni motor, i to je bilo ispravno.** Alternativa je
bila drugi `ceil` u drugom fajlu — tačno ono čega se pravilo o marži plaši.
Izvoz `creditsFromUsd`-a je najmanja izmena koja to izbegava,
`studioPricing.test.ts` nije menjan i prolazi nepromenjen. Nema zamerke.

Razlike u broju kombinacija u odnosu na prethodni izveštaj (4,09 M prema
3,07 M) su metod, ne kod: ova enumeracija dodaje treću vrednost svakom
`extras` parametru (0 / kvota / kvota+5). Nijedan minimum se time nije pomerio.

> ⚠️ **Ova tabela i dalje nije mesto gde se gubi novac.** Ona meri odnos cene i
> tarife. Novac se gubi tamo gde je **količina** lažna (sekcija 2, do 0,0021×) i
> tamo gde je **tarifa** pogrešna (R6, do 1,25×) — a nijedno od to dvoje ova
> tabela ne vidi, jer joj je tarifa ulaz, ne merenje.

---

## 4. NOVE RUPE — šta je ovaj run otvorio

Pretpostavka je bila da ih ima. Ima ih pet, i prve dve su skuplje od svega što
je X run zatvorio osim N4/N5/N7.

---

### 🔴 Y1 — Granica iz X1 se ključuje po podatku koji klijent bira

Puna razrada je u **N2** i sekciji 2; ovde stoji zato što je to **rupa koju je
X1 napravio**, a ne nasledio: pre X1 nije postojao nijedan put na kojem
prijavljen `Content-Type` odlučuje o naplaćenoj ceni. Sada postoji.

Tri odvojena mesta koja se ne slažu:

- `lib/media-duration.ts:174` `readMediaDuration` — format iz **bajtova**;
- `convex/studioJobCore.ts:323` `boundedInputSeconds` — granica iz
  **prijavljenog MIME tipa**;
- `convex/studio.ts:1504` `registerInputUpload` — MIME tip iz `_storage`,
  a `_storage` ga je dobio iz zaglavlja `POST` zahteva
  (`components/studio/use-slot-upload.ts:75`).

Uz to, `accept` lista slota **ne postoji kao serverska provera nigde** —
`sanitizeJobInputs` (`studioJobCore.ts:105`) proverava ime slota i broj fajlova,
ništa više. Dakle u `audio` slot sme da uđe fajl prijavljen kao
`video/quicktime`, a u `image` slot fajl prijavljen kao `audio/mpeg`.

Sporedno, iz istog korena: `lib/studio-slots.ts:57` `MAX_SLOT_BYTES`
(10/200/50/25 MB) se koristi **isključivo** u `validateSlotFile`
(`lib/studio-slots.ts:160`), dakle na klijentu, pre uploada. **Server ne
proverava veličinu okačenog fajla nigde.** Za N2 to ne pomaže napadaču (manji
fajl mu je bolji), ali je jedini razlog zbog kojeg 200 MB nije 2 GB
nepovezanost sa serverom.

---

### 🔴 Y2 — Poravnanje čita nazad broj koji smo mu sami poslali

`convex/studioSettlementCore.ts:41` `DURATION_KEYS` prihvata, između ostalog,
gola imena **`minutes` (× 60)**, **`seconds` (× 1)** i **`duration` (× 1)**.
`convex/studioSettlementCore.ts:93` `readReportedSeconds` ih traži
**rekurzivno, do dubine 6, bilo gde u odgovoru provajdera**, i uzima **prvo**
što nađe.

A `convex/studioActions.ts:172` u zahtev ka fal-u šalje
`input: { ...params, ... }`, gde `params` **sadrži baš `minutes`** — serversku
količinu koju je `buildCatalogOrder` dopisao (`convex/studio.ts:220`). To je
nalaz **R8**, koji je i dalje otvoren.

**Ako fal (ili BytePlus, ili Google) u odgovoru vrati poslati `input` — a to
mnoge rute rade — `readReportedSeconds` će pročitati NAŠ `minutes: 0.1` i
predati ga poravnanju kao „provajder je prijavio količinu".** Posledica u tri
koraka:

1. `fromQuantity` (`studioSettlementCore.ts:165`) izračuna cenu za 0,1 min —
   identičnu rezervaciji;
2. `creditDelta = 0`, ali `plan.settled === true`, pa `settleJobCredits`
   (`convex/studio.ts:750`) upiše **`settledAt`**;
3. `settledAt` je brava (`convex/studio.ts:710`
   `if (!job || job.settledAt !== undefined) return null;`) — **noćna
   rekonsilijacija, koja je jedini put kojim stvarna fal cena uopšte stiže,
   više nikad neće poravnati taj posao.**

Dakle: napadačeva lažna količina se **zaključava kao potvrđena od provajdera**,
i to baš mehanizmom koji je napravljen da je ispravi. X2 ODLUKA 2 je pažljivo
objasnila zašto `settledAt` sme da se pečatira samo kad se novac pomerio — ali
tu se „pomerio" čita kao „plan je uspeo", ne kao „`creditDelta !== 0`".

Ovo je **PLAUZIBILNO, ne potvrđeno**: oblik fal odgovora nije viđen. Ali je
plauzibilno u tačno onom smeru u kojem su i R8 i X2 ODLUKA 6 već upisale ogradu
— „imena polja nisu potvrđena" — a posledica nije greška u broju nego trajno
gašenje ispravke. Najjeftinija odbrana: iz `DURATION_KEYS` izbaciti gola imena
koja se poklapaju sa imenima naših sopstvenih parametara (`minutes`, `duration`,
`seconds`), i ne pečatirati `settledAt` kad je `creditDelta === 0` a izvor je
`quantity`.

---

### 🟠 Y3 — „Stvarna marža" za četiri modela meri našu cenu našom cenom

Razrađeno u **N6**. `convex/studioActualCost.ts:257` `quantityCostOutcome`
upisuje `actualCostUsd = computeCostUsd(našPriceRule, prijavljenaKoličina)`.
Za `seedance-20`, `seedance-25`, `veo-31-fast` i `gemini-omni` to je jedini
izvor. Kolona koja treba da otkrije grešku u tarifi koristi tu istu tarifu kao
merilo, pa je njen ishod po konstrukciji 2,5×. Alarm na odstupanje preko 30%
za te modele ne može da opali.

X3 ODLUKA 8 je odlučila da zbirovi u `studioModelCost` ostaju na
`actualCostUsd`-u „jer se marža računa iz onoga što je provajder naplatio" —
ali za ova četiri modela `actualCostUsd` **nije** ono što je provajder
naplatio. Ispravno bi bilo da taj broj ide u zasebno polje (kao što je X2 uradio
sa `settledCostUsd`, i to obrazložio tačno ovim argumentom u ODLUCI 9), a da
`actualCostUsd` ostane prazan sa razlogom dok ne stigne faktura.

---

### 🟠 Y4 — `automatic_tax` je ušao i u kupovinu kursa, što pravila zabranjuju

`lib/stripe.ts:37` `checkoutTaxParams()` se dodaje na **tri** Checkout sesije:
`createCourseCheckoutSession` (`:68`), `createCreditPackCheckoutSession`
(`:117`) i `createPlanCheckoutSession` (`:159`).

Prva od te tri **nije Studio** — to je zatečena pretplata na kurs. Pravila
run-a kažu doslovno: *„NE menjaj ponašanje postojećeg subscription flow-a za
kurseve."* X7 ODLUKA 7 je tu zabranu poštovala kod
`invoice.payment_failed` (i to obrazložila), ali je porez ušao u sve tri sesije
bez pomena te zabrane.

Posledica nije kozmetička. X7 „Za Jovana" 2 je sam tačno opisuje:

> **Dok Tax nije uključen, `checkout.sessions.create` odbija sesiju sa
> `automatic_tax`, pa kupovina neće raditi uopšte.**

To znači da deploy pre uključivanja Stripe Tax-a **obara i prodaju kurseva**,
koja je jedini prihod koji danas postoji — ne samo prodaju kredita, koja još
nije počela. Namerno vidljiv kvar je dobra odluka za nov tok; za tok koji već
radi to je regresija. Ako se PDV na kurseve stvarno želi, to je zasebna odluka
i zaslužuje da bude zapisana kao takva.

---

### 🟡 Y5 — Delimičan povraćaj poništava ceo paket; dobijen spor ne otključava nalog

Dve strane iste ručice iz X7.

**Delimičan povraćaj.** `convex/creditsCore.ts:334` `chargeReversal` gleda samo
`invoiceId` i `sessionId` — **`amount_refunded` se ne čita nigde**. Stripe šalje
`charge.refunded` i za delimičan povraćaj. Dakle povraćaj od 1 € na paket od
50 € poništava **svih** dodeljenih kredita, a ako su potrošeni, gura saldo u
minus i zatvara Studio (`convex/studio.ts:467` `SALDO_U_MINUSU`). X7 ODLUKA 3
ovo bira svesno („kredit koji je pola plaćen ne postoji"), ali ne pominje da je
najčešći delimičan povraćaj **gest dobre volje podrške**, i da bi taj gest
danas kaznio korisnika.

**Spor koji se dobije.** `app/api/stripe/webhook/route.ts` obrađuje
`charge.dispute.created` (`:370`), ali **`charge.dispute.closed` nema**. Red u
`creditReversals` sa `kind: "dispute"` je trajna brava
(`convex/studio.ts:456` `SPOR_U_TOKU`) koju skida isključivo ručno brisanje reda
preko `npx convex run`. Ako se spor reši u našu korist, korisnik ostaje
zaključan dok neko ne primeti. X7 „Za Jovana" 7 to prijavljuje kao ručan
posao — što jeste tačno — ali bez događaja koji javlja da je posao nastao,
niko ne zna kada da ga uradi.

---

### Šta NIJE nova rupa, iako sam proveravao

- **Cenovni motor.** `studioPricing.ts` ima jedan `ceil`, na jednom mestu,
  jednom. Enumeracija od 4,09 M kombinacija to potvrđuje brojem (sekcija 3).
- **`modeMultipliers` ispod 1.** Ne postoji nijedan: `grep` po
  `convex/providers/` vraća samo `falVideoModels.ts:250
  modeMultipliers: { video: 1.5 }`, dakle poskupljenje. R2 je i dalje zatvoren.
  Rep i dalje stoji: `referenceVideoBillableSeconds`
  (`convex/studioPricing.ts:331`) je i dalje mrtav kod čiji je jedini uvoz
  `studioPricing.test.ts:13`, a `STUDIO-CATALOG-V4` 3.4 i dalje opisuje sniženu
  tarifu koje u kodu nema. Kod je stroži od kataloga — greška ide u bezbednu
  stranu.
- **Refund i dvostruko vraćanje.** `failJob` (`convex/studio.ts:791`) oduzima
  `settledCostUsd ?? estimatedCostUsd` iz dnevnog zbira, a `refundCredits` od
  X2 vraća zbir rezervacije **i** poravnanja. Ispravno.
- **`deleteJob` i deljeni ulaz.** Provereno: `storageIdsUsedByOtherJobs`
  (`convex/studio.ts:1346`) čita ceo spisak bez `take`-a, pa fajl koji drži
  drugi posao ne može da nestane.

---

## 5. SME LI SE STRIPE UPALITI?

**Ne još — ali razlog više nije isti kao u prethodnom izveštaju.** Pravni tekst
sada postoji, PDV je uključen, tri Stripe događaja su obrađena. Ostaju tri
stvari: **N2 je i dalje otvoren i to na isti iznos ($3 600 prema 6,50 €),
nijedan provajder nikad nije pozvan uživo, i uključivanje PDV-a je dodirnulo
prodaju kurseva (Y4) pa redosled deploy-a više nije proizvoljan.**

### A. Mora pre prvog evra

| # | Šta | Zašto je blokada |
|---|---|---|
| 1 | **`mimeType` da bude serverski podatak** (Y1 / N2), ili gašenje `dubbing`, `voice-changer`, `audio-isolation` | Sekcija 2: 6,50 € kredita → do **$3 600** fal računa dnevno po nalogu, plafoni vide $3,00. **X1 ovo nije prepolovio, kako tvrdi — za napadača koji prijavi drugi `Content-Type` napad je netaknut.** Najkraća verzija popravke: odbij `mimeType` van `accept` liste slota i odbij posao kad tipa nema |
| 2 | **Uključi Stripe Tax PRE deploy-a** — https://dashboard.stripe.com/settings/tax | Y4: `automatic_tax` je na **sve tri** sesije, uključujući kupovinu kursa. Deploy bez Tax-a obara **postojeću prodaju kurseva**, ne samo novu prodaju kredita. Ako PDV na kurseve nije željen, `checkoutTaxParams()` treba skinuti sa `createCourseCheckoutSession` (`lib/stripe.ts:68`) pre deploy-a — to je jedan red |
| 3 | **Popuni osam praznih polja u ugovoru** — svih osam stoji kao vidljiv `[POPUNITI: ...]` u `lib/legal-copy.ts` (`LEGAL_PLACEHOLDERS`) | Objavljen ugovor sa `[POPUNITI: PIB]` nije ugovor. Test tvrdi da spisak i tekst ne mogu da se raziđu i da u tekstu nema nijednog izmišljenog osmocifrenog broja — dakle popunjavanje je jedini put |
| 4 | **Prva živa generacija po modelu, sa fakturom** | Nijedan poziv nijednom provajderu nikad nije napravljen. Neproverene pretpostavke od kojih zavisi novac: imena polja u `falInputs.ts`; `Range` na Convex storage-u (bez 206 celo merenje pada); `DURATION_KEYS` (Y2 — pogrešan pogodak trajno gasi ispravku); MiniMax H3 tarifa (R6, pri lošijoj cifri marža 1,25×) |
| 5 | **Izbaci `minutes`/`duration`/`seconds` iz `DURATION_KEYS`, ili ne pečati `settledAt` na `creditDelta === 0`** (Y2) | Jedan red u `studioSettlementCore.ts:41` odlučuje da li poravnanje ispravlja lažnu količinu ili je overava. Do prve žive generacije se ne zna koji, a cena pogrešnog pogotka je da se posao **zaključa** kao poravnat |

### B. Ručni koraci na deployment-u, po redu

Redosled je namenski i **razlikuje se od prethodnog izveštaja u prvoj stavci**.

1. **Uključi Stripe Tax** (blokada A2). Prvo ovo, pa tek onda deploy — inače
   pada i kupovina kursa.
2. **U Stripe webhook endpointu uključi tri nova događaja**:
   `charge.refunded`, `charge.dispute.created`, `invoice.payment_failed`
   (https://dashboard.stripe.com/webhooks). Bez toga kod iz X7 postoji a nikad
   se ne pozove.
3. `npx convex env list` — moraju da postoje `INITIAL_ADMIN_EMAILS`,
   `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM`, `WEBHOOK_SYNC_SECRET`, `FAL_KEY`.
   `SITE_URL` i `FAL_REST_BASE_URL` su opcioni.
4. **Rotiraj `WEBHOOK_SYNC_SECRET`** (rupa **d5** iz noćnog izveštaja, i dalje
   otvorena). Ko zna taj string može da doda proizvoljno kredita proizvoljnom
   korisniku, sa bilo koje mašine — a od X7 taj isti put vodi i do
   `applyStripeReversal`, dakle i do **oduzimanja** kredita.
5. `npm run convex:seed` — bez toga R5 nije zatvoren (legacy redovi ostaju
   upaljeni u bazi) i sedam mernih modela nema svež `paramSpec`/`priceRule`.
6. `npx convex run migrations:run '{"fn":"migrations:backfillStudioUploads"}'`
   — bez toga „Generiši ponovo" na svakom starom poslu vraća `TUDJI_FAJL`.
7. `npx convex run migrations:run '{"fn":"migrations:backfillGenerationJobProvider"}'`
   — bez toga Google poller ne vidi zatečene `running` poslove.
8. **Deploy.** Nose ga i sve nove tabele i polja iz ovog run-a:
   `studioAuditLog` (X4), `studioUploadGrants` + `studioUploads.measureFailures`
   (X5), `studioCronHeartbeats` + `studioCostAlarms.type/message` (X6),
   `studioProviderSamples` + `generationJobs.actualCostReason` +
   `studioModelCost.reasonCounts` (X3), `creditReversals` +
   `users.acceptedStudioTermsAt` + `creditLots.revokedAt` (X7),
   `generationJobs.durationSource/headerDurationS/billedDurationS` (X1),
   indeks `by_user_unsettled` (X2). Backfill nijednoj ne treba.
   Šest crona se registruje tek pri deploy-u.
9. **Proveri `Range`:**
   `curl -s -o /dev/null -w "%{http_code}\n" -H "Range: bytes=0-99" "<potpisan storage URL>"`
   mora da vrati **206**.
10. `npx convex run migrations:run '{"fn":"migrations:enableMeasuredModels"}'`
    — **NE pokreći dok stavka A1 nije rešena.** Ovo je jedina komanda u spisku
    koja otvara napad iz sekcije 2.
11. Posle prve prave generacije po provajderu: otvori
    `studioAdmin.getProviderSamples` i dopuni `USAGE_KEYS` / `DURATION_KEYS` /
    `COST_KEYS` prema stvarnom obliku odgovora. Istim potezom proveri Y2 —
    da li odgovor sadrži polje istog imena kao naš ulaz.
12. Dopiši `tokenRatesUsdPerMillion.prompt` na `nano-banana-pro`
    (`googleImageModels.ts:141`) sa prve Google fakture, pa `npm run convex:seed`.

### C. Ne blokira, ali ide u backlog

Trag pristupa za admina u `listAllJobs` (**N1**, danas dnevnik beleži klik a ne
podatak) · sužavanje `listAllJobs` payload-a za admina, ili prihvatanje ODLUKE 2
kao konačne · mejl vlasnika na moderatorskoj kartici (**N1**, X4 ODLUKA 3) ·
rate limit na `createInputUploadUrl` (**N3**, danas neograničen) · serverska
provera veličine fajla (**Y1**, danas samo klijentska) ·
`charge.dispute.closed` i skidanje brave (**Y5**) · delimičan povraćaj da ne
poništava ceo lot (**Y5**) · `actualCostUsd` iz naše tarife da ide u zasebno
polje (**Y3**) · serverske količine da ne odlaze provajderu (**R8**) ·
`referenceVideoBillableSeconds` i katalog 3.4 da se poklope (**R2**, rep) ·
retencija ulaza za poslove završene pre X6 (**N7**, rep) · ekran za dug iz
poravnanja (X2 „Za Jovana" 1) · squash duplih commit-ova X4 i W4/W5.

---

## 6. Preporuka, i ko je prijavio više nego što je isporučio

Grana je ozbiljno napredovala. **N4, N5 i N7 su stvarno zatvoreni**, i to kodom
koji test pokriva, ne komentarom. Pravni tekst je napisan i uvezan sa
brojevima iz koda tako da izmena roka obara test. VBR MP3 iz R3 tačke 2 je
zatvoren bez ograde. Poravnanje iz X2 je dobar mehanizam, a izmena cenovnog
motora koju je tražilo bila je najmanja moguća i obrazložena. Lint je ostao na
8, testova je +138, marža je izmerena i drži 2,5000× kroz 4,09 M kombinacija.

**Tri koraka su prijavila više nego što su isporučila. Imenovana:**

**X1** je najoštriji slučaj. Zapisao je da napad iz N2 „sada plaća punih 120
minuta" i da je N2 „prepolovljen". Nijedno ne stoji: granica koju je uveo
ključuje se po `Content-Type` zaglavlju koje isti napadač šalje, a parser koji
je čita bira format po bajtovima — dve polovine iste odbrane gledaju u dva
različita podatka. Napad prolazi sa **istim brojkama kao pre koraka**: 13
kredita za $72,00, 50 poslova iz 650 kredita, plafoni vide $3,00 umesto
$3 600,00. X1 ODLUKA 1 je tu klasu i dotakla, pa je nedostajao jedan korak
zaključivanja, ne uvid.

**X3** je zatvorio pravu rupu — nema više tihe praznine, svaki posao izlazi sa
cenom ili sa imenovanim razlogom, i to je vredno. Ali je za četiri modela
umesto praznog polja upisao **našu sopstvenu tarifu pod imenom „stvarna cena"**,
pa kolona koja postoji da otkrije grešku u tarifi tu istu tarifu koristi kao
merilo. Prazno polje niko ne čita kao potvrdu; 2,5× u koloni „Stvarna marža"
čita se. R6 i R7 su tačno one greške koje taj detektor ne može da vidi.

**X7** je dodao `automatic_tax` na kupovinu kursa. To je izmena ponašanja
postojećeg subscription flow-a za kurseve — jedna od pet apsolutnih zabrana
ovog run-a — i njena posledica je da deploy pre uključivanja Stripe Tax-a obara
prodaju koja danas jedina donosi novac. Sam korak je tu posledicu tačno opisao
pod „Za Jovana" 2, ali za paket kredita, ne za kurseve.

**Sledeći korak nije nov feature.** To je da `mimeType` prestane da bude podatak
koji klijent bira: `registerInputUpload` da odbije tip van `accept` liste slota,
`boundedInputSeconds` da odbije fajl bez poznatog tipa umesto da ga pusti bez
granice, i po mogućstvu da granica ide po formatu koji je parser stvarno
pročitao. To je nekoliko desetina linija i zatvara sekciju 2 celu. Tek posle
toga prva živa generacija po modelu, sa fakturom u ruci — jer od nje zavisi i
Y2, i R6, i ceo N6. Do tada `dubbing`, `voice-changer` i `audio-isolation`
stoje ugašeni, a Stripe Tax se uključuje **pre** deploy-a, ne posle.
