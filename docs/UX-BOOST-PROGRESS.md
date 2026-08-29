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
