# Studio - dnevnik implementacije

Svaki korak dopisuje svoju sekciju na kraj. Ne brisati ranije sekcije.

Run pokrenut: 2026-08-19_01-57

## A1 - Studio šema (kredit-lotovi, planovi, katalog modela, poslovi)   (2026-08-19 02:15)
**Fajlovi:**
- `convex/schema.ts` (izmenjen)

**Šta je uradjeno:** Dodato je 6 novih tabela u `convex/schema.ts` prema
sekciji 4.1 `docs/STUDIO-PLAN.md`, sa dve izmene iz `.studio-run/prompts/A1.md`:
`creditLots` je nova tabela koja drži kredite po lotovima (izvor, doznačeno,
preostalo, datum isteka - uvek 12 meseci od dodele), a `creditBalances` je
sada denormalizovan keš zbira `remaining` po nezastarelim lotovima. U
`creditTransactions` je dodato opciono `lotId` polje za trag ka lotu iz kog je
potrošnja skinuta. `creditPacks` sada ima `kind` (`pack`/`plan`) i opciono
`planTier` (`basic`/`premium`) da ista tabela opiše i paket kredita i
pretplatnički plan. Dodate su i preostale tabele iz 4.1 bez izmena:
`modelCatalog`, `generationJobs`, `studioUsageDaily`. U `enrollments` je
dodato opciono `plan` polje (`basic`/`premium`); odsustvo se tretira kao
`"basic"`, pa migracija ne puca na postojećim redovima. Ovaj korak ne dodaje
nikakvu logiku (mutacije/query/action) - samo šemu, tačno kako traži A1.md.

**ODLUKE:**
- Nazivi indeksa su prepisani tačno onako kako stoje u kod-blokovima iz
  `docs/STUDIO-PLAN.md` §4.1 i `.studio-run/prompts/A1.md` (npr. `by_user`,
  `by_job_type`, `by_fal_request`) umesto pune "svako polje u imenu" konvencije
  koju koriste noviji delovi ove šeme (`by_userId_and_...`). `rules.md` sam
  navodi `by_user_status` i `by_fal_request` kao primer konvencije indeksa, pa
  je ovo tretirano kao usaglašeno, ne kao odstupanje.
- Nove `v.union` literal-helpere (`planTier`, `creditLotSource`,
  `creditTransactionType`, `creditPackKind`, `studioModelKind`,
  `modelCatalogBadge`, `generationJobStatus`) sam imenovao po uzoru na
  postojeće helpere na vrhu fajla (npr. `subscriptionStatus`, `assetKind`).
  Model-kind union je nazvan `studioModelKind` (ne `modelKind`) da se izbegne
  eventualna zabuna sa nazivom tabele `modelCatalog`.
- `creditPacks.planTier` referencira isti `planTier` union kao
  `enrollments.plan`, umesto duplog inline union-a, jer su to doslovno ista
  dva stanja (basic/premium) i vrede identična pravila.
- Redosled dodavanja: nove tabele su dodate na kraj `defineSchema` (posle
  `leaderboardStats`), da se ne dira raspored ni prepisuju postojeći redovi -
  u skladu sa "Surgical Changes".

**Testovi:** Nijedan nov test nije pisan - ovaj korak eksplicitno ne sme da
piše logiku (A1.md, poslednja rečenica), pa nema šta da se testira van
postojećeg test suite-a.

**Rezultat verifikacije:**
- `npx convex codegen` - prošlo (bindings i TypeScript check bez grešaka)
- `npm run lint` - prošlo (0 grešaka; 7 postojećih upozorenja u nepovezanim
  fajlovima, nepromenjeno ovim korakom)
- `npm run test` - prošlo (22 test fajla, 112 testova, sve zeleno)

**BLOKADA:** nema.

**Za Jovana ujutru:** Šema je spremna, ali potpuno prazna od podataka i
logike - `creditPacks`, `modelCatalog` nemaju redove, a `creditBalances` za
postojeće korisnike ne postoji dok ih neki kasniji korak (backfill mutacija)
ne kreira iz `creditLots`. Dok se ne napiše ta backfill logika, svaki kod koji
pročita `creditBalances` za postojećeg korisnika dobiće `null` - nemoj to
tumačiti kao bug u ovoj šemi.

## A2 - Ledger mutacije + testovi   (2026-08-19 02:27)
**Fajlovi:**
- `convex/creditsCore.ts` (novo)
- `convex/credits.ts` (novo)
- `convex/credits.test.ts` (novo)
- `convex/schema.ts` (izmenjen - 2 linije, vidi prvu ODLUKU)

**Šta je uradjeno:** Napisan je kompletan kredit-ledger. `creditsCore.ts` drži
čistu logiku bez `ctx` i bez baze: `usableBalance`, `planSpend` (FIFO po
`expiresAt` rastuće, `id` kao tie-breaker, istekli lotovi se potpuno ignorišu),
`computeExpiry` (12 kalendarskih meseci u UTC-u) i `validatePrompt` (prazan
string, dužina, blok lista). `credits.ts` je Convex sloj: query-ji `getBalance`,
`getLots` i `getTransactions` (paginated, najnovije prvo), plus tri interne
mutacije `grantCredits`, `spendCredits` i `refundCredits` - svaka pomera lotove,
`creditBalances` keš i upisuje `creditTransactions` red sa `balanceAfter`
snapshotom, sve u jednoj transakciji. `spendCredits` zove `planSpend` i baca
`NEDOVOLJNO_KREDITA` pre bilo kakvog upisa ako plan ne postoji. `grantCredits` je
idempotentan preko `by_stripe_invoice` / `by_stripe_session`, `refundCredits`
preko `by_job_type`. Nijedna postojeća funkcija nije dirana - subscription flow
za kurseve je netaknut.

**ODLUKE:**
- **`creditLotSource` u šemi je dobio petu vrednost, `"refund"`.** A1 je definisao
  četiri izvora (`purchase`, `plan_grant`, `welcome_bonus`, `admin_grant`), a A2
  mora da otvori nov lot pri refundu. Alternativa je bila da refund lot nosi
  `admin_grant`, što bi trajno slagalo admin analitiku iz Faze D o tome odakle su
  krediti došli. Izmena je aditivna (dve linije, nov literal u union-u), tabela je
  prazna, pa ništa ne može da pukne.
- **Refund ide u NOV lot** sa istekom 12 meseci od trenutka refunda, ne nazad u
  originalne lotove - tako traži `A2.md` i tako je bitno jednostavnije.
- **Iznos refunda se čita iz `spend` transakcije, ne iz `generationJobs.creditCost`.**
  Ledger je izvor istine, pa je refund uvek tačno jednak onome što je skinuto,
  čak i ako se `creditCost` posla naknadno promeni. Ako `spend` red ne postoji,
  `refundCredits` baca `NEMA_TROSKA_ZA_REFUND`. `A2.md` to ne traži eksplicitno,
  ali suprotno bi bila rupa kroz koju se kuju krediti ni iz čega.
- **`refundCredits` na drugom pozivu vraća `null`**, ne ID postojeće transakcije -
  da povratni tip bude jedan tip i da pozivalac razlikuje "vratio sam" od "već je
  vraćeno".
- **`idempotencyKey` je OBAVEZAN argument** `grantCredits`-a, oblika
  `{ field: "stripeInvoiceId" | "stripeSessionId", value: string }`. Opcioni ključ
  bi značio da postoji put kojim se kredit dodeli dvaput. Pozivaoci bez Stripe
  ID-a (admin grant) moraju da proslede determinističan sintetički ključ.
- **`spendCredits.jobId` je obavezan**, jer `refundCredits` pronalazi potrošnju
  isključivo preko `jobId`. Potrošnja bez posla ne bi mogla da se refundira.
- **Jedan `spend` red čak i kad potrošnja seče preko više lotova** (tako traži
  `A2.md`). `creditTransactions.lotId` se popunjava samo kad je potrošnja stala u
  tačno jedan lot - inače bi jedan ID prećutao ostale.
- **Mapiranje izvora u tip transakcije:** `purchase`→`purchase`,
  `plan_grant`→`purchase`, `welcome_bonus`→`bonus`, `admin_grant`→`admin_adjust`,
  `refund`→`refund`. `lifetimePurchased` raste samo za izvore za koje je stvarno
  legao novac (`purchase`, `plan_grant`); `lifetimeSpent` raste na potrošnji i
  pada na refundu, pa ostaje "koliko je stvarno potrošeno".
- **`getBalance` vraća keširan `creditBalances` red i ne računa istek uživo.**
  Convex smernice zabranjuju čitanje sata u query-ju (query se ne osvežava sam od
  protoka vremena), a keš je O(1) i reaktivan. Posledica je u sekciji za Jovana.
- **`computeExpiry` računa u UTC-u i seče dan na poslednji postojeći dan ciljnog
  meseca**: 29.02.2028 → 28.02.2029. Alternativa (prelivanje u 01.03.) daje datum
  u pogrešnom mesecu. UTC je izabran da rezultat ne zavisi od vremenske zone
  servera ni test runnera.
- **Lot je istekao kad je `expiresAt <= now`** - momenat isteka je već izvan roka.
- **`planSpend` vraća `null` i za nevalidan iznos** (nula, negativan, decimalan).
  Convex sloj pre njega baca `NEVALIDAN_IZNOS`, da se ta greška ne pomeša sa
  `NEDOVOLJNO_KREDITA`.
- **`validatePrompt` vraća stabilne kodove** (`PRAZAN_PROMPT`, `PREDUGACAK_PROMPT`,
  `ZABRANJEN_POJAM`), ne gotov tekst, da bi UI mogao da ih prevede na sr/en.
- **Blok lista poredi korene od početka reči**, nad tekstom svedenim na mala slova
  bez dijakritika (`đ`→`dj`, NFD + skidanje akcenata), pa koren `porn` hvata i
  `pornografija`. Namerno nema kratkih višeznačnih korena - `gol` je i gol na
  fudbalu. Ćirilica nije pokrivena (normalizacija je svodi na prazno).
- **`spendCredits` i `getLots` čitaju SVE neispražnjene lotove korisnika
  (`.collect()`)**, suprotno opštem Convex pravilu o ograničenim čitanjima.
  Namerno: parcijalno čitanje bi potcenilo balans i odbilo generaciju koju je
  korisnik platio.
- **`creditLotSource` union je preslikan lokalno u `credits.ts`** umesto da se
  eksportuje iz `schema.ts` - to je postojeća konvencija repoa (`lab.ts`,
  `billing.ts` rade isto). Tip se izvodi iz validatora preko `Infer`, kao u
  `communityScope.ts`, pa ne može da odluta od šeme u tipovima.

**Testovi:** `convex/credits.test.ts`, 12 testova.
Nad `creditsCore` (6): FIFO troši prvo lot koji pre ističe · potrošnja seče preko
više lotova kad prvi nije dovoljan · `planSpend` vraća `null` kad je nedovoljno,
uključujući slučaj kad bi bilo dovoljno samo da se broje istekli lotovi ·
`usableBalance` ne broji istekle, one koji ističu baš sad, ni ispražnjene ·
`computeExpiry` na 29.02, 31.08 i 31.01 ostaje u ispravnom mesecu i čuva doba
dana · `validatePrompt` hvata prazan, predugačak i zabranjen prompt, a pušta
nevin prompt sa rečju "gol".
Nad Convex slojem (5): **invarijanta** - posle 200 determinističkih nasumičnih
grant/spend/refund operacija važi `creditBalances.balance` === zbir `remaining`
nezastarelih lotova === zbir svih `creditTransactions.amount` · dupli
`grantCredits` sa istim `stripeInvoiceId` ostavlja tačno jedan lot i jednu
transakciju · dupli `refundCredits` za isti `jobId` upiše tačno jedan red ·
`spendCredits` preko balansa baca i ne menja NIŠTA (poredi se ceo snimak lotova,
balansa i transakcija pre i posle) · `spendCredits` tačno na balans prolazi,
ostavlja balans 0 i oba lota označena kao ispražnjena.

Invarijantni test koristi seedovan PRNG (mulberry32) da bi bio ponovljiv, svaka
četvrta potrošnja je namerno preko balansa da bi se grana koja NE SME ništa da
upiše provukla kroz istu putanju, i na kraju tvrdi da je svaka od tri grane
(grant / uspešna potrošnja / odbijena potrošnja / refund) stvarno izvršena - bez
toga bi test mogao da prođe na praznom ledgeru.

Suite je proveren i mutacionim testiranjem: pet namerno ubačenih grešaka
(refund bez idempotencije, potrošnja koja balans pomera za jedan manje, grant bez
provere idempotencije, `planSpend` koji ignoriše istek, LIFO umesto FIFO) - svih
pet je oboreno. Sve izmene su vraćene, `diff` je čist.

**Rezultat verifikacije:**
- `npx convex codegen` - prošlo (TypeScript bez grešaka)
- `npm run lint` - prošlo (0 grešaka; 7 postojećih upozorenja u nepovezanim
  fajlovima, isto stanje kao posle A1)
- `npm run test` - prošlo (23 test fajla, 124 testa; A1 je ostavio 22 / 112)

**BLOKADA:** nema.

**Za Jovana ujutru:**
- Ništa nije deploy-ovano. `npx convex codegen` je pisao samo u
  `convex/_generated/` (zato je `api.d.ts` izmenjen u git statusu).
- **Pročitaj blok listu u `creditsCore.ts` - nije pravno pregledana, to je moj
  predlog po zabranama iz STUDIO-PLAN 3.3.** Jedan koren je rizičan: `nude` je i
  srpski oblik glagola "nuditi" ("oni nude"), pa može da odbije nevin prompt. Ako
  ti smeta, izbaci taj red - test za blok listu neće pući.
- Kad A5 bude kačio Stripe webhook, ključevi idu ovako (po D.5):
  `checkout.session.completed` → `{ field: "stripeSessionId", value: session.id }`,
  `invoice.paid` → `{ field: "stripeInvoiceId", value: invoice.id }`,
  welcome bonus → `{ field: "stripeInvoiceId", value: invoice.id + ":welcome" }`.
  `grantCredits` neće primiti poziv bez ključa.
- **Istek kredita (D5 cron) NIJE napisan i to je jedina rupa u invarijanti.**
  Dok ga nema, lot koji je istekao a nije potrošen i dalje stoji u keširanom
  `creditBalances.balance`, pa korisnik može da vidi broj veći od onoga što
  stvarno može da potroši. Novac se ne gubi - `planSpend` istekle lotove ne
  troši, pa se višak ne može iskoristiti.
- **Kad budeš pisao D5:** cron koji gasi istekle lotove MORA da upiše i
  `creditTransactions` red tipa `expiry` sa negativnim iznosom i da smanji
  `creditBalances.balance`. Ako upiše samo jedno od to dvoje, invarijanta
  "balans === zbir transakcija" iz ovog test fajla će pući - i to je namerno,
  taj test je čuvar.
- `creditPacks` i `modelCatalog` su i dalje prazni (to je A3), pa Studio još ne
  može da naplati ni jednu generaciju.

---

## A3 - Planovi pretplate vezani za pristup Pro lekcijama   (2026-08-19 02:35)

**Fajlovi:**
- dodato: `lib/plan.ts`, `lib/plan.test.ts`
- izmenjeno: `lib/lesson-access.ts`, `lib/lesson-access.test.ts`, `convex/lab.ts`,
  `convex/billing.ts`

**Šta je uradjeno:** Pro lekcije se sada otključavaju preko `enrollments.plan`
(po kursu), ne preko globalnog `users.role`. Nov `lib/plan.ts` drži tip `Plan` i
`normalizePlan` / `planFromPriceId`, gde odsustvo ili nepoznata vrednost uvek
padaju na `"basic"`. `canUseProLesson` je dobila nov potpis
`(plan, role, proEnabled = true)` i vraća `true` samo ako je `proEnabled` i
korisnik je staff ili mu je plan `premium`; legacy `role === "pro_student"` je
namerno zadržan. Jedini pozivalac, `getLessonLab` u `convex/lab.ts`, pre provere
učita `enrollments` red za taj `userId` + `courseId` preko `by_user_course` i
prosledi `enrollment?.plan`. `syncStripeSubscription` je dobio opcioni argument
`plan` koji se upisuje u isti `enrollmentPatch` koji već postoji.

**ODLUKE:**
- **`plan` se u `enrollmentPatch` dodaje samo kad je prosledjen**
  (`...(args.plan ? { plan: args.plan } : {})`). Bez toga bi `undefined` u
  `ctx.db.patch` obrisao postojeći tier, pa bi svaki webhook koji ne zna plan
  (a takvi su svi dok A6 ne prosledi `metadata.planSlug`) tiho degradirao
  Premium korisnika na Basic.
- **`app/api/stripe/webhook/route.ts` NIJE diran.** A3 spec traži samo argument
  na mutaciji; prosledjivanje `plan`-a iz `metadata.planSlug` je eksplicitno
  posao A6 (vidi A6.md, red za `customer.subscription.*`), a mapiranje
  price → plan traži Stripe price ID-jeve koje po pravilima ne smem da postavim.
  Posledica: dok se A6 ne odradi, `enrollments.plan` niko ne upisuje, pa se
  ponašanje Pro lekcija ne menja u odnosu na sada (vidi "Za Jovana ujutru").
- **`planFromPriceId` propušta rezultat kroz `normalizePlan`**, pa nepostojeći
  ključ u mapi daje `"basic"` umesto `undefined`. Mapa je parametar, ne globalni
  konstantan objekat - price ID-jevi žive u env-u, a ovaj sloj mora da ostane
  čist i testabilan.
- **`normalizePlan` ne prihvata varijante velikih slova** (`"Premium"` → `"basic"`).
  Svaka nepoznata vrednost pada na najmanju privilegiju; bolje da Premium
  korisnik jednom ne vidi Pro lekciju nego da Basic korisnik dobije pristup.
- **Legacy `role === "pro_student"` je ostavljen** iako po D.4 `role` treba da
  ostane samo za admin/moderator. Skidanje bi u istom trenutku oduzelo pristup
  svakom ručno postavljenom `pro_student` nalogu. Test to pokriva eksplicitno,
  pa je uklanjanje kasnije svesna odluka, ne slučajna regresija.
- **`enrollments` se čita sa `.unique()`** preko `by_user_course`, kako to već
  rade `courses.ts` (423, 455), `study.ts` (317) i `identityMerge.ts` (1275).
  Jedan dodatni dokument po pozivu.

**Testovi:** `lib/plan.test.ts` (5) i prepisan `lib/lesson-access.test.ts` (5).
Pokrivaju: `normalizePlan(undefined) === "basic"` · oba poznata tiera prolaze
netaknuta · prazan string, `"Premium"` i `"pro"` padaju na `"basic"` ·
`planFromPriceId` čita iz mape i vraća `"basic"` za neupisan price ID i za
praznu mapu · admin i moderator vide Pro lekciju bez obzira na plan (i kad plana
uopšte nema) · legacy `pro_student` i dalje vidi · `premium` vidi · `basic` i
korisnik bez `enrollments` reda ne vide · `proEnabled: false` sakriva lekciju i
Premium korisniku i adminu i legacy `pro_student`-u.

Suite je proveren mutacionim testiranjem, tri namerne greške - `normalizePlan`
koji podrazumeva `"premium"`, `canUseProLesson` koja ignoriše `proEnabled`, i
brisanje legacy `pro_student` grane - sve tri oborene. Izmene vraćene, `diff`
čist.

**Rezultat verifikacije:**
- `npx convex codegen` - prošlo (TypeScript bez grešaka; ovog puta ništa nije
  promenjeno u `convex/_generated/`, jer nema novih Convex fajlova)
- `npm run lint` - prošlo (0 grešaka; istih 7 postojećih upozorenja u
  nepovezanim fajlovima kao posle A1 i A2)
- `npm run test` - prošlo (24 test fajla, 132 testa; A2 je ostavio 23 / 124)

**BLOKADA:** nema.

**Za Jovana ujutru:**
- Ništa nije deploy-ovano, Stripe nije diran.
- **Bug iz D.4 je popravljen u logici, ali još nije popravljen u praksi.** Niko
  ne upisuje `enrollments.plan` dok A6 ne prosledi `plan` u
  `syncStripeSubscription`, pa Pro lekcije i dalje vide samo admin, moderator i
  ručno postavljeni `pro_student`. To je namerno - A3 je pripremio šinu, A6
  pušta voz. Ako hoćeš da to proveriš pre A6, ručno postavi
  `plan: "premium"` na svoj `enrollments` red u Convex dashboardu i Pro lekcija
  se otvara.
- **Kad budeš radio A6:** plan izvedi iz `subscription.metadata.planSlug` i
  prosledi kroz nov `plan` argument. `planFromPriceId` je tu kao rezerva ako
  odlučiš da mapiraš po `stripePriceId` umesto po metadata - tad ti treba mapa
  price ID → plan iz env-a, koju ja nisam pravio.
- **Postojeće `enrollments` redove ne treba migrirati.** Odsustvo `plan`-a je
  validno i znači Basic, tako i šema (A1) i `normalizePlan` to čitaju.
- `checkout.session.completed` trenutno u `subscription_data.metadata` šalje
  samo `courseId`, `courseSlug` i `userId` (`lib/stripe.ts`). Da bi A6 imao šta
  da pročita, tu mora da se doda i `planSlug` - inače će svaka obnova pretplate
  stizati bez plana i `enrollments.plan` će ostati prazan.

---

## A4 - Katalog paketa/planova (creditPacks) + seed   (2026-08-19 02:41)

**Fajlovi:**
- dodato: `convex/creditPacks.ts`, `convex/creditPacks.test.ts`
- izmenjeno: `convex/seed.ts`

**Šta je uradjeno:** `convex/creditPacks.ts` daje pristupne funkcije nad
`creditPacks` tabelom iz A1: javni `listPacks({ kind? })` (bounded scan preko
`.take(200)`, filtrira samo `isActive`, sortira po `sortOrder` u memoriji - tabela
je po dizajnu mala, par planova i paketa), javni `getPackBySlug` (preko
`by_slug` indeksa, vraća red bez obzira na `isActive` da bi budući admin/checkout
kod mogao sam da odluči šta da radi sa neaktivnim paketom), i admin mutacije
`upsertPack` (upsert po `slug`) i `setPackActive`, obe iza `requireAdmin`.
`convex/seed.ts` je dobio `creditPackSeeds` niz sa svih 5 redova iz zaključanih
podataka (18.08.2026) i `seedCreditPacks` mutaciju, zaštićenu istim
`requireSyncSecret` obrascem kao postojeći `seedInitialContent`, koja upisuje
redove IDEMPOTENTNO (traži postojeći red po `slug` preko `by_slug` indeksa, pa
`patch` ili `insert`).

**ODLUKE:**
- **`seedCreditPacks` je pisan sa `mutation` iz `./_generated/server`**, ne sa
  `mutationGeneric` kao postojeći `seedInitialContent` u istom fajlu - tako
  `rules.md` eksplicitno traži ("ne `mutationGeneric`, stariji stil iz
  `billing.ts`"). Postojeća funkcija u fajlu nije dirana (Surgical Changes) -
  samo je dodat nov `import { mutation }` pored postojećeg
  `mutationGeneric` importa, pa oba stila privremeno kohabitiraju u istom
  fajlu dok neko ne migrira `seedInitialContent`.
- **Ponovljen seed radi pun `patch` svih polja, uključujući `isActive: true`**,
  isto kao što `seedInitialContent` već radi za kurseve/module/lekcije
  (bezuslovan patch, ne samo insert-ako-ne-postoji). Posledica: ako admin ručno
  ugasi paket preko `setPackActive`, pa se seed ponovo pokrene, paket će se
  ponovo aktivirati. Alternativa (patch bez `isActive`) bi značila da prvi seed
  MORA da eksplicitno postavi `isActive: true` samo na insert grani, a svaki
  sledeći poziv ne bi smeo da ga dira - odabrana je jednostavnija, dosledna
  varijanta jer u ovom koraku ne postoji nikakav UI za gašenje paketa, pa je
  scenario teorijski.
- **`getPackBySlug` NE filtrira po `isActive`.** `listPacks` je "javni katalog"
  (samo aktivno), `getPackBySlug` je namenjen internim pozivaocima (budući
  Stripe checkout iz sledećeg koraka, admin editor) kojima treba i neaktivan
  red da bi mogli sami da odluče (npr. da odbiju kupovinu ugašenog paketa sa
  jasnijom porukom nego "ne postoji").
- **`listPacks` čita `.take(200)` pa filtrira/sortira u memoriji**, umesto novog
  indeksa po `isActive`+`sortOrder`. Tabela ima 5 redova i raste isključivo
  ručno preko admin mutacije, pa je bounded scan dovoljan i ne zahteva izmenu
  šeme koju A4.md nije tražio.
- **Nema dodatne validacije iznosa/kredita u `upsertPack`** (npr. da
  `priceEurCents` ili `credits` ne budu negativni) - A4.md to ne traži, a
  jedini pozivalac je admin preko `requireAdmin`, ne korisnički unos.

**Testovi:** `convex/creditPacks.test.ts`, 5 testova. Pokrivaju: seed upisuje
tačno 5 redova sa očekivanim slug-ovima i ponovljen seed ne duplira (isti
`_id`-jevi pre/posle) · `listPacks` bez `kind` vraća sve aktivne sortirane po
`sortOrder` (`basic, premium, starter, creator, pro`), sa `kind: "plan"` i
`kind: "pack"` filterima, i nestaje paket kad ga admin ugasi preko
`setPackActive` · `upsertPack` i `setPackActive` bacaju `"Forbidden"` za
ne-admin korisnika · `upsertPack` na postojeći `slug` menja red (isti `_id`,
nema duplikata) umesto da ga duplira.

**Rezultat verifikacije:**
- `npx convex codegen` - prošlo (TypeScript bez grešaka)
- `npm run lint` - prošlo (0 grešaka; istih 7 postojećih upozorenja u
  nepovezanim fajlovima kao posle A1-A3)
- `npm run test` - prošlo (25 test fajla, 136 testova; A3 je ostavio 24 / 132)

**BLOKADA:** nema.

**Za Jovana ujutru:**
- Ništa nije deploy-ovano ni poslato Stripe-u. `npx convex codegen` je pisao
  samo u `convex/_generated/`.
- **`stripePriceId` je prazan za svih 5 redova.** Kad budeš u Stripe
  dashboardu, moraš da povežeš tačno ove slug-ove (redosled kao u
  `.studio-run/prompts/A4.md`):
  - `basic` (Basic, 9,99 €, mesečna pretplata)
  - `premium` (Premium, 24,99 €, mesečna pretplata)
  - `starter` (Starter, 5 €, jednokratno)
  - `creator` (Creator, 15 €, jednokratno)
  - `pro` (Pro, 40 €, jednokratno)

  Popuni preko `upsertPack` (ili direktno u Convex dashboardu) - `creditPacks.ts`
  ne pravi Stripe cene sam, samo drži katalog.
- `creditPacks` tabela je sad puna i `listPacks`/`getPackBySlug` rade, ali i
  dalje ništa u aplikaciji ne poziva ove funkcije - nema UI-ja niti checkout
  akcije koja bi ih koristila (to je sledeći korak, Stripe checkout za
  kredite/planove).
- `seedCreditPacks` se poziva istim obrascem kao postojeći
  `seedInitialContent`: sa `syncSecret` koji mora da se poklopi sa
  `WEBHOOK_SYNC_SECRET` env promenljivom.
