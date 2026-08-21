# Studio - demo za pet minuta

Ovo se izvršava od vrha do dole, bez razmišljanja. Sve je lokalno, na
`localhost`. Ništa nije deploy-ovano i ništa se ne naplaćuje.

Komande su za PowerShell iz korena repoa. Jednostruki navodnici oko JSON-a su
namerni: PowerShell tako prosleđuje dvostruke navodnike netaknute.

`<SYNC>` u komandama zameni vrednošću `WEBHOOK_SYNC_SECRET` iz `.env.local`
(ista je već postavljena i na dev Convex deploymentu).

---

## 1. Pokretanje - dva terminala

Terminal 1 (Convex backend, ostaje da radi):

```
npx convex dev
```

Terminal 2 (Next.js, ostaje da radi):

```
npm run dev
```

Otvori `http://localhost:3000`.

**`FAL_KEY` NIJE potreban.** Kad ga nema, `submitJob` automatski ide na mock
provajder: posao se završi za ~3 sekunde, izlaz je generisan SVG sa tvojim
promptom, i svaka generacija u galeriji nosi značku **DEMO**. Ništa ne izlazi
na mrežu i ništa se ne plaća.

---

## 2. Prijavi se

Prijavi se kao `jovanm028@gmail.com` (Google ili mejl). **Ovo mora pre koraka
4** - `grantDemoCredits` traži korisnika po mejlu i baca
`KORISNIK_NIJE_NADJEN` ako red u `users` još ne postoji.

Taj mejl je u `INITIAL_ADMIN_EMAILS`, pa ti odmah radi i admin ekran iz
koraka 5.6.

---

## 3. Seedovi - treći terminal, jednom

```
npx convex run seed:seedCreditPacks   '{"syncSecret":"<SYNC>"}'
npx convex run seed:seedModelCatalog  '{"syncSecret":"<SYNC>"}'
npx convex run seed:seedPlatformFlags '{"syncSecret":"<SYNC>"}'
```

Redom: 5 paketa/planova, 22 modela (8 slika uključeno, 14 video/audio isključeno
do Faze B/C), i kill switch `studio_enabled` postavljen na uključeno.

Ako u bazi još nema kurseva, i ovo (opciono, za korak 5.7):

```
npx convex run seed:seedInitialContent '{"syncSecret":"<SYNC>"}'
```

---

## 4. Dodeli sebi demo kredite

```
npx convex run seed:grantDemoCredits '{"syncSecret":"<SYNC>","email":"jovanm028@gmail.com","amount":2000}'
```

Vraća `Id<"creditLots">`. Lot je izvora `admin_grant`, važi 12 meseci, i **ne**
ulazi u `lifetimePurchased` (nije plaćen).

Komanda se sme ponoviti kad potrošiš - svako pokretanje otvara nov lot.

---

## 5. Šetnja kroz proizvod

### 5.1 Krediti - `http://localhost:3000/sr/app/credits`

Balans je 2000. Ispod su tri paketa (Starter 5 € / 500 kr, Creator 15 € /
1650 kr, Pro 40 € / 4800 kr) i Premium plan (24,99 €/mes, 2000 kr mesečno).
Istorija ispod prikazuje `admin_adjust` transakciju iz koraka 4.

Balans stoji i u zaglavlju (`rounded-full` pločica) sa svake `/app` stranice.

### 5.2 Playground - `http://localhost:3000/sr/app/studio`

Izaberi model (8 uključenih, od `flux-2-flash` za 3 kr do `nano-banana-pro-4k`
za 65 kr), upiši prompt, klikni dugme - cena je na samom dugmetu
("Generiši - 20 kr").

Gledaj: balans padne odmah (kredit se rezerviše u istoj transakciji sa
poslom), posao se pojavi kao `running`, i za ~3 sekunde sam pređe u `done` sa
slikom i značkom **DEMO**. Bez osvežavanja stranice - `useQuery` je pretplata,
nigde nema `setInterval`.

### 5.3 Refund - generiši 6-7 puta

Mock namerno obara ~15% poslova (deterministički po `jobId`-u, nikad
`Math.random()`). Jedna od 6-7 generacija završi kao `refunded` sa porukom
`MOCK_NEUSPEH: ...`, i **balans ti se vrati** - kroz isti `refundCredits` put
kojim ide i pravi fal webhook.

### 5.4 Galerija - `http://localhost:3000/sr/app/studio/gallery`

Sve generacije, filteri po statusu i modelu, "Generiši ponovo" (vraća te na
playground sa istim modelom i promptom) i brisanje sa inline potvrdom.

### 5.5 Prazno stanje

Da vidiš tekstove praznih stanja: filtriraj galeriju po statusu koji nemaš, ili
potroši balans do 0 i vrati se na playground.

### 5.6 Admin - `http://localhost:3000/sr/app/admin/studio`

Tri sekcije: **katalog modela** (cena u kreditima i nabavna u USD, obe inline
izmenljive, marža obojena upozoravajuće ispod 2x), **paketi i planovi** (tu se
kasnije upisuje `stripePriceId`), i **potrošnja** za tekući UTC dan (ukupno u
USD, top 10 korisnika, broj poslova po statusu) plus **kill switch**.

### 5.7 Kill switch

Na admin ekranu ugasi Studio (traži inline potvrdu pre gašenja), pa osveži
`http://localhost:3000/sr/app/studio`. Umesto forme dobijaš poruku
"Studio je pauziran" - krediti ostaju na nalogu. Upali ga nazad kad završiš.

### 5.8 Ulaz iz lekcije (opciono)

Otvori bilo koju lekciju sa AI Workspace-om čiji izlaz nije tekst - u output
koloni je dugme **"Otvori u Studiju"**, koje vodi na
`/app/studio?lessonId=...&taskId=...`. Generacija odatle upisuje `labOutputs`,
zadatak se sam zeleni i leaderboard dobija poene.

---

## 6. Šta NEĆE raditi bez podešavanja

### Kupovina kredita

Dugmad na `/sr/app/credits` vode u Stripe checkout, ali nijedan paket još nema
`stripePriceId`, pa checkout puca. Za to treba:

- `docs/STUDIO-NIGHT-REPORT.md`, sekcija **RUČNI KORACI ZA JOVANA**, **stavka 3**
  - napravi 5 cena u Stripe-u (tip nije opcion: paketi su one-time, planovi
  recurring);
- ista sekcija, **stavka 4** - upiši tih 5 `price_...` ID-jeva u `creditPacks`
  (može i inline sa admin ekrana iz 5.6);
- ista sekcija, **stavka 5** - uključi `invoice.paid` na postojećem webhook
  endpointu, inače Premium pretplatnik ne dobija nijedan kredit.

### Prave generacije

Bez `FAL_KEY` radi mock. Za pravi fal:

- **stavka 1** - fal.ai nalog, kupljeni krediti i `npx convex env set FAL_KEY`;
- **stavka 2** - tvrd mesečni limit potrošnje u fal dashboardu, **pre** nego što
  ijedan korisnik dobije pristup;
- **stavka 7** - potvrdi `CONVEX_SITE_URL` na oba deploymenta (webhook ide na
  `.convex.site`, ne `.convex.cloud`);
- **stavka 8** - potvrdi da Ed25519 radi na živom Convex runtime-u. Ovo je
  najvažnija neproverena pretpostavka celog run-a: ako `crypto.subtle` ne
  podržava Ed25519, svaki fal webhook pada i svaki posao ostaje u `running` sa
  skinutim kreditima. Mock put to ne dokazuje - on ide kroz
  `applyWebhookResult` bez provere potpisa.

---

## 7. Deploy

**Ništa nije deploy-ovano.** Grana `feat/studio-faza-a` je samo lokalna: nije
push-ovana, `npx convex deploy` nije pokrenut, `vercel deploy` nije pokrenut.

Jedini izuzetak, i on nije deploy na produkciju: `npx convex codegen` uz put
uploaduje funkcije na **dev** deployment, pa tvoj dev backend već ima ovaj kod.
Produkcija ga nema.

Deploy je svesna odluka koju donosiš tek pošto ovaj demo prođe na `localhost` i
pošto odradiš stavke iz sekcije 6.
