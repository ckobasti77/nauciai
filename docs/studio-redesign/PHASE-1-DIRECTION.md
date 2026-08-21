# Studio redizajn — Faza 1: pravac

> 21. avgust 2026 · grana `feat/studio-redesign`
> Ovo je dokument PRAVCA, ne implementacije. Nijedna linija produkcijskog koda
> nije dirnuta u Fazi 1. Ulazi: `design-dna` nad platformom i nad Google Flow-om
> (oba profila u `design-dna-platform.json` / `design-dna-flow.json`), plus
> `impeccable` (Operate režim, IA), `ui-ux-pro-max` (mere, komponente),
> `design-taste-frontend` (korektiv nad merama), `motion-design` (koreografija).
>
> Princip fuzije, doslovno: **skelet od Flow-a, koža od platforme.** Svako mesto
> gde se ovo dvoje sudara reši u korist platforme za IDENTITET, u korist Flow-a
> za STRUKTURU.

---

## 0. Jedna stvar koju moraš da potvrdiš pre svega — shadcn

Zahtev nabraja „shadcn" kao dato i kao tvrdo ograničenje. **Repo nema shadcn i
nikad ga nije imao.** Provereno tri puta nezavisno:

- Nema `components.json`, nema ijednog `@radix-ui/*` u `package.json`
  (`package.json:29-51`), grep `SidebarProvider|useSidebar` je prazan.
- `components/ui/` sadrži tačno četiri fajla; `primitives.tsx` je ručno pisan
  (`LinkButton`, `Panel`, `SketchIcon`, `HandUnderline`, `cn`).
- `components/app/app-sidebar.tsx` je ručno pisan `<aside>` od 1982 linije sa
  sopstvenom mašinom stanja — NE gradi se ni na kakvom shadcn `Sidebar`
  primitivu.
- Korak S6 je ovo već svesno odlučio (`STUDIO-PROGRESS.md`, ODLUKA S6.1):
  „Repo NEMA shadcn, i nije uveden… `npx shadcn init` bi doneo novu zavisnost,
  prepisao `globals.css` i uveo drugi dizajn jezik."

Uvoðenje shadcn-a bi prekršilo dva druga tvrda ograničenja iz ovog istog
zahteva: **„nijedna nova zavisnost"** i **hirurške, aditivne izmene.** Takoðe bi
se sudarilo sa `@layer base` pravilima u `globals.css` koja su load-bearing.

**Preporuka:** zadržavamo postojeći, ručno pisani sloj primitiva (`primitives.tsx`
+ komponente iz `components/studio/`) i gradimo Studio nad njim, u jeziku
platforme. „shadcn" u zahtevu čitam kao „shadcn-obrazac" (kompoziciju tankih,
pristupačnih primitiva), ne kao paket. Ako baš želiš pravi shadcn paket, to je
zaseban, ne-aditivan poduhvat i moramo da ga izdvojimo — reci mi i stajem.

---

## 1. Dijagnoza — šta je danas slabo i zašto

Trenutni Studio je **formular u dve kolone**, ne alat sa platnom. To je koren
svega ostalog. Nalazi, sa fajlom i linijom (brojevi linija su iz žive grane;
gde se razlikuju od revizije, dat je stvaran broj).

### 1.1 Arhitektura (glavni problem — ovo NIJE dekoracija)

| # | Šta je slabo | Gde | Zašto boli |
|---|---|---|---|
| A1 | **Dva ekrana koja treba da su jedan.** Playground i galerija su odvojene rute. | `components/app/studio-page.tsx` vs `components/app/studio-gallery-page.tsx`; rute `/app/studio` i `/app/studio/gallery` | Praviš u jednoj sobi, gledaš u drugoj. Posle generisanja tvoj rad sklizne u desnu kolonu („poslednji + traka od 3", `studio-page.tsx:907-910`), a cela biblioteka je na drugoj ruti. Flow-ov uvid: mreža tvojih radova JESTE pozadina playground-a. |
| A2 | **Composer je statičan formular u levoj koloni, ne stalan kontekstualan instrument.** | `PlaygroundForm` u `leftColumn()` (`studio-page.tsx:802`) | Ima jednu nameru (napravi). Nema „izmeni ovaj medij" režim. Kod Flow-a je jedna komponenta, dve namere (mreža = pravi, detalj = menja). Imamo sve delove, ali kao formular, ne kao mesto. |
| A3 | **Detalj medija je skriven query param, ne mesto.** | `?regenerate=<jobId>` (`studio-page.tsx:644-649`), server `getJobForRegenerate` (`convex/studio.ts:1279-1338`) | `getJobForRegenerate` već vraća model, režim, parametre, ulaze, čak i `missingSlots`. Ali nema detalj-ekrana: nema plejera, nema panela istorije, nema „prompt koji ga je napravio". Flow rutira na `/edit/<id>` sa plejerom i istorijom. Imamo podatke, nemamo površinu. |
| A4 | **„Upotrebi ponovo" (izlaz → ulaz) je nevidljivo.** | `components/studio/source-job-picker.tsx`, montiran samo za continuation režime bez slotova (`studio-page.tsx:234-247`) | Picker postoji, ali izranja samo za Gemini Omni „video" režim. Na kartici nema nijedne „reuse" akcije. Flow to stavlja na hover pil svake kartice. |
| A5 | **Model je krupna kartica-picker, menja se retko.** | `components/studio/model-picker.tsx`, montiran u `studio-page.tsx:855-863` | U novom dizajnu model je stavka u dropdownu i menja se ČESTO — što direktno pali defekt C4 (dole). Današnji dizajn to skriva jer se model retko dira. |

### 1.2 Hijerarhija i kognitivno opterećenje

- Sve je bela kartica sa `border-2 border-ink` naslagana u kolonu — visoka,
  ravnomerna vizuelna težina, bez fokusne putanje. **Generisani medij** (ono
  što emocionalno i finansijski jedino znači) je mali, u desnoj koloni,
  podreðen formularu.
- Cena se pojavljuje kasno i može da bude netačna (C1, dole). Emocionalni posao
  interfejsa — „cena čitljiva pre klika" — danas nije ispunjen.

### 1.3 Osam defekata koje redizajn MORA da reši (svi potvrðeni u kodu)

| # (audit) | Defekt | Fajl:linija | Suština |
|---|---|---|---|
| **1 / C1** | Cena na dugmetu ≠ naplaćena cena | klijent `lib/studio-playground.ts:87-89` (`measuredQuantityFrom`, sirov razlomak); server `convex/studioJobCore.ts:447,452-453` (`Math.ceil` + `clampQuantity`) | Klip 7,4 s: dugme 202 kr, naplati 218. Klijent mora da uvozi istu funkciju. Uz to: prikaži da je cena PROCENA dok se fajl ne izmeri, pa TAČNA. |
| **2 / C4** | Promena modela briše prompt + fajlove | `studio-page.tsx:871` (compound `key` na `PlaygroundForm` forsira remount) | Napišeš tri pasusa, prevučeš dve reference, promeniš model da uporediš cenu — sve nestane. Bez upozorenja. |
| **3 / C5** | „Generiši" nije blokirano dok upload traje | `components/studio/drop-slot.tsx:77` (`pending` lokalan za slot, nikad podignut) | Prevučeš 5 referenci, prva se otpremi, klikneš — posao ode sa JEDNOM. |
| **4 / C2** | Galerija tvrdi da nema generacija, a ima ih | server `convex/studio.ts:936-949` (filter posle `paginate`); klijent `studio-gallery-page.tsx:774` (prazna grana), „Učitaj još" samo u grani rezultata (`:804-848`) | Filtriraš po starom modelu → „Nijedna ne odgovara", bez načina da učitaš dalje. Rad izgleda obrisano. |
| **5 / C6** | Svaki posao u toku opisan kao „slika" | `lib/studio-form.ts:215-217, 234-240` (`jobStatusText` nikad ne dobija `job.kind`) | Video i zvuk: „Model radi na tvojoj slici…". |
| **6 / C6** | Šest kodova greške bez ljudske poruke | `lib/studio-messages.ts` mapper (nedostaju `NEISPRAVAN_REZIM`, `NEISPRAVNI_ULAZI`, `IZVOR_NIJE_IZABRAN`, `IZVOR_NIJE_DOSTUPAN`, `IZVOR_NIJE_PODRZAN`, `TUDJI_FAJL`) | Svi padnu na „Pokušaj ponovo za koji trenutak" — pogrešan savet, ponavljanje ne pomaže. |
| **7** | Admin ekran samo srpski, sirovi kodovi | `components/app/studio-admin-page.tsx` (nema `locale` prop) | Korisniku (adminu) izlaze serverski kodovi. |
| **8** | Drop slotovi nemaju vidljiv fokus; zamena fajla = Ukloni pa Dodaj | `drop-slot.tsx` (`<label>`/`<input>` su `sr-only`, bez prstena; zamena samo u praznoj grani `:378-390`) | Tastatura ne vidi gde je fokus; zamena je dva koraka. |

**Napomena o radiusu:** revizija je označila `rounded-[16px]` (`drop-slot.tsx:252`)
i `rounded-[8px]`×2 (`studio-admin-page.tsx`) kao „van skale". Po pravilu iz
AGENTS.md (pravilo je o VREDNOSTI) 16px i 8px JESU sankcionisane vrednosti (card
i media tier), pa nisu prekršaji — ali treba ih migrirati na `surface-card` /
`surface-media` utility kad ionako diramo te fajlove. Prava debt van skale (6/10/
18px…) nije u Studio fajlovima koje menjamo.

---

## 2. Medij na krem podlozi — tri rešenja + preporuka

**Ovo je centralni dizajnerski problem.** Flow čita medij tako što ugasi sobu;
mi to ne smemo — platforma je krem sa tvrdim plavim okvirima i žutim akcentom,
suprotnost tamnoj sobi. Pitanje: kako 40 slika i videa čita dobro na krem
podlozi, u ovom jeziku, a da ne postane šarena buka?

### Rešenje A — „Mastionica" (tamna soba PO KARTICI) — PREPORUKA

Svaki medij dobija sopstveni tamni bunar iza sebe: krem stranica → bela kartica
(`border-2 border-ink`, tvrda senka) → **tamni medijski bunar** (`--studio-well`,
near-black plavo-mastiljav `#0e1a2b`, NIKAD čist crn) na `surface-media` (8px) →
medij. „Tamna soba" je skupljena na svaki tajl. Okvir se **stanjuje na samom
mediju** (bunar drži ivicu), a karticu i dalje drži tvrda senka + razmak. Žuto se
pojavljuje ISKLJUČIVO na hover-akciji (pil) i na ceni.

- **Za:** medij čita lepo (tamna podloga), a tajl je nedvosmisleno nauciai
  (mastiljav okvir, tvrda senka, krem). Pale/bele slike ne nestaju. Prazna i
  loading stanja izgledaju namerno (taman bunar = prirodan skeleton). Ovo je
  najverniji prenos Flow-ove čitljivosti u kožu platforme, i tačno je jedan od
  pravaca koje si sam nabrojao („medij dobija svoju tamnu podlogu unutar
  kartice").
- **Protiv:** tri okvira po tajlu (okvir + senka + bunar). Na 40 tajlova tvrde
  senke mogu da postanu bučne. **Ublažavanje (pozajmljeno iz B):** u mreži
  senka je manja i tinta (`3px` tinted offset) umesto pune `6px`; puna `6px`
  tvrda senka ostaje samo za lebdeći composer/panel — jedini element koji treba
  da deluje podignuto sa papira.

### Rešenje B — „Bez okvira na mirnijem papiru" (Flow-ova mreža, prenesena)

Bez kartice. Medij ide edge-to-edge (`surface-media` 8px, bez okvira), baš kao
Flow, ali na MIRNIJEM krem tonu: tamo gde je gustina medija najveća, podloga se
spušta sa `#fffdf8` na dublji „canvas" ton (`--studio-canvas` ≈ `#f5efe2`), da
bela/svetla slika ne vrišti uz skoro-belu podlogu. Razdvajanje drži velik razmak
+ vrlo meka tinta-senka (ne tvrda — jedino mesto gde se platforma savija ka
mekoj senci). Hover otkriva ink-okvireni pil (identitet dolazi na interakciju).

- **Za:** najbliže Flow-ovoj smirenosti, medij dominira, najmanje hroma.
- **Protiv:** savija pravilo tvrde senke; mreža bez okvira je u mirovanju najmanje
  „nauciai" (identitet tek na hover). Pale slike na krem imaju slabu ivicu.
  **Ublažavanje:** 1px unutrašnji ink-tint prsten (`rgba(14,49,88,.12)`) da uhvati
  bledu ivicu — vlas, ne 2px okvir.

### Rešenje C — „Kontakt-tabak" (metafora radne sveske, najviše na-brend)

Uðemo U papirni identitet umesto da se borimo protiv njega: mreža je
foto-kontakt-tabak / plate u skicenbloku. Medij na beloj ploči (kartica, ink
okvir), sam medij dobija tanak ink keyline (1px) + uzan tamni ink „mat" (kao
paspartu) da svetao medij ima ivicu na belom. **Prompt-naslov stoji ISPOD ploče,
u margini** (Nunito/Patrick Hand caption), ne preko medija — koristi platformin
ljubav prema margin-beleškama. Tvrda senka ostaje ali mala (2px), uniformna, pa
40 ploča čita kao uredan tabak. Žuto = savijen ćošak (dog-ear) samo na
aktivnom/omiljenom.

- **Za:** najdistinktivnije nauciai — pretvara ograničenje u koncept (radna
  sveska tvojih generacija). Caption-ispod pomaže skeniranju (prompt je
  identitet i čitljiv je bez hovera).
- **Protiv:** caption-ispod troši vertikalu (manja gustina od Flow-ovog overlay-a);
  najviše odstupa od Flow-ovog skeleta.

### Preporuka: **A (Mastionica), sa jednom pozajmicom iz B.**

A drži identitet u mirovanju (ink okvir, tvrda senka, krem), rešava čitljivost
pošteno (svaki medij u svom bunaru), i najčistije hvata mešan medij + bilo koji
odnos + loading/prazno. To je najistinitija fuzija: Flow-ov skelet mreže, koža
platforme, čitljivost re-rešena **sadržavanjem**, ne globalnom tamnom temom.
Pozajmica iz B: u mreži smanji tvrdu senku na `3px` tinted i spusti podlogu za
nijansu (`--studio-canvas`) tamo gde je gustina najveća, da 40 bunara ne postanu
40 senki koje viču. Punu `6px` senku čuvaj za composer/panel.

> Mockup prikazuje A kao primarno; B i C su tu kao statične uporedne pločice.

---

## 3. Sidebar: prelaz klasično → studijsko (i nazad)

Isti `<aside>`, dva sadržaja. Okidač već postoji: `studioActive`
(`app-sidebar.tsx:1408`). Izmena je **aditivna** — nov režim sadržaja iza
provere rute, zatečeno ponašanje ostaje podrazumevano. Ne refaktorišemo sidebar.

**Motion personality:** Paper/Corporate — `cubic-bezier(0.2,0,0,1)` (MD3 standard),
papir materijal (1.0×, 3–5% overshoot). Prelaz je context-switch (srednje-teška
težina), ~340ms ukupno.

### Koreografija (bez sudara visine — ključno ograničenje)

Gornja kontrola za skupljanje i sam okvir se NE pomeraju (po zahtevu). Menja se
samo sadržaj ispod fiksnog zaglavlja. Oba sadržaja su apsolutno pozicionirana u
istom „swap" kontejneru fiksne visine → odlazeći i dolazeći se nikad ne sudaraju
u visini (nema reflow-a).

| Faza | Šta | Trajanje / easing | Svojstva |
|---|---|---|---|
| Izlaz (klasično napolje) | fade + klizanje levo | 180ms, ease-in `(.3,0,1,1)` | `opacity 1→0`, `translateX 0→-12px` |
| Ulaz (studijsko unutra) | počinje na +80ms (blago preklapanje), fade + klizanje s desna | 260ms, MD3 emphasized `(.05,.7,.1,1)` | `opacity 0→1`, `translateX 12px→0` |
| Stagger stavki | „Nazad" prvo, pa filteri vrsta medija kaskadno | 24ms po stavci, ukupno <180ms | postojeći `.sidebar-reveal` (GSAP 0.04s) ili `motion/react` staggerChildren |

- **Smer nosi značenje:** ulaz — sadržaj dolazi s DESNA (dublje u alat); „Nazad"
  — sadržaj se vraća s LEVA. To je poruka „ušao si u alat, i dalje ista app".
  Enter > exit (260 vs 180), jer korisniku je važnije ono što se pojavljuje.
- **Skupljeno stanje:** isti swap u rail podstablu (`:1780`), ali samo ikone —
  klasične rail ikone se cross-dissolve u studijske (ikone filtera vrsta medija),
  bez klizanja (na 80px klizanje bi seklo); čist opacity ~200ms + desni tooltip
  se menja. Dublja taksonomija ide u postojeći rail flyout.
- **„Nazad" bez istorije:** `router.back()` sam nije dovoljan (prazna istorija na
  direktan link/refresh). Rešenje je SVESNO: pri ulasku u Studio zapamti
  in-app referrer / poslednju ne-studio putanju (sessionStorage). „Nazad" =
  `if (history.length > 1 && inAppReferrer) router.back(); else router.push(withLocale(locale, "/app"))`.
  Rezervna ruta je dashboard, ne tiho ništa.
- **Mobilni:** sidebar je drawer; swap se dešava u telu drawera (drawer JESTE
  prošireno telo, nasleðuje swap besplatno) — ali BEZ horizontalnog klizanja
  (drawer se već otvara horizontalno; drugo horizontalno klizanje bi se sudaralo)
  — čist crossfade + stagger. `AppBottomNav` je zaključan na 4 slota (eksplicitan
  ugovor, `app-sidebar.tsx:1046-1051`) — NE diramo ga; „Nazad"/kontekst na
  mobilnom nosi i gornja traka same Studio stranice.
- **`prefers-reduced-motion`:** `globals.css` već gasi trajanja. Ekvivalent:
  trenutna zamena sadržaja (bez fade/slide) — dolazeći sadržaj default-uje na
  krajnje stanje (opacity 1, translate 0). Potpuno funkcionalno bez animacije.

**Rizik regresije:** `AppSidebar` ima tačno JEDNOG potrošača (`app-shell.tsx:32`);
nema `SidebarProvider`/konteksta koji bi pukao. Blast radius aditivne izmene:
`app-sidebar.tsx` + nov `lib/studio-sections.ts` (po uzoru na
`lib/community-sections.ts`). Ako mi se učini da moram da refaktorišem sidebar da
bih ovo ubacio, stajem i objašnjavam pre nego što pipnem.

---

## 4. Tokeni, tipografija, mreža, spacing

Studio koristi tokene platforme kako jesu. Dodajemo tri Studio-tokena, svi
izvedeni iz postojećih (bez nove palete):

```css
/* dodaci — @theme inline / :root, izvedeni iz postojećih tokena */
--studio-canvas:    #f5efe2;                 /* krem nijansu dublje: mirnija podloga gde je gustina medija najveća */
--studio-well:      #0e1a2b;                 /* medijski bunar: ink zatamnjen ka near-black-plavom; NIKAD #000 */
--studio-well-edge: rgba(14,49,88,0.14);     /* 1px unutrašnji prsten za bledu ivicu na belom */
```

**Radius — striktno sankcionisane četiri (utility klase, ne arbitrarno):**

| tier | vrednost | gde u Studiju |
|---|---|---|
| card `surface-card` | 16px | tajl kartica, composer bar, drop-up panel, detalj-ploče |
| inset `surface-inset` | 12px | ugnježdene kontrole u panelu (segmented, select, number) |
| media `surface-media` | 8px | medij unutar tajla (pola radiusa kartice) |
| pill `rounded-full` | ∞ | čipovi stanja, dugmad, značke, avatar/favorite ikon-dugmad |

Nikad `!` ni inline `borderRadius` (AGENTS.md, `@layer base` je load-bearing).

**Senke (isti jezik platforme):**

```
tajl u mreži:      shadow-[3px_3px_0_0_rgba(14,49,88,0.12)]
tajl hover:        shadow-[5px_5px_0_0_rgba(14,49,88,0.16)] + translateY(-2px)
composer / panel:  shadow-[6px_6px_0_0_rgba(14,49,88,0.16)]   (jedini „podignut" element)
```

**Tipografija (iz platforme, Nunito + Patrick Hand + Geist Mono):**

| uloga | font / stil |
|---|---|
| prompt-naslov na tajlu | Nunito 600–700, `text-sm`, leading-tight, 2 reda pa clamp |
| naslov u detalju (= prompt) | Nunito 800, `text-lg`→`text-xl` |
| composer textarea | Nunito 500, `text-base` (min 16px na mobilnom, ux pravilo) |
| labele kontrola | Nunito 800 (`font-extrabold`), `text-xs`, tracking 0 |
| cena | broj u Geist Mono (platforma već koristi mono za kredite), `text-sm`; broj je link (Flow-ov obrazac) |
| taksonomija u sidebaru | kao postojeći `NavLink` (`text-sm font-bold`) |
| ime modela u čipu | `text-sm font-bold` + emoji iz kataloga |

**Mreža:**

- Masonry preko CSS multi-column (`columns-1 sm:columns-2 2xl:columns-3`) sa
  `break-inside-avoid` na tajlu — pravi masonry bez JS-a, hvata mešane odnose.
- Gutter `16px` (`gap`/`column-gap`) — nijansu više od Flow-a, jer tajlovi imaju
  senke kojima treba vazduha.
- Mreža skroluje ISPOD lebdećeg composera; `main` ima donji padding = visina
  composera + margina, da poslednji red ne ostane skriven.

**Spacing:** platforma 4px baza — 4/8/12/16/20/24/32/40. Composer interno p-3/p-4;
redovi panela `gap-3`, `py-2.5`; page padding `px-4` mobilni / `px-6` desktop;
composer odvojen 16–24px od dna, centriran, `max-w ≈ 720px` (čitljiva širina, ne
pun ekran).

**Z-index skala (ux pravilo — bez spamovanja):** grid 0 · composer 30 · drop-up
panel/bottom-sheet 40 · detalj-ruta 20 · sidebar drawer 50 (postojeći).

---

## 5. Composer + panel — tri pravca + preporuka

Zahtevi na composer: (a) stalan + kontekstualan (mreža = pravi, detalj = menja),
(b) panel se GENERIŠE iz `model.paramSpec` (30 modela, 7 tipova kontrola, 11
režima — nikad hardkodovan po modelu), (c) živa cena (procena → tačna), (d)
preživi promenu modela (C4), (e) blokira dok upload traje (C5), (f) mobilni
prvorazredan.

Sva tri pravca dele **isti renderer** (`components/studio/param-form.tsx` +
`param-control.tsx`) unutar panela. Razlika je samo šta je promovisano na bar.

### Pravac 1 — „Flow-verno: čip-rezime → drop-up panel"

Bar = textarea + levo (+ upload) + desno (jedan čip-rezime „Video · Veo 3.1 ·
16:9 · 8s · ×2" + slanje). Klik na čip → panel gore sa punim formularom.

- **Za:** najvernije skeletu; kompaktno u mirovanju; panel može biti visok koliko
  model traži.
- **Protiv:** jedan čip mora da sažme do ~7 kontrola u jedan red — izduži se /
  seče. Cena je skrivena dok se panel ne otvori.

### Pravac 2 — „Red čitljivih čipova (Higgsfield hibrid)"

Umesto jednog rezimea, red labeliranih čipova za glavne kontrole (model, odnos,
trajanje, broj, +zvuk), svaki otvara svoj mali popover; retke/napredne kontrole
iza „Više" čipa.

- **Za:** stanje čitljivo na prvi pogled bez otvaranja; svaka kontrola svoj target.
- **Protiv:** red od 5–7 čipova prelazi na mobilnom i u suženom `main`; za 30
  modela dužina reda je nepredvidiva.

### Pravac 3 — „Dvoslojno: bitni čipovi inline + drop-up za ostatak" — PREPORUKA

Hibrid: bar prikazuje textarea + do TRI uvek-vidljiva bitna čipa (Model, i dve
najjače kontrole za tu vrstu — video: trajanje + broj; slika: odnos + broj) +
jedan „N kredita ⋯" element desno koji NOSI živu cenu I otvara pun drop-up panel
za sve ostalo.

- Bitni čipovi se biraju iz `paramSpec` malim pravilom (`affectsPrice` + `kind`),
  ne hardkodovano — ostaje data-driven za 30 modela.
- **Cena je UVEK vidljiva na baru** (emocionalni zahtev: „cena čitljiva pre klika
  i uživo") — procena (`~`) dok se fajl ne izmeri, pa tačna.
- Panel (pun `ParamForm`) se otvara na dodir cene/čipa.
- **Mobilni:** bar se skupi na textarea + model čip + cena+slanje; panel postaje
  **pun bottom-sheet** (drag-to-dismiss), ne drop-up; red čipova je vrh sheeta.

- **Za:** čitljivi bitni + cena uvek vidljiva (emocionalni posao) + puna kontrola
  na dodir + skalira na 30 modela + čisto degradira na mobilni sheet.
- **Protiv:** malo složenije od čistog Flow-a; pravilo izbora „bitnog čipa" traži
  pažnju.

### Preporuka: **Pravac 3.**

Jedini koji cenu čini stalnim graðaninom bara — što je emocionalni zahtev #1 i
direktno veže popravku C1 (procena→tačna, inline). Drži Flow-ov stalno-
kontekstualan composer i drop-up panel (skelet), dodaje Higgsfield-ovu čitljivost
tamo gde najviše znači (cena + model + ključni param).

### Ponašanje panela (svi pravci)

- **Generisan iz `activeModel.paramSpec`** preko postojećeg renderera (7 tipova).
  Type switch (Slika/Video) i mode switch (Okviri/Sastojci…) gore; odnos/model/
  trajanje/broj/napredno ispod; **živa cena-linija na dnu** sa brojem kao linkom.
  Broj ratija/trajanja/izlaza dolazi iz `paramSpec` kontrola (nije zaseban katalog
  polje) — 5 ratija za sliku, 2 za video izlaze prirodno iz dužine `options` niza.
- **Promena modela ČUVA stanje (C4):** menjanje modela u dropdownu NE remount-uje
  i NE briše. Prompt ostaje; fajlovi ostaju gde ih novi model prima; nekompatibilni
  parametri padnu na default novog modela; `role="status"` linija imenuje šta je
  promenjeno („Trajanje prilagoðeno: 8s → 6s, maksimum ovog modela"). Implementacija:
  prestani da keyuješ `PlaygroundForm` na `activeModel.slug` (`studio-page.tsx:871`);
  umesto toga reconcile parametre carry-forward logikom (kao što promena režima već
  radi, `lib/studio-params.ts` `paramValuesForMode`). Najvažnija interakcijska
  popravka — novi dizajn čini promenu modela čestom, mora da radi besprekorno.
- **Blokada uploada (C5):** composer prati uploade u letu (podigni `pending` iz
  slota na form-level brojač); dugme piše „Otpremanje…" i zaključano je dok se svi
  ne slegnu. Nijedan posao ne odlazi sa polu-otpremljenom referencom.
- **Cena procena→tačna (C1):** klijent uvozi ISTU `resolveMeasuredQuantity`
  (ceil+clamp) kao server; pre merenja „~N kredita (procena)", posle „N kredita".
  Broj nikad ne laže.

### Detalj medija (editor-kao-mesto)

- Ruta: `/[locale]/app/studio/m/<jobId>` (ugnježdena, puno-ekranski editor:
  plejer + panel provenijencije/istorije + isti composer u edit režimu). Čisto i
  jeftino; opcija „intercepting route" (@modal, detalj preko mreže) je lepša ali
  više mašine — ostavljam kao mogućnost za kasnije.
- Composer u detalju = ista komponenta, edit režim: placeholder „Opišite izmene",
  model čip default-uje na edit-sposoban model, cena za izmenu.
- Panel provenijencije = ulaz(i) + prompt koji je napravio medij (iz
  `getJobForRegenerate`) + „upotrebi kao ulaz" akcija (veže `source-job-picker`).
  Istorija = ranije generacije u lozi (imamo `sourceJobId` vezu).
- **Tri Flow → nauciai preslikavanja:** prompt = naslov kartice (imamo);
  istorija u detalju = naš `?regenerate` (imamo podatke, dobija panel); „upotrebi
  ponovo" na hover = `source-job-picker` promovisan na karticu.

---

## 6. Projekti (van obima) — šta bi koštalo kasnije

Gornja traka ostavlja mesto gde bi ime projekta stajalo: `[ Bez projekta ▾ ]`
placeholder pored strelice nazad. Dodavanje projekata kasnije košta:
- Convex: `projects` tabela + `projectId` na `generationJobs` (migracija:
  widen → backfill „default projekat" po korisniku → narrow); indeks
  `by_project`.
- Rute: `/app/studio` postaje lista/poslednji projekat; `/app/studio/p/<id>`.
- UI: picker projekta u traci, filter mreže po projektu, premeštanje medija.
- Sidebar taksonomija bi dobila „Projekti" grupu.
To je zaseban, srednje velik posao; struktura koju sad gradimo (mreža kao platno,
composer, detalj-ruta) ga prima bez preoblikovanja — samo doda `projectId` filter
sloj. Ništa u Fazi 2 se ne zaključava protiv projekata.

---

## 7. Kapije (obe faze)

```
npx convex codegen
npm run lint
npm run test      # 883/883 danas — ako ijedan padne, ja sam ga pokvario
npm run build
```

Faza 1 ne dira produkcijski kod, pa su kapije nepromenjene (883/883). Faza 2:
komponenta po komponenta, `design-taste-frontend` nad svakom merom, motion na
kraju.

---

## 8. Odluke koje tražim od tebe (kraj Faze 1)

1. **Medij na krem** — A (Mastionica) / B (Bez okvira, mirniji papir) / C
   (Kontakt-tabak). Preporuka: **A + pozajmica iz B.**
2. **Composer/panel** — 1 (Flow-verno) / 2 (Red čipova) / 3 (Dvoslojno).
   Preporuka: **3.**
3. **shadcn** — gradimo na postojećim ručnim primitivama bez nove zavisnosti
   (preporuka) ILI uvodimo pravi shadcn (nova zavisnost, ne-aditivno, zaseban
   posao).

Detalj-ruta (`/studio/m/<id>` vs overlay param) i intercepting-route mogu da
odlučim sam u Fazi 2 osim ako želiš drugačije.
