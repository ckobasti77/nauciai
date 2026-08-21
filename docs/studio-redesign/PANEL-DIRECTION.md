# Studio redizajn — fokusiran prolaz: panel podešavanja modela

> 21. avgust 2026 · grana `feat/studio-redesign`
> Fokusiran mini-prolaz (impeccable + ui-ux-pro-max + design-taste-frontend) samo
> nad drop-up panelom. Dijagnoza je nezavisno potvrðena kroz tri odvojena
> revizora (IA / komponente+a11y / craft) nad `studio-mockup.html`, plus spec za
> picker koji skalira na 30 modela. Nijedna linija produkcijskog koda nije
> dirnuta u ovom prolazu.
>
> Katalog je **30 modela** (8 slika / 13 video / 9 zvuk), sa familijama koje imaju
> po više varijanti. Flow ima 5 i sme da hardkoduje; mi ne smemo — panel se
> generiše iz `paramSpec`-a.

---

## 1. Dijagnoza — svih 8 stavki, provereno u kodu mockupa

Otvorio sam `studio-mockup.html` i tri nezavisna revizora su proverila svaku
stavku sa citatom iz koda. **Svih osam potvrðeno.**

| # | Tvrdnja | Verdikt | Dokaz (iz mockupa) |
|---|---|---|---|
| 1 | Model zakopan na sredini | **POTVRÐENO (high)** | DOM red `#panel`: type → mode → **ratio** → **model** (4.). `.model-select` deli isti border/radius/weight kao svaka druga kontrola; samo 14px vs 12–13px. A model preko `renderPanel`/`estimatePrice` odreðuje sve ostalo. |
| 2 | `model-menu` ravan spisak | **POTVRÐENO (high)** | `renderModelMenu` = `list.map(button)`. Nema `<input>` pretrage, nema familija, trenutni samo `.on` (nije zakačen na vrh). Latentno na 3 modela, fatalno na 30. |
| 3 | Cena se ne vidi na mestu odluke | **POTVRÐENO (high)** | Cena samo u `.credit-line` + `.price-chip` (dva agregata). Red modela: samo `${m.e} ${m.n}` (a `base` postoji u podacima). Ratio/broj/trajanje: nijedan `+N kr`. |
| 4 | Panel skače u visinu | **POTVRÐENO (high)** | `.panel{position:absolute;bottom:calc(100%+10px)}` + `modeSeg/durBlock/audioRow` na `display:none`. Sidro dole → panel raste NAVIŠE → sadržaj beži ispod kursora. Model-menu (`display:block`) je DRUGI skok. |
| 5 | Četiri reda labela | **POTVRÐENO (medium)** | `.panel-label` ×4 (Odnos/Model/Trajanje/Broj), ~26px svaki. A `typeSeg`/`modeSeg` nemaju labelu — dokaz da labele nisu strukturno nužne. |
| 6 | Ne vidi se šta model NE može | **POTVRÐENO (medium)** | Nepodržane opcije se NE renderuju (`renderRatios` mapira samo `S.model.ratios`; slajder `min/max` seče trajanje). Nijedan `disabled`, nijedan razlog. A `availableOptionValues` u produkciji to VEĆ računa. |
| 7 | Nema ponovljivosti | **POTVRÐENO (medium)** | `S` je efemerno; nema localStorage, presetova, last-used. Promena tipa čak resetuje model (`S.model=MODELS[type][0]`). |
| 8 | Nema tastature | **POTVRÐENO / PARTIAL (medium)** | Nema type-ahead, arrow-nav, prečice ni Escape. Nijansa (a11y revizor): nativni `<button>` daju Tab+Enter, pa „baseline" postoji — ali power-user tok (otvori, otkucaj deo imena, Enter) ne postoji. |

### Dodatni nalazi (van tvojih 8, vredni popravke)

- **Dependency inversion (high):** odnos stranica se bira PRE modela koji ga
  definiše — pa izbor često biva tiho prepisan (`if(!S.model.ratios.includes(S.ratio))…`).
  Red odluke mora biti **tip → model → ostalo**.
- **`×4` je podrazumevano = maksimalna cena (high):** panel se otvara na
  najskupljoj količini. Podrazumevano treba `×1`.
- **Žuto za selekciju krši identitet (high):** `.ratios/.count/.model-menu/.sw`
  `.on{background:yellow}`. Žuto je REZERVISANO za akciju i cenu; selekcija mora
  biti ink (kao `.seg`). Uz to, boja-jedini signal krši WCAG 1.4.1.
- **Nula ARIA (high):** model-select bez `aria-haspopup/expanded`, switch bez
  `role=switch/aria-checked`, selekcija samo preko `.on` klase. Nevidljivo za
  čitače ekrana. Mora u generator, jednom.
- **Sve ispod 44px na mobilnom (high):** na sheetu gde dodir najviše znači,
  ratio ~32px, count ~33px, switch 26px.
- **Emoji kao ikona modela (medium):** `🍌🎨✨🌀⚡` ubacuju nekontrolisanu boju u
  ink/krem sistem i izgledaju kao placeholder. Monohromni ink mark / inicijali.
- **Cena se menja tiho (medium):** `refreshPrice` menja tekst bez ijednog
  naglašavanja — a to je jedini broj koji treba da reaguje na odluku.
- **Slajder laže o diskretnim vrednostima (medium):** video obično nudi ~2
  trajanja, a `range` slajder implicira sva izmeðu. Tip kontrole treba da prati
  broj opcija (segmented za 2, slajder samo za pravi opseg).
- **Off-scale `.box` radius (low):** `border-radius:2px` — nova debt van skale.

---

## 2. Dva pravca za panel (oba rešavaju svih 8 + dodatne)

Bitno: **sve popravke iz spec-a su obavezne u OBA pravca** — cena po redu i
`+N kr` delte, disabled-with-reason, stabilna visina (fiksno sidro + interni
scroll, bez skoka), C4 carry-forward, preseti/last-used, ikone umesto labela gde
je univerzalno, 44px, ARIA, ink-selekcija (žuto samo za cenu/akciju), bez emoji
marka, procena→tačno, mobilni bottom-sheet. Pravci se razlikuju SAMO po tome
**gde i kako se bira model.**

### Pravac P1 — „Model prvi, jedan panel" (jedna površina koja se menja)

- Na vrhu panela **krupna kartica modela** — najveći element: monohromni familijski
  mark + ime (veliko) + značka + **cena (žuto)** + jedan red taglinea. Model JE
  odluka, pa je i najkrupniji.
- Dodir na karticu → ona se **na mestu širi** u pretragu grupisanu po familiji
  (input pretrage, trenutni + „nedavni" zakačeni na vrh, cena po redu, type-ahead
  + strelice + Enter). Kontrole klize ispod, ali panel ima **fiksnu max-visinu +
  interni scroll**, pa se composer i cena NE pomeraju.
- Ispod: tip/mode (mali, ikonični) → generisane kontrole (paramSpec redosled) sa
  `+N kr` deltama i disabled-with-reason → **cena zakačena dole** (krupna, ink,
  primarni broj), uvek preslikana i na bar.
- Promena modela se reconcile-uje na mestu (C4), status linija javlja izmene.
- **Šta se gubi:** spisak modela živi u istoj površini, pa njegovo otvaranje
  ipak pomera kontrole naniže (obuzdano internim scroll-om, ali region kontrola
  se prelije); na 9 kontrola + otvoren picker panel je scroll-težak. Najviše
  Flow-oliko, najmirnije za polaznika koji ne juri.

### Pravac P2 — „Birač + konzola" (dve površine)

- **Model se bira u posvećenom sloju** — prijateljski, pun-širinski overlay (NE
  developerski ⌘K izgled): pretraga prvo, familijske grupe, trenutni + nedavni
  zakačeni, cena po redu, **pun tastaturni tok** (type-ahead, strelice, Enter,
  Esc). Otvara ga čip modela ili prečica. Jedan posao: izaberi motor.
- **Parametri žive u kompaktnoj konzoli fiksne visine** (drop-up): tanak header
  trenutnog modela (mark + ime + značka + cena, dodir → otvara birač), pa
  generisane kontrole sa deltama + disabled-with-reason, cena zakačena dole.
  Konzola NIKAD ne sadrži spisak modela → **ne skače** dok pretražuješ modele
  (ubija „drugi skok").
- **Šta se gubi:** promena modela je veći gest (otvori overlay) nego P1-ov
  inline pogled; dve površine za naučiti; malo manje „sve na jednom mestu". Ali
  najbolje skalira na 30 modela + najjača tastatura + nula skoka u parametrima;
  izbor modela dobija pun fokus.

**Moja preporuka:** blaga ka **P2** — za 30 modela, tastaturu i stabilnost
parametara, razdvajanje „koji od 30" (problem pretrage) od „naštimuj ovaj"
(mali formular) je čistije i najbolje skalira. **P1** je mirniji, jedinstveniji i
najvverniji Flow-u; ako je publika prevashodno povremeni polaznik, P1 ima manje
trenja. (Hibrid postoji: P1-ova krupna kartica modela kao header konzole koji
otvara P2 overlay — reci ako ga hoćeš kao treću opciju.)

---

## 3. Kako panel radi na 3 kontrole i na 9 (isti generator)

Panel je JEDAN `map` preko `visibleControls(activeModel.paramSpec, inputMode)`
koji grana samo po `control.type` (7 tipova) — bez ijednog `if (slug === …)`.

- **3 kontrole** (npr. flat try-on: bez parametara; ili prosta slika:
  prompt + odnos + broj): panel je prosto KRATAK — header modela + tip + 2–3
  kontrole + cena. Bez praznog „napredno", bez ghost sekcija. Čita se namerno.
- **9+ kontrola** (npr. TTS: tekst + glas + stability/similarity/style/speed +
  jezik + format; ili Veo: rezolucija + zvuk + trajanje×2 + broj + odnos):
  (1) promoviši 2–3 najjače (`affectsPrice` + kind) na vrh; (2) ostatak pod
  najviše dve sekcije („Osnovno"/„Napredno", iz i18n tabele; napredno zatvoreno
  po difoltu); (3) telo panela **interno skroluje** sa fiksnom max-visinom, dok
  tip/mode ostaju zakačeni gore a cena dole. Slajderi u kompaktnim redovima
  (labela + vrednost u istom redu) da 5 slajdera ne preplavi panel.

Isti loop, ista pravila; razlika je samo koliko kontrola vrati `visibleControls`.
Kontrola-tip prati broj opcija: **segmented do ~4 opcije, inače `select`** (7
ratija ne sme kao 7 segmenata); slajder samo za pravi opseg, ne za 2 vrednosti.

---

## 4. Telefon (drop-up nema mesta)

- Drop-up → **pun-širinski bottom-sheet**: zaobljen vrh (card tier), 2px ink
  gornja ivica + tvrda senka, max-visina ~85vh, sopstveni scroll, drag-handle +
  drag-to-dismiss + scrim, iznad tastature kad je textarea u fokusu, safe-area.
- **Red bitnih čipova = zakačen vrh sheeta; cena + Generiši = zakačeno dno** —
  novac i akcija dohvatljivi palcem bez obzira na broj kontrola.
- **Gust model (9+) na telefonu:** dva „detent"-a (skupljeno: bitni čipovi +
  cena + Generiši; povuci gore za napredno) ILI „Osnovno/Napredno" segmenti —
  tako da je prvo uvek vidljivo cena + glavne poluge. Nikad svih 9 na punoj
  visini sa cenom van ekrana.
- Birač modela je i on bottom-sheet (P2) / inline u sheetu (P1). Textarea ≥16px
  (bez iOS zoom-on-focus), svi targeti ≥44px.

---

## 5. Mockup

`studio-mockup.html` je ažuriran: HUD dobija prekidač **Panel: P1 / P2**, spisak
je proširen na realan broj modela sa familijama/značkama/cenom po redu, dodati su
`+N kr` delte, disabled-with-reason (ugašeno sa razlogom), fiksna visina + interni
scroll (bez skoka), ink-selekcija (žuto samo cena/akcija), monohromni familijski
mark umesto emoji, red presetova/last-used, procena→tačno, prekidač **3-kontrole
/ 9-kontrola** i **mobilni sheet**. Klikni kroz oba pravca pre nego što izabereš.

---

## 6. Odluka koju tražim

**Koji pravac panela — P1 (model prvi, jedan panel) ili P2 (birač + konzola)?**
(Blaga preporuka: P2. Hibrid dostupan na zahtev.)

Posle izbora nastavljam redom: lib-defekti (2–3), pa sidebar (4) — i **stajem
posle sidebara** da vidiš prelaz uživo pre grida. Kapije posle svakog koraka.
