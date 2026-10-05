import type { LocalizedText } from "./i18n";

/**
 * Tekstovi za Video · Napravi i Izmeni (Crea K18): režija u composeru (pokret
 * kamere, efekti, pult), poslednji kadar (V4) i alati „Više scena", „Crtaj
 * pokret" i „Produži klip". Uvoze ih composer (samo kratki deo) i alati.
 */

type T = LocalizedText;

export const CREA_VIDEO_COPY = {
  // ── Režija u composeru ────────────────────────────────────────────────────
  direction: { sr: "Režija", en: "Direction" } as T,
  directionTitle: {
    sr: "Pokret kamere, efekti i režiserski pult - dodaju se opisu tek pri slanju.",
    en: "Camera moves, effects and the director's desk - added to the description only when you send it.",
  } as T,
  tabs: {
    pokret: { sr: "Pokret kamere", en: "Camera move" } as T,
    efekti: { sr: "Efekti", en: "Effects" } as T,
    pult: { sr: "Režiserski pult", en: "Director's desk" } as T,
  },
  done: { sr: "Gotovo", en: "Done" } as T,
  addMove: { sr: "Pokret", en: "Move" } as T,
  addSound: { sr: "Zvuk", en: "Sound" } as T,
  allGroups: { sr: "Sve", en: "All" } as T,
  noMove: { sr: "Bez pokreta", en: "No move" } as T,
  intensity: { sr: "Jačina pokreta", en: "Move strength" } as T,
  intensities: { blago: { sr: "Blago", en: "Gentle" } as T, jako: { sr: "Jako", en: "Strong" } as T },
  lesson: { sr: "Mini-lekcija", en: "Mini lesson" } as T,
  pickedMove: { sr: "Kamera: {move}", en: "Camera: {move}" } as T,
  removeChip: { sr: "Ukloni: {what}", en: "Remove: {what}" } as T,
  // Efekti
  effectNeedsPhoto: {
    sr: "Ovaj efekat oživljava TVOJU fotku - dodaj je dugmetom + ili je prevuci bilo gde.",
    en: "This effect brings YOUR photo to life - add it with the + button or drop it anywhere.",
  } as T,
  effectModel: { sr: "Efekat ide uz model {model} - najjeftiniji koji ga dobro radi.", en: "The effect uses {model} - the cheapest model that does it well." } as T,
  effectNoModel: {
    sr: "Nijedan model koji radi ovaj efekat trenutno nije dostupan.",
    en: "No model that does this effect is available right now.",
  } as T,
  combine: { sr: "Spoji dva efekta", en: "Combine two effects" } as T,
  combineHint: {
    sr: "Izaberi i drugi efekat - u jednom klipu prvi prelazi u drugi.",
    en: "Pick a second effect too - in one clip the first turns into the second.",
  } as T,
  combineProblems: {
    "isti-efekat": { sr: "Izaberi neki drugi efekat.", en: "Pick a different effect." } as T,
    "ne-spaja-se": { sr: "Ovaj efekat je ceo klip za sebe i ne spaja se sa drugim.", en: "This effect is a whole clip on its own and does not combine." } as T,
    "razlicit-ulaz": {
      sr: "Ovi efekti traže različit početak (fotka / samo opis), pa ne idu zajedno.",
      en: "These effects need different starts (a photo / just a description), so they do not go together.",
    } as T,
  },
  // Pult
  presets: { sr: "Kartice sa primerima", en: "Example cards" } as T,
  presetsHint: { sr: "Klikni karticu da probaš gotovu režiju, pa menjaj jednu po jednu stvar.", en: "Click a card to try a ready setup, then change one thing at a time." } as T,
  presetUse: { sr: "Probaj", en: "Try it" } as T,
  genre: { sr: "Žanr", en: "Genre" } as T,
  era: { sr: "Era", en: "Era" } as T,
  tempo: { sr: "Tempo", en: "Pace" } as T,
  lens: { sr: "Objektiv", en: "Lens" } as T,
  focal: { sr: "Žižna daljina", en: "Focal length" } as T,
  aperture: { sr: "Blenda", en: "Aperture" } as T,
  light: { sr: "Svetlo", en: "Light" } as T,
  palette: { sr: "Paleta", en: "Palette" } as T,
  emotion: { sr: "Emocija lika", en: "Character's emotion" } as T,
  sound: { sr: "Zvuk (ambijent)", en: "Sound (ambience)" } as T,
  soundNoAudio: { sr: "Ovaj model pravi video bez zvuka, pa se zvuk ne šalje.", en: "This model makes video without sound, so the sound is not sent." } as T,
  none: { sr: "Bez", en: "None" } as T,
  clearDesk: { sr: "Očisti pult", en: "Clear the desk" } as T,
  deskSummary: { sr: "Pult: {n}", en: "Desk: {n}" } as T,

  // ── Poslednji kadar (V4) ──────────────────────────────────────────────────
  lastFrame: { sr: "Poslednji kadar iz videa", en: "Last frame of a video" } as T,
  lastFrameTitle: {
    sr: "Uzmi poslednji kadar nekog videa - postaje početak novog klipa. Izvlači se na tvom uređaju, besplatno.",
    en: "Take the last frame of a video - it becomes the start of a new clip. It is pulled on your device, for free.",
  } as T,
  fromGallery: { sr: "Iz tvojih videa", en: "From your videos" } as T,
  fromDevice: { sr: "Video sa uređaja", en: "Video from your device" } as T,
  pickVideo: { sr: "Izaberi video", en: "Pick a video" } as T,
  noVideos: { sr: "Još nemaš nijedan gotov video. Napravi jedan, pa nastavi od njega.", en: "You have no finished video yet. Make one, then continue from it." } as T,
  loadingVideos: { sr: "Učitavam tvoje videe…", en: "Loading your videos…" } as T,
  extracting: { sr: "Izvlačim kadar na tvom uređaju…", en: "Pulling the frame on your device…" } as T,
  frameReady: { sr: "Kadar je prvi kadar novog klipa.", en: "The frame is the first frame of the new clip." } as T,
  frameNoImageMode: {
    sr: "Ovaj model ne prima sliku. Izaberi model koji oživljava sliku (npr. Hailuo ili Veo).",
    en: "This model does not take a picture. Pick a model that animates a picture (e.g. Hailuo or Veo).",
  } as T,
  frameError: {
    sr: "Ovaj video ne može da se otvori u tvom browseru. Probaj u Chrome-u ili sačuvaj video kao MP4.",
    en: "This video cannot be opened in your browser. Try Chrome, or save the video as MP4.",
  } as T,
  continueFrom: { sr: "Nastavak videa", en: "Continues a video" } as T,
  cancel: { sr: "Zatvori", en: "Close" } as T,

  // ── Alat: poslednji kadar ─────────────────────────────────────────────────
  whichFrame: { sr: "Koji kadar", en: "Which frame" } as T,
  lastFrameChoice: { sr: "Poslednji", en: "The last one" } as T,
  pickedFrame: { sr: "Kadar na {s} s", en: "Frame at {s} s" } as T,
  extract: { sr: "Izvuci kadar", en: "Pull the frame" } as T,
  continueHere: { sr: "Nastavi odavde", en: "Continue from here" } as T,
  continueHint: {
    sr: "Sačuvaj kadar u galeriju, pa „Nastavi odavde” - otvara se Video · Napravi sa njim kao prvim kadrom.",
    en: "Save the frame to the gallery, then “Continue from here” - Video · Create opens with it as the first frame.",
  } as T,
  durationOf: { sr: "Video traje {s} s", en: "The video is {s} s long" } as T,

  // ── Alat: više scena ──────────────────────────────────────────────────────
  scene: { sr: "Scena {n}", en: "Scene {n}" } as T,
  sceneText: { sr: "Šta se dešava", en: "What happens" } as T,
  scenePlaceholder: { sr: "npr. Devojka otvara prozor i gleda grad", en: "e.g. A girl opens a window and looks at the city" } as T,
  sceneMove: { sr: "Kamera", en: "Camera" } as T,
  sceneSeconds: { sr: "Sekundi", en: "Seconds" } as T,
  addScene: { sr: "Dodaj scenu", en: "Add a scene" } as T,
  removeScene: { sr: "Ukloni scenu {n}", en: "Remove scene {n}" } as T,
  moveUp: { sr: "Pomeri scenu {n} gore", en: "Move scene {n} up" } as T,
  moveDown: { sr: "Pomeri scenu {n} dole", en: "Move scene {n} down" } as T,
  total: { sr: "Ukupno {s} s (dozvoljeno {min}-{max} s)", en: "Total {s} s (allowed {min}-{max} s)" } as T,
  evenOut: { sr: "Podeli vreme ravnomerno", en: "Split the time evenly" } as T,
  startImage: { sr: "Početna slika (nije obavezna)", en: "Starting picture (optional)" } as T,
  scenesCreate: { sr: "Napravi klip", en: "Make the clip" } as T,
  scenesProblems: {
    "premalo-scena": { sr: "Treba bar dve scene.", en: "You need at least two scenes." } as T,
    "previse-scena": { sr: "Najviše šest scena.", en: "Six scenes at most." } as T,
    "prazna-scena": { sr: "Opiši svaku scenu bar sa par reči.", en: "Describe every scene in at least a few words." } as T,
    "kratka-scena": { sr: "Svaka scena traje bar 1 sekundu.", en: "Each scene lasts at least 1 second." } as T,
    trajanje: { sr: "Ukupno trajanje mora biti između {min} i {max} s.", en: "The total length must be between {min} and {max} s." } as T,
  },
  scenesHow: {
    sr: "Kling 3.0 pravi sve scene u JEDNOM klipu, sa rezovima. Plaćaš ukupno trajanje, isto kao jedan klip.",
    en: "Kling 3.0 makes all scenes in ONE clip, with cuts. You pay for the total length, the same as one clip.",
  } as T,

  // ── Alat: crtaj pokret ────────────────────────────────────────────────────
  drawHow: {
    sr: "Prevuci prstom ili mišem od onoga što se pomera ka mestu gde treba da stigne. Do pet strelica.",
    en: "Drag with your finger or mouse from what moves to where it should end up. Up to five arrows.",
  } as T,
  undoArrow: { sr: "Obriši poslednju strelicu", en: "Remove the last arrow" } as T,
  clearArrows: { sr: "Obriši sve strelice", en: "Clear all arrows" } as T,
  arrowsCount: { sr: "Strelica: {n} / {max}", en: "Arrows: {n} / {max}" } as T,
  needArrow: { sr: "Nacrtaj bar jednu strelicu.", en: "Draw at least one arrow." } as T,
  drawExtra: { sr: "Šta je na slici i šta se dešava (nije obavezno)", en: "What is in the picture and what happens (optional)" } as T,
  drawPlaceholder: { sr: "npr. Dečak pušta zmaja na livadi", en: "e.g. A boy flies a kite in a meadow" } as T,
  drawCreate: { sr: "Oživi po strelicama", en: "Animate along the arrows" } as T,
  drawPreview: { sr: "Modelu ide:", en: "Sent to the model:" } as T,
  arrowsLabel: { sr: "Strelice pokreta preko slike", en: "Motion arrows over the picture" } as T,

  // ── Alat: produži klip ────────────────────────────────────────────────────
  extendDirection: { sr: "Smer", en: "Direction" } as T,
  directions: { napred: { sr: "Napred (posle kraja)", en: "Forward (after the end)" } as T, nazad: { sr: "Nazad (pre početka)", en: "Backward (before the start)" } as T },
  extendSeconds: { sr: "Koliko sekundi dodaješ", en: "How many seconds to add" } as T,
  extendText: { sr: "Šta se dešava u nastavku (nije obavezno)", en: "What happens in the extension (optional)" } as T,
  extendPlaceholder: { sr: "npr. Mačka skače sa ograde i odlazi niz ulicu", en: "e.g. The cat jumps off the fence and walks down the street" } as T,
  extendCreate: { sr: "Produži", en: "Extend" } as T,
  extendRoute: { sr: "Kojim modelom", en: "Which model" } as T,
  extendProblems: {
    "drugi-model": { sr: "Veo produžava samo klip koji je napravio Veo.", en: "Veo extends only a clip that Veo made." } as T,
    prevelik: { sr: "Veo prima klip do 15 MB - ovaj je veći.", en: "Veo takes a clip up to 15 MB - this one is bigger." } as T,
  },
  extendAnyModel: {
    sr: "Za bilo koji drugi model: „Nastavi od poslednjeg kadra” (besplatno izvlačenje kadra, pa nov klip).",
    en: "For any other model: “Continue from the last frame” (free frame pull, then a new clip).",
  } as T,
  extendUnverified: {
    sr: "Seedance smer razume iz opisa - za klip koji nije savršeno nastavljen napravi novu verziju.",
    en: "Seedance understands the direction from the description - if the clip does not continue perfectly, make a new version.",
  } as T,
  needSource: { sr: "Izaberi video koji produžavaš.", en: "Pick the video you are extending." } as T,
  demoSource: { sr: "DEMO rad nema pravi video, pa ne može da se produži.", en: "A DEMO work has no real video, so it cannot be extended." } as T,
  sent: { sr: "Poslato - rad se pojavljuje u istoriji desno.", en: "Sent - the work appears in the history on the right." } as T,
  noAccess: { sr: "Plaćeni alati rade uz pristup Crei.", en: "Paid tools work with access to Crea." } as T,
  // Ulaz videa u alatima
  chooseVideo: { sr: "Izaberi video sa uređaja", en: "Choose a video from your device" } as T,
  otherVideo: { sr: "Drugi video", en: "Another video" } as T,
  dropVideo: { sr: "Pusti video bilo gde", en: "Drop the video anywhere" } as T,
  dropVideoHint: { sr: "Ceo ekran prima video. Ništa se ne šalje dok ne klikneš.", en: "The whole screen takes the video. Nothing is sent until you click." } as T,
  notVideo: { sr: "To nije video. Izaberi MP4, MOV ili WebM.", en: "That is not a video. Pick an MP4, MOV or WebM." } as T,
  videoTooBig: { sr: "Video je veći od 200 MB. Skrati ga ili smanji.", en: "The video is larger than 200 MB. Trim it or make it smaller." } as T,
  galleryVideo: { sr: "Video iz galerije", en: "Video from your gallery" } as T,
  orDevice: { sr: "ili", en: "or" } as T,
} as const;
