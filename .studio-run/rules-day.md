# Pravila za dnevni run - važe za svaki korak

Radiš nenadzirano dok je Jovan na poslu. Niko ti ne može odgovoriti na pitanje.
Kad naidješ na nejasnoću: izaberi najkonzervativniju opciju, upiši je u
`docs/STUDIO-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

Grana `feat/studio-faza-a` već sadrži ceo backend iz noćnog run-a (koraci
A1-A10). Ti ga popravljaš i oblačiš u UI. Ne pišeš ga ispočetka.

## Obavezno pročitaj pre pisanja koda
1. `docs/STUDIO-NIGHT-REPORT.md` - revizija sinoćnjeg rada. Tu su tačne
   putanje i brojevi linija za svaku rupu koju danas krpiš. Ovo čitaš PRVO.
2. `AGENTS.md` - naročito sistem od 4 radiusa i "Simplicity First".
3. `convex/_generated/ai/guidelines.md` - pre bilo kog Convex koda.
4. `docs/STUDIO-PLAN.md` - specifikacija; sekcija 2.3 su cene, 4.x arhitektura.
5. `docs/STUDIO-PROGRESS.md` - dnevnik; šta su prethodni koraci uradili.
6. Za bilo koji Next.js kod: `node_modules/next/dist/docs/`. Ovaj Next ima
   breaking changes u odnosu na ono što misliš da znaš. Ovo nije opciono.

## Apsolutne zabrane
- NE radi `git push`, `npx convex deploy`, `vercel deploy`
- NE pozivaj Stripe CLI ni bilo koji live Stripe/fal API
- NE postavljaj Convex env varijable
- NE menjaj ponašanje postojećeg subscription flow-a za kurseve
- NE "popravljaj" susedni kod koji nema veze sa zadatkom
- NE komentariši test i NE briši assertion da bi suite prošao

## Pravila za UI korake - čitaj pažljivo, ovde se najviše greši
- **Radiusi, samo 4 vrednosti:** kartica `surface-card` (16px), ugnježden panel
  `surface-inset` (12px), medij `surface-media` (8px), pilula `rounded-full`.
  Ništa drugo. Nikad `rounded-*!` ni inline `style={{borderRadius}}`.
- **Prvo pogledaj kako izgledaju postojeće stranice**, pa se uklopi:
  `app/[locale]/app/billing/page.tsx`, `app/[locale]/app/community/page.tsx`,
  `app/[locale]/app/profile/page.tsx` i komponente u `components/`. Koristi iste
  primitive i isti raspored. Ne uvodi nov dizajn jezik.
- **Bilingvalno.** Svaka stranica je pod `[locale]`; svaki tekst ima sr i en
  varijantu, po obrascu koji repo već koristi.
- **Realtime, bez pollinga.** Convex `useQuery` je već pretplata - status posla
  se osvežava sam. Nikad `setInterval`.
- **Cena uvek na dugmetu.** Nikad skrivena. Dugme glasi "Generiši - 20 kr".
- **Prazna stanja se pišu, ne zaboravljaju.** Nema kredita, nema generacija,
  Studio pauziran, posao neuspeo - svaki ima svoj tekst i svoj sledeći korak.
- Server komponente po defaultu; `"use client"` samo gde stvarno treba.

## Definicija završenog koraka
Sve tri moraju da prodju čisto:
    npx convex codegen
    npm run lint
    npm run test
Za korake koji dodaju stranice ili komponente, i četvrta:
    npm run build
Ako ne uspeš posle nekoliko pokušaja, upiši `BLOKADA:` u progress fajl sa
tačnom porukom greške i stani na tom koraku. Blokada je ispravan ishod, hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/STUDIO-PROGRESS.md`
```
## <ID koraka> - <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je uradjeno:** 3-6 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Testovi:** koje si napisao i šta pokrivaju
**Rezultat verifikacije:** codegen / lint / test / build
**BLOKADA:** nema - ili tačna poruka greške
**Za Jovana:** šta mora ručno da uradi ili proveri
```
Dopisuješ na kraj, ne brišeš tudje sekcije.
