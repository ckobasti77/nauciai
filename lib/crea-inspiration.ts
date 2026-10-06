import type { LocalizedText } from "./i18n";
import { CREA_PROMPT_PARAM, CREA_PROMPT_PARAM_MAX, creaShellQuery, type CreaArea, type CreaModeId } from "./crea-shell";
import { toolById } from "./crea-tools";

/**
 * Inspiracija uz svaki alat (K25, U11): primer šta se pravi, dugme „Napravi ovako" i
 * „Kako je napravljeno" (koraci). Primeri su tekst (opis koji je napravio rad + koraci),
 * a ne generisane slike - tokom noćnog runa se ne troši ključ provajdera (isto kao K13/K15).
 *
 * Meta primera je režim sa composerom (`slika:napravi`) ili gotov alat (`slika.format`).
 * „Napravi ovako":
 * - režim → isti režim sa opisom (`?opis=`) i modelom (`?model=`);
 * - alat sa poljem za opis (`CREA_PROMPT_PREFILL_TOOLS`) → alat sa popunjenim opisom;
 * - ostali alati → otvori alat i stani na njegov ulaz (fajl daješ ti).
 */

export type CreaInspiration = {
  id: string;
  /** `oblast:režim` (composer) ili id alata. */
  target: string;
  title: LocalizedText;
  /** Opis (ili tekst za izgovor) od kojeg je primer napravljen. */
  prompt?: LocalizedText;
  /** Model primera; samo za režime sa composerom. */
  modelSlug?: string;
  /** Kako je napravljeno: 2-3 kratka koraka. */
  steps: readonly LocalizedText[];
};

const L = (sr: string, en: string): LocalizedText => ({ sr, en });

/**
 * Alati čije glavno polje za opis prima `?opis=` (kroz `CreaToolPromptContext`). Primer sa
 * opisom sme da cilja samo njih (test).
 */
export const CREA_PROMPT_PREFILL_TOOLS: ReadonlySet<string> = new Set([
  "slika.cetkica",
  "slika.probni-list",
  "video.produzi",
  "video.izmeni-recima",
  "video.strip",
  "video.objasnjenje",
  "video.reklama",
  "video.lik-govori",
  "zvuk.govor",
  "zvuk.podkast",
  "zvuk.efekti",
]);

export const CREA_INSPIRATIONS: readonly CreaInspiration[] = [
  // ── Composer: Slika ──────────────────────────────────────────────────────
  {
    id: "pas-plaza",
    target: "slika:napravi",
    title: L("Pas na plaži u zalazak sunca", "A dog on the beach at sunset"),
    prompt: L(
      "Zlatni retriver trči po mokrom pesku, prskaju kapi vode, zalazak sunca iza njega, topla zlatna svetlost, fotografija objektivom 85 mm, mutna pozadina.",
      "A golden retriever running on wet sand, water drops splashing, the sun setting behind it, warm golden light, photo with an 85 mm lens, blurred background.",
    ),
    modelSlug: "nano-banana-2",
    steps: [
      L("Opis ide redom: ko (pas), šta radi (trči), svetlo (zalazak), kamera (85 mm).", "The description goes in order: who (dog), action (running), light (sunset), camera (85 mm)."),
      L("Nano Banana 2 je brz i jeftin - dobar za prvu probu.", "Nano Banana 2 is fast and cheap - good for a first try."),
      L("Kad ti se svidi, „Varijacije ×4\" daju još verzija istog opisa.", "When you like it, \"Variations ×4\" give more versions of the same description."),
    ],
  },
  {
    id: "kafic-plakat",
    target: "slika:napravi",
    title: L("Plakat za kafić sa natpisom", "A café poster with a headline"),
    prompt: L(
      "Plakat za mali kafić: šolja kafe na drvenom stolu, jutarnje svetlo kroz prozor, veliki natpis „Jutarnja kafa 150 din\", topli tonovi, ravna ilustracija.",
      "A poster for a small café: a cup of coffee on a wooden table, morning light through the window, a big headline \"Morning coffee €1.50\", warm tones, flat illustration.",
    ),
    modelSlug: "gpt-image-2",
    steps: [
      L("Tačan natpis je pod navodnicima - model ga prepiše slovo po slovo.", "The exact headline is in quotes - the model copies it letter by letter."),
      L("GPT Image 2 najbolje piše tekst na slici.", "GPT Image 2 is the best at text inside an image."),
      L("Za Instagram objavu izaberi format 1:1 pre nego što klikneš.", "For an Instagram post pick the 1:1 shape before you click."),
    ],
  },
  {
    id: "akvarel-grad",
    target: "slika:napravi",
    title: L("Grad kao akvarel", "A city as a watercolour"),
    prompt: L(
      "Ušće Save u Dunav i Kalemegdan u akvarel tehnici, meke mrlje boje, beli papir se vidi između poteza, jutarnja izmaglica, pogled iz ptičje perspektive.",
      "Where the Sava meets the Danube, with Kalemegdan fortress, in watercolour, soft patches of colour, white paper showing between strokes, morning mist, bird's-eye view.",
    ),
    modelSlug: "flux-2-pro",
    steps: [
      L("Stil („akvarel\") i detalj tehnike („beli papir između poteza\") vode izgled.", "The style (\"watercolour\") and a technique detail (\"white paper between strokes\") drive the look."),
      L("„Iz ptičje perspektive\" je deo za kameru.", "\"Bird's-eye view\" is the camera part."),
      L("U „Izgledu\" isti stil biraš i klikom, bez kucanja.", "In \"Look\" you can pick the same style with a click, no typing."),
    ],
  },
  {
    id: "proizvod-ambijent",
    target: "slika:izmeni",
    title: L("Proizvod u novom ambijentu", "A product in a new setting"),
    prompt: L(
      "Stavi ovu bočicu parfema na mermerni sto pored prozora, meko jutarnje svetlo, par listova monstere u pozadini; bočica i etiketa ostaju potpuno iste.",
      "Put this perfume bottle on a marble table by a window, soft morning light, a few monstera leaves in the background; the bottle and label stay exactly the same.",
    ),
    modelSlug: "nano-banana-2",
    steps: [
      L("Okači fotku proizvoda u polje za sliku.", "Upload the product photo into the image slot."),
      L("Reci šta se menja i šta OSTAJE isto - etiketa ne sme da se izmisli.", "Say what changes and what STAYS the same - the label must not be invented."),
      L("Za sitan tekst na etiketi probaj Nano Banana Pro.", "For small text on the label try Nano Banana Pro."),
    ],
  },
  {
    id: "zima-ulica",
    target: "slika:izmeni",
    title: L("Ista ulica, zima umesto leta", "The same street, winter instead of summer"),
    prompt: L(
      "Pretvori ovu fotografiju ulice u zimsku scenu: sneg na krovovima i trotoaru, sivo nebo, topla svetla u izlozima; zgrade i kadar ostaju isti.",
      "Turn this street photo into a winter scene: snow on the roofs and pavement, a grey sky, warm lights in the shop windows; the buildings and framing stay the same.",
    ),
    modelSlug: "nano-banana-pro",
    steps: [
      L("Okači svoju fotku ulice.", "Upload your street photo."),
      L("Promena (zima) plus spisak onoga što se ne dira (zgrade, kadar).", "The change (winter) plus a list of what stays untouched (buildings, framing)."),
      L("„Uporedi pre i posle\" u detalju rada pokaže razliku.", "\"Compare before and after\" in the work detail shows the difference."),
    ],
  },
  // ── Composer: Video ──────────────────────────────────────────────────────
  {
    id: "kafa-para",
    target: "video:napravi",
    title: L("Para iznad šolje kafe", "Steam over a cup of coffee"),
    prompt: L(
      "Krupni plan šolje kafe na drvenom stolu, para se lagano diže, jutarnje sunce kroz prozor, kamera polako prilazi šolji.",
      "Close-up of a cup of coffee on a wooden table, steam rising gently, morning sun through the window, the camera slowly moves closer to the cup.",
    ),
    modelSlug: "veo-31-lite",
    steps: [
      L("Jedna radnja (para se diže) i jedan pokret kamere (prilazi) - kratak video to najbolje nosi.", "One action (steam rising) and one camera move (moving closer) - a short video carries that best."),
      L("Veo 3.1 Lite pravi i zvuk uz sliku.", "Veo 3.1 Lite also makes sound with the picture."),
      L("Prvo kratka proba, pa duža verzija kad ti se svidi.", "First a short test, then a longer version once you like it."),
    ],
  },
  {
    id: "ozivi-fotku",
    target: "video:napravi",
    title: L("Oživi staru fotografiju", "Bring an old photo to life"),
    prompt: L(
      "Osobe na fotografiji se blago nasmeše i trepnu, vetar lagano pomera kosu, kamera stoji mirno.",
      "The people in the photo smile gently and blink, the wind lightly moves their hair, the camera stays still.",
    ),
    modelSlug: "kling-3",
    steps: [
      L("Okači fotku kao početni kadar (ulaz „Slika\").", "Upload the photo as the starting frame (the \"Image\" input)."),
      L("Opisuješ samo POKRET - izgled već daje fotka.", "You describe only the MOTION - the photo already gives the look."),
      L("Mirna kamera čuva lica; brz pokret ih kvari.", "A still camera keeps faces intact; fast motion distorts them."),
    ],
  },
  {
    id: "patike-tiktok",
    target: "video:napravi",
    title: L("Klip proizvoda za TikTok", "A product clip for TikTok"),
    prompt: L(
      "Patike se okreću na postolju u studiju, žuta pozadina, kamera polako kruži oko njih, oštro svetlo sa strane, uspravni kadar.",
      "Sneakers spinning on a pedestal in a studio, yellow background, the camera slowly circles them, hard side light, vertical framing.",
    ),
    modelSlug: "minimax-h3",
    steps: [
      L("Format 9:16 izaberi u podešavanjima ispod opisa.", "Pick the 9:16 shape in the settings below the description."),
      L("„Kamera kruži\" daje proizvodu profesionalan izgled.", "\"The camera circles\" gives the product a professional look."),
      L("Tekst i muziku dodaješ posle, u Montaži.", "You add text and music afterwards, in the Editor."),
    ],
  },
  {
    id: "dodaj-kisu",
    target: "video:izmeni",
    title: L("Dodaj kišu u svoj snimak", "Add rain to your clip"),
    prompt: L(
      "Dodaj jaku kišu i mokar asfalt koji se presijava; ljudi, pokret i kamera ostaju isti.",
      "Add heavy rain and wet, glistening asphalt; the people, motion and camera stay the same.",
    ),
    modelSlug: "kling-o3-edit",
    steps: [
      L("Okači svoj video.", "Upload your video."),
      L("Napiši šta se dodaje i šta ostaje isto.", "Write what gets added and what stays the same."),
      L("Kling O3 izmena čuva originalni zvuk.", "The Kling O3 edit keeps the original sound."),
    ],
  },
  {
    id: "ples-lik",
    target: "video:pokret",
    title: L("Tvoj Lik ponavlja tvoj ples", "Your Character repeats your dance"),
    steps: [
      L("Snimi sebe kako plešeš 5-10 sekundi, ceo u kadru.", "Film yourself dancing for 5-10 seconds, fully in frame."),
      L("Izaberi sliku svog Lika.", "Pick the picture of your Character."),
      L("Lik ponovi isti pokret - jednostavna pozadina daje najčistiji rezultat.", "The Character repeats the move - a plain background gives the cleanest result."),
    ],
  },
  {
    id: "lik-vesti",
    target: "video:govor",
    title: L("Lik čita kratku vest", "A Character reads a short news item"),
    steps: [
      L("Napravi glas u Zvuk · Govor ili okači svoj snimak.", "Make the voice in Sound · Speech or upload your own recording."),
      L("Izaberi fotku lika - lice spreda, dobro osvetljeno.", "Pick the character photo - face from the front, well lit."),
      L("Usne prate zvuk; kratke rečenice izgledaju najprirodnije.", "The lips follow the sound; short sentences look the most natural."),
    ],
  },
  // ── Composer: Zvuk ───────────────────────────────────────────────────────
  {
    id: "najava-podkast",
    target: "zvuk:govor",
    title: L("Najava za podkast", "A podcast intro"),
    prompt: L(
      "Dobro došli u novu epizodu! Danas pričamo o tome kako da za deset minuta napravite svoju prvu sliku pomoću veštačke inteligencije.",
      "Welcome to a new episode! Today we talk about how to make your first image with artificial intelligence in ten minutes.",
    ),
    modelSlug: "gemini-tts",
    steps: [
      L("Tekst piši kako se govori - brojeve rečima.", "Write the text the way it's spoken - numbers as words."),
      L("Uzvičnik daje energiju, zarez kratku pauzu.", "An exclamation mark adds energy, a comma a short pause."),
      L("Izaberi glas i raspoloženje, pa preslušaj pre preuzimanja.", "Pick a voice and mood, then listen before downloading."),
    ],
  },
  {
    id: "radio-pekara",
    target: "zvuk:govor",
    title: L("Radio reklama za pekaru", "A radio ad for a bakery"),
    prompt: L(
      "Sveže kifle svako jutro od šest sati! Pekara Zlatno zrno, Ulica cara Dušana dvadeset dva. Dođite dok su tople.",
      "Fresh rolls every morning from six o'clock! Golden Grain bakery, twenty-two Tsar Dušan Street. Come while they're warm.",
    ),
    modelSlug: "gemini-tts",
    steps: [
      L("Kratke rečenice - slušalac ih pamti.", "Short sentences - the listener remembers them."),
      L("Adresu napiši rečima („dvadeset dva\").", "Write the address in words (\"twenty-two\")."),
      L("Muziku ispod govora dodaš u Uređivaču zvuka.", "Add music under the voice in the Sound editor."),
    ],
  },
  {
    id: "novi-glas",
    target: "zvuk:promena",
    title: L("Drugi glas za tvoj snimak", "A different voice for your recording"),
    steps: [
      L("Okači snimak ili video sa govorom.", "Upload a recording or video with speech."),
      L("Svakom govorniku izaberi novi glas.", "Pick a new voice for each speaker."),
      L("Muzika u pozadini ostaje, a spajanje radi tvoj uređaj.", "The background music stays, and your device does the mixing."),
    ],
  },
  {
    id: "video-engleski",
    target: "zvuk:prevod",
    title: L("Tvoj video na engleskom", "Your video in English"),
    steps: [
      L("Okači video sa srpskim govorom.", "Upload a video with Serbian speech."),
      L("Ispravi zapisan tekst i prevod PRE izgovora - plaćaš samo izmenjene rečenice.", "Fix the transcript and translation BEFORE voicing - you pay only for changed sentences."),
      L("Titlovi (SRT) su besplatni.", "Subtitles (SRT) are free."),
    ],
  },
  {
    id: "lofi-ucenje",
    target: "zvuk:muzika",
    title: L("Mirna muzika za učenje", "Calm music for studying"),
    prompt: L(
      "Mirni lo-fi hip hop, meki klavir i tihi bubnjevi, oko 80 udaraca u minuti, toplo i opušteno, bez vokala.",
      "Calm lo-fi hip hop, soft piano and quiet drums, around 80 beats per minute, warm and relaxed, no vocals.",
    ),
    modelSlug: "lyria-3-clip",
    steps: [
      L("Žanr, instrumenti, tempo i raspoloženje - četiri stvari koje muzika treba.", "Genre, instruments, tempo and mood - the four things music needs."),
      L("„Bez vokala\" čuva pesmu za pozadinu videa.", "\"No vocals\" keeps it right for a video background."),
      L("Cena piše na dugmetu pre klika.", "The price is on the button before you click."),
    ],
  },
  {
    id: "dzingl-kanal",
    target: "zvuk:muzika",
    title: L("Kratak džingl za kanal", "A short channel jingle"),
    prompt: L(
      "Veseo kratak džingl, ukulele i pljeskanje, brz tempo, završava se jasnim akordom.",
      "A cheerful short jingle, ukulele and claps, fast tempo, ending on a clear chord.",
    ),
    modelSlug: "lyria-3-clip",
    steps: [
      L("„Završava se jasnim akordom\" daje džinglu čist kraj.", "\"Ending on a clear chord\" gives the jingle a clean end."),
      L("Instrumenti su konkretni (ukulele, pljesak).", "The instruments are specific (ukulele, claps)."),
      L("U Uređivaču zvuka ga skratiš na tačnu dužinu.", "Trim it to the exact length in the Sound editor."),
    ],
  },
  {
    id: "koraci-sneg",
    target: "zvuk:efekti",
    title: L("Koraci po snegu", "Footsteps in snow"),
    prompt: L(
      "Koraci po dubokom snegu, sporo, izbliza, škripanje snega, tiho zimsko veče.",
      "Footsteps in deep snow, slow, close up, the snow crunching, a quiet winter evening.",
    ),
    modelSlug: "mmaudio-sfx",
    steps: [
      L("Opiši zvuk kao da ga čuješ: šta, kako brzo, koliko blizu.", "Describe the sound as if you hear it: what, how fast, how close."),
      L("Ambijent („tiho veče\") daje prostor oko zvuka.", "The ambience (\"a quiet evening\") gives space around the sound."),
      L("Prvo pogledaj besplatnu CC0 biblioteku - možda efekat već postoji.", "Check the free CC0 library first - the effect may already exist."),
    ],
  },
  {
    id: "skripa-vrata",
    target: "zvuk:efekti",
    title: L("Škripa starih vrata", "An old door creaking"),
    prompt: L(
      "Stara drvena vrata se polako otvaraju uz dugu škripu, prazna soba sa odjekom.",
      "An old wooden door slowly opens with a long creak, an empty room with an echo.",
    ),
    modelSlug: "mmaudio-sfx",
    steps: [
      L("Predmet + radnja + prostor: vrata, otvaraju se, prazna soba.", "Object + action + space: a door, opening, an empty room."),
      L("„Polako\" i „dugu\" određuju trajanje zvuka.", "\"Slowly\" and \"long\" set the length of the sound."),
      L("Isti efekat napravi u više verzija i zadrži najbolju.", "Make the same effect in several versions and keep the best."),
    ],
  },
  {
    id: "intervju-tekst",
    target: "zvuk:uredjivac",
    title: L("Tekst intervjua sa govornicima", "An interview transcript with speakers"),
    steps: [
      L("Okači snimak razgovora.", "Upload the conversation recording."),
      L("Model zapiše ko šta govori i kada.", "The model writes down who says what and when."),
      L("Tekst preuzmi ili ga uredi u alatu „Transkript\".", "Download the text or edit it in the \"Transcript\" tool."),
    ],
  },
  // ── Alati: Slika ─────────────────────────────────────────────────────────
  { id: "format-instagram", target: "slika.format", title: L("Fotka sa telefona, lakša i bez lokacije", "A phone photo, lighter and without the location"), steps: [L("Okači fotku (i HEIC sa iPhone-a).", "Upload the photo (iPhone HEIC too)."), L("Izaberi WebP i kvalitet oko 80 %.", "Pick WebP and a quality around 80%."), L("Alat obriše skrivene podatke kao što je GPS.", "The tool removes hidden data such as GPS.")] },
  { id: "provera-lik", target: "slika.provera", title: L("Proveri selfi pre nego što napraviš Lik", "Check a selfie before making a Character"), steps: [L("Okači fotku lica spreda.", "Upload a front-facing photo."), L("Pečat kaže SPREMNO, POPRAVI ili NE VALJA.", "The stamp says READY, FIX or NO GOOD."), L("Popravi ono što piše (svetlo, oštrina) pa plati tek tada.", "Fix what it says (light, sharpness) and only then pay.")] },
  { id: "iseci-prica", target: "slika.iseci", title: L("Fotka za Instagram priču", "A photo for an Instagram story"), steps: [L("Okači fotku i izaberi „Priča 9:16\".", "Upload the photo and pick \"Story 9:16\"."), L("Pomeri okvir na ono što je važno.", "Move the frame onto what matters."), L("Sačuvaj - 0 kredita.", "Save - 0 credits.")] },
  { id: "pametno-lice", target: "slika.pametni-isecak", title: L("Grupna fotka za TikTok, lice u kadru", "A group photo for TikTok, face in frame"), steps: [L("Okači položenu fotku.", "Upload a landscape photo."), L("Izaberi 9:16 - alat sam nađe lice.", "Pick 9:16 - the tool finds the face itself."), L("Po želji pomeri okvir rukom.", "Move the frame by hand if you like.")] },
  { id: "paleta-brend", target: "slika.paleta", title: L("Boje logoa za brend kit", "Logo colours for a brand kit"), steps: [L("Okači logo ili fotku lokala.", "Upload the logo or a photo of the shop."), L("Kopiraj kodove boja.", "Copy the colour codes."), L("„Pošalji u opis\" ih ubaci u novu sliku.", "\"Send to description\" puts them into a new image.")] },
  { id: "qr-meni", target: "slika.qr", title: L("QR kod za jelovnik na stolu", "A QR code for the menu on the table"), steps: [L("Nalepi link jelovnika.", "Paste the menu link."), L("Izaberi boje lokala i logo u sredini.", "Pick the shop colours and a logo in the middle."), L("Preuzmi i odštampaj - kod se proveri pre preuzimanja.", "Download and print - the code is checked before download.")] },
  { id: "vektor-logo", target: "slika.vektor", title: L("Stari logo u oštar SVG", "An old logo into a sharp SVG"), steps: [L("Okači logo, najbolje na beloj pozadini.", "Upload the logo, ideally on a white background."), L("Izaberi 2-6 boja.", "Pick 2-6 colours."), L("SVG se ne mrvi ni na bilbordu.", "The SVG stays sharp even on a billboard.")] },
  { id: "gif-rodjendan", target: "slika.gif", title: L("GIF od fotki sa rođendana", "A GIF from birthday photos"), steps: [L("Izaberi 3-10 slika.", "Pick 3-10 pictures."), L("Podesi brzinu smene.", "Set how fast they change."), L("Preuzmi GIF koji se vrti.", "Download a looping GIF.")] },
  { id: "ocr-racun", target: "slika.ocr", title: L("Tekst sa fotke računa ili table", "Text from a photo of a receipt or board"), steps: [L("Slikaj ravno i oštro.", "Take the photo straight and sharp."), L("Alat čita latinicu i ćirilicu.", "The tool reads Latin and Cyrillic."), L("Prebaci pismo i kopiraj tekst.", "Switch the script and copy the text.")] },
  { id: "editor-akcija", target: "slika.editor", title: L("Natpis „Akcija -20 %\" preko fotke", "A \"Sale -20%\" sign over a photo"), steps: [L("Okači fotku proizvoda.", "Upload the product photo."), L("Dodaj tekst sa č, ć, š, ž, đ i nalepnicu.", "Add text with Serbian letters and a sticker."), L("Preuzmi ili sačuvaj u galeriju.", "Download or save to the gallery.")] },
  { id: "sablon-jelovnik", target: "slika.sabloni", title: L("Jelovnik za kafić iz šablona", "A café menu from a template"), steps: [L("Izaberi šablon „Jelovnik\".", "Pick the \"Menu\" template."), L("Upiši stavke i cene.", "Type the items and prices."), L("Preuzmi spremno za štampu.", "Download ready to print.")] },
  { id: "3d-foto-odmor", target: "slika.3d-foto", title: L("Fotka sa odmora koja se pomera", "A holiday photo that moves"), steps: [L("Okači fotku sa jasnim prvim planom.", "Upload a photo with a clear foreground."), L("Alat proceni dubinu na uređaju.", "The tool estimates depth on your device."), L("Izaberi pokret i izvezi kratak video.", "Pick a motion and export a short video.")] },
  { id: "opis-tudje", target: "slika.opis", title: L("Opiši sliku koja ti se dopada", "Describe a picture you like"), steps: [L("Okači sliku.", "Upload the picture."), L("Dobiješ opis po delovima: ko, šta, stil, svetlo, kamera.", "You get a description by parts: who, what, style, light, camera."), L("„Napravi sličnu\" ga pošalje u Napravi.", "\"Make a similar one\" sends it to Create.")] },
  {
    id: "cetkica-bicikl",
    target: "slika.cetkica",
    title: L("Bicikl tamo gde je bio prazan zid", "A bicycle where the wall was empty"),
    prompt: L("crveni gradski bicikl naslonjen na zid, ista senka i svetlo kao na ostatku fotke", "a red city bicycle leaning on the wall, the same shadow and light as the rest of the photo"),
    steps: [L("Okači fotku i ofarbaj deo zida četkicom.", "Upload the photo and paint over part of the wall."), L("Napiši šta tu treba da bude.", "Write what should be there."), L("AI menja samo ofarban deo.", "The AI changes only the painted part.")],
  },
  { id: "klik-boja", target: "slika.klik", title: L("Crveni kišobran, ostalo crno-belo", "A red umbrella, the rest black-and-white"), steps: [L("Okači fotku.", "Upload the photo."), L("Klikni na kišobran - sam se označi.", "Click the umbrella - it selects itself."), L("Izaberi „u boji, ostalo crno-belo\".", "Pick \"in colour, the rest black-and-white\".")] },
  { id: "obrisi-turista", target: "slika.obrisi", title: L("Ukloni turistu iz kadra", "Remove a tourist from the shot"), steps: [L("Prevuci preko osobe.", "Brush over the person."), L("Mali predmeti se brišu besplatno na uređaju.", "Small objects are erased free on your device."), L("Za veliki predmet nudi se plaćen put, uz cenu.", "For a large object a paid option is offered, with the price.")] },
  { id: "pozadina-proizvod", target: "slika.pozadina", title: L("Proizvod na beloj pozadini", "A product on a white background"), steps: [L("Okači fotku proizvoda.", "Upload the product photo."), L("Pozadina nestaje na tvom uređaju.", "The background disappears on your device."), L("Izaberi belu boju ili zamućenje i sačuvaj.", "Pick white or a blur and save.")] },
  { id: "uvecaj-stara", target: "slika.uvecaj", title: L("Mala stara fotka, dvostruko veća", "A small old photo, twice the size"), steps: [L("Okači sliku.", "Upload the picture."), L("Model je uveća 2× na tvom uređaju.", "The model enlarges it 2× on your device."), L("Uporedi pre i posle, pa sačuvaj.", "Compare before and after, then save.")] },
  { id: "boje-film", target: "slika.boje", title: L("Filmski izgled jednim klikom", "A film look in one click"), steps: [L("Okači fotku.", "Upload the photo."), L("Izaberi izgled, pa doteraj klizačima.", "Pick a look, then fine-tune with sliders."), L("0 kredita - sve radi tvoj pregledač.", "0 credits - your browser does it all.")] },
  { id: "prosiri-tiktok", target: "slika.prosiri", title: L("Položena fotka postaje uspravna", "A landscape photo becomes portrait"), steps: [L("Okači fotku i izaberi „za TikTok\".", "Upload the photo and pick \"for TikTok\"."), L("Iseci besplatno ili neka AI doslika ono što fali.", "Crop for free or let the AI paint in what's missing."), L("Cena dosilikavanja piše na dugmetu.", "The price of painting in is on the button.")] },
  { id: "svetlo-portret", target: "slika.svetlo", title: L("Portret kao iz studija", "A portrait like from a studio"), steps: [L("Okači portret.", "Upload a portrait."), L("Pomeri „sunce\" na stranu.", "Move the \"sun\" to one side."), L("AI osvetli lice sa te strane.", "The AI lights the face from that side.")] },
  { id: "uglovi-sto", target: "slika.uglovi", title: L("Isti sto iz devet uglova", "The same table from nine angles"), steps: [L("Okači sliku prizora.", "Upload a picture of the scene."), L("Jedna generacija daje mrežu 3×3.", "One generation makes a 3×3 grid."), L("Mreža se na uređaju iseče u 9 radova.", "The grid is cut into 9 works on your device.")] },
  { id: "slojevi-plakat", target: "slika.slojevi", title: L("Plakat rastavljen na slojeve", "A poster taken apart into layers"), steps: [L("Okači plakat.", "Upload the poster."), L("Sakrij ili pomeri sloj sa tekstom.", "Hide or move the text layer."), L("Spoji i izvezi novu sliku.", "Merge and export a new image.")] },
  { id: "tekst-sloj", target: "slika.tekst", title: L("Novi natpis bez slovnih grešaka", "A new sign without spelling mistakes"), steps: [L("Okači sliku sa pogrešnim natpisom.", "Upload the picture with the wrong sign."), L("Stari tekst se prepozna i obriše.", "The old text is detected and erased."), L("Upiši novi sa č, ć, š, ž, đ.", "Type the new one with Serbian letters.")] },
  { id: "retus-stara", target: "slika.retus", title: L("Blag retuš kože za profilnu", "A gentle skin retouch for a profile picture"), steps: [L("Okači portret.", "Upload a portrait."), L("Blag retuš je besplatan.", "A gentle retouch is free."), L("Oštećenu staru fotku vraća plaćen model, uz cenu.", "A damaged old photo is restored by a paid model, with the price shown.")] },
  { id: "odeca-proba", target: "slika.odeca", title: L("Probaj jaknu na svom liku", "Try a jacket on your character"), steps: [L("Okači fotku osobe.", "Upload a photo of the person."), L("Okači fotku jakne.", "Upload a photo of the jacket."), L("Model obuče jaknu, ostalo ostaje.", "The model puts the jacket on, the rest stays.")] },
  { id: "zameni-lik-putovanje", target: "slika.zameni-lik", title: L("Ti na fotki sa putovanja", "You in a travel photo"), steps: [L("Izaberi svoj sačuvan Lik.", "Pick your saved Character."), L("Okači fotku mesta.", "Upload the photo of the place."), L("Potvrdi pristanak - samo tvoje lice.", "Confirm consent - only your own face.")] },
  { id: "likovi-maskota", target: "slika.likovi", title: L("Maskota firme u svakoj slici", "A company mascot in every picture"), steps: [L("Sačuvaj maskotu sa 1-3 slike i imenom.", "Save the mascot with 1-3 pictures and a name."), L("U opisu napiši @ime.", "Write @name in a description."), L("Ista maskota se pojavljuje u slikama i videu.", "The same mascot appears in images and video.")] },
  { id: "kreator-junak", target: "slika.kreator-lika", title: L("Junak za strip kao u igrici", "A comic hero like in a game"), steps: [L("Izaberi frizuru, odeću i stil iz menija.", "Pick the hair, clothes and style from the menu."), L("Dobiješ list lika spreda, sa strane i otpozadi.", "You get a character sheet from the front, side and back."), L("Sačuvaj ga kao Lik za dalje.", "Save it as a Character for later.")] },
  {
    id: "probni-list-maskota",
    target: "slika.probni-list",
    title: L("Osam skica maskote, pa najbolja", "Eight mascot sketches, then the best"),
    prompt: L("Vesela maskota za pekaru: nasmejana kifla sa kapom pekara, crtani stil, debele konture, bela pozadina", "A cheerful bakery mascot: a smiling croissant in a baker's hat, cartoon style, thick outlines, white background"),
    steps: [L("Opis ide jeftinom modelu za skice.", "The description goes to a cheap sketch model."), L("Izaberi skicu koja ti se dopada.", "Pick the sketch you like."), L("„Usavrši\" je napravi skupljim modelom.", "\"Refine\" makes it with a pricier model.")],
  },
  { id: "ko-gde-kako-razglednica", target: "slika.ko-gde-kako", title: L("Ti, Kalemegdan, stari film", "You, Kalemegdan, old film"), steps: [L("Ko: tvoja fotka. Gde: fotka mesta. Kako: slika stila.", "Who: your photo. Where: a photo of the place. How: a style picture."), L("Opis se sam sklopi - vidiš ga pre plaćanja.", "The description builds itself - you see it before paying."), L("Po želji dodaj šta se dešava.", "Add what's happening if you like.")] },
  { id: "crtaj-kuca", target: "slika.crtaj", title: L("Crtež kućice postaje slika uživo", "A house drawing becomes a picture live"), steps: [L("Nacrtaj par poteza.", "Draw a few strokes."), L("Uključi „uživo\" - cena osvežavanja piše unapred.", "Turn on \"live\" - the refresh price is shown first."), L("„Usavrši poslednju sliku\" za konačnu verziju.", "\"Refine the last picture\" for the final version.")] },
  { id: "skica-sveska", target: "slika.skica", title: L("Crtež iz sveske u pravu sliku", "A notebook drawing into a real picture"), steps: [L("Slikaj crtež ili crtaj na platnu.", "Photograph the drawing or draw on the canvas."), L("Izaberi stil (ili realnu fotku).", "Pick a style (or a realistic photo)."), L("Kompozicija ostaje tvoja.", "The composition stays yours.")] },
  { id: "nalepnice-viber", target: "slika.nalepnice", title: L("Viber nalepnice tvog lika", "Viber stickers of your character"), steps: [L("Izaberi svoj Lik.", "Pick your Character."), L("Jedna slika daje 9 izraza.", "One image gives 9 expressions."), L("Na uređaju se iseku i spakuju u ZIP.", "They're cut and packed into a ZIP on your device.")] },
  { id: "logo-frizer", target: "slika.logo", title: L("Logo za frizerski salon", "A logo for a hair salon"), steps: [L("Upiši ime i delatnost.", "Type the name and business."), L("Izaberi stil i boje brend kita.", "Pick a style and the brand-kit colours."), L("SVG nastaje na tvom uređaju.", "The SVG is made on your device.")] },
  { id: "brend-kit-firma", target: "slika.brend-kit", title: L("Brend kit male firme", "A small business brand kit"), steps: [L("Okači logo - boje se izvuku same.", "Upload the logo - the colours are picked out automatically."), L("Izaberi slova i ton.", "Pick the fonts and tone."), L("Recepti i editor ih koriste sami.", "Recipes and the editor use them on their own.")] },
  // ── Alati: Video ─────────────────────────────────────────────────────────
  { id: "poslednji-kadar-nastavak", target: "video.poslednji-kadar", title: L("Nastavak klipa od poslednjeg kadra", "Continue a clip from its last frame"), steps: [L("Okači video.", "Upload the video."), L("Izvuci poslednji kadar na uređaju.", "Extract the last frame on your device."), L("Od njega napravi sledeći klip.", "Make the next clip from it.")] },
  { id: "vise-scena-jutro", target: "video.vise-scena", title: L("Jutro u tri scene", "A morning in three scenes"), steps: [L("Kartica po sceni: šta se dešava i kako se kamera kreće.", "One card per scene: what happens and how the camera moves."), L("Do šest kartica.", "Up to six cards."), L("Kling 3.0 ih spoji u jedan klip sa rezovima.", "Kling 3.0 joins them into one clip with cuts.")] },
  { id: "crtaj-pokret-zmaj", target: "video.crtaj-pokret", title: L("Zmaj leti tamo gde nacrtaš", "A kite flies where you draw"), steps: [L("Okači sliku.", "Upload a picture."), L("Nacrtaj strelicu - šta se pomera i kuda.", "Draw an arrow - what moves and where."), L("Slika oživi baš tako.", "The picture comes alive exactly that way.")] },
  {
    id: "strip-macka",
    target: "video.strip",
    title: L("Kratka priča kao film", "A short story as a film"),
    prompt: L("Mačka Mica nađe izgubljeno štene na kiši, odvede ga kući, i na kraju zajedno spavaju pored peći.", "Mica the cat finds a lost puppy in the rain, takes it home, and in the end they sleep together by the stove."),
    steps: [L("Napiši priču u 2-3 rečenice.", "Write the story in 2-3 sentences."), L("Crea je složi u strip od 3-8 kadrova.", "Crea lays it out as a 3-8 panel comic."), L("Kadrovi se ožive i spoje u film.", "The panels come alive and join into a film.")],
  },
  {
    id: "objasnjenje-fotosinteza",
    target: "video.objasnjenje",
    title: L("Lekcija o fotosintezi za 1 minut", "A one-minute lesson on photosynthesis"),
    prompt: L("Biljke prave hranu od sunčeve svetlosti, vode i vazduha. U listu se svetlost pretvara u šećer, a biljka pri tome ispušta kiseonik koji mi dišemo.", "Plants make food from sunlight, water and air. In the leaf, light turns into sugar, and the plant releases oxygen that we breathe."),
    steps: [L("Nalepi tekst lekcije.", "Paste the lesson text."), L("Izaberi stil: tabla, papir ili glina.", "Pick a style: board, paper or clay."), L("Dobiješ srpski glas i titlove.", "You get a Serbian voice and subtitles.")],
  },
  {
    id: "reklama-burek",
    target: "video.reklama",
    title: L("Oglas za buregdžinicu", "An ad for a pastry shop"),
    prompt: L("Najhrskaviji burek u kraju, pečen svakog jutra u pet. Dođi dok je topao!", "The crispiest burek in the neighbourhood, baked every morning at five. Come while it's warm!"),
    steps: [L("Okači fotku proizvoda.", "Upload the product photo."), L("Dve rečenice o proizvodu.", "Two sentences about the product."), L("Izaberi govorni oglas ili animaciju u bojama brenda.", "Pick a spoken ad or an animation in your brand colours.")],
  },
  {
    id: "produzi-zalazak",
    target: "video.produzi",
    title: L("Još pet sekundi zalaska", "Five more seconds of sunset"),
    prompt: L("kamera nastavlja polako da se diže iznad mora dok sunce nestaje iza horizonta", "the camera keeps slowly rising above the sea as the sun disappears behind the horizon"),
    steps: [L("Okači klip.", "Upload the clip."), L("Izaberi nastavak posle kraja.", "Pick a continuation after the end."), L("Opiši šta se dalje dešava.", "Describe what happens next.")],
  },
  {
    id: "izmeni-noc",
    target: "video.izmeni-recima",
    title: L("Dan postaje noć", "Day becomes night"),
    prompt: L("pretvori u noć: upaljena ulična svetla, tamnoplavo nebo, osvetljeni prozori", "turn it into night: street lights on, a dark blue sky, lit windows"),
    steps: [L("Okači video.", "Upload the video."), L("Napiši promenu jednom rečenicom.", "Write the change in one sentence."), L("Pokret i kamera ostaju isti.", "The motion and camera stay the same.")],
  },
  { id: "zameni-solja", target: "video.zameni", title: L("Tvoja šolja umesto obične", "Your mug instead of a plain one"), steps: [L("Okači video.", "Upload the video."), L("Slikom pokaži novu šolju (ili izaberi Lik).", "Show the new mug with a picture (or pick a Character)."), L("Nova šolja ulazi u video.", "The new mug enters the video.")] },
  { id: "reframe-reels", target: "video.reframe", title: L("YouTube klip za Reels", "A YouTube clip for Reels"), steps: [L("Okači položen video.", "Upload a landscape video."), L("Izaberi 9:16.", "Pick 9:16."), L("Lice ostaje u kadru - besplatno, na uređaju.", "The face stays in frame - free, on your device.")] },
  { id: "boje-video-toplo", target: "video.boje", title: L("Topao filmski izgled za ceo video", "A warm film look for the whole video"), steps: [L("Okači video.", "Upload the video."), L("Izaberi izgled i doteraj klizačima.", "Pick a look and adjust with sliders."), L("Izvoz u MP4, zvuk ostaje.", "Export to MP4, the sound stays.")] },
  { id: "pozadina-video-zoom", target: "video.pozadina", title: L("Ti na mirnoj pozadini, bez zelenog platna", "You on a calm background, no green screen"), steps: [L("Okači snimak sebe.", "Upload a video of yourself."), L("Pozadina se ukloni na uređaju.", "The background is removed on your device."), L("Izaberi boju, zamućenje ili sliku.", "Pick a colour, a blur or a picture.")] },
  { id: "uvecaj-video-4k", target: "video.uvecaj", title: L("Stari klip u oštrijih 1080p", "An old clip into sharper 1080p"), steps: [L("Okači video.", "Upload the video."), L("Izaberi 1080p, 2K ili 4K.", "Pick 1080p, 2K or 4K."), L("Plaća se po sekundi - cena piše unapred.", "Charged per second - the price is shown first.")] },
  { id: "slowmo-skok", target: "video.slowmo", title: L("Skok u vodu, usporeno", "A dive into water, in slow motion"), steps: [L("Okači kratak video.", "Upload a short video."), L("Izaberi 2× ili 4×.", "Pick 2× or 4×."), L("Ubačeni kadrovi brišu seckanje.", "Inserted frames remove the stutter.")] },
  { id: "bez-treperenja-timelapse", target: "video.bez-treperenja", title: L("Timelapse bez treperenja", "A timelapse without flicker"), steps: [L("Okači timelapse ili AI video.", "Upload a timelapse or AI video."), L("Alat ujednači svetlo.", "The tool evens out the light."), L("Prava promena svetla (zalazak) ostaje.", "A real light change (sunset) stays.")] },
  { id: "odglumi-pozdrav", target: "video.odglumi", title: L("Lik mahne kao ti", "A Character waves like you"), steps: [L("Snimi sebe kako mašeš.", "Film yourself waving."), L("Izaberi svoj Lik.", "Pick your Character."), L("Lik ponovi pokret.", "The Character repeats the move.")] },
  {
    id: "lik-govori-cestitka",
    target: "video.lik-govori",
    title: L("Video čestitka za rođendan", "A birthday video greeting"),
    prompt: L("Srećan rođendan, Ana! Neka ti ova godina donese mnogo smeha, putovanja i lepih ljudi.", "Happy birthday, Ana! May this year bring you lots of laughter, travel and lovely people."),
    steps: [L("Napiši tekst čestitke.", "Write the greeting."), L("Crea ga izgovori na srpskom.", "Crea speaks it in Serbian."), L("Tvoj Lik ga kaže - izaberi scenu.", "Your Character says it - pick a scene.")],
  },
  { id: "titlovi-karaoke", target: "video.titlovi", title: L("Karaoke titlovi za Reels", "Karaoke subtitles for Reels"), steps: [L("Okači video i napiši tekst (ili ga zapiši plaćeno).", "Upload the video and type the text (or transcribe it, paid)."), L("Izaberi latinicu ili ćirilicu i stil.", "Pick Latin or Cyrillic and a style."), L("Titlovi se utisnu u video.", "The subtitles are burned into the video.")] },
  { id: "shorts-predavanje", target: "video.shorts", title: L("Tri kratka klipa iz predavanja", "Three short clips from a lecture"), steps: [L("Okači dugačak snimak.", "Upload a long recording."), L("Crea nađe najbolje momente.", "Crea finds the best moments."), L("Dobiješ 9:16 klipove sa titlovima.", "You get 9:16 clips with subtitles.")] },
  { id: "retro-vhs", target: "video.retro", title: L("Rođendan kao sa VHS kasete", "A birthday like from a VHS tape"), steps: [L("Okači video.", "Upload the video."), L("Izaberi VHS ili stari televizor.", "Pick VHS or old TV."), L("Izvezi MP4 - 0 kredita.", "Export MP4 - 0 credits.")] },
  { id: "montaza-vlog", target: "video.montaza", title: L("Vlog od tri klipa i muzike", "A vlog from three clips and music"), steps: [L("Prevuci klipove na traku.", "Drag the clips onto the timeline."), L("Dodaj prelaze, naslov i muziku.", "Add transitions, a title and music."), L("Izvezi MP4 ili GIF.", "Export MP4 or GIF.")] },
  { id: "ritam-leto", target: "video.ritam-sabloni", title: L("Leto u ritmu pesme", "Summer in the rhythm of a song"), steps: [L("Izaberi slike.", "Pick the pictures."), L("Izaberi pesmu.", "Pick a song."), L("Slike se same slože po udarcima.", "The pictures line up to the beats on their own.")] },
  { id: "izvoz-tiktok", target: "video.izvoz", title: L("Klip spreman za TikTok", "A clip ready for TikTok"), steps: [L("Okači video.", "Upload the video."), L("Izaberi mrežu - sigurne zone se vide.", "Pick the network - safe zones are shown."), L("Provera pre objave kaže šta da popraviš.", "The pre-post check tells you what to fix.")] },
  // ── Alati: Zvuk ──────────────────────────────────────────────────────────
  {
    id: "govor-bajka",
    target: "zvuk.govor",
    title: L("Bajka za laku noć, tiho", "A bedtime story, softly"),
    prompt: L("[šapuće] Bila jednom jedna mala sova koja nije volela mrak. [pauza 1s] Ali jedne noći, mesec joj je rekao tajnu.", "[whispers] Once upon a time there was a little owl who didn't like the dark. [pause 1s] But one night, the moon told her a secret."),
    steps: [L("Nalepnice kao [šapuće] i [pauza 1s] menjaju način govora.", "Tags like [whispers] and [pause 1s] change how it's spoken."), L("Izaberi miran glas i sporiju brzinu.", "Pick a calm voice and a slower speed."), L("Napravi do 4 verzije i zadrži najbolju.", "Make up to 4 versions and keep the best.")],
  },
  { id: "dijalog-skec", target: "zvuk.dijalog", title: L("Kratak skeč za dva glasa", "A short sketch for two voices"), steps: [L("Dodaj dva govornika i glasove.", "Add two speakers and voices."), L("Piši repliku po repliku.", "Write line by line."), L("Izmeniš jednu repliku - plaćaš samo nju.", "Change one line - you pay only for that one.")] },
  {
    id: "podkast-lekcija",
    target: "zvuk.podkast",
    title: L("Lekcija postaje razgovor dva voditelja", "A lesson becomes a two-host conversation"),
    prompt: L("Veštačka inteligencija uči iz primera. Kad joj pokažemo hiljade slika mačaka, ona nauči šta mačku čini mačkom - uši, brkove, oblik tela.", "Artificial intelligence learns from examples. When we show it thousands of cat pictures, it learns what makes a cat a cat - ears, whiskers, body shape."),
    steps: [L("Nalepi tekst lekcije.", "Paste the lesson text."), L("Crea besplatno napiše razgovor.", "Crea writes the conversation for free."), L("Izgovori ga i spoji na uređaju.", "Voice it and join it on your device.")],
  },
  { id: "glasovi-topao", target: "zvuk.glasovi", title: L("Topao muški glas za reklamu", "A warm male voice for an ad"), steps: [L("Filtriraj po polu, godinama i tonu.", "Filter by gender, age and tone."), L("Preslušaj besplatno.", "Listen for free."), L("Sačuvaj omiljene.", "Save your favourites.")] },
  { id: "dizajn-glas-narator", target: "zvuk.dizajn", title: L("Glas starog pripovedača", "The voice of an old storyteller"), steps: [L("Opiši glas: „dubok, spor, topao, malo promukao\".", "Describe the voice: \"deep, slow, warm, a little hoarse\"."), L("Crea predloži 3 glasa.", "Crea suggests 3 voices."), L("Sačuvaj onaj koji ti se dopadne.", "Save the one you like.")] },
  { id: "kloniraj-svoj", target: "zvuk.kloniraj", title: L("Tvoj glas za tvoje snimke", "Your voice for your recordings"), steps: [L("Snimi se uz merač i proveru buke.", "Record yourself with the meter and noise check."), L("Izgovori rečenicu pristanka.", "Say the consent sentence."), L("Samo tvoj glas - Crea to proveri.", "Only your voice - Crea checks it.")] },
  { id: "promena-intervju", target: "zvuk.promena", title: L("Anoniman glas u intervjuu", "An anonymous voice in an interview"), steps: [L("Okači snimak intervjua.", "Upload the interview recording."), L("Sagovorniku daj drugi glas.", "Give the interviewee a different voice."), L("Tvoj glas i muzika ostaju.", "Your voice and the music stay.")] },
  { id: "prevod-recept", target: "zvuk.prevod", title: L("Video recept na nemačkom", "A recipe video in German"), steps: [L("Okači video.", "Upload the video."), L("Ispravi tekst i prevod pre izgovora.", "Fix the text and translation before voicing."), L("Po želji usne i titlovi (SRT besplatno).", "Optionally lips and subtitles (SRT free).")] },
  { id: "muzika-pesma", target: "zvuk.muzika", title: L("Pesma za rođendan sa refrenom", "A birthday song with a chorus"), steps: [L("Dodaj delove: uvod, strofa, refren.", "Add parts: intro, verse, chorus."), L("Svakom delu upiši tekst.", "Write the lyrics for each part."), L("Cena za celu pesmu piše na dugmetu.", "The price for the whole song is on the button.")] },
  { id: "ozvuci-putovanje", target: "zvuk.ozvuci", title: L("Muzika za video sa putovanja", "Music for a travel video"), steps: [L("Okači video.", "Upload the video."), L("Crea predloži muziku i napravi 4 numere.", "Crea suggests music and makes 4 tracks."), L("Muzika se sama utiša ispod govora.", "The music ducks under speech on its own.")] },
  {
    id: "efekti-grmljavina",
    target: "zvuk.efekti",
    title: L("Grmljavina u daljini", "Thunder in the distance"),
    prompt: L("grmljavina u daljini, tiha kiša po prozoru, kasno veče", "thunder in the distance, soft rain on a window, late evening"),
    steps: [L("Prvo potraži u besplatnoj CC0 biblioteci.", "First search the free CC0 library."), L("Nema ga? Opiši zvuk.", "Not there? Describe the sound."), L("Izaberi jeftino ili najbolji kvalitet.", "Pick cheap or best quality.")],
  },
  { id: "trake-karaoke", target: "zvuk.trake", title: L("Karaoke verzija omiljene pesme", "A karaoke version of a favourite song"), steps: [L("Okači pesmu.", "Upload the song."), L("Dobiješ glas, bubanj, bas i ostalo.", "You get vocals, drums, bass and the rest."), L("Verzija bez glasa se spaja besplatno.", "The version without vocals is mixed for free.")] },
  { id: "snimac-najava", target: "zvuk.snimac", title: L("Snimi najavu za video", "Record an intro for a video"), steps: [L("Dozvoli mikrofon.", "Allow the microphone."), L("Prati merač: „dobro\" je zeleno polje.", "Watch the meter: \"good\" is the sweet spot."), L("Snimi par puta i izaberi najbolji.", "Record a few takes and pick the best.")] },
  { id: "uredjivac-podkast", target: "zvuk.uredjivac", title: L("Podkast bez dugih pauza, glasan kao ostali", "A podcast without long pauses, as loud as others"), steps: [L("Okači snimak.", "Upload the recording."), L("„Skrati pauze\", pa EQ „Jasniji glas\".", "\"Shorten pauses\", then EQ \"Clearer voice\"."), L("Glasnoća „Za mreže\" i izvoz u MP3.", "Loudness \"For social\" and export to MP3.")] },
  { id: "ciscenje-ulica", target: "zvuk.ciscenje", title: L("Glas snimljen na ulici, bez buke", "A voice recorded outside, without the noise"), steps: [L("Okači snimak.", "Upload the recording."), L("Izaberi „brzo\" ili „jače\".", "Pick \"fast\" or \"stronger\"."), L("Uporedi pre i posle.", "Compare before and after.")] },
  { id: "transkript-isecanje", target: "zvuk.transkript", title: L("Izbaci „ovaj\" i „znači\" iz snimka", "Cut the filler words out of a recording"), steps: [L("Zapiši snimak u tekst.", "Transcribe the recording."), L("Obriši reči u tekstu.", "Delete words in the text."), L("„Iseci snimak\" ih izbaci i iz zvuka.", "\"Cut the recording\" removes them from the audio too.")] },
  { id: "ritam-montaza", target: "zvuk.ritam", title: L("Tempo pesme za montažu", "A song's tempo for editing"), steps: [L("Okači pesmu.", "Upload the song."), L("Dobiješ BPM, tonalitet i markere udaraca.", "You get the BPM, key and beat markers."), L("Preuzmi markere za montažu.", "Download the markers for editing.")] },
  { id: "audiogram-epizoda", target: "zvuk.audiogram", title: L("Isečak epizode za Instagram", "An episode snippet for Instagram"), steps: [L("Okači zvuk i sliku.", "Upload the sound and a picture."), L("Izaberi deo na talasu i format.", "Pick a part on the wave and a shape."), L("Dodaj titlove i izvezi MP4.", "Add subtitles and export MP4.")] },
];

export function inspirationsFor(target: string): CreaInspiration[] {
  return CREA_INSPIRATIONS.filter((example) => example.target === target);
}

export function inspirationById(id: string | null | undefined): CreaInspiration | undefined {
  return id ? CREA_INSPIRATIONS.find((example) => example.id === id) : undefined;
}

/** `slika:napravi` → `{ area, mode }`; id alata → `null`. */
export function modeTarget(target: string): { area: CreaArea; mode: CreaModeId } | null {
  const [area, mode] = target.split(":");
  return mode ? { area: area as CreaArea, mode: mode as CreaModeId } : null;
}

/**
 * Query za „Napravi ovako". Režim: oblast, režim, model i opis (composer ih čita iz `?model=`
 * i `?opis=`). Alat: oblast, režim, alat i (kad alat to prima) opis. Opis je na jeziku interfejsa.
 */
export function makeLikeThisQuery(example: CreaInspiration, locale: "sr" | "en", current: URLSearchParams): string {
  const mode = modeTarget(example.target);
  if (mode) {
    const query = new URLSearchParams(creaShellQuery({ area: mode.area, mode: mode.mode, tool: null, goal: null, recipe: null, model: example.modelSlug ?? null }, current));
    if (example.prompt) query.set(CREA_PROMPT_PARAM, example.prompt[locale].slice(0, CREA_PROMPT_PARAM_MAX));
    return query.toString();
  }
  const tool = toolById(example.target);
  if (!tool) return current.toString();
  const query = new URLSearchParams(creaShellQuery({ area: tool.area, mode: tool.mode, tool: tool.id, goal: null, recipe: null }, current));
  if (example.prompt && CREA_PROMPT_PREFILL_TOOLS.has(tool.id)) query.set(CREA_PROMPT_PARAM, example.prompt[locale].slice(0, CREA_PROMPT_PARAM_MAX));
  return query.toString();
}
