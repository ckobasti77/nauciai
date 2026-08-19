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

---

## A5 - Stripe checkout za kredite i planove   (2026-08-19 02:45)

**Fajlovi:**
- dodato: `app/api/stripe/credits/route.ts`, `lib/stripe.test.ts`
- izmenjeno: `lib/stripe.ts`, `lib/convex-http.ts`

**Šta je uradjeno:** `lib/stripe.ts` je dobio dve nove funkcije pored postojećih.
`createCreditPackCheckoutSession` pravi JEDNOKRATNU (`mode: "payment"`) sesiju sa
`metadata.kind === "credit_pack"` i vraća kupca na `/{locale}/app/credits`.
`createPlanCheckoutSession` pravi pretplatničku sesiju i upisuje ISTI metadata
objekat (`kind: "plan"`, `planSlug`, `courseId`, `courseSlug`, `userId`) i u
`metadata` i u `subscription_data.metadata` - bez ovog drugog webhook na
`invoice.paid` (obnova) ne bi znao kome da doda mesečnu dozu. Nova ruta
`app/api/stripe/credits/route.ts` prati redosled iz `app/api/stripe/checkout/route.ts`
liniju po liniju: `convexAuthNextjsToken()` -> `getConvexHttpClient(token)` ->
paralelni `getPackBySlug` / `viewer` / `getViewerProfileStatus` -> 401 ako nije
ulogovan -> 403 ako email nije potvrdjen -> provere paketa -> sesija -> `{ url }`.
`createCourseCheckoutSession` NIJE dirana ni jednim karakterom i test to čuva.

**ODLUKE:**
- **`createPlanCheckoutSession` još nema pozivaoca.** A5.md traži funkciju, ali
  traži samo JEDNU novu rutu (`/api/stripe/credits`). Rutu za planove nisam
  izmišljao - `A6.md` je već rezervisao `metadata.planSlug` za webhook, a koja
  ruta/UI je pravi nije definisano ni u A5 ni u `STUDIO-PLAN`. Funkcija je
  eksportovana i testirana, pa je čeka spreman.
- **Ruta odbija plan-slug sa 400 (`NOT_A_CREDIT_PACK`).** `getPackBySlug` po
  dizajnu (A4) vraća i planove i pakete. Da `basic`/`premium` prodje kroz ovu
  rutu, korisnik bi platio pretplatnički plan kao jednokratnu uplatu i dobio
  kredite bez ijedne obnove. Filtriranje po `kind === "pack"` je jedina
  konzervativna opcija.
- **Neaktivan paket -> 404 (`PACK_NOT_AVAILABLE`), zajedno sa nepostojećim.**
  A4 je namerno ostavio `getPackBySlug` bez `isActive` filtera "da pozivalac sam
  odluči" - ovo je ta odluka: ugašen paket se ne prodaje.
- **Poruka za `stripePriceId` doslovno imenuje polje koje fali** (a ne env
  varijablu), jer za pakete kredita cena živi u `creditPacks.stripePriceId`, ne
  u `process.env` kao kod kurseva. Nema `process.env` fallback-a namerno: nema
  imenovane env varijable za pakete, pa bi izmišljanje jedne značilo dva izvora
  istine za istu cenu.
- **`body.priceId` iz zahteva se NE prihvata.** Postojeća `checkout` ruta ima taj
  fallback za kurseve; ovde bi značio da klijent može da naplati proizvoljnu
  Stripe cenu i dobije kredite iz paketa. Cena dolazi isključivo iz baze.
- **`credits` u `metadata` se šalje kao string** (`String(pack.credits)`). Stripe
  ionako sve metadata vrednosti vraća kao stringove, pa ovako ono što A6 pročita
  izgleda isto kao ono što je poslato.
- **`bonusPercent` se ne dodaje na `credits`.** U seed-u iz A4 je bonus već
  uračunat (Creator: 15 € -> 1650 kredita uz `bonusPercent: 10`), pa bi ponovno
  množenje dalo duplu dozu.
- **U `lib/convex-http.ts` je dodata samo jedna referenca, `getPackBySlug`.**
  To je jedina nova Convex funkcija koju ovaj korak zaista poziva sa servera;
  `listPacks` će trebati stranici iz A6/A7 (a ona ide preko `useQuery`, ne preko
  HTTP klijenta), a `grantCredits` iz A2 je interna mutacija i ne može da se
  pozove HTTP klijentom - `applyStripeGrant` koji A6 tek treba da napiše je taj
  koji ovde ide, ali ga još nema.
- **Cancel URL plana vodi na stranicu kursa**, ne na landing kao kod
  `createCourseCheckoutSession` (`/{locale}?checkout=cancelled&course=...`).
  Korisnik koji odustane od nadogradnje plana je već unutar aplikacije;
  izbacivanje na marketing stranicu bi bio korak unazad.

**Testovi:** `lib/stripe.test.ts`, 4 testa, bez ijednog mrežnog poziva - `stripe`
paket je zamenjen klasom-stubom čiji `checkout.sessions.create` samo beleži
parametre (`vi.mock("stripe", ...)`, plus `vi.mock("server-only")` da modul može
da se uveze van RSC okruženja). Pokrivaju: paket kredita ide kao `mode: "payment"`
BEZ `subscription_data`, sa tačnim `line_items`, `allow_promotion_codes`,
`customer_email` i celim `metadata` objektom (`toEqual`, ne `toMatchObject`, da
višak polja ne prodje) · oba URL-a (success i cancel) vode na
`/{locale}/app/credits` · plan ide kao `mode: "subscription"` i nosi
`kind`/`planSlug`/`courseId`/`userId` I u `subscription_data.metadata` I u
`metadata` · **regresioni čuvar**: `createCourseCheckoutSession` i dalje šalje
tačno četiri stara metadata polja i NEMA `kind` marker ni na jednom mestu - da
nova `credit_pack` grana webhook-a iz A6 nikad ne otme postojeći subscription
flow.

Suite je proveren mutacionim testiranjem: `mode: "payment"` promenjen u
`"subscription"` i `subscription_data.metadata` osiromašen na samo `courseId` -
oba puta padaju po dva testa. Izmene vraćene, `diff` čist.

**Rezultat verifikacije:**
- `npx convex codegen` - prošlo
- `npm run lint` - prošlo (0 grešaka; istih 7 postojećih upozorenja u
  nepovezanim fajlovima kao posle A1-A4)
- `npm run test` - prošlo (26 test fajlova, 140 testova; A4 je ostavio 25 / 136)
- dodatno `npx tsc --noEmit` - novi fajlovi čisti (vidi napomenu dole)

**BLOKADA:** nema.

**Za Jovana ujutru:**
- Ništa nije deploy-ovano, nijedan poziv ka Stripe-u nije napravljen.
- **Ruta `/api/stripe/credits` neće raditi dok ne upišeš `stripePriceId` u
  `creditPacks`** za `starter`, `creator` i `pro`. Bez toga vraća 400 sa
  porukom koja imenuje `stripePriceId` i slug paketa. Cene moraju biti
  **One-time**, ne recurring - `mode: "payment"` odbija recurring cenu.
- Ruta se poziva `POST /api/stripe/credits` sa `{ packSlug, locale }` i vraća
  `{ url }`. UI koji je zove ne postoji (to je A6/A12).
- **Krediti se još ne dodeljuju.** Ovaj korak samo pravi Stripe sesiju; webhook
  koji posle uplate zove ledger je A6. Do tada test kupovina prodje, novac se
  naplati, a balans ostane nula.
- **`createPlanCheckoutSession` nema pozivaoca** - vidi prvu ODLUKU. Kad se
  bude pravila ruta za planove, `planSlug` mora da bude `basic` ili `premium`
  (slug iz `creditPacks`), jer A6 iz njega izvodi `enrollments.plan`.
- Napomena, nije uzrokovano ovim korakom: `npx tsc --noEmit` prijavljuje 6
  grešaka u `convex/credits.test.ts` (`by_user` / `by_user_expiry` nisu
  prepoznati kao indeksi u `convex-test` tipovima). Postoje od A2, ne obara ih
  ni `codegen` ni `lint` ni `vitest`, pa suite i dalje prolazi. Nisam ih dirao
  jer nemaju veze sa A5.

---

## A6 - Stripe webhook: krediti iz paketa i mesečna doza plana   (2026-08-19 03:00)

**Fajlovi:**
- izmenjeno: `convex/creditsCore.ts`, `convex/credits.ts`, `convex/credits.test.ts`,
  `app/api/stripe/webhook/route.ts`, `lib/convex-http.ts`

**Šta je uradjeno:** Novac koji je Stripe naplatio sada stvarno stiže u ledger.
`convex/creditsCore.ts` je dobio čistu odluku "šta ovaj event treba da doznači":
`studioPlanSlug` (prepoznaje Studio plan po `metadata.kind === "plan"`),
`creditPackGrants` (jednokratna kupovina paketa) i `invoicePaidGrants` (mesečna
doza + welcome bonus), sve bez `ctx`-a i bez baze. `convex/credits.ts` je dobio
`applyStripeGrant`, mutaciju zaštićenu `requireSyncSecret`-om, koja sklopi ključ
idempotencije od Stripe ID-ja i prosledi ga postojećem `grantCredits`-u preko
`ctx.runMutation` - idempotencijska logika ostaje na jednom mestu, u A2 kodu koji
niko nije dirao. `app/api/stripe/webhook/route.ts` je proširen na tri načina:
`checkout.session.completed` PRVO proverava granu paketa kredita (`mode: "payment"`
+ `kind === "credit_pack"`) pa tek onda ide u postojeću subscription granu, dodat
je nov `case "invoice.paid"` (mesečna doza po `invoice.id`, welcome bonus po
`invoice.id + ":welcome"` samo kad je `billing_reason === "subscription_create"`),
i `syncStripeSubscription` sada dobija `plan` izveden iz `metadata.planSlug` - čime
se A3 šina konačno pušta u rad. Postojeći subscription flow za kurseve nije
promenjen ni u jednom ponašanju i to čuva poseban regresioni test.

**ODLUKE:**
- **`applyStripeGrant` je JAVNA (`mutation`), ne `internalMutation`.** Webhook je
  Next.js ruta koja ide preko `ConvexHttpClient`, a HTTP klijent po definiciji ne
  može da pozove internu funkciju. Zaštita je `requireSyncSecret`, isti obrazac
  kao `syncStripeSubscription` (`billing.ts`) i `seedCreditPacks` (`seed.ts`).
- **`source` je sužen na `purchase | plan_grant | welcome_bonus`**, iako
  `creditLotSource` u šemi ima pet vrednosti. Webhook nema nikakav razlog da kuje
  `admin_grant` ili `refund` lot, a uži validator znači da ne može ni greškom.
- **Tačno jedan ključ idempotencije, inače `NEVALIDAN_KLJUC_IDEMPOTENCIJE`.** Bez
  ijednog bi se grant ponovio na svakom Stripe retry-ju; sa oba bi ista uplata
  mogla da legne pod svaki od njih (dva lota, dupli krediti). A6.md ne kaže šta
  raditi kad stignu oba - odbijanje je jedina opcija koja ne kuje novac.
- **`ctx.runMutation` umesto izdvajanja zajedničke funkcije.** A6.md doslovno
  traži "interno zove `grantCredits`". Cena je jedna podtransakcija po grantu;
  dobitak je da `grantCredits` iz A2 (i njegovi testovi) ostaje netaknut.
- **Iznos paketa kredita se čita iz `session.metadata.credits`, ne iz
  `creditPacks` reda.** To je ponuda koju je korisnik prihvatio u trenutku
  plaćanja; ako admin u medjuvremenu promeni paket, kupac dobija ono za šta je
  platio. A5 već upisuje `credits` u metapodatke sesije baš zbog ovoga.
- **Iznos mesečne doze plana se, obrnuto, čita iz `creditPacks` po `planSlug`-u.**
  Faktura obnove nema nikakav podatak o broju kredita - jedini izvor istine je
  katalog. Basic ima `credits: 0`, pa `isValidCreditAmount` odbija dozu i
  Basic pretplatnik dobija samo welcome bonus, tačno po STUDIO-PLAN D.1.
- **Welcome bonus je 150 (`WELCOME_BONUS_CREDITS` iz A2), za OBA plana**, po
  STUDIO-PLAN D.1 ("za oba plana"). Ne postoji red u `creditPacks` za bonus, pa
  je imenovana konstanta u `creditsCore.ts` jedino mesto gde broj živi.
- **Metapodaci plana se čitaju iz `invoice.parent.subscription_details.metadata`
  (snimak sa fakture), a sa same pretplate SAMO ako je snimak prazan.** Stripe
  22.x (API `2026-06-24.dahlia`) više nema `invoice.subscription`. Snimak je
  jeftiniji i deterministički; fallback postoji jer prva faktura ciklusa ume da
  bude finalizovana pre nego što metapodaci pretplate slegnu, a bez njega bi
  prvi mesec Premiuma i welcome bonus tiho propali. Pretplate na kurseve imaju
  neprazan snimak (courseId, courseSlug, userId) pa nikad ne plaćaju taj
  dodatni poziv ka Stripe-u.
- **`plan` se prosledjuje samo kad `metadata.planSlug` postoji**
  (`planSlug ? normalizePlan(planSlug) : undefined`). `normalizePlan(undefined)`
  vraća `"basic"`, pa bi bezuslovno prosledjivanje degradiralo svakog Premium
  korisnika čim stigne bilo koji `customer.subscription.updated` sa pretplate na
  kurs. A3 je istu zaštitu već ugradio u `syncStripeSubscription`; ovo je druga
  brava na istim vratima.
- **`case "invoice.paid"` NE zove `syncSubscription`.** Status pretplate i dalje
  vozi isključivo `customer.subscription.*`, kako A6.md i traži. Faktura dira
  samo kredite.
- **Grana paketa kredita se prekida (`break`) čim se marker prepozna**, i pre
  nego što se pogleda `session.subscription`. Sesija paketa je `mode: "payment"`
  i nikad nema pretplatu, pa je ovo formalnost - ali je formalnost koja
  garantuje da nova grana ne može da otme postojeći flow.
- **Jedan `console.error` kad sesija ima `kind: "credit_pack"` a metapodaci nisu
  upotrebljivi.** To znači da je neko naplatio novac a krediti nisu dodeljeni;
  bez loga bi to bila potpuno nevidljiva rupa. Jedini `console` u `app/api/`,
  namerno.
- **`invoice.paid` sa `billing_reason: "subscription_update"` dobija punu
  mesečnu dozu.** Tako doslovno kaže tabela u A6.md ("ako pretplata ima
  `metadata.kind === "plan"` -> dodeli mesečnu dozu"). Posledica pri nadogradnji
  Basic -> Premium usred ciklusa je opisana dole, u sekciji za Jovana.
- **Nema testa za samu Next rutu.** `vitest.config.ts` uključuje isključivo
  `convex/**/*.test.ts` i `lib/**/*.test.ts`; dodavanje `app/**` je izmena
  konfiguracije koju A6.md ne traži. Zato je SVA odluka rute izvučena u
  `creditsCore.ts` i testirana tamo, a ruta je svedena na dohvatanje podataka i
  petlju - tako da nema neistestirane logike, samo neistestirano vezivanje.

**Testovi:** `convex/credits.test.ts`, 7 novih (ukupno 19 u fajlu).
1. Ista `invoice.paid` faktura obradjena dvaput -> tačno jedan lot, jedna
   transakcija, balans 2000 (ne 4000), ključ leži u `stripeInvoiceId`.
2. Ista `checkout.session.completed` sesija obradjena dvaput -> tačno jedan lot,
   balans 500, `stripeSessionId` i `packId` na lotu.
3. `subscription_create` faktura -> dva lota (`plan_grant` + `welcome_bonus`) sa
   ključevima `in_create_1` i `in_create_1:welcome`; ponavljanje samo doze, pa
   samo bonusa, pa oba zajedno ne otvara treći lot. Bonus ne ulazi u
   `lifetimePurchased`.
4. `subscription_cycle` faktura -> tačno jedan grant, `plan_grant`, nigde
   `welcome_bonus` lot ni `bonus` transakcija.
5. `invoice.paid` bez `kind === "plan"` -> `studioPlanSlug` je `null`, grantovi
   prazni, ledger ostaje prazan (nema ni `creditBalances` reda). Uz to: ni sam
   `planSlug` bez markera, ni tudji marker (`kind: "credit_pack"`) ne prolaze.
6. `applyStripeGrant` odbija pogrešan `syncSecret` ("Forbidden"), grant bez
   ijednog ključa i grant sa oba ključa - i posle sva tri odbijanja ledger je
   netaknut.
7. Regresioni čuvar: sesija pretplate na kurs (tačno oni metapodaci koje
   `createCourseCheckoutSession` upisuje danas), sesija bez metapodataka i
   sesija plana ne daju nijedan grant kroz granu paketa.

Suite je proveren mutacionim testiranjem - sedam namerno ubačenih grešaka, svih
sedam oboreno: welcome bonus bez `:welcome` sufiksa (deli ključ sa dozom) ·
welcome bonus na svakoj fakturi umesto samo na `subscription_create` ·
`studioPlanSlug` koji ne gleda `kind` · `applyStripeGrant` bez
`requireSyncSecret` · dozvoljena oba ključa idempotencije · doza plana upisana
pod `stripeSessionId` umesto `stripeInvoiceId` · `creditPackGrants` koji ne
gleda `kind`. Sve izmene su vraćene, `diff` prema rezervnoj kopiji je čist.

**Rezultat verifikacije:**
- `npx convex codegen` - prošlo (TypeScript bez grešaka)
- `npm run lint` - prošlo (0 grešaka; istih 7 postojećih upozorenja u
  nepovezanim fajlovima kao posle A1-A5)
- `npm run test` - prošlo (26 test fajlova, 147 testova; A5 je ostavio 26 / 140)
- dodatno `npx tsc --noEmit` - nema nijedne nove greške; ostaje istih 6
  postojećih u `convex/credits.test.ts` (`by_user` / `by_user_expiry` u
  `convex-test` tipovima), poznatih još od A2

**BLOKADA:** nema.

**Za Jovana ujutru:**

- Ništa nije deploy-ovano, nijedan poziv ka Stripe-u nije napravljen, nijedna
  env varijabla nije dirana.

- **OVO MORAŠ DA URADIŠ RUČNO: uključi event tipove na POSTOJEĆEM webhook
  endpointu** (`/api/stripe/webhook`, ne pravi nov). Tačna lista, svih pet:
  1. `checkout.session.completed`
  2. `invoice.paid`
  3. `customer.subscription.created`
  4. `customer.subscription.updated`
  5. `customer.subscription.deleted`

  Prva, treća, četvrta i peta su verovatno već uključene (postojeći flow ih
  koristi) - **`invoice.paid` je nova i bez nje Premium pretplatnik ne dobija
  ni jedan jedini kredit.** Ne dodaj `invoice.payment_succeeded`; kod je ne
  obradjuje i samo bi pravila šum.

- **Pre prve prave uplate mora da se popuni `creditPacks.stripePriceId`** za
  `basic`, `premium`, `starter`, `creator`, `pro` (nasledjeno iz A4, još nije
  uradjeno). Planovi moraju biti **recurring** cene, paketi **one-time**.

- **Test scenario koji vredi proći lokalno** (`stripe listen --forward-to
  localhost:3000/api/stripe/webhook`, ja ga nisam pokretao jer mi je Stripe CLI
  zabranjen):
  1. Kupovina Starter paketa -> balans skoči za 500, jedan lot izvora `purchase`.
  2. Prva pretplata na Premium -> balans skoči za 2150 (2000 doza + 150 bonus),
     DVA lota, i `enrollments.plan` postane `premium`.
  3. `stripe trigger invoice.paid` na istoj pretplati sa
     `billing_reason: subscription_cycle` -> +2000, bez novog bonusa.
  4. Ponovi bilo koji od njih -> balans se NE menja.

- **Poznata rupa koju A6 ne zatvara: promena plana kroz Customer Portal.**
  `metadata.planSlug` se upisuje pri kreiranju pretplate i naš kod ga posle
  nikad ne menja. Ako korisnik kroz portal predje sa Premium na Basic, metapodaci
  i dalje kažu `premium`, pa bi i dalje dobijao 2000 kredita mesečno i zadržao
  pristup Pro lekcijama. Dva puta gde se to rešava, kad budeš spreman: ili
  webhook na `customer.subscription.updated` prepiše `subscription.metadata`
  preko Stripe API-ja, ili se plan izvodi iz `stripePriceId` preko
  `planFromPriceId` iz `lib/plan.ts` (A3 ga je ostavio baš za ovo, samo mu treba
  mapa price ID -> plan). Dok se ne odluči, **nemoj dozvoliti menjanje plana u
  Customer Portal konfiguraciji** - to je najjeftinija privremena brava.

- **Nadogradnja Basic -> Premium usred ciklusa daje punu mesečnu dozu odmah**
  (proration faktura ima `billing_reason: "subscription_update"`), pa taj mesec
  korisnik plati srazmerno a dobije 2000 kredita. Tako traži A6.md. Ako ti to
  smeta, promena je jedan `if` u `invoicePaidGrants` - ograniči dozu na
  `subscription_create` i `subscription_cycle`. Test 4 i dalje prolazi, treba
  dopisati nov za `subscription_update`.

- Podsetnik iz A2 koji i dalje važi: **cron za istek kredita (D5) NIJE napisan.**
  Krediti dodeljeni od danas ističu za 12 meseci, ali ih niko još ne gasi, pa
  keširan balans posle godinu dana može da bude veći od stvarno potrošivog.

---

## A7 - Katalog modela (modelCatalog) + seed   (2026-08-19 03:10)

**Fajlovi:**
- dodato: `convex/modelCatalog.ts`, `convex/modelCatalog.test.ts`
- izmenjeno: `convex/seed.ts`

**Šta je uradjeno:** `convex/modelCatalog.ts` daje pristupne funkcije nad
`modelCatalog` tabelom iz A1: javni `listModels({ kind? })` (bounded
`.take(200)`, vraća samo `isEnabled: true`, sortirano po `sortOrder` - isti
obrazac kao `creditPacks.listPacks` iz A4), `getModelBySlug` kao
`internalQuery` preko `by_slug` indeksa, i tri admin mutacije zaštićene
`requireAdmin`-om: `upsertModel` (upsert po `slug`), `setModelEnabled` i
`setModelCost` (menja `creditCost` i opciono `estimatedCostUsd`, za buduće
alarme o marži). `convex/seed.ts` je dobio `modelCatalogSeeds` niz sa svih 22
modela iz `docs/STUDIO-PLAN.md` §2.3 (8 slika, 11 video, 3 zvuk) i
`seedModelCatalog` mutaciju, idempotentnu preko `by_slug`, istim obrascem kao
`seedCreditPacks` iz A4.

**ODLUKE:**
- **Cene, fal endpointi i `estimatedCostUsd` su prepisani TAČNO iz
  STUDIO-PLAN §2.3, bez preračunavanja.** Gde je tabela davala cenu "po MP"
  ili "po 1000 znakova" (FLUX.2, ElevenLabs), broj je prepisan doslovno kao
  `estimatedCostUsd` - A7.md eksplicitno zabranjuje ponovno računanje, pa
  normalizacija jedinica (po slici vs. po MP, po generaciji vs. po sekundi)
  nije rađena. To je posao Faze B (B2: "cena zavisna od trajanja, izračunato
  u mutaciji").
- **`badge: "skupo"` je stavljen na svaki video model označen sa ⚠️ (jedan ili
  dva znaka upozorenja) u §2.3 tabeli** - to je jedini marker koji plan koristi
  za "skupo"; A7.md ga opisuje kao "(!)" ali u planu se pojavljuje kao ⚠️.
  Modeli sa ⚠️⚠️ ("vrlo skupo") dobijaju isti `"skupo"` badge, jer šema (A1)
  ima samo jedan literal za to stanje - nema `"vrlo skupo"` varijante.
- **`badge: "preporuceno"` je stavljen SAMO na `nano-banana-2` (bazna, ne 2K
  varijanta)** - tako A7.md doslovno traži ("na Nano Banana 2"), i tako je
  označen jedinim ⭐ u §2.3. `nano-banana-2-2k` je isti model u drugoj
  rezoluciji i nije posebno označen u planu, pa nije dobio badge.
- **Slike (8 modela) su `isEnabled: true`; video (11) i zvuk (3) su
  `isEnabled: false`** - tačno kako A7.md traži. Redosled `sortOrder`: slike
  10-80, video 110-210, zvuk 310-330 (razmaci od 100 između vrsta ostavljaju
  prostor da se kasnije ubaci model bez pomeranja svih ostalih).
- **`paramSchema` za slike je tačno onako kako A7.md specificira**: `prompt`
  (textarea, obavezno, max 2000), `aspect_ratio` (select, opcije
  1:1/16:9/9:16/4:3/3:4 - plan ne propisuje tačan set, pa je ovo razuman
  podrazumevani izbor za formu koja se piše kasnije), `num_images` (number
  1-4). **Video i zvuk dobijaju minimalnu šemu sa samo `prompt` poljem** - A7.md
  propisuje formu samo "za slike"; izmišljanje polja za video/zvuk (trajanje,
  glas, itd.) pre Faze B/C bi bilo van obima ovog koraka i van "Simplicity
  First" - ta polja dolaze kad B1/C1 stvarno počnu da grade tu formu.
- **`getModelBySlug` je `internalQuery`, ne javni `query`** - A7.md eksplicitno
  traži "interni". Testiran preko `t.run((ctx) => ctx.runQuery(internal...))`,
  isti obrazac koji `convex-test` dokumentacija i ostali interni testovi u
  repou (npr. `identityMerge.test.ts`) koriste za internal funkcije.
- **`upsertModel` nema `updatedAt` kao argument** - mutacija ga sama postavlja
  na `Date.now()` pri svakom upisu (dozvoljeno u mutacijama po Convex
  smernicama), da pozivalac (budući admin UI) ne mora da ga računa niti da
  slučajno pošalje zastareo timestamp.
- **`seedModelCatalog` radi bezuslovan pun `patch` na ponovljenom pozivu**
  (uključujući `isEnabled`), isti obrazac kao `seedCreditPacks` iz A4 - ako
  admin ručno uključi video model preko `setModelEnabled`, pa se seed ponovo
  pokrene, model će se vratiti na `isEnabled: false` iz plana. Isti kompromis
  kao u A4: nema još UI-ja za ovo, scenario je teorijski, a dosledno ponašanje
  je jednostavnije za razumeti.
- **Nije napravljena `/sr/app/admin/studio` stranica.** `docs/STUDIO-PLAN.md`
  §5 (A7 red u tabeli) je pominje, ali `.studio-run/prompts/A7.md` (stvarni
  zadatak ovog koraka) je eksplicitno traži samo `convex/modelCatalog.ts` i
  seed - nijedna UI stranica nije u sekciji "Šta napisati". `rules.md`
  zabranjuje pravljenje UI stranica "osim ako korak to izričito traži" - ovaj
  ne traži, pa admin ekran nije pravljen. Ostaje za budući korak koji će
  eksplicitno tražiti UI.

**Testovi:** `convex/modelCatalog.test.ts`, 5 testova. Seed upisuje tačno 22
reda i ponovljen seed ne duplira (isti `_id`-jevi pre/posle) · `listModels`
vraća samo `isEnabled: true` (svih 8 su `kind: "image"`), sortirano po
`sortOrder`, poštuje `kind` filter (video/audio vraćaju prazno jer još nisu
uključeni), i `nano-banana-2` ima `badge: "preporuceno"` · `getModelBySlug`
vraća tačnu cenu za 3 nasumična modela (FLUX.2 Flash, Veo 3.1 Lite 720p, Kling
v3 Pro + zvuk) poređenu red po red sa STUDIO-PLAN §2.3, plus `null` za
nepostojeći slug · sve tri admin mutacije bacaju `"Forbidden"` za ne-admin
korisnika i ne menjaju ništa · `setModelEnabled` i `setModelCost` menjaju
postojeći red po `_id` bez dupliranja.

**Rezultat verifikacije:**
- `npx convex codegen` - prošlo (TypeScript bez grešaka)
- `npm run lint` - prošlo (0 grešaka; istih 7 postojećih upozorenja u
  nepovezanim fajlovima kao posle A1-A6)
- `npm run test` - prošlo (27 test fajlova, 152 testova; A6 je ostavio 26 / 147)

**BLOKADA:** nema.

**Za Jovana ujutru:**
- Ništa nije deploy-ovano ni poslato fal-u. `npx convex codegen` je pisao samo
  u `convex/_generated/`.
- **Katalog je pun, ali ništa u aplikaciji ga još ne koristi.** Nema UI-ja koji
  poziva `listModels`, nema `studioActions.ts`/fal klijenta koji čita
  `falEndpoint` - to su sledeći koraci (A8+).
- **Video i zvuk modeli su u bazi ali `isEnabled: false`** - to je namerno, po
  A7.md, i uključuju se tek u Fazi B i C.
- **Cene u katalogu su tačno onakve kakve su bile 18.08.2026.** fal menja cene
  mesečno (STUDIO-PLAN §2.5) - `estimatedCostUsd` i `creditCost` u ovoj tabeli
  treba periodično proveravati, ali ta provera (noćni cron poredi sa fal
  API-jem) nije deo ovog koraka.
- `seedModelCatalog` se poziva istim obrascem kao `seedCreditPacks`: sa
  `syncSecret` koji mora da se poklopi sa `WEBHOOK_SYNC_SECRET` env
  promenljivom.
