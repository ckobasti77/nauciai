# UX BOOST — završni izveštaj (U1–U13)

**Run:** 2026-08-29 23:13 → 2026-08-30 05:45, grana `feat/ux-boost`, nenadziran (Jovan je spavao).
**Izvor detalja:** `docs/UX-BOOST-PROGRESS.md` (dnevnik, 13 sekcija, svaka sa fajlovima/odlukama/testovima/verifikacijom). Ovaj dokument je rezime za jutro — za tačan `fajl:linija` dokaz vidi progress dnevnik.

**Finalno stanje (posle U13):**
- `npx convex codegen` — ✅
- `npm run typecheck` — ✅
- `npm run lint` — ✅ na nivou skripte, sa **jednom poznatom pre-postojećom greškom** (vidi ispod) — `178 problems (1 error, 177 warnings)`, identično od U1 do U13
- `npm run test` — ✅ **90 fajlova, 1198 testova**
- `npm run build` — ✅ **Compiled successfully**, 74 rute

**Jedina crvena stavka u celom run-u:** `components/studio/studio-composer.tsx:1112` —
`routeDroppedFiles` (napravljen preko `useEffectEvent`) se poziva iz `onChange` handlera skrivenog
file inputa, a ne iz Effect-a (`react-hooks/rules-of-hooks`). Postojala je **pre** U1 (nije je uveo
ovaj run), dokumentovana je i eskalirana Jovanu u U1, i svaki sledeći korak je svesno odbio da je
dira jer je van obima, izolovana i nosi rizik regresije na putanji za slanje fajlova u Studiju.
**Preporuka:** popraviti je u zasebnom, malom koraku, van UX run-a.

---

## Rezime po koracima

**U1 — Audit.** Proverio svih 6 polaznih hipoteza u kodu i napisao `docs/UX-BOOST-PLAN.md` sa
`fajl:linija` dokazima za svaku. Četiri hipoteze potvrđene, tri netačne/zastarele (uključujući
najvažniju: `/app` gejt je bio suprotan problem od onog što je brief pretpostavljao — puna tabla sa
0% herojem nad zaključanim kursevima, ne first-run blok). Otkrio i baseline lint grešku
(`studio-composer.tsx:1112`) koja je od tada praćena kroz ceo run.

**U2 — Primitivi + migracija modala.** Napravio `Button`/`Spinner`/`Dialog`/`ConfirmDialog`/`Field`/
`Badge`/`EmptyState` u `components/ui/`. Objedinio tri skoro identične kopije fokus-trap logike u
jedan `useModalFocus` (sa stekom za ugnježdene modale — bez toga bi zatvaranje dva modala odjednom
trajno zaključalo skrol stranice). Osam modala prvi put dobilo fokus menadžment. Svih pet
`window.confirm`/`alert` poziva zamenjeno `ConfirmDialog`-om ili toast-om.

**U3 — In-app katalog kurseva.** Učionica više ne prekida render first-run blokom kad student nema
kurs — sada renderuje pravi katalog svih objavljenih kurseva sa zaključanim karticama, cenom,
`CheckoutButton`-om (bez izlaska iz app-a) i uvodnim videom u dijalogu. Svih pet app→marketing
`#pricing` linkova sada gađa in-app katalog. **Važno za Jovana:** „Zaključano" je danas samo prikaz —
backend (`convex/helpers.ts:347-350`) i dalje pušta svakog verifikovanog korisnika u svaki objavljen
kurs. Zatvaranje te rupe nije bilo u obimu (auth pravila su zabranjena za ovaj run).

**U4 — Komandna tabla se više ne gasi.** `DashboardFirstRun` prestao je da bude ekran-zamena — sad je
kompaktan pozdravni hero sa štikliranim koracima na vrhu, a `DashboardWindowsGrid` se renderuje UVEK
ispod njega, sa `EmptyState`-om po praznoj zoni umesto jedne sive rečenice.

**U5 — Copy pass.** Žargon izbačen na 42+ mesta („tred"→„tema", „username"→„korisničko ime", itd.).
Četiri paralelna sistema praznih stanja svedena na `EmptyState` primitiv. Tri dodatna nativna
`confirm()` poziva zamenjena. Zajednica i Studio dobili uvodne panele („šta je ovo / prva tri koraka").

**U6 — Admin Kontrolni centar.** `/app/admin/content` prešao sa tri gola `<select>`-a na master-detail
hijerarhiju (smerovi → kursevi → lekcije) sa pregledom stanja (4 kartice sa brojevima po statusu) na
vrhu. Users/Growth/Analytics dobili prava prazna stanja umesto sirovih placeholder pločica. Svaka
admin ruta konačno ima svoj naslov umesto četiri puta „Kontrolni centar".

**U7 — Mehanički a11y prolaz.** Svih preostalih 43 `outline-none` mesta bez zamene dobila
`focus-visible:outline-2 outline-offset-2 outline-ink` (kontrast >12:1 u obe teme). Dve prekinute
`aria-expanded` rupe zatvorene.

**U8 — Token + radius sweep.** `#2e6f9f` (23 pojave) promovisan u token `--blue-mid` sa tamnim
parnjakom. Svih 39 app-scope radiusa van skale prebačeno na najbliži sankcionisani tier.

**U9 — Pokret i loading stanja.** Zatvoren horizontalni overflow na `/app/studio` (traka filtera →
skrol strip, lebdeći composer dok klampovan na viewport). Toast dobio stvarnu animaciju ulaska (stara
klasa je bila mrtva — biblioteka koju je referencirala nije ni instalirana). Mikro-interakcije, topla
rečenica uz procenat napretka, proslava štikliranog koraka. 115 ručnih `Loader2` poziva → `Spinner`
primitiv.

**U10 — Tipografska skala.** Definisana jedna skala od 14 uloga (`lib/type-scale.ts`, CSS ogledalo u
`app/globals.css`, testom uparen). Primenjena na 599 mesta u 64 fajla. Otkrio i popravio da je
`letter-spacing: 0` reset stajao NELAYEROVAN u CSS-u — isti tip greške koji `AGENTS.md` već
dokumentuje za radiuse.

**U11 — Vizuelni „wow" sloj.** Hero komandne table dobio školsku podlogu i rukopisan pozdrav. Šest
prozora komandne table dobili identitet zone (žuto/mastilo/papir po nameni, `lib/dashboard-zones.ts`).
Kartice kursa dobile uokvirenu naslovnu sliku i žutu traku napretka sa procentom u tekstu (a11y-svesno
rešenje — vidi Odluke). Player dobio hijerarhiju video→koraci→beleške i užu, centriranu kolonu za
čitanje.

**U12 — Doslednost preko zona.** Zatvorio razlike između zona koje su U10/U11 već sredili i onih koje
nisu: Zajednica (hero po istom obrascu kao dashboard, glasanje kao jedna kontrola), Admin (boja
statusa preokrenuta — objavljeno=žuto, nacrt=tiho — svesno poništava U6), Studio (skala + primitivi,
`PILL` konstanta obrisana), Poruke (ujednačen padding). 16 golih žutih `rgba(...)` senki svedeno na
`var(--yellow)`.

**U13 — Responsive prolaz + finalna verifikacija (ovaj korak).** Pregledao sve app ekrane koje su
U2–U12 dirali. Pronašao i popravio dva stvarna responsive defekta (`ReportDialog` bez `max-h`/skrola u
chat-u, traka „Razgovori/Uči zajedno" na Porukama uža od sadržaja na 320-375px). Sve ostalo (bottom
nav 4 slota, admin master-detail, studio filter traka, preostali modali) pregledano red-po-red i
zatečeno već ispravno iz prethodnih koraka. Pokrenuo punu petostruku verifikaciju — sve zeleno.

---

## Sve ODLUKE run-a, na jednom mestu

Grupisano po temi, ne po koraku — za detaljno obrazloženje svake, vidi odgovarajuću sekciju u
`docs/UX-BOOST-PROGRESS.md`.

### Vlasništvo kursa / pristup ("owned" vs "hasAccess")
- **U3:** Novo polje `owned` (aktivan upis ili staff rola) dodato UZ `hasAccess`, ne umesto njega.
  `hasAccess` namerno nije diran — auth pravila su van obima ovog run-a. Posledica: „Zaključano" je
  danas prikaz, ne zid (backend i dalje pušta svakog verifikovanog korisnika u svaki objavljeni kurs).
- **U4:** `/app` gejt (`hasUnlockedCourse`) prebačen na isti pojam kao U3. Ali `resume`/`nextLessons`
  agregat na `/app` i dalje bira iz SVIH objavljenih kurseva bez provere vlasništva — to je
  nedovršena polovina §1B iz plana, ostaje kao dug za budući korak (nije UX posao, nego novi upit).

### Fokus / modali
- **U2:** Modali sa kanonskim oklopom migrirani na `Dialog` primitiv; modali sa bitno drugačijim
  oklopom (`AppComposerSheet`, `ConversationDetailsDialog`, `NewConversationDialog`, `ReportDialog`,
  pun ekran u studiju) zadržali svoj oklop, ali dobili `useModalFocus`. Anchored popover-i (chat
  podešavanja, filter u studiju) namerno nisu tretirani kao modali.
- **U2:** Fokus prsten je `outline`, ne `ring` (Tailwind 4 gasi `outline-none` + `focus-visible:ring`
  kombinaciju na istom elementu). Recept: `focus-visible:outline-2 outline-offset-2 outline-ink`.

### Boje i radiusi
- **U8:** `#2e6f9f` → token `--blue-mid`; tri preostala hexa (studio bunar gradijent, paleta boje
  teksta koju korisnik BIRA, `content.ts` accent polje koje se nigde ne renderuje) namerno netaknuta —
  to su podaci/sadržaj, ne stilovi površine.
- **U8:** Off-scale radiusi mapirani po NAMENI elementa (ugnježdeno → 12px inset tier, samostalno →
  16px card tier), ne mehanički po najbližem broju.
- **U12:** Admin status boje preokrenute (objavljeno=žuto, nacrt=tiho uz `ink-hatch`) — svesno
  poništava U6 raniju odluku, jer je noviji zahtev eksplicitan i koherentniji sa ostatkom proizvoda
  (žuta = „ovo je živo").

### Napredak / a11y
- **U9/U7:** Traka napretka prvo prebačena na ink kontrast (žuta na papiru je 1,69:1, ispod WCAG
  1.4.11 praga 3:1 za grafičke objekte).
- **U11:** U11 je eksplicitno tražio žutu traku nazad — rešenje nosi OBA zahteva: ink okvir/ivica za
  kontrast + procenat kao broj u tekstu (grafika više nije jedini nosilac podatka, formalni izlaz iz
  1.4.11).

### Tipografija
- **U10:** `letter-spacing: 0` reset premešten u `@layer base` — bio je nelayerovan i tiho pobeđivao
  svaku skalu na `<button>`/`<Link>` elementima. Dokazano bez vizuelne promene pre-fix (0 pogodaka
  `tracking-*` direktno na tim elementima).
- **U10:** Marketing `SectionHeader` ostao piksel-isti (nova `variant="app"` grana, stara netaknuta).

### Van obima (namerno, dokumentovano, ne haknuto)
- Marketing stranice i njihova tri off-scale radiusa — run to izričito zabranjuje.
- Studio kao celina za U10/U11 (imao svoj zaseban run, `docs/STUDIO-PROGRESS.md`) — U12 ga je kasnije
  doveo na istu skalu.
- `studio-composer.tsx:1112` lint greška — pre-postojeća, izolovana, rizična za popravku bez fokusa.
- `/app/credits`, `/app/profile`, `/app/billing` i dalje nemaju `<h1>` — semantička promena, van
  „nula promena ponašanja" pravila za tipografske korake.

---

## Preostali dug (popis za sledeće korake, prioritet nije određen)

**Bezbednost/pristup (najvažnije, van obima ovog run-a):**
- „Zaključano" na kursu je danas prikaz, ne stvaran zid — svaki verifikovan korisnik može da otvori
  svaki objavljen kurs direktnim linkom (`convex/helpers.ts:347-350`). Zatvaranje ovoga je poseban
  zadatak koji dira auth pravila.
- `resume`/`nextLessons` agregat na `/app` bira iz svih objavljenih kurseva bez provere vlasništva —
  „Nastavi lekciju" može ponuditi zaključanu lekciju. Polje `owned` iz U3 je već tu za budući fix.

**Boje:**
- ~40 golih heksova ostaje u app obimu (najgušće `chat/study-hub.tsx` 14, `community-v2/*` 11,
  `app-sidebar.tsx` 7 uključujući `#10b981`/`#0ea472` „Nadogradnja" red) — svi imaju `dark:` override
  pa RADE u obe teme, ali ne reaguju na buduću promenu teme/brenda. Treba nove tokene za
  bledoplavu/bledozelenu/bledocrvenu paletu obaveštenja.

**Radiusi:**
- `rounded-[Npx]` bracket zapis (na sankcionisanim vrednostima) nikad nije masovno prebačen na
  `surface-card`/`surface-inset`/`surface-media` utility klase — vrednost je tačna, zapis nije
  kanonski. Namerno ostavljeno kao stilski, ne funkcionalni dug.

**Dugmad / vizuelna hijerarhija:**
- 21 fajl ima 2+ punih žutih (primarnih) dugmadi na istom ekranu — koje je „glavna" akcija je
  proizvodna odluka koju nijedan korak nije smeo da donese bez Jovana. Najgušće: `lesson-steps-editor`
  i `member-profile` (po 6).

**Tipografija:**
- 298 `text-sm` + 349 `text-xs` mesta bez eksplicitnog `leading-*` namerno ostavljena van skale
  (postavljanje `line-height` na kontrolu bi promenilo njenu visinu = promena rasporeda, ne izgleda).
- `px-*`/`py-*` parovi nisu na 4/6/8 lestvici, samo `p-*`.
- `/app/credits`, `/app/profile`, `/app/billing` bez `<h1>`.

**Ostalo:**
- Broj studenata u admin pregledu staje na „2000+" (Convex nema `count`; pravo rešenje je
  `@convex-dev/aggregate`, što traži izmenu šeme — namerno van obima).
- Nacrti LEKCIJA (ne samo smerova/kurseva) nisu u admin prozoru — `lessons.isPublished` nema indeks,
  pa bi to bila regresija cene čitanja, ne UX popravka.
- Dva `Loader2 size-3` u `project-picker.tsx` svesno ostavljena van `Spinner` primitiva (uz susedni
  `<Check className="size-3" />`, razmimoilaženje veličine bi bilo primetnije od izuzetka).

---

## Za Jovana ujutru — prioritetni redosled provere u pregledaču

Nijedan korak od U9 naovamo (U9, U10, U11, U12, U13) nije mogao da proveri promene u pravom
pregledaču sa prijavljenom sesijom (Playwright nema tvoju auth sesiju, a pravljenje test naloga bi
pisalo u dev Convex bazu). Sve je verifikovano kroz typecheck/lint/test/build i čitanje izgrađenog
CSS-a, ali doslovno nijedan piksel od U9 nadalje nije viđen uživo. Ovo je najvažnija stavka za jutro.

**1. `/sr/app` kao FREE korisnik (bez ijednog kupljenog kursa).**
   - Pozdravni hero „Tvoji prvi koraci" (rukopisan pozdrav, tri koraka, štikliranje) — ovo je najveći
     ponašajni fix run-a (U4): do sinoć si na ovom nalogu video SAMO first-run blok.
   - Svi prozori komandne table ispod heroja (ne prazan ekran).
   - Traka napretka na kartici kursa je žuta sa procentom u tekstu (U11 ODLUKA 1).
   - Obe teme, pa mobilni viewport (320-375px).

**2. `/sr/app` kao ADMIN.**
   - Dva nova admin prozora („Nacrti i spremnost", „Moderacija i novi članovi") — klik na nacrt mora
     da te odvede u Kontrolni centar sa već izabranim smerom/kursem.
   - Prozori se dižu na hover (U11 ODLUKA 2, svesno poništava U9).

**3. `/sr/app/classroom?view=courses`.**
   - Zaključane kartice kurseva sa cenom, „Otključaj" (Stripe checkout bez izlaska iz app-a — Stripe
     CLI je bio zabranjen celog run-a, pa je ovo JEDINO mesto koje run nikad nije mogao da testira do
     kraja), „Pogledaj uvod" (dijalog sa besplatnim video).
   - **Klikni „Otključaj" do kraja Stripe toka i proveri da kartica postane otključana posle plaćanja.**

**4. Checkout tok do Stripe stranice.** Jedini deo run-a koji nije proveren nijednom, nijednim
   korakom — verifikacija je bila van dozvoljenih alata cele noći.

**5. `/sr/app/admin/content` kao ADMIN.**
   - Pregled stanja (4 kartice sa brojevima), master-detail navigacija (smer→kurs→lekcija).
   - Suzi prozor ispod 1024px — mora se videti TAČNO jedan nivo + dugme „Nazad".
   - Boja statusa (U12): objavljeno=žuto, nacrt=tiho sa šrafurom, arhiva=obična pilula — poništava
     raniju U6 odluku, javi ako ti se ne dopada (jedan red u `lib/admin-content-tree.ts`).

**6. `ReportDialog` i „Novi razgovor" u Porukama, na uskom/niskom viewportu** (npr. DevTools 360×640
   ili iPhone SE preset) — jedine dve funkcionalne izmene U13. Dugme za slanje mora ostati dostižno.

**7. Obe teme na SVAKOM od gornjih ekrana**, i mobilni viewport (bottom nav mora imati TAČNO 4 slota
   — nedirano celog run-a, ali vredi jedan pogled pošto je toliko toga oko njega menjano).

**8. Studio na uskom desktopu (640/768/900/1024px), osoblje nalog.** U9 je popravio horizontalni
   overflow u kodu, U13 je ponovo pregledao kod i nije našao novi problem, ali NIKO nije video ovo
   uživo cele noći.

---

## Predlog sledećih koraka, po prioritetu

1. **Zatvori stvarni pristupni zid za kurseve** (`requireCourseAccess` proverava upis, ne samo
   status objave). Danas „Zaključano" ne zaustavlja nikoga sa direktnim linkom — ovo je jedini nalaz
   run-a koji je bezbednosne prirode, ne UX.
2. **Popravi `studio-composer.tsx:1112` lint grešku** u malom, izolovanom koraku sa fokusom na
   drag-and-drop tok u Studiju — osam koraka je odbilo da je dira jer je van obima; sad joj treba
   sopstveni.
3. **Filtriraj `resume`/`nextLessons` agregat po vlasništvu** na `/app` — polje `owned` već postoji
   (U3), ostaje samo da se upit u `convex/dashboard.ts` prepravi da ga koristi.
4. **Odluči vizuelnu hijerarhiju dugmadi** na 21 ekranu sa 2+ punih žutih dugmadi — proizvodna odluka
   koju nijedan korak nije smeo sam da donese.
5. **Tokenizuj preostalih ~40 golih heksova** (bledoplava/bledozelena/bledocrvena paleta obaveštenja)
   — rade danas, ali su tiha prepreka za buduću promenu teme.
6. **Vizuelna regresija u pravom pregledaču** za sve stavke iz sekcije iznad — posebno U9-U13, jer je
   pet uzastopnih koraka radilo bez ijednog pogleda na ekran.
