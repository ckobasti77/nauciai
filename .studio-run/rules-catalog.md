# Pravila za katalog run - važe za svaki korak

Radiš nenadzirano. Kad naidješ na nejasnoću: izaberi najkonzervativniju opciju,
upiši je u `docs/STUDIO-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

Grana `feat/studio-faza-a` već sadrži ceo Studio: ledger, rezervaciju kredita,
Stripe, fal klijent, cronove, mock provajdera i četiri stranice. Ti to
proširuješ na tri provajdera i pun katalog. **Ne pišeš ništa ispočetka.**

## Obavezno pročitaj pre pisanja koda
1. `docs/STUDIO-CATALOG-V4.md` - **izvor istine za ovaj ceo run.** Cene, rute,
   ulazni režimi, zamke. Čitaš ga PRVI i u celini.
2. `docs/STUDIO-DAY-REPORT.md` - tačne putanje i brojevi linija postojećeg koda.
3. `AGENTS.md` - 4 radiusa, "Simplicity First", hirurške izmene.
4. `convex/_generated/ai/guidelines.md` - pre bilo kog Convex koda.
5. `docs/STUDIO-PROGRESS.md` - šta su prethodni koraci uradili.
6. Za Next.js kod: `node_modules/next/dist/docs/`. Nije opciono.

## Apsolutne zabrane
- NE radi `git push`, `npx convex deploy`, `vercel deploy`
- NE pozivaj live Stripe, fal, Google ni BytePlus API
- NE postavljaj Convex env varijable
- NE menjaj ponašanje postojećeg subscription flow-a za kurseve
- NE "popravljaj" susedni kod koji nema veze sa zadatkom
- NE komentariši test i NE briši assertion da bi suite prošao

## Cene - tvrdo pravilo
Cene se prepisuju iz `docs/STUDIO-CATALOG-V4.md` TAČNO. Ne računaš ih ponovo,
ne zaokružuješ drugačije, ne "popravljaš" ono što ti deluje čudno. Tabele su
izvedene iz cena povučenih sa provajdera i svaka je proverena. Ako naidješ na
nešto što ti deluje kao greška u katalogu, upiši to u ODLUKE i **koristi
vrednost iz kataloga**.

## Konvencije repoa
- Čista logika u `convex/<ime>Core.ts` (bez `ctx`), testovi pored.
- `mutation`/`query`/`action` iz `./_generated/server`.
- Helperi iz `convex/helpers.ts`: `requireUserId`, `requireAdmin`, `requireSyncSecret`.
- Indeksi imenovani po poljima.

## UI pravila
- **Radiusi, samo 4:** `surface-card` 16px, `surface-inset` 12px,
  `surface-media` 8px, `rounded-full`. Nikad `rounded-*!` ni inline stil.
- Uklopi se u postojeće stranice; ne uvodi nov dizajn jezik.
- Bilingvalno sr/en.
- Realtime preko `useQuery`, nikad `setInterval` za status posla.
- Cena uvek na dugmetu, i uvek prati trenutne parametre.
- Prazna stanja i poruke grešaka se pišu, ne zaboravljaju.

## Definicija završenog koraka
Sve četiri moraju da prodju čisto:
    npx convex codegen
    npm run lint
    npm run test
    npm run build
Neiskorišćen import je greška koju si ti napravio - popravi je, ne prijavljuj
čist rezultat. Ako ne uspeš posle nekoliko pokušaja, upiši `BLOKADA:` sa
tačnom porukom greške i stani na tom koraku.

## Na kraju SVAKOG koraka dopiši u `docs/STUDIO-PROGRESS.md`
```
## <ID> - <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je uradjeno:** 3-6 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Testovi:** koje si napisao i šta pokrivaju
**Rezultat verifikacije:** codegen / lint / test / build
**BLOKADA:** nema - ili tačna poruka greške
**Za Jovana:** šta mora ručno da uradi ili proveri
```
Dopisuješ na kraj, ne brišeš tudje sekcije.
