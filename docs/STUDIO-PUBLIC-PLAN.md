# STUDIO PUBLIC — F0 audit i plan

> Grana `feat/studio-public` (iz `feat/ux-boost` aa644a3) · 30.08.2026.
> Cilj: Studio kao samostalan javni proizvod (nalog → potvrđen email → kupovina kredita →
> generisanje), uz nultu toleranciju: **niko ne sme da dođe do kredita ili generacija koje nije platio.**
> Faze F1–F6 i ODLUKE: vidi `docs/STUDIO-PUBLIC-PROGRESS.md`. Ovaj dokument je snimak stanja PRE izmena.

---

## (a) Gde tačno stoji „zatvoreno testiranje / samo osoblje" gejt

| Šta | Gde | Detalj |
|---|---|---|
| Konstanta | `convex/studioCore.ts:36` | `export const STUDIO_STAFF_ONLY = true;` (X8, 21.08.2026) |
| Odluka | `convex/studioCore.ts:57-64` | `hasStudioAccess(role, enrollment, staffOnly = STUDIO_STAFF_ONLY)` — dok je const upaljen vraća `isStudioStaff(role)` (admin/moderator, :24-26); treći argument postoji SAMO za test |
| Fallback formula | `convex/studio.ts:418-422` (i identično :1687-1691) | bilo koji AKTIVAN red u `enrollments` (`by_user` + filter status="active") ILI osoblje — `courseId` se ne gleda |
| Pozivalac 1 | `convex/studio.ts:423` | `createJob` baca `NEMA_PRISTUPA` |
| Pozivalac 2 | `convex/studio.ts:1700` | `getStudioState.hasStudioAccess` — po njemu UI gasi composer |
| UI poruka | `lib/studio-messages.ts:487` (`STUDIO_NOT_ENROLLED`, EmptyStateNoCta) i :137 (`NEMA_PRISTUPA`) | „Studio je u zatvorenom testiranju…" |
| UI grananje | `components/app/studio-page.tsx:545-570` | floating slot: `!enabled` → STUDIO_PAUSED → `!hasStudioAccess` → STUDIO_NOT_ENROLLED → `!hasAcceptedTerms` → StudioTermsGate → composer |

Kill switch je ODVOJEN mehanizam: `platformFlags` red `studio_enabled`
(`convex/schema.ts:1674-1677`, ključ u `studioCore.ts:17`; odsutan red ⇒ uključeno), čita ga
`createJob` (`studio.ts:407-411`) i `getStudioState` (:1673-1676); admin ga menja kroz
`studioAdmin.setStudioEnabled` (:218), a globalni $100/dan cron ga sam gasi (`crons.ts:235-237`).

**KLJUČNO za F1:** gejt se danas proverava SAMO u `createJob`. Bez ikakvog gejta (samo
`requireUserId`) rade: `createInputUploadUrl` (:1478 — neograničeno izdavanje upload grantova),
`registerInputUpload` (:1513), `measureInputUpload` (`studioActions.ts:320`, 30/h), `listMyJobs`
(:936), `deleteJob` (:1431), `acceptStudioTerms` (:1654), i sve četiri funkcije u
`convex/studioProjects.ts`.

---

## (b) Ceo put pare

### pack → Stripe checkout
- Paketi žive u bazi: `creditPacks` (`convex/schema.ts:1404-1416`), seed `convex/seed.ts:406-493`
  (`stripePriceId` se namerno NE seed-uje — admin ga upisuje kroz `upsertPack`).
- Javno čitanje: `creditPacks.listPacks` (`convex/creditPacks.ts:13-34`, bez auth-a, projektovano).
- Checkout: `POST /api/stripe/credits` (`app/api/stripe/credits/route.ts`) — klijent šalje **samo
  `{ packSlug, locale }`** (:29-30). Redosled provera: auth (:47, 401), verifikovan email (:50, 403
  `EMAIL_VERIFICATION_REQUIRED`), pack postoji/aktivan (:54), `kind === "pack"` (:68), ima
  `stripePriceId` (:80). Sve što ide Stripe-u čita se server-side iz DB reda + viewer-a (:94-102).
- Sesija: `lib/stripe.ts:101-131` `createCreditPackCheckoutSession` — `mode: "payment"`,
  `allow_promotion_codes: false` (:122, kupon od 100% bi pravio besplatnu petlju),
  `metadata { kind: "credit_pack", packId, packSlug, userId, credits }` (:123-129),
  `success_url`/`cancel_url` → `/{locale}/app/credits?checkout=...` (:116-117).

### webhook → grant
- `app/api/stripe/webhook/route.ts`: potpis `stripe.webhooks.constructEvent(rawBody, signature,
  STRIPE_WEBHOOK_SECRET)` (:324; sirovo telo :316; bez header-a → 400 :318).
- `checkout.session.completed` / `async_payment_succeeded` → `grantCreditPackCredits` (:108-143):
  traži `mode==="payment" && metadata.kind==="credit_pack"`, `payment_status==="paid"` (:113),
  **`amount_total > 0`** (:126 — 0-dinarska naplata ne dodeljuje ništa).
- Iznos kredita: `creditsCore.creditPackGrants` (:226-247) čita `Number(metadata.credits)` iz
  server-side snapshot-a sesije, validira `isValidCreditAmount` (ceo broj > 0).
- Grant: `credits.applyStripeGrant` (public mutation, `requireSyncSecret` :511) →
  `internal.credits.grantCredits` (:166-232) — **idempotentno** po `by_stripe_session` /
  `by_stripe_invoice` (`findLotByKey` :177-178; indeksi `schema.ts:1350-1351`).
- `invoice.paid` → plan doza (ključ `invoice.id`) + welcome bonus (vidi (c)); kursne pretplate su
  strukturno isključene (`studioPlanSlug` traži `metadata.kind === "plan"`, `creditsCore.ts:215-218`).
- `charge.refunded` / `charge.dispute.created` → `applyStripeReversal` (:549-623): idempotentno po
  `creditReversals.by_eventId`, povlači PUN dodeljen iznos (saldo sme u minus), dispute red = brava.
- **success_url NE dodeljuje ništa**: `?checkout=` parametar se nigde ne čita (provereno grep-om);
  balans skače isključivo preko Convex subscription-a na `credits.getBalance`.

### spend (cena ISKLJUČIVO server-side)
- `createJob` argumenti (`convex/studio.ts:365-389`): `modelSlug, params(JSON), inputMode, inputs,
  sourceJobId, lessonId, taskId, projectId`. **Nema cene, nema iznosa, nema trajanja** (klijentsko
  trajanje uklonjeno u W5/R3 — komentar :377-380).
- Cena se gradi u `buildCatalogOrder` (:167-311) iz `models.priceRule` + `paramSpec`:
  - `inputMode` mora ∈ `model.inputModes` (:180-182);
  - slotovi/ulazi kroz `sanitizeJobInputs` + **vlasništvo svakog `storageId`** (`ownedInputUploads`
    :118-155 → `TUDJI_FAJL`);
  - `sanitizeSpecParams` (`convex/studioParamSpec.ts:133-189`): nepoznati ključevi se BRIŠU; `select`/
    `segmented` mora biti u `options` (nikad koerce); `number`/`slider` klamp na `[min,max]` +
    reject `> max×10` (`VAN_OPSEGA`); tekst `slice(0, max)`; na kraju `isCombinationPriceable`;
  - **izmerene količine** server-side PREPISUJU klijentov broj (:221): trajanje iz BAJTOVA fajla
    (`boundedInputSeconds`, `studioJobCore.ts:323-371` — nemoguće zaglavlje ⇒ `ZAGLAVLJE_NEMOGUCE`,
    kraće-od-fizike ⇒ naplata po donjoj granici); bez merenja ⇒ `MERENJE_NIJE_DOSTUPNO` (nikad
    klijentov broj); `extras` se rekompjutuje iz verifikovanih upload-a (:231);
  - `computeCredits`/`computeCostUsd` u `try` — svaki throw ⇒ posao odbijen; `!isFinite || <= 0 ⇒
    reject` (:281). `studioPricing.ts` je otporan na prototype pollution (`Object.hasOwn`).
- **Atomsko**: INSERT `generationJobs` (status `reserved`, :533) + `applySpend` kao PLAIN funkcija u
  ISTOJ transakciji (:571-575 — namerno ne `ctx.runMutation`, da pad spend-a obori i insert).
  `planSpend` (creditsCore.ts:50-67) FIFO po `expiresAt`; vraća `null` pre ijednog upisa →
  `NEDOVOLJNO_KREDITA` (credits.ts:262). Job se šalje provajderu tek POSLE (scheduler :593).

### refund
- `credits.refundCredits` je **internalMutation** (:458); idempotentno po `(jobId, "refund")` preko
  `creditTransactions.by_job_type` (:461-465; indeks `schema.ts:1368`).
- Jedini pozivalac: `studio.failJob` (internal, :793-816). Pozivaoci `failJob`-a (svi verifikovani):
  fal webhook (`falWebhook.ts:169` — Ed25519/JWKS potpis nad sirovim bajtovima + timestamp,
  :82-137), BytePlus (`byteplus.ts:307` — telo daje SAMO task id, status se čita re-fetch-om sa
  BytePlus API-ja; `bytePlusCore.ts:58-59`), Google poller (`google.ts:461` — cron, nema HTTP rute),
  submit-failure staze (`studioActions.ts:133`, `byteplus.ts:126`, `google.ts:123`), reaper cron
  (`crons.ts:73`). **Ne postoji nijedna korisnički pozivna refund staza** (proveren svaki
  `= mutation({` u credit/studio površini). `deleteJob` odbija in-flight i ne refundira (:1437).
- Settlement: `settleJobCredits` (:716-780) idempotentno po `job.settledAt`; `planSettlement`
  (`studioSettlementCore.ts`) preferira količinu i ponovo prolazi kroz iste katalog klampove.

### DEMO / mock napomena
`providerKeyPresent` (`studioCore.ts:499-507`) je jedina mock kapija (SP2): bez provider ključa job
ide u DEMO (`submitJob` → `completeMockJob`). **DEMO TROŠI kredite** („demo provajdera, ne ledgera",
`studioActions.ts:206-209`); ~15% mock padova ide kroz regularni refund. Za javni launch ovo je
rizik R10 (korisnik ne sme da plati SVG mock).

---

## (c) validatePrompt · studioUsageDaily · welcome bonus

### validatePrompt
- `convex/creditsCore.ts:174-185`; blok lista `BLOCKED_TERMS` — 51 termin (:100-150) u 4 neformalne
  grupe (NSFW / maloletnici / deepfake stvarnih osoba / ilegalno) — **struktura nema kategorije**,
  nema nasilja ni javnih ličnosti. `normalizeForModeration` (:157-165): lowercase, đ→dj, NFD strip,
  ne-alfanumerici → razmaci; poklapanje je word-prefix (`" " + term`). `MAX_PROMPT_LENGTH = 2000`.
- Poziva se u builderima PRE ijednog upisa/spend-a (v4 :262-269, legacy :322-324). Odbijanje BACA
  `NEISPRAVAN_PROMPT:<razlog>` ⇒ transakcija se ROLLBACK-uje ⇒ **ništa se ne loguje** (promptHash se
  računa samo za prihvaćene poslove). Korisnik može da sondira listu bez traga (rizik R6).

### studioUsageDaily i limiti danas
- `convex/schema.ts:1661-1669`: `{userId, day (UTC "YYYY-MM-DD"), generations, creditsSpent,
  costUsd}`, indeksi `by_user_day`, `by_day`. Upis posle spend-a (`studio.ts:577-591`), korektivni
  delta pri settlement/refund (:679-696).
- Limiti (konstante u `studioCore.ts` — promena traži deploy): `MAX_ACTIVE_JOBS = 3` (:7; provera
  `studio.ts:493-501`), `MAX_DAILY_GENERATIONS = 50` (:10; :516-520), `MAX_DAILY_COST_USD = 5`
  (:195; :523-525), `MAX_UNSETTLED_COST_USD = 3` (:216; :508-512), merenje 30/h (:454-456), globalni
  $50 alarm / $100 kill (:237-238; `crons.ts:201-254`, 15-min kadenca). **Per-minute limit ne
  postoji** (rizik R5). Postoje i brave: `SPOR_U_TOKU` (:466-470), `SALDO_U_MINUSU` (:477-481),
  `NEPORAVNAT_DUG` (:487-491).

### Welcome bonus (postojeći)
- `WELCOME_BONUS_CREDITS = 150` (`creditsCore.ts:16`); ključ `welcome:<userId>` (:24-26 — namerno po
  KORISNIKU, ne po fakturi: otkaži-pa-pretplati + 100% kupon bi pravio petlju).
- Okidač: Stripe `invoice.paid` sa `billingReason === "subscription_create"` + `metadata.kind ===
  "plan"` + `amountPaid > 0` (`invoicePaidGrants`, :263-298). Drugi sloj idempotencije:
  `by_user_source` u `grantCredits` (credits.ts:184-192).
- **Nije vezan ni za Studio ni direktno za verifikaciju emaila** (indirektno: plan checkout traži
  verifikovan email, `app/api/stripe/plan/route.ts:63`). Za javni Studio treba NOVI signup bonus
  (F2.3) — postojeći se ne dira.

---

## (d) Auth i verifikacija emaila

- Convex Auth (`convex/auth.ts`): `Password` (+ Resend `verify`/`reset` sub-provajderi — NEMA magic
  link prijave), `ConvexCredentials` ("password-login"), Google OIDC (:92-122; `profile()` mapira
  `email_verified → emailVerified`, :118).
- Polja verifikacije na `users` (`schema.ts:153-159`): `emailVerificationTime` (Convex Auth / OAuth
  claim), `passwordEmailVerificationTime`, `appEmailVerificationTime` (upis:
  `emailVerificationInternal.ts:115-117`; javne akcije `emailVerification.ts:35` request i :106 verify).
- Predikat `emailVerifiedForCourses` postoji u TRI kopije istog oblika (`helpers.ts:340-342`,
  `profiles.ts:145-147`, `emailVerificationInternal.ts:29-31`): za Google-only korisnike **ignoriše**
  `emailVerificationTime` — Google-only nalog je „neverifikovan za kurseve" dok ne prođe app
  verifikaciju. Gejtuje: `requireCourseAccess` (helpers.ts:343), Stripe checkout rute
  (checkout :45 / credits :50 / plan :63), notifikacije, identityMerge preduslove.
- **Studio danas NIGDE ne proverava verifikaciju emaila** (osim lesson grane preko
  `requireCourseAccess` kada se prosledi `lessonId`).
- Usputni nalaz (van Studio obima): `requireCourseAccess` NE čita `enrollments`/`subscriptions` —
  svaki verifikovan korisnik ima pristup svakoj objavljenoj lekciji (poznato iz UX-BOOST U3).

### identityMerge (`convex/identityMerge.ts`, 1510 linija)
- Automatski spaja duplikate sa istim normalizovanim emailom: posle OAuth logina
  (`auth.ts:177-181`), pri postavljanju lozinke (:223-226), i admin mutacijom (:1501-1510).
- Merguje ~40 tabela (upisi, chat, community, enrollments, subscriptions…), ali **NE merguje:**
  `creditLots`, `creditBalances`, `creditTransactions`, `creditReversals`, `generationJobs`,
  `studioUsageDaily`, `studioProjects`, `studioUploads`, `studioUploadGrants`, niti
  `users.acceptedStudioTermsAt` (nijedno ime se ne pojavljuje u fajlu).
- Posledice (rizik R4): plaćeni krediti ostaju siročići na napuštenom husk redu (email→undefined,
  sesije obrisane :1425-1431); **dispute brava / negativan saldo / neporavnat dug OSTAJU na
  duplikatu** — korisnik merge-om beži od chargeback brave. Ovo je stvaran vektor „generacija bez
  plaćanja" i zatvara se u F2.

---

## (e) Javno pozivne Convex funkcije Studija i šta proveravaju

„Prva provera" = prvi gejt u handleru. ⚠ = nalaz.

### convex/studio.ts
| Funkcija | Tip | Prva provera | Napomena |
|---|---|---|---|
| `createJob` :365 | mutation | profil → kill switch → hasStudioAccess → uslovi → … | ceo redosled dole |
| `listMyJobs` :936 | query | requireUserId | samo svoji (by_user/by_user_project); bez gejta — OK (svoja galerija) |
| `listAllJobs` :1117 | query | requireStudioStaff | ⚠ `ownerEmail` ide i MODERATORU (:1175) — probija X4 dvoslojni dizajn |
| `listJobOwners` :1194 | query | requireStudioStaff | admin=email, moderator=handle (ispravno) |
| `revealJobDetail` :1232 | mutation | requireStudioAdmin | + audit log u istoj txn |
| `getJobForRegenerate` :1302 / `getJobForDetail` :1379 | query | requireUserId + vlasništvo | tuđi → null |
| `deleteJob` :1431 | mutation | requireUserId + vlasništvo | odbija in-flight i lesson-vezane; NE refundira |
| `createInputUploadUrl` :1478 | mutation | requireUserId | ⚠ bez gejta i bez limita na izdavanje grantova (R1) |
| `registerInputUpload` :1513 | mutation | requireUserId + svoj/neiskorišćen/neistekao grant | ⚠ bez gejta (R1) |
| `acceptStudioTerms` :1654 | mutation | getCurrentProfile | ⚠ bez gejta (mala površina; pečat se ne pomera) |
| `getStudioState` :1668 | query | getCurrentProfile | vraća providerStatus svakom prijavljenom |

### Redosled provera u createJob (:390-597)
profil (:394) → projectId vlasništvo (:398-403) → kill switch (:407-411, `STUDIO_PAUZIRAN`) →
enrollment + `hasStudioAccess` (:418-423, `NEMA_PRISTUPA`) → uslovi (:428-430,
`USLOVI_NEPRIHVACENI`) → lesson grana (:436-443) → parse params (:445) → katalog lookup (:451-454)
→ **build order** (:456-458; sub-provere 10a-10j uklj. moderaciju i cenu) → dispute (:466-470) →
minus saldo (:477-481) → neporavnat dug (:487-491) → concurrency (:493-501) → in-flight USD
(:508-512) → dnevni broj (:514-520) → dnevni USD (:523-525) → **INSERT job** (:533) → čišćenje
upload expiry (:567) → **applySpend** (:575) → usage upsert (:577-591) → scheduler (:593).

### Ostali moduli
| Modul | Funkcije | Gejt |
|---|---|---|
| `studioProjects.ts` | listMyProjects :11, createProject :63, renameProject :108, archiveProject :159 | requireUserId + vlasništvo; ⚠ bez Studio gejta (R1); ⚠ listMyProjects unbounded `.collect()` po projektu (:34-39) |
| `studioActions.ts` | `measureInputUpload` :320 (action) | interni getOwnedUpload → requireUserId + vlasništvo; 30/h |
| `studioAdmin.ts` | 4 query + setStudioEnabled | requireAdminRead / requireAdmin |
| `studioModels.ts` | listModels :111 (requireUserId — ⚠ vraća `priceRule` sa `baseUsd` = veleprodajna cena, svakom prijavljenom), listAllModels/setModelEnabled/setModelPrice (admin), seedStudioModels (syncSecret) | |
| `modelCatalog.ts` | listModels :26 **bez auth-a** (namerno, projektovano — bez endpoints/costUsd); ostalo admin | |
| `credits.ts` | getBalance/getLots/getTransactions (requireUserId, svoji); `applyStripeGrant` :500 i `applyStripeReversal` :549 — **PUBLIC mutacije iza requireSyncSecret** | ⚠ vidi „sporedni nalazi" |
| `creditPacks.ts` | listPacks :13 (bez auth-a, projektovano); ⚠ `getPackBySlug` :53 bez auth-a i BEZ projekcije (ceo red) | |
| `seed.ts` | sve syncSecret; ⚠ `grantDemoCredits` :913 namerno neidempotentan (kuje kredite po emailu) | |
| HTTP (`http.ts`) | `/fal/webhook` (Ed25519, 401 na loš potpis), `/byteplus/webhook` (nepotpisan ali telo daje samo task id + re-fetch; uvek 200) | Google nema rutu (poller) |

---

## Threat-model tabela: napad → postojeća odbrana → rupa → faza koja je zatvara

| # | Napad | Postojeća odbrana | Rupa | Faza |
|---|---|---|---|---|
| R1 | Prijavljen korisnik bez pristupa puni storage / pravi redove | STUDIO_STAFF_ONLY na createJob | Gejt važi SAMO na createJob; `createInputUploadUrl` (:1478) izdaje prave upload URL-ove bez ikakvog limita, `registerInputUpload`, `studioProjects.createProject` rade svakom prijavljenom | F1 + F2.8a |
| R2 | Neverifikovan (jednokratni) nalog koristi Studio | — | Studio ne proverava email nigde | F1 |
| R3 | Farma naloga za besplatne kredite | welcome bonus visi na PLAĆENOJ pretplati (bez rupe danas) | Novi javni bonus mora: tek posle verifikacije, tačno 1×/korisnik, anti-farm po istom verifikovanom emailu, logovan | F2.6 (korak 6) |
| R4 | Chargeback pa beg merge-om | SPOR_U_TOKU / SALDO_U_MINUSU / NEPORAVNAT_DUG po userId | identityMerge ne prenosi kredite/brave/jobove → brava i dug ostaju na napuštenom duplikatu; plaćeni krediti siročići | F2.10 |
| R5 | Rafal jobova (istovremeno / u minutu / u danu) | concurrency 3, 50/dan, $5/dan veleprodajno, $3 in-flight | Nema per-minute limita; nema kapa potrošnje KREDITA po danu; limiti nisu konfigurabilni bez deploya | F2.5 |
| R6 | Sondiranje blok liste / zabranjeni sadržaj bez traga | validatePrompt pre spend-a (ne troši) | Odbijanje = throw ⇒ rollback ⇒ nula loga; nema kategorija (nasilje, javne ličnosti ne postoje) | F2.7 |
| R7 | Ogroman broj u parametru bez min/max | klamp postoji kad su min/max definisani | `studioParamSpec.ts:158-166`: kontrola bez `max` prolazi bez klampa i bez ×10 provere (latentno — svi seed-ovi ih danas imaju); nema invarijante | F2.8c |
| R8 | Legacy model ispod $-kapova | estimatedCostUsd hrani $5/$3/$100 kapove | `buildLegacyOrder` ne množi trajanjem (`studio.ts:353`) → potcenjen trošak na legacy stazi | F2.8d |
| R9 | Refund uspešnog posla | status gejt kod SVIH pozivalaca failJob-a | `failJob` sam NEMA sopstveni status gejt — defense-in-depth fali | F2.8b |
| R10 | Javni korisnik plaća DEMO (mock) izlaz | providerStatus vidljiv u state-u | Bez provider ključa job ide u mock, a krediti se REALNO troše | F2.9 |

### Sporedni nalazi (dokumentovano; popravka po prilici)
1. `applyStripeGrant`/`applyStripeReversal` su PUBLIC mutacije čuvane samo `requireSyncSecret`
   (`helpers.ts:355-360`, obično `!==` poređenje). `WEBHOOK_SYNC_SECRET` je najvredniji secret
   sistema (kuje/povlači kredite za bilo kog userId) — preporuka za launch: rotacija + razmotriti
   prelazak na Convex httpAction sa potpisom. Ne diramo u ovom run-u (postojeći Stripe tok).
2. `listAllJobs` daje `ownerEmail` i moderatoru (:1175) — popravlja se u F2.8e (admin-only email).
3. `getPackBySlug` bez projekcije (ceo red, uklj. stripePriceId + neaktivni paketi) — F2.8f.
4. `listMyProjects` unbounded `.collect()` po projektu — dokumentovano, van obima (perf, ne security).
5. `identityMerge.requireExistingAdmin` čita `users.role` sirovo (bez `effectiveRoleForProfile`) —
   fails-closed, dokumentovano.
6. Moderator scope: `isStudioStaff` uključuje moderatora u pristup Studiju — zadržava se (X8 odluka).

---

## Šta se NE dira (postojeće odbrane koje ostaju)
Stripe subscription flow za kurseve i cene postojećih paketa; `hasStudioAccess` potpis i
`STUDIO_STAFF_ONLY` semantika kad je javni flag OFF; postojeći welcome bonus (150, pretplata);
kursni predikat `emailVerifiedForCourses`; fal/BytePlus/Google verifikacije; ledger invarijanta i
svi postojeći testovi (ništa se ne briše/ne skače).
