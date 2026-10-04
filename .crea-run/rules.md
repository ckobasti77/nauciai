# Pravila noćnog runa CREA — važe za svaki korak

Radiš nenadzirano dok Jovan spava. Niko ne može da ti odgovori na pitanje.
Kad naiđeš na nejasnoću: izaberi najkonzervativniju opciju, NAPIŠI je u
`docs/CREA-PROGRESS.md` pod „ODLUKE" i nastavi. Ne improvizuj tiho.

## Kontekst
- Nauči AI je srpska platforma za učenje AI veština; publika su POČETNICI koji slabo
  poznaju računare. Studio se od sada zove **Crea** (lat. „stvaraj"). Cilj: sve što
  Higgsfield ima za sliku, video i zvuk — bolje, na srpskom, jeftinije, animiranije,
  gejmifikovano. Sve što može bez plaćenog AI-a radi bez njega (u browseru, 0 kredita).
- Izvor istine: `docs/CREA-PLAN.md` (brend, rute, odluke O1–O8, arhitektura, paketi,
  zabranjene licence, feature tabele S/V/A/U/G/C, koraci K01–K30).
- Tehnički dizajn: `docs/crea/planovi/K01.md` (i ostali planovi u istom folderu kad postoje).

## Obavezno pročitaj pre pisanja koda
1. `AGENTS.md` — 4 radius tiera, „jedan okvir po grupi", „Simplicity First", „Surgical Changes".
2. `convex/_generated/ai/guidelines.md` — pre bilo kog Convex koda.
3. `docs/CREA-PLAN.md` i plan(ove) iz `docs/crea/planovi/` koje tvoj korak pominje.
4. `docs/CREA-PROGRESS.md` — šta su prethodni koraci uradili i koje su ODLUKE donete.
5. Za Next.js kod: `node_modules/next/dist/docs/` — ovaj Next (16) ima breaking changes.

## Dizajn i skillovi (projekat ih ima u `.claude/skills/`)
- Svaki korak koji menja izgled ili ponašanje UI-ja PRE koda čita:
  `.claude/skills/impeccable/SKILL.md`, `.claude/skills/design-taste-frontend/SKILL.md`,
  `.claude/skills/design-dna/SKILL.md` (uz `docs/studio-redesign/design-dna-platform.json`).
- Animacije i prelazi: `.claude/skills/motion-design/SKILL.md` (+ `gsap-*` ako koristiš GSAP).
- `.claude/skills/ui-ux-pro-max/SKILL.md` koristi ciljano (obrasci, tipografija, pristupačnost).
- 3D: `.claude/skills/threejs-*`. Convex: `.claude/skills/convex*`.
- Ako se savet skilla sudari sa brendom (papir/mastilo/žuta, sveska, tvrde senke) ili sa
  AGENTS.md — **brend i AGENTS.md uvek pobeđuju**. Ne kopiramo Higgsfield izgled
  (tamno/neon), kopiramo funkcije i činimo ih boljim.
- Logo je gotov: `components/crea/crea-logo.tsx` i `public/brand/crea/*`. Ne crtaj novi.

## Apsolutne zabrane
- NE radi `git push`, `git commit`, `git reset --hard`, `git clean`, `git checkout -- .`,
  `git stash` — runner sam pravi commit posle koraka.
- NE radi `npx convex deploy`, ništa sa `--prod`, `npx convex env ...`, `vercel`, `stripe`.
  Dozvoljeno: `npx convex codegen`, `npx convex dev --once` (samo DEV, a ako traži
  interakciju ili padne zbog postojećih podataka — NE briši podatke, upiši BLOKADA/ODLUKA).
- NE postavljaj env varijable, NE upisuj tajne ni ključeve u kod.
- NE menjaj žive cene (sve nove cene iza flega `crea_pricing_v2`, O1). Izuzetak: C0
  ispravke gubitka — uz ODLUKU sa izvorom (link ka strani provajdera).
- NE preimenuj Convex tabele, Convex funkcije ni interne foldere `studio` (§2 plana).
- NE lomi postojeće rute: svaka promena javnog URL-a ima 308 sa starog.
- NE uvodi pakete van liste u §5 plana. Ako baš mora — ODLUKA sa licencom.
  NIKAD pakete iz §6 (AGPL/GPL u browseru/nekomercijalne težine/plaćene).
- Teške biblioteke SAMO kroz `dynamic import` na `/crea` rutama — ništa u zajednički bundle.
- NE „popravljaj" susedni kod koji nema veze sa zadatkom. Ne briši tuđi mrtav kod.
- NE komentariši test i NE briši assertion da bi suite prošao.
- NE ostavljaj pokrenut `npm run dev` / `next dev` / `convex dev` na kraju koraka.

## Konvencije repoa
- Radius: samo `surface-card` 16 / `surface-inset` 12 / `surface-media` 8 / `rounded-full`.
  Nikad `rounded-*!` ni inline `borderRadius`. Pun `border-2 border-ink` samo na
  najspoljašnjem elementu grupe (`npm run check:frames`).
- Boje samo kroz tokene (`--color-ink`, `--color-paper`, `--color-yellow`, `--color-muted`,
  `--color-line`, `--color-surface-a/b`…). Nikad goli hex u className.
- Svaki UI string kroz `lib/i18n` (sr primaran, en sekundaran). Rute kroz `withLocale()`.
- Obe teme (svetla i tamna) i telefon (390 px) moraju da rade. Mobilni bottom nav ostaje
  tačno 4 slota. Klik mete ≥ 44 px na dodir. `focus-visible` vidljiv. Kontrast ≥ 4.5:1.
- `prefers-reduced-motion` za svaku animaciju (`lib/motion-contract.ts`).
- Čista logika u `lib/<ime>.ts` ili `convex/<ime>Core.ts` sa vitest testovima, po uzoru na
  postojeće parove `fajl.ts` + `fajl.test.ts`. Convex: `mutation`/`query`/`action` iz
  `./_generated/server`, helperi iz `convex/helpers.ts`, indeksi imenovani po poljima.
- Novi kod: `lib/crea-*.ts`, `components/crea/*`, `convex/crea*.ts`.
- Kad model nema API ključ u dev okruženju, ponašanje je kao danas (mock/DEMO za osoblje,
  nedostupno za javne korisnike) — ne izmišljaj novi mehanizam.

## Vizuelna provera (kad korak menja UI)
- Ako imaš Playwright MCP: `npm run dev` u pozadini, pa proveri izmenjene ekrane na
  390 × 844 i 1440 × 900, u OBE teme; napravi par snimaka u `docs/crea/snimci/<ID>-*.png`.
  Na kraju UGASI dev server (i ne ostavljaj druge procese).
- Ako Playwright nije dostupan — upiši to u progress i oslanjaj se na testove.

## Definicija završenog koraka
Korak nije gotov dok ne prođe:
    npx convex codegen        (ako si dirao convex/)
    npm run typecheck
    npm run lint
    npm run test
Runner posle tebe ponovo pušta ove provere i `npm run build`; ako padnu, vratiće ti grešku.
Postojeći test koji je padao i PRE tvog koraka (vidi `.crea-run/baseline.txt` ako postoji)
nije tvoja odgovornost — ali ga ne kvari dodatno.
Ako nešto realno ne može (nema ključa, ograničenje platforme), napravi ostatak i upiši
`BLOKADA:` sa tačnim razlogom. Blokada je ispravan ishod — hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/CREA-PROGRESS.md`
```
## <ID> — <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je urađeno:** 3–8 rečenica
**Feature ID-jevi:** koji su gotovi, koji delimično, koji nisu (i zašto)
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Novi paketi:** ime@verzija — licenca (ili „nema")
**Testovi:** koje si napisao/menjao i šta pokrivaju
**Rezultat provere:** codegen / typecheck / lint / test — prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom
**Za Jovana ujutru:** šta da proveri ručno (ekrani, flegovi, ključevi)
```
Dopisuješ na kraj. Ne briši tuđe sekcije.
