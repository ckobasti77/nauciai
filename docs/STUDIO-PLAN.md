# NAUČI AI STUDIO — plan implementacije

> Verzija 1.0 · 18. avgust 2026 · zamenjuje sekcije 5, 6 i 8 iz brifa
> Radni naziv proizvoda: **Studio** (ne "harness" — to je interni termin, korisnik ga nikad ne vidi)

---

## 0. Dve odluke koje si tražio, odmah

### 0.1 Gde živi Studio — ista platforma, ista domena, `/sr/app/studio`

**Ne subdomen.** Ne `studio.nauciai.com`. Razlozi, po težini:

1. **Auth.** Convex Auth ti sedi na cookie-ju vezanom za `nauciai.com`. Subdomen znači cross-subdomain cookie konfiguraciju, `SITE_URL` promene, novi OAuth redirect URI kod Google-a, novi JWT audience. To je 2–3 prompta potrošena ni na šta.
2. **Ceo pitch ti je "nula frikcije".** Lekcija kaže "sad napravi ovo" → dugme je tu, u istom layoutu, isti header, isti user. Subdomen je vizuelno i mentalno "otišao si negde drugde" — tačno ono što pokušavaš da izbegneš kod Higgsfielda.
3. **Jedan Vercel projekat, jedan Convex deployment, jedan Stripe nalog, jedan `deploy-to-production` skill.** Nema drugog CI-ja, drugog seta env varijabli, druge webhook konfiguracije.
4. **Već imaš infrastrukturu za to.** `app/[locale]/app/` grupa ima layout, template, error, loading, auth guard. `/sr/app/studio` nasleđuje sve to besplatno.

Konkretne rute:

| Ruta | Šta je |
|---|---|
| `/sr/app/studio` | playground (glavni ekran) |
| `/sr/app/studio/gallery` | galerija svih generacija |
| `/sr/app/credits` | kupovina kredita + istorija transakcija |
| `/sr/studio` *(marketing grupa)* | javna landing stranica za akviziciju, bez login-a |
| `/sr/admin/studio` | admin: katalog modela, cene, potrošnja, alarmi |
| `https://quick-yak-270.convex.site/fal/webhook` | fal webhook (Convex HTTP action, **ne** Vercel) |

Ako ikad budeš prodavao Studio odvojeno od kursa, `studio.nauciai.com` dodaješ kasnije kao Next.js rewrite na istu aplikaciju. Pet minuta posla — tada, ne sad.

### 0.2 Storage — da, Convex. Ali retenciju menjamo.

**Convex storage je ispravan izbor za v1.** Ne zato što je jeftiniji, nego zato što je *već tu*: `chatImages`, `documents`, `chatGroupAvatarFiles` u tvojoj šemi već koriste `v.id("_storage")`. Nula novih tajni, nula novog SDK-a, `ctx.storage.store()` radi direktno iz akcije, brisanje je jedan poziv. R2 je optimizacija koju radiš na obimu, ne na lansiranju.

**Ali: brisanje posle 7 dana je pogrešna odluka, i to iz razloga koji te verovatno iznenađuje — ne štedi ti skoro ništa.**

Evo računa. Prosečne veličine: slika 1024² ≈ 1,2 MB · video 5s 720p ≈ 5 MB · naracija 1 min ≈ 1 MB.

Sto aktivnih studenata koji troše po 15 €/mes (1 650 kredita), miks 40% slike / 50% video / 10% zvuk:

```
po korisniku mesečno:  ~33 slike (40 MB) + ~15 klipova (75 MB) + 6 min zvuka (6 MB) ≈ 120 MB
100 korisnika:         ~12 GB novog storage-a mesečno
egress (pregled+download, ~3x):  ~36 GB mesečno
```

Convex cenovnik: file storage **$0,03/GB preko uključenih 100 GB**, egress **$0,12/GB preko uključenih 50 GB**.

| Scenario | Storage trošak | Egress trošak | Ukupno |
|---|---|---|---|
| 100 korisnika, retencija 12 meseci | 144 GB → 44 GB naplativo → **$1,3/mes** | 36 GB → **$0** | **~$1,3/mes** |
| 300 korisnika, retencija 12 meseci | ~430 GB → **$10/mes** | 108 GB → **$7/mes** | **~$17/mes** |

**Brisanje posle 7 dana ti štedi ~$15 mesečno, a košta te poverenje.** Student je platio 55 kredita za klip, otišao na more, vratio se — klipa nema. To je prvi post u community-ju, prvi zahtev za refund, i prva rečenica koju će reći nekom drugom o tvojoj platformi. Ekonomija te ne tera na to.

**Šta radi umesto toga — tiered retencija:**

| Tip | Retencija fajla | Zašto |
|---|---|---|
| Slike | **90 dana** | sitne su, 100 korisnika × 3 meseca ≈ 12 GB |
| Zvuk | **90 dana** | još sitniji |
| Video | **30 dana** | jedini koji stvarno jede bajtove |
| **Metapodatak (prompt, model, parametri, cena, poster frame)** | **zauvek** | 2 KB po redu, praktično besplatno |

I onda — ovo je deo koji ti pretvara retenciju iz gubitka u proizvod:

1. Svaka generacija ima **Preuzmi** dugme odmah, na kartici. Bez klikanja kroz menije.
2. Galerija ima **"Preuzmi sve (ZIP)"** sa čekboksovima i filterom po datumu.
3. Na 5 dana pre isteka: **push notifikacija + email** ("3 videa ti ističu za 5 dana"). `web-push` i Resend su ti već integrisani — ovo je jedan cron i jedan template.
4. Kad fajl istekne, **red u bazi ostaje**. Kartica u galeriji prikazuje prompt, model, poster frame, i dugme **„Generiši ponovo — 55 kr"**. Istek postaje prihod, ne gubitak.

Poenta 4 je ozbiljna. Higgsfield ti briše *kredite*. Ti brišeš *fajl* ali čuvaš *recept*, i nudiš re-run po ceni. To je bolja priča i bolji unit economics.

**Dve tehničke sitnice oko Convex storage-a koje moraš da znaš:**

- `ctx.storage.getUrl()` vraća **dugoživeći, neautentifikovani URL**. Ako ga student podeli, svako ga otvara. Za generisani sadržaj koji je ionako njegov — prihvatljivo. Samo znaj da nije privatno.
- **Nikad ne stavljaj `<video src>` u grid galerije.** To povlači ceo mp4 za svaki tile i pojede ti egress. Generiši **poster frame** (prvi kadar, JPEG ~40 KB) pri snimanju i prikazuj njega; video se učitava tek na klik. Ovo je razlika između 36 GB i 300 GB mesečno.

---

## 1. Šta sam našao u repou što menja plan

Ovo je najvažnija sekcija. Brief je pisan bez pristupa kodu, i tri stvari u repou menjaju arhitekturu.

### 1.1 Već imaš pola Studija — zove se `lab`

U `convex/schema.ts` postoje:

```ts
lessonSteps   → outputKind: text|image|audio|video|file, layout: [explanation|chatbot|output], prompts[], systemInstruction
labOutputs    → userId, lessonId, stepId, taskId, kind, status, storageId: v.id("_storage"), url, text
lessonTasks   → required, completionMode: manual|automatic|hybrid
taskProgress  → evidenceOutputId: v.id("labOutputs")
aiConversations / aiMessages
```

I `convex/lab.ts` (19 KB) koji sve to vezuje, uključujući `syncLeaderboardSourceEvent` i `adjustProfileActivity`.

**Ovo je ogromno.** Znači da lekcija već ima "output pane" u koji nešto sleti, i da output može da bude *dokaz* da je zadatak urađen, što daje poene na leaderboardu.

**Posledica za arhitekturu:** Studio generacija ne sme da bude odvojeni silos. Kad se generacija završi, ona upisuje `labOutputs` red — isti kao i do sad — a novi `generationJobs` red samo drži *proces* (rezervacija, fal request id, status, cena). Onda:

- Student je u Lekciji 3.4, zadatak kaže "napravi klip svog lika kako hoda"
- U output pane-u lekcije je Studio widget, ne link
- Generiše → `labOutputs` red sa `taskId` → `taskProgress.evidenceOutputId` → zadatak zeleni sam → leaderboard poeni

To je "nula frikcije" u stvarnom kodu, a ne kao slogan. **I to je jedina stvar koju Higgsfield ne može da kopira.** Ubaci to u Fazu A, ne u Fazu D.

### 1.2 Stripe webhook — ne pravi drugi endpoint

`app/api/stripe/webhook/route.ts` već čita raw body, verifikuje potpis, i ima `switch (event.type)`. Već hvata `checkout.session.completed`, ali ga **ignoriše ako `session.subscription` nije string** — što je tačno slučaj za one-time plaćanje.

Znači: **jedan `if` u postojećem `case`**, ne novi endpoint, ne nova registracija u Stripe dashboardu, ne novi `STRIPE_WEBHOOK_SECRET`.

```ts
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode === "payment" && session.metadata?.kind === "credit_pack") {
    await creditPurchase(session);   // ← novo
    break;
  }
  if (typeof session.subscription === "string") { /* postojeće */ }
  break;
}
```

Postojeći subscription flow ostaje netaknut. Tačno kako brief traži.

### 1.3 Repo ima konvenciju `*Core.ts` + `*.test.ts`

`chatCore.ts`, `leaderboardCore.ts`, `profileActivityCore.ts`, `chatInboxSummaryCore.ts`, `studyHubSummaryCore.ts` — čista logika izdvojena iz Convex handlera da bi bila testabilna, plus `*.test.ts` pored. `vitest.config.ts` pokupi `convex/**/*.test.ts` i `lib/**/*.test.ts` na `edge-runtime`.

**Prati to.** Ledger logika ide u `convex/creditsCore.ts`, testovi u `convex/credits.test.ts`.

### 1.4 Ne koristi `@convex-dev/aggregate` za balans — koristi običan brojač

Brief kaže agregat. Ne slažem se, i evo zašto:

- Balans jednog korisnika je **jedan broj**. Agregat komponenta je za sume preko opsega (npr. "koliko je svih kredita prodato u julu") — tu je odlična.
- Convex transakcije su serijalizabilne. `creditBalances` dokument po korisniku, patch-ovan **u istoj mutaciji** kao insert u `creditTransactions`, je O(1), trivijalno tačan, i nema komponentu kao zavisnost.
- Write contention je po korisniku — što je tačno prava granularnost.
- AGENTS.md kaže "Simplicity First. No abstractions for single-use code."

Agregat zadrži za admin analitiku u Fazi D (ukupna prodaja, ukupna potrošnja po modelu). Za balans — brojač + vitest invarijanta koja tvrdi `balance === sum(transactions)`.

---

## 2. ⚠️ CENE IZ BRIFA SU POGREŠNE — ovo mora da se ispravi pre bilo kog koda

Proverio sam fal.ai katalog danas (18.08.2026). **Marketing stranica `fal.ai/pricing` je zastarela** — i dalje lista Kling 2.5, Veo 3, Seedream V4. Merodavne su pojedinačne model stranice i `fal.ai/api/models`.

Kurs EUR/USD (ECB, 14.08.2026): **1 € = 1,1567 $** → 1 $ = 0,865 €.

### 2.1 Najveća greška: video

| Brief kaže | Stvarna nabavna cena danas | Faktor |
|---|---|---|
| "Seedance ~$0,03–0,092/s" | **Seedance 2.0 = $0,3034/s** (720p) | **3–10× skuplje** |
| "Video 5s Seedance = 45 kr (~0,45 €)" | stvarni trošak 5s = **$1,52 = 1,31 €** | **prodavao bi u gubitku 3×** |
| "Kling 3.0 = $0,075/s" | **Kling v3 Standard = $0,084/s** (bez zvuka), $0,126/s (sa) | blizu |
| "Veo 3.1 Fast = $0,10/s" | **$0,15/s** sa zvukom, $0,10/s bez | blizu |

**Da si pustio brief cene u produkciju, svaki prodati video klip bio bi gubitak od ~0,9 €.** Na 100 studenata to je nekoliko hiljada evra godišnje minusa.

### 2.2 Dobra vest: postoje modeli koje brief nije uhvatio

- **Veo 3.1 Lite — $0,05/s na 720p SA nativnim zvukom.** To je 5s klip sa dijalogom za $0,25. Osam puta jeftinije od Veo 3.1 Standard za isti model family. **Ovo je tvoj default video model.**
- **Nano Banana 2 (= Gemini 3.1 Flash Image) — $0,08/slika**, umesto $0,15 za Nano Banana Pro. Skoro isti kvalitet za pola cene.
- **FLUX.2 Flash — $0,005 po megapikselu.** 1024² slika za pola centa. 200 slika za dolar. Idealno za "eksperimentiši, ne razmišljaj o ceni" tier.
- **Seedance 1.5 Pro — ~$0,26 za 5s 720p sa zvukom**, jer koristi stariju token cenu. Drastično jeftiniji od 2.x, a i dalje odličan za image-to-video.

### 2.3 Ispravljena tabela — ovo hardkoduješ (tj. seeduješ u bazu)

Formula: `krediti = ceil(nabavna_USD × 0,865 × 2,5 × 100)`, zaokruženo naviše na lepu cifru.
Sidro: **100 kredita = 1 € maloprodajne vrednosti** (Starter paket: 5 € = 500 kr).

#### SLIKE

| Model | fal endpoint | Nabavno | **Cena** | Tvoj efektivni prihod |
|---|---|---|---|---|
| FLUX.2 Flash | `fal-ai/flux-2/flash` | $0,005/MP | **3 kr** | 0,03 € |
| FLUX.2 Pro | `fal-ai/flux-2-pro` | $0,03/MP | **7 kr** | 0,07 € |
| Seedream 4.5 | `fal-ai/bytedance/seedream/v4.5/text-to-image` | $0,04 | **10 kr** | 0,10 € |
| **Nano Banana 2** ⭐ | `fal-ai/nano-banana-2` | $0,08 | **20 kr** | 0,20 € |
| Nano Banana 2 (2K) | isto, `2K` | $0,12 | **30 kr** | 0,30 € |
| Nano Banana Pro | `fal-ai/nano-banana-pro` | $0,15 | **35 kr** | 0,35 € |
| Nano Banana Pro 4K | isto, `4K` | $0,30 | **65 kr** | 0,65 € |
| GPT Image 1.5 (high) | `fal-ai/gpt-image-1.5` | $0,133 | **30 kr** | 0,30 € |

⚠️ **GPT Image 2 nemoj u v1.** Naplaćuje se po tokenima ($30/1M output image tokens), što znači da ne možeš pouzdano da izračunaš cenu *pre* generacije — a ceo tvoj sistem se oslanja na rezervaciju unapred. GPT Image **1.5** ima ravnu cenu po slici i radi isti posao (tekst na slici, fotorealizam). Koristi 1.5.

#### VIDEO (cena za 5 sekundi)

| Model | fal endpoint | Nabavno 5s | **Cena** | Uloga |
|---|---|---|---|---|
| Seedance 2.0 Mini 480p | `bytedance/seedance-2.0/mini/*` | $0,36 | **80 kr** | brza skica |
| **Veo 3.1 Lite 720p + zvuk** ⭐ | `fal-ai/veo3.1/lite` | $0,25 | **55 kr** | **default** — jedini jeftin sa zvukom |
| Veo 3.1 Lite 1080p + zvuk | isto | $0,40 | **90 kr** | finalni render |
| **Seedance 1.5 Pro 720p + zvuk** ⭐ | `fal-ai/bytedance/seedance/v1.5/pro/*` | $0,26 | **60 kr** | image-to-video, tvoj glavni workflow |
| **Kling v3 Standard (bez zvuka)** ⭐ | `fal-ai/kling-video/v3/standard/*` | $0,42 | **95 kr** | pokret likova, kamera |
| Kling v3 Standard + zvuk | isto | $0,63 | **140 kr** | |
| Kling v3 Pro + zvuk | `.../v3/pro/*` | $0,84 | **185 kr** | ⚠️ skupo |
| Seedance 2.0 Mini 720p | `bytedance/seedance-2.0/mini/*` | $0,77 | **170 kr** | ⚠️ skupo |
| Veo 3.1 Fast 1080p + zvuk | `fal-ai/veo3.1/fast` | $0,75 | **165 kr** | ⚠️ skupo |
| Seedance 2.0 720p | `bytedance/seedance-2.0/*` | $1,52 | **330 kr** | ⚠️⚠️ vrlo skupo |
| Veo 3.1 Standard 1080p | `fal-ai/veo3.1` | $2,00 | **435 kr** | ⚠️⚠️ ne nudi u v1 |

**Kurirani set za lansiranje = 3 video modela:** Veo 3.1 Lite (55 kr, sa zvukom), Seedance 1.5 Pro (60 kr, iz slike), Kling v3 Standard (95 kr, pokret). Sve ostalo iza „Napredno" akordeona sa crvenim badge-om i cenom u velikom fontu.

#### ZVUK

| Model | fal endpoint | Nabavno | **Cena** |
|---|---|---|---|
| **ElevenLabs v3 (srpski ✓)** | `fal-ai/elevenlabs/tts/eleven-v3` | $0,10 / 1 000 znakova | **25 kr / 1 000 znakova** (≈ 25 kr/min) |
| SFX | `fal-ai/elevenlabs/sound-effects/v2` | $0,002/s | **5 kr / 10s** |
| Transkripcija | `fal-ai/elevenlabs/speech-to-text/scribe-v2` | $0,008/min | **2 kr/min** |

⚠️ **Za srpski postoji tačno jedan pouzdan izbor: ElevenLabs v3.** Multilingual v2 (29 jezika) **nema srpski** — ima hrvatski, ali ne srpski. Turbo/Flash v2.5 takođe ne. MiniMax nema. Ne poveži pogrešan endpoint — v3 ili ništa.

### 2.4 Šta paketi sad vrede

| Paket | Cena | Krediti | Šta konkretno kupuje |
|---|---|---|---|
| 🎁 Uz upis | 0 € | **150 kr** | 2 Veo Lite klipa + 2 slike — taman da oseti |
| Starter | 5 € | **500 kr** | 9 klipova · ili 25 dobrih slika |
| Creator | 15 € | **1 650 kr** (+10%) | 30 klipova · ili 82 slike · ili 66 min naracije |
| Pro | 40 € | **4 800 kr** (+20%) | 87 klipova · ili 240 slika |

Paketi iz brifa ostaju isti — samo sad znaš šta stvarno kupuju.

### 2.5 Zlatno pravilo: **nikad ne hardkoduj cenu u kod**

fal menja cene mesečno. Zato:

1. Tabela `modelCatalog` u Convexu drži `falEndpoint`, `creditCost`, `costFormula`, `enabled`, `badge`.
2. Admin ekran `/sr/admin/studio` menja cenu bez deploya.
3. **Noćni cron poziva `GET https://api.fal.ai/v1/models/pricing`** i upoređuje sa tvojim katalogom → ako se nabavna cena promenila >10%, šalje ti email. Ovo je ~30 linija koda i spašava te od tihog gubitka.
4. **Noćna rekonsilijacija:** `GET /v1/models/billing-events` vraća stvarni USD trošak **po `request_id`**. Spoji sa `generationJobs.falRequestId` → dobiješ tačnu maržu po generaciji, po korisniku, po modelu. To je tvoj pravi P&L dashboard.

---

## 3. ⚠️ Pravno — reši PRE prvog naplaćenog kredita

Ovo je otvoreno pitanje #1 iz brifa. Sad imamo konkretne klauzule.

### 3.1 fal ToS §6(e) — klauzula protiv preprodaje

[fal Terms of Service](https://fal.ai/legal/terms-of-service), §6(e), zabranjuje:

> "resell, transfer, assign, or sublicense Customer's rights under these Terms to any third party or use the Services on a **timesharing, service bureau, or similar arrangement**, to run an outsourcing business, or to provide the Services for the benefit of any third party"

**Ali** §4(b) eksplicitno dozvoljava "Customer Solution" model i definiše "End Users" kao "your end user **customers**":

> "Company grants you a limited, worldwide, non-exclusive right to (A) access and use the Services... through an integration or interface with the Customer Solution... and (C) **allow End Users to access and use the Services through the Customer Solution**"

**Kako se to čita:** zabranjeno je preprodavati *pristup fal-u*. Dozvoljeno je graditi *proizvod* u kome je fal ulazni trošak. Što je tvoj proizvod bliži "tanki omotač oko fal endpointa sa markupom", to više §6(e) grize. Što je bliži "aplikacija sa svojim UI-jem, workflow-om, promptovima, galerijom, vezom sa kursom" — to više važi §4(b).

**Tvoja pozicija je dobra** upravo zbog sekcije 1.1 gore: Studio je vezan za lekcije, zadatke i leaderboard. To nije preprodaja, to je proizvod.

**Šta ipak uradi:** pošalji mejl fal sales-u pre lansiranja, opiši model u tri rečenice, traži pisanu potvrdu. Jedan mejl. Ako te odbiju, bolje da znaš u nedelji 3 nego u nedelji 12.

### 3.2 Tvrda obaveza: ne izlaži fal API korisnicima

Ista klauzula se pojavljuje dvaput (ToS §4(b) i [API Services Terms](https://fal.ai/legal/api-services) §2.1):

> "**Client will not expose any of the Services APIs directly to any End Users.**"

Tvoja arhitektura (Convex action → fal) je u redu. **Ali nemoj koristiti fal-ov client-side proxy pattern** (`@fal-ai/serverless-proxy`) — on prosleđuje sirove fal pozive iz browsera. Convex action koji prima tvoje parametre i sam sastavlja fal poziv je pravi put.

### 3.3 Tvrda obaveza: moraš imati sopstvene uslove korišćenja

[API Services Terms §2.5](https://fal.ai/legal/api-services):

> "Client **will** enter into legally enforceable agreements with its End Users... that contain terms that are as protective of the Services as set forth in the Agreement... **Client will be liable for any acts or omissions of End Users**"

Plus §4 indemnity — **ti si odgovoran za sve što tvoji korisnici generišu.** Ovo nije opciono i nije "kad stignem".

Minimum koji `/sr/uslovi-studio` mora da sadrži:
- prosleđena fal [Acceptable Use Policy](https://fal.ai/legal/acceptable-use-policy)
- zabrana: NSFW, deepfake stvarnih osoba, sadržaj sa maloletnicima, ilegalan sadržaj
- **korisnik mora imati 18+** (ToS §2 te obavezuje da to obezbediš)
- krediti: nepovratni, ne konvertuju se u novac, vezani za nalog, važe 12 meseci
- retencija fajlova: 30/90 dana, jasno napisano
- SynthID: Google modeli (Veo, Nano Banana) ugrađuju nevidljiv vodeni žig
- odgovornost za generisani sadržaj je na korisniku

### 3.4 Concurrency limit — ovo je tvoj pravi zid za skaliranje

[fal Concurrency Limits](https://fal.ai/docs/documentation/model-apis/concurrency-limits):

- Nov nalog počinje sa **2 istovremena zahteva**
- Automatski se skalira do **40** na osnovu kupljenih kredita u poslednje 4 nedelje
- Preko 40 → samo preko sales-a

**Posledice:**
1. Kupi fal kredite **mesec dana pre lansiranja** da bi ti se limit podigao pre nego što stignu studenti.
2. Koristi **queue API** (`fal.queue.submit`), ne direktan poziv — queue čeka slot umesto da vrati 429.
3. Ipak implementiraj **sopstveni limit od 2–3 posla po korisniku** — inače jedan čovek sa skriptom pojede ceo tvoj concurrency.

### 3.5 PDV / fiskalizacija

Ostaje pitanje za knjigovođu, ne za mene. Ali daj mu ova dva termina da ne luta:
- **prodaja kredita = višenamenski vaučer** (EU Directive 2016/1065) — PDV se po pravilu obračunava pri *iskorišćenju*, ne pri prodaji
- **neiskorišćeni krediti = odloženi prihod** (deferred revenue) u knjigama do isteka ili potrošnje

To je razlog zašto rok od 12 meseci nije samo marketing — on definiše kad neiskorišćeni krediti postaju priznati prihod.

---

## 4. Arhitektura

### 4.1 Nove tabele u `convex/schema.ts`

```ts
// ── KREDITI ──────────────────────────────────────────────────────────────
creditTransactions: defineTable({
  userId: v.id("users"),
  amount: v.number(),                    // + kupovina/refund/bonus, − potrošnja
  type: v.union(
    v.literal("purchase"), v.literal("spend"), v.literal("refund"),
    v.literal("bonus"), v.literal("trial"), v.literal("expiry"),
    v.literal("admin_adjust"),
  ),
  balanceAfter: v.number(),              // snapshot — čini istoriju čitljivom bez rekalkulacije
  jobId: v.optional(v.id("generationJobs")),
  stripeSessionId: v.optional(v.string()),
  packId: v.optional(v.id("creditPacks")),
  note: v.optional(v.string()),
  expiresAt: v.optional(v.number()),     // samo za purchase/bonus — 12 meseci
  createdAt: v.number(),
})
  .index("by_user", ["userId", "createdAt"])
  .index("by_job_type", ["jobId", "type"])        // ← idempotencija refund-a
  .index("by_stripe_session", ["stripeSessionId"]) // ← idempotencija kupovine
  .index("by_expiry", ["expiresAt"]),

creditBalances: defineTable({
  userId: v.id("users"),
  balance: v.number(),
  lifetimePurchased: v.number(),
  lifetimeSpent: v.number(),
  updatedAt: v.number(),
}).index("by_user", ["userId"]),

creditPacks: defineTable({
  slug: v.string(),                      // "starter" | "creator" | "pro"
  titleSr: v.string(), titleEn: v.string(),
  priceEurCents: v.number(),
  credits: v.number(),
  bonusPercent: v.number(),
  stripePriceId: v.optional(v.string()), // prati postojeći pattern iz courses
  sortOrder: v.number(),
  isActive: v.boolean(),
}).index("by_slug", ["slug"]),

// ── KATALOG MODELA ───────────────────────────────────────────────────────
modelCatalog: defineTable({
  slug: v.string(),                      // "veo-31-lite-720p"
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
  labelSr: v.string(), labelEn: v.string(),
  descriptionSr: v.string(), descriptionEn: v.string(),
  provider: v.string(),                  // "fal"
  falEndpoint: v.string(),               // "fal-ai/veo3.1/lite"
  defaultParams: v.string(),             // JSON
  paramSchema: v.string(),               // JSON — iz čega UI gradi formu
  creditCost: v.number(),                // fiksna cena, ili bazna
  costPerSecond: v.optional(v.number()), // za video sa promenljivim trajanjem
  estimatedCostUsd: v.number(),          // za maržu i alarme
  badge: v.optional(v.union(v.literal("preporuceno"), v.literal("skupo"), v.literal("novo"))),
  isEnabled: v.boolean(),
  sortOrder: v.number(),
  updatedAt: v.number(),
}).index("by_kind_enabled", ["kind", "isEnabled", "sortOrder"])
  .index("by_slug", ["slug"]),

// ── POSLOVI ──────────────────────────────────────────────────────────────
generationJobs: defineTable({
  userId: v.id("users"),
  modelSlug: v.string(),
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
  params: v.string(),                    // JSON — prompt, seed, duration...
  promptHash: v.string(),                // za dedup i moderaciju
  status: v.union(
    v.literal("reserved"), v.literal("running"),
    v.literal("done"), v.literal("failed"), v.literal("refunded"),
  ),
  creditCost: v.number(),
  falRequestId: v.optional(v.string()),
  actualCostUsd: v.optional(v.number()), // popunjava noćna rekonsilijacija
  outputStorageId: v.optional(v.id("_storage")),
  posterStorageId: v.optional(v.id("_storage")),
  labOutputId: v.optional(v.id("labOutputs")),   // ← veza sa lekcijom
  lessonId: v.optional(v.id("lessons")),
  taskId: v.optional(v.id("lessonTasks")),
  error: v.optional(v.string()),
  expiresAt: v.optional(v.number()),     // kad se fajl briše
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_user", ["userId", "createdAt"])
  .index("by_fal_request", ["falRequestId"])      // ← webhook lookup
  .index("by_user_status", ["userId", "status"])  // ← concurrency limit
  .index("by_expiry", ["expiresAt"])
  .index("by_status_created", ["status", "createdAt"]), // ← stuck job reaper

studioUsageDaily: defineTable({
  userId: v.id("users"),
  day: v.string(),                       // "2026-08-18"
  generations: v.number(),
  creditsSpent: v.number(),
  costUsd: v.number(),
}).index("by_user_day", ["userId", "day"])
  .index("by_day", ["day"]),
```

### 4.2 Tok: reserve → capture / refund

```
1. Student klikne Generiši
   └─ mutation studio.createJob
      ├─ requireUserId + requireEnrollment
      ├─ moderacija prompta (blok lista + dužina)
      ├─ provera: aktivnih poslova < 3
      ├─ provera: dnevni limit
      ├─ modelCatalog lookup → creditCost
      ├─ balans >= cost ?  ne → throw "NEDOVOLJNO_KREDITA"
      ├─ INSERT generationJobs (status: reserved)
      ├─ INSERT creditTransactions (−cost, type: spend, jobId)
      ├─ PATCH creditBalances (balance −= cost)
      └─ scheduler.runAfter(0, internal.studioActions.submit, { jobId })
         ⟵ sve gore je JEDNA transakcija; ako bilo šta pukne, ništa se nije desilo

2. action studioActions.submit
      ├─ POST queue.fal.run/{endpoint}?fal_webhook=https://quick-yak-270.convex.site/fal/webhook
      ├─ dobija { request_id }
      └─ mutation markRunning(jobId, falRequestId)   → status: running
         ⟵ ako fal poziv pukne → mutation failJob(jobId) → refund

3. httpAction /fal/webhook  (Convex HTTP action, NE Vercel)
      ├─ pročitaj SIROVE bajtove tela (pre bilo kakvog JSON parsiranja)
      ├─ verifikuj ED25519 potpis (detalji u 4.3)
      ├─ mutation handleWebhook(request_id, status, payload)
      │   ├─ lookup by_fal_request → ako job nije "running", RETURN 200 (idempotencija)
      │   ├─ OK    → status: done, sačuvaj fal URL, scheduler → persistOutput
      │   └─ ERROR → status: failed
      │              ├─ ako NE postoji refund red za (jobId, "refund"):
      │              │   INSERT creditTransactions (+cost, refund) + PATCH balance
      │              └─ status: refunded
      └─ return 200 ODMAH  (fal daje 15s na prvi pokušaj)

4. internal action persistOutput
      ├─ fetch(fal_url) → blob
      ├─ ctx.storage.store(blob) → outputStorageId
      ├─ ako video: izvuci prvi frame → poster JPEG → posterStorageId
      ├─ INSERT labOutputs (kind, status: ready, storageId, taskId?)
      ├─ ako taskId: taskProgress.evidenceOutputId + leaderboard event
      └─ PATCH job: expiresAt = now + (video ? 30d : 90d)

5. UI se osvežava sam preko Convex subscriptions — bez pollinga
```

**Zašto je webhook na Convexu, a ne na Vercelu:**
- fal **ne prati redirekcije** — 3xx = trajni neuspeh. Vercel voli da redirektuje trailing slash.
- Convex HTTP action ti daje sirovo telo bez borbe sa body parser-ima.
- Nema hopa Vercel → Convex, nema drugog `syncSecret`-a.
- Registruješ u `convex/http.ts` pored `auth.addHttpRoutes(http)`.

### 4.3 Verifikacija fal webhook potpisa — tačan algoritam

Iz [fal webhook dokumentacije](https://fal.ai/docs/documentation/model-apis/inference/webhooks). Ovo **nije HMAC**, nego ED25519 preko JWKS-a. Redosled je bitan:

Headeri: `X-Fal-Webhook-Request-Id`, `X-Fal-Webhook-User-Id`, `X-Fal-Webhook-Timestamp` (unix sekunde), `X-Fal-Webhook-Signature` (hex). **Ako bilo koji fali → odbij.**

```
1. GET https://rest.fal.ai/.well-known/jwks.json   (keširaj, MAX 24h)
2. |now − timestamp| <= 300s   inače odbij (replay zaštita)
3. message = utf8(
     requestId + "\n" + userId + "\n" + timestamp + "\n" + hex(sha256(RAW_BODY_BYTES))
   )
4. za svaki ključ: ed25519_verify(base64url_decode(key.x), hex_decode(signature), message)
   bilo koji koji prođe → validno
```

**Zamka:** `sha256` mora biti nad **sirovim bajtovima tela**, ne nad re-serijalizovanim JSON-om. U Convex `httpAction`: `const raw = await request.arrayBuffer()` **pre** bilo kakvog `.json()`.

**Retry politika koju moraš da podneseš:**
- prvi pokušaj timeout **15 s**, retry timeout 120 s
- do **31 pokušaja**, ali rezultat ističe za **~6 minuta ako je payload ≥ 10 KB** (tj. praktično svi tvoji)
- **znači: handler mora da bude idempotentan i brz.** Verifikuj, upiši, vrati 200. Skidanje fajla ide u zakazanu akciju.

**Nema `metadata` polja u webhook payload-u.** Mapiranje nazad na korisnika ide isključivo preko `request_id` → tvoj `generationJobs.falRequestId`. Zato je taj indeks obavezan.

### 4.4 Anti-abuse — pre prvog evra, ne posle

| Zaštita | Gde | Vrednost |
|---|---|---|
| Paralelni poslovi po korisniku | `createJob` mutation | max 3 |
| Dnevni limit generacija | `studioUsageDaily` | 50/dan (podesivo u adminu) |
| Dnevni limit troška po korisniku | `studioUsageDaily.costUsd` | alarm na 5 $, auto-pauza na 10 $ |
| Globalni dnevni trošak | cron | alarm na 50 $, kill switch na 100 $ |
| Blok lista pojmova | `creditsCore.ts`, čista funkcija | testabilna, srpski + engleski |
| Dužina prompta | validacija | max 2 000 znakova |
| Enrollment guard | `requireCourseAccess` | Studio samo za upisane |
| Stuck job reaper | cron svakih 15 min | `running` stariji od 30 min → fail + refund |

**Kill switch je obavezan.** Jedan bool u Convex tabeli `platformFlags` koji `createJob` proverava prvi. Ako se nešto otme kontroli u 3 ujutru, gasiš iz telefona.

---

## 5. FAZA A — Krediti + slike (2 nedelje, 14 promptova)

Redosled je namerno takav da posle svakog prompta imaš nešto što radi i može da se deploy-uje.

### A1 — Šema + ledger core
**Fajlovi:** `convex/schema.ts`, `convex/creditsCore.ts` (novo)
- Dodaj svih 6 tabela iz 4.1
- `creditsCore.ts`: čiste funkcije `applyTransaction(balance, tx)`, `canAfford`, `computeExpiry`, `validatePrompt(text)` — bez `ctx`, bez baze
**Verifikacija:** `npx convex codegen` prolazi, `npm run lint` čist

### A2 — Ledger mutacije + testovi
**Fajlovi:** `convex/credits.ts` (novo), `convex/credits.test.ts` (novo)
- `getBalance` query, `getTransactions` query (paginated)
- interne mutacije: `credit(userId, amount, type, meta)`, `debit(...)` — obe u jednoj transakciji sa balansom
- idempotencija: `credit` sa `stripeSessionId` proverava `by_stripe_session` pre inserta
**Testovi (obavezno):**
- balans === suma transakcija posle 1 000 nasumičnih operacija
- dupli `credit` sa istim `stripeSessionId` upiše samo jednom
- `debit` preko balansa baca grešku i **ne menja ništa**
- dupli refund za isti `jobId` upiše samo jednom
**Verifikacija:** `npm run test:convex` zeleno

> ⚠️ Ovaj prompt je najvažniji u celom projektu. Ovde se gubi novac ako se pogreši. Ne prelazi na A3 dok testovi nisu zeleni.

### A3 — Paketi kredita u bazi + seed
**Fajlovi:** `convex/credits.ts`, `convex/seed.ts`
- `listPacks` query, admin `upsertPack` mutation
- Seeduj 4 paketa iz 2.4
- Ručno napravi Stripe **one-time** cene (Products → Add product → One-time), upiši `stripePriceId` u seed

### A4 — Stripe checkout za kredite
**Fajlovi:** `lib/stripe.ts`, `app/api/stripe/checkout/route.ts` (ili nova `/api/stripe/credits`)
- `createCreditCheckoutSession({ packId, userId, locale })`
- **`mode: "payment"`** (ne `subscription`)
- `metadata: { kind: "credit_pack", packId, userId, credits }`
- Prati postojeći pattern: `convexAuthNextjsToken()` → `getConvexHttpClient(token)` → viewer provera

### A5 — Stripe webhook → krediti
**Fajlovi:** `app/api/stripe/webhook/route.ts`, `lib/convex-http.ts`, `convex/credits.ts`
- Dodaj `if (session.mode === "payment" && metadata.kind === "credit_pack")` u postojeći case (vidi 1.2)
- Poziva `creditPurchase` mutaciju sa `requireSyncSecret` — isti pattern kao `syncStripeSubscription`
- `stripeSessionId` = ključ idempotencije
**Verifikacija:** `stripe listen --forward-to localhost:3000/api/stripe/webhook`, kupi Starter test karticom, balans skoči za 500

### A6 — `/sr/app/credits` stranica
**Fajlovi:** `app/[locale]/app/credits/page.tsx`, `components/credits/*`
- Balans veliko gore, 4 kartice paketa, tabela istorije transakcija
- Radiusi: kartice `surface-card` (16px), paketi unutar `surface-inset` (12px), badge-ovi `rounded-full`
- Realtime preko `useQuery` — balans skače sam kad webhook stigne

### A7 — Katalog modela + admin
**Fajlovi:** `convex/modelCatalog.ts` (novo), `app/[locale]/app/admin/studio/page.tsx`
- Seeduj slike iz tabele 2.3
- Admin: uključi/isključi model, promeni `creditCost`, promeni badge

### A8 — fal klijent + submit akcija
**Fajlovi:** `convex/studioActions.ts` (novo), `lib/fal.ts` (novo, čist HTTP, bez SDK-a)
- `FAL_KEY` ide u **Convex env** (`npx convex env set FAL_KEY ... --prod`), ne u Vercel
- Koristi `https://queue.fal.run/{endpoint}?fal_webhook=...` sa `Authorization: Key $FAL_KEY`
- Ne koristi fal SDK — 20 linija `fetch`-a je manje zavisnosti i lakše za test

### A9 — `createJob` mutacija sa rezervacijom
**Fajlovi:** `convex/studio.ts` (novo), `convex/studio.test.ts`
- Ceo tok iz koraka 1 u 4.2
**Testovi:** nedovoljno kredita → nema job-a i nema transakcije · 4. paralelni job odbijen · zabranjen prompt odbijen

### A10 — fal webhook handler
**Fajlovi:** `convex/falWebhook.ts` (novo), `convex/http.ts`, `convex/falWebhook.test.ts`
- ED25519 verifikacija po 4.3
- Idempotentno po `request_id`
**Testovi:** neispravan potpis → 401 · star timestamp → 401 · dupli webhook → jedan refund

### A11 — Persist output + veza sa `labOutputs`
**Fajlovi:** `convex/studioActions.ts`, `convex/lab.ts` (minimalna izmena)
- Skini fajl → `ctx.storage.store` → `labOutputs` insert
- Ako `taskId` postoji → `taskProgress.evidenceOutputId` + leaderboard

### A12 — Playground UI
**Fajlovi:** `app/[locale]/app/studio/page.tsx`, `components/studio/*`
- Levo: izbor modela (kartice sa **cenom u kreditima na svakoj**), prompt polje, parametri iz `paramSchema`
- Desno: rezultat + skeleton dok se generiše
- Dugme kaže **„Generiši · 20 kr"** — cena uvek na dugmetu, nikad skrivena
- Ako nema kredita: dugme postaje „Dopuni kredite" i vodi na `/sr/app/credits`

### A13 — Galerija
**Fajlovi:** `app/[locale]/app/studio/gallery/page.tsx`
- Grid, filter po tipu/modelu/datumu, **poster frame za video (nikad `<video src>` u gridu)**
- Po kartici: Preuzmi · Generiši ponovo · Obriši
- Čekboksovi + „Preuzmi izabrano (ZIP)" — ZIP se pravi **u browseru** (`fflate`), ne u Convex akciji
- Badge „ističe za N dana"

### A14 — QA + deploy
- Ceo test suite zelen
- Ručno: kupi kredite → generiši 5 slika → jedna namerno padne → proveri refund
- Proveri da je zbir `creditTransactions` === `creditBalances.balance` za svakog test korisnika
- `deploy-to-production` skill
- **Postavi limit potrošnje u fal dashboardu** pre nego što pustiš ijednog korisnika

---

## 6. FAZA B — Video (2 nedelje, 10 promptova)

| # | Šta | Ključna sitnica |
|---|---|---|
| B1 | Video modeli u katalog | Veo 3.1 Lite / Seedance 1.5 Pro / Kling v3 Standard + „skupo" iza akordeona |
| B2 | Cena zavisna od trajanja | `creditCost = ceil(costPerSecond × duration)`, izračunato **u mutaciji**, ne u UI-ju |
| B3 | Image-to-video | Upload slike → Convex storage → signed URL prosleđen fal-u kao `image_url` |
| B4 | Poster frame ekstrakcija | Ovo je jedini deo koji traži node runtime; ako je previše — koristi `<video preload="metadata">` + `#t=0.1` fragment kao fallback |
| B5 | Realtime status UI | Progres traka po `status` polju; Convex subscription, bez pollinga |
| B6 | Stuck job reaper cron | `running` > 30 min → fail + refund |
| B7 | Retencija cron | dnevni: obriši fajlove preko `expiresAt`, zadrži red |
| B8 | Notifikacija pred istek | `web-push` + Resend, 5 dana pre |
| B9 | Rekonsilijacija cron | `GET /v1/models/billing-events` → `actualCostUsd` po job-u |
| B10 | QA | test sa 30s klipom, test sa neuspehom, test sa istekom |

**Ako Faza B mora da se skrati:** izbaci B4 (poster) i B9 (rekonsilijacija) — ne izbacuj B6 i B7.

---

## 7. FAZA C — Zvuk (1 nedelja, 4 prompta)

| # | Šta |
|---|---|
| C1 | ElevenLabs v3 u katalog, cena po **1 000 znakova** — UI računa uživo dok kuca |
| C2 | Izbor glasa (fal vraća listu), preslušavanje pre generacije |
| C3 | SFX generator, 5 kr / 10s |
| C4 | Audio player u galeriji + waveform |

⚠️ Proveri srpski izgovor sa **v3** pre nego što staviš u katalog. Ako je loš, alternativa je `fal-ai/gemini-tts` (ima „Serbian (Serbia)" u enumu jezika), ali se naplaćuje po tokenima — pa ti treba fiksna procena.

---

## 8. FAZA D — Poliranje (1 nedelja, 7 promptova)

| # | Šta |
|---|---|
| D1 | Admin analitika: prihod, trošak, marža po modelu i po korisniku (**ovde koristi `@convex-dev/aggregate`**) |
| D2 | Alarmi: dnevni trošak, cena modela promenjena >10%, korisnik preko limita |
| D3 | Kill switch + auto-pauza korisnika |
| D4 | Moderacija: pregled prijavljenih generacija, blok lista iz admina |
| D5 | Istek kredita posle 12 meseci (cron, `by_expiry` indeks) + email 30 dana pre |
| D6 | Bonus krediti: 150 kr uz upis (hook u `syncStripeSubscription`) |
| D7 | Pre-launch QA |

---

## 9. Checklist pre prvog naplaćenog kredita

**Pravno**
- [ ] Mejl fal sales-u, dobijena pisana potvrda za "Customer Solution" model
- [ ] `/sr/uslovi-studio` objavljeno, sa svim iz 3.3
- [ ] Checkbox „18+ i prihvatam uslove" na `/sr/app/credits`, upisan u bazu sa timestampom
- [ ] Knjigovođa potvrdio tretman prodaje kredita

**Tehnički**
- [ ] `npm run test` i `npm run test:convex` zeleno
- [ ] Test: balans === suma transakcija, na produkcijskim podacima
- [ ] Test: namerno neuspeli job vraća kredite tačno jednom
- [ ] Test: dupli fal webhook ne duplira ništa
- [ ] `FAL_KEY` u **Convex** env (prod), ne u Vercelu
- [ ] Webhook URL bez trailing slash, https, direktan (fal ne prati redirekcije)
- [ ] Stuck job reaper cron radi

**Finansijski**
- [ ] Limit potrošnje postavljen u fal dashboardu
- [ ] fal krediti kupljeni ranije da bi se concurrency podigao sa 2 na 40
- [ ] Kill switch testiran
- [ ] Alarm na dnevni trošak radi (pošalji sebi test alarm)
- [ ] Marža provereno pozitivna na svakom modelu u katalogu — **ručno, red po red**

---

## 10. Šta mi treba od tebe da bih krenuo sa A1

1. **Imaš li već fal.ai nalog i `FAL_KEY`?** Ako nemaš — otvori danas i kupi 20–50 $ kredita, da počne da ti raste concurrency limit.
2. **Retencija — prihvataš 30 dana video / 90 dana slike, ili insistiraš na kraćem?** (Moja preporuka je gore, ali je tvoj poziv.)
3. **Stripe: da li prodaješ kurseve kao subscription ili one-time?** U `billing.ts` vidim `subscriptions` tabelu — ako je subscription, bonus od 150 kr se kači na prvi uspešan `checkout.session.completed`, ne na svaki obnovljeni ciklus.
4. **Da li Studio otvaraš svima ili samo upisanima na kurs?** Menja `requireCourseAccess` guard u A9.

Odgovori na ova četiri i A1 kreće odmah.

---

## DODATAK — odluke zaključane 18.08.2026. uveče

Ove odluke **imaju prednost** nad sekcijama 6 i 4.1 gore gde se razlikuju.

### D.1 Planovi pretplate

| Plan | Cena | Šta dobija |
|---|---|---|
| **Basic** | 9,99 €/mes | pristup kursu, bez mesečnih kredita |
| **Premium** | 24,99 €/mes | kurs + Pro lekcije + **2 000 kredita svakog ciklusa** |

Isti novac u paketu daje 1 650 kredita, pa je Premium ~21 % isplativiji — što je
i bila poenta.

**Bonus dobrodošlice: 150 kredita, jednokratno, na prvoj uspešnoj uplati, za oba
plana.** Ne ponavlja se pri obnovi.

Paketi kredita (jednokratno, `mode: "payment"`) ostaju kako je u sekciji 2.4.

### D.2 Istek kredita — jedno pravilo za sve

**Svaki kredit ističe 12 meseci od datuma dodele**, bez obzira na izvor
(kupovina, mesečna doza, bonus). Nema mesečnog propadanja i nema plafona na
rollover — Premium krediti se gomilaju bez ograničenja.

Posledice koje moraš da znaš:
- Marketinška poruka ostaje netaknuta i jača je nego kod konkurencije:
  *„Krediti ti ne propadaju na kraju meseca."*
- Obaveza je ograničena rokom od 12 meseci, ne plafonom. Prati ukupan
  neiskorišćen balans u admin analitici (Faza D) — to je tvoj odloženi prihod.
- Kad korisnik otkaže pretplatu, **već dodeljeni krediti ostaju** do svog isteka.
  To mora eksplicitno da piše u uslovima korišćenja.

### D.3 Šta ovo menja u šemi

Balans više ne može biti jedan broj, jer lotovi imaju različite datume isteka.
Dodaje se tabela **`creditLots`** (`source`, `granted`, `remaining`, `expiresAt`,
`grantedAt`, `stripeInvoiceId?`, `stripeSessionId?`, `exhaustedAt?`), a
`creditBalances.balance` postaje denormalizovan keš.

Trošenje ide **FIFO po `expiresAt` rastuće** — prvo se troši ono što pre ističe.

U `enrollments` se dodaje `plan: v.optional(v.union("basic", "premium"))`.
Odsustvo se tretira kao `"basic"`.

### D.4 Pristup Pro lekcijama — postojeći bug

`lib/lesson-access.ts` gleda `users.role === "pro_student"`, ali
`syncStripeSubscription` nikad ne postavlja `role`. Znači Pro lekcije trenutno
ne vidi niko osim admina.

Popravlja se preko `enrollments.plan`, **ne** preko `role` — jer je `role`
globalan, a pretplata je po kursu, pa bi Premium na jednom kursu otključao Pro
sadržaj na svim kursevima. `role` ostaje samo za admin/moderator.

### D.5 Stripe: mesečni krediti se vezuju za `invoice.paid`

`checkout.session.completed` puca **samo jednom**, pri prvom plaćanju. Obnove
pucaju `invoice.paid`. Mesečna doza Premium kredita mora da visi na
`invoice.paid`, idempotentno po `invoice.id`.

Welcome bonus se prepoznaje po `invoice.billing_reason === "subscription_create"`,
idempotentno po `invoice.id + ":welcome"`.

Event tipovi koje treba uključiti na postojećem webhook endpointu:
`checkout.session.completed`, `invoice.paid`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`.
