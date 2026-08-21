# Studio - revizija noćnog run-a (19.08.2026, 03:53-04:10)

Ovo nije nastavak implementacije. Ovo je nezavisna provera svega što je noćas
napisano, sa jednim ciljem: da ujutru znaš gde je tanko **pre** nego što
naplatiš prvi evro, a ne posle.

Metod: ponovo su puštene sve tri verifikacione komande, pročitan je ceo
`docs/STUDIO-PROGRESS.md` (1255 linija), ceo `docs/STUDIO-PLAN.md` i sav novi
kod u `convex/credits.ts`, `convex/creditsCore.ts`, `convex/studio.ts`,
`convex/studioCore.ts`, `convex/studioActions.ts`, `convex/falWebhook.ts`,
`convex/falWebhookCore.ts`, `convex/seed.ts`, `lib/fal.ts`, `lib/stripe.ts` i
`app/api/stripe/webhook/route.ts`.

---

## STANJE

### Verifikacija, pokrenuta ponovo nad zatečenim stanjem grane

| Komanda | Ishod | Tačan izlaz |
|---|---|---|
| `npx convex codegen` | **prošlo** | `Finding component definitions... / Generating server code... / Bundling component definitions... / Bundling component schemas and implementations... / Downloading current deployment state... / Uploading functions to Convex... / Generating TypeScript bindings... / Running TypeScript...` (exit 0) |
| `npm run lint` | **prošlo** | `✖ 7 problems (0 errors, 7 warnings)` - svih 7 su zatečena upozorenja u `admin-inline-actions.tsx` (3), `dashboard-content.tsx` (2) i `public-course-intro-video.tsx` (2); nijedno nije iz Studio koda |
| `npm run test` | **prošlo** | `Test Files 31 passed (31) / Tests 208 passed (208) / Duration 3.92s` |

Napomena o `codegen`-u: on **jeste** kontaktirao dev deployment
(`Downloading current deployment state... / Uploading functions to Convex...`).
To je normalno ponašanje `convex codegen`-a u ovom repou i nije `deploy` na
produkciju - ali znaj da tvoj **dev** deployment već ima ovaj kod.

### Grana i obim

`feat/studio-faza-a`, 11 commit-ova iznad `main`
(`696f669 wip` + `A1..A10`). `git diff --stat main...HEAD`: 87 fajlova,
+9929 / -457. Bez `.studio-run/` i `run-studio-night.ps1`, produkcijski deo je
42 fajla, +5555 / -29.

Radno stablo: `M .studio-run/logs/run_2026-08-19_02-08.log`,
`?? .studio-run/logs/RV_a1.err.txt` (0 bajtova). Ništa nekomitovano u `convex/`,
`lib/` ili `app/`.

### Koraci - završeni

Svih 10 koraka noćnog run-a (A1-A10) je završeno i svaki je ostavio zeleno
codegen / lint / test. **Nijedna BLOKADA nije upisana ni u jednom koraku.**

| Korak | Naslov | Stanje |
|---|---|---|
| A1 | Šema (creditLots, creditTransactions, creditBalances, creditPacks, modelCatalog, generationJobs, studioUsageDaily) | gotovo |
| A2 | Ledger: `creditsCore.ts` + `credits.ts` + 12 testova | gotovo |
| A3 | Planovi Basic/Premium, pristup Pro lekcijama preko `enrollments.plan` | gotovo |
| A4 | `creditPacks` katalog + seed (5 redova) | gotovo |
| A5 | Stripe checkout: `/api/stripe/credits` + `createPlanCheckoutSession` | gotovo, plan-ruta nema pozivaoca |
| A6 | Stripe webhook: `credit_pack` grana + `invoice.paid` + `plan` na subscription | gotovo |
| A7 | `modelCatalog` + seed (22 modela; 8 slika uključeno, 14 isključeno) | gotovo |
| A8 | `lib/fal.ts` + `studioActions.submitJob` | gotovo |
| A9 | `studio.createJob` sa rezervacijom, kill switch, limiti | gotovo |
| A10 | fal webhook: ED25519 + idempotentna obrada | gotovo |

### Koraci - blokirani

**Nijedan formalno.** Ali jedna tvrdnja stoji neproverena i nosi rizik ranga
blokade:

> **Ed25519 preko `crypto.subtle` nije potvrđen na živom Convex runtime-u.**
> A10 testovi ga dokazuju samo u `edge-runtime`-u koji vitest koristi. Ako
> Convex V8 izolat ne podržava `importKey("raw", ..., { name: "Ed25519" })`,
> **svaki fal webhook pada i svaki posao ostaje zauvek u `running` sa skinutim
> kreditima.** To je najskuplja pojedinačna neproverena pretpostavka u celom
> run-u. Provera je 5 minuta (vidi RUČNI KORACI #8).

### Koraci - nisu ni počeli

`persistOutput` (prazan stub), sav UI (`/app/credits`, `/app/studio`, galerija,
admin ekran), reaper cron, cron za istek kredita, dnevni alarmi troška,
retencija. Detaljno u sekciji **ŠTA NIJE URAĐENO**.

### Jedna rečenica o ukupnom kvalitetu

Ledger je ozbiljno urađen - FIFO po isteku, idempotencija na tri mesta,
invarijantni test sa seedovanim PRNG-om, i svaki korak tvrdi da je testove
proverio mutacionim testiranjem. **Ono što nedostaje nije kvalitet napisanog
koda, nego kod koji nije napisan**: sve rupe ispod su ili u nenapisanom delu ili
u sloju koji spaja napisano.

---

## RIZICI PO NOVAC

Ocene: 🔴 otvorena rupa · 🟡 pokriveno ali tanko · 🟢 pokriveno i testirano.

### a) Rezervacija bez posla - mutacija pukla posle spend-a

**🟢 unutar transakcije · 🔴 posle nje**

`createJob` (`convex/studio.ts:88-113`) radi: `insert generationJobs` →
`ctx.runMutation(internal.credits.spendCredits)` → `patch studioUsageDaily` →
`scheduler.runAfter(0, submitJob)`. Redosled je obrnut od onog koji A9.md
propisuje, jer `spendCredits` traži `jobId`.

`convex/_generated/ai/guidelines.md:99` kaže da ugnježden `ctx.runMutation` iz
mutacije radi kao **podtransakcija**: ako baci, njegovi upisi se povlače
nezavisno, a pozivalac sme da uhvati grešku i nastavi sa svojim upisima.
`createJob` grešku **ne hvata**, pa se ona propagira i cela spoljna mutacija se
povlači. Atomičnost, dakle, stoji - ali stoji **isključivo zato što nema
`try/catch`**. To nije stilska sitnica, to je nosivi zid.

Pokriveno: `convex/studio.test.ts`, test "nedovoljno kredita" tvrdi pet stvari
odjednom - nema `generationJobs` reda, nema `spend` transakcije, balans
nepromenjen, nema `studioUsageDaily` reda, nema zakazane akcije. Taj test je
ujedno i čuvar protiv budućeg `try/catch`-a: čim ga neko doda, test pada. A9 je
to proverio mutacijom koda.

**Ali rupa je posle commit-a, ne pre njega.** Kad transakcija prođe, krediti su
skinuti, posao je `reserved`, i jedina stvar koja ga pomera dalje je zakazana
akcija `submitJob`. Tri načina da posao zauvek ostane u `reserved` sa skinutim
kreditima:

1. **Zakazana akcija nikad ne odradi do kraja** - Convex incident, deploy usred
   leta, hard abort izolata. Nema retry-ja, nema reaper-a, nema alarma.
2. **`submitToFal` uspe, `markJobRunning` padne.** Tada `catch` u `submitJob`
   zove `failJob` i korisnik dobija kredite nazad - ali **fal je već primio
   zahtev i naplatiće ga**. Kasnije stiže webhook sa `request_id`-jem kojeg
   nema u bazi (`falRequestId` nikad nije upisan), `applyWebhookResult` vrati
   `null`, 200, tišina. Gubitak je tvoj, ne korisnikov, i nigde se ne vidi.
3. **`failJob` sam baci.** Jedini put je `NEMA_TROSKA_ZA_REFUND`, i on je iz
   `createJob`-a nedostižan - ali ako se desi, izuzetak izlazi iz `catch` bloka
   u `submitJob`-u, akcija pada, posao ostaje `reserved`, krediti skinuti.

Nijedan od ta tri nije pokriven testom (prva dva se unit-testom i ne mogu
pokriti). **Sva tri leči isti reaper koji ne postoji.**

### b) Posao bez rezervacije

**🟢 na ulazu · 🔴 na ponovnom slanju**

Ulaz je čist: posao i potrošnja su u istoj transakciji (vidi a). Test 1 iz
`studio.test.ts` to tvrdi izričito. Klijent ne može da dobije posao bez
naplaćenih kredita.

Rupa je drugde: **`submitJob` ne proverava da je posao još u `reserved`**
(`convex/studioActions.ts:22-56`). Ako se ista akcija odradi dvaput - ručni
`npx convex run studioActions:submitJob`, dvostruko zakazivanje, budući retry
wrapper - zahtev ide fal-u **drugi put**, na isti jedan naplaćen kredit.
`markJobRunning` tada prepiše `falRequestId`, pa webhook prve predaje ostaje
siroče, a posao nikad ne izađe iz `running`. Dva fal troška, jedna naplata, i
posao koji zauvek visi.

Isti propust jedan sloj niže: **`markJobRunning` ne proverava status**
(`convex/studio.ts:120-127`). Danas je nedostižno. Ali čim se napiše reaper
(B6), otvara se ovakav niz: reaper refundira posao star 30 min → zakasneli
`markJobRunning` ga vrati u `running` → webhook ga zatekne kao `running` i
pomeri u `done`. Korisnik je dobio i refund i sliku. **Jedan `if` u
`markJobRunning` sad je jeftiniji nego dijagnoza tog ponašanja u produkciji.**

### c) Dupli refund na fal retry-ju

**🟢 pokriveno, dvoslojno · 🟡 jedna neplanirana posledica**

Dva nezavisna sloja:
1. `applyWebhookResult` izlazi odmah ako `job.status !== "running"`
   (`convex/falWebhook.ts:152`).
2. `refundCredits` je i sam idempotentan preko `by_job_type` indeksa
   (`convex/credits.ts:257-262`) - drugi poziv vraća `null` i ne dira ništa.

Pokriveno na tri mesta: `falWebhook.test.ts` (isti validan ERROR webhook pet
puta → tačno jedna refund transakcija i isti balans), `studio.test.ts`
(`failJob` dvaput), `credits.test.ts` (dupli `refundCredits`). A10 je set
proverio sa pet mutacija koda, sve uhvaćene. **Ovo je najbolje pokriven deo
celog run-a.**

Tanko mesto koje niko nije primetio: **refund otvara NOV lot sa NOVIH 12
meseci isteka.** Potrošnja ide FIFO, dakle skida se sa lota koji prvi ističe - a
refund taj isti iznos vraća kao najsvežiji lot. Korisnik koji namerno obara
poslove (parametri koje fal odbija sa 422 - a to ga ništa ne košta, jer zahtev
nikad ne uđe u red) **produžava rok svojim kreditima unedogled.** Novac se ne
gubi, ali pravilo D.2 ("svaki kredit ističe 12 meseci od dodele") prestaje da
važi za svakoga ko klikne dovoljno puta. Za knjige to znači da odloženi prihod
nikad ne postane priznat prihod. Nije hitno, ali nije ni namerno.

### d) Dupla dodela na Stripe retry-ju

**🟢 sam mehanizam · 🔴 pet rupa oko njega**

Mehanizam je dobar: `grantCredits` traži postojeći lot po
`by_stripe_invoice` / `by_stripe_session` pre inserta
(`convex/credits.ts:53-66`), a `applyStripeGrant` odbija poziv koji nema tačno
jedan ključ (`NEVALIDAN_KLJUC_IDEMPOTENCIJE`). Pokriveno sa 7 testova u
`credits.test.ts` i provereno sa 7 mutacija koda. Ista faktura dvaput → jedan
lot. Ista sesija dvaput → jedan lot. Doza i bonus imaju odvojene ključeve
(`in_x` i `in_x:welcome`).

Ali oko tog mehanizma stoji pet stvari koje nisu pokrivene ničim:

**d1. 🔴 Webhook ćuti kad ne može da upiše.**
`applyStripeGrants` (`app/api/stripe/webhook/route.ts:64-67`):
```
const convex = getConvexHttpClient();
if (!convex || !process.env.WEBHOOK_SYNC_SECRET) { return; }
```
Ako `NEXT_PUBLIC_CONVEX_URL` ili `WEBHOOK_SYNC_SECRET` fali u Vercel env-u,
funkcija se tiho vrati, ruta odgovori `{received: true}` sa 200, **Stripe
zaključi da je sve u redu i nikad ne ponovi.** Novac naplaćen, krediti nikad
dodeljeni, nijedan log. Isto ćutanje je i u `grantInvoiceCredits` (nema convex
klijenta → `return`). Jedini `console.error` u tom fajlu pokriva sasvim drugi
slučaj (metapodaci koje ne razumemo). Ovo je najjeftinija rupa za popraviti u
celom izveštaju: te grane treba da **bace**, ne da se vrate - 500 tera Stripe da
ponovi, a ponavljanje je bezbedno jer je grant idempotentan.

**d2. 🔴 `payment_status` se ne proverava.**
Grana paketa gleda samo `session.mode === "payment" && metadata.kind ===
"credit_pack"`. Ne gleda `session.payment_status === "paid"`. Kod odloženih
načina plaćanja (SEPA debit, bank transfer - Stripe ih uključuje sam ako su
"automatic payment methods" upaljeni) `checkout.session.completed` puca sa
`payment_status: "unpaid"`, a novac stiže tek kasnije - ili nikad.
`checkout.session.async_payment_failed` se ne obrađuje nigde. Rezultat: krediti
pre para, bez povratka. Popravka je jedan uslov plus jedan `case`.

**d3. 🔴 Welcome bonus je po PRETPLATI, ne po KORISNIKU.**
Ključ je `invoice.id + ":welcome"`, uz uslov
`billing_reason === "subscription_create"` (`convex/creditsCore.ts:245-251`).
Otkaži pretplatu, pretplati se ponovo - nova `subscription_create` faktura, nov
`invoice.id`, **novih 150 kredita.** STUDIO-PLAN D.1 kaže "jednokratno... za oba
plana", što se čita kao jednom po korisniku. Uz `allow_promotion_codes: true` na
plan-sesiji (`lib/stripe.ts:120`) i kupon od 100%, faktura na 0 € se i dalje
označava kao plaćena → **besplatnih 150 kredita, koliko puta hoćeš.** Ispravka:
idempotencija bonusa mora da visi na `userId`, ne na `invoice.id`.

**d4. 🔴 Nema clawback-a na refund/chargeback.**
Nijedan `charge.refunded`, `charge.dispute.created` ni `invoice.payment_failed`
se ne obrađuje. Korisnik kupi Pro paket (40 €, 4800 kredita), potroši ih, pa
traži povraćaj ili otvori spor kod banke. Krediti su već pretvoreni u fal račun
koji ti plaćaš. Ovo je van obima Faze A, ali mora da uđe u uslove korišćenja
**pre** prvog evra ("krediti su nepovratni") i u backlog kao stvarna stavka.

**d5. 🟡 `applyStripeGrant` je javna mutacija.**
Zaštita je samo `WEBHOOK_SYNC_SECRET` (`convex/credits.ts:319`). To je postojeći
obrazac repoa (`syncStripeSubscription`, `seedCreditPacks`), dakle nije
regresija - ali radijus je sada novac: ko god zna taj string može da doda
proizvoljan broj kredita proizvoljnom `userId`-u, sa bilo koje mašine na
internetu. Rotiraj ga pre lansiranja.

### e) Posao koji zauvek visi u `running`

**🔴 REAPER NE POSTOJI. Ovo je najveća otvorena rupa u Fazi A.**

Provereno: `convex/crons.ts` ne postoji, `cronJobs` se ne pojavljuje nigde u
`convex/`. Indeks `by_status_created` na `generationJobs` **postoji od A1 i
nikad se ne koristi** - napravljen je tačno za ovaj reaper.

Tri stvarna puta u trajni `running`, i sva tri su svesno ostavljena:

1. **fal nikad ne pozove webhook** ili svih 31 pokušaja padne. Posao ostaje
   `running`, krediti su skinuti, korisnik nema šta da dobije.
2. **Validan potpis, telo koje ne razumemo.** `handleFalWebhook` namerno vrati
   200 i **ne dira posao** (`convex/falWebhook.ts:122-127`) - to je ispravna
   odluka (nagađanje ishoda je ili tiha krađa ili tihi gubitak), ali njena cena
   je posao koji ostaje `running`.
3. **Rotacija JWKS ključa dok je keš topao.** Keš traje 24 h i **ne osvežava se
   kad verifikacija padne** (`convex/falWebhook.ts:46-58`). Ako fal rotira ključ,
   svaki webhook vraća 401 do isteka keša, fal odustane posle 31 pokušaja, i
   **svi poslovi iz tog prozora su trajno izgubljeni.** Odluka da se keš ne
   osvežava na neuspeh je dobra (inače je to DoS vektor), ali se oslanja na
   reaper koji ne postoji.

Uz gubitak kredita ide i druga kazna: svaki takav posao **trajno zauzima jedno
od 3 mesta** u limitu paralelnih poslova. Tri zaglavljena posla = korisnik kome
Studio više nikad ne radi, bez ijedne poruke koja mu kaže zašto.

Šta reaper mora da radi (STUDIO-PLAN 4.4): cron na 15 min, `by_status_created`,
`running` stariji od 30 min → `failJob` (koji već radi failed → refund →
refunded). **Uz to obavezno ide i provera statusa u `markJobRunning` iz tačke
(b)** - inače reaper otvara novu rupu dok zatvara staru.

### f) Klijent koji pošalje lažnu cenu

**🟢 direktno · 🔴 indirektno, i to skupo**

Direktno je zatvoreno. `computeCreditCost` (`convex/studioCore.ts:70-79`) čita
isključivo `modelCatalog`; `params` nikad ne mogu da postave cenu. Test 5 u
`studio.test.ts` šalje `creditCost: 1` u `params` i tvrdi da se naplati 20 iz
kataloga.

**Ali klijent ne mora da laže o ceni da bi te koštao - dovoljno je da laže o
poslu.** `createJob` **nigde ne validira `params` prema `model.paramSchema`**.
Parsira JSON, izvuče `prompt` za moderaciju, i **sačuva sve ostalo doslovno**.
Zatim `submitJob` radi `{ ...model.defaultParams, ...job.params }` i **ceo taj
objekat pošalje fal-u** (`convex/studioActions.ts:41-44`), gde polja iz posla
pobeđuju podrazumevana. Klijent, dakle, drži sve poluge koje množe fal račun,
dok cena u kreditima stoji fiksno:

- **`num_images`.** Seed šema kaže `min: 1, max: 4` (`convex/seed.ts:502`) - ali
  to je opis buduće forme, ne validacija. `{"prompt":"x","num_images":4}` na
  `nano-banana-2`: naplaćeno **20 kredita**, stvarni trošak
  **4 × $0.08 = $0.32**. Marža je u minusu već na `num_images: 2`. I ništa ne
  zaustavlja `num_images: 20` - jedini limit je šta fal prihvati.
- **`nano-banana-2` i `nano-banana-2-2k` dele isti `falEndpoint`**
  (`fal-ai/nano-banana-2`, `convex/seed.ts:564` i `578`) uz 20 naspram 30
  kredita. Izaberi jeftiniji slug, pošalji 2K parametre sam, plati 20.
- Svaka druga poluga koju model ima (koraci, rezolucija, veličina) prolazi
  netaknuta.

Uz to, `costPerSecond` grana veruje `params.duration` bez gornje granice - danas
nedostižno (nijedan seedovan model nema `costPerSecond`), ali je već napisano i
čeka Fazu B.

**Pojas koji je trebalo da uhvati sve ovo takođe ne postoji.** STUDIO-PLAN 4.4
traži dnevni limit troška po korisniku (alarm na 5 $, auto-pauza na 10 $) i
globalni (alarm na 50 $, kill switch na 100 $). `studioUsageDaily.costUsd` se
**upisuje** u `createJob`, ali ga **niko nikad ne čita**. Jedini stvarni plafon
danas je 50 generacija dnevno po korisniku - pomnoženo sa cenom po generaciji
koju korisnik sam bira.

Popravka je mala i mora da uđe pre UI-ja: `createJob` treba da propusti kroz
`paramSchema` samo poznata polja, da odseče brojeve na `min`/`max`, i da odbije
sve ostalo. To je jedna čista funkcija u `studioCore.ts` i pet testova.

### Sažetak - stanje po riziku

| # | Rizik | Stanje | Pokriveno testom |
|---|---|---|---|
| a | rezervacija bez posla | 🟢 u transakciji · 🔴 posle commit-a (nema reaper-a) | da / ne |
| b | posao bez rezervacije | 🟢 na ulazu · 🔴 `submitJob`/`markJobRunning` ne gledaju status | da / ne |
| c | dupli refund | 🟢 dvoslojno, mutaciono provereno | da |
| d | dupla dodela na Stripe retry-ju | 🟢 mehanizam · 🔴 5 rupa oko njega (d1-d5) | da / ne |
| e | posao zauvek u `running` | 🔴 reaper ne postoji | ne |
| f | lažna cena | 🟢 cena · 🔴 `params` se ne validiraju, nema dnevnog USD limita | da / ne |

**Ako pustiš ovo u prodaju večeras**, tri stvari te koštaju prvog dana:
`num_images` (f), tiho ćutanje webhook-a (d1) i poslovi koji vise (e).

---

## NEDOSLEDNOSTI U ODNOSU NA `docs/STUDIO-PLAN.md`

**1. Numeracija koraka se ne poklapa.** Noćni run ima A1-A10, plan ima A1-A14, i
to nisu isti koraci - run je ubacio "A3 planovi i Pro lekcije" (plan to drži u
dodatku D.4) i pomerio sve za jedno mesto. Mapa: run A4 = plan A3, run A5 = plan
A4, run A6 = plan A5, run A7 = plan A7 (bez admin ekrana), run A8 = plan A8, run
A9 = plan A9, run A10 = plan A10. **Plan A6 (`/sr/app/credits` stranica) je
preskočen.** Odstupanje je opravdano (prompt fajlovi su bili izvor zadatka), ali
ako ujutru budeš brojao "gde sam stao" po planu, promašićeš.

**2. Enrollment guard nije `requireCourseAccess`.** Plan 4.4 imenuje baš tu
funkciju. `createJob` umesto toga traži **bilo koji** `enrollments` red sa
`status: "active"` (`convex/studio.ts:44-49`). Opravdano - `generationJobs` nema
`courseId`, Studio je zasebna stranica, a `requireCourseAccess` traži kurs koji
UI ne može da popuni. Posledica koju treba da znaš: jedan aktivan upis na bilo
koji kurs otvara Studio, i **admin uloga ne zaobilazi tu proveru.**

**3. Dnevni limiti nisu podesivi.** Plan 4.4 kaže "50/dan (podesivo u adminu)";
implementacija ih drži kao konstante u `studioCore.ts`. Opravdano dok nema admin
ekrana, ali to znači da se limit trenutno menja samo deploy-em.

**4. Dnevni i globalni limit troška ne postoje.** Plan 4.4 ih traži kao red u
tabeli zaštita. Nisu implementirani - ni alarm, ni auto-pauza, ni globalni kill
switch na 100 $. **Ovo nije opravdano odstupanje, ovo je nenapisan kod.** (Ručni
kill switch iz `platformFlags` **postoji** i radi - ali ga neko mora okrenuti.)

**5. Stuck job reaper ne postoji.** Isto - stavka iz tabele 4.4, nenapisana.

**6. "🎁 Uz upis - 150 kr" iz tabele 2.4 se ne dodeljuje pri upisu.** Dodatak D.1
(koji po sopstvenoj odredbi ima prednost) veže bonus za **prvu uspešnu uplatu
Studio plana**, i tako je i implementirano. Formalno je usklađeno, ali praktična
posledica je nešto što niko nije napisao naglas: **student koji je kupio samo
pretplatu na kurs (postojeći flow, bez `metadata.kind === "plan"`) prolazi
enrollment proveru u `createJob`, ali ima 0 kredita i ne može da uradi ništa.**
Prva stvar koju vidi u Studiju je "nemaš kredita". Odluči da li je to namerno
pre nego što se pojavi UI.

**7. Invarijantni test ima 200 operacija, plan traži 1000.** `credits.test.ts`
vozi 200 determinističkih grant/spend/refund operacija; plan A2 kaže "posle 1000
nasumičnih operacija". Invarijanta je ista i test je seedovan (ponovljiv), pa je
odstupanje kozmetičko - ali plan je tu bio izričit.

**8. Retencija fajlova nije ni počela.** Plan 0.2 i 4.2 korak 4 traže `expiresAt`
= 30 dana za video / 90 za ostalo. Polje `generationJobs.expiresAt` postoji u
šemi i indeks `by_expiry` postoji, ali se **nikad ne popunjava** - jer
`persistOutput` je prazan stub.

**9. Istek kredita (D.2) nema cron.** Krediti dobijaju `expiresAt` = +12 meseci i
`planSpend` ih ispravno ignoriše kad isteknu, ali ih niko ne gasi. Posledica je
tačno opisana još u A2: keširan `creditBalances.balance` posle godinu dana može
da bude veći od stvarno potrošivog. Novac se ne gubi, ali korisniku pišeš broj
koji nije istinit. Kad se cron bude pisao, mora da upiše `expiry` transakciju
**i** da smanji keš - inače puca invarijantni test, i to namerno.

**10. Nema noćne provere fal cena ni rekonsilijacije (plan 2.5).**
`generationJobs.actualCostUsd` postoji u šemi i nikad se ne puni. Faza D, ali
znaj da do tada nemaš nijedan podatak o stvarnoj marži - samo procenu iz
kataloga, zaključanu na 18.08.2026.

**11. Sitno: `creditPacks:getPackBySlug` je javan query bez ikakve provere**
(`convex/creditPacks.ts:36`) i vraća ceo red, uključujući `stripePriceId`. Nije
tajna (price ID se ionako vidi u checkout-u) i A4 je svesno odlučio da ne
filtrira po `isActive`, ali je vredno znati da je taj red čitljiv svakome.

---

## RUČNI KORACI ZA JOVANA

Redosled je namenski - svaka stavka pretpostavlja prethodne. Komande su za
PowerShell iz korena repoa. Jednostruki navodnici oko JSON-a su tu namerno:
PowerShell tako prosleđuje dvostruke navodnike netaknute.

**1. fal.ai nalog i ključ.**
Otvori nalog na fal.ai i kupi 20-50 $ kredita **danas** - concurrency limit
kreće od 2 istovremena zahteva i raste do 40 tek na osnovu potrošnje u poslednje
4 nedelje (plan 3.4). Ako to ne uradiš mesec dana ranije, prvi dan lansiranja te
čeka red od dva posla.
```
npx convex env set FAL_KEY "<fal api key>"
npx convex env --prod set FAL_KEY "<fal api key>"
```
Ključ ide u **Convex** env, ne u Vercel - fal se zove iz Convex akcije.

**2. Limit potrošnje u fal dashboardu.**
fal.ai → Billing → Spending limits. Postavi tvrd mesečni plafon **pre** nego što
ijedan korisnik dobije pristup. Ovo je jedina zaštita koja stoji iznad svega što
si sam napisao, uključujući rupu (f).

**3. Stripe cene - 5 komada.**
Stripe Dashboard → Product catalog → Add product. Za svaki proizvod jedna cena,
valuta **EUR**:

| Slug | Naziv | Cena | Tip cene |
|---|---|---|---|
| `basic` | Basic | 9,99 € | **Recurring**, mesečno |
| `premium` | Premium | 24,99 € | **Recurring**, mesečno |
| `starter` | Starter | 5,00 € | **One-time** |
| `creator` | Creator | 15,00 € | **One-time** |
| `pro` | Pro | 40,00 € | **One-time** |

Tip nije opcion: `/api/stripe/credits` koristi `mode: "payment"`, koji odbija
recurring cenu, a planovi idu kroz `mode: "subscription"`, koji odbija one-time.
Prepiši svih 5 `price_...` ID-jeva.

**4. Upiši `stripePriceId` u `creditPacks`.**
Convex Dashboard → tvoj deployment → Data → tabela `creditPacks` → red po red,
polje `stripePriceId`. **Ne preko `npx convex run creditPacks:upsertPack`** - ta
mutacija je iza `requireAdmin`, a `convex run` ide neautentifikovano i dobićeš
`Forbidden`.
Dobra vest: `seedCreditPacks` u svom `patch`-u **ne dira `stripePriceId`**, pa
ponovni seed neće obrisati ono što upišeš.

**5. Uključi `invoice.paid` na POSTOJEĆEM webhook endpointu.**
Stripe Dashboard → Developers → Webhooks → tvoj `/api/stripe/webhook` endpoint →
Update details → Select events. Tačno ovih pet, nijedan više:
```
checkout.session.completed
invoice.paid
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```
Prva, treća, četvrta i peta su verovatno već tu. **`invoice.paid` je nova i bez
nje Premium pretplatnik ne dobija nijedan kredit - ni mesečnu dozu, ni bonus.**
Ne dodaj `invoice.payment_succeeded`; kod je ne obrađuje.
**Ne pravi drugi endpoint** - grana paketa kredita živi unutar postojećeg.

**6. Pusti tri seed mutacije** (traže `WEBHOOK_SYNC_SECRET`):
```
npx convex run seed:seedCreditPacks   '{"syncSecret":"<WEBHOOK_SYNC_SECRET>"}'
npx convex run seed:seedModelCatalog  '{"syncSecret":"<WEBHOOK_SYNC_SECRET>"}'
npx convex run seed:seedPlatformFlags '{"syncSecret":"<WEBHOOK_SYNC_SECRET>"}'
```
Prve dve su idempotentne i rade pun `patch` - ako si ručno ugasio model preko
`setModelEnabled`, ponovni seed ga vraća na vrednost iz plana. Treća je namerno
drugačija: **ne prepisuje postojeći red**, da ponovni seed ne bi tiho upalio
Studio koji si namerno ugasio. Kill switch se okreće iz Convex dashboarda:
tabela `platformFlags`, red `studio_enabled`, polje `enabled`.

**7. Proveri da `CONVEX_SITE_URL` postoji na oba deploymenta.**
Ne postavlja se ručno - Convex ga ugrađuje sam. Samo potvrdi:
```
npx convex env list
npx convex env --prod list
```
`submitJob` iz njega sklapa `https://<deployment>.convex.site/fal/webhook`. Za
ovaj repo to je `https://quick-yak-270.convex.site/fal/webhook` -
**`.convex.site`, ne `.convex.cloud`**, bez trailing slash-a (fal ne prati
redirekcije, 3xx mu je trajni neuspeh).

**8. Potvrdi da Ed25519 radi na živom Convex runtime-u. NAJVAŽNIJA STAVKA.**
Testovi ga dokazuju samo u vitest `edge-runtime`-u. Pusti `npx convex dev`, pa
kroz privremenu akciju (ili Convex dashboard → Functions → Run) izvrši:
```
await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])
```
Ako to baci, **ceo fal webhook je mrtav** i svaki posao ostaje u `running`.
Rešenje je `@noble/ed25519` (jedna zavisnost, bez native koda) - A10 nije smeo
sam da donese tu odluku.

**9. Ne dozvoli menjanje plana u Stripe Customer Portalu.**
Stripe Dashboard → Settings → Billing → Customer portal → sekcija
"Subscriptions" → **isključi "Customers can switch plans"**.
Razlog: `metadata.planSlug` se upisuje pri kreiranju pretplate i kod ga posle
nikad ne menja. Ko pređe sa Premium na Basic kroz portal i dalje dobija 2000
kredita mesečno i zadržava pristup Pro lekcijama. Ovo je privremena brava dok se
plan ne bude izvodio iz `stripePriceId` preko `planFromPriceId` iz `lib/plan.ts`
(A3 ga je ostavio baš za to, treba mu samo mapa price ID → plan).

**10. Pročitaj blok listu u `convex/creditsCore.ts:86-133` - nije pravno
pregledana.** To je predlog po zabranama iz plana 3.3, ne pravno mišljenje.
Jedan koren je aktivno rizičan: **`nude` je i srpski oblik glagola "nuditi"**
("oni nude"), pa će odbiti nevin prompt. Ćirilica nije pokrivena uopšte -
normalizacija je svodi na prazan string, pa svaki ćirilični prompt prolazi
moderaciju bez ijedne provere. Ako izbaciš neki red, testovi neće pući.

**11. Rotiraj `WEBHOOK_SYNC_SECRET`** pre lansiranja (vidi rizik d5). Ko ga zna,
može da doda proizvoljan broj kredita bilo kom nalogu preko javne mutacije
`credits:applyStripeGrant`.

**12. Pravno, iz plana 3.3 i 9 - pre prvog naplaćenog evra, ne posle:**
- mejl fal sales-u sa opisom "Customer Solution" modela u tri rečenice, traži
  **pisanu** potvrdu (plan 3.1);
- `/sr/uslovi-studio` objavljen sa svim iz 3.3, uključujući izričito: krediti su
  **nepovratni**, ne konvertuju se u novac, važe 12 meseci, i retencija 30/90
  dana;
- checkbox "18+ i prihvatam uslove" na stranici kredita, upisan u bazu sa
  timestampom (ToS §2 te na to obavezuje);
- knjigovođa: prodaja kredita = višenamenski vaučer, neiskorišćeni krediti =
  odloženi prihod.

**13. Test scenario koji vredi proći lokalno** (ja nisam smeo da pozovem Stripe
CLI):
```
stripe listen --forward-to localhost:3000/api/stripe/webhook
```
1. Kupovina Starter paketa → balans +500, jedan lot izvora `purchase`.
2. Prva pretplata na Premium → balans +2150 (2000 doza + 150 bonus), **dva**
   lota, i `enrollments.plan` postane `premium`.
3. `invoice.paid` sa `billing_reason: subscription_cycle` → +2000, bez novog
   bonusa.
4. Ponovi bilo koji od njih → balans se **ne menja**.
5. **Dodatno, nije bilo u A6:** otkaži pretplatu i pretplati se ponovo →
   proveri da li si dobio **još 150 kredita**. Ako jesi, to je rizik d3 i
   potvrđen je.

---

## ŠTA NIJE URAĐENO

Procene su u "promptovima" iste veličine kao noćni koraci (jedan korak ≈ 30-45
min rada agenta) i pretpostavljaju da ostatak grane ostaje kakav jeste.

### Blokira naplatu - mora pre prvog evra

| Stavka | Zašto blokira | Procena |
|---|---|---|
| **Validacija `params` prema `paramSchema`** | rizik (f): `num_images` obara maržu na prvoj generaciji | 1 prompt |
| **Stuck job reaper (cron 15 min)** | rizik (e): izgubljeni krediti + trajno zauzeta mesta u limitu | 1 prompt |
| **`submitJob` i `markJobRunning` da gledaju status** | rizik (b); ide zajedno sa reaper-om, inače reaper otvara novu rupu | pola prompta |
| **Webhook da baca umesto da ćuti (d1)** | naplaćeno bez kredita, bez retry-ja, bez loga | pola prompta |
| **`payment_status === "paid"` + `async_payment_failed` (d2)** | krediti pre para | pola prompta |
| **Welcome bonus po korisniku, ne po pretplati (d3)** | besplatnih 150 kr u petlji, uz kupon i više | pola prompta |
| **Potvrda Ed25519 na živom runtime-u** | ako padne, ceo webhook je mrtav | 15 min ručno |
| **Dnevni limit troška po korisniku + globalni (plan 4.4)** | jedini plafon danas je broj generacija, ne novac | 1 prompt |

### Faza A, funkcionalni ostatak

| Stavka | Stanje danas | Procena |
|---|---|---|
| **A11 `persistOutput`** | prazan stub (`studioActions.ts:66-70`). Posao stigne u `done` sa fal URL-om koji kod fal-a **živi kratko** - fajl nikad ne uđe u Convex storage, `labOutputs` red ne postoji, `expiresAt` se ne popunjava. **Uspešna generacija je praktično nedostupna korisniku.** Uz to `createJob` još ne prima `lessonId`/`taskId`, pa `taskProgress.evidenceOutputId` i leaderboard veza ne mogu da se popune. | 1-2 prompta |
| **`/app/credits` stranica (plan A6)** | ne postoji. `/api/stripe/credits` ruta radi, ali je **niko ne poziva** - nema načina da korisnik kupi kredite kroz aplikaciju. | 1 prompt |
| **A12 Playground UI** | ne postoji. `createJob` nema nijednog pozivaoca; jedini način da se posao napravi je `npx convex run`. | 1-2 prompta |
| **A13 Galerija** | ne postoji. Zavisi od A11 (nema šta da prikaže dok fajlovi nisu u storage-u). | 1 prompt |
| **Admin ekran `/app/admin/studio` (druga polovina plana A7)** | ne postoji. Sve admin mutacije (`upsertModel`, `setModelEnabled`, `setModelCost`, `upsertPack`, `setPackActive`) su napisane i testirane, ali nemaju ekran. Cena se danas menja iz Convex dashboarda. | 1 prompt |
| **Ruta za checkout planova** | `createPlanCheckoutSession` je napisana i testirana, ali **nema pozivaoca ni rutu**. Premium se trenutno ne može kupiti nikako. | pola prompta |
| **A14 QA + deploy** | ništa nije deploy-ovano. Ceo checklist iz plana 9 stoji neproveren nad pravim podacima. | 1 prompt + ručno |

### Retencija i higijena - plan 0.2, 4.2 korak 4, D.2

| Stavka | Stanje | Procena |
|---|---|---|
| **`expiresAt` na poslovima/izlazima (30 dana video, 90 slike)** | polje i indeks `by_expiry` postoje, nikad se ne popunjavaju (zavisi od A11) | ide uz A11 |
| **Cron koji briše istekle fajlove iz storage-a** | ne postoji | 1 prompt |
| **Cron za istek kredita (D.2 / D5)** | ne postoji. Krediti dobijaju rok, ali ih niko ne gasi - keširan balans posle godinu dana laže naviše. Mora da upiše `expiry` transakciju **i** smanji keš, inače puca invarijantni test (namerno). | 1 prompt |

### Faza D i dalje - znaj da postoji, ne radi sad

Noćna provera fal cena, rekonsilijacija `actualCostUsd` po `request_id` (dakle:
prva stvarna marža koju ćeš videti), admin analitika neiskorišćenog balansa,
clawback na chargeback (d4), plan izveden iz `stripePriceId` umesto iz
metapodataka (ručni korak 9).

---

## Jedna rečenica na kraju

Ledger je čvrst i dobro testiran; ono što nije napisano - reaper, validacija
parametara, dnevni limit troška i UI - **nije "poliranje", nego četiri mesta na
kojima novac curi**, i tri od njih se popravljaju kraćim kodom nego što je ovaj
pasus.
