# STUDIO PUBLIC — završni izveštaj

> Grana `feat/studio-public` (iz `feat/ux-boost` aa644a3) · 30.08.2026 · autonoman run
> Detalji po koracima: `docs/STUDIO-PUBLIC-PROGRESS.md` (F0–F5) · Audit PRE stanja: `docs/STUDIO-PUBLIC-PLAN.md`

**Finalno stanje:**
- `npm run typecheck` — ✅ exit 0
- `npm run lint` — ✅ `178 problems (1 error, 177 warnings)` — IDENTIČNO baseline-u (jedina greška je
  poznata pre-postojeća `studio-composer.tsx:1112`, dokumentovana još u UX-BOOST)
- `npm run test` — ✅ **92 fajla, 1232/1232** (baseline 1198 → +34 nova testa)
- `npm run build` — ✅ Compiled successfully; +4 rute: `/[locale]/studio`, `/studio/app`,
  `/studio/app/m/[jobId]`, `/studio/krediti`
- `npx convex codegen` — ⚠ vidi „Poznata ograničenja" (pre-postojeći sharp/linux-arm64 problem;
  regeneracija nije ni potrebna — nula novih convex modula, typecheck je dokaz konzistentnosti)
- Uživo verifikovano na dev serveru worktree-a (:3001) u in-app pregledaču + tvom ulogovanom
  Chrome-u: landing (obe teme, 1440 + 375, sr + en), `/studio/app` shell, `/studio/krediti`;
  impeccable detektor `[]` + finish review (2 nalaza → oba popravljena i izmerena)

---

## 1. Šta je urađeno (po fazama)

**F0 — Audit.** Kompletna mapa gejta, puta pare, moderacije, auth-a i javne površine sa fajl:linija
(`docs/STUDIO-PUBLIC-PLAN.md`) + threat-model tabela R1–R10. Ključno: put pare je već bio zdrav
(cena isključivo server-side, refund bez javne staze, Stripe potpis + idempotencija), a rupe su bile
oko PRISTUPA, limita, moderacionog traga i identity merge-a.

**F1 — Pristupni model.** `STUDIO_PUBLIC` fleg u `platformFlags` (odsutan red = OFF; seed ga NIKAD
ne upisuje) + numerički limiti u istoj tabeli. `decideStudioAccess` (studioCore) je jedina tačka
odluke: fleg OFF ⇒ bajt-identično današnjem (osoblje; formula upisa spava pod `STUDIO_STAFF_ONLY`),
fleg ON ⇒ osoblje + svaki prijavljen korisnik sa POTVRĐENIM emailom (`isEmailVerifiedForStudio` —
priznaje i Google OAuth pečat). `requireStudioAccess` helper gejtuje i write-path pomoćne mutacije.
`getStudioState` nosi `accessReason`/`publicEnabled`/`emailVerified`/rezolvovan `maxActiveJobs`/
`signupBonus.claimable`.

**F2 — Security/anti-abuse.** Rate limiti za javne korisnike (2 istovremeno / 6 u minutu / 200
dnevno / 500 kr potrošnje dnevno — config override u `platformFlags`; osoblje nepromenjeno; svaki
limit baca PRE ijednog upisa). Signup bonus 25 kr kroz `claimSignupBonus` (posle potvrde emaila,
1×/korisnik kroz dva sloja idempotencije, anti-farm po istom emailu, logovan u creditTransactions).
Moderacija v2: kategorije (nsfw, minors, deepfake, illegal + NOVO violence, public_figure) + tabela
`studioModerationLog` (hash+dužina+kategorija, NIKAD tekst prompta) — odbijanje se COMMIT-uje kao
vrednost umesto throw-a da log preživi transakciju, i dalje ne troši ništa. Hardening: gejt na
upload/registraciju/projekte (R1), `failJob` idempotencija (R9), legacy `estimatedCostUsd` ×
trajanje (R8), min/max katalog invarijanta (R7), moderator više ne vidi mejlove u `listAllJobs`,
DEMO guard — javni korisnik ne može da PLATI mock bez provider ključa (R10). `identityMerge` sada
prenosi kredite, transakcije, reversale (BRAVE!), jobove, projekte, upload-e, dnevnu potrošnju i
pečat uslova — beg od chargeback brave spajanjem naloga je zatvoren (R4), a plaćeni krediti više ne
ostaju siročići.

**F3 — Standalone shell + landing.** Javni landing `/[locale]/studio` (hero sa autorskom SVG skicom
mehanizma u brend rukopisu — bez lažnih galerija; vrste kao stepenasti redovi; paketi živi iz baze;
footer sa uslovima; SEO metadata + sitemap + robots). Tanki shell `/studio/app` (+ `/m/[jobId]`):
ISTE komponente (`StudioPage` sa 3 nova OPCIONA propa — školski `/app/studio` bajt-identičan), bez
sidebara/dock-a/školskih kapija (SuspensionGate ostaje). Verify-email panel sa resend dugmetom po
`accessReason`; postojeći StudioTermsGate radi nepromenjen; auto-claim bonusa. `auth/complete` više
ne tera Studio korisnike u školski username onboarding.

**F4 — Kupovina.** `/studio/krediti` = ista `CreditsPage` u studio varijanti (nazad-link, sign-in sa
?next=, bez Premium panela, inline resend za verifikaciju). Checkout kroz POSTOJEĆI
`/api/stripe/credits`; klijent šalje samo `returnContext:"studio"` koji server mapira kroz allowlistu
(`lib/credits-return.ts`) u success/cancel povratak NA Studio — klijentov string nikad ne postaje
URL. Balans live preko Convex pretplate (webhook upiše lot → broj skoči sam).

**F5 — Cross-sell.** Jedan tih red („Nauči kako ovo da radiš → kursevi") u shell topbaru + na dnu
landinga. Ništa više.

## 2. Threat model POSLE (R → zatvoreno čime → dokaz/test)

| # | Napad | Zatvoreno čime | Test |
|---|---|---|---|
| R1 | Prijavljen korisnik bez pristupa puni storage/redove | `requireStudioAccess` na `createInputUploadUrl`, `registerInputUpload`, `createProject` | studio.test.ts „createInputUploadUrl i registerInputUpload traže pristup (R1)"; studioProjects.test.ts „kapija" |
| R2 | Neverifikovan nalog u Studiju | `decideStudioAccess` traži potvrđen email kad je fleg ON (i od upisanih) | studio.test.ts „NEverifikovan korisnik pada na EMAIL_NIJE_POTVRDJEN bez ijednog upisa" + studioCore matrica |
| R3 | Farma naloga za bonus | 25 kr tek POSLE verifikacije; ključ `signup:<userId>` + `by_user_source`; anti-farm po istom emailu; log u creditTransactions | „claimSignupBonus dvaput → jedan lot"; „odbija neverifikovan/ugašen fleg/dupliran email — nula lotova"; 200-op invarijanta (≤1 signup lot) |
| R4 | Beg od chargeback brave merge-om | `mergeStudioAndCreditRows` — reversali/minus/dug prate čoveka | identityMerge.test.ts „SPOR_U_TOKU grize i posle spajanja" (end-to-end) + „bonus JEDAN preko para" |
| R5 | Rafal jobova | MINUTNI_LIMIT (6/min), DNEVNI_LIMIT_KREDITA (500), concurrency 2, dnevni 200 — config u platformFlags | „MINUTNI_LIMIT: sedmi posao pada bez ijednog upisa"; „DNEVNI_LIMIT_KREDITA ne troši ništa"; „concurrency 2"; „config override maxJobsPerDay=1" |
| R6 | Sondiranje blok liste bez traga | union-return + `studioModerationLog` (bez teksta); kategorije +violence +public_figure | „zabranjen prompt vraća moderationBlocked, upiše TAČNO jedan log red i ne troši ništa"; „kategorije: nasilje i javna ličnost" |
| R7 | Broj bez min/max granica | katalog invarijanta test (svaka number/slider kontrola ima min i max, min≤default≤max) | catalogModels.test.ts „katalog invarijanta: …min i max" |
| R8 | Legacy model ispod $-kapova | `computeEstimatedCostUsd` množi trajanjem | postojeći legacy testovi + typecheck (jedina staza) |
| R9 | Dupli failJob kroz refund granu | rani izlaz za failed/refunded (done NAMERNO ostaje — X2 support staza) | „failJob je idempotentan: dupli poziv ne refundira dvaput"; studioSettlement „refund poravnatog posla" i dalje zelen |
| R10 | Javni korisnik plaća DEMO mock | fleg ON + ne-osoblje + bez provider ključa ⇒ MODEL_NEDOSTUPAN | „DEMO guard (R10): javni korisnik ne može da plati mock, osoblje može" |

Brif F2 mapiranje: potpis webhook-a + idempotencija grantova + „success_url ne dodeljuje ništa" —
POTVRĐENO auditom i pokriveno POSTOJEĆIM testovima (credits.test.ts :394/:427/:568; webhook
route.test.ts); ledger invarijanta proširena novim operacijama (seed 20260830) i važi.

## 3. Šta TI ručno radiš za launch (runbook)

1. **Provider ključevi PRE flega** (inače su fal/BytePlus modeli javnima nedostupni po R10 guardu —
   što je ispravno, ali sužava ponudu na Google): `npx convex env set FAL_KEY … --prod` (i
   `BYTEPLUS_API_KEY`/`BYTEPLUS_BASE_URL` ako želiš i te modele).
2. **Uključi Studio javnosti**: `npx convex run studioAdmin:setStudioPublicFlag '{"enabled":true}' --prod`.
   Gašenje = ista komanda sa `false` (momentalno vraća današnje stanje). Limiti opciono:
   `npx convex run studioAdmin:setStudioPublicLimit '{"key":"maxJobsPerMinute","value":10}' --prod`
   (ključevi: maxConcurrentJobs / maxJobsPerMinute / maxJobsPerDay / maxDailyCredits;
   `{"…","enabled":false}` vraća podrazumevano). Uvid: `studioAdmin:getStudioPublicConfig`.
3. **Stripe live provera**: paketi u produkciji imaju `stripePriceId` (dev baza NEMA paketa —
   landing/krediti tamo pokazuju prazno stanje); webhook events aktivni kao do sada; probna kupovina
   iz `/sr/studio/krediti` mora da se VRATI na tu stranicu.
4. **Primeri za landing galeriju**: prave generacije u `public/studio-examples/` + redovi u
   `lib/studio-landing.ts` (format u komentaru) — sekcija se sama pojavi.
5. **Editorski pregled blok liste**: `violence` i `public_figure` grupe u `convex/creditsCore.ts`
   (`BLOCKED_TERM_GROUPS`) — mehanizam radi (padeži prefiksom, kolizijska imena celom rečju), sadržaj
   je tvoja odluka. Odbijanja gledaš kroz `studioAdmin:listModerationEvents`.
6. **Opciono**: subdomen `studio.nauciai.com` kasnije kao rewrite (STUDIO-PLAN 0.1); rotacija
   `WEBHOOK_SYNC_SECRET` (najvredniji secret — kuje kredite; nalaz iz F0, nije diran).

## 4. Preostali rizici / poznata ograničenja

- **Codegen/`convex dev` push sa OVE mašine trenutno ne radi** (pre-postojeće): novi CLI tok radi
  remote analizu i pada jer deployment (linux-arm64) ne može da učita `sharp` iz `chatMedia.ts`
  uprkos `externalPackages` — zbog toga javni tok sa flegom ON NIJE vežban uživo (pokriven sa 30+
  convex-test testova). Pre deploy-a proveri da tvoj uobičajeni deploy put radi kao do sada.
- **Mašina (30.08.)**: Node 24.8 + pokvaren sertifikat u Windows system store-u ruši SVAKI proces na
  prvom TLS pozivu (`NewRootCertStore` assert). Sve u ovom run-u išlo je sa
  `NODE_OPTIONS=--no-use-system-ca`. Pogledaj `certmgr.msc` (skorije dodati sertifikati) ili
  apdejtuj Node — inače će i `npm run test` i dev server nasumično padati.
- **Pre-postojeći `hidden` vs display bag na dugme-anchorima** (i home „Prijava" na 375!) — landing
  ima span-wrapper zaštitu; koren čeka zaseban task (chip „Popravi hidden vs display…").
- **Google-only kupac** mora jednom da klikne app-verifikaciju pre PRVE kupovine (postojeća provera
  u `/api/stripe/credits` — namerno NIJE slabljena); u Studio ulazi i bonus dobija bez toga, a
  standalone kontekst nudi inline resend.
- **Deploy-skew za moderaciju**: stari klijent bi `moderationBlocked` objekat tretirao kao jobId —
  važi samo za BLOKIRANE promptove u minutima između deploy-a backenda i frontenda (idu zajedno).
- **Merge trka**: claim koji se trka sa merge-om teorijski ostavlja jedan višak bonus lot po paru
  (25 kr, nedostižno kroz UI); nalozi sa >1000 redova u nekoj tabeli padaju na postojeću
  „resumable batch merge" grešku.
- **Landing „od N kr" hintovi** čitaju javni legacy `modelCatalog` (ista referenca kao /app/credits)
  — ako je legacy tabela prazna u produkciji, hintovi se ne prikazuju (paketi rade nezavisno);
  dugoročno: javna projektovana v4 query (`listPublicModels` — specificirana, nije građena).
- PRODUCT.md (impeccable persistence) ne postoji u repou — preskočeno kao van obima; `/impeccable
  init` je prirodan follow-up ako želiš trajni dizajn-kontekst.
