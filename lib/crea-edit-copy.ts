/**
 * Tekstovi alata „Izmeni" iz K11 (S11-S14, S16, S17). Odvojeni od
 * `lib/crea-copy.ts` jer ih uvoze samo alati, koji su svaki svoj async chunk -
 * ovako ne ulaze u početni JS radionice. `{x}` popunjava `fillCopy`.
 */

import type { LocalizedText } from "./i18n";

type CopyTree = Record<string, LocalizedText | Record<string, LocalizedText>>;

/** Editor maske: četkica, gumica, klik (S11, S12, S13). */
export const CREA_MASK_COPY = {
  legend: { sr: "Čime označavaš", en: "How you mark it" },
  tools: {
    cetkica: { sr: "Četkica", en: "Brush" },
    gumica: { sr: "Gumica", en: "Eraser" },
    klik: { sr: "Klik", en: "Click" },
  },
  hints: {
    cetkica: { sr: "Prevuci preko dela slike koji menjaš.", en: "Drag over the part of the image you are changing." },
    gumica: { sr: "Prevuci preko oznake koju brišeš.", en: "Drag over the marking you want to remove." },
    klik: { sr: "Klikni na predmet i on se sâm označi. Klikni još jedan da ga dodaš.", en: "Click an object and it marks itself. Click another one to add it." },
  },
  size: { sr: "Veličina četkice", en: "Brush size" },
  undo: { sr: "Poništi", en: "Undo" },
  clear: { sr: "Obriši oznaku", en: "Clear marking" },
  marked: { sr: "Označeno: {n} % slike", en: "Marked: {n}% of the image" },
  empty: { sr: "Još ništa nije označeno.", en: "Nothing is marked yet." },
  canvasLabel: {
    sr: "Slika za označavanje. Mišem ili prstom prevuci preko dela koji menjaš.",
    en: "Image to mark. Drag over the part you are changing with the mouse or a finger.",
  },
  clickDownload: {
    sr: "Klik prvi put preuzima ~{size} (jednom, posle radi i bez interneta).",
    en: "The first click downloads ~{size} (once, then it works offline too).",
  },
  clickDownloadCta: { sr: "Preuzmi i kreni", en: "Download and start" },
  clickLoading: { sr: "Učitavam „klik“…", en: "Loading “click”…" },
  clickWorking: { sr: "Tražim predmet…", en: "Finding the object…" },
  clickFailed: {
    sr: "Klik ovde ne radi. Označi predmet četkicom.",
    en: "Click does not work here. Mark the object with the brush.",
  },
  clickMissed: {
    sr: "Nismo našli predmet na tom mestu. Klikni bliže sredini predmeta ili koristi četkicu.",
    en: "We did not find an object there. Click closer to its middle or use the brush.",
  },
} satisfies CopyTree;

/** Plaćena izmena iz alata (S11, S13 veliki predmet, S14 AI scena). */
export const CREA_PAID_EDIT_COPY = {
  route: { sr: "Kojim modelom", en: "Which model" },
  routes: {
    mask: { sr: "Ideogram 4.5 · tačna maska", en: "Ideogram 4.5 · exact mask" },
    zone: { sr: "Nano Banana 2 · obojen deo", en: "Nano Banana 2 · coloured area" },
    photo: { sr: "Nano Banana 2", en: "Nano Banana 2" },
  },
  quality: { sr: "Kvalitet", en: "Quality" },
  qualities: {
    very_low: { sr: "Brzo", en: "Quick" },
    low: { sr: "Nizak", en: "Low" },
    medium: { sr: "Srednji", en: "Medium" },
    high: { sr: "Visok", en: "High" },
  },
  promptLabel: { sr: "Šta tu treba da bude?", en: "What should go there?" },
  promptPlaceholder: { sr: "npr. crvena kapa sa šiltom", en: "e.g. a red cap with a visor" },
  scenePromptLabel: { sr: "Kakva scena iza?", en: "What scene behind?" },
  scenePromptPlaceholder: { sr: "npr. plaža u zalasku sunca", en: "e.g. a beach at sunset" },
  edit: { sr: "Izmeni", en: "Edit" },
  erase: { sr: "Obriši AI-jem", en: "Erase with AI" },
  scene: { sr: "Napravi scenu", en: "Make the scene" },
  preparing: { sr: "Pripremam sliku…", en: "Preparing the image…" },
  uploading: { sr: "Šaljem sliku…", en: "Sending the image…" },
  sent: {
    sr: "Poslato! Rad se pravi i stiže u istoriju kao nova verzija.",
    en: "Sent! The work is being made and arrives in your history as a new version.",
  },
  needMask: { sr: "Prvo označi deo slike.", en: "Mark part of the image first." },
  needPrompt: { sr: "Napiši šta tu treba da bude.", en: "Write what should go there." },
  needScene: { sr: "Napiši kakva scena ide iza.", en: "Write what scene goes behind." },
  needImage: { sr: "Prvo izaberi sliku.", en: "Choose an image first." },
  demo: {
    sr: "DEMO: provajder još nema ključ, pa stiže probni rezultat (vidi ga samo osoblje).",
    en: "DEMO: the provider has no key yet, so a test result arrives (only staff sees this).",
  },
  unavailable: {
    sr: "Plaćena izmena trenutno nije dostupna.",
    en: "Paid editing is not available right now.",
  },
  noAccess: {
    sr: "Plaćene izmene su za sada samo za polaznike kursa.",
    en: "Paid edits are only for course students for now.",
  },
  privacy: {
    sr: "Za plaćenu izmenu slika ide AI provajderu; besplatni alati je ne šalju nigde.",
    en: "For a paid edit the image goes to the AI provider; the free tools send it nowhere.",
  },
} satisfies CopyTree;

/** Klikni i izaberi (S12). */
export const CREA_SELECT_COPY = {
  output: { sr: "Šta da napravim", en: "What to make" },
  outputs: {
    izdvoji: { sr: "Samo predmet, bez pozadine", en: "Just the object, no background" },
    boja: { sr: "Predmet u boji, ostalo crno-belo", en: "Object in colour, the rest black and white" },
  },
  run: { sr: "Napravi", en: "Make it" },
  needMask: { sr: "Klikni na predmet (ili ga označi četkicom).", en: "Click the object (or mark it with the brush)." },
} satisfies CopyTree;

/** Obriši predmet (S13). */
export const CREA_ERASE_COPY = {
  run: { sr: "Obriši besplatno", en: "Erase for free" },
  needMask: { sr: "Prevuci preko predmeta koji brišeš.", en: "Drag over the object you are erasing." },
  bigTitle: { sr: "Ovo je veliki predmet", en: "This is a big object" },
  bigBody: {
    sr: "Besplatno brisanje na uređaju dobro krpi male stvari; veliku zakrpu ume da razmaže. Probaj besplatno ili obriši AI-jem.",
    en: "Free erasing on your device patches small things well; a big patch may smear. Try it for free or erase with AI.",
  },
  tip: {
    sr: "Savet: označi i senku predmeta - inače ostaje „duh“.",
    en: "Tip: mark the object's shadow too - otherwise a “ghost” stays behind.",
  },
} satisfies CopyTree;

/** Ukloni pozadinu (S14). */
export const CREA_BACKGROUND_COPY = {
  background: { sr: "Nova pozadina", en: "New background" },
  kinds: {
    providno: { sr: "Bez pozadine", en: "No background" },
    boja: { sr: "Boja", en: "Colour" },
    zamuceno: { sr: "Zamućena", en: "Blurred" },
    slika: { sr: "Tvoja slika", en: "Your picture" },
    ai: { sr: "AI scena", en: "AI scene" },
  },
  aiHint: { sr: "Krediti", en: "Credits" },
  color: { sr: "Boja pozadine", en: "Background colour" },
  customColor: { sr: "Svoja boja", en: "Your own colour" },
  blur: { sr: "Koliko zamućeno", en: "How blurred" },
  blurs: {
    blago: { sr: "Blago", en: "Gentle" },
    jako: { sr: "Jako", en: "Strong" },
  },
  bgImage: { sr: "Slika za pozadinu", en: "Picture for the background" },
  bgImageCta: { sr: "Izaberi sliku za pozadinu", en: "Choose a background picture" },
  needBgImage: { sr: "Izaberi sliku za pozadinu.", en: "Choose a picture for the background." },
  run: { sr: "Ukloni pozadinu", en: "Remove background" },
  subject: { sr: "Šta je u prvom planu", en: "What is in front" },
  subjects: {
    osoba: { sr: "Osoba", en: "A person" },
    predmet: { sr: "Predmet ili ljubimac", en: "An object or a pet" },
  },
  subjectHints: {
    osoba: { sr: "iseca se sama", en: "cut out automatically" },
    predmet: { sr: "klikni na njega", en: "click on it" },
  },
  needMask: { sr: "Klikni na predmet (ili ga označi četkicom).", en: "Click the object (or mark it with the brush)." },
  nothingFound: {
    sr: "Nismo našli osobu ni predmet u prvom planu. Probaj fotku sa jasnijim prvim planom.",
    en: "We found no person or object in front. Try a photo with a clearer foreground.",
  },
  transparentNote: { sr: "Providni delovi su prikazani kao šahovnica.", en: "Transparent parts are shown as a checkerboard." },
} satisfies CopyTree;

/** Uvećaj 2× (S16). */
export const CREA_UPSCALE_COPY = {
  run: { sr: "Uvećaj 2×", en: "Upscale 2×" },
  output: { sr: "Biće {w} × {h} px (bilo {ow} × {oh}).", en: "It will be {w} × {h} px (was {ow} × {oh})." },
  slow: {
    sr: "Na ovom uređaju radi bez WebGPU-a, pa može da potraje i par minuta. Možeš da odustaneš bilo kad.",
    en: "This device runs it without WebGPU, so it can take a couple of minutes. You can cancel any time.",
  },
  fast: { sr: "Tvoj računar ima WebGPU - biće brzo.", en: "Your computer has WebGPU - it will be quick." },
  tooBig: {
    sr: "Slika je prevelika za uvećanje na ovom uređaju (najviše oko {side} × {side} px). Smanji je ili iseci alatom „Iseci, okreni, promeni veličinu“, pa probaj ponovo.",
    en: "The image is too big to upscale on this device (about {side} × {side} px at most). Shrink or crop it with “Crop, rotate, resize”, then try again.",
  },
  noPaid: {
    sr: "Veće uvećanje uz kredite još ne postoji u Crei.",
    en: "A bigger, paid upscale does not exist in Crea yet.",
  },
  result: { sr: "{w} × {h} px", en: "{w} × {h} px" },
} satisfies CopyTree;

/** Boje i svetlo (S17). */
export const CREA_COLOR_COPY = {
  looks: { sr: "Filmski izgled", en: "Film look" },
  intensity: { sr: "Jačina izgleda", en: "Look strength" },
  basic: { sr: "Svetlo i boje", en: "Light and colour" },
  more: { sr: "Još podešavanja", en: "More settings" },
  reset: { sr: "Vrati sve", en: "Reset all" },
  hold: { sr: "Drži za original", en: "Hold for original" },
  showing: { sr: "Original", en: "Original" },
  previewLabel: { sr: "Pregled izmena boja", en: "Colour edit preview" },
  run: { sr: "Napravi sliku", en: "Make the image" },
  neutral: { sr: "Pomeri neki klizač ili izaberi izgled.", en: "Move a slider or pick a look." },
  noWebgl: {
    sr: "Pregled ne radi u ovom browseru (treba WebGL2).",
    en: "The preview does not work in this browser (WebGL2 is needed).",
  },
} satisfies CopyTree;
