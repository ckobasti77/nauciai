Ne piši nove feature. Revizija svega što je danas uradjeno.

1. Pusti sve četiri verifikacione komande, zabeleži tačan izlaz.
2. `git log --oneline` za granu, `git diff --stat main...HEAD`.
3. Pročitaj sekcije P1-P10 u `docs/STUDIO-PROGRESS.md`.
4. Pročitaj `docs/STUDIO-NIGHT-REPORT.md` sekciju RIZICI PO NOVAC.

Napiši `docs/STUDIO-DAY-REPORT.md`:

**ZATVORENE RUPE** - za svaku od šest iz P1 plus tri crona iz P2: da li je
stvarno zatvorena, kojim kodom, i kojim testom. Ako je neka samo delimično,
reci to izričito. Prodji ponovo kroz listu a-f iz noćnog izveštaja i daj nov
status za svaku.

**NOVE RUPE** - šta je današnji rad otvorio. UI je nov napadni ugao: da li
neka stranica čita podatke koje ne bi smela, da li neki query vraća tudje
poslove, da li admin ekran proverava ulogu na serveru a ne samo u UI-ju, da li
`/api/stripe/plan` proverava sve što proverava `/api/stripe/credits`.

**ŠTA SE STVARNO VIDI** - iskreno: koje stranice postoje, koje rade sa mock
provajderom, koje traže podešavanje pre nego što išta urade. Bez ulepšavanja.

**PREOSTALO PRE PRVOG EVRA** - numerisano, sa procenom.

**PREPORUKA** - jedna rečenica: da li je ovo spremno da se pusti na produkciju
posle ručnog podešavanja, ili treba još jedan krug.

Budi strog. Jovan se vraća s posla i mora da zna gde je tanko.
Na kraju dopiši sekciju i u `docs/STUDIO-PROGRESS.md`.
