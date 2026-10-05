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
  needText: { sr: "Prvo popuni polje iznad dugmeta.", en: "Fill in the field above the button first." },
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

// ── K12: izmene II (S15, S18-S23) ────────────────────────────────────────────

/** Proširi ili iseci kadar (S15). */
export const CREA_REFRAME_COPY = {
  target: { sr: "Za šta praviš sliku?", en: "What is the image for?" },
  same: {
    sr: "Fotka već ima taj oblik - ne treba ni seći ni proširivati. Izaberi drugi format.",
    en: "The photo already has that shape - no need to crop or expand. Pick another format.",
  },
  cropTitle: { sr: "Iseci - besplatno, na tvom uređaju", en: "Crop - free, on your device" },
  cropBody: {
    sr: "Deo fotke ostaje van kadra. Pomeri kadar da izabereš šta ostaje.",
    en: "Part of the photo stays outside the frame. Move the frame to choose what stays.",
  },
  shift: { sr: "Pomeri kadar", en: "Move the frame" },
  shiftX: { sr: "levo ↔ desno", en: "left ↔ right" },
  shiftY: { sr: "gore ↔ dole", en: "up ↔ down" },
  run: { sr: "Iseci besplatno", en: "Crop for free" },
  previewLabel: { sr: "Pregled: svetli deo ostaje u kadru", en: "Preview: the bright part stays in the frame" },
  expandTitle: { sr: "Ili proširi - AI doslika ono što fali", en: "Or expand - AI paints in what is missing" },
  expandBody: {
    sr: "Cela fotka ostaje, a AI doslika prazan deo {where}. Nova slika stiže u istoriju kao verzija ove.",
    en: "The whole photo stays and AI paints the empty part {where}. The new image arrives in your history as a version of this one.",
  },
  whereVertical: { sr: "gore i dole", en: "above and below" },
  whereHorizontal: { sr: "levo i desno", en: "left and right" },
  modelRatio: {
    sr: "AI pravi kadar {ratio} (najbliži koji ume); na tačan {target} ga posle iseci ovde, besplatno.",
    en: "AI makes a {ratio} frame (the closest it supports); crop it to exactly {target} here afterwards, for free.",
  },
  expandPreviewLabel: { sr: "Pregled: sivi deo doslikava AI", en: "Preview: AI paints the grey part" },
  expandCta: { sr: "Proširi AI-jem", en: "Expand with AI" },
  extraLabel: { sr: "Šta da bude u novom delu? (može prazno)", en: "What goes in the new part? (optional)" },
  extraPlaceholder: { sr: "npr. više neba, ulica se nastavlja", en: "e.g. more sky, the street continues" },
  result: { sr: "{w} × {h} px", en: "{w} × {h} px" },
  belowRecommended: {
    sr: "Isečak je manji od preporučenih {w} px, pa ga ne uvećavamo (uvećanje samo zamuti).",
    en: "The crop is smaller than the recommended {w} px, so we do not enlarge it (enlarging only blurs).",
  },
} satisfies CopyTree;

/** Novo svetlo (S18). */
export const CREA_RELIGHT_COPY = {
  sphereLabel: {
    sr: "Kugla sa suncem. Prevuci sunce mišem ili prstom po kugli; klizači ispod rade isto.",
    en: "A sphere with a sun. Drag the sun across the sphere with the mouse or a finger; the sliders below do the same.",
  },
  sphereHint: { sr: "Prevuci po kugli - tamo ide sunce.", en: "Drag across the sphere - that is where the sun goes." },
  noWebgl: {
    sr: "3D kugla ne radi u ovom browseru - smer biraj klizačima.",
    en: "The 3D sphere does not work in this browser - pick the direction with the sliders.",
  },
  presets: { sr: "Brzi izbor", en: "Quick picks" },
  azimuth: { sr: "Smer (levo ↔ desno, ±180° = otpozadi)", en: "Direction (left ↔ right, ±180° = behind)" },
  elevation: { sr: "Visina sunca", en: "Sun height" },
  kelvin: { sr: "Toplina (toplo ↔ hladno)", en: "Warmth (warm ↔ cold)" },
  softness: { sr: "Kakvo svetlo", en: "Kind of light" },
  softnesses: {
    meko: { sr: "Meko (oblačno, prozor)", en: "Soft (overcast, window)" },
    tvrdo: { sr: "Tvrdo (jako sunce, blic)", en: "Hard (strong sun, flash)" },
  },
  summary: { sr: "Svetlo: {summary}", en: "Light: {summary}" },
  promptTitle: { sr: "Ovo ide modelu (sastavljeno od tvog izbora):", en: "This goes to the model (built from your choice):" },
  cta: { sr: "Osvetli AI-jem", en: "Relight with AI" },
  extraLabel: { sr: "Još nešto o svetlu? (može prazno)", en: "Anything else about the light? (optional)" },
  extraPlaceholder: { sr: "npr. neonski odsjaj u kosi", en: "e.g. a neon glow in the hair" },
} satisfies CopyTree;

/** Uglovi kamere (S19). */
export const CREA_ANGLES_COPY = {
  mode: { sr: "Šta radiš", en: "What are you doing" },
  modes: {
    napravi: { sr: "Napravi 9 uglova", en: "Make 9 angles" },
    iseci: { sr: "Iseci mrežu u 9 radova", en: "Cut a grid into 9 works" },
  },
  whyTitle: { sr: "Zašto je ovako jeftinije?", en: "Why is this cheaper?" },
  whyBody: {
    sr: "Plaćaš JEDNU sliku (mreža 3×3 u 4K) - {grid} - umesto devet zasebnih ({separately}). To je oko {perAngle} po uglu, {percent} % manje. Mrežu ti posle besplatno isečemo na uređaju u 9 radova, a svih 9 uglova je iz istog poziva, pa su lik, odeća i svetlo isti.",
    en: "You pay for ONE image (a 3×3 grid in 4K) - {grid} - instead of nine separate ones ({separately}). That is about {perAngle} per angle, {percent}% less. We then cut the grid into 9 works on your device for free, and all 9 angles come from the same call, so the character, clothes and light match.",
  },
  whyFallback: {
    sr: "Plaćaš jednu sliku umesto devet: mrežu 3×3 ti posle besplatno isečemo na uređaju u 9 radova.",
    en: "You pay for one image instead of nine: we then cut the 3×3 grid into 9 works on your device for free.",
  },
  angles: { sr: "Uglovi u mreži", en: "Angles in the grid" },
  cta: { sr: "Napravi mrežu 9 uglova", en: "Make a 9-angle grid" },
  extraLabel: { sr: "Još nešto? (može prazno)", en: "Anything else? (optional)" },
  extraPlaceholder: { sr: "npr. bela pozadina, studijsko svetlo", en: "e.g. white background, studio light" },
  waiting: {
    sr: "Mreža se pravi… Ostani ovde: čim stigne, isečemo je u 9 radova.",
    en: "The grid is being made… Stay here: as soon as it arrives we cut it into 9 works.",
  },
  failed: { sr: "Mreža nije uspela, krediti su vraćeni. Probaj ponovo.", en: "The grid failed and your credits were returned. Try again." },
  arrived: { sr: "Mreža je stigla.", en: "The grid has arrived." },
  cut: { sr: "Iseci u 9 radova · besplatno", en: "Cut into 9 works · free" },
  cutsTitle: { sr: "9 uglova", en: "9 angles" },
  saveAll: { sr: "Sačuvaj svih 9 u galeriju", en: "Save all 9 to the gallery" },
  savingN: { sr: "Čuvam {n} od 9…", en: "Saving {n} of 9…" },
  savedAll: { sr: "Sačuvano svih 9 - svaki ugao je zaseban rad u istoriji.", en: "All 9 saved - every angle is a separate work in your history." },
  savedSome: {
    sr: "Sačuvano {n} od 9. {reason} Klikni ponovo da sačuvaš ostale.",
    en: "Saved {n} of 9. {reason} Click again to save the rest.",
  },
  saveRest: { sr: "Sačuvaj preostale", en: "Save the rest" },
  downloadAll: { sr: "Preuzmi svih 9", en: "Download all 9" },
  downloadOne: { sr: "Preuzmi: {name}", en: "Download: {name}" },
  another: { sr: "Nova mreža", en: "A new grid" },
  noAccess: {
    sr: "Čuvanje u galeriju je za sada samo za polaznike kursa - možeš da preuzmeš.",
    en: "Saving to the gallery is only for course students for now - you can download.",
  },
  demoNote: {
    sr: "DEMO rad (bez ključa provajdera) nije prava mreža - isečci pokazuju samo kako tok radi.",
    en: "A DEMO work (no provider key) is not a real grid - the cuts only show how the flow works.",
  },
} satisfies CopyTree;

/** Slojevi (S20). */
export const CREA_LAYERS_COPY = {
  count: { sr: "Na koliko slojeva", en: "How many layers" },
  countUnit: { sr: "{n} slojeva", en: "{n} layers" },
  priceNote: { sr: "Plaća se po sloju: više slojeva = više kredita.", en: "You pay per layer: more layers = more credits." },
  cta: { sr: "Rastavi na slojeve", en: "Split into layers" },
  extraLabel: { sr: "Šta da bude zaseban sloj? (može prazno)", en: "What should be a separate layer? (optional)" },
  extraPlaceholder: { sr: "npr. pozadina, osoba, natpis", en: "e.g. background, person, sign" },
  waiting: { sr: "Rastavljam sliku na slojeve…", en: "Splitting the image into layers…" },
  arriving: { sr: "Stižu slojevi: {n} od {total}…", en: "Layers arriving: {n} of {total}…" },
  failed: { sr: "Razlaganje nije uspelo, krediti su vraćeni.", en: "Splitting failed and your credits were returned." },
  again: { sr: "Probaj sa drugom slikom", en: "Try another image" },
  loading: { sr: "Učitavam slojeve…", en: "Loading the layers…" },
  loadFailed: { sr: "Slojevi se nisu učitali. Osveži stranu i probaj ponovo.", en: "The layers did not load. Refresh the page and try again." },
  canvasLabel: {
    sr: "Platno sa slojevima. Klikni na deo slike da izabereš njegov sloj, pa ga prevuci; strelice ga pomeraju.",
    en: "Canvas with layers. Click part of the image to pick its layer, then drag it; the arrow keys move it.",
  },
  list: { sr: "Slojevi (odozgo nadole)", en: "Layers (top to bottom)" },
  hide: { sr: "Sakrij", en: "Hide" },
  show: { sr: "Prikaži", en: "Show" },
  up: { sr: "Pomeri gore", en: "Move up" },
  down: { sr: "Pomeri dole", en: "Move down" },
  recolorColor: { sr: "Nova boja", en: "New colour" },
  recolorCustom: { sr: "Svoja", en: "Custom" },
  recolorAmount: { sr: "Jačina boje", en: "Colour strength" },
  merge: { sr: "Spoji sa donjim", en: "Merge down" },
  mergeHidden: { sr: "Sakriven sloj se ne spaja - prvo ga prikaži.", en: "A hidden layer is not merged - show it first." },
  reset: { sr: "Vrati sve", en: "Reset all" },
  selected: { sr: "Izabran: {name}", en: "Selected: {name}" },
  noneSelected: { sr: "Izaberi sloj sa spiska ili klikom na sliku.", en: "Pick a layer from the list or by clicking the image." },
  run: { sr: "Napravi sliku", en: "Make the image" },
  result: { sr: "{w} × {h} px · vidljivih slojeva: {n}", en: "{w} × {h} px · visible layers: {n}" },
  demoNote: {
    sr: "DEMO slojevi (bez ključa provajdera) su oblici, ne delovi tvoje slike - editor radi isto.",
    en: "DEMO layers (no provider key) are shapes, not parts of your image - the editor works the same.",
  },
} satisfies CopyTree;

/** Tekst kao sloj (S21). */
export const CREA_TEXT_LAYER_COPY = {
  find: { sr: "Pronađi tekst", en: "Find the text" },
  findNote: {
    sr: "Prvi put preuzima ~{size} (jednom), pa radi i bez interneta.",
    en: "The first time downloads ~{size} (once), then it works offline too.",
  },
  skip: { sr: "Samo dodaj tekst, bez prepoznavanja", en: "Just add text, without recognition" },
  none: {
    sr: "Na slici nismo našli tekst. Možeš i sam da dodaš tekst.",
    en: "We found no text in the image. You can add text yourself.",
  },
  found: {
    sr: "Pronađeno redova: {n}. Ispravi tekst ako treba - tako će izgledati novi sloj.",
    en: "Lines found: {n}. Fix the text if needed - that is how the new layer will look.",
  },
  lineLabel: { sr: "Red {n}", en: "Line {n}" },
  lineInclude: { sr: "Obriši i vrati kao sloj", en: "Erase and bring back as a layer" },
  lowConfidence: { sr: "nesigurno", en: "unsure" },
  erase: { sr: "Obriši stari tekst i postavi novi", en: "Erase the old text and place the new one" },
  eraseNote: {
    sr: "Brisanje je na tvom uređaju; prvi put preuzima ~{size}.",
    en: "Erasing runs on your device; the first time downloads ~{size}.",
  },
  needLine: { sr: "Izaberi bar jedan red.", en: "Pick at least one line." },
  paidTitle: { sr: "Stari tekst je preko lica ili šare?", en: "Old text over a face or a pattern?" },
  paidBody: {
    sr: "Besplatno brisanje dobro radi na ravnoj pozadini. Za tešku pozadinu obriši AI-jem; kad rad stigne, otvori ga u ovom alatu i dodaj tekst.",
    en: "Free erasing works well on a plain background. For a busy background erase with AI; when the work arrives, open it in this tool and add the text.",
  },
  editorNote: {
    sr: "Tekst je sada sloj: menjaj slova, font i boju u panelu - č ć š ž đ i ćirilica su tačni jer ih piše font, ne AI.",
    en: "The text is now a layer: change the letters, font and colour in the panel - Serbian letters and Cyrillic are exact because a font writes them, not AI.",
  },
  restart: { sr: "Druga slika", en: "Another image" },
  restartConfirm: { sr: "Kreni ispočetka? Izmene na ovoj slici se gube.", en: "Start over? Changes on this image will be lost." },
} satisfies CopyTree;

/** Retuš i stare fotke (S22). */
export const CREA_RETOUCH_COPY = {
  level: { sr: "Koliko", en: "How much" },
  levels: {
    blago: { sr: "Blago", en: "Gentle" },
    srednje: { sr: "Srednje", en: "Medium" },
    jace: { sr: "Jače", en: "Stronger" },
  },
  how: {
    sr: "Zaglađuje samo kožu (fleke, pore, crvenilo); oči, obrve, usne i kosa ostaju oštri. Sve je na tvom uređaju.",
    en: "Smooths only the skin (spots, pores, redness); eyes, brows, lips and hair stay sharp. Everything stays on your device.",
  },
  run: { sr: "Retuširaj besplatno", en: "Retouch for free" },
  noSkin: {
    sr: "Na ovoj fotki nema dovoljno kože za retuš. Probaj portret.",
    en: "There is not enough skin in this photo to retouch. Try a portrait.",
  },
  shrunk: { sr: "Slika je smanjena na {w} × {h} px da bi radilo i na telefonu.", en: "The image was reduced to {w} × {h} px so it works on phones too." },
  restoreTitle: { sr: "Vrati staru fotku", en: "Restore an old photo" },
  restoreBody: {
    sr: "Ogrebotine, pukotine, mrlje i izbledeli delovi - AI ih popravi, a lica ostaju ista.",
    en: "Scratches, cracks, stains and faded patches - AI fixes them while faces stay the same.",
  },
  colorize: { sr: "Oboji crno-belu fotku", en: "Colourise a black-and-white photo" },
  restoreCta: { sr: "Vrati fotku AI-jem", en: "Restore with AI" },
  restoreSoon: { sr: "Vraćanje starih fotki stiže uskoro.", en: "Restoring old photos is coming soon." },
  extraLabel: { sr: "Šta još da se popravi? (može prazno)", en: "Anything else to fix? (optional)" },
  extraPlaceholder: { sr: "npr. pocepan ugao gore levo", en: "e.g. a torn corner top left" },
} satisfies CopyTree;

/** Odeća i proizvodi (S23). */
export const CREA_PRODUCT_COPY = {
  mode: { sr: "Šta radiš", en: "What are you doing" },
  modes: {
    odeca: { sr: "Probaj odeću", en: "Try on clothes" },
    proizvod: { sr: "Proizvod u scenu", en: "Product into a scene" },
  },
  person: { sr: "Fotka osobe (cela ili do pojasa)", en: "Photo of the person (full or waist up)" },
  garment: { sr: "Fotka odevnog predmeta", en: "Photo of the garment" },
  tryonNeed: { sr: "Dodaj obe fotke.", en: "Add both photos." },
  tryonCta: { sr: "Obuci AI-jem", en: "Dress with AI" },
  tryonNote: {
    sr: "Najbolje radi kad je odeća fotografisana sama, na ravnoj pozadini, a osoba spreda.",
    en: "Works best when the garment is photographed alone on a plain background and the person faces the camera.",
  },
  product: { sr: "Fotka proizvoda", en: "Photo of the product" },
  productHint: { sr: "Klikni na proizvod da ga isečemo (na tvom uređaju, 0 kr).", en: "Click the product so we cut it out (on your device, 0 cr)." },
  needCut: { sr: "Prvo klikni na proizvod (ili ga označi četkicom).", en: "First click the product (or mark it with the brush)." },
  cutRun: { sr: "Iseci proizvod", en: "Cut out the product" },
  scene: { sr: "Fotka scene (može i bez nje - onda opiši scenu)", en: "Photo of the scene (optional - then describe the scene)" },
  sceneLabel: { sr: "Gde da stoji proizvod?", en: "Where should the product be?" },
  scenePlaceholder: { sr: "npr. na drvenom stolu u kafiću, jutarnje svetlo", en: "e.g. on a wooden café table, morning light" },
  productCta: { sr: "Postavi u scenu", en: "Place in the scene" },
} satisfies CopyTree;
