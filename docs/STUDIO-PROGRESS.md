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

## A8 - fal klijent + submit akcija   (2026-08-19 03:20)

**Fajlovi:**
- dodato: `lib/fal.ts`, `lib/fal.test.ts`, `convex/studioActions.ts`,
  `convex/studioActions.test.ts`

**Šta je uradjeno:** `lib/fal.ts` je tanak `fetch` klijent ka fal.ai queue
API-ju, bez fal SDK-a, tačno po A8.md: `buildQueueUrl` sastavlja
`https://queue.fal.run/{endpoint}?fal_webhook={encoded}`, `submitToFal` šalje
`POST` sa `Authorization: Key ${apiKey}` i baca grešku sa HTTP statusom i
telom odgovora u poruci na svaki ne-2xx odgovor. `convex/studioActions.ts`
dobija internu akciju `submitJob({ jobId })` koja učita posao i model iz
kataloga, sastavi `input` iz `model.defaultParams` i `job.params` (job
polja pobeđuju pri konfliktu), sastavi webhook URL iz
`process.env.CONVEX_SITE_URL` (ne hardkodovano), pozove `submitToFal` sa
`process.env.FAL_KEY`, i na uspeh markira posao `running` sa
`falRequestId`-jem, a na BILO KOJU grešku ga refundira preko postojećeg
`credits.refundCredits` iz A2. Ništa iz A1-A7 nije dirano.

**ODLUKE:**
- **`submitJob` je dobio i tri prateće interne funkcije koje A8.md ne
  imenuje eksplicitno: `getJobForSubmit` (query), `markJobRunning` i
  `failJob` (mutacije).** A8.md kaže da `submitJob` "runQuery učitaj job",
  zove `markJobRunning({jobId, falRequestId})` i `failJob({jobId, error})`
  - ali nijedna od te tri funkcije ne postoji u repou, jer `convex/studio.ts`
  (gde bi po konvenciji pripadale mutacije nad `generationJobs`) tek dolazi u
  A9 (`createJob`). Bez njih `submitJob` ne bi mogao da radi ništa. Najkonzervativnija
  opcija je bila da ih napravim sada, u istom fajlu koji A8.md jedini
  imenuje (`convex/studioActions.ts`), umesto da pogađam kako će izgledati
  budući `convex/studio.ts` i rizikujem sudar imena sa A9. Ako A9 odluči da
  ih preseli u `studio.ts`, to je jednostavan mehanički pomeraj.
- **Greške u `submitJob` se hvataju SVUDA, ne samo oko `submitToFal` poziva.**
  A8.md-ova numerisana lista ("4. submitToFal ... 5. Uspeh -> markJobRunning
  6. Greška -> failJob") čita se kao da je "greška" vezana samo za fal poziv.
  Pročitao sam je šire: ako se posao ili model ne učitaju, ili `FAL_KEY`/
  `CONVEX_SITE_URL` fale, ili je `job.params`/`model.defaultParams` loš JSON,
  posao bi ostao zaglavljen u `reserved` sa VEĆ skinutim kreditima i nikad
  se ne bi refundirao - to je gori ishod od "tiho pada" koje A8.md izričito
  zabranjuje za `FAL_KEY`. Ceo handler (učitavanje + slanje) je u jednom
  `try`; svaka greška vodi u `failJob`, koja je idempotentna i uvek ostavlja
  posao u `refunded`.
- **`failJob` prvo patch-uje `status: "failed"` sa `error`-om, PA TEK ONDA**
  poziva `credits.refundCredits` i patch-uje `status: "refunded"`.** Sledi
  redosled iz sekcije 4.2 STUDIO-PLAN-a ("ERROR → status: failed ... →
  status: refunded"), i znači da čak i kad bi `refundCredits` bacio (npr.
  `NEMA_TROSKA_ZA_REFUND` ako `createJob` iz nekog razloga nije upisao
  `spend` transakciju), `error` poruka je vidljiva na poslu pre nego što
  cela mutacija eventualno padne i vrati sve nazad - lakše za dijagnozu.
- **`input` sastavljanje je `{ ...defaultParams, ...jobParams }`** - polja iz
  konkretnog posla (npr. `prompt`, `aspect_ratio` koje je korisnik izabrao)
  pobeđuju model podrazumevane vrednosti. A8.md ne kaže eksplicitno koji
  pobeđuje, ovo je jedini smislen izbor - default vrednosti postoje da
  popune ono što korisnik NIJE poslao.
- **`lib/fal.ts` nema `import "server-only"`** (za razliku od `lib/stripe.ts`).
  Taj fajl se poziva isključivo iz Convex akcije, nikad iz Next.js rute ili
  RSC-a, pa nema granicu klijent/server koju `server-only` čuva - dodavanje
  bi bilo nepotreban import bez svrhe u ovom fajlu.
- **`buildQueueUrl` je prost template string sa `encodeURIComponent`**, ne
  `URL`/`URLSearchParams` objekat. Ekvivalentno je i lakše za test (tačan
  string iz A8.md primera), a izbegava eventualne razlike u tome kako `URL`
  enkodira endpoint segmente.

**Testovi:**
`lib/fal.test.ts`, 4 testa (eksplicitno traženi A8.md-om): `buildQueueUrl`
enkoduje webhook URL i ne pravi dupli `?` (2 testa) · `submitToFal` uspeh
vraća `requestId` i šalje tačan `Authorization`/body/URL · `submitToFal` na
422 baca grešku sa statusom i telom odgovora u poruci (2 provere u istom
testu).

`convex/studioActions.test.ts`, 7 testova (nisu eksplicitno traženi A8.md-om,
ali su dodati jer `markJobRunning`/`failJob` pomeraju kredite, a repo do sad
dosledno testira svaki kod koji dira ledger - videti A2/A6): `markJobRunning`
postavlja `status`/`falRequestId` · `failJob` upisuje grešku, refundira tačan
iznos preko pravog `credits.refundCredits`, i drugi poziv ne duplira refund ·
`submitJob` sa fali `FAL_KEY` - refundira, `fetch` NIJE pozvan, poruka je
tačno "FAL_KEY nije postavljen" · isto za `CONVEX_SITE_URL` · `submitJob`
uspeh - proverava tačan URL/header/JSON-spojeni body ka fal-u, posao postaje
`running` sa `falRequestId` · `submitJob` na fal 422 - refundira, poruka
sadrži i status i telo · `submitJob` kad model ne postoji u katalogu -
refundira umesto da ostavi posao zaglavljen. `fetch` je mokovan preko
`vi.stubGlobal("fetch", ...)` unutar `convex-test` akcija - ovo NIJE ranije
korišćen obrazac u repou (nijedan postojeći test ne testira `internalAction`
sa mreže), pa je pre pisanja testova provereno da mokovanje stvarno hvata
poziv (test bi inače lažno prošao ako bi prava mreža bila pozvana i pukla
na `ECONNREFUSED` van testa, ili prošla nezapaženo) - `fetchMock` asertuje
tačan URL/header/body iznutra i `toHaveBeenCalledTimes(1)` spolja.

**Rezultat verifikacije:**
- `npx convex codegen` - prošlo (TypeScript bez grešaka)
- `npm run lint` - prošlo (0 grešaka; istih 7 postojećih upozorenja u
  nepovezanim fajlovima kao posle A1-A7)
- `npm run test` - prošlo (29 test fajlova, 163 testa; A7 je ostavio 27 / 152)
- dodatno `npx tsc --noEmit` - dve NOVE linije istog poznatog problema iz A5
  (`by_user` nije prepoznat kao indeks u `convex-test` tipovima), u
  `convex/studioActions.test.ts:96`. Isti uzrok, ista neblokirajuća priroda
  kao već dokumentovano u A5 - `codegen`/`lint`/`vitest` sve prolaze.

**BLOKADA:** nema.

**Za Jovana ujutru:**
- Ništa nije deploy-ovano, fal nikad nije pozvan uživo (svi testovi mokuju
  `fetch`).
- **`FAL_KEY` MORA da se postavi u Convex env pre nego što bilo koji posao
  stvarno može da se pošalje fal-u** (bez njega `submitJob` odmah refundira
  sa jasnom porukom, ne pada tiho):
  ```
  npx convex env set FAL_KEY "<tvoj fal.ai API key>"
  npx convex env --prod set FAL_KEY "<tvoj fal.ai API key>"
  ```
- **`CONVEX_SITE_URL` se NE postavlja ručno** - to je Convex-ov ugrađen env
  promenljiva, automatski prisutna u svakom deploymentu (dev i prod imaju
  svaki svoj `*.convex.site` domen), tačno kao što `convex/auth.config.ts`
  već pretpostavlja. A8.md je frazirao kao da se "postavlja", ali u ovom
  repou (i uopšte u Convexu) to nije komanda koju pokrećeš - samo proveri da
  postoji:
  ```
  npx convex run --inline-query 'return process.env.CONVEX_SITE_URL'
  npx convex run --prod --inline-query 'return process.env.CONVEX_SITE_URL'
  ```
- **`submitJob` još nema pozivaoca.** Ništa u repou još ne zakazuje ovu
  akciju - `createJob` (A9) je taj koji će posle rezervacije kredita zvati
  `ctx.scheduler.runAfter(0, internal.studioActions.submitJob, { jobId })`.
  Do A9, `submitJob` se može ručno okinuti samo preko `npx convex run
  studioActions:submitJob '{"jobId": "..."}'` nad ručno ubačenim
  `generationJobs` redom (kao što testovi rade).
- **`markJobRunning`/`failJob`/`getJobForSubmit` trenutno žive u
  `convex/studioActions.ts`, ne u `convex/studio.ts`** - vidi prvu ODLUKU.
  Kad budeš radio A9 i otvaraš `convex/studio.ts` za `createJob`, odluči da
  li ih premeštaš tamo (čisto kozmetičko, `internal.studioActions.X` ->
  `internal.studio.X`, jedna izmena u `submitJob`) ili ih ostavljaš gde jesu.
  Test suite prati funkcije bez obzira gde žive, pa premeštaj neće ništa
  pokvariti dok god se pozivi ažuriraju.
- **Fal webhook handler (A10, `/fal/webhook`) i dalje ne postoji.** Kad
  `submitJob` uspe, posao ostaje zaglavljen u `running` zauvek dok A10 ne
  napiše handler koji ga pomera u `done`/`failed` na osnovu fal-ovog
  webhook poziva. To je očekivano - ovaj korak samo šalje zahtev.
  Posledica: **stuck job reaper (B6) takođe još ne postoji**, pa ručno
  testiranje pre A10 ostavlja `running` poslove trajno "u vazduhu" - to je
  poznato, ne popravljaj to sad.

## A9 - `createJob` mutacija sa rezervacijom   (2026-08-19 03:30)

**Fajlovi:**
- dodato: `convex/studio.ts`, `convex/studioCore.ts`, `convex/studio.test.ts`
- izmenjeno: `convex/schema.ts` (nova tabela `platformFlags`), `convex/seed.ts`
  (`seedPlatformFlags`), `convex/studioActions.ts` (`markJobRunning` i
  `failJob` preseljeni u `studio.ts`), `convex/studioActions.test.ts`
  (njihova dva testa preseljena u `studio.test.ts`)

**Šta je uradjeno:** `convex/studio.ts` donosi `createJob` - javnu mutaciju
koja radi ceo korak 1 iz sekcije 4.2 STUDIO-PLAN-a kao JEDNU transakciju:
kill switch iz nove `platformFlags` tabele, provera aktivnog upisa,
moderacija prompta preko `validatePrompt` iz `creditsCore`, model iz kataloga,
limit od 3 posla u letu, dnevni limit od 50 generacija, serverski izračunata
cena, `credits.spendCredits`, upis `generationJobs` reda u statusu `reserved`,
inkrement `studioUsageDaily` i `scheduler.runAfter(0, submitJob)`. Čista
logika (dan potrošnje, hash prompta, formula cene, parsiranje `params`) je po
konvenciji repoa izdvojena u `convex/studioCore.ts`. Uz `createJob` u
`studio.ts` su i `markJobRunning`, `failJob` (refundira preko postojećeg
`credits.refundCredits`) i `listMyJobs` (paginirani query, dakle realtime
pretplata). Ledger iz A2 nije menjan - `createJob` ga samo poziva.

**ODLUKE:**
- **Upis posla ide PRE `spendCredits`, iako A9.md navodi obrnut redosled
  (korak 9 pa 10).** `credits.spendCredits` (A2) traži `jobId` kao argument -
  to je ključ pod kojim `refundCredits` kasnije prepoznaje trošak
  (`by_job_type` indeks). Bez postojećeg reda u `generationJobs` taj ID ne
  postoji, a menjati potpis `spendCredits`-a bi značilo dirati ledger koji
  radi i pokvariti idempotenciju refunda. Garancija je ista jer je sve u istoj
  transakciji: ako `spendCredits` baci `NEDOVOLJNO_KREDITA`, insert se
  poništava sam. To NIJE pretpostavka - proverio sam je tako što sam
  privremeno stavio `try/catch` oko `spendCredits` i pustio testove: test
  "nedovoljno kredita" je odmah pao, sa poslom koji je ostao u bazi bez
  skinutih kredita. `try/catch` je uklonjen, test je ponovo zelen.
- **Enrollment provera = bar jedan `enrollments` red sa `status: "active"`,
  bilo koji kurs.** A9.md kaže "aktivan enrollment na kursu", ali
  `generationJobs` nema `courseId`, a Studio je zasebna stranica
  (`/app/studio`, A12) bez konteksta kursa - tražiti konkretan `courseId` bi
  značilo izmisliti argument koji UI ne može da popuni. `requireCourseAccess`
  iz `helpers.ts` nije korišćen iz istog razloga (traži `courseId`). Greška je
  `NIJE_UPISAN` - A9.md ne imenuje grešku za ovaj korak.
- **Kill switch: red koji NE postoji znači "uključeno".** Samo eksplicitan
  `enabled: false` gasi Studio. Fail-closed bi značio da svaki deployment na
  kome seed nije pokrenut ima mrtav Studio sa zbunjujućom porukom, a
  podrazumevana vrednost seed-a je ionako `true`. Ponašanje je zakovano
  testovima (i za red koji ne postoji i za `enabled: true`).
- **`seedPlatformFlags` NE prepisuje postojeći red** - za razliku od
  `seedCreditPacks` (A4) i `seedModelCatalog` (A7), koji rade bezuslovan
  `patch`. Kod kill switcha bi taj obrazac bio opasan: ponovno pokretanje
  seed-a bi tiho upalilo Studio koji je namerno ugašen. Insert samo ako reda
  nema.
- **Nije napravljena admin mutacija za paljenje/gašenje flag-a.** A9.md je ne
  traži, a nema ni admin UI-ja koji bi je zvao. Do koraka koji to izričito
  traži, prekidač se okreće iz Convex dashboard-a (radi i na telefonu, što je
  scenario iz STUDIO-PLAN 4.4).
- **`markJobRunning` i `failJob` su preseljeni iz `studioActions.ts` u
  `studio.ts`**, tačno kako je A8 predvideo ("ako A9 odluči da ih preseli...
  to je jednostavan mehanički pomeraj") i kako A9.md traži ("Dodaj i
  `markJobRunning`, `failJob`"). Telo funkcija nije promenjeno ni u jednom
  znaku - samo je fajl drugi, a `submitJob` sada zove `internal.studio.*`.
  Duplirati ih u oba fajla bi bilo gore od pomeranja. `getJobForSubmit` je
  ostao u `studioActions.ts` jer služi isključivo `submitJob`-u.
- **`createJob` prima `{ modelSlug, params }` - prompt je unutar `params`
  JSON-a**, jer `submitJob` (A8) ceo `params` prosleđuje fal-u kao ulaz, pa
  prompt mora da bude tamo. `params` se čuvaju doslovno onako kako su stigli.
- **`createJob` NEMA `lessonId`/`taskId` argumente**, iako ih šema (A1) ima.
  A9.md ih ne pominje; veza sa lekcijom/zadatkom je posao A11 ("Persist output
  + veza sa `labOutputs`"). Dodavanje neiskorišćenih opcionih argumenata
  unapred bi bilo spekulativno (AGENTS.md "Simplicity First"). **A11 ili A12
  moraju da ih dodaju** da bi `taskProgress.evidenceOutputId` uopšte mogao da
  se popuni.
- **Greška prompta nosi i razlog: `NEISPRAVAN_PROMPT:ZABRANJEN_POJAM`** (ili
  `:PRAZAN_PROMPT` / `:PREDUGACAK_PROMPT`). A9.md traži `NEISPRAVAN_PROMPT`;
  prefiks je tačno to, a razlog iza dvotačke ostaje da bi UI mogao da razlikuje
  "prompt je predugačak" od "prompt sadrži zabranjen pojam" umesto da nudi
  jednu maglovitu poruku.
- **Model koji ne postoji u katalogu daje istu grešku kao isključen model
  (`MODEL_NEDOSTUPAN`).** Za korisnika je to ista situacija, a razlikovanje bi
  odalo koji slug-ovi postoje u bazi.
- **Cena: `costPerSecond` postoji -> `ceil(costPerSecond * duration)`, inače
  fiksni `creditCost` iz kataloga** (STUDIO-PLAN B2). Ako model naplaćuje po
  sekundi, a `duration` nije poslat kao pozitivan broj, mutacija baca
  `NEISPRAVNO_TRAJANJE` umesto da padne na baznu cenu - naplatiti baznu cenu
  za klip nepoznate dužine je tiho potkradanje kase. Nijedan model iz A7
  seed-a još nema `costPerSecond`, pa ova grana za sada pogađa samo modele
  koje Faza B tek uvodi.
- **`promptHash` je FNV-1a u dve trake (16 hex znakova), ne SHA-256.** Polje
  služi za dedup i grupisanje u moderaciji, a ne za bezbednost; ovako je
  funkcija čista, sinhrona i deterministička, bez oslanjanja na `crypto.subtle`
  (async, vezan za runtime). Ako zatreba kriptografska jačina, zamena je jedna
  funkcija u `studioCore.ts`.
- **Dan u `studioUsageDaily` je UTC dan** (`toISOString().slice(0,10)`).
  STUDIO-PLAN ne propisuje vremensku zonu; UTC je deterministički i isti za
  sve korisnike. Praktična posledica: dnevni limit se resetuje u 01:00 ili
  02:00 po beogradskom vremenu, ne u ponoć.
- **`studioUsageDaily.costUsd` se puni `model.estimatedCostUsd`-om** pri
  rezervaciji - to je jedina cena poznata u tom trenutku. Stvarni trošak
  (`actualCostUsd`) donosi noćna rekonsilijacija iz B9.
- **`listMyJobs` vraća projekciju, ne cele redove** - `falRequestId` i
  `actualCostUsd` (naša stvarna fal cena, dakle marža) ne izlaze iz backend-a.
  Isti obrazac kao `credits.getTransactions` iz A2.
- **Limiti (3 paralelna, 50 dnevno) su konstante u `studioCore.ts`**, ne
  podesive u adminu. STUDIO-PLAN 4.4 kaže "podesivo u adminu", ali A9.md traži
  konkretne brojeve, a admin UI ne postoji - konfigurabilnost bez ekrana koji
  je koristi bila bi spekulativna.
- **Čista logika je u `convex/studioCore.ts`, iako A9.md imenuje samo
  `studio.ts` i `studio.test.ts`.** `rules.md` to traži kao obaveznu
  konvenciju repoa ("Čista logika ide u `convex/<ime>Core.ts`"), a formula
  cene je deo koji najviše zaslužuje da bude direktno testabilan. Testovi su
  ostali u `studio.test.ts`, kako A9.md traži.

**Testovi:** `convex/studio.test.ts`, 20 testova. Svih 8 traženih iz A9.md:
(1) nedovoljno kredita - proverena sva tri uslova plus dva dodatna: nema
`generationJobs` reda, broj `creditTransactions` redova nepromenjen i nijedan
nije `spend`, balans nepromenjen, nema `studioUsageDaily` reda, nema zakazane
akcije · (2) tri posla prolaze, četvrti baca `PREVISE_POSLOVA`, u bazi su
tačno 3 posla i skinuto je tačno 3 × 20 kredita · (3) `deepfake` u promptu
baca `NEISPRAVAN_PROMPT:ZABRANJEN_POJAM`, bez posla i bez `spend` transakcije ·
(4) isključen model i model van kataloga -> `MODEL_NEDOSTUPAN`, balans
netaknut · (5) klijent pošalje `creditCost: 1` u `params`, posao se naplati 20
iz kataloga · (6) `failJob` vrati tačno 20, posao je `refunded`, tačno jedna
`refund` transakcija · (7) `failJob` dvaput - i dalje jedna `refund`
transakcija i isti balans · (8) 50. generacija tog dana prolazi, 51. baca
`DNEVNI_LIMIT`.

Dodatno: srećan tok (polja posla, `promptHash` formata `^[0-9a-f]{16}$`,
`params` sačuvani doslovno, `studioUsageDaily` inkrementiran, zakazana tačno
jedna `submitJob` akcija sa pravim `jobId`) · posao koji predje u `done`
oslobađa mesto u limitu, a `running` ne · prazan / predugačak / nepostojeći
prompt sa svojim razlogom · video model `ceil(4.5 × 6) = 27` i
`NEISPRAVNO_TRAJANJE` bez trajanja · `markJobRunning` · dnevni limit vezan za
dan (jučerašnjih 50 ne blokira danas) · kill switch `false` blokira, `true`
pušta · neupisan i blokiran korisnik -> `NIJE_UPISAN` · neprijavljen ->
`Unauthorized` · neispravan JSON u `params` -> `NEISPRAVNI_PARAMETRI` ·
`listMyJobs` vraća samo svoje poslove, najnoviji prvi, bez `falRequestId`,
`actualCostUsd` i `userId`.

Ključna tvrdnja (atomičnost) je proverena mutacijom koda, ne samo posmatranjem
zelenog testa - videti prvu ODLUKU.

**Rezultat verifikacije:**
- `npx convex codegen` - prošlo (TypeScript bez grešaka)
- `npm run lint` - prošlo (0 grešaka; istih 7 postojećih upozorenja u
  nepovezanim fajlovima kao posle A1-A8)
- `npm run test` - prošlo (30 test fajlova, 181 test; A8 je ostavio 29 / 163:
  +20 novih u `studio.test.ts`, -2 preseljena iz `studioActions.test.ts`)
- dodatno `npx tsc --noEmit` - 14 linija, sve isti poznati problem iz A5/A8
  (`by_user` nije prepoznat kao indeks u `convex-test` tipovima unutar `t.run`
  helpera): 6 postojećih u `credits.test.ts` (fajl nije diran), 2 postojeće u
  `studioActions.test.ts`, 6 novih u `studio.test.ts` iz istog `ledger()`
  helpera prepisanog iz `credits.test.ts`. Neblokirajuće - `codegen`, `lint` i
  `vitest` svi prolaze.

**BLOKADA:** nema.

**Za Jovana ujutru:**
- Ništa nije deploy-ovano; fal nije pozvan uživo. `npx convex codegen` je
  pisao samo u `convex/_generated/`.
- **Nova tabela `platformFlags` traži seed pre nego što kill switch može da se
  koristi** (bez reda Studio radi, ali nemaš šta da ugasiš):
  ```
  npx convex run seed:seedPlatformFlags '{"syncSecret":"<WEBHOOK_SYNC_SECRET>"}'
  ```
  Gašenje/paljenje se za sada radi iz Convex dashboard-a: tabela
  `platformFlags`, red `studio_enabled`, polje `enabled`. Ponovno pokretanje
  seed-a NEĆE upaliti Studio nazad - namerno.
- **`createJob` traži aktivan `enrollments` red.** Tvoj test nalog mora da bude
  upisan bar na jedan kurs, inače dobijaš `NIJE_UPISAN`. Admin uloga NE
  zaobilazi ovu proveru.
- **Ništa u UI-ju još ne poziva `createJob`** - Playground stranica je A12.
  Ručno testiranje ide preko `npx convex run studio:createJob` uz prijavljenog
  korisnika, ili sačekaj A12.
- **Ako `FAL_KEY` nije postavljen, `createJob` će i dalje uspeti**, skinuti
  kredite i zakazati `submitJob`, koja će odmah pasti i refundirati (A8). To je
  ispravno ponašanje, ali znači da ćeš u ledgeru videti par `spend` + `refund`
  za svaki pokušaj dok ključ ne postoji.
- **`createJob` još ne prima `lessonId`/`taskId`** - kad A11 poveže izlaze sa
  lekcijama, moraće da ih doda u argumente, inače `generationJobs.taskId`
  ostaje uvek prazan.
- **Dnevni limit se resetuje po UTC-u**, dakle u 02:00 po beogradskom letnjem
  vremenu. Ako to smeta, promena je jedna funkcija (`dayKey` u
  `studioCore.ts`).


---

## A10 - fal webhook handler   (2026-08-19 03:50)

**Fajlovi:**
- `convex/falWebhook.ts` (novo) - `httpAction` + `applyWebhookResult` mutacija
- `convex/falWebhookCore.ts` (novo) - čista logika verifikacije i parsiranja
- `convex/falWebhook.test.ts` (novo) - 27 testova
- `convex/http.ts` - registrovana ruta `POST /fal/webhook`
- `convex/schema.ts` - `generationJobs.falOutputUrl` (novo opciono polje)
- `convex/studioActions.ts` - `persistOutput` stub koji webhook zakazuje

**Šta je uradjeno:** Webhook verifikuje ED25519 potpis preko JWKS-a sa
`rest.fal.ai` tačno po STUDIO-PLAN 4.3: sirovi bajtovi tela se čitaju
`request.arrayBuffer()`-om PRE bilo kakvog parsiranja, SHA-256 ide nad njima,
potpisana poruka je `requestId`, `userId`, `timestamp` i `hexSha256(rawBody)`
spojeni novim redom, potpis se hex-dekoduje a `x` iz JWKS-a base64url-dekoduje.
Verifikacija koristi Web Crypto (`crypto.subtle.importKey("raw", ...,
{ name: "Ed25519" })`) - bez nove npm zavisnosti. Tek posle verifikacije se telo
parsira, a jedna interna mutacija nalazi posao preko `by_fal_request`: nema ga
ili nije `running` -> izlazi odmah, `ERROR` -> `studio.failJob` (failed ->
refund -> refunded), `OK` -> `done` + sačuvan fal URL +
`scheduler.runAfter(0, persistOutput)`. Skidanje fajla se ne radi u handleru; on
samo verifikuje, upiše i vrati 200.

**ODLUKE:**
- **Ed25519 preko Web Crypto radi u test okruženju (`edge-runtime`), ali NIJE
  potvrdjen na živom Convex runtime-u** - to bi tražilo deploy, koji je
  zabranjen u ovom runu. Nisam upisao BLOKADU jer nema greške koju bih
  prijavio: `importKey("raw", ..., Ed25519)` i `verify` prolaze u testovima.
  Provera na dev deployment-u je stavka za ujutru (videti "Za Jovana").
- **Novo polje `generationJobs.falOutputUrl`.** A10.md traži "sačuvaj fal output
  URL", a šema iz A1 nema gde da ga smesti. Opciono polje ne traži migraciju.
  Alternativa (proslediti URL kao argument zakazanoj akciji) bi značila da URL
  ne postoji nigde u bazi ako akcija padne.
- **Lookup ide po headeru `X-Fal-Webhook-Request-Id`, ne po `request_id` iz
  tela.** Oba su potpisana (telo preko heša), ali header je direktno deo
  potpisane poruke, pa je za jedan korak bliže potpisu.
- **Mutacija je `internalMutation`, ne javna** - jedini pozivalac je
  `handleFalWebhook`, posle verifikacije. Javna bi značila da svako sa interneta
  može da označi tudji posao kao neuspeo i izazove refund.
- **ERROR grana zove postojeći `studio.failJob` umesto da ponovo piše
  failed -> refund -> refunded.** Refund logika ostaje na jednom mestu.
- **Idempotencija je dvoslojna:** `job.status !== "running"` -> izlaz odmah, a
  ispod toga `credits.refundCredits` koji je već idempotentan preko
  `by_job_type`. Prvi sloj čuva i `persistOutput` od duplog zakazivanja, drugi
  čuva novac čak i ako bi prvi otkazao.
- **JWKS nedostupan -> 500, ne 401.** 401 bi rekao "potpis je loš", a mi zapravo
  ne znamo; 500 tera fal da ponovi.
- **Validan potpis ali telo koje ne razumemo (status nije `OK` ni `ERROR`, ili
  JSON ne može da se parsira) -> 200 i posao se NE dira.** Nagadjanje ishoda je
  ili tiha kradja (lažni "done") ili tihi gubitak (lažni refund). Posao ostaje
  `running` i pokupiće ga stuck job reaper iz STUDIO-PLAN 4.4. **Taj reaper još
  ne postoji** - dok se ne napiše, ovakav posao ostaje zauvek `running` i
  zauzima jedno od 3 mesta u limitu paralelnih poslova.
- **`extractJwkPublicKeys` ne filtrira po `kty`/`crv`,** uzima svaki unos sa
  string `x` poljem. STUDIO-PLAN 4.3 kaže "bilo koji ključ iz seta koji
  verifikuje potpis"; ključ pogrešnog tipa svakako padne na `importKey` i
  preskače se. Filtriranje bi značilo da promena oblika JWKS-a kod fal-a tiho
  obori sve webhookove.
- **`extractOutputUrl` pokriva `images[0].url`, `video.url`, `audio.url`,
  `image`, `audio_file`, liste `videos`/`audios`/`audio_files` i golo `url` na
  vrhu payload-a.** Ako nijedan oblik ne prepozna, posao je i dalje `done` ali
  bez URL-a - A11 (`persistOutput`) odlučuje šta sa tim. Nisam refundirao taj
  slučaj: generacija je uspela i fal nas je već naplatio, a A10.md za `OK` traži
  baš `done`.
- **JWKS keš je običan modul-level objekat sa TTL-om od 24h, bez ponovnog
  dohvata kad verifikacija ne prodje.** Posledica: ako fal rotira ključ,
  webhookovi padaju najduže do isteka keša. Ponovni dohvat na svaki neuspeo
  potpis bi bio DoS vektor (bilo ko šalje djubre -> mi bombardujemo
  `rest.fal.ai`). Degradacija je bezbedna: poslovi ostaju `running` i reaper ih
  refundira.
- **`persistOutput` je prazan stub u `convex/studioActions.ts`**, ne u
  `falWebhook.ts` - STUDIO-PLAN 4.2 korak 4 i A11 ga smeštaju tamo, pa A11 samo
  popunjava telo.
- **Poruka greške se seče na 500 znakova** (`error` + detalji iz `payload`).
  Ceo fal payload u `generationJobs.error` bi bio red baze nepoznate veličine.
- **Čista logika je u `convex/falWebhookCore.ts`,** iako A10.md imenuje samo
  `falWebhook.ts` - `rules.md` to traži kao obaveznu konvenciju repoa. Testovi
  su ostali u `falWebhook.test.ts`, kako A10.md traži.

**Testovi:** `convex/falWebhook.test.ts`, 27 testova. Test par ED25519 ključeva
se generiše u fajlu, telo se potpisuje lokalno, a `fetch` je mockovan da vrati
JWKS sa tim javnim ključem. Set namerno sadrži 4 unosa - drugi ključ, unos sa
neispravnim `x`, RSA unos bez `x`, i tek onda pravi ključ - da bi se dokazalo da
prolazi bilo koji ključ iz seta i da neispravni unosi ne obaraju verifikaciju.

Svih 7 traženih iz A10.md: (1) neispravan potpis (potpisan ključem van seta) ->
401, posao ostaje `running`, balans nepromenjen, nula refund transakcija ·
(2) timestamp stariji od 300 s -> 401 · (3) fali `X-Fal-Webhook-Signature` ->
401 · (4) validan ERROR webhook -> posao `refunded`, tačno jedna refund
transakcija na tačan iznos, balans vraćen, ništa nije zakazano · (5) isti
validan ERROR webhook 5 puta -> i dalje tačno jedna refund transakcija i isti
balans · (6) validan OK webhook -> `done`, `falOutputUrl` sačuvan, nula
refundova, tačno jedan zakazan `persistOutput` sa pravim `jobId` ·
(7) nepoznat `request_id` -> 200, ništa se ne menja i ništa se ne zakazuje.

Dodatno: telo izmenjeno posle potpisa -> 401 (dokazuje da heš ide nad telom) ·
potpis koji nije hex -> 401 · timestamp iz budućnosti van tolerancije -> 401 ·
timestamp na 299 s prolazi · fali svaki od preostala tri headera -> 401 · posao
koji više nije `running` se ne dira · dupli OK webhook ne zakazuje
`persistOutput` dvaput i ne prepisuje URL · validan potpis sa nepoznatim
statusom -> 200 bez ikakve promene · plus 10 jediničnih testova čistih funkcija
iz `falWebhookCore.ts` (headeri, tolerancija u oba smera, oblik potpisane
poruke, hex i base64url dekodiranje, izvlačenje ključeva, parsiranje tela,
prepoznavanje URL-a za sliku/video/zvuk, sažimanje poruke greške).

Testovi su provereni mutacijom koda, ne samo posmatranjem zelenog rezultata.
Pet mutacija, svaka uhvaćena: heš nad re-serijalizovanim JSON-om umesto nad
sirovim bajtovima (7 padova) · izbačena provera timestampa (2) · izbačen uslov
`job.status !== "running"` (2) · izbačena provera nedostajućih headera (4) ·
preskočena verifikacija potpisa (2). Original: 27/27 zeleno.

**Rezultat verifikacije:**
- `npx convex codegen` - prošlo (TypeScript bez grešaka)
- `npm run lint` - prošlo (0 grešaka; istih 7 postojećih upozorenja u
  nepovezanim fajlovima kao posle A1-A9)
- `npm run test` - prošlo (31 test fajl, 208 testova; A9 je ostavio 30 / 181,
  dakle +1 fajl i +27 testova)
- dodatno `npx tsc --noEmit` - 14 linija, sve isti poznati problem iz A5/A8/A9
  (`ReturnType<typeof convexTest>` gubi šemu, pa se `withIndex` tipizira kao
  sistemski indeks): 6 u `credits.test.ts`, 6 u `studio.test.ts`, 2 u
  `studioActions.test.ts`. **Nijedna nije iz A10** - `falWebhook.test.ts`
  koristi `TestConvex<typeof schema>` iz `convex-test`, što taj problem rešava u
  korenu. Postojeća tri fajla nisam dirao (rules.md: hirurške izmene), ali ista
  jednolinijska izmena bi očistila i njih.

**BLOKADA:** nema.

**Za Jovana ujutru:**
- **Obavezno: potvrdi da Ed25519 radi na živom Convex runtime-u.** Testovi
  dokazuju samo da radi u `edge-runtime`-u koji vitest koristi. Najbrža provera,
  bez ijednog deploy-a na produkciju, je `npx convex dev` pa pozvati bilo koju
  akciju koja radi `crypto.subtle.generateKey({ name: "Ed25519" }, ...)`. Ako
  Convex to ne podržava, rešenje je `@noble/ed25519` (jedna zavisnost, bez
  native koda) - ali to je odluka koju nisam smeo da donesem sam.
- **Webhook URL koji fal gadja je
  `https://quick-yak-270.convex.site/fal/webhook`** (`.convex.site`, ne
  `.convex.cloud`). `submitJob` (A8) ga sklapa iz `CONVEX_SITE_URL`, pa ta env
  varijabla mora da postoji na deployment-u - inače posao odmah pada i
  refundira se.
- **Ruta nije deploy-ovana.** `npx convex codegen` je pisao samo u
  `convex/_generated/`. Do `npx convex dev` / deploy-a endpoint ne postoji.
- **Nova kolona `generationJobs.falOutputUrl`** - opciona, bez migracije,
  postojeći redovi je nemaju.
- **`persistOutput` je prazan stub.** Posle A10 posao stiže do `done` sa fal
  URL-om, ali fajl NIJE u Convex storage-u i `labOutputs` red ne postoji. fal
  URL-ovi žive kratko - dok A11 ne bude gotov, uspešna generacija je praktično
  nedostupna korisniku.
- **Stuck job reaper iz STUDIO-PLAN 4.4 još ne postoji**, a webhook računa na
  njega u dva slučaja: telo koje ne razumemo i JWKS koji je zaostao posle
  rotacije ključa. Bez njega takav posao ostaje `running` zauvek i troši jedno
  od 3 mesta u limitu paralelnih poslova tog korisnika.
- **Prvi pravi test kraj-do-kraja** (ako Ed25519 prodje): pusti `createJob` sa
  namerno neispravnim parametrima da fal vrati ERROR i proveri da je kredit
  vraćen tačno jednom.


---

## RV - Revizija noćnog run-a   (2026-08-19 04:10)

**Fajlovi:**
- dodato: `docs/STUDIO-NIGHT-REPORT.md`
- izmenjeno: `docs/STUDIO-PROGRESS.md` (samo ova sekcija)
- **nijedan produkcijski fajl nije diran** - RV.md izričito zabranjuje nove
  feature, pa `convex/`, `lib/` i `app/` stoje tačno kako ih je A10 ostavio

**Šta je uradjeno:** Ponovo su puštene sve tri verifikacione komande nad
zatečenim stanjem grane, pročitan je ceo `docs/STUDIO-PROGRESS.md`, ceo
`docs/STUDIO-PLAN.md` i sav novi kod (`credits.ts`, `creditsCore.ts`,
`studio.ts`, `studioCore.ts`, `studioActions.ts`, `falWebhook.ts`,
`falWebhookCore.ts`, `seed.ts`, `lib/fal.ts`, `lib/stripe.ts`,
`app/api/stripe/webhook/route.ts`). Rezultat je `docs/STUDIO-NIGHT-REPORT.md` sa
pet traženih sekcija: STANJE, RIZICI PO NOVAC (nalaz za svih 6 puteva a-f),
NEDOSLEDNOSTI (11 stavki u odnosu na plan), RUČNI KORACI ZA JOVANA (13
numerisanih, sa tačnim komandama i putanjama kroz dashboard) i ŠTA NIJE URAĐENO
(sa procenama). Pored 6 traženih rizika, nadjeno je i 5 dodatnih puteva kojima
novac curi, upisanih kao d1-d5.

**ODLUKE:**
- **Izveštaj imenuje rupe koje RV.md nije tražio.** Šest traženih puteva je
  obradjeno tačno kako je traženo, ali pri čitanju koda ispalo je još pet
  (d1-d5: tiho ćutanje webhook-a bez env-a, neprovereni `payment_status`,
  welcome bonus po pretplati umesto po korisniku, nepostojeći clawback,
  javna `applyStripeGrant` mutacija). Prećutati ih zato što nisu u listi bilo
  bi suprotno svrsi revizije.
- **Najozbiljniji nalaz nije nijedan od šest, nego kombinacija (f) i (e):**
  `createJob` ne validira `params` prema `model.paramSchema`, a `submitJob` ceo
  taj objekat prosledjuje fal-u. `num_images: 4` na `nano-banana-2` znači 20
  naplaćenih kredita za četvorostruki fal račun. Ovo je zabeleženo kao stavka
  koja blokira naplatu, ali NIJE popravljeno - RV.md kaže "ne piši nove
  feature", a ovo je izmena logike naplate, ne revizija.
- **Nijedna od nadjenih rupa nije popravljena.** Svaka bi bila izmena
  produkcijskog koda, što je van obima ovog koraka. Sve su upisane sa tačnom
  lokacijom (fajl:linija) i procenom veličine popravke, da ujutru mogu da se
  odrade redom.
- **Ocena "🟢 pokriveno" data je samo tamo gde postoji test koji tvrdnju
  obara ako se pokvari**, ne tamo gde kod izgleda ispravno. Zato (a) i (b)
  imaju dvostruku ocenu: zeleno unutar transakcije, crveno posle nje.
- **Procene rada su izražene u "promptovima"** veličine noćnih koraka, ne u
  satima - to je jedina jedinica koja se u ovom runu pokazala merljivom.
- **Datum i vreme u zaglavlju izveštaja su vreme pokretanja komandi**
  (03:53-04:10), ne vreme početka noćnog run-a.

**Testovi:** Nijedan nov test nije pisan - ovaj korak ne sme da menja kod. Svi
postojeći testovi su ponovo pušteni i pročitani (208 testova u 31 fajlu);
pokrivenost svakog od 6 rizika je u izveštaju vezana za konkretan test koji ga
brani, ili je izričito označena kao nepokrivena.

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0; `Generating TypeScript bindings... /
  Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, nepromenjeno od A1)
- `npm run test` - **prošlo** (`Test Files 31 passed (31) / Tests 208 passed
  (208) / Duration 3.92s`) - identično onome što A10 tvrdi

**BLOKADA:** nema.

**Za Jovana ujutru:**
- **Pročitaj `docs/STUDIO-NIGHT-REPORT.md` pre nego što bilo šta deploy-uješ.**
  Tamo je 13 numerisanih ručnih koraka sa tačnim komandama, i tabela od 8
  stavki koje blokiraju naplatu.
- **Tri stvari koje te koštaju prvog dana ako pustiš ovako:**
  1. `num_images` u `params` - marža je u minusu na drugoj slici (rizik f);
  2. Stripe webhook koji tiho ćuti kad fali env varijabla - novac naplaćen,
     krediti nikad dodeljeni, bez retry-ja i bez loga (rizik d1);
  3. poslovi koji zauvek vise u `running` - nema reaper-a (rizik e).
- **Jedna neproverena pretpostavka nosi ceo webhook:** Ed25519 na živom Convex
  runtime-u. Provera je 5 minuta, opisana kao ručni korak #8.
- **Welcome bonus se može farmovati** otkazivanjem i ponovnom pretplatom, a uz
  kupon od 100% i besplatno. Testni scenario koji to dokazuje je ručni korak
  #13, tačka 5.
- Ništa nije deploy-ovano, Stripe i fal nisu pozivani, nijedna env varijabla
  nije dirana. Jedina izmena van `docs/` je da je `npx convex codegen` ponovo
  dodirnuo dev deployment - to radi svaki put.

## P1 - Šest rupa po novcu iz noćne revizije   (19.08.2026 10:33-11:20)

**Fajlovi:**
- `convex/studioCore.ts` - dodato: `sanitizeParams`, `MAX_DAILY_COST_USD`,
  `exceedsDailyCostLimit`, `readParamFields` (privatna)
- `convex/studio.ts` - `createJob` sanitizuje parametre, čita dnevni limit
  troška i zove `applySpend` direktno; `markJobRunning` proverava status
- `convex/studioActions.ts` - `submitJob` izlazi bez dejstva ako posao nije
  `reserved`
- `convex/credits.ts` - `applySpend` kao obična funkcija (+ tanak omotač
  `spendCredits`), `grantCredits` proverava postojeći `welcome_bonus` lot
- `convex/creditsCore.ts` - `welcomeBonusKey(userId)`; bonus više ne visi na
  `invoice.id`
- `convex/schema.ts` - nov indeks `creditLots.by_user_source`
- `convex/seed.ts` - `RESOLUTION_BY_SLUG`; rezolucija ulazi u `defaultParams`
  skupljeg sluga i ostaje van `paramSchema`
- `app/api/stripe/webhook/route.ts` - grane koje ne mogu da upišu grant sada
  bacaju (ruta vrati 500), `payment_status` se proverava, dodati
  `async_payment_succeeded` i `async_payment_failed`
- `vitest.config.ts` - `include` prošireno sa `app/**/*.test.ts`
- Testovi: `convex/studio.test.ts` (+11), `convex/studioActions.test.ts` (+2),
  `convex/credits.test.ts` (+2), `convex/modelCatalog.test.ts` (+1),
  **nov** `app/api/stripe/webhook/route.test.ts` (8)
- **nov** `.studio-run/mutate.py` - alat za mutaciono testiranje popravki

**Šta je uradjeno:** Zatvoreno je svih šest rupa iz sekcije RIZICI PO NOVAC
noćnog izveštaja, plus otvrdnjavanje koje je izveštaj tražio. `params` sada
prolaze kroz `sanitizeParams` pre nego što se upišu u posao, pa je objekat koji
ide fal-u isti onaj po kojem je cena obračunata; `num_images: 20` se odseca na
4, nepoznat ključ tiho ispada, `aspect_ratio` van skupa se odbija. Rezolucija je
prebačena u `defaultParams` skupljeg sluga, čime jeftiniji slug više ne može da
odglumi skuplji. `submitJob` i `markJobRunning` gledaju status, pa druga predaja
ne plaća fal dvaput, a zakasneli `markJobRunning` ne može da vrati refundiran
posao u `running` - to je zid koji reaper iz P2 traži. Stripe webhook više ne
ćuti: kad ne može da upiše grant, loguje `event.id` i tip pa baca, ruta vrati
500 i Stripe ponovi (ponavljanje je bezbedno jer je grant idempotentan). Krediti
za paket idu tek kad je `payment_status === "paid"`, a odloženo plaćanje se
čeka kroz `async_payment_succeeded`. Bonus dobrodošlice visi na korisniku
(`welcome:<userId>`), pa otkaži-pa-se-pretplati petlja daje 150 kredita ukupno,
a ne po pretplati. `createJob` čita i dnevni plafon troška od 5 USD. Potrošnja
kredita je izvučena u običnu funkciju `applySpend`, pa atomičnost `createJob`-a
više ne zavisi od toga što oko poziva slučajno nema `try/catch`.

**ODLUKE:**
1. **`resolution` kao ime fal parametra ("1K"/"2K"/"4K") je pretpostavka, ne
   provereno.** Živi fal API se po pravilima dana ne poziva, a lokalno nema
   keširane šeme endpointa. Izabrano je `resolution`, i pinovano je i na
   jeftinim slugovima (`1K`), ne samo na skupim. Sigurnosna strana ne zavisi od
   imena - `sanitizeParams` izbacuje svaki `resolution` od klijenta jer nije u
   `paramSchema`. Ono što zavisi jeste da li `nano-banana-2-2k` stvarno
   isporučuje 2K; ako je ime pogrešno, klijent plaća 30 kredita za 1K sliku.
   Provera je prva stavka u "Za Jovana".
2. **Odsecanje po redu veličine važi samo za skupu stranu.** Preko `max × 10`
   se odbija (`VAN_OPSEGA:<kljuc>`), ispod `min` se samo podiže na `min`. Ispod
   minimuma nema šta da se izgubi - `num_images: 0` je prazno polje u formi, a
   ne napad na fal račun.
3. **Vrednost pogrešnog tipa na poznatom ključu tiho ispada** (posao se odradi
   sa podrazumevanom vrednošću modela), dok se `select` van skupa **odbija**.
   Odsecanje selecta na "najbližu dozvoljenu vrednost" bi tiho generisalo nešto
   što niko nije tražio, a to je gore od odbijanja.
4. **Cena se računa iz OČIŠĆENIH parametara**, ne iz sirovih. Posledica koju
   treba znati pre Faze B: model sa `costPerSecond` **mora** da izloži
   `duration` u svom `paramSchema`, inače `computeCreditCost` baca
   `NEISPRAVNO_TRAJANJE`. Postojeći test za video model je zato dobio realnu
   šemu u fiksturi; nijedna njegova tvrdnja nije promenjena ni uklonjena.
5. **Prag od 5 USD se poredi u centima** (`Math.round((a + b) * 100) > 500`) da
   `0.1 + 0.2` ne obori prag. Tačno 5,00 USD još prolazi, odbija se tek prelazak
   preko. P1 traži tvrdu grešku `DNEVNI_LIMIT_TROSKA`; plan 4.4 pominje "alarm
   na 5 $, auto-pauza na 10 $" - P1 ima prednost, pa je 5 USD zid.
6. **Ključ `welcome:<userId>` se čuva u polju `stripeInvoiceId`** iako nije
   Stripe faktura. To je postojeći mehanizam idempotencije i njegov indeks;
   uvoditi treće polje samo zbog imena bilo bi skuplje nego korisnije. Drugi
   sloj je provera po izvoru preko novog indeksa `by_user_source`, koja hvata i
   lotove otvorene starim ključem.
7. **Ruta sada hvata sve iz `switch`-a i vraća 500 sa logom**, umesto da pusti
   Next da vrati neoznačen 500. Statusni kod za pretplate na kurseve je isti kao
   pre (500 u oba slučaja), pa se postojeći flow ne menja.
8. **`async_payment_succeeded` obradjuje SAMO granu paketa.** Pretplate ostaju
   na svojim event-ovima (`customer.subscription.*`, `invoice.paid`) - dodavati
   im nov ulaz značilo bi menjati postojeći subscription flow.
9. **`vitest.config.ts` `include` prošireno sa `app/**/*.test.ts`.** Bez toga
   rupe d1 i d2 ne bi imale nijedan test - obe su ponašanje rute (200 naspram
   500), a ne čista funkcija. Obrazac mockovanja je prepisan iz
   `lib/stripe.test.ts` (`vi.mock("server-only")` + dinamički import).
10. **`spendCredits` internal mutacija je ostala** kao tanak omotač nad
    `applySpend`, jer je zovu `studioActions.test.ts` i ručni `convex run`.
11. `.studio-run/mutate.py` je zadržan (nije produkcijski kod) - P2 i dalji
    koraci imaju gotov alat za istu proveru.

**Testovi:** 24 nova (208 -> 232).
- `sanitizeParams`, 5 čistih testova: odsecanje na `min`/`max`; odbijanje van
  reda veličine i ispadanje vrednosti pogrešnog tipa; ispadanje nepoznatih
  ključeva (`resolution`, `num_inference_steps`, `image_size`); select iz skupa
  i van skupa; prazna šema propušta samo `prompt`, a šema koja nije JSON niz se
  odbija.
- `createJob`: upisuje očišćene parametre (`num_images: 20` -> 4, `resolution`
  ispao); odbija nedozvoljen select bez trošenja kredita.
- Dnevni limit troška: 4 + 2 USD odbijeno bez ijednog upisa; tačno 5 USD
  prolazi; sledeći posao istog dana odbijen; jučerašnjih 10 USD ne blokira
  danas.
- `markJobRunning`: odbija prelaz iz `refunded` (posao ostaje refundiran, bez
  `falRequestId`, balans netaknut) i drugi poziv iz `running` (prvi
  `falRequestId` preživljava).
- `submitJob`: ne zove `fetch` i ne dira posao kad je `running`, niti kad je
  `refunded` - bez drugog refunda.
- Welcome bonus: dve `subscription_create` fakture za istog korisnika daju tačno
  150 kredita i jedan lot; lot sa starim ključem `in_x:welcome` blokira nov
  bonus (provera po izvoru).
- Seed: `nano-banana-2`/`-2k` i `nano-banana-pro`/`-4k` dele endpoint, imaju
  različitu cenu i različit `resolution` u `defaultParams`, a `resolution` nije
  u `paramSchema`.
- Ruta (8): plaćena sesija dodeli tačno jedan grant sa očekivanim argumentima;
  neplaćena ne dodeli ništa; `async_payment_succeeded` dodeli;
  `async_payment_failed` ne dodeli; nedostupan Convex -> 500 uz log sa
  `event.id`; obrisan `WEBHOOK_SYNC_SECRET` -> 500; odbijen grant -> 500 sa
  porukom; pretplata na kurs i dalje ide u `syncStripeSubscription`.
- **Mutaciono testiranje (`.studio-run/mutate.py`), 13 mutacija:** 12 od 13
  obara bar jedan test. Trinaesta je namerno zelena i to je poenta
  otvrdnjavanja: `try/catch` oko `applySpend` koji **ponovo baci** ništa ne
  menja (transakcija i dalje pada u celini), dok `try/catch` koji grešku
  **proguta** obara test - dakle atomičnost je sad strukturna, a ne slučajna.

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, nijedno iz Studio koda)
- `npm run test` - **231 prošlo, 1 palo**: `convex/chat.test.ts > inbox summary
  stays exact beyond one thousand memberships` puca na `Test timed out in
  5000ms`. **To nije regresija ovog koraka** i dokazano je trima merenjima:
  (1) test pada i kad se pusti sam, bez ijednog drugog fajla; (2) pada i kad se
  nov indeks `by_user_source` privremeno ukloni iz šeme; (3) `npx vitest run
  --testTimeout=60000` nad **nepromenjenim** fajlovima daje `Test Files 32
  passed / Tests 232 passed`. Test seeduje preko 1000 članstava i traje 16-18 s
  na ovoj mašini pod opterećenjem, uz podrazumevani vitest limit od 5 s.
- `npm run build` - **prošlo** (`✓ Compiled successfully in 35.8s`,
  `Finished TypeScript in 93s`, `/api/stripe/webhook` u listi ruta)

**BLOKADA:** nema.

**Za Jovana:**
1. **Proveri ime parametra za rezoluciju pre nego što pustiš 2K/4K slugove u
   prodaju.** Jedna komanda: `genmedia schema fal-ai/nano-banana-2 --json` (i
   isto za `fal-ai/nano-banana-pro`). Ako polje nije `resolution` ili vrednosti
   nisu `1K`/`2K`/`4K`, ispravi `RESOLUTION_BY_SLUG` u `convex/seed.ts` i pusti
   seed ponovo. Do te provere `nano-banana-2-2k` (30 kr) i `nano-banana-pro-4k`
   (65 kr) možda naplaćuju više nego što isporučuju. Eksploatacija u obrnutom
   smeru (jeftin slug, skupa rezolucija) je zatvorena bez obzira na ime
   parametra.
2. **Seed mora da se pusti ponovo** da bi `defaultParams` dobili rezoluciju:
   `npm run convex:seed` (ili `seedModelCatalog` mutacija). Bez toga katalog u
   bazi ostaje bez `resolution`.
3. **Nov indeks `creditLots.by_user_source`** ulazi u bazu prvim deploy-em.
   Aditivan je, bez migracije.
4. **Stripe mora da šalje i `checkout.session.async_payment_succeeded` i
   `checkout.session.async_payment_failed`** na webhook endpoint. Ako u Stripe
   dashboard-u nisu čekirani, odložena plaćanja (SEPA, bank transfer) nikad
   neće dobiti kredite - a sa novim `payment_status` uslovom se više ne
   dodeljuju unapred. Ovo je jedina stavka koja može da "zaustavi" kredite koji
   su ranije (pogrešno) stizali odmah.
5. **Webhook od sada vraća 500 kad fali `NEXT_PUBLIC_CONVEX_URL` ili
   `WEBHOOK_SYNC_SECRET`.** To je namerno - Stripe ponavlja i ništa se ne gubi -
   ali znači da će ti u Stripe logovima crveneti dok god env nije kompletan.
   Proveri obe varijable u Vercel produkciji **pre** prvog plaćanja.
6. Korisnici koji su bonus dobrodošlice već dobili po starom ključu
   (`in_x:welcome`) neće dobiti nov - drugi sloj u `grantCredits` ih prepoznaje
   po izvoru lota, i to je pokriveno testom.
7. `convex/chat.test.ts` ima test koji na opterećenoj mašini prekorači
   podrazumevanih 5 s (16-18 s stvarno). Nije diran jer nema veze sa ovim
   korakom; ako smeta u CI-ju, rešenje je timeout na tom jednom testu.

## P2 - Cronovi: reaper, istek kredita, istek fajlova   (19.08.2026 11:22-11:45)

**Fajlovi:**
- **nov** `convex/crons.ts` - `reapStuckJobs`, `expireCredits`,
  `expireGenerationFiles` + tri registracije na `cronJobs()`
- `convex/credits.ts` - nova obična funkcija `applyLotExpiry(ctx, lot, now)`
- **nov** `convex/crons.test.ts` - 13 testova
- `.studio-run/mutate.py` - dodate mutacije 14-21 za ovaj korak

**Šta je uradjeno:** Zatvorena je rupa (e) iz noćne revizije - najveća otvorena
stavka Faze A. `reapStuckJobs` ide na svakih 15 minuta preko indeksa
`by_status_created`, koji je od A1 stajao napravljen i neupotrebljen: `running`
stariji od 30 minuta i `reserved` stariji od 5 minuta idu u
`internal.studio.failJob` sa porukom `ISTEKAO_BEZ_ODGOVORA`, a `failJob` već
vozi ceo niz failed -> refund -> refunded. Time se posao koji visi ne samo
refundira nego i oslobađa jedno od 3 mesta u limitu paralelnih poslova, pa
korisnik sa tri zaglavljena posla više ne ostaje trajno bez Studija.
`expireCredits` jednom dnevno gasi lotove kojima je istekao rok: `remaining` na
0, `exhaustedAt`, red tipa `expiry` sa negativnim iznosom **i** keširan balans
manji za isti iznos - taj poslednji korak je ono što drži invarijantu iz
`credits.test.ts`. `expireGenerationFiles` jednom dnevno briše fajl iz
storage-a, prazni `outputStorageId`/`posterStorageId`, a **red ostavlja**, jer
metapodatak (prompt, model, cena) nosi "Generiši ponovo" iz PLAN 0.2. Nad
praznim skupom ne radi ništa - `expiresAt` popunjava `persistOutput`, koji je
još stub.

**ODLUKE:**
1. **Prag za `reserved` je 5 minuta, za `running` 30.** Zadatak imenuje oba.
   Obrazloženje razlike stoji u kodu: `running` čeka fal webhook (30 min je
   iznad najsporijeg modela iz kataloga), dok `reserved` čeka samo `submitJob`
   zakazan na 0 ms - posle 5 minuta u tom stanju akcija sigurno nije odradila do
   kraja.
2. **Granica od 100 poslova je budžet ZA CEO PROLAZ, deljen izmedju oba
   statusa**, a ne 100 po statusu. Konzervativnije: prolaz je jedna transakcija,
   pa gornja granica upisa mora da bude jedna.
3. **Refund jednog posla je u `try/catch`, i to je ovde ispravno.** Ugnježden
   `ctx.runMutation` je podtransakcija (guidelines:99): ako jedan posao pukne
   (jedini realan put je `NEMA_TROSKA_ZA_REFUND`), njegovi upisi se povuku sami,
   greška se loguje, a ostali poslovi iz prolaza prolaze. Bez toga bi jedan
   pokvaren red zauvek obarao ceo reaper - a reaper koji ne radi je tačno stanje
   zbog kojeg postoji. Ovo je suprotno od `createJob`-a, gde `try/catch` oko
   potrošnje razvaljuje atomičnost; razlika je što tamo posao i potrošnja moraju
   da padnu zajedno, a ovde poslovi jedni s drugima nemaju veze.
4. **Termini dnevnih prolaza su 03:15 i 03:45 UTC** (`crons.cron`). Zadatak kaže
   samo "jednom dnevno". Izabrano je mrtvo doba i razmak od 30 minuta, da dva
   dnevna prolaza ne udaraju u isti minut.
5. **`expireCredits` odbacuje već ugašene lotove `filter`-om pre `take`-a.**
   `by_expiry` nema `remaining` u sebi, pa bi bez toga posle prve godine prolaz
   trošio ceo budžet od 100 na lotove koji su odavno na nuli i nikad ne bi
   stigao do novih. Mutacija 18 to dokazuje.
6. **`applyLotExpiry` NE povećava `lifetimeSpent`.** Istekli krediti nisu
   potrošeni nego propali; kad bi ulazili u `spent`, statistika potrošnje u
   UI-ju bi lagala naviše.
7. **Istek kredita ne šalje email 30 dana ranije** (PLAN D5 to traži). Van je
   obima ovog zadatka - zadatak imenuje tačno tri crona. Ostaje za Fazu D.
8. **`expireGenerationFiles` ima donju granicu `gt("expiresAt", 0)`.** Poslovi
   bez `expiresAt` stoje u indeksu ispod svakog broja, pa bi ih čist `lte(now)`
   sve pokupio i obrisao fajlove poslova koji nisu ni istekli. Danas je to skoro
   ceo skup, jer `persistOutput` još ne popunjava rok. Mutacija 19 to dokazuje.
9. **Poster se briše zajedno sa fajlom.** Polje se ionako prazni, pa bi blob bez
   ijedne reference u bazi ostao zauvek naplativ.
10. **Nema testa za granicu od 100 po prolazu.** Seedovanje 101 posla (svaki sa
    korisnikom, grantom i potrošnjom) traje duže od podrazumevanog vitest limita
    od 5 s, a `convex/chat.test.ts` već pokazuje šta takav test radi u suite-u.
    Konstanta je trivijalna i vidljiva; test bi koštao više nego što nosi.

**Testovi:** 13 novih (232 -> 245), sve u `convex/crons.test.ts`.
- Reaper (5): `running` star 31 min -> `refunded`, `error` je
  `ISTEKAO_BEZ_ODGOVORA`, tačno jedna refund transakcija, balans vraćen na 100;
  star 29 min se ne dira; `reserved` star 6 min se refundira dok star 4 minuta
  ne; posao u `done` star 24 h se ne dira; dva prolaza -> jedan refund.
- Istek kredita (4): lot istekao juče se gasi, balans padne sa 500 na 200,
  `expiry` red ima iznos -300 i `balanceAfter` 200; nezastareo lot preživi dva
  prolaza; već ugašen lot se ne gasi drugi put; invarijanta posle prolaza -
  balans === `usableBalance` lotova === zbir svih transakcija.
- Istek fajlova (4): prazan skup vraća `{cleared: 0}` i ne puca; posao bez
  `expiresAt` se ne dira; istekao fajl i poster nestaju iz storage-a
  (`getUrl` -> `null`) dok red, `modelSlug`, `creditCost` i `params` ostaju;
  fajl kojem rok tek ističe preživi, drugi prolaz nema šta da briše.
- **Mutaciono testiranje (`.studio-run/mutate.py 14`..`21`), 8 mutacija, svih 8
  obara bar jedan test:** reaper bez provere starosti (2 pada), prag `reserved`
  pomeren na 60 min, istek koji ne smanjuje keširan balans (3 pada, medju njima
  invarijanta), istek koji ne gasi lot, istek bez preskakanja ugašenih lotova,
  istek fajlova bez donje granice, poster koji ostaje u storage-u, i brisanje
  celog reda umesto polja. Radno stablo je posle svake mutacije vraćeno.

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške;
  `internal.crons` je u `convex/_generated/api.d.ts`)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, nijedno iz Studio koda)
- `npm run test` - **244 prošlo, 1 palo**: i dalje samo
  `convex/chat.test.ts > inbox summary stays exact beyond one thousand
  memberships` na `Test timed out in 5000ms`. Nije regresija ovog koraka - isti
  test je pao i pre njega (opisano u P1), a `npx vitest run
  --testTimeout=60000` nad zatečenim stanjem daje `Test Files 33 passed /
  Tests 245 passed`. `convex/crons.test.ts` sam traje 0,3 s.
- `npm run build` - **nije pokrenut**: korak ne dodaje nijednu stranicu ni
  komponentu, samo Convex funkcije, koje `codegen` već tipski proverava
  (pravilo iz `rules-day.md`).

**BLOKADA:** nema.

**Za Jovana:**
1. **Tri crona ulaze u raspored prvim `npx convex deploy`-em** i od tog trenutka
   rade sami. Proveri ih u Convex dashboard-u pod "Schedules": "studio:
   zaglavljeni poslovi" (svakih 15 min), "studio: istek kredita" (03:15 UTC),
   "studio: istek fajlova" (03:45 UTC). Convex cron vreme je UTC, ne lokalno.
2. **Prvi prolaz reaper-a na dev deployment-u može da refundira poslove koji su
   tamo zaostali iz noćnog testiranja.** To je i namera, ali znaj da će brojevi
   kredita na dev nalozima da skoče.
3. **`expireGenerationFiles` do P3 ne radi ništa** jer `persistOutput` ne
   popunjava `expiresAt`. Kad P3 to popuni, prvi noćni prolaz počinje da briše
   fajlove - proveri tada da retencioni rokovi (30 dana video / 90 ostalo iz
   PLAN 0.2) stvarno stoje u `expiresAt`, jer cron veruje tom polju bez pitanja.
4. **Poruka `ISTEKAO_BEZ_ODGOVORA` je namerno drugačija od svake fal greške.**
   Kad je vidiš u podršci, znači da odgovor nikad nije stigao - a ne da je model
   odbio posao. UI iz narednih koraka treba da je prevede korisniku.
5. Kad reaper počne da radi na produkciji, njegov broj (`reaped` u logu poziva)
   je najbolji rani signal da nešto nije u redu sa fal webhook-om - naročito
   scenario rotacije JWKS ključa iz rizika (e).

## P3 - persistOutput: izlaz u Convex storage i veza sa lekcijom   (19.08.2026 11:47-12:05)

**Fajlovi:**
- `convex/studioActions.ts` - `persistOutput` više nije stub: skida fajl sa
  fal-a, stavlja ga u storage i predaje upis `studio.finalizeOutput`-u
- `convex/studio.ts` - `createJob` prima opcione `lessonId`/`taskId` i proverava
  ih; nove interne mutacije `finalizeOutput` i `markOutputFailed`
- `convex/studioCore.ts` - `OUTPUT_RETENTION_DAYS`, `outputExpiresAt`,
  `OUTPUT_TITLE_MAX_LENGTH`, `outputTitle`
- `convex/lab.ts` - minimalna izmena po planu A11: `assertLessonAccess` je sada
  izvezena, a telo `markTaskProgress`-a je izvučeno u `applyTaskCompletion`
  (sama mutacija je posle provera samo poziva)
- `convex/crons.ts` - ispravljen komentar koji je tvrdio da je `persistOutput`
  stub
- Testovi: `convex/studioActions.test.ts` (+11), `convex/studio.test.ts` (+4)
- `.studio-run/mutate.py` - dodate mutacije 22-30 za ovaj korak

**Šta je uradjeno:** Zatvorena je stavka A11, jedina u kojoj je korisnik plaćao
nešto do čega ne može da dodje. `persistOutput` sada uzima `falOutputUrl`
(koji kod fal-a živi kratko), skida fajl, stavlja ga u Convex storage i u jednoj
transakciji (`studio.finalizeOutput`) upisuje `outputStorageId` i `expiresAt` -
30 dana za video, 90 za sliku i zvuk, po STUDIO-PLAN 0.2. Time i
`crons.expireGenerationFiles` iz P2 prvi put dobija skup nad kojim radi. Ako
posao nosi kontekst lekcije, upisuje se i `labOutputs` red (`status: "ready"`,
naslov = prvih 60 znakova prompta, MIME tip i veličina iz samog blob-a), posao
dobija `labOutputId`, a zadatak se zeleni kroz istu funkciju koju zove i ručno
štikliranje u lekciji - dakle isti leaderboard dogadjaj i ista profilna
aktivnost, bez paralelnog puta. Da bi ta veza uopšte mogla da postoji,
`createJob` sada prima `lessonId` i `taskId` i proverava ih istim putem kao
`lab.saveLabOutput` (`assertLessonAccess`), pa upis u Studio ne otvara vrata ka
tudjem kursu. Neuspelo preuzimanje **ne refundira**: generacija jeste uspela i
fal je jeste naplatio, pa posao ostaje `done` sa porukom `IZLAZ_NIJE_SACUVAN:`
u `error` polju.

**ODLUKE:**
1. **Posao bez lekcije NE dobija `labOutputs` red.** `labOutputs.courseId` i
   `.lessonId` su u šemi obavezna polja, a ceo `lab` sloj (indeks
   `by_user_lesson`, provera `output.lessonId !== task.lessonId` u
   `markTaskProgress`, `getLessonLab`) na tome stoji. Praviti ih opcionim samo
   da bi obična Studio generacija imala red značilo bi dirati tabelu od koje
   zavisi postojeći lab - najmanje konzervativna moguća opcija. Obična
   generacija zato živi samo u `generationJobs`, gde ima `outputStorageId`,
   `expiresAt`, prompt i model; galerija (P6) čita odatle. Zadatak (tačka 5)
   traži red bezuslovno, ali šema to fizički ne dozvoljava, pa je izabrano
   ograničenje šeme.
2. **Poster frame za video se NE pravi** (izričito po zadatku - u Convex akciji
   nema ffmpeg-a). Umesto toga galerija u P6 koristi
   `<video preload="metadata" src="...#t=0.1">`: browser povuče samo zaglavlje
   i prikaže prvi kadar. `posterStorageId` ostaje u šemi neiskorišćen, a
   `crons.expireGenerationFiles` ga već briše ako se ikad popuni.
3. **`taskId` bez `lessonId` se odbija** (`ZADATAK_BEZ_LEKCIJE`) umesto da se
   lekcija izvede iz zadatka. Klijent koji šalje pola konteksta greši, a tiho
   dopunjavanje bi značilo da izlaz sleti u lekciju koju pozivalac nije imenovao.
4. **Kontekst lekcije se proverava u `createJob`, ne u `persistOutput`.**
   Provera prava traži prijavljenog korisnika; `persistOutput` ga nema (zakazuje
   je webhook). Zato se u trenutku rezervacije proverava sve, a interna mutacija
   veruje onome što je već upisano na posao.
5. **`finalizeOutput` vraća `false` kad nema šta da upiše, a akcija tada briše
   fajl koji je upravo stavila u storage.** Dve akcije u letu (fal ponavlja
   webhook do 31 put) inače ostavljaju blob bez ijedne reference u bazi, a njega
   ne bi obrisao nijedan cron - `expireGenerationFiles` ide po `generationJobs`.
6. **Poruka greške je jedna (`IZLAZ_NIJE_SACUVAN:`) za ceo put** - i za pad
   `fetch`-a, i za ne-2xx odgovor, i za pad upisa. Sve troje su za korisnika
   ista stvar ("uspelo je, ali fajl nije kod nas"), a `markOutputFailed` ne
   upisuje ništa ako je posao u medjuvremenu dobio fajl.
7. **`mimeType` se ne izmišlja.** Prazan `blob.type` znači "ne znam", pa polje
   (opciono u šemi) ostaje neupisano umesto da se pogodi po vrsti modela.
8. **`markTaskProgress` je izvučen, ne kopiran.** `applyTaskCompletion` u
   `lab.ts` sadrži telo koje je i ranije bilo tu, bez ijedne izmenjene tvrdnje;
   javna mutacija radi provere prava pa zove nju, a `finalizeOutput` je zove
   direktno. Plan A11 izričito predvidja "minimalnu izmenu" `lab.ts`-a.
9. **Zadatak se štiklira samo ako je nastao `labOutputs` red.** Bez dokaza
   (`evidenceOutputId`) zeleni zadatak bio bi tvrdnja bez pokrića.

**Testovi:** 15 novih (245 -> 260).
- `studioActions.test.ts` (11): fajl završi u storage-u a posao ostane `done` sa
  rokom od 90 dana; video dobija 30, ne 90; posao iz lekcije dobija `labOutputs`
  red sa naslovom, MIME tipom, veličinom, `courseId`/`lessonId`/`taskId` i
  uzajamnom vezom `job.labOutputId` <-> `output.storageId`; naslov je odsečen na
  60 znakova; obavezan zadatak se zeleni sam, sa izlazom kao dokazom i tačno
  jednim aktivnim leaderboard dogadjajem; posao bez lekcije nema `labOutputs`
  red ali ima fajl; dva poziva daju jedan `fetch`, jedan storage fajl, jedan
  `labOutputs` red i isti `expiresAt`; `finalizeOutput` odbija drugi fajl za
  isti posao (`false` -> pozivalac ga briše); pad `fetch`-a ne refundira i ne
  ostavlja ni rok ni izlaz ni napredak na zadatku; ne-2xx odgovor upisuje status
  u grešku bez refunda; posao koji nije `done` i posao bez izlaznog URL-a se ne
  diraju.
- `studio.test.ts` (4): `createJob` upisuje `lessonId`/`taskId`; odbija zadatak
  iz druge lekcije bez ijednog upisa; odbija `taskId` bez `lessonId`; odbija
  lekciju iz kursa koji korisnik ne sme da otvori.
- **Mutaciono testiranje (`.studio-run/mutate.py 22`..`30`), 9 mutacija, svih 9
  obara bar jedan test:** `persistOutput` bez provere postojećeg fajla i bez
  provere statusa, refund umesto `markOutputFailed`, ne-2xx tretiran kao uspeh,
  video sa retencijom slike, naslov bez odsecanja, `finalizeOutput` koji ne
  zeleni zadatak, `createJob` bez provere pripadnosti zadatka lekciji i bez
  upisa konteksta. Radno stablo je posle svake mutacije vraćeno.

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, nijedno iz Studio koda)
- `npm run test` - **259 prošlo, 1 palo**: isti zatečeni
  `convex/chat.test.ts > inbox summary stays exact beyond one thousand
  memberships`, `Test timed out in 5000ms`. Nije regresija ovog koraka:
  `npx vitest run --testTimeout=60000` nad istim stablom daje
  `Test Files 33 passed / Tests 260 passed`. Isti nalaz je zapisan i u P1.
- `npm run build` - **prošlo** (`✓ Compiled successfully in 11.8s`,
  `Finished TypeScript in 35.2s`, 51/51 statičkih stranica). Korak ne dodaje
  stranice, ali build je pušten jer se menja potpis `api.studio.createJob`.

**BLOKADA:** nema.

**Za Jovana:**
1. **`crons.expireGenerationFiles` briše fajl i prazni `outputStorageId` na
   poslu, ali NE dira `labOutputs.storageId`.** Do danas je to bilo bez
   posledica jer `labOutputs` redova iz Studija nije ni bilo; od sada, kad
   izlazu iz lekcije istekne rok (90 odnosno 30 dana), red u lekciji ostaje sa
   `storageId` koji više nema fajl - `ctx.storage.getUrl` tada vraća `null` i
   output pane je prazan bez objašnjenja. Nije popravljeno ovde jer je to kod
   koraka P2 i van je opisa ovog zadatka. Popravka je mala (isprazniti i
   `labOutputs.storageId`, ili tamo upisati `status: "failed"`), ali je odluka
   proizvodna: da li istekli izlaz u lekciji treba da nestane ili da ostane sa
   porukom "fajl je istekao, generiši ponovo".
2. **`listMyJobs` ne vraća URL fajla**, samo `outputStorageId`. Galerija iz P6
   mora da dobije ili `storage.getUrl` u query-ju ili zaseban query - to je
   posao tog koraka, ne propust ovog.
3. **Prvi pravi test celog lanca traži živ fal webhook.** Sve gore je pokriveno
   mock-ovanim `fetch`-om; ono što mock ne dokazuje je da fal izlazni URL služi
   bez autentikacije i bez redirekcije. Ako fal vrati 3xx, `fetch` ga u Convex
   akciji prati sam, ali ako traži `Authorization`, posao će završiti kao `done`
   sa `IZLAZ_NIJE_SACUVAN: fal je vratio 401...`. Prva stvarna generacija posle
   deploy-a to pokazuje odmah - pogledaj `error` polje.
4. **Poruka `IZLAZ_NIJE_SACUVAN:` znači "plaćeno, uspelo, ali fajl nije kod
   nas".** Refunda nema namerno. Ako se pojavi masovno, to je naš problem, ne
   korisnikov, i tada je ručni `admin_grant` ispravan odgovor - ne menjanje
   pravila o refundu.
5. **Nijedno novo polje ni indeks nije dodato u šemu** - `lessonId`, `taskId`,
   `labOutputId`, `outputStorageId` i `expiresAt` su stajali od A1 i tek sad se
   popunjavaju. Migracija nije potrebna.

## P4 - Mock provajder za fal (dok FAL_KEY ne postoji)   (19.08.2026 12:07-12:20)

**Fajlovi:**
- `convex/studioActions.ts` - `submitJob` grana ka mock-u; nova
  `completeMockJob` (internal action)
- `convex/studioCore.ts` - `mockJobSucceeds`, `mockOutputDataUrl`
- `convex/studioActions.test.ts` - zamenjen 1 zastareo test, 7 novih
- `convex/studio.test.ts` - 2 nova testa (pure funkcije mock provajdera)
- `.studio-run/mutate.py` - dodate mutacije 31-35 za ovaj korak

**Šta je uradjeno:** Bez `FAL_KEY` (ili sa `STUDIO_MOCK=1` postavljenim
izričito) `submitJob` više ne baca - umesto poziva `submitToFal` odmah zove
`studio.markJobRunning` sa `falRequestId = "mock-" + jobId` i zakazuje
`completeMockJob` na 3 sekunde. `completeMockJob` odlučuje ishod
deterministički iz `jobId`-a (FNV-1a hash mod 100 < 85 -> uspeh, inače
neuspeh - nikad `Math.random()`) i ishod pušta kroz ISTU internu mutaciju kao
pravi fal webhook, `falWebhook.applyWebhookResult`: uspeh nosi generisan SVG
`data:` URL (prompt ispisan preko pozadine čija je boja izvedena iz
`promptHash`) i posle toga se `persistOutput` zakazuje kao i inače; neuspeh
ide kao `ERROR` webhook, dakle `studio.failJob` -> refund. Mock ne dodaje
nijednu novu granu u ledger - ide kroz iste mutacije (`markJobRunning`,
`applyWebhookResult`, `failJob`, `refundCredits`) koje već postoje i koje već
imaju svoju idempotenciju, tako da je ovo demo provajdera, ne demo ledgera.

**ODLUKE:**
1. **Uslov za mock je `!apiKey || process.env.STUDIO_MOCK === "1"`** - odsustvo
   ključa je SAMO PO SEBI dovoljno (bez obzira na `STUDIO_MOCK`), a
   `STUDIO_MOCK=1` je eksplicitan override koji radi i kad ključ postoji
   (ručno testiranje mocka na okruženju koje inače ima pravi `FAL_KEY`).
   Nijedna druga vrednost `STUDIO_MOCK`-a (`"0"`, prazan string) ne aktivira
   mock kad ključ postoji - pokriveno testom.
2. **Ishod se ne odlučuje unutar `completeMockJob` ručnim `if/else` upisom u
   bazu, nego pozivom `falWebhook.applyWebhookResult`.** Zadatak to traži
   doslovno ("isti put kao pravi webhook") i to je jedini način da mock
   nasledi celu postojeću idempotenciju (`job.status !== "running"`) i
   refund-put bez ijedne nove linije u `credits.ts` ili `falWebhook.ts`.
3. **`completeMockJob` ipak ima sopstvenu stražu**
   (`job.status !== "running" || !falRequestId?.startsWith("mock-")`), iako bi
   `applyWebhookResult`-ova sopstvena provera i sama sprečila štetu. Razlog:
   bez prefiksne provere, `completeMockJob` bi (npr. greškom pozvan ručno) mogao
   da simulira ishod nad PRAVIM `running` poslom čiji je `falRequestId` stigao
   od fal-a - to bi bio lažan uspeh/neuspeh nad poslom koji pravi fal još
   obrađuje. Pokriveno testom.
4. **Cena/kredit tok se ne dira nigde.** `createJob` i dalje jedini menja
   ledger na ulazu; mock samo bira KOJIM putem se zatvara `running` posao
   (uspeh ili refund), tačno kao pravi fal webhook.
5. **SVG se gradi ručno (template string), bez ijedne nove zavisnosti**, kako
   zadatak i traži ("bez mrežnog poziva, bez zavisnosti, radi offline"). Boja
   je `hsl` izveden iz prve 2 bajta `promptHash`-a (već postoji na poslu, ne
   računa se ponovo), a prompt je odsečen na 80 znakova i XML-escape-ovan
   (`&`, `<`, `>`) da ne pokvari SVG kad prompt sadrži te znakove. Prazan
   prompt pada na "DEMO" umesto praznog teksta.
6. **Data URL kao izlaz oslanja se na to da `fetch()` u `persistOutput`
   ume da pročita `data:` URL bez mreže.** Ovo NIJE provereno na živom Convex
   V8 runtime-u (isti rizik kao Ed25519 u A10) - lokalna Node.js provera
   (`fetch('data:text/plain;base64,...')`) radi, ali Convex izolat je drugi
   runtime. Ako ne radi, mock posao završava kao `done` sa
   `IZLAZ_NIJE_SACUVAN: ...` umesto sa fajlom u storage-u - i dalje nema
   izgubljenih kredita (nema refunda za taj slučaj, tačno kao za pravi fal),
   samo demo slika ne bi bila vidljiva. Provera je stavka #1 u "Za Jovana".
7. **Stari test "submitJob baca jasnu grešku... kad FAL_KEY fali" je ZAMENJEN,
   ne obrisan bez zamene.** Ponašanje koje je taj test proveravao (bacanje
   greške i refund kad ključa nema) je NAMERNO ukinuto ovim zadatkom - to je
   suština P4.md-a. Zadržavanje starog testa bi značilo da suite ne može
   nikad da prođe zeleno dok mock postoji, što nije "čuvar", nego kontradikcija
   sa sopstvenim zadatkom. Nova verzija proverava novo, specificirano
   ponašanje (mock se aktivira, ništa se ne baca).
8. **`listMyJobs` NIJE dopunjen `isMock`/DEMO poljem.** Zadatak eksplicitno
   kaže da DEMO oznaka na kartici ide u UI koracima P5-P7, ne u ovom. Danas
   `falRequestId` uopšte ne izlazi iz `listMyJobs`-a (namerno, po A9/A11
   komentaru "korisniku ne trebaju"), pa P5-P7 mora ili da doda računsko polje
   (`isMock: falRequestId?.startsWith("mock-")`) ili da vrati sam prefiks -
   ovo NIJE odradjeno ovde jer dirati javni oblik query-ja bez UI koji ga
   koristi nije bio deo zadatka (konzervativna opcija - manji dijara).
9. **`STUDIO_MOCK` je dodat u isti save/restore obrazac u testovima**
   kao `FAL_KEY`/`CONVEX_SITE_URL` (postojao je rizik da test koji ga postavi
   procuri u sledeći test u istom fajlu, pošto ga niko ranije nije dirao).

**Testovi:** 9 novih (net +8 posle uklanjanja 1 zastarelog; 260 -> 268).
- `submitJob` ide u mock kad `FAL_KEY` fali: bez mrežnog poziva, `running` sa
  `mock-<jobId>` falRequestId-jem, i sa `completeMockJob` stvarno zakazanim
  (provereno preko `_scheduled_functions` sistemske tabele, isti obrazac kao
  postojeći test u `studio.test.ts`).
- `STUDIO_MOCK=1` aktivira mock i kad `FAL_KEY` postoji.
- `FAL_KEY` postoji i `STUDIO_MOCK` nije `"1"` -> ide na pravi fal (regresioni
  čuvar da override ne postane podrazumevano ponašanje).
- `completeMockJob` uspeh: `done`, `falOutputUrl` je `data:image/svg+xml...`,
  bez refunda, `persistOutput` zakazan (isti put kao pravi webhook).
- `completeMockJob` neuspeh: `refunded`, greška počinje sa `MOCK_NEUSPEH`,
  refund tačno jednom (drugi poziv ne menja balans).
- `completeMockJob` ne dira posao čiji `falRequestId` nije mock (bez prefiksa).
- `mockJobSucceeds`: determinizam (isti `jobId` -> isti ishod, 5 ponavljanja) i
  statistika (2000 sintetičkih ID-jeva, stopa uspeha izmedju 80% i 90%).
- `mockOutputDataUrl`: ispravan `data:` prefiks, sadrži prompt, isti ulaz daje
  isti izlaz (determinizam), prazan prompt pada na "DEMO".

Pošto oba nova ishoda (`completeMockJob` uspeh/neuspeh) zavise od hash-a
stvarnog `jobId`-a koji Convex sam dodeljuje, testovi za oba ishoda traže par
poslova pretragom (`seedMockJobPair`, do 50 pokušaja dok se ne nadje po jedan
od svake vrste) umesto da hardkoduju očekivani ishod - izbor je bio ili to,
ili testirati `applyWebhookResult` direktno bez `completeMockJob`-a u putanji,
što ne bi dokazalo samo ožičenje.

**Mutaciono testiranje (`.studio-run/mutate.py 31`..`35`), 5 mutacija, svih 5
obara bar jedan test:** mock se ne aktivira kad `FAL_KEY` fali (ostavljen samo
`STUDIO_MOCK` uslov) · `STUDIO_MOCK=1` override izbačen · `falRequestId` bez
`mock-` prefiksa · `completeMockJob` bez provere prefiksa (dirao bi i pravi
posao) · stopa uspeha promenjena sa 85% na 50%. Radno stablo je posle svake
mutacije vraćeno (potvrdjeno `grep` na oba fajla posle pokretanja).

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez
  greške; `internal.studioActions.completeMockJob` je u
  `convex/_generated/api.d.ts`)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja, nijedno iz Studio koda)
- `npm run test` - **268 prošlo, sve zeleno** na podrazumevanom timeout-u ovog
  puta (`convex/chat.test.ts` test koji ranije trebao 60s timeout ovog puta
  nije okinuo prag od 5s - mašina trenutno manje opterećena; isti nalaz kao u
  P1-P3 da taj test nema veze sa Studio kodom i dodatno potvrdjen sa
  `npx vitest run --testTimeout=60000` - 33/33 fajlova, 268/268 testova)
- `npm run build` - **nije pokrenut**: korak ne dodaje nijednu stranicu ni
  komponentu (isto obrazloženje kao P2, po pravilu iz `rules-day.md`)

**BLOKADA:** nema.

**Za Jovana:**
1. **Proveri da `fetch()` u Convex akciji stvarno ume da pročita `data:` URL**
   pre nego što se osloniš na mock demo u pravom `npx convex dev`-u bez
   `FAL_KEY`-a. Jedna komanda kroz Convex dashboard -> Functions -> Run (ili
   privremena akcija): `await fetch("data:text/plain;base64,aGVsbG8=").then(r
   => r.text())` treba da vrati `"hello"`. Ako baci, mock uspeh i dalje ne gubi
   kredite (ista `IZLAZ_NIJE_SACUVAN` grana kao za pravi fal), samo demo slika
   neće stići u galeriju - videćeš to u `error` polju posla.
2. **`STUDIO_MOCK=1`** je ručni prekidač: postavi ga u `.env.local` (ili
   `npx convex env set STUDIO_MOCK 1` na dev deploymentu) da testiraš mock
   putanju i posle što upišeš pravi `FAL_KEY`. Ukloni ga da se vrati pravi fal.
3. **Mock posao traje tačno 3 sekunde** (`MOCK_JOB_DELAY_MS`) pre nego što se
   javi ishod - to je namerno kratko da se demo ne oseća sporo, ne pokušaj da
   iz toga zaključiš stvarno trajanje fal generacije.
4. **UI (P5-P7) mora sam da otkrije mock posao.** `listMyJobs` danas ne vraća
   `falRequestId` korisniku (namerna odluka od ranije - videti ODLUKU 8 gore).
   Kad budeš pisao galeriju/karticu posla, ili dodaj računsko `isMock` polje u
   `listMyJobs` (najjednostavnije), ili odluči da `falRequestId` sme da izađe.
   Bez toga DEMO oznaka iz zadatka ("da se generacija iz mocka nikad ne pomeša
   sa pravom") nema odakle da se pročita na klijentu.
5. Poruka greške za mock neuspeh je uvek `MOCK_NEUSPEH: demo posao je namerno
   neuspeo (deterministički po jobId-u, ~15% poslova)` - lako se razlikuje od
   svake prave fal greške u podršci/logovima.

## P5 - Stranica kredita i ruta za pretplatu na plan   (19.08.2026 12:20-12:40)

**Fajlovi:**
- **nov** `app/[locale]/app/credits/page.tsx` - server ruta, `generateMetadata`,
  fallback kad `NEXT_PUBLIC_CONVEX_URL` fali
- **nov** `components/app/credits-page.tsx` - `"use client"` deo (balans,
  paketi, Premium kartica, istorija, `CheckoutAction` dugme)
- **nov** `lib/credits-value.ts` - čiste funkcije: referentna cena po vrsti
  modela, vrednost paketa, poređenje Premium/paket, lotovi pred istek,
  formatiranje cene i naziva transakcija
- **nov** `lib/credits-value.test.ts` - 21 test
- **nov** `app/api/stripe/plan/route.ts` - checkout za pretplatu na plan
- **nov** `app/api/stripe/plan/route.test.ts` - 13 testova

**Šta je uradjeno:** `/api/stripe/credits` je od noćnog run-a radila bez ijednog
pozivaoca; sada je poziva `/{locale}/app/credits`. Stranica ima balans velikim
fontom uz "≈ N generacija slika", red o kreditima koji ističu u narednih 30
dana, pakete iz `creditPacks:listPacks` (samo `kind: "pack"`) sa cenom, brojem
kredita, bonus značkom i redom "otprilike: 25 slika", istaknutu Premium karticu
i paginiranu istoriju iz `credits:getTransactions`. Sve što se prikazuje ide
kroz Convex `useQuery`, dakle balans skoči sam kad webhook upiše lot - nema
`setInterval` ni refresh-a. Uz to je napisana `app/api/stripe/plan/route.ts`,
koja je jedini put do `createPlanCheckoutSession` (funkcija je od A5 stajala
napisana i testirana, ali bez rute Premium se nije mogao kupiti nikako). Ruta je
prepisana po obrascu iz `/api/stripe/credits`: isti redosled provera (auth ->
email -> katalog -> `stripePriceId`), isti kodovi grešaka i isto 503/500
razdvajanje za nedostajuću Stripe env varijablu.

**ODLUKE:**
1. **Broj slika/klipova se računa iz kataloga, ne prepisuje iz plana.**
   Referenca po vrsti modela je onaj sa badge-om `preporuceno`, a kad ga nema -
   najjeftiniji. Nad seedovanim katalogom to daje tačno brojeve iz tabele 2.4
   (`Starter 500 kr = 25 slika / 9 klipova`, `Creator 1650 = 82 / 30`,
   `Pro 4800 = 240 / 87`), a poštuje pravilo 2.5 da cena nikad ne stoji u kodu.
2. **Referenca se računa nad UKLJUČENIM modelima**, jer `listModels` vraća samo
   njih. Danas su svi video modeli `isEnabled: false` (Faza B), pa red glasi
   "otprilike: 25 slika" - stranica ne obećava video koji Studio još ne ume da
   napravi. Čim Jovan uključi prvi video model, red sam postane "25 slika ili 9
   video klipova", bez izmene koda.
3. **"Isti novac u paketu daje 1650 kredita" se izvodi, ne kuca.**
   `bestPackCreditsWithin(packs, premium.priceEurCents)` uzme najviše kredita
   među paketima koji staju u cenu Premiuma; nad seedom je to Creator = 1650,
   tačno rečenica iz D.1. Ako nijedan paket ne staje u tu cenu, rečenica se
   izostavlja umesto da laže.
4. **Potrošnja NE linkuje na galeriju.** Zadatak traži link, ali galerija (A13)
   ne postoji - `app/[locale]/app/studio` nema nijedan fajl, pa bi link bio
   zajemčen 404. Red potrošnje zato nosi tekst "generacija u Studiju" i komentar
   na tačnom mestu u `credits-page.tsx`; kad galerija stigne, tu se dodaje
   `<Link>` i ništa drugo se ne menja. 404 je vidljiv kvar, tekst je zabeležena
   nedostajuća veza.
5. **Lotovi pred istek se grupišu po danu isteka, jedan red po danu.** Sabiranje
   svih u jedan red bi uz kasniji lot ispisalo raniji datum - a upozorenje je
   isključivo zbog datuma i napisano. Grupisanje ide po UTC danu.
6. **Ruta za plan traži `courseId` i staje ako ga nema.** `createPlanCheckoutSession`
   ga zahteva, a `syncSubscription` u webhook-u bez `courseId` ne upiše ništa
   (`app/api/stripe/webhook/route.ts:41`) - bez te provere bi pretplata bila
   naplaćena, a plan nikad dodeljen. Kurs se uzima iz `body.courseSlug`, uz
   `courses[0].slug` kao podrazumevan, isto kao u `/api/stripe/checkout`.
7. **Paket bez `stripePriceId` daje ugašeno dugme "Uskoro", ne grešku.** Isto i
   za Premium. Jovan ih još nije povezao u Stripe-u i stranica zbog toga ne sme
   da puca; ruta i dalje odbija takav slug sa `MISSING_STRIPE_PRICE` ako neko
   pozove API direktno.
8. **Sidebar nije diran.** Stranica se za sada otvara samo direktnim URL-om
   `/sr/app/credits`. Nav stavka u `app-sidebar.tsx` bi tražila tri izmene na tri
   mesta (desktop meni, mobilni grid `grid-cols-2/3`, kompaktni meni) u fajlu od
   1800+ linija koji nema veze sa ovim zadatkom - to ide uz Studio navigaciju u
   sledećem koraku. Stavka je u "Za Jovana".
9. **"Sad" je zamrznut na prvom renderu** (`useState(() => Date.now())`, obrazac
   iz `components/app/chat/chat-inbox.tsx`). ESLint pravilo `react-hooks/purity`
   zabranjuje `Date.now()` u telu komponente, a prozor od 30 dana ne traži živ
   sat.
10. **Radiusi:** kartice su postojeći `Panel` primitiv (16px), ugnježdeni paneli
    i paketi `surface-inset`, značke i dugmad `rounded-full` (isto što
    `LinkButton` iz `components/ui/primitives.tsx` već koristi). Nula
    `rounded-*!` i nula inline `borderRadius` - provereno grep-om nad oba nova
    fajla, i potvrđeno u build izlazu da se `surface-inset` kompajlira u
    `border-radius:12px`.
11. **Prazna stanja koja stranica pokriva:** balans 0 (tekst + dugme ka
    paketima), nijedan aktivan paket u katalogu, nijedna transakcija ("Još nisi
    kupio kredite" + strelica ka paketima gore), neprijavljen korisnik, i
    `NEXT_PUBLIC_CONVEX_URL` koji fali.

**Testovi:** 34 nova (268 -> 302).
- `lib/credits-value.test.ts` (21): referenca bira `preporuceno` a ne
  najjeftiniji; bez badge-a pada na najjeftiniji; vrsta bez modela nema
  referencu; model sa cenom 0 se ignoriše; `unitsFor` seče naniže i ne deli
  nulom; vrednost paketa se poklapa sa sva tri reda iz tabele 2.4; bilingvalna
  varijanta; video se ne pominje dok nijedan video model nije uključen; prazan
  katalog i premalo kredita ne daju red; srpska množina za 1/3/11/22/25 slika,
  1/2/9 klipova i generacije; `bestPackCreditsWithin` daje 1650 za Premium novac,
  ne računa planove i vraća `null` kad ništa ne staje; istek unutar 30 dana se
  prijavljuje a dalji ne, isti dan se spaja, različiti dani se sortiraju, prazan
  i istekao lot ispadaju; formatiranje cene po lokalu; znak iznosa; sr/en naziv
  za svih 7 tipova transakcije.
- `app/api/stripe/plan/route.test.ts` (13): uspešan checkout prosleđuje tačne
  argumente uključujući `courseId` iz Convexa; bez `planSlug`-a nema sesije;
  401 `AUTH_REQUIRED`; 403 `EMAIL_VERIFICATION_REQUIRED`; 404 za nepostojeći i za
  ugašen plan; 400 `NOT_A_PLAN` kad se paket kredita pokuša naplatiti kao
  pretplata; 400 `MISSING_STRIPE_PRICE`; 400 `COURSE_NOT_AVAILABLE`; nedostupan
  Convex se ponaša kao neprijavljen korisnik; 503 za nedostajuću Stripe env
  varijablu i 500 za ostale greške; eksplicitan `courseSlug` stiže i do Convex
  upita i do Stripe-a.
- Svaki test rute tvrdi i da `createPlanCheckoutSession` **nije** pozvan na
  odbijenoj putanji - inače bi provera prošla a Stripe sesija svejedno nastala.

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, nijedno iz Studio koda)
- `npm run test` - **prošlo** (`Test Files 35 passed (35) / Tests 302 passed
  (302)`; `convex/chat.test.ts` ovaj put nije prekoračio timeout)
- `npm run build` - **prošlo** (`✓ Compiled successfully in 5.5s`,
  `Finished TypeScript in 10.6s`; u listi ruta stoje i
  `ƒ /[locale]/app/credits` i `ƒ /api/stripe/plan`)
- Dodatno, dimni test nad `npm run start`: `/sr/app/credits` i
  `/api/stripe/plan` odgovaraju 307 ka `/login` bez sesije - isto što radi i
  postojeća `/api/stripe/credits`, dakle ruta postoji i ista je zaštita.

**BLOKADA:** nema.

**Za Jovana:**
1. **Stranica još nije u navigaciji.** Otvara se na `/sr/app/credits` (i
   `/en/app/credits`). Nav stavka je namerno ostavljena za korak koji dodaje
   Studio u sidebar - vidi ODLUKU 8. Do tada je proveri direktnim URL-om.
2. **Dok `stripePriceId` nije upisan u `creditPacks`, sva dugmad stoje na
   "Uskoro".** To je ručni korak #3 i #4 iz `docs/STUDIO-NIGHT-REPORT.md`
   (Stripe cene + upis u Convex Data). Čim upišeš cene, dugmad se sama pale -
   `listPacks` je pretplata.
3. **Premium ide kroz `mode: "subscription"`, dakle njegova Stripe cena mora da
   bude *Recurring*, mesečna.** One-time cena će biti odbijena od Stripe-a, a
   ruta to ne može da proveri unapred.
4. **Pretplata na plan se i dalje vezuje za kurs.** Ruta bez `courseSlug`-a
   koristi `courses[0].slug` (`video-audio-ai`) i traži taj kurs u Convexu. Ako
   ga tamo nema, checkout staje sa `COURSE_NOT_AVAILABLE` umesto da naplati
   pretplatu koju webhook ne ume da upiše.
5. **Ručni korak 9 iz noćnog izveštaja i dalje važi** (isključi "Customers can
   switch plans" u Stripe Customer Portalu). Nova ruta upisuje `planSlug` u
   metapodatke pretplate isto kao ranije, pa je i posledica ista.
6. **Provera koju vredi uraditi kad seeduješ cene:** kupi Starter, pa gledaj
   balans na `/sr/app/credits` **bez refresh-a** - broj mora da skoči sam kad
   Stripe webhook prođe. Ako ne skoči, problem je u webhook-u, ne u stranici.
7. Red "otprilike: 25 slika" neće pominjati video dok ne uključiš bar jedan
   video model u `modelCatalog` (svi su danas `isEnabled: false`). To je
   namerno - vidi ODLUKU 2.

## P6 - Playground `/[locale]/app/studio`   (19.08.2026 12:37-13:00)

**Fajlovi:**
- **nov** `app/[locale]/app/studio/page.tsx` - server ruta, `generateMetadata`,
  fallback kad `NEXT_PUBLIC_CONVEX_URL` fali
- **nov** `components/app/studio-page.tsx` - `"use client"` playground (izbor
  modela, forma iz `paramSchema`, dugme sa cenom, panel rezultata, pločice)
- **nov** `lib/studio-form.ts` - čiste funkcije: šema -> polja forme, početne
  vrednosti, objekat za `createJob`, mapa grešaka, tekstovi statusa
- **nov** `lib/studio-form.test.ts` - 42 testa
- `convex/studio.ts` - `listMyJobs` dobija `outputUrl` i `isMock`; nov query
  `getStudioState`
- `convex/studioCore.ts` - `MOCK_REQUEST_PREFIX` i `isMockRequestId` (preseljeno
  iz `studioActions.ts`, koji ih sad uvozi)
- `convex/studioActions.ts` - uvozi prefiks umesto svog lokalnog
- `convex/studio.test.ts` - 12 novih testova
- `.studio-run/mutate.py` - dodate mutacije 36-49

**Šta je uradjeno:** `createJob` je do jutros imao nula pozivalaca - jedini put
do posla bio je `npx convex run`. Sad postoji ekran. Levo je izbor modela iz
`listModels({ kind: "image" })` sa cenom u `rounded-full` znački na svakoj
kartici i badge-om `preporučeno`/`skupo` gde ga ima; ispod je forma koja se
gradi iz `model.paramSchema` (textarea sa brojačem, select za odnos stranica,
number sa min/max), pa dugme koje uvek nosi cenu ("Generiši - 20 kr"). Desno je
rezultat: najnoviji posao veliko, skeleton dok je `reserved`/`running`, slika
kad je `done`, poruka i "krediti su ti vraćeni" kad je `refunded`, i ispod
poslednjih 6 generacija kao pločice sa DEMO značkom na mock poslovima. Sve ide
preko `useQuery`, dakle bez ijednog `setInterval`; balans u zaglavlju je
pretplata i padne sam čim `createJob` skine kredite. Backend je dopunjen tačno
onim što je UI tražio, a što su P3 i P4 ostavili u "Za Jovana": `listMyJobs`
sad vraća potpisan URL fajla i računsko polje `isMock`, a nov `getStudioState`
vraća kill switch, upis na kurs i broj poslova u letu - iz istog indeksa i po
istoj granici po kojoj `createJob` odbija četvrti posao.

**ODLUKE:**
1. **"Video i zvuk prikaži zasivljeno" pročitano je kao prekidač VRSTE, ne kao
   lista isključenih modela.** Zadatak u istoj rečenici fiksira upit na
   `listModels({ kind: "image" })`, koji video i audio redove uopšte ne vraća.
   Alternativa bi bila proširiti `listModels` opcijom `includeDisabled`, čime bi
   `falEndpoint` i nabavna cena neobjavljenih modela izašli klijentu bez potrebe.
   Zato stoje tri pilule - "Slika" aktivna, "Video" i "Zvuk" ugašene sa "Uskoro".
   Ništa nije sakriveno, a backend nije proširen zbog dekoracije.
2. **`STUDIO_PAUZIRAN` zamenjuje LEVU kolonu, ne ceo ekran.** Zadatak kaže "ceo
   panel zamenjen porukom". Panel koji generiše jeste levi; rezultati desno su
   korisnikovi već plaćeni fajlovi i nema razloga da nestanu zato što je Studio
   privremeno stao. Konzervativnije je ne skloniti nešto što je korisnik platio.
3. **Dodat je i četvrti "prazan" ekran koji zadatak ne nabraja: neupisan
   korisnik.** `createJob` baca `NIJE_UPISAN`, pa bi bez toga jedini put do te
   informacije bio klik na dugme. `getStudioState.isEnrolled` to kaže unapred.
4. **`PROMPT_MAX_LENGTH = 2000` je namerno DUPLIRAN u `lib/studio-form.ts`**
   umesto uvezen iz `convex/creditsCore.ts`. Uvoz bi u klijentski bundle povukao
   modul čiji je najveći deo `BLOCKED_TERMS` - lista zabranjenih pojmova, koja
   nema šta da radi u pregledaču. Protivotrov za razilaženje je test koji uvozi
   OBE vrednosti i tvrdi da su jednake, plus mutacija 42.
5. **Dugme je ugašeno dok je prompt prazan**, uz rečenicu ispod ("Napiši prompt
   da bi dugme proradilo"). Poslati prazan prompt pa dobiti `PRAZAN_PROMPT` je
   krug kroz server ni za šta; poruka za taj kod svejedno postoji, jer prompt od
   samih razmaka i dalje može da stigne do servera.
6. **Engleska varijanta dugmeta je "Generate - 20 cr", ne "20 kr".** "kr" je
   skraćenica za "kredita"; u engleskom tekstu bi se čitala kao kruna. Cena
   (broj) je u obe varijante ista i uvek iz kataloga.
7. **Forma se remontira na promenu modela (`key={model.slug}`), a prompt živi
   iznad nje.** Podešavanja jednog modela ne smeju da procure u drugi (drugi
   model može da nema `num_images`), ali prompt koji je korisnik otkucao ne sme
   da nestane zato što je probao drugi model. Bez ijednog `useEffect`-a.
8. **Izabran model se ne drži u stanju dok korisnik ne klikne**: podrazumevani
   je onaj sa badge-om `preporučeno`, pa prvi iz kataloga. Time katalog ostaje
   jedini izvor podrazumevane vrednosti i ne treba efekat da je postavi kad
   `useQuery` stigne.
9. **"Istekao fajl" se prepoznaje po kombinaciji polja (`done` + `expiresAt` +
   bez URL-a), ne poredjenjem sa satom.** `crons.expireGenerationFiles` briše
   `outputStorageId` a `expiresAt` ostavlja, pa je stanje vidljivo iz podataka;
   uz to `Date.now()` u telu komponente pada na ESLint pravilu
   `react-hooks/purity`.
10. **Sidebar nije diran** - iz istog razloga i sa istim ishodom kao ODLUKA 8
    koraka P5. P6.md ne pominje navigaciju, a `app-sidebar.tsx` ima 1927 linija i
    tri odvojena renderovanja menija. `/sr/app/studio` i `/sr/app/credits` se za
    sada otvaraju direktnim URL-om. Ovo je prva stavka u "Za Jovana".
11. **`MOCK_REQUEST_PREFIX` je preseljen u `studioCore.ts`.** `studio.ts` je
    query/mutation modul i ne treba da uvlači akcioni modul (sa `lib/fal`
    zavisnostima) samo zbog jednog stringa. Ponašanje `studioActions.ts`-a se ne
    menja - isti string, isti pozivi.
12. **Slike se renderuju `next/image` sa `unoptimized`**, isto kao
    `course-player.tsx` i `dashboard-content.tsx`. Sirov `<img>` bi dodao nova
    ESLint upozorenja (`no-img-element`), a optimizacija potpisanog Convex URL-a
    nema smisla.
13. **Prompt se posle uspesne generacije NE brise.** Sledeci klik je skoro uvek
    ista ideja sa sitnom izmenom, a dokaz da je posao primljen vec stoji desno
    (nov posao na vrhu, skeleton). Brisanje bi znacilo prekucavanje.
14. **"Preuzmi" otvara nov tab (`target="_blank"`).** Convex storage je druga
    adresa, pa atribut `download` sam po sebi ne primorava snimanje; bez novog
    taba bi klik odveo korisnika sa playgrounda na sliku.

**Testovi:** 53 nova (302 -> 355).
- `lib/studio-form.test.ts` (42): granica prompta jednaka serverskoj; šema seed-a
  daje tačno tri kontrole sa tačnim granicama i opcijama; polje nepoznatog tipa i
  `select` bez opcija se ne renderuju; šema koja nije JSON niz daje praznu formu
  umesto pada; `maxLength` iz šeme ne sme preko 2000, a sme ispod; prompt postoji
  i kad ga šema ne pominje; početne vrednosti iz `defaultParams` sa odsecanjem na
  granice, sa padom na prvu opciju za nepoznat select i sa ispadanjem ključa van
  šeme (`resolution`); `buildJobParams` odseca broj, izbacuje select van skupa,
  ne pravi `NaN` iz praznog polja i ne propušta nepoznat ključ; **round-trip
  test: sve što forma pošalje `sanitizeParams` vrati NEPROMENJENO** (i za obične i
  za ivične vrednosti) - to je tvrdnja "klijent ne nudi ono što će server odbiti";
  svih 11 kodova greške ima svoju poruku, nijedna ne sadrži sirov kod, sve su
  medjusobno različite, `DNEVNI_LIMIT_TROSKA` se ne čita kao `DNEVNI_LIMIT`, tri
  razloga prompta se razlikuju, nepoznata greška daje ljudsku rečenicu, sr i en
  se razlikuju; `refunded` uvek pominje vraćene kredite; istekao fajl se razlikuje
  od posla koji tek preuzima i od posla koji nije uspeo.
- `convex/studio.test.ts` (12): `listMyJobs` vraća potpisan URL kad fajl postoji
  i `null` kad ne postoji; označava mock posao a pravi ne, i pri tom
  `falRequestId` i `actualCostUsd` i dalje ne izlaze iz backend-a; vraća samo
  svoje poslove; `getStudioState` na srećnom toku; čita kill switch isto kao
  `createJob` (u istom testu se tvrdi i da mutacija baca `STUDIO_PAUZIRAN`); broji
  poslove u letu do iste granice na kojoj `createJob` odbija četvrti; broji i
  `running`, ne samo `reserved`; završen posao se više ne broji; neupisan korisnik
  se prijavi pre klika (uz tvrdnju da mutacija baca `NIJE_UPISAN`); neprijavljenom
  ne odgovara.
- **Mutaciono testiranje (`.studio-run/mutate.py 36`..`49`), 14 mutacija.**
  Prvi prolaz: 13/14 obara test, **mutacija 40 je preživela** - `activeJobs:
  reserved.length` (bez `running`) nije oborio nijedan test, jer su u testovima
  sva tri posla stajala u `reserved`. To je bila prava rupa u testu, ne u kodu:
  dodat je test koji posao prebaci u `running` i tvrdi da se i dalje broji. Posle
  toga **14/14 obara bar jedan test**. Radno stablo je posle svake mutacije
  vraćeno (potvrdjeno grep-om nad `convex/studio.ts` i `lib/studio-form.ts`).

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške;
  `api.studio.getStudioState` je u `convex/_generated/api.d.ts`)
- `npm run lint` - **prošlo** (`7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, nijedno iz Studio koda)
- `npm run test` - **prošlo** (`Test Files 36 passed (36) / Tests 355 passed
  (355)`; `convex/chat.test.ts` ovaj put nije prekoračio timeout)
- `npm run build` - **prošlo** (`Compiled successfully in 6.2s`,
  `Finished TypeScript in 10.5s`; `/[locale]/app/studio` je u listi ruta)
- Radiusi provereni grep-om nad oba nova UI fajla: 8x `rounded-full`,
  7x `surface-inset`, 2x `surface-media`, nula `rounded-[...]`, nula `rounded-*!`,
  nula inline `borderRadius`. Sva tri tiera potvrdjena u build CSS izlazu
  (`border-radius:8px`, `:12px`, `:16px`). Nula `setInterval`/`setTimeout`.
- Dimni test nad `npm run start`: `/sr/app/studio` i `/en/app/studio` vraćaju
  307 ka `/{locale}/sign-in?next=...`, isto kao `/sr/app/credits` - ruta postoji
  i pod istom je zaštitom.

**BLOKADA:** nema.

**Za Jovana:**
1. **Ni Studio ni Krediti još nisu u sidebar-u.** Otvaraju se na `/sr/app/studio`
   i `/sr/app/credits` (i `/en/...`). Nijedan od šest dnevnih zadataka ne traži
   navigaciju, a `app-sidebar.tsx` ima 1927 linija i tri odvojena menija
   (desktop, mobilni grid, kompaktni) - to je zaseban zadatak, ne uzgredna
   izmena. **Ovo je jedina stavka koja stoji izmedju gotovog Studija i korisnika
   koji ume da ga nadje.**
2. **Prvi klik proveri sa mock provajderom, pre nego što upišeš `FAL_KEY`.** Bez
   ključa `submitJob` ide u mock (P4), pa ceo lanac radi offline: klikni
   "Generiši", posao ode u `running`, posle 3 sekunde stigne demo SVG i pločica
   dobije DEMO značku. Ako slika ne stigne a posao ostane `done` sa
   `IZLAZ_NIJE_SACUVAN:` u `error` polju, to je tačno ona `data:` URL provera iz
   P4 stavke 1 - `fetch()` u Convex akciji ne ume da pročita `data:` URL.
3. **Seed mora da se pusti** da bi katalog uopšte imao modele
   (`npm run convex:seed`). Bez toga levi panel piše "Nijedan model trenutno
   nije uključen", što je tačno ali beskorisno.
4. **Cene na karticama i na dugmetu dolaze iz `modelCatalog.creditCost`.**
   Nijedan broj nije prekucan u UI. Kad promeniš cenu preko `setModelCost`,
   dugme se promeni samo - `listModels` je pretplata.
5. **Kill switch se sad vidi i u UI-ju.** `platformFlags` red `studio_enabled`
   na `false` zamenjuje levi panel porukom, a rezultati ostaju vidljivi. Query
   `getStudioState` čita isti red kao `createJob`, pa ekran i server ne mogu da
   tvrde suprotno.
6. **Balans u zaglavlju vodi na `/app/credits` i pada sam** čim `createJob` skine
   kredite - proveri to bez refresh-a pri prvoj generaciji. Ako ne padne, problem
   je u ledgeru, ne u stranici.
7. **Napomena iz P3 stavke 1 i dalje važi** i sad se vidi na ekranu: kad izlazu
   iz lekcije istekne rok, `labOutputs.storageId` ostaje da pokazuje na obrisan
   fajl. U Studio galeriji je taj slučaj pokriven (pločica piše "isteklo"), u
   output pane-u lekcije nije - to je i dalje otvorena proizvodna odluka.
8. **Video i zvuk stoje kao ugašene pilule sa "Uskoro".** Kad u Fazi B uključiš
   prvi video model, pilula se NE pali sama - `MODEL_KINDS` u
   `components/app/studio-page.tsx` ima `available: false`, i tada se menja
   zajedno sa formom za video (`duration` polje, cena po sekundi).

## P7 - Galerija `/[locale]/app/studio/gallery`   (19.08.2026 13:05-13:20)

**Fajlovi:**
- **nov** `app/[locale]/app/studio/gallery/page.tsx` - server ruta, `generateMetadata`,
  isti fallback obrazac kao `/app/studio` i `/app/credits`
- **nov** `components/app/studio-gallery-page.tsx` - `"use client"` galerija
  (filteri, mreža kartica, izbor za preuzimanje, brisanje)
- **nov** `lib/studio-gallery.ts` - čiste funkcije: opseg datuma, značka isteka,
  poruke grešaka brisanja, filter-oznake
- **nov** `lib/studio-gallery.test.ts` - 15 testova
- `convex/studio.ts` - `listMyJobs` dobija opcione filtere (`kind`, `modelSlug`,
  `createdAfter`); nova mutacija `deleteJob`
- `convex/studio.test.ts` - 7 novih testova
- `components/app/studio-page.tsx` - čita `?model=`/`?prompt=` iz URL-a
  (`useSearchParams`) da bi "Generiši ponovo" iz galerije predpopunio formu
- `.studio-run/mutate.py` - dodate mutacije 50-55 za ovaj korak

**Šta je uradjeno:** `listMyJobs` iz P6 je već vraćao potpisan URL i `isMock`,
pa je galerija uglavnom novi sloj oko postojećeg query-ja. Mreža kartica (1-4
kolone po širini ekrana) čita `studio.listMyJobs` sa `usePaginatedQuery` i
dugmetom "Učitaj još" (isti obrazac kao istorija na `/app/credits`). Svaka
kartica pokazuje sliku (ili video sa `preload="metadata"` i `#t=0.1`
fragmentom - nikad pun `<video src>` u mreži), model, cenu u kreditima, datum,
značku "ističe za N dana" kad je manje od 7 dana do isteka, i tri akcije:
Preuzmi (postojeći URL, nov tab), Generiši ponovo (link na playground sa
`?model=&prompt=` - `studio-page.tsx` sad čita ta dva parametra i njima
predpuni izbor modela i prompt), i Obriši (nova `studio.deleteJob` mutacija,
sa inline "Sigurno?" potvrdom po kartici, bez modala). Fajl kome je istekla
retencija (`crons.expireGenerationFiles` iz P2) prikazuje prompt i dugme
"Generiši ponovo - N kr" umesto slike - istek je prilika, ne rupa (STUDIO-PLAN
0.2). Filteri (tip, model, opseg datuma) su jedan red `rounded-full` čipova
iznad mreže i idu direktno u `listMyJobs` kao argumenti; menjanje filtera samo
restartuje `usePaginatedQuery` (ugradjeno ponašanje Convex-a kad se argumenti
promene). "Preuzmi izabrano" radi preko čekboksova na kartici i sekvencijalnog
otvaranja u novim tabovima (vidi ODLUKU 5).

**ODLUKE:**
1. **Filteri idu kroz `.filter()` posle `by_user` indeksa, ne kroz nov
   indeks.** `generationJobs` nema kombinovan indeks za (userId, kind/model/
   datum), a `guidelines.md` izričito dozvoljava `.filter()` za predikate koje
   indeks ne izražava. Tabela raste po korisniku (max 3 u letu, 50/dan), pa
   dodatni indeks nije opravdan za ovaj obim.
2. **`createdAfter` dolazi kao argument, ne računa se u query-ju.** Query nikad
   ne sme da čita sat (`guidelines.md`); klijent šalje zamrznut `Date.now()` iz
   `useState(() => Date.now())`, isti obrazac kao `credits-page.tsx`.
3. **`deleteJob` odbija posao koji je `reserved`/`running` (`POSAO_U_TOKU`).**
   Takav posao ima ili zakazanu akciju ili živ fal zahtev; brisanje reda ispod
   njih bi ostavilo `submitJob`/webhook bez posla za `by_fal_request` pretragu.
4. **`deleteJob` odbija posao povezan sa lekcijom (`POSAO_POVEZAN_SA_LEKCIJOM`),
   kad `job.labOutputId` postoji.** `finalizeOutput` (P3) upisuje ISTI
   `storageId` i na posao i na `labOutputs` red - brisanje fajla iz galerije bi
   pokvarilo dokaz već zeleng zadatka u lekciji (`taskProgress.evidenceOutputId`
   bi pokazivao na obrisan fajl). Ovo nije u P7.md eksplicitno, ali je
   najkonzervativnija opcija po pravilima dnevnog run-a - obična generacija se
   briše slobodno, generacija-dokaz ne. Klijent ne zna unapred da li je posao
   vezan za lekciju (`listMyJobs` ne vraća `labOutputId`), pa dugme "Obriši"
   uvek postoji i server je taj koji odbija; poruka objašnjava zašto.
5. **ZIP (`fflate`) je preskočen; "Preuzmi izabrano" otvara svaki fajl u novom
   tabu, sekvencijalno.** `fflate` nije zavisnost ovog repoa. Postojeće
   pojedinačno dugme "Preuzmi" (P6) već koristi `target="_blank"` umesto
   `download` atributa jer je Convex storage druga adresa i `download` ne
   primorava snimanje van istog porekla - ista ograničenja bi važila i za ZIP
   (trebalo bi prvo fetch-ovati sve fajlove u browser, pa ih spakovati). Ovo je
   ODLUKA iz `rules-day.md` ("ako ti se fflate čini kao previše, uradi
   sekvencijalno preuzimanje") - `window.open` se zove sinhrono za sve izabrane
   fajlove unutar istog klika (ne kroz `setTimeout` petlju), da ostane u istom
   "user activation" prozoru i da ga browser ne tretira kao popup spam.
   Nekoliko desetina istovremenih tabova je i dalje realan rizik da ih browser
   blokira - ako se to pokaže kao problem u praksi, sledeći korak je `fflate`.
6. **`useSearchParams()` u `studio-page.tsx`, bez `Suspense` omotača.**
   Dokumentacija (`node_modules/next/dist/docs`) traži `Suspense` samo kad
   stranica pokušava statičko renderovanje; `npm run build` već pokazuje da je
   `/[locale]/app/studio` (kao i `/app/credits`) `ƒ` (dinamička ruta), pa
   `Suspense` ovde ništa ne bi promenio - potvrdjeno postojećim `useSearchParams`
   pozivima bez `Suspense`-a u `course-player.tsx`, `chat-inbox.tsx` i drugima.
7. **Regenerate link ne proverava da li model iz linka postoji u trenutnom
   katalogu.** `studio-page.tsx` već pada na podrazumevani model
   (`preporuceno` pa prvi) kad `selectedSlug` ne pogodi nijedan učitan model -
   isto ponašanje kao kad korisnik ručno izabere model koji admin u medjuvremenu
   ugasi. Prompt se svejedno prenosi.
8. **Model-filter čipovi dolaze iz `modelCatalog.listModels({})` (svi
   UKLJUČENI modeli), ne iz modela koji se pojavljuju u učitanoj strani
   poslova.** Tako je lista stabilna i ne skače dok se stranice učitavaju;
   cena je da model koji je admin u medjuvremenu ugasio nestane iz filtera iako
   korisnik ima staru generaciju na njemu - ta generacija i dalje postoji u
   mreži (kartica čita `job.modelSlug` direktno, filter samo bira ULAZNI
   parametar upita), samo joj čip za filtriranje nestaje.
9. **Nema posebnog "izaberi sve" dugmeta.** P7.md traži samo čekboksove i
   dugme za preuzimanje izabranog; "izaberi sve" bi bio dodatak van onoga što
   je traženo (Simplicity First). "Očisti izbor" je zadržano jer je trivijalno
   i sprečava zaboravljenu selekciju da ostane preko promene filtera.
10. **Radiusi:** kartice `surface-card`, media unutar kartice `surface-media`,
    traka "Preuzmi izabrano" `surface-inset`, sve značke/čipovi/dugmad
    `rounded-full`. Provereno grep-om: 0 `rounded-[...]`, 0 `rounded-*!`, 0
    inline `borderRadius`, 0 `setInterval`/`setTimeout`.

**Testovi:** 15 novih (370 ukupno; P6 je ostavio 355), 10 u
`lib/studio-gallery.test.ts` i 5 u `convex/studio.test.ts`.
- `lib/studio-gallery.test.ts` (10): `dateRangeCutoff` za sva tri presetа;
  `expiryBadgeDays` vraća `null` bez fajla, bez roka, kad je rok već prošao i
  kad je 7+ dana do isteka, a broj dana (zaokružen naviše) kad je manje od 7;
  `expiryBadgeText` posebna poruka za "danas", jednina za 1 dan, množina za
  ostalo, oba jezika; `regenerateButtonLabel` nosi cenu u oba jezika;
  `isDownloadable` samo sa `outputUrl`; `deleteJobErrorMessage` prepoznaje oba
  koda i pada na opštu poruku, oba jezika.
- `convex/studio.test.ts` (5): `listMyJobs` filtrira po `kind`, po `modelSlug`
  i po `createdAfter` pojedinačno i kombinovano; `deleteJob` briše posao i
  njegov fajl iz storage-a; odbija posao u `reserved` i u `running`; odbija
  posao povezan sa `labOutputId` (dokaz zadatka); odbija tudji i nepostojeći
  posao.
- **Mutaciono testiranje (`.studio-run/mutate.py 50`..`55`), 6 mutacija, svih 6
  obara bar jedan test:** `deleteJob` bez provere `labOutputId`, bez provere
  statusa u letu, bez provere vlasništva; `listMyJobs` koji ignoriše `kind` i
  koji ignoriše `createdAfter`; `expiryBadgeDays` koji prijavljuje već istekao
  fajl. Radno stablo potvrdjeno čisto posle svake mutacije (`git diff --stat`
  i grep na oba pogodjena imenovana koda).

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške;
  `api.studio.deleteJob` je u `convex/_generated/api.d.ts`)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, nijedno iz Studio koda)
- `npm run test` - **prošlo** (`Test Files 37 passed (37) / Tests 370 passed
  (370)`)
- `npm run build` - **prošlo** (`✓ Compiled successfully`, `Finished
  TypeScript...`; `/[locale]/app/studio/gallery` je u listi ruta, označena `ƒ`)

**BLOKADA:** nema.

**Za Jovana:**
1. **Ni Galerija nije u sidebar-u** - isti razlog kao Studio i Krediti u P5/P6
   (`app-sidebar.tsx` je van obima svakog UI koraka danas). Otvara se na
   `/sr/app/studio/gallery` i `/en/app/studio/gallery`, i sad je i jedini
   način da se stigne do nje link "Nazad u Studio"/"Otvori Studio" u samoj
   galeriji plus URL koji "Generiši ponovo" gradi.
2. **"Preuzmi izabrano" otvara po jedan tab za svaki izabrani fajl.** Ako
   izabereš puno stavki odjednom, browser može da upozori ili blokira deo
   tabova (popup zaštita) - to je poznato ograničenje ove implementacije, ne
   bug. Ako se u praksi pokaže kao problem, sledeći korak je da se doda
   `fflate` i fajlovi spakuju u pravi ZIP u browseru.
3. **`deleteJob` je nedostupan za bilo koju generaciju napravljenu unutar
   lekcije** (kad je `taskId` prosledjen u `createJob`) - dugme postoji, ali
   server ga odbija sa objašnjenjem. Ako ikad zatrebaju obe stvari
   istovremeno (izbriši iz galerije ALI ostavi dokaz u lekciji), to traži
   razdvajanje `storageId`-a izmedju `generationJobs` i `labOutputs` umesto
   deljenog - danas je namerno deljen (P3 odluka), pa je ovo van obima P7.
4. **Filter po modelu pokazuje samo trenutno UKLJUČENE modele.** Stara
   generacija na modelu koji je u medjuvremenu ugašen i dalje je u mreži (samo
   se ne može filtrirati po njemu posebno) - vidljivo je kroz "Sve modele" ili
   kroz filter po tipu/datumu.
5. **Video kartice u mreži ne povlače ceo fajl dok se ne klikne play**
   (`preload="metadata"` + `#t=0.1`) - ali kako danas nijedan video model nije
   uključen (Faza B), ovo je neproverено uživo. Prva prava video generacija je
   pravi test.

## P8 - Admin ekran `/app/admin/studio`   (19.08.2026 13:25-13:50)

**Fajlovi:**
- **nov** `app/[locale]/app/admin/studio/page.tsx` - server ruta, isti obrazac
  provere uloge kao `app/[locale]/app/admin/page.tsx`
- **nov** `components/app/studio-admin-page.tsx` - `"use client"` ekran, tri
  sekcije (katalog modela, paketi/planovi, potrošnja)
- **nov** `convex/studioAdmin.ts` - `getUsageSummary`, `getKillSwitchState`,
  `setStudioEnabled`
- **nov** `convex/studioAdmin.test.ts` - 6 testova
- **nov** `lib/studio-admin.ts` - `computeMargin`, `marginTone`,
  `formatMargin`, `jobStatusLabel` (čiste funkcije za klijent)
- **nov** `lib/studio-admin.test.ts` - 6 testova, uključujući cross-check sa
  `convex/studioCore.ts`
- `convex/modelCatalog.ts` - nov query `listAllModels`
- `convex/creditPacks.ts` - nov query `listAllPacks`
- `convex/studioCore.ts` - `STUDIO_FLAG_KEY` premešten ovde (bio lokalan u
  `studio.ts`), dodati `EUR_PER_USD`, `LOW_MARGIN_THRESHOLD`, `computeMargin`,
  `dayStart`
- `convex/studio.ts` - uvozi `STUDIO_FLAG_KEY` iz `studioCore.ts` umesto
  lokalne konstante
- `convex/modelCatalog.test.ts`, `convex/creditPacks.test.ts` - po 1 nov test
  za `listAllModels`/`listAllPacks`
- `convex/studio.test.ts` - 4 nova testa (`computeMargin`, `dayStart`)

**Šta je uradjeno:** Sve admin mutacije iz noćnog run-a (`upsertModel`,
`setModelEnabled`, `setModelCost`, `upsertPack`, `setPackActive`) su danas
prvi put dobile ekran. Tri sekcije, tačno po zadatku: **Katalog modela** -
tabela sa slug-om, tipom, cenom u kreditima i nabavnom cenom u USD, obe
inline izmenljive (čuva se na blur/Enter preko `setModelCost`), izračunatom
maržom (bojena upozoravajuće ispod 2x preko `LOW_MARGIN_THRESHOLD`), i
prekidačem uključi/isključi (`setModelEnabled`). **Paketi i planovi** - isti
oblik tabele, sa `stripePriceId` kao inline izmenljivim tekstualnim poljem
(preko `upsertPack`, koje šalje ceo postojeći red nazad sa izmenjenim samo tim
poljem) i prekidačem aktivan/ugašen. **Potrošnja** - `studioUsageDaily`
agregirano za tekući UTC dan: ukupan trošak u USD, top 10 korisnika po trošku
(ime, pada na email ako imena nema), broj `generationJobs` po statusu (isti
dan, preko `by_status_created` indeksa), i kill switch
(`platformFlags.studio_enabled`) sa inline potvrdom PRE gašenja (bez modala,
isti obrazac kao brisanje u galeriji iz P7).

**ODLUKE:**
1. **Otkrivena i ispravljena stvarna arhitekturna greška, ne samo dizajn
   odluka: `requireAdmin` (iz `helpers.ts`) NE SME da se zove iz `query`-ja.**
   `requireAdmin` zove `ensureProfile`, koja bezuslovno traži `db.patch` da bi
   "bootstrap-ovala" profil - u `query` kontekstu (bez pisanja) to baca
   "Profile bootstrap requires a write-capable Convex context" umesto
   "Forbidden", i to za SVAKOG pozivaoca, uključujući admina. Ovo sam prvo
   napisao pogrešno (kopirajući `requireAdmin` u nova četiri query-ja), pa je
   moj sopstveni test odmah oborio. Ispravka: `contentHierarchy.ts`
   (`getAdminHierarchy`, `getAdminDetail`) već rešava isti problem - čita
   ulogu preko `getCurrentProfile(ctx)` i sam baca `"Forbidden"`, bez upisa.
   Sva četiri nova query-ja (`listAllModels`, `listAllPacks`,
   `getUsageSummary`, `getKillSwitchState`) sada koriste taj obrazac
   (`requireAdminRead` u `studioAdmin.ts`, inline u druga dva fajla).
   `setStudioEnabled` je mutacija i i dalje koristi pravi `requireAdmin`, kao
   i svih pet postojećih admin mutacija iz noćnog run-a - obrazac ostaje
   nepromenjen tamo gde je već ispravan.
2. **Ruta je `/app/admin/studio`, ne `/admin/studio` iz STUDIO-PLAN §0.1.**
   Zadatak (P8.md) eksplicitno kaže "pogledaj `app/[locale]/app/admin/page.tsx`
   ... pa se uklopi u isti obrazac" - postojeći admin ekran živi pod
   `app/[locale]/app/admin/`, ne pod zasebnom `/admin` grupom van `/app`.
   Praćenje zadatka i postojećeg koda ima prednost nad tekstom plana koji je
   pisan pre uvida u repo (STUDIO-PLAN §1 sam kaže da brief menja arhitekturu
   kad se sudari sa zatečenim kodom).
3. **Admin ekran je Srpski-only, BEZ sr/en varijanti, iako `rules-day.md`
   generalno traži bilingvalnost za UI korake.** Ovo je nejasnoća rešena
   najkonzervativnije: postojeći admin ekran (`admin-content-manager.tsx`,
   1927 linija zajedno sa `admin-inline-actions.tsx`) NEMA nijednu sr/en
   granu za sopstveni chrome (tabovi, dugmad, labele) - sve je hardkodovan
   srpski, jer je to interni alat koji koristi isključivo Jovan, ne
   korisnička površina. P8.md eksplicitno traži "uklopi se u isti obrazac
   uključujući način na koji se proverava admin uloga" - praćenje tog
   obrasca (Srpski-only za admin chrome) je konzervativnija opcija od
   uvođenja bilingvalnosti na tačno jednom admin pod-ekranu dok ostatak
   `/app/admin` ostaje jednojezičan, što bi bilo nedosledno u samom admin
   delu aplikacije. Studenta-vidljivi delovi (nema ih ovde - ekran je iza
   `role !== "admin"` redirect-a) ostaju netaknuti.
4. **Marža se računa kao `(creditCost / 100) / (estimatedCostUsd * 0.865)`**,
   iz STUDIO-PLAN §2 (100 kr = 1 €, kurs 1$ = 0,865€, ECB 14.08.2026 - ista
   pretpostavka koju je noćni run već koristio za seed cene). `null` (ne
   `Infinity`) kad je nabavna cena 0 ili manja - admin ekran to prikazuje kao
   "—" umesto lažno "odlična marža". Prag upozorenja je 2x, tačno kako P8.md
   traži ("Marža ispod 2x se boji upozoravajuće").
5. **Konzervativna procena šta znači "danas" u "Potrošnja".** P8.md kaže
   "`studioUsageDaily` agregirano" za sve tri stavke, uključujući "broj
   poslova po statusu" - iako taj broj tehnički dolazi iz `generationJobs`, ne
   iz `studioUsageDaily`. Pročitano kao "sve tri stavke su za isti dan", pa je
   broj po statusu ograničen na poslove sa `createdAt >= dayStart(now)` preko
   `by_status_created` indeksa - to je i jedini indeks koji to čitanje čini
   ograničenim (bez punog scan-a preko svih poslova ikad napravljenih).
6. **`now` stiže sa klijenta, zamrznut na prvom renderu** (`useState(() =>
   Date.now())`), isti obrazac kao `credits-page.tsx`/`studio-gallery-page.tsx` -
   `getUsageSummary` query nikad ne čita sat sam.
7. **Bez `@convex-dev/aggregate`**, tačno kako P8.md dozvoljava za ovaj obim -
   `studioUsageDaily` ima jedan red po korisniku po danu, i za jedan dan je to
   mali, ograničen skup. Kapovi (`MAX_USAGE_ROWS=500`, `MAX_JOBS_PER_STATUS=2000`)
   postoje da čitanje ostane ograničeno i da platforma ne mora da promeni ovaj
   kod čim prve stotine korisnika stignu; ako se kapiraju, ekran to piše
   ("odsečeno na prikaz"), ne ćuti.
8. **`lib/studio-admin.ts` duplira `computeMargin`/`EUR_PER_USD` iz
   `convex/studioCore.ts`, ne uvozi ih.** Isti obrazac kao `PROMPT_MAX_LENGTH`
   u `lib/studio-form.ts` (P6, ODLUKA 4) - "use client" komponente u ovom
   repou ne uvoze `convex/*.ts` module direktno. `lib/studio-admin.test.ts`
   uvozi OBE strane i tvrdi da se poklapaju na istim primerima iz
   STUDIO-PLAN §2.3, da razilaženje ne prođe nezapaženo.
9. **`upsertPack` za izmenu `stripePriceId` šalje NAZAD ceo postojeći red**
   (slug, oba naslova, cenu, kredite, bonus, kind, planTier, sortOrder,
   isActive) sa samo tim jednim poljem izmenjenim - mutacija ne prima
   parcijalni patch, upsert-uje po `slug`-u. Nema rizika dupliranja: `upsertPack`
   (A4) već traži postojeći red po `slug` pre inserta.
10. **Inline izmena čuva na blur/Enter, ne na svaki tasterski pritisak**, i ne
   diže mutaciju ako vrednost nije promenjena - isti minimalni obrazac kao
   svaki drugi "sačuvaj" tok u ovom repou, bez posebne biblioteke za forme.
   Neuspešna izmena vraća polje na poslednju poznatu server vrednost i ispisuje
   grešku ispod polja (`error.message` direktno, isti fallback kao
   `admin-content-manager.tsx`-ov `save()`).
11. **Radiusi:** `Panel` (16px) za tri sekcije, `surface-inset` (12px) za redove
   tabela i kartice unutar "Potrošnje", `rounded-full` za sve prekidače/dugmad,
   `rounded-[8px]` za kompaktna polja unosa - poslednje je namerno kopija
   POSTOJEĆEG `inputClass`-a iz `admin-content-manager.tsx` (identična
   vrednost, 8px = `surface-media` tier), ne nova vrednost. Provereno grep-om:
   0 `rounded-*!`, 0 inline `borderRadius`, 0 `setInterval`/`setTimeout`.

**Testovi:** 16 novih (385 -> ide preko 370 iz P7 + noćnih; tačan ukupan broj
u rezultatu verifikacije ispod).
- `convex/studioAdmin.test.ts` (6): sve tri funkcije bacaju "Forbidden" za
  ne-admina; `getKillSwitchState` bez reda vraća `enabled: true`, a
  `setStudioEnabled` upisuje pa menja isti red (nema dupliranja); agregacija -
  zbir troška, top 10 (sortirano opadajuće, dva najniža korisnika ispadaju),
  broj poslova po statusu SAMO za dati dan (potrošnja i posao iz "juče" se ne
  računaju); korisnik bez `name`-a se prikazuje po email-u.
- `lib/studio-admin.test.ts` (6): `computeMargin` daje identičan rezultat kao
  `convex/studioCore.computeMargin` za 4 modela iz STUDIO-PLAN §2.3 (cross-check);
  nula/negativna nabavna cena daje `null`; `marginTone` unknown/warn/ok tačno na
  granici praga; `formatMargin` i `jobStatusLabel` formatiranje.
- `convex/modelCatalog.test.ts` (+1): `listAllModels` vraća i isključene
  modele, zaštićen `requireAdmin`-obrascem.
- `convex/creditPacks.test.ts` (+1): `listAllPacks` vraća i ugašene pakete.
- `convex/studio.test.ts` (+4): `computeMargin` (2), `dayStart` (1) - pomereno
  ovde jer `studio.test.ts` je već mesto gde žive testovi čistih funkcija iz
  `studioCore.ts` (isti obrazac kao `sanitizeParams`/`mockJobSucceeds` testovi
  u istom fajlu).

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez
  greške)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja, nijedno iz Studio koda)
- `npm run test` - **prošlo** (`Test Files 39 passed (39) / Tests 385 passed
  (385)`). Napomena: jedan prolaz je usput pokazao
  `convex/chat.test.ts > inbox summary stays exact beyond one thousand
  memberships` kako pada na `Test timed out in 5000ms` - ponovljen izolovano i
  u punom run-u, pada dosledno pod trenutnim opterećenjem mašine. Fajl nije
  diran ovim korakom (nema veze sa Studiom) i sledeći čist run (posle ovog
  koraka) je prošao svih 385/385 - zabeleženo kao poznata varijabilnost
  test-runnera na ovoj mašini, ne kao BLOKADA ovog koraka.
- `npm run build` - **prošlo** (`✓ Compiled successfully`, `Finished
  TypeScript in 82s`; `/[locale]/app/admin/studio` je u listi ruta, `ƒ`)

**BLOKADA:** nema.

**Za Jovana:**
1. **Ekran je na `/sr/app/admin/studio` (i `/en/...`), ne na `/sr/admin/studio`
   iz STUDIO-PLAN §0.1** - vidi ODLUKA 2. Vidljiv je samo nalozima sa
   `role === "admin"`, isto kao `/app/admin` i `/app/admin/chat`.
2. **Nije u navigaciji.** `/app/admin` (kontrolni centar) nema link ka njemu -
   isti razlog kao Studio/Krediti/Galerija u P5-P7 (van obima UI koraka).
   Otvara se direktnim URL-om.
3. **Marža je procena, ne stvarni trošak.** Računa se iz
   `modelCatalog.estimatedCostUsd`, koji niko ne osvežava iz fal-a uživo (to je
   Faza D, "noćna provera fal cena" iz STUDIO-PLAN §2.5). Ako fal promeni cenu
   modela, marža na ekranu ostaje pogrešna dok neko ručno ne upiše novu
   nabavnu cenu ovde.
4. **Dnevni limiti (50 generacija, 3 u letu, 5$/dan po korisniku) NISU
   podesivi sa ovog ekrana.** STUDIO-NIGHT-REPORT tačka 3 to već beleži kao
   odstupanje od plana ("konstante u `studioCore.ts`, menjaju se samo
   deploy-em") - P8.md ne traži izmenu toga i ostalo je van obima ovog koraka.
5. **Globalni dnevni trošak (alarm 50$, kill switch 100$) i dalje ne
   postoje.** Ono što danas postoji je ručni kill switch (uvek dostupan, sa
   potvrdom) i pregled DANAŠNJEG ukupnog troška - admin i dalje mora sam da ga
   pogleda i odluči da ugasi, nema automatskog praga. To je STUDIO-NIGHT-REPORT
   stavka "Globalni dnevni trošak - cron - alarm na 50$, kill switch na 100$"
   i ostaje neotvorena.
6. **Ako ikad neko drugi doda novi `query` koji treba admin proveru, NE
   kopiraj `requireAdmin` iz `helpers.ts` u njega** - vidi ODLUKA 1. Taj
   helper radi samo u mutacijama/akcijama (piše u bazu da bootstrapuje
   profil). Za `query`, koristi `getCurrentProfile(ctx)` i proveri
   `profile.role` ručno, kao `contentHierarchy.getAdminHierarchy` i sada
   `studioAdmin.ts`.

## P9 - Navigacija, balans u zaglavlju, ulaz iz lekcije, tekstovi na jednom mestu   (19.08.2026 13:55-14:39)

**Fajlovi:**
- izmenjeno: `components/app/app-sidebar.tsx`, `components/app/course-lab.tsx`,
  `components/app/studio-page.tsx`, `components/app/credits-page.tsx`,
  `components/app/studio-gallery-page.tsx`, `lib/studio-form.ts`,
  `lib/studio-form.test.ts`, `lib/studio-gallery.ts`, `lib/studio-gallery.test.ts`
- **novo:** `lib/studio-messages.ts`, `lib/studio-messages.test.ts`

**Šta je uradjeno:** Sve četiri stranice iz P5-P8 (Studio, Krediti, Galerija,
Admin) su postojale ali do njih se nije moglo doći nijednim klikom - ovaj korak
je poslednja veza. (1) `components/app/app-sidebar.tsx` je dobio dve nove stavke,
**Studio** (`Wand2`) i **Krediti** (`Coins`), u sve tri relevantne površine
navigacije: prošireni desktop/mobilni meni (`NavLink`, isti obrazac kao
Dashboard/Poruke) i kolabovani desktop rail (`RailAction`) - mobilni donji
tab bar od tačno 4 slota je namerno preskočen (vidi ODLUKA 1). (2) Nova
`CreditsBalancePill` komponenta u istom fajlu čita `credits.getBalance` preko
`useQuery` (pretplata, bez pollinga) i prikazuje balans u `rounded-full`
pločici koja vodi na `/app/credits`, vidljiva na mobilnom top baru i na vrhu
proširenog desktop sidebar-a - dakle sa svake `/app` stranice bez obzira koja
je trenutno otvorena. Kad je balans tačno 0, pločica je blago upozoravajuće
obojena (`bg-amber-100`). (3) `components/app/course-lab.tsx` (AI Workspace u
lekciji) dobija dugme **"Otvori u Studiju"** u output koloni, tačno kad
`activeStep.outputKind !== "text"`, koje vodi na
`/app/studio?lessonId=...&taskId=...`; `components/app/studio-page.tsx` sad
čita ta dva parametra iz URL-a i prosledjuje ih u `createJob` (koji ih od P3
već prima kao argumente) - generacija iz lekcije tako upisuje `labOutputs` sa
`taskId`, zadatak se sam zeleni i leaderboard dobija poene, tačno lanac iz
STUDIO-PLAN 1.1. (4) Nov `lib/studio-messages.ts` skuplja na jedno mesto sve
poruke grešaka i prazna stanja Studija koji su do sad bili rasuti po tri
odvojena fajla/komponente: `studioErrorMessage` (greške `createJob`-a,
preseljeno iz `studio-form.ts`) i `deleteJobErrorMessage` (greške `deleteJob`-a,
preseljeno iz `studio-gallery.ts`), plus osam `EmptyState` konstanti
(naslov/rečenica/sledeći korak, sr+en) koje sad koriste `studio-page.tsx`
(pauziran, neupisan, nema generacija), `credits-page.tsx` (nema kredita, nema
paketa, nema istorije) i `studio-gallery-page.tsx` (nema generacija, filteri
bez pogotka) umesto ranijih inline ternarnih tekstova.

**ODLUKE:**
1. **Mobilni donji tab bar (`AppBottomNav`, tačno 4 slota) nije diran.**
   Komentar u samom kodu ("Do not add a fifth entry to this array... Cramming a
   fifth tab in... would cost Poruke its unread badge") eksplicitno zabranjuje
   peti slot. Studio i Krediti su i dalje dva taster-a udaljeni preko dugmeta
   "Više" koje otvara drawer (isti sadržaj kao prošireni desktop meni), pa
   ništa nije nedostupno na mobilnom - samo nije u brzom baru.
2. **Balans u zaglavlju se renderuje samo kad `authState === "authenticated"`.**
   Bez ove provere bi anonimni posetilac (npr. `hasConvex: false` fallback ili
   dok se sesija učitava) video prazan/svetlucav prostor. `undefined` (upit se
   učitava) prikazuje "—", isti obrazac kao postojeći balans na `/app/studio` i
   `/app/credits`; `null` (podrazumevana vrednost kad `creditsBalance` prop
   uopšte nije prosledjen, npr. u statičkom `!hasConvex` ogranku) pločicu
   uopšte ne renderuje.
3. **Pločica se NE renderuje u kolabovanom (rail) sidebar-u.** Prošireni desktop
   vrh i mobilni top bar pokrivaju "vidljivo sa svake stranice" za podrazumevano
   stanje; rail je stanje koje je korisnik sam izabrao (kolapsiranje se pamti
   godinu dana u kolačiću) i već je gust sa ikonicama. Dodavanje pločice tu bi
   zahtevalo poseban sažeti prikaz (samo broj, bez `rounded-full` pločice sa
   tekstom) što `rules-day.md` ne traži eksplicitno - konzervativnije je
   ostaviti rail kakav je nego izmišljati novi vizuelni oblik za njega.
4. **`studioActive` hvata i `/app/studio` i `/app/studio/gallery`**
   (`pathname.includes("/app/studio/")`), isti obrazac kao `communityActive` i
   `messagesActive` u istom fajlu - Galerija je pod-stranica Studija, ne
   posebna sekcija, pa nav stavka ostaje osvetljena i tamo.
5. **Dugme "Otvori u Studiju" stoji u output koloni (gde generacija i inače
   sleće), ne u chatbot koloni.** P9.md ne precizira tačno mesto; output kolona
   već ima naslov + ikonu vrste izlaza tačno iznad prazne/popunjene kartice, pa
   je dugme prirodni sledeći red - korisnik koji gleda "ovde treba da se pojavi
   slika" odmah vidi i kako da je napravi.
6. **`taskId` se šalje u `createJob` samo ako je i `lessonId` prisutan**
   (`...(lessonId && taskId ? { taskId } : {})`), iako URL uvek nosi oba kad
   dugme iz lekcije generiše link. Server (`convex/studio.ts:73`) svejedno baca
   `ZADATAK_BEZ_LEKCIJE` za `taskId` bez `lessonId`; ovo je odbrana od ručno
   izmenjenog URL-a (npr. korisnik obriše `lessonId=...` deo), ne od dugmeta
   samog.
7. **Obim "jednog modula" za tekstove (4. stavka u P9.md) je pročitan kao
   naslov te stavke** ("Prazna stanja i poruke grešaka na jednom mestu"), ne
   doslovno "svaki tekst u Studiju". Prva rečenica stavke ("Skupi sve tekstove
   Studija... u jedan modul") je šira od naslova; obrazac koji repo već koristi
   za lokalizaciju je inline `t(locale, sr, en)`/ternarni tekst UNUTAR
   komponente (tako rade sve četiri Studio stranice, `course-lab.tsx`, i svaka
   druga stranica u `/app`), pa bi doslovno "sve" značilo napustiti taj
   ustaljeni obrazac na desetinama mesta (naslovi panela, labele dugmadi,
   filter-čipovi) - direktno u sukobu sa "Surgical Changes" i "ne uvodi nov
   dizajn jezik". Umesto toga skupljeno je tačno ono što `rules-day.md`
   eksplicitno nabraja kao prazna stanja ("Nema kredita, nema generacija,
   Studio pauziran, posao neuspeo") plus obe funkcije za greške koje su već
   PRE ovog koraka bile odvojene u dva različita fajla (`studio-form.ts`,
   `studio-gallery.ts}`) - ta dva stvarno JESU bila "rasuta po komponentama" u
   smislu da ista vrsta teksta (greška iz Studio mutacije) živi na dva mesta.
   Tekst dugmadi/naslova ostaje tamo gde je i bio, po istom obrascu kao ostatak
   `/app`.
8. **`studioErrorMessage` je dobio tri nova koda**: `ZADATAK_BEZ_LEKCIJE`,
   `ZADATAK_NIJE_U_LEKCIJI` (oba iz `convex/studio.ts`, postala DOSTIŽNA tek
   ovim korakom - pre P9 UI nikad nije slao `taskId`/`lessonId`) i
   `NEISPRAVNO_TRAJANJE` (iz `convex/studioCore.ts`, danas nedostižno jer
   nijedan seedovan model nema `costPerSecond`, ali dodato za potpunost pre
   Faze B). Bez ovoga bi dugme iz lekcije, na rubnom slučaju, ispisalo generičku
   poruku umesto specifičnog objašnjenja.
9. **`PROMPT_MAX_LENGTH` ostaje re-eksportovan iz `lib/studio-form.ts`**
   (`export { PROMPT_MAX_LENGTH }` iznad uvoza iz `studio-messages.ts`) umesto
   da se svaki pozivalac prebaci na novu putanju uvoza. `lib/studio-admin.ts`
   ima komentar koji imenuje baš `lib/studio-form.ts` kao primer istog obrasca
   (dupliranje matematike umesto uvoza `convex/*.ts` u klijent) - re-eksport
   čuva taj komentar tačnim uz minimalnu izmenu.
10. **Radiusi:** `CreditsBalancePill` i obe nove nav stavke koriste isključivo
    `rounded-full` (pilula); dugme "Otvori u Studiju" takodje `rounded-full`,
    isti obrazac kao ostala dugmad u `course-lab.tsx` čiji su kontejneri
    `rounded-[8px]` (postojeći, nedirano). Provereno grep-om nad svim
    izmenjenim fajlovima: nula novih `rounded-[...]`, nula `rounded-*!`, nula
    inline `borderRadius`, nula `setInterval`/`setTimeout`.

**Testovi:** `lib/studio-messages.test.ts` je nov fajl sa 9 testova (preseljeno
iz `studio-form.test.ts` i `studio-gallery.test.ts`, plus dva nova):
`PROMPT_MAX_LENGTH === MAX_PROMPT_LENGTH` (cross-check, isti kao ranije) ·
`studioErrorMessage` - sirov kod se nikad ne prikazuje, svaki kod ima svoju
poruku (sad uključujući `ZADATAK_BEZ_LEKCIJE`/`ZADATAK_NIJE_U_LEKCIJI`/
`NEISPRAVNO_TRAJANJE`), `DNEVNI_LIMIT_TROSKA` se ne čita kao `DNEVNI_LIMIT`,
razlozi prompta se razlikuju, **nov test** da `ZADATAK_BEZ_LEKCIJE` i
`ZADATAK_NIJE_U_LEKCIJI` imaju različite poruke, nepoznata greška daje ljudsku
poruku, obe lokalizacije postoje i razlikuju se · `deleteJobErrorMessage` -
oba imenovana koda plus opšta poruka (preseljeno bez izmena) · **nov test**
"prazna stanja" - svih osam `EmptyState` konstanti ima naslov, rečenicu i CTA
na oba jezika i nijedno se ne poklapa izmedju sr/en (sprečava da neko ostavi
identičan tekst na oba jezika). `lib/studio-form.test.ts` i
`lib/studio-gallery.test.ts` su izgubili po jedan `describe` blok (preseljen),
ostatak netaknut. Nijedan nov test za `app-sidebar.tsx` ili `course-lab.tsx` -
ta dva fajla nemaju postojeći test fajl niti ih `vitest.config.ts` pokriva
(samo `convex/**/*.test.ts` i `lib/**/*.test.ts`), pa bi dodavanje jednog
značilo novu test infrastrukturu (React Testing Library i sl.) koju P9.md ne
traži; provereno ručno kroz `npm run build` (rute i dalje kompajliraju) i
grep-om za radiuse/`setInterval` (ODLUKA 10).

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, nijedno iz Studio koda)
- `npm run test` - **387/388 prošlo.** Jedini pad je
  `convex/chat.test.ts > inbox summary stays exact beyond one thousand
  memberships` sa `Test timed out in 5000ms` - **isti test koji je P8 već
  zabeležio kao poznatu varijabilnost test-runnera na ovoj mašini**, nepovezan
  sa Studio kodom (fajl nije diran ni u P8 ni u P9). Ponovljen tri puta u punom
  suite-u (uvek pao, uvek isti test) i jednom izolovano sa
  `--testTimeout=30000` (prošao za 9.68s stvarnog vremena) - test radi ispravno,
  samo ne stigne pod 5s kad se 40 test fajlova vrti paralelno. Nije BLOKADA
  ovog koraka.
- `npm run build` - **prošlo** (`✓ Compiled successfully`, `Finished
  TypeScript in 89s`; sve Studio rute i dalje u listi, `/[locale]/app/studio`,
  `/[locale]/app/credits`, `/[locale]/app/studio/gallery`,
  `/[locale]/app/admin/studio` sve `ƒ`)

**BLOKADA:** nema.

**Za Jovana:**
1. **Studio i Krediti su sad vidljivi u navigaciji** - prošireni sidebar
   (desktop i mobilni drawer preko "Više") i kolabovani rail. Mobilni donji
   tab bar od 4 slota namerno nije menjan (ODLUKA 1) - Galerija i Admin/Studio
   i dalje nemaju sopstvenu nav stavku (nisu traženi u P9.md), do njih se stiže
   preko linkova unutar Studio/Krediti stranica kao i do sad.
2. **Balans u zaglavlju je pravi test da Convex realtime radi kroz sidebar.**
   Otvori bilo koju `/app` stranicu, generiši u Studiju u drugom tabu, i broj u
   pločici treba da padne sam, bez refresh-a - `useQuery` je pretplata. Ako ne
   padne, problem je u `credits.getBalance`, ne u sidebar-u.
3. **Dugme "Otvori u Studiju" se pojavljuje samo za korake čiji je
   `outputKind` `image`/`audio`/`video`/`file`** - tekstualni koraci (AI chat
   output) ga nemaju, jer za njih Studio ne nudi ništa (Studio danas generiše
   samo slike, Faza A). Klikom se prompt NE prenosi automatski (za razliku od
   "Generiši ponovo" u galeriji) - korisnik i dalje sam piše prompt u Studiju;
   prenos konteksta zadatka u prompt bi bio veći zadatak nego "dugme +
   prosledjivanje parametara" koje P9.md eksplicitno ograničava kao dovoljno
   ako se korak pokaže većim od jednog prompta.
4. **Test veze iz lekcije:** otvori korak sa `outputKind !== "text"` u bilo kojoj
   lekciji koja ima `lessonTasks`, klikni "Otvori u Studiju", generiši sliku,
   pa se vrati u lekciju - zadatak sa kojeg si krenuo treba da se sam obeleži
   kao završen (ako je `completionMode` automatski) i traka `taskProgress`
   treba da pokaže `evidenceOutputId` koji vodi na baš tu generaciju. Nisam
   mogao ovo da testiram uživo (nema browser sesije u ovom run-u) - ovo je
   prva stvar koju vredi ručno proveriti.
5. **`lib/studio-messages.ts` je sad jedino mesto gde se dodaje nov kod greške
   `createJob`-a ili novo prazno stanje Studija.** Ako budući korak doda novi
   `throw new Error("NOVI_KOD")` u `convex/studio.ts`, poruka ide ovde, ne u
   komponentu koja poziva `createJob`.
6. **Flaky `chat.test.ts` test (vidi Rezultat verifikacije) nije nešto što ovaj
   korak treba da popravlja** - nepovezan fajl, nepovezan sistem (chat inbox,
   ne Studio). Ako se ponavlja i van ovog run-a, vredi ili povećati
   `testTimeout` za taj specifičan test ili istražiti zašto traje >5s pod
   paralelnim opterećenjem.

## P10 - Kapija, demo krediti i uputstvo za pokretanje   (19.08.2026 14:45-15:10)

**Fajlovi:**
- `convex/seed.ts` - nova mutacija `grantDemoCredits`, tri nova uvoza
  (`normalizeEmail`, `internal`, `Id`)
- **nov** `convex/seed.test.ts` - 6 testova
- **nov** `docs/STUDIO-DEMO.md` - uputstvo za pokretanje demoa
- `.studio-run/mutate.py` - dodate mutacije 56-58 za ovaj korak
- `docs/STUDIO-PROGRESS.md` - ova sekcija

**Šta je uradjeno:** Korak nije pisao nijedan nov feature. (1) Sve četiri
verifikacione komande su puštene nad zatečenim stanjem grane i tačan izlaz je
zabeležen ispod. `npm run build` je prvi put u celom run-u stvarno pokrenut nad
kompletnim Studio UI-jem i **prošao je** - svih 6 novih ruta
(`/app/credits`, `/app/studio`, `/app/studio/gallery`, `/app/admin/studio`,
`/api/stripe/plan`, `/api/stripe/credits`) je u izlaznoj tabeli. (2) Napisana je
`seed:grantDemoCredits` (`{syncSecret, email, amount}`, iza `requireSyncSecret`),
koja nalazi korisnika po normalizovanom mejlu i otvara lot izvora `admin_grant`
kroz postojeći `internal.credits.grantCredits` - bez nje se Studio ne može ni
probati lokalno, jer je jedini drugi put do kredita kroz pet Stripe price
ID-jeva kojih još nema. (3) Napisan je `docs/STUDIO-DEMO.md`: dva terminala,
tri seed komande, dodela 2000 demo kredita, osam koraka šetnje sa URL-ovima, i
tačne reference na stavke iz `RUČNI KORACI ZA JOVANA` za sve što bez podešavanja
neće raditi.

**ODLUKE:**
1. **`grantDemoCredits` NIJE idempotentna - i to je namerno.** Svaki drugi
   grant u kodu jeste (dupli grant je izgubljen novac), ali ovde je poenta
   suprotna: demo balans mora da se može dopuniti kad se potroši. Iza njega ne
   stoji nikakva naplata, a `requireSyncSecret` ga drži van dohvata klijenta.
2. **Ključ idempotencije je redni broj demo lota (`demo:<userId>:<n>`), ne
   `Date.now()`.** Prva verzija je koristila vreme; dva poziva u istoj
   milisekundi bi delila ključ i drugi bi tiho postao no-op (`grantCredits`
   vraća postojeći lot). Redni broj se čita preko `by_user_source` indeksa
   (istog koji je P1 dodao za welcome bonus), pa je deterministički i testabilan.
3. **Mejl se normalizuje (`normalizeEmail` iz `lib/admin-emails.ts`) pre
   pretrage.** Bez toga bi `Jovanm028@gmail.com` iz komandne linije bacio
   `KORISNIK_NIJE_NADJEN` iako korisnik postoji - najgluplji mogući način da
   uputstvo od pet minuta ne proradi.
4. **Traži se `.first()`, ne `.unique()`.** Indeks `email` na `users` nije
   jedinstven (`identityMerge.ts` eksplicitno računa na duplikate i uzima
   `take(10)`), pa bi `.unique()` na nalogu sa duplim redom bacio umesto da
   dodeli kredite.
5. **Povratni tip handler-a je napisan ručno (`Promise<Id<"creditLots">>`).**
   Ovo NIJE stil - bez njega `next build` puca. Vidi "Rezultat verifikacije".
6. **Pad `convex/chat.test.ts` NIJE upisan kao BLOKADA.** Dokazano je da je
   zatečen i nezavisan od Studija: napravljen je privremeni `git worktree` na
   `main` (sa junction-om na isti `node_modules`) i isti test tamo pada isto,
   sa istom porukom. Test nije diran (ni komentarisan, ni sa promenjenim
   timeout-om) - `rules-day.md` to zabranjuje, a i nije naš.
7. **`seedInitialContent` je u DEMO dokumentu označen kao opcion**, jer je
   potreban samo za korak 5.8 (ulaz iz lekcije); prva sedam koraka šetnje rade
   i na praznoj bazi kurseva.

**Testovi:** 6 novih u `convex/seed.test.ts` (388 -> 394), svi za
`grantDemoCredits`:
- otvara tačno jedan `admin_grant` lot, podiže `balance` na 2000, upisuje
  `admin_adjust` transakciju, i **ne** dira `lifetimePurchased` (demo krediti
  nisu plaćeni);
- drugi poziv otvara DRUGI lot sa različitim ključem i balans postaje zbir
  (čuvar odluke 1 i 2);
- mejl sa velikim slovima i razmacima nalazi istog korisnika (čuvar odluke 3);
- pogrešan `syncSecret` -> `Forbidden`, nijedan lot nije upisan;
- nepoznat mejl -> `KORISNIK_NIJE_NADJEN`, nijedan lot nije upisan;
- iznos `0`, `-50` i `2.5` -> `NEVALIDAN_IZNOS`, nijedan lot nije upisan.

**Mutaciono testiranje (`.studio-run/mutate.py 56`..`58`), 3 mutacije, sve tri
obaraju bar jedan test:** fiksan
ključ idempotencije umesto rednog broja (pada test ponovljenog granta) ·
uklonjen `normalizeEmail` (pada test velikih slova) · uklonjen
`requireSyncSecret` (pada test pogrešnog secret-a). Radno stablo je posle svake
mutacije vraćeno (`mutate.py` to radi sam) i potvrdjeno `grep`-om na `seed.ts`.

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške;
  `api.seed.grantDemoCredits` je u `convex/_generated/api.d.ts`)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`, istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`; nijedno iz Studio koda)
- `npm run test` - **393/394 prošlo.** Jedini pad je zatečen i tudj:
  `convex/chat.test.ts > inbox summary stays exact beyond one thousand
  memberships` - `Error: Test timed out in 5000ms` (test traje ~8-10 s na ovoj
  mašini). Isti test pada isto na čistom `main`-u u zasebnom worktree-u, dakle
  nema veze sa Studio kodom. Sa `npx vitest run --testTimeout=60000`:
  **41/41 fajlova, 394/394 testova, sve zeleno.**
- `npm run build` - **prošlo** (`✓ Compiled successfully in 25.1s`, TypeScript
  bez greške, 60 statičkih stranica, sve Studio rute u tabeli).
  **Prvi pokušaj je pao** i to je najvažniji nalaz ovog koraka:
  ```
  ./components/app/admin-content-manager.tsx:527:500
  Type error: Parameter 'item' implicitly has an 'any' type.
  ```
  Greška je u fajlu koji nema nikakve veze sa Studijem. Uzrok: `grantDemoCredits`
  je uvela prvi `import { internal } from "./_generated/api"` u `seed.ts`, a
  njen handler nije imao napisan povratni tip - `ctx.runMutation` tako zatvara
  krug `seed.ts -> api.d.ts -> seed.ts`, TS odustane od zaključivanja i greška
  ispliva na nasumičnom fajlu koji zavisi od `api` tipa. `credits.ts`
  (`applyStripeGrant`) je isti problem već rešio ručno napisanim
  `Promise<Id<"creditLots">>`; ista ispravka primenjena i ovde, uz komentar da
  se ne "očisti" kasnije. **Napomena za sve naredne korake: `npm run lint` i
  `npm run test` ovo NE hvataju - samo `npm run build`.**

**BLOKADA:** nema.

**Za Jovana:**
1. **Uradi `docs/STUDIO-DEMO.md` od vrha do dna.** To je jedini korak koji je
   danas stvarno neophodan; sve ostalo iz sekcije 6 tog dokumenta može da čeka.
2. **Prijavi se pre nego što pustiš `grantDemoCredits`** - mutacija traži red u
   `users` po mejlu i baca `KORISNIK_NIJE_NADJEN` ako se nikad nisi ulogovao na
   lokalnom deploymentu.
3. **`WEBHOOK_SYNC_SECRET` je već postavljen na dev deploymentu** (provereno sa
   `npx convex env list`), pa sve četiri `npx convex run` komande rade odmah.
   `FAL_KEY` nije postavljen - to je ispravno stanje za demo, mock provajder
   radi bez njega.
4. **`npm run test` će ti pokazati jedan crven test.** Nije naš i nije nov -
   `convex/chat.test.ts` prekoračuje podrazumevani timeout od 5 s na ovoj
   mašini. Kad hoćeš čist izlaz: `npx vitest run --testTimeout=60000`.
5. **Ako sam nekad zaboravim ovaj nalaz:** posle svakog dodavanja
   `ctx.runMutation`/`ctx.runQuery` u Convex fajl, povratni tip handler-a se
   piše ručno, i `npm run build` se pušta - `lint` i `test` prolaze i kad je
   tip pokvaren.

## RV2 - Revizija dnevnog run-a   (19.08.2026 15:15-15:40)

**Fajlovi:**
- **nov** `docs/STUDIO-DAY-REPORT.md` - ceo izveštaj
- `docs/STUDIO-PROGRESS.md` - ova sekcija

**Šta je uradjeno:** Nijedan nov feature; revizija svega iz P1-P10. Sve četiri
verifikacione komande su puštene nad zatečenim stanjem i tačan izlaz je
zabeležen - prvi put je i `npm run test` zelen bez povišenog timeout-a
(41/41 fajlova, 394/394 testa). Pročitane su sekcije P1-P10, sekcija RIZICI PO
NOVAC iz noćnog izveštaja, i **ponovo je pročitan sav kod** umesto da se veruje
dnevniku: `studio.ts`, `studioCore.ts`, `studioActions.ts`, `crons.ts`,
`credits.ts`, `creditsCore.ts`, `studioAdmin.ts`, `modelCatalog.ts`,
`creditPacks.ts`, `seed.ts`, obe Stripe rute, webhook, sve četiri stranice i
`lib/studio-*.ts`. Izveštaj daje status svake od šest rupa iz P1 i tri crona iz
P2, nov prolaz kroz listu a-f iz noći, jedanaest novih nalaza, iskren popis
onoga što se stvarno vidi na ekranu, numerisanu listu pre prvog evra sa
procenama, i preporuku.

**ODLUKE:**
1. **Rupa (f) je ocenjena kao DELIMIČNO zatvorena, iako P1 tvrdi da je
   zatvorena.** `sanitizeParams` jeste napisan i radi, ali noćni izveštaj je pod
   (f) imenovao baš `num_images` kao mehanizam gubitka, a P1 ga je ograničio na
   `max: 4` umesto da ga naplati. Cena je i dalje fiksna po pozivu. Kod sedam od
   osam uključenih modela marža pada ispod 1x već na `num_images: 3`, kroz
   normalnu formu. Ocena prati posledicu po novac, ne obim zadatka.
2. **Dnevni limit troška je takodje ocenjen kao delimičan**, iz dva razloga:
   sabira `estimatedCostUsd` po pozivu (pa uz `num_images: 4` plafon od 5 USD
   propušta do 20 USD stvarnog troška), i globalni plafon iz plana 4.4 (alarm
   50 USD, kill switch 100 USD) i dalje ne postoji nigde u `convex/`.
3. **N1 je napisan uz izričit uslov, a ne kao tvrdnja.** Da li fal naplaćuje po
   izlaznoj slici nije provereno - pravila dana zabranjuju poziv živog API-ja.
   Cene iz plana §2.3 jesu po slici, pa je to konzervativna pretpostavka, ali je
   u izveštaju označena kao pretpostavka i uz nju stoji komanda za proveru.
4. **N4 (`syncSubscription` i dalje ćuti) je prijavljen iako ga pravila dana
   izričito štite** ("ne menjaj postojeći subscription flow"). P1 je ispravno
   stao; izveštaj to i kaže. Ali "van obima" nije isto što i "zatvoreno", pa
   rupa mora da stoji u popisu.
5. **Marže su preračunate iz `seed.ts` po formuli iz plana §2.3** (100 kr = 1 €,
   1 $ = 0,865 €), ne prepisane iz P8-ovog `computeMargin`-a - da nalaz ne
   zavisi od koda koji se ocenjuje.
6. **Nekomitovan dan je prijavljen kao rupa (N9), ne kao napomena.**
   `git log main..HEAD` završava na noćnom `c351c2f`; 23 izmenjena praćena
   fajla i 25 novih putanja stoje samo u radnom stablu.
7. **Nijedan fajl osim dva dokumenta nije diran.** Revizija ne popravlja ono što
   ocenjuje - svaka popravka je stavka u "PREOSTALO PRE PRVOG EVRA".

**Testovi:** nijedan nov - korak ne piše kod. Postojeći set je pušten ceo i
korišćen kao dokaz: za svaku zatvorenu rupu izveštaj imenuje testove koji je
drže (izvučeni iz `npx vitest run --reporter=verbose`, ne iz dnevnika).

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, nijedno iz Studio koda)
- `npm run test` - **prošlo** (`Test Files 41 passed (41) / Tests 394 passed
  (394) / Duration 6.13s`), na podrazumevanom timeout-u. Pušteno je ukupno 7
  punih prolaza: 6 zelenih, 1 sa jednim padom - i to jedini koji je išao
  paralelno sa `npm run lint`-om. Ime tog testa nije uhvaćeno i namerno se NE
  pripisuje `convex/chat.test.ts`-u (pretpostavka, ne nalaz); pokušaj
  reprodukcije pod istim opterećenjem nije oborio nijedan test. Zapisano u
  izveštaju kao "zeleno, ali nedokazano determinističko pod opterećenjem".
- `npm run build` - **prošlo** (`✓ Compiled successfully in 8.5s`,
  `Finished TypeScript in 16.3s`, 60/60 statičkih stranica; sve nove rute u
  tabeli: `/[locale]/app/studio`, `/[locale]/app/studio/gallery`,
  `/[locale]/app/credits`, `/[locale]/app/admin/studio`, `/api/stripe/plan`)

**BLOKADA:** nema.

**Za Jovana:**
1. **Pročitaj `docs/STUDIO-DAY-REPORT.md`, sekciju NOVE RUPE, pre nego što
   dodirneš Stripe.** Tri stavke tamo (N1 `num_images`, N3 kuponi, i globalni
   plafon iz stavke 2 u "PREOSTALO") koštaju od prvog dana prodaje.
2. **Najjeftinija popravka u celom izveštaju je jedan red u `convex/seed.ts`:**
   izbaci `num_images` iz `IMAGE_PARAM_SCHEMA` i pinuj ga na 1 u
   `IMAGE_DEFAULT_PARAMS`, isto kao što je P1 uradio sa rezolucijom. Time
   nestaje N1 dok ne odlučiš kako da ga naplatiš.
3. **Komituj dan pre bilo čega drugog.** Sve iz P1-P10 je u radnom stablu bez
   ijednog commit-a; jedan `git checkout .` briše ~5400 linija.
4. **`.studio-run/` i `run-studio-day.ps1` nisu u `.gitignore`** - prvi
   `git add -A` ih uvlači u istoriju grane.
5. **Preporuka je "još jedan krug", ne "spremno".** Razlog je u jednoj rečenici
   na kraju izveštaja: kod je čist i testiran, ali tri mesta i dalje propuštaju
   novac, a zatvaraju se sa oko dva prompta.

## Z1 - Tri rupe iz NOVIH RUPA: cena po slici, javan katalog, kuponi   (19.08.2026 16:05-16:35)

**Fajlovi:**
- `convex/studioCore.ts` - nova `requestedImageCount`, `computeCreditCost`
  množi obe grane
- `convex/studio.ts` - `estimatedCostUsd` se množi pre plafona i pre upisa u
  `studioUsageDaily` (tri mesta), nov uvoz
- `convex/modelCatalog.ts` - `.map` projekcija na `listModels`
- `convex/creditsCore.ts` - `invoicePaidGrants` dobija obavezan `amountPaid`
- `app/api/stripe/webhook/route.ts` - kapija na `session.amount_total`,
  prosleđen `invoice.amount_paid`
- `lib/stripe.ts` - `allow_promotion_codes: false` na sesiji paketa i plana
- `lib/studio-form.ts` - nova `jobCreditCost` (+ privatna `requestedImageCount`),
  `initialParamValues` prima podrazumevan `"{}"`
- `components/app/studio-page.tsx` - cena na dugmetu prati "Broj slika",
  `defaultParams` više ne ulazi u `CatalogModel`
- `convex/studio.test.ts` - 4 nova testa, 1 ažuriran assertion
- `convex/modelCatalog.test.ts` - 1 nov test, 1 ažuriran assertion
- `convex/credits.test.ts` - 1 nov test, `amountPaid` na 6 postojećih poziva
- `app/api/stripe/webhook/route.test.ts` - 3 nova testa, `amount_total` u fixture-u
- `lib/stripe.test.ts` - 1 nov test, 1 ažuriran assertion
- `lib/studio-form.test.ts` - 2 nova testa
- `docs/STUDIO-PROGRESS.md` - ova sekcija

**Šta je uradjeno:**

**N1 - `num_images` se sad naplaćuje po slici.** `computeCreditCost` množi
rezultat brojem naručenih slika, u obe grane: fiksna cena postaje
`creditCost * n`, a cena po sekundi `ceil(costPerSecond * duration) * n`. Broj
se čita iz OČIŠĆENIH parametara (`requestedImageCount`), dakle iz istog objekta
koji ide fal-u, i podrazumeva se 1 kad polje ne postoji. `createJob` isto tako
množi `estimatedCostUsd` - i pre provere dnevnog plafona i pri upisu u
`studioUsageDaily.costUsd`, jer plafon koji broji cenu po pozivu nije plafon.
`num_images` ostaje u `paramSchema` sa `max: 4`, netaknut. Na dugmetu se cena
sada pomera odmah: `GenerateForm` gradi `buildJobParams` jednom po renderu i
istim objektom hrani i `jobCreditCost` (dugme) i `onSubmit` (`createJob`), pa
prikazana i naplaćena cifra ne mogu da se raziđu.

**N2 - `listModels` više ne vraća ceo red.** `.map` projekcija po uzoru na
`creditPacks.listPacks`: napolje idu `slug`, `kind`, `labelSr/En`,
`descriptionSr/En`, `creditCost`, `badge`, `paramSchema`, `sortOrder`.
`falEndpoint`, `estimatedCostUsd`, `provider` i `defaultParams` ostaju unutra.
Sva tri pozivaoca su proverena: galerija (`slug`, labele) i stranica kredita
(`kind`, `creditCost`, `badge`) ne gube ništa; playground je koristio
`defaultParams` za početne vrednosti forme, pa je tu popravljen. `listAllModels`
je netaknut.

**N3 - kupon od 100% više ne puni ledger.** Uradjeno je oboje:
`allow_promotion_codes: false` na sesiji paketa i sesiji plana, i provera
stvarno naplaćenog iznosa - `invoicePaidGrants` odbija fakturu bez
`amountPaid > 0`, a `grantCreditPackCredits` sesiju bez `amount_total > 0`.
Obe vrednosti sada dolaze iz `route.ts`; `amountPaid` je namerno OBAVEZNO polje,
pa ga `tsc` traži od svakog budućeg pozivaoca.

**ODLUKE:**
1. **N1 pretpostavlja da fal naplaćuje PO IZLAZNOJ SLICI, ne po zahtevu.** To
   nije provereno protiv živog fal API-ja. Cene iz plana §2.3 su po slici, pa je
   ovo konzervativan smer: ako se pokaže da fal naplaćuje po zahtevu, popravka
   je da se množenje ukloni (`requestedImageCount` ispada iz `computeCreditCost`
   i iz `createJob`-ovog `estimatedCostUsd`), a ne da se menja išta drugo.
2. **`requestedImageCount` nikad ne vraća manje od 1.** `sanitizeParams` danas
   podiže `num_images: 0` na `min: 1` iz šeme, ali šema bez `min`-a bi inače
   dala cenu 0 - dakle besplatnu generaciju. Zaštita je u funkciji koja računa
   novac, ne u šemi.
3. **U grani sa `costPerSecond` množi se ZAOKRUŽENA cena po klipu**
   (`ceil(c*d) * n`), ne obrnuto (`ceil(c*d*n)`). Razlika je najviše par
   kredita i uvek u korist kase; spec traži "množi rezultat".
4. **`costPerSecond` NIJE u projekciji `listModels`-a.** Spec ga uslovljava sa
   "ako ga UI koristi za prikaz cene" - ne koristi ga nijedna od tri stranice, a
   nijedan model sa tim poljem danas nije ni uključen (video je Faza B). Kad se
   video forma bude pisala, polje se dodaje tada.
5. **`isEnabled` takodje nije u projekciji, pa je postojeći assertion prepisan,
   ne obrisan.** `listModels vraća samo isEnabled modele` sada dokazuje istu
   stvar preko slugova: nijedan slug iz baze koji je isključen ne sme da se
   pojavi u odgovoru. Isto važi za `job?.creditCost` u testu očišćenih
   parametara (`MODEL_COST` -> `4 * MODEL_COST`) i za `allow_promotion_codes` u
   `lib/stripe.test.ts` (`true` -> `false`) - ta tri assertiona su nosila staro
   ponašanje koje je zadatak i menjao.
6. **`defaultParams` više ne stiže do forme, i to menja jednu sitnicu:**
   početne vrednosti kontrola sada padaju na prvu opciju odnosno `min` umesto na
   vrednost iz kataloga. Za današnji seed je ishod identičan (`aspect_ratio`
   default je "1:1", što je i prva opcija; `num_images` default je 1, što je i
   `min`). Ako admin sutra promeni `defaultParams` za polje koje je U ŠEMI,
   forma to neće pokazati - a `submitJob` i dalje spaja `defaultParams` ispod
   `job.params`, pa pinovana rezolucija i sve što nije u šemi rade nepromenjeno.
7. **Kapija na iznos sesije je u `grantCreditPackCredits` (ruta), ne u
   `creditPackGrants` (core).** Tako stoji odmah pored postojeće
   `payment_status` kapije, sa svojim `console.info`, i ne pravi lažan
   `console.error("...without usable metadata")` za sesiju čiji su metapodaci
   sasvim ispravni - samo je iznos nula.
8. **`createCourseCheckoutSession` (`lib/stripe.ts:40`) nije diran.** Spec
   imenuje "obe sesije" = paket i plan; kurs je postojeći subscription flow koji
   je i P1 ostavio na miru. Treći `allow_promotion_codes: true` i dalje stoji
   tamo i nije deo N3.
9. **`shortOnCredits` u roditelju i dalje poredi balans sa BAZNOM cenom
   modela.** Stanje `num_images` živi u `GenerateForm`-u, pa bi tačan uslov
   tražio podizanje tog stanja za nivo više. Posledica je uska: korisnik sa
   balansom izmedju bazne i pomnožene cene vidi dugme umesto ponude za dopunu,
   klikne, i dobije `NEDOVOLJNO_KREDITA` koji `studioErrorMessage` već lepo
   ispisuje. Novac ne curi - `createJob` odbija posao pre bilo kakvog upisa.

**Testovi:** 12 novih (394 -> 406), plus tri ažurirana assertiona iz odluke 5 i
`amountPaid` dodat na 6 postojećih poziva `invoicePaidGrants`-a (polje je
obavezno, pa je to posledica tipa, ne izmena tvrdnje).

N1 (`convex/studio.test.ts`, 4):
- `num_images: 4` naplaćuje `4 * MODEL_COST` - u poslu, u balansu, u `spend`
  transakciji i u `studioUsageDaily.creditsSpent`, a `costUsd` poraste za
  `4 * MODEL_COST_USD`;
- odsutan `num_images` ostaje na 1x (cena i `costUsd`);
- dnevni plafon troška: model od 2 $/slika obara posao sa `num_images: 4`
  (8 $ > 5 $) i propušta isti posao sa `num_images: 1` - dokaz da plafon broji
  pomnožen trošak;
- čista jedinica `computeCreditCost`: 1x/3x, netipičan i nulti ulaz padaju na 1,
  i `costPerSecond` grana (`27` -> `54` na dve slike).

N1 UI (`lib/studio-form.test.ts`, 2): dugme prikazuje `20/60/80 kr` za 1/3/4
slike (i `0` se podiže na `min`); `jobCreditCost` se poklapa sa serverskim
`computeCreditCost`-om za sve vrednosti iz šeme - isti obrazac unakrsne provere
kao `lib/studio-admin.test.ts`.

N2 (`convex/modelCatalog.test.ts`, 1): `listModels` ne vraća `falEndpoint`,
`estimatedCostUsd`, `provider` ni `defaultParams`, a i dalje vraća sve što ekran
crta; `listAllModels` i dalje vidi nabavnu cenu i endpoint.

N3 (`convex/credits.test.ts` 1, `app/api/stripe/webhook/route.test.ts` 3):
faktura sa `amountPaid: 0` ne dodeljuje ništa ni za `subscription_create` ni za
tri uzastopna ciklusa, `amountPaid: null` isto, a ista faktura sa stvarnom
uplatom i dalje dodeli punih 2000; na nivou rute - sesija sa `amount_total: 0`
ne zove Convex, `invoice.paid` sa `amount_paid: 0` ne zove Convex, a plaćena
faktura dodeli mesečnu dozu (ta grana do sada nije imala nijedan test na nivou
rute).

**Rezultat verifikacije:** sve četiri komande čiste, iz prvog pokušaja.
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`✖ 7 problems (0 errors, 7 warnings)`; istih 7
  zatečenih upozorenja u `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, nijedno iz Studio koda)
- `npm run test` - **prošlo** (`Test Files 41 passed (41) / Tests 406 passed
  (406)`), na podrazumevanom timeout-u
- `npm run build` - **prošlo** (`✓ Compiled successfully in 6.3s`,
  `Finished TypeScript in 11.7s`, 60/60 statičkih stranica, sve rute na broju)

**BLOKADA:** nema.

**Za Jovana:**
1. **Proveri kako fal stvarno naplaćuje `num_images` pre nego što ovo ode u
   produkciju.** Cela N1 popravka visi o toj jednoj činjenici (odluka 1). Ako
   naplaćuje po zahtevu, korisnik od danas plaća 4x više nego što treba za 4
   slike - a to je gora greška od one koju smo zatvorili.
2. **Kuponi su isključeni na oba mesta.** Kad budeš hteo kampanju, uključi
   `allow_promotion_codes` nazad - provera iznosa iz N3 ostaje i tada radi, pa
   kupon od 100% i dalje neće dodeliti kredite (verovatno tačno ponašanje za
   "besplatno probaj", ali odluči svesno).
3. **N4-N8 iz `docs/STUDIO-DAY-REPORT.md` su i dalje otvorene**, uključujući
   N8 (nema 18+ checkbox-a ni `/uslovi-studio` stranice) koji stoji izmedju
   tebe i prvog naplaćenog evra.
4. **Ovaj korak nije proveren u browseru** - menja cenu i projekciju, a obe se
   drže testovima; playground traži pokrenut Convex, upis u kurs i kredite.
   Kad sledeći put pokreneš demo, pogledaj samo jedno: da li strelica gore na
   polju "Broj slika" odmah pomeri cifru u dugmetu.

## S3 - BytePlus: Seedream 5 Pro i Seedance 2.0/2.5   (20.08.2026 01:44-02:10)

**Fajlovi:**
- `convex/providers/bytePlusCore.ts` - `buildVideoContent` prima ulaze razvrstane
  po slotu i šalje `--tier` za ne-podrazumevane tarife; nov tip
  `BytePlusVideoInputs` i konstanta `DEFAULT_SEEDANCE_TIER`
- `convex/providers/byteplus.ts` - `resolveInputUrls` vraća `{ images, videos }`
  sa limitom PO SLOTU; nov `isTaskPending` internalQuery; `verifyAndApplyTask`
  proverava posao PRE mrežnog poziva
- `convex/providers/byteplus.test.ts` - NOV, 27 testova
- `convex/studioParamSpec.test.ts` - NOV, 13 testova
- `convex/studioPricing.test.ts` - jedan ispravljen assertion (videti ODLUKA 1)
- `docs/STUDIO-PROGRESS.md` - ova sekcija

Zatečeno iz prekinutog S3 pokušaja (commit `2ffec3e`, "wip: stanje pre
kataloskog run-a") i NIJE pisano ispočetka: `lib/byteplus.ts`,
`convex/providers/bytePlusCore.ts`, `convex/providers/byteplus.ts`,
`convex/providers/bytePlusModels.ts`, ruta `/byteplus/webhook` u `convex/http.ts`,
`models` grana u `studioActions.submitJob` i BytePlus cenovni testovi u
`convex/studioPricing.test.ts`. Ovaj korak je to pročitao, popravio tri stvari
koje dodiruju novac i pokrio ceo tok testovima.

**Šta je uradjeno:**

**Callback se i dalje ne uzima zdravo za gotovo, ali sada ni ne košta.**
`verifyAndApplyTask` prvo pita bazu (`isTaskPending`) da li uopšte postoji posao
u `running`-u za taj `providerRequestId`, pa tek onda zove task endpoint. Bez
toga je "vrati 200 i ne uradi ništa" bilo netačno: nepoznat ID je i dalje
proizvodio poziv ka BytePlus-u, a callback nije potpisan - dakle bilo ko sa
našom putanjom je mogao da nam troši rate limit i kvotu. Provera verifikaciju ne
slabi: telo callback-a i dalje daje SAMO koji zadatak da proverimo, nikad kako
se završio, i to je pokriveno sa dva testa u oba smera.

**`tier` sada stiže do BytePlus-a - za Fast i Mini.** Zatečeni kod ga uopšte
nije slao, uz komentar da tarifu bira nalog. To je bila tiha rupa u kasi: Fast
(0,121 $/s) i Mini (0,077 $/s) su JEFTINIJI od Standarda (0,151 $/s), pa bi
korisnik plaćao Mini a BytePlus radio Standard - razliku plaćamo mi. Komanda
`--tier` se šalje samo kad tarifa nije `standard`, pa podrazumevan put ne može
da pukne na nepoznatu komandu, a jeftina tarifa ili radi tačno ili posao pukne i
refundira se. Tihog gubitka nema ni u jednom ishodu.

**Video referenca više ne ide kao slika.** `resolveInputUrls` je slotove trpao u
jedan niz, a `buildVideoContent` sve slao kao `image_url`. U `reference` režimu
sa videom se naplaćuje i ULAZNI video po sniženoj tarifi 0,6 (katalog 3.4) -
poslati ga kao sliku znači naplatiti ulaz koji model nikad nije dobio. Sada
slike idu kao `image_url`, video kao `video_url`, a limit od 10 fajlova važi PO
SLOTU, pa video ne ispada zato što je korisnik pre njega okačio deset slika.

**ODLUKE:**

1. **`convex/studioPricing.test.ts` je zatečen CRVEN i jedan assertion je
   ispravljen, ne obrisan.** Test je tvrdio da šesta referentna slika podiže
   račun za 18 kredita; stvarna razlika je 17. Oboje je tačno iz svog ugla:
   katalog (3.6) tu stavku vodi kao "+18 kredita", i to je cena SAME stavke
   (`ceil(0,08 x 216,25) = 18`), ali `computeCredits` po sekciji 1.3 radi `ceil`
   TAČNO JEDNOM nad ukupnom cenom (55 -> 72). Ispravljena je OČEKIVANA vrednost
   (18 -> 17) i dodat NOV assertion koji katalošku cifru i dalje pribija
   (`Math.ceil(0,08 x CREDIT_FACTOR) === 18`), pa test sada tvrdi obe stvari
   umesto jedne. Cena se nije menjala - menja se samo pogrešno očekivanje.
2. **`tier` se šalje kao tekstualna komanda (`--tier mini`), i to samo za
   ne-podrazumevane tarife.** Ark parametre za video prima kao komande
   nalepljene na prompt, ali za `tier` to nije potvrdjeno protiv živog API-ja
   (pravila zabranjuju poziv). Izbor je najkonzervativniji od tri moguća: ne
   slati ništa znači tih gubitak na svakom Fast/Mini poslu; slati uvek znači
   rizik da podrazumevan Standard posao pukne na nepoznatu komandu; slati samo
   za jeftine tarife ostavlja Standard netaknut, a najgori ishod na Fast/Mini je
   greška koja refundira. **Jovan mora ovo da proveri protiv fakture pre nego
   što otvori Fast i Mini** - vidi "Za Jovana".
3. **`layers` se i dalje šalje kao polje u telu `/images/generations`.** Nije
   dirano jer nije bilo načina da se potvrdi bez živog poziva, a greška u ovom
   smeru ne košta: ako polje ne postoji, BytePlus vrati grešku i posao se
   refundira. Naplata po sloju je nezavisno pokrivena testom.
4. **`MAX_INPUT_URLS` ostaje 10, ali sada PO SLOTU.** Seedance 2.5 po katalogu
   prima do 50 referenci, pa se preko desete i dalje tiho seče. Nije podizano
   jer gornju granicu po režimu drži `models.inputSpec` (do 50), a mesto koje tu
   granicu proverava je forma/`createJob` - to je posao S5/S7, ne ovog koraka.
   Ostaje kao poznato ograničenje, ne kao tvrdnja da je 10 dovoljno.
5. **`verifyAndApplyTask` sme da propusti callback koji pretekne
   `markJobRunning`.** Provera `isTaskPending` gleda posao u `running`-u, a
   izmedju `createBytePlusVideoTask` i `markJobRunning` postoji uzan prozor u kom
   posao još nema `providerRequestId`. Rizik je prihvaćen svesno: BytePlus javlja
   SVAKU promenu statusa, pa taj posao pokupi sledeći callback, a u najgorem
   slučaju `crons.reapStuckJobs` posle 30 minuta refundira. Alternativa (bez
   provere) otvara nepotpisanu putanju za pozive na tudji račun.
6. **`import.meta.glob` u `convex/providers/byteplus.test.ts` ide od korena
   projekta (`/convex/**/*.ts`), ne relativno.** Relativan oblik iz
   poddirektorijuma (`../**/*.ts`) NE zahvata sam taj poddirektorijum, pa
   `convex-test` scheduler pada sa `Could not find module for:
   providers/byteplus`. Zapisano i kao komentar u fajlu da se ne "popravi" nazad.
7. **Cena po sekundi za Seedance 2.5 na 1080p ostaje 124 kredita, ne 125 kako
   piše u tekstu kataloga.** Ovu odluku je doneo prethodni (prekinut) pokušaj i
   ona je zadržana: JSON pravilo je izvor istine po sekciji 1.3, a
   `ceil(0,569 x 216,25) = 124`. Nijedna cifra iz JSON tabela nije menjana.
8. **`createJob` i dalje računa cenu preko STAROG `modelCatalog`-a.** v4 pravila
   (`models.priceRule`) su kompletna i dokazana testovima, ali ih još niko ne
   zove pri pravljenju posla - `createJob` traži slug u `modelCatalog`-u i računa
   `computeCreditCost`. To znači da BytePlus model danas ne može da se naruči sa
   stranice dok mu slug ne stoji u OBE tabele. Nije rešavano ovde jer je
   prespajanje `createJob`-a na `models` posao seed-a i UI-ja (S5/S7), a
   dodirivalo bi ceo postojeći tok naplate. Ovo je najveća otvorena stavka posle
   ovog koraka i stoji i u "Za Jovana".

**Testovi:** 40 novih (433 -> 473), plus jedan ispravljen i jedan dodat
assertion iz ODLUKE 1.

`convex/providers/byteplus.test.ts` (27) - ceo tok, BytePlus se ne zove uživo
nijednom (svaki `fetch` je stub koji beleži šta je poslato):
- **verifikacija putanje:** `challenge` se vraća NEPROMENJEN sa 200, i to bez
  ijednog čitanja baze i bez ijednog mrežnog poziva (rok je 3 sekunde); obična
  poruka o statusu NE dobija challenge odgovor; telo bez `challenge` polja
  (prazan objekat, ne-JSON, prazan string) nema šta da vrati, pa verifikacija
  kroz njega ne prolazi;
- **nepoznat `providerRequestId`:** 200, nula poziva ka BytePlus-u, posao ostaje
  `running`, nula refundova; isto i za posao koji više nije `running`;
- **telo nije izvor istine, u oba smera:** callback koji tvrdi `succeeded` ne
  prolazi kad task endpoint kaže `failed` (posao refundiran, bez `falOutputUrl`),
  i callback koji tvrdi `failed` ne refundira kad endpoint kaže `succeeded`;
- **dupli callback menja posao TAČNO JEDNOM:** isti `completedAt`, isti balans,
  jedan zakazan `persistOutput`, i samo JEDAN poziv ka BytePlus-u - drugi pada na
  proveri pre mreže;
- **greška refundira tačno jednom:** `failed` i `cancelled` daju jednu `refund`
  transakciju i vraćen balans, a ponovljen callback to ne menja; `succeeded` bez
  URL-a ne obara posao u `done` i ne refundira ga;
- **predaja:** Seedream 5 Pro ide sinhrono `reserved -> done` (nikad kroz
  `running`) sa tačnim telom (`model`, `size`, `n`, `watermark: false`); Seedance
  ide asinhrono u `running` sa `callback_url` na `/byteplus/webhook`;
- **tarifa:** Standard ne šalje `--tier`, Fast i Mini ga šalju, i Mini posao ga
  stvarno nosi u zahtevu koji ide BytePlus-u;
- **video referenca:** okačen video stiže kao `video_url`, slika kao `image_url`;
- **neuspesi u predaji refundiraju tačno jednom, bez mrežnog poziva:** bez
  `BYTEPLUS_API_KEY`, bez `BYTEPLUS_BASE_URL`, na režim koji model nema
  (`NEDOZVOLJEN_REZIM`), i na 500 sa BytePlus-a; posao koji nije `reserved` se ne
  predaje drugi put.

`convex/studioParamSpec.test.ts` (13) - kapija izmedju forme i provajdera:
- Mini nudi samo 480p i 720p, a 1080p nudi samo Standard - u oba smera, iz
  cenovnog pravila, bez ijednog spiska zabrana u kodu;
- **Mini + 1080p se ODBIJA na serveru** (`NEDOSTUPNA_KOMBINACIJA` sa imenima
  parametara u poruci), isto i Mini + 4K, dok Mini + 720p prolazi;
- vrednost van skupa opcija se odbija a ne odseca; trajanje se odseca na min/max
  ali se van reda veličine odbija; izostavljeni parametri se popunjavaju
  podrazumevanim vrednostima pre nego što se cena uopšte traži;
- `layers` postoji samo u `layerize` režimu a `num_images` samo van njega, i
  `num_images` poslat u `layerize` tiho ispada; broj slojeva se drži u 2-17;
- `paramSpec` preživi put kroz bazu kao JSON string.

Zatečeni testovi u `convex/studioPricing.test.ts` (27) su ostavljeni i sada
prolaze; oni pokrivaju layerize sa 8 slojeva = 8x, množilac 0,6 za referencu sa
videom (uključujući naplatu i ulaznog i izlaznog videa preko
`referenceVideoBillableSeconds`), tabele iz kataloga 2.6/3.4/3.5 i invarijantu
marže >= 1,0 nad preko 400 kombinacija.

**Rezultat verifikacije:** sve četiri komande čiste.
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`17 problems (0 errors, 17 warnings)`; nijedno
  upozorenje nije iz fajlova ovog koraka - 7 su zatečena iz
  `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, 9 su nekorišćeni uvozi u `convex/crons.ts`
  koje je ostavio prekinut S0, 1 je u `get_google_creds.js`)
- `npm run test` - **prošlo** (`Test Files 44 passed (44) / Tests 473 passed (473)`)
- `npm run build` - **prošlo** (`Compiled successfully in 9.2s`,
  `Finished TypeScript in 17.7s`, 60/60 statičkih stranica)

Za red reči: zatečeno stanje grane na početku ovog koraka NIJE bilo zeleno -
`npm run test` je davao `2 failed | 431 passed (433)`. Jedan pad je bio assertion
iz ODLUKE 1, drugi `convex/chat.test.ts > inbox summary stays exact beyond one
thousand memberships` sa `Test timed out in 5000ms` (test radi 1 105 članstava i
traje ~9,9 s na ovoj mašini). Taj test u punom prolazu prolazi i nije diran - to
je ista nestabilnost pod opterećenjem koju je zabeležio i
`docs/STUDIO-DAY-REPORT.md`.

**BLOKADA:** nema.

**Za Jovana:**
1. **$30 na BytePlus nalogu PO SEEDANCE MODELU - $60 za oba**, i taj novac je
   zaključan dok su modeli aktivni. Seedream 5 Pro nema taj uslov. Bez toga
   Seedance 2.0 i 2.5 ne rade, ma šta kod radio.
2. **Aktiviraj sva tri modela u BytePlus konzoli** i proveri da li Seedance nosi
   oznaku **"Restricted Model"**. Ako nosi, spisak zemalja na kome je Srbija NE
   važi za njega i ceo Seedance deo kataloga pada - to proveri PRE nego što
   uplatiš $60.
3. **Postavi dve Convex env varijable** (ovaj run ih po pravilima nije
   postavljao): `BYTEPLUS_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3`
   i `BYTEPLUS_API_KEY`. Obe su obavezne i bez njih posao ne pukne tiho nego se
   refundira sa doslovnom porukom koja kaže koja fali.
4. **Prijavi `/byteplus/webhook` u konzoli.** Puna putanja je
   `<CONVEX_SITE_URL>/byteplus/webhook`. Prvi zahtev je verifikacioni i mi na
   njega odgovaramo `challenge`-om nepromenjeno; ako konzola javi da verifikacija
   nije prošla, prvo proveri da si stavio `.site` domen a ne `.cloud`.
5. **Pusti po JEDNU generaciju na Fast i na Mini i pročitaj fakturu** pre nego
   što te dve tarife pustiš korisnicima (ODLUKA 2). Ako se na fakturi vidi
   Standard cena, `--tier` komanda nije prošla i te dve opcije moraju da se
   sakriju dok se ne nadje pravi kanal. Standard je bezbedan i bez te provere.
6. **Pusti jednu `layerize` generaciju** i proveri da je BytePlus stvarno vratio
   slojeve (ODLUKA 3). Naplata po sloju je testirana, ali oblik zahteva nije
   potvrdjen protiv živog API-ja.
7. **BytePlus modeli se još ne mogu naručiti sa stranice** (ODLUKA 8):
   `createJob` traži slug u starom `modelCatalog`-u, a nova cenovna pravila žive
   u `models`. Prespajanje je posao S5/S7 - ne pokušavaj demo sa Seedance-om pre
   toga.
8. **Dve stvari koje su ostale za sobom iz ranijih koraka, nisu iz S3:**
   `convex/crons.ts` ima 9 nekorišćenih uvoza (globalni plafon troška iz S0 nije
   dovršen), a `docs/STUDIO-PROGRESS.md` nema sekcije za S1 i S2 - oba ta koraka
   su po logu izašla sa greškom iako je kod ostao u grani.

## S4 - Google video: Veo 3.1 Fast, Gemini Omni i poller   (20.08.2026 02:15-02:45)

**Fajlovi:**
- `lib/google-video.ts` - NOV. Tanak fetch-klijent: `readGoogleConfig`,
  `startGoogleOperation` (Veo `predictLongRunning` i Omni `/interactions`),
  `fetchGoogleOperation`, `parseOperation`, prepoznavanje kvotne greške.
- `convex/providers/googleCore.ts` - NOV. Čista logika: `buildVeoRequest`,
  `buildOmniRequest`, tri ograničenja Omnija (`omniInputRestriction`),
  `googleDownloadHeaders`, `toBase64`.
- `convex/providers/google.ts` - NOV. `submitGoogleJob`, `listPollableGoogleJobs`,
  `pollGoogleVideoJobs` (cron akcija), `applyOperationResult`.
- `convex/providers/googleModels.ts` - NOV. Četiri reda za `models`:
  `veo-31-lite` (fal), `veo-31-fast` (google), `veo-31` (fal), `gemini-omni` (google).
- `convex/providers/modelSeed.ts` - NOV. Zajednički tip reda kataloga.
- `convex/providers/jobInputs.ts` - NOV. `parseJobInputs` preseljen iz
  `bytePlusCore.ts` (drugi pozivalac; funkcija ne zna ni za jednog provajdera).
- `convex/providers/google.test.ts` - NOV, 30 testova.
- `convex/crons.ts` - registrovan četvrti cron, na 1 minut.
- `convex/studioActions.ts` - grana za `provider: "google"` u `submitJob`;
  `persistOutput` skida Google izlaz sa `x-goog-api-key` zaglavljem.
- `convex/studioActions.test.ts` - jedan assertion proširen (videti ODLUKA 6).
- `convex/providers/bytePlusCore.ts`, `bytePlusModels.ts`, `byteplus.ts`,
  `byteplus.test.ts` - samo posledice dva preseljenja (`parseJobInputs`, tip reda).
- `docs/STUDIO-PROGRESS.md` - ova sekcija.

**Šta je uradjeno:**

**Poller - jedina nova mašinerija u katalogu.** Google za video nema
webhookove: `submitGoogleJob` dobije ime operacije, upiše ga u
`providerRequestId` i posao ide u `running`. Cron `studio: google poller` na
svakih minut (Convex minimum) pročita `running` poslove čiji je model iz
`models` sa `provider: "google"`, pita Google za stanje, i gotov posao vodi u
`done` + `persistOutput`, a neuspeo u `failJob` (koji refundira). Postojeći
`reapStuckJobs` nije diran i ostaje mreža ispod pollera - posao koji poller iz
bilo kog razloga promaši refundira se posle 30 minuta.

**Veo je tri reda, ne jedan.** `provider` je polje reda, pa tarifa koja menja
rutu mora da bude zaseban red: Lite i Standard su kod fal-a parity i ostaju
tamo, Fast ide direktno jer fal na njemu uzima 17-50%. Lite u `inputModes` i
`endpoints` **nema** ni `reference` ni produžavanje - režim koji ne postoji u
redu ne može ni da se naruči (`NEDOZVOLJEN_REZIM`), pa nema spiska zabrana u
kodu. Sve tri cenovne tabele iz kataloga 3.7 su prepisane doslovno i pokrivene
testom koji tvrdi kr/s po ćeliji.

**Gemini Omni ide na Interactions API, ne na `generateContent`**, i njegova tri
ograničenja su poruka, ne tiha greška: stoje kao `restrictionsSr`/`restrictionsEn`
u `capabilities` (odakle ih forma prikazuje **pre** nego što korisnik okači
fajl), a isti tekst se koristi doslovno kao greška posla ako zahtev ipak stigne.
Rezolucija je fiksnih 720p i namerno **nije** kontrola - kontrola sa jednom
opcijom laže da ima izbora; stoji u `capabilities` kao podatak. Kvotna greška
(HTTP 429 ili `RESOURCE_EXHAUSTED` u operaciji) refundira i kaže zašto, na oba
mesta gde može da se pojavi - pri predaji i pri ispitivanju.

**ODLUKE:**

1. **Oblik zahteva i odgovora NIJE potvrdjen protiv živog Google API-ja** -
   pravila run-a zabranjuju poziv. Zato je sve što se šalje na jednom mestu
   (`googleCore.buildVeoRequest` / `buildOmniRequest`), sve što se čita u
   `lib/google-video.parseOperation`, a ID modela kod provajdera je polje reda
   (`endpoints`), pa se menja iz admin ekrana bez deploy-a. Izabrani ID za Veo
   Fast je `veo-3.1-fast-generate-preview` (Google-ov obrazac imenovanja);
   katalog ga ne propisuje, za razliku od `gemini-omni-flash-preview` koji
   propisuje. `parseOperation` čita izlazni URL **rekurzivno**, a ne po jednoj
   tačnoj putanji, jer se ista operacija u dokumentaciji pojavljuje u tri oblika
   i nijedan nije mogao da se proveri.
2. **Izmena OKAČENOG videa kod Omnija se odbija unapred, sa porukom.** Katalog
   kaže da nije dozvoljena iz EEA/Švajcarske/UK. Odakle je korisnik ne znamo i
   ne možemo pouzdano da utvrdimo, pa je najkonzervativniji izbor odbiti pre
   mreže i reći tačno zašto (posao se refundira, Google nije ni pozvan).
   Izmena videa koji je model sam napravio time nije zatvorena - ona ide preko
   `previous_interaction_id`, ne preko okačenog fajla.
3. **`previous_interaction_id` se prosledjuje ako postoji, ali ga danas niko ne
   postavlja.** Višekružna izmena traži polje koje vezuje nov posao za prethodni,
   a `generationJobs` ga nema; dodavanje polja je izmena šeme koja pripada S5,
   ne ovom koraku. Zato `video` režim Omnija za sada radi samo kroz to buduće
   vezivanje, a okačen fajl dobija poruku iz ODLUKE 2.
4. **Poller čita 200 `running` poslova po prolazu, a ispituje najviše 25.**
   Ostali cronovi imaju budžet 100, ali su njihove stavke upisi u bazu, a ovde
   je svaka stavka jedan HTTPS poziv. Kroz `by_status_created` prolaze i fal i
   BytePlus poslovi, pa se čita šire nego što se ispituje; indeks ide od
   najstarijeg, a najstariji `running` je i najverovatnije gotov. Ostatak sačeka
   sledeći minut. Granice su argumenti akcije sa podrazumevanim vrednostima iz
   konstanti, pa ih test proverava bez diranja konstante.
5. **Mrežna greška pri ispitivanju NE refundira, i gotova operacija bez izlaza
   NE refundira.** 500 ili 429 na `GET`-u znači "ne znam stanje", a ne "posao je
   propao" - refund bi vratio kredite za generaciju koju Google možda i naplati.
   Isto važi za operaciju koja je gotova a nemamo URL: pošto oblik odgovora nije
   potvrdjen (ODLUKA 1), jedan promašen ključ bi tiho vraćao kredite za uspešne
   generacije. Oba slučaja se loguju, a posao pokupi reaper. Isti izbor koji je
   S3 napravio za `succeeded` bez URL-a.
6. **`persistOutput` je dobio zaglavlje `x-goog-api-key`, i to samo za
   `generativelanguage.googleapis.com`.** Google izlaz bez ključa vrati 403, pa
   bi posao ostao `done` bez fajla - plaćen, a neisporučen. fal i BytePlus daju
   potpisan URL i njihov `fetch` ključ ne vidi (`googleDownloadHeaders` vraća
   prazan objekat). Zatečen test u `studioActions.test.ts` je tvrdio
   `toHaveBeenCalledWith(FAL_URL)`; assertion **nije obrisan nego proširen** na
   `(FAL_URL, { headers: {} })`, pa sada tvrdi i da fal URL ne dobija naš Google
   ključ - dakle više nego pre.
7. **`parseJobInputs` je preseljen u `convex/providers/jobInputs.ts`**, a tip
   reda kataloga u `convex/providers/modelSeed.ts` (`BytePlusModelSeed` je sada
   sužen alias). Oba su bila napisana u S3 za jednog provajdera, a ovaj korak je
   drugi pozivalac; duplirati ih znači dva mesta koja se razilaze.
8. **Veo Lite i Standard su definisani ovde iako idu na fal.** Prompt izričito
   traži tri reda i traži da Lite u `inputModes` nema `reference` ni extend.
   Fajl je jedan jer je porodica jedna; `provider` je polje reda i to je jedina
   razlika izmedju ta tri.
9. **`reference` prima do 3 slike kod Veo-a i kod Omnija, bez audio slota.**
   Katalog za te modele ne daje broj (sekcija 5 daje opšti gornji okvir 9+3+3),
   pa je uzeta konzervativna vrednost; audio slota nema jer upload audio
   referenci kod Omnija ne radi.
10. **Trajanje je DVE kontrole sa istim ključem, razdvojene po `showInModes`:**
    4-8 s u režimima klipa i 4-30 s u `video` režimu (produžavanje, katalog 3.7).
    U datom režimu vidi se tačno jedna, pa forma i `sanitizeSpecParams` gledaju
    istu granicu.
11. **Nema mock provajdera za Google**, isto kao za BytePlus: bez
    `GOOGLE_AI_API_KEY` posao se refundira sa doslovnom porukom koja kaže koja
    varijabla fali. Mock (`STUDIO_MOCK`) i dalje pokriva samo fal put.
12. **Google SLIKE nisu povezane.** Korak S2 (Nano Banana 2 i Pro, sinhrono) po
    logu nije isporučio kod - u grani ne postoji ni `lib/google-images.ts` ni
    google grana za slike. Zato `submitGoogleJob` model sa `kind !== "video"`
    odbija odmah, porukom `GOOGLE_SLIKE_NISU_POVEZANE`, umesto da ga poller
    doveka ispituje. To je posao za ponovljen S2, ne za ovaj korak.
13. **`createJob` i dalje računa cenu preko starog `modelCatalog`-a** (zatečeno
    iz S3, ODLUKA 8). Google modeli se, kao ni BytePlus, još ne mogu naručiti sa
    stranice - prespajanje je S5/S7.

**Testovi:** 30 novih (473 -> 503), u `convex/providers/google.test.ts`. Google
se ne zove uživo nijednom - svaki `fetch` je stub koji beleži šta je poslato.

- **poller:** gotova operacija vodi posao u `done`, upisuje izlaz i skida ga
  **sa ključem** u zaglavlju · neuspela operacija refundira TAČNO JEDNOM (drugi
  prolaz posao uopšte ne pokupi jer više nije `running`) · kvotna greška u
  operaciji refundira sa porukom o kvoti · posao koji nije `running` se ne
  ispituje (ni `reserved` ni `done`, nula mrežnih poziva) · poslovi drugih
  provajdera se ne diraju · **batch limit se poštuje** (3 posla, limit 2, dva
  poziva) · 500 pri ispitivanju NE refundira, posao ostaje u letu · gotova
  operacija bez izlaza i bez greške ostaje u letu.
- **predaja:** Veo Fast ide na `predictLongRunning` sa ključem u ZAGLAVLJU (ne u
  URL-u) i završi u `running` sa imenom operacije · Omni ide na `/interactions`
  i go `id` dobija kolekciju · **Omni izmena okačenog videa vraća jasnu grešku
  za zabranjen region, bez ijednog poziva, i refundira** · kvotna greška pri
  predaji (429) refundira sa porukom · bez `GOOGLE_AI_API_KEY` refund pre mreže
  · režim koji model nema se odbija · posao koji nije `reserved` se ne predaje
  drugi put.
- **telo zahteva:** `resolution`/`duration`/`audio` ulaze u zahtev isto kao u
  cenu · `first_last` šalje oba kadra, a bez drugog traži "Dodaj završni kadar"
  · `reference` šalje sve slike · Omni šalje fiksnih 720p, odnos stranica i
  trajanje.
- **čitanje operacije:** tri oblika odgovora (LRO `done`, `state: COMPLETED`,
  nedovršena) · greška je gotova operacija · `RESOURCE_EXHAUSTED` se prepoznaje
  kao kvota · putanja koja nije ime Google resursa se odbija PRE mreže ·
  `googleDownloadHeaders` daje ključ samo Google hostu.
- **katalog:** kr/s za sva tri Veo reda i za Omni tačno kao u katalogu 3.7/3.8
  (7/11/11/18 · 22/26/65 · 44/87/130 · 22 kr/s i 110 za 5 s) · Lite nema 4K ni
  `reference` ni extend, Fast ima · Omni nema audio slot ni `first_last` i nosi
  tekst ograničenja · svaki režim iz `inputModes` ima `endpoint` i `inputSpec`,
  i svaka vrednost iz `lookup` mape postoji kao opcija.

**Rezultat verifikacije:** sve četiri komande čiste.
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`17 problems (0 errors, 17 warnings)`; nijedno
  upozorenje nije iz fajlova ovog koraka - 7 zatečenih u
  `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, 9 nekorišćenih uvoza u `convex/crons.ts` koje
  je ostavio nedovršen S0, 1 u `get_google_creds.js`)
- `npm run test` - **prošlo** (`Test Files 45 passed (45) / Tests 503 passed (503)`)
- `npm run build` - **prošlo** (`Compiled successfully in 6.4s`,
  `Finished TypeScript in 13.5s`, `Generating static pages (60/60)`)

**BLOKADA:** nema.

**Za Jovana:**
1. **Postavi `GOOGLE_AI_API_KEY` u Convex env** (ovaj run po pravilima ne
   postavlja env). `GOOGLE_AI_BASE_URL` je opciona i podrazumevano je
   `https://generativelanguage.googleapis.com/v1beta` - Google ima jedan globalni
   endpoint, pa nema zamke sa regionom kakvu ima BytePlus. Bez ključa se Google
   posao ne gubi tiho: refundira se sa porukom koja imenuje varijablu.
2. **Poller ulazi u raspored tek prvim `npx convex deploy`.** Do tada Google
   posao ostane u `running`-u dok ga reaper ne refundira posle 30 minuta.
3. **Pusti po JEDNU generaciju na Veo Fast i na Gemini Omni i pogledaj sirov
   odgovor** (Convex dashboard -> Logs). Tri stvari se proveravaju, sve tri iz
   ODLUKE 1: da li je ID modela `veo-3.1-fast-generate-preview` tačan, kako
   izgleda telo koje Interactions API prima, i pod kojim ključem stiže URL
   izlaznog videa. Ako u logu vidiš `operacija ... je gotova bez izlaza i bez
   greške`, poller je našao gotovu operaciju ali ne i URL - tada se menja samo
   `parseOperation`, a posao je u medjuvremenu refundiran preko reaper-a.
4. **Proveri da li skidanje izlaza stvarno traži ključ.** Šaljemo
   `x-goog-api-key` samo za Google host; ako se ispostavi da je URL potpisan i
   da ključ smeta, to je jedan red u `googleCore.googleDownloadHeaders`.
5. **Oba modela su u javnom pregledu sa uskom kvotom.** Kvotna greška refundira
   i kaže zašto, ali ako je kvota stalno prazna, ta dva reda su bolje isključena
   nego da korisnik dobija refund umesto videa. Kvotu vidiš u Google AI Studio
   konzoli.
6. **Veo Lite i Standard idu na fal i traže `FAL_KEY`**, a ne Google ključ - to
   su isti model i ista porodica, ali druga ruta i drugi račun.
7. **Google modeli se još ne mogu naručiti sa stranice** (ODLUKA 13), isto kao
   BytePlus - `createJob` traži slug u starom `modelCatalog`-u. Ne pokušavaj
   demo sa Veo-om pre S5/S7.
8. **Nije iz S4, ostalo za sobom:** `convex/crons.ts` i dalje ima 9
   nekorišćenih uvoza (globalni plafon troška iz S0 nije dovršen), a
   `docs/STUDIO-PROGRESS.md` i dalje nema sekcije za S1 i S2 - S2 uz to nije ni
   isporučio kod (ODLUKA 12), pa Google slike treba ponovo naručiti kao korak.

## S5 - Seed kataloga: 30 modela sa parametrima i cenama   (20.08.2026 02:45-03:10)

**Fajlovi:**
- `convex/providers/modelControls.ts` - NOV. Kontrole koje se ponavljaju kroz
  ceo katalog (prompt, rezolucija, trajanje, broj slika, odnos stranica, zvuk),
  MIME liste i tip `QuantitySource`.
- `convex/providers/googleImageModels.ts` - NOV. `nano-banana-2`, `nano-banana-pro`.
- `convex/providers/falImageModels.ts` - NOV. `gpt-image-2`, `gpt-image-15`,
  `seedream-45`, `seedream-5-lite`.
- `convex/providers/falVideoModels.ts` - NOV. `kling-3`, `kling-3-turbo`,
  `kling-omni`, `minimax-h3`.
- `convex/providers/falToolModels.ts` - NOV. `kling-avatar`, `kling-lipsync`,
  `kling-motion`, `kling-tryon`, `kling-v2a`.
- `convex/providers/falAudioModels.ts` - NOV. `tts`, `dialogue`, `sfx`, `music`,
  `stt`, `voice-changer`, `audio-isolation`, `dubbing`.
- `convex/providers/catalogModels.ts` - NOV. `STUDIO_MODELS` - svih 30 redova na
  jednom mestu, poredjani po `sortOrder`-u.
- `convex/studioModels.ts` - dodata mutacija `seedStudioModels` (idempotentna,
  iza `requireSyncSecret`).
- `convex/studioPricing.ts` - `QUANTITY_PER_UNIT`: `chars1k` deli količinu sa
  1 000 (zamka 10 iz S5.md). Ostale jedinice su nepromenjene (deli se sa 1).
- `scripts/seed-convex.mjs` - `npm run convex:seed` sada upisuje i katalog v4.
- `convex/providers/catalogModels.test.ts` - NOV, 21 test (oba obavezna).
- `convex/studioModels.test.ts` - NOV, 4 testa (seed kroz `convex-test`).
- `convex/studioPricing.test.ts` - dodat jedan test za `chars1k`.
- `docs/STUDIO-PROGRESS.md` - ova sekcija.

**Šta je uradjeno:**

**Katalog je kompletan: 30 redova, ne 110 slugova.** Za svaki model su napisani
`paramSpec`, `priceRule`, `inputSpec`, `endpoints` i `capabilities`; cene su
prepisane iz `docs/STUDIO-CATALOG-V4.md` doslovno i nijedna nije preračunata.
Redovi koje su doneli S3 i S4 (Seedream 5 Pro, Seedance 2.0/2.5, tri Veo reda,
Gemini Omni) nisu dirani - `catalogModels.ts` ih samo uključuje u isti niz, i
test to tvrdi identitetom objekta, pa se izvor ne može tiho razići.

**Zabrane nisu spiskovi u kodu nego rupe u cenovnoj mapi.** Kling kontrola glasa
bez zvuka, Kling Turbo na 4K, Nano Banana Pro na 1K i Seedance Mini na 1080p ne
postoje kao ključ u `lookup` mapi, pa ih `isCombinationPriceable` odbija i u
formi i na serveru iz istog izvora. Isto važi za rezoluciju koja zavisi od
režima: Turbo radi prvi i poslednji kadar samo u 720p, i to je druga kontrola sa
istim ključem i `showInModes: ["first_last"]` - isti obrazac koji je S4 uveo za
trajanje produžetka, a ne `if (mode === ...)` negde u UI-ju.

**Količina koja se meri, a ne bira.** Kling avatar se naplaćuje po sekundi
okačenog zvuka, lipsync i prenos pokreta po sekundi okačenog videa,
transkripcija i sinhronizacija po minutu snimka, a TTS po znaku ukucanog teksta.
Te količine nisu kontrole - da jesu, klijent bi prijavio minut a okačio sat.
Stoje u `capabilities.quantity` (tip `QuantitySource`), server ih upisuje pre
`computeCredits`-a, isto kao `input_images` kod Seedream-a, a test doslednosti
tvrdi da svaki `quantityParam` ima ili kontrolu ili merilo.

**`chars1k` je jedina promena u cenovnom motoru.** ElevenLabs tarifa je $0,10 po
HILJADI znakova, a `quantityParam` je broj znakova (zamka 10), pa `computeCostUsd`
količinu svodi na jedinicu pravila. Svaka druga jedinica se deli sa 1 i ponaša
se identično kao pre; nepoznata jedinica takodje pada na 1, jer je bolje
naplatiti po izmerenoj jedinici nego deliti nečim što ne znamo.

**ODLUKE:**

1. **Katalog ima 30 redova, ne 31.** S5.md piše "Video (11)" ali nabraja deset
   slugova (`kling-3`, `kling-3-turbo`, `kling-omni`, `minimax-h3`, `veo-31-lite`,
   `veo-31`, `veo-31-fast`, `gemini-omni`, `seedance-20`, `seedance-25`).
   Ubačeni su svi nabrojani, nijedan nije izmišljen da bi se stiglo do jedanaest:
   7 modela za slike + 10 video + 5 Kling alata + 8 audio = **30**, što je i
   cifra iz kataloga (sekcija 8). Puna lista sa brojem kombinacija je na kraju
   ove sekcije.
2. **`kind` opisuje IZLAZ, ne ulaz.** Galerija i filteri crtaju po `kind`-u, pa
   `kling-tryon` (izlaz je slika) ide kao `image`, a `kling-v2a` (izlaz je
   zvučni zapis) kao `audio`. Zato je podela po `kind` polju 8 / 13 / 9, a po
   nameni 7 / 10 / 5 / 8. `kling-v2a` je jedina stavka gde oblik izlaza nije
   potvrdjen protiv živog API-ja - videti "Za Jovana".
3. **`1024x768` je dodat kao opcija kod GPT Image 2.** Katalog u tekstu nabraja
   šest dimenzija, ali `lookup` mapa ima sedam - i tu sedmu (`1024x768`) na sva
   tri nivoa kvaliteta. Mapa je izvor istine (sekcija 1.3), pa je dodata OPCIJA
   umesto da se briše cena: doslednost traži da svaka vrednost koju `lookup`
   očekuje postoji kao izbor, a ta ćelija je uz to i jeftinija od portreta.
   Nijedan broj iz mape nije menjan.
4. **Gde se tekst kataloga i JSON pravilo razilaze, pravilo pobedjuje.** To je
   ista odluka koju je doneo S3 (ODLUKA 7) i ovde se ponavlja jer se tiče sedam
   mesta. Sve razlike su posledica zaokruživanja u tekstu i sve idu u korist
   korisnika (naplaćuje se manje nego što tekst kaže), a marža ostaje iznad 1,0
   u svakoj:
   - `seedream-45`: tekst 10 kredita, pravilo `ceil(0,04 x 216,25) = 9`;
   - `tts` i `dialogue`: tekst 25 po 1 000 znakova, pravilo 22;
   - `stt`: tekst 3 po minutu, pravilo 2;
   - `kling-lipsync`: tekst "4 kr/s, minimum 20", pravilo 16 za pet sekundi;
   - `gpt-image-15` high 1024²: tekst 30, pravilo 29;
   - `gpt-image-*` low tarifa: tekst "od 3", pravilo 2;
   - kolona "5s" kod Klinga: tekst množi ZAOKRUŽENU sekundu (28 x 5 = 140), a
     sekcija 1.3 traži `ceil` tačno jednom nad ukupnom cenom (137). Isto kao kod
     Seedance-a, gde je katalog već tabelirao 33 kr/s i 164 za pet sekundi.
5. **Fal rute sa `{tier}` placeholderom.** Katalog za Kling 3.0 daje
   `v3/{tier}/text-to-video`, gde tarifa NIJE kvalitet nego rezolucija. Endpoint
   je zato ostavljen sa placeholderom, a `capabilities.tierByResolution` kaže
   šta se u njega upisuje (`720p -> standard`, `1080p -> pro`, `4K -> pro`).
   Test tvrdi da placeholder ne može da ostane bez mape, i da nijedna opcija
   rezolucije nije ostala bez tarife. Ruta za 4K nije potvrdjena (pravila
   zabranjuju živi poziv) - videti "Za Jovana".
6. **ID-jevi kod provajdera koje katalog ne propisuje su izabrani konzervativno
   i ostaju polje reda.** Katalog doslovno daje samo neke (`gemini-3.1-flash-image`,
   `gemini-3-pro-image`, `openai/gpt-image-2`, `minimax/h3/*`,
   `fal-ai/elevenlabs/*`). Ostali su izvedeni po obrascu porodice:
   `openai/gpt-image-1-5`, `fal-ai/bytedance/seedream/v4.5/edit`,
   `fal-ai/bytedance/seedream/v5/lite/*`, `fal-ai/kling-video/v3/...`,
   `fal-ai/kling-video/v3/turbo/...`, `fal-ai/kling-video/o3/...`,
   `fal-ai/kling-video/v1/pro/ai-avatar`, `fal-ai/kling-video/lipsync`,
   `fal-ai/kling-video/motion-transfer`, `fal-ai/kling/v1-5/kolors-virtual-try-on`,
   `fal-ai/kling-video/v2a`. Svi su u `endpoints` polju reda, pa se menjaju iz
   admin ekrana bez deploy-a; pogrešan ID daje grešku i refund, ne tihi trošak.
7. **Spiskovi koje katalog broji ali ne nabraja su popunjeni konzervativno.**
   MiniMax ima "7 opcija" odnosa stranica bez liste - uzeto je sedam uobičajenih
   (16:9, 9:16, 1:1, 4:3, 3:4, 21:9, 2:3). ElevenLabs "lista glasova" je deset
   podrazumevanih glasova. Nijedno ne dira cenu (`affectsPrice: false`) i oboje
   je polje reda.
8. **Raspone koje katalog ne daje uzeo sam po najužoj razumnoj vrednosti:**
   Kling klip 5-10 s (katalog to daje za Kling 3.0, pa isto važi za Turbo i
   Omni), muzika 0,5-5 minuta, zvučni efekat 5-22 s (donja granica je katalogov
   "min 5"), merena količina za alate 1-60 s odnosno 0,1-120 minuta. Granice se
   testiraju kroz maržu na oba kraja.
9. **`seedream-5-lite` nema kontrolu rezolucije.** Cena mu je ravna bez obzira
   na rezoluciju, a kontrola koja ne menja ni sliku ni cenu je laž o izboru -
   isti razlog zbog kojeg Gemini Omni nema kontrolu rezolucije (S4). Podatak da
   ide do 4K stoji u `capabilities`.
10. **`kling-tryon` ima DVA imenovana slota** (`person`, `garment`) umesto
    jednog `image` slota sa `max: 2`. Redosled tu nije svejedno, a `inputSpec` je
    po definiciji mapa slotova - dva slota su jedini način da forma zna koja je
    slika koja.
11. **`kling-omni` u `reference` režimu nema audio slot.** Katalog (sekcija 5)
    daje opšti okvir "9 slika + 3 videa + 3 audio", ali za Omnija ne potvrdjuje
    audio; slot koji možda ne radi je gora poruka od poruke, pa su ostali slike
    (9) i video (3). Isti izbor koji je S4 napravio za Gemini Omni.
12. **Svi modeli ulaze uključeni, ali seed ne pali ono što je admin ugasio.**
    S5.md traži pun katalog, pa `isEnabled: true` ide pri PRVOM upisu; ponovljen
    seed patchuje sve osim `isEnabled`. Razlog je isti kao kod `seedPlatformFlags`:
    ako je model ugašen zbog kvote ili spornog računa, seed ne sme tiho da ga
    vrati korisnicima. Dva Google modela za slike su time uključena iako S2 nije
    isporučio kod - videti "Za Jovana", tačka 3.
13. **`createJob` i dalje računa cenu preko starog `modelCatalog`-a** (zatečeno,
    S3 ODLUKA 8 i S4 ODLUKA 13). Ovaj korak seeduje tabelu `models`, ali je ne
    prespaja na tok naručivanja - to je S6/S7 i dodirivalo bi ceo postojeći tok
    naplate. Do tada se novi modeli ne mogu naručiti sa stranice.
14. **Marža se poredi sa cenom zaokruženom na šest decimala**, isto kao u
    `computeCredits`-u. `0,05 x 3,2 x 15 x 216,25` u binarnom zapisu ispadne
    519,0000000000001, pa bi sirovo poredjenje prijavilo maržu 0,9999... na ceni
    koja je tačno pokrivena. Granica je ista ona koju pravilo već koristi, nije
    uvedena zbog testa.

**Testovi:** 26 novih (503 -> 529).

`convex/providers/catalogModels.test.ts` (21):
- **OBAVEZAN 1 - marža nad celim prostorom parametara:** za svaki od 30 modela
  se generiše dekartov proizvod svih kontrola koje diraju cenu, po svakom
  ulaznom režimu (plus sniženi `reference_with_video`), sa merenim količinama na
  obe granice i sa brojem dodatnih ulaznih fajlova (0, kvota, kvota+3). Ukupno
  **1 105 kombinacija**; svaka tvrdi `krediti >= nabavno x 216,25` i
  `nabavno > 0`, a svaki model mora da ima bar jednu kombinaciju sa cenom.
- **OBAVEZAN 2 - doslednost specifikacija**, u četiri testa: svaki režim iz
  `inputModes` ima endpoint i `inputSpec` (i obrnuto - nema endpointa ni slotova
  za režim koji model ne nudi); svaki parametar koji `lookup` ili množilac
  pominje postoji kao kontrola i prijavljuje `affectsPrice: true`; svaki
  `quantityParam` je ili kontrola ili `capabilities.quantity`; `extras` parametri
  NISU kontrole (broji ih server); svaka vrednost koju `lookup` ili množilac
  očekuje postoji kao opcija (a kod prekidača je `on`/`off`); podrazumevane
  vrednosti su unutar svojih opcija i opsega, i prazna forma ima cenu u SVAKOM
  režimu; endpoint sa `{tier}` placeholderom ima tarifu za svaku rezoluciju.
- **tabele iz kataloga:** Nano Banana 2 (12/16/23/30) i Pro (33/56) i thinking
  tokeni jednom po generaciji; GPT Image nemonotonost (high 1024² skuplji od
  high 1536x1024) i ćelije 12/87/29/44; Seedream 4.5 i 5 Lite; Kling 3.0 svih
  sedam ćelija plus "4K je isti sa zvukom i bez njega"; Kling Turbo 25/31 bez
  4K; Kling Omni 19/25/31/91 i množilac 1,5 za izmenu videa; MiniMax 11/13/29/35,
  LoRA +25% i šesta referenca; Kling alati 13/25/28/37/16/8 i zaokruživanje
  lipsync-a na pet sekundi; TTS po hiljadu znakova; ostali audio 3/130/2/65/22/130.
- **zamke:** Pro nema 1K; kontrola glasa bez zvuka nema cenu; `quality` i `size`
  kod GPT Image-a su pinovani podrazumevanom vrednošću (prazan zahtev daje
  `medium|1024x1024`, ne fal-ov `high`); Kling labele su rezolucije, nikad
  "standard"/"pro"; Scribe je V2; broj redova, jedinstveni slugovi i sortOrder,
  podela po vrsti i po provajderu; redovi iz S3/S4 su isti objekti.

`convex/studioModels.test.ts` (4): seed upisuje svih 30 redova i sva složena
polja se čitaju NAZAD istim funkcijama kojima ih čita server (`parsePriceRule`,
`parseParamSpec`, `JSON.parse`); ponovljen seed ne pravi duplikate i NE pali
model koji je admin ugasio; seed bez tačnog `syncSecret`-a ne upiše ništa;
čitanje po slugu radi, a nepoznat slug daje `null`.

`convex/studioPricing.test.ts` (+1): `chars1k` deli količinu sa hiljadu, a
nijedna druga jedinica se ne dira.

**Rezultat verifikacije:** sve četiri komande čiste.
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`17 problems (0 errors, 17 warnings)`; nijedno
  upozorenje nije iz fajlova ovog koraka - 7 zatečenih u
  `admin-inline-actions.tsx`, `dashboard-content.tsx` i
  `public-course-intro-video.tsx`, 9 nekorišćenih uvoza u `convex/crons.ts` iz
  nedovršenog S0, 1 u `get_google_creds.js`)
- `npm run test` - **prošlo** (`Test Files 47 passed (47) / Tests 529 passed (529)`)
- `npm run build` - **prošlo** (`Compiled successfully in 7.2s`,
  `Finished TypeScript in 12.8s`, 60/60 statičkih stranica)

**BLOKADA:** nema.

**Za Jovana:**
1. **Katalog se upisuje sa `npm run convex:seed`** (skripta sada zove i
   `studioModels:seedStudioModels`), ili ručno tom mutacijom iz Convex
   dashboard-a sa `WEBHOOK_SYNC_SECRET`-om. Seed je idempotentan i ne pali
   modele koje si ugasio iz admin ekrana.
2. **Modeli se još NE MOGU naručiti sa stranice** (ODLUKA 13). `createJob` i
   dalje traži slug u starom `modelCatalog`-u; prespajanje na `models` je S6/S7.
   Seed je bezbedan da se pusti odmah - popunjava tabelu koju još niko ne
   naplaćuje.
3. **Nano Banana 2 i Pro su uključeni, ali Google slike nisu povezane.** S2 nije
   isporučio kod (S4 ODLUKA 12), pa bi posao na njima danas završio refundom sa
   porukom `GOOGLE_SLIKE_NISU_POVEZANE`. Ako S2 ne bude ponovljen pre nego što
   pustiš Studio korisnicima, ta dva reda isključi iz admin ekrana - seed ih
   posle toga neće vratiti.
4. **Proveri rute koje katalog ne propisuje** (ODLUKA 6), po jednom pozivu na
   fal-ovoj stranici modela: Kling v3 i v3 Turbo (naročito **koja ruta nosi 4K**,
   jer `{tier}` mapa danas šalje `pro`), Kling O3, četiri Kling alata, Seedream
   4.5 edit, Seedream 5 Lite, GPT Image 1.5 i ElevenLabs music/dubbing/voice-changer.
   Svaki od njih je jedno polje u redu i menja se iz admin ekrana bez deploy-a.
5. **Proveri šta `kling-v2a` stvarno vraća** (ODLUKA 2). Ako vraća video sa
   zvukom umesto zvučnog zapisa, red treba da nosi `kind: "video"` - inače će
   galerija pokušati da ga pusti kao audio.
6. **MiniMax H3 cena je i dalje sporna** (katalog 3.6): stranice modela kažu
   $0,13/s na 2K, "learn" stranice $0,26/s. Pusti jednu generaciju i pročitaj
   fakturu pre nego što taj model pustiš korisnicima; ako je stvarna cena duplo
   veća, marža na 2K i 4K pada ispod jedan.
7. **Cifre u tekstu kataloga se na sedam mesta razlikuju od JSON pravila**
   (ODLUKA 4). Sve idu u korist korisnika i sve su posledica zaokruživanja, ali
   ako želiš baš one iz teksta, menja se `baseUsd` u redu - ne zaokruživanje u
   `computeCredits`-u, jer je `ceil` tačno jednom na kraju normativan.
8. **Nije iz S5, i dalje stoji:** `convex/crons.ts` ima 9 nekorišćenih uvoza
   (globalni plafon troška iz S0 nije dovršen), a `docs/STUDIO-PROGRESS.md` nema
   sekcije za S1 i S2.

**Katalog - 30 modela i broj kombinacija parametara po modelu**

Podela po nameni: **7 slika · 10 video · 5 Kling alata · 8 audio.**
Podela po `kind` polju: **8 image · 13 video · 9 audio.**
Podela po provajderu: **23 fal · 4 google · 3 byteplus.**
Ukupno kombinacija u testu marže: **1 105.**

| `kind` | slug | provajder | kombinacija |
|---|---|---|---|
| image | `nano-banana-2` | google | 24 |
| image | `nano-banana-pro` | google | 12 |
| image | `gpt-image-2` | fal | 126 |
| image | `gpt-image-15` | fal | 54 |
| image | `seedream-45` | fal | 6 |
| image | `seedream-5-pro` | byteplus | 54 |
| image | `seedream-5-lite` | fal | 6 |
| image | `kling-tryon` | fal | 1 |
| video | `kling-3` | fal | 54 |
| video | `kling-3-turbo` | fal | 15 |
| video | `kling-omni` | fal | 72 |
| video | `minimax-h3` | fal | 288 |
| video | `seedance-20` | byteplus | 96 |
| video | `seedance-25` | byteplus | 36 |
| video | `veo-31-lite` | fal | 36 |
| video | `veo-31-fast` | google | 90 |
| video | `veo-31` | fal | 90 |
| video | `gemini-omni` | google | 12 |
| video | `kling-avatar` | fal | 4 |
| video | `kling-lipsync` | fal | 2 |
| video | `kling-motion` | fal | 4 |
| audio | `tts` | fal | 2 |
| audio | `dialogue` | fal | 2 |
| audio | `sfx` | fal | 3 |
| audio | `music` | fal | 3 |
| audio | `stt` | fal | 4 |
| audio | `voice-changer` | fal | 2 |
| audio | `audio-isolation` | fal | 2 |
| audio | `dubbing` | fal | 4 |
| audio | `kling-v2a` | fal | 1 |

Broj kombinacija je broj CENOVNO RAZLIČITIH izbora koje test marže stvarno
prodje: sve opcije kontrola koje diraju cenu, u svakom režimu, sa klizačima na
donjoj, srednjoj i gornjoj vrednosti. Kontrole koje ne diraju cenu (odnos
stranica, glas, klizači izgovora) ne ulaze u proizvod - ne mogu da obore maržu,
a udesetostručile bi prostor.

## S6 - Biblioteka komponenti: kontrole, slotovi, dugme, izbor modela   (20.08.2026 03:15-03:45)

**Fajlovi:**
- `lib/studio-params.ts` - NOV. Čista logika `<ParamForm>`-a i `<PriceTag>`-a:
  vidljive kontrole po režimu, vrednosti forme, `buildParams`, `creditsFor`,
  `priceDelta`, `stepPriceDelta`, `creditsPerUnit` i formatiranje.
- `lib/studio-slots.ts` - NOV. Ugovor ulaznih režima iz sekcije 5: parsiranje
  `inputSpec`-a, validacija MIME i veličine, čišćenje pri promeni režima,
  "šta fali" poruka, `FramePair`, brojanje ulaznih slika za `extras`.
- `lib/studio-models.ts` - NOV. `parseStudioModel` (JSON polja reda kataloga),
  filteri i pretraga pickera, grupisanje po porodici, cena za listu.
- `lib/studio-messages.ts` - dodat `GenerateBlock` i `generateBlockMessage`;
  postojeći tekstovi nisu dirani.
- `components/studio/price-tag.tsx` - NOV. `<PriceTag>`.
- `components/studio/param-control.tsx` - NOV. `<ParamControl>`, sedam tipova.
- `components/studio/param-form.tsx` - NOV. `<ParamForm>` i `useParamValues`.
- `components/studio/drop-slot.tsx` - NOV. `<DropSlot>`, `<DropSlotGrid>`,
  `<FrameSlotPair>`, `<ReferenceSlots>`, `<FullScreenDropOverlay>`.
- `components/studio/use-slot-upload.ts` - NOV. Upload sa trakom napretka.
- `components/studio/mode-switcher.tsx` - NOV. `<ModeSwitcher>`.
- `components/studio/model-picker.tsx` - NOV. `<ModelPicker>`.
- `convex/studio.ts` - dodata mutacija `createInputUploadUrl` (8 linija, isti
  obrazac kao `lab.createLabOutputUploadUrl`).
- `lib/studio-params.test.ts`, `lib/studio-slots.test.ts`,
  `lib/studio-models.test.ts` - NOVI, 51 test.
- `docs/STUDIO-PROGRESS.md` - ova sekcija.

**Šta je uradjeno:**

Napisana je cela biblioteka iz sekcije 6 kataloga i **nijedna komponenta ne zna
ime nijednog modela** - pretraga za `slug ===` u `components/studio/` je prazna.
Sve grana po `paramSpec.type`, `inputSpec` slotovima i `priceRule` mapi. Zabrane
su i dalje rupe u cenovnoj mapi, ne spiskovi: opcija koju `availableOptionValues`
ne vrati se u kontroli **gasi** (ne skriva), pa Seedance Mini nema 1080p iz
istog izvora iz kojeg ga nema ni server.

**Cena postoji na tačno jednom mestu.** `lib/studio-params.ts` uvozi
`computeCredits` iz `convex/studioPricing.ts` - katalog 1.3 to izričito traži
("uvezena i u Convex i u browser"), pa u ovom sloju nema nijedne aritmetičke
operacije nad cenom. `useParamValues` vraća JEDAN objekat parametara koji hrani
i `<PriceTag>`, i `<GenerateButton>`, i `createJob`; test tvrdi da taj objekat
prodje kroz serversku kapiju `sanitizeSpecParams` i da naplaćena cifra ostane
identična prikazanoj, za svih 30 modela u svakom njihovom režimu.

**Slotovi su kompletni sa validacijom pre uploada.** MIME i veličina se
proveravaju pre nego što ijedan bajt krene (poruka nabraja šta slot prima),
upload ide preko `XMLHttpRequest`-a zbog trake napretka, pregled je lokalni
`blob:` URL, video pregled je `preload="metadata"` sa `#t=0.1`. Mreža ima
brojač `3/9`, prevlačenje za redosled i strelice za istu radnju sa tastature.
Par kadrova stoji sa strelicom izmedju i traži oba, a reference su numerisane
jer ih prompt citira po broju.

**Prekidač režima čisti i priznaje.** `pruneFilesForMode` izbaci slotove kojih
u novom režimu nema i skrati one koji primaju manje, a ispod prekidača se ispiše
šta je sklonjeno - fajl ne nestaje bez reči. Cena se preračunava sama, jer režim
ulazi u `computeCredits` (`modeMultipliers`).

**ODLUKE:**

1. **Repo NEMA shadcn, i nije uveden.** S6.md kaže "Repo koristi shadcn",
   ali provereno: nema `components.json`, nema nijednog `@radix-ui` paketa,
   `components/ui/` sadrži samo `primitives.tsx` sa ručno pisanim skicoznim
   dizajnom. `npx shadcn init` bi doneo novu zavisnost, prepisao
   `globals.css` i uveo drugi dizajn jezik - a pravila run-a traže uklapanje u
   postojeće stranice i hirurške izmene. Kontrole su zato napisane nad
   postojećim primitivama i klasama koje `studio-page.tsx` već koristi
   (`border-2 border-ink`, `bg-paper`, `text-muted`, `shadow-[4px_4px_0_0_...]`).
   Mapiranje iz tabele 1.2 je ispoštovano po PONAŠANJU: `segmented` je
   jednostruki toggle grupe sa `aria-pressed`, `switch` je `role="switch"` sa
   `aria-checked`, `slider` je `input type=range`, `select` je nativni `select`.
2. **Testovi ne renderuju React.** Suite je `environment: "edge-runtime"`, bez
   `jsdom` i bez `@testing-library/react`; dodavanje oba je nova zavisnost u
   nenadziranom run-u bez garancije mreže. Umesto toga je SVE što komponenta
   prikazuje izmešteno u čiste funkcije (`lib/studio-params.ts`,
   `lib/studio-slots.ts`, `lib/studio-models.ts`), a komponente su tanke - cifra
   koju `<PriceTag>` ispisuje je doslovno `priceDeltaLabel(priceDelta(...))`,
   i baš to test tvrdi. Isti obrazac koji repo već koristi za
   `lib/studio-form.ts` i `lib/studio-admin.ts`.
3. **Klijentski kod OVDE uvozi `convex/studioPricing.ts` direktno**, iako
   `lib/studio-form.ts` i `lib/studio-admin.ts` matematiku duplira. Katalog 1.3
   je izričit ("nema druge računice cene nigde u kodu"), a duplirana formula bi
   bila tačno ta druga računica. Uvezeni moduli (`studioPricing`,
   `studioParamSpec`) su čisti, bez `ctx`, bez `_generated` - build to potvrdjuje.
   Stara dva fajla nisu dirana; oni pripadaju starom `modelCatalog` toku.
4. **`<DurationSlider>` nije zasebna komponenta.** Tabela iz sekcije 6 ga
   nabraja, ali S6.md ga ne traži, a jedini način da ga napišem je da zna ključ
   `duration` - dakle komponenta koja poznaje jedan konkretan parametar. Isto
   ponašanje daje `<ParamControl type="slider">`: vrednost i jedinica u
   zaglavlju, `<PriceTag>` sa cenom JEDNOG koraka, i ukupna cena na dugmetu koja
   se pomera dok se klizač vuče.
5. **Dodata je mutacija `studio.createInputUploadUrl`.** Bez adrese za upload
   `<DropSlot>` ne može da ispuni nijedan svoj zahtev iz S6.md (traka
   napretka, validacija pre uploada), a duplirati upload u svakoj stranici je
   suprotno smislu biblioteke. Mutacija je 8 linija, iza `requireUserId`, i ne
   menja nijedno postojeće ponašanje. Vezu `storageId` -> posao pravi tek
   `createJob` (S7).
6. **Cena je `null`, nikad nula, kad količina nije poznata.** TTS pre kucanja i
   lipsync pre kačenja videa nemaju cenu; dugme tada piše samo "Generiši" i
   zaključano je. Nula na dugmetu znači besplatno, a to nije istina.
7. **`priceDelta` ima i stanje `same`.** Kling na 4K naplaćuje isto sa zvukom i
   bez njega (katalog 3.1) - značka tada piše "ista cena" umesto da nestane,
   jer prekidač koji naizgled ne radi ništa izgleda kao kvar.
8. **Značka je `×N` samo kad je odnos ceo broj >= 2**, inače razlika u kreditima
   sa znakom. Seedream 1,5K -> 2K je `×2`; Nano Banana 1K -> 4K je `+14 kr`,
   jer `30/16` nije ceo broj i "×1,9" bi bilo lažno precizno.
9. **Par kadrova se drži imenovano (`FramePair`), ne kao niz od dva.** U gustom
   nizu prazan POČETNI kadar uz popunjen završni izgleda isto kao popunjen
   početni, pa bi poruka glasila "Dodaj završni kadar" kad fali početni.
   `missingInput` prima par kao opcioni argument i tada imenuje tačan kadar.
10. **Obavezni ulazi su tri pravila, ne spisak po modelu:** `first_last` traži
    oba kadra, `reference` bar jednu referencu bilo koje vrste (model koji prima
    i slike i video ne sme da traži oboje), svaki drugi režim po jedan fajl u
    svakom svom slotu. Izuzetak je slot koji je isključila VREDNOST KONTROLE -
    Kling lipsync sa izvorom govora "tekst" ne traži zvuk - i za njega postoji
    argument `optional: string[]`. Odluku donosi stranica, ali po vrednosti
    parametra, nikad po slugu.
11. **Prijem preko celog ekrana je uključiv, ne automatski.** `singleDropSlot`
    kaže ima li režim tačno jedan slot (tada je ceo ekran smislen cilj po
    AGENTS.md); komponenta prima `fullScreen` zastavicu jer sama vidi samo svoj
    slot, ne ceo režim. Stranica iz S7 je uključuje tim upitom - zapisano je i
    pod "Za Jovana".
12. **Granice veličine fajla su izabrane, ne propisane:** slika 10 MB (avatar je
    5, referenca iz telefona ume da bude veća), zvuk 50 MB, video 200 MB.
    Katalog ih ne daje. Provera je na klijentu i sprečava besmisleno čekanje;
    kad S7 spoji `createJob` sa ulazima, ista granica treba i na serveru.
13. **`extras` količine (šesta referenca, druga ulazna slika) forma BROJI, ali
    server meri.** `measuredExtraCounts` broji okačene slike samo da bi cena na
    dugmetu bila tačna pre klika; naplata i dalje ide po onome što server prebroji.
14. **Stanje forme se podešava tokom rendera, ne u efektu.** Efekat bi prvo
    iscrtao cenu za stari režim pa je ispravio, a cena ne sme da treperi.
    `useParamValues` prepoznaje promenu modela po REFERENCI `paramSpec`-a, pa
    stranica mora da parsira red jednom (`useMemo`) - zapisano za S7.

**Testovi:** 51 nov (529 -> 580).

`lib/studio-params.test.ts` (20) - `<ParamForm>` i `<PriceTag>`:
- svaki model u svakom režimu ima cenu za podrazumevani izbor;
- **`buildParams` prodje kroz `sanitizeSpecParams` i naplaćena cena ostane
  jednaka prikazanoj** - 30 modela, svi režimi;
- cena forme je doslovno `computeCredits` nad istim objektom (nema druge
  računice), i to za svaku opciju svake kontrole koja dira cenu;
- značka svake opcije je tačno razlika `computeCredits`-a sa hipotetičkom
  vrednošću (`base + delta === next`, odnosno `base × factor === next`);
- `×2` kod Seedream-a 5 Pro, `+14 kr` / `−4 kr` kod Nano Banane 2, "ista cena"
  kod Klinga na 4K, prazna značka za kombinaciju bez cene;
- cena bez poznate količine je `null` (TTS bez teksta), a sa 1 000 znakova 22;
- Seedance Mini nema 1080p ni u formi ni u ceni;
- kontrola sa istim ključem u dva režima daje tačno jednu po režimu, i promena
  režima spušta 1080p na 720p a zadržava trajanje;
- klizač pokazuje cenu jednog koraka i na gornjoj granici;
- `kr`/`cr` i `22 kr/s` / `21,9 kr/s` / `21.9 cr/s`.

`lib/studio-slots.test.ts` (19) - slotovi:
- slotovi režima se čitaju iz reda kataloga, neispravan JSON ne ruši formu;
- režim sa jednim slotom je jedini smislen drop cilj, sa dva nije;
- validacija: pogrešan tip nabraja šta slot prima, prevelik fajl imenuje
  granicu, prazan fajl se odbija, video ima veću granicu od slike;
- promena režima: slot kojeg nema ispada, slot koji prima manje se SKRAĆUJE, i
  oba se prijave;
- "šta fali": oba kadra sa tačnim imenom kadra (i kad je popunjen samo završni),
  bar jedna referenca, oba imenovana slota, slot isključen parametrom;
- broje se samo SLIKE za `extras`, a pravilo bez `extras` ne broji ništa.

`lib/studio-models.test.ts` (12) - `<ModelPicker>`:
- svih 30 redova prodje kroz `parseStudioModel` sa svim složenim poljima;
- red bez upotrebljivog pravila se ne nudi, neispravne `capabilities` ne obaraju red;
- filter po vrsti, filter po zvuku (i prekidač i zastavica), pretraga po imenu,
  slugu i porodici, grupisanje po porodici bez gubitka modela;
- cena u listi: Seedream 4.5 = 9, Gemini Omni prati trajanje (5 s = 110),
  lipsync nema cenu unapred a sa pet sekundi ima 16.

**Rezultat verifikacije:** sve četiri komande čiste.
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`✖ 17 problems (0 errors, 17 warnings)`; istih 17
  zatečenih upozorenja kao posle S5 - 7 u `admin-inline-actions.tsx`,
  `dashboard-content.tsx` i `public-course-intro-video.tsx`, 9 u
  `convex/crons.ts` iz nedovršenog S0, 1 u `get_google_creds.js`. **Nijedno
  upozorenje nije iz fajlova ovog koraka.** Jednu grešku koju je lint uhvatio -
  `Cannot access refs during render` u `drop-slot.tsx` - popravio sam prelaskom
  na `useEffectEvent`, isti obrazac koji `profile-editor.tsx` već koristi.)
- `npm run test` - **prošlo** (`Test Files 50 passed (50) / Tests 580 passed (580)`)
- `npm run build` - **prošlo** (`✓ Compiled successfully in 6.2s`,
  `Finished TypeScript in 15.0s`, `60/60` statičkih stranica, sve rute na broju)

**BLOKADA:** nema.

**Za Jovana:**
1. **Komponente još nisu ni na jednoj stranici** - S6 je biblioteka, S7 je
   sastavlja. Stranice rade nepromenjeno; ništa u ovom koraku ne dira postojeći
   tok naplate ni stari `modelCatalog`.
2. **Odluka 1 traži tvoju potvrdu:** S6.md tvrdi da repo koristi shadcn, a ne
   koristi. Kontrole su napisane u postojećem skicoznom stilu. Ako želiš baš
   shadcn, to je zaseban korak (nova zavisnost + `globals.css`) i bolje ga je
   uraditi svesno nego usput.
3. **Provera u browseru tek posle S7.** Kad je pustiš, gledaj tri stvari:
   pomera li se cifra na dugmetu dok vučeš klizač trajanja; da li značka uz 4K
   kod Klinga piše "ista cena" kad je zvuk uključen; i da li prevlačenje fajla
   preko celog ekrana radi tamo gde režim ima jedan slot.
4. **Za S7, tri stvari koje biblioteka očekuje od stranice:** (a) `paramSpec`
   se parsira JEDNOM po modelu (`useMemo`), jer `useParamValues` promenu modela
   prepoznaje po referenci; (b) `fullScreen` se uključuje upitom
   `singleDropSlot(inputSpec, mode) !== null`; (c) slot koji je isključila
   vrednost kontrole (Kling lipsync, izvor govora "tekst") ide kao
   `optional: ["audio"]` u `missingInput`.
5. **Granica veličine fajla postoji samo na klijentu** (odluka 12). Kad S7 spoji
   ulaze sa `createJob`-om, ista granica mora i na server - inače je zaobilazi
   svako ko pozove mutaciju direktno.

## S7 - Stranice: playground, galerija, admin nad v4 katalogom   (20.08.2026 03:50-04:25)

**Fajlovi:**
- `convex/studioJobCore.ts` - NOV. Čista logika naručivanja posla iz v4 kataloga:
  `parseInputSpec`/`parseInputModes` (preseljeni iz `lib/studio-slots.ts`),
  `parseClientInputs`, `sanitizeJobInputs`, `hasVideoInput`, `countInputImages`,
  `extraCounts`, `promptControlOf`/`promptFromParams`, `parseQuantitySource`,
  `resolveMeasuredQuantity`.
- `convex/studio.ts` - `createJob` sada ima DVE grane: `buildCatalogOrder` (v4
  `models`) i `buildLegacyOrder` (zatečen `modelCatalog`, nepromenjen). Novi
  argumenti `inputMode`, `inputs`, `measuredQuantity`. `listMyJobs` vraća
  `inputMode` i `inputThumbs`; nov upit `getJobForRegenerate`.
- `convex/studioModels.ts` - `listModels` (iza prijave), `listAllModels` (admin),
  `setModelEnabled`, `setModelPrice`.
- `convex/studioPricing.ts` - `applyPriceEdit` (izmena `baseUsd`/`addUsd`).
- `convex/studioActions.ts` - `submitFalCatalogJob`: fal grana za v4 modele
  (ruta iz `endpoints[inputMode]`, ulazi kao potpisani URL-ovi, mock kad nema ključa).
- `convex/providers/falInputs.ts` - NOV. Slot -> ime polja koje fal očekuje, i
  `{tier}` u ruti.
- `convex/studioAdmin.ts` - `getUsageSummary` vraća `reapedToday`, `alarmUsd`, `killUsd`.
- `convex/creditsCore.ts` - `validatePrompt(text, maxLength)`; podrazumevana
  vrednost je stara granica, pa nijedan postojeći pozivalac ne menja ponašanje.
- `lib/studio-playground.ts` - NOV. `promptRequired`, `optionalSlots`,
  `measuredFile`, `measuredParams`, `generateBlock`, `inputsPayload`.
- `lib/studio-catalog-admin.ts` - NOV. `priceTable`, `defaultMargin`, `isBaseUsdEditable`.
- `lib/studio-gallery.ts` - `regenerateHref`, `inputsLabel`, `jobParamSummary`.
- `lib/studio-slots.ts` - parser `inputSpec`-a se sada UVOZI iz `convex/studioJobCore.ts`.
- `lib/studio-messages.ts` - prazno stanje Studija više ne kaže "alat za slike".
- `components/studio/param-form.tsx` - `useParamValues` prima početne vrednosti.
- `components/app/studio-page.tsx` - sastavljena od S6 komponenti.
- `components/app/studio-gallery-page.tsx` - ulazi kao sličice, opis parametara,
  "Generiši ponovo" preko `jobId`-ja, beskonačan skrol.
- `components/app/studio-admin-page.tsx` - sekcija `Katalog v4` + reaper brojač
  i globalni trošak sa pragovima.
- NOVI testovi: `convex/studioJobCore.test.ts`, `convex/studioCatalogJob.test.ts`,
  `convex/providers/falInputs.test.ts`, `lib/studio-playground.test.ts`,
  `lib/studio-catalog-admin.test.ts`; dopunjeni `convex/studioPricing.test.ts`,
  `convex/studioModels.test.ts`, `lib/studio-gallery.test.ts`.
- `docs/STUDIO-PROGRESS.md` - ova sekcija.

**Šta je uradjeno:**

Tri stranice su sastavljene od komponenti iz S6 i **prvi put su spojene sa v4
katalogom** - do sada je `createJob` znao samo staru tabelu (S5 ODLUKA 13), pa
se nijedan od 30 modela nije mogao naručiti. Playground levo ima `<ModelPicker>`,
`<ModeSwitcher>`, slotove izabranog režima, `<ParamForm>` i `<GenerateButton>`;
desno rezultat sa skeletonom i poslednjih šest generacija. Sve je `useQuery`, i
u ovom koraku nije dodat nijedan `setInterval`.

Cena postoji na tačno jednom mestu i posle ovog koraka: `buildParams` pravi
JEDAN objekat koji hrani `<PriceTag>`, `<GenerateButton>` i `createJob`, a
server nad tim istim objektom zove `computeCredits`. Test to tvrdi kroz bazu -
naplaćeni iznos je doslovno `computeCredits(priceRule, upisani params, režim)`.

Galerija po kartici pokazuje **ulaze kojima je posao naručen** (najviše četiri
potpisane sličice, sa ukupnim brojem), model, podešavanja ispisana imenima iz
`paramSpec`-a, datum, cenu i tri akcije. "Generiši ponovo" ide preko `jobId`-ja
i vraća model, režim, parametre I ulaze; radi i na isteklom fajlu, jer red
posla živi zauvek. Video u mreži je i dalje `preload="metadata"` sa `#t=0.1`.

Admin ekran ima tabelu v4 kataloga sa provajderom, tipom, maržom za
podrazumevana podešavanja (ispod 2,0x crvena) i prekidačem, a svaki red se
razvija u tabelu cena **po svakoj kombinaciji** - zato što jedna izmena
`baseUsd`-a pomera celu porodicu varijanti. Postojeće sekcije su ostale;
dodati su reaper brojač i pragovi globalnog troška, oba sa servera.

**ODLUKE:**

1. **`createJob` je prespojen na v4, i v4 ima PREDNOST nad starim katalogom.**
   S7.md traži stranice, ali stranice od S6 komponenti bez ovoga ne mogu da
   naruče ništa - `<ModelPicker>` crta redove `models` tabele koje `createJob`
   ne poznaje. Slug koji postoji u obe tabele (`seedream-45`, `nano-banana-2`)
   se od sada naplaćuje po v4 pravilu; stari red je tada mrtav i to piše u
   admin ekranu. Model koji je admin ugasio u v4 NE pada nazad na stari red.
2. **`listModels` je iza prijave, nije javan.** `priceRule` nosi NABAVNU cenu, a
   katalog 1.3 izričito traži da se ista funkcija računa i u browseru - dakle
   pravilo mora do klijenta. Javan upit bi time objavio maržu svakog modela.
   Stara javna ruta (`modelCatalog.listModels`) nije dirana, pa stranice bez
   naloga rade nepromenjeno.
3. **Dužinu okačenog fajla meri KLIJENT, server je zaokružuje i seče.** Convex
   storage zna bajtove, ne sekunde, a dekodiranja medija u mutaciji nema. Zato
   `measuredQuantity` stiže sa klijenta i prolazi kroz `resolveMeasuredQuantity`:
   mora biti pozitivan broj, zaokružuje se NAVIŠE (sekunda, odnosno desetinka
   minuta) i seče na `min`/`max` iz kataloga. Tekst server meri sam, iz
   parametara. Ostatak rizika je u "Za Jovana" tačka 4.
4. **Prompt je obavezan samo u režimu BEZ ijednog slota.** Kling lipsync ima
   `textarea` koja se koristi tek kad je izvor govora tekst, pa bi bezuslovan
   zahtev odbio sasvim ispravan posao sa okačenim zvukom; proba odeće nema
   nijednu tekstualnu kontrolu. Tekst koji POSTOJI ide kroz moderaciju uvek.
   Pravilo je izvedeno iz `inputSpec`-a, nigde ne stoji ime modela.
5. **`validatePrompt` je dobio opcion `maxLength`.** ElevenLabs `text` ide do
   5 000 znakova (katalog 4.1), a `MAX_PROMPT_LENGTH` je 2 000. Bez ovoga bi
   TTS od 3 000 znakova bio odbijen kao "predugačak prompt", ili bi - gore -
   moderacija preskočila ceo tekst. Podrazumevana vrednost je stara granica, pa
   se nijedan postojeći pozivalac ne ponaša drugačije.
6. **Slot koji isključuje vrednost kontrole je opšte pravilo, ne spisak.**
   Kontrola čija bar jedna opcija nosi IME slota bira izmedju izvora, pa svaki
   takav slot koji nije izabran postaje opcion. Jedini slučaj u katalogu je
   lipsync (`source`: `audio`/`text`), i test tvrdi da nijedan drugi model na
   podrazumevanom izboru ne isključi ništa.
7. **`extras` i merenu količinu upisuje SERVER, posle kapije.** `sanitizeSpecParams`
   izbacuje sve što nije kontrola, pa `input_images` koji klijent pošalje ispada;
   broj se dopisuje iz `inputs`-a koje server vidi. Test šalje `input_images: 0`
   uz tri slike i tvrdi da je naplaćeno tri.
8. **Parser `inputSpec`-a je preseljen u `convex/`, a `lib/studio-slots.ts` ga
   uvozi.** Server mora da proveri isti `inputSpec` po kojem forma crta slotove,
   a dva parsera istog polja su dva ugovora koja se mogu razići. Strog čitač
   onoga što klijent ŠALJE (`parseClientInputs`) je odvojen od blagog čitača
   onoga što je već upisano (`providers/jobInputs.ts`) - prvi odbija, drugi
   preskače, i to je namerno.
9. **fal grana za v4 modele je napisana po KONVENCIJI, bez živog poziva.**
   Pravila run-a zabranjuju poziv fal-a, pa su imena polja (`image_url`,
   `image_urls`, `start_image_url`/`end_image_url`, `human_image_url`) uzeta po
   fal obrascu i **nisu potvrdjena**. Pogrešno ime daje grešku i refund, ne tihi
   trošak. Bez ove grane bi svih 23 fal modela iz v4 kataloga završavalo
   refundom, jer ih stari `modelCatalog` ne poznaje. Provera je u "Za Jovana".
10. **`baseUsd` se ne sme menjati na pravilu sa `lookup` tabelom.** Tabela ima
    prednost (katalog 1.3), pa bi upisan broj stajao u redu a ne bi se video ni
    u jednoj ceni. I mutacija (`applyPriceEdit`) i polje u UI-ju to odbijaju.
    Ugnježdeno pravilo (`modeRules`, layerize) se ne dira - to je drugi obračun
    i menja se svojim redom; tabela cena po kombinaciji odmah pokaže da nije
    pratilo.
11. **Tabela cena uzima klizače na podrazumevanoj vrednosti, a merenu količinu
    na `min`-u.** Trajanje množi linearno, pa bi po tri reda na svaki utopilo
    kombinacije koje cenu stvarno menjaju; `min` je mesto gde je marža najtanja.
    Prikaz je odsečen na 24 reda, ali `worstMargin` se računa nad CELIM prostorom
    i ispisuje se koliko je redova izostavljeno.
12. **Stari `modelCatalog` ekran je zadržan, ne obrisan** - preimenovan u
    "Stari katalog" sa rečenicom da v4 ima prednost. Brisanje bi bilo izmena
    van onoga što S7 traži, a i dalje postoje redovi (`flux-2-*`) koje v4 nema.
13. **Beskonačan skrol NE ukida dugme "Učitaj još".** `IntersectionObserver` ne
    postoji svuda, a do sledeće stranice se sa tastature mora stići klikom.
14. **Ulazni fajlovi nemaju rok trajanja.** `crons.expireGenerationFiles` briše
    IZLAZE; ulazi ostaju u storage-u zauvek, inače bi "Generiši ponovo" posle
    30 dana pokazivalo prazne slotove. To je trošak koji raste - u "Za Jovana".

**Testovi:** 66 novih (580 -> 646).

`convex/studioJobCore.test.ts` (15) - ulazi sa klijenta (strog oblik, nepoznat
slot, prekoračen slot, očuvan redosled), brojanje slika i video ulaza, `extras`,
prompt kontrola kroz prave redove kataloga (tts `text`, nano banana `prompt`,
tryon bez ijedne), merena količina (tekst meri server; prijavljena dužina se
zaokružuje naviše i seče na granice; nula, NaN i nedostatak su odbijanje),
parseri polja nad svih 30 redova.

`convex/studioCatalogJob.test.ts` (14) - `createJob` kroz bazu: naplaćeno je
doslovno `computeCredits` nad upisanim parametrima; ulazi se upisuju sa slotom i
redosledom; `input_images` broji server, ne klijent; Seedance sa video
referencom ide po sniženoj tarifi; TTS se naplaćuje po izmerenom tekstu i preko
2 000 znakova; posao bez izmerene dužine se odbija PRE nego što skine kredit;
kombinacija koju katalog ne nudi se odbija; nepoznat slot i nepoznat režim se
odbijaju; ugašen v4 model ne pada nazad na stari red sa istim slugom; prompt je
obavezan samo tamo gde je jedini ulaz; galerija dobija četiri sličice od pet
ulaza sa tačnim ukupnim brojem, a `getJobForRegenerate` ceo spisak; tudji posao
se ne vraća.

`convex/providers/falInputs.test.ts` (8) - jedan fajl vs više, par kadrova,
reference, imenovani slotovi probe odeće, nepoznat slot, `{tier}` mapa i
odbijanje rute bez tarife, plus provera da svaka fal ruta iz kataloga sa
placeholderom ima tarifu za svaku svoju rezoluciju.

`lib/studio-playground.test.ts` (12) - kad je prompt obavezan, koji slot
isključuje vrednost kontrole (i da nijedan model to ne radi sam od sebe), iz kog
fajla se meri količina, prevodjenje sekundi u jedinicu pravila, i ceo redosled
zaključavanja dugmeta (ugašen Studio ima prednost nad nedostajućim ulazom, kredit
se proverava poslednji, balans koji se učitava ne zaključava unapred).

`lib/studio-catalog-admin.test.ts` (7) - svih 30 modela ima maržu >= 2,0x za
podrazumevana podešavanja; tabela preskače kombinaciju koju katalog ne nudi;
cena u tabeli je doslovno `computeCredits`; izmena osnove pomera svaku
kombinaciju osim ugnježdenog layerize pravila; odsečen prikaz i dalje zna
najgoru maržu iz celog prostora.

`convex/studioPricing.test.ts` (+4) - `applyPriceEdit`: osnova pomera porodicu,
`lookup` odbija izmenu osnove, negativna cena se odbija, nula briše dodatak,
ugnježdeno pravilo se ne dira.

`convex/studioModels.test.ts` (+3) - `listModels` traži prijavu i ne izlaže
`endpoints`; isključen model ne izlazi korisniku ali izlazi adminu i korisnik ne
sme da ga upali; izmena cene menja pravilo u redu, a `lookup` pravilo je odbija.

`lib/studio-gallery.test.ts` (+4) - `regenerateHref`, brojač ulaza, opis
podešavanja iz `paramSpec`-a (bez prompta i bez sirovih ključeva).

**Rezultat verifikacije:** sve četiri komande čiste.
- `npx convex codegen` - **prošlo** (exit 0, `Running TypeScript...` bez greške)
- `npm run lint` - **prošlo** (`17 problems (0 errors, 17 warnings)`; istih 17
  zatečenih upozorenja kao posle S6 - 7 u `admin-inline-actions.tsx`,
  `dashboard-content.tsx` i `public-course-intro-video.tsx`, 9 nekorišćenih
  uvoza u `convex/crons.ts` iz nedovršenog S0, 1 u `get_google_creds.js`.
  Nijedno nije iz fajlova ovog koraka.)
- `npm run test` - **prošlo** (`Test Files 55 passed (55) / Tests 646 passed (646)`)
- `npm run build` - **prošlo** (`Compiled successfully in 6.1s`,
  `Finished TypeScript in 14.4s`, `60/60` statičkih stranica; `/[locale]/app/studio`,
  `/[locale]/app/studio/gallery` i `/[locale]/app/admin/studio` su u tabeli ruta)

**BLOKADA:** nema.

**Za Jovana:**
1. **Pusti `npm run convex:seed` pre nego što otvoriš Studio** - bez reda u
   `models` tabeli playground kaže "nijedan model nije uključen". Bez `FAL_KEY`-a
   sve ide kroz mock provajdera, pa se ceo tok (rezervacija -> running -> done/refund)
   može proveriti bez ijednog pravog poziva.
2. **Fal rute i imena polja za v4 modele nisu potvrdjeni** (ODLUKA 9 i S5 ODLUKA 6).
   Pre nego što pustiš korisnicima, pusti po jednu generaciju na svakom obliku
   ulaza (jedna slika, više slika, prvi/poslednji kadar, reference, video+zvuk)
   i pogledaj šta fal vrati. Greška daje refund, ne trošak, ali korisnik vidi
   neuspeh. Imena polja su u `convex/providers/falInputs.ts`, rute u redu
   kataloga (menjaju se iz admin ekrana, bez deploy-a).
3. **Mock provajder uvek vraća SLIKU.** Video i audio model u demo režimu daju
   izlaz koji galerija ne ume da pusti kao video. To je zatečen mock iz P4 i nije
   dirano; kad dodje pravi ključ, prestaje da bude vidljivo.
4. **Dužinu okačenog fajla prijavljuje browser** (ODLUKA 3). Ko pozove mutaciju
   direktno može da prijavi manje sekundi nego što fajl ima i time potplati
   generaciju - najviše do `min`-a iz kataloga. Pravo rešenje je poredjenje sa
   `actualCostUsd`-om koji provajder vrati; polje već postoji, poredjenje ne.
   Modeli na koje se to odnosi: `kling-avatar`, `kling-lipsync`, `kling-motion`,
   `stt`, `voice-changer`, `audio-isolation`, `dubbing`.
5. **Ulazni fajlovi se ne brišu nikad** (ODLUKA 14). Kad Studio krene, ovo je
   prva stavka koja tiho raste na računu za storage. Odluka o roku (i o tome šta
   se dešava sa "Generiši ponovo" posle njega) je tvoja.
6. **Provera u browseru, šest stvari:** (a) cifra na dugmetu se pomera dok vučeš
   klizač trajanja; (b) značka uz 4K kod Klinga kaže "ista cena" kad uključiš
   zvuk; (c) prevlačenje fajla preko celog ekrana radi u režimu sa jednim
   slotom; (d) "Generiši ponovo" iz galerije vrati i slike, ne samo prompt;
   (e) balans u zaglavlju padne odmah po pokretanju posla; (f) u admin ekranu
   promeni `baseUsd` Seedream-a 4.5 i pogledaj da li se cela tabela kombinacija
   pomerila.
7. **Nije iz S7, i dalje stoji:** `convex/crons.ts` ima 9 nekorišćenih uvoza
   (globalni plafon troška iz S0 nije dovršen - konstante se sada PRIKAZUJU u
   admin ekranu, ali ih i dalje niko ne sprovodi), a `docs/STUDIO-PROGRESS.md`
   nema sekcije za S1 i S2.

---

## SRV - Revizija kataloškog run-a (S0-S7)   (2026-08-20 04:45)

**Fajlovi:** `docs/STUDIO-CATALOG-REPORT.md` (nov), `docs/STUDIO-PROGRESS.md`
(ova sekcija). **Nijedan fajl proizvoda nije menjan** - ovo je revizija, ne kod.
Privremeni revizorski alat `convex/providers/zzaudit.test.ts` je napisan,
pokrenut i obrisan pre završne verifikacije.

**Šta je uradjeno:** Puštene sve četiri komande i zabeležen tačan izlaz; pročitan
`git log` i `git diff --stat main...HEAD` (252 fajla, +40 951/-534); pročitane
sekcije S0-S7 progresa i sav nov kod u `convex/providers/`, `convex/studioPricing.ts`,
`convex/studio.ts`, `convex/crons.ts`, `convex/studioParamSpec.ts`,
`convex/studioJobCore.ts`, `convex/studioActions.ts` i nove komponente. Nabrojan
je **ceo prostor parametara svih 30 modela - 3 965 cenjivih kombinacija** - i za
svaku izračunata marža; provereno je programski rutiranje protiv sekcije 7
kataloga i slaganje `inputModes`/`inputSpec`/`endpoints`/`paramSpec`/`priceRule`.
Ponovo su prodjeni rizici a-f iz `STUDIO-NIGHT-REPORT.md` i dodato šest novih
staza koje je zadatak tražio. Izveštaj je `docs/STUDIO-CATALOG-REPORT.md`.

**ODLUKE:**
1. **"Najgora marža" se računa iz cenovnog pravila, a odstupanje stvarnog troška
   se izveštava odvojeno.** Po pravilu marža ne može ispod 2,5x (algebra:
   `ceil(x) >= x`, pa `marza >= 216,25/86,5`), pa bi tabela sa samo tim brojem
   bila tačna i beskorisna. Zato je uz nju izračunata i marža za scenarije u
   kojima provajder naplati više nego što pravilo pretpostavlja - tamo idu do
   **0,002x**. Bez te druge tabele izveštaj bi tvrdio da je sve u redu.
2. **Kreditne tabele u `STUDIO-CATALOG-V4.md` se razilaze sa motorom, i motor je
   ostavljen kakav jeste.** Katalog kolone „kr/s" i „5s" računa kao
   `ceil(po jedinici) x broj jedinica`, a `computeCredits` radi `ceil` tačno
   jednom na kraju - što je doslovno formula iz zaglavlja kataloga
   (`krediti = ceil(nabavno_USD x 216,25)`). Razlika: Kling 3 na 5 s je 91 a ne
   95, `tts` na 1 000 znakova 22 a ne 25, `stt` 2/min a ne 3, lipsync minimum 16
   a ne 20, `sfx` na 5 s 3 a ne 5. Po pravilu run-a **vrednost iz kataloga se
   koristi** - a vrednost iz kataloga je `baseUsd`, koji je prepisan tačno;
   kreditne kolone su izvedene i sa sobom u neskladu. Marža ostaje >= 2,5x u
   svakom slučaju, pa nije dirano ništa; upisano je u izveštaj (sekcija 1.1) kao
   stavka za ispravku u katalogu.
3. **Legacy `modelCatalog` put je prijavljen kao rizik, ne uklonjen.** Uklanjanje
   bi bilo menjanje ponašanja van obima revizije. Umesto toga je u ručnim
   koracima izričito rečeno da se `seed:seedModelCatalog` NE pušta.
4. **Rizik (d) iz noćnog izveštaja (Stripe dupla dodela) je označen kao van
   obima**, a ne kao rešen: Stripe put nije diran ni u jednom koraku S0-S7, pa
   bi nov status bio izmišljen.

**Testovi:** Nijedan nov trajan test - korak je revizija. Privremeni alat
(`zzaudit.test.ts`, obrisan) je nabrajao pun prostor parametara po modelu,
poredio `provider` sa sekcijom 7 kataloga, proveravao uzajamno slaganje
`inputModes`/`endpoints`/`inputSpec`/`paramSpec`/`priceRule`, i računao maržu za
scenarije odstupanja stvarnog troška. Njegovi nalazi su u izveštaju; postojećih
646 testova je ostalo netaknuto.

**Rezultat verifikacije:** codegen ✅ (exit 0) / lint ✅ (0 errors, 17 warnings) /
test ✅ (55 fajlova, 646 testova) / build ✅ (compiled successfully, 60/60 strana).
Sve četiri puštene ponovo posle brisanja privremenog alata.

**BLOKADA:** nema.

**Za Jovana:** Ceo spisak je u `docs/STUDIO-CATALOG-REPORT.md` sekcija 7. Tri
stvari pre prvog evra, po ceni:
- **R3** - sedam modela sa merenom količinom (`kling-avatar`, `kling-lipsync`,
  `kling-motion`, `stt`, `voice-changer`, `audio-isolation`, `dubbing`) naplaćuju
  onoliko koliko klijent prijavi. Za 13 kredita se dobija $72 posla kod
  ElevenLabs-a. **Ugasi ih (`isEnabled: false`) dok se ne popravi.**
- **R2** - `reference_with_video` daje 40% popusta a ne naplaćuje ulazni video
  (`referenceVideoBillableSeconds` nije pozvana nigde). Marža 1,50x bez ulaznog
  videa, **0,50x** sa njim. Izbaci `reference` iz `inputModes` Seedance-a ili ih
  ugasi.
- **R1** - globalni dnevni plafon troška ($50 alarm / $100 kill) **ne postoji kao
  cron**; `decideGlobalCostAction` se uvozi u `crons.ts` i nikad ne poziva. Dok
  to ne proradi, jedina automatska zaštita je tvrd plafon u fal dashboardu - a on
  ne pokriva ni Google ni BytePlus.

Uz to: BytePlus traži **$30 po Seedance modelu zaključano na nalogu, $60 za oba**,
i ima **3 istovremena Seedance posla po celom nalogu**, ne po korisniku.
**Ne puštaj `seed:seedModelCatalog`** (R5 - vraća FLUX i stare rute na fal).

## W1 - Admin i moderator u Studiju + pregled svih poslova   (2026-08-20 13:45)

**Fajlovi:**
- `convex/studioCore.ts` - nove ciste funkcije `isStudioStaff` i `hasStudioAccess`
- `convex/studio.ts` - `createJob` i `getStudioState` idu kroz `hasStudioAccess`;
  projekcija reda galerije izdvojena u `toGalleryJob`; novi `requireStudioStaff`,
  `listAllJobs` i `listJobOwners`
- `convex/studio.test.ts` - `INITIAL_ADMIN_EMAILS` u `beforeAll`, `seedUser` prima
  `role`/`email`/`username`, deset novih testova
- `lib/studio-playground.ts` - `PlaygroundState.isEnrolled` -> `hasStudioAccess`
- `lib/studio-playground.test.ts` - isto ime polja
- `lib/studio-gallery.ts` - `GALLERY_SCOPES`, `JOB_STATUSES`, `STUDIO_PROVIDERS`,
  njihove labele i `filterJobOwners`
- `lib/studio-gallery.test.ts` - dva nova testa
- `components/app/studio-page.tsx` - `state.hasStudioAccess` umesto `isEnrolled`,
  tip panela sada `PlaygroundState`
- `components/app/studio-gallery-page.tsx` - prekidac "Samo moji"/"Svi korisnici",
  filteri po korisniku/statusu/provajderu, kartica sa vlasnikom

**Sta je uradjeno:** Odluka "sme li neko u Studio" preseljena je u jednu cistu
funkciju `hasStudioAccess(role, enrollment)` u `studioCore.ts`; aktivan upis pusta
svakoga, a `admin` i `moderator` prolaze i bez njega. Istu funkciju zovu i
`createJob` (koji baca `NIJE_UPISAN`) i `getStudioState` (po kojem se gasi dugme),
pa UI i server ne mogu da tvrde suprotno. Naplata nije dirana - admin placa isto
kao svako drugi, sto je pokriveno testom nad ledgerom. U galeriji admin i
moderator dobijaju prekidac "Samo moji" / "Svi korisnici"; u rezimu "Svi" ide nov
query `listAllJobs` (najnoviji prvi, sa mejlom vlasnika, potrosenim kreditima,
modelom, provajderom i statusom) uz filtere po korisniku, statusu i provajderu.
Oba nova query-ja (`listAllJobs`, `listJobOwners`) stoje iza provere uloge na
serveru - prekidac u UI-ju je samo prikaz.

**ODLUKE:**
1. **Query-ji Studija nisu ni imali enrollment proveru, pa im nista nije
   "zaobidjeno".** W1 trazi da admin prolazi bez upisa u `listMyJobs`, galeriji i
   katalogu modela; provera je - `listMyJobs`, `studioModels.listModels` i
   `getJobForRegenerate` traze samo prijavu (`requireUserId`), enrollment se nigde
   ne cita. Dodavanje provere tamo bi bilo **novo ogranicenje za obicne korisnike**,
   ne popravka, pa je izabrana najkonzervativnija opcija: enrollment i dalje
   odlucuje na tacno dva mesta (`createJob` i `getStudioState`), i oba idu kroz
   `hasStudioAccess`. Uslov nije ponovljen nigde.
2. **"Guard stranica" je `getStudioState`, ne sam route fajl.** `/{locale}/app/studio`,
   `/studio/gallery` i `/credits` nemaju serverski enrollment guard - jedini gate je
   `generateBlock` -> `{ kind: "not_enrolled" }` u playground-u, koji cita
   `getStudioState`. Zato je popravljeno tamo, a route fajlovi nisu dirani.
3. **`isEnrolled` je preimenovano u `hasStudioAccess`** u povratnoj vrednosti
   `getStudioState`-a i u `PlaygroundState`. Za admina bi `isEnrolled: true` bila
   lazna tvrdnja (nije upisan, samo sme), a dva polja za istu odluku su tacno ono
   sto zadatak zabranjuje ("ne ponavljaj uslov").
4. **Uloga za prekidac dolazi iz `getStudioState.isStaff`, ne iz
   `profiles.getViewerProfileStatus`.** Ta zajednicka query vraca samo `isAdmin`,
   koristi je sedam komponenti van Studija, i sirenje njenog oblika zbog jednog
   prekidaca je izmena van obima. `listAllJobs` ulogu proverava ponovo, sam.
5. **`listAllJobs` bira indeks po najuzem zadatom filteru** - `by_user` kad je
   zadat korisnik, `by_status_created` kad je zadat samo status, inace ugradjeni
   `by_creation_time` sa `.order("desc")`. Nov indeks nije dodavan: `createdAt` se
   upisuje istim `Date.now()`-om kao `_creationTime`, pa je poredak isti, a schema
   migracija je rizik koji ovaj korak ne mora da uzme.
6. **Provajder se filtrira preko spiska slugova iz kataloga**, jer
   `generationJobs` ne pamti provajdera nego samo `modelSlug`. Provajder bez
   ijednog modela u katalogu vraca praznu stranu (`q.or()` bez izraza ne postoji),
   sto je pokriveno testom.
7. **Spisak korisnika za select se gradi od poslednjih 300 poslova**, a ne iz cele
   tabele korisnika: filtrira se po onome ko je stvarno nesto generisao, i citanje
   ostaje ograniceno. Ko je stao dublje od tog prozora i dalje se nalazi preko
   filtera po statusu i provajderu.
8. **Tudji posao se u galeriji ne brise i ne regenerise.** `deleteJob` i
   `getJobForRegenerate` ionako traze vlasnika, pa bi dugmad bacala gresku;
   kartica u rezimu "Svi" zato nosi podatke (mejl, provajder, status) umesto tih
   akcija. Preuzimanje izlaza ostaje - to je poenta pregleda.
9. **Uloga `admin` ne dolazi iz reda u `users`.** `effectiveRoleForProfile`
   (`helpers.ts`) iz baze prima samo `student`, `pro_student` i `moderator`;
   `admin` se izvodi iskljucivo iz `INITIAL_ADMIN_EMAILS`. Zateceno ponasanje nije
   menjano - testovi zato postavljaju tu env varijablu, isto kao
   `creditPacks.test.ts`. Videti "Za Jovana".

**Testovi:** `convex/studio.test.ts` - `hasStudioAccess`/`isStudioStaff` kao ciste
funkcije (upis pusta svakoga, `admin`/`moderator` i bez upisa, `pro_student` ne);
admin bez upisa pravi posao **i placa ga** (assertion nad `spend` transakcijom i
balansom); moderator bez upisa pravi posao a neupisan student i dalje dobija
`NIJE_UPISAN`; `getStudioState` javlja `hasStudioAccess: true` i `isStaff: true`
za admina; `listAllJobs` vraca tudje poslove sa mejlom vlasnika i provajderom,
najnoviji prvi; filtriranje po korisniku, statusu i provajderu, presek dva
filtera, i prazan provajder; `listAllJobs` i `listJobOwners` bacaju `Forbidden`
obicnom korisniku i neprijavljenom, dok `listMyJobs` istom korisniku i dalje vraca
samo njegovo; `listJobOwners` vraca vlasnike sortirane po mejlu sa brojem poslova.
`lib/studio-gallery.test.ts` - `filterJobOwners` (pretraga bez obzira na velika
slova, prazna pretraga nije filter) i postojanje labela za svaki scope/status/
provajder, uz proveru da se spisak provajdera ne razilazi sa katalogom.

**Rezultat verifikacije:** codegen OK (exit 0) / lint OK (0 errors, 17 warnings -
istih 17 kao pre koraka) / test OK (55 fajlova, 656 testova, +10) / build OK
(compiled successfully, 60/60 strana).

**BLOKADA:** nema.

**Za Jovana:**
1. **Proveri da je `INITIAL_ADMIN_EMAILS` postavljen na Convex deployment-u**, ne
   samo u `.env.local`. Uloga `admin` se izvodi iskljucivo iz te liste
   (`effectiveRoleForProfile`), pa bez nje ni ovaj korak ne pusta te u Studio:
   ```
   npx convex env list
   ```
   Ako `INITIAL_ADMIN_EMAILS` nema u izlazu, postavi je (ja to ne smem po
   pravilima run-a) - vrednost iz `.env.local` je
   `jovanm028@gmail.com,aleksadjor3@gmail.com`.
2. **Krediti se i dalje trose, i adminu.** Za testiranje bez trosenja svojih:
   ```
   npx convex run seed:grantDemoCredits '{"syncSecret":"<SYNC>","email":"jovanm028@gmail.com","amount":2000}'
   ```
   (`<SYNC>` je `WEBHOOK_SYNC_SECRET`; mutacija trazi da korisnik vec postoji,
   dakle prijavi se bar jednom pre nje. Nije idempotentna - svaki poziv otvara nov
   lot.)
3. **Rezim "Svi korisnici" se vidi u `/app/studio/gallery`**, prekidac je prvi red
   u panelu sa filterima i pokazuje se samo adminu i moderatoru. Provera da guard
   nije samo kozmeticki: obican nalog koji direktno pozove
   `api.studio.listAllJobs` dobija `Forbidden` (pokriveno testom).
4. Nalazi R1-R3 iz `docs/STUDIO-CATALOG-REPORT.md` ovim korakom **nisu** dirani i
   dalje stoje kao pre.

---

## W2 - Globalni dnevni plafon troska: peti cron   (2026-08-20 13:57)

**Fajlovi:**
- `convex/crons.ts` (izmenjen) - `applyGlobalCostAction` (internalMutation),
  `adminStudioLink` / `alertBody` / `sendGlobalCostEmail` (pomocne, bez `ctx`),
  `enforceGlobalCostCap` (internalAction), peti cron na 15 minuta
- `convex/crons.test.ts` (izmenjen) - sekcija "4. globalni dnevni plafon troska",
  10 novih testova + `beforeEach`/`afterEach` za env i `vi.unstubAllGlobals`

**Sta je uradjeno:** Zatvoren nalaz **R1**. `decideGlobalCostAction` je do sada
bila funkcija koju niko ne pita; sada je pita `applyGlobalCostAction` - jedna
transakcija koja sabere `studioUsageDaily.costUsd` za tekuci UTC dan preko
indeksa `by_day`, procita `platformFlags.studio_enabled` i postojanje reda u
`studioCostAlarms` za taj dan, pozove odluku i **odmah upise posledicu**:
`"kill"` gasi flag (patch ili insert, isto kao `studioAdmin.setStudioEnabled`),
`"alarm"` upisuje red za taj dan. Nijedan prag nije prepisan - obe konstante se
citaju iz `studioCore.ts`, u `crons.ts` nema nijednog broja. Akcija
`enforceGlobalCostCap` poziva tu mutaciju pa tek onda salje mejl preko Resend-a
(`https://api.resend.com/emails`, `AUTH_RESEND_KEY` + `AUTH_RESEND_FROM`, isti
put kao `emailVerification.ts`), primaoci iz `INITIAL_ADMIN_EMAILS` preko
`parseAdminEmails`. Registrovan je peti cron `"studio: globalni plafon troska"`
na 15 minuta. Devet lint upozorenja iz `crons.ts` je nestalo jer je svaki od tih
uvoza sada stvarno pozvan - nijedan nije brisan.

**ODLUKE:**
1. **Upis pre mejla, ne posle.** Mutacija commituje kill/alarm, akcija tek onda
   salje mejl. Obrnut redosled bi znacio da pokvaren Resend kljuc drzi Studio
   upaljen preko plafona - a to je tacno ono zbog cega plafon postoji. Posledica
   koju sam prihvatio: ako mejl padne, alarm je i dalje zapamcen kao poslat i
   nema ponovnog pokusaja. To je namerno - inace bi pokvaren Resend slao isti
   mejl svakih 15 minuta do ponoci, sto je tacno ono sto `studioCostAlarms`
   sprecava. Trag ostaje u Convex logu (`studio_cost_alert_*`), i taj log nosi
   iznos i dan, ne samo status greske.
2. **Zapamceno stanje alarma: tabela `studioCostAlarms` koja vec postoji u
   `schema.ts:1497`** (`by_day`, jedan red po danu). Nista novo nije dodato u
   semu - S0 je tabelu vec napravio i obrazlozio komentarom, samo je niko nije
   koristio. To je najmanja stvar koja radi.
3. **Zbir se cita `collect()`-om, bez `take` kapa.** `studioAdmin.getUsageSummary`
   kapira na 500 redova jer crta ekran; ovde bi odsecen zbir bio MANJI od
   stvarnog, dakle plafon koji tiho ne opali - najgori moguci ishod za korak ciji
   je ceo smisao zastita novca. Convex limit od 16 384 reda po transakciji je
   gornja granica: preko toga prolaz pukne glasno, sto je bolje od tihog
   podbacaja. Na danasnjoj skali (jedan red po korisniku koji je tog dana nesto
   generisao) to nije blizu.
4. **`first()` a ne `unique()` za alarm red.** Pitanje je samo "postoji li red za
   danas"; `unique()` bi na slucajnom duplikatu obarao ceo prolaz i time gasio
   plafon. Za `platformFlags` je zadrzan `unique()` jer je to zatecen obrazac na
   sva tri postojeca mesta.
5. **Mejl je `text`, bez HTML-a.** `emailVerification.ts` salje i html i text jer
   je to mejl korisniku sa dugmetom; ovo je interni alarm za dva admina i cist
   text radi svuda. Manje koda, nista se ne gubi.
6. **Ime crona je ASCII: `"studio: globalni plafon troska"`.** Convex odbija push
   sa `Invalid cron identifier ... use ASCII letters that are not control
   characters` - prva verzija sa "troska" pisanim sa kvacicom je oborila
   `npx convex codegen`. Ostala cetiri crona su ionako bez dijakritike.
7. **Link u mejlu se gradi iz `SITE_URL`**, isto kao `emailVerification.ts`. Ako
   varijabla fali, ostaje gola putanja `/sr/app/admin/studio` - mejl i dalje ima
   smisla, samo bez klika.
8. **`costUsd` je REZERVISAN trosak, ne naplacen.** `createJob` ga upisuje u
   trenutku rezervacije i refund ga ne vraca, pa je zbir gornja procena racuna.
   Nisam to menjao (to bi bila izmena naplatnog puta van obima ovog koraka) -
   greska je u konzervativnu stranu, plafon opali ranije umesto kasnije, i to je
   zapisano u doc-komentaru mutacije.

**Testovi:** `convex/crons.test.ts`, 10 novih (23 u fajlu, 666 u suite-u):
- ispod praga (49,99 $ preko dva reda): nema mejla, nema alarm reda, flag ostaje
- tacno 50,00 $: nista - prag je strogo preko, ne "veci ili jednak"
- preko 50 $: tri uzastopna prolaza -> `alarm`, pa `none`, pa `none`; **tacno
  jedan** `fetch`, tacno jedan alarm red, Studio ostaje UPALJEN; provereni su i
  primaoci (oba admina iz env-a), iznos u subject-u i dan u telu
- preko 100 $ (60 + 40,5): `kill`, flag na `false`, mejl sadrzi putanju admin
  ekrana; alarm red se NE upisuje (skok pravo na kill)
- vec ugasen Studio: drugi prolaz vraca `none`, drugog mejla nema, i dalje samo
  jedan red u `platformFlags`
- rucno ugasen Studio preko 50 $: ni alarm ne ide (kill i alarm oba traze
  `studioEnabled`)
- nov dan resetuje oba: jucerasnjih 90 $ + jucerasnji alarm red -> danas zbir 0 i
  `none`; posle novih 55 $ danas -> `alarm` ide ponovo, dva alarm reda
- Resend bez kljuca: `kill` prolazi, `fetch` nije ni pozvan, flag je ugasen
- Resend vrati 500: `kill` prolazi, flag je ugasen
- Resend baci mreznu gresku: `alarm` je i dalje zapamcen, sledeci prolaz vraca
  `none` (ne salje se drugi put)

**Rezultat verifikacije:**
- `npx convex codegen` - **OK** (`Running TypeScript...`, exit 0)
- `npm run lint` - **OK**, `8 problems (0 errors, 8 warnings)`. Bilo je 17;
  **svih 9 upozorenja iz `convex/crons.ts` je nestalo**, ostalih 8 su zatecena u
  fajlovima koje ovaj korak nije dirao.
- `npm run test` - **OK**, `Test Files 55 passed`, `Tests 666 passed` (+10)
- `npm run build` - **OK**, `Compiled successfully in 6.6s`,
  `Generating static pages (60/60)`

**BLOKADA:** nema.

**Za Jovana:**
1. **Plafon ne radi bez Resend varijabli na Convex deployment-u.** Gasenje radi i
   bez njih (to je i pokriveno testom), ali mejl ne stize, pa bi Studio umeo da
   se ugasi a da niko ne sazna dok ne otvori admin ekran. Proveri:
   ```
   npx convex env list
   ```
   Moraju da postoje `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM` i
   `INITIAL_ADMIN_EMAILS`. Ja ih po pravilima run-a ne smem postavljati.
   `SITE_URL` je opcion - bez njega mejl ima putanju umesto pune adrese.
2. **Cron se aktivira tek na sledecem deploy-u.** `npx convex codegen` ga je
   validirao, ali `crons.ts` se registruje pri deploy-u; do tada plafon i dalje
   ne radi na deployment-u.
3. **Kill se NE gasi sam od sebe.** Kad plafon opali, `platformFlags.studio_enabled`
   ostaje `false` dok ga rucno ne vratis na `/sr/app/admin/studio`. I posle
   vracanja: dok traje isti UTC dan zbir se ne resetuje, pa se Studio posle
   najvise 15 minuta gasi ponovo. To je namerno i pise u samom mejlu.
4. **Prag je 100 $ REZERVISANOG troska, ne naplacenog.** Refundiran posao ostaje
   u zbiru (`studioUsageDaily` se ne umanjuje pri refundu). Ako ti to smeta u
   praksi, to je izmena naplatnog puta i treba joj svoj korak.
5. Nalazi **R2** (`reference_with_video` ne naplacuje ulazni video) i **R3**
   (klijent bira `measuredQuantity`) ovim korakom **nisu** dirani i dalje stoje.
   R3 je i dalje najveca rupa u katalogu.

---

## W3 - R2: popust bez osnova + R3: klijent bira koliko ce mu se naplatiti   (2026-08-20 14:22)

**Fajlovi:**
- `convex/providers/bytePlusModels.ts` - `modeMultipliers: { reference_with_video: 0.6 }`
  uklonjen iz oba Seedance pravila, uz obrazlozenje na mestu uklanjanja
- `convex/studioPricing.ts` - prepisan doc-komentar
  `referenceVideoBillableSeconds`-a (ceka serversko merenje, referise R3)
- `convex/studioJobCore.ts` - novi `measuredSlotsFor`, `MIN_BITRATE_BPS`,
  `maxQuantityFromBytes`; `resolveMeasuredQuantity` prima cetvrti argument
  `maxFromFile` i dobija dve nove kapije
- `convex/studio.ts` - novi `measuredInputBytes` (cita `_storage.size`);
  `buildCatalogOrder` je sada `async` i prima `ctx`
- `convex/providers/modelSeed.ts` - novo polje `isEnabled?: false`
- `convex/providers/falToolModels.ts` - `kling-avatar`, `kling-lipsync`,
  `kling-motion` ugaseni
- `convex/providers/falAudioModels.ts` - `stt`, `voice-changer`,
  `audio-isolation`, `dubbing` ugaseni
- `convex/studioModels.ts` - seed gasi red koji katalog povlaci
- `convex/studioPricing.test.ts`, `convex/studioJobCore.test.ts`,
  `convex/studioCatalogJob.test.ts`, `convex/studioModels.test.ts`,
  `convex/providers/catalogModels.test.ts` - prepisani i novi testovi

**Sta je uradjeno:** Seedance vise ne daje 40% popusta za `reference` sa video
ulazom. Popust je po katalogu 3.4 postojao zato sto se uz izlaz naplacuje i
ulazni video - a ulazni video se nije naplacivao, jer server ne zna koliko
traje; marza je time padala na 0,50x. `referenceVideoBillableSeconds` je
ostavljena netaknuta u kodu, sa prepisanim komentarom koji kaze da ceka
serversko merenje i da se vraca zajedno sa mnoziocem. Sedam modela koji se
naplacuju po duzini okacenog fajla (`kling-avatar`, `kling-lipsync`,
`kling-motion`, `stt`, `voice-changer`, `audio-isolation`, `dubbing`) je
ugaseno u seed-u, i seed ih od sada gasi i na vec upisanom redu. `createJob`
prijavljenu kolicinu vise ne prima na rec: cita `_storage.size` okacenih fajlova
mernog slota, iz njega izvodi najduze trajanje koje u toliko bajtova uopste moze
da stane (32 kbps zvuk, 200 kbps video) i odbija prijavu preko te granice
(`KOLICINA_VECA_OD_FAJLA`), a posao bez ijednog serverski vidljivog bajta odbija
odmah (`MERENJE_NIJE_DOSTUPNO`).

**ODLUKE:**
1. **Sta tacno znaci "tvrda kapija bez serverskog merenja" (tacka 2 zadatka).**
   Dva citanja: (a) hard-block - svaki model sa merenom kolicinom iz fajla pada
   dok W5 ne napravi pravo merenje; (b) kapija se okida kad server nema NIJEDAN
   bajt uz koji bi prijavu proverio. Izabrano je (b), iz dva razloga: W5.md sam
   kaze "W3 je zatvorio rupu grubom granicom po velicini fajla i iskljucio sedam
   modela", dakle granica iz tacke 3 mora da bude ziva; a pod (a) bi ta granica u
   `createJob`-u bila mrtav kod, sto je tacno nalaz R1 iz istog izvestaja. Kapija
   je pisana tako da W5 samo doda svoj izvor merenja - ostaje kao mreza.
2. **Zasto je onda napad od 0,002x zaista zatvoren.** Granica po velicini je
   JEDNOSTRANA: hvata prijavu vecu od fajla, ne i manju (120 minuta prijavljenih
   kao 0,1 i dalje bi prosli). Suprotna granica (najkraci moguci snimak iz
   MAKSIMALNOG bitrate-a) nije uvedena namerno: da bi bila sigurna, gornji
   bitrate mora da pokrije WAV 96/24 i ProRes, pa bi ili odbijala postene
   korisnike ili bila bezuba. Zato je nosilac zastite tacka 1 - sedam modela je
   ugaseno - a kapija i granica su mreza ispod nje.
3. **Seed od sada GASI red koji katalog povlaci.** Zatecena semantika je bila
   "`isEnabled` se postavlja samo pri prvom upisu", zbog cega bi `isEnabled:
   false` u seed-u na vec seedovanom deployment-u bio bez ikakvog dejstva - a to
   je jedina zastita iz tacke 1 iznad. Izmena je JEDNOSMERNA: seed sme da ugasi,
   nikad da upali. Zato je i tip polja `isEnabled?: false`, a ne `boolean` -
   `isEnabled: true` u seed-u je greska prevodjenja, ne tiho ignorisana vrednost.
   Kad W5 bude vracao sedam modela, brise se marker iz seed-a, a paljenje ide iz
   admin ekrana (ili se ova odluka svesno menja u tom koraku).
4. **Bitrate: 32 kbps zvuk, 200 kbps video** (predlog iz zadatka, prihvacen).
   Greska na nisku stranu samo propusti previsoku prijavu; greska na visoku
   odbija postenog korisnika. 32 kbps je donji kraj razumljivog govornog
   MP3/Opus-a, 200 kbps donji kraj 480p H.264. Svaki bogatiji format daje krace
   trajanje po bajtu, pa granicu samo produbljuje.
5. **`input_media_minutes` sabira i video i zvuk slot.** `stt` i `dubbing` primaju
   oba pod istim pravilom po minutu, pa granica gleda oba; svaki slot se racuna
   po svom bitrate-u.
6. **Granica se proverava PRE secenja na kataloski `max`.** Da je posle,
   prijavljenih 3600 sekundi bi se najpre steslo na 60 pa proslo kroz granicu od
   100 - nemoguca prijava bi se sakrila iza plafona. Pokriveno testom.
7. **`normalizeId` pre `ctx.db.system.get`-a.** `storageId` dolazi sa klijenta, a
   `get` na nizu koji nije ID baca umesto da vrati `null`. Nepostojeci i
   neispravan ID daju isti ishod - `MERENJE_NIJE_DOSTUPNO`.
8. **Dve nove poruke greske nemaju svoj tekst u `lib/studio-messages.ts`.**
   Nedostizne su dok je sedam modela ugaseno (`MODEL_NEDOSTUPAN` pada ranije), a
   zatecen `NEDOSTAJE_KOLICINA` je vec u istoj situaciji - pada na opstu poruku.
   Tekst pise korak koji modele vraca (W5), da se ne pise kopija za put koji
   trenutno niko ne moze da prodje.
9. **`buildCatalogOrder` je postao `async` i prima `ctx`.** Merenje trazi citanje
   iz baze; isti oblik vec ima `buildLegacyOrder(ctx, ...)`, pa je izabran on
   umesto da se bajtovi citaju izvan funkcije i provlace kroz argument.

**Testovi:**
- `studioPricing.test.ts` - `reference` sa videom se naplacuje po PUNOJ tarifi
  (164 kr u oba rezima, odnos 1,0); nijedno Seedance pravilo nema
  `modeMultipliers`; `referenceVideoBillableSeconds` i dalje racuna tacno
  (5+4=9), ali je niko ne zove, pa je cena `0,151 x 5` a ne `x 0,6`
- `studioCatalogJob.test.ts` - Seedance sa video referencom nema popust kroz ceo
  `createJob`; model sa merenom kolicinom bez video fajla i sa izmisljenim
  `storageId`-jem daje `MERENJE_NIJE_DOSTUPNO` (0 poslova, balans netaknut);
  `dubbing` sa 2 MB zvuka i prijavljenih 120 minuta daje
  `KOLICINA_VECA_OD_FAJLA:minutes` PRE skidanja kredita; `dubbing` sa 3 MB zvuka
  i prijavljena 3 minuta prolazi i naplacuje se po `computeCredits`-u
- `studioJobCore.test.ts` - `maxQuantityFromBytes` (250 kB videa = 10 s,
  240 kB zvuka = 60 s = 1 min, slot koji se ne meri ne pomera granicu, prazan
  fajl i `null` daju `null`); `measuredSlotsFor` za sva tri izvora; kapija se
  okida i kad prijave nema; granica se proverava pre secenja; tacno na granici
  prolazi; tekst i dalje prolazi sa `maxFromFile = null`
- `studioModels.test.ts` - povucen model ostaje ugasen i posle ponovnog seed-a
  cak i kad ga je neko upalio; `listModels` vraca 23 reda umesto 30
- `catalogModels.test.ts` - tacno tih sedam slugova se naplacuje po duzini
  fajla i sva sedmorica su `isEnabled: false`, dok `tts`/`dialogue` (tekst meri
  server) ostaju u ponudi

**Rezultat verifikacije:**
- `npx convex codegen` - **OK** (`Running TypeScript...`, exit 0)
- `npm run lint` - **OK**, `8 problems (0 errors, 8 warnings)` - isto stanje kao
  posle W2, nijedno upozorenje nije u fajlovima ovog koraka
- `npm run test` - **OK**, `Test Files 55 passed (55)`, `Tests 674 passed (674)`
  (+8 posle W2)
- `npm run build` - **OK**, `Compiled successfully in 7.3s`,
  `Generating static pages (60/60)`

**BLOKADA:** nema.

**Za Jovana:**
1. **Sedam modela se ne gasi samo od sebe na deployment-u - moras pustiti seed.**
   Kod je promenjen, red u bazi nije. Posle deploy-a:
   ```
   npm run convex:seed
   ```
   (ili `studioModels.seedStudioModels` sa `WEBHOOK_SYNC_SECRET`-om). Do tada su
   `kling-avatar`, `kling-lipsync`, `kling-motion`, `stt`, `voice-changer`,
   `audio-isolation` i `dubbing` i dalje u ponudi, i rupa 0,002x na njima i dalje
   stoji. Proveri posle seed-a da ih na `/sr/app/studio` vise nema u izboru.
2. **Katalog ce korisniku prikazati 23 modela umesto 30.** To je namerno i traje
   do W5; nista drugo nije uklonjeno.
3. **Seedance je poskupeo za `reference` sa videom** - 164 kr umesto 98 kr na
   720p/5 s. Ako je negde u marketingu ili u kursu upisana stara cifra, treba je
   ispraviti.
4. **R4 (`storageId` bez provere vlasnistva) nije diran.** Novi
   `measuredInputBytes` cita velicinu fajla po `storageId`-ju koji je poslao
   klijent, dakle jedno mesto vise koje bi tudji fajl dotaklo - ali `createJob`
   je tudji `storageId` primao i ranije, i galerija ga je i ranije potpisivala,
   pa ovo nije nova rupa. Zatvara je W4 (tabela `studioUploads`).
5. **`STUDIO-CATALOG-V4.md` 3.4 i dalje opisuje snizenu tarifu za `reference` sa
   videom.** Kod je sada strozi od kataloga. Ostavljeno je namerno - katalog je
   opis dogovora sa provajderom, ne stanja koda - ali kad W5 vrati merenje,
   proveri da se opet poklapaju.

## W4 - R4: vlasnistvo nad okacenim fajlovima   (20. avgust 2026, 14:45)

**Fajlovi:**
- `convex/schema.ts` - nova tabela `studioUploads`
- `convex/studioCore.ts` - `INPUT_UPLOAD_TTL_MS`
- `convex/studio.ts` - `registerInputUpload` (nova mutacija), `ownedInputUploads`
  (zamenila `measuredInputBytes`), `buildCatalogOrder` prima `userId`,
  `createJob` sklanja `expiresAt` vezanim uploadima
- `convex/crons.ts` - `expireGenerationFiles` brise i nevezane uploade
- `convex/migrations.ts` - `backfillStudioUploads`
- `components/studio/use-slot-upload.ts`, `components/studio/drop-slot.tsx` -
  prijava posle uploada, slot se prosledjuje kroz `useSlotIntake`
- `lib/studio-messages.ts` - poruka za `TUDJI_FAJL`
- testovi: `convex/studioCatalogJob.test.ts`, `convex/crons.test.ts`,
  `lib/studio-messages.test.ts`

**Sta je uradjeno:** Ko je koji fajl okacio sada se pamti. `createInputUploadUrl`
je ostao kakav jeste - vraca URL i ne zna ishod uploada - a vezu `storageId` ->
korisnik pravi nova mutacija `registerInputUpload`, koju klijent zove odmah
posle uploada; ona proverava da fajl stvarno postoji (`ctx.db.system.get`) i
upisuje vlasnika, velicinu i MIME tip iz `_storage`. `createJob` od sada svaki
`storageId` iz `inputs` trazi u toj tabeli i odbija ga sa `TUDJI_FAJL` ako reda
nema ili je tudji - pre cene, pre upisa posla i pre skidanja kredita. Time pada
i druga polovina nalaza: nepostojeci `storageId` vise ne prolazi kroz naplatu da
bi pao tek na predaji i vratio se kroz refund. Velicina fajla se cita jednom, na
prijavi uploada, i isti `bytes` nosi granicu prijavljenog trajanja iz W3 - stara
funkcija `measuredInputBytes` je zato obrisana, a ne dopunjena. Nevezan upload
nosi `expiresAt` +24 h i brise ga postojeci cron za istek fajlova (i blob i
red); cim `storageId` udje u posao, `createJob` mu `expiresAt` sklanja.

**ODLUKE:**
1. **Nepostojeci `storageId` daje `TUDJI_FAJL`, ne svoju gresku.** Zadatak trazi
   jednu proveru ("postoji u toj tabeli i pripada tom korisniku"), a razlika
   izmedju "ne postoji" i "nije tvoj" je informacija koju napadac ne treba da
   dobije - identicna poruka za oba slucaja je ista logika po kojoj
   `getJobForRegenerate` na tudji posao vraca `null`, a ne "zabranjeno".
2. **Slot se upisuje ali se NE proverava.** `studioUploads.slot` pamti u koji je
   slot fajl okacen, ali `createJob` ne trazi da se poklopi sa slotom u
   `inputs`-u. Zadatak trazi proveru vlasnistva i postojanja; provera slota bi
   bila nova kapija koju niko nije narucio, a lako odbija postenog korisnika
   (isti fajl u dva slota, `FrameSlotPair` koji oba kadra salje kao `image`).
   Broj i vrsta fajlova po slotu se i dalje proveravaju u `sanitizeJobInputs`.
3. **`registerInputUpload` trazi samo prijavu, ne i upis na kurs.** Ista kapija
   koju ima `createInputUploadUrl` iznad; pravo da se generise proverava
   `createJob`, i to nije promenjeno. Uze bi znacilo dve razlicite kapije nad
   istim korakom.
4. **Ponovljena prijava istog fajla od istog korisnika prolazi bez novog reda.**
   Klijent mutaciju zove posle uploada, dakle preko mreze koja sme da ponovi
   zahtev. Prijava tudjeg vec prijavljenog fajla se odbija - to je jedini nacin
   da se vlasnistvo prepise.
5. **Dodat je indeks `by_expiry` kojeg zadatak ne pominje.** Bez njega cron ne
   moze da nadje istekle uploade osim skeniranjem cele tabele. Isti oblik i isti
   `q.gt("expiresAt", 0)` kao kod `generationJobs` - polje je opciono, pa redovi
   bez roka stoje u indeksu ispod svakog broja i cist `lte(now)` bi ih pokupio.
6. **Dodat je `backfillStudioUploads`, koji zadatak ne trazi.** Bez njega bi
   "Generisi ponovo" na svakom poslu napravljenom PRE ovog koraka vracalo
   `TUDJI_FAJL` nad sopstvenim fajlom - regresija, ne zatvorena rupa. Prolaz
   upisuje vlasnika posla kao vlasnika njegovih ulaza, bez roka; fajl kojeg u
   storage-u vise nema se preskace.
7. **Cron vraca `{ cleared, uploads }` umesto `{ cleared }`.** Dva razlicita
   posla u istom prolazu se broje odvojeno: izlaz gubi fajl a zadrzava red,
   nevezan upload nestaje ceo. Tri zatecena testa su dopunjena novim poljem,
   nijedna tvrdnja nije uklonjena.
8. **Postojeci test "bez ijednog serverski vidljivog fajla" sada za izmisljen
   `storageId` ocekuje `TUDJI_FAJL` umesto `MERENJE_NIJE_DOSTUPNO`.** Ponasanje
   je namerno promenjeno - zadatak izricito trazi da nepostojeci ID padne na
   vlasnistvu, dakle ranije. Prva polovina tog testa (slika okacena, video ne)
   i dalje daje `MERENJE_NIJE_DOSTUPNO` i nije dirana.
9. **Test helper `storeFile` sada ide pravom mutacijom** (`upload` pa
   `registerInputUpload`) umesto direktnog `ctx.db.insert`-a, i prima korisnika
   umesto `t`-a. Testovi tako prolaze isti put kao klijent; da helper upisuje
   red rucno, prijava bi ostala nepokrivena.

**Testovi:**
- `studioCatalogJob.test.ts` - tudji `storageId` daje `TUDJI_FAJL`, bez posla i
  bez skinutog kredita, a tudji upload ostaje nevezan sa svojim rokom; okacen ali
  neprijavljen fajl ne prolazi; `storageId` koji uopste ne postoji pada pre
  naplate (0 poslova, balans netaknut); svoj fajl prolazi i posle posla nema
  `expiresAt`; prijava ne prepisuje vlasnika, ponovljena prijava ne pravi drugi
  red, obrisan fajl daje `FAJL_NE_POSTOJI`; `bytes` u redu je stvarna velicina iz
  storage-a (2 MB), a ne ono sto je klijent rekao
- `crons.test.ts` - nevezan upload stariji od 24 h nestaje ceo (i blob i red);
  upload koji je usao u posao (`expiresAt` sklonjen) preziva prolaz koji istog
  trenutka brise nevezanog suseda; upload kojem rok tek istice se ne dira
- `lib/studio-messages.test.ts` - `TUDJI_FAJL` je dopisan u listu kodova, pa
  zatecena dva testa tvrde i za njega da ima svoju recenicu i da ne prikazuje
  sirov kod
- Zatecenih 21 poziv `storeFile`-a sada prolazi kroz `registerInputUpload`, pa
  ceo postojeci skup testova nad ulazima usput pokriva i srecan tok prijave

**Rezultat verifikacije:**
- `npx convex codegen` - **OK** (`Running TypeScript...`, exit 0)
- `npm run lint` - **OK**, `8 problems (0 errors, 8 warnings)` - isto stanje kao
  posle W3, nijedno upozorenje nije u fajlovima ovog koraka
- `npm run test` - **OK**, `Test Files 55 passed (55)`, `Tests 683 passed (683)`
  (+9 posle W3)
- `npm run build` - **OK**, `Compiled successfully in 6.7s`,
  `Generating static pages (60/60)`

**BLOKADA:** nema.

**Za Jovana:**
1. **Posle deploy-a pusti `backfillStudioUploads`**, inace "Generisi ponovo" na
   poslovima napravljenim pre ovog koraka pada na `TUDJI_FAJL`:
   ```
   npx convex run migrations:run '{"fn":"migrations:backfillStudioUploads"}'
   ```
   (ili kroz `migrations:runAll`, gde je dopisan na kraj liste). Prolaz je
   idempotentan - drugi put ne upisuje nista.
2. **Fajlovi okaceni pre deploy-a a nikad upotrebljeni ostaju siroce.** Nemaju
   red u `studioUploads`, pa ih ni cron ne vidi; backfill hvata samo one koji su
   usli u posao. Ako ih ima puno u dashboard-u, brisu se rucno.
3. **Ulazni fajlovi se i dalje ne brisu kad se posao obrise.** `deleteJob` brise
   izlaz i poster, ulaze nikad - zateceno ponasanje, nije dirano ovim korakom.
   Vredi zasebnog koraka ako racun za storage pocne da smeta.
4. **Provera na deployment-u:** okaci sliku u Studiju, pogledaj da je red u
   `studioUploads` nastao sa tacnom velicinom, pokreni generaciju i proveri da
   je `expiresAt` nestao. Za drugu stranu: uzmi `storageId` iz tudjeg reda i
   posalji ga kroz `createJob` (npr. iz dashboard-a) - mora da vrati
   `TUDJI_FAJL` i da ne skine kredite.
