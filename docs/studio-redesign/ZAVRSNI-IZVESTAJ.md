# Studio redizajn — završni izveštaj (nezavisna revizija posle koraka 1–10)

> 22. avgust 2026 · revizija, ne kod. **Nijedan fajl proizvoda nije menjan.**
> Metod je isti kao u `STUDIO-HARD-REPORT.md` i `STUDIO-AUDIT-NEZAVISNI.md`:
> čita se **kod na koji tvrdnja pokazuje**, ne dnevnik koji tvrdi da radi. Svaka
> rečenica koja tvrdi da nešto radi nosi fajl i liniju koje sam stvarno pročitao.
> Gde se nije moglo potvrditi čitanjem, stoji **PLAUZIBILNO** sa tačnim testom.
>
> Privremeni alat nisam pravio. Jedina merenja su izlaz četiri kapije (sekcija 0);
> logove sam pisao u scratchpad van repoa, nijedan produkcijski fajl nije taknut.

---

## 0. Verifikacija — tačan izlaz

Sve četiri komande pokrenute nad zatečenim radnim stablom, redom, na ovoj mašini.

| Komanda | Izlaz | exit |
|---|---|---|
| `npx convex codegen` | `Finding component definitions… / Generating server code… / … / Running TypeScript…` | **0** |
| `npm run lint` | `✖ 8 problems (0 errors, 8 warnings)` | **0** |
| `npm run test` | `Test Files 66 passed (66)` · `Tests 916 passed (916)` · `Duration 7.23s` | **0** |
| `npm run build` | `✓ Compiled successfully` · `Finished TypeScript` · `Generating static pages … (64/64)` | **0** |

**Sve četiri prolaze čisto.**

**Osam upozorenja, imenovana** (svih 8 nasleđeno, nijedno u Studio fajlu):
`components/app/admin-inline-actions.tsx` (3: `PlaybackTokenState`, `title`, `<img>`),
`components/app/dashboard-content.tsx` (2: `PlaybackTokenPayload`, `title`),
`components/marketing/public-course-intro-video.tsx` (2: `cn`, `title`),
`get_google_creds.js` (1). Isti skup od 8 koji nasleđuju svi prethodni izveštaji.

**Testova je 916 u 66 fajla.** RD9 je prijavio tačno taj broj — poklapa se.
`convex/chat.test.ts > inbox summary …` u ovom prolazu **NIJE pao** — prošao je
unutar suite-a. Izolovan prolaz zato nije bio potreban; poznata varijabilnost
runnera se ovaj put nije ispoljila.

### Stanje grane — prva blokada, i nije o kodu

Zadatak kaže „grana je `feat/studio-redesign`". **Ona to nije.** Provereno u gitu:

- `git branch --show-current` → **`main`**.
- `main` je na `ed11ef4` („Studio: … redizajn 1-4"). Grana `feat/studio-redesign`
  je na **starijem** `5168312` („all") — dakle **iza** main-a, ne ispred.
- Radno stablo ima **1764 dodatih / 2039 obrisanih linija preko HEAD-a** u Studio
  fajlovima (`git diff --stat HEAD`), svi **neukomitovani**.

Zaključak: koraci 1–4 su ukomitovani u `main`, a **koraci 5–10 (RD4–RD9) postoje
samo kao neukomitovane izmene na `main`-u.** Grana `feat/studio-redesign` je
zastarela i ne sadrži redizajn. „Merge grane u main" u ovom trenutku nije moguć
jer je grana iza main-a, a stvarni rad nije ni na jednoj grani. Ovo je prvo što
mora da se sredi pre bilo kakvog razgovora o merge-u (sekcija 6).

---

## 1. Obećano → isporučeno

Prolaz kroz `PHASE-1-DIRECTION.md`, stavku po stavku.

| # | Obećano (Faza 1) | Status | Dokaz iz koda |
|---|---|---|---|
| 1 | **Rešenje A „Mastionica"** (tamni bunar po kartici) | **isporučeno** | `studio-media-tile.tsx:95` bunar `bg-studio-well` + `surface-media` + `inset … 1px`; token `--color-studio-well: #0e1a2b` (`globals.css:52`); kartica `border-2 border-ink` + 3px senka, hover 5px + lift (`:88-90`). Isti bunar u detalju. |
| 2 | **Composer Pravac 3** (bitni čipovi + cena uvek vidljiva + drop-up) | **isporučeno** | `studio-composer.tsx`: dvoslojni bar + panel (`ModeInputs` 148-226, drop-up/bottom-sheet), model čip + promovisani čipovi, **cena uvek na baru** sa `~procena`→tačno (`:580-587`, `:863-865`). |
| 3 | **Prelaz sidebara** klasično↔studijsko | **isporučeno, sa rupom u reduced-motion** | `app-sidebar-studio.tsx:95-106` usmeren swap (`x: offset`, opacity), tokeni `:34-57`; `app-sidebar.tsx:74` aditivni `SidebarNavSwap`, `:1241` `goBackFromStudio`. **Ne poštuje `prefers-reduced-motion`** — vidi sekciju 4. |
| 4 | **Detalj kao editor** (ruta + plejer + provenijencija + edit composer) | **isporučeno za navigaciju iz mreže; POLOMLJENO za deljiv link** | `studio-media-detail.tsx` (provenijencija, `variant="edit"` composer `:30`, brisanje sa potvrdom `:260-268`); ruta `m/[jobId]`. **Ali osvežen/deljen link prikazuje ULAZ umesto izlaza** — vidi H2, sekcija 3. |
| 5 | **Spajanje galerije** u mrežu | **isporučeno kao lična biblioteka; moderatorski deo TIHO nestao** | `studio-media-grid.tsx` (filteri, izbor, grupno preuzimanje); `studio/gallery/page.tsx` redirect; `studio-gallery-page.tsx` obrisan. **Moderatorski „Svi korisnici" pregled je izgubljen** — vidi H3, sekcija 3. |
| 6 | **Admin ekran** (dvojezičan, humane poruke, Y3 razdvajanje marže) | **isporučeno** | `admin/studio/page.tsx:19` prosleđuje `locale`; `studio-admin.ts:55-156` dvojezične funkcije + Y3 klasifikacija; `studio-admin-page.tsx:337-356` ćilibarski bedž „internal rate over reported quantity (always yields 2.5×)". |
| 7 | **Rečnik pokreta** | **isporučeno, delimično uvezano** | `lib/studio-motion.ts`, `globals.css:26-42` + `:176-189`. Ali polovina CSS tokena je mrtva i sidebar ne poštuje reduced-motion — vidi sekciju 4. |

Sve sedam stavki su **isporučene po suštini dizajna.** Tri (detalj, galerija, pokret)
nose ozbiljne repove koji se ne vide u mreži/mock-u — razrađeni niže.

---

## 2. Osam defekata iz nezavisne revizije

**Napomena o oznakama.** Zadatak traži „C1–C8", ali sekcija 4 u
`STUDIO-AUDIT-NEZAVISNI.md` numeriše **C1–C6**, gde je C6 vreća od sedam podnalaza.
`PHASE-1-DIRECTION.md` 1.3 ima osam redova (C1, C4, C5, C2, C6, C6, admin, fokus).
Pokrivam sve — i šest oznaka i sve podstavke C6 — a ne izmišljam „C7/C8" kojih u toj
sekciji nema.

| defekt | status | dokaz |
|---|---|---|
| **C1** cena na dugmetu ≠ naplaćena | 🟢 **zatvoren** | vidi razradu ispod |
| **C2** galerija tvrdi da nema, a ima | 🟢 **zatvoren** | `studio-media-grid.tsx:95-100` auto-dovlačenje; prazno stanje samo kad je baza iscrpljena (`:437` uz `isLoadingFirst` `:229-231`) |
| **C3** fajl u sakrivenom slotu se šalje | 🔴 **otvoren** (van obima redizajna) | vidi razradu ispod |
| **C4** promena modela briše prompt/fajlove | 🟢 **zatvoren** | vidi razradu ispod |
| **C5** „Generiši" nije blokiran dok upload traje | 🟢 **zatvoren u praksi, mehanizam krhak** | vidi razradu ispod |
| **C6** sitnije, ali vidljivo | 🟢 **uglavnom zatvoren**, jedan rep flawed | vidi razradu ispod |
| **7 (admin)** samo srpski | 🟢 **zatvoren** | `admin/studio/page.tsx:19` `locale` prop; `studio-admin.ts:55-156` |
| **8 (fokus slota)** nema vidljiv fokus, zamena = 2 koraka | 🟢 **zatvoren** | `drop-slot.tsx:371` `focus-within:outline`; „Zameni fajl" dugme `:385-386` |

### C1 — zatvoren, i to **istom funkcijom, ne dve slične** (traženo eksplicitno)

Pratio sam broj od klijenta do servera:

- **Klijent:** `lib/studio-playground.ts:11` uvozi `roundAndClampQuantity` iz
  `@/convex/studioJobCore`. `measuredParams` (`:114-132`) ga zove na `:126` (tekst)
  i `:130` (trajanje), pošto sirove sekunde pretvori u jedinicu preko
  `measuredQuantityFrom` (`:91-93`, `seconds/60` za `..._minutes`).
- **Server:** `convex/studioJobCore.ts:427` `resolveMeasuredQuantity` zove
  **istu** `roundAndClampQuantity` na `:437` i `:444`; sekunde u minute pretvara
  `measuredQuantityFromSeconds:401` — **isti `seconds/60`**.
- **Jedna funkcija:** `roundAndClampQuantity` (`:459-467`) radi `Math.ceil`
  (`:464-465`) pa `clampQuantity` (`:466`, `:469-471`). Nije duplirano — izdvojeno
  iz `resolveMeasuredQuantity` da je uvozi i klijent (komentar `:450-457`).

Zaokruživanje i klampovanje su **doslovno ista funkcija**. Cifra na dugmetu ==
naplaćena cifra. Test paritet je u `studio-playground.test.ts` (RD2). **Zatvoren.**

### C3 — otvoren; redizajn ga nije ni dirao, i sad ga ponavlja

C3 **nije** u osam defekata koje je `PHASE-1-DIRECTION.md` uzeo u obim — zato ga
nijedan RD korak ne pominje. Ali zadatak traži status, pa: **otvoren.**

Composer gradi payload iz `effectiveFiles` (`studio-composer.tsx:485`
`inputs: inputsPayload(effectiveFiles)`). A `effectiveFiles` (`:300-303`) je:

```ts
inputMode === "first_last" ? { ...files, image: framePairFiles(frames) } : files
```

Dakle **ne filtrira opcione slotove.** `optional` se izračuna (`:347-350`) i koristi
**samo** za `missing` (`:351-361`) i za prikaz (`ModeInputs`, `:670`) — **nikad se
ne oduzme od payload-a.** Sakriveni zvučni slot iz audit-scenarija (student prebaci
„izvor govora" na tekst, zvuk nestane sa ekrana) i dalje odlazi kao `audio_url`, jer
`files.audio` ostaje u stanju i `inputsPayload` ga pokupi (`playground.ts:190-198`).
**Ponašanje identično zatečenom kodu — otvoren.**

### C4 — zatvoren

Nema više compound `key` remount-a: `<StudioComposer>` u `studio-page.tsx:432` nema
`key` po modelu. `handleSelectNewModel` (`studio-composer.tsx:420-449`) **ne dira**
`prompt` (`:262`) ni `files` (`:292`); reconcile-uje režim (`:428`) i parametre
(`:432` `paramValuesForMode`) i objavi izmenu kroz `role="status"` (`:442`, render
`:736`). Prompt i fajlovi preživljavaju promenu modela. **Zatvoren.**

### C5 — zatvoren u praksi, ali mehanizam agregacije je krhak (traženo: redosled u `generateBlock`)

**Redosled provera u `generateBlock`** (`playground.ts:152-187`): `paused` →
`not_enrolled` → `active` → **`uploading` (`:170`)** → `inputs` (`:171`) → `source`
→ `prompt` → `measure` → `price` → `credits`. Provera uploada je **pre** ulaza,
prompta i cene — tačno gde treba. `submit()` dodatno brani `if (block !== null ||
isPending || isUploading) return;` (`composer:480`).

**Ožičenje stanja** stvarno postoji (ovo je bilo suština C5): `useSlotIntake`
podiže `pending` naviše kroz `onUploadingChange` (`drop-slot.tsx:87-89`), sve do
`setIsUploading` u composeru (`:673`).

**Rep — krhkost, ne potvrđena rupa.** `isUploading` je **jedan boolean** koji
puni **N nezavisnih slotova** istim callback-om (`ModeInputs` prosleđuje isti
`onUploadingChange` svakom `DropSlot`/`FrameSlotPair`/`ReferenceSlots`, `:176-220`).
Pobeđuje poslednji emiter: ako se u modu sa dva slota prvi otpremi i emituje
`false`, `isUploading` padne na `false` dok drugi još traje. **Ali** odbrana ne
visi samo o tom flegu: `missingInput` (`:351-361`) nezavisno blokira dok fajl
required slota nije prihvaćen, a opcioni slotovi se **i ne renderuju**
(`:148` filtrira `optional`). Za realne modove (`first_last` — oba okvira obavezna;
`reference` — jedan `useSlotIntake`, sekvencijalno) rupa je maskirana. Zato:
**zatvoren u praksi, oslonjen na `missingInput`, ne na ispravnost `isUploading`-a.**
Trka je vredna živog testa (sekcija 5, test 5).

### C6 — podstavke, jedna po jedna

- **„slika" umesto vrste** 🟢 `studio-form.ts:212,219,227` grana po `job.kind`
  (slici/videu/zvuku, srpski padež); tile prosleđuje ceo `job` (`tile:59`).
- **šest kodova greške** 🟢 `studio-messages.ts:170-212` (`NEISPRAVAN_REZIM`,
  `NEISPRAVNI_ULAZI`, `IZVOR_NIJE_IZABRAN`, `IZVOR_NIJE_DOSTUPAN`,
  `IZVOR_NIJE_PODRZAN`, `TUDJI_FAJL`) + `uploading` (`:501`, `:518`).
- **cena na kartici modela ne prati slajder** 🟢 rešeno redizajnom: stari
  `ModelPicker`-picker je zamenjen, cena je sad **uvek živa na baru**
  (`composer:363` nad `form.params`, `:586`).
- **admin samo srpski** 🟢 `admin/studio/page.tsx:19`.
- **radiusi van skale** 🟡 admin `rounded-[8px]` migrirani (nema ih); ostaje jedan
  `rounded-[16px]` u `drop-slot.tsx:263` — to je **sankcionisana vrednost** (card
  tier), samo nije prešao na `surface-card` utility. Nije prekršaj, jeste dug.
- **fokus slota** 🟢 `drop-slot.tsx:371` + „Zameni" `:385`.
- **„Preuzmi izabrano" u petlji (popup)** 🔴 „popravljeno" ali i dalje polomljeno
  na drugačiji način — vidi H1, sekcija 3.

---

## 3. Nove rupe koje je redizajn otvorio

Pretpostavka je bila da ih ima. **Ima ih.** Tri su ozbiljne, sve tri nevidljive u
mreži i u mock režimu — tačno onaj sloj koji samoprocena ne dohvata.

### 🔴 H1 — grupno preuzimanje tiho prijavljuje uspeh i na neuspehu (CORS)

`lib/studio-gallery.ts:228` `downloadMediaFiles`:

1. Pokuša `fetch(item.outputUrl)` → blob → download (`:246-262`).
2. Na **bilo koju** grešku (uključujući CORS) padne u `catch` (`:263`) i uradi
   fallback `<a href=outputUrl download="" target="_blank">.click()` (`:264-273`).
3. **`succeeded.push(item._id)` na `:273` — bezuslovno**, bez ijedne provere da je
   fallback stvarno preuzeo fajl.

Posledice, potvrđene čitanjem koda:
- Convex storage je na drugom origin-u. **Ako `fetch` na potpisan storage URL nije
  CORS-dozvoljen, svaki blob-fetch baci**, fallback se pokrene, i atribut
  `download` se **na cross-origin URL-u ignoriše** → fajl se otvori u novom tabu
  umesto da se preuzme. Za N izabranih to je N tabova → popup-blocker ubije sve
  osim prvog — **isti C6 problem koji je RD7 tvrdio da je rešio sekvencijalnošću.**
- Pošto su svi upisani u `succeeded`, grid vidi `result.failed.length === 0` i
  **obriše celu selekciju** (`studio-media-grid.tsx:225`). Korisniku piše da je sve
  preuzeto, a dobio je jedan tab.
- **U mock režimu se ovo NIKAD ne javi**: izlazi su `data:` URL-ovi (isti origin /
  bez CORS-a), pa `fetch` i `download` rade.

**Deo je POTVRĐEN čitanjem** (bezuslovni `succeeded.push` na `:273`, ignorisan
`download` cross-origin). **CORS ponašanje Convex storage-a je PLAUZIBILNO** — treba
živi test (sekcija 5, test 1).

### 🔴 H2 — deljiv/osvežen link detalja prikazuje ULAZ, ne izlaz

RD6 tvrdi „ruta je deljiva, radi na direktan refresh". Radi — ali prikazuje pogrešan
medij. Kad se detalj otvori za posao koji **nije** u `loadedJobs` (deljen link,
refresh na `/app/studio/m/<id>`), `studio-page.tsx:216-243` fabrikuje `activeJob` iz
`singleJobQuery = getJobForRegenerate`:

- `outputUrl: firstInput?.url ?? null` (`:236`) — to je URL **prvog ULAZA**, ne izlaza.
- `status: "completed"` je **zakucan** (`:233`) bez obzira na stvaran status.

A `getJobForRegenerate` (`convex/studio.ts:1279-1338`) **uopšte ne vraća
`outputUrl`** — njegov `return` (`:1330-1336`) ima samo `modelSlug, inputMode,
params, inputs, missingSlots`. Dakle:

- image-to-video posao otvoren linkom → prikaže se **ulazna slika**, ne generisan video;
- text-to-image posao (bez ulaza) → `firstInput` je `undefined` → `outputUrl: null`
  → detalj prikaže „prazan/istekao" iako izlaz postoji;
- posao u toku / pao → prikazan kao „completed".

U normalnom toku (klik na tajl u mreži) posao **jeste** u `loadedJobs` sa ispravnim
`outputUrl` iz `listMyJobs`, pa se rupa ne vidi. Javi se samo na refresh/share —
baš čemu je funkcija dodata. **POTVRĐENO čitanjem**; tačan render potvrditi živo
(sekcija 5, test 2).

### 🔴 H3 — brisanjem galerije nestao je ceo moderatorski pregled

Obrisani `studio-gallery-page.tsx` bio je **jedini potrošač** moderatorskog/admin
pregleda „Svi korisnici": koristio je `GALLERY_SCOPES`, `scope` prekidač mine/all,
`listAllJobs`, `listJobOwners` i `revealJobDetail` tok sa upisom u `studioAuditLog`
(u HEAD verziji fajla: `:31`, `:436`, `:446`). Grep za `listAllJobs |
revealJobDetail | GALLERY_SCOPES | listJobOwners` po **celom** `components/` i `app/`
danas vraća **ništa**.

Nova mreža (`studio-media-grid.tsx:82`) zove samo `listMyJobs`. Znači: prekidač
„Svi korisnici", filter po vlasniku i admin „Prikaži detalje" (sa audit tragom) —
**nemaju više nijednu površinu.** Convex funkcije postoje, ali su iz frontenda
mrtve. Ceo nalaz N1 iz `STUDIO-HARD-REPORT.md` bio je o tom pregledu — koji je sada
nedostupan. **RD7 nigde ne pominje da je to izgubljeno** — govori samo o spajanju
„galerije" kao lične biblioteke. **POTVRĐENO** (grep prazan; funkcije samo u `convex/`).

### Šta je provereno i NIJE nova rupa

- **Navigacija (`pushState`).** RD7 DEO 0 tvrdi da je `pushState` uklonjen i sve
  ujedinjeno na Next router — **tačno.** U `studio-page.tsx` nema `pushState`/
  `popstate`; navigacija je `router.push`/`router.replace` sa `{ scroll:false }`
  (`:246`, `:252`, `:261`, `:266-268`) vođena `usePathname()` (`:108`, `:125`).
  Grep po `components/app`, `components/studio`, `app/[locale]/app/studio`: nula
  `pushState`/`popstate` (jedini pogodak je `email-verification-page.tsx`, nevezano).
- **Auto-dovlačenje + `IntersectionObserver`.** Ne vrti se i ne preskače: oba
  efekta čuvaju `isLoadingRef` (`grid:90,96,115`), a rezultati se **akumuliraju**
  pa `resultsCount < PAGE_SIZE` (`:96`) mora da se ispuni ili baza da se iscrpi —
  monotono, terminira. Auto-fetch se resetuje kad status napusti `LoadingMore`
  (`:102-106`).
- **Brojač „Izabrano: N".** Ne laže posle promene filtera: selekcija je
  `Map<string, StudioTileJob>` (`:68`), nezavisna od `queryArgs`; brojač je
  `selectedJobs.size` (`:371`), preuzimanje ide nad `Array.from(values())`
  (`:201`). C13 zatvoren. **Sitan rep:** `handleToggleSelect` (`:161`) ne proverava
  da je posao preuzimljiv, pa se u broj može uključiti posao bez `outputUrl` koji
  onda padne u preuzimanju — brojač je pošten o broju, ali izbor može da sadrži
  nešto što se ne preuzima.
- **Sitnica (cena):** za tekstualne modele (`tts`, `dialogue`) `isEstimated`
  (`composer:580`) je uvek `true` jer `serverSeconds` je `null` — cena se
  **uvek** prikaže kao „~procena" iako je broj znakova tačan i na klijentu i na
  serveru. Broj je ispravan, oznaka nije. Kozmetika.

---

## 4. Pokret

**Rečnik postoji i čist je.** `lib/studio-motion.ts` drži tokene (`:18-42`) i
`getStudioMotion` (`:80-128`); `getStudioMotion(true)` vraća nulta trajanja, nulte
pomeraje, skalu 1 (`:81-104`) — pokriveno Vitest-om (RD9, 5 testova).

**Animira se samo `transform`/`opacity` — u značenjskim animacijama: tačno.**
Sidebar swap animira `x`/`opacity` (`app-sidebar-studio.tsx:95-106`); tajl medij
`opacity`/`scale` (`tile:166-171`); disanje bunara `opacity`/`transform: scale`
(`globals.css:176-185`); detalj `scale`/`opacity`. Sve transform/opacity. ✓

**Animacije VAN rečnika:** desetine bare Tailwind `transition` / `duration-150` /
`duration-200` klasa po `studio-media-tile/grid/detail` i `studio-composer`. To su
hover mikro-tranzicije koje **ne** referenciraju rečnik. Bare `transition` (npr.
`grid:333,377,402,445,460,511`; `composer:817,829,844,858,876,893`) animira i
`box-shadow` i boje, ne samo transform/opacity. Tajl je bar delom disciplinovan:
`transition-[transform,box-shadow]` (`tile:89`) — ali i to je box-shadow, ne čist
transform/opacity. Dakle blanko tvrdnja „animira se samo transform i opacity" **nije
doslovno tačna** za hover sloj; jeste za značenjske animacije.

**`prefers-reduced-motion` — NE radi na sva tri značenjska prelaza.**

| prelaz | reduced-motion | dokaz |
|---|---|---|
| mreža ↔ detalj | 🟢 poštuje | `studio-media-detail.tsx:155` `useReducedMotion()` |
| rezultat stiže u bunar | 🟢 poštuje | `tile:51` + gate `!reduceMotion && "studio-breathing"` (`:99`), `initial={reduceMotion ? false : …}` (`:166`) |
| **sidebar klasično ↔ studijsko** | 🔴 **NE poštuje** | `app-sidebar-studio.tsx` nema `useReducedMotion`; nema globalnog `<MotionConfig reducedMotion="user">` (grep prazan). Framer `x: offset` (`:95-106`), `whileHover x:2`, `whileTap scale:0.98` (`:132`) i dalje se izvode. |

Ključni promašaj: **Framer Motion JS animacije IGNORIŠU CSS `@media
(prefers-reduced-motion)`** (`globals.css:191-200`), pa taj blok gasi CSS hover
tranzicije i disanje, ali **ne** sidebar swap. RD3 i RD9 tvrde „reduced-motion =
trenutna zamena" za sidebar — to za sidebar nije tačno.

**Mrtvi tokeni.** `--motion-mikro-*`, `--motion-element-*`, `--motion-prelaz-*` i
sva tri `--ease-studio-*` (`globals.css:26-36`) su **definisani a nigde
referencirani** (grep van `globals.css` prazan). Jedini korišćen CSS token je
`--motion-spor` (`.studio-breathing`, `:188`). „Jedan izvor istine u
`app/globals.css`" je time uglavnom aspiracija: stvarni izvor je JS
`studioMotionTokens`, i on stiže do samo dve komponente.

---

## 5. Šta Jovan MORA da testira uživo (ne vidi se u mock-u)

Konkretno, sa koracima. Sve zahteva `npm run dev` + prijava, i pravi (ne-mock)
storage tamo gde je naznačeno.

1. **H1 — grupno preuzimanje kroz CORS.** Otvori `…/sr/app/studio`, uključi „Izaberi
   više", označi 3 gotova rada sa **pravim** izlazima (ne mock/`data:`), klikni
   „Preuzmi izabrano". **Treba** da se preuzmu tri fajla i da selekcija ostane ako
   neki padne. **Ako** se otvore tabovi umesto preuzimanja, ili popup-blocker javi,
   a selekcija se ipak obriše — H1 je potvrđen: Convex storage ne dozvoljava
   cross-origin `fetch`, i treba serverski download endpoint (ili `Content-Disposition`).
   Proveri i u DevTools → Network da li `fetch` na storage URL vraća CORS grešku.

2. **H2 — deljiv link detalja.** Generiši sliku (text-to-image, bez ulaza). Kopiraj
   URL `…/app/studio/m/<id>`, otvori ga u **novom tabu / posle refresh-a**. **Treba**
   da vidiš generisanu sliku. **Ako** vidiš prazno/„istekao" — H2 potvrđen za
   izlaze bez ulaza. Zatim uradi image-to-video, otvori njegov `/m/<id>` na refresh:
   **ako** vidiš ulaznu sliku umesto videa — H2 potvrđen za izlaze sa ulazima.

3. **H3 — moderatorski pregled.** Prijavi se kao admin/moderator. Pokušaj da nađeš
   „Svi korisnici" pregled tuđih generacija i „Prikaži detalje". **Neće ga biti** —
   potvrdi da je odluka da se moderacija ukloni namerna ili da treba vratiti.

4. **Sidebar reduced-motion.** U OS-u uključi „smanji animacije", pa uđi u Studio i
   izađi „Nazad". **Treba** trenutna zamena. **Ako** meni i dalje klizi s desna/leva
   — potvrđen promašaj iz sekcije 4.

5. **C5 trka (first_last).** Model sa „prvi/poslednji kadar". Prevuci u **oba** slota
   istovremeno, jedan velik fajl jedan mali. U trenutku kad se mali otpremi, brzo
   klikni „Generiši". **Treba** da dugme ostane blokirano dok se i veliki ne otpremi
   (`missingInput` brani). Ako posao prođe sa jednim okvirom — agregacija
   `isUploading`-a je propustila i treba je zameniti brojačem/Set-om.

6. **Živa generacija po modelu (novac).** Ovo je i dalje najveća neproverena
   pretpostavka iz `STUDIO-HARD-REPORT.md` (N2, Y1, Y2, R6) — redizajn je nije ni
   dotakao (frontend). Pre nego što studenti uđu: prva prava generacija po
   provajderu sa fakturom u ruci, i `mimeType` da postane serverski podatak.

---

## 6. Presuda

**Grana nije spremna za merge, i to iz dva nezavisna razloga: git-stanja i tri
otvorene rupe.**

Redizajn je, kao dizajn, dobar i dovršen: sve četiri kapije prolaze čisto (916/916),
C1/C2/C4/C5 zatvoreni sa dokazom u kodu, admin i sidebar isporučeni, Mastionica i
Pravac 3 vernи pravcu. Ali „gotovo" i „spremno za merge" nisu isto.

### Mora pre merge-a

1. **Srediti git.** Rad (RD4–RD9) je neukomitovan na `main`; `feat/studio-redesign`
   je iza main-a. Ukomitovati na pravu granu i tek onda otvoriti PR. Bez ovoga
   „merge" ne postoji.
2. **H2** — deljiv link detalja mora da prikaže izlaz: `getJobForRegenerate` da
   vraća `outputUrl` (i stvaran `status`), ili detalj da ima sopstveni upit koji ga
   vraća. Trenutno funkcija koja je RD6 glavno obećanje prikazuje pogrešan medij.
3. **H3** — svesna odluka: ili vratiti moderatorski pregled (nova ruta koja zove
   `listAllJobs`/`revealJobDetail`), ili eksplicitno zapisati da se moderacija
   uklanja. Danas je tiho nestala.

### Mora pre nego što Studio vide studenti

4. **H1** — grupno preuzimanje: serverski download (ili `Content-Disposition`
   endpoint) umesto cross-origin `fetch`, i **ne** prijavljivati uspeh na neuspehu.
5. **Sidebar reduced-motion** — `useReducedMotion` u `app-sidebar-studio.tsx`, ili
   globalni `<MotionConfig reducedMotion="user">`. Pristupačnost, ne kozmetika.
6. **Sve iz `STUDIO-HARD-REPORT.md` sekcije 5.A** i dalje važi — redizajn je
   frontend i nije taknuo N2/Y1/Y2/Y4. `mimeType` kao serverski podatak, Stripe Tax
   pre deploy-a, prva živa faktura. Ovaj izveštaj ih ne obara niti zatvara.

### Backlog

- **C3** — sakriveni opcioni slot da se oduzme od payload-a (`optional` već postoji,
  samo se ne primenjuje na `inputsPayload`).
- **C5** — zameniti `isUploading` boolean brojačem/Set-om po slotu (ukloniti oslonac
  na `missingInput`).
- Mrtvi CSS motion tokeni — ili uvezati u hover sloj ili obrisati.
- `drop-slot.tsx:263` `rounded-[16px]` → `surface-card`.
- Tekstualni modeli da ne pišu „procena" kad je broj tačan (`composer:580`).
- Izbor nepreuzimljivih poslova u grupnom izboru (`grid:161`).
- Squash istorije pre merge-a (kao što su i prethodni izveštaji tražili).

---

## 7. Ko je prijavio više nego što je isporučio

Proverio sam pre nego što imenujem. **Tri koraka.**

**RD6 (korak 7 — detalj kao editor)** je prijavio da je ruta „deljiva … radi na
direktan refresh". Radi tehnički, ali prikazuje **ulaz umesto izlaza** (H2):
`getJobForRegenerate` ne vraća `outputUrl` (`studio.ts:1330-1336`), a fabrikacija
u `studio-page.tsx:236` uzima `firstInput?.url` i zakucava `status:"completed"`.
Glavno obećanje koraka — deljiv medij — pokazuje pogrešan medij.

**RD7 (korak 8 — spajanje galerije)** je prijavio čisto spajanje i „nijedan link ne
puca". Dva promašaja: (a) obrisao je **jedini** moderatorski pregled (H3) i nigde to
nije pomenuo; (b) „popravka C7" grupnog preuzimanja tiho prijavljuje uspeh i kad
CORS obori download i selekciju ipak obriše (H1). Dnevnik govori o merge-u lične
biblioteke; o izgubljenoj moderaciji i o krhkom download-u — ništa.

**RD9 (korak 10 — pokret)** je prijavio da „`prefers-reduced-motion` stvarno radi na
sva tri značenjska prelaza" i „jedan izvor istine". Sidebar swap **ne** poštuje
reduced-motion (nema `useReducedMotion`, nema `MotionConfig`), pa je dva od tri, ne
tri od tri. „Izvor istine u `globals.css`" je uglavnom mrtav kod — šest od sedam
`--motion-*` i sva tri `--ease-studio-*` se nigde ne referenciraju.

Pošteno na drugu stranu: **RD2 (C1) je zatvorio C1 tačno kako treba** — jedna
izdvojena funkcija, ne dve slične, sa paritet-testom. **RD1–RD5 su verne pravcu i
kapije drže.** Ali samoprocena ima plafon, i on je tačno tamo gde je i prošli put:
u onome što se ne vidi u mreži i u mock režimu — deljiv link, moderatorski pregled,
grupno preuzimanje kroz pravi storage, i pristupačnost sidebara.
