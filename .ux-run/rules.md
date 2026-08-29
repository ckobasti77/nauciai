# Pravila za ovaj noćni UX run - važe za svaki korak

Radiš nenadzirano dok Jovan spava. Niko ne može da ti odgovori na pitanje.
Kad naiđeš na nejasnoću: izaberi najkonzervativniju opciju, NAPIŠI je u
`docs/UX-BOOST-PROGRESS.md` pod "ODLUKE", i nastavi. Ne improvizuj tiho.

## Kontekst projekta
Nauči AI je platforma za učenje AI veština. Ciljna publika su studenti
POČETNICI koji slabo poznaju računare - svaki ekran mora da odgovori na
"šta sad da uradim", jednostavnim srpskim, bez žargona. Vizuelni identitet
(papir/mastilo/žuta, školski sketch fazon, Nunito + Patrick Hand, tvrde
ofset senke) se NE menja - pojačava se i čini doslednijim.

## Obavezno pročitaj pre pisanja koda
1. `AGENTS.md` - pravilo o 4 radiusa i "Simplicity First / Surgical Changes"
2. `convex/_generated/ai/guidelines.md` - obavezno pre bilo kog Convex koda
3. `docs/UX-BOOST-PLAN.md` - audit inventar (piše ga korak U1; postoji od U2 nadalje)
4. `docs/UX-BOOST-PROGRESS.md` - šta su prethodni koraci već uradili (ako postoji)
5. `docs/design-system-proposal.md` - izmereni dug (modali, fokus, hexovi)
6. Ako pišeš Next.js kod: `node_modules/next/dist/docs/` - ovaj Next ima
   breaking changes u odnosu na ono što misliš da znaš

## Apsolutne zabrane
- NE radi `git push`, `npx convex deploy`, `vercel deploy` - ništa na produkciju
- NE pozivaj `stripe` CLI niti bilo koji live Stripe API
- NE postavljaj Convex env varijable
- NE menjaj Convex šemu osim ako korak to izričito traži
- NE menjaj cene, checkout logiku, auth ni bezbednosna pravila - checkout samo
  POZIVAŠ kroz postojeće komponente (CheckoutButton)
- NE redizajniraj marketing stranice - one nisu tema ovog run-a
- NE "popravljaj" susedni kod koji nema veze sa tvojim zadatkom
- NE komentariši test i NE briši assertion da bi suite prošao
- NE uvodi nove npm zavisnosti bez stvarne potrebe (upiši ODLUKU ako moraš)
- NE koristi `rounded-*!` escape niti inline `borderRadius` (AGENTS.md)

## Konvencije repoa
- Radius: 4 sankcionisana tiera (surface-card 16 / surface-inset 12 /
  surface-media 8 / rounded-full). Ništa van toga.
- Boje: SAMO tokeni (--color-ink, --color-paper, --color-yellow, --color-muted,
  --color-line...). Nikad goli hex u className.
- Svaki UI string ide kroz `lib/i18n` (sr primaran, en sekundaran). Nijedan
  string hardkodovan u JSX bez t()/localized().
- Sve promene rade u OBE teme (svetla i tamna - proveri tokene, ne pretpostavljaj)
  i na mobilnom (bottom nav ostaje TAČNO 4 slota - komentar u kodu kaže zašto).
- Poštuj `prefers-reduced-motion` za svaku novu animaciju (vidi lib/motion-contract.ts).
- Čista logika u lib/ ili convex/<ime>Core.ts sa vitest testovima, po uzoru
  na postojeće parove fajl + fajl.test.ts.

## UX/UI skillovi u projektu (.claude/skills/)
Pored Convex skillova, projekat ima i UI skillove: `impeccable`,
`ui-ux-pro-max`, `design-taste-frontend`, `motion-design`.
- SVAKI korak koji menja izgled ili ponašanje UI-ja MORA pre pisanja koda da
  pročita `.claude/skills/impeccable/SKILL.md` i
  `.claude/skills/design-taste-frontend/SKILL.md`.
- Korak koji dodaje/menja animacije čita i `.claude/skills/motion-design/SKILL.md`.
- `ui-ux-pro-max` koristi ciljano (tipografija, palete, chart/dashboard obrasci)
  kad ti zatreba - ne čitaj ceo katalog napamet.
- VAŽNO: ako se savet skilla sudari sa brendom (papir/mastilo/žuta, školski
  sketch stil) ili sa AGENTS.md konvencijama (radiusi, senke, tokeni) - brend
  i AGENTS.md UVEK pobeđuju. Skillovi su alat za kvalitet, ne za promenu
  identiteta.

## Definicija završenog koraka
Korak nije gotov dok sve tri komande ne prođu čisto:
    npm run typecheck
    npm run lint
    npm run test
Ako si dirao Convex fajlove, prvo i: npx convex codegen
Ako ne možeš da ih popraviš posle nekoliko pokušaja, upiši `BLOKADA:` u progress
fajl sa tačnom porukom greške i stani. Blokada je ispravan ishod - hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/UX-BOOST-PROGRESS.md`
```
## <ID koraka> - <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je urađeno:** 3-6 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Testovi:** koje si napisao/menjao i šta pokrivaju
**Rezultat verifikacije:** typecheck / lint / test - prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom greške
**Za Jovana ujutru:** šta mora ručno da proveri zbog ovog koraka
```
Dopisuješ na kraj. Ne briši tuđe sekcije.
