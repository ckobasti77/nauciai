# Studio — revizija kataloškog run-a (S0–S7)

> 20. avgust 2026 · grana `feat/studio-faza-a` · HEAD `57b8c56`
> Revizija, ne nov kod. Nijedan fajl proizvoda nije menjan tokom ovog koraka.

---

## 0. Verifikacija — tačan izlaz

Sve četiri komande puštene nad zatečenim stanjem grane, posle brisanja
privremenog revizorskog alata:

| Komanda | Izlaz |
|---|---|
| `npx convex codegen` | `Running TypeScript...` · **exit 0** |
| `npm run lint` | `✖ 17 problems (0 errors, 17 warnings)` · **exit 0** |
| `npm run test` | `Test Files 55 passed (55)` · `Tests 646 passed (646)` · **exit 0** |
| `npm run build` | `✓ Compiled successfully in 8.8s` · `✓ Generating static pages (60/60)` · **exit 0** |

**Sve prolazi čisto.** 17 lint upozorenja su sva `no-unused-vars`, i devet od
njih su u `convex/crons.ts` — to nije kozmetika, videti nalaz **R1**.

### Obim

```
git diff --stat main...HEAD
252 files changed, 40951 insertions(+), 534 deletions(-)
```

Koraci u grani: `S0` globalni plafon · `S1` šema + `computeCostUsd` · `S2`
Google slike · `S3` BytePlus · `S4` Google poller · `S5` seed kataloga ·
`S6` deljene komponente · `S7` playground/galerija/admin.

---

## 1. MARŽA — najgora kombinacija po modelu

Metod: nabrojan je **ceo prostor parametara** svakog modela — svaka opcija
svakog `select`/`segmented`, oba stanja svakog `switch`, svaki korak svakog
`slider`/`number`, svaki ulazni režim, plus serverske količine (`char_count`,
`minutes`, `duration`, `input_images`, `reference_images`) i cenovni režim
`reference_with_video`. **3 965 cenjivih kombinacija preko 30 modela.**
Marža = `krediti / 100 / (nabavno_USD × 0,865)`, isto kao `computeMargin`.

| model | ruta | kombinacija | **najgora marža** | kr | nabavno $ | najgori slučaj |
|---|---|---:|---:|---:|---:|---|
| `nano-banana-2` | google | 32 | 2,506× | 66 | 0,3045 | 2K, 3 slike |
| `nano-banana-pro` | google | 16 | 2,501× | 159 | 0,7350 | 4K, 3 slike |
| `gpt-image-2` | fal | 168 | 2,501× | 347 | 1,6040 | high 3840×2160, 4 slike |
| `gpt-image-15` | fal | 72 | **2,500×** | 173 | 0,8000 | high 1024×1536, 4 slike |
| `seedream-45` | fal | 8 | 2,505× | 26 | 0,1200 | 3 slike |
| `seedream-5-pro` | byteplus | 160 | 2,501× | 73 | 0,3375 | layerize 1.5K, 15 slojeva |
| `seedream-5-lite` | fal | 8 | 2,532× | 23 | 0,1050 | 3 slike |
| `kling-tryon` | fal | 1 | 2,642× | 16 | 0,0700 | jedina kombinacija |
| `kling-3` | fal | 108 | 2,500× | 109 | 0,5040 | 720p nemo, 6 s |
| `kling-3-turbo` | fal | 30 | 2,500× | 218 | 1,0080 | 720p, 9 s |
| `kling-omni` | fal | 180 | 2,500× | 109 | 0,5040 | 720p nemo, 6 s |
| `minimax-h3` | fal | 1 536 | **2,500×** | 173 | 0,8000 | 4K, bez LoRA, 5 s |
| `seedance-20` | byteplus | 288 | **2,500×** | 157 | 0,7260 | fast 720p, 6 s |
| `seedance-25` | byteplus | 324 | **2,500×** | 2 584 | 11,9490 | 1080p, 21 s |
| `veo-31-lite` | fal | 60 | 2,505× | 26 | 0,1200 | 720p nemo, 4 s |
| `veo-31-fast` | google | 282 | **2,500×** | 173 | 0,8000 | 720p sa zvukom, 8 s |
| `veo-31` | fal | 282 | **2,500×** | 173 | 0,8000 | 720p nemo, 4 s |
| `gemini-omni` | google | 32 | 2,509× | 66 | 0,3041 | 16:9, 3 s |
| `kling-avatar` | fal | 62 | 2,500× | 572 | 2,6450 | 1080p, 23 s zvuka |
| `kling-lipsync` | fal | 31 | 2,501× | 106 | 0,4900 | 31 s videa |
| `kling-motion` | fal | 62 | 2,500× | 1 635 | 7,5600 | 720p, 60 s videa |
| `tts` | fal | 22 | 2,501× | 97 | 0,4483 | 4 483 znaka |
| `dialogue` | fal | 22 | 2,501× | 97 | 0,4483 | 4 483 znaka |
| `sfx` | fal | 18 | 2,529× | 7 | 0,0320 | 16 s |
| `music` | fal | 10 | **2,500×** | 519 | 2,4000 | 4 min |
| `stt` | fal | 50 | 2,501× | 104 | 0,4808 | 60,1 min |
| `voice-changer` | fal | 25 | **2,500×** | 7 785 | 36,0000 | 120 min |
| `audio-isolation` | fal | 25 | **2,500×** | 2 595 | 12,0000 | 120 min |
| `dubbing` | fal | 50 | **2,500×** | 15 570 | 72,0000 | 120 min |
| `kling-v2a` | fal | 1 | 2,642× | 8 | 0,0350 | jedina kombinacija |

**Nijedna od 3 965 kombinacija nije ispod 2,0×. Globalni minimum je 2,5000×.**

To nije sreća nego algebra, i vredi je zapisati jer znači da ovu tabelu ne treba
ponovo računati pri svakoj izmeni cene:

> `krediti = ceil(C × 216,25)`, a `marža = krediti / 100 / (C × 0,865)`.
> Pošto je `ceil(x) ≥ x`, sledi `marža ≥ 216,25 / 86,5 = 2,5` **za svaki C > 0**.

Dokle god cena ide kroz `computeCredits`, marža po pravilu **ne može** da padne
ispod 2,5×. Zaokruživanje samo pomaže (otud 2,64× kod `kling-tryon`, gde je jedna
generacija mala pa `ceil` odnosi veći procenat).

**Zato tabela iznad nije mesto gde se gubi novac.** Novac se gubi tamo gde
STVARNI trošak kod provajdera odstupi od onoga što pravilo pretpostavlja — to je
sekcija 5, i tamo maržе idu do **0,002×**.

### 1.1 Sistematska razlika prema kreditnim tabelama kataloga

Katalog u tabelama daje kredite **po jedinici** (`19 kr/s`, `25 kr / 1 000 zn.`),
pa kolonu „5 s" računa kao `ceil(po jedinici) × broj jedinica`. Motor radi
`ceil` **tačno jednom, na kraju** (`studioPricing.ts:265`), što je doslovno ono
što piše u zaglavlju kataloga (`krediti = ceil(nabavno_USD × 216,25)`).

Posledica: motor naplaćuje **isto ili malo manje** od kolone u katalogu.

| slučaj | katalog | motor | razlika |
|---|---:|---:|---:|
| Kling 3 · 720p nemo · 5 s | 95 | 91 | −4 |
| Seedance 2.5 · 1080p · 30 s | 3 750 | 3 692 | −58 |
| `tts` · 1 000 znakova | 25 | 22 | −3 |
| `stt` · 1 min | 3 | 2 | −1 |
| `kling-lipsync` · minimum (5 s) | 20 | 16 | −4 |
| `sfx` · 5 s | 5 | 3 | −2 |

Marža ostaje ≥ 2,5× u svakom od ovih slučajeva, pa **ovo nije rizik nego izbor**.
Ali kolone „kr/s" i „5s" u `STUDIO-CATALOG-V4.md` **nisu ono što će korisnik
videti na dugmetu**, i to treba ispraviti u katalogu (ili prihvatiti). Videti
ODLUKE.

---

## 2. JEDNA RAČUNICA

**Potvrđeno za v4 katalog, sa jednim imenovanim izuzetkom.**

`computeCostUsd`/`computeCredits` iz `convex/studioPricing.ts` je jedina računica
cene za sve modele iz tabele `models`. Svi pozivaoci:

| Mesto | Poziv | Uloga |
|---|---|---|
| `convex/studio.ts:130-131` | `computeCredits` + `computeCostUsd` | **naplata** |
| `lib/studio-params.ts:155` | `computeCredits` | cena na dugmetu |
| `lib/studio-params.ts:171+` | `computeCredits` | značka `+12 kr` uz kontrolu |
| `lib/studio-catalog-admin.ts:106,183` | oba | admin tabela cena |

UI i server dobijaju **isti broj za iste parametre** i to je strukturno, ne
slučajno: `lib/studio-params.ts` i `convex/studio.ts` zovu istu funkciju nad
objektom koji je prošao **isti** `sanitizeSpecParams`. `lib/studio-params.test.ts:149`
to tvrdi kao test („cena forme je doslovno `computeCredits` nad istim objektom").

### Druge računice cene u projektu

**Jedna postoji i živa je:**

**`convex/studioCore.ts:99` — `computeCreditCost(model, params)`**
`model.creditCost × images`, odnosno `ceil(costPerSecond × duration) × images`.
Ne dodiruje `computeCostUsd`, ima svoj `estimatedCostUsd`
(`convex/studio.ts:188`: `model.estimatedCostUsd × requestedImageCount`).

Ovo je stari `modelCatalog` put i **nije mrtav kod**:
`convex/studio.ts:255-262` bira put po tome da li slug postoji u `models`;
slug kojeg tamo nema pada na legacy. `seed:seedModelCatalog` upisuje **24 reda**,
od kojih ~18 nema parnjaka u v4 katalogu — među njima `flux-2-flash` i
`flux-2-pro` (a katalog §7 izričito kaže **FLUX ne ulazi, Jovanova odluka**),
pa `kling-v3-standard`, `seedance-20-720p`, `veo-31-standard-1080p`,
`seedance-15-pro-720p`. Svi idu na **fal**, dakle tačno preko marži koje je ceo
ovaj run trebalo da zaobiđe (Seedance 2,00×, Veo Fast do 1,50×).

`STUDIO-NIGHT-REPORT.md` korak 6 i dalje govori Jovanu da pusti
`seed:seedModelCatalog`, pa će ti redovi biti u bazi.

Novi playground ih ne prikazuje (`studioModels.listModels` čita samo `models`),
ali `createJob` prima **proizvoljan `modelSlug` string** — dakle dostupni su
direktnim pozivom mutacije, po drugoj računici cene.

**Ostalo što liči na računicu cene, a nije:**
`lib/studio-admin.ts:20` i `convex/studioCore.ts:123` — `computeMargin`, prikaz
marže u admin ekranu, namerno dupliran i pokriven testom koji tvrdi da se dve
kopije poklapaju (`lib/studio-admin.test.ts:18`). Nije računica cene.

---

## 3. RUTIRANJE

Provereno programski: svih 30 redova protiv tabele iz sekcije 7 kataloga,
prepisane doslovno.

**Odstupanja: 0.** Nijedan model viška, nijedan model ne fali, nijedan na
pogrešnom provajderu.

Posebno provereno, jer je isto ime a dve rute:

| model | ruta u kodu | katalog | |
|---|---|---|---|
| `seedream-5-pro` | **byteplus** (`bytePlusModels.ts:50`) | byteplus (fal uzima 1,50×) | ✅ |
| `seedream-5-lite` | **fal** (`falImageModels.ts:225`) | fal (parity) | ✅ |

Isto i za Veo, gde tarifa menja provajdera:
`veo-31-lite` → fal ✅ · `veo-31-fast` → **google** ✅ · `veo-31` → fal ✅.
Sva tri stoje u istom fajlu (`googleModels.ts`) jer je porodica ista, ali je
`provider` polje **reda**, ne fajla — to je urađeno kako treba.

Seedance 2.0 i 2.5 oba na byteplus ✅ (fal uzima tačno duplo).

---

## 4. SPECIFIKACIJE

Provereno programski za svih 30 modela, četiri tvrdnje po modelu:

1. svaki `inputMode` ima svoj ključ u `endpoints`;
2. svaki `inputMode` ima svoj ključ u `inputSpec`;
3. nema ključa u `endpoints`/`inputSpec` koji nije u `inputModes`;
4. svaki parametar koji `priceRule` pominje (`lookup.params`, `multipliers`,
   `quantityParam`, `extras`, plus isto za `modeRules`) postoji ili kao kontrola
   u `paramSpec` ili kao serverska količina (`capabilities.quantity` / `extras`);
   i obrnuto — nijedna kontrola sa `affectsPrice: true` nije nepomenuta u pravilu.

**Nijedno odstupanje.**

UI nudi svaki deklarisan režim: `<ModeSwitcher>` je stvarno ožičen
(`components/app/studio-page.tsx:327`) i gradi se iz `model.inputModes`, a
`lib/studio-slots.ts:80` ima labelu za svih 11 režima iz sekcije 5 kataloga.
Sve komponente iz sekcije 6 postoje (`DropSlot`, `DropSlotGrid`, `FrameSlotPair`,
`ReferenceSlots`, `ModeSwitcher`, `ModelPicker`, `ParamControl`, `ParamForm`,
`PriceTag`, `GenerateButton`); `<DurationSlider>` je namerno svučen u
`ParamControl` tip `slider` i to je ispravno — jedna komponenta manje.
Nijedna komponenta nema `if (slug === ...)`.

### Tri mesta gde se spec i transport ne slažu

**S1. `seedance-25` prima 50 referenci, prosleđuje 10.**
`bytePlusModels.ts:264` deklariše `reference.image.max = 50` (katalog 3.5: „do
50 referenci"). `byteplus.ts:42` seče na `MAX_INPUT_URLS = 10`, uz komentar
„ni jedan režim u katalogu ne traži više" — koji je netačan. Korisnik okači 50
slika, plati posao, a model vidi 10. Nije gubitak novca (Seedance nema `extras`),
ali jeste tiho odbacivanje plaćenog ulaza. Isto važi za `studioActions.ts:200`
(`MAX_FAL_INPUT_URLS = 10`), gde je 10 tačno jer nijedan fal režim ne traži više.

**S2. `kling-lipsync` ima jedan režim, katalog traži dva.**
Katalog 3.9 kaže `video_audio` **·** `video`+`text`. Red deklariše samo
`video_audio`, a izbor izvora je `source` kontrola (audio/tekst) unutar njega.
Radi (slotovi nisu obavezni), ali `inputModes` ne odgovara katalogu, i u režimu
`source: text` korisnik i dalje vidi prazan audio slot.

**S3. `gemini-omni` režim `video` nema nijedan slot.**
`googleModels.ts:346`: `video: {}`. To je namerno — katalog 3.8 kaže da se sme
menjati samo klip koji je model sam napravio, ne uploadovan. Ali forma tada
prikazuje režim „Iz videa" **bez ijednog polja i bez načina da se izabere
prethodni klip**. Ograničenje je zapisano u `capabilities.restrictionsSr`, što je
dobro, ali sam režim je trenutno ćorsokak.

---

## 5. RIZICI PO NOVAC

### 5.1 Stari a–f iz `STUDIO-NIGHT-REPORT.md` — nov status

| # | Rizik | Bio | **Sad** | Gde |
|---|---|---|---|---|
| a | rezervacija bez posla posle commit-a | 🔴 nema reaper-a | 🟢 **rešeno** | `crons.ts:47` `reapStuckJobs`, 15 min, `reserved` posle 5 min / `running` posle 30 |
| b | posao bez rezervacije | 🔴 `submitJob`/`markJobRunning` ne gledaju status | 🟢 **rešeno** | `studioActions.ts:50` `if (job.status !== "reserved") return`; `studio.ts:354` isto |
| c | dupli refund | 🟢 | 🟢 **i dalje** | dvoslojno: `job.status !== "running"` + `by_job_type` u `refundCredits` |
| d | dupla dodela na Stripe retry-ju | 🔴 5 rupa | ⚪ **van obima ovog run-a** | Stripe put nije diran u S0–S7 |
| e | posao zauvek u `running` | 🔴 | 🟢 **rešeno** | isti reaper; pokriva i fal i BytePlus i Google |
| f | lažna cena / `params` se ne validiraju | 🔴 | 🟢 **rešeno za v4** | `sanitizeSpecParams` odbija vrednost van `options`, seče brojeve, traži boolean; cena se računa nad OČIŠĆENIM objektom |

Globalni dnevni plafon troška iz (f) je **i dalje otvoren** — videti **R1**.

### 5.2 Nove staze koje je tražio zadatak

**Može li klijent poslati vrednost parametra van `options`?**
🟢 **Ne.** `studioParamSpec.ts:150` — `select`/`segmented` van svog skupa se
**odbija**, ne odseca. Brojevi se seku na `min`/`max`, a preko `max × 10` se
odbijaju. `switch` prima samo boolean. Nepoznat ključ tiho ispada. Na kraju se
popunjavaju `default`-i pa se proverava `isCombinationPriceable` — dakle
`mini|1080p` ne prolazi ni u UI-ju ni na serveru, iz istog izvora.
Bonus: `numberFromMap` koristi `Object.hasOwn`, pa `map["constructor"]` ne vraća
funkciju umesto cene. To je stvarno bio put i zatvoren je.

**Može li poslati `inputMode` koji model ne podržava?**
🟢 **Ne.** `studio.ts:89` — `if (!modes.includes(inputMode)) throw NEISPRAVAN_REZIM`.
Cenovni režim `reference_with_video` se izvodi na serveru iz ulaza
(`pricingModeFor`), klijent ga ne bira.

**Može li vezati tuđi `storageId`?**
🔴 **Da.** Videti **R3**.

**Naplaćuje li se layerize po sloju?**
🟢 **Da.** `modeRules.layerize` (`unit: "layer"`, `baseUsd: 0.0225`,
`quantityParam: "layers"`) se koristi **ceo** umesto roditelja. 15 slojeva na
1,5K = 73 kr za $0,3375 nabavno, marža 2,501×. Množilac rezolucije je ponovljen u
ugnježdenom pravilu, što je tačno.

**Reference sa videom 0,6×?**
🔴 **Množilac da, ulazne sekunde ne.** Videti **R2** — ovo je najskuplji nalaz.

**Lipsync na 5 s?**
🟢 **Da**, `roundUpTo: 5` u pravilu (`falToolModels.ts:134`), primenjuje se u
`quantityFor` pre množenja. 3 s se naplaćuje kao 5 s.
⚠️ Ali iznos je 16 kredita, ne 20 kao što katalog kaže (sekcija 1.1 iznad).

**Ostaje li posao da visi ako Google poller padne?**
🟢 **Ne.** Tri sloja: poller ne refundira na mrežnoj grešci (ne zna stanje),
`reapStuckJobs` refundira posle 30 minuta, `applyOperationResult` je idempotentan
preko `job.status !== "running"`. Ako poller pukne na `readGoogleConfig` (nema
ključa), ceo prolaz baci — ali tek pošto je utvrdio da ima poslova, i reaper i
dalje stoji ispod.
⚠️ Jedna tanka ivica: `listPollableGoogleJobs` skenira **200 najstarijih**
`running` poslova pa filtrira na google. Zaostatak od 200+ fal poslova starijih
od google posla bi ga izgurao iz prozora — refundirao bi ga reaper posle 30
minuta iako je Google posao uspeo i naplaćen je. Malo verovatno, ali je realno
pri incidentu.

**Može li nepotpisan BytePlus callback lažno pomeriti posao?**
🟢 **Ne, i ovo je urađeno tačno.** `byteplus.ts:157` iz tela uzima **samo ID
zadatka**. Zatim `isTaskPending` proverava da je to naš posao u `running`-u (pre
mrežnog poziva, da lažan callback ne može da nas natera da zovemo BytePlus
proizvoljno), pa se zadatak **ponovo pita** na task endpointu, i tek taj odgovor
menja posao. `{"status":"succeeded"}` od napadača ne radi ništa.
`challenge` se vraća pre ijednog čitanja baze. fal strana je Ed25519 nad JWKS-om
sa keširanjem 24 h i proverom svežine timestampa — takođe ispravno.

### 5.3 Nalazi, po ceni

---

#### 🔴 R1 — Globalni dnevni plafon troška je mrtav kod

`convex/crons.ts:6-14` uvozi `decideGlobalCostAction`, `GLOBAL_DAILY_ALARM_USD`,
`GLOBAL_DAILY_KILL_USD`, `GlobalCostAction`, `STUDIO_FLAG_KEY`, `dayKey`,
`parseAdminEmails`, `env`, `internalAction` — i **ne koristi nijedno**. To je
devet od sedamnaest lint upozorenja u celom repou.

`decideGlobalCostAction` je definisan u `studioCore.ts:175` i pokriven testovima,
ali **jedini fajl koji ga uvozi je `crons.ts`, gde se nikad ne poziva**. Nijedan
cron nije registrovan za njega (registrovana su četiri: reaper, google poller,
istek kredita, istek fajlova).

Praktično: **`GLOBAL_DAILY_ALARM_USD = 50` i `GLOBAL_DAILY_KILL_USD = 100` ne
rade ništa.** Dnevni plafon po korisniku (`MAX_DAILY_COST_USD = 5`) stoji i radi,
ali njegov vlastiti komentar (`studioCore.ts:145`) kaže zašto to nije dovoljno:
„deset korisnika koji svaki udari u svojih 5 $ je 50 $ koje niko ne primeti".

Commit `95a8b3b` se zove „studio(S0): Dovrsi Z2: globalni plafon troska".
Odluka je izgleda ostala u pola: postoji funkcija koja odlučuje, ne postoji
niko ko je pita.

**Cena:** jedina automatska zaštita nad ukupnim računom kod tri provajdera ne
postoji. Jedino što stvarno stoji je tvrd plafon u fal dashboardu — a on ne
pokriva ni Google ni BytePlus.

---

#### 🔴 R2 — `reference_with_video` daje 40% popusta, a ne naplaćuje ulazni video

`studioPricing.ts:315` definiše `referenceVideoBillableSeconds(outputSeconds,
inputVideoSeconds)`, a njen sopstveni doc-komentar (linija 312) kaže:

> „Poziva je onaj ko pravi posao (`createJob`), pre `computeCredits`-a."

**`createJob` je ne poziva. Ne poziva je niko.** Jedina referenca van definicije
je `studioPricing.test.ts:304` — funkcija je pokrivena testom i nepovezana.

Šta se stvarno dešava: `studio.ts:126` izračuna `pricingMode` i dobije
`reference_with_video`, pravilo primeni `modeMultipliers: 0.6`, a `duration`
ostane **samo izlazno trajanje**. Katalog 3.4 kaže da snižena tarifa važi zato
što se naplaćuju **i ulazni i izlazni** video. Naplaćuje se popust bez osnova
za popust.

| slučaj | naplaćeno | stvarni trošak | **marža** |
|---|---:|---:|---:|
| `seedance-20` 1080p, 5 s izlaz, bez ulaznog videa | 243 kr | $1,87 | **1,50×** |
| `seedance-20` 1080p, 5 s izlaz + 10 s ulaza | 243 kr | $5,61 | **0,50×** |
| `seedance-25` 1080p, 5 s izlaz, bez ulaznog videa | 370 kr | $2,85 | **1,50×** |
| `seedance-25` 1080p, 5 s izlaz + 10 s ulaza | 370 kr | $8,54 | **0,50×** |

Donja granica je **1,50×** (čist množilac 0,6 × 2,5), a sa realnim ulaznim
videom pada na **0,50×** — plaćamo dvostruko više nego što naplatimo.

Dodatno: `hasVideoInput` gleda samo da li slot `video` ima ijedan fajl. Korisnik
koji okači jedan video kao referencu dobije 40% popusta na **ceo** posao.

---

#### 🔴 R3 — Klijent bira koliko će mu se naplatiti (merena količina)

Sedam modela naplaćuje po količini koju korisnik „ne bira nego se meri":
`kling-avatar`, `kling-lipsync`, `kling-motion`, `stt`, `voice-changer`,
`audio-isolation`, `dubbing`.

Meri je **klijent**. `createJob` prima `measuredQuantity: v.optional(v.number())`
(`studio.ts:209`), a `resolveMeasuredQuantity` (`studioJobCore.ts:249`) je
propušta kroz tri kapije: mora biti pozitivna, zaokružuje se naviše, seče se na
`min`/`max` iz kataloga. **Nijedna kapija ne poredi broj sa stvarnim fajlom.**
Doc-komentar to i priznaje („klijent je pročitao `duration` iz `<video>`
metapodataka je jedini izvor"), ali posledica nije zapisana:

| model | prijavi minimum | stvarni fajl | naplaćeno | stvarni trošak | **marža** |
|---|---:|---:|---:|---:|---:|
| `dubbing` | 0,1 min | 120 min | 13 kr | $72,00 | **0,002×** |
| `voice-changer` | 0,1 min | 120 min | 7 kr | $36,00 | **0,002×** |
| `audio-isolation` | 0,1 min | 120 min | 3 kr | $12,00 | **0,003×** |
| `stt` | 0,1 min | 120 min | 1 kr | $0,96 | **0,012×** |
| `kling-motion` | 1 s | 60 s | 28 kr | $7,56 | **0,043×** |
| `kling-avatar` | 1 s | 60 s | 13 kr | $3,37 | **0,045×** |
| `kling-lipsync` | 1 s | 60 s | 16 kr | $0,84 | **0,220×** |

**Ovo je najveća rupa u katalogu.** Za 13 kredita (13 evrocenti) klijent dobije
$72 posla kod ElevenLabs-a. Ne treba mu ni izmena UI-ja — dovoljan je jedan
poziv `createJob` sa `measuredQuantity: 0.1`.

Isti mehanizam radi i bez zle namere: `clampQuantity` seče **naviše** na `max`,
pa fajl od 3 sata pošten klijent prijavi kao 120 min i naplati se 120 min, a
ElevenLabs naplati 180.

Napomena: `extras` (`input_images`, `reference_images`) su ovo uradili **kako
treba** — `extraCounts` (`studioJobCore.ts:158`) broji fajlove koje je server
stvarno video u `inputs`, i komentari u `bytePlusModels.ts:43` i
`falVideoModels.ts:271` izričito objašnjavaju zašto to nije kontrola. Isti
princip nije primenjen na trajanje.

---

#### 🟠 R4 — Tuđi `storageId` se može vezati za svoj posao

`createInputUploadUrl` (`studio.ts:696`) traži prijavu i vraća gol Convex upload
URL. **Nigde se ne pamti ko je šta okačio.** `createJob` prima `inputs` kao
`{ slot: [storageId] }`; `sanitizeJobInputs` proverava imena slotova i broj
fajlova, ali ne i vlasništvo — a i ne može, čista je funkcija bez `ctx`.
`studio.ts` tu proveru ne dodaje.

Dakle: prijavljen korisnik koji zna tuđi `storageId` može da ga stavi u svoj
posao. Posle toga `getJobForRegenerate` i sličice u galeriji vrate mu
`ctx.storage.getUrl(...)` za taj fajl — dakle **čitanje tuđeg fajla**, plaćeno
sopstvenim kreditima.

Ublažavajuće: `storageId` je nepogodiv, a svi upiti koji ga izlažu proveravaju
`job.userId !== userId`. Ovo je zato 🟠, ne 🔴 — ali jedina odbrana je
nepogodivost ID-ja, a to nije kontrola pristupa.
Uz to, `storageId` se ne proverava ni na postojanje: nepostojeći ID prođe
`createJob`, skine kredite, pa padne na predaji i refundira se.

---

#### 🟠 R5 — Legacy `modelCatalog` put je i dalje dostupan po slugu

Detaljno u sekciji 2. Ukratko: `createJob` prima proizvoljan `modelSlug`; slug
kojeg nema u `models` ide starom računicom (`computeCreditCost`) na fal. Među
tim redovima su `flux-2-flash` i `flux-2-pro`, koje katalog §7 izričito
isključuje, i Seedance/Veo varijante na fal ruti sa 2,00×/1,50× marže
provajdera. `STUDIO-NIGHT-REPORT.md` korak 6 još uvek nalaže seed te tabele.

---

#### 🟡 R6 — MiniMax H3 stoji na spornoj tarifi

Katalog 3.6 sam upozorava: fal stranice modela kažu $0,13/s na 2K, „learn"
stranice $0,26/s. Pravilo koristi `baseUsd 0.05 × 2.6 = $0,13/s`. Ako je tačna
druga cifra, marža na 2K je **1,25×**, i to bez ijedne greške u kodu.
Katalog traži da se pusti jedna generacija i pročita faktura pre uključivanja —
to nije urađeno (pravila run-a zabranjuju žive pozive) i nigde nije zabeleženo
kao uslov za puštanje modela.

---

#### 🟡 R7 — Nano Banana Pro thinking tokeni su fiksni u pravilu

`addUsd: 0.015` je konstanta. Katalog 2.2 kaže da Pro „na složenom promptu ume da
premaši" i traži praćenje `actualCostUsd`. Polje `actualCostUsd` postoji u šemi
(`schema.ts:1451`), ali ga za Google put **niko ne upisuje** — Google odgovor se
ne parsira za stvarnu cenu. Marža 2,50× važi samo dok je 0,015 tačno.

---

#### 🟡 R8 — Serverske količine odlaze provajderu kao parametri

`studioActions.ts:166` šalje `input: { ...params, ...falInputFields(...) }`, a
`params` u tom trenutku sadrži i ključeve koje je server dopisao posle
sanitizacije: `char_count`, `minutes`, `duration`, `input_images`,
`reference_images`. Za `tts` to znači da fal-u ide `char_count: 4483`.
fal nepoznata polja obično ignoriše, pa je ovo 🟡 — ali `duration` kod
`kling-avatar`/`kling-lipsync` **nije** izmišljeno ime polja i može da se sudari
sa stvarnim parametrom rute.

Suprotno, dobra vest: **zamka sa `quality: high` iz kataloga 2.3 je zatvorena.**
`sanitizeSpecParams` popuni `quality` i `size` default-ima, a `submitFalCatalogJob`
ih prosledi, pa low tarifa ne može da se naplati na high poslu.

---

## 6. ŠTA NIJE URAĐENO

1. **Globalni dnevni plafon troška se ne izvršava** (R1). Funkcija odluke i dva
   praga postoje; cron i akcija koja ih poziva ne postoje.
   *Procena: 2–3 h* — `internalAction` koja sabere `studioUsageDaily` za dan,
   pozove `decideGlobalCostAction`, ugasi `platformFlags` na `kill` i pošalje
   mejl na `alarm`; plus cron i test. Sav materijal je već tu.

2. **Ulazni video se ne naplaćuje kod `reference_with_video`** (R2).
   *Procena: 3–4 h* — `createJob` mora da dobije trajanje ulaznog videa i pozove
   `referenceVideoBillableSeconds`. Ali trajanje dolazi od klijenta, pa ovo
   nema smisla raditi pre stavke 3.

3. **Merena količina se ne proverava protiv fajla** (R3).
   *Procena: 1–2 dana.* Convex storage ne zna trajanje medija. Tri puta, po
   ceni: (a) najjeftinije i odmah — vezati naplatu za **veličinu fajla u
   bajtovima** iz `ctx.db.system.get(storageId)` kao gornju granicu prijavljenog
   trajanja (bitrate daje grubu ali monotonu granicu); (b) čitati trajanje iz
   zaglavlja fajla u akciji (MP4 `mvhd`, WAV zaglavlje) — tačno za većinu
   formata, ~1 dan; (c) naplatiti tek posle posla iz `actualCostUsd` koji vrati
   provajder — najtačnije, ali menja ceo ledger tok.
   **Do tada bi ovih sedam modela trebalo držati ugašenim** (`isEnabled: false`).

4. **Nema provere vlasništva nad `storageId`-jem** (R4).
   *Procena: 2–3 h* — tabela `studioUploads { userId, storageId, createdAt }`,
   upis u `createInputUploadUrl`… zapravo u mutaciju koju klijent zove **posle**
   uploada, pa provera u `createJob`. Indeks `by_storageId`.

5. **Legacy `modelCatalog` put je dostupan po slugu** (R5).
   *Procena: 1 h* — izbaciti `flux-*` iz `modelCatalogSeeds`, i/ili odbiti
   legacy put u `createJob` kad model postoji u `models` po `family`. Najčistije:
   ugasiti sve legacy redove (`isEnabled: false`) čim v4 pokrije njihove modele.

6. **`actualCostUsd` se ne upisuje ni za jedan provajder.** Bez toga se marža u
   admin ekranu vidi samo kao procena, a R7 se ne može ni primetiti.
   *Procena: 3–4 h* za sva tri provajdera.

7. **`seedance-25` prosleđuje 10 od 50 referenci** (S1). *Procena: 15 min.*

8. **`gemini-omni` režim `video` je ćorsokak** (S3) — nema izbora prethodnog
   klipa. *Procena: 4–6 h* (traži vezu ka `generationJobs` izlazu).

9. **`kling-lipsync` nema režim `video`+`text` iz kataloga** (S2).
   *Procena: 1 h*, ili odluka da `source` kontrola ostane umesto režima.

10. **Kreditne tabele u `STUDIO-CATALOG-V4.md` ne odgovaraju motoru** (1.1).
    *Procena: 1 h* da se kolone „kr/s" i „5s" preračunaju po `ceil` na kraju,
    ili da se u katalog upiše da su orijentacione.

11. **Poller skenira 200 najstarijih `running` poslova** bez indeksa po
    provajderu. *Procena: 1–2 h* (indeks `by_provider_status` ili zaseban status).

12. **Nijedan živ poziv nijednom provajderu nije napravljen.** Imena polja u
    `falInputs.ts` su po fal konvenciji ali nepotvrđena (fajl to i kaže).
    Prva prava generacija po modelu je i dalje neizbežan korak.

---

## 7. RUČNI KORACI ZA JOVANA

Redosled je namenski.

**1. fal.ai — ključ i tvrd plafon potrošnje.**
```
npx convex env set FAL_KEY "<fal api key>"
npx convex env --prod set FAL_KEY "<fal api key>"
```
fal.ai → Billing → **Spending limits** → tvrd mesečni plafon. Dok R1 ne bude
gotov, **ovo je jedina automatska zaštita nad fal računom** — i ne pokriva ni
Google ni BytePlus. Concurrency kreće od 2 i raste sa potrošnjom; kupi kredite
ranije.

**2. Google AI ključ.**
```
npx convex env set GOOGLE_AI_API_KEY "<key>"
npx convex env --prod set GOOGLE_AI_API_KEY "<key>"
```
Vozi Nano Banana 2/Pro, Veo 3.1 Fast i Gemini Omni. **Gemini Omni je javni
preview sa uskom kvotom** — očekuj odbijanja; posao se refundira sam.
Google nema plafon potrošnje kakav ima fal → postavi budžet i alarm u Google
Cloud Billing ručno.

**3. BytePlus — aktivacija i $60 zaključanog balansa.**
```
npx convex env set BYTEPLUS_API_KEY "<key>"
npx convex env --prod set BYTEPLUS_API_KEY "<key>"
```
⚠️ **Svaki Seedance model traži $30 na nalogu, zaključano dok je model aktivan —
$60 za 2.0 i 2.5 zajedno.** Seedream 5 Pro nema taj uslov.
⚠️ Individualni nalog ima **3 istovremena Seedance posla** za ceo nalog, ne po
korisniku. Limit od 3 posla po korisniku (`MAX_ACTIVE_JOBS`) je slučajno isti
broj, ali dva korisnika istovremeno pune red.
U BytePlus konzoli podesi callback na `https://<convex-site>/byteplus/webhook`;
prvi zahtev je `challenge` i kod ga vraća sam.

**4. Stripe — 5 cena, valuta EUR.**

| Slug | Naziv | Cena | Tip |
|---|---|---|---|
| `basic` | Basic | 9,99 € | **Recurring**, mesečno |
| `premium` | Premium | 24,99 € | **Recurring**, mesečno |
| `starter` | Starter | 5,00 € | **One-time** |
| `creator` | Creator | 15,00 € | **One-time** |
| `pro` | Pro | 40,00 € | **One-time** |

Tip nije opcion: `/api/stripe/credits` koristi `mode: "payment"` (odbija
recurring), planovi idu kroz `mode: "subscription"` (odbija one-time).
Zatim upiši `stripePriceId` **ručno u Convex Dashboard → `creditPacks`** —
`npx convex run creditPacks:upsertPack` ide neautentifikovano i vraća `Forbidden`.
Na postojećem `/api/stripe/webhook` uključi tačno pet događaja; **`invoice.paid`
je ona bez koje Premium pretplatnik ne dobija nijedan kredit.**

**5. Ed25519 provera fal webhook-a — proveri da radi u prodakciji.**
Kod je ispravan (`falWebhook.ts`), ali povlači JWKS sa `rest.fal.ai` i **keš je
po izolatu**. Posle prvog pravog webhook-a proveri u Convex logovima da nema
`JWKS dohvat nije uspeo` — ako mrežа ka `rest.fal.ai` bude blokirana, svaki
webhook vraća 500 i fal ponavlja 31 put, pa poslovi vise do reaper-a.

**6. Seed.**
```
npm run convex:seed
```
To pusti `seed:seedInitialContent` **i** `studioModels:seedStudioModels` (30
modela). Idempotentno, i **ne pali modele koje si ručno ugasio**.
⚠️ **Nemoj puštati `seed:seedModelCatalog`** dok se R5 ne reši — ta mutacija
upisuje 24 stara reda, uključujući FLUX koji si izbacio iz kataloga, i oni idu
drugom računicom cene.

**7. Pre prvog evra — ugasi sedam modela iz R3.**
Dok merena količina ne bude proverena protiv fajla, u Convex Dashboard →
`models` postavi `isEnabled: false` za:
`kling-avatar`, `kling-lipsync`, `kling-motion`, `stt`, `voice-changer`,
`audio-isolation`, `dubbing`.
Isto razmotri za `seedance-20` i `seedance-25` u `reference` režimu (R2), ili
privremeno izbaci `reference` iz njihovih `inputModes`.

**8. Kill switch.**
`platformFlags.studio_enabled` u Convex Dashboard-u. `seedPlatformFlags` namerno
**ne prepisuje** postojeći red, pa ponovni seed ne pali Studio koji si ugasio.
Dok R1 ne proradi, ovo je jedini prekidač i okreće se **ručno**.

---

## 8. PREPORUKA

Katalog, cene, rutiranje i specifikacije su tačni i dobro napisani — marža po
pravilu ne može da padne ispod 2,5× ni u jednoj od 3 965 kombinacija, rutiranje
nema nijedno odstupanje, a Seedream 5 Pro i Lite idu različitim rutama kako
treba — ali **Studio ne sme na naplatu dok se ne zatvore R1 (globalni plafon ne
postoji), R2 (0,6× popust bez naplate ulaznog videa) i R3 (klijent bira koliko
će mu se naplatiti, do marže 0,002×)**; do tada drži ugašenih sedam modela sa
merenom količinom i `reference` režim kod Seedance-a.
