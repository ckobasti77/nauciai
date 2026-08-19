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
