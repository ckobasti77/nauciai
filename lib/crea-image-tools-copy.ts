/**
 * Tekstovi besplatnih alata za sliku iz K09 (S26, S30, S31, S32). Odvojeni od
 * `lib/crea-copy.ts` jer ih uvoze samo alati, koji su svaki svoj async chunk -
 * ovako ne ulaze u početni JS radionice. `{x}` popunjava `fillCopy`.
 */

import type { LocalizedText } from "./i18n";

type CopyTree = Record<string, LocalizedText | Record<string, LocalizedText>>;

/** Zajedničko za više alata. */
export const CREA_IMAGE_TOOL_COPY = {
  format: { sr: "Za šta ti treba", en: "What it is for" },
  outputSize: { sr: "Izlaz: {w} × {h} px", en: "Output: {w} × {h} px" },
  belowRecommended: {
    sr: "Isečak je manji od preporučenih {w} px, pa ga ne uvećavamo (uvećanje dodaje samo mutnoću).",
    en: "The crop is smaller than the recommended {w} px, so we do not enlarge it (enlarging only adds blur).",
  },
  limited: {
    sr: "Smanjeno da bi radilo i na telefonu.",
    en: "Shrunk so it also works on a phone.",
  },
  copy: { sr: "Kopiraj", en: "Copy" },
  copied: { sr: "Kopirano", en: "Copied" },
  copyFailed: {
    sr: "Browser nije dao da kopiramo. Označi tekst i kopiraj ručno.",
    en: "The browser did not allow copying. Select the text and copy it yourself.",
  },
  before: { sr: "Pre", en: "Before" },
  after: { sr: "Posle", en: "After" },
} satisfies CopyTree;

/** S26 - iseci, okreni, promeni veličinu. */
export const CREA_CROP_COPY = {
  cropLabel: {
    sr: "Pomeri sliku prstom ili mišem; zumiraj klizačem ili sa dva prsta.",
    en: "Move the image with a finger or the mouse; zoom with the slider or two fingers.",
  },
  zoom: { sr: "Zum", en: "Zoom" },
  rotateLeft: { sr: "Okreni ulevo", en: "Rotate left" },
  rotateRight: { sr: "Okreni udesno", en: "Rotate right" },
  flipH: { sr: "Preslikaj levo-desno", en: "Flip left-right" },
  flipV: { sr: "Preslikaj gore-dole", en: "Flip upside down" },
  width: { sr: "Širina (px)", en: "Width (px)" },
  widthHint: {
    sr: "Visina ide sama, da se slika ne razvuče. Ostavi prazno za punu veličinu.",
    en: "The height follows on its own so the image is not stretched. Leave empty for full size.",
  },
  previewing: { sr: "Pripremam pregled…", en: "Preparing the preview…" },
} satisfies CopyTree;

/** S30 - pametan isečak. */
export const CREA_SMART_CROP_COPY = {
  reason: {
    faces: { sr: "Lice je u kadru ({inside} od {found}).", en: "The face is in the frame ({inside} of {found})." },
    "largest-face": {
      sr: "Sva lica ne staju u ovaj format ({found}), pa je u kadru najveće lice.",
      en: "Not all faces fit this format ({found}), so the biggest face is in the frame.",
    },
    subject: {
      sr: "Nismo našli lice, pa kadar prati najzanimljiviji deo slike.",
      en: "We found no face, so the frame follows the most interesting part of the image.",
    },
    center: {
      sr: "Nismo našli lice ni jasan predmet, pa je kadar na sredini.",
      en: "We found no face or clear subject, so the frame is centred.",
    },
  },
  frameLabel: { sr: "Okvir pokazuje šta ostaje u kadru.", en: "The frame shows what stays in the picture." },
} satisfies CopyTree;

/** S31 - paleta boja. */
export const CREA_PALETTE_COPY = {
  count: { sr: "Broj boja", en: "Number of colours" },
  hint: {
    sr: "Klikni boju da kopiraš njen kod (HEX) - npr. za Canvu, sajt ili Instagram.",
    en: "Click a colour to copy its code (HEX) - e.g. for Canva, a website or Instagram.",
  },
  copyAll: { sr: "Kopiraj sve", en: "Copy all" },
  toPrompt: { sr: "Pošalji u opis slike", en: "Send to the image description" },
  toPromptHint: {
    sr: "Otvara „Napravi“ sa ovim bojama već upisanim u opis.",
    en: "Opens “Create” with these colours already written into the description.",
  },
  share: { sr: "{n} % slike", en: "{n}% of the image" },
  copyColor: { sr: "Kopiraj {hex}", en: "Copy {hex}" },
} satisfies CopyTree;

/** S31 - QR kod. */
export const CREA_QR_COPY = {
  kind: { sr: "Šta ide u kod", en: "What goes into the code" },
  kinds: {
    link: { sr: "Link", en: "Link" },
    tekst: { sr: "Tekst", en: "Text" },
    wifi: { sr: "Wi-Fi", en: "Wi-Fi" },
  },
  link: { sr: "Adresa", en: "Address" },
  linkPlaceholder: { sr: "npr. nauciai.com ili instagram.com/tvojkafic", en: "e.g. nauciai.com or instagram.com/yourcafe" },
  text: { sr: "Tekst", en: "Text" },
  textPlaceholder: { sr: "npr. jelovnik, adresa ili poruka", en: "e.g. a menu, an address or a message" },
  ssid: { sr: "Ime mreže", en: "Network name" },
  password: { sr: "Lozinka", en: "Password" },
  security: { sr: "Zaštita", en: "Security" },
  securities: {
    WPA: { sr: "WPA/WPA2 (najčešće)", en: "WPA/WPA2 (most common)" },
    WEP: { sr: "WEP (stari ruter)", en: "WEP (old router)" },
    nopass: { sr: "Bez lozinke", en: "No password" },
  },
  hidden: { sr: "Skrivena mreža", en: "Hidden network" },
  wifiNote: {
    sr: "Lozinka ostaje samo u kodu - ne šaljemo je nigde.",
    en: "The password stays in the code only - we do not send it anywhere.",
  },
  colors: { sr: "Boje", en: "Colours" },
  customColors: { sr: "Svoje boje", en: "Your colours" },
  dots: { sr: "Tačke", en: "Dots" },
  background: { sr: "Pozadina", en: "Background" },
  style: { sr: "Oblik tačaka", en: "Dot shape" },
  styles: {
    square: { sr: "Kvadrati", en: "Squares" },
    rounded: { sr: "Zaobljeno", en: "Rounded" },
    dots: { sr: "Tačkice", en: "Dots" },
  },
  problems: {
    prazno: { sr: "Popuni polje iznad.", en: "Fill in the field above." },
    "los-link": {
      sr: "To ne liči na adresu sajta. Primer: nauciai.com",
      en: "That does not look like a website address. Example: nauciai.com",
    },
    predugo: {
      sr: "Predugo za QR kod koji telefon lako čita. Skrati tekst ili stavi link.",
      en: "Too long for a QR code a phone reads easily. Shorten the text or use a link.",
    },
  },
  colorProblems: {
    "nevazeca-boja": { sr: "Boja nije ispravna.", en: "The colour is not valid." },
    "slab-kontrast": {
      sr: "Boje su preslične - kamera neće videti kod. Uzmi tamnije tačke ili svetliju pozadinu.",
      en: "The colours are too similar - the camera will not see the code. Use darker dots or a lighter background.",
    },
    obrnuto: {
      sr: "Svetle tačke na tamnoj pozadini mnoge kamere ne čitaju. Neka tačke budu tamnije od pozadine.",
      en: "Many cameras cannot read light dots on a dark background. Make the dots darker than the background.",
    },
  },
  scanHint: {
    sr: "Probaj ga kamerom telefona pre štampe.",
    en: "Test it with your phone camera before printing.",
  },
} satisfies CopyTree;

/** S31 - vektor (SVG). */
export const CREA_VECTOR_COPY = {
  mode: { sr: "Vrsta", en: "Kind" },
  modes: {
    crno: { sr: "Crno-belo · logo, potpis, crtež", en: "Black and white · logo, signature, drawing" },
    boje: { sr: "U boji · do {n} boja", en: "In colour · up to {n} colours" },
  },
  colors: { sr: "Broj boja", en: "Number of colours" },
  corners: { sr: "Ivice", en: "Edges" },
  cornerModes: {
    spline: { sr: "Glatke", en: "Smooth" },
    polygon: { sr: "Oštre", en: "Sharp" },
  },
  clean: { sr: "Očisti sitne tačke", en: "Clean up tiny specks" },
  cleanHint: {
    sr: "Veće = manje sitnih mrlja, ali gube se i najsitniji detalji.",
    en: "Higher = fewer tiny specks, but the finest details go too.",
  },
  tip: {
    sr: "Najbolje radi na logou ili crtežu sa čistom pozadinom. Fotka postaje „poster“ od nekoliko boja.",
    en: "Works best on a logo or drawing with a clean background. A photo turns into a poster of a few colours.",
  },
  stats: { sr: "{paths} oblika · {size}", en: "{paths} shapes · {size}" },
  svgOnly: {
    sr: "SVG se preuzima (ne ide u galeriju) - otvara se u Canvi, Figmi, Illustratoru i u browseru.",
    en: "The SVG is downloaded (it does not go to the gallery) - it opens in Canva, Figma, Illustrator and the browser.",
  },
} satisfies CopyTree;

/** S31 - GIF od slika. */
export const CREA_GIF_COPY = {
  choose: { sr: "Izaberi slike", en: "Choose images" },
  addMore: { sr: "Dodaj još", en: "Add more" },
  dropLabel: { sr: "Pusti slike bilo gde", en: "Drop the images anywhere" },
  dropBody: {
    sr: "Svaka slika postaje jedna sličica GIF-a, redom kojim su izabrane.",
    en: "Each image becomes one frame of the GIF, in the order you picked them.",
  },
  frames: { sr: "Sličice ({n})", en: "Frames ({n})" },
  minFrames: { sr: "Treba bar {n} slike.", en: "You need at least {n} images." },
  maxFrames: { sr: "Najviše {n} slika - ostale smo preskočili.", en: "At most {n} images - we skipped the rest." },
  moveUp: { sr: "Pomeri sličicu {n} unazad", en: "Move frame {n} back" },
  moveDown: { sr: "Pomeri sličicu {n} unapred", en: "Move frame {n} forward" },
  remove: { sr: "Ukloni sličicu {n}", en: "Remove frame {n}" },
  speed: { sr: "Brzina", en: "Speed" },
  size: { sr: "Veličina", en: "Size" },
  sizeValue: { sr: "{n} px", en: "{n} px" },
  fit: { sr: "Slike drugog oblika", en: "Images of another shape" },
  fits: {
    contain: { sr: "Cele, uz trake", en: "Whole, with bars" },
    cover: { sr: "Popuni kadar", en: "Fill the frame" },
  },
  loop: { sr: "{n} sličica · petlja {s} s", en: "{n} frames · {s} s loop" },
  play: { sr: "Pusti animaciju", en: "Play the animation" },
  pause: { sr: "Zaustavi animaciju", en: "Stop the animation" },
  skipped: {
    sr: "Neke fajlove nismo mogli da otvorimo pa su preskočeni.",
    en: "Some files could not be opened, so they were skipped.",
  },
} satisfies CopyTree;

/** S32 - tekst sa slike. */
export const CREA_OCR_COPY = {
  script: { sr: "Pismo na slici", en: "Script in the image" },
  scripts: {
    oba: { sr: "Ne znam / oba", en: "Not sure / both" },
    latinica: { sr: "Latinica", en: "Latin" },
    cirilica: { sr: "Ćirilica", en: "Cyrillic" },
  },
  scriptHint: {
    sr: "Ako znaš pismo, izaberi ga - prepoznavanje je brže i tačnije.",
    en: "If you know the script, pick it - recognition is faster and more accurate.",
  },
  resultLabel: { sr: "Prepoznat tekst", en: "Recognised text" },
  empty: {
    sr: "Na slici nismo našli tekst. Probaj oštriju fotku, snimljenu pravo, na dobrom svetlu.",
    en: "We found no text in the image. Try a sharper photo, taken straight on, in good light.",
  },
  stats: { sr: "{words} reči · pouzdanost {confidence} %", en: "{words} words · {confidence}% confidence" },
  lowConfidence: {
    sr: "Deo teksta je možda pogrešno pročitan. Proveri ga, a za bolji rezultat slikaj pravo i bliže.",
    en: "Some of the text may be misread. Check it, and for a better result take the photo straight on and closer.",
  },
  toLatin: { sr: "Prebaci u latinicu", en: "Convert to Latin" },
  toCyrillic: { sr: "Prebaci u ćirilicu", en: "Convert to Cyrillic" },
  original: { sr: "Kao na slici", en: "As in the image" },
  copyText: { sr: "Kopiraj tekst", en: "Copy text" },
} satisfies CopyTree;
