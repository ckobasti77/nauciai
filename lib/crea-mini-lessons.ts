import type { CreaArea } from "./crea-shell";
import type { LocalizedText } from "./i18n";

/**
 * Mini-lekcije Cree (K26, G6 „Uči i zaradi“ + U10 postepeno otkrivanje).
 *
 * Svaka traje oko 2 minuta: tri kartice pa tri pitanja. Položena lekcija (ili test -
 * ista pitanja bez kartica) otključava svoje alate, donosi XP, a neke i jednu
 * BESPLATNU PROBU baš te tehnike: jedan posao jeftinim modelom za 0 kredita.
 * Otključavanje se nikad ne plaća.
 */

export type CreaMiniLessonQuestion = {
  question: LocalizedText;
  options: readonly [LocalizedText, LocalizedText, LocalizedText];
  correct: 0 | 1 | 2;
  why: LocalizedText;
};

export type CreaFreeTry = {
  /** Modeli na kojima proba važi (najjeftiniji pouzdani u toj oblasti). */
  models: readonly string[];
  /** Proba važi samo dok je cena posla do ovoliko kredita (bez noćne ture i varijacija). */
  maxCredits: number;
  count: number;
  /** Gde se proba koristi - jedna rečenica. */
  where: LocalizedText;
};

export type CreaMiniLesson = {
  id: string;
  area: CreaArea;
  title: LocalizedText;
  summary: LocalizedText;
  cards: readonly [CreaLessonCard, CreaLessonCard, CreaLessonCard];
  quiz: readonly [CreaMiniLessonQuestion, CreaMiniLessonQuestion, CreaMiniLessonQuestion];
  /** Alati koje lekcija otključava (id-jevi iz `lib/crea-tools.ts`). */
  unlocks: readonly string[];
  freeTry?: CreaFreeTry;
  /** Kurs na kojem se tema uči do kraja (`/kursevi/<slug>`); bez slug-a = spisak kurseva. */
  course?: { slug?: string; title: LocalizedText };
};

export type CreaLessonCard = { title: LocalizedText; body: LocalizedText };

const T = (sr: string, en: string): LocalizedText => ({ sr, en });

const VIDEO_COURSE = { slug: "video-audio-ai", title: T("AI video i audio", "AI video and audio") };
const ALL_COURSES = { title: T("Svi kursevi Nauči AI", "All Nauči AI courses") };

export const CREA_MINI_LESSONS: readonly CreaMiniLesson[] = [
  {
    id: "slika-popravi",
    area: "slika",
    title: T("Popravi fotku za dva minuta", "Fix a photo in two minutes"),
    summary: T("Obriši višak, uvećaj, ispravi boje - besplatno, na tvom uređaju.", "Erase clutter, upscale, fix colours - free, on your device."),
    cards: [
      { title: T("Klikni i izaberi", "Click to select"), body: T("Klikneš na predmet i Crea ga sama ocrta. Taj izbor posle možeš da obrišeš, izrežeš ili prefarbaš.", "Click an object and Crea outlines it for you. You can then erase, cut out or recolour that selection.") },
      { title: T("Obriši i uvećaj", "Erase and upscale"), body: T("Mali predmet - kabl, flekicu, prolaznika - brišeš četkicom. Uvećanje 2× pravi oštriju sliku za štampu.", "Small things - a cable, a spot, a passer-by - you erase with a brush. 2× upscaling makes a sharper image for print.") },
      { title: T("Boje i retuš", "Colour and retouch"), body: T("Klizačima podesiš svetlo i toplinu, a blag retuš smiri kožu. Sve radi na tvom telefonu ili računaru, 0 kredita.", "Sliders set light and warmth, and a gentle retouch smooths skin. It all runs on your phone or computer, 0 credits.") },
    ],
    quiz: [
      { question: T("Koliko kredita troše ovi alati?", "How many credits do these tools use?"), options: [T("0 - rade na tvom uređaju", "0 - they run on your device"), T("1 po kliku", "1 per click"), T("Zavisi od veličine slike", "It depends on the image size")], correct: 0, why: T("Rade u browseru, bez plaćenog AI-a.", "They run in the browser, with no paid AI.") },
      { question: T("Kako najbrže izabereš jedan predmet na slici?", "What is the fastest way to select one object?"), options: [T("Opišeš ga rečima", "Describe it in words"), T("Klikneš na njega", "Click on it"), T("Iseci celu sliku", "Crop the whole image")], correct: 1, why: T("„Klikni i izaberi“ sam ocrta predmet.", "“Click to select” outlines the object for you.") },
      { question: T("Šta radi uvećanje 2×?", "What does 2× upscaling do?"), options: [T("Dodaje nove predmete", "Adds new objects"), T("Menja stil slike", "Changes the image style"), T("Pravi veću, oštriju sliku", "Makes a bigger, sharper image")], correct: 2, why: T("Ista slika, više piksela - lepše za štampu.", "Same image, more pixels - nicer for print.") },
    ],
    unlocks: ["slika.klik", "slika.obrisi", "slika.uvecaj", "slika.tekst", "slika.boje", "slika.retus", "slika.pametni-isecak"],
    course: ALL_COURSES,
  },
  {
    id: "slika-format",
    area: "slika",
    title: T("Format, QR i GIF", "Format, QR and GIF"),
    summary: T("Pripremi sliku za mrežu, štampu ili poruku - besplatno.", "Get an image ready for social, print or a message - free."),
    cards: [
      { title: T("Pravi format", "The right format"), body: T("WebP je mali i oštar za sajt, JPG za fotke, PNG kad treba providna pozadina. Crea uz to obriše skrivene podatke, i lokaciju.", "WebP is small and sharp for the web, JPG for photos, PNG when you need a transparent background. Crea also removes hidden data, including location.") },
      { title: T("QR, GIF, vektor", "QR, GIF, vector"), body: T("QR kod vodi na tvoj link, GIF spaja slike u kratku animaciju, a vektor pretvara logo u SVG koji se ne mrvi.", "A QR code points to your link, a GIF joins images into a short animation, and a vector turns a logo into an SVG that never pixelates.") },
      { title: T("Proveri pre plaćanja", "Check before you pay"), body: T("„Proveri fotku“ kaže da li je lice vidljivo i oštro pre nego što potrošiš kredite na AI.", "“Check photo” tells you whether the face is visible and sharp before you spend credits on AI.") },
    ],
    quiz: [
      { question: T("Koji format čuva providnu pozadinu?", "Which format keeps a transparent background?"), options: [T("JPG", "JPG"), T("PNG", "PNG"), T("Nijedan", "None")], correct: 1, why: T("JPG nema providnost, PNG (i WebP) ima.", "JPG has no transparency, PNG (and WebP) does.") },
      { question: T("Šta Crea briše kad promeniš format?", "What does Crea remove when you change the format?"), options: [T("Skrivene podatke, i lokaciju", "Hidden data, including location"), T("Boje", "Colours"), T("Ništa", "Nothing")], correct: 0, why: T("Nova slika nema EXIF ni GPS.", "The new image has no EXIF or GPS.") },
      { question: T("Zašto je logo bolji kao vektor (SVG)?", "Why is a logo better as a vector (SVG)?"), options: [T("Šareniji je", "It is more colourful"), T("Manje košta", "It costs less"), T("Oštar je u svakoj veličini", "It is sharp at any size")], correct: 2, why: T("Vektor su linije, ne pikseli.", "A vector is lines, not pixels.") },
    ],
    unlocks: ["slika.format", "slika.paleta", "slika.qr", "slika.vektor", "slika.gif", "slika.sabloni", "slika.provera", "slika.ocr", "slika.3d-foto", "slika.opis", "slika.tabla"],
    course: ALL_COURSES,
  },
  {
    id: "slika-ai",
    area: "slika",
    title: T("Izmeni sliku rečima", "Edit an image with words"),
    summary: T("Ofarbaj deo, napiši šta tu ide - AI uradi ostalo.", "Paint over a part, write what goes there - AI does the rest."),
    cards: [
      { title: T("Četkica + opis", "Brush + prompt"), body: T("Ofarbaš deo slike i napišeš „crvena jakna“ ili „more u pozadini“. AI menja samo ofarbano.", "Paint over part of the image and write “a red jacket” or “the sea in the background”. AI changes only what you painted.") },
      { title: T("Proširi i novo svetlo", "Extend and relight"), body: T("Proširi dodaje kadar sa strane (za Instagram ili YouTube), a Novo svetlo pomera sunce oko lika.", "Extend adds frame at the sides (for Instagram or YouTube), and Relight moves the sun around the subject.") },
      { title: T("Piši konkretno", "Write concretely"), body: T("Bolje „bela šolja na drvenom stolu“ nego „lepša slika“. Jedna izmena po poslu daje najbolji rezultat.", "“A white mug on a wooden table” beats “a nicer image”. One change per job gives the best result.") },
    ],
    quiz: [
      { question: T("Šta AI menja kad koristiš četkicu?", "What does AI change when you use the brush?"), options: [T("Celu sliku", "The whole image"), T("Samo ofarbani deo", "Only the painted part"), T("Samo boje", "Only the colours")], correct: 1, why: T("Maska kaže AI-u gde sme da menja.", "The mask tells the AI where it may change.") },
      { question: T("Koji opis daje bolji rezultat?", "Which prompt gives a better result?"), options: [T("„Bela šolja na drvenom stolu“", "“A white mug on a wooden table”"), T("„Lepša slika“", "“A nicer image”"), T("„Uradi nešto“", "“Do something”")], correct: 0, why: T("Konkretne reči = predvidljiv rezultat.", "Concrete words = a predictable result.") },
      { question: T("Čemu služi Proširi?", "What is Extend for?"), options: [T("Briše pozadinu", "It removes the background"), T("Dodaje kadar sa strane", "It adds frame at the sides"), T("Pravi video", "It makes a video")], correct: 1, why: T("Slika dobije novi format bez sečenja lika.", "The image gets a new format without cutting the subject.") },
    ],
    unlocks: ["slika.cetkica", "slika.prosiri", "slika.svetlo", "slika.uglovi", "slika.slojevi", "slika.odeca", "slika.zameni-lik"],
    freeTry: { models: ["nano-banana-2-lite"], maxCredits: 10, count: 1, where: T("Slika → Izmeni, model Nano Banana 2 Lite.", "Image → Edit, the Nano Banana 2 Lite model.") },
    course: ALL_COURSES,
  },
  {
    id: "slika-likovi",
    area: "slika",
    title: T("Tvoj lik i tvoj brend", "Your character and your brand"),
    summary: T("Sačuvaj lik jednom, koristi ga svuda - i logo, nalepnice, boje brenda.", "Save a character once, use it everywhere - plus logo, stickers, brand colours."),
    cards: [
      { title: T("@Lik", "@Character"), body: T("Lik je tvoja sačuvana osoba, ljubimac ili predmet. U opisu napišeš @ime i Crea ga ubaci u novu sliku ili video.", "A character is your saved person, pet or object. Write @name in a prompt and Crea puts it into a new image or video.") },
      { title: T("Ko · Gde · Kako", "Who · Where · How"), body: T("Tri slike - lik, mesto i stil - i opis se sam sklopi. Ne moraš da znaš engleske izraze.", "Three images - character, place and style - and the prompt builds itself. No English jargon needed.") },
      { title: T("Brend kit", "Brand kit"), body: T("Logo, boje i fontove sačuvaš jednom, a recepti ih sami koriste: plakat, objava, vizitkarta.", "Save your logo, colours and fonts once, and recipes use them on their own: poster, post, business card.") },
    ],
    quiz: [
      { question: T("Kako pozoveš sačuvan lik u opisu?", "How do you call a saved character in a prompt?"), options: [T("#ime", "#name"), T("@ime", "@name"), T("Ne može", "You can't")], correct: 1, why: T("@ime ubaci lik u rad.", "@name puts the character into the work.") },
      { question: T("Šta ide u „Ko · Gde · Kako“?", "What goes into “Who · Where · How”?"), options: [T("Tri slike", "Three images"), T("Tri pesme", "Three songs"), T("Tri videa", "Three videos")], correct: 0, why: T("Lik, mesto i stil kao slike.", "Character, place and style as images.") },
      { question: T("Šta brend kit radi za tebe?", "What does a brand kit do for you?"), options: [T("Plaća kredite", "Pays for credits"), T("Briše pozadinu", "Removes backgrounds"), T("Ubacuje tvoj logo i boje u recepte", "Puts your logo and colours into recipes")], correct: 2, why: T("Jednom sačuvaš, svuda koristiš.", "Save once, use everywhere.") },
    ],
    unlocks: ["slika.likovi", "slika.kreator-lika", "slika.ko-gde-kako", "slika.nalepnice", "slika.logo", "slika.brend-kit", "slika.3d-model"],
    course: ALL_COURSES,
  },
  {
    id: "slika-stil",
    area: "slika",
    title: T("Stil, svetlo i kadar", "Style, light and framing"),
    summary: T("Isti opis, drugi stil - od analognog filma do stripa.", "Same prompt, a different style - from analog film to comics."),
    cards: [
      { title: T("Stil menja sve", "Style changes everything"), body: T("„Analogni film“, „Akvarel“, „3D glina“ - stil se doda tvom opisu, a ti pišeš samo šta je na slici.", "“Analog film”, “Watercolour”, “3D clay” - the style is added to your prompt, and you only write what is in the picture.") },
      { title: T("Probni list", "Contact sheet"), body: T("Za cenu jedne slike dobiješ više brzih skica, izabereš najbolju i tek nju usavršiš.", "For the price of one image you get several quick sketches, pick the best one and refine only that.") },
      { title: T("Crtaj i gledaj", "Draw and watch"), body: T("Nacrtaš grubo, a slika se osvežava dok crtaš. Skica iz sveske može da postane prava fotka.", "Draw roughly and the image refreshes as you draw. A notebook sketch can become a real photo.") },
    ],
    quiz: [
      { question: T("Gde biraš stil slike?", "Where do you pick an image style?"), options: [T("Slika → Napravi → Izgled", "Image → Create → Look"), T("U kreditima", "In credits"), T("Ne bira se", "You don't")], correct: 0, why: T("Izgled dodaje stil opisu.", "Look adds the style to the prompt.") },
      { question: T("Zašto je probni list jeftiniji put?", "Why is a contact sheet the cheaper path?"), options: [T("Slike su crno-bele", "The images are black and white"), T("Više skica za cenu jedne slike", "Several sketches for the price of one image"), T("Besplatan je uvek", "It is always free")], correct: 1, why: T("Usavršiš samo ono što ti se dopadne.", "You refine only what you like.") },
      { question: T("Šta pišeš u opis kad si izabrao stil?", "What do you write once you pick a style?"), options: [T("Ime stila", "The style name"), T("Ništa", "Nothing"), T("Šta je na slici", "What is in the picture")], correct: 2, why: T("Stil Crea doda sama.", "Crea adds the style itself.") },
    ],
    unlocks: ["slika.probni-list", "slika.crtaj", "slika.skica", "slika.pomocnik"],
    freeTry: { models: ["z-image-turbo", "nano-banana-2-lite"], maxCredits: 10, count: 1, where: T("Slika → Napravi, model Z-Image Turbo ili Nano Banana 2 Lite.", "Image → Create, the Z-Image Turbo or Nano Banana 2 Lite model.") },
    course: ALL_COURSES,
  },
  {
    id: "video-kamera",
    area: "video",
    title: T("Pokreti kamere", "Camera moves"),
    summary: T("Približavanje, dron, kruženje - kamera priča priču.", "Push-in, drone, orbit - the camera tells the story."),
    cards: [
      { title: T("Približi se", "Push in"), body: T("Približavanje vodi pogled ka licu ili predmetu - za emociju. Udaljavanje otkriva gde smo - za kraj priče.", "A push-in leads the eye to a face or object - for emotion. A pull-out reveals where we are - for the end of a story.") },
      { title: T("Dron i kruženje", "Drone and orbit"), body: T("Dron leti iznad grada ili prirode, kruženje obilazi lik. Izaberi pokret u Režiji i gledaj skicu kako ide.", "A drone flies over a city or nature, an orbit circles the subject. Pick a move in Direction and watch its sketch.") },
      { title: T("Jedan pokret po kadru", "One move per shot"), body: T("Jedan jasan pokret izgleda filmski. Prvo probaj jeftinim modelom na 480p, pa tek onda veća rezolucija.", "One clear move looks cinematic. Try it first with a cheap model at 480p, and only then a higher resolution.") },
    ],
    quiz: [
      { question: T("Koji pokret pojačava emociju na licu?", "Which move strengthens emotion on a face?"), options: [T("Približavanje", "Push-in"), T("Udaljavanje", "Pull-out"), T("Statično", "Static")], correct: 0, why: T("Kamera vodi pogled ka licu.", "The camera leads the eye to the face.") },
      { question: T("Koliko pokreta je najbolje u jednom kadru?", "How many moves work best in one shot?"), options: [T("Što više", "As many as possible"), T("Jedan jasan", "One clear one"), T("Nijedan", "None")], correct: 1, why: T("Više pokreta zbuni model i gledaoca.", "Several moves confuse the model and the viewer.") },
      { question: T("Kako jeftino probaš ideju?", "How do you test an idea cheaply?"), options: [T("Odmah 1080p", "Straight to 1080p"), T("Noćna tura u podne", "A night run at noon"), T("Jeftin model na 480p", "A cheap model at 480p")], correct: 2, why: T("Proba pa usavrši.", "Test, then refine.") },
    ],
    unlocks: ["video.poslednji-kadar", "video.vise-scena", "video.crtaj-pokret"],
    freeTry: { models: ["grok-video-15-lite"], maxCredits: 30, count: 1, where: T("Video → Napravi, model Grok Imagine Video Lite (480p, do 6 s).", "Video → Create, the Grok Imagine Video Lite model (480p, up to 6 s).") },
    course: VIDEO_COURSE,
  },
  {
    id: "video-dorada",
    area: "video",
    title: T("Doradi video", "Polish a video"),
    summary: T("Format za TikTok, boje, usporeno, retro - većinom besplatno.", "TikTok format, colour, slow motion, retro - mostly free."),
    cards: [
      { title: T("9:16 bez sečenja lica", "9:16 without cutting faces"), body: T("Reframe pretvori širok video u uspravan za TikTok i Reels, a lice ostaje u kadru.", "Reframe turns a wide video into a vertical one for TikTok and Reels, and the face stays in frame.") },
      { title: T("Boje, usporeno, retro", "Colour, slow-mo, retro"), body: T("Filmski izgled, usporeni snimak i VHS ili Nokia efekat rade na tvom uređaju, za 0 kredita.", "A film look, slow motion and a VHS or Nokia effect run on your device, for 0 credits.") },
      { title: T("Izmeni rečima", "Edit with words"), body: T("„Dodaj kišu“, „skloni auto“ - AI menja snimak po opisu. To troši kredite, pa piši kratko i jasno.", "“Add rain”, “remove the car” - AI changes the clip to match. That uses credits, so keep it short and clear.") },
    ],
    quiz: [
      { question: T("Šta radi Reframe?", "What does Reframe do?"), options: [T("Menja format, lice ostaje u kadru", "Changes the format, the face stays in frame"), T("Dodaje muziku", "Adds music"), T("Briše zvuk", "Removes sound")], correct: 0, why: T("Prati lice dok seče kadar.", "It follows the face while cropping.") },
      { question: T("Koliko košta retro efekat?", "How much does a retro effect cost?"), options: [T("10 kredita", "10 credits"), T("0 - radi na tvom uređaju", "0 - it runs on your device"), T("Zavisi od dužine", "It depends on length")], correct: 1, why: T("Shader na tvom uređaju, bez AI-a.", "A shader on your device, no AI.") },
      { question: T("Kako pišeš izmenu rečima?", "How do you write an edit with words?"), options: [T("Što duže", "As long as possible"), T("Na engleskom obavezno", "In English only"), T("Kratko i jasno, jedna izmena", "Short and clear, one change")], correct: 2, why: T("Jedna jasna izmena = manje promašaja.", "One clear change = fewer misses.") },
    ],
    unlocks: ["video.reframe", "video.pozadina", "video.boje", "video.slowmo", "video.bez-treperenja", "video.retro", "video.produzi", "video.izmeni-recima", "video.zameni", "video.uvecaj", "video.svetlo"],
    course: VIDEO_COURSE,
  },
  {
    id: "video-prica",
    area: "video",
    title: T("Priča, titlovi i montaža", "Story, subtitles and montage"),
    summary: T("Strip → film, titlovi na srpskom, kratki klipovi iz dugog videa.", "Comic → film, Serbian subtitles, short clips from a long video."),
    cards: [
      { title: T("Strip → film", "Comic → film"), body: T("Napišeš priču, Crea je podeli na kadrove kao strip, napravi sliku po kadru i oživi ih u jedan film.", "Write a story, Crea splits it into shots like a comic, makes an image per shot and animates them into one film.") },
      { title: T("Titlovi i kratki klipovi", "Subtitles and short clips"), body: T("Titlovi na latinici ili ćirilici u karaoke stilu, a iz dugog videa Crea izdvoji najbolje momente u 9:16.", "Subtitles in Latin or Cyrillic in karaoke style, and from a long video Crea picks the best moments in 9:16.") },
      { title: T("Ritam i izvoz", "Rhythm and export"), body: T("Šablon „ubaci i gotovo“ seče slike po ritmu pesme, a izvoz pazi na sigurne zone mreža.", "The “drop in and done” template cuts images to the beat, and export respects each network's safe zones.") },
    ],
    quiz: [
      { question: T("Šta Crea radi od priče u „Strip → film“?", "What does Crea do with a story in “Comic → film”?"), options: [T("Deli je na kadrove", "Splits it into shots"), T("Prevodi je", "Translates it"), T("Briše je", "Deletes it")], correct: 0, why: T("Kadar po kadar, kao strip.", "Shot by shot, like a comic.") },
      { question: T("Na kom pismu mogu titlovi?", "Which script can subtitles use?"), options: [T("Samo latinica", "Latin only"), T("Latinica ili ćirilica", "Latin or Cyrillic"), T("Samo engleski", "English only")], correct: 1, why: T("Oba pisma, i karaoke stil.", "Both scripts, plus karaoke style.") },
      { question: T("Šta prati izvoz za mreže?", "What does export for social respect?"), options: [T("Boju logotipa", "The logo colour"), T("Broj lajkova", "The number of likes"), T("Sigurne zone", "Safe zones")], correct: 2, why: T("Tekst ne sme ispod dugmadi aplikacije.", "Text must not sit under the app's buttons.") },
    ],
    unlocks: ["video.strip", "video.objasnjenje", "video.reklama", "video.ritam-sabloni", "video.izvoz", "video.titlovi", "video.shorts", "video.odglumi", "video.lik-govori"],
    course: VIDEO_COURSE,
  },
  {
    id: "zvuk-glas",
    area: "zvuk",
    title: T("Glas na srpskom", "A voice in Serbian"),
    summary: T("Izaberi glas, dodaj emociju, napravi dijalog ili podkast.", "Pick a voice, add emotion, make a dialogue or a podcast."),
    cards: [
      { title: T("Glas i emocija", "Voice and emotion"), body: T("Izabereš glas iz biblioteke, a nalepnice [šapuće] ili [smeje se] ubaciš u tekst - glas ih odglumi.", "Pick a voice from the library, and drop tags like [whispers] or [laughs] into the text - the voice acts them.") },
      { title: T("Dijalog i podkast", "Dialogue and podcast"), body: T("Do deset govornika u jednom snimku. Kad promeniš jednu liniju, plaćaš samo nju.", "Up to ten speakers in one recording. When you change one line, you pay only for that line.") },
      { title: T("Samo tvoj glas", "Only your own voice"), body: T("Kloniraš samo SVOJ glas, uz izgovorenu rečenicu pristanka. Tuđi glas se ne klonira.", "You clone only YOUR voice, with a spoken consent sentence. Someone else's voice is never cloned.") },
    ],
    quiz: [
      { question: T("Kako dodaš smeh u govor?", "How do you add a laugh to speech?"), options: [T("Nalepnica [smeje se] u tekstu", "A [laughs] tag in the text"), T("Veliko slovo", "A capital letter"), T("Ne može", "You can't")], correct: 0, why: T("Nalepnice glas odglumi.", "The voice acts out the tags.") },
      { question: T("Šta plaćaš kad promeniš jednu liniju dijaloga?", "What do you pay when you change one dialogue line?"), options: [T("Ceo dijalog ponovo", "The whole dialogue again"), T("Samo tu liniju", "Only that line"), T("Ništa nikad", "Never anything")], correct: 1, why: T("Ostale linije ostaju.", "The other lines stay.") },
      { question: T("Čiji glas smeš da kloniraš?", "Whose voice may you clone?"), options: [T("Bilo čiji", "Anyone's"), T("Poznate osobe", "A celebrity's"), T("Samo svoj, uz pristanak", "Only your own, with consent")], correct: 2, why: T("Pristanak se izgovori i proveri.", "Consent is spoken and checked.") },
    ],
    unlocks: ["zvuk.dijalog", "zvuk.podkast", "zvuk.glasovi", "zvuk.dizajn", "zvuk.kloniraj", "zvuk.promena", "zvuk.prevod"],
    freeTry: { models: ["gemini-tts"], maxCredits: 10, count: 1, where: T("Zvuk → Govor, model Gemini govor.", "Sound → Speech, the Gemini speech model.") },
    course: VIDEO_COURSE,
  },
  {
    id: "zvuk-muzika",
    area: "zvuk",
    title: T("Muzika, efekti i uređivač", "Music, effects and the editor"),
    summary: T("Pesma po delovima, zvučni efekti, čišćenje i jačina za objavu.", "A song in parts, sound effects, cleanup and loudness for publishing."),
    cards: [
      { title: T("Muzika po delovima", "Music in parts"), body: T("Opišeš raspoloženje i žanr, a pesmu slažeš po delovima - uvod, refren, kraj. Može i bez vokala.", "Describe the mood and genre, and build the song in parts - intro, chorus, ending. It can be instrumental too.") },
      { title: T("Efekti i ozvučavanje", "Effects and scoring"), body: T("Zvučni efekat napraviš opisom, a „Ozvuči moj video“ predloži muziku koja se utiša ispod govora.", "Make a sound effect from a description, and “Score my video” suggests music that ducks under speech.") },
      { title: T("Uredi i očisti", "Edit and clean"), body: T("U uređivaču sečeš, spajaš i čistiš šum na svom uređaju, a −14 LUFS je prava jačina za mreže.", "In the editor you cut, join and remove noise on your device, and −14 LUFS is the right loudness for social.") },
    ],
    quiz: [
      { question: T("Kako slažeš pesmu u Crei?", "How do you build a song in Crea?"), options: [T("Po delovima: uvod, refren, kraj", "In parts: intro, chorus, ending"), T("Samo jednim dugmetom", "With one button only"), T("Ne može", "You can't")], correct: 0, why: T("Delovi = kontrola nad pesmom.", "Parts = control over the song.") },
      { question: T("Šta radi „Ozvuči moj video“?", "What does “Score my video” do?"), options: [T("Briše zvuk", "Removes sound"), T("Predloži muziku koja se utiša ispod govora", "Suggests music that ducks under speech"), T("Pravi titlove", "Makes subtitles")], correct: 1, why: T("Muzika ne gazi glas.", "The music doesn't drown the voice.") },
      { question: T("Koja je dobra jačina za mreže?", "What is a good loudness for social?"), options: [T("Što glasnije", "As loud as possible"), T("−40 LUFS", "−40 LUFS"), T("−14 LUFS", "−14 LUFS")], correct: 2, why: T("Mreže svode zvuk na oko −14.", "Platforms normalise sound to about −14.") },
    ],
    unlocks: ["zvuk.muzika", "zvuk.ozvuci", "zvuk.efekti", "zvuk.trake", "zvuk.uredjivac", "zvuk.transkript", "zvuk.ritam", "zvuk.audiogram", "zvuk.ciscenje"],
    course: VIDEO_COURSE,
  },
];

export function miniLessonById(id: string | null | undefined): CreaMiniLesson | undefined {
  if (!id) return undefined;
  return CREA_MINI_LESSONS.find((lesson) => lesson.id === id);
}

/** Položena ako su SVI odgovori tačni (redom pitanja). */
export function quizPassed(lesson: CreaMiniLesson, answers: readonly number[]): boolean {
  return answers.length === lesson.quiz.length && lesson.quiz.every((q, i) => answers[i] === q.correct);
}

/** Proba važi za ovaj posao: model sa spiska, cena do granice, bez noćne ture. */
export function freeTryFits(freeTry: CreaFreeTry, job: { modelSlug: string; creditCost: number; night: boolean }): boolean {
  return !job.night && freeTry.models.includes(job.modelSlug) && job.creditCost > 0 && job.creditCost <= freeTry.maxCredits;
}
