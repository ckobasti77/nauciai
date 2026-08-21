# Studio — FAZA 3 polish nalazi (RD10)

> 22. avgust 2026 · grana `feat/studio-redesign`
> Metod: statička analiza koda (živi klik-kroz je blokiran — Studio je iza
> Google logina i staff-only fleg-a, a pravljenje naloga / OAuth je van pravila;
> `/app/studio` bez logina redirektuje na sign-in). Zato su nalazi tipa
> „render-only na širini X" prosleđeni Jovanu; sve ostalo je iz koda, sa
> fajlom i linijom. Ekran · repro · fajl:linija · težina · šta je urađeno.

**Sažetak:** nađeno **17**, popravljeno **9**, svesno ostavljeno **8** (svaki sa
razlogom). Kapije posle faze: codegen 0 · lint 8w/0e · test 916 · build 64/64.

---

## Popravljeno

### P1 — Detalj: 7 medijskih kontrola bez vidljivog fokusa 🟠 smeta (a11y)
- **Ekran:** detalj/editor medija.
- **Repro:** tabuj kroz plejer — istorija, ‹ ›, zoom, veliki play, play/pause,
  mute. Fokus se ne vidi (gornja traka ga ima, bunar ne).
- **Fajl:** `studio-media-detail.tsx` (istorija `:431`, prev `:499`, next `:668`,
  zoom `:596`, veliki play `:628`, play/pause `:683`, mute `:713`).
- **Urađeno:** dodat `.studio-focus-ink` utility (`globals.css`) i primenjen na
  svih 7. Scrubber (`<input type="range">`) već ima nativni fokus.

### P2 — Tile hover-pil bez fokusa + bare `transition` 🟠 smeta (a11y)
- **Ekran:** mreža, kartica na hover.
- **Repro:** tabuj do favorite/reuse/download pil dugmadi — nema prstena.
- **Fajl:** `studio-media-tile.tsx:282,295,309`.
- **Urađeno:** `transition` → `studio-anim-mikro`, dodat `studio-focus-ink`.

### P3 — Tile checkbox izbora bez fokusa 🟠 smeta (a11y)
- **Fajl:** `studio-media-tile.tsx:242`.
- **Urađeno:** `transition duration-150` → `studio-anim-mikro` + `studio-focus-ink`.

### P4 — `<select>` filteri gutaju fokus 🟠 smeta (a11y)
- **Ekran:** mreža (filter modela), moderacija (filter vlasnika).
- **Repro:** `outline-none` bez zamene — keyboard fokus nevidljiv na dropdown-u.
- **Fajl:** `studio-media-grid.tsx:304`, `studio-moderation-grid.tsx:159`.
- **Urađeno:** dodat `studio-focus-ink` (nadjača `outline-none` na `:focus-visible`).

### P5 — Search inputi slab fokus 🟡 kozmetika (a11y)
- **Repro:** `focus:ring-yellow/30` je bledo i pali se i na miš (`focus:` umesto `focus-visible:`).
- **Fajl:** `studio-media-grid.tsx:251`, `studio-moderation-grid.tsx:152`.
- **Urađeno:** `focus:ring-2 focus:ring-yellow/30` → `studio-focus-ink` (ostavljen `focus:bg-white`).

### P6 — Tile `<video>`/`<audio controls>` otima klik za detalj 🟠 smeta (funkcionalno)
- **Ekran:** mreža, video/audio kartica.
- **Repro:** klik na play/scrubber u tajlu → otvara se DETALJ umesto play-a, jer
  tile `onClick` otvara detalj za svaki klik koji nije `button/a` (`:76`), a
  native kontrole to nisu.
- **Fajl:** `studio-media-tile.tsx:76`, `:191` (video), `:212` (audio).
- **Urađeno:** `onClick={(e) => e.stopPropagation()}` na video i na audio wrapper
  — kontrole rade, ostatak tajla i dalje otvara detalj.

### P7 — Radiusi van sankcionisanog utility-ja 🟡 kozmetika
- **Fajl:** filter bar `rounded-2xl` (`studio-media-grid.tsx:236`,
  `studio-moderation-grid.tsx:140`) → `surface-card`; detalj `rounded-[12px]`
  (`studio-media-detail.tsx:742`) → `surface-inset`; model-picker redundantni
  `sm:rounded-[16px]` uklonjen (`model-picker.tsx:243`, već ima `surface-card`).
- **Urađeno:** sve migrirano na utility (vrednosti su iste, 16/12px).

### P8 — Scope toggle bare `transition` 🟡 kozmetika
- **Fajl:** `studio-page.tsx` (scope prekidač).
- **Urađeno:** `transition duration-150` → `studio-anim-mikro`.

### P9 — Selekcija: status `"completed"` je mrtva provera (status je `"done"`) 🟠 smeta (funkcionalno)
- **Ekran:** mreža, grupno preuzimanje.
- **Repro:** „Izaberi sve vidljive (N)" nikad nije izlazio, jer `visibleDownloadable`
  poredi `status === "completed"`, a shema ima `"done"` (`schema.ts:103`).
- **Fajl:** `studio-media-grid.tsx:175` (bila).
- **Urađeno:** ispravljeno na `"done"` (u FAZA 2, otkriveno ovim prolazom);
  uz to `handleToggleSelect` sad pušta u izbor samo preuzimljiv posao.

---

## Svesno ostavljeno (sa razlogom)

### L1 — Favorite (srce) je mrtva kontrola 🟠 smeta
- **Ekran:** tile hover-pil i detalj gornja traka.
- **Repro:** klik na srce menja SAMO lokalni `useState` — ništa se ne čuva,
  gubi se na reload, tile i detalj se ne slažu, nema filtera „omiljeno".
- **Fajl:** `studio-media-tile.tsx:50,278`, `studio-media-detail.tsx:166,376`.
- **Zašto ostavljeno:** prava popravka traži `generationJobs.favorite` polje +
  mutaciju, a `convex/**` je po pravilima van dozvole (samo H2/H3). Uklanjanje
  dugmeta je izmena rešenog dizajna. **Backlog:** favorite backend + ožičenje.

### L2 — Grid pretraga je klijentska (samo učitani poslovi) 🟠 smeta
- **Repro:** pretraga filtrira `rawJobRows` (učitane stranice); stariji rad koji
  još nije doskrolovan se ne nađe, iako polje izgleda globalno.
- **Fajl:** `studio-media-grid.tsx:131`.
- **Zašto ostavljeno:** serverska pretraga po promptu = nova Convex funkcija,
  van dozvole ovog prolaza. **Backlog:** server-side search ili full-text index.

### L3 — Touch targeti < 44px na tile pilulama i checkboxu 🟡
- **Repro:** `size-7` = 28×28px na favorite/reuse/download i checkboxu; ispod
  WCAG 44px.
- **Fajl:** `studio-media-tile.tsx:242,282,295,309`.
- **Zašto ostavljeno:** uvećanje na 44px razbija kompaktni ugao tajla (dizajn je
  rešen i ne dira se). Dodao sam bar vidljiv fokus (P2/P3). **Backlog:** veći
  hit-area bez vizuelnog uvećanja (padding-trik) ako se traži strogi AA na touch.

### L4 — Composer prompt textarea gasi outline 🟡
- **Repro:** `focus-visible:outline-none` bez zamene.
- **Fajl:** `studio-composer.tsx:805`.
- **Zašto ostavljeno:** composer bar ima svoju ivicu, a textarea je očigledan
  fokus dok se kuca; dupli prsten oko celog bara bio bi bučan. Note.

### L5 — Hover sloj: bare `transition` na composer dugmadima 🟡
- **Repro:** `transition` (bez opsega) animira i `box-shadow`/boje, van rečnika.
- **Fajl:** `studio-composer.tsx` (npr. `:817,829,844,858,876,893`).
- **Zašto ostavljeno (delimično):** čipovi/tajl/scope/checkbox su uvezani u
  `.studio-anim-mikro`; composer dugmad animiraju jeftine osobine i global
  `prefers-reduced-motion` blok ih svejedno gasi. **Backlog:** dovršiti prelaz
  composer dugmadi na `.studio-anim-mikro`.

### L6 — Sitan tekst 9–10px 🟡
- **Fajl:** badževi/oznake (`studio-media-tile.tsx`, `studio-moderation-grid.tsx`
  thumb placeholder `text-[9px]`, itd.).
- **Zašto ostavljeno:** namerni badž/oznaka tekst; 10px je granično ali standardno
  za čipove u ovom dizajnu. Note.

### L7 — Composer bottom-sheet `rounded-t-[16px]` 🟢
- **Fajl:** `studio-composer.tsx:653`.
- **Zašto ostavljeno:** 16px je SANKCIONISANA vrednost (card tier); zaobljenje
  samo gornjih uglova sheeta nema utility ekvivalent (`surface-card` je sva
  četiri). Nije prekršaj skale.

### L8 — Date filter zamrznut mount-time `now` 🟢
- **Fajl:** `studio-media-grid.tsx:60,78`.
- **Zašto ostavljeno:** prozor 7d/30d se računa od `now` uzetog na mount; zastari
  tek u vrlo dugoj sesiji preko ponoći. Minorno.

---

## Za Jovana — živa provera (blokirano loginom u ovom okruženju)

Pokreni `npm run dev`, prijavi se (staff), otvori `/sr/app/studio` i `/en/app/studio`:
1. **Reduced-motion:** uključi u OS-u; sidebar swap, tajl-ulaz, mreža↔detalj —
   svi moraju biti bez klizanja (FAZA 1.4 + global CSS).
2. **Širine 320/375/768/1280/1920:** stranica se ne sme skrolovati bočno; admin
   tabele skroluju unutar `overflow-x-auto` (provereno u kodu, treba oko).
3. **SR duži od EN:** čipovi filtera i dugmad na 320px — da li se prelamaju/seku.
4. **Konzola:** DevTools kroz ceo tok — hydration/`key`/404 (nije se moglo živo).
5. **Moderacija (H3):** kao admin uključi „Svi korisnici", „Prikaži detalje" na
   tuđem poslu — proveri da se upisao audit red i da moderator NE vidi prompt/thumbs.
