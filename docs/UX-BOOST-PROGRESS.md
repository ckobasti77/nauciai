# UX Boost - dnevnik implementacije

Svaki korak dopisuje svoju sekciju na kraj. Ne brisati ranije sekcije.

Run pokrenut: 2026-08-29_23-13

---

## U1 - Audit: verifikacija problema + UX-BOOST-PLAN.md   (2026-08-30 00:35)

**Fajlovi:**
- `docs/UX-BOOST-PLAN.md` (novo, jedini izmenjeni fajl)

**Šta je urađeno:**
Prošao sam svih 6 polaznih hipoteza kroz kod i napisao audit inventar sa tačnim
`fajl:linija` referencama za svaku tvrdnju. Četiri hipoteze su potvrđene (in-app
katalog kurseva ne postoji; admin Kontrolni centar; `#2e6f9f` x23; studio overflow),
a tri konkretne tvrdnje su se pokazale kao **netačne ili zastarele** i tako su i
upisane: (1) `DashboardFirstRun` na `/app` ne hvata korisnika bez pristupa - hvata
ga `/app/classroom`, dok `/app` ima suprotan bug (puna tabla sa 0% hero-om nad
zaključanim kursevima, jer `convex/dashboard.ts:108-116` broji sve objavljene
kurseve bez provere pristupa); (2) admin NIJE zarobljen u first-run bloku
(`classroom-hub.tsx:100` ima `isAdmin ||`); (3) `window.confirm` nije na
`dashboard-content.tsx:344` nego na 5 drugih mesta. Ponovo sam izmerio sve brojeve
iz `design-system-proposal.md` - hexovi su pali sa 154 na 124, `outline-none` je
porastao sa 57 na 63, a fokus trapova ima **četiri** (ne jedan), što menja prirodu
posla iz "napiši trap" u "objedini tri duplikata". Dokument se završava grafom
zavisnosti za U2-U10 sa 9 tvrdih ograničenja redosleda.

**ODLUKE:**
1. **Kad se hipoteza sudari sa kodom, pobeđuje kod.** Nisam prepisao polazne
   tvrdnje da bi se slagale sa brief-om; svaka neslaganja su eksplicitno označena
   ("NIJE POTVRĐENA", "PROPOSAL JE ZASTAREO") sa dokazom u kodu. Razlog: U2-U10
   ovaj dokument koriste kao izvor istine - tiho prepisana netačnost bi proizvela
   pogrešnu popravku.
2. **Brojanje `outline-none` bez `focus-visible` radio sam "u istom redu".**
   Klase su u ovom repou pisane u jednom stringu, pa je to tačno u ogromnoj većini
   slučajeva, ali nekoliko fajlova drži `focus-visible` u zasebnom `cn()` argumentu.
   Zato sam upisao "<=59, sigurno >50" umesto lažne preciznosti.
3. **Tri off-scale radiusa u marketing fajlovima ostavio sam van obima**
   (`marketing-page.tsx:110,256`, `marketing/account-menu.tsx:249`) - pravila run-a
   zabranjuju redizajn marketinga. U app delu ostaje 40 od 43.
4. **BrandMark linkove (logo -> marketing home) klasifikovao sam kao "ne dirati"**,
   iako tehnički jesu izlazak iz app-a. Menjanje ponašanja logotipa je IA odluka,
   nije traženo, i najkonzervativnije je ostaviti ga.
5. **Tačan brejkpoint studio overflow-a upisan je kao "NIJE POTVRĐENO"** - to je
   merenje u pregledaču, a U1 je samo čitanje koda. Našao sam mehanizam u kodu
   (traka filtera bez `flex-wrap`/`overflow-x-auto` sa svim `shrink-0` decom), ali
   nisam tvrdio piksele koje nisam izmerio.

**Testovi:** Nijedan nije napisan ni menjan - U1 je izričito samo čitanje koda i
pisanje jednog dokumenta. Postojeći suite je pokrenut samo kao provera baseline-a.

**Rezultat verifikacije:**
- `npm run typecheck` - **PROŠLO** (bez izlaza, exit 0)
- `npm run lint` - **NIJE PROŠLO** (exit 1) - vidi BLOKADA ispod
- `npm run test` - **PROŠLO** (77 fajlova, 1028 testova)

**BLOKADA:** Baseline `npm run lint` je crven i **pre** ovog koraka. Tačna poruka:

```
C:\Users\admin\Desktop\Web Dev Projects\nauciai\components\studio\studio-composer.tsx
  1112:18  error  `routeDroppedFiles` is a function created with React Hook
  "useEffectEvent", and can only be called from Effects and Effect Events in the
  same component  react-hooks/rules-of-hooks

✖ 178 problems (1 error, 177 warnings)
```

Greška je na `components/studio/studio-composer.tsx:1112` - `routeDroppedFiles`
(napravljen preko `useEffectEvent`) poziva se iz `onChange` handlera skrivenog
file input-a, a ne iz Effect-a. Nije je uveo ovaj korak: jedina moja izmena je novi,
nepraćeni `docs/UX-BOOST-PLAN.md` (`git status` -> `?? docs/UX-BOOST-PLAN.md`), a
`git diff HEAD --stat` ne prijavljuje nijedan izvorni fajl. **Nisam je popravio jer
U1 izričito zabranjuje menjanje bilo kog fajla osim tog dokumenta.**

Napomena o metodu: raniji pokušaj merenja baseline-a pokazao je lint kao zelen zato
što je komanda bila `npm run lint 2>&1 | tail -20` - u pipeline-u se vraća exit kod
poslednje komande (`tail`), pa je prava jedinica bila maskirana. Mereno ponovo bez
pipe-a: `npm run lint >/dev/null 2>&1; echo $?` -> `1`.

**Za Jovana ujutru:**
1. **Odluči šta sa lint blokadom pre U2.** Ovo je jedna pre-postojeća greška u
   `studio-composer.tsx:1112`. Dok stoji, nijedan sledeći korak ne može da ispuni
   "sve tri komande zelene". Dve opcije: (a) popraviti je zasebno pre U2, ili
   (b) svesno je prihvatiti kao poznati baseline i tražiti od U2+ da lint bude
   "bez NOVIH grešaka". Preporučujem (a) - jedna greška, lokalizovana.
2. **Proveri §1B u pregledaču.** Ako se slažeš sa nalazom, prijavi se nalogom bez
   ijednog otključanog kursa i otvori `/app`: očekivano je da vidiš punu komandu
   tablu sa 0% i "Nastavi lekciju" koje vodi u zaključanu lekciju - a ne first-run
   blok. Ovo je bitno jer je suprotno od onoga što je brief pretpostavljao i menja
   šta U6 treba da popravi.
3. **Proveri §5 na `/app/studio`** sa staff nalogom, na širinama 640/768/900/1024px -
   tu su dva dodatna čipa opsega koja obično prelome traku.
4. **Potvrdi ODLUKU 3 i 4** (marketing radiusi i BrandMark van obima) - ako se ne
   slažeš, to menja obim U7 i U9.

---

## U2 - Primitivi (Button/Spinner/Dialog/ConfirmDialog/Field/Badge/EmptyState) + migracija modala   (2026-08-30 01:20)

**Fajlovi:**

*Dodato:*
- `components/ui/button.tsx` (Button: primary/secondary/ghost/destructive, sm/md/lg, `loading`)
- `components/ui/spinner.tsx` (Spinner: xs/sm/md/lg, opcioni `label` -> `role="status"`)
- `components/ui/dialog.tsx` (`useModalFocus`, `Dialog`, `ConfirmDialog`)
- `components/ui/field.tsx` (`Field`, `Input`, `Textarea`, `Select`)
- `components/ui/badge.tsx` (Badge: neutral/yellow/ink/muted/danger, sm/md)
- `components/ui/empty-state.tsx` (EmptyState: ikona + naslov + telo + CTA)
- `lib/focus-trap.ts` + `lib/focus-trap.test.ts` (cista odluka Tab zamke + testovi)

*Obrisano:*
- `components/app/community-thread-dialog.tsx` (188 linija - treca kopija fokus zamke;
  njena dva izvoza su 1:1 zamenjena sa `Dialog` / `ConfirmDialog`)

*Izmenjeno:*
- `components/app/member-profile.tsx` (lokalni `useModalFocus` obrisan; 4 modala -> `Dialog`)
- `components/app/chat/chat-dialogs.tsx` (lokalni `useModalDialog` obrisan)
- `components/app/chat/chat-group-details.tsx` (pokazuje na zajednicku zamku)
- `components/app/community-comments.tsx`, `community-post-editor.tsx`,
  `community-thread-actions.tsx`, `community-thread-moderation.tsx` (-> `Dialog`/`ConfirmDialog`)
- `components/app/app-composer-sheet.tsx` (dobio kompletan fokus menadzment)
- `components/app/admin-inline-actions.tsx` (2 modala "Nesnimljene izmene" -> `Dialog`)
- `components/app/studio-media-detail.tsx` (potvrda brisanja -> `ConfirmDialog`; pun ekran dobio zamku)
- `components/app/course-player.tsx`, `lesson-steps-editor.tsx` (5 nativnih dijaloga -> `ConfirmDialog`/toast)
- `components/app/sign-in-panel.tsx` (svih 6 polja -> `Field`/`Input`)
- `components/app/profile-editor.tsx` (13 kontrola -> `Field`/`Input`/`Textarea`/`Select`; 3 dugmeta -> `Button`)

**Šta je urađeno:**
Napravljeno je sedam primitiva u `components/ui/` u duhu postojeceg `primitives.tsx`
(isti `cn`, ista logika "varijantu bira komponenta, ne `className`"). `useModalFocus` je
podignut iz `member-profile.tsx` i objedinjuje sve cetiri postojece zamke fokusa - broj
implementacija je pao sa **4 na 1**, a broj `fixed inset-0` preklopa sa 24 na 18.
Fokus menadzment je prvi put dobilo **osam modala** koji ga nisu imali: `AppComposerSheet`
(iza 5 admin composera), dva admin dijaloga "Nesnimljene izmene", potvrda brisanja i pun
ekran u studiju, plus dva "Pratioci/Pratim" dijaloga kojima je nedostajalo vracanje fokusa.
Svih pet nativnih `window.confirm`/`window.alert` poziva je zamenjeno: cetiri potvrde
brisanja idu kroz `ConfirmDialog`, a `window.alert` iz `lesson-steps-editor.tsx` kroz
postojeci toast (nije potvrda, nego upozorenje - blokirao je nit i nije radio u tamnoj temi).
Kao pilot, sign-in i profil su prebaceni na `Field`/`Input`: `outline-none` bez zamene je u
ta dva fajla pao sa **16 na 0**, greska polja vise nije samo boja (ikona + `aria-invalid` +
`aria-describedby`), a fokus prsten je ink outline sa razmakom.

**ODLUKE:**

1. **Fokus prsten je `outline`, a ne `ring` - i `outline-none` se vise nigde ne pise.**
   Zadatak je trazio `outline-none` + `focus-visible:ring-2 ring-offset-2`. Prekompajlirao
   sam Tailwind 4.3.2 sa `app/globals.css` i dobio:
   `.outline-none { --tw-outline-style: none }` a `.focus-visible\:outline-2 { outline-style: var(--tw-outline-style) }`.
   Znaci: **`outline-none` i `focus-visible:outline-*` na istom elementu gase jedan drugog** -
   to je zamka Tailwind-a 4 i verovatno objasnjava deo od 59 mesta iz §4C. Pocetna vrednost
   `--tw-outline-style` je `solid`, pa bez `outline-none` prsten radi sam od sebe.
   `ring` sam odbacio jer `--tw-ring-offset-color` nije registrovan u ovom buildu i podrazumeva
   belu - u tamnoj temi bi to bio beli oreol; `outline-offset` je providan i radi u obe teme.
   Recept je `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`
   (ink na papiru: >12:1 u obe teme). **Ovo je direktno bitno za U9.**

2. **Migrirao sam u `Dialog` samo modale ciji se okvir vec poklapa sa kanonskim; ostalima
   sam zamenio zamku, a okvir ostavio.** Zadatak trazi i "svih 20 modala -> Dialog" i
   "vizuelni paritet je uslov", a to se sudara: cet dijaloga ima bitno drugaciji oklop
   (fioka sa desne strane, pun ekran, donji sheet sa `font-display` naslovom u Patrick Hand-u).
   Prepakivanje bi im promenilo izgled. Zato: modali sa kanonskim oklopom idu na `Dialog`,
   a `AppComposerSheet`, `ConversationDetailsDialog`, `NewConversationDialog`, `ReportDialog`
   i pun ekran studija zadrzavaju svoj oklop i koriste `useModalFocus`. **Sav a11y dobitak je
   isporucen** (to je i bio smisao "19 defekata"), a duplikat zamke je ugasen. Dug je popisan dole.

3. **Anchored popover nije modal - nisam ih dirao.** `chat-inbox.tsx:141`,
   `chat-thread.tsx:767` i `studio-composer.tsx:1130` audit u §6B vodi kao "modale bez zamke",
   ali su u kodu `absolute right-0 top-12` popover-i uz svoje dugme (§4B ih i zove popover-ima),
   bez `aria-modal`, sa vec ispravnim ponasanjem: Escape, zatvaranje na klik izvan i vracanje
   fokusa na okidac (`chat-thread.tsx:375-393`). Portalovanje u `body` bi ih premestilo na
   sredinu ekrana - to bi bila promena izgleda, ne popravka.

4. **`useModalFocus` je podignut sa tri namerne izmene, sve tri iz drugih kopija.**
   (a) selektor broji i `input`/`select` - inace bi dijalozi sa formom ispali iz Tab prstena
   (tako je radila kopija u `chat-dialogs.tsx`); (b) `[data-dialog-initial-focus]` ima prednost
   pri prvom fokusu (kopija iz `community-thread-dialog.tsx`) - bez toga prvi fokus uvek uzme
   dugme za zatvaranje, pa bi npr. polje za razlog moderacije ostalo preskoceno;
   (c) **stek modala** - vidi ODLUKU 5. Doslovno prepisivanje bez (a) i (b) bilo bi nazadovanje
   na zivim ekranima, a ne objedinjavanje.

5. **Ugnjezdeni modali: samo najgornji hvata Escape i Tab, a skrol otkljucava tek poslednji.**
   Ovo je greska koju je original imao, ali se nije videla dok su modali bili sami. Cim potvrda
   stoji povrh panela (admin composer + "Nesnimljene izmene", detalji razgovora + prijava),
   dva slusaca na `document` se otimaju: Shift+Tab u gornjem modalu vratio bi fokus u donji.
   Gore od toga - `discardAndContinue` u admin composeru gasi **oba** u istom potezu, a svaki je
   vracao svoj zapamceni `overflow`; donji bi vratio `""`, pa bi gornji preko njega vratio
   `hidden` i **strana bi ostala trajno zakljucana**. Zato postoji stek (`openTraps`) i
   zakljucavanje po principu "prvi zakljucava, poslednji otkljucava".

6. **`Select` je dodat u `field.tsx` iako nije bio trazen.** Profil ima dve nativne padajuce
   liste sa istim `outline-none` defektom kao i polja; bez `Select`-a bi one ostale jedine
   nepokrivene kontrole u pilot fajlu, ili bi dobile jos jedan rucno ispisan recept.
   Dvanaest linija, deli isti `controlBase` sa `Input`-om.

7. **`Badge` je napravljen ali jos nije nigde upotrebljen.** Nocasnja lista migracija su modali,
   `window.confirm` i pilot polja - cipovi nisu u njoj, a nisam nasao mesto gde bi Badge legao
   bez promene izgleda (postojeci cipovi nemaju okvir, primitiv ga ima). U3 ga eksplicitno
   trazi (`Badge "Zaključano"`), pa je spreman za sutra.

8. **Tezina teksta u poljima ujednacena na `font-extrabold` (`text-base`).** Sign-in je imao
   `font-bold`, profil `font-extrabold`; nesto je moralo da se pomeri. Izabrao sam promenu
   debljine (700->800 na 6 polja u sign-in-u) umesto promene velicine slova, jer je promena
   velicine vidljivija. `Textarea` je ostao za stepen laksi (`font-bold`) - tako je i bio na
   svim pozivnim mestima, i duzi tekst se tako bolje cita. `compact` prop (`text-sm font-bold`)
   pokriva sporedna polja (linkovi profila), tako da je tamo paritet tacan.

9. **`primitives.tsx` vec izvozi svoj `Button` - nisam ga dirao.** To je marketinska varijanta
   (`tone`, tvrde senke, `transition-all duration-300`) i **nema nijednog uvoznika**
   (proveren ceo repo). AGENTS.md zabranjuje brisanje zateceno mrtvog koda, pa novi app Button
   zivi u `components/ui/button.tsx`. Uvoziti treba odatle.

10. **Preostale sitne razlike posle migracije na `Dialog`** (svesno prihvacene, sve u korist
    doslednosti): scrim 45%/55% -> 50%, `backdrop-blur` 3px -> 2px, telo `p-4` -> `px-5 py-5`,
    razdelnik zaglavlja `border-b border-line` -> `border-b-2 border-ink`, `max-h` 82dvh -> 92dvh,
    sirina "Novi razgovor" panela 560px -> 512px (taj je ostao na svom oklopu, pa se ne menja),
    i **dva admin dijaloga sada imaju X za zatvaranje** (ranije su se zatvarali samo dugmetom
    "Ostani"). Nijedna promena ne dira boje ni oblik van sankcionisane skale.

11. **`bg-paper-strong` -> `bg-paper` na textarea u `community-thread-moderation.tsx:338`.**
    Nije kozmetika nego popravka koju je izazvala moja migracija: stari oklop je bio `bg-paper`,
    novi je `bg-paper-strong`, pa bi u **tamnoj temi** polje (`#18293f`) nestalo na podlozi iste
    boje. Sa `bg-paper` (`#0e1a2b`) polje opet deluje udubljeno.

12. **Odbio sam da popravim pre-postojecu lint gresku u `studio-composer.tsx:1112`.**
    U1 ju je vec eskalirao Jovanu kao odluku, van je obima U2, a fajl je od 1513 linija sa
    drag-and-drop logikom. Umesto toga sam izmerio da U2 ne dodaje **nijedan** novi lint nalaz
    (vidi verifikaciju).

**Testovi:**
- **Novo: `lib/focus-trap.test.ts` (7 testova).** Pokrivaju odluku Tab zamke izdvojenu u
  `lib/focus-trap.ts`: prazan prsten (fokus na okvir modala), Tab sa poslednje kontrole -> prva,
  Shift+Tab sa prve -> poslednja, uvlacenje fokusa nazad kad je ispao iz modala, prsten od jedne
  kontrole (vrti se na sebe u oba smera) i "ne diraj fokus usred prstena". Poslednji test
  namerno fiksira i **asimetriju originala** (Tab unapred nema pravilo za fokus izvan modala),
  da se ponasanje ne "popravi" tiho pri sledecem refaktoru.
- Zasto samo toliko: `vitest.config.ts` radi u `edge-runtime` okruzenju, bez DOM-a, i repo nema
  ni `jsdom` ni testing-library. Sam hook (fokusiranje, `body` skrol, slusaci) se time ne moze
  proveriti, a dodavanje test infrastrukture usred noci menja `npm run test` za svaki sledeci
  korak - previse rizika. Zato je iz zamke izdvojena bas ona cista aritmetika koja tiho puca, i
  ona sad ima testove. Mapiranje varijanta -> klase nije testirano (zadatak to i kaze).

**Rezultat verifikacije:**
- `npm run typecheck` - **PROŠLO** (exit 0)
- `npm run test` - **PROŠLO** (78 fajlova, 1035 testova; baseline je bio 77 / 1028)
- `npm run build` - **PROŠLO** (exit 0, sve rute generisane) - dodatna provera, nije u obaveznoj trojci
- `npm run lint` - **exit 1, ali identicno baseline-u**: `178 problems (1 error, 177 warnings)`,
  brojka u znak za znak ista kao U1 baseline. Jedina greska je pre-postojeca (vidi BLOKADA).
  Poredio sam nalaze po fajlu pre i posle: od fajlova koje je U2 dirao, lista se pojavljuje samo
  `admin-inline-actions.tsx`, i to sa tri **pre-postojeca** upozorenja (`PlaybackTokenState`,
  `title`, `<img>`). **U2 ne dodaje nijedan novi lint nalaz**, a sve sirocice koje su moje izmene
  napravile (`createPortal`, `X`, `useEffect`, `useRef`) su uklonjene.

**BLOKADA:** Pre-postojeca, nasledjena iz U1, **nije je uveo ovaj korak**:

```
C:\Users\admin\Desktop\Web Dev Projects\nauciai\components\studio\studio-composer.tsx
  1112:18  error  `routeDroppedFiles` is a function created with React Hook
  "useEffectEvent", and can only be called from Effects and Effect Events in the
  same component  react-hooks/rules-of-hooks

✖ 178 problems (1 error, 177 warnings)
```

Dok ova greska stoji, nijedan korak ne moze da prijavi "lint zelen". Ponavljam preporuku iz U1:
popraviti je zasebno, jedna je i lokalizovana.

**Za Jovana ujutru:**

1. **Klikni kroz osam modala koji su prvi put dobili fokus** (tastaturom, pa Tab u krug, pa
   Escape, pa proveri da se fokus vratio na dugme sa koga si otvorio): admin composer kursa i
   ciklusa (i njihovo "Nesnimljene izmene"), potvrda brisanja u studiju, pun ekran medija u
   studiju, "Pratioci"/"Pratim" na profilu clana.
2. **Najvazniji test je ugnjezden slucaj:** otvori admin composer kursa, promeni nesto, klikni
   Zatvori (dobijes "Nesnimljene izmene") i pritisni **"Ponisti i nastavi"** - oba se gase u
   istom potezu. Proveri da **strana i dalje skroluje**. To je tacno mesto na kome bi stara
   logika zakljucala `body` (ODLUKA 5).
3. **Prijava i profil u obe teme.** Fokusiraj svako polje tastaturom - mora se videti ink okvir
   sa 2px razmaka. Na registraciji unesi zauzeto korisnicko ime: poruka mora imati **ikonu**, ne
   samo crvenu boju. Polja su za nijansu deblja nego juce na sign-in-u (ODLUKA 8) - reci ako ti
   se ne svidja, vraca se u jednoj liniji.
4. **Potvrdi ODLUKU 2 i 3** - to je jedina tacka na kojoj sam odstupio od doslovnog teksta
   zadatka ("svih 20 modala"). Ako hoces da i chat dijalozi i fioka predju na `Dialog` uz
   prihvatanje gubitka Patrick Hand naslova, to je zaseban mali korak.
5. **ODLUKA 1 menja plan za U9.** Ako U9 krene da dopisuje `focus-visible:ring-*` pored
   postojecih `outline-none`, dobice prsten koji se ne vidi. Ispravan potez je brisati
   `outline-none` i dopisati `focus-visible:outline-2 outline-offset-2 outline-ink`.

**Dug koji U2 nije zatvorio (popis za sledece korake):**
- `Button` ima **13 pozivnih mesta** (6 `admin-inline-actions.tsx`, 4 `member-profile.tsx`,
  3 `profile-editor.tsx`) plus dva u footeru `ConfirmDialog`-a. Ostatak od nekoliko stotina
  `<button>` tagova ceka. Dugmad koja **nisu** pilula (submit u `sign-in-panel.tsx` i Google
  dugme - `rounded-[8px]` sa tvrdom senkom) namerno nisu dirana: primitiv je pilula po konvenciji.
- `Badge`: 0 pozivnih mesta (ODLUKA 7).
- `EmptyState`: 1 pozivno mesto (dijalog zajednickog ucenja). §6A popisuje cetiri paralelna
  sistema praznih stanja - objedinjavanje je posao U4/U5/U10.
- `outline-none`: bilo **63** pojava (59 bez `focus-visible` zamene), sad **47** (43 bez zamene).
  Razlika je tacno 16 - sest u `sign-in-panel.tsx` i deset u `profile-editor.tsx`, oba fajla
  su sada na nuli. Ostatak je posao U9, po receptu iz ODLUKE 1.
  *(Mereno `rg -o 'outline-none' --glob '*.tsx'`; tri pogotka u `components/ui/field.tsx` su
  pomen u komentaru, ne kod, i nisu ubrojana.)*
- Tri anchored popover-a iz ODLUKE 3 nemaju Tab zamku (i po specifikaciji je i ne treba da imaju),
  ali `chat-inbox.tsx:141` i `chat-thread.tsx:767` imaju `role="dialog"` bez `aria-modal` -
  ispravnije bi bilo `role="menu"`/`role="group"`. Sitno, van obima nocasnjeg koraka.
- `components/app/app-sidebar.tsx:1426-1455` zakljucava `body` skrol svojom logikom, nezavisno
  od steka modala. Ako se ikad otvori modal iz mobilne fioke, vazi isti rizik iz ODLUKE 5.
- Off-scale radiusi koje sam usput video u dirnutim fajlovima (`community-comments.tsx:234`
  `rounded-[10px]`, `chat-group-details.tsx:201`) - nisu dirani, U9 ih ionako ima na spisku.

---

## U3 - In-app katalog kurseva u Učionici (zaključane kartice + checkout bez izlaska iz app-a)   (2026-08-30 01:50)

**Fajlovi:**

*Dodato:*
- `lib/course-catalog.ts` (čista logika kataloga: vlasništvo, filter, grupisanje po smeru, srpska množina, trajanje, cena)
- `lib/course-catalog.test.ts` (40 testova)
- `components/app/course-catalog-card.tsx` (`CourseCatalogCard` — prodajna kartica zaključanog kursa + dijalog sa uvodnim videom; `CourseCatalogRow` — kompaktan red za zonu „Smerovi")
- `convex/courseCatalog.test.ts` (7 testova nad `courses.getAppNavigation`)

*Izmenjeno:*
- `convex/courses.ts` — `getAppNavigation` vraća novo polje `owned` po kursu; čitanje `enrollments` pomereno iznad mape kurseva (isti jedan upit hrani i `plan` i `owned`, nula dodatnih čitanja)
- `components/app/dashboard-live.tsx` — `owned` u tipu payload-a i u mapiranju u `DashboardCourse`
- `components/app/dashboard-content.tsx` — `DashboardCourse.owned?`; CTA first-run bloka više ne vodi na marketing
- `components/app/classroom-hub.tsx` — zone 1–3 prerađene (vidi ispod)
- `components/app/app-sidebar.tsx` — 4 „Unapredi" CTA-a vode u katalog umesto na `/{locale}#pricing`
- `lib/app-routes.ts` — novi builder `courseCatalogPath(locale)`

**Šta je urađeno:**
Student koji nema nijedan kurs do sinoć je u Učionici video samo first-run blok, a jedino
dugme na njemu ga je izbacivalo iz aplikacije na marketing `#pricing` (§1A i §2B iz
`UX-BOOST-PLAN.md`). Sada `classroom-hub.tsx` više ne prekida render: first-run blok je
postao zona 1, a ispod njega stoji pravi katalog **svih objavljenih kurseva**. Kurs koji
student ima renderuje postojeća `DashboardCourseCard` sa napretkom; kurs koji nema dobija
novu karticu — naslovna slika, značka „Zaključano", cena u žutom pill-u (isti oblik i ista
cena kao na marketing stranici), naslov, „Šta se uči" sa do tri naslova lekcije, broj lekcija
i ukupno trajanje, pa `CheckoutButton` „Otključaj" koji pokreće postojeći
`/api/stripe/checkout` **bez napuštanja aplikacije** i sekundarno „Pogledaj uvod" koje otvara
`Dialog` primitiv iz U2 sa besplatnim uvodnim videom. Zona „Smerovi" je od zbirnih pločica
postala spisak smerova sa kursevima u njima. Svih pet app→marketing `#pricing` linkova iz
inventara (§2B, stavke 1–5) sada gađa `courseCatalogPath(locale)`; u `components/app/` više
nema nijednog `#pricing` linka. Prazan katalog (nijedan objavljen kurs) renderuje `EmptyState`
primitiv iz U2 — to je i njegovo drugo pozivno mesto.

**ODLUKE:**

1. **„Ima kurs" = aktivan upis (`enrollments.status === "active"`) ili staff rola; `hasAccess`
   NISAM dirao.** Ovo je najvažnija odluka koraka. `convex/courses.ts:285` računa
   `hasAccess: isAdmin || course.status === "published"` — dakle za njega **svaki objavljen
   kurs pripada svakome**, pa na pitanje „koji kurs student nema" ne ume da odgovori. Pravila
   run-a zabranjuju menjanje pravila pristupa, pa sam dodao **odvojeno** polje `owned`, uz
   komentar u kodu da je ono prikaz, a ne autorizacija. Isti pojam „staff" kao
   `lib/lesson-access.ts` (admin / moderator / pro_student). Test
   `convex/courseCatalog.test.ts` eksplicitno tvrdi da `hasAccess` ostaje `true` za kurs koji
   nije kupljen — da se to ne promeni tiho. **Posledica koju Jovan mora da zna: backend to
   vlasništvo ne sprovodi** (`convex/helpers.ts:347-350` pušta svakog verifikovanog korisnika
   u svaki objavljen kurs), pa je „Zaključano" trenutno stanje kupovine, a ne zid. Zatvaranje
   te rupe je njegova odluka, van je obima ovog koraka.
2. **First-run blok nije obrisan nego spušten u zonu 1.** Zadatak kaže „umesto first-run bloka
   renderuj katalog". Doslovno brisanje bi početniku uklonilo jedini tekst koji odgovara na
   „šta sad da uradim". Zato je uklonjen samo `return` koji je gutao celu stranicu (stari
   `classroom-hub.tsx:138`): blok se i dalje vidi kad student nema nijedan kurs, ali katalog
   stoji odmah ispod njega, a njegovo dugme „Pogledaj kurseve" sada skroluje do tog kataloga
   umesto da vodi na marketing.
3. **Zona „Smerovi" pokazuje spisak, ne drugu mrežu istih kartica.** Zadatak traži „isto,
   grupisano po smerovima", ali doslovno isto značilo bi da se ista kartica kursa pojavi
   dvaput na jednom ekranu — početnik to čita kao „imam ovo dva puta". Zato smer dobija
   zaglavlje (naziv, broj kurseva, koliko je otključano, „Otvori smer") i spisak kompaktnih
   redova sa naslovnom sličicom, dužinom i značkom stanja, a prodajna kartica sa cenom i
   dugmetom ostaje samo u zoni „Kursevi". Ako Jovan hoće identične kartice u obe zone, to je
   izmena u `TrackSection` od nekoliko linija.
4. **„Nastavi", „Sledeće lekcije" i napredak smera sada čitaju `owned`, a ne `hasAccess`.**
   Bez toga bi hero na istom ekranu nudio „Nastavi lekciju" u kursu koji kartica dvadeset
   piksela niže zove zaključanim. Ovo je ista greška koju §1B prijavljuje za `/app` —
   ispravljena je ovde, u Učionici; `/app` (`dashboard-content.tsx:1252`) je i dalje otvoren
   i ostaje posao U6.
5. **Filter čipovi ostaju ista četiri; promenjeno je samo šta „Zaključani" znači** (ranije
   „nije objavljen", sada „student nema kurs"). „U toku" i „Završeni" sada traže vlasništvo —
   napredak na kursu koji student nije otključao nije „u toku". Nisam dodavao peti čip.
6. **Cena se čita iz `lib/content.ts` (`priceLabel`) po slug-u** — to je izvor koji marketing
   stranica ispisuje (`marketing-page.tsx:173`) i koji `lib/app-navigation.ts:259` već spaja na
   isti način. Kurs koji postoji samo u Convexu nema cenu u tom fajlu; tada kartica **ne
   ispisuje cenu** umesto da izmisli broj ili napiše „Uskoro" pored dugmeta „Otključaj".
   Dugme ostaje — `/api/stripe/checkout` ima svoj fallback na `stripePriceEnv`, a grešku
   servera `CheckoutButton` već prikazuje ispod dugmeta.
7. **Dodao sam srpsku množinu (`serbianPlural`) iako nije traženo.** Postojeći kod piše
   `{count} kursa` bez pravila, pa bi nova kartica pisala „2 lekcija" i „2 kursa" — na
   prodajnom ekranu to izgleda kao greška, a publika su početnici. Osam linija čiste logike sa
   13 test slučajeva; koristi se samo u fajlovima koje ovaj korak ionako piše.
8. **„Detalji" link ostaje i na zaključanoj kartici i na redu smera.** Postojeća
   `DashboardCourseCard` ga već prikazuje i za kurs bez pristupa („U pripremi"), pa bi
   uklanjanje bilo menjanje zatečenog ponašanja, a red smera bez odredišta je slepa ulica.
   Napomena uz ODLUKU 1 važi: ta strana danas pušta svakoga.
9. **Nisam pravio novi Convex query.** `getAppNavigation` već čita `enrollments` (za `plan`),
   pa je čitanje samo pomereno iznad mape kurseva i iz njega se računa i `owned` — nula
   dodatnih čitanja iz baze i nijedan novi round-trip. Test „still derives plan from
   enrollments after the read moved up" čuva da to premeštanje nije ništa pokvarilo.
10. **`prefers-reduced-motion` na novoj kartici.** `CourseCatalogCard` gasi `layout`,
    `whileHover` i `whileTap` kad korisnik traži manje pokreta. **Postojeća
    `DashboardCourseCard` to ne radi** i nisam je dirao — pravila zabranjuju popravke susednog
    koda; upisujem kao dug.
11. **Nema vizuelne provere u pregledaču.** Podigao sam dev server i otvorio
    `/sr/app/classroom?view=courses`: ruta ispravno preusmerava na
    `/sr/sign-in?next=...%3Fview%3Dcourses` (deep link preživljava prijavu), ali Playwright
    sesija nije prijavljena, a pravljenje naloga bi pisalo u dev Convex bazu. Zato je
    verifikacija ovog koraka: typecheck / lint / test / `npm run build`, a vizuelnu proveru
    ostavljam Jovanu (vidi ispod).

**Testovi:**
- **Novo: `lib/course-catalog.test.ts` (40 testova).** `isCourseOwned` (uključujući test da
  `hasAccess` ne sme da pregazi eksplicitno `owned: false` — to je cela poenta polja — i
  fallback za statičku granu bez Convexa); `matchesCatalogFilter` za sva četiri čipa, sa
  posebnim testom da se neotključan kurs nikad ne prijavi kao „U toku"/„Završen";
  `groupByTrack` (redosled, ispadanje kurseva bez smera i sa nepoznatim smerom, `slug` koji
  fali); `serbianPlural` (13 slučajeva, uključujući 11/12/14/21/22/101/111);
  `formatLessonCount` / `formatCourseCount` u oba jezika; `formatCourseDuration`
  (min / h / h+min, zaokruživanje ispod minuta, `null` umesto „0 min");
  `totalDurationSeconds` (nepublikovane i besmislene vrednosti); `courseLengthLabel`;
  `catalogPriceLabel` (poklapanje sa `lib/content.ts` i `null` za nepoznat kurs).
- **Novo: `convex/courseCatalog.test.ts` (7 testova).** Nad pravim `getAppNavigation`
  (convex-test, obrazac iz `dashboard.test.ts` / `contentHierarchy.test.ts`): samo upisan kurs
  je `owned`; `hasAccess` ostaje `true` za neupisan kurs (test-čuvar pravila pristupa);
  `blocked` upis se ne broji; admin / moderator / pro_student imaju sve bez upisa; `plan` i
  dalje ide iz upisa posle premeštanja čitanja.
- Nijedan postojeći test nije menjan ni obrisan.

**Rezultat verifikacije:**
- `npm run typecheck` — **PROŠLO** (exit 0)
- `npm run test` — **PROŠLO** (80 fajlova, 1082 testa; baseline posle U2 je bio 78 / 1035)
- `npm run build` — **PROŠLO** (exit 0) — dodatna provera, nije u obaveznoj trojci
- `npx convex codegen` — **PROŠLO** (exit 0, bez izmena u `convex/_generated/`)
- `npm run lint` — **exit 1, identično baseline-u**: `178 problems (1 error, 177 warnings)`,
  broj u znak za znak isti kao U1 i U2. Uporedio sam nalaze pre i posle: jedina razlika su dva
  **pre-postojeća** upozorenja u `dashboard-content.tsx` koja su se pomerila sa linija 302/304
  na 309/311, jer je iznad njih dodat komentar uz novo polje. **Nijedan od četiri nova fajla
  se ne pojavljuje u lint izlazu.**

**BLOKADA:** Pre-postojeća, nasleđena iz U1 i U2, **nije je uveo ovaj korak**:

```
C:\Users\admin\Desktop\Web Dev Projects\nauciai\components\studio\studio-composer.tsx
  1112:18  error  `routeDroppedFiles` is a function created with React Hook
  "useEffectEvent", and can only be called from Effects and Effect Events in the
  same component  react-hooks/rules-of-hooks

✖ 178 problems (1 error, 177 warnings)
```

Dok ova greška stoji, nijedan korak ne može da prijavi „lint zelen". Treći put ponavljam
preporuku iz U1: popraviti je zasebno, jedna je i lokalizovana.

**Za Jovana ujutru:**

1. **Prijavi se nalogom koji NIJE admin/moderator, inače nećeš videti nijednu zaključanu
   karticu.** Staff ima sve kurseve (ODLUKA 1), pa Učionica za tebe izgleda skoro isto kao
   juče. Najbrže: napravi test nalog bez kupovine, ili u Convex dashboard-u privremeno
   prebaci `users.role` tog naloga na `student` (pazi: `INITIAL_ADMIN_EMAILS` vraća u admina
   po emailu, bez obzira na `role`).
2. **Najvažnija odluka za tebe: da li „Zaključano" sme da bude samo prikaz.** Danas svaki
   prijavljen i verifikovan korisnik može da otvori svaki objavljen kurs
   (`convex/helpers.ts:347-350`), pa kartica piše „Zaključano · 9,99 EUR", a klik na „Detalji"
   ili direktan link do lekcije i dalje pušta unutra. Ja to nisam smeo da menjam (pravila
   run-a: bez diranja auth i bezbednosnih pravila). Ako hoćeš da lokot bude stvaran, to je
   poseban korak: provera upisa u `requireCourseAccess`.
3. **Klikni „Otključaj" na zaključanoj kartici** i proveri da te vodi na Stripe Checkout bez
   izlaska iz aplikacije, i da posle plaćanja kartica postane otključana (webhook piše
   `enrollments`, a `owned` se računa iz njih). Ovo je jedini deo koraka koji nisam mogao da
   proverim — Stripe CLI je zabranjen u ovom run-u.
4. **Proveri „Pogledaj uvod"** na kursu koji ima uvodni video: dijalog, Escape, Tab u krug,
   vraćanje fokusa na dugme (to je `Dialog` primitiv iz U2), i da se video **ne** učitava dok
   je dijalog zatvoren.
5. **Obe teme i telefon.** Katalog na 320px: kartice u jednu kolonu, značka i cena preko
   naslovne slike, redovi smera se prelamaju u dva reda. Tamna tema: cena je žuti pill sa ink
   okvirom, značka „Zaključano" je ink na papiru.
6. **Potvrdi ODLUKU 3** (Smerovi kao spisak umesto druge mreže kartica) — to je jedina tačka
   na kojoj sam odstupio od doslovnog teksta zadatka, i vraća se u jednoj izmeni ako ti se ne
   sviđa.
7. **Sidebar „Unapredi" sada vodi u katalog**, ne na marketing cenovnik. Ako je namera bila da
   „Unapredi" znači „Premium plan", a ne „kupi kurs", reci — to je druga destinacija.

**Dug koji U3 nije zatvorio:**
- `DashboardCourseCard` ima `layout` / `whileHover` / `whileTap` bez provere
  `prefers-reduced-motion`; nova kartica to poštuje, stara ne. Dve linije, ali je susedni kod.
- `dashboard-content.tsx:1252` (`hasCourses` broji sve objavljene lekcije bez provere
  vlasništva) i `ResumeHero` na `/app` i dalje mogu da ponude lekciju iz kursa koji student
  nema — §1B iz plana, posao U6. Polje `owned` je sada tu i za to.
- `lib/sidebar-contexts.ts:240` i dalje sklapa `?view=` string ručno; namerno ga nisam
  prebacio na `courseCatalogPath` (gradi sve tri stavke, ne samo katalog).
- `components/app/app-sidebar.tsx:2034` i `:1798` i dalje nose gole hexove `#10b981` /
  `#0ea472` (§2B, stavka 5). Promenio sam samo `href`, boje ostaju za U9.

---

## U4 - Komandna tabla se više ne gasi: pozdravni hero + prozori koji uvek rade   (2026-08-30 02:10)

**Fajlovi:**

*Dodato:*
- `lib/dashboard-first-run.ts` (čista logika: checklist prvih koraka + odluka koji hero ide u zonu A)
- `lib/dashboard-first-run.test.ts` (18 testova)

*Izmenjeno:*
- `convex/dashboard.ts` — nov `firstRunSlice` (`hasUnlockedCourse`, `hasCommunityPost`); `adminSlice` proširen sa `drafts` (nacrti smerova i kurseva + id-jevi za deep link) i `recentUsers`
- `convex/dashboard.test.ts` — 9 novih testova + `firstRun` u postojećem „prazan korisnik" testu
- `components/app/dashboard-content.tsx` — `DashboardFirstRun` prerađen u kompaktan pozdravni hero sa štikliranim koracima; `DashboardHome` više ne prekida render; `CommandTableView.hasCourses` → `hasUnlockedCourse`
- `components/app/dashboard-windows.tsx` — `DashboardWindow` prazno stanje ide kroz `EmptyState` primitiv; `DashboardWindowsGrid` prima `hasUnlockedCourse`; jedan admin prozor razdvojen u dva
- `components/app/classroom-hub.tsx` — hub bez kurseva prosleđuje iste signale novom herou

**Šta je urađeno:**
`DashboardFirstRun` je prestao da bude zamena za ekran. Na `/app` je stajao `return
<DashboardFirstRun/>` iznad svega (`dashboard-content.tsx:1261`), a u Učionici isto tako
(`classroom-hub.tsx:139`) — pa korisnik bez otključanog kursa nikad nije video nijedan
prozor komandne table. Sada je to kompaktan pozdravni hero na vrhu: pozdrav, tri prva
koraka i jedno dugme ka in-app katalogu iz U3. Koraci se štikliraju iz stvarnih podataka —
„Izaberi kurs" iz aktivnog upisa (ili staff role), „Odgledaj lekciju" iz
`progress.completedLessons`, „Pitaj u zajednici" iz postojanja sopstvene objave — a prvi
neurađeni korak je uokviren ink okvirom, tako da ekran odgovara na „šta sad da uradim".
`DashboardWindowsGrid` se od sada renderuje UVEK, a svaka prazna zona dobija `EmptyState`
primitiv iz U2 sa sledećim korakom umesto jedne sive rečenice; „Učionica" prozor bez kursa
vodi u katalog, a ne u praznu učionicu. Admin je dobio dva prozora umesto jednog: „Nacrti i
spremnost" (nacrti smerova i kurseva sa deep linkom u Kontrolni centar + blokeri pre objave)
i „Moderacija i novi članovi" (objave na čekanju + poslednja tri registrovana člana sa
linkom na profil).

**ODLUKE:**

1. **Gejt `hasCourses` na `/app` je zamenjen — to je bio uslov da korak uopšte radi.**
   `UX-BOOST-PLAN §1B` merenje: `hasCourses: overview.progress.totalLessons > 0 || resume != null`,
   a `totalLessons` (`convex/dashboard.ts:108-116`) zbraja lekcije **svih** objavljenih
   kurseva bez provere pristupa — dakle `true` za svakog ulogovanog korisnika. Zadatak traži
   da hero bira između pozdravnog i `ResumeHero`-a, što je nemoguće dok gejt ne razlikuje
   vlasništvo. Zato `CommandTableView.hasUnlockedCourse` sada čita novo polje
   `overview.firstRun.hasUnlockedCourse` (aktivan upis ili staff — **isti pojam** kao `owned`
   iz U3, `convex/courses.ts:196`). **Ono što NISAM dirao:** `studentCoursesSlice` i dalje
   bira `resume` i `nextLessons` iz svih objavljenih kurseva, pa student koji je otključao
   jedan kurs može u „Nastavi lekciju" dobiti lekciju iz drugog, zaključanog. To je druga
   polovina §1B i ostaje posao U6 — filtriranje agregata po vlasništvu menja i cenu upita i
   redosled kurseva, što je preveliko da se prošvercuje kroz UX korak.
2. **Novo polje ide u POSTOJEĆI agregat, nije napravljen novi query.** Pravilo koraka je
   „novi agregat pravi U6". `getDashboardOverview` je jedini izvor komandne table, pa su dva
   nedostajuća signala dodata u njega: jedan indeksiran `take(200)` nad `enrollments.by_user`
   i jedan `take(1)` nad `communityPosts.by_author`. Nijedan novi round-trip sa klijenta.
3. **`hasCommunityPost` je opciono polje, a `undefined` znači „ne znam", ne „nije urađeno".**
   Učionica se hrani iz `getAppNavigation`, koji taj podatak nema, i nisam hteo da zbog jednog
   čekboksa otvaram drugi upit na toj strani. Zato je u čistoj logici napisano `=== true` i to
   ima svoj test — da neko sutra ne „pojednostavi" izraz u `Boolean(...)` i tiho pretvori
   nedostatak podatka u tvrdnju.
4. **Nacrti LEKCIJA nisu u admin prozoru.** Prikazani su nacrti smerova i kurseva, jer oba
   imaju status indeks (`courseTracks.by_status_and_sortOrder`, `courses.by_status`) pa je
   cena konstantna. `lessons.isPublished` **nema indeks**, pa bi „koliko lekcija čeka objavu"
   značilo čitanje lekcija svakog kursa na svakom učitavanju `/app` — to je regresija cene, ne
   UX popravka. Ako Jovan hoće i lekcije, tu treba ili indeks ili denormalizovan brojač; po
   pravilu koraka to je posao U6.
5. **Jedan admin prozor je postao dva.** Zadatak traži tri grupe podataka (nacrti, novi
   korisnici, moderacija), a `DashboardWindow` prikazuje najviše tri reda ukupno — sve tri
   grupe u jednom prozoru značile bi po jedan red na grupu, tj. tri brojača bez ijednog imena.
   Podela je po nameni: sadržaj (nacrti + blokeri) i ljudi (moderacija + novi članovi). Grid
   za admina sada ima 8 prozora umesto 7.
6. **Prazno stanje u prozoru NEMA svoje dugme.** `EmptyState` primitiv prima `action`, ali
   svaki prozor već ima tačno jedno dugme u podnožju. Dva dugmeta u kartici od 260px su šum,
   pa je umesto toga **dugme u podnožju postalo kontekstualno**: „Učionica" prozor bez
   otključanog kursa piše „Pogledaj kurseve" i vodi u katalog, inače „Otvori učionicu".
7. **Pozdravni hero ima samo jedno dugme.** Stari blok je imao i „Otvori zajednicu"; to je
   izbačeno jer isti link sada stoji u prozoru „Zajednica" dvadeset piksela niže, a hero je
   morao da se skrati (više ne drži ekran sam, nego stoji iznad cele table). Naslov je iz
   „Spremni smo kad i ti" prešao u „Tvoji prvi koraci", a podnaslov se menja sa brojem
   urađenih koraka — stari tekst je tvrdio „Još nemaš nijedan otključan kurs", što posle ovog
   koraka nije uvek tačno (hero vidi i admin na praznoj bazi).
8. **`EmptyState` je ostavljen na 16px radiusu iako sada stoji ugnježden u kartici.**
   Konvencija bi tražila inset (12px), ali primitiv oblik autorizuje sam, `cn` je obično
   spajanje (ne tailwind-merge) pa ga poziv ne može pouzdano nadjačati, a oba postojeća
   pozivna mesta iz U2/U3 su takođe ugnježdena — menjanje primitiva bi pomerilo i njih.
   Upisujem kao sitan dug, ne kao hak.
9. **`shouldShowResumeHero` traži i da postoji ijedna lekcija.** Bez toga bi administrator na
   praznoj bazi (kome je svaki kurs „otključan") dobio `ResumeHero` sa tekstom „Sve lekcije su
   završene" — netačno. Sa ovim uslovom dobija pozdravni hero i pune admin prozore.
10. **Spojeni i anonimizovani nalozi ispadaju iz „novih članova".** `mergedInto` /
    `anonymizedAt` / `isAnonymous` nisu novi član nego trag migracije; čita se `take(12)` pa
    se filtrira na tri.

**Testovi:**
- **Novo: `lib/dashboard-first-run.test.ts` (18 testova).** `buildFirstRunChecklist`: fiksan
  redosled koraka, nov korisnik (0/3), štikliranje svakog od tri koraka posebno, nula i
  **negativan** broj lekcija, `undefined` za zajednicu koje NE sme da se čita kao „urađeno",
  preskočen korak (lekcija odgledana bez kupljenog kursa — moguće po §1B), stanje „sve
  urađeno" bez „sledećeg", i iscrpna provera da je „sledeći" uvek tačno jedan korak preko svih
  8 kombinacija signala. `firstRunDoneCount` (0/1/3). `shouldShowResumeHero`: bez kursa nikad,
  sa `resume`-om da, bez `resume`-a ali sa lekcijama da, i **admin na praznoj bazi ne** (to je
  ODLUKA 9).
- **Novo u `convex/dashboard.test.ts` (9 testova).** `firstRun`: aktivan upis štiklira kurs;
  **blokiran upis ne**; staff (`pro_student`) ima otključan kurs bez upisa; sopstvena objava
  štiklira zajednicu; **tuđa objava ne**. `admin`: nacrt smera i nacrt kursa stižu sa
  `trackId`/`courseId` za deep link i sa oba jezika naslova; objavljen sadržaj ne ulazi u
  nacrte; poslednji registrovani su najviše tri, u obrnutom redosledu upisa i **bez spojenih
  naloga**; ne-admin i dalje dobija `admin: null`. Postojeći test „prazan korisnik" dopunjen
  je tvrdnjom o `firstRun`.
- Nijedan postojeći test nije menjan ni obrisan.

**Rezultat verifikacije:**
- `npx convex codegen` — **PROŠLO** (exit 0)
- `npm run typecheck` — **PROŠLO** (exit 0)
- `npm run test` — **PROŠLO** (81 fajl, 1107 testova; baseline posle U3 je bio 80 / 1082)
- `npm run build` — **PROŠLO** (exit 0) — dodatna provera, nije u obaveznoj trojci
- `npm run lint` — **exit 1, identično baseline-u**: `178 problems (1 error, 177 warnings)`,
  isti broj kao U1, U2 i U3. Od fajlova koje je U4 dirao u izlazu se pojavljuje samo
  `dashboard-content.tsx`, sa **dva pre-postojeća** upozorenja (`PlaybackTokenPayload`,
  `title`) koja su se pomerila sa linija 309/311 na 317/319 jer je iznad njih dodat import.
  Nijedan od dva nova fajla se u lint izlazu ne pojavljuje.

**BLOKADA:** Pre-postojeća, nasleđena iz U1/U2/U3, **nije je uveo ovaj korak**:

```
C:\Users\admin\Desktop\Web Dev Projects\nauciai\components\studio\studio-composer.tsx
  1112:18  error  `routeDroppedFiles` is a function created with React Hook
  "useEffectEvent", and can only be called from Effects and Effect Events in the
  same component  react-hooks/rules-of-hooks

✖ 178 problems (1 error, 177 warnings)
```

Četvrti put ista preporuka: popraviti je zasebno, jedna je i lokalizovana.

**Za Jovana ujutru:**

1. **Prijavi se nalogom BEZ ijednog kupljenog kursa i otvori `/app`.** Očekivano: pozdravni
   hero „Tvoji prvi koraci" (prvi korak uokviren ink okvirom), pa PULS pločice, pa **svi**
   prozori — poruke, zajednica, obaveštenja, Studio, uči zajedno. Do sinoć si na tom nalogu
   video samo first-run blok. Ovo je glavna provera koraka.
2. **Proveri da `ResumeHero` NE iskače nad zaključanim kursom** — ali znaj da je popravljena
   samo polovina: hero se sada pojavljuje tek kad zaista imaš kurs, ali koju lekciju nudi i
   dalje bira agregat preko svih objavljenih kurseva (ODLUKA 1). Ako imaš kupljen kurs A i
   nekupljen B, moguće je da „Nastavi lekciju" pokaže lekciju iz B. To je U6.
3. **Admin nalog na `/app`:** dva nova prozora. Klikni jedan nacrt — mora te odvesti u
   Kontrolni centar sa **već izabranim** smerom i kursem u padajućim listama (`?track=&course=`).
   Ako ne izabere, javi: znači da `admin-content-manager.tsx` čita parametre drugačije nego
   što sam pročitao na `:271-273`.
4. **Odluči o ODLUCI 4** — da li ti u admin prozoru trebaju i lekcije u nacrtu. Ako da, treba
   indeks ili brojač na `lessons`; nisam hteo da skeniram lekcije svih kurseva na svakom
   učitavanju table.
5. **Obe teme i telefon (320px).** Hero: tri koraka se slažu u kolonu, dugme je preko cele
   širine. Prozori: prazno stanje je isprekidana kutija sa žutim krugom — proveri da u tamnoj
   temi žuti krug nije preglasan u šest kartica odjednom. Ako jeste, promena je u jednom
   primitivu (`components/ui/empty-state.tsx`).
6. **Potvrdi ODLUKU 5 i 7** (dva admin prozora umesto jednog; hero bez drugog dugmeta) —
   jedine dve tačke na kojima sam odstupio od doslovnog teksta zadatka.

**Dug koji U4 nije zatvorio:**
- `studentCoursesSlice` (`convex/dashboard.ts`) i dalje računa `resume`, `nextLessons`,
  `totalLessons` i `percent` preko svih objavljenih kurseva, bez provere vlasništva — druga
  polovina §1B, posao U6. Polje `firstRun.hasUnlockedCourse` je sada tu i za to.
- Nacrti lekcija u admin prozoru (ODLUKA 4).
- `EmptyState` je 16px unutar kartice umesto 12px (ODLUKA 8); važi za sva tri pozivna mesta.
- Zona D („Ritam") bez podataka i dalje ispisuje jednu rečenicu umesto `EmptyState`-a —
  namerno, van je grida koji je zadatak imenovao.

---

## U5 - Copy pass: srpski bez žargona, prazna stanja kroz primitiv, uvodni paneli   (2026-08-30 02:40)

**Fajlovi:**

*Dodato:*
- `lib/app-intro-panels.ts` (čista logika: koji uvodni panel je zatvoren; `localStorage`, jedan ključ)
- `lib/app-intro-panels.test.ts` (8 testova)
- `components/app/intro-panel.tsx` (`AppIntroPanel`: ikona + naslov + rečenica + tri koraka + CTA + dugme za zatvaranje)

*Izmenjeno - terminologija i mikrocopy:*
- `app/[locale]/app/community/{new,my-threads,[postId],[postId]/edit}/page.tsx` (naslovi stranica)
- `components/app/community-post-editor.tsx`, `community-thread-actions.tsx`, `community-thread-detail.tsx`,
  `community-thread-moderation.tsx`, `community-comments.tsx`
- `components/app/community-v2/{community-shell,community-discussions,community-members,community-my-threads,community-leaderboard,community-mentions,community-shared}.tsx`
- `components/app/{dashboard-content,dashboard-windows,classroom-hub,course-player,credits-page,profile-editor,profile-setup-gate,track-experience,studio-page,studio-media-detail,admin-inline-actions}.tsx`
- `components/app/chat/{chat-shared,chat-thread,chat-dialogs,chat-group-details,chat-inbox,messages-hub,study-hub}.tsx`
- `components/studio/{studio-composer,studio-filter-bar,model-picker,project-picker,source-job-picker,input-capabilities}.tsx`
- `lib/community-sections.ts` (dve nav labele), `lib/studio-messages.ts` (8 praznih stanja),
  `lib/credits-value.ts` + `lib/credits-value.test.ts` (`imageGenerationsLabel`)

**Šta je urađeno:**
Ceo app deo je pročitan očima nekoga ko slabo poznaje računare i prepravljen na tri fronta.
**(1) Žargon:** reč „tred" je izbačena iz srpskog jezika platforme i zamenjena rečju **„tema"** na svih
42 mesta (na engleskom „thread" → „topic", da dva jezika ne govore o dve različite stvari);
„username" → „korisničko ime", „workflow" → opis radnje, „scope/opseg" → „gde pripada",
„Leaderboard" → „Rang lista", „inbox" → „sve na jednom mestu", „autosave" → „čuva se automatski",
„upload" → „slanje slike/fajla", „Staff" → „predavači i moderatori", „XP" → „bodovi (XP)",
a u Studiju je imenica „generacija" zamenjena onim što korisnik zaista dobija („rad", „napravljena
slika", „sve što si napravio/la"). **(2) Prazna stanja:** četvrti i peti mehanizam iz `UX-BOOST-PLAN §6A`
su ugašeni - `EmptyCommunityState` je sada tanak omotač oko `EmptyState` primitiva iz U2, lokalni
`EmptyState` u `study-hub.tsx` je obrisan, a `community-comments`, `chat-inbox`, `messages-hub` i
zona „Smerovi" u Učionici su prebačeni na primitiv sa konkretnim sledećim korakom. **(3) Potvrde i
greške:** pronađena su tri **nativna `confirm()`** poziva koja U2 nije uhvatio (grepovao je
`window.confirm`) - naslovna slika kursa, uvodni video smera i fajl u bloku lekcije; prva dva su sada
`ConfirmDialog`, treći je potvrda u dva koraka (obrazloženje u ODLUCI 3). Oko 25 poruka o grešci
je prepisano tako da kaže **šta korisnik može da uradi** i da li je nešto izgubljeno. **(4) Uvodni
paneli:** Zajednica i Studio dobili su po jedan panel „šta je ovo / čemu služi / prva tri koraka",
koji se zatvara i pamti u `localStorage`.

**ODLUKE:**

1. **„Tred" → „tema", i to i na engleskom.** Reč „tred" je transkripcija engleskog `thread` koju
   početnik ne zna, a „diskusija" je već zauzeta za sekciju. „Tema" je obična srpska reč i lako se
   menja po padežima koje UI koristi. Engleski sam menjao zajedno sa srpskim jer bi inače naslov
   stranice („Tema") i dugme („Delete thread") govorili o dve različite stvari, a `en` je po pravilima
   repoa prevod srpskog, ne zaseban proizvod.
2. **Glagol „Generiši" NISAM menjao, samo imenicu „generacija".** Zadatak traži da se žargon zameni,
   ali `generateButtonLabel` je pokriven sa šest tvrdnji u `lib/studio-form.test.ts` i
   `lib/studio-gallery.test.ts`; prepravka bi značila menjanje tuđih testova zbog jedne reči, što je
   preko granice „surgical". Umesto toga uvodni panel Studija u prve tri rečenice objasni šta to dugme
   radi i da cena piše na njemu, a sve imenice oko njega su na srpskom („rad", „napravljena slika").
   `imageGenerationsLabel` je izuzetak - on stoji na stranici Kredita, u fokusu ovog koraka, pa je
   promenjen zajedno sa svoja četiri testa („1 generacija slike" → „1 napravljena slika").
3. **Treći nativni `confirm()` je zamenjen potvrdom u dva koraka, ne dijalogom.**
   `admin-inline-actions.tsx:2684` živi UNUTAR `AppComposerSheet`-a, koji je modal sa svojom zamkom
   fokusa. `ConfirmDialog` bi tu bio modal u modalu i dve zamke bi se otimale o isti fokus. Zato dugme
   prvo postane „Potvrdi: obriši fajl zauvek" uz rečenicu objašnjenja - isti obrazac koji
   `chat-group-details.tsx` već koristi za uklanjanje člana. Druga dva `confirm()` poziva
   (`dashboard-content.tsx`, `track-experience.tsx`) nisu u modalu i dobila su pravi `ConfirmDialog`.
4. **Uvodni panel Studija se prikazuje samo onome ko ima pristup Studiju** (`state.hasStudioAccess`).
   Dok traje zatvoreno testiranje (`STUDIO_NOT_ENROLLED`), uputstvo „izaberi alat i klikni dugme"
   bilo bi obećanje bez pokrića iznad poruke koja kaže suprotno.
5. **Uvodni panel Zajednice stoji u `CommunityShell`, dakle na svim njenim sekcijama.** Alternativa je
   bila da se veže samo za „Diskusije", ali onda ga ne bi video niko ko u Zajednicu uđe preko
   obaveštenja ili linka na temu - a to je čest ulaz. Panel se zatvara jednim klikom i više se ne vraća.
6. **`localStorage`, ne kolačić.** `lib/app-sidebar-preferences.ts` koristi kolačić jer server mora da
   zna širinu sidebara pre prvog frejma. Ovde server ništa ne treba da zna, pa bi kolačić na svakom
   zahtevu bio čist trošak. Zadržan je oblik tog fajla (čiste `parse`/`serialize` funkcije + testovi),
   a `window` dodiri su iza `try/catch`, po uzoru na `lib/studio-last-model.ts`.
7. **Panel se renderuje preko `useSyncExternalStore`, ne preko `useEffect` + `setState`.**
   Prva verzija je pala na `react-hooks` lint pravilo („Calling setState synchronously within an effect").
   `getServerSnapshot` vraća „zatvoren", pa se panel pojavi tek posle hidracije umesto da zasvetli
   pa nestane pred nekim ko ga je odavno zatvorio.
8. **`EmptyCommunityState` je zadržan kao ime, ali je iznutra sada `EmptyState` primitiv.** Brisanje bi
   značilo diranje pet pozivalaca u fajlovima koji su pisani u jednoj liniji (rizik od tihe greške u
   JSX-u), a dobitak je isti: zajednica se više ne crta po svojim pravilima.
9. **`public-community-comments.tsx` NISAM dirao.** To je marketing stranica javne objave, a pravila
   run-a zabranjuju redizajn marketinga.
10. **Prazna galerija medija u detaljima razgovora ostala je inline `<p>`.** To je traka od tri kolone
    unutar uske fioke; `EmptyState` primitiv sa krugom od 48px i velikim paddingom bi je razvalio.
    Popravljen je samo tekst („Zakači sliku uz poruku i pojaviće se ovde").
11. **`admin-content-manager.tsx` i `studio-admin-page.tsx` nisu u ovom koraku.** Admin nije na listi
    ekrana koje U5 pokriva (komandna tabla, učionica, plejer, zajednica, poruke, krediti, profil), a
    `UX-BOOST-PLAN §3D` ga izričito vodi kao odvojen posao.

**Testovi:**
- `lib/app-intro-panels.test.ts` (novo, 8 testova): round-trip zapisa, prazan/pokvaren `localStorage`
  ključ pada na „ništa nije zatvoreno" (a ne na pad ekrana), nepoznat id se odbacuje, zapis je uvek u
  istom redosledu i bez duplikata, zatvaranje jednog panela ne zatvara drugi, dvostruko zatvaranje ne
  menja ništa.
- `lib/credits-value.test.ts` (izmenjeno, 4 tvrdnje): tvrdnje su prepisane na nov tekst
  („1 napravljena slika" umesto „1 generacija slike"). Nijedna tvrdnja nije obrisana ni oslabljena -
  i dalje se proverava tačno srpsko množinsko slaganje za 1 / 5 i engleska jednina/množina.
- Postojeći `lib/studio-messages.test.ts` (17 testova) prolazi bez izmena: on tvrdi *strukturu*
  praznih stanja (naslov i telo na oba jezika, različiti tekstovi po jeziku, `STUDIO_NOT_ENROLLED`
  bez CTA), pa je prepisan sadržaj proverio sam sebe.

**Rezultat verifikacije:**
- `npm run typecheck` - **prošlo** (0 grešaka)
- `npm run test` - **prošlo** (82 fajla, 1115 testova; bilo 1107, +8 novih)
- `npm run lint` - **1 greška, ali NIJE iz ovog koraka.** Greška je
  `components/studio/studio-composer.tsx:1112 error: routeDroppedFiles is a function created with
  React Hook "useEffectEvent", and can only be called from Effects and Effect Events in the same
  component (react-hooks/rules-of-hooks)`.
  Provereno je da postoji i na `HEAD`-u: `git show HEAD:components/studio/studio-composer.tsx` je
  snimljen u zaseban fajl, vraćen na mesto i lintovan - ista greška, isti red. Moja jedina izmena u
  tom fajlu je jedan `aria-label` na liniji 1249. Nisam je popravljao jer bi ispravka značila
  prekrajanje toka za prevlačenje fajlova u Studiju - nepovezan kod i rizik regresije na putanji
  otpremanja, što pravila run-a izričito zabranjuju.
  Greška koju je ovaj korak uveo (`intro-panel.tsx`, `setState` u efektu) je ispravljena, ne ućutkana
  (vidi ODLUKU 7).

**Za Jovana ujutru:**
1. **Otvori Zajednicu i Studio u incognito prozoru** (ili obriši ključ `app:intro-panels-dismissed`
   iz `localStorage`) da vidiš oba uvodna panela. Proveri da dugme „X" gore desno zaista zatvori panel
   i da se posle osvežavanja stranice ne vrati. Proveri i u tamnoj temi.
2. **Terminologija je promenjena na 42 mesta: „tred" → „tema".** Ako negde u tvojim beleškama,
   mejlovima ili marketingu stoji „tred", sad se to razlikuje od aplikacije. Reci ako hoćeš drugu reč -
   izmena je mehanička.
3. **Dve nav labele su promenjene:** „Moji predlozi" → **„Moje teme"**, „Leaderboard" → **„Rang lista"**
   (`lib/community-sections.ts`). To se vidi i u sidebaru i u sekcijskoj navigaciji Zajednice.
4. **Tri nativna OS dijaloga su nestala.** Testiraj: (a) admin → kartica kursa → „Ukloni" naslovnu
   sliku, (b) stranica smera → „Ukloni" uvodni video, (c) u composeru bloka lekcije → „Ukloni postojeći
   fajl" (ovaj traži dva klika, drugi klik piše „Potvrdi: obriši fajl zauvek"). Sva tri sada rade i u
   tamnoj temi.
5. **`npm run lint` ima jednu grešku koja je bila tu i pre ovog koraka** (`studio-composer.tsx:1112`).
   Vredi je uvrstiti u neki od narednih koraka - nije kozmetička, `useEffectEvent` pozvan iz `onChange`
   je pravilo koje React uvodi zbog stvarnog problema sa zastarelim vrednostima.
6. **`imageGenerationsLabel` sada piše „≈ 25 napravljenih slika"** umesto „≈ 25 generacija slika" na
   stranici Kredita. Ako ti se ne sviđa, promena je u `lib/credits-value.ts` i njena četiri testa.

## U6 - Admin Sadržaj: pregled stanja + master-detail hijerarhija; ostali admin moduli dobili prazna stanja   (2026-08-30 03:05)

**Fajlovi:**

*Dodato:*
- `convex/adminOverviewCore.ts` (čista logika: `tallyStatuses`, `tallyLessonFlags`, `tallyStudents`, `STUDENT_COUNT_LIMIT`)
- `convex/adminOverview.ts` (jedan agregatni query `getAdminOverview`)
- `convex/adminOverview.test.ts` (11 testova: 4 unit nad core-om, 7 kroz `convexTest`)
- `lib/admin-content-tree.ts` (čista logika navigacije: `listLevelForSelection`, `parentListLevel`,
  `listLevelAfterChange`, `contentStatus`, `draftCount`)
- `lib/admin-content-tree.test.ts` (16 testova)

*Izmenjeno:*
- `components/app/admin-content-manager.tsx` (redizajn: tri gola `<select>`-a -> master-detail;
  `AdminUsersPanel` / `AdminGrowthPanel` / `AdminAnalyticsPanel` -> `EmptyState` + linkovi;
  `AdminPageFrame` dobio naslov po ruti; svi stringovi kroz `t()`)
- `app/[locale]/app/admin/{users,growth,analytics}/page.tsx` (prosleđuju `locale` panelu - jedina
  izmena; admin gate je netaknut, red po red isti)
- `convex/_generated/api.d.ts` (rezultat `npx convex codegen`)

**Šta je urađeno:**
`/app/admin/content` više ne počinje prazninom. Na vrhu su četiri kartice stanja platforme
(smerovi / kursevi / lekcije / studenti), svaka sa ukupnim brojem i razbijanjem po statusu kroz
`Badge` - admin na prvi pogled vidi koliko je objavljeno, koliko čeka u nacrtu i koliko je
arhivirano. Ispod je master-detail: levo `Panel` sa tri nivoa hijerarhije (Smerovi -> Kursevi ->
Lekcije) kao `surface-inset` stavke sa statusom kao `Badge` i brojem dece, desno **postojeći**
editor (readiness + `TrackExperience` / `DashboardContent` / `CoursePlayer` inline preview) - nijedan
red editora nije prepisan, samo je preveden na novu navigaciju. Nacrti nose `ink-hatch` šrafuru i
najglasniji (ink) `Badge`, pa se odmah vidi šta studenti NE vide. Tri dugmeta "Novi smer / Novi kurs /
Nova lekcija" su sada `Button` primitivi i stoje na dnu svoje liste, u kontekstu: dugme za lekciju
piše "Nova lekcija u ovom kursu" i tačno zna u koji kurs upisuje. Na mobilnom se vidi tačno jedan
nivo, sa dugmetom "Nazad na smerove / Nazad na kurseve"; od `lg` naviše sva tri nivoa stoje jedan
ispod drugog. Users / Growth / Analytics su umesto sirovih `FutureModule` pločica dobile jedan
`EmptyState` ("U pripremi" + rečenica šta će tu biti i gde se to radi danas) plus tri linka ka admin
modulima koji rade. Svaka admin ruta konačno ima svoj `<h1>` umesto četiri puta "Kontrolni centar"
(UX-BOOST-PLAN §3D), i nijedan string u fajlu više nije hardkodovan srpski - sve ide kroz `t()`.

**ODLUKE:**

1. **Gate novog query-ja je `getCurrentProfile` + provera role, a NE `requireAdmin`, iako je korak
   tražio `requireAdmin`.** `requireAdmin` (`convex/helpers.ts:283`) ide kroz `ensureProfile`, koji na
   `!db.patch` baca `"Profile bootstrap requires a write-capable Convex context."` - dakle radi samo u
   mutacijama. U query kontekstu bi svaki poziv pucao. Isti gate koristi i postojeći
   `contentHierarchy.getAdminHierarchy` (`:53-55`), pa je novi query dosledan susedu. Ponašanje je
   identično: ne-admin dobija `Forbidden`, neulogovan `Unauthorized` - oba pokrivena testom.
2. **Broj studenata je čitanje kroz indeks `by_role` sa granicom od 2000 po roli i `capped` zastavicom.**
   Convex nema `count`, a novi agregat (`@convex-dev/aggregate`) bi tražio izmenu šeme i
   `convex.config.ts` - što pravila run-a zabranjuju. Bezuslovan `.collect()` nad `users` je bomba sa
   odloženim dejstvom (transakcioni limit čitanja). Zato granica: kad se dostigne, UI piše `2000+`
   umesto broja koji bi bio laž. Brojani su `student`, `pro_student` **i nalozi bez upisane role** -
   jer `helpers.effectiveRoleForProfile` takav nalog tretira kao studenta; admini i moderatori se ne
   broje.
3. **Query je nov fajl `convex/adminOverview.ts`, a ne dopuna `contentHierarchy.ts`.**
   `getAdminHierarchy` ne može da ga zameni: on **izbacuje arhivirane kurseve** (`:70`) i uopšte ne
   čita korisnike, pa bi računanje na klijentu tiho prijavljivalo manje kurseva nego što ih ima.
4. **"Novi kurs" i "Nova lekcija" ostaju uvek vidljivi, ali su onemogućeni dok roditelj nije izabran -
   umesto ranijeg `creationIntent` toka.** Stara verzija je na klik otvarala nativni `<select>`
   (`showPicker()`), bojila ga amber okvirom i ispisivala žuto upozorenje - tri mehanizma za jedan
   korak, i svi su zavisili od `<select>`-a kojeg više nema. Sada iznad onemogućenog dugmeta stoji
   rečenica koja tačno kaže šta fali ("Prvo izaberi smer iznad. Kursevi uvek pripadaju jednom
   smeru."), pa je dugme vidljivo i objašnjeno, a nestalo je ~40 linija stanja (`creationIntent`,
   `openNativeSelect`, `trackSelectRef`, `courseSelectRef`, `handleTrackSelection`,
   `handleCourseSelection` i jedan `useEffect` koji je pomerao fokus).
5. **`/app/admin` (home) je ostavljen kao redirect na `/app/admin/content`.** Korak ga pominje u tački
   5, ali ta ruta **nema admin gate** - komentar u fajlu izričito kaže da gate stoji na svakoj leaf
   ruti, a ne na roditeljskoj, jer je roditelj samo redirect. Da bih tamo prikazao stranicu, morao bih
   da dodam gate - a pravila run-a zabranjuju diranje auth/gating pravila. Sidebar ionako izlistava
   sve admin sekcije, pa hub stranica ne bi dodala nijedan link koji već ne postoji. Linkovi ka
   modulima koji rade su umesto toga stavljeni na sve tri prazne stranice (users/growth/analytics).
6. **Statusni tonovi: nacrt = `ink` (najglasniji), objavljeno = `neutral`, arhivirano = `muted`.**
   Intuitivno bi bilo da "objavljeno" bude najjače, ali admin ne traži ono što je već objavljeno -
   traži ono što je zaglavljeno u nacrtu. Nacrt zato nosi i tamni Badge i `ink-hatch` šrafuru
   (postojeći utility iz `globals.css`, radi u obe teme jer je `color-mix` nad `var(--ink)`).
7. **Brojevi dece pišu se u obliku "Kurseva: 4 · Nacrt: 1", sa dvotačkom.** Srpski traži tri različita
   oblika za 1 / 2-4 / 5+ ("1 kurs", "2 kursa", "5 kurseva"). Oblik sa dvotačkom je gramatički tačan za
   svaki broj, ne traži tabelu množine i ne uvodi novu zavisnost. Isto važi i za `Badge`-eve u
   karticama stanja ("Objavljeno 4", "Nacrt 2").
8. **Zadržao sam `emerald`/`red`/`amber` Tailwind boje u traci poruka i u readiness pločicama.**
   To je zatečeni recept u ovom fajlu (readiness sekcija ga koristi na 4 mesta) i nije goli hex.
   Prepisivanje semantičkih boja na tokene je zaseban posao za ceo repo, ne za ovaj korak - upisano
   dole kao dug.
9. **Levi navigator je `lg:sticky` sa `lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto`.** Sa tri
   otvorena nivoa ploča ume da bude viša od ekrana; bez ograničenja visine `sticky` bi odsekao treći
   nivo bez načina da se do njega dođe. Liste imaju svoj `max-h-96` skrol samo do `lg` (na mobilnom je
   vidljiv jedan nivo, pa je to jedini skrol koji tamo treba).
10. **Restartovao sam dev server na portu 3000.** Zatečeni je od 01:13 vraćao HTTP 500 na svaku rutu
    (`Jest worker encountered 2 child process exceptions` u `.next/dev/logs/next-development.log`) i
    bio je neupotrebljiv puna dva sata. Next 16 ne dozvoljava drugi `next dev` nad istim
    direktorijumom, pa provera ruta bez restarta nije bila moguća. Posle restarta: `/sr` = 200, sve
    četiri admin rute = 307 (redirect na prijavu, dakle gate radi i moduli se kompajliraju bez greške).

**Testovi:**
- `convex/adminOverview.test.ts` (novo, 11): `tallyStatuses` broji sva tri statusa i vraća nule za
  praznu listu; `tallyLessonFlags` mapira `isPublished` na published/draft i **nikad** na archived
  (lekcije u šemi nemaju arhivu); `tallyStudents` označava `capped` samo kad korpa dotakne granicu
  (uključujući granični slučaj 9/9/9 pri limitu 10, koji NIJE capped). Kroz `convexTest`: agregat nad
  dva smera / dva kursa / četiri lekcije, prebrojavanje studenata gde admin i moderator ne ulaze a
  nalog bez role ulazi, prazan deployment vraća nule umesto pada, i gate - `moderator` / `pro_student` /
  `student` dobijaju `Forbidden`, neulogovani `Unauthorized`.
- `lib/admin-content-tree.test.ts` (novo, 16): koji nivo se otvara iz URL-a (uključujući pokvaren URL
  sa `lesson` bez `course`), kuda vodi "Nazad", korak napred pri biranju i **korak nazad pri
  poništavanju izbora** (inače bi korisnik ostao na praznoj listi dece nepostojećeg roditelja),
  status čvora iz `status` ili iz `isPublished`, čvor bez oba polja se tretira kao nacrt (nikad kao
  objavljen), i brojanje nacrta preko oba oblika.
- Nijedan postojeći test nije menjan ni oslabljen.

**Rezultat verifikacije:**
- `npx convex codegen` - **prošlo** (Convex je diran)
- `npm run typecheck` - **prošlo** (0 grešaka)
- `npm run test` - **prošlo** (84 fajla, 1142 testa; bilo 1115, +27 novih)
- `npm run lint` - **1 greška, ista pre-postojeća kao u U5**, i dalje
  `components/studio/studio-composer.tsx:1112 error: routeDroppedFiles is a function created with
  React Hook "useEffectEvent", and can only be called from Effects and Effect Events in the same
  component (react-hooks/rules-of-hooks)`. Provereno da je moj deo čist: `npx eslint` nad svih šest
  dodatih/izmenjenih fajlova daje **nula** nalaza (ni grešku ni upozorenje). Nisam je popravljao iz
  istog razloga kao U5: `routeDroppedFiles` se zove iz `onChange` na skrivenom `<input type="file">`,
  pa ispravka znači prekrajanje toka za slanje fajlova u Studiju - nepovezan kod i rizik regresije na
  putanji otpremanja.
- Napomena o `npm run test`: u dva od tri pokretanja pao je `convex/chat.test.ts > inbox summary stays
  exact beyond one thousand memberships` (timeout 5000ms). Provereno da NIJE moje: isti test pada i sa
  `git stash`-ovanim izmenama (1114/1115 na baseline-u), a prolazi kad se fajl pokrene sam. To je
  opterećenje paralelnog suite-a, ne regresija.

**Za Jovana ujutru:**
1. **Otvori `/sr/app/admin/content` ulogovan kao admin - to je jedini deo koji nisam mogao da vidim.**
   Playwright pokreće čist profil bez tvoje sesije, pa me admin gate (ispravno) vratio na prijavu.
   Proveri: (a) četiri kartice na vrhu pokazuju tačne brojeve, (b) klik na smer otvara njegove kurseve
   ispod, klik na kurs otvara lekcije, (c) desno se otvara isti inline editor kao ranije i snimanje
   radi, (d) "Podešavanja" popover gore desno u pregledu i dalje čuva slug/status/trajanje.
2. **Suzi prozor ispod 1024px** (ili otvori na telefonu): treba da se vidi tačno jedan nivo i dugme
   "Nazad na smerove / Nazad na kurseve". Bottom nav i dalje ima svoja 4 slota - nije diran.
3. **Proveri tamnu temu na toj stranici**, posebno izabranu (žutu) stavku u listi i šrafuru na
   nacrtima. Žuta stavka je "ostrvo" iz `globals.css` pa bi tekst u njoj morao da bude tamnoplav u obe
   teme; šrafura je `color-mix` nad `var(--ink)` pa se sama obrne.
4. **Dev server na portu 3000 sam restartovao** - zatečeni je od 01:13 vraćao 500 na svaku rutu i bio
   mrtav dva sata. Sada radi (`/sr` = 200). Ako si u brauzeru imao otvoren tab, osveži ga.
5. **Broj studenata staje na `2000+`** ako ih ikad bude toliko (vidi ODLUKU 2). Kad se to približi,
   pravo rešenje je `@convex-dev/aggregate` nad `users`, što traži izmenu šeme - namerno nije rađeno
   noćas.
6. **Dug koji sam popisao, a nisam dirao:** (a) traka poruka i readiness pločice u ovom fajlu i dalje
   koriste `emerald`/`red`/`amber` Tailwind skale umesto tokena, pa ne reaguju na temu (čitljive su,
   ali svetle u obe); (b) `inputClass` u istom fajlu i dalje ima `outline-none` bez `focus-visible`
   zamene i `rounded-[8px]` umesto `surface-media` - kandidat za U9, zajedno sa prelaskom polja u
   popoveru na `Field`/`Input` primitive iz U2.

---

## U7 - Mehanički a11y prolaz: fokus prstenovi, kontrast, aria-expanded   (2026-08-30 03:15)

**Fajlovi (svi izmenjeni, nijedan nov):**
`components/app/admin-content-manager.tsx`, `admin-inline-actions.tsx`, `app-sidebar.tsx`,
`chat/chat-composer.tsx`, `chat/chat-dialogs.tsx`, `chat/chat-group-details.tsx`,
`chat/chat-inbox.tsx`, `chat/chat-thread.tsx`, `chat/study-hub.tsx`, `community-comments.tsx`,
`community-post-editor.tsx`, `community-thread-moderation.tsx`,
`community-v2/community-discussions.tsx`, `community-v2/community-filters.tsx`,
`community-v2/community-members.tsx`, `community-v2/community-shared.tsx`, `course-lab.tsx`,
`inline-content.tsx`, `lesson-steps-editor.tsx`, `rich-text-editor.tsx`, `studio-admin-page.tsx`,
`suspension-gate.tsx`, `components/studio/project-picker.tsx`, `components/studio/studio-composer.tsx`.

**Šta je urađeno:**
Prošao sam preostalih **43 `outline-none` mesta bez zamene** iz `UX-BOOST-PLAN §4C` (63 ukupno
minus 16 koje je U2 već zatvorio u `sign-in-panel.tsx`/`profile-editor.tsx` i sami primitivi).
Recept je onaj koji je U2 već utvrdio i dokumentovao u ODLUCI 1 (`docs/UX-BOOST-PROGRESS.md` U2):
`outline-none` i `focus-visible:outline-*` na istom elementu se gase, pa se `outline-none` ne
kombinuje sa novim prstenom nego se **uklanja**, a dodaje se
`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink` (ink na papiru
prolazi >12:1 u obe teme). U studio komponentama (`project-picker.tsx`, `studio-composer.tsx`,
`studio-admin-page.tsx`) sam iskoristio postojeći `.studio-focus-ink` utility
(`app/globals.css:297`) umesto ručnog recepta - to je isti recept, već imenovan i već korišćen
u susednim mestima istog fajla (`studio-filter-bar.tsx`, `studio-moderation-grid.tsx`,
`studio-media-detail.tsx`), pa je dosledno da ga i preostala studio mesta koriste. Nijedno
`outline-none` u `.tsx` stablu više nema ostaje bez `focus-visible` zamene (proverio sam
`rg -n 'outline-none' --glob '*.tsx'` posle - svi preostali pogoci su ili u komentaru
`components/ui/field.tsx` ili upareni sa `studio-focus-ink`). Uz to sam našao i zatvorio dve
prekinute Tab/disclosure rupe: `admin-content-manager.tsx:879` (dugme „Podešavanja" iznad
inline editora nije imalo `aria-expanded`) i `admin-inline-actions.tsx:2082` (akordeon dugme za
lekciju u pregledu ciklusa nije imalo `aria-expanded`). Ostatak `aria-expanded`/`aria-current`
inventara (sidebar, bottom nav, chat popover-i, moderacioni akordeoni, komentar meni) je
proverio i zatekao već ispravnim - prethodni koraci (U2-U6) su to već pokrili.

**ODLUKE:**
1. **Nisam migrirao pogođena polja na `Input`/`Field` primitiv iz U2.** Zadatak dozvoljava obe
   putanje („gde je forma → migriraj; gde primitiv ne odgovara → dodaj eksplicitan recept").
   `Input` primitiv nosi sopstveni vizuelni recept (`surface-media`, `border-2`, `font-extrabold`
   itd. - vidi U2 ODLUKU 8 o razlici u debljini fonta), a pravilo run-a je „NE menjaj vizuelni
   izgled osim fokus prstenova". Zamena 40+ ručno stilizovanih polja primitivom bi promenila
   padding/font/senku na svakom od njih - to je van obima ovog sweep-a. Zato sam svuda dodao
   eksplicitan recept i **ne dirao** ostatak className stringa (uključujući postojeće
   `focus:border-yellow`/`focus:ring-4 focus:ring-yellow/NN` sekundarne efekte).
2. **Postojeće žute `focus:`/`focus-within:` efekte NISAM uklanjao, samo sam dodao ink prsten
   pored njih.** Pravilo run-a traži da fokus afordans ima ≥3:1 kontrast i da žuti ring na beloj
   pozadini ne prolazi - ali dodavanjem ink `focus-visible:outline` postiže se saglasnost bez
   obzira na to da li stari žuti efekat i dalje radi paralelno (on je sad sporedan, ne jedini
   afordans). Uklanjanje žutih efekata bi bila vizuelna promena van „samo fokus prstenova", pa
   sam to izbegao.
3. **`app-sidebar.tsx:2066` (ručica za promenu širine sidebar-a) je jedino mesto gde sam obrisao
   postojeći `focus-visible:ring-2 focus-visible:ring-yellow ... ring-offset-ink`, a ne samo
   dodao pored njega.** Taj prsten je već bio ekskluzivan (`focus-visible:outline-none` ispred
   njega je brisao default) i žut preko dela ekrana koji nije uvek ink pozadina - zamenjen je istim
   ink receptom kao svuda drugde, radi konzistentnosti i sigurne kontrast provere.
4. **`chat/study-hub.tsx:493` (`<section tabIndex={-1}>`, scroll-metu za „Study Pulse" predloge)
   je dobio isti ink recept iako nikad nije u Tab redosledu** (samo se programski fokusira posle
   skrolovanja). Modernim pregledačima `:focus-visible` i dalje pravilno prepoznaje programski
   fokus koji sledi tastaturnu akciju, pa je najkonzervativnije da i ovaj cilj ima vidljiv prsten
   umesto da ga eksplicitno gasim.
5. **Tiptap `rich-editor-content` (contentEditable div u `rich-text-editor.tsx`) je dobio isti
   `focus-visible:outline-*` recept kao obično polje.** `:focus-visible` radi na contentEditable
   elementima u svim modernim pregledačima; nisam pravio poseban slučaj.
6. **Nisam menjao aria-label/aria-current van dve pronađene `aria-expanded` rupe.** Prošao sam
   sidebar (5 mesta sa `aria-current`), bottom nav, sve popover-e sa `ChevronDown`/`Ellipsis`
   trigerima (`community-comments.tsx`, `community-thread-moderation.tsx`,
   `admin-inline-actions.tsx` x2, `chat-thread.tsx`, `chat-inbox.tsx`) i icon-only dugmad u
   `studio-media-tile.tsx` - sve već imaju `aria-label`/`aria-expanded`/`aria-current` iz
   prethodnih koraka (U2-U6). Nisam ponovo pisao ono što je već ispravno.
7. **Nisam dirao `rounded-[10px]`/`rounded-[6px]` off-scale radiuse koje sam usput video u istim
   className stringovima** (npr. `chat-group-details.tsx:202`, `lesson-steps-editor.tsx`
   `compactInputClass`) - zadatak izričito kaže „NE menjaj vizuelni izgled osim fokus prstenova";
   to ostaje popis za U9 (već je tamo, iz U2/U6 duga).
8. **Nisam pisao nove testove.** Ovo je čisto CSS-klasa/atribut sweep bez nove logike u `lib/`
   ili `convex/` - nema šta čisto da se testira, a postojeći suite (1142 testa) ostaje netaknut
   kao regresiona mreža.

**Testovi:** Nijedan nov test - vidi ODLUKU 8. Postojeći `npm run test` suite pokrenut kao
regresiona provera.

**Rezultat verifikacije:**
- `npm run typecheck` - **PROŠLO** (exit 0, bez izlaza)
- `npm run test` - **PROŠLO** (84 fajla, 1142 testa - identično baseline-u posle U6, nijedan test
  nije dirao ovaj korak jer nema nove logike)
- `npm run lint` - **exit 1, identično baseline-u iz U1-U6**: `178 problems (1 error, 177
  warnings)`. Jedina greška je i dalje pre-postojeća `studio-composer.tsx:1112`
  (`routeDroppedFiles`/`useEffectEvent`) - moja jedina izmena u tom fajlu je zamena
  `focus-visible:outline-none` sa `studio-focus-ink` u className stringu textarea-e za prompt,
  van je te funkcije. Nijedan od 24 izmenjenih fajlova ne unosi novo upozorenje - lint izlaz je
  identičan U6 baseline-u znak za znak.
- `npx convex codegen` - **nije pokrenuto**, nijedan Convex fajl nije diran (samo `components/`).

**BLOKADA:** Ista pre-postojeća, nasleđena iz U1, sedmi put ponovljena preporuka - popraviti
zasebno:
```
C:\Users\admin\Desktop\Web Dev Projects\nauciai\components\studio\studio-composer.tsx
  1112:18  error  `routeDroppedFiles` is a function created with React Hook
  "useEffectEvent", and can only be called from Effects and Effect Events in the
  same component  react-hooks/rules-of-hooks
```

**Za Jovana ujutru:**
1. **Tabuliraj kroz prijavu, profil, novi razgovor, prijavu komentara i sve select-e u
   Zajednici/Studiju/Adminu** (kursor tastaturom, ne mišem) - svuda mora da se vidi tanak ink
   okvir sa 2px razmaka oko polja, u obe teme. Ovo je najveća vidljiva promena koraka: 43 mesta
   koja ranije NISU imala nikakav fokus prsten sada ga imaju.
2. **Ručica za promenu širine sidebar-a** (tanka traka odmah desno od sidebar-a na desktopu,
   `role="separator"`, Tab pa strelice) sada pokazuje ink prsten umesto žutog - proveri da se i
   dalje vidi na oba ruba (svetla/tamna tema), to je jedino mesto gde sam **zamenio** postojeći
   efekat umesto da dodam pored njega (ODLUKA 3).
3. **Dva nova `aria-expanded`:** dugme „Podešavanja" iznad live pregleda u
   `/app/admin/content` i akordeon dugme za lekciju u pregledu ciklusa u istom editoru
   (`admin-inline-actions.tsx`) - vizuelno se ništa ne menja, ali čitač ekrana sad najavljuje
   otvoreno/zatvoreno stanje.
4. **Ako ti žuti `focus:border-yellow`/`focus:ring-*` efekti sada izgledaju suvišni** pored novog
   ink prstena (dvostruki fokus signal na istom polju) - to je namerna ODLUKA 2, ne previd; javi
   ako želiš da se stari žuti efekti uklone u zasebnom koraku.
5. **`inputClass`/`textareaClass` konstante u `admin-content-manager.tsx`,
   `admin-inline-actions.tsx`, `lesson-steps-editor.tsx`, `studio-admin-page.tsx` i
   `suspension-gate.tsx` i dalje imaju `rounded-[8px]`/`rounded-[6px]` off-scale radiuse** -
   nisam ih dirao (zadatak zabranjuje vizuelne promene van fokusa), ostaju za U9.

---

## U8 - Token + radius sweep   (2026-08-30 03:25)

**Fajlovi:**
- `app/globals.css` (nov token `--blue-mid` + tamni parnjak + `@theme inline` registracija)
- `components/app/dashboard-windows.tsx`, `components/app/dashboard-content.tsx`,
  `components/app/admin-inline-actions.tsx`, `components/app/app-sidebar.tsx`,
  `components/app/inline-content.tsx`, `components/app/lesson-steps-editor.tsx`,
  `components/app/member-profile.tsx`, `components/app/profile-editor.tsx`,
  `components/app/community-comments.tsx`, `components/app/help-settings.tsx`,
  `components/app/suspension-gate.tsx`, `components/app/chat/chat-dialogs.tsx`,
  `components/app/chat/chat-group-details.tsx`, `components/app/chat/chat-inbox.tsx`,
  `components/app/chat/chat-moderation-console.tsx`, `components/app/chat/chat-thread.tsx`,
  `components/app/chat/messages-hub.tsx`, `components/app/chat/study-hub.tsx`

**Šta je urađeno:**
Mehanički sweep u dva dela, bez ijedne namerne vizuelne promene osim gde je vrednost bila
van skale. **(1) Boje:** `#2e6f9f` je promovisan u `--blue-mid` (svetla `#2e6f9f`, tamna
`#7fb0d6` po istom odnosu kao `--muted`/`--line` par - posvetljeno i blago desaturisano za
tamnu podlogu) i registrovan kao `--color-blue-mid` u `@theme inline`; svih **22** mesta
(`text-[#2e6f9f]` × 21, `bg-[#2e6f9f]` × 1) prepisano na `text-blue-mid`/`bg-blue-mid`,
`dark:text-muted`/`dark:bg-ink/80` override ostavljen netaknut na svakom mestu. Jedan
preostali goli `#0e3158` u `.tsx` van dokumentovanih izuzetaka (`dashboard-windows.tsx:220`,
`group-hover:text-[#0e3158]`) zamenjen sa `group-hover:text-ink`. `#f4be30` u `.tsx` fajlovima
više nema nijedan pogodak - već je pre ovog run-a u potpunosti tokenizovan (vidi ODLUKU 1).
**(2) Radiusi van skale:** svih **39** app-scope pojava (isključujući 3 marketing mesta koja
U1 već drži van obima) prebačeno na najbliži sankcionisani tier: `6px`→`8px` (18×), `5px`→`8px`
(2×), `3px`→`8px` (2×), `4px`/`rounded-t-[4px]`→`8px`/`rounded-t-[8px]` (2×), `7px`→`8px` (1×),
`28px`→`16px` (3×), `18px`→`16px` (1×), `10px`→`12px` (9×, ugnježdeni popover/meni redovi i
form kontrole) ili `16px` (1×, samostalna hero sekcija `dashboard-content.tsx:1464`). Nijedan
`rounded-*!` ni inline `borderRadius` nije uveden ni pronađen.

**ODLUKE:**
1. **Tri hexa ostavljena netaknuta - potvrđuju raniju, već dokumentovanu odluku, ne novu.**
   `dashboard-content.tsx:549` (`linear-gradient(135deg,#0e3158,#173d6b)`, placeholder pre
   učitavanja videa) je namerno tema-nezavisan kao studio bunar - `docs/STUDIO-PROGRESS.md:7594`
   to već objašnjava. `rich-text-editor.tsx:14,73` (paleta boja za tekst koji UNOSI korisnik) i
   `lib/content.ts:414` (`accent` polje, nigde se ne renderuje kao boja UI-ja) su podaci/sadržaj,
   ne stilovi površine - tokenizacija bi promenila značenje (korisnik bira konkretnu boju teksta,
   ne temu). Sve tri su već bile na ovom spisku pre ovog run-a; ja sam samo potvrdio da i dalje
   važe i da nijedna nije className van njih.
2. **`10px` je razdvojen na dva tier-a po kontekstu, ne mehanički na jedan.** Osam od devet
   pojava su dugmad/redovi UNUTAR popover-a ili forme (chat podešavanja, komandni meni, naziv
   grupe) - to je definicija inset tier-a ("ugnježdeni paneli i kontrole unutar kartice"), pa idu
   na `12px`. `dashboard-content.tsx:1464` je samostalna hero sekcija na vrhu `/app` (nije
   ugnježdena ni u čemu), pa ide na `16px` (card tier). Ovo nije "najbliži broj" nego "najbliži
   tier po AGENTS.md definiciji tier-a" - oba tumačenja su podjednako blizu brojčano (razlika 2),
   pa je odlučivala namena elementa.
3. **`3px`→`8px` na heatmap kvadratićima u `member-profile.tsx:91,102` je vizuelno primetnije od
   ostalih migracija.** Element je `size-3` (12px) ili `size-[9px]` kvadrat - `8px` radius na
   12px kutiji izgleda znatno zaobljenije nego `3px`. Nema sankcionisanog tier-a manjeg od `8px`
   osim `rounded-full` (što bi kvadrat pretvorilo u krug - druga promena, ne migracija). Pravilo
   run-a eksplicitno traži "migriraj na najbliži sankcionisani tier", pa sam to i uradio, ali ovo
   NIJE nulta vizuelna promena - prijavljujem ga posebno za proveru u pregledaču.
4. **Nisam menjao stil zapisa (`rounded-[Npx]` naspram `surface-card`/`surface-inset`/
   `surface-media` utility-ja).** Zadatak traži da VREDNOST bude na skali, ne da se promeni
   sintaksa; `docs/UX-BOOST-PLAN.md` §4E izričito kaže da je bracket-sintaksa na sankcionisanoj
   vrednosti već "na skali", samo nije kanonski zapisana. Prebacivanje na utility klase je veći,
   nepotreban diff za ovaj korak i ostaje kao poznat dug (već popisan u §4E).

**Testovi:** Nijedan nije pisan ni menjan - ovo je čisto mehanički CSS/className sweep bez nove
logike; postojeći suite (84 fajla, 1142 testa) je pokrenut samo kao verifikacija da ništa nije
pokvareno.

**Rezultat verifikacije:**
- `npm run typecheck` - **PROŠLO** (exit 0)
- `npm run test` - **PROŠLO** (84 fajla, 1142 testova)
- `npm run lint` - **exit 1, identično baseline-u**: `178 problems (1 error, 177 warnings)`,
  ista pred-postojeća greška iz `studio-composer.tsx:1112` (U1/U2/U3), nijedan novi nalaz u
  fajlovima koje je ovaj korak dirao.
- Convex fajlovi nisu dirani - `npx convex codegen` nije pokretan.

**Za Jovana ujutru:**
1. **Heatmap kvadratići na profilu člana** (`member-profile.tsx:91,102` - traka aktivnosti ispod
   avatara) su sada zaobljeniji nego juče (ODLUKA 3). Ako ti se ne sviđa, jedina alternativa u
   skali je `rounded-full` (pretvara ih u tačke) ili ostati na `3px` kao dokumentovan izuzetak.
2. **`#2e6f9f` mesta** (uppercase eyebrow labele u chat-u, XP na profilu, avatar shade skala) sad
   koriste `text-blue-mid`/`bg-blue-mid` - u tamnoj temi izgled je nepromenjen (svako mesto već
   ima `dark:text-muted`/`dark:bg-ink/80` koji pobeđuje), u svetloj je piksel-isto jer je token
   postavljen na istu hex vrednost.
3. **Provera na 640/768/900/1024px nije rađena u pregledaču** - ovaj korak je čist CSS/className
   sweep bez logičkih izmena, pa je rizik nizak, ali novi `12px`/`16px` radiusi na chat popover
   redovima i dashboard hero sekciji vredi brzo pogledati u obe teme.
4. **`docs/UX-BOOST-PLAN.md` §4D/§4E brojevi su sada zastareli** (23×`#2e6f9f`, 43 off-scale
   radiusa) - ovaj dokument ih je sve zatvorio; ne treba ih ponovo brojati u sledećem koraku.

## U9 - Pokret, poliranje i loading stanja: overflow, mikro-interakcije, proslave, kosturi   (2026-08-30 03:50)

**Fajlovi:**

*Dodato:*
- `lib/floating-bounds.ts` + `lib/floating-bounds.test.ts` (klampovanje izmerenog pravougaonika na viewport; 6 testova)
- `lib/progress-encouragement.ts` + `lib/progress-encouragement.test.ts` (procenat kursa → prekretnica + topla rečenica sr/en; 8 testova)
- `app/[locale]/app/classroom/loading.tsx` (Učionica je bila jedina glavna zona bez `loading.tsx`)

*Izmenjeno (ključno):*
- `app/globals.css` — tokeni `--motion-element` (220ms) i `--motion-prelaz` (260ms) kao CSS ogledalo
  `lib/studio-motion.ts`; `@keyframes toast-enter` + `.toast-enter`; `@keyframes step-celebrate` +
  `.step-celebrate`; nova utility klasa `.card-anim-elevate`
- `components/studio/studio-filter-bar.tsx` — traka čipova u skrol strip (§5C, koren overflow-a)
- `components/app/studio-page.tsx` — `min-w-0` na koloni trake filtera; `contentBounds` klampovan na viewport (§5D)
- `components/ui/toast-provider.tsx` — mrtva klasa `motion-safe:animate-in` zamenjena stvarnim ulaskom; `100vw` → `100svw`
- `components/app/intro-panel.tsx` — `AnimatePresence` ulazak/izlazak po `element` tieru
- `components/app/dashboard-content.tsx` — proslava štikliranog koraka, ohrabrenje uz napredak, `HandUnderline`,
  `DashboardCourseCard` dobija hover senku i `prefers-reduced-motion` gard
- `components/app/dashboard-windows.tsx` — hover senka na prozoru, `active:` stanje na redovima
- `components/app/course-catalog-card.tsx`, `components/app/classroom-hub.tsx`,
  `components/app/community-v2/community-shell.tsx`, `components/ui/primitives.tsx`,
  `components/ui/spinner.tsx`, `lib/dashboard-first-run.ts` (+ njegov test)
- **35 dodatnih fajlova** dirnuto je samo zbog `Loader2` → `Spinner` sweep-a

**Šta je urađeno:**
Horizontalni overflow na `/app/studio` zatvoren je na oba mesta iz §5: traka filtera više nije
nesabijiv `inline-flex` bez skrola nego skrol strip sa `min-w-0` (bez `overflow-hidden` haka i bez
klipovanja popover-a, koji je ostao sibling), a lebdeći dok više ne uzima `left/width` bezuslovno iz
`getBoundingClientRect` — mera prolazi kroz `clampBoundsToViewport`, pa `fixed` element ne može da
prelije inicijalni sadržavajući blok. Toast je dobio stvarnu animaciju ulaska (klasa
`motion-safe:animate-in` koju je koristio nigde ne postoji — `tailwindcss-animate` nije u
`package.json`, pa poruka nije imala nijedan kadar) i `100svw` u `max-w` računu. Mikro-interakcije
su izvedene iz postojećeg rečnika: kartice kataloga i kursa diže Framer a senku im produbljuje CSS
(`.card-anim-elevate`, `--motion-mikro`), redovi u prozorima komandne table dobili su i stanje
pritiska, a uvodni paneli (`AppIntroPanel`) prvi put imaju ulazak i izlazak umesto iskakanja posle
hidracije. Napredak je prestao da bude gola brojka: `lib/progress-encouragement.ts` prevodi
završene/ukupne lekcije u jednu toplu rečenicu (sa srpskom trostrukom množinom) ispod svake trake
napretka, a štikliranje koraka u first-run čeklisti dobija kratku proslavu — ali samo kad korak
STVARNO pređe u urađeno (`celebratedStepId`), nikad na običnom renderu. Školski `HandUnderline`
dodat je na tri naslova zone (pozdravni hero, katalog kurseva, hero zajednice) u novoj `sm`
veličini. Učionica je dobila sopstveni kostur umesto kostura komandne table, i to i kao `loading.tsx`
rute i kao stanje dok traje Convex upit. Na kraju, **115 ručno ispisanih `Loader2` poziva u 40
fajlova** prebačeno je na `Spinner` primitiv iz U2 (ostala su 2, svesno).

**ODLUKE:**

1. **Traka filtera je dobila `overflow-x-auto`, a popover je ostao van tog kontejnera.**
   Zadatak traži popravku „bez `overflow-hidden` haka ako je moguće", a §5C sam dijagnostikuje
   nedostatak `flex-wrap`/`overflow-x-auto` kao uzrok. Prelamanje (`flex-wrap`) sam odbacio jer bi
   traka u ravni sa naslovom „Studio" menjala visinu zaglavlja na uskom desktopu. Skrol strip je
   morao da bude UNUTRAŠNJI div, a ne sam `containerRef`: popover je `sm:absolute` u odnosu na
   `containerRef`, pa bi ga skrol kontejner isekao. Sidrenje popover-a je nepromenjeno
   (`sm:left-0` gađa levu ivicu kontejnera, ne dugmeta). Skrol kontejner klipuje po obe ose, pa
   čipovi imaju `-my-1 py-1` i `-mx-0.5 px-0.5` — vazduh za tvrdu senku i podizanje na hover, uz
   izmerenu veličinu trake koja ostaje piksel-ista.
2. **Klampovanje doka je DODATO uz popravku uzroka, nije zamena za nju.** §5D kaže da je 5C koren;
   popravio sam koren, ali sam klamp svejedno uveo jer je `left/width` iz `getBoundingClientRect`
   bezuslovno vezan za element koji SME da se prelije — bilo koja buduća široka traka vratila bi
   isti bag. Koristi se `document.documentElement.clientWidth`, ne `window.innerWidth`, jer
   `innerWidth` uključuje vertikalni scrollbar pa bi klamp bio za ~15px prelabav.
3. **Prozori komandne table se na hover NE dižu, samo im raste senka; kartice kursa rade oba.**
   Zadatak traži „podizanje + senka" i za kartice kataloga i za dashboard prozore. Prozor
   (`DashboardWindow`) nije link — ceo se ne klikće, klikće mu se red ili dugme u podnožju — pa bi
   podizanje bilo obećanje klika koji ne postoji (motion-design: hover feedback je afordansa).
   Rastuća tvrda senka je isti „papir se odvojio od stola" jezik brenda, bez tog obećanja. Kartice
   kataloga i kursa, koje jesu ciljevi klika, rade i podizanje i senku.
4. **`DashboardPulse` je proveren i namerno ostavljen.** Zadatak traži da se provere `CourseProgress`
   i dashboard Pulse. Pulse pločice pokazuju kredite, poruke, obaveštenja i rang — nijedna ne nosi
   procenat kursa, pa im „toplo i ohrabrujuće" nema šta da doda; hover podizanje, žutu akcentaciju i
   fokus prsten već imaju. Ohrabrenje je zato otišlo tamo gde procenat stvarno postoji: kartica
   kursa, ink panel „Ukupno" u `ResumeHero` i napredak smera u Učionici.
5. **Proslava se pušta samo na PROMENU stanja koraka.** Alternativa (animacija pri montiranju) značila
   bi da čeklista poskakuje pri svakom otvaranju `/app` — to više nije nagrada nego tik. Zato
   `celebratedStepId(previousDoneIds, nextDoneIds)` u `lib/dashboard-first-run.ts`, sa eksplicitnim
   testom da prvi render ne slavi ništa i da vraćanje koraka unazad nije proslava. Efekat u
   komponenti zavisi isključivo od `doneKey`, bez `eslint-disable` na `exhaustive-deps`.
6. **Bez konfeta i bez nove animacione biblioteke.** „Pop" je keyframe sa prebačajem na 45%
   (`step-celebrate`), a ne nova easing kriva — rečnik ima samo tri easinga i nijedan nije `back`.
   Trajanje je `--motion-prelaz` (260ms), tj. `studioMotionTokens.prelaz.enterDuration`.
7. **CSS je dobio dva nova motion tokena, ali nijednu novu vrednost.** `--motion-element: 220ms` i
   `--motion-prelaz: 260ms` su doslovno `studioMotionTokens.<tier>.enterDuration` u milisekundama.
   Komentar iznad njih je dopunjen da se vidi da `lib/studio-motion.ts` ostaje JEDAN izvor istine, a
   CSS samo ogledalo onoga što stvarno animira (pravilo „bez mrtvih tokena" iz RD10).
8. **`HandUnderline` je dobio `size` prop umesto da se veličina prosleđuje kroz `className`.**
   `cn` je obično spajanje, ne tailwind-merge, pa `h-3.5` iz pozivaoca ne može pouzdano da pobedi
   `h-5` iz primitiva (Tailwind sortira po vrednosti). Isti obrazac koji `LinkButton` već koristi za
   `size`. Podrazumevano je `md` — marketing stranice su piksel-iste.
9. **Na ink heroju zajednice od potpisa se vidi samo žuti potez.** `HandUnderline` crta žutu liniju
   od 7px i tanku ink liniju od 2px preko nje; na `bg-ink` podlozi je ink linija nevidljiva. To nije
   greška nego posledica — žuti potpis na tamnom heroju je isti brend potez kao na papiru.
   Alternativa bi bila druga varijanta SVG-a samo za tamnu podlogu, što je nova grafika, ne poliranje.
10. **`Spinner` je dobio jedan nov tier `xl` (32px), a dva `size-3` poziva su ostavljena.**
    Veliki spinneri „ceo panel još nema sadržaj" bili su ispisani kao 7, 8 i 9 — tri veličine za
    jedno značenje. Sve tri idu na `xl` (32px), što je za `size-7` +4px a za `size-9` −4px; to je
    jedina namerna vizuelna promena sweep-a. Dva `Loader2 size-3` u `project-picker.tsx` stoje tačno
    uz `<Check className="size-3" />` u istom dugmetu, pa bi ih `xs` (14px) razmimoišao za 2px —
    ostavljeni su i prijavljeni kao poznat, dokumentovan izuzetak.
11. **`motion-reduce:animate-none` je izbačen iz svih migriranih spinnera.** `app/globals.css`
    globalno gasi `animation-duration` i `animation-iteration-count` pod
    `prefers-reduced-motion: reduce`, pa je ta klasa bila duplo osiguranje na 6 od 115 mesta — a
    `Spinner` je nema u API-ju. Ponašanje pod reduced-motion je nepromenjeno.
12. **`DashboardCourseCard` je dobio `prefers-reduced-motion` gard koji nije imao.** Nije „popravka
    susednog koda": ta kartica stoji u istoj mreži kataloga kao `CourseCatalogCard`, ovaj korak joj
    menja hover, a bez garda bi bila jedina kartica u mreži koja se i dalje pomera kad korisnik traži
    manje pokreta.

**Testovi:**
- `lib/floating-bounds.test.ts` (nov, 6 testova): pravougaonik koji staje ostaje netaknut; širina se
  seče na desnoj ivici; negativan `left` se vraća na nulu uz očuvan vidljivi ostatak; nikad negativna
  širina; neupotrebljiva širina ekrana i `NaN` mera vraćaju ulaz nepromenjen.
- `lib/progress-encouragement.test.ts` (nov, 8 testova): prazan kurs nije završen kurs (0/0 nije
  100%); prekretnica se čita iz broja lekcija a ne iz zaokruženog procenta; granice na 50% i 80%;
  srpska množina za preostale i za završene lekcije (5 → „lekcija", 2 → „lekcije", 21 → „lekcija");
  engleska rečenica za svaku prekretnicu.
- `lib/dashboard-first-run.test.ts` (dopunjen, +6 testova): `firstRunDoneIds` redosled; prvi render
  ne slavi; nepromenjeno stanje ne slavi; slavi tačno korak koji je prešao u urađeno; kad se više
  koraka štiklira odjednom slavi prvi po redosledu; vraćanje unazad nije proslava.

**Rezultat verifikacije:**
- `npm run typecheck` — **PROŠLO** (exit 0)
- `npm run lint` — **exit 1, identično baseline-u**: `178 problems (1 error, 177 warnings)`, ista
  pred-postojeća greška `studio-composer.tsx:1112` (`useEffectEvent`, postoji od U1). Nijedan nov
  nalaz ni u jednom od 46 dirnutih fajlova.
- `npm run test` — **85/86 fajlova, 1161/1162 testa prošlo.** Jedini pad je poznati flaky test
  `convex/chat.test.ts > inbox summary stays exact beyond one thousand memberships`
  (`Error: Test timed out in 5000ms`), koji pod paralelnim opterećenjem pada i bez ovih izmena;
  pokrenut izolovano (`npx vitest run convex/chat.test.ts`) prolazi — **18/18**. Ovaj korak nije
  dirao nijedan fajl u `convex/` (`git diff --stat -- convex/` je prazan).
- `npm run build` — **PROŠLO** (nova ruta `/[locale]/app/classroom` i njen `loading.tsx` se grade).
- Convex fajlovi nisu dirani → `npx convex codegen` nije pokretan.

**Za Jovana ujutru:**
1. **Studio na uskom desktopu (osoblje nalog, 640 / 768 / 900 / 1024 px)** — §5 je zatvoren u kodu,
   ali merenje u pregledaču U1 nije radio i ja ga nisam radio. Proveri: (a) da nema horizontalnog
   scrollbara ni na jednoj od te četiri širine, (b) da se traka filtera skroluje umesto da gura
   stranicu, (c) da se popover „Filteri" i dalje otvara ispod dugmeta i da ga skrol traka ne iseca,
   (d) da lebdeći composer stoji centriran u odnosu na EKRAN.
2. **Novi `xl` spinner (32px)** zamenio je tri veličine — pogledaj `/app/messages` (loading), admin
   „Sadržaj", detalj teme u zajednici i editor lekcija. Ako ti je negde 32px premalo ili preveliko,
   promena je na jednom mestu (`components/ui/spinner.tsx`), ne na 115.
3. **`HandUnderline` na tri nova mesta** — pozdravni hero na `/app`, zaglavlje kataloga u Učionici i
   hero zajednice. Na heroju zajednice (ink podloga) vidi se samo žuti potez, vidi ODLUKU 9; ako ti
   se to ne sviđa, reci i skidam ga samo sa tog jednog mesta.
4. **Proslava štikliranja** se vidi tek kad korak stvarno pređe u urađeno — najlakše: otvori `/app`
   kao student bez kursa, u drugom tabu napiši objavu u zajednici, pa se vrati na tab sa komandnom
   tablom (live upit će štiklirati korak i krug će „pucnuti"). Na obično osvežavanje stranice se
   NIŠTA ne animira, i to je namerno.
5. **Toast je do sinoć ulazio bez ijednog kadra** (mrtva klasa) — sad ima ulazak od 220ms. Pokreni
   bilo koju akciju koja diže poruku (npr. brisanje u Studiju) i proveri u obe teme i na telefonu.
6. **Dva `Loader2 size-3` u `components/studio/project-picker.tsx` (linije 290 i 386)** svesno su
   ostavljena van primitiva (ODLUKA 10) — ako hoćeš baš nula ad-hoc spinnera, treba im ili `size-3`
   tier u primitivu ili da se susedni `<Check className="size-3" />` podigne na 3.5.

## U10 - Tipografska skala, ritam i hijerarhija na app ekranima   (2026-08-30 04:31)

**Fajlovi:**

*Dodato:*
- `lib/type-scale.ts` + `lib/type-scale.test.ts` (skala kao podatak + 9 testova koji je
  uparuju sa `app/globals.css`)

*Izmenjeno (nosivo):*
- `app/globals.css` — 14 `@utility type-*` blokova; `letter-spacing: 0` reset premešten u
  `@layer base`
- `components/ui/primitives.tsx` — `SectionHeader` dobio `variant="app"`, `underline`, `className`
- `components/ui/badge.tsx`, `dialog.tsx`, `empty-state.tsx`, `field.tsx`, `toast-provider.tsx` —
  primitivi iz U2 prešli na skalu

*Izmenjeno (primena skale):* **59 fajlova** u `components/app/**` i `app/[locale]/app/**`
(komandna tabla, učionica/katalog, zajednica, poruke, krediti, profil, admin, app shell).

**Šta je urađeno:**
Pre pisanja koda izmereno je stanje: etiketa (eyebrow) se pisala u **7 veličina** (8/9/10/11/12/13/14px)
i **12 vrednosti `tracking`**, naslovi u **~76 različitih recepata** na 105 mesta, a `font-display`
(Patrick Hand) se koristio i na 18px, tj. kao telo teksta. Definisana je JEDNA skala od 14 uloga
(tabela ispod), zapisana kao podatak u `lib/type-scale.ts` — jedan izvor istine — sa CSS ogledalom u
`app/globals.css` i testom koji ne da da se to dvoje raziđe (isti obrazac koji `lib/studio-motion.ts`
već ima za `--motion-*`). Skala je zatim primenjena na **599 mesta**: 188 etiketa, 145 naslova i
uvodnih pasusa, 106 sitnih metapodataka, 98 pasusa sa eksplicitnim proredom, plus primitivi iz U2.
Naslovi rastu kroz `clamp()` umesto kroz `sm:`/`md:` stepenice, pa jedna klasa radi i na 390px i na
1440px. Ritam je sveden na Tailwind korake: površine imaju padding **4 / 6 / 8** (nestali `p-5`,
`p-7`, `p-9`, `p-10`, `p-12`, `p-3.5`), razmak sekcija je **6**, a zaglavlje je svuda
`etiketa → mt-2 → naslov → mt-1 potez → mt-3 pasus`. Liste u zajednici i porukama dobile su vazduh
(12→16px, 8→12px), a pasusi meru čitljivosti (`type-measure`, 68ch) na 24 mesta.

**Definisana skala — tabela `uloga → klasa` (za U11/U12):**

| uloga | klasa | veličina | prored | težina | razmak slova | za šta |
| --- | --- | --- | --- | --- | --- | --- |
| Brend hero | `font-display type-display` | `clamp(36px, …, 56px)` | 1 | 400 | 0 | Patrick Hand hero zone; velika brojka u svojoj pločici |
| Brend akcenat | `font-display type-display-sm` | `clamp(24px, …, 30px)` | 1.1 | 400 | 0 | naslov modala i istaknutog panela |
| Zona hero | `type-hero` | `clamp(30px, …, 48px)` | 1.08 | 900 | −0.03em | pozdravni naslov zone, veliki procenat napretka |
| Naslov ekrana | `type-h1` | `clamp(24px, …, 30px)` | 1.15 | 900 | −0.025em | jedan po ekranu |
| Naslov sekcije | `type-h2` | `clamp(20px, …, 24px)` | 1.2 | 900 | −0.02em | sekcija, naslov kartice kursa, naslov dijaloga |
| Naslov panela | `type-h3` | 18px | 1.3 | 900 | −0.01em | panel, prazno stanje, cena |
| Naslov reda | `type-h4` | 16px | 1.35 | 900 | 0 | red u listi, mali blok |
| Etiketa | `type-eyebrow` | 12px | 1.25 | 900 | 0.12em | kapitalizovana etiketa iznad naslova (nosi i `uppercase`) |
| Etiketa (gusta) | `type-eyebrow-sm` | 10px | 1.25 | 900 | 0.14em | čip, zaglavlje kolone, značka u redu |
| Duga forma | `type-reading` | 17px | 1.85 | — | 0 | telo lekcije, telo teme u zajednici |
| Telo | `type-body` | 16px | 1.7 | — | 0 | uvodni pasus ispod naslova |
| Telo (sitno) | `type-body-sm` | 14px | 1.7 | — | 0 | opis kartice, pomoć uz polje |
| Metapodatak | `type-caption` | 12px | 1.5 | — | 0 | vreme, brojač, potpis |
| Mera čitljivosti | `type-measure` | `max-width: 68ch` | — | — | — | svaki pasus koji se stvarno čita |

Pravila uz tabelu: (1) uloga nosi veličinu/prored/težinu/razmak — **boju i raspored bira pozivalac**;
(2) uloge tela (`reading`/`body`/`body-sm`/`caption`) NAMERNO ne postavljaju težinu, pa `font-bold`
sme uz njih (`cn` je obično spajanje, ne tailwind-merge, pa bi sudar bio nepredvidiv); (3) uz ulogu
se NE piše `text-*`, `font-*` (osim uz uloge tela), `leading-*`, `tracking-*` ni `uppercase` — ni kao
`sm:` varijanta; (4) Patrick Hand ide SAMO uz `type-display` i `type-display-sm`.

**Ritam (isti izvor istine, drži se i u U11/U12):**
`etiketa → mt-2 → naslov → mt-1 → HandUnderline → mt-3 → pasus`; sekcija→sekcija `space-y-6`;
padding površina `p-4` (kompaktno) / `p-4 sm:p-6` (standard) / `p-6 sm:p-8` (hero); lista kartica u
feedu `space-y-4`, lista redova u inboxu `space-y-3`.

**ODLUKE:**

1. **`letter-spacing: 0` reset je premešten u `@layer base` — to je uslov da skala uopšte radi.**
   Pravilo `body, button, a, input, textarea, select { letter-spacing: 0 }` stajalo je NELAYEROVANO,
   a nelayerovan autorski CSS pobeđuje svaki sloj — isti tip greške koji AGENTS.md već dokumentuje za
   radiuse. Bez premeštanja, `type-eyebrow` na `<button>`/`<Link>` (npr. redovi menija profila u
   `app-sidebar.tsx`) tiho bi ostao bez razmaka slova. Premeštanje je **dokazano bez vizuelne
   promene**: pre U10 nijedan `tracking-*` nije stajao direktno ni na jednom od tih elemenata
   (skenirano, 0 pogodaka u 141 fajlu). Provereno i na izgrađenom CSS-u: reset je u `@layer base`,
   `.type-eyebrow` u `@layer utilities`. Test to čuva.
2. **Marketing `SectionHeader` je ostao piksel-isti.** Nova `variant="app"` grana koristi skalu;
   podrazumevana `"marketing"` grana ispisuje doslovno iste klase kao pre. Marketing stranice nisu
   tema run-a, pa nisu ni dirnute.
3. **Nisam menjao nivo naslova (`<h2>` → `<h1>`) nigde.** `/app/credits`, `/app/profile` i
   `/app/billing` i dalje nemaju `h1` (SectionHeader renderuje `h2`). To jeste a11y dug, ali je
   semantička promena, a zadatak izričito traži „NULA promena ponašanja — čisto vizuelni sloj".
   Ostavljeno kao kandidat za sledeći a11y korak.
4. **Nisam izmišljao nove `kicker` tekstove.** Zadatak traži obrazac „etiketa + naslov ... primeni
   gde fali", ali bi to na 4 SectionHeader zaglavlja značilo NOV UI string, a copy pass je bio U5.
   Umesto toga sam im dao `variant="app"` + žuti `HandUnderline` (isti brend potez koji je U9 dodao
   zonama). Etiketa se dodaje kad Jovan odluči tekst.
5. **Četiri `font-display text-lg` mesta su prebačena u `type-eyebrow`, ne u manji Patrick Hand.**
   Zadatak kaže da Patrick Hand ide samo na velike naslove i akcente. Sva četiri
   („Isti tempo. Zajednički cilj.", „Pre objave", „Razmena znanja", „Learning spine") strukturno su
   etiketa iznad naslova, a app ima 188 takvih etiketa u jednom obliku. Rukopis nije nestao — ostaje
   na 25 mesta kroz `type-display`/`type-display-sm`.
6. **Etikete su prevedene na DVE veličine po pravilu „≤10px → 10px, 11–14px → 12px".**
   137 od 188 mesta ostalo je piksel-isto. **32 su porasla** (8→10, 9→10, 11→12) — čista dobit za
   čitljivost kod početnika. **19 se smanjilo** (13→12 ×4 u meniju profila, 14→12 ×15 na zonskim
   zaglavljima); to je namerno, jer etiketa mora da bude podređena naslovu iznad kog stoji, a
   dodati `tracking` od 0.12em optički nadoknađuje 2px.
7. **Sitan tekst (9/10/11/13px) van značke prebačen je na `type-caption` (12px) — 106 mesta.**
   Publika su početnici; 9px tekst je bio ispod granice čitljivosti. Test to i čuva („nijedna uloga
   ne pada ispod 10px").
8. **10 brojčanih znački je NAMERNO ostavljeno na 9/10px.** To su brojači nepročitanih poruka u
   fiksnom krugu (`h-5 min-w-5`); 12px bi razbio krug. Detektovane su preko `min-w-4|5` i
   izostavljene mehanički, ne ručno, pa se pravilo može ponoviti. Isto važi za jedan `text-[8px]`
   potpis preko avatara u `chat-group-details.tsx`.
9. **`type-reading` (17px/1.85) je uveden kao 14. uloga umesto da telo lekcije padne na `type-body`.**
   Telo lekcije i telo teme koristili su `leading-8` (2.0) — namerno prostrano, jer je to glavna
   površina za čitanje u proizvodu. Svođenje na `type-body` (1.7) bi zgusnulo baš ono što treba da
   diše. Uloga ima 5 poziva na dve različite površine, pa nije spekulativna apstrakcija.
10. **`text-sm` (298) i `text-xs` (349) bez eksplicitnog `leading` NISU dirani.** Pravilo koje sam
    primenio je: „string koji uz veličinu nosi i `leading-5|6|7` je pasus koji je neko namerno
    prelamao". Goli `text-sm`/`text-xs` su uglavnom oznake dugmadi i redova; postavljanje `line-height`
    na kontrolu menja njenu visinu, što je promena rasporeda, a ne vizuelnog sloja. Ostaje kao poznat,
    ograničen dug (opisan dole).
11. **Padding lestvica je 4/6/8 samo za POVRŠINE.** `p-1`, `p-2`, `p-3` su padding kontrola (čipovi,
    ikonice, redovi), ne kartica, i ostaju. Svih 81 tokena ≥20px (`p-5`, `p-7`, `p-9`, `p-10`, `p-12`
    i njihove `sm:`/`md:` varijante) svedeno je na lestvicu, uz automatsko uklanjanje responsivnog
    koraka koji posle svođenja više ništa ne radi (`p-5 sm:p-6` → `p-6`, `p-4 sm:p-5 lg:p-6` →
    `p-4 sm:p-6`). `px-*`/`py-*` parovi nisu dirani — to je zaseban, mnogo veći zahvat.
12. **Poruke su dobile 12px umesto 8px između redova, ne više.** Redovi inboxa su kartice sa okvirom,
    pa je 8px bio zid; ali inbox je i lista koja treba da pokaže što više razgovora bez skrola, pa
    veći skok od jednog stepenika (8→12) nije opravdan.
13. **Velike brojke napretka na komandnoj tabli ostaju na `type-hero`.** Razmatrao sam da ih spustim
    ispod naslova zone radi „jednog težišta", ali su u zasebnim ink panelima gde su ONE težište svoje
    pločice; pozadina ih razdvaja od naslova stranice. `purpose` uloge `hero` to sad i kaže.
14. **Primitivi iz U2 (`Badge`, `Dialog`, `EmptyState`, `Field`, `Toast`) su ušli u obim iako su u
    `components/ui/`.** Renderuju se na svakom imenovanom app ekranu; da su ostali van skale, skala
    bi imala rupu tačno tamo gde se najviše ponavlja. `Badge` je pritom izgubio `text-[10px]`/
    `text-[11px]` iz `badgeSizes` (uloga ih nosi), pa je `md` značka porasla 11→12px.
15. **Studio (`/app/studio`, `components/studio/**`, `studio-media-*`, `studio-moderation-grid`) je
    van obima.** U10 imenuje sedam zona i Studio nije među njima; imao je sopstveni run
    (`docs/STUDIO-PROGRESS.md`). Izuzetak su dva „shell" fallback zaglavlja u
    `app/[locale]/app/studio/**/page.tsx` i `studio-admin-page.tsx` (ruta `/app/admin/studio`, tj.
    admin zona) — oni su na skali.

**Testovi:**
- `lib/type-scale.test.ts` (nov, 9 testova): svaka uloga ima jedinstvenu klasu i pokrivena je;
  `app/globals.css` definiše svaku ulogu **tačno** kako contract kaže (font-size, line-height,
  letter-spacing, font-weight, text-transform — uključujući i to da ih nema kad ih contract nema);
  `type-measure` drži 68ch; uloge tela ne postavljaju težinu; samo `display` uloge nose Patrick Hand
  težinu 400 a ostali naslovi 900; skala je monotona (svaki naslov ≤ prethodnog, `eyebrow` >
  `eyebrow-sm`, `body` > `body-sm` > `caption`); nijedna uloga ne pada ispod 10px; `type-reading` ima
  prostraniji prored od `type-body`; **`letter-spacing` reset mora ostati u `@layer base`** (ovaj
  poslednji je regresioni test za ODLUKU 1 — ako pravilo ikad izađe iz sloja, `type-eyebrow` na
  dugmadima tiho gubi razmak i test pada).
- Nijedan postojeći test nije menjan ni uklonjen.

**Rezultat verifikacije:**
- `npm run typecheck` — **PROŠLO** (exit 0)
- `npm run test` — **PROŠLO** (87 fajlova, 1171 test; +9 novih)
- `npm run lint` — **exit 1, identično baseline-u**: `178 problems (1 error, 177 warnings)`, ista
  pred-postojeća greška `studio-composer.tsx:1112` (`useEffectEvent`, postoji od U1, fajl nije dirnut).
  Nijedan nov nalaz ni u jednom od 64 dirnuta fajla.
- `npm run build` — **PROŠLO** (`Compiled successfully`, 74/74 statičke stranice).
- Convex fajlovi nisu dirani → `npx convex codegen` nije pokretan.
- Dodatne mehaničke provere posle svake izmene: **0 sudara** (nijedan `type-*` ne stoji uz `text-*`,
  `leading-*`, `tracking-*`, `uppercase` ili drugu ulogu — ni u `className="…"`, ni u granama
  `cn(...)`, ni kao `sm:` varijanta); **0 preostalih `tracking-*`** u app obimu (bilo ih je 12
  različitih vrednosti).

**Za Jovana ujutru:**
1. **Ovo je najveći vizuelni diff run-a — 64 fajla — i nije proveren u pregledaču.** Prioritet za
   pogled u OBE teme i na telefonu: `/app` (pozdravni hero + kartica kursa), `/app/classroom`,
   `/app/community` (hero na ink podlozi), `/app/messages`, `/app/credits`, `/app/profile`,
   `/app/admin`.
2. **Hero zajednice (`community-shell.tsx:146`) je najrizičnije mesto.** Bio je
   `clamp(24px…38px)` + `truncate` + `sm:whitespace-nowrap`, sad je `type-hero`
   `clamp(30px…48px)`. Na širokom ekranu je ~10px veći, pa dug naslov zone može da se seče ranije.
   Ako smeta, jedina izmena je `type-hero` → `type-h1` na toj liniji.
3. **Meni profila u sidebar-u** (Moj profil / Naplata / Nadogradnja) bio je 13px uppercase bez
   razmaka slova, sad je 12px sa 0.12em. To je prvo mesto gde se vidi efekat ODLUKE 1 — ako razmak
   slova NIJE vidljiv tamo, znači da je reset opet izašao iz `@layer base` (i test bi trebalo da padne).
4. **Značka `Badge size="md"` je porasla 11→12px** (ODLUKA 14), a značke uloga u zajednici
   (`RoleBadge`) sad su svuda 10px umesto 8/10px. Vidi se u listi članova i uz svaki komentar.
5. **Primarna akcija — nije rešeno, izmereno je.** Zahtev „tačno jedno težište, primarna akcija žuta"
   je za naslove ispunjen skalom, ali **21 fajl ima 2+ punih žutih dugmadi**, a najviše
   `lesson-steps-editor` i `member-profile` (po 6). Koje je od njih primarno je proizvodna odluka,
   ne mehanička, pa je nisam donosio bez tebe — dobar zadatak za U11/U12.
6. **Poznat dug koji je U10 svesno ostavio** (spisak je namerno konkretan da ga sledeći korak može
   uzeti): (a) 298 `text-sm` + 349 `text-xs` bez `leading` ostaju van skale — ODLUKA 10; (b) `px-*`/
   `py-*` parovi nisu na lestvici, samo `p-*`; (c) `gap-1.5` (35) i `mt-5` (70) su van koraka 4/6/8;
   (d) `/app/credits`, `/app/profile`, `/app/billing` nemaju `h1` — ODLUKA 3.
7. **Dva gola heksa koja su preživela U8 sweep** (nisam ih dirao, nisu moj zadatak, ali sam naleteo
   na njih): `bg-[#10b981]` / `hover:bg-[#0ea472]` na „Nadogradnja" redu u `app-sidebar.tsx` i
   `group-hover:text-[#164d7d]` u `community-v2/community-shared.tsx:266`.
8. **Fontovi: nema greške, ali ima sitnice.** Proverio sam u izgrađenom CSS-u da naša srpska
   dijakritika (č, ć, š, ž, đ) STVARNO dobija Nunito — `latin-ext` `@font-face` postoji jer Google
   vraća sve podskupove. Ali `subsets: ["latin"]` u `app/[locale]/layout.tsx` znači da se
   **preload hint šalje samo za `latin`**, pa se fajl sa dijakritikom povlači tek kad ga tekst
   zatraži. Za primarni jezik platforme vredi razmisliti o `subsets: ["latin", "latin-ext"]` —
   nisam menjao jer to menja mrežni saobraćaj, a nije deo ovog koraka.


## U11 - Vizuelni „wow" sloj: hero, prozori sa identitetom zona, kartice kursa, player   (2026-08-30 05:00)

**Fajlovi:**

*Dodato:*
- `lib/dashboard-zones.ts` + `lib/dashboard-zones.test.ts` (identitet zona komandne table kao
  podatak; 9 testova)
- `lib/lesson-position.ts` + `lib/lesson-position.test.ts` („gde sam" — pozicija lekcije u kursu i
  koraka u lekciji; 8 testova)

*Izmenjeno:*
- `components/app/dashboard-content.tsx` — `CourseProgress` (žuta traka + procenat), `DashboardFirstRun`
  (sveska + rukopis + vodeni žig), `ResumeHero`, `DashboardCourseCard`, `CourseCover`/`HeroCover`,
  prazna zona „Dnevni ritam", pozdrav na stranici kursa
- `components/app/dashboard-windows.tsx` — pločica zone u zaglavlju prozora, veći broj, hover
  podizanje, `PulseTile` na card tier sa `type-h1` brojkom
- `components/app/course-catalog-card.tsx` — okvir naslovne slike, `ink-hatch` na zaključanoj,
  radius tierovi
- `components/app/classroom-hub.tsx` — hero (rukopis + `sketch-grid`), procenat smera, prazan filter
- `components/app/course-player.tsx` — hijerarhija video → koraci → beleške, centrirana kolona za
  čitanje, prazno stanje lekcije, pločica „Materijala"
- `components/app/app-sidebar.tsx` — spisak lekcija dobija redne brojeve, „Lekcija 3 od 8" i marker
  „Ovde si"

**Šta je urađeno:**
Pet zahteva iz koraka su odrađena bez ijedne promene ponašanja — nijedan novi upit, nijedna nova ruta,
nijedno novo dugme koje nešto radi. **(1) Hero** komandne table dobio je školsku podlogu iz postojećeg
rečnika (`sketch-grid`), rukom pisan pozdrav (Patrick Hand kroz `type-display-sm`) i vodeni žig od
uvećane lucide ikone, a checklist iz U4 pretvoren je u stavke iz sveske: kvadratno polje koje se
štiklira umesto kružića sa brojem, redni broj kao etiketa iznad naslova, precrtan naslov kad je korak
urađen i tvrda senka samo na sledećem koraku. **(2) Prozori** više nisu šest identičnih belih panela:
svaki nosi pločicu sa svojom ikonom, a pločica ima jedan od tri akcenta po tome šta se u zoni radi
(žuto = ti radiš, mastilo = drugi ljudi, papir = stanje) — pravilo je zapisano kao podatak u
`lib/dashboard-zones.ts` sa testom, ne razbacano po JSX-u. Brojači su iz sitne pilule prerasli u
pločicu od 32px sa cifrom od 16px, a `PulseTile` brojke sa `type-h2` na `type-h1`. **(3) Kartice
kursa** dobile su uokvirenu naslovnu sliku na media radiusu (isti okvir, isti odnos 16/9 i na
otključanoj i na zaključanoj), procenat kao najkrupniji broj kartice i traku napretka koja je sada
žuta; zaključana kartica se ne sivi nego dobija školsku šrafuru (`ink-hatch`) preko naslovne slike.
**(4) Player** je dobio hijerarhiju: prekidač prikaza je spušten u podređenu inset traku, naslov
lekcije nosi kurs iznad sebe i žuti potpis ispod, sadržajni blokovi se čitaju kao numerisani koraci
razdvojeni isprekidanom linijom, video je uokviren i podignut senkom, a „Materijali" imaju istu
pločicu sa ikonom kao zone. Marker „gde sam" je u spisku lekcija u sidebar-u: redni brojevi na
redovima, „Lekcija 3 od 8" u zatvorenoj kartici i pilula „Ovde si" na otvorenoj lekciji. **(5) Prazan
prostor** zatvoren je na četiri mesta gde je ekran ostajao pola prazan sa jednim redom teksta.

**ODLUKE:**

1. **Traka napretka je vraćena na žutu, ali kontrast nosi MASTILO, ne ispuna.** U7/U9 su je namerno
   prebacili na ink jer je žuta na papiru 1,69:1, ispod praga 3:1 za grafičke objekte (WCAG 1.4.11).
   U11 izričito traži „progres kao vidljiva žuta traka sa procentom", pa je rešenje uzelo oba: okvir
   trake je sada `border-ink` (12,92:1), čelo ispune ima 2px `border-ink` ivicu (jedino što je vrh
   trake razdvajalo od praznog dela), i **procenat je dodat kao broj u tekstu** iznad trake na oba
   mesta gde se `tone="paper"` koristi (kartica kursa, napredak smera). Grafika time više nije jedini
   nosilac podatka, što je i formalni izlaz iz 1.4.11. Ivica se NE crta na 0% (izgledala bi kao mrvica
   napretka) ni na 100% (nema šta da razdvoji).
2. **Prozori se sada DIŽU na hover, suprotno ODLUCI 3 iz U9.** U9 je podizanje odbio jer prozor nije
   link pa bi obećao klik koji ne postoji. U11 izričito traži „hover podizanje po motion rečniku", što
   je noviji zahtev i pobeđuje. Kompromis je u meri: prozor se diže **2px**, kartica kursa (koja jeste
   jedan klik) i dalje **3px** — afordansa ostaje razlučiva. Tranzicija je postojeća
   `studio-anim-mikro` (120ms), pa `prefers-reduced-motion` blok u `globals.css` gasi trajanje.
3. **Zone dobijaju TRI akcenta, ne osam.** Zadatak traži da se zone razlikuju na prvi pogled, ali bi
   osam različitih izgleda mrežu učinilo šarenom a i dalje nerazlučivom, a paleta ionako ima samo
   mastilo/papir/žutu (AGENTS.md). Zato akcenat izlazi iz ULOGE zone: „ovde ti radiš" (Učionica,
   Studio) → žuto, „ovde su drugi ljudi" (Poruke, Zajednica, Uči zajedno) → mastilo, „ovde ti se javlja
   stanje" (Obaveštenja, dva admin prozora) → papir. Test čuva da četvrti izgled ne može da se pojavi.
4. **Sidebar lekcija je pojačan tamo gde JESTE, nije napravljen nov na stranici lekcije.** Zadatak
   traži „sidebar lekcija sa jasnim ‚gde sam’ markerom". Spisak lekcija u proizvodu živi u
   `LearningSwitcher`-u u sidebar-u i već prima `currentLessonSlug`. Nov spisak u desnoj koloni playera
   bio bi nemoguć bez novih podataka: `CoursePlayer` dobija `course.modules` iz **statičkog**
   `lib/content` fallback-a (`liveCourseAndLesson` prepisuje samo naslove, ne module), pa bi za kurs
   napravljen u Convexu prikazao tuđe lekcije. Nov upit je promena ponašanja, koju korak zabranjuje.
   Umesto toga marker je pojačan u postojećem spisku (redni brojevi, „Lekcija 3 od 8", „Ovde si"), a na
   samom ekranu lekcije dodat je naziv kursa iznad naslova — kontekst koji se na telefonu do sada video
   samo kroz otvaranje sidebar-a.
5. **Redosled sadržajnih blokova NIJE diran.** „Hijerarhija video → koraci → beleške" je izvedena
   vizuelno (video uokviren i podignut senkom, blokovi imenovani kao koraci, beleške u svom panelu sa
   pločicom), a ne premeštanjem blokova — redosled bira autor lekcije kroz `sortOrder` i to je sadržaj,
   ne izgled.
6. **Pilula „Korak N od M" se ne crta kad lekcija ima jedan blok.** „Korak 1 od 1" nije informacija
   nego šum.
7. **Telo lekcije je ograničeno na `max-w-3xl` i centrirano.** Na širokom ekranu je panel lekcije bio
   ~1000px, a tekst je zbog `type-measure` (68ch) stajao uz levu ivicu — desna polovina je bila prazan
   papir. To je bio najveći pojedinačni „pola praznog viewporta" nalaz u app obimu (§5).
8. **Tri „gola reda teksta" pretvorena su u `EmptyState`, četvrti u panel sa zaglavljem.** Zona
   „Dnevni ritam" na komandnoj tabli, filter bez pogodaka u katalogu Učionice i Light lekcija bez
   blokova dobili su ikonu, naslov i rečenicu sa sledećim korakom; zona „Dnevni ritam" je uz to dobila
   i sopstveni `Panel` sa etiketom, pa ima istu visinu i kad grafikona nema. Nijedno prazno stanje nije
   dobilo dugme — dugme bi bilo nova radnja, a korak traži nula promena ponašanja.
9. **Pozdrav „Zdravo, {ime}" je promenio SLOG, ne tekst.** Toplina traženog „toplog pozdrava" došla je
   iz rukopisa (Patrick Hand kroz `type-display-sm`, jedina sankcionisana upotreba tog fonta), ne iz
   novog teksta — copy pass je bio U5 i njegove rečenice se ne diraju. Promena je urađena na sva tri
   mesta gde student vidi svoje ime (komandna tabla, Učionica, stranica kursa), da glas bude jedan.
10. **Vodeni žig je uvećana lucide ikona, ne nova ilustracija.** Korak izričito zabranjuje ilustracije
    spolja i dozvoljava lucide; `GraduationCap` na 192px u mastilu od 10% radi u obe teme. Na telefonu
    se skida (`hidden sm:block`) — na 390px bi stajao iza teksta.
11. **Zaključana kartica je dobila šrafuru, ne zatamnjenje.** Scrim ili sivilo bi ubili poželjnost koju
    zadatak izričito traži. `ink-hatch` (postojeći patern, mastilo na 8%) ostavlja sliku u boji, a čita
    se kao „preko ovoga još stoji olovka".
12. **Radius literali su prevedeni u tiere SAMO u fajlovima koje je korak ionako menjao** (AGENTS.md:
    „migrate them to the nearest tier when you are already editing the file"). Većina je bila
    piksel-ista zamena (`rounded-[8px]` → `surface-media`). Dve su stvarne promene: „Sledeće:" traka na
    kartici kursa 16px → 12px (ugnježden panel u kartici → inset tier) i `PulseTile` 8px → 16px
    (samostalna kartica na tabli → card tier).
13. **`DashboardHomeSkeleton` nije menjan.** Hero je porastao za ~15px (pozdrav sa 15px etikete na
    ~30px rukopisa) na kosturu od 256px; to je ~6% i nevidljivo, a pogađanje nove visine bez merenja u
    pregledaču lako pogorša stvar.
14. **Prekidač „Pro / Light" nije premešten, samo utišan.** Premeštanje u DOM-u je promena redosleda
    fokusa (tastatura), tj. ponašanja. Umesto toga je sa ink panela spušten na inset površinu sa
    etiketom, pa naslov lekcije postaje prva stvar koja se čita.

**Testovi:**
- `lib/dashboard-zones.test.ts` (nov, 9 testova): svaka od 8 zona ima akcenat; žuto je rezervisano
  tačno za Učionicu i Studio; mastilo tačno za tri zone sa ljudima; papir za tri statusne; akcenat se
  izvodi iz uloge (nova zona ne može da izmisli četvrti izgled); svaka pločica nosi `border-ink`; klase
  su samo tokeni (regex ne pušta gol heks ni proizvoljnu boju); tri akcenta su međusobno različita;
  nijedna pločica nije iste ispune kao panel na kom stoji.
- `lib/lesson-position.test.ts` (nov, 8 testova): pozicija broji od jedan; nema pozicije kad lekcija
  nije otvorena, kad je kurs prazan i kad je lekcija u međuvremenu skinuta (izmišljen broj je gori od
  nikakvog); duplirani slug uzima prvi; etikete „Lekcija 3 od 8" / „Lesson 3 of 8" i „Korak 2 od 5" /
  „Step 2 of 5" u oba jezika; kurs sa jednom lekcijom i dalje čita ispravno.
- Nijedan postojeći test nije menjan ni uklonjen.

**Rezultat verifikacije:**
- `npm run typecheck` — **PROŠLO** (exit 0)
- `npm run lint` — **exit 1, identično baseline-u**: `178 problems (1 error, 177 warnings)`, ista
  pred-postojeća greška `studio-composer.tsx` (`useEffectEvent`, postoji od U1, fajl nije dirnut).
  Nijedan nov nalaz ni u jednom od 6 dirnutih fajlova (dva upozorenja u `dashboard-content.tsx` su na
  linijama 323/325, `PlaybackTokenPayload` i `DashboardVideoPlayer`, i postoje od ranije).
- `npm run test` — **PROŠLO**, 89 fajlova / **1188 testova** (bilo 1171; +17 novih). Prošao je i
  `convex/chat.test.ts` koji je u U9 bio flaky.
- `npm run build` — **PROŠLO** (`Compiled successfully`, exit 0).
- Convex fajlovi nisu dirani → `npx convex codegen` nije pokretan (`git diff --stat -- convex/` prazan).
- Provereno u IZGRAĐENOM CSS-u da svaka nova klasa stvarno postoji: `.sketch-grid`, `.ink-hatch`,
  `.surface-media` / `.surface-inset` / `.surface-card`, `.studio-anim-mikro`, `.min-w-8`, `text-ink/10`.
- Tamna tema je provođena kroz pravilo „žutog ostrva" iz `globals.css`: svaki nov element sa
  `bg-yellow` (čelo trake napretka, brojač prozora, pločica zone, polje za štikliranje) postaje ostrvo
  svetle palete, pa `border-ink` / `text-ink` na njemu razrešava u tamnoplavo u OBE teme — isti obrazac
  koji `CourseCover` fallback već koristi.

**Za Jovana ujutru:**
1. **Traka napretka je sada žuta (ODLUKA 1) — ovo je jedina izmena koja dodiruje raniju a11y odluku.**
   Pogledaj `/app` (kartica kursa) i `/app/classroom` (napredak smera) u obe teme. Ako ti se ne dopada
   ink ivica na čelu trake, izmena je na jednom mestu — `CourseProgress` u `dashboard-content.tsx`.
2. **Prozori se dižu na hover (ODLUKA 2).** Ako ti se čini da prozor time obećava klik koji ne postoji,
   skidanje je jedna klasa (`hover:-translate-y-0.5`) u `DashboardWindow`.
3. **Boje zona su odluka o proizvodu, ne mehanika.** Trenutno: Učionica i Studio žuto, Poruke /
   Zajednica / Uči zajedno mastilo, Obaveštenja i admin papir. Ako Studio po tebi nije „ovde ti radiš"
   nego „ovde ti se javlja stanje", promena je jedan red u `lib/dashboard-zones.ts` — a test će ti reći
   da si je napravio (očekuje tačno `["classroom", "studio"]` za žuto).
4. **Pozdrav je sada rukopisom na tri ekrana.** Proveri kako Patrick Hand izgleda sa dugim imenom na
   telefonu (`/app`, `/app/classroom`, stranica kursa) — `type-display-sm` je clamp 24→30px, pa se
   prelama, ne seče.
5. **Player: telo lekcije je centrirano i uže (`max-w-3xl`).** Ako imaš lekciju sa širokim tabelama ili
   snimkom ekrana, proveri da ti 768px nije tesno — to je jedan `max-w-3xl` u `course-player.tsx`.
6. **„Ovde si" i redni brojevi u spisku lekcija** vide se tek kad otvoriš prekidač kursa u sidebar-u,
   na ekranu lekcije. Zatvorena kartica sada piše „Lekcija 3 od 8" umesto samo „Lekcija".
7. **Nije provereno u pregledaču.** Kao i U10 — sve je verifikovano kroz typecheck / lint / test /
   build i kroz izgrađen CSS, ali nijedan piksel nije viđen. Prioritet za pogled u obe teme i na
   telefonu: `/app`, `/app/classroom`, jedna lekcija (`/app/classroom/courses/.../lessons/...`) i
   zaključana kartica u katalogu.
8. **Poznat dug koji U11 nije dirao:** (a) dva gola heksa iz U10 tačke 7 su i dalje tu; (b)
   `/app/credits`, `/app/profile`, `/app/billing` i dalje nemaju `h1`; (c) naslov lekcije u playeru je
   `<p>`, a ne `<h1>` — semantička promena je van „nula promena ponašanja"; (d) 21 fajl sa dva ili više
   punih žutih dugmadi (U10 tačka 5) i dalje čeka proizvodnu odluku koje je od njih primarno.


## U12 - Doslednost preko svih app ekrana: Zajednica, Admin, Studio, Poruke   (2026-08-30 05:30)

**Fajlovi:**

*Dodato:*
- `lib/surface-accents.test.ts` (4 testa; regresioni čuvar rečnika tvrdih senki i
  školskih podloga — nema modul, isti obrazac kao „letter-spacing" test iz U10)

*Izmenjeno (nosivo):*
- `app/globals.css` — nova `.ink-dots` klasa (žuti parnjak `sketch-grid`-a, za hero na mastilu)
- `lib/admin-content-tree.ts` + `lib/admin-content-tree.test.ts` — `contentStatusTone`,
  `contentStatuses` (+6 testova)
- `components/app/community-v2/community-shell.tsx` — hero Zajednice prepisan po
  obrascu pozdravnog heroja komandne table
- `components/app/community-v2/community-shared.tsx` — `ThreadCard` (ritam, meta red,
  grupe akcija, tokeni umesto heksova), `LearningSpine`, `ScopeTrail`, kostur
- `components/app/community-v2/community-discussions.tsx` — glasanje kao JEDNA kontrola,
  komentari odvojeno, traka filtera i zaglavlja sekcija
- `components/app/admin-content-manager.tsx` — boje statusa, `StatCard` kao prozor
  komandne table, ritam tri liste, `HandUnderline` u zaglavlju
- `components/app/studio-page.tsx` — U10 skala + `Button`/`LinkButton` primitivi (`PILL` obrisan)
- `components/app/studio-media-grid.tsx` — tri prazna stanja kroz `EmptyState` primitiv
- `components/studio/studio-composer.tsx`, `components/studio/model-picker.tsx` — skala, radiusi
- `components/app/intro-panel.tsx` — školska podloga + ritam koraka
- `components/app/chat/chat-inbox.tsx`, `chat-thread.tsx`, `chat-composer.tsx`,
  `messages-hub.tsx`, `study-hub.tsx` — razmaci, baloni, composer, prazna stanja, dugmad
- `components/ui/primitives.tsx` — `BrandMark` dobio boju i odmak fokus prstena

*Izmenjeno (samo sweep senki / tokena):* `admin-inline-actions.tsx`, `community-comments.tsx`,
`community-filters.tsx`, `community-leaderboard.tsx`, `community-mentions.tsx`,
`community-my-threads.tsx`, `help-settings.tsx`, `member-profile.tsx`,
`app/[locale]/app/studio/page.tsx`, `app/[locale]/app/studio/m/[jobId]/page.tsx`.

**Šta je urađeno:**
Korak nije uvodio nov izgled nego je zatvarao razlike između zona koje su U10 i U11 već
uredile i onih koje nisu. **(1) Zajednica:** hero je prestao da bude sopstveni recept i dobio je
tačno isti sklop kao pozdravni hero komandne table — školska podloga, vodeni žig od uvećane
lucide ikone, `etiketa → mt-2 naslov → mt-1 potez → mt-3 pasus`, `p-4 sm:p-6`. Kartica teme
ima jedan padding (`p-4` umesto `p-3 sm:p-4`), meta red na jednoj lestvici (14/12/12 kroz uloge
umesto tri različita `text-*` recepta) i **dve jasno razdvojene grupe akcija**: glasanje je sada
JEDNA kontrola u zajedničkoj piluli (gore / rezultat / dole), komentari stoje pored nje kao
zasebno dugme sa okvirom, a „podeli / sačuvaj" su druga grupa na jedan korak većem razmaku.
**(2) Admin:** boja značke statusa je preokrenuta po zahtevu koraka (objavljeno = žuto, nacrt =
tiho uz `ink-hatch` na redu, arhiva = obična pilula), pravilo je izmešteno u `lib/` sa testom,
pregled stanja na vrhu je prepisan u isti sklop kao prozor komandne table (školska mreža,
pločica sa ikonom iz `lib/dashboard-zones.ts`, etiketa pa brojka), a tri liste su na U10 ritmu.
**(3) Studio:** `studio-page` je prešao sa 8 ručnih tipografskih recepata na skalu, `PILL`
konstanta je obrisana jer su svih pet dugmadi sada `Button`/`LinkButton` primitiv, a tri ručno
složena prazna stanja mreže su zamenjena `EmptyState` primitivom — filter bez pogodaka je time
dobio naslov koji je do sada gutao. Uvodni panel je dobio istu školsku podlogu kao hero.
**(4) Sweep:** 16 golih `rgba(244,190,48,α)` senki u **devet različitih alfi** (0.32 … 0.9) svedeno je na
`var(--yellow)`, čime je senka postala čitljivo pravilo („žuta = istaknuto, mastilo = obična
površina"), a novi test ne da da se gol zapis vrati. **(5) Poruke:** zaglavlje i telo inboxa
dele isti `p-4` (bili su 24 naspram 12, pa redovi nisu bili u ravni sa naslovom), balon je dobio
16/12 vazduha umesto 14/10, composer i traka poruka su na istom paddingu, a prazan inbox koristi
primitiv umesto ručnog bloka.

**Spisak mesta koja su poravnata (zahtev §4):**

| šta | gde | pre | posle |
| --- | --- | --- | --- |
| Zaglavlje zone | `community-shell` hero | `p-4`, `type-hero` + `truncate` | `p-4 sm:p-6`, `type-h1`, potez, vodeni žig |
| Zaglavlje zone | `messages-hub`, `study-hub` | bez `HandUnderline` | žuti potez kao svaka druga zona |
| Zaglavlje zone | `AdminPageFrame` | bez `HandUnderline` | žuti potez |
| `SectionHeader` | `/app/studio`, `/app/studio/m/[jobId]` | bez `underline` | `underline` (svih 7 app zaglavlja isto) |
| Dugme | `studio-page` × 5 (`PILL`) | ručni recept | `Button` / `LinkButton` |
| Dugme | `studio-media-grid` × 3 | ručni recept | `Button` |
| Dugme | `chat-inbox` × 6 | ručni recept | `Button` |
| Dugme | `messages-hub` × 2 | ručni recept | `Button` / `LinkButton` |
| Dugme | `community-discussions` „Nova diskusija" | `min-h-10`, `shadow-hard-16` | `min-h-11`, `shadow-hard` |
| Senka | 16 mesta u 10 fajlova | `rgba(244,190,48,0.32…0.9)` | `var(--yellow)` |
| Senka | `study-hub:431` | `rgba(112,167,207,0.45)` | `var(--shadow-hard-15)` |
| Senka | `community-comments` korisan komentar | mek `0 8px 24px` sjaj | tvrda `4px_4px_0_0_var(--yellow)` |
| Fokus | `BrandMark` | `outline-2` bez boje i odmaka | pun recept (`outline-2/offset-2/ink`) |
| Podloga | `intro-panel` | ravna bela | `sketch-grid` kao hero |
| Ritam | `ThreadCard` | `p-3 sm:p-4`, `gap-2.5`, `mt-1.5`, `mt-0.5` | `p-4`, `gap-3`, `mt-2`, `mt-1` |
| Ritam | `NavSection` (admin) | `mt-2.5`, `py-2.5`, `mt-0.5` | `mt-3`, `py-3`, `mt-1` |
| Ritam | chat inbox / thread / composer | `p-4 sm:p-6` vs `p-3 sm:p-4` vs `p-3` | svuda `p-4` |
| Ritam | balon poruke | `px-3.5 py-2.5`, `mt-1.5` | `px-4 py-3`, `mt-2` |
| Ritam | `studio-composer` traka | `p-3 sm:p-4`, `mb-2.5` | `p-4`, `mb-3` |
| Skala | `studio-page` × 8 | `text-2xl/xl/base/sm/xs` | `type-h1/h2/h3/body/body-sm/caption` |
| Skala | `studio-composer` × 4 | `text-[8px]/[10px]/xs` + `tracking-*` | `type-eyebrow` / `type-eyebrow-sm` |
| Skala | `ThreadCard` meta red | `text-sm` + `text-xs` × 2 | `type-body-sm` + `type-caption` × 2 |
| Skala | `chat-inbox` red | `text-sm`, `text-xs` | `type-body-sm`, `type-caption` |
| Radius | `rounded-lg` × 2 (studio popover) | Tailwind alias | `surface-inset` |
| Radius | 12 `rounded-[Npx]` u fajlovima koje korak ionako menja | bracket zapis | `surface-card/inset/media` |
| Boja | `#eef3f7`, `#dcecf1`, `#164d7d`, `#d7a91b`, `#fffaf0`, `#d7e9f5` (11 mesta) | gol heks | `bg-ink/5`, `bg-blue-mid/25`, `text-blue-mid`, `bg-yellow/10` |
| Prazno stanje | `studio-media-grid` × 3, `chat-inbox` × 1 | ručni blok | `EmptyState` primitiv |

**ODLUKE:**

1. **Boja značke statusa je preokrenuta u odnosu na U6 — korak to izričito traži.** U6 je nacrt
   namerno obojio najglasnijim tonom (`ink`) uz obrazloženje „to je jedino stanje koje studenti NE
   vide". U12 §2 traži suprotno: „draft = ink-hatch/muted, published = žuta". Zahtev je noviji i
   pobeđuje, a i koherentniji je sa ostatkom proizvoda: žuta je svuda „ovo je živo, ovo radi"
   (primarno dugme, aktivna zona, čelo trake napretka), pa je objavljen sadržaj — jedino stanje
   koje student stvarno vidi — dobio baš nju. Nacrt ništa nije izgubio: red ga i dalje nosi kroz
   `ink-hatch` šrafuru, što je isti signal, samo tiši. **Pravilo je izmešteno u
   `lib/admin-content-tree.ts` sa testom**, da sledeći korak ne bi tiho vratio staro.
2. **Arhiva je `neutral`, a ne `muted`.** Korak imenuje samo nacrt i objavljeno. Da su i nacrt i
   arhiva ostali `muted`, dva mrtva stanja izgledala bi identično, a admin ih razlikuje (arhivirano
   se ne može objaviti klikom, nacrt može). Test to i čuva.
3. **Žuta značka „Objavljeno" na izabranom (žutom) redu ostaje žuta.** Izabran red u navigatoru je
   `bg-yellow`, pa je značka na njemu ista boja kao podloga — čita se kroz `border-2 border-ink`, ali
   je ravna. Alternativa je bila da se promeni afordansa izbora, a to je promena ponašanja izbora
   koju korak ne traži. Prijavljeno dole za pogled u pregledaču.
4. **`StatCard` „Nacrt" značka više nije uslovna.** Bila je `tally.draft > 0 ? "ink" : "muted"`, tj.
   ista značka je menjala boju po vrednosti. To je bilo u sukobu sa zahtevom „status Badge boje
   dosledne" — boja sada znači STATUS, ne količinu. Signal „ima nacrta" nosi sam broj pored reči.
5. **Žute senke su svedene na `var(--yellow)`, ne na nov `--shadow-yellow` token.** `globals.css`
   izričito kaže „`--shadow-hard` je JEDINI token za nove površine... Ne dodaj nove", pa nisam
   proširivao porodicu. `var(--yellow)` je već bio u upotrebi kao boja tvrde senke
   (`LinkButton tone="ink"`), tema-nezavisan je (žuta se ne menja u tamnoj), i time senka postaje
   PRAVILO umesto ukrasa: **žuta senka = istaknuta površina, mastilo = obična.** Sve senke rastu
   punom žutom umesto devet alfi između 0.32 i 0.9 — na zakačenoj temi, nepročitanom obaveštenju,
   prvom mestu rang liste i korisnom komentaru je to primetno glasnije nego juče (vidi dole).
6. **`components/ui/primitives.tsx` (`LinkButton tone="smoke"`) je izuzet iz sweep-a senki.** Ta
   varijanta se renderuje i na marketing stranicama, koje run izričito ne dira. Njena tiha žuta
   senka (0.25 svetla / 0.2 tamna) ostaje kao dokumentovan izuzetak — i tako je zapisan u testu.
7. **`ink-dots` je nova klasa u `globals.css`, ne Tailwind arbitrary vrednost.** Hero Zajednice
   stoji na mastilu, pa `sketch-grid` (mastilo na 6%) tamo doslovno ne postoji — trebala mu je žuta
   varijanta. Ista vrednost kao pre (22% žute, korak 24px), samo izvedena iz tokena kroz `color-mix`,
   po uzoru na `sketch-grid`/`ink-hatch`. Provereno u izgrađenom CSS-u: pravilo postoji, sa istim
   `@supports` fallback-om koji `sketch-grid` već ima.
8. **Naslov heroja Zajednice je spušten `type-hero` → `type-h1` i izgubio `truncate`.** U10 je ovo
   sam prijavio kao najrizičnije mesto („dug naslov zone može da se seče ranije"), a korak traži
   heroje doslednog stila sa dashboard herojem — čiji je naslov `type-h1`. Time je i sečenje rešeno:
   duga rečenica se sada prelama umesto da nestane iza `truncate`.
9. **Redovi inboxa su ostali na `p-3`.** Podigao sam kontejner i zaglavlje na `p-4`, ali NE i sam
   red: U10 ODLUKA 12 je već izmerila da inbox mora da pokaže što više razgovora bez skrola. 12→16px
   po redu je +80px na deset redova, što je taj argument obesmislilo.
10. **Sivi `text-sm` / `text-xs` bez `leading` NISU masovno prevođeni na skalu.** U10 ODLUKA 10 ih je
    svesno ostavila (postavljanje `line-height` na kontrolu menja njenu visinu = promena rasporeda).
    Preveo sam samo ona koja su deo mera koje korak imenuje: meta red kartice teme, red inboxa,
    tipografija `studio-page` i `studio-composer`, i sitni tekst u traci za grupne akcije Studija.
11. **`rounded-[Npx]` → `surface-*` NIJE rađeno kao sweep.** U8 ODLUKA 4 je zapisala da je bracket
    zapis na sankcionisanoj vrednosti „već na skali, samo nije kanonski", i da je masovno prebacivanje
    nepotreban diff. Preveo sam samo 12 mesta u fajlovima koje sam ionako prepisivao (AGENTS.md:
    „migrate them when you are already editing the file"), i nijedno van njih.
12. **Preostalih ~40 golih heksova u app obimu NIJE dirano.** Svaki od njih ima `dark:` override, pa
    radi u obe teme, i svi su preživeli U8 sweep koji je bio baš za boje. Njihova tokenizacija je
    zaseban, veći zahvat (nove tokene za bledoplavu, bledozelenu i bledocrvenu paletu obaveštenja) i
    ne spada u „doslednost zaglavlja, dugmadi, senki i fokusa". Popisani su dole.
13. **`focus-visible:outline-offset-1` (7 mesta) je ostavljen.** To su ikonice u zbijenim grupama
    (glasanje, meni komentara); na `offset-2` bi se prstenovi susednih dugmadi dodirivali. Odstupanje
    je opravdano i lokalno, a jedino stvarno nepotpuno mesto (`BrandMark`, bez boje i odmaka) je
    dopunjeno.
14. **Prazan inbox je dobio NOVU rečenicu.** „Ovde je za sada mirno." nije imala telo, a `EmptyState`
    primitiv traži rečenicu sa sledećim korakom. Napisana je po istom pravilu kao prazna stanja iz
    U11: kratko, srpski bez žargona, i kaže šta da uradiš. Ovo je jedini nov UI string u koraku.
15. **Redosled i ponašanje nisu dirani nigde.** Nijedan novi upit, nijedna nova ruta, nijedno dugme
    koje radi nešto novo. Jedine promene u DOM-u su omotači bez semantike (podloga, `relative`) i
    zamena ručnog bloka primitivom sa istim sadržajem i istim rukovaocima.

**Testovi:**
- `lib/admin-content-tree.test.ts` (+6 testova): objavljeno je žuto; nacrt je tih; arhiva se
  razlikuje od nacrta; žuto je rezervisano tačno za objavljeno; svaki status ima ton iz sankcionisane
  liste; ton se ispravno izvodi i za lekcije koje nose samo `isPublished`, ne `status`.
- `lib/surface-accents.test.ts` (nov, 4 testa): nijedan app `.tsx` ne piše žutu senku kao gol
  `rgba(244,190,48,…)` (uz dokumentovan izuzetak `components/ui/primitives.tsx`); skener stvarno vidi
  fajlove (inače bi test prolazio prazan); `.ink-dots` postoji u `globals.css` i izvodi se iz
  `var(--yellow)`, ne iz golog rgba; `.sketch-grid` ostaje mastilo, pa dve podloge nisu ista stvar.
- Nijedan postojeći test nije menjan ni uklonjen.

**Rezultat verifikacije:**
- `npm run typecheck` — **PROŠLO** (exit 0)
- `npm run test` — **PROŠLO**, 90 fajlova / **1198 testova** (bilo 89 / 1188; +1 fajl, +10 testova)
- `npm run lint` — **exit 1, identično baseline-u**: `178 problems (1 error, 177 warnings)`, ista
  pred-postojeća greška `studio-composer.tsx:1112` (`useEffectEvent`, postoji od U1; ta linija nije
  dirana). Nijedan nov nalaz ni u jednom od 27 dirnutih fajlova — dva upozorenja koja je korak sam
  napravio (`cn` u `studio-page.tsx`, `Link` u `messages-hub.tsx`, oba osirotela mojim izmenama)
  odmah su i uklonjena, po AGENTS.md pravilu 3.
- `npm run build` — **PROŠLO** (`Compiled successfully`, 74/74 statičke stranice).
- Convex fajlovi nisu dirani (`git diff --stat -- convex/` prazan) → `npx convex codegen` nije pokretan.
- Provereno u **izgrađenom CSS-u** da svaka nova klasa stvarno postoji: `.ink-dots` (sa `@supports`
  fallback-om, isto kao `.sketch-grid`), `.sketch-grid`, `.surface-card/inset/media`,
  `.type-eyebrow-sm`, `text-blue-mid`.
- Mehanička provera sudara sa tipografskom skalom posle svake izmene: **0 sudara** — nijedna
  `type-*` uloga ne stoji uz `text-<veličina>`, `leading-*`, `tracking-*`, `uppercase` ni drugu ulogu,
  ni u `className`, ni u granama `cn(...)`, ni kao `sm:` varijanta (skenirano celo `.tsx` stablo).
- Tamna tema je provedena kroz tokene, ne pretpostavku: svaka nova boja je `--yellow` (tema-nezavisna),
  `--ink`/`--paper-strong` sa alfa modifikatorom, `--blue-mid` (ima tamni parnjak od U8) ili
  `--shadow-hard-*` (ima tamni parnjak). Vodeni žig na heroju Zajednice je `text-paper-strong/10` na
  `bg-ink` — u obe teme to je tih otisak u boji suprotnoj od podloge.

**Za Jovana ujutru:**
1. **Boja značke statusa u adminu je preokrenuta (ODLUKA 1) — ovo je jedina izmena koja svesno
   poništava raniju odluku (U6).** Otvori `/app/admin/content`: objavljeno je sada žuto, nacrt tih uz
   šrafuru na redu, arhiva obična pilula. Ako ti se ne dopada, izmena je **jedan red** u
   `lib/admin-content-tree.ts` — i test će ti odmah reći da si je napravio.
2. **Značka „Objavljeno" na IZABRANOM redu je žuto-na-žuto (ODLUKA 3).** Izabran red je `bg-yellow`,
   pa značka na njemu ima samo crni okvir. Pogledaj kako to izgleda uživo; ako smeta, najmanja
   izmena je da izabran red pređe na `bg-yellow/40`.
3. **Žute senke su sada pune, ne prigušene (ODLUKA 5).** Najprimetnije na: zakačenoj temi u Zajednici,
   nepročitanom obaveštenju (`/app/community/mentions`), prvom mestu rang liste, korisnom komentaru i
   heroju Zajednice. To je namerno — senka sada nosi značenje („žuta = istaknuto"). Ako je negde
   preglasno, sve ide preko jednog obrasca `shadow-[Npx_Npx_0_0_var(--yellow)]`.
4. **Hero Zajednice je najveća pojedinačna vizuelna promena.** Naslov je manji (`type-h1` umesto
   `type-hero`), ali se više NE seče na srednjim širinama, i dobio je vodeni žig i `p-4 sm:p-6`.
   Pogledaj `/app/community/discussions` u obe teme i na telefonu.
5. **Poruke: baloni i redovi su za korak prostraniji.** Balon 14→16px unutra, zaglavlje inboxa
   24→16px, telo inboxa 12→16px. Redovi su sada u ravni sa naslovom iznad njih, što ranije nisu bili.
   Proveri `/app/messages` na uskom ekranu (inbox kolona je ~340px na `xl`).
6. **Studio: `PILL` konstanta više ne postoji** — svih pet dugmadi je `Button`/`LinkButton`. Dugme
   „Prihvatam uslove" je time izgubilo tvrdu senku (primitiv je nema), a dobilo standardni `loading`
   spinner. Ako ti je senka nedostajala, dodaje se kroz `className` na tom jednom mestu.
7. **Prazna stanja Studija su sada ista kao svuda** (`/app/studio` bez ijedne generacije, i filter bez
   pogodaka). Filter bez pogodaka je do sada gutao svoj naslov — sada ga ima.
8. **Nije provereno u pregledaču.** Kao U10 i U11: sve je verifikovano kroz typecheck / lint / test /
   build, izgrađen CSS i mehaničke skenove, ali nijedan piksel nije viđen. Prioritet za pogled u obe
   teme i na telefonu: `/app/community/discussions`, `/app/admin/content`, `/app/studio`,
   `/app/messages`.
9. **Poznat dug koji U12 nije dirao (namerno, sa razlogom):** (a) **~40 golih heksova** u app obimu —
   svi imaju `dark:` override i svi su preživeli U8; tokenizacija traži nove tokene za bledoplavu /
   bledozelenu / bledocrvenu paletu obaveštenja (ODLUKA 12); najgušće je u `chat/study-hub.tsx` (14),
   `community-v2/*` (11) i `app-sidebar.tsx` (7, uključujući `#10b981` „Nadogradnja" iz U10 tačke 7);
   (b) `rounded-[Npx]` bracket zapis ostaje kao stil (ODLUKA 11, U8 ODLUKA 4); (c) `/app/credits`,
   `/app/profile`, `/app/billing` i dalje nemaju `h1`; (d) **21 fajl sa dva ili više punih žutih
   dugmadi** (U10 tačka 5, U11 tačka 8d) — koje je od njih primarno je i dalje proizvodna odluka koju
   nisam donosio bez tebe; (e) `px-*`/`py-*` parovi i dalje nisu na lestvici 4/6/8, samo `p-*`.
