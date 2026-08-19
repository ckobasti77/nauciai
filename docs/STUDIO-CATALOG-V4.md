# Studio — katalog v4: modeli, parametri, cenovna pravila

> Verzija 4.0 · 19. avgust 2026 · **zamenjuje v2 i v3 u celosti**
> Cene povučene sa fal kataloga i sa stranica provajdera 19.08.2026.
> Kurs 1 USD = 0,865 EUR · marža 2,5× · 100 kredita = 1 EUR
> **`FAKTOR = 0,865 × 2,5 × 100 = 216,25`**
> **`krediti = ceil(nabavno_USD × 216,25)`**

---

## 0. Šta se promenilo u odnosu na v3 i zašto

v3 je imao ~110 „slugova" — `nb2`, `nb2-2k`, `nb2-4k`, `nb2-edit`… To nije
katalog, to je razvučena tabela cena koja se pretvara da je model.

**v4: jedan red po stvarnom modelu.** Nano Banana Pro je **jedan** model.
Rezolucija, kvalitet, zvuk, trajanje, broj slika — to su **parametri**. Cena se
**računa** iz izabranih parametara po deklarativnom pravilu.

Posledice:
- Katalog ima **~30 redova**, ne 110.
- Admin menja jedan `baseUsd` i cela porodica varijanti prati.
- UI gradi kontrole iz `paramSpec` — shadcn `Select`, `Slider`, `Switch`,
  `ToggleGroup`, `RadioGroup` — i deli ih između modela sa istim parametrima.
- Cena na dugmetu i cena koju server naplati dolaze iz **iste čiste funkcije**.
  Ne mogu da se raziđu jer nema druge računice.

---

## 1. Model podataka

### 1.1 Tabela `models` (zamenjuje `modelCatalog`)

```ts
models: defineTable({
  slug: v.string(),                    // "nano-banana-pro"
  provider: v.union(v.literal("fal"), v.literal("google"), v.literal("byteplus")),
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
  family: v.string(),                  // "nano-banana" | "kling" | "seedance" | "veo"

  labelSr: v.string(), labelEn: v.string(),
  taglineSr: v.string(), taglineEn: v.string(),   // jedna rečenica, čemu služi
  descriptionSr: v.string(), descriptionEn: v.string(),

  // Ruta po režimu: isti model, drugi endpoint za drugi ulaz.
  // { "text": "fal-ai/veo3.1/lite", "first_last": "fal-ai/veo3.1/lite/first-last-frame-to-video" }
  endpoints: v.string(),               // JSON: inputMode -> endpoint/model ID kod provajdera

  inputModes: v.string(),              // JSON niz: ["text","image","first_last","reference"]
  inputSpec: v.string(),               // JSON: po režimu -> slotovi za fajlove
  paramSpec: v.string(),               // JSON niz kontrola (sekcija 1.2)
  priceRule: v.string(),               // JSON cenovno pravilo (sekcija 1.3)

  capabilities: v.string(),            // JSON: { audio: true, maxDurationS: 15, maxRefImages: 9 }
  badge: v.optional(v.string()),       // "preporuceno" | "skupo" | "novo"
  isEnabled: v.boolean(),
  sortOrder: v.number(),
  updatedAt: v.number(),
})
  .index("by_slug", ["slug"])
  .index("by_kind_enabled", ["kind", "isEnabled", "sortOrder"])
  .index("by_family", ["family", "sortOrder"])
```

### 1.2 `paramSpec` — kontrole

Niz kontrola. Svaka mapira na **jednu shadcn komponentu**, pa se iste kontrole
dele između modela.

```ts
type ParamControl = {
  key: string
  type: "select" | "segmented" | "slider" | "number" | "switch" | "textarea" | "text"
  labelSr: string; labelEn: string
  helpSr?: string; helpEn?: string          // tooltip
  default: string | number | boolean
  showInModes?: string[]                    // ako fali: vidljiv u svim režimima
  options?: Array<{ value: string; labelSr: string; labelEn: string; badge?: string }>
  min?: number; max?: number; step?: number
  unitSr?: string; unitEn?: string          // "s", "slojeva", "slika"
  affectsPrice: boolean                     // ako true, promena preračunava cenu
}
```

Mapiranje na komponente — **ovo je biblioteka koju delimo:**

| `type` | shadcn | Kada |
|---|---|---|
| `segmented` | `ToggleGroup` (single) | 2–4 opcije, sve staju u red: rezolucija, kvalitet |
| `select` | `Select` | 5+ opcija ili duga imena: glas, odnos stranica |
| `slider` | `Slider` + brojčani prikaz | trajanje, jačina, broj slojeva |
| `number` | `Input type=number` sa +/− | broj slika |
| `switch` | `Switch` | zvuk uključen, voice control |
| `textarea` | `Textarea` sa brojačem | prompt, negativan prompt |
| `text` | `Input` | seed |

**Pravilo:** kontrola sa `affectsPrice: true` uz sebe prikazuje razliku u
kreditima (`+12 kr`, `×2`), da korisnik vidi šta ga skuplja **pre** nego što
klikne.

### 1.3 `priceRule` — deklarativno cenovno pravilo

Jedna čista funkcija `computeCostUsd(rule, params)` u
`convex/studioPricing.ts`, uvezena i u Convex i u browser. **Nema druge
računice cene nigde u kodu.**

```ts
type PriceRule = {
  unit: "image" | "second" | "chars1k" | "layer" | "minute" | "generation"

  // Osnovna cena. Ako postoji `lookup`, on ima prednost nad `baseUsd`.
  baseUsd?: number

  // Konstantan dodatak po generaciji (npr. Google thinking tokeni).
  addUsd?: number

  // Množioci po parametru, primenjuju se redom.
  multipliers?: Array<{ param: string; map: Record<string, number> }>

  // Tabela za necene koje nisu monotone (GPT Image). Ključ = vrednosti
  // parametara spojene sa "|" po redosledu iz `params`.
  lookup?: { params: string[]; map: Record<string, number> }

  // Parametar koji množi rezultat (trajanje, broj slojeva, broj slika).
  quantityParam?: string

  // Dodatne stavke preko besplatne kvote.
  extras?: Array<{ param: string; freeCount: number; usdEach: number }>

  // Množilac koji zavisi od ulaznog režima, ne od parametra.
  modeMultipliers?: Record<string, number>
}
```

Krediti: **`ceil(computeCostUsd(rule, params) × 216,25)`**.
Ista funkcija daje i `estimatedCostUsd` za dnevni plafon i za maržu.

**Invarijanta koja se testira nad SVAKOM kombinacijom parametara:**
`credits / (costUsd × 216,25) >= 1,0`. Kombinatorika je mala (najviše par
stotina po modelu), pa test prolazi ceo prostor, ne uzorak.

---

## 2. SLIKE

### 2.1 `nano-banana-2` — Nano Banana 2 · `google`

Gemini 3.1 Flash Image. Endpoint: `gemini-3.1-flash-image`.
Režimi: `text`, `image_multi` (edit, 1–10 slika).

**Parametri**

| key | type | opcije | default |
|---|---|---|---|
| `prompt` | textarea (max 2000) | — | — |
| `resolution` | segmented | 0.5K · **1K** · 2K · 4K | `1K` |
| `aspect_ratio` | select | 1:1 · 16:9 · 9:16 · 4:3 · 3:4 | `1:1` |
| `num_images` | number 1–4 | — | 1 |

**Cenovno pravilo**
```json
{ "unit": "image", "baseUsd": 0.067, "addUsd": 0.003,
  "multipliers": [{ "param": "resolution", "map": { "0.5K": 0.75, "1K": 1, "2K": 1.5, "4K": 2 } }],
  "quantityParam": "num_images" }
```

| Rezolucija | Nabavno | **Krediti** |
|---|---|---|
| 0,5K | $0,053 | **12** |
| 1K | $0,070 | **16** |
| 2K | $0,104 | **23** |
| 4K | $0,137 | **30** |

### 2.2 `nano-banana-pro` — Nano Banana Pro · `google`

Gemini 3 Pro Image. Endpoint: `gemini-3-pro-image`.
Režimi: `text`, `image_multi`.

> **1K ne postoji kao opcija.** Google naplaćuje identično za 1K i 2K
> (1 120 tokena oba). Ponuditi 1K znači naplatiti isto za manju sliku.

**Parametri:** `prompt`, `resolution` (segmented: **2K** · 4K),
`aspect_ratio`, `num_images` (1–4).

```json
{ "unit": "image", "baseUsd": 0.134, "addUsd": 0.015,
  "multipliers": [{ "param": "resolution", "map": { "2K": 1, "4K": 1.791 } }],
  "quantityParam": "num_images" }
```

| Rezolucija | Nabavno | **Krediti** |
|---|---|---|
| 2K | $0,149 | **33** |
| 4K | $0,255 | **56** |

`addUsd: 0.015` su thinking tokeni — Pro je **misleći** model i naplaćuje ih
posebno po $12/M. Na složenom promptu ume da premaši; prati `actualCostUsd`.

### 2.3 `gpt-image-2` — GPT Image 2 · `fal`

`openai/gpt-image-2`. Režimi: `text`, `image_multi`.

> **Cena nije monotona po rezoluciji.** 1024×1024 high ($0,211) je **skuplji**
> od 1536×1024 high ($0,165). Zato `lookup`, ne množioci.

**Parametri:** `prompt`, `quality` (segmented: low · **medium** · high),
`size` (select: 1024×1024 · 1024×1536 · 1536×1024 · 1920×1080 · 2560×1440 ·
3840×2160), `num_images` (1–4).

```json
{ "unit": "image",
  "lookup": { "params": ["quality","size"], "map": {
    "low|1024x1024": 0.006,  "medium|1024x1024": 0.053, "high|1024x1024": 0.211,
    "low|1024x1536": 0.005,  "medium|1024x1536": 0.042, "high|1024x1536": 0.165,
    "low|1536x1024": 0.005,  "medium|1536x1024": 0.042, "high|1536x1024": 0.165,
    "low|1024x768":  0.005,  "medium|1024x768":  0.037, "high|1024x768":  0.145,
    "low|1920x1080": 0.005,  "medium|1920x1080": 0.040, "high|1920x1080": 0.158,
    "low|2560x1440": 0.007,  "medium|2560x1440": 0.056, "high|2560x1440": 0.222,
    "low|3840x2160": 0.012,  "medium|3840x2160": 0.101, "high|3840x2160": 0.401 } },
  "quantityParam": "num_images" }
```

Krediti idu od **3** (low 1024²) do **87** (high 4K). Medium 1024² = **12**.

> ⚠️ **fal podrazumeva `quality: high`.** `defaultParams` MORA da pinuje
> `quality` i `size`. Bez toga low tarifa (3 kredita) košta $0,211 — trideset
> pet puta više nego naplaćeno.

### 2.4 `gpt-image-15` — GPT Image 1.5 · `fal`

Isti oblik kao 2, druga tabela.

```json
{ "unit": "image",
  "lookup": { "params": ["quality","size"], "map": {
    "low|1024x1024": 0.009, "medium|1024x1024": 0.034, "high|1024x1024": 0.133,
    "low|1024x1536": 0.013, "medium|1024x1536": 0.051, "high|1024x1536": 0.200,
    "low|1536x1024": 0.013, "medium|1536x1024": 0.050, "high|1536x1024": 0.199 } },
  "quantityParam": "num_images" }
```
Krediti: **3** (low) · **8** (medium) · **30** (high 1024²) · **44** (high portrait).

### 2.5 `seedream-45` — Seedream 4.5 · `fal`

Ravna cena, najjednostavnije pravilo u katalogu.
Režimi: `text`, `image_multi`.

```json
{ "unit": "image", "baseUsd": 0.04, "quantityParam": "num_images" }
```
**10 kredita** po slici. Parametri: `prompt`, `aspect_ratio`, `num_images`.

### 2.6 `seedream-5-pro` — Seedream 5 Pro · `byteplus`

`dola-seedream-5-0-pro-260628`. fal uzima **1,50×** — ide direktno.
Režimi: `text`, `image_multi` (do 10 referenci), **`layerize`**.

**Parametri:** `prompt`, `resolution` (segmented: **1.5K** · 2K),
`num_images`, i u `layerize` režimu `layers` (slider 2–17).

```json
{ "unit": "image", "baseUsd": 0.045,
  "multipliers": [{ "param": "resolution", "map": { "1.5K": 1, "2K": 2 } }],
  "quantityParam": "num_images",
  "extras": [{ "param": "input_images", "freeCount": 1, "usdEach": 0.003 }] }
```
Layerize ima svoje pravilo (`unit: "layer"`, `baseUsd: 0.0225`,
`quantityParam: "layers"`, isti množilac rezolucije).

| Šta | Nabavno | **Krediti** |
|---|---|---|
| slika ≤1,5K | $0,045 | **10** |
| slika 2K | $0,090 | **20** |
| sloj ≤1,5K | $0,0225 | **5 / sloj** |
| sloj 2K | $0,045 | **10 / sloj** |
| dodatna ulazna slika | $0,003 | **+1** |

> ⚠️ **Granica tarife se razlikuje** — fal kaže 1536×1536 (2,36 M px),
> BytePlus kaže 2,61 M px. U pojasu između fal naplaćuje višu tarifu a BytePlus
> nižu, gde je stvarni odnos **3,0×**. Još jedan razlog za direktno.

> **Layerize je jedina stvar u katalogu koju Midjourney nema ni blizu.**
> Razlaganje slike na providne slojeve koje klijent menja pojedinačno —
> „zameni boju flaše", „promeni tekst na etiketi". To je komercijalni workflow.

### 2.7 `seedream-5-lite` — Seedream 5 Lite · `fal` · parity

```json
{ "unit": "image", "baseUsd": 0.035, "quantityParam": "num_images" }
```
**8 kredita.** Ide do 4K (Pro staje na 2K), ali **nema layerize ni edit po
regionima** — to je Pro-only. Režimi: `text`, `image_multi`.

---

## 3. VIDEO

Svi video modeli imaju `unit: "second"` i `quantityParam: "duration"`.
Cena na dugmetu = `kr/s × trajanje`, i pomera se dok korisnik vuče slajder.

### 3.1 `kling-3` — Kling 3.0 · `fal` · parity

Endpointi po režimu: `v3/{tier}/text-to-video`, `.../image-to-video`.
Režimi: `text`, `image`.

**Parametri:** `prompt`, `resolution` (segmented: **720p** · 1080p · 4K),
`audio` (switch, default on), `voice_control` (switch, vidljiv samo kad je
`audio` on), `duration` (slider 5–10s).

```json
{ "unit": "second", "quantityParam": "duration",
  "lookup": { "params": ["resolution","audio","voice_control"], "map": {
    "720p|off|off": 0.084, "720p|on|off": 0.126, "720p|on|on": 0.154,
    "1080p|off|off": 0.112, "1080p|on|off": 0.168, "1080p|on|on": 0.196,
    "4K|off|off": 0.42, "4K|on|off": 0.42, "4K|on|on": 0.42 } } }
```

| Rezolucija · zvuk | Nabavno/s | **kr/s** | 5s |
|---|---|---|---|
| 720p bez zvuka | $0,084 | **19** | 95 |
| 720p sa zvukom | $0,126 | **28** | 140 |
| 720p + voice control | $0,154 | **34** | 170 |
| 1080p bez zvuka | $0,112 | **25** | 125 |
| 1080p sa zvukom | $0,168 | **37** | 185 |
| 1080p + voice control | $0,196 | **43** | 215 |
| 4K (zvuk svejedno) | $0,420 | **91** | 455 |

> **Nazivi u UI-ju kažu rezoluciju.** fal-ovo „standard/pro" kod Klinga **nije
> kvalitet nego 720p/1080p** — isti model, iste težine. Korisnik koji vidi
> „Pro" misli da dobija bolju sliku i plaća više ni za šta.

> **4K ne postaje jeftiniji bez zvuka.** Ista cena, pa `audio` switch na 4K
> nema efekta na cenu — UI to mora da prikaže, ne da ćuti.

### 3.2 `kling-3-turbo` — Kling 3.0 Turbo · `fal`

Zvuk je uključen u cenu, **nema 4K**, i **nije jeftiniji** — Turbo je brzina.
Režimi: `text`, `image`, **`first_last`** (720p varijanta radi prvi+poslednji kadar).

```json
{ "unit": "second", "quantityParam": "duration",
  "multipliers": [{ "param": "resolution", "map": { "720p": 1, "1080p": 1.25 } }],
  "baseUsd": 0.112 }
```
720p **25 kr/s** · 1080p **31 kr/s**.

### 3.3 `kling-omni` — Kling O3 (Omni 3) · `fal`

Najbogatiji ulazima u celom katalogu.
Režimi: `text`, `first_last`, `reference`, **`video`** (izmena i referenca).

**Parametri:** `prompt`, `resolution` (720p · 1080p · 4K), `audio` (switch),
`duration`.

```json
{ "unit": "second", "quantityParam": "duration",
  "lookup": { "params": ["resolution","audio"], "map": {
    "720p|off": 0.084, "720p|on": 0.112,
    "1080p|off": 0.112, "1080p|on": 0.14,
    "4K|off": 0.42, "4K|on": 0.42 } },
  "modeMultipliers": { "video": 1.5 } }
```
720p bez zvuka **19 kr/s** · sa zvukom **25** · 1080p **25 / 31** · 4K **91**.
U `video` režimu (izmena postojećeg videa) množilac 1,5 → 720p **28 kr/s**.

### 3.4 `seedance-20` — Seedance 2.0 · `byteplus`

`dreamina-seedance-2-0-260128`. fal uzima **2,00×** — direktno.
Režimi: `text`, `image`, `reference`.

**Parametri:** `prompt`, `resolution` (480p · **720p** · 1080p · 4K),
`tier` (segmented: **Standard** · Fast · Mini — Mini nema 1080p ni 4K),
`duration` (slider 4–12s).

```json
{ "unit": "second", "quantityParam": "duration",
  "lookup": { "params": ["tier","resolution"], "map": {
    "standard|480p": 0.070, "standard|720p": 0.151, "standard|1080p": 0.374, "standard|4K": 0.780,
    "fast|480p": 0.056,     "fast|720p": 0.121,
    "mini|480p": 0.036,     "mini|720p": 0.077 } },
  "modeMultipliers": { "reference_with_video": 0.6 } }
```

| Tier · rezolucija | Nabavno/s | **kr/s** | 5s |
|---|---|---|---|
| Mini 480p | $0,036 | **8** | 40 |
| Mini 720p | $0,077 | **17** | 85 |
| Fast 720p | $0,121 | **27** | 135 |
| Standard 480p | $0,070 | **16** | 80 |
| Standard 720p | $0,151 | **33** | 165 |
| Standard 1080p | $0,374 | **81** | 405 |
| Standard 4K | $0,780 | **169** | 845 |

### 3.5 `seedance-25` — Seedance 2.5 · `byteplus`

`dreamina-seedance-2-5-260628`. **Do 30 sekundi u jednom kadru.**
Nema 4K, nema Fast ni Mini. Režimi: `text`, `image`, `reference` (do 50 referenci).

```json
{ "unit": "second", "quantityParam": "duration",
  "lookup": { "params": ["resolution"], "map": {
    "480p": 0.103, "720p": 0.231, "1080p": 0.569 } },
  "modeMultipliers": { "reference_with_video": 0.6 } }
```
480p **23 kr/s** · 720p **50 kr/s** · 1080p **125 kr/s**.
`duration`: slider **4–30s**.

> ⚠️ **Aktivacija: $30 na BytePlus nalogu po Seedance modelu**, zaključano dok
> je model aktivan — **$60 za oba**. Seedream 5 nema taj uslov.

> ⚠️ **Individualni nalog: 3 istovremena Seedance posla.** Postojeći limit od 3
> posla po korisniku je slučajno tačan, ali dva korisnika istovremeno pune red.

### 3.6 `minimax-h3` — MiniMax H3 · `fal`

`minimax/h3/*` — **bez `fal-ai/` prefiksa.**
**Nativni stereo zvuk uključen u cenu, bez doplate.**
Režimi: `text`, `image`, `first_last`, `reference`.

**Parametri:** `prompt`, `resolution` (480p · **768P** · 2K · 4K),
`lora` (switch — LoRA za konzistentnost subjekta, +25%),
`duration` (slider **4–15s**), `aspect_ratio` (7 opcija).

```json
{ "unit": "second", "quantityParam": "duration",
  "multipliers": [
    { "param": "resolution", "map": { "480p": 1, "768p": 1.2, "2K": 2.6, "4K": 3.2 } },
    { "param": "lora", "map": { "off": 1, "on": 1.25 } }],
  "baseUsd": 0.05,
  "extras": [{ "param": "reference_images", "freeCount": 5, "usdEach": 0.08 }] }
```
480p **11 kr/s** · 768P **13** · 2K **29** · 4K **35**. Sa LoRA +25%.
Referentna slika preko pete: **+18 kredita**.

> **Najjeftiniji video sa zvukom u katalogu.** 5s 768P sa nativnim zvukom:
> H3 **65 kr**, Veo Lite 55, Kling 3.0 **140**. I ide do 15s, ne do 5s.

> ⚠️ **fal-ova cena je sporna.** Stranice modela kažu $0,13/s na 2K, „learn"
> stranice $0,26/s. Pusti jednu generaciju i pročitaj fakturu pre uključivanja.

### 3.7 `veo-31-lite` · `veo-31-fast` · `veo-31` — tri reda, dva provajdera

Veo je jedini model gde **tier menja provajdera**, pa mora tri reda.

| Model | Ruta | Zašto |
|---|---|---|
| `veo-31-lite` | **fal** | parity na sve četiri ćelije |
| `veo-31-fast` | **google** | fal marža 17–50% |
| `veo-31` (Standard) | **fal** | parity na sve četiri ćelije |

**Zajednički parametri:** `prompt`, `resolution`, `audio` (switch),
`duration` (slider 4–8s; Standard i Fast do 30s u `video` režimu = extend).

**Lite** — režimi `text`, `image`, `first_last`. Nema `reference` ni `extend`.
```json
{ "unit": "second", "quantityParam": "duration",
  "lookup": { "params": ["resolution","audio"], "map": {
    "720p|off": 0.03, "720p|on": 0.05, "1080p|off": 0.05, "1080p|on": 0.08 } } }
```
720p nemo **7 kr/s** · 720p zvuk **11** · 1080p nemo **11** · 1080p zvuk **18**.

**Fast** — režimi `text`, `image`, `first_last`, `reference`, `video` (extend).
```json
{ "unit": "second", "quantityParam": "duration",
  "lookup": { "params": ["resolution","audio"], "map": {
    "720p|off": 0.08, "720p|on": 0.10, "1080p|off": 0.10, "1080p|on": 0.12,
    "4K|off": 0.25, "4K|on": 0.30 } } }
```
720p zvuk **22 kr/s** · 1080p zvuk **26** · 4K zvuk **65**.

**Standard** — isti režimi kao Fast.
```json
{ "unit": "second", "quantityParam": "duration",
  "lookup": { "params": ["resolution","audio"], "map": {
    "720p|off": 0.20, "720p|on": 0.40, "1080p|off": 0.20, "1080p|on": 0.40,
    "4K|off": 0.40, "4K|on": 0.60 } } }
```
Bez zvuka **44 kr/s** · sa zvukom **87** · 4K zvuk **130**.

> ⚠️ **Veo Fast direktno traži poller.** Google nema webhookove za video —
> vraća `operation` koji se ispituje. Jedina nova mašinerija u katalogu.

### 3.8 `gemini-omni` — Gemini Omni Flash · `google`

`gemini-omni-flash-preview`, **Interactions API**, ne `generateContent`.
Izlaz 3–10s, 720p, 24 fps, nativni sinhronizovan zvuk. Samo 16:9 i 9:16.
Režimi: `text`, `image`, `reference`, `video` (razgovorna izmena).

```json
{ "unit": "second", "quantityParam": "duration", "baseUsd": 0.10136 }
```
**22 kr/s** · 5s = 110 kredita.

**Parametri:** `prompt`, `aspect_ratio` (16:9 · 9:16), `duration` (slider 3–10s).
Rezolucija je fiksna 720p — ne izlaži kontrolu koja ima jednu opciju.

> ⚠️ Tri ograničenja koja moraju biti **poruka u UI-ju, ne tiha greška:**
> izmena **uploadovanog** videa nije dozvoljena iz EEA/Švajcarske/UK (izmena
> videa koji je model sam napravio jeste) · upload audio referenci **ne radi**
> iako je dokumentovan · nema produžavanja ni prvi/poslednji kadar.

> ⚠️ **Public preview sa uskom kvotom.** Kvotna greška mora da refundira i da
> kaže zašto, ne da posao visi.

### 3.9 Kling alati — `kling-avatar`, `kling-lipsync`, `kling-motion`, `kling-tryon`

| Model | `inputMode` | Parametri | Nabavno | **Krediti** |
|---|---|---|---|---|
| `kling-avatar` | `image_audio` | `quality` (720p/1080p) | $0,0562 / $0,115 /s | **13 / 25 kr/s** |
| `kling-lipsync` | `video_audio` · `video`+`text` | `source` (audio/tekst) | $0,014/s ulaza\* | **4 kr/s** |
| `kling-motion` | `video_image` | `resolution` (720p/1080p) | $0,126 / $0,168 /s | **28 / 37 kr/s** |
| `kling-tryon` | `image_multi` (2) | — | $0,07 | **16** |
| `kling-v2a` | `video` | — | $0,035 | **8** |

\* zaokružuje se naviše na 5 sekundi — video od 3s se naplaćuje kao 5s,
minimum **20 kredita**. To mora u `priceRule` kao `roundUpTo: 5`.

---

## 4. ZVUK — `fal` · parity na svemu

### 4.1 `tts` — ElevenLabs v3 ⭐

`fal-ai/elevenlabs/tts/eleven-v3`. **Jedini model sa srpskim.**

**Parametri:** `text` (textarea, brojač znakova, max 5000),
`voice` (select — lista glasova sa preslušavanjem),
`stability` (slider 0–1), `similarity` (slider 0–1), `style` (slider 0–1),
`speed` (slider 0,7–1,2).

```json
{ "unit": "chars1k", "baseUsd": 0.10, "quantityParam": "char_count" }
```
**25 kredita / 1 000 znakova.** Cena na dugmetu se pomera dok korisnik kuca.

> **Multilingual v2 (29 jezika) i Flash v2.5 (32) NEMAJU srpski**, iako imaju
> hrvatski. Jeftinija varijanta od $0,05/1k ne dolazi u obzir. Nema v4.

### 4.2 Ostali audio alati

| Model | Endpoint | `inputMode` | Nabavno | **Krediti** |
|---|---|---|---|---|
| `dialogue` | `text-to-dialogue/eleven-v3` | text | $0,10/1k zn. | **25 / 1 000 zn.** |
| `sfx` | `sound-effects/v2` | text | $0,002/s | **1 kr/s**, min 5 |
| `music` | `elevenlabs/music` | text | $0,60/min | **130 / min** |
| `stt` | `speech-to-text/scribe-v2` | audio · video | $0,008/min | **3 / min** |
| `voice-changer` | `elevenlabs/voice-changer` | audio | $0,30/min | **65 / min** |
| `audio-isolation` | `elevenlabs/audio-isolation` | audio | $0,10/min | **22 / min** |
| `dubbing` | `elevenlabs/dubbing` | video · audio | $0,60/min | **130 / min** |

Scribe **V2** je 3,75× jeftiniji od V1 ($0,008 vs $0,03/min). V1 ne ulazi.

---

## 5. Ulazni režimi — ugovor za UI

| `inputMode` | Šta korisnik daje | shadcn |
|---|---|---|
| `text` | samo prompt | `Textarea` |
| `image` | 1 slika | `<DropSlot>` |
| `image_multi` | 1–10 slika | `<DropSlotGrid>` sa reorder |
| `first_last` | **prvi i poslednji kadar** | `<FrameSlotPair>` — dva imenovana slota sa strelicom |
| `reference` | do 9 slika + 3 videa + 3 audio | `<ReferenceSlots>` — tri grupe, numerisane |
| `video` | 1 video | `<DropSlot accept="video/*">` |
| `video_image` | video + slika | dva `<DropSlot>` |
| `image_audio` | slika + audio | dva `<DropSlot>` |
| `video_audio` | video + audio ili tekst | `<DropSlot>` + `ToggleGroup` izvora |
| `audio` | 1 audio | `<DropSlot accept="audio/*">` |
| `layerize` | 1 slika + broj slojeva | `<DropSlot>` + `Slider` |

**Prekidač režima** je `ToggleGroup` iznad forme, vidljiv samo ako model ima
više od jednog režima. Prebacivanje: menja endpoint (isti model), čisti slotove
koji ne postoje u novom režimu uz tihu potvrdu, preračunava cenu.

**Reference slotovi su numerisani** — prompt ih citira po broju („slika 2"), pa
je redosled značajan i mora se moći prevlačiti.

**`first_last` traži oba slota** pre nego što se dugme otključa, sa porukom
„Dodaj završni kadar".

---

## 6. Komponente koje se dele

Ovo je poenta cele reorganizacije — pisati jednom, koristiti svuda.

| Komponenta | Koristi je |
|---|---|
| `<ParamControl>` | svi modeli; grana po `type` na shadcn primitivu |
| `<ParamForm>` | gradi ceo set kontrola iz `paramSpec`, filtrira po režimu |
| `<PriceTag>` | značka uz kontrolu: `+12 kr`, `×2` |
| `<GenerateButton>` | cena, zaključavanje, poruke grešaka |
| `<DropSlot>` | jedan fajl, drag&drop, pregled, validacija |
| `<DropSlotGrid>` | više fajlova, reorder, brojač `3/9` |
| `<FrameSlotPair>` | prvi/poslednji kadar |
| `<ReferenceSlots>` | tri grupe sa numeracijom |
| `<ModeSwitcher>` | prekidač ulaznih režima |
| `<ModelPicker>` | grupisano po `family`, filter, pretraga |
| `<DurationSlider>` | trajanje + cena uživo |

Sve iz `paramSpec` i `priceRule` — **nijedna komponenta ne zna ime nijednog
modela.** Ako komponenta ima `if (slug === "...")`, to je bug.

---

## 7. Rutiranje — sažetak

| Provajder | Modeli |
|---|---|
| **fal** | GPT Image 2 · GPT Image 1.5 · Seedream 4.5 · Seedream 5 Lite · Kling 3.0 · Kling 3.0 Turbo · Kling Omni · Kling alati · MiniMax H3 · Veo 3.1 Lite · Veo 3.1 Standard · ceo ElevenLabs |
| **google** | Nano Banana 2 · Nano Banana Pro · Veo 3.1 Fast · Gemini Omni |
| **byteplus** | Seedream 5 Pro · Seedance 2.0 · Seedance 2.5 |

fal marža po porodici: Gemini Omni 1,25× · Nano Banana Pro 1,12× · NB2 1,19× ·
Veo Fast 1,17–1,50× · Seedream 5 **Pro** 1,50× · Seedance **2,00×**.
Seedream 5 **Lite** je parity — Pro i Lite idu **različitim rutama**.

**Ne ulaze:** Midjourney (nema API, ToS zabranjuje automatizaciju u tri
klauzule) · FLUX (Jovanova odluka) · ElevenLabs Multilingual/Flash (nemaju
srpski) · Scribe V1 (3,75× skuplji od V2).

---

## 8. Ukupno

**~30 modela**, ne 110 slugova:
7 slika · 11 videa · 4 Kling alata · 8 audio.

Svaki sa svojim parametrima, svaki sa svojim cenovnim pravilom, svi na istoj
biblioteci komponenti.
