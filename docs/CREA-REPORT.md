# Crea — završni izveštaj noćnog runa (K01–K30)

**Za:** Jovan · **Datum:** 6. oktobar 2026. · **Grana:** `crea-run` (nije spojena u `main`, ništa nije deployovano na produkciju).

Ukratko: Studio je postao **Crea** — tri radionice (Slika, Video, Zvuk) sa 81 alatom, od kojih 78 radi, a 41 radi besplatno na uređaju korisnika. Plaćeni rad ide kroz isti katalog i iste kredite kao danas; **nijedna živa cena se nije promenila** — nove cene, noćna tura, galerija, „neograničeno" i besplatno ponavljanje čekaju iza flegova koje pališ ti. Revizija K29 je našla 2 kritična i 19 važnih problema; svi su u K30 popravljeni ili obrazloženi (§7). Sve provere su zelene: typecheck, lint (0 grešaka), 3 101 test, build, `check:frames`, `check:corners`, `check:bundle`, `check:white`.

---

## 1. Šta je Crea sada (po oblastima)

### Slika (38 od 39 alata gotovo)
- **Radionica** sa režimima Napravi · Izmeni · Alati · Likovi, istorijom i stablom verzija („Vrati", pre/posle).
- **Pravljenje:** katalog od 54 modela za sliku, video i zvuk (Nano Banana 2 / Pro / 2 Lite, Seedream, FLUX.2, Recraft, Ideogram, Qwen, Grok…), „Auto" bira najjeftiniji model koji ume posao i kaže zašto, „Probaj jeftino" → „Usavrši", varijacije 1–4, Ko · Gde · Kako, stilovi, „Crtaj i gledaj", skica → slika, pomoćnik za opis.
- **Izmene:** četkica + opis, klikni-i-izaberi, obriši predmet, pozadina, proširi kadar, novo svetlo, uglovi kamere, slojevi, tekst kao sloj, retuš.
- **Likovi:** sopstveni Lik iz fotke uz proveru i pristanak, kreator lika (lutka), zamena lika — **lice samo kroz sopstveni Lik** (O5, server to sada i proverava).
- **Recepti i biznis:** recepti, serije, nalepnice, logo, brend kit, biblioteka sa pametnom pretragom, „Kako je ovo napravljeno?".
- **Besplatno na uređaju:** format/HEIC/AVIF, isečak, pametni isečak, paleta, QR, vektor, GIF, OCR, editor teksta i kolaža, šabloni, 3D foto, uklanjanje pozadine, brisanje predmeta, uvećanje 2×, boje i svetlo, retuš.
- **Uskoro:** slika → 3D model (nema endpointa).

### Video (23 od 24 alata gotovo)
- **Pravljenje i režija:** tekst/slika → video, prvi i poslednji kadar, više scena, crtaj pokret, nastavi od poslednjeg kadra, produži, strip → film, objašnjavajući video (sada na Gemini glasu), reklama za mali biznis.
- **Dorada:** izmena videa, zamena predmeta (samo fiksne mete i tvoji elementi), „Odglumi" i „Lik koji govori" (samo tvoj Lik), titlovi, kratki klipovi, retro.
- **Montaža u pregledaču:** vremenska traka, „Ubaci i gotovo" po ritmu, izvoz za mreže — 0 kr.
- **Besplatno na uređaju:** montaža, izvoz, reframe, boje, uklanjanje pozadine, usporeno (bez RIFE-a), uklanjanje treperenja, titlovi, retro.
- **Uskoro:** novo svetlo za video.
- Većina plaćenih video modela je fal/BytePlus → za javnost rade tek kad postaviš ključeve (do tada DEMO za osoblje).

### Zvuk (17 od 18 alata gotovo)
- **Govor:** Gemini govor (osnovni srpski glas, 5 kr / 1 000 znakova), ElevenLabs kao premium, dijalog, podkast iz lekcije, biblioteka glasova, dizajn glasa iz opisa.
- **Muzika i efekti:** Lyria (muzika), efekti, ozvučavanje videa, prevod sa sinhronizacijom (`dubbing` samo uz snimljen pristanak glasa), trake, oznaka „Sigurno za objavu".
- **Uređivač na uređaju (0 kr):** snimač, uređivač, čišćenje zvuka, transkript, ritam i tonalitet, audiogram.
- **Uskoro:** kloniranje sopstvenog glasa (nema provajdera; od K30 alat je „uskoro" da snimak pristanka ne ide Google-u uzalud).

### UI/UX
Početni ekran „Šta praviš danas?", kartice ciljeva, inspiracija uz svaki alat, čekanje i otkrivanje rada (polaroid, traka, kaseta), maskota, pokret uz poštovanje `prefers-reduced-motion`, cena u dinarima, dnevni limit potrošnje, otkazivanje rada, pomoćnik koji pravi plan (pokreće se tek na izričito „da"), tabla za ideje. Telefon: 390 px, donja navigacija i dalje 4 mesta.

### Gejmifikacija i zajednica
XP po tehnikama (ne po kreditima), niz dana, album sličica (Panini), mini-lekcije koje otključavaju alate, đačka knjižica (javni link + slika za mreže), sveska, nedeljna liga, kreativni par, sezona. Javna galerija, lajkovi, remiks sa nagradom autoru, deljeni stilovi, dnevni izazov sa glasanjem — **sve javno je iza flega `crea_public_gallery`**. Nagrade: album 5 kr po strani (najviše 2 dnevno), autor 2 kr (5 dnevno, 30 mesečno), izazov 10 kr, poziv 10 kr (3 mesečno), 4 besplatne probe po osobi.

### Cene i temelj
Isti krediti i isti ledger; cena na dugmetu = naplaćena cena (ista funkcija na klijentu i serveru). Cene v2, noćna tura (−30 %), „Probaj jeftino", „neograničeno" za tri najjeftinija modela slike na Premium planu (spori red) i besplatno ponavljanje pokvarenog rada — sve iza flegova (§4). C3 rezerva (uz `FAL_KEY`): kad Google padne, NB2 ide preko fal-a po istoj ceni. Limiti se broje u bazi, ne u memoriji.

---

## 2. Feature ID → stanje

Legenda: **gotovo** — radi; **gotovo ⚠️** — radi preko nove Google integracije koja nikad nije pozvana uživo (prvo dimni test); **gotovo 🔑** — kod je gotov, ali glavni put traži `FAL_KEY` / `BYTEPLUS_API_KEY` / `OPENAI_API_KEY` (do tada DEMO za osoblje, nedostupno javnosti); **delimično**; **uskoro** — nema provajdera ili endpointa; **nije**.

**Zbir (137):** 100 gotovo · 6 gotovo ⚠️ · 17 gotovo 🔑 · 8 delimično · 3 uskoro · 3 nije.

| Oblast | gotovo | ⚠️ | 🔑 | delimično | uskoro | nije |
|---|---|---|---|---|---|---|
| Slika (45) | 39 | 1 | 3 | 1 | 1 | 0 |
| Video (31) | 16 | 2 | 10 | 2 | 1 | 0 |
| Zvuk (21) | 13 | 2 | 4 | 1 | 1 | 0 |
| UI/UX (16) | 13 | 0 | 0 | 2 | 0 | 1 |
| Gejmifikacija (13) | 13 | 0 | 0 | 0 | 0 | 0 |
| Cene i temelj (11) | 6 | 1 | 0 | 2 | 0 | 2 |

### Slika
| ID | Funkcija | Stanje | Napomena |
|---|---|---|---|
| S1 | Radionica „Slika" | gotovo | Tabovi Napravi · Izmeni · Alati · Likovi |
| S2 | Novi modeli | gotovo 🔑 | 10 od 11 novih modela je na fal-u; bez ključa radi NB2 Lite (Google) |
| S3 | Auto izbor modela | gotovo | 19 pravila, rečenica „zašto", limit cene |
| S4 | Probni list | gotovo 🔑 | Skice Z-Image/FLUX.2 klein (fal); „Probaj jeftino" NB2 Lite → Pro radi |
| S5 | Varijacije 1–4 | gotovo | `num_images` ili paralelni poslovi; svi izlazi se čuvaju |
| S6 | Pomoćnik za opis | gotovo ⚠️ | Gemini 3.5 Flash-Lite (`creaLlm`), 0 kr, nikad pozvan uživo |
| S7 | Ko · Gde · Kako | gotovo | NB2/NB Pro (Google); Seedream Flash i FLUX.2 klein su fal |
| S8 | Stilovi, kamera, paleta | gotovo | 40 stilova, „Moji stilovi", virtuelna kamera, paleta |
| S9 | Crtaj i gledaj | gotovo | NB2 Lite ruta radi (Google); podrazumevani FLUX.2 klein traži fal |
| S10 | Skica → slika | gotovo | Platno ili fotka sveske → NB2 (Google) |
| S11 | Četkica + opis | gotovo | NB2 obojena zona radi; Ideogram maska traži fal |
| S12 | Klikni i izaberi | gotovo | 0 kr, na uređaju (MagicTouch v2) |
| S13 | Obriši predmet | gotovo | 0 kr, na uređaju (MI-GAN); veliki predmet plaćeno |
| S14 | Ukloni / zameni pozadinu | gotovo | 0 kr, na uređaju (MODNet + klik); AI scena NB2 |
| S15 | Proširi / iseci kadar | gotovo | Iseci 0 kr na uređaju; Proširi NB2 (ne FLUX.2 outpaint) |
| S16 | Uvećaj | delimično | Samo 2× (Swin2SR), 0 kr na uređaju; nema plaćenog većeg uvećanja |
| S17 | Boje i svetlo | gotovo | 0 kr, na uređaju; 10 klizača, 10 filmskih izgleda |
| S18 | Novo svetlo | gotovo | Kugla sa suncem → NB Pro/NB2 (Google) |
| S19 | Uglovi kamere | gotovo | NB2 4K mreža 3×3 → 9 radova isečenih lokalno |
| S20 | Slojevi | gotovo 🔑 | Seedream 5 Pro razlaganje, BytePlus ključ; više slojeva nije potvrđeno uživo |
| S21 | Tekst kao sloj | gotovo | 0 kr, na uređaju (OCR + MI-GAN + editor, ćirilica) |
| S22 | Retuš i stare fotke | gotovo | Blag retuš 0 kr na uređaju; stara fotka NB Pro/NB2 |
| S23 | Odeća i proizvodi | gotovo | Proizvod u scenu NB2; Kling proba odeće traži fal |
| S24 | Zameni lik | gotovo | Samo svoj Lik uz pristanak (O5), NB Pro |
| S25 | Pre/posle + stablo verzija | gotovo | Stablo, klizač pre/posle, „Vrati" |
| S26 | Iseci, rotiraj, veličina | gotovo | 0 kr, na uređaju; preseti za mreže |
| S27 | Format, kompresija, EXIF/GPS, HEIC | gotovo | 0 kr, na uređaju; WebP/JPG/PNG/AVIF, HEIC → JPG |
| S28 | Tekst, nalepnice, oblici, žig, kolaž | gotovo | 0 kr, na uređaju (Konva editor) |
| S29 | Šabloni | gotovo | 0 kr, na uređaju; 8 šablona |
| S30 | Pametan isečak | gotovo | 0 kr, na uređaju (BlazeFace + smartcrop) |
| S31 | Paleta, QR, vektor, GIF | gotovo | 0 kr, na uređaju |
| S32 | Tekst sa slike | gotovo | 0 kr, na uređaju (tesseract, latinica i ćirilica) |
| S33 | „3D foto" → MP4 | gotovo | 0 kr, na uređaju; samo računar (Depth Anything V2 Small) |
| S34 | Likovi i elementi | gotovo | @Lik / @Mesto / @Predmet u slici i videu, do 30 |
| S35 | Provera fotke | gotovo | 0 kr, na uređaju (MediaPipe); pre čuvanja Lika i zamene |
| S36 | Lik kao u igrici | gotovo | NB Pro list lika (Google); nije probano uživo |
| S37 | Recepti | gotovo | 20 recepata, fiksna cena, NB2/NB Pro |
| S38 | Brend kit | gotovo | Ulazi u recepte, editor i logo |
| S39 | Serije | gotovo | NB2 1K, do 12 oglasa; noćna tura samo uz `crea_pricing_v2` |
| S40 | Viber nalepnice i sprajtovi | gotovo | NB2 2K mreža 9 izraza → isecanje i ZIP lokalno |
| S41 | Logo i ikone | gotovo | NB2 + VTracer lokalno; Recraft traži fal |
| S42 | Slika → 3D model | uskoro | Nema endpointa (BLOKADA) |
| S43 | Pametna biblioteka | gotovo | Srpska pretraga; CLIP 0 kr na uređaju (računar); backfill nije pušten |
| S44 | Brze akcije | gotovo | 7 akcija otvara tačan alat sa radom |
| S45 | „Kako je napravljeno?" | gotovo | Florence-2 0 kr na uređaju (računar); oblak (`creaLlm`) nikad uživo |

### Video
| ID | Funkcija | Stanje | Napomena |
|---|---|---|---|
| V1 | Radionica „Video" | gotovo | 5 režima |
| V2 | Novi modeli | gotovo 🔑 | Svih 6 novih je fal; Seedance Mini/Fast BytePlus |
| V3 | Proba → Usavrši | gotovo 🔑 | Svih 5 video parova je fal/BytePlus |
| V4 | Nastavi od poslednjeg kadra | gotovo | 0 kr, na uređaju (mediabunny) |
| V5 | Produži klip | gotovo | Veo 3.1 (Google); Seedance 2.5 traži BytePlus |
| V6 | Čipovi @Lik @Mesto @Pokret @Zvuk | gotovo | @Lik kroz reference; @Pokret / @Zvuk kao dugmad |
| V7 | Pokreti kamere | gotovo | 44 pokreta, SVG skice, mini-lekcije |
| V8 | Efekti | gotovo | 31 efekat + „Spoji dva"; javnost ide na Veo 3.1 Lite |
| V9 | Režiserski pult | gotovo | Pult + 6 kartica sa primerima |
| V10 | Strip → film | gotovo | „Lepše" sve Google; „Jeftino" video Hailuo traži fal; nikad uživo |
| V11 | Više scena u klipu | gotovo 🔑 | Kling 3.0 `multi_prompt`, fal |
| V12 | Crtaj pokret | gotovo | Veo 3.1 Lite radi; ostala 4 modela traže fal |
| V13 | Izmeni rečima | gotovo 🔑 | Kling O3 izmena (fal) / Seedance 2.5 (BytePlus); bez referentnih slika (K30, O5) |
| V14 | Zameni predmet ili lik | gotovo 🔑 | K30: fiksan spisak meta + tvoji predmeti/mesta; lik samo tvoj |
| V15 | Reframe | gotovo | 0 kr, na uređaju; računar + WebCodecs |
| V16 | Boje i LUT | gotovo | 0 kr, na uređaju; LUT po klipu u montaži nema |
| V17 | Uvećaj, slow-mo, bez treperenja | delimično | Bez RIFE-a: usporeno stapanjem kadrova; uvećanje traži fal |
| V18 | Ukloni pozadinu videa | delimično | Samo ljudi, 0 kr na uređaju |
| V19 | Novo svetlo za video | uskoro | Nema endpointa |
| V20 | Prenos pokreta + „Odglumi" | gotovo 🔑 | Kling (fal); režim Pokret sada vodi na alat |
| V21 | Lik koji govori | gotovo 🔑 | Kling avatar (fal); lice samo tvoj Lik; režim Govor vodi na alat |
| V22 | Lipsync | gotovo 🔑 | Kling lipsync (fal) |
| V23 | Napiši → izgovori → oživi | gotovo 🔑 | Glas → Kling avatar (fal); 3D maskota uskoro |
| V24 | Montaža u pregledaču | gotovo | 0 kr, na uređaju; MP4/GIF |
| V25 | Titlovi na srpskom | gotovo | „Napiši sam" + utiskivanje 0 kr; prepoznavanje (stt) traži fal |
| V26 | Kratki klipovi iz dugog videa | gotovo 🔑 | stt (fal); izbor momenata (`creaLlm`) nikad uživo |
| V27 | Retro efekti i match-cut | gotovo | 0 kr, na uređaju; 8 WebGL2 šejdera |
| V28 | Objašnjavajući video | gotovo ⚠️ | K30: Gemini govor + NB2 Lite (Google), nikad uživo; ElevenLabs rezerva |
| V29 | „Ubaci i gotovo" | gotovo | 0 kr, na uređaju; 8 šablona po ritmu |
| V30 | Izvoz za mreže | gotovo | 0 kr, na uređaju; 7 preseta, sigurne zone |
| V31 | Reklama za mali biznis | gotovo ⚠️ | K30: govorni oglas na Gemini glasu; animacija (Hailuo) traži fal |

### Zvuk
| ID | Funkcija | Stanje | Napomena |
|---|---|---|---|
| A1 | Radionica „Zvuk" | gotovo | Svih 7 tabova ima sadržaj |
| A2 | Jeftin srpski glas | gotovo ⚠️ | Gemini 3.8 Flash TTS nikad uživo; ElevenLabs traži fal |
| A3 | Biblioteka glasova | gotovo | 40 glasova, filteri, omiljeni |
| A4 | Emocije kao nalepnice | gotovo | Tagovi, raspoloženje, brzina, visina, 1–4 verzije |
| A5 | Dijalog i podkast | gotovo | Do 10 govornika; plaća se samo izmenjena replika |
| A6 | Podkast iz lekcije | delimično | Bez izbora lekcije (tekst se nalepi); `creaLlm` nikad uživo |
| A7 | Kloniraj svoj glas | uskoro | Nema provajdera; snimak, VAD i pristanak gotovi; alat „uskoro" (K30) |
| A8 | Dizajniraj glas | gotovo | Gemini glas + opis stila |
| A9 | Promena glasa | gotovo 🔑 | voice-changer, stt i trake na fal-u |
| A10 | Prevod i sinhronizacija | gotovo 🔑 | Prepoznavanje (fal); `dubbing` samo uz snimljen pristanak (K30) |
| A11 | Muzika | gotovo ⚠️ | Lyria (Google) nikad uživo; srpsko pevanje nepotvrđeno |
| A12 | Ozvuči moj video | gotovo | Lyria + `creaLlm` nikad uživo; Kling efekti traže fal; miks lokalno |
| A13 | Zvučni efekti | gotovo | 44 CC0 zvuka 0 kr; novi efekti traže fal |
| A14 | Uređivač zvuka | gotovo | 0 kr, na uređaju; −14 LUFS, EQ, trake |
| A15 | Čišćenje zvuka | gotovo | 0 kr, na uređaju (RNNoise/GTCRN); teško → izolacija traži fal |
| A16 | Transkript i uređivanje tekstom | gotovo 🔑 | Transkript traži stt (fal); uređivanje tekstom lokalno |
| A17 | Snimač | gotovo | 0 kr, na uređaju |
| A18 | Razdvoji na trake | gotovo 🔑 | Demucs (fal), 4 trake |
| A19 | Ritam i tonalitet | gotovo | 0 kr, na uređaju; BPM, tonalitet, Camelot |
| A20 | Audiogram | gotovo | 0 kr, na uređaju |
| A21 | „Sigurno za objavu" | gotovo | Oznaka licence na svakom zvučnom radu |

### UI/UX
| ID | Funkcija | Stanje | Napomena |
|---|---|---|---|
| U1 | Tri radionice, jedna ljuska | gotovo | Na telefonu composer je donja fioka |
| U2 | „Šta praviš danas?" | gotovo | 12 kartica + recepti; 4 kartice biraju fal model (muzika je od K30 Lyria) |
| U3 | Ekran čekanja | delimično | Olovka, koraci, red, procena; bez delimičnog pregleda |
| U4 | Otkrivanje rezultata | gotovo | Polaroid, filmska traka, kaseta; konfete za prvi rad |
| U5 | Maskota | gotovo | 3D na računaru, poster na telefonu |
| U6 | Dok čekaš, nauči | delimično | 30 saveta, 12 pitanja; kviz bez XP-a (svesno) |
| U7 | Pošteni krediti | gotovo | Dinari, lični limit, otkaz; besplatno ponavljanje iza `crea_free_redo` |
| U8 | Glasom do opisa | gotovo | Mikrofon u poljima za opis (Web Speech) |
| U9 | Galerija 2.0 | gotovo | Zum, filteri, višestruki izbor, poređenje |
| U10 | Postepeno otkrivanje | gotovo | Početnik vidi 6 alata; mini-lekcije otključavaju ostale |
| U11 | Inspiracija uz alat | gotovo | 97 primera, „Napravi ovako" |
| U12 | Pomoćnik (agent) | gotovo | Plan kroz `creaLlm` (nikad uživo); čeka izričito „da" |
| U13 | Tabla | gotovo | Kartica se prevlači na composer |
| U14 | Zajednički projekat | nije | U planu „kasnije" |
| U15 | Pametno po uređaju | gotovo | Klase uređaja, budžeti, srpski razlozi |
| U16 | Pokret kroz ljusku | gotovo | Poštuje smanjen pokret |

### Gejmifikacija
| ID | Funkcija | Stanje | Napomena |
|---|---|---|---|
| G1 | Crea XP u rang-listi | gotovo | 8 XP događaja, nikad po kreditu |
| G2 | Niz dana | gotovo | Lekcija ILI rad; zamrzavanje; 7/30/100 |
| G3 | Dnevni izazov | gotovo | Iza `crea_public_gallery` |
| G4 | Album sličica | gotovo | 32 strane, 5 kr po punoj strani |
| G5 | Pečat i đačka knjižica | gotovo | Pečat „Odličan 5", deljiva knjižica sa slikom za mreže |
| G6 | Uči i zaradi | gotovo | 10 mini-lekcija, 4 besplatne probe |
| G7 | Mapa veština | gotovo | Stranica sveske |
| G8 | Javna galerija i remiks | gotovo | Iza `crea_public_gallery`; moderacija |
| G9 | Nedeljne lige | gotovo | 5 liga po XP-u, bez kredita |
| G10 | Kreativni par i pozivi | gotovo | Zajednički niz; poziv 10 kr, do 3 mesečno |
| G11 | Nagrade autorima | gotovo | 2 kr (5/dan, 30/mes); traži fleg galerije |
| G12 | Sezonski događaji | gotovo | Okvir za 4 sezone |
| G13 | Jutarnje iznenađenje | gotovo | Zavisi od noćne ture (`crea_pricing_v2`) |

### Cene i temelj
| ID | Funkcija | Stanje | Napomena |
|---|---|---|---|
| C0 | Popravi cene koje gube | gotovo | Muzika i sinhronizacija po celom minutu (važi uz `FAL_KEY`) |
| C1 | Marža po kategoriji | gotovo | Iza `crea_pricing_v2` |
| C2 | Noćna tura | gotovo ⚠️ | Iza `crea_pricing_v2`; Gemini Batch nikad uživo; OpenAI traži ključ |
| C3 | Jeftine rute + rezerva | delimično | Samo NB2 Google → fal, neaktivno bez `FAL_KEY`; cena zaključana (K30) |
| C4 | Keš istih zahteva | gotovo | Samo isti korisnik, „Otvori (0 kr)" |
| C5 | Lokalni AI sloj | gotovo | ORT + MediaPipe, keš, napredak, provera otiska koda (K30) |
| C6 | Server-radnik | nije | Isključeno (O2) |
| C7 | Provera pre plaćanja | gotovo | Lokalni filter + srpski predlog ispravke |
| C8 | Pošteno „neograničeno" | gotovo | Iza `crea_fair_unlimited`; samo Premium, jeftini modeli |
| C9 | Ključevi u produkciji | nije | Ručno (§5) |
| C10 | MCP | delimično | Novi modeli i `parentJobId` dostupni; nema Crea MCP alata |

---

## 3. Šta je besplatno na uređaju (0 kr)

U registru je 41 gotov alat bez kredita. Rade u pregledaču korisnika (kod i modeli se preuzimaju jednom, posle rade i bez interneta); teži modeli traže računar, a telefon dobija lakšu varijantu ili jasnu poruku.

- **Slika:** klikni i izaberi (S12), obriši mali predmet (S13), ukloni pozadinu i stavi novu boju/zamućenje/sliku (S14), iseci kadar (S15), uvećaj 2× (S16), boje i svetlo (S17), tekst kao sloj (S21), blag retuš (S22), iseci/rotiraj/veličina (S26), format, kompresija, EXIF/GPS, HEIC → JPG (S27), editor teksta, nalepnica i kolaža (S28), šabloni (S29), pametan isečak (S30), paleta, QR, vektor, GIF (S31), tekst sa slike (S32), 3D foto → MP4 (S33, računar), provera fotke (S35), pametna pretraga i duplikati (S43, računar), „Kako je napravljeno?" (S45, računar), Moji likovi, brend kit, tabla za ideje.
- **Video:** nastavi od poslednjeg kadra (V4), reframe (V15), boje i LUT (V16), usporeno i bez treperenja (V17), pozadina videa za ljude (V18), montaža (V24), titlovi „napiši sam" + utiskivanje (V25), retro i match-cut (V27), „Ubaci i gotovo" (V29), izvoz za mreže (V30).
- **Zvuk:** 44 CC0 efekta (A13), uređivač (A14), čišćenje (A15), snimač (A17), ritam i tonalitet (A19), audiogram (A20), biblioteka glasova (A3, preslušavanje).
- **Takođe 0 kr (oblak, ali bez kredita, sa dnevnim limitom):** pomoćnik za opis (S6), „Kako je napravljeno?" u oblaku, pisanje podkasta i scenarija.

---

## 4. Nove cene (iza flega) i kako se pale

**Dok je `crea_pricing_v2` isključen, svaka cena je bit-identična današnjoj** (test `convex/creaPricingCore.test.ts` poredi ceo katalog sa stanjem pre runa). Jedine promene i bez flega su ispravke grešaka iz K07 (C0): GPT Image 2 izmena sada plaća ulazne slike, a muzika i `dubbing` se naplaćuju po celom minutu, kako fal stvarno naplaćuje. Novi modeli (npr. Gemini govor, Lyria, NB2 Lite) su novi redovi sa svojom cenom, ne promena postojeće.

**Šta v2 menja:** marža po vrsti posla umesto jedne ×2,5 — slika i video ×1,5, zvuk ostaje ×2,5, noćna tura ×2,0 na upola jeftinijoj batch nabavnoj ceni.

| Posao | Danas | Sa `crea_pricing_v2` |
|---|---|---|
| Nano Banana 2, 1K | 16 kr | 10 kr · noćna tura 7 kr |
| Nano Banana 2, 2K | 23 kr | 14 kr |
| Nano Banana Pro, 2K | 33 kr | 20 kr · noćna tura 13 kr |
| Nano Banana 2 Lite | 8 kr | 5 kr |
| Veo 3.1 Lite, 8 s, 720p | 87 kr | 52 kr |
| Veo 3.1 Lite, 8 s, 1080p | 139 kr | 84 kr |
| Gemini govor, 1 000 znakova | 5 kr | 5 kr (zvuk ostaje ×2,5) |
| ElevenLabs govor, 1 000 znakova | 22 kr | 22 kr |
| Lyria klip / Lyria 3.5 | 9 / 18 kr | 9 / 18 kr |
| Uklanjanje pozadine, uvećanje 2×, reframe, boje videa, montaža | — | 0 kr (na uređaju, i bez flega) |

**Flegovi** (svi isključeni; odsutan red = isključen; gase se istom komandom sa `"enabled":false`):

```bash
npx convex run creaFlags:setCreaFlag '{"key":"crea_pricing_v2","enabled":true}' --prod     # cene v2 + noćna tura
npx convex run creaFlags:setCreaFlag '{"key":"crea_public_gallery","enabled":true}' --prod  # galerija, izazov, glasanje, deljeni stilovi
npx convex run creaFlags:setCreaFlag '{"key":"crea_fair_unlimited","enabled":true}' --prod  # „neograničeno" (Premium, spori red)
npx convex run creaFlags:setCreaFlag '{"key":"crea_free_redo","enabled":true}' --prod       # besplatno ponavljanje pokvarenog rada (novo u K30)
```

- **Noćna tura** postoji samo uz `crea_pricing_v2`: rad se šalje Google Batch-u, stiže do jutra, −30 % prema dnevnoj v2 ceni. GPT Image 2 noćna tek uz `OPENAI_API_KEY` i ponovni seed modela.
- **„Neograničeno":** NB2 Lite, Z-Image Turbo i FLUX.2 klein za Premium, 200 poslova u 30 dana, spori red 45 s. Odluči o brojevima (`FAIR_UNLIMITED` u `convex/creaFairCore.ts`) pre paljenja.
- **Besplatno ponavljanje:** 2 dnevno, 6 u 30 dana, do 48 h posle rada, najviše 200 kr po poslu; noćni rad se ne ponavlja besplatno.
- Dinari na dugmetu su samo prikaz (kurs je konstanta u `lib/crea-dinars.ts`, menja se ručno).

---

## 5. Šta mora ručno

Ceo postupak je u `docs/studio-runbook.md`, **sekcija G „Crea deploy"**. Ukratko:

1. **Pre deploy-a:** u ovom folderu postoji zalutali `CONVEX_DEPLOY_KEY` koji šalje deploy na drugi projekat — `unset CONVEX_DEPLOY_KEY` i proveri da je cilj `quick-yak-270`.
2. **Redosled:** `npx convex deploy` (sačekaj nove indekse) → `node scripts/seed-studio-models.mjs` sa produkcijskim promenljivim → `npx convex run migrations:run '{"fn":"migrations:backfillCreaSearchText"}' --prod` → deploy sajta.
3. **Ključevi (Convex env, produkcija):**
   - `GOOGLE_AI_API_KEY` — već postoji; od njega zavise pomoćnik za opis, Gemini govor, Lyria, noćna tura, opis slike, objašnjavajući video i govorni oglas.
   - `FAL_KEY` — otključava većinu video modela, ElevenLabs, efekte, muziku `music`, `dubbing`, C3 rezervu. **Pre paljenja ugasi neproverene fal redove i pali ih jedan po jedan** posle probe i poređenja računa (spisak u runbook-u G3).
   - `BYTEPLUS_API_KEY` (+ `BYTEPLUS_BASE_URL`) — Seedream/Seedance, slojevi (S20).
   - po želji `OPENAI_API_KEY` — GPT Image 2 noćna tura.
   - `VAPID_*` — samo push za čet (Crea ga ne koristi).
4. **Flegovi:** §4 — odluči koje pališ i kojim redom (predlog: prvo `crea_pricing_v2` na DEV-u, pa produkcija; galerija tek kad pogledaš red za moderaciju).
5. **Posle deploy-a:** `curl` provere iz runbook-a G4 (`/crea` mora 200, `/studio` 308, `/brand/crea/sfx/IZVORI.txt` 200, `/licenses/THIRD-PARTY-NOTICES.txt` 200, knjižica sa tačkom u imenu nije 404) i MIME za `.mp3`/`.wasm` na LiteSpeed-u.
6. **Dimni test** (runbook G5): pomoćnik za opis, Gemini govor, Lyria, jedna noćna tura, NB2 Lite, nalog bez prihvaćenih uslova → `USLOVI_NEPRIHVACENI`.
7. **Pravni tekst:** u uslovima i politici privatnosti i dalje stoje `[POPUNITI: …]` mesta (firma, adresa, MB, PIB, mejlovi, sud).

---

## 6. Poznata ograničenja

- **Nijedan novi Google poziv nije proban uživo:** pomoćnik za opis (Gemini 3.5 Flash-Lite), Gemini govor, Lyria, Gemini Batch (noćna tura), ID modela NB2 Lite. Jedan pogrešan naziv obara više funkcija — zato dimni test pre puštanja.
- **Bez `FAL_KEY` / `BYTEPLUS_API_KEY`** deo plaćenih alata je zaključan za javnost, a osoblje vidi DEMO (revizija je izbrojala 14 od 37; objašnjavajući video i govorni oglas od K30 rade i bez fal-a). 20-ak fal redova nikad nije pozvano uživo; poznati zatečeni kvarovi: `kling-omni` rute, GPT Image 1.5 ruta, `voice_control` (K29 S-19).
- **Početni JS radionice** je 465 KB gz (`/app/studio` 541 KB) — iznad cilja ~300 KB iz K01; `check:bundle` sada ne dozvoljava rast preko izmereno + 10 %.
- **Lokalni AI:** usporeni snimak bez RIFE-a (ponavljanje kadrova), uvećanje samo 2× na uređaju, uklanjanje pozadine videa samo za ljude; BiRefNet ne radi na WebGPU-u u ORT 1.30 (radi na WASM-u). Teški modeli traže jači uređaj; telefon dobija lakše varijante ili oblak.
- **Kod sa CDN-a:** izvršni JS/WASM (MediaPipe, ONNX Runtime, zvučne biblioteke) proverava se po sha256; tesseract.js worker i jezgro i težine modela (Hugging Face, zakucane revizije) nisu pod otiskom.
- **Lice i glas (O5):** lice samo kroz sopstveni Lik; opšta izmena slike sa referencama (NB2/NB Pro) nema serversku detekciju lica — štiti je samo filter opisa. Kloniranje glasa (A7) je „uskoro".
- **Spajanje naloga:** lajkovi, glasovi i članstva u ligi se ne spajaju; dva aktivna para posle spajanja su moguća (retko).
- **Brisanje rada kod velikih naloga:** provera da li fajl koristi drugi rad čita celu istoriju korisnika — za naloge sa više hiljada radova može da udari u limit čitanja (K29-13a, sledeći korak).
- **Ručno:** kurs dinara; Gemini TTS poskupljuje 1. 1. 2027. (`applyPriceEdit`); pravni podaci firme; odluka o snimcima ekrana u `main` (45 MB, §8).
- **Nije urađeno iz plana:** U14 (plan: „kasnije"), C6 (server za AI — isključeno, O2), C9 (ključevi — ručno).
- **K29-18** (dugme „Generiši" na telefonu) je popravljeno u kodu, ali nije vizuelno provereno prijavljenim nalogom.

---

## 7. Revizija K29 → popravke K30

| Nalaz | Ozbiljnost | Stanje |
|---|---|---|
| K29-01 tuđ fajl preko dozvole za upload | KRITIČNO | popravljeno: dozvola vezana za sha256 + veličinu, brisanje samo fajla iz takve dozvole, limit dozvola 30/min i 300/h |
| K29-02 zaobilaženje O5 za lice | KRITIČNO | popravljeno: modeli lica samo kroz Lik (`faceVerified`), V14 bez slobodnog teksta i tuđih fotki, lokalni rad nije izvor lica, filter parafraza |
| K29-03 AI pozivi mimo uslova, kill switch-a i plafona | VAŽNO | popravljeno (`requireCreaAiCall`) |
| K29-04 CDN kod bez provere integriteta | VAŽNO | popravljeno za 12 izvršnih fajlova; tesseract → ODLUKA |
| K29-05 `dubbing` klonira glas bez pristanka | VAŽNO | popravljeno: traži snimljen pristanak (30 min) |
| K29-06 poravnanje refundiranog posla | VAŽNO | popravljeno |
| K29-07 noćna tura zaglavi / nestala slika | VAŽNO | popravljeno |
| K29-08 C3 rezerva naplaćuje više | VAŽNO | popravljeno (`priceLocked`) |
| K29-09 besplatno ponavljanje bez flega | VAŽNO | popravljeno (fleg `crea_free_redo`, noćni posao, plafon po novoj ceni) |
| K29-10 kuka obara isporuku | VAŽNO | popravljeno (podtransakcija, brisanje siročeta) |
| K29-11 spajanje naloga ignoriše Crea tabele | VAŽNO | popravljeno (`creaMergeCore.ts`); lajkovi/glasovi/liga → ODLUKA |
| K29-12 cron isteka 100 dnevno | VAŽNO | popravljeno (sam se nastavlja) |
| K29-13 upiti rastu sa istorijom | VAŽNO | (b), (c) popravljeno indeksima; (a) → ODLUKA, sledeći korak |
| K29-14 `public/crea` zaklanja rutu `/crea` | VAŽNO | popravljeno (`public/brand/crea`) + test |
| K29-15 knjižica sa tačkom u imenu = 404 | VAŽNO | popravljeno (matcher) |
| K29-16 obaveštenja o licencama | VAŽNO | popravljeno (`/licenses/THIRD-PARTY-NOTICES.txt`, link iz uslova i uređivača zvuka) |
| K29-17 početni JS radionice | VAŽNO | delimično: 482 → 465 KB, budžet u `check:bundle` |
| K29-18 „Generiši" odsečen na telefonu | VAŽNO | popravljeno u kodu (nije vizuelno provereno) |
| K29-19 mete, kontrast, prevodi | VAŽNO | popravljeno |
| K29-20 objašnjenje i reklama zavise od fal-a | VAŽNO | popravljeno (Gemini glas, ElevenLabs rezerva, tačna poruka) |
| K29-21 runbook | VAŽNO | popravljeno (sekcija G) |
| S-01–S-08 | SITNO | popravljeno |
| S-17, S-18 | SITNO | svesno ostavljeno (obrazloženje u `CREA-PROGRESS.md`, K30) |
| S-09–S-16, S-19–S-28 | SITNO | nije rađeno — predlog u §9 |

---

## 8. Snimci ekrana

`docs/crea/snimci/` — 322 PNG snimka (≈45 MB), imenovani `K<korak>-<šta>-<uređaj>-<tema>.png` (desktop 1440 × 900, telefon 390 × 844, svetla/tamna tema). K30 nije dodao snimke (provera K29-18 traži prijavljen nalog). Predlog: ne spajati ovaj folder u `main` (ili ga prebaciti na Git LFS).

Spisak po koraku (bez prefiksa `K<korak>-` i bez `.png`):

- **K02:** krediti-telefon-svetla, landing-desktop-svetla, landing-desktop-tamna, landing-telefon-svetla, radionica-desktop-tamna, radionica-en-desktop-svetla, radionica-telefon-tamna, uslovi-telefon-svetla
- **K03:** izbor-modela-desktop-svetla, pocetak-desktop-svetla, pocetak-telefon-tamna, slika-napravi-desktop-svetla, slika-napravi-desktop-tamna, uskoro-desktop-tamna, uskoro-telefon-svetla, video-telefon-svetla, video-telefon-tamna, zvuk-govor-1180-svetla
- **K04:** alati-gost-desktop-svetla, alati-telefon-svetla, format-desktop-svetla, format-rezultat-desktop-svetla, format-telefon-svetla, format-telefon-tamna, provera-desktop-svetla, provera-desktop-tamna
- **K05:** detalj-desktop-svetla, detalj-desktop-tamna, detalj-telefon-svetla, detalj-telefon-tamna
- **K07:** auto-desktop-svetla, auto-telefon-tamna, composer-desktop-svetla, composer-desktop-tamna, composer-telefon-tamna
- **K08:** nocna-desktop-svetla, nocna-en-desktop-svetla, nocna-telefon-svetla, nocna-telefon-tamna, nocna-ukljucena-desktop-svetla, nocna-ukljucena-desktop-tamna
- **K09:** format-heic-avif-desktop-svetla, gif-desktop-svetla, iseci-desktop-svetla, iseci-telefon-svetla, ocr-telefon-svetla, paleta-desktop-svetla, paleta-desktop-tamna, pametni-isecak-desktop-svetla, qr-desktop-svetla, qr-telefon-tamna, vektor-desktop-svetla
- **K10:** 3d-foto-desktop-svetla, 3d-foto-desktop-tamna, 3d-foto-kadrovi, 3d-foto-telefon-svetla, editor-desktop-svetla, editor-desktop-tamna, editor-kolaz, editor-srpska-slova, editor-telefon-panel-svetla, editor-telefon-svetla, editor-telefon-tamna, sabloni-galerija-desktop-svetla, sabloni-galerija-telefon-svetla, sabloni-slava-telefon-svetla, sabloni-slava-telefon-tamna, sabloni-youtube-desktop-svetla, sabloni-youtube-izvoz
- **K11:** boje-desktop-svetla, cetkica-desktop-svetla, cetkica-telefon-svetla, cetkica-telefon-tamna, izmeni-desktop-svetla, izmeni-telefon-svetla, klik-desktop-svetla, klik-maska, obrisi-desktop-svetla, pozadina-desktop-tamna, uvecaj-desktop-svetla
- **K12:** odeca-desktop-svetla, proizvod-desktop-svetla, prosiri-desktop-svetla, prosiri-telefon-tamna, retus-desktop-svetla, slojevi-desktop-svetla, slojevi-telefon-tamna, svetlo-desktop-svetla, svetlo-telefon-tamna, tekst-editor-desktop-svetla, tekst-redovi-desktop-svetla, uglovi-desktop-svetla, uglovi-napravi-desktop-tamna, uglovi-telefon-tamna
- **K13:** composer-desktop-svetla, composer-telefon-tamna, crtaj-desktop-svetla, izgled-desktop-svetla, kamera-telefon-tamna, ko-gde-kako-desktop-svetla, ko-gde-kako-telefon-svetla, pomocnik-desktop-svetla, pomocnik-desktop-tamna, probni-list-desktop-svetla, skica-desktop-svetla
- **K14:** composer-dopunjavanje-desktop-svetla, composer-pominjanje-desktop-svetla, composer-telefon-tamna, kreator-desktop-svetla, kreator-telefon-tamna, likovi-desktop-svetla, likovi-gost-desktop-svetla, likovi-telefon-tamna, uredi-kreator-telefon-tamna-en, zameni-lik-desktop-svetla, zameni-lik-telefon-svetla
- **K15:** brend-kit-tel-tamno, brend-kit, logo, nalepnice-isecene, nalepnice, recept-jelovnik, recept-tel-tamno, serija, start-tel-tamno, start
- **K16:** biblioteka-desktop-svetla, biblioteka-desktop-tamna, biblioteka-telefon-dodir, biblioteka-telefon-svetla, biblioteka-telefon-tamna, brze-akcije-desktop-svetla, duplikati-desktop-svetla, kako-napravljeno-desktop-svetla, kako-napravljeno-desktop-tamna, opis-na-uredjaju-desktop-svetla, opis-oblak-telefon-tamna, opis-potvrda-desktop-svetla, poredjenje-desktop-svetla, poredjenje-telefon-tamna
- **K18:** composer-rezija-desktop-svetla, composer-rezija-desktop-tamna, composer-rezija-telefon-svetla, composer-rezija-telefon-tamna, crtaj-pokret-desktop-svetla, crtaj-pokret-telefon-svetla, crtaj-pokret-telefon-tamna, panel-efekti-desktop-svetla, panel-efekti-desktop-tamna, panel-efekti-telefon-svetla, panel-efekti-telefon-tamna, panel-pokret-desktop-svetla, panel-pokret-desktop-tamna, panel-pokret-telefon-svetla, panel-pult-desktop-svetla, panel-pult-telefon-svetla, poslednji-kadar-desktop-svetla, produzi-desktop-svetla, produzi-telefon-svetla, produzi-telefon-tamna, vise-scena-desktop-svetla, vise-scena-telefon-svetla, vise-scena-telefon-tamna
- **K19:** bez-webcodecs-racunar-svetla, izvoz-racunar-tamna, montaza-racunar-svetla, montaza-telefon-svetla, montaza-telefon-tamna, ritam-racunar-svetla, ritam-telefon-tamna, traka-racunar-svetla
- **K20:** boje-1440-tamna, izmeni-recima-1440-tamna, lik-govori-1440-svetla, lik-govori-390-tamna, odglumi-390-svetla, pozadina-390-tamna, reframe-1440-svetla, uvecaj-1440-svetla, zameni-390-svetla
- **K21:** match-cut-1440, objasnjenje-pozornica-tamno-390, objasnjenje-unos-tamno-1440, reklama-unos-390, strip-kartica-tamno-390, strip-kartice-1440, strip-unos-1440
- **K22:** dijalog-telefon-tamna, dizajn-desktop-tamna, glasovi-desktop-svetla, govor-desktop-svetla, govor-desktop-tamna, kloniraj-telefon-svetla, ljuska-glasovi-desktop-svetla, ljuska-govor-telefon-tamna, podkast-telefon-svetla
- **K23:** efekti-desktop-svetla, efekti-telefon-tamna, muzika-desktop-svetla, muzika-telefon-svetla, muzika-telefon-tamna, ozvuci-desktop-tamna, prevod-telefon-tamna, promena-desktop-svetla, trake-telefon-svetla, zvuk-muzika-ljuska-desktop-svetla
- **K24:** audiogram-desktop-svetla, audiogram-telefon-tamna, ciscenje-desktop-svetla, ciscenje-desktop-tamna, ciscenje-telefon-tamna, ritam-desktop-svetla, ritam-telefon-tamna, snimac-desktop-svetla, snimac-telefon-tamna, transkript-desktop-svetla, transkript-telefon-tamna, uredjivac-desktop-svetla, uredjivac-konacno-desktop-svetla, uredjivac-telefon-tamna
- **K25:** cekanje-desktop-svetla, cekanje-desktop-tamna, cekanje-telefon-svetla, dok-cekas-desktop-tamna, dok-cekas-kviz-desktop-svetla, generisi-olovka-desktop-svetla, inspiracija-desktop-svetla, inspiracija-kako-je-napravljeno-desktop-svetla, inspiracija-okret-desktop-svetla, inspiracija-telefon-tamna, konfete-prvi-rad-desktop-svetla, listanje-oblasti-desktop-svetla, maskota-raspolozenja-desktop-svetla, otkrivanje-film-1-desktop-svetla, otkrivanje-film-2-desktop-svetla, otkrivanje-kaseta-1-desktop-svetla, otkrivanje-kaseta-2-desktop-svetla, otkrivanje-polaroid-1-desktop-svetla, otkrivanje-polaroid-2-desktop-svetla, radionica-inspiracija-desktop-svetla, radionica-inspiracija-telefon-tamna, scena-cekanje-desktop-svetla, scena-cekanje-telefon-svetla, scena-cekanje-telefon-tamna, scena-gotovo-desktop-tamna, smanjen-pokret-cekanje-desktop-svetla
- **K26:** album-desktop-svetla, album-desktop-tamna, album-telefon-svetla, album-telefon-tamna, besplatna-proba-desktop-svetla, besplatna-proba-desktop-tamna, besplatna-proba-telefon-svetla, besplatna-proba-telefon-tamna, knjizica-desktop-svetla, knjizica-desktop-tamna, knjizica-og, knjizica-telefon-svetla, knjizica-telefon-tamna, mapa-vestina-desktop-svetla, mapa-vestina-desktop-tamna, mapa-vestina-telefon-svetla, mapa-vestina-telefon-tamna, mini-lekcija-desktop-tamna, mini-lekcija-test-desktop-svetla, mini-lekcija-test-telefon-svetla, mini-lekcija-test-telefon-tamna, niz-7-dana-desktop-svetla, niz-desktop-svetla, niz-desktop-tamna, niz-telefon-svetla, niz-telefon-tamna, smanjen-pokret-pecat, sveska-gost-desktop-svetla, sveska-gost-telefon-tamna, traka-pecat-desktop-svetla, traka-pecat-desktop-tamna, zakljucani-alati-desktop-svetla, zakljucani-alati-desktop-tamna
- **K27:** galerija-desktop-svetla, galerija-gost-desktop-svetla, galerija-gost-telefon-tamna, galerija-iskljucena-404, galerija-telefon-svetla, galerija-telefon-tamna, izazov-desktop-svetla, izazov-gost-desktop-tamna, izazov-gost-en-desktop-svetla, izazov-gost-telefon-svetla, izazov-telefon-tamna, liga-desktop-tamna, liga-telefon-svetla, moderacija-desktop-tamna, par-desktop-svetla, par-telefon-tamna, podeli-desktop-svetla, podeli-telefon-tamna, poziv-nepostoji-telefon-svetla, rad-desktop-svetla, rad-telefon-tamna, radionica-linkovi-desktop-svetla, sezone-desktop-svetla, sezone-efekti-pokret, sezone-smanjen-pokret, sezone-telefon-tamna
- **K28:** cena-desktop-dark, cena-desktop-light, cena-telefon-dark, cena-telefon-light, pomocnik-koraci-desktop-dark, pomocnik-koraci-desktop-light, pomocnik-koraci-telefon-dark, pomocnik-koraci-telefon-light, pomocnik-plan-desktop-dark, pomocnik-plan-desktop-light, pomocnik-plan-telefon-dark, pomocnik-plan-telefon-light, tabla-desktop-dark, tabla-desktop-light, tabla-prevuci-na-composer, tabla-telefon-dark, tabla-telefon-light

---

## 9. Predlog sledećih koraka

1. **Pregled i spajanje:** prođi granu (`git log main..crea-run`), proveri na telefonu prijavljenim nalogom composer („Generiši" ceo vidljiv) i nekoliko alata iz §3; odluči o snimcima ekrana pre spajanja u `main`.
2. **Dimni test Google poziva na DEV-u** (pomoćnik, Gemini govor, Lyria, noćna tura, NB2 Lite) — jedini deo koji nikad nije pozvan uživo, a od njega zavisi najviše novih funkcija.
3. **Deploy po runbook-u G** bez ijednog flega; posle stabilnog dana upali `crea_pricing_v2` (pa noćnu turu probaj na sebi), tek onda galeriju.
4. **`FAL_KEY` postupno:** ugasi neproverene fal redove, pa jedan po jedan: proba → poređenje računa sa cenom na dugmetu → paljenje. Usput ispravi zatečene rute (`kling-omni`, GPT Image 1.5) i sakrij `voice_control` (K29 S-19).
5. **Bundle radionice ka ~300 KB:** registri alata, inspiracije i recepata kao tanak spisak + lenji detalji; detalj rada i početni ekran u async chunk; zatim spusti budžet u `check:bundle`.
6. **Tabela referenci ulaza** (storageId → jobId) + migracija, da brisanje rada ne čita celu istoriju (K29-13a).
7. **Preostali SITNI nalazi K29:** tabla izazova sa paginacijom i limitom (S-09), javni rad sa isteklim fajlom (S-10), tehnike za sličice sa servera i nagrada za poziv/izazov samo uz plaćen rad (S-11), merene količine preko maksimuma (S-12), granica dodatnih izlaza (S-13), noćna tura bez duplog slanja (S-14), siročad fajlova (S-15), par „na čekanju" (S-16), inline sr/en ternari i `focus-visible` (S-20), šira pokrivenost `check:frames` (S-21), Crea CSS samo na Crea rutama (S-22), snimak cena za sve opcije (S-23), lokalni fontovi sajta (S-24), pristanak glasa vezan za snimak (S-26).
8. **Tesseract pod otiskom:** worker i jezgro kroz isti keš i `blob:` put kao MediaPipe.
9. **A7 kloniranje glasa** kad bude provajdera (direktni ElevenLabs ili Google kad objavi uslove) — alat i provera pristanka su već tu, samo je označen „uskoro".
