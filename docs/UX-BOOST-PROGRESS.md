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
