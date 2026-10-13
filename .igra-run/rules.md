# Pravila noćnog runa IGRA — važe za svaki korak

Radiš nenadzirano dok Jovan spava i niko ne može da ti odgovori na pitanje. Kad
naiđeš na nejasnoću:
1. Izaberi najkonzervativniju opciju.
2. **Napiši je** u `docs/IGRA-PROGRESS.md` pod „ODLUKE".
3. Nastavi.

Ne improvizuj tiho.

## Kontekst
Nauči AI je srpska platforma za učenje AI veština. Publika su **početnici** koji slabo
poznaju računare. Ovaj run daje celom delu aplikacije **posle prijave** gejmifikovan izgled:
- premium, čist i „brutalan", ali i dalje **sveska** (papir, mastilo, žuti marker);
- likovi, ilustracije, pokret (GSAP), 3D (Three.js), nivo, XP, niz, bedževi i rang liste.

**Nije igrica** i nema nove ekonomije.

Izvori istine:
- `docs/IGRA-PLAN.md`: odluke O1–O9, vizuelni jezik, likovi, napredak, površine, slike, granice, koraci.
- `docs/igra/planovi/*.md`: tehnički planovi (K01 je temelj za sve).
- `docs/igra/SLIKE.md` + `public/brand/igra/manifest.json`: spisak slika i njihov status.

## Obavezno pročitaj pre pisanja koda
1. `AGENTS.md`: 4 radius tiera, „jedan okvir po grupi", „Simplicity First", „Surgical Changes".
2. `convex/_generated/ai/guidelines.md`, pre bilo kog Convex koda.
3. `docs/IGRA-PLAN.md` i plan(ovi) iz `docs/igra/planovi/` koje tvoj korak pominje.
4. `docs/IGRA-PROGRESS.md`: šta su prethodni koraci uradili i koje su ODLUKE donete.
5. Za Next.js kod: `node_modules/next/dist/docs/`. Ovaj Next (16) ima breaking changes.

## Skillovi (u `.claude/skills/`)
- **Pre svakog UI koda pročitaj:**
  - `impeccable/SKILL.md`
  - `design-taste-frontend/SKILL.md`
  - `design-dna/SKILL.md` (uz `docs/studio-redesign/design-dna-platform.json`)
- **GSAP:** `gsap-core`, `gsap-react`, `gsap-timeline`, `gsap-plugins`, `gsap-performance`, `gsap-scrolltrigger` (samo ako baš treba).
- **3D:** `threejs-fundamentals`, `threejs-materials`, `threejs-lighting`, `threejs-animation`, `threejs-loaders`, `threejs-postprocessing`.
- **Animacije i prelazi:** `motion-design/SKILL.md`. Obrasci, tipografija i pristupačnost: `ui-ux-pro-max/SKILL.md`.
- **Convex:** `convex*` (posebno `convex-performance-audit` i `convex-test`).
- Kad se savet skilla sudari sa brendom (papir, mastilo, žuta, sveska, tvrde senke) ili sa
  AGENTS.md, **brend i AGENTS.md uvek pobeđuju**. Ne pravimo tamni neon ni „generički SaaS dashboard".

## Radnici (subagenti)
Glavne odluke i ključni kod radiš ti. Sitne, nezavisne poslove možeš dati radnicima preko alata
`Agent`, i to paralelno kad su nezavisni:
- `model: "sonnet"`: pregled ekrana, pravljenje snimaka, provera i18n stringova, pretraga po repou, pisanje testova po tvom opisu.
- `model: "haiku"`: najsitnije mehaničke provere (spisak fajlova, grep, prebrojavanje).

Rezultat radnika uvek proveriš pre nego što ga prihvatiš.

## Apsolutne zabrane
- **Git i deploy:**
  - NE radi `git push`, `git commit`, `git reset`, `git clean`, `git checkout -- .`, `git stash`. Runner sam pravi commit posle koraka.
  - NE radi `npx convex deploy`, ništa sa `--prod`, `npx convex env ...`, `vercel`, `stripe`.
  - Dozvoljeno: `npx convex codegen`, `npx convex dev --once` (samo DEV). Ako dev traži interakciju ili padne zbog postojećih podataka, NE briši podatke, nego upiši BLOKADA/ODLUKA.
- **Tajne:** NE postavljaj env varijable i NE upisuj tajne ni ključeve u kod.
- **Javni sajt i auth:** NE diraj javni sajt (početna, cene, kursevi za goste, `/crea` landing, prijava i registracija) ni auth tok.
- **Ekonomija:**
  - NE diraj Stripe, plaćanja, cene, kredite, `LEADERBOARD_XP` ni pravila XP-a.
  - Nema nagrada, popusta ni kredita za nivoe i bedževe.
- **Imena i rute:**
  - NE preimenuj Convex tabele, Convex funkcije ni interne foldere `studio`.
  - NE lomi rute: svaka promena javnog URL-a ima 308 sa starog.
- **Slike:**
  - NE generiši slike: nema image API-ja ni MCP-a za slike. Kad slika fali, upiši je pod „TRAŽENE SLIKE" (vidi dole).
  - NE koristi Chrome ni browser alate osim Playwright MCP-a.
- **Pokret:**
  - Nema kockanja ni „loot box"-a.
  - Nema lažnih odbrojavanja ni teksta koji plaši ili sramoti (O9).
- **Paketi i bundle:**
  - NE uvodi nove pakete osim `@gsap/react`. Svaki drugi ide samo uz ODLUKU sa licencom (MIT/Apache) i veličinom.
  - Three.js i GSAP pluginovi SAMO kroz `dynamic import` / `next/dynamic` (`ssr: false`), ništa u zajednički bundle.
- **Disciplina:**
  - NE „popravljaj" susedni kod koji nema veze sa zadatkom i ne briši tuđi mrtav kod.
  - NE komentariši test i NE briši assertion da bi suite prošao.
  - NE ostavljaj pokrenut `npm run dev` / `next dev` / `convex dev` na kraju koraka.

## Konvencije repoa
- **Radius:** samo `surface-card` 16, `surface-inset` 12, `surface-media` 8 i `rounded-full`.
  - Nikad `rounded-*!` ni inline `borderRadius`.
  - Pun `border-2 border-ink` stoji samo na najspoljašnjem elementu grupe (`npm run check:frames`).
- **Boje:** samo kroz tokene (`--color-ink`, `--color-paper`, `--color-yellow`, `--color-muted`, `--color-line`, `--color-surface-a/b`…). Nikad goli hex u className. Novi tokeni idu u `app/globals.css` za **obe** teme.
- **Stringovi i rute:** svaki UI string kroz `lib/i18n` (sr primaran, en sekundaran). Rute kroz `withLocale()`.
- **Teme i telefon:**
  - Obe teme (svetla i tamna) i telefon (390 px) moraju da rade.
  - Mobilni bottom nav ostaje tačno 4 slota.
  - Klik mete ≥ 44 px na dodir, `focus-visible` vidljiv, kontrast ≥ 4,5:1.
- **Pokret i zvuk:**
  - `prefers-reduced-motion` za svaku animaciju (`lib/motion-contract.ts`). Uz smanjene pokrete nema konfeta, 3D-a ni odometra: vrednost odmah.
  - Zvuk samo kroz postojeći prekidač zvuka.
- **Logika i testovi:**
  - Čista logika ide u `lib/igra-*.ts` ili `convex/igra*Core.ts` sa vitest testovima, po uzoru na parove `fajl.ts` + `fajl.test.ts`.
  - Convex: `mutation`/`query`/`action` iz `./_generated/server`, helperi iz `convex/helpers.ts`, indeksi imenovani po poljima, upiti uvek sa indeksom i limitom.
- **Novi kod:** `lib/igra-*.ts`, `components/igra/*`, `convex/igra*.ts`. Postojeće ekrane menjaš na mestu, hirurški.
- **Slike:** uvek kroz `<IgraArt id="…" />` (kad K02 napravi komponentu). ID-jevi su iz `docs/igra/SLIKE.md`. Nikad direktan `<img src="/brand/igra/...">`.

## Slike (pipeline)
- Claude ih pravi tokom noći. Runner ih pre svakog koraka kopira u `public/brand/igra/` zajedno sa `manifest.json`.
- Slika sa `ready: false` još ne postoji. Komponenta mora da izgleda dobro i bez nje (fallback), bez slomljene slike.
- **Kad ti treba nova slika**, dopiši je u `docs/IGRA-PROGRESS.md` pod naslovom `### TRAŽENE SLIKE (<ID koraka>)`, jedna linija po slici:
  ```
  - <predloženi.id> | <opis na srpskom: šta je na slici, poza, raspoloženje> | <nalepnica|scena|baner> | <gde ide>
  ```
  ID dodaj i u `lib/igra-art.ts` kao planiran. Claude će je napraviti i dodati u manifest.

## Vizuelna provera (kad korak menja UI)
- **Sa Playwright MCP-om:**
  1. Pusti `npm run dev` u pozadini.
  2. Proveri izmenjene ekrane na 390 × 844 i 1440 × 900, u OBE teme.
  3. Napravi par snimaka u `docs/igra/snimci/<ID>-*.png`.
  4. Na kraju UGASI dev server i ne ostavljaj druge procese.
- Ekrani iza prijave se proveravaju kroz **izlog**, dev-only rutu `/{locale}/igra-izlog` koju pravi K05:
  - u produkciji vraća `notFound()` (`process.env.NODE_ENV === "production"`), ima `noindex` i nije u sitemap-u;
  - prikazuje svaki novi primitiv i svaku novu površinu sa **test podacima (fixtures)**;
  - zato UI pravi kao **prezentacione komponente** (podaci kroz props), a stranice ih samo povežu sa Convex upitima.

  **Svaki korak koji menja UI dodaje svoje ekrane u izlog** i snima ih odatle.
- **Bez Playwright-a:** upiši to u progress i osloni se na testove.

## Definicija završenog koraka
Korak nije gotov dok ne prođe:

    npx convex codegen        (ako si dirao convex/)
    npm run typecheck
    npm run lint
    npm run test
    npm run check:frames

Runner posle tebe ponovo pušta ove provere i `npm run build`; ako padnu, vratiće ti grešku.
Test koji je padao i PRE tvog koraka (vidi `.igra-run/baseline.txt` ako postoji) nije tvoja
odgovornost, ali ga ne kvari dodatno.

Ako nešto realno ne može (ograničenje platforme, fali podatak), napravi ostatak i upiši
`BLOKADA:` sa tačnim razlogom. Blokada je ispravan ishod, hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/IGRA-PROGRESS.md`
```
## <ID> — <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je urađeno:** 3–8 rečenica
**Površine:** koje su gotove, koje delimično, koje nisu (i zašto)
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Novi paketi:** ime@verzija — licenca (ili „nema")
**Testovi:** koje si napisao/menjao i šta pokrivaju
**Slike:** koje ID-jeve koristiš; ### TRAŽENE SLIKE ako treba nova
**Rezultat provere:** codegen / typecheck / lint / test / check:frames — prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom
**Za Jovana ujutru:** šta da proveri ručno
```
Dopisuješ na kraj i ne brišeš tuđe sekcije.
