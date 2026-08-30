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
