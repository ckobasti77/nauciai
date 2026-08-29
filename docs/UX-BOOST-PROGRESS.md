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
