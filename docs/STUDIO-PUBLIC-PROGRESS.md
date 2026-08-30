# STUDIO PUBLIC — dnevnik rada

> Grana `feat/studio-public` (iz `feat/ux-boost` aa644a3). Format kao UX-BOOST-PROGRESS:
> po fazi — Fajlovi / Šta je urađeno / ODLUKE / Testovi / Rezultat verifikacije / BLOKADA / Za Jovana.

---

## F0 — Grana, audit, threat model   (30.08.2026)

### Fajlovi

Novo:
- `docs/STUDIO-PUBLIC-PLAN.md` — F0 audit: (a) gejt, (b) put pare, (c) validatePrompt/
  studioUsageDaily/welcome bonus, (d) auth + identityMerge, (e) popis javno pozivnih funkcija sa
  proverama; threat-model tabela R1–R10 (napad → odbrana → rupa → faza); sporedni nalazi.
- `docs/STUDIO-PUBLIC-PROGRESS.md` — ovaj dnevnik.

Kod: bez izmena (F0 je samo čitanje).

### Šta je urađeno

1. Napravljena grana `feat/studio-public` iz `feat/ux-boost` (aa644a3). VAŽNO: worktree
   `studio-public-billing-0b7a9b` je do sada stajao na merge-base commit-u (c804d73), 21 commit iza
   ux-boost-a — grana je zato pravljena direktno iz commit-a aa644a3 (ux-boost je checkout-ovan u
   glavnom stablu pa se ne može uzeti po imenu).
2. Audit celog Studio + credits + Stripe sistema (3 paralelna read-only pregleda: gejt/auth, put
   pare, frontend) — svi nalazi sa fajl:linija u `docs/STUDIO-PUBLIC-PLAN.md`. Ključno:
   - put pare je zdrav (cena isključivo server-side; refund bez ijedne javne staze; Stripe potpis +
     idempotencija + success_url ne dodeljuje ništa);
   - gejt `STUDIO_STAFF_ONLY` važi SAMO na `createJob` — upload/registracija/projekti rade svakom
     prijavljenom (R1);
   - Studio nigde ne proverava verifikaciju emaila (R2);
   - identityMerge NE prenosi kredite/brave/jobove — beg od chargeback brave merge-om (R4);
   - nema per-minute limita (R5); moderacija se ne loguje jer throw rollback-uje sve (R6);
   - DEMO jobovi TROŠE kredite pa bi javni korisnik bez provider ključa plaćao SVG mock (R10).
3. Baseline verifikacija na aa644a3 (pre ijedne izmene) — vidi Rezultat.

### ODLUKE

1. Sve odluke plana (flag u `platformFlags` + numeric `value`; `isEmailVerifiedForStudio` koji
   priznaje Google OAuth; staff limiti nepromenjeni; signup bonus 25 kr kroz `claimSignupBonus`;
   identityMerge proširenje; moderacija union-return + log; DEMO guard; rute /studio + /studio/app +
   /studio/krediti; checkout returnContext allowlist; auth/complete skip za /studio; landing manifest
   bez izmišljanja; bez novih npm paketa) — pobrojane u odobrenom planu, upisuju se u dnevnik faze
   u kojoj se implementiraju.
2. **Verifikaciono okruženje:** `npm run test` na ovoj mašini danas obara JEDAN vitest worker Node
   native assertion-om `X509_STORE_add_cert` (`node::crypto::NewRootCertStore`, Node v24.8.0) čim
   neki test pusti stvaran TLS pokušaj (npr. `studioActualCost.test.ts` :736 — `applyWebhookResult`
   zakazuje `persistOutput` koji fetch-uje `https://fal.example/...` bez stuba). To je stanje
   Windows system cert store-a, ne kod — do jutros je isti suite bio zelen (UX-BOOST U13).
   **Workaround za sve verifikacije u ovom run-u: `NODE_OPTIONS=--no-use-system-ca npm run test`**
   → 90/90 fajlova, 1198/1198. Bez flaga: 89/90, 1195/1198 + „Worker exited unexpectedly".
   Nije menjan ni repo ni mašina.

### Testovi

Bez novih (F0 je read-only). Baseline: 1198 testova u 90 fajlova.

### Rezultat verifikacije (baseline na aa644a3)

- `npm run typecheck` — exit 0.
- `NODE_OPTIONS=--no-use-system-ca npm run test` — **Test Files 90 passed (90), Tests 1198 passed (1198)**.
- `npm run lint` — `✖ 178 problems (1 error, 177 warnings)` — identično stanju iz UX-BOOST završnog
  izveštaja; jedina greška je poznata pre-postojeća `components/studio/studio-composer.tsx:1112`
  (`react-hooks/rules-of-hooks`), dokumentovana i namerno nedirnuta.

### BLOKADA

- Nema za F0.

### Za Jovana

1. **Mašina:** Node 24.8 + Windows system cert store trenutno ruši svaki proces koji krene u TLS sa
   system CA (assert u `NewRootCertStore`). Verovatno je neki program jutros ubacio pokvaren/duplid
   sertifikat u Windows store. Testovi u ovom run-u idu sa `--no-use-system-ca`; za trajno rešenje
   pregledaj `certmgr.msc` (skorije dodate sertifikate) ili apdejtuj Node. Ništa nisam menjao.
2. Threat model PRE stanja je u `docs/STUDIO-PUBLIC-PLAN.md` — tabela R1–R10 je spisak koji F1/F2
   zatvaraju; završni izveštaj će imati istu tabelu POSLE, sa testom za svaku stavku.

---

## F1 — Pristupni model + STUDIO_PUBLIC fleg   (30.08.2026)

### Fajlovi

Menjano:
- `convex/schema.ts` — `platformFlags` + `value: v.optional(v.number())` (numerički konfig u istoj
  tabeli kao flagovi; komentar uz tabelu).
- `convex/studioCore.ts` — nova javna jezgra: `STUDIO_PUBLIC_FLAG_KEY` ("studio_public", odsutan red
  = OFF — suprotno od kill switch-a, sa komentarom zašto), `STUDIO_PUBLIC_CONFIG_KEYS`,
  `PUBLIC_LIMIT_DEFAULTS` {2, 6, 200, 500}, `resolveStudioLimits(config, isStaff)` (osoblje UVEK
  zadržava današnje granice), `isEmailVerifiedForStudio(user)` (bilo koji od tri pečata — OAuth se
  računa), `decideStudioAccess(...)` → `{allowed} | {allowed:false, reason}` (fleg OFF grana
  delegira na netaknut `hasStudioAccess`).
- `convex/studio.ts` — `loadStudioPublicState(ctx)` (1 čitanje kad je OFF, 5 kad je ON),
  `evaluateStudioAccess` (prima već učitan profil), `requireStudioAccess(ctx)` (gejt-helper po uzoru
  na `requireUserId`, koristi se u F2 za write-path funkcije); `createJob` pristup prebačen sa
  `hasStudioAccess` na `decideStudioAccess` (isti slot, sada baca i `EMAIL_NIJE_POTVRDJEN`);
  `getStudioState` vraća nova polja: `accessReason`, `publicEnabled`, `emailVerified`.
- `convex/studioAdmin.ts` — `setStudioPublicFlag` + `setStudioPublicLimit` (internalMutations za
  `npx convex run`; allowlist ključeva kroz validator, `NEVALIDAN_LIMIT` za ne-ceo/ne-pozitivan
  broj; `enabled:false` = vrati na podrazumevano) + `getStudioPublicConfig` (admin query).
- `lib/studio-messages.ts` — `EMAIL_NIJE_POTVRDJEN` poruka (sr/en) u `CREATE_JOB_ERROR_MESSAGES`.
- Testovi: `convex/studioCore.test.ts` (+6), `convex/studio.test.ts` (+4 gejt scenarija, prošireno
  `seedUser` sa `emailVerified` opcijom, ažuriran `getStudioState` toEqual), `convex/studioAdmin.test.ts` (+3).

### Šta je urađeno

Fleg `studio_public` sa numeričkim limitima u `platformFlags`; kad je OFF (podrazumevano — odsutan
red), ponašanje je bajt-identično X8 stanju (svi postojeći testovi prolaze bez izmene osim toEqual
oblika `getStudioState`). Kad je ON: osoblje ulazi kao i do sad, a svaki prijavljen korisnik sa
POTVRĐENIM emailom dobija pristup bez ijednog upisa na kurs; nepotvrđen pada na `EMAIL_NIJE_POTVRDJEN`
(i UPISAN korisnik — brif traži potvrdu za sve). Redosled provera u `createJob` netaknut (kill switch
→ pristup → uslovi → …).

### ODLUKE

1. **`isEmailVerifiedForStudio` priznaje OAuth pečat** (`emailVerificationTime`), za razliku od
   kursnog `emailVerifiedForCourses` koji ga za Google-only naloge ignoriše. Razlog: brif-ov funnel
   „Probaj besplatno → Google prijava → nazad na Studio" ne sme da traži drugu potvrdu — Google je
   inbox već verifikovao (`email_verified` claim). Kursni predikat NIJE diran (čuva i postavljanje
   lozinke, gde je stroži app-pečat namerno).
2. **Osoblje nikad ne ide kroz javne limite** (`resolveStudioLimits` staff grana) — „fleg OFF ⇒ ništa
   se ne menja" važi trivijalno, a admin testiranje kataloga ne udara u kapove od 2/6/200/500.
3. **Seteri su `internalMutation`** — lansiranje proizvoda nema UI; `npx convex run
   studioAdmin:setStudioPublicFlag '{"enabled":true}' --prod` je runbook (u završnom izveštaju).
   `studio_public` NIJE dodat u `platformFlagKeys` u `seed.ts` — seed upisuje `enabled: true` i tiho
   bi otvorio Studio javnosti.
4. `isEmailVerifiedForStudio` prima `Record<string, unknown>` (ne `Doc<"users">`) jer
   `getCurrentProfile` vraća labavi `DocLike` — isti obrazac kao `role: unknown` u `hasStudioAccess`.

### Testovi

- `studioCore.test.ts`: decideStudioAccess matrica (OFF reprodukuje hasStudioAccess za sve
  kombinacije role×upis×email, i sa test-only `staffOnly=false`; ON pušta osoblje + potvrđene, traži
  email i od upisanih), isEmailVerifiedForStudio (sva tri pečata), resolveStudioLimits (staff
  invarijanta, defaults 2/6/200/500, override, nevalidan override pada na podrazumevano).
- `studio.test.ts`: verifikovan korisnik bez kursa otvara posao (naplata ista — „pristup nije
  popust"); neverifikovan (i upisan!) → EMAIL_NIJE_POTVRDJEN bez ijednog upisa u ledger;
  eksplicitno ugašen fleg → NEMA_PRISTUPA za studenta, moderator prolazi; kill switch i uslovi važe
  i u javnom režimu istim redosledom.
- `studioAdmin.test.ts`: odsutan red = OFF + pali/gasi; setStudioPublicLimit upis/odbijanje
  (0, 2.5, −3 → NEVALIDAN_LIMIT) + enabled:false vraća podrazumevano; getStudioPublicConfig
  admin-only.

### Rezultat verifikacije

- `npm run typecheck` exit 0; `npm run lint` `✖ 178 problems (1 error, 177 warnings)` — identično
  baseline-u (0 novih).
- Ciljano: studio + studioAdmin + studioCore + studio-messages + studio-playground = 140/140.
- Pun suite (`NODE_OPTIONS=--no-use-system-ca npm run test`): 1211 testova, 1210 zeleno + 1 pad
  `chat.test.ts > inbox summary stays exact beyond one thousand memberships` (timeout 5s pod
  opterećenjem — POZNATI flaky, dokumentovan još u X8; izolovano 18/18 ✅). `npx convex codegen`:
  vidi BLOKADA.

### BLOKADA

- **`npx convex codegen` ne prolazi sa worktree-a**: novi CLI tok (convex 1.42.1) radi remote
  push-analizu (`deploy2/start_push`) na dev deployment i pada na PRE-POSTOJEĆEM problemu —
  `chatMedia.ts` importuje `sharp`, a deployment (linux-arm64 runtime) ne može da učita sharp binar
  uprkos `externalPackages` u `convex.json`. Nevezano za ove izmene (chatMedia je star kod).
  Regeneracija ovde NIJE ni potrebna: nijedan novi convex modul se ne dodaje (api.d.ts je
  `import type * as X` po modulu — novi exporti u postojećim modulima prolaze kroz typeof),
  a `npm run typecheck` (zelen) je dokaz konzistentnosti. Plan ostaje: nula novih convex fajlova.

### Za Jovana

1. Uključivanje za launch: `npx convex run studioAdmin:setStudioPublicFlag '{"enabled":true}' --prod`;
   limiti opciono: `npx convex run studioAdmin:setStudioPublicLimit '{"key":"maxJobsPerMinute","value":10}' --prod`.
   Gašenje istom komandom sa `false` — momentalno vraća današnje stanje.
2. `getStudioState` sada nosi `accessReason` — F3 shell po njemu bira „potvrdi email" panel umesto
   generičke poruke o zatvorenom testiranju.

---

## F2 — Security / anti-abuse   (30.08.2026)

### Fajlovi

Menjano (6 commitova, `git log --oneline` za redosled):
- `convex/studio.ts` — rate limiti (rezolvovan concurrency + MINUTNI_LIMIT + DNEVNI_LIMIT_KREDITA,
  redosled: concurrency → in-flight → minutni → dnevni broj → dnevni krediti → dnevni USD);
  `claimSignupBonus`; moderacioni union-return + upis u `studioModerationLog`; DEMO guard (R10);
  gejt na `createInputUploadUrl`/`registerInputUpload`; `failJob` idempotencija (failed/refunded
  rani izlaz); legacy `estimatedCostUsd` kroz `computeEstimatedCostUsd`; `listAllJobs` mejl samo
  adminu (moderator dobija `ownerHandle`); `getStudioState.signupBonus.claimable`.
- `convex/studioCore.ts` — `computeEstimatedCostUsd` (R8).
- `convex/creditsCore.ts` — `SIGNUP_BONUS_CREDITS=25` + `signupBonusKey`; `BLOCKED_TERM_GROUPS` sa
  kategorijama (`nsfw`, `minors`, `deepfake`, `illegal`, + NOVO `violence`, `public_figure`);
  `validatePrompt` vraća kategoriju; celoreč pojmovi (završni razmak) za imena.
- `convex/credits.ts` — `"signup_bonus"` u source union (VAN `stripeGrantSource` i `PAID_SOURCES`);
  `applyGrant` plain ekstrakcija (grantCredits je thin wrapper); drugi sloj `by_user_source` i za
  signup_bonus.
- `convex/schema.ts` — `signup_bonus` literal; tabela `studioModerationLog` (bez teksta prompta).
- `convex/studioAdmin.ts` — `listModerationEvents` (admin, take 200).
- `convex/identityMerge.ts` — `mergeStudioAndCreditRows` (creditLots, creditTransactions,
  creditReversals, generationJobs, studioProjects, studioUploads, studioUsageDaily sabrano po danu,
  creditBalances sabrano — sme minus) + `acceptedStudioTermsAt` u oba user patch-a.
- `convex/studioProjects.ts` — `createProject` kroz `requireStudioAccess`.
- `components/app/studio-page.tsx` — `generate()` grana za `moderationBlocked` rezultat.
- `lib/studio-messages.ts` (+test) — MINUTNI_LIMIT, DNEVNI_LIMIT_KREDITA (PRE "DNEVNI_LIMIT" u nizu
  — substring matching), PREVISE_POSLOVA bez zakucane „tri".
- Testovi: studio.test.ts (+13 novih uklj. nula-upisa dokaze; `jobIdOf` narrowing na 32 mesta;
  `withFalKey` stub), credits.test.ts (200-op invarijanta +signup grana, seed 20260830; kategorije),
  studioAdmin.test.ts, studioProjects.test.ts (+kapija; seedUser → moderator po X8 obrascu),
  studioCatalogJob.test.ts (seedStranger → moderator), providers/catalogModels.test.ts (min/max
  invarijanta), identityMerge.test.ts (+2 end-to-end).

### Šta je urađeno (mapiranje na brif F2)

1. **Trošenje** — potvrđeno da je `applySpend` jedina staza (F0 audit) + zatvoreno R7 (min/max
   katalog invarijanta) i R8 (legacy estimatedCostUsd × trajanje — kapovi od 5$/3$/100$ više ne
   potcenjuju per-second modele).
2. **Refund** — potvrđeno da javne staze nema (F0); dodat `failJob` rani izlaz za failed/refunded
   (dupli poziv ne prolazi drugi put kroz refund granu).
3. **Welcome/signup bonus** — 25 kr kroz `claimSignupBonus`: flag ON + `isEmailVerifiedForStudio` +
   anti-farm (drugi ŽIV nalog sa istim emailom ⇒ `DUPLIRAN_EMAIL`); idempotentno (`signup:<userId>`
   + `by_user_source`); loguje se kroz creditTransactions (type bonus).
4. **Rate limiti** — 2 concurrent / 6/min / 200/dan / 500 kr/dan za javne (config u `platformFlags`),
   osoblje nepromenjeno; svi limiti bacaju PRE ijednog upisa.
5. **Moderacija** — kategorije + log u `studioModerationLog` (hash+dužina+kategorija, NIKAD tekst);
   odbijen prompt ne troši ništa; union-return čini da log preživi transakciju.
6. **Stripe** — potvrđeno F0 auditom (potpis :324, idempotencija testovi :394/:427, success_url ne
   dodeljuje ništa, syncSecret odbijanje credits.test.ts:568) — bez izmena koda.
7. **identityMerge (R4)** — krediti i BRAVE prate čoveka; end-to-end test: SPOR_U_TOKU grize na
   kanonskom nalogu posle merge-a; signup bonus ostaje jedan preko para.
8. **DEMO (R10)** — javni korisnik ne može da plati mock: model bez provider ključa mu je
   MODEL_NEDOSTUPAN; osoblje zadržava DEMO.

### ODLUKE

1. **Signup bonus = 25 kredita** (2-3 najjeftinije slike: BytePlus ~5 kr, Seedream ~8-9 kr; nijedan
   video ~55 kr) — dovoljno za ukus, premalo za farmu. Odvojen source od subscription `welcome_bonus`
   (150) — korisnik koji kasnije PLATI pretplatu dobija i njen bonus.
2. **Claim mutacija umesto hook-a u verifikaciji/uslovima**: pokriva password-verify, Google i
   pre-launch verifikovane; `acceptStudioTerms` rano izlazi za postojeće korisnike pa bi hook tamo
   staff i stare naloge zauvek preskočio; sve provere su ionako server-side.
3. **Union-return SAMO za ZABRANJEN_POJAM** — bačena greška rollback-uje i log; PRAZAN/PREDUGACAK
   ostaju throw (validacija forme, ne moderacioni događaj). Klijentska grana u istom commit-u;
   poruka korisniku identična staroj (ne otkriva pogođeni pojam).
4. **`failJob` blokira samo failed/refunded, NE done**: refund poravnatog posla kojem izlaz nikad
   nije stigao je namerna RUČNA support staza (X2 ugovor, `studioSettlement.test.ts` „refund
   poravnatog posla") — korisnik do nje ne može (internal + svi pozivaoci proveravaju `running`).
5. **`getPackBySlug` projekcija NIJE rađena** (plan F2.8f otpao): pozivaoci su server rute koje
   traže baš ta polja (`_id`, kind, isActive, stripePriceId, credits), a `stripePriceId` je već
   javan kroz `listPacks` — promena bi bila churn bez dobiti. Nalaz ostaje dokumentovan kao P4.
6. **Javne ličnosti: celoreč pojmovi za kolizijska imena** („trump " puna reč jer prefiks hvata
   „trumpet"; „trampa" = razmena ostaje nevina) + prefiks za srpske padeže („vucic" → „vucica").
   Lista je EDITORSKA — Jovan pregleda i dopunjava (launch checklist).
7. **`withFalKey` stub u testovima javnog toka**: F2.9 DEMO guard odbija javnom korisniku model bez
   ključa, a DEMO testovi istog fajla zahtevaju ODSUTAN ključ — zato stub po testu, ne beforeAll.
8. Merge napomene: `studioUploadGrants` se preskače (TTL 1h, cron ih briše); `balanceAfter` istorija
   posle spajanja je preplet dve hronologije (snapshot se ne prepravlja); istoimeni projekti smeju
   da koegzistiraju (jedinstvenost čuvaju samo create/rename).

### Testovi (brif F2.7 → dokaz)

- bonus dvaput → jedan lot: studio.test.ts „claimSignupBonus dvaput..." + identityMerge.test.ts
  „posle merge-a signup bonus ostaje JEDAN preko celog para".
- rate limit prekoračen → greška i NULA upisa: „MINUTNI_LIMIT: sedmi posao..." (snapshot ledger+jobs+
  usage pre/posle) i „DNEVNI_LIMIT_KREDITA: ... ne troši ništa".
- refund za uspešan job → odbijen: nema javne staze (F0) + „failJob je idempotentan: dupli poziv...".
- klampovanje parametara: postojeći studioParamSpec/studioJobCore testovi + NOVA katalog invarijanta
  „svaka number/slider kontrola ima min i max".
- moderacija ne troši kredite: „zabranjen prompt vraća moderationBlocked, upiše TAČNO jedan log red
  i ne troši ništa" + „kategorije moderacije: nasilje i javna ličnost...".
- ledger invarijanta posle novih staza: credits.test.ts:182 prošireno signup granom (novi seed
  20260830; assert ≤1 signup lot + brojači > 0 + invarijanta važi).

### Rezultat verifikacije

- `npm run typecheck` exit 0 · `npm run lint` `✖ 178 problems (1 error, 177 warnings)` — identično
  baseline-u · `NODE_OPTIONS=--no-use-system-ca npm run test` → **90/90 fajlova, 1228/1228** (30 novih
  testova od baseline-a). Codegen: ista BLOKADA kao F1 (nijedan nov convex modul — api.d.ts važi).

### BLOKADA

- Nema novih (codegen BLOKADA iz F1 i dalje važi).

### Za Jovana

1. Editorski pregled `violence`/`public_figure` listi u `convex/creditsCore.ts` (BLOCKED_TERM_GROUPS)
   — mehanizam radi, sadržaj je tvoja odluka.
2. `studioAdmin.listModerationEvents` postoji kao query (admin) — UI ekran nije pravljen (van obima);
   `npx convex run` ili kasniji admin prozor.
3. Merge sada prenosi i NEGATIVAN saldo — korisnik koji je begao od chargeback-a spajanjem naloga
   više nema kuda.

---

## F3+F4+F5 — Standalone shell, landing, kupovina, cross-sell   (30.08.2026)

### Fajlovi

Novo:
- `app/[locale]/(marketing)/studio/page.tsx` — javni landing (Persuade; brif-pinovan pravac u
  postojećem svetu — bez concept tournament-a; direction contract kao izvorni komentar na vrhu).
- `app/[locale]/studio/(shell)/{layout,template}.tsx` + `app/page.tsx` + `app/m/[jobId]/page.tsx` +
  `krediti/page.tsx` — samostalni shell rute (/studio/app, /studio/app/m/<id>, /studio/krediti).
- `components/studio/studio-shell.tsx` — tanki omotač (BrandMark→landing, F5 cross-sell red,
  ThemeToggle, locale link, AccountMenu/Prijava; `<main>` ponavlja AppShell padding kontrakt;
  SuspensionGate DA, ProfileSetupGate/ViewerPresence/Chat* NE).
- `components/studio/verify-email-panel.tsx` — StudioVerifyEmailPanel (floating slot) +
  ResendVerificationLink (inline za CheckoutAction).
- `lib/studio-landing.ts` (+test) — copy modul + STUDIO_EXAMPLES manifest (empty-safe galerija).
- `lib/credits-return.ts` (+test) — allowlist returnContext → putanja povratka.

Menjano:
- `components/app/studio-page.tsx` — opcioni props `basePath`/`creditsHref`/`signInHref` (default
  /app/studio bajt-identičan; L188 regex, L367/378/389 putanje, L537 sign-in); grana za
  `accessReason === "EMAIL_NIJE_POTVRDJEN"` → verify panel; auto-claim bonusa (useEffect + ref).
- `components/app/credits-page.tsx` — `variant="studio"`: nazad-link na /studio/app, sign-in sa
  ?next=, payload +returnContext:"studio", Premium plan panel sakriven, CheckoutAction
  `emailVerificationAction` slot (studio: inline resend umesto linka na školski profil).
- `app/api/stripe/credits/route.ts` + `lib/stripe.ts` (+test) — `returnPath` (server-side allowlist;
  default nepromenjen — školski pozivi bajt-identični, test za obe varijante).
- `app/[locale]/(marketing)/auth/complete/page.tsx` — preskače username onboarding za /studio ciljeve.
- `lib/studio-messages.ts` — STUDIO_SHELL + STUDIO_VERIFY_EMAIL poruke.
- `lib/convex-http.ts` — listPacks + listCatalogModels refs (SSR cene u crawlable HTML-u).
- `app/sitemap.ts` (+/sr/studio, /en/studio i bez Convex-a) + `app/robots.ts` (allow landing,
  disallow /studio/app i /studio/krediti).

### Šta je urađeno

Ceo standalone funnel: landing (hero sa autorskom SVG skicom mehanizma — ilustracija u brend
rukopisu, NE lažni AI izlaz; vrste kao STEPENASTI redovi a ne tri jednake kartice; paketi živi iz
listPacks; footer sa uslovima) → sign-in?next= → /studio/app (iste komponente, tanki shell) →
verify-email panel po `accessReason` → StudioTermsGate (postojeći) → auto-claim 25 kr →
/studio/krediti kupovina koja se VRAĆA u Studio. Školski /app/studio netaknut (default props).

### ODLUKE

1. **Brif-pinovan pravac za landing** (impeccable new-work §3: „user- or brief-pinned direction
   beats the roll") — svet je zakovan brifom (papir/mastilo/žuta + AGENTS konvencije), sadržaj
   sekcija brifom, pa concept tournament NIJE rađen; direction contract stoji kao IZVORNI komentar
   (ne emitovan HTML — AGENTS surgical pravilo).
2. **Rute**: landing u (marketing) grupi (nasleđuje SiteRouteMotion); shell u `studio/(shell)` sa
   SOPSTVENIM template-om (AppRouteMotion) — bez marketing motion-a preko StudioPage AnimatePresence
   koreografije. Slugovi: /studio/app (simetrija sa /app), /studio/krediti (srpski, kao
   /uslovi-studio).
3. **Hero BEZ forsiranog 100dvh** (za razliku od home-a): CTA mora u prvi viewport i na 1366×744 —
   viša kolona ga je gurala ispod page-motion 92% praga u deferred scroll-reveal (nađeno u
   verifikaciji). Naslov 4xl/5xl/6xl, uže margine.
4. **Galerija primera = prazan manifest + BLOKADA** — ništa se ne izmišlja; sekcija se ne renderuje
   dok Jovan ne ubaci prave generacije u `public/studio-examples/` + redove u `lib/studio-landing.ts`.
5. **Kupovina zadržava kursni email predikat** (`emailVerifiedForCourses` u /api/stripe/credits) —
   ZABRANA „ne slabij postojeću proveru" je jača od simetrije sa Studio predikatom. Posledica:
   Google-only kupac mora JEDNOM da klikne app-verifikaciju pre prve kupovine — standalone kontekst
   za to dobija inline resend link umesto skoka u školski profil. Bonus od 25 kr stiže i bez toga.
6. **Landing cene**: server-side fetch (getConvexHttpClient) da cene budu u SSR HTML-u za Google;
   „od N kr" hintovi koriste javni legacy `modelCatalog:listModels` (ista referenca kao
   /app/credits) — v4 `studioModels.listModels` se NE otvara javno (nosi veleprodajni `baseUsd`).
7. **Auto-claim bonusa živi u StudioPage** (ne u shell-u) — radi u OBA omotača istom logikom;
   mutacija je idempotentna pa je ref-guard samo ušteda poziva.
8. `hidden` na LinkButton-u ne radi (computed display:flex) — **PRE-POSTOJEĆI site-wide bag** (i
   home „Prijava" je vidljiva na 375). Landing header koristi span wrapper kao zaštitu; bag
   prijavljen kao zaseban task (chip), NIJE diran ovde (van obima, isti tip greške kao istorijski
   radius bag iz AGENTS.md).

### Testovi

- `lib/studio-landing.test.ts` (manifest validacija + sr/en kompletnost), `lib/credits-return.test.ts`
  (allowlist: "studio"→/studio/krediti; undefined/garbage/URL→/app/credits),
  `lib/stripe.test.ts` +1 (returnPath varijanta; default bajt-identičan; metadata nezavisna).
- Pun suite: **92 fajla, 1232/1232**; typecheck 0; lint 178 (baseline); `npm run build` ✅
  (+4 rute: /studio, /studio/app, /studio/app/m/[jobId], /studio/krediti).

### Rezultat verifikacije (uživo)

Dev server WORKTREE-a na :3001 (`.claude/launch.json` → scratchpad `dev.cjs` sa
`NODE_OPTIONS=--no-use-system-ca` zbog F0 mašinskog TLS baga; glavni checkout drži :3000).
Pregledano u in-app pane-u + Jovanovom ulogovanom Chrome-u:
- `/sr/studio`: obe teme, desktop 1440×900 + mobilni 375 — hero sa CTA u prvom viewportu,
  skica mehanizma, stepenaste vrste, paketi (prazno stanje — dev baza NEMA paketa: provereno
  direktnim query-jem `creditPacks:listPacks` → 0 redova; prod ima), footer. `/en/studio` SSR
  stringovi u HTML-u (SEO ✓).
- `/sr/studio/app` (ulogovan admin): tanki shell BEZ sidebara/dock-a, cross-sell red, prave
  generacije u mreži, intro CTA → `/sr/studio/krediti` (DOM proveren), naslov
  „Radni prostor · Studio".
- `/sr/studio/krediti`: „Nazad u Studio", live balans 4.832, istorija, BEZ Premium panela.
- Konzola: SAMO poznati `bis_skin_checked` extension šum (SP2 presedan) — nula novih grešaka.
- Impeccable: context.mjs + new-work + craft-floor praćeni; `detect.mjs` nad nova 3 UI fajla → `[]`;
  degraded finish review (svež subagent — isporučeni agent nije registrovan u harness-u,
  supstitucija po SUBAGENT_AUTHORIZATION) — nalazi u F6 sekciji.

### BLOKADA

- **Galerija primera prazna** dok Jovan ne ubaci prave generacije (ODLUKA 4).
- **Convex funkcije worktree-a se NE MOGU push-ovati na dev deployment** (isti sharp/linux-arm64
  problem kao codegen) — javni tok sa flegom ON nije mogao da se vežba UŽIVO; pokriven je sa 30+
  convex-test testova, a UI grane (verify panel, claimable) rade protiv `state?.` opcionih polja pa
  stari deployment ne lomi ništa.
- Dev baza nema creditPacks redove — paketi na landingu/krediti stranici prikazuju prazno stanje
  (istinito; prod ima podatke).

### Za Jovana

1. Primeri za landing: ubaci fajlove u `public/studio-examples/` + redove u `lib/studio-landing.ts`
   (format u komentaru manifesta) — sekcija se sama pojavi.
2. Chip „Popravi hidden vs display na dugme-anchorima" — pre-postojeći bag koji lomi i home mobilni
   header za neprijavljene; jedan klik za zaseban run.
3. `.claude/launch.json` u worktree-u pokazuje na scratchpad dev skript — obriši posle merge-a ako
   smeta (nije commitovan… proveri `git status`).
