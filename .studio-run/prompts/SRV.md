Ne piši nove feature. Revizija svega iz S0-S7.

1. Pusti sve četiri komande, zabeleži tačan izlaz.
2. `git log --oneline` i `git diff --stat main...HEAD`.
3. Pročitaj sekcije S0-S7 u `docs/STUDIO-PROGRESS.md`.
4. Pročitaj sav nov kod u `convex/providers/`, `convex/studioPricing.ts`,
   `convex/seed.ts`, `convex/studio.ts`, `convex/crons.ts` i nove komponente.

Napiši `docs/STUDIO-CATALOG-REPORT.md`:

**MARŽA** - za svaki uključen model **najgora kombinacija parametara** i njena
marža. Ne prosek - najgori slučaj. Označi crveno sve ispod 2,0x. Katalog od 30
modela sa po nekoliko desetina kombinacija je nekoliko stotina prilika za grešku
u ceni.

**JEDNA RAČUNICA** - potvrdi da `computeCostUsd` iz `convex/studioPricing.ts`
jedini računa cenu. Nadji svaku drugu računicu cene u projektu i prijavi je.
Potvrdi da UI i server dobijaju isti broj za iste parametre.

**RUTIRANJE** - za svaki model potvrdi da `provider` odgovara sekciji 7 kataloga.
Svako odstupanje je novac. Posebno proveri da Seedream 5 **Pro** ide na byteplus
a **Lite** na fal - to su različite rute za isto ime.

**SPECIFIKACIJE** - za svaki model potvrdi da `inputModes`, `inputSpec`,
`endpoints`, `paramSpec` i `priceRule` slažu medjusobno, i da UI nudi svaki
deklarisan režim.

**RIZICI PO NOVAC** - prodji ponovo a-f iz `docs/STUDIO-NIGHT-REPORT.md` i daj
nov status, plus nove puteve:
- može li klijent poslati vrednost parametra van `options`
- može li poslati `inputMode` koji model ne podržava
- može li vezati tudji `storageId`
- naplaćuje li se layerize po sloju, reference sa videom 0,6x, lipsync na 5s
- ostaje li posao da visi ako Google poller padne
- može li nepotpisan BytePlus callback lažno pomeriti posao

**ŠTA NIJE URADJENO** - numerisano, sa procenom.

**RUČNI KORACI ZA JOVANA** - svi ključevi, BytePlus aktivacija i $60
zaključanog balansa, Stripe cene, Ed25519 provera, fal plafon potrošnje.

**PREPORUKA** - jedna rečenica.

Budi strog. Dopiši i `## SRV` u progress.
