# Studio — katalog v2 sa hibridnim rutiranjem

> Verzija 2.0 · 19. avgust 2026 · zamenjuje sekciju 2.3 iz `STUDIO-PLAN.md`
> Sve cene proverene direktno kod provajdera i na fal.ai istog dana.
> Kurs: 1 USD = 0,865 EUR (ECB 14.08.2026) · marža 2,5× · 100 kredita = 1 EUR
> Formula: `krediti = ceil(nabavno_USD × 216,25)`, zaokruženo naviše na lepu cifru

---

## Pravilo rutiranja

**Na fal.ai ide sve gde je cena ista ili niža.** Direktno kod provajdera ide
samo ono gde fal uzima maržu. Nema trećeg kriterijuma.

| Provajder | Modeli | Zašto |
|---|---|---|
| **fal.ai** | Seedream 4.5 · GPT Image 1.5 · GPT Image 2 · Kling 3.0 (sve varijante) · Veo 3.1 Lite · Veo 3.1 Standard · ElevenLabs v3 · SFX | cena u cent ista; jedan webhook, jedan ključ |
| **Google direktno** | Nano Banana 2 · Nano Banana Pro · Veo 3.1 Fast | fal +12%, +19% i +17–50% |
| **BytePlus direktno** | Seedance 2.0 · Seedance 2.5 | fal tačno **2,00×** na obe |
| **izbačeno** | FLUX (sve) · Midjourney | Jovan ne želi FLUX; Midjourney nema API |

---

## SLIKE

### Google direktno — `gemini-3.1-flash-image`, `gemini-3-pro-image`

Nabavna cena uključuje i **thinking tokene**, koje Google naplaćuje odvojeno
($3/M za Flash, $12/M za Pro). Kod Pro modela to je 5–18% preko osnovne cene i
mora da uđe u računicu, inače ti marža tiho padne.

| Slug | Model | Nabavno (sa thinking) | **Cena** | fal bi bio |
|---|---|---|---|---|
| `nano-banana-2` | Gemini 3.1 Flash Image, 1K | $0,070 | **16 kr** | 20 kr |
| `nano-banana-2-2k` | isto, 2K | $0,104 | **24 kr** | 30 kr |
| `nano-banana-2-4k` | isto, 4K | $0,154 | **35 kr** | 40 kr |
| `nano-banana-pro` | Gemini 3 Pro Image, **2K** | $0,149 | **35 kr** | 35 kr |
| `nano-banana-pro-4k` | isto, 4K | $0,255 | **60 kr** | 65 kr |

> **Nano Banana Pro: uvek traži 2K, nikad 1K.** Google naplaćuje isto ($0,134)
> za oba — 1 120 tokena u oba slučaja. Tražiti 1K znači platiti istu cenu za
> manju sliku. Zato `nano-banana-pro` ide na 2K, a 1K varijante nema.

### fal.ai

| Slug | Model | Nabavno | **Cena** |
|---|---|---|---|
| `seedream-45` | Seedream 4.5 | $0,04 | **10 kr** |
| `gpt-image-2-low` | GPT Image 2, low, 1024² | $0,006 | **3 kr** |
| `gpt-image-2` ⭐ | GPT Image 2, **medium**, 1024² | $0,053 | **12 kr** |
| `gpt-image-2-high` | GPT Image 2, high, 1024² | $0,211 | **50 kr** |
| `gpt-image-15` | GPT Image 1.5, high, 1024² | $0,133 | **30 kr** |

> ⚠️ **fal podrazumeva `quality: high` kod GPT Image 2.** Ako se `quality` ne
> pošalje eksplicitno u `defaultParams`, svaka generacija košta $0,211 umesto
> $0,053 — četiri puta više. Svaki od tri sluga MORA da pinuje svoj `quality`.

> ⚠️ **GPT Image 2 nije monoton po rezoluciji.** 1024×1024 high ($0,211) je
> **skuplji** od 1536×1024 high ($0,165). Ne pravi tabelu cena koja pretpostavlja
> da veća slika košta više — pinuj rezoluciju po slugu.

---

## VIDEO — cene za 5 sekundi

### BytePlus direktno — `dreamina-seedance-2-0-260128`, `dreamina-seedance-2-5-260628`

Naplata je po tokenima: `tokens = (trajanje × Š × V × fps) / 1024`, 24 fps.
Cena po sekundi ispod je izvedena iz BytePlus-ovih objavljenih primera.

| Slug | Rezolucija | Nabavno/s | 5s | **Cena** | fal bi bio |
|---|---|---|---|---|---|
| `seedance-20-480p` | 480p | $0,070 | $0,35 | **80 kr** | 160 kr |
| `seedance-20-720p` ⭐ | 720p | $0,151 | $0,76 | **165 kr** | 330 kr |
| `seedance-20-1080p` | 1080p | $0,374 | $1,87 | **405 kr** | 740 kr |
| `seedance-25-480p` | 480p | $0,103 | $0,52 | **115 kr** | 240 kr |
| `seedance-25-720p` | 720p | $0,231 | $1,16 | **250 kr** | 512 kr |
| `seedance-25-1080p` | 1080p | $0,569 | $2,85 | **615 kr** | 738 kr |

> **Ovde je ceo dobitak od direktne integracije.** Na 720p Seedance 2.0 fal
> uzima tačno duplo. Na budžetu od 400 EUR mesečno sa težištem na videu, ovo
> samo po sebi vraća oko 120 EUR.

> ⚠️ **Aktivacija traži $30 na nalogu po modelu.** BytePlus zaključa do $30
> balansa dok je model aktivan. Za oba Seedance-a računaj da ti $60 stoji
> vezano.

> ⚠️ **Individualni nalog daje concurrency 3 za Seedance** (enterprise 10).
> fal daje do 40 deljeno preko svih modela. Limit paralelnih poslova po
> korisniku od 3 koji već postoji u `createJob` je ovde slučajno tačno
> podešen — ali dva korisnika istovremeno već pune BytePlus red.

> ⚠️ **Seedance 2.5 nema 4K**, staje na 1080p. Seedance 2.0 ima 4K.

> ⚠️ Na 1080p Seedance 2.5 trenutno traje popust od 28%, **do 17.09.2026.**
> U tabeli je puna cena. Ne hardkoduj popust.

### fal.ai — Kling 3.0

Sve varijante su na paru sa Kling-ovim zvaničnim cenovnikom, u cent.

| Slug | Varijanta | Nabavno/s | 5s | **Cena** |
|---|---|---|---|---|
| `kling-3-720p` ⭐ | 720p, bez zvuka | $0,084 | $0,42 | **95 kr** |
| `kling-3-720p-audio` | 720p, sa zvukom | $0,126 | $0,63 | **140 kr** |
| `kling-3-1080p` | 1080p, bez zvuka | $0,112 | $0,56 | **125 kr** |
| `kling-3-1080p-audio` | 1080p, sa zvukom | $0,168 | $0,84 | **185 kr** |
| `kling-3-turbo-720p` | Turbo 720p, zvuk uključen | $0,112 | $0,56 | **125 kr** |
| `kling-3-turbo-1080p` | Turbo 1080p, zvuk uključen | $0,140 | $0,70 | **155 kr** |
| `kling-3-4k` | 4K, sa ili bez zvuka | $0,420 | $2,10 | **455 kr** |

> **Preimenuj fal-ove nazive.** Kod Klinga `standard` = 720p, `pro` = 1080p —
> to je rezolucija, ne kvalitet. Isti model, iste težine. Ako u UI-ju piše
> „Pro", ljudi će misliti da daje bolju sliku i platiće više ni za šta.

> **Turbo nema 4K.** `kling-3-4k` je obični Kling 3.0.

> ⚠️ **Voice control je treći, skuplji nivo** koji nije u ovoj tabeli:
> $0,154/s na 720p i $0,196/s na 1080p. Ako ga budeš izlagao, mora svoj slug.

### Veo 3.1 — mešano

| Slug | Varijanta | Ruta | Nabavno/s | 5s | **Cena** |
|---|---|---|---|---|---|
| `veo-lite-720p-mute` | Lite 720p, **bez zvuka** | fal | $0,03 | $0,15 | **35 kr** |
| `veo-lite-720p` ⭐ | Lite 720p, sa zvukom | fal | $0,05 | $0,25 | **55 kr** |
| `veo-lite-1080p` | Lite 1080p, sa zvukom | fal | $0,08 | $0,40 | **90 kr** |
| `veo-fast-720p` | Fast 720p, sa zvukom | **Google** | $0,10 | $0,50 | **110 kr** |
| `veo-fast-1080p` | Fast 1080p, sa zvukom | **Google** | $0,12 | $0,60 | **130 kr** |
| `veo-standard-720p` | Standard 720p, sa zvukom | fal | $0,40 | $2,00 | **435 kr** |
| `veo-standard-1080p` | Standard 1080p, sa zvukom | fal | $0,40 | $2,00 | **435 kr** |

> **Veo Fast je jedini Google model koji traži novu mašineriju.** Google nema
> webhookove za video — vraća `operation` objekat koji se **pollује**. Za
> slike to nije problem (sinhrone su), ali Veo Fast traži cron koji obilazi
> poslove u letu. Zato ide **poslednji**, u Fazi B, zajedno sa ostatkom videa.
> Do tada Veo Fast može da stoji na fal-u uz +33% — ili da ga jednostavno nema.

---

## ZVUK — fal.ai

| Slug | Model | Nabavno | **Cena** |
|---|---|---|---|
| `tts-sr` | ElevenLabs **v3** (`eleven_v3`) | $0,10 / 1 000 znakova | **25 kr / 1 000 znakova** |
| `sfx` | ElevenLabs Sound Effects | $0,002/s | **5 kr / 10s** |

> **Za srpski postoji tačno jedan model: `eleven_v3`.** Multilingual v2 (29
> jezika) i Flash v2.5 (32) **nemaju srpski**, iako imaju hrvatski. Jeftinija
> varijanta od $0,05/1k ne dolazi u obzir. v3 je i dalje najnoviji — nema v4.

---

## Šta se menja u odnosu na v1

**Izbačeno:** `flux-2-flash`, `flux-2-pro` (Jovan ne želi FLUX), Midjourney
(nema API).

**Pojeftinilo zbog direktne rute:**

| Model | v1 | v2 | Ušteda |
|---|---|---|---|
| Nano Banana 2 | 20 kr | **16 kr** | −20% |
| Nano Banana 2 2K | 30 kr | **24 kr** | −20% |
| Nano Banana Pro 4K | 65 kr | **60 kr** | −8% |
| Seedance 2.0 720p | 330 kr | **165 kr** | **−50%** |

**Novo:** GPT Image 2 u tri nivoa kvaliteta · Seedance 2.5 u tri rezolucije ·
Kling Turbo 720p i 1080p · Kling 4K · Veo Lite bez zvuka · Veo Fast · Veo
Standard 1080p · Nano Banana 2 4K.

**Nepromenjeno:** Seedream 4.5 (10 kr), GPT Image 1.5 (30 kr), Nano Banana Pro
(35 kr, ali sad na 2K umesto 1K), Kling 3.0 720p (95 kr), Veo Lite sa zvukom
(55 kr), TTS (25 kr/1k), SFX (5 kr/10s).

---

## Posledice po arhitekturu

Danas sve ide kroz `lib/fal.ts` i jedan ED25519 webhook. Sad su tri provajdera
sa tri različita načina rada:

| Provajder | Način | Šta treba |
|---|---|---|
| fal.ai | queue + ED25519 webhook | **postoji** |
| Google Gemini (slike) | **sinhrono**, slika stiže u odgovoru | novi klijent, bez webhooka |
| BytePlus (Seedance) | async + `callback_url` | novi klijent + drugi webhook |
| Google Veo Fast | **samo polling** | cron koji obilazi poslove — Faza B |

Polje `modelCatalog.provider` već postoji u šemi i danas je svuda `"fal"`.
Ono postaje prekidač rutiranja.

**Redosled uvođenja, po odnosu dobitka i truda:**

1. **Google slike** — sinhrone, nema webhooka, nema novog stanja. Najlakša
   integracija u celoj listi, a nosi 12–20% na najkorišćenijim modelima.
   Ovo je jedino što je hitno, jer su slike jedino što je danas uključeno.
2. **BytePlus Seedance** — ima `callback_url`, pa se uklapa u postojeći tok
   poslova. Najveći novčani dobitak, ali tek kad video krene (Faza B).
3. **Veo Fast preko Google-a** — traži poller. Poslednji, uz Fazu B.

Novi env ključevi (svi u **Convex** env, ne u Vercel):
`GOOGLE_AI_API_KEY`, `BYTEPLUS_API_KEY`, `BYTEPLUS_BASE_URL`
(`https://ark.ap-southeast.bytepluses.com/api/v3`).

---

## Provere koje niko nije mogao da uradi umesto tebe

1. **Da li Seedance 2.0/2.5 nose „Restricted Model" oznaku** na BytePlus
   konzoli. Ta oznaka je iza login-a. Ako je nose, spisak podržanih zemalja
   (na kome Srbija jeste) za te modele **ne važi**. Proveri pre nego što
   uplatiš $60.
2. **Da li fal stvarno naplaćuje $10/M „text output" kod GPT Image 2.** OpenAI
   za taj model ne objavljuje tu stavku uopšte. Pogledaj prvu fakturu.
3. **fal-ove cene po sekundi za Seedance 2.5 ne slažu se sa njegovom sopstvenom
   cenom po tokenu**, razilaze se 2–7%. Nije bitno ako ideš direktno, ali znaj
   da fal-ova objavljena cifra nije nužno ono što naplati.
