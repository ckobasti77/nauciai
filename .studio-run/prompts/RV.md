Ne piši nove feature. Ovo je revizija svega što je noćas uradjeno.

1. Pusti `npx convex codegen`, `npm run lint`, `npm run test` i zabeleži TAČAN
   izlaz svake komande.
2. Pusti `git log --oneline` za ovu granu i `git diff --stat main...HEAD`.
3. Pročitaj `docs/STUDIO-PROGRESS.md` u celini.
4. Pročitaj sav novi kod u `convex/credits.ts`, `convex/creditsCore.ts`,
   `convex/studio.ts`, `convex/falWebhook.ts`, `app/api/stripe/webhook/route.ts`.

Onda napiši `docs/STUDIO-NIGHT-REPORT.md` sa ovim sekcijama:

**STANJE** - koji koraci su završeni, koji blokirani, koji nisu ni počeli.

**RIZICI PO NOVAC** - prodji kroz svaki put kojim kredit može da se izgubi ili
udvostruči i reci da li je pokriven testom. Napiši nalaz za svaku od ovih 6:
  a) rezervacija bez posla (mutacija pukla posle spend-a)
  b) posao bez rezervacije
  c) dupli refund na fal retry-ju
  d) dupla dodela na Stripe retry-ju
  e) posao koji zauvek visi u `running` (ima li reaper - ako nema, reci)
  f) klijent koji pošalje lažnu cenu

**NEDOSLEDNOSTI** - sve gde se kod razlikuje od `docs/STUDIO-PLAN.md`, i da li
je odstupanje opravdano.

**RUČNI KORACI ZA JOVANA** - numerisana lista svega što mora sam da uradi
(Stripe price ID-jevi, env varijable, Stripe event tipovi, fal nalog...).
Za svaku stavku tačna komanda ili tačan put kroz dashboard.

**ŠTA NIJE URADjENO** - sve iz Faze A što je ostalo (UI koraci, persistOutput,
retencija) sa procenom koliko još treba.

Budi strog. Ako je nešto klimavo, napiši da je klimavo. Bolje da Jovan ujutru
zna gde je tanko nego da otkrije kad naplati prvi evro.

Na kraju dopiši sekciju i u `docs/STUDIO-PROGRESS.md`, kao svaki drugi korak.
