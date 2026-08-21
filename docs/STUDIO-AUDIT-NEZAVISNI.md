# Studio — nezavisna revizija (posle XRV)

> 21. avgust 2026 · grana `feat/studio-faza-a` · HEAD `267e783`
> Ovo NIJE izveštaj harness-a. Ovo je nezavisna provera koju je uradio Claude
> posle XRV-a, sa četiri odvojena revizora nad dimenzijama koje nijedan run
> nije pokrio: **ledger novca, autorizacija i izlaganje podataka, frontend i
> UX**, plus nezavisna potvrda XRV-ovih sopstvenih nalaza.
>
> Svaki nalaz ispod je pročitan u kodu, sa fajlom i linijom. Ono što nije
> potvrđeno kodom stoji označeno kao PLAUZIBILNO.

---

## 0. Stanje grane

| | |
|---|---|
| Koraka izvršeno | 8 od 8 (X1–X7 + XRV), svaki iz prvog pokušaja |
| Cena X run-a | $106,93 |
| `npm run lint` | 0 grešaka, 8 upozorenja (svih 8 nasleđeno, nijedno iz X run-a) |
| `npm run test` | **879 / 879**, 62 fajla |
| `npm run build` | prošlo, 64 stranice |
| Obim od `main` | 333 fajla, +59 788 / −534 linije |
| Marža | minimum **2,5000×** kroz 4 085 743 kombinacije |

**XRV izveštaj je tačan i pošten.** Proverio sam njegova tri najteža nalaza
nezavisno; svi stoje. To je izveštaj koji sam sebe obara na tri mesta i imenuje
korake koji su prijavili više nego što su isporučili — vredi mu verovati.

---

## 1. Potvrda XRV nalaza

| XRV nalaz | Moja provera |
|---|---|
| **Y1 / N2** — granica trajanja visi o `Content-Type`-u koji klijent bira | **POTVRĐENO, i gore nego što piše.** Nepoznat MIME (`application/octet-stream`) ne daje granicu **i to se tretira kao „propusti", ne kao „odbij"** (`lib/media-duration.ts:158-162`, `convex/studioJobCore.ts:341-352`). Serverska provera `accept` liste **ne postoji nigde** — `SlotSpec.accept` se parsira na `convex/studioJobCore.ts:42-45` i posle toga se u celom `convex/` više nikad ne čita. |
| **Y2** — poravnanje čita nazad naš sopstveni broj | **DELIMIČNO.** Pečat `settledAt` na `creditDelta === 0` i trajna brava: potvrđeno (`convex/studio.ts:743-754`, `:710`). Ali eho **ne može** da se desi preko fal-a — `falWebhook.ts:126` prosleđuje samo `body.payload` (izlaz modela), ne `input`. Može preko BytePlus-a (`lib/byteplus.ts:191`) i Google-a (`lib/google-video.ts:272`), koji prosleđuju ceo odgovor. Opasna polovina (brava) je stvarna nezavisno od provajdera. |
| **Y4** — `automatic_tax` na kupovini kursa | **POTVRĐENO.** `lib/stripe.ts:68`, `:117`, `:159` — sve tri sesije. Deploy pre uključivanja Stripe Tax-a obara prodaju kurseva. |

---

## 2. NOVO — van Studija, i **već je živo na nauciai.com**

Ovo su najteži nalazi cele revizije i **nijedan nije napravio nijedan harness
run.** Postoje u zatečenoj platformi, danas, u produkciji.

### 🔴 A1 — Stripe billing portal je otvoren bez ijedne provere

`app/api/stripe/portal/route.ts` — pročitao sam ceo fajl. Nema nijedne provere
identiteta, a klijentov `customerId` ima **prednost** nad korisnikovim:

```ts
const customerId =
  typeof body.customerId === "string"
    ? body.customerId
    : subscriptions?.find((s) => s.stripeCustomerId)?.stripeCustomerId;
```

Linija 16 guta neuspeh autentikacije sa `.catch(() => [])`, pa neulogovan
pozivalac ni ne dobije grešku.

**Napad:** neulogovan napadač pošalje `POST /api/stripe/portal` sa
`{"customerId":"cus_...","locale":"sr"}` i dobije nazad URL Stripe billing
portala tuđeg naloga — istorija računa, adresa za naplatu, brend i poslednje
četiri cifre kartice, i mogućnost da **otkaže pretplatu** ili zameni karticu.
Bez logina, bez CSRF tokena, bez rate limita.

Popravka je jedan `if`: uzmi `customerId` isključivo iz `getBillingSummary`
ulogovanog korisnika i **ignoriši** `body.customerId`.

### 🔴 A2 — Paywall na kurseve ne proverava da li je kurs plaćen

`convex/helpers.ts:320-352` `requireCourseAccess` proverava **tri** stvari:
ulogovan, mejl verifikovan, kurs `published`. Nema nijednog upita nad
`enrollments` ni `subscriptions`.

Funkcija koja to radi — `hasActiveSubscription` (`convex/helpers.ts:305-318`) —
**postoji odmah iznad i nema nijednog pozivaoca u celom repou.** Grep-ovao sam
`convex/`, `lib/`, `app/`, `components/`: jedini pogodak je njena definicija.

**Napad:** ulogovan korisnik sa verifikovanim mejlom, koji nikad ništa nije
platio, poziva `api.lab.getLessonLab` i dobija svaki korak, svaki zadatak i
svaki `systemInstruction` plaćenog kursa. Isti korisnik kroz
`POST /api/ai/course-chat` troši tvoj OpenAI budžet nad tim sadržajem.

Ulaz u sam Studio je zaštićen — `createJob` radi sopstveni upit nad
`enrollments` (`convex/studio.ts:404-409`). Rupa je u svemu ostalom.

### 🟠 A3 — `WEBHOOK_SYNC_SECRET` je jedan string koji drži celu ekonomiju

Deset **javnih** Convex funkcija je zaštićeno isključivo njime, poređenjem koje
nije konstantnog vremena (`convex/helpers.ts:355-360`, `!==` na stringu).

Šta može onaj ko dođe do tog stringa — iz CI loga, Vercel env dump-a, screenshot-a:

- `credits.applyStripeGrant` — proizvoljno kredita proizvoljnom korisniku
- `seed.grantDemoCredits` — isto, po mejlu, i **namerno ponovljivo**
- `credits.applyStripeReversal` — nulira tuđe kredite, gura saldo u minus, i sa
  `kind:"dispute"` **trajno zaključava tuđi Studio** bez ijednog puta za otključavanje
- `billing.syncStripeSubscription` — upisuje `active` red u `enrollments` za bilo
  koga: **besplatan pristup kursu i Studiju**
- šest seed funkcija — resetuju katalog i cenovnik, brišući svaku admin izmenu

Nijedna ne piše audit red, nijedna nije rate-limitovana. Rotacija tog secreta
stoji na spisku od prvog izveštaja i i dalje nije urađena.

---

## 3. NOVO — ledger novca

### 🔴 B1 — `failJob` nema proveru statusa: isporučena slika se refundira 100%

`convex/studio.ts:778-796` ne gleda `job.status` uopšte. BytePlus sinhrona
putanja (`convex/providers/byteplus.ts:94-127`) zove `markJobDone` — posao
postaje `done`, izlaz je snimljen — a **sledeći** poziv `recordProviderUsage` je
u istom `try`. Ako on padne iz bilo kog razloga, `catch` na `:124` zove
`failJob`, koji posao gurne u `failed → refunded` i vrati **sve** kredite.

Korisnik zadrži sliku i dobije pun povraćaj.

Popravka: `if (job.status !== "reserved" && job.status !== "running") return null;`

### 🔴 B2 — Povraćaj može da vrati VIŠE kredita nego što je uzeto

`settleJobCredits` se čuva samo `settledAt`-om, ne statusom posla
(`convex/studio.ts:709-712`). Ako refund stigne pre poravnanja:
`refundCredits` (`convex/credits.ts:467-481`) vidi samo rezervaciju i vrati
punih 100 kredita. Zatim se izvrši poravnanje — `settledAt` je i dalje prazan,
status se ne gleda — i ako je stvaran trošak niži, `openReturnLot` otvori
**još jedan** lot. Rezervisano 100, poravnato na 80, korisnik dobio **120**.

### 🔴 B3 — Dobijen spor zauvek zaključava nalog

`charge.dispute.created` upisuje trajan red u `creditReversals`. Događaja
`charge.dispute.closed` **nema** u webhook-u (`app/api/stripe/webhook/route.ts:331-395`),
i nijedna funkcija u repou taj red ne briše — grep vraća samo `credits.ts:610`
(insert) i `studio.ts:453` (čitanje).

Korisnik čiji se spor reši **u tvoju korist** ostaje trajno zaključan
(`SPOR_U_TOKU`), lot mu je poništen, novo kupovanje ne pomaže. Novac plaćen,
krediti nestali, Studio zatvoren, bez ijednog leka u kodu.

### 🟠 B4 — Povraćaj posle isteka dvaput oduzima isti iznos

`applyLotExpiry` (`convex/credits.ts:300-308`) oduzme `lot.remaining` iz balansa.
`applyStripeReversal` (`:581-597`) gleda samo `revokedAt` i oduzme **`lot.granted`**.

Paket od 1000 kredita, ništa potrošeno, istekne posle 12 meseci → balans 0.
Zakasneo chargeback (Visa ide do 540 dana, dobro preko `computeExpiry`) →
oduzme još 1000 → **balans −1000 korisniku koji nije potrošio ništa.**
`SALDO_U_MINUSU` mu zatvori Studio, a nova kupovina ga vrati samo na nulu.

### 🟡 B5 — Delimičan povraćaj poništava ceo paket

`convex/creditsCore.ts:334` `chargeReversal` ne čita `amount_refunded` nigde.
Povraćaj od 1 € na paket od 50 € poništava **sve** kredite. Najčešći delimičan
povraćaj je gest dobre volje podrške — koji bi danas kaznio korisnika.

### 🟡 B6 — Balans može da bude viši od stvarnih lotova do 24 h

Istek je jednom dnevno u 03:15 UTC, `EXPIRY_BATCH_LIMIT = 100`, jedan batch po
prolazu (`convex/crons.ts:40`, `:102-110`). Do tada `getBalance` vraća broj veći
od zbira lotova, pa sajdbar i dugme pokazuju kredite koje `applySpend` odbija sa
`NEDOVOLJNO_KREDITA`. Preko ~100 isteklih lotova dnevno zaostatak se nikad ne
isprazni i razlika postaje trajna.

---

## 4. NOVO — ono što student stvarno vidi

### 🔴 C1 — Cena na dugmetu nije cena koja se naplati

Ovo obara jedino obećanje koje je u kodu zapisano kao pravilo („cifra na dugmetu
i naplaćena cifra su ista računica nad istim brojem").

- **Server:** `resolveMeasuredQuantity` radi `Math.ceil` pa `clampQuantity` na
  `[min, max]` (`convex/studioJobCore.ts:447`, `:452-453`)
- **Klijent:** `measuredQuantityFrom` vraća **sirov** broj —
  `seconds` ili `seconds / 60`, bez zaokruživanja i bez klampovanja
  (`lib/studio-playground.ts:87-89`)

A trajanje iz zaglavlja je uvek razlomljeno (`duration / timescale`).

| slučaj | dugme kaže | naplati se |
|---|---:|---:|
| `kling-motion` 720p, klip 7,4 s | 202 kr | **218 kr** |
| `voice-changer`, klip 4 s | 5 kr | **7 kr** |
| transkripcija fajla od 3 h | 312 kr | **208 kr** |

Test je promašio jer koristi 12 s, 90 s i 1000 znakova — vrednosti gde `ceil`
ne radi ništa (`lib/studio-playground.test.ts:135-144`).

### 🟠 C2 — Galerija tvrdi da generacija nema, a ima ih

`listMyJobs` primenjuje filtere **posle** `paginate` (`convex/studio.ts:937-948`),
pa prva stranica legitimno vrati 0 redova sa `status: "CanLoadMore"`. Galerija
to čita kao konačno (`components/app/studio-gallery-page.tsx:774`) i prikaže
prazno stanje — a dugme „Učitaj još" je u drugoj grani i nikad se ne montira.

Student filtrira po modelu koji je koristio pre 30 generacija i dobije
„Nijedna generacija ne odgovara ovim filterima", bez ikakvog načina da učita
dalje. Njegov rad izgleda obrisano.

### 🟠 C3 — Fajl u sakrivenom slotu se i dalje šalje i naplaćuje

`optionalSlots` skloni slot iz prikaza, ali `submit()` šalje
`inputsPayload(effectiveFiles)` nefiltrirano (`components/app/studio-page.tsx:452`).

Kling lipsync: student okači zvuk, pa prebaci „izvor govora" na *tekst* i
otkuca rečenicu. Zvučni slot nestane sa ekrana, ali `audio` i dalje ode
provajderu kao `audio_url`. Model koristi zvuk i ignoriše otkucan tekst.
Student plati punu cenu za generaciju koja je zanemarila ono što je napisao.

### 🟠 C4 — Promena modela briše prompt i sve okačene fajlove, bez upozorenja

`key={...}` na `PlaygroundForm` (`studio-page.tsx:874`) forsira pun remount pri
svakoj promeni modela. Student napiše tri pasusa, prevuče dve reference, klikne
drugi model da uporedi cenu, vrati se — sve je nestalo.

### 🟠 C5 — „Generiši" nije blokirano dok upload traje

`pending` je lokalan za svaki `DropSlot` (`components/studio/drop-slot.tsx:77`) i
nikad ne stigne do dugmeta, a `missingInput` je zadovoljen **jednim** fajlom.
Student prevuče 5 referenci, prva se otpremi, klikne Generiši — posao se izvrši
i naplati sa **jednom** referencom. Ništa mu to ne kaže.

### 🟡 C6 — Sitnije, ali vidljivo

- Svaki video i zvučni posao u toku opisan je kao slika: „Model radi na tvojoj
  **slici**…" bez grananja po `job.kind` (`lib/studio-form.ts:216`, `:236`, `:239`)
- „Preuzmi izabrano" otvara `window.open` u petlji — blokator popup-a propusti
  jedan fajl, a selekcija se ipak obriše (`studio-gallery-page.tsx:526-533`)
- Cena na kartici modela ne prati slajder trajanja: `ModelPicker` prima
  `duration` i `studio-page.tsx:858-866` mu ga nikad ne prosledi
- Admin ekran Studija je **samo srpski** — nema `locale` prop uopšte
- Šest kodova greške koje `createJob` stvarno baca nema u mapperu
  (`NEISPRAVAN_REZIM`, `NEISPRAVNI_ULAZI`, `IZVOR_NIJE_IZABRAN`,
  `IZVOR_NIJE_DOSTUPAN`, `IZVOR_NIJE_PODRZAN`, `TUDJI_FAJL`) — svi padnu na
  „Pokušaj ponovo za koji trenutak", što je pogrešan savet: ponavljanje neće pomoći
- Tri radiusa van četiri dozvoljena: `rounded-[16px]` (`drop-slot.tsx:252`),
  `rounded-[8px]` ×2 (`studio-admin-page.tsx:18`, `:883`)
- Drop slotovi nemaju vidljiv fokus za tastaturu

---

## 5. Šta je provereno i JESTE ispravno

Ovo nije formalnost — pokrivenost je bitna koliko i nalazi.

**Ledger.** `creditBalances` ima **tačno jednog** pisca (`applyBalanceDelta`,
`convex/credits.ts:74-95`) i svaki pozivalac u istoj mutaciji piše i lot, i
balans, i red u `creditTransactions`. FIFO je ispravan: `planSpend` sortira po
`expiresAt`, uzima `now` jednom, i cela operacija je u jednoj Convex transakciji —
lot ne može da istekne usred trošenja. Istekao lot ne može da se potroši ni da
se u njega vrati. Idempotencija postoji za svaki Stripe događaj, sa pravim
ključem. Welcome bonus ima dva nezavisna čuvara. Nula-evro fakture (kupon 100%)
ne dodeljuju ništa, i `allow_promotion_codes: false` je na obe sesije.

**Autorizacija.** Pročitane su prve linije **svake** javne funkcije u osam
Convex fajlova. Nijedan neulogovan pozivalac ne stiže ni do čega što košta,
vraća tuđe podatke, vraća potpisan URL ili menja stanje — osim A1 i A3.
Nema nijednog mesta gde se autorizacija radi posle efekta. Svi IDOR parametri
(`jobId`, `storageId`, `grantId`, `modelId`) proveravaju vlasništvo **pre** nego
što se red vrati. Stripe webhook verifikuje potpis pre svake grane. fal webhook
verifikuje Ed25519 nad sirovim bajtovima. BytePlus callback je nepotpisan kod
vendora, ali kod nikad ne veruje payload-u — proveri da je zadatak naš i ponovo
povuče status. `migrations.ts` je ceo interni (provereno u izvoru biblioteke,
ne pretpostavljeno).

**Frontend.** Dvoklik na Generiši ne može da napravi dva posla. Cena po broju
znakova se poklapa znak za znak. Postoji **jedna** funkcija za cenu u celom
repou. Prebacivanje režima nosi samo kompatibilne vrednosti i prijavljuje
sklonjene fajlove kroz `role="status"`. Status posla se osvežava sam
(Convex pretplata), bez refresh-a. Istekao izlaz je obrađen do kraja — kartica
zadrži prompt i ponudi „Generiši ponovo" sa cenom. `credits === null` se nikad
ne prikaže kao 0. `?regenerate=` vraća model, režim, parametre, ulaze i izmerena
trajanja, i imenuje slotove čiji su ulazi istekli.

**Cenovni motor.** Jedan `ceil`, na jednom mestu, jednom
(`convex/studioPricing.ts:281`). Nijedan `modeMultipliers` ispod 1 ne postoji.
Enumeracija od 4 085 743 kombinacije potvrđuje minimum 2,5000×.

---

## 6. Redosled

**Pre bilo čega drugog — ovo je već živo:**

1. **A1** — `body.customerId` iz `app/api/stripe/portal/route.ts`. Jedan `if`.
2. **A2** — `requireCourseAccess` da zove `hasActiveSubscription`, koja već postoji.
3. **A3** — rotiraj `WEBHOOK_SYNC_SECRET`, i izbaci `grantDemoCredits` iz produkcije.

**Pre nego što `FAL_KEY` uđe u Convex env:**

4. **N2 / Y1** — `mimeType` da bude serverski podatak: `registerInputUpload` da
   odbije tip van `accept` liste, `boundedInputSeconds` da **odbije** fajl bez
   poznatog tipa umesto da ga propusti, granica po formatu koji je parser
   stvarno pročitao (`DurationRead.format`), ne po prijavljenom MIME-u.
5. **B1**, **B2** — dve provere statusa, po jedan red svaka.
6. **C1** — klijent da uvozi `resolveMeasuredQuantity` umesto da računa svoj broj.
7. Dok 4 nije gotovo: `dubbing`, `voice-changer`, `audio-isolation` ostaju ugašeni.

**Pre nego što se Stripe upali za studente:**

8. **Y4** — uključi Stripe Tax **pre** deploy-a, ili skini `checkoutTaxParams()`
   sa `createCourseCheckoutSession` (`lib/stripe.ts:68`). Inače deploy obara
   prodaju kurseva, koja je jedini prihod koji danas postoji.
9. **B3** — `charge.dispute.closed` i skidanje brave.
10. **B4**, **B5** — aritmetika poništavanja.
11. Popuni osam `[POPUNITI: ...]` polja u `lib/legal-copy.ts`.

**Posle prve žive generacije po modelu, sa fakturom u ruci:**

12. Proveri `Range` (mora 206), imena polja u `falInputs.ts`, `DURATION_KEYS`
    (Y2), MiniMax H3 tarifu (R6), i dopiši `prompt` tarifu za `nano-banana-pro`.

**Backlog:** C2–C6, N1 (trag pristupa za admina), N3 (rate limit na
`createInputUploadUrl`), serverska provera veličine fajla, Y3, R8.
