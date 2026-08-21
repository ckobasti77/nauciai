# Studio — katalog v3, konačan

> Verzija 3.0 · 19. avgust 2026 · zamenjuje v2 i sekciju 2.3 iz `STUDIO-PLAN.md`
> Sve cene povučene sa fal kataloga (1 460 modela) i sa stranica provajdera istog dana.
> Kurs 1 USD = 0,865 EUR · marža 2,5× · 100 kredita = 1 EUR
> **Formula: `krediti = ceil(nabavno_USD × 216,25)`**, zaokruženo naviše

---

## 0. Pravilo rutiranja

Na **fal** ide sve gde je cena ista ili niža. **Direktno** ide samo ono gde fal
uzima maržu. Marža nije jedinstvena — razlikuje se po porodici modela:

| Porodica | fal marža | Ruta |
|---|---|---|
| Seedream 4.5, Seedream 5 **Lite**, Kling (sve), GPT Image 1.5, GPT Image 2, ElevenLabs, MiniMax H3, Veo Lite, Veo Standard | **1,00×** ili niže | **fal** |
| Gemini Omni | **1,25×** | **Google** |
| Nano Banana Pro | **1,12×** | **Google** |
| Nano Banana 2 | **1,19×** | **Google** |
| Veo 3.1 **Fast** | **1,17–1,50×** | **Google** |
| Seedream 5 **Pro** | **1,50×** | **BytePlus** |
| Seedance 2.0 i 2.5 | **2,00×** | **BytePlus** |

Tri provajdera ukupno: **fal**, **google**, **byteplus**.

---

## 1. Ulazni režimi — ugovor za UI

Ovo je najvažnija tabela u dokumentu. Svaki endpoint deklariše koje ulaze
prima; UI iz toga gradi upload površinu i prekidače.

| `inputMode` | Šta korisnik daje | UI |
|---|---|---|
| `text` | samo prompt | textarea |
| `image` | 1 slika | jedan drop slot |
| `image_multi` | 1–10 slika | mreža slotova, drag-reorder |
| `first_last` | 2 slike: **prvi i poslednji kadar** | dva imenovana slota, „Početni" i „Završni" |
| `reference` | do 9 slika + 3 videa + 3 audio | tri grupe slotova, svaka sa svojim tipom |
| `video` | 1 ulazni video | drop slot za video |
| `video_image` | video + slika | dva slota (motion control) |
| `image_audio` | slika + audio | dva slota (avatar) |
| `video_audio` | video + audio ili tekst | lipsync |
| `audio` | 1 audio fajl | drop slot |
| `layerize` | 1 slika → slojevi | drop slot + izbor broja slojeva |

**Prekidač režima.** Model koji podržava više režima (npr. Veo Fast: `text`,
`image`, `first_last`, `reference`, `video`) dobija **segmentirani prekidač**
iznad forme. Prebacivanje čisti slotove koji nisu deo novog režima i menja
endpoint koji se zove — isti slug, druga ruta.

**Ograničenja koja UI mora da poštuje:** maksimalan broj fajlova po slotu,
dozvoljeni MIME tipovi, maksimalna veličina, i za `first_last` obavezna oba
slota pre nego što se dugme otključa.

---

## 2. SLIKE

### 2.1 Nano Banana 2 — `google` · Gemini 3.1 Flash Image

Nabavno uključuje thinking tokene ($3/M). Google: `gemini-3.1-flash-image`.

| Slug | Rezolucija | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|---|
| `nb2-512` | 0,5K (512px) | text | $0,053 | **12** |
| `nb2` ⭐ | 1K | text | $0,070 | **16** |
| `nb2-2k` | 2K | text | $0,104 | **24** |
| `nb2-4k` | 4K | text | $0,154 | **35** |
| `nb2-edit` | 1K | image_multi (1–10) | $0,071 | **16** |
| `nb2-edit-2k` | 2K | image_multi | $0,105 | **24** |
| `nb2-edit-4k` | 4K | image_multi | $0,155 | **35** |

Ulazne slike se naplaćuju $0,50/M tokena ≈ **$0,001 po slici** — zanemarljivo,
uračunato u cene edita.

### 2.2 Nano Banana Pro — `google` · Gemini 3 Pro Image

Thinking tokeni su ovde **$12/M** i nisu zanemarljivi: 5–18% preko osnovne cene.

| Slug | Rezolucija | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|---|
| `nbpro` ⭐ | **2K** | text | $0,149 | **35** |
| `nbpro-4k` | 4K | text | $0,255 | **60** |
| `nbpro-edit` | 2K | image_multi (1–10) | $0,150 | **35** |
| `nbpro-edit-4k` | 4K | image_multi | $0,256 | **60** |

> **1K ne postoji namerno.** Google naplaćuje identično ($0,134 = 1 120 tokena)
> za 1K i 2K. Tražiti 1K znači platiti istu cenu za manju sliku.

### 2.3 GPT Image 2 — `fal` · `openai/gpt-image-2`

Cena zavisi od `quality` **i** od rezolucije, i **nije monotona** — 1024×1024
high ($0,211) je skuplji od 1536×1024 high ($0,165).

| Slug | Kvalitet | Rezolucija | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|---|---|
| `gpt2-low` | low | 1024² | text | $0,006 | **3** |
| `gpt2` ⭐ | **medium** | 1024² | text | $0,053 | **12** |
| `gpt2-high` | high | 1024² | text | $0,211 | **50** |
| `gpt2-high-portrait` | high | 1024×1536 | text | $0,165 | **38** |
| `gpt2-high-wide` | high | 1536×1024 | text | $0,165 | **38** |
| `gpt2-hd` | high | 2560×1440 | text | $0,222 | **50** |
| `gpt2-4k` | high | 3840×2160 | text | $0,401 | **90** |
| `gpt2-edit` | medium | 1024² | image_multi | $0,053 | **12** |
| `gpt2-edit-high` | high | 1024² | image_multi | $0,211 | **50** |

> ⚠️ **fal podrazumeva `quality: high`.** Svaki slug MORA da pinuje svoj
> `quality` i `size` u `defaultParams`. Bez toga `gpt2-low` (3 kredita) košta
> $0,211 — trideset pet puta više nego što je naplaćeno.

### 2.4 GPT Image 1.5 — `fal` · `fal-ai/gpt-image-1.5`

| Slug | Kvalitet | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|---|
| `gpt15-low` | low, 1024² | text | $0,009 | **3** |
| `gpt15` | medium, 1024² | text | $0,034 | **8** |
| `gpt15-high` | high, 1024² | text | $0,133 | **30** |
| `gpt15-high-portrait` | high, 1024×1536 | text | $0,200 | **45** |
| `gpt15-edit` | medium | image_multi | $0,034 | **8** |
| `gpt15-edit-high` | high | image_multi | $0,133 | **30** |

### 2.5 Seedream 4.5 — `fal`

| Slug | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|
| `sd45` | text | $0,04 | **10** |
| `sd45-edit` | image_multi | $0,04 | **10** |

### 2.6 Seedream 5 Pro — `byteplus` · `dola-seedream-5-0-pro-260628`

**fal uzima 1,50× na svaku stavku.** Direktno.

| Slug | Šta radi | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|---|
| `sd5pro` ⭐ | t2i do 1,5K | text | $0,045 | **10** |
| `sd5pro-2k` | t2i preko 1,5K (do 2K) | text | $0,090 | **20** |
| `sd5pro-edit` | precizan edit, do 10 referenci | image_multi | $0,045 | **10** |
| `sd5pro-edit-2k` | isto, preko 1,5K | image_multi | $0,090 | **20** |
| `sd5pro-layerize` | slika → 2–17 PNG slojeva | layerize | $0,0225/sloj | **5 / sloj** |
| `sd5pro-layerize-2k` | isto, preko 1,5K | layerize | $0,045/sloj | **10 / sloj** |

Dodatna ulazna slika preko prve: $0,003 → **+1 kredit po slici**.

> ⚠️ **Granica tarife se razlikuje između fal-a i BytePlus-a.** fal kaže
> 1536×1536 = 2,36 M piksela; BytePlus kaže 2,61 M. U pojasu između te dve
> vrednosti fal naplaćuje višu tarifu a BytePlus nižu — tamo je stvarni odnos
> **3,0×**, ne 1,5×. Još jedan razlog da Pro ide direktno.

> ⚠️ fal svoje Seedream 5 Pro cene izričito označava kao **„tentative"**.
> Odnos 1,50× važi za danas, ne zauvek.

> **Layerize je jedina stvar u celom katalogu koju Midjourney nema ni blizu** —
> razlaganje slike na providne slojeve koje klijent može da menja pojedinačno.
> Za komercijalni rad (zameni boju flaše, promeni tekst na etiketi) to je
> workflow koji sam vredi kurs.

### 2.7 Seedream 5 Lite — `fal` · parity

| Slug | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|
| `sd5lite` | text | $0,035 | **8** |
| `sd5lite-edit` | image_multi | $0,035 | **8** |

Lite podržava 2K/3K/4K (Pro staje na 2K), ali **nema edit po regionima ni
layerize** — to je Pro-only.

### 2.8 Kling Image — `fal` · bonus, nisi tražio ali ide uz Kling

| Slug | Šta radi | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|---|
| `kling-img-o3` | Omni 3 t2i, 1K/2K | text | $0,028 | **7** |
| `kling-img-o3-4k` | isto, 4K | text | $0,056 | **14** |
| `kling-img-o3-edit` | Omni 3 i2i | image_multi | $0,028 | **7** |
| `kling-img-v3` | Image V3 t2i | text | $0,028 | **7** |
| `kling-img-v3-edit` | Image V3 i2i | image_multi | $0,028 | **7** |
| `kling-img-o1-edit` | O1 edit sa reference kontrolom | image_multi | $0,028 | **7** |
| `kling-tryon` | Kolors virtuelna proba odeće | image_multi (2) | $0,07 | **16** |

---

## 3. VIDEO — krediti po sekundi

Svi video modeli imaju `costPerSecond`. Cena na dugmetu = `krediti/s × trajanje`.

### 3.1 Kling 3.0 — `fal` · parity na svakoj varijanti

**Ime u UI-ju mora da kaže rezoluciju.** Kod Klinga „standard" = 720p,
„pro" = 1080p — isti model, iste težine, samo drugačiji izlaz.

| Slug | Varijanta | `inputMode` | Nabavno/s | **kr/s** | 5s |
|---|---|---|---|---|---|
| `kling3-720` ⭐ | 3.0 720p, bez zvuka | text · image | $0,084 | **19** | 95 |
| `kling3-720-audio` | 3.0 720p, zvuk | text · image | $0,126 | **28** | 140 |
| `kling3-720-voice` | 3.0 720p, zvuk + voice control | text · image | $0,154 | **34** | 170 |
| `kling3-1080` | 3.0 1080p, bez zvuka | text · image | $0,112 | **25** | 125 |
| `kling3-1080-audio` | 3.0 1080p, zvuk | text · image | $0,168 | **37** | 185 |
| `kling3-1080-voice` | 3.0 1080p, zvuk + voice | text · image | $0,196 | **43** | 215 |
| `kling3-4k` | 3.0 4K, zvuk svejedno | text · image | $0,420 | **91** | 455 |
| `kling3-mc-720` | motion control 720p | video_image | $0,126 | **28** | 140 |
| `kling3-mc-1080` | motion control 1080p | video_image | $0,168 | **37** | 185 |

### 3.2 Kling 3.0 Turbo — `fal`

Turbo je **brzina, ne popust** — skuplji je od običnog 3.0 bez zvuka.
Zvuk je uključen u cenu. **Nema 4K.**

| Slug | Varijanta | `inputMode` | Nabavno/s | **kr/s** | 5s |
|---|---|---|---|---|---|
| `kling3t-720` | Turbo 720p | text · **first_last** | $0,112 | **25** | 125 |
| `kling3t-1080` | Turbo 1080p | text · image | $0,140 | **31** | 155 |

### 3.3 Kling O3 (Omni 3) — `fal` · najbogatiji ulazima

O3 je jedini Kling koji radi **reference-to-video** i **video-to-video**.

| Slug | Varijanta | `inputMode` | Nabavno/s | **kr/s** |
|---|---|---|---|---|
| `klingo3-720` | O3 720p, bez zvuka | text · **first_last** · **reference** | $0,084 | **19** |
| `klingo3-720-audio` | O3 720p, zvuk | isto | $0,112 | **25** |
| `klingo3-1080` | O3 1080p, bez zvuka | isto | $0,112 | **25** |
| `klingo3-1080-audio` | O3 1080p, zvuk | isto | $0,140 | **31** |
| `klingo3-4k` | O3 4K | text · first_last · reference | $0,420 | **91** |
| `klingo3-edit-720` | v2v: izmena videa rečima | **video** | $0,126 | **28** |
| `klingo3-edit-1080` | isto, 1080p | **video** | $0,168 | **37** |
| `klingo3-ref-720` | v2v: referentni video → novi kadrovi | **video** | $0,126 | **28** |
| `klingo3-ref-1080` | isto, 1080p | **video** | $0,168 | **37** |

### 3.4 Kling O1 (Omni 1) — `fal` · prethodna Omni generacija

| Slug | `inputMode` | Nabavno/s | **kr/s** |
|---|---|---|---|
| `klingo1-720` | first_last · reference | $0,084 | **19** |
| `klingo1-1080` | first_last · reference | $0,112 | **25** |
| `klingo1-edit-720` | video | $0,126 | **28** |
| `klingo1-edit-1080` | video | $0,168 | **37** |

### 3.5 Kling avatar, lipsync, zvuk — `fal`

| Slug | Šta radi | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|---|
| `kling-avatar-720` | avatar iz slike + zvuka | image_audio | $0,0562/s | **13/s** |
| `kling-avatar-1080` | isto, viši kvalitet | image_audio | $0,115/s | **25/s** |
| `kling-lipsync-audio` | lipsync po audiju | video_audio | $0,014/s ulaza* | **4/s** |
| `kling-lipsync-text` | lipsync po tekstu | video · text | $0,014/s ulaza* | **4/s** |
| `kling-v2a` | zvuk iz videa | video | $0,035/video | **8** |
| `kling-tts` | Kling TTS | text | $0,007 | **3** |
| `kling-voice` | pravljenje glasa za voice control | audio | $0,007 | **3** |

\* zaokružuje se naviše na 5 sekundi — video od 3s se naplaćuje kao 5s
(minimum **20 kredita**).

### 3.6 Seedance 2.0 — `byteplus` · fal uzima 2,00×

Naplata po tokenima: `tokeni = (trajanje × Š × V × 24) / 1024`.

| Slug | Varijanta | `inputMode` | Nabavno/s | **kr/s** | 5s |
|---|---|---|---|---|---|
| `sdc20-480` | 480p | text · image · reference | $0,070 | **16** | 80 |
| `sdc20-720` ⭐ | 720p | text · image · reference | $0,151 | **33** | 165 |
| `sdc20-1080` | 1080p | text · image · reference | $0,374 | **81** | 405 |
| `sdc20-4k` | 4K | text · image · reference | $0,780 | **170** | 850 |
| `sdc20f-720` | Fast 720p | text · image · reference | $0,121 | **27** | 135 |
| `sdc20m-480` | Mini 480p | text · image · reference | $0,036 | **8** | 40 |
| `sdc20m-720` | Mini 720p | text · image · reference | $0,077 | **17** | 85 |

### 3.7 Seedance 2.5 — `byteplus` · fal uzima 2,00×

**Do 30 sekundi u jednom generisanju.** Nema 4K, nema fast/mini.

| Slug | Varijanta | `inputMode` | Nabavno/s | **kr/s** | 5s |
|---|---|---|---|---|---|
| `sdc25-480` | 480p | text · image · reference | $0,103 | **23** | 115 |
| `sdc25-720` ⭐ | 720p | text · image · reference | $0,231 | **50** | 250 |
| `sdc25-1080` | 1080p | text · image · reference | $0,569 | **125** | 625 |

> **Kod `reference` režima sa video ulazom cena se množi sa 0,6** — i naplaćuje
> se i ulazni i izlazni video. `computeCreditCost` mora to da zna.

> ⚠️ **Aktivacija: $30 na BytePlus nalogu po Seedance modelu**, zaključano dok
> je model aktivan. Za 2.0 i 2.5 računaj $60 vezano. Seedream 5 **nema** taj
> uslov.

> ⚠️ **Individualni nalog: 3 istovremena Seedance posla.** Postojeći limit od
> 3 posla po korisniku je slučajno tačan — ali dva korisnika istovremeno već
> pune BytePlus red.

### 3.8 MiniMax H3 — `fal` · jeftiniji ili isti kao direktno

`MiniMax-H3`, 31.07.2026. Trajanje **4–15s**, **nativni stereo zvuk uključen**.
Endpointi nemaju `fal-ai/` prefiks: `minimax/h3/*`.

| Slug | Rezolucija | `inputMode` | Nabavno/s | **kr/s** | 5s |
|---|---|---|---|---|---|
| `h3-480` | 480p | text · image · **first_last** · reference | $0,05 | **11** | 55 |
| `h3-768` ⭐ | 768P | isto | $0,06 | **13** | 65 |
| `h3-2k` | 2K | isto | $0,13 | **29** | 145 |
| `h3-4k` | 4K | isto | $0,16 | **35** | 175 |
| `h3-lora-768` | 768P sa LoRA | text · image | $0,075 | **17** | 85 |
| `h3-lora-2k` | 2K sa LoRA | text · image | $0,1625 | **36** | 180 |

Prvih 5 referentnih slika je besplatno; svaka sledeća **+18 kredita**.

> **Najjeftiniji video sa zvukom u katalogu.** 5s 768P sa nativnim zvukom:
> H3 **65**, Veo Lite 55, Kling 3.0 **140**. I ide do 15s umesto do 5s.

> ⚠️ **fal-ov sajt sam sebi protivreči oko H3 cene** — stranice modela kažu
> $0,13/s na 2K, „learn" stranice kažu $0,26/s. Pusti jednu generaciju i
> pročitaj fakturu pre nego što ovo pustiš studentima.

### 3.9 Veo 3.1 — mešano

| Slug | Nivo | Ruta | `inputMode` | Nabavno/s | **kr/s** |
|---|---|---|---|---|---|
| `veo-lite-720-mute` | Lite 720p bez zvuka | fal | text · image · first_last | $0,03 | **7** |
| `veo-lite-720` ⭐ | Lite 720p sa zvukom | fal | isto | $0,05 | **11** |
| `veo-lite-1080-mute` | Lite 1080p bez zvuka | fal | isto | $0,05 | **11** |
| `veo-lite-1080` | Lite 1080p sa zvukom | fal | isto | $0,08 | **18** |
| `veo-fast-720-mute` | Fast 720p bez zvuka | **google** | text · image · first_last · reference · video | $0,08 | **18** |
| `veo-fast-720` | Fast 720p sa zvukom | **google** | isto | $0,10 | **22** |
| `veo-fast-1080` | Fast 1080p sa zvukom | **google** | isto | $0,12 | **26** |
| `veo-fast-4k` | Fast 4K sa zvukom | **google** | isto | $0,30 | **65** |
| `veo-std-720-mute` | Standard bez zvuka | fal | text · image · first_last · reference · video | $0,20 | **44** |
| `veo-std-1080` | Standard sa zvukom | fal | isto | $0,40 | **87** |
| `veo-std-4k` | Standard 4K sa zvukom | fal | isto | $0,60 | **130** |

> **Lite nema `reference` ni `extend`.** Fast i Standard imaju oba.
> `extend-video` produžava postojeći Veo klip do 30s i traži `video` ulaz.

> ⚠️ **Veo Fast direktno traži poller.** Google nema webhookove za video —
> vraća `operation` koji se ispituje. To je jedina nova mašinerija u celom
> katalogu.

### 3.10 Gemini Omni — `google` · fal uzima 1,25×

`gemini-omni-flash-preview`. **Public preview**, ne GA. Izlaz **3–10s, 720p,
24 fps, sa nativnim sinhronizovanim zvukom.** Samo 16:9 i 9:16.

| Slug | Šta radi | `inputMode` | Nabavno/s | **kr/s** |
|---|---|---|---|---|
| `omni` | tekst → video sa zvukom | text | $0,1014 | **22** |
| `omni-i2v` | slika → video sa zvukom | image | $0,1014 | **22** |
| `omni-ref` | tekst + slike + video → video | reference | $0,1014 | **22** |
| `omni-edit` | razgovorna izmena videa, više krugova | video | $0,1014 | **22** |

> ⚠️ **Ograničenja koja moraju u UI:** izmena **uploadovanog** videa nije
> dozvoljena korisnicima iz EEA/Švajcarske/UK (izmena videa koji je model sam
> napravio jeste). Srbija nije EEA, ali ako ti se student javi iz Nemačke, to
> puca. Upload audio referenci **ne radi** iako i Google i fal navode audio kao
> ulaz. Video reference do 3s se prihvataju ali se ne obrađuju ispravno.
> Nema produžavanja ni prvi/poslednji kadar.

> ⚠️ Preview kvota je u praksi uska. Ne računaj na produkcijski obim.

---

## 4. ZVUK — `fal` · parity na svemu

| Slug | Model | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|---|
| `tts` ⭐ | ElevenLabs **v3** — jedini sa srpskim | text | $0,10 / 1 000 zn. | **25 / 1 000 zn.** |
| `dialogue` | ElevenLabs v3 text-to-dialogue, više govornika | text | $0,10 / 1 000 zn. | **25 / 1 000 zn.** |
| `sfx` | Sound Effects v2 | text | $0,002/s | **5 / 10s** |
| `music` | ElevenLabs Music | text | $0,60/min | **130 / min** |
| `stt` | Scribe V2 | audio · video | $0,008/min | **3 / min** |
| `voice-changer` | zamena glasa u snimku | audio | $0,30/min | **65 / min** |
| `audio-isolation` | izdvajanje glasa iz pozadine | audio | $0,10/min | **22 / min** |
| `dubbing` | sinhronizacija na drugi jezik | video · audio | $0,60/min | **130 / min** |

> **Za srpski postoji tačno jedan model: `eleven_v3`.** Multilingual v2 (29
> jezika) i Turbo/Flash v2.5 (32) **nemaju srpski**, iako imaju hrvatski.
> Jeftinija varijanta od $0,05/1k ne dolazi u obzir. Nema v4.

> **Scribe V2 je 3,75× jeftiniji od V1** ($0,008 vs $0,03/min). Koristi V2.

---

## 5. Posledice po arhitekturu

### 5.1 Tri provajdera, četiri načina rada

| Provajder | Kako radi | Stanje |
|---|---|---|
| `fal` | queue + ED25519 webhook | **postoji** |
| `google` slike | **sinhrono**, slika u odgovoru | nov klijent, bez webhooka |
| `google` video (Veo Fast, Omni) | **long-running operation, samo polling** | nov klijent + **cron poller** |
| `byteplus` | async + `callback_url` (bez potpisa, samo challenge pri registraciji) | nov klijent + drugi webhook |

BytePlus callback **nije potpisan** — challenge handshake potvrđuje endpoint
pri registraciji, ali pojedinačne poruke nisu potpisane. Zato se callback tretira
kao nepouzdan okidač: kad stigne, **ponovo se pita task endpoint** za stvarno
stanje. To je razlika u odnosu na fal, gde je potpis dokaz.

### 5.2 Šema

`modelCatalog` dobija:
- `inputModes: string` — JSON niz dozvoljenih režima
- `inputSpec: string` — JSON: po režimu, koliko fajlova, koji MIME tipovi, max veličina
- `providerModelId: string` — pravi ID kod provajdera (`dola-seedream-5-0-pro-260628`)
- `family: string` — za grupisanje u UI (`kling3`, `veo`, `seedance25`…)
- `resolution`, `hasAudio: boolean` — za značke i sortiranje

`generationJobs` dobija:
- `inputMode: string` — koji režim je korišćen
- `inputStorageIds: Id<"_storage">[]` — uploadovani ulazi
- `providerRequestId` (preimenovan iz `falRequestId`, jer više nije samo fal)

### 5.3 Env ključevi — svi u Convex, ne u Vercel

```
FAL_KEY                 (postoji)
GOOGLE_AI_API_KEY       novo
BYTEPLUS_API_KEY        novo
BYTEPLUS_BASE_URL       https://ark.ap-southeast.bytepluses.com/api/v3
```

### 5.4 Redosled uvođenja

1. **Šema + apstrakcija provajdera + upload ulaza** — bez ovoga ništa drugo ne može.
2. **Google slike** (sinhrono, najlakše) — NB2, NB Pro. Odmah donosi 12–19%.
3. **BytePlus** (callback) — Seedream 5 Pro, Seedance 2.0/2.5. Najveći novac.
4. **Google video poller** — Veo Fast, Gemini Omni. Jedina nova mašinerija.
5. **UI ulaznih režima** — prekidač, slotovi, drag&drop.
6. **Seed celog kataloga** — ~110 slugova.

---

## 6. Zamke iz fal kataloga koje moraju u kod

Sve provereno 19.08.2026:

1. **Nano Banana 2 i Pro postoje pod dva imena** (`fal-ai/nano-banana-*` i
   `fal-ai/gemini-*-preview`) sa **različitim tekstom cene** — jedan pominje
   doplatu za high thinking, drugi ne. Idemo direktno na Google, pa nas ne
   dodiruje, ali znaj da fal nije dosledan.
2. `kling-video/v2.6/pro/text-to-video` je označen kao „Standard 2.6" — greška
   u metapodacima, endpoint i cena su Pro.
3. `kling-video/o3/standard/image-to-video` se zove „[Pro]" — cena potvrđuje da
   je Standard.
4. `kling-video/v3/pro/motion-control` nosi opis Standard varijante.
5. `google/gemini-omni-flash/reference-to-video` i
   `fal-ai/veo3.1/fast/reference-to-video` imaju `modelFamily: null` — ako
   grupišeš po toj vrednosti, tiho ih izgubiš.
6. `fal-ai/gpt-image-1/edit-image` objavljuje ceo pasus o ceni **dvaput**.
7. **Polovina fal endpointa nema cenu u katalog API-ju** (`pricingInfoOverride`
   je null) — cena postoji samo na renderovanoj stranici. Obrnuto, MiniMax H3
   traineri imaju cenu **samo** u API-ju. Nijedan izvor sam nije dovoljan.

---

## 7. Šta ne ulazi i zašto

| Model | Razlog |
|---|---|
| **Midjourney** | Nema zvaničan API. `midjourney.com/api` vraća 404. Svi „MJ API" servisi voze automatizovane Discord naloge, što njihov ToS zabranjuje u tri odvojene klauzule (automatizacija, preprodaja, jedan nalog po korisniku). Nalog koji tako radi je za ban. |
| **FLUX (sve)** | Jovanova odluka. |
| Kling v1.x, v2.x, O1 delimično | Starije generacije; ostaju seedovane ali isključene, da mogu da se uključe bez novog deploya. |
| Seedance v1.x | Isto. |
| ElevenLabs Multilingual v2, Turbo/Flash | **Nemaju srpski.** |
