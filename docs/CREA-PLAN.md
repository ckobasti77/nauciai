# CREA — plan i izvor istine

Datum: 2026-10-04. Autor plana: Claude (Opus 5.5) sa Jovanom.
Studio se od sada zove **Crea** (lat. *crea* = „stvaraj"). Cilj: domaća bolestina u
pozitivnom smislu — sve što Higgsfield ima za **sliku, video i zvuk**, ali bolje, na
srpskom, jeftinije, animiranije i gejmifikovano. Sve što može bez plaćenog AI-a radi
bez njega (u browseru korisnika, 0 kredita).

Ovaj dokument je izvor istine za noćni run (`.crea-run/`). Svaki korak runa (K01–K30)
pokazuje na feature ID-jeve iz tabela ispod (S = slika, V = video, A = zvuk,
U = UI/UX, G = gejmifikacija, C = cene i temelj). Ako se kod i ovaj dokument
razilaze, **veruj kodu** i upiši ODLUKU u `docs/CREA-PROGRESS.md`.

---

## 1. Brend Crea

- **Ime:** Crea. Nikad „Crea Studio". Uz ime ide potpis „stvaraj." (Patrick Hand).
- **Padeži (srpski):** Crea, Cree, Crei, Creu, Creo, Creom, (u) Crei. Primeri:
  „Napravi u Crei", „Otvori Creu", „Sa Creom praviš…". EN: „Crea".
- **Logo** (gotov, ne crtati ponovo):
  - `public/brand/crea/` — `crea-znak(.svg|-tamno.svg)`, `crea-wordmark(-tamno).svg`,
    `crea-lockup(-tamno).svg` (wordmark + „stvaraj."), `crea-ikonica.svg` (žuta pločica),
    `crea-ikonica-mastilo.svg`, `crea-favicon.svg|.ico|-16|-32|-48.png`,
    `crea-ikonica-512|192|180.png`, `crea-pecat.svg` (pečat za bedževe), `crea-og.png` (1200×630).
  - `components/crea/crea-logo.tsx` — `<CreaLogo variant="znak"|"wordmark" animated />`.
    Boje idu kroz tokene (`--color-ink`, `--color-yellow`), pa tamna tema radi sama.
    **Treba dodati** `@keyframes crea-ray` u `app/globals.css` (zraci pulsiraju: scale
    1 → 1.25 → 1 i opacity 1 → .6 → 1, ~1.2 s) — animacija se pali samo kroz
    `motion-safe:`.
  - Ideja znaka: „Crea viče" — tri zraka kao u stripu oko slova (energija, „stvaraj!").
    Zraci pulsiraju dok Crea nešto pravi → logo je ujedno indikator rada.
  - Pregled: `docs/crea/crea-logo-pregled.png`.
- **Vizuelni identitet ostaje Nauči AI** (ne kopiramo Higgsfield neon/tamno):
  papir `#fffdf8` / mastilo `#0e3158` / žuta `#f4be30`, Nunito (900 za naslove) +
  Patrick Hand (rukopis), tvrde ofset senke bez blura, 4 radius tiera (AGENTS.md),
  „jedan okvir po grupi". DNK: `docs/studio-redesign/design-dna-platform.json`.
  Tamna tema: tokeni se menjaju sami (`--ink #e9eef6`, `--paper #0e1a2b`).
- **Ton:** srpski, prijateljski, „hype" ali jasan početnicima. Svaki ekran odgovara na
  „šta sad da uradim". Bez žargona; kad mora termin (npr. „reframe"), uz njega
  objašnjenje u 5 reči.
- **Metafora:** sveska / školski pribor — strip, album sličica, pečat, đačka knjižica,
  olovka koja crta dok se generiše.

## 2. Rute i imena

- Javne rute: `/crea` (landing), `/crea/app` (radionica), `/crea/app/m/[jobId]`,
  `/crea/krediti`, uslovi: sr `/uslovi-crea`, en `/en/crea-terms`.
  Stari `/studio/*` i `/uslovi-studio` → **308** na nove (kroz postojeći mehanizam
  `lib/routes.ts` SEGMENTS + `proxy.ts` kanonizaciju — kanonski segment ostaje `studio`,
  menja se samo javni slug). Dopuniti `lib/security-headers.ts` da pogađa i nove javne
  putanje. Testovi u `lib/routes.test.ts` i `lib/security-headers.test.ts`.
- **Interna imena ostaju:** folderi `app/[locale]/studio/...`, Convex moduli
  `convex/studio*.ts`, tabele (`models`, `generationJobs`, `studioProjects`,
  `studioUploads`…), `platformFlags` ključevi `studio_*`. NIŠTA se ne preimenuje u
  bazi ni u imenima Convex funkcija (MCP i klijenti zavise od njih).
- Novi kod: `lib/crea-*.ts` (+ `.test.ts`), `components/crea/*`, `convex/crea*.ts`
  (+ `crea*Core.ts` + testovi). Interfejs (sr/en) kroz `lib/i18n`.
- MCP alati (`convex/mcp/studioTools.ts`): imena alata ostaju, opisi pominju Creu.

## 3. Podrazumevane odluke (Jovan nije odgovorio — biramo konzervativno)

| # | Pitanje | Odluka za ovaj run |
|---|---|---|
| O1 | Marža po kategoriji | Mehanizam + predložene vrednosti u kodu, ali **iza flega** `crea_pricing_v2` u `platformFlags` (podrazumevano ISKLJUČEN, pali se ručno kao `studio_public`). Dok je isključen, cene su iste kao danas. |
| O2 | Besplatni server-radnik (Docker) | NE u ovom runu. Alati 🟣 rade lokalno na jačim uređajima ili idu plaćenim putem; tier „server" postoji u registru ali je isključen. |
| O3 | FAL / BytePlus ključevi | Ne postavljamo env. Postojeći mock/DEMO za osoblje važi; novi modeli se ponašaju isto. |
| O4 | Rezervni jeftini provajder (Kie.ai) | NE. |
| O5 | Zamena lica / kloniranje glasa | Samo sopstveno lice i glas. Lice: samo tvoj sačuvani Lik + čekboks pristanka. Glas: čekboks + izgovorena rečenica pristanka koja se proveri transkriptom. |
| O6 | Javna galerija Crea radova | Gradi se, ali iza flega `crea_public_gallery` (isključen) + moderacija kroz postojeći moderation grid. |
| O7 | OpenAI Batch (GPT Image 2 upola) | Kod spreman, aktivan samo ako postoji `OPENAI_API_KEY` (ne postavljamo). Gemini Batch koristi postojeći `GOOGLE_AI_API_KEY`. |
| O8 | Git i produkcija | Sve na grani `crea-run`, runner pravi lokalni commit posle svakog koraka. Bez push-a, bez `convex deploy`, bez Vercel-a. |

## 4. Arhitektura (smernice — K01 ih pretvara u tačan tehnički dizajn)

1. **Slojevi alata.** Svaki alat ima tier: 🟢 `local-code` (deterministički kod u
   browseru), 🟡 `local-ai` (model u browseru), 🟣 `server` (isključeno, O2),
   🔵 `paid` (provajder, krediti). Jedan registar: `lib/crea-tools.ts` (id, oblast,
   tier, ulazi, izlaz, dostupnost po uređaju, cena ili 0). UI prikazuje oznake:
   „Besplatno", „Na tvom uređaju", „Krediti".
2. **Lokalni rezultati idu u galeriju.** Rezultat lokalnog alata se okači u Convex
   storage (postojeći upload tok) i upiše kao posao sa `provider: "local"`,
   `creditCost: 0`, status gotov, uz veze ka ulazu. Mutacija sa proverama (prijava,
   tip i veličina fajla, limit po minutu i danu). Galerija ih prikazuje kao i ostale.
3. **Stablo verzija.** `generationJobs.parentJobId` (+ `rootJobId`) — opciono polje
   (widen, bez migracije podataka). Svaka izmena, animacija, ozvučavanje i lokalni
   alat pamte roditelja. UI: stablo, „Vrati", pre/posle.
4. **Lokalni AI runtime.** `lib/crea-local-ai/*`: lenjo učitavanje (`import()`),
   detekcija uređaja (WebGPU, `deviceMemory`, `hardwareConcurrency`, mobilni),
   keš modela (Cache Storage), traka napretka preuzimanja, odustajanje, poruka kad
   uređaj ne može. Modeli sa Hugging Face / Google CDN-a, nikad u našem bundle-u.
   Na telefonu samo mali modeli (≤ ~30 MB); veliki samo na desktopu sa WebGPU.
5. **COOP/COEP** (`credentialless`) samo na `/crea` rutama i samo ako neki alat traži
   višenitni WASM — proveriti da ne lomi slike iz Convex storage-a, Google prijavu i
   Stripe tok. Ako lomi: jednonitni režim + ODLUKA.
6. **Cene.** Postojeća formula ostaje kad je `crea_pricing_v2` isključen. V2: marža po
   kategoriji (min ×1,5), cene „proba" i „noćna tura" kao zasebni redovi u cenovniku.
   Popravke C0 (zaokruživanje po minutu kod provajdera) važe odmah — to je ispravka
   gubitka, ne promena cene naviše bez razloga (ODLUKA ako nije jasno).
7. **Bundle.** Teške biblioteke (konva, mediabunny, wavesurfer, transformers.js,
   mediapipe, tesseract, onnxruntime-web…) **samo** kroz `dynamic import` unutar `/crea`
   ruta. Ništa ne ulazi u zajednički bundle marketing strana.
8. **Testovi.** Čista logika (cene, ruter za Auto, registar alata, stanje noćne ture,
   geometrija reframe-a, LUFS, parseri, XP pravila…) u `lib/` ili `convex/*Core.ts` sa
   vitest testovima. Convex funkcije sa `convex-test` po uzoru na postojeće.

## 5. Dozvoljeni paketi (proverene licence)

Uvodi samo ono što korak stvarno koristi, uvek kroz `dynamic import` na `/crea` rutama.

| Namena | Paket | Licenca |
|---|---|---|
| Platno / editor | `konva`, `react-konva` | MIT |
| Isecanje | `react-easy-crop` | MIT |
| Resize | `pica` | MIT |
| Kodeci slika | `@jsquash/webp`, `@jsquash/avif`, `@jsquash/jpeg`, `@jsquash/png` | Apache-2.0 |
| HEIC | `heic-to` (lenjo, zaseban WASM) | LGPL-3.0 (ne menjati WASM) |
| EXIF | `exifr` | MIT |
| Boje/LUT/efekti | `postprocessing` (pmndrs) na postojećem three.js | Zlib |
| Paleta | `colorthief` | MIT |
| QR | `qr-code-styling` | MIT |
| Vektorizacija | `vtracer` WASM build (MIT) | MIT |
| GIF | `gifenc` | MIT |
| OCR | `tesseract.js` (`srp`, `srp_latn`) | Apache-2.0 |
| Pametan isečak | `smartcrop` | MIT |
| Četkica | `perfect-freehand` | MIT |
| Pre/posle | `react-compare-slider` | MIT |
| Lokalni AI | `@huggingface/transformers`, `onnxruntime-web`, `@mediapipe/tasks-vision` | Apache-2.0 / MIT |
| Video mux/izvoz | `mediabunny` (+ `@mediabunny/mp3-encoder` po potrebi) | MPL-2.0 (LAME: LGPL) |
| Vremenska linija | `@xzdarcy/react-timeline-editor` | MIT |
| Zvuk talas | `wavesurfer.js` v8 (+ `@wavesurfer/react`) | BSD-3 |
| Zvuk efekti | `tone` | MIT |
| Rastezanje/visina | `signalsmith-stretch` | MIT |
| Ritam/tonalitet | `web-audio-beat-detector`, `meyda` | MIT |
| Detekcija govora | `@ricky0123/vad-web` | ISC |
| Uklanjanje šuma | `@sapphi-red/web-noise-suppressor` | MIT |
| WAV | `wavefile` | MIT |
| Tabla / čvorovi | `@excalidraw/excalidraw` ili konva; `@xyflow/react` | MIT |
| Konfete | `canvas-confetti` | ISC |
| Lottie | `@lottiefiles/dotlottie-react` | MIT |
| UI zvuci | `use-sound` | MIT |
| Brojevi | `@number-flow/react` | MIT |
| Haptika | `web-haptics` | MIT |

Lokalni modeli (preuzimaju se u browseru, ne idu u repo): MediaPipe face detector,
selfie segmenter, interactive segmenter (MagicTouch); BiRefNet_lite (desktop),
MODNet (telefon); MI-GAN (brisanje); Swin2SR x2 (uvećanje); Depth Anything V2 **Small**;
Florence-2-base (desktop, opis slike); CLIP ViT-B/32 + višejezični CLIP tekst enkoder
(pretraga na srpskom); Whisper large-v3-turbo (desktop, WebGPU); Silero VAD;
RIFE (desktop). Sve Apache-2.0 / MIT.

## 6. Zabranjeno (licence i rizici)

- AGPL: `@imgly/background-removal`, `gifski`, `scribe.js`, `essentia.js`,
  `audioMotion-analyzer`, `DepthFlow`.
- GPL u browseru: `etro`, `inpaint-web`, `web-realesrgan`, potrace i JS portovi,
  RobustVideoMatting, libKeyFinder, Rubber Band, espeak-ng / piper1-gpl,
  `@ffmpeg/core` (ffmpeg.wasm core).
- Nekomercijalne težine: BRIA RMBG-1.4 i 2.0, CodeFormer, GFPGAN, Depth Anything
  V2 Base/Large i DA3 Large/Giant, Apple FastVLM/MobileCLIP/Depth Pro, jina-clip-v2,
  MMS-TTS, madmom, **Piper „sr_RS" glas (zapravo lužičkosrpski, CC BY-NC-SA)**.
- Plaćeno/ograničeno: Remotion (firme > 3 osobe plaćaju), tldraw (licencni ključ),
  Polotno, Twick, Diffusion Studio (vodeni žig), LFM2-VL.
- Sadržaj: Freesound API je nekomercijalan; Pixabay/Mixkit/Sonniss zabranjuju
  redistribuciju kao biblioteku. Za besplatnu SFX biblioteku samo **CC0** (npr. Kenney),
  ručno izabrano i hostovano kod nas.
- GSAP: ne koristiti u alatu gde korisnik sam pravi animacije sa ključnim kadrovima
  (licenca zabranjuje konkurentske vizuelne graditelje) — tu `motion` ili sopstveni kod.

## 7. Feature tabele

Legenda: 🟢 bez AI-a (kod u browseru, 0 kr) · 🟡 AI na uređaju korisnika (0 kr) ·
🟣 naš server (isključeno, O2) · 🔵 plaćeni AI (krediti) · ✅ postoji u kodu.
HF = Higgsfield (za poređenje).

### 7.1 SLIKA

| ID | Funkcija | Šta korisnik dobija | Kako | HF |
|---|---|---|---|---|
| S1 | Radionica „Slika" | Tabovi Napravi · Izmeni · Alati · Likovi; alati levo, rezultat u sredini, istorija desno | 🟢 | ima |
| S2 | Novi modeli | Seedream 5 Flash, Z-Image Turbo, NB2 Lite, FLUX.2 klein/Pro, FLUX Kontext, Qwen-Image Edit, Recraft V4.1, Ideogram, Grok Imagine Image | 🔵 redovi u `models` | ~45 modela |
| S3 | Auto izbor modela | Najjeftiniji model koji ume posao + rečenica „zašto" + limit cene | 🟢 pravila nad `lib/studio-recommendations.ts` | skriveno |
| S4 | Probni list | 4–16 skica za cenu jedne prave slike → izaberi → „Usavrši" | 🔵 jeftin model + 🟢 | samo video |
| S5 | Varijacije 1–4 | Više rezultata, na svakom modelu (paralelni poslovi gde treba) | 🔵 | isto |
| S6 | Pomoćnik za opis | Srpski unos (i glasom) → precizan opis obojen po delovima + objašnjenje | 🔵 jeftin LLM (≈0 kr) + 🟢 Web Speech | samo EN |
| S7 | Slotovi Ko · Gde · Kako | Lik, mesto, stil kao tri slike; opis se sam sklopi | 🟢 nad multi-ref modelima | ručno |
| S8 | Stilovi, kamera, paleta | ~40 stilova sa sličicama + „Moji stilovi"; telo kamere/objektiv/žižna/blenda; paleta iz slike | 🟢 recepti + colorthief | ima |
| S9 | Crtaj i gledaj | Crtaš, slika se osvežava za ~1 s; „Usavrši" | 🔵 FLUX.2 klein / Z-Image, limit osvežavanja | nema |
| S10 | Skica → slika | Platno ili fotka sveske → realna slika | 🟢 + 🔵 | ima |
| S11 | Četkica + opis | Ofarbaš deo, napišeš šta tu ide | 🟢 + 🔵 NB2 maska / Seedream 5 Pro | 3 kr |
| S12 | Klikni i izaberi | Klik na predmet = maska | 🟡 MediaPipe MagicTouch / SlimSAM | nema |
| S13 | Obriši predmet | Mali predmeti besplatno, veliki AI-jem | 🟡 MI-GAN → 🔵 | 3 kr |
| S14 | Ukloni / zameni pozadinu | Isečak besplatno; nova pozadina boja/zamućenje/slika (🟢) ili AI scena (🔵) | 🟡 BiRefNet-lite / MODNet | 1 kr |
| S15 | Proširi / iseci kadar | Dugmad „za Instagram/TikTok/YouTube" | 🟢 + 🔵 FLUX.2 Outpaint / NB2 | ima |
| S16 | Uvećaj | 2× na uređaju; veće → 🔵 | 🟡 Swin2SR → 🔵 | ~3 kr |
| S17 | Boje i svetlo | Klizači + filmski LUT | 🟢 postprocessing | ima |
| S18 | Novo svetlo | „Sunce" na 3D kugli oko lika → AI osvetli | 🟢 + 🔵 | 2 kr |
| S19 | Uglovi kamere | 9 uglova iz JEDNE generacije (mreža 3×3) → isečemo lokalno | 🔵 NB2 4K + 🟢 | 0,2 kr/ugao |
| S20 | Slojevi | Pomeraj/sakrij/prefarbaj slojeve | ✅ Seedream 5 Pro razlaganje + 🟢 editor | 15–24 kr |
| S21 | Tekst kao sloj | Tekst bez grešaka sa č ć š ž đ i ćirilicom; stari tekst prepoznaj i obriši | 🟡 OCR + 🟢 fontovi | 3,5 kr |
| S22 | Retuš i stare fotke | Blag retuš besplatno; vraćanje fotki plaćeno | 🟢 → 🔵 | ima |
| S23 | Odeća i proizvodi | ✅ Kling proba odeće + jeftiniji model; proizvod se iseče i postavi u scenu | 🟡 + 🔵 | ima |
| S24 | Zameni lik | Samo tvoj sačuvani Lik, uz pristanak (O5) | 🔵 | ima |
| S25 | Pre/posle + stablo verzija | Klizač, stablo, „Vrati" | 🟢 | nema |
| S26 | Iseci/rotiraj/okreni/promeni veličinu | | 🟢 react-easy-crop, pica | |
| S27 | Format i kompresija, EXIF/GPS, HEIC→JPG | | 🟢 jSquash, exifr, heic-to | |
| S28 | Tekst, nalepnice, oblici, vodeni žig, kolaž | Srpski fontovi (Nunito, Patrick Hand) | 🟢 Konva | |
| S29 | Šabloni: mim, thumbnail, poster, pozivnica, objava | JSON scene | 🟢 | |
| S30 | Pametan isečak (lice ostaje u kadru) | | 🟡 smartcrop + MediaPipe | |
| S31 | Paleta, QR, vektor (SVG), GIF | | 🟢 | |
| S32 | Tekst sa slike (srpski lat/ćir) | | 🟡 tesseract.js | |
| S33 | „3D foto" paralaksa → MP4 | | 🟡 Depth Anything V2 Small + three.js + mediabunny | |
| S34 | Likovi i elementi | @Lik/@Mesto/@Predmet; jednom sačuvaš, koristiš svuda; bez treniranja | 🔵 ref-modeli + 🟢 | Soul ID 25 kr |
| S35 | Provera fotke pre plaćanja | Lice vidljivo/oštro/jedna osoba? | 🟡 MediaPipe | nema |
| S36 | Napravi lik kao u igrici | Meniji → list lika (napred/bok/leđa) | 🟢 + 🔵 NB Pro | AI Influencer |
| S37 | Recepti | ~20 srpskih recepata: profilna, CV fotka, foto-dump lika, jelovnik za kafić, oglas za stan, pozivnica za slavu/rođendan, bojanka, logo… fiksna cena, primer, 2–3 polja | 🟢 + 🔵 | ~100 EN aplikacija |
| S38 | Brend kit | Logo, boje, fontovi, ton → sami ulaze u recepte | 🟢 | Ads Studio |
| S39 | Serije | 1 proizvod × N tekstova/formata; noćna tura upola | 🔵 | 4 kr/oglas |
| S40 | Viber nalepnice i sprajtovi | 9 izraza lika iz jedne slike → isečeno, bez pozadine, paket; sprajt iz kratkog videa | 🔵 + 🟡🟢 | AutoSprite |
| S41 | Logo i ikone | Recraft vektor + vtracer | 🔵 + 🟢 | Recraft |
| S42 | Slika → 3D model | GLB u postojećem 3D pregledaču | 🔵 + 🟢 | ima |
| S43 | Pametna biblioteka | Pretraga na srpskom bez tagova, duplikati, masovne akcije, poređenje | 🟡 CLIP → Convex vektorski indeks | osnovno |
| S44 | Brze akcije | Animiraj, Ozvuči, Izmeni, Uvećaj, Ukloni pozadinu, Napravi sličnu, Koristi kao referencu | 🟢 | ima |
| S45 | „Kako je ovo napravljeno?" | Opis, model, cena; za tuđu sliku opis napravi AI | 🟡 Florence-2 / 🔵 | kopira opis |

### 7.2 VIDEO

| ID | Funkcija | Šta korisnik dobija | Kako | HF |
|---|---|---|---|---|
| V1 | Radionica „Video" | Tabovi Napravi · Izmeni · Pokret · Govor · Montaža; istorija i „Napravi ovako" | 🟢 | ima |
| V2 | Novi modeli | Grok Imagine 1.5 Lite, Seedance 2.0 Mini/Fast, Wan 3.0, LTX-2.3, Hailuo 2.3 Fast, MiniMax H3 Max Turbo, PixVerse V6 | 🔵 | ~50 |
| V3 | Proba → Usavrši | Jeftina proba (480p/Lite) pa konačna verzija istog kadra | 🔵 (Seedance 2.5 draft) | samo Seedance 2.5 |
| V4 | Nastavi od poslednjeg kadra | Poslednji kadar se izvuče lokalno → početak sledećeg; prvi+poslednji kadar svuda | 🟢 mediabunny | ručno |
| V5 | Produži klip | ✅ Veo do 30 s + Seedance 2.5 napred/nazad | 🔵 | isto |
| V6 | Čipovi @Lik @Mesto @Pokret @Zvuk | Elementi iz S34, klik umesto sintakse | 🟢 + 🔵 | @elements |
| V7 | Pokreti kamere | ~40 pokreta sa animiranim SKICAMA (SVG, bez videa) + mini-lekcija | 🟢 recept | ~65 |
| V8 | Efekti | ~30 viralnih + naši (Beograd noću, slava, kafana) + „Spoji dva efekta" | 🟢 recepti | 87 + Mix |
| V9 | Režiserski pult | Žanr, era, tempo, kamera, objektiv, blenda, svetlo, paleta, emocija lika | 🟢 sastavljač opisa | Cinema Studio |
| V10 | Strip → film | Priča → 3–8 kadrova kao strip → slika po kadru sa istim likom → animiraj → spoji | 🔵 + 🟢 | Popcorn + AI Director |
| V11 | Više scena u klipu | Kartica po sceni (do 6) | 🔵 Kling 3.0 | isto |
| V12 | Crtaj pokret | Strelice preko prvog kadra | 🟢 + 🔵 | Draw-to-Video |
| V13 | Izmeni rečima | „dodaj kišu", „skloni auto" | ✅ Kling O3 video režim + 🔵 Seedance 2.5 edit | Edit Video |
| V14 | Zameni predmet ili lik | Referentna slika menja predmet | 🔵 | Genjutsu |
| V15 | Reframe 9:16 · 1:1 · 16:9 | Lice ostaje u kadru | 🟡 MediaPipe + 🟢 | 70 kr/15 s |
| V16 | Boje i LUT | Filmski izgledi, izvoz MP4 | 🟢 WebGL + mediabunny | 135 kr/15 s |
| V17 | Uvećaj, slow-mo, bez treperenja | | 🔵 ByteDance upscaler; 🟡 RIFE (desktop) | 8–132 kr |
| V18 | Ukloni pozadinu videa | Ljudi besplatno, predmeti plaćeno | 🟡 MediaPipe → 🔵 | plaćeno |
| V19 | Novo svetlo za video | | 🔵 (može ostati „uskoro" ako nema endpointa) | 135 kr/15 s |
| V20 | Prenos pokreta + „Odglumi" | ✅ Kling prenos; snimiš se kamerom, lik ponovi | 🟢 + 🔵 | Motion Control |
| V21 | Lik koji govori | ✅ Kling avatar; scene Selfi, Podkast, Vesti, Predavanje, Auto | 🔵 | Lipsync Studio |
| V22 | Lipsync | ✅ Kling lipsync + kvalitetniji model | 🔵 | ~20 kr/10 s |
| V23 | Napiši → izgovori → oživi | Tekst → srpski glas → avatar ili 3D maskota | 🔵 | dva alata |
| V24 | Montaža u browseru | Seci/deli/spajaj, prelazi, naslovi, muzika sa utišavanjem ispod govora, brzina, unazad/bumerang, PiP, Ken Burns, izvoz MP4/GIF | 🟢 mediabunny + WebCodecs + timeline | nema |
| V25 | Titlovi na srpskom | Latinica/ćirilica, karaoke stilovi, utisnuti | ✅ 🔵 stt ili 🟡 Whisper (desktop) + 🟢 | Clipify EN |
| V26 | Kratki klipovi iz dugog videa | Najbolji momenti → 9:16 + titlovi | 🔵 transkript+LLM (centi) + 🟢🟡 | Clipify |
| V27 | Retro efekti i match-cut | VHS, CRT, glič, termo, noćni vid, Nokia, pisaća mašina | 🟢 shaderi + 🟡 | Tracelab |
| V28 | Objašnjavajući video | Lekcija → scene u stilu (tabla, štapići, papir, glina, pikseli) → animacija + srpski glas + titlovi | 🔵 jeftine slike + TTS + 🟢🟡 | 246 kr/min |
| V29 | „Ubaci i gotovo" šabloni | Tvoje slike po ritmu pesme | 🟢 | viral preseti |
| V30 | Izvoz za mreže | Preseti, sigurne zone, provera pre objave | 🟢 | Virality Predictor |
| V31 | Reklama za mali biznis | Fotka proizvoda + 2 rečenice → govorni oglas ili animacija | 🔵 | Marketing Studio |

### 7.3 ZVUK

| ID | Funkcija | Šta korisnik dobija | Kako | HF |
|---|---|---|---|---|
| A1 | Radionica „Zvuk" | Tabovi Govor · Glasovi · Promena glasa · Prevod · Muzika · Efekti · Uređivač | 🟢 | 3 taba |
| A2 | Jeftin srpski glas | Gemini 3.8 Flash TTS kao osnovni (Google ključ već radi), ElevenLabs premium, MiniMax | 🔵 | srpski nesiguran |
| A3 | Biblioteka glasova | Filteri, slušanje odmah (keš uzoraka), omiljeni, sačuvana podešavanja | 🟢 | 113 glasova |
| A4 | Emocije kao nalepnice | [šapuće] [smeje se] [pauza] u tekst; raspoloženje, brzina, visina, „opiši kako da zvuči", varijacije 1–4 | 🟢 UI nad audio tagovima | klizač |
| A5 | Dijalog i podkast | Do 10 govornika; plaćaš samo izmenjenu liniju | 🔵 + 🟢 spajanje | ceo tekst |
| A6 | Podkast iz lekcije | Dva voditelja razgovaraju na srpskom | 🔵 jeftin LLM + TTS | nema |
| A7 | Kloniraj svoj glas | Vođeno snimanje, provera buke, izgovoreni pristanak (O5) | 🟡 + 🔵 | 40 kr |
| A8 | Dizajniraj glas | Opis → 3 predloga → sačuvaj | 🔵 | nema |
| A9 | Promena glasa | ✅ + po govorniku u videu, muzika ostaje | 🔵 | ima |
| A10 | Prevod i sinhronizacija | ✅ (sa srpskim) + pregled/ispravka prevoda pre sinteze, usne, SRT | 🔵 | ~$9–13/min |
| A11 | Muzika | ✅ ElevenLabs + Lyria (jeftino); pesma po delovima + tekst, instrumental, petlje | 🔵 | nema |
| A12 | Ozvuči moj video | AI pogleda klip → 4 numere + efekti, muzika se utiša ispod govora | 🔵 + 🟢 | nema |
| A13 | Zvučni efekti | ✅ + jeftiniji modeli + CC0 biblioteka | 🔵 + 🟢 | samo igre |
| A14 | Uređivač zvuka | Talas, seci/spoji/fade, −14 LUFS, kompresor, EQ, eho, brzina/visina, tišina, više traka, ambijent, MP3/WAV | 🟢 + 🟡 VAD | nema |
| A15 | Čišćenje zvuka | Lokalno; teško → ✅ 🔵 isolation | 🟡 | — |
| A16 | Transkript i uređivanje tekstom | Govornici, vreme, SRT/VTT, lat↔ćir; obriši reč → nestane iz snimka | ✅ 🔵 stt + 🟢 | nema |
| A17 | Snimač | Snimanje u browseru, merač, ponovo | 🟢 | — |
| A18 | Razdvoji na trake | Glas/muzika/bubanj/bas | 🔵 (🟣 kasnije) | nema |
| A19 | Ritam i tonalitet | BPM, tonalitet, markeri za montažu | 🟢 | nema |
| A20 | Audiogram | Zvuk + slika → video sa talasom i titlovima | 🟢 | nema |
| A21 | „Sigurno za objavu" | Oznaka licence na muzici i glasovima | 🟢 | nema |

### 7.4 UI/UX

| ID | Šta | Opis |
|---|---|---|
| U1 | Tri radionice, jedna ljuska | Slika · Video · Zvuk kao veliki tabovi; isti raspored; na telefonu polje za unos je donja fioka. Brend ostaje papir/mastilo/žuta |
| U2 | „Šta praviš danas?" | Početni ekran po cilju → recept; modeli tek pod „Napredno" |
| U3 | Ekran čekanja | Olovka crta skicu; koraci na srpskom (U redu → Crta → Boji → Gotovo), mesto u redu, procena, delimičan pregled |
| U4 | Otkrivanje rezultata | Slika se razvija kao polaroid, video kao filmska traka, zvuk kao kaseta; konfete za prvi rad |
| U5 | Maskota u Crei | Postojeće 3D maskote (`lib/mascot-rig.ts`, izrazi) reaguju na stanja |
| U6 | Dok čekaš, nauči | Savet od 20 s ili kviz pitanje (+XP) |
| U7 | Pošteni krediti | Cena na dugmetu (✅), u dinarima na klik, proba vs konačno, dnevni limit, otkazivanje uz povraćaj, besplatno ponavljanje kad je rezultat očigledno pokvaren (limit) |
| U8 | Glasom do opisa | Mikrofon u svakom polju |
| U9 | Galerija 2.0 | Mreža sa zumom, filteri, višestruki izbor, poređenje, video na prelaz mišem, brze akcije |
| U10 | Postepeno otkrivanje | Početnik vidi 6 alata; ostali se otključavaju mini-lekcijom ili testom — nikad naplatom |
| U11 | Inspiracija uz alat | Primeri + „Napravi ovako" + „Kako je napravljeno" |
| U12 | Pomoćnik (agent) | Chat sklopi više koraka, pokaže ukupnu cenu, čeka „da"; isti put kao MCP |
| U13 | Tabla | Beskonačna tabla za reference i radove (moodboard) |
| U14 | Zajednički projekat | Više ljudi uživo u projektu (kasnije) |
| U15 | Pametno po uređaju | Teški modeli samo na jačim uređajima; „Besplatno na tvom uređaju" |
| U16 | Pokret kroz ljusku | „Generiši" se puni kao olovka, kartice se okreću kao listovi, prelazi kao listanje; `lib/motion-contract.ts` |

### 7.5 Gejmifikacija

| ID | Šta | Opis |
|---|---|---|
| G1 | Crea XP u postojećoj rang-listi | XP za prvi rad, izazove, recepte, remikse — nikad za potrošene kredite (`convex/leaderboardCore.ts`) |
| G2 | Niz dana | Lekcija ILI rad; zamrzavanje; animacije 7/30/100 |
| G3 | Dnevni izazov | Tema, grupa za početnike, glasanje, krediti + bedž |
| G4 | Album sličica | Kao Panini: svaka nova tehnika = sličica; puna strana = krediti |
| G5 | Pečat i đačka knjižica | Pečat „Odličan 5" (`crea-pecat.svg`); deljiva knjižica veština |
| G6 | Uči i zaradi | Mini-lekcija otključava besplatne probe te tehnike |
| G7 | Mapa veština | Stablo veština kao stranice sveske |
| G8 | Javna galerija i remiks | „Napravi svoju verziju", zasluga autoru, stablo remiksa (flag O6) |
| G9 | Nedeljne lige | Po nivou aktivnosti, XP se ne kupuje |
| G10 | Kreativni par i pozivi | Zajednički niz; nagrada za prvu lekciju + prvi rad prijatelja |
| G11 | Nagrade autorima | Krediti kad drugi koriste tvoj recept/stil (limit) |
| G12 | Sezonski događaji | Slava, Nova godina, Uskrs, Exit |
| G13 | Jutarnje iznenađenje | Noćna tura gotova → web-push (✅ `web-push` postoji) |

### 7.6 Cene i temelj

| ID | Šta | Opis |
|---|---|---|
| C0 | Popravi cene koje gube | ElevenLabs muzika i sinhronizacija se naplaćuju po celom minutu; kratki snimci kod nas idu ispod nabavne (npr. 6 s sinhronizacije). Proveriti na stranama provajdera i ispraviti cenovna pravila |
| C1 | Marža po kategoriji | Iza flega `crea_pricing_v2` (O1) |
| C2 | Noćna tura | Gemini Batch (NB2, NB2 Lite, NB Pro) i OpenAI Batch (GPT Image 2, O7) → −50% nabavne; korisniku ~−35–40% |
| C3 | Jeftine rute + rezerva | Najjeftiniji pouzdan provajder po modelu; rezerva pri padu |
| C4 | Keš istih zahteva | Isti model+opis+parametri+ulazi → skoro besplatno (`promptHash` postoji) |
| C5 | Lokalni AI sloj | §4.4 |
| C6 | Server-radnik | Isključen (O2) |
| C7 | Provera pre plaćanja | Besplatna moderacija opisa, razlog i predlog ispravke na srpskom |
| C8 | Pošteno „neograničeno" | Samo jeftini modeli na planu, spori red, 1 posao, mesečni limit (iza flega) |
| C9 | Ključevi u produkciji | Ručno (Jovan) |
| C10 | MCP | Novi alati dostupni i agentima |

### 7.7 Cene: predlog v2 (aktivno tek kad se upali `crea_pricing_v2`)

Formula danas: `kr = ceil(USD × 0,865 × 2,5 × 100)` (1 kr = €0,01). Predlog v2:

| Posao | HF Starter / Plus | Danas | Predlog |
|---|---|---|---|
| Uklanjanje pozadine | $0,08 / $0,05 | — | 0 kr (lokalno) |
| Uvećanje 2× | $0,23 / $0,15 | — | 0 kr (lokalno) |
| Reframe videa 15 s | $5,25 / $3,43 | — | 0 kr (lokalno) |
| Boje videa 15 s | $10,13 / $6,62 | — | 0 kr (lokalno) |
| Nano Banana 2, 1K | $0,15 / $0,10 | 16 kr | 10 kr (×1,5) · noćna 7 kr (×2,0 na batch ceni) |
| Nano Banana Pro, 2K | $0,15 / $0,10 | 33 kr | noćna 10 kr (×1,5 na batch ceni) |
| Veo 3.1 Lite 8 s + zvuk | $0,90 / $0,59 | 87 kr | 52 kr (×1,5) |
| Probni video 5 s | — | — | 26–33 kr |
| Srpski govor 1k znakova | ~$0,07 | 22 kr | 4 kr (Gemini TTS, ×3) |
| Muzika 30 s | nema | 65 kr | 11 kr (Lyria, ×3) |
| Objašnjavajući video 1 min | $18 / $12 | — | ~20–50 kr |

## 8. Koraci runa

Režim: **plan** = istraži i vrati plan, bez menjanja fajlova (runner ga upiše u
`docs/crea/planovi/<ID>.md`); **goal** = radi pa nastavi sa `/goal` dok uslov nije
ispunjen; **auto** = jedan prolaz. Sesija: **nova** ili **ista** (nastavak sesije
navedenog koraka). Sve: Opus 5.5.

| Korak | Naslov | Feature ID | Effort | Režim | Sesija |
|---|---|---|---|---|---|
| K01 | Arhitektura Crea | §2–§4 | max | plan | nova |
| K02 | Brend Crea, rute, logo | §1, §2 | xhigh | goal | ista (K01) |
| K03 | Ljuska tri radionice + „Šta praviš danas?" | U1, U2, S1, V1, A1 | xhigh | goal | nova |
| K04 | Temelj alata: registar, lokalni AI, rezultati u galeriju | §4.1–4.5, C5, U15 | xhigh | goal | nova |
| K05 | Stablo verzija, pre/posle, „Vrati" | S25, §4.3 | high | goal | nova |
| K06 | Plan: katalog, Auto, cene v2, noćna tura | S2, V2, S3, C0–C4 | high | plan | nova |
| K07 | Katalog, Auto, proba→usavrši, cene v2, C0 | S2, S3, S4, V2, V3, C0, C1, C3, C4 | xhigh | goal | ista (K06) |
| K08 | Noćna tura + jutarnje iznenađenje | C2, G13 | xhigh | goal | nova |
| K09 | Slika: besplatni alati I | S26, S27, S30, S31, S32 | high | goal | nova |
| K10 | Slika: Konva editor + šabloni + 3D foto | S28, S29, S33 | xhigh | goal | nova |
| K11 | Slika: izmene I (maske, lokalni AI) | S11–S14, S16, S17 | xhigh | goal | nova |
| K12 | Slika: izmene II (AI izmene) | S15, S18–S24 | xhigh | goal | nova |
| K13 | Slika: pravljenje | S5–S10 (+ S3/S4 UI) | high | goal | nova |
| K14 | Likovi, provera fotke, kreator lika | S34–S36 | xhigh | goal | nova |
| K15 | Recepti, brend kit, serije, nalepnice, logo, 3D | S37–S42 | high | goal | nova |
| K16 | Biblioteka, brze akcije, „Kako je napravljeno" | S43–S45, U9 | high | goal | nova |
| K17 | Plan videa | V* | high | plan | nova |
| K18 | Video: pravljenje i režija | V1–V9, V11, V12 | xhigh | goal | ista (K17) |
| K19 | Montaža u browseru | V24, V29, V30 | max | goal | nova |
| K20 | Video: dorada, pokret, govor | V13–V23 (bez V10) | xhigh | goal | nova |
| K21 | Strip→film, titlovi, shorts, retro, explainer, reklama | V10, V25–V28, V31 | xhigh | goal | nova |
| K22 | Zvuk I: glas | A1–A8 | xhigh | goal | nova |
| K23 | Zvuk II: muzika, efekti, prevod, trake | A9–A13, A18, A21 | xhigh | goal | nova |
| K24 | Zvuk III: uređivač i alati | A14–A17, A19, A20 | xhigh | goal | nova |
| K25 | Doživljaj: čekanje, otkrivanje, maskota, pokret | U3–U6, U8, U11, U16 | xhigh | goal | nova |
| K26 | Gejmifikacija I | G1, G2, G4–G7, U10 | xhigh | goal | nova |
| K27 | Gejmifikacija II + zajednica | G3, G8–G12 | xhigh | goal | nova |
| K28 | Pošteni krediti, provera, pomoćnik, tabla | U7, C7, C8, U12, U13 | high | goal | nova |
| K29 | Nezavisna revizija | sve | max | plan | nova |
| K30 | Popravke + završni izveštaj | sve | xhigh | goal | ista (K29) |

## 9. Šta Jovan radi ručno posle runa

1. Pregleda granu `crea-run` (`git log`), proba lokalno (`npm run dev`).
2. Postavi ključeve (C9): `FAL_KEY`, `BYTEPLUS_API_KEY` + `BYTEPLUS_BASE_URL`, po želji `OPENAI_API_KEY`.
3. Odluči o flegovima: `crea_pricing_v2`, `crea_public_gallery`, (i postojeći `studio_public`).
4. Spoji u `main`, `npx convex deploy`, Vercel deploy — po `docs/studio-runbook.md`.
5. Pročita `docs/CREA-REPORT.md` (završni izveštaj, K30).
