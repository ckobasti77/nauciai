import type { LocalizedText } from "./i18n";

/**
 * Tekstovi za „Napravi" u radionici Slika (Crea K13): dodaci composeru
 * (pomoćnik za opis, mikrofon, izgled, varijacije, limit cene) i alati
 * (probni list, Ko · Gde · Kako, crtaj i gledaj, skica u sliku).
 */

export const CREA_CREATE_COPY = {
  // S6 pomoćnik za opis
  helper: { sr: "Pomoćnik za opis", en: "Prompt helper" },
  helperTitle: {
    sr: "Napiši ideju svojim rečima - pomoćnik je pretvori u precizan opis. Ne troši kredite.",
    en: "Write your idea in your own words - the helper turns it into a precise description. It uses no credits.",
  },
  helperWorking: { sr: "Pomoćnik piše…", en: "The helper is writing…" },
  helperUse: { sr: "Upotrebi ovaj opis", en: "Use this description" },
  helperAgain: { sr: "Probaj ponovo", en: "Try again" },
  helperClose: { sr: "Zatvori pomoćnika", en: "Close the helper" },
  helperQuota: { sr: "0 kr · još {n} danas", en: "0 cr · {n} left today" },
  helperLimit: {
    sr: "Pomoćnik je za danas iskorišćen ({limit} poziva). Sutra opet - a opis možeš da pišeš i sam.",
    en: "The helper is used up for today ({limit} calls). Back tomorrow - you can still write the description yourself.",
  },
  helperError: { sr: "Pomoćnik trenutno ne radi. Probaj ponovo za minut.", en: "The helper is not working right now. Try again in a minute." },
  helperEmpty: { sr: "Prvo napiši ideju, makar u par reči.", en: "Write your idea first, even just a few words." },
  helperDemo: {
    sr: "DEMO - bez Google ključa ovo je primer odgovora.",
    en: "DEMO - without a Google key this is a sample answer.",
  },
  helperWhatGoes: { sr: "Modelu ide (na engleskom, jer ga modeli najbolje razumeju):", en: "Sent to the model:" },
  parts: {
    ko: { sr: "Ko", en: "Who" },
    sta: { sr: "Šta", en: "What" },
    stil: { sr: "Stil", en: "Style" },
    svetlo: { sr: "Svetlo", en: "Light" },
    kamera: { sr: "Kamera", en: "Camera" },
  },
  // Mikrofon (Web Speech, sr-RS)
  micStart: { sr: "Izgovori opis", en: "Speak the description" },
  micStop: { sr: "Zaustavi slušanje", en: "Stop listening" },
  micListening: { sr: "Slušam… govori slobodno.", en: "Listening… go ahead." },
  micDenied: {
    sr: "Mikrofon nije dozvoljen. Dozvoli ga u podešavanjima pregledača.",
    en: "The microphone is not allowed. Allow it in the browser settings.",
  },
  micFailed: { sr: "Govor nije prepoznat - probaj ponovo.", en: "The speech was not recognised - try again." },

  // S8 izgled: stil, kamera, paleta, moji stilovi
  look: { sr: "Izgled", en: "Look" },
  lookTitle: { sr: "Stil, kamera i paleta", en: "Style, camera and palette" },
  lookClose: { sr: "Gotovo", en: "Done" },
  tabs: {
    stil: { sr: "Stil", en: "Style" },
    kamera: { sr: "Kamera", en: "Camera" },
    paleta: { sr: "Paleta", en: "Palette" },
    moji: { sr: "Moji stilovi", en: "My styles" },
  },
  allGroups: { sr: "Sve", en: "All" },
  noStyle: { sr: "Bez stila", en: "No style" },
  cameraOn: { sr: "Koristi virtuelnu kameru", en: "Use the virtual camera" },
  cameraBody: { sr: "Telo", en: "Body" },
  cameraLens: { sr: "Objektiv", en: "Lens" },
  cameraFocal: { sr: "Žižna daljina", en: "Focal length" },
  cameraAperture: { sr: "Blenda", en: "Aperture" },
  paletteNone: { sr: "Bez palete", en: "No palette" },
  paletteFromImage: { sr: "Iz slike", en: "From an image" },
  paletteReading: { sr: "Čitam boje…", en: "Reading the colours…" },
  paletteFailed: { sr: "Iz ove slike boje nisu pročitane.", en: "Could not read the colours from this image." },
  paletteAdd: { sr: "Dodaj boju", en: "Add a colour" },
  paletteRemove: { sr: "Ukloni boju {hex}", en: "Remove colour {hex}" },
  myEmpty: {
    sr: "Još nemaš sačuvan stil. Izaberi stil, kameru ili paletu, pa ih sačuvaj pod svojim imenom.",
    en: "You have no saved style yet. Pick a style, camera or palette, then save them under your own name.",
  },
  mySave: { sr: "Sačuvaj kao moj stil", en: "Save as my style" },
  myName: { sr: "Ime stila", en: "Style name" },
  myNamePlaceholder: { sr: "npr. Moja jesen", en: "e.g. My autumn" },
  myExtra: { sr: "Dodatak opisu (po želji)", en: "Extra words (optional)" },
  myExtraPlaceholder: { sr: "npr. toplo, lišće, magla", en: "e.g. warm, leaves, mist" },
  mySaved: { sr: "Sačuvano.", en: "Saved." },
  myApply: { sr: "Primeni", en: "Apply" },
  myDelete: { sr: "Obriši stil {name}", en: "Delete style {name}" },
  myNothing: { sr: "Prvo izaberi stil, kameru, paletu ili dopiši dodatak.", en: "First pick a style, camera, palette or add extra words." },
  myError: { sr: "Stil nije sačuvan. Proveri ime i probaj ponovo.", en: "The style was not saved. Check the name and try again." },
  myFull: { sr: "Imaš najviše stilova (30). Obriši neki stari.", en: "You have the most styles allowed (30). Delete an old one." },
  summaryCamera: { sr: "Kamera {focal} mm {aperture}", en: "Camera {focal} mm {aperture}" },
  summaryPalette: { sr: "Paleta ({n})", en: "Palette ({n})" },
  removeLook: { sr: "Ukloni {what}", en: "Remove {what}" },
  preview: { sr: "Modelu ide:", en: "Sent to the model:" },
  tooLong: {
    sr: "Opis zajedno sa izgledom je predug za {n} znakova - skrati ga ili skini deo izgleda.",
    en: "The description with the look is {n} characters too long - shorten it or remove part of the look.",
  },

  // S5 varijacije, S3 limit cene, S4 probni list
  variations: { sr: "Varijacije", en: "Variations" },
  variationsParallel: {
    sr: "{n} zasebna posla - kreću čim se oslobodi mesto.",
    en: "{n} separate jobs - they start as soon as a slot frees up.",
  },
  queueWaiting: { sr: "Varijacije: još {n} čeka slobodno mesto.", en: "Variations: {n} more waiting for a free slot." },
  budget: { sr: "Limit cene", en: "Price limit" },
  budgetNone: { sr: "bez limita", en: "no limit" },
  budgetLabel: { sr: "Najviše kredita za Auto", en: "Most credits for Auto" },
  budgetHelp: {
    sr: "Auto bira najbolji model koji staje u limit. Prazno = bez limita.",
    en: "Auto picks the best model that fits the limit. Empty = no limit.",
  },
  sheet: { sr: "Probni list", en: "Contact sheet" },
  sheetTitle: {
    sr: "4-16 jeftinih skica sa ovim opisom, pa izaberi najbolju i usavrši je",
    en: "4-16 cheap sketches of this description, then pick the best and refine it",
  },
  describeTitle: { sr: "Opiši sliku rečima", en: "Describe the image in words" },
  describeBody: {
    sr: "Napiši šta hoćeš da vidiš - uz pomoćnika, stilove i kameru.",
    en: "Write what you want to see - with the helper, styles and camera.",
  },
  listTitle: { sr: "Alati za pravljenje", en: "Making tools" },
} satisfies Record<string, LocalizedText | Record<string, LocalizedText>>;

export const CREA_MAKE_TOOLS_COPY = {
  // Zajedničko
  prompt: { sr: "Opis", en: "Description" },
  unavailable: {
    sr: "Ovaj alat trenutno nije dostupan - model za njega nije uključen.",
    en: "This tool is not available right now - its model is not switched on.",
  },
  demo: { sr: "DEMO - bez ključa provajdera rezultat je probni plakat.", en: "DEMO - without the provider key the result is a sample poster." },
  noAccess: {
    sr: "Pravljenje slika stiže kad dobiješ pristup Crei.",
    en: "Making images comes once you get access to Crea.",
  },
  sendError: { sr: "Nije poslato: {message}", en: "Not sent: {message}" },
  waiting: { sr: "Čeka slobodno mesto…", en: "Waiting for a free slot…" },
  failed: { sr: "Nije uspelo - krediti su vraćeni.", en: "It failed - the credits were refunded." },
  open: { sr: "Otvori rad", en: "Open the work" },

  // S4 probni list
  sheetSize: { sr: "Koliko skica", en: "How many sketches" },
  sheetPair: { sr: "Skica pa usavršavanje", en: "Sketch, then refine" },
  sheetRun: { sr: "Napravi {n} skica", en: "Make {n} sketches" },
  sheetPrice: {
    sr: "{n} skica = {jobs} posla · ukupno {credits}. Usavršavanje izabrane: {refine}.",
    en: "{n} sketches = {jobs} jobs · {credits} in total. Refining the chosen one: {refine}.",
  },
  sheetNeedPrompt: { sr: "Napiši opis slike.", en: "Write a description of the image." },
  sheetPick: { sr: "Klikni skicu koja ti se najviše sviđa.", en: "Click the sketch you like best." },
  sheetPicked: { sr: "Izabrana skica {n}", en: "Chosen sketch {n}" },
  sheetRefine: { sr: "Usavrši · {model}", en: "Refine · {model}" },
  sheetRefined: { sr: "Usavršavanje je poslato - stiže u istoriju.", en: "Refining was sent - it arrives in your history." },
  sheetProgress: { sr: "Stiglo {done} od {total} skica", en: "{done} of {total} sketches arrived" },
  sheetSketch: { sr: "Skica {n}", en: "Sketch {n}" },
  sheetNew: { sr: "Novi list", en: "New sheet" },
  pairs: {
    "slika-skica": { sr: "Z-Image skice → Nano Banana 2", en: "Z-Image sketches → Nano Banana 2" },
    "slika-flux": { sr: "FLUX.2 klein skice → FLUX.2 Pro", en: "FLUX.2 klein sketches → FLUX.2 Pro" },
  },

  // S7 Ko · Gde · Kako
  slots: {
    ko: { sr: "Ko", en: "Who" },
    gde: { sr: "Gde", en: "Where" },
    kako: { sr: "Kako", en: "How" },
  },
  slotHints: {
    ko: { sr: "lik ili predmet", en: "a character or object" },
    gde: { sr: "mesto ili pozadina", en: "a place or background" },
    kako: { sr: "stil koji ti se sviđa", en: "a style you like" },
  },
  slotsNeed: { sr: "Dodaj bar dve slike.", en: "Add at least two pictures." },
  slotsText: { sr: "Šta se dešava (po želji)", en: "What is happening (optional)" },
  slotsTextPlaceholder: { sr: "npr. pije kafu i smeje se", en: "e.g. drinking coffee and laughing" },
  slotsPreview: { sr: "Opis koji se sam sklopio:", en: "The description that assembled itself:" },
  slotsCta: { sr: "Napravi sliku", en: "Make the image" },

  // S9 crtaj i gledaj, S10 skica
  pen: { sr: "Olovka", en: "Pen" },
  eraser: { sr: "Gumica", en: "Eraser" },
  size: { sr: "Debljina", en: "Size" },
  color: { sr: "Boja", en: "Colour" },
  undo: { sr: "Poništi", en: "Undo" },
  clear: { sr: "Obriši sve", en: "Clear all" },
  canvasLabel: { sr: "Platno za crtanje", en: "Drawing canvas" },
  canvasHint: { sr: "Crtaj mišem, prstom ili olovkom.", en: "Draw with the mouse, a finger or a stylus." },
  liveDescribe: { sr: "Šta crtaš", en: "What are you drawing" },
  liveDescribePlaceholder: { sr: "npr. kuća na brdu, zalazak sunca", en: "e.g. a house on a hill, sunset" },
  liveModel: { sr: "Model za osvežavanje", en: "Refresh model" },
  liveOn: { sr: "Uključi uživo", en: "Go live" },
  liveOff: { sr: "Isključi uživo", en: "Stop live" },
  livePrice: {
    sr: "Svako osvežavanje {credits} · najviše {limit} po sesiji = najviše {max}.",
    en: "Each refresh {credits} · at most {limit} per session = at most {max}.",
  },
  liveRule: {
    sr: "Slika se osveži kad na sekund prestaneš da crtaš (najviše jednom u {s} s).",
    en: "The picture refreshes when you pause drawing for a second (at most once every {s} s).",
  },
  liveCount: { sr: "Osvežavanja: {n} od {limit}", en: "Refreshes: {n} of {limit}" },
  liveLimit: {
    sr: "Sva osvežavanja ove sesije su iskorišćena. Zatvori i otvori alat za novu sesiju.",
    en: "You have used all refreshes for this session. Close and reopen the tool for a new one.",
  },
  liveWaiting: { sr: "Crtaj - slika stiže ovde.", en: "Draw - the picture arrives here." },
  liveWorking: { sr: "Osvežavam…", en: "Refreshing…" },
  liveResult: { sr: "Poslednje osvežavanje", en: "Latest refresh" },
  liveRefine: { sr: "Usavrši poslednju sliku", en: "Refine the latest picture" },
  sketchSource: { sr: "Odakle je skica", en: "Where the sketch comes from" },
  sketchSources: {
    platno: { sr: "Crtam ovde", en: "I draw here" },
    sveska: { sr: "Fotka iz sveske", en: "A notebook photo" },
  },
  sketchPhoto: { sr: "Slikaj ili izaberi crtež", en: "Snap or choose a drawing" },
  sketchStyle: { sr: "U kom stilu", en: "In what style" },
  sketchRealistic: { sr: "Realna fotka", en: "Real photo" },
  sketchText: { sr: "Šta je na crtežu (po želji)", en: "What is in the drawing (optional)" },
  sketchTextPlaceholder: { sr: "npr. crvena kuća pored reke", en: "e.g. a red house by a river" },
  sketchNeed: { sr: "Prvo nacrtaj nešto ili dodaj fotku crteža.", en: "Draw something first or add a photo of a drawing." },
  sketchCta: { sr: "Pretvori u sliku", en: "Turn into an image" },
} satisfies Record<string, LocalizedText | Record<string, LocalizedText>>;
