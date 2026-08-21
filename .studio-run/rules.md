# Pravila za ovaj noćni run - važe za svaki korak

Radiš nenadzirano dok Jovan spava. Niko ne može da ti odgovori na pitanje.
Zato: kad naidješ na nejasnoću, izaberi najkonzervativniju opciju, NAPIŠI je u
`docs/STUDIO-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

## Obavezno pročitaj pre pisanja koda
1. `AGENTS.md` - posebno pravilo o 4 radiusa i "Simplicity First / Surgical Changes"
2. `convex/_generated/ai/guidelines.md` - obavezno pre bilo kog Convex koda
3. `docs/STUDIO-PLAN.md` - specifikacija celog Studija; ovo je izvor istine
4. `docs/STUDIO-PROGRESS.md` - šta su prethodni koraci već uradili (ako postoji)
5. Ako pišeš Next.js kod: `node_modules/next/dist/docs/` - ovaj Next ima
   breaking changes u odnosu na ono što misliš da znaš

## Apsolutne zabrane
- NE radi `git push`, `npx convex deploy`, `vercel deploy` - ništa ne ide na produkciju
- NE pozivaj `stripe` CLI niti bilo koji live Stripe API
- NE postavljaj Convex env varijable
- NE pravi UI komponente ni stranice (osim ako korak to izričito traži)
- NE menjaj postojeći subscription flow za kurseve tako da promeniš ponašanje -
  samo ga proširuješ
- NE "popravljaj" susedni kod koji nema veze sa tvojim zadatkom
- NE komentariši test i NE briši assertion da bi suite prošao

## Konvencije repoa koje moraš da pratiš
- Čista logika ide u `convex/<ime>Core.ts` (bez `ctx`, bez baze), testovi u
  `convex/<ime>.test.ts`. Uzor: `leaderboardCore.ts`, `profileActivityCore.ts`.
- Koristi `mutation` / `query` / `action` iz `./_generated/server` (kao `lab.ts`),
  ne `mutationGeneric` (stariji stil iz `billing.ts`).
- Koristi postojeće helpere iz `convex/helpers.ts`: `requireUserId`,
  `requireAdmin`, `requireCourseAccess`, `requireSyncSecret`.
- Indekse imenuj po poljima: `by_user_status`, `by_fal_request`, ...

## Definicija završenog koraka
Korak nije gotov dok sve tri komande ne prodju čisto:
    npx convex codegen
    npm run lint
    npm run test
Ako ne možeš da ih popraviš posle nekoliko pokušaja, upiši `BLOKADA:` u progress
fajl sa tačnom porukom greške i stani. Blokada je ispravan ishod - hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/STUDIO-PROGRESS.md`
```
## <ID koraka> - <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je uradjeno:** 3-6 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Testovi:** koje si napisao i šta pokrivaju
**Rezultat verifikacije:** codegen / lint / test - prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom greške
**Za Jovana ujutru:** šta mora ručno da uradi ili proveri zbog ovog koraka
```
Dopisuješ na kraj. Ne briši tudje sekcije.
