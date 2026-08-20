# Pravila za hard run - vaze za svaki korak

Radis nenadzirano. Kad naidjes na nejasnocu: izaberi najkonzervativniju opciju,
upisi je u `docs/STUDIO-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

Grana `feat/studio-faza-a` sadrzi ceo Studio: ledger, kredite, Stripe, tri
provajdera, katalog od 30 modela sa `paramSpec` i `priceRule`, deljene
komponente, sve stranice, globalni plafon troska i merenje trajanja iz zaglavlja.
**Ti zatvaras rupe, ne pises nista ispocetka i ne dodajes nijedan nov feature.**

Marza je algebarski osigurana na 2,5x i to ne smes da pokvaris: `computeCredits`
(`convex/studioPricing.ts:265-273`) radi `ceil(C * 216,25)` tacno jednom na kraju.
Ako ti izmena trazi da diras cenovni motor, stani i upisi zasto.

## Obavezno procitaj pre pisanja koda
1. `docs/STUDIO-FIX-REPORT.md` - **izvor istine za ovaj run.** Sekcija 2 su
   nalazi N1-N7 sa tacnim putanjama i brojevima linija, sekcija 5 je lista
   onoga sto blokira naplatu. Citas ga PRVI.
2. `docs/STUDIO-CATALOG-V4.md` - katalog, cene, ulazni rezimi.
3. `AGENTS.md` - 4 radiusa, "Simplicity First", hirurske izmene.
4. `convex/_generated/ai/guidelines.md` - pre bilo kog Convex koda.
5. `docs/STUDIO-PROGRESS.md` - dnevnik.
6. Za Next.js kod: `node_modules/next/dist/docs/`. Nije opciono.

## Apsolutne zabrane
- NE radi `git push`, `npx convex deploy`, `vercel deploy`
- NE pozivaj live Stripe, fal, Google ni BytePlus API
- NE postavljaj Convex env varijable
- NE menjaj ponasanje postojeceg subscription flow-a za kurseve
- NE diraj cenovni motor `convex/studioPricing.ts` osim gde korak to izricito trazi
- NE "popravljaj" susedni kod koji nema veze sa zadatkom
- NE komentarisi test i NE brisi assertion da bi suite prosao

## Konvencije repoa
- Cista logika u `convex/<ime>Core.ts` (bez `ctx`), testovi pored.
- `mutation`/`query`/`action` iz `./_generated/server`.
- Helperi iz `convex/helpers.ts`: `requireUserId`, `requireAdmin`, `requireSyncSecret`.
- Indeksi imenovani po poljima.
- Radiusi: samo `surface-card`, `surface-inset`, `surface-media`, `rounded-full`.

## Definicija zavrsenog koraka
Sve cetiri moraju da prodju cisto:
    npx convex codegen
    npm run lint
    npm run test
    npm run build
Neiskoriscen import je greska koju si ti napravio. Ako ne uspes posle nekoliko
pokusaja, upisi `BLOKADA:` sa tacnom porukom greske i stani na tom koraku.

## Na kraju SVAKOG koraka dopisi u `docs/STUDIO-PROGRESS.md`
```
## <ID> - <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Sta je uradjeno:** 3-6 recenica
**ODLUKE:** svaka nejasnoca koju si sam resio i zasto
**Testovi:** koje si napisao i sta pokrivaju
**Rezultat verifikacije:** codegen / lint / test / build
**BLOKADA:** nema - ili tacna poruka greske
**Za Jovana:** sta mora rucno da uradi ili proveri
```
Dopisujes na kraj, ne brises tudje sekcije.
