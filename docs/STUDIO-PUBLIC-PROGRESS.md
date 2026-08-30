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
