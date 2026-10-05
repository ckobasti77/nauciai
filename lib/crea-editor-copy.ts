/**
 * Tekstovi editora na platnu, šablona i „3D foto" (K10: S28, S29, S33).
 * Odvojeni od `lib/crea-copy.ts` jer ih uvoze samo ti alati (svaki svoj async
 * chunk) - ne ulaze u početni JS radionice. `{x}` popunjava `fillCopy`.
 */

import type { LocalizedText } from "./i18n";

export const CREA_EDITOR_COPY = {
  // Početak
  startTitle: { sr: "Odakle krećeš?", en: "Where do you start?" },
  startPhoto: { sr: "Od fotke", en: "From a photo" },
  startPhotoHint: {
    sr: "Platno dobija veličinu fotke, a ti dodaješ tekst, nalepnice i oblike.",
    en: "The canvas takes the photo's size, then you add text, stickers and shapes.",
  },
  startBlank: { sr: "Prazno platno", en: "Blank canvas" },
  startBlankHint: { sr: "Izaberi veličinu za mrežu na koju objavljuješ.", en: "Pick the size for the network you post to." },
  restart: { sr: "Novo platno", en: "New canvas" },
  restartConfirm: {
    sr: "Novo platno briše sve što si uradio/la ovde. Nastaviti?",
    en: "A new canvas clears everything you did here. Continue?",
  },

  // Platno
  canvasLabel: { sr: "Platno za uređivanje, {w} × {h} px", en: "Editing canvas, {w} × {h} px" },
  canvasHint: {
    sr: "Dodirni da izabereš, prevuci da pomeriš, uglovi menjaju veličinu, kružić okreće.",
    en: "Tap to select, drag to move, corners resize, the little circle rotates.",
  },
  keysHint: {
    sr: "Prečice: Ctrl+Z poništi, Ctrl+Y ponovi, Delete briše, strelice pomeraju (sa Shift više).",
    en: "Shortcuts: Ctrl+Z undo, Ctrl+Y redo, Delete removes, arrows move (more with Shift).",
  },
  undo: { sr: "Poništi", en: "Undo" },
  redo: { sr: "Ponovi", en: "Redo" },
  addPhotoHere: { sr: "Dodaj fotku", en: "Add a photo" },
  loadingFonts: { sr: "Učitavam slova…", en: "Loading fonts…" },

  // Paneli
  panels: { sr: "Šta dodaješ", en: "What to add" },
  tabText: { sr: "Tekst", en: "Text" },
  tabStickers: { sr: "Nalepnice", en: "Stickers" },
  tabShapes: { sr: "Oblici", en: "Shapes" },
  tabPhotos: { sr: "Fotke", en: "Photos" },
  tabCollage: { sr: "Kolaž", en: "Collage" },
  tabWatermark: { sr: "Vodeni žig", en: "Watermark" },
  tabLayers: { sr: "Slojevi", en: "Layers" },

  addText: { sr: "Dodaj naslov", en: "Add a heading" },
  addTextBody: { sr: "Dodaj običan tekst", en: "Add plain text" },
  addTextHand: { sr: "Dodaj rukopis", en: "Add handwriting" },
  newHeading: { sr: "Tvoj naslov", en: "Your heading" },
  newBody: { sr: "Ovde ide tvoj tekst", en: "Your text goes here" },
  newHand: { sr: "dopisano rukom", en: "written by hand" },
  textHint: {
    sr: "Slova rade sa č, ć, š, ž, đ i ćirilicom. Rukopis za ćirilicu koristi sličan font (Pangolin).",
    en: "Fonts work with č, ć, š, ž, đ and Cyrillic. Handwriting uses a similar font (Pangolin) for Cyrillic.",
  },

  addPhoto: { sr: "Dodaj fotku kao sloj", en: "Add a photo as a layer" },
  photosHint: {
    sr: "Fotka ostaje na tvom uređaju. Može i da se prevuče bilo gde na ekran.",
    en: "The photo stays on your device. You can also drop it anywhere on the screen.",
  },

  collageLayout: { sr: "Raspored", en: "Layout" },
  collageGap: { sr: "Razmak", en: "Gap" },
  collagePick: { sr: "Izaberi fotke za kolaž", en: "Choose photos for the collage" },
  collageHint: {
    sr: "Kolaž ide ispod teksta i nalepnica. Prazno polje dodirni pa dodaj fotku.",
    en: "The collage goes under text and stickers. Tap an empty cell to add a photo.",
  },
  collageNone: { sr: "Bez razmaka", en: "No gap" },
  collageThin: { sr: "Tanak", en: "Thin" },
  collageWide: { sr: "Širok", en: "Wide" },

  watermarkText: { sr: "Tekst žiga", en: "Watermark text" },
  watermarkDefault: { sr: "@tvoj.nalog", en: "@your.handle" },
  watermarkAddText: { sr: "Dodaj tekst kao žig", en: "Add text watermark" },
  watermarkBrandLogo: { sr: "Logo iz brend kita", en: "Logo from the brand kit" },
  watermarkBrandLogoFailed: { sr: "Logo iz brend kita nije učitan - okači ga ručno.", en: "Could not load the brand kit logo - upload it by hand." },
  watermarkAddLogo: { sr: "Dodaj logo kao žig", en: "Add logo watermark" },
  watermarkHint: {
    sr: "Žig ide u donji desni ugao, malo providan, da se zna čija je slika.",
    en: "The watermark goes in the bottom-right corner, slightly see-through, so people know whose image it is.",
  },

  layersEmpty: { sr: "Platno je prazno. Dodaj tekst, nalepnicu ili fotku.", en: "The canvas is empty. Add text, a sticker or a photo." },
  layersHint: { sr: "Gore je ono što je napred.", en: "The top of the list is in front." },

  // Izabrano
  selected: { sr: "Izabrano: {name}", en: "Selected: {name}" },
  nothingSelected: { sr: "Dodirni nešto na platnu da ga urediš.", en: "Tap something on the canvas to edit it." },
  text: { sr: "Tekst", en: "Text" },
  font: { sr: "Slova", en: "Font" },
  fontNunito: { sr: "Nunito", en: "Nunito" },
  fontHand: { sr: "Rukopis", en: "Handwriting" },
  fontMontserrat: { sr: "Montserrat", en: "Montserrat" },
  fontLora: { sr: "Lora", en: "Lora" },
  weight: { sr: "Debljina", en: "Weight" },
  weightRegular: { sr: "Obična", en: "Regular" },
  weightBold: { sr: "Podebljana", en: "Bold" },
  weightBlack: { sr: "Najdeblja", en: "Black" },
  size: { sr: "Veličina", en: "Size" },
  color: { sr: "Boja", en: "Color" },
  customColor: { sr: "Svoja boja", en: "Custom color" },
  align: { sr: "Poravnanje", en: "Alignment" },
  alignLeft: { sr: "Levo", en: "Left" },
  alignCenter: { sr: "Sredina", en: "Center" },
  alignRight: { sr: "Desno", en: "Right" },
  outline: { sr: "Obrub slova", en: "Letter outline" },
  shadow: { sr: "Tvrda senka", en: "Hard shadow" },
  uppercase: { sr: "Velika slova", en: "Capitals" },
  fill: { sr: "Ispuna", en: "Fill" },
  noFill: { sr: "Bez ispune", en: "No fill" },
  border: { sr: "Ivica", en: "Border" },
  rounded: { sr: "Zaobljeno", en: "Rounded" },
  opacity: { sr: "Providnost", en: "Opacity" },
  replacePhoto: { sr: "Zameni fotku", en: "Replace photo" },
  removePhoto: { sr: "Izbaci fotku", en: "Remove photo" },
  bringForward: { sr: "Napred", en: "Forward" },
  sendBackward: { sr: "Nazad", en: "Backward" },
  bringToFront: { sr: "Skroz napred", en: "To front" },
  sendToBack: { sr: "Skroz nazad", en: "To back" },
  duplicate: { sr: "Udvostruči", en: "Duplicate" },
  remove: { sr: "Obriši", en: "Delete" },
  hide: { sr: "Sakrij", en: "Hide" },
  show: { sr: "Prikaži", en: "Show" },
  lock: { sr: "Zaključaj", en: "Lock" },
  unlock: { sr: "Otključaj", en: "Unlock" },
  lockedHint: { sr: "Zaključano - ne pomera se slučajno. Otključaj da ga pomeriš.", en: "Locked so it does not move by accident. Unlock to move it." },
  background: { sr: "Pozadina platna", en: "Canvas background" },

  shapeRect: { sr: "Pravougaonik", en: "Rectangle" },
  shapeEllipse: { sr: "Krug", en: "Circle" },
  shapeStar: { sr: "Zvezda", en: "Star" },
  shapeArrow: { sr: "Strelica", en: "Arrow" },
  shapeTape: { sr: "Selotejp", en: "Tape" },
  shapeHighlight: { sr: "Marker", en: "Highlighter" },

  // Izvoz
  exportFormat: { sr: "Format slike", en: "Image format" },
  exportSize: { sr: "Veličina", en: "Size" },
  exportStandard: { sr: "Standardno", en: "Standard" },
  exportSharp: { sr: "Oštrije (2×)", en: "Sharper (2×)" },
  exportSize1: { sr: "{w} × {h} px", en: "{w} × {h} px" },
  exportLimited: {
    sr: "Na telefonu je izvoz ograničen na oko 8 MP, da se browser ne bi srušio.",
    en: "On a phone the export is limited to about 8 MP so the browser does not crash.",
  },
  exportCta: { sr: "Napravi sliku", en: "Make the image" },
  emptySlots: {
    sr: "Prazna mesta za fotku ({names}) ostaju obojena. Dodaj fotku ako hoćeš.",
    en: "Empty photo spots ({names}) stay coloured. Add a photo if you want.",
  },
  exportedSize: { sr: "Slika {w} × {h} px", en: "Image {w} × {h} px" },
} satisfies Record<string, LocalizedText>;

export const CREA_TEMPLATE_COPY = {
  pickTitle: { sr: "Izaberi šablon", en: "Choose a template" },
  pickHint: {
    sr: "Izgled je već sređen. Ti samo upišeš svoje i dodaš fotku.",
    en: "The look is already done. You just type yours and add a photo.",
  },
  fieldsTitle: { sr: "Popuni", en: "Fill in" },
  chars: { sr: "{n} od {max}", en: "{n} of {max}" },
  photoFor: { sr: "Fotka: {label}", en: "Photo: {label}" },
  choosePhoto: { sr: "Izaberi fotku", en: "Choose a photo" },
  changePhoto: { sr: "Druga fotka", en: "Another photo" },
  removePhoto: { sr: "Ukloni", en: "Remove" },
  freeEdit: { sr: "Uredi slobodno", en: "Edit freely" },
  freeEditHint: {
    sr: "Pomeraj, dodaj nalepnice i tekst - kao u editoru.",
    en: "Move things, add stickers and text - like in the editor.",
  },
  backToFields: { sr: "Nazad na polja", en: "Back to the fields" },
  otherTemplate: { sr: "Drugi šablon", en: "Another template" },
  previewLabel: { sr: "Pregled šablona {name}", en: "Preview of the {name} template" },
  layoutKept: {
    sr: "Duži tekst se samo smanji - raspored ostaje isti.",
    en: "Longer text just gets smaller - the layout stays the same.",
  },
} satisfies Record<string, LocalizedText>;

export const CREA_PHOTO3D_COPY = {
  motion: { sr: "Pokret kamere", en: "Camera movement" },
  strength: { sr: "Koliko dubine", en: "How much depth" },
  duration: { sr: "Trajanje", en: "Length" },
  seconds: { sr: "{n} s", en: "{n} s" },
  privacy: {
    sr: "Dubinu računa mali model na tvom računaru - fotka ne napušta uređaj, a video ne košta kredite.",
    en: "A small model on your computer works out the depth - the photo never leaves your device and the video costs no credits.",
  },
  tips: {
    sr: "Najbolje radi fotka sa jasnim predmetom napred i pozadinom iza (portret, ljubimac, hrana, pejzaž).",
    en: "Works best with a clear subject in front of a background (portrait, pet, food, landscape).",
  },
  noEncoder: {
    sr: "Ovaj browser ne ume da napravi MP4. Probaj u novom Chrome-u ili Edge-u na računaru.",
    en: "This browser cannot make an MP4. Try a recent Chrome or Edge on a computer.",
  },
  result: { sr: "Video {w} × {h} px, {s} s, bez zvuka", en: "Video {w} × {h} px, {s} s, no sound" },
  playLabel: { sr: "3D foto - video", en: "3D photo - video" },
  run: { sr: "Napravi 3D video", en: "Make the 3D video" },
} satisfies Record<string, LocalizedText>;
