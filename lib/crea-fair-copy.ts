import type { FreeRedoReason } from "../convex/creaFairCore";
import type { LocalizedText } from "./i18n";

/** Tekstovi K28: pošteni krediti (U7), provera opisa (C7), „neograničeno" (C8), pomoćnik (U12) i tabla (U13). */

export const CREA_PRICE_COPY = {
  open: { sr: "Cena u dinarima", en: "Price in dinars" },
  title: { sr: "Koliko ovo košta", en: "What this costs" },
  final: { sr: "Ovaj rad", en: "This piece" },
  draft: { sr: "Jeftina proba pre toga", en: "A cheap test first" },
  draftHint: {
    sr: "Proba je skica jeftinijim modelom. Ako ti se svidi, „Usavrši” je pretvara u konačan rad.",
    en: "A test is a sketch with a cheaper model. If you like it, “Refine” turns it into the final piece.",
  },
  today: { sr: "Danas potrošeno", en: "Spent today" },
  limit: { sr: "tvoj limit {limit} kr", en: "your limit {limit} cr" },
  noLimit: { sr: "Postavi dnevni limit", en: "Set a daily limit" },
  rateHint: { sr: "Krediti se plaćaju u evrima; dinari su samo za lakše poređenje.", en: "Credits are paid in euros; dinars are only there to compare more easily." },
  free: { sr: "Besplatno", en: "Free" },
} satisfies Record<string, LocalizedText>;

export const CREA_LIMIT_COPY = {
  title: { sr: "Dnevni limit potrošnje", en: "Daily spending limit" },
  body: {
    sr: "Sam odredi koliko kredita Crea sme da potroši u jednom danu. Kad posao pređe limit, ne pokreće se - krediti ostaju na nalogu.",
    en: "Decide how many credits Crea may spend in one day. A job over the limit does not start - your credits stay on the account.",
  },
  label: { sr: "Najviše kredita dnevno", en: "Most credits per day" },
  save: { sr: "Sačuvaj limit", en: "Save limit" },
  remove: { sr: "Bez limita", en: "No limit" },
  saved: { sr: "Sačuvano.", en: "Saved." },
  none: { sr: "Limit nije postavljen.", en: "No limit set." },
  current: { sr: "Danas: {spent} od {limit} kr", en: "Today: {spent} of {limit} cr" },
  invalid: { sr: "Upiši broj od 10 do 100 000.", en: "Enter a number from 10 to 100,000." },
} satisfies Record<string, LocalizedText>;

export const CREA_CANCEL_COPY = {
  cancel: { sr: "Otkaži", en: "Cancel" },
  cancelTitle: { sr: "Otkaži posao i vrati kredite", en: "Cancel the job and get your credits back" },
  cancelling: { sr: "Otkazujem…", en: "Cancelling…" },
  NE_MOZE: {
    sr: "Ovaj posao više ne može da se zaustavi. Ako ne uspe, krediti se vraćaju sami.",
    en: "This job can no longer be stopped. If it fails, the credits come back on their own.",
  },
  VEC_RADI: {
    sr: "Model je već počeo, pa se posao ne može otkazati - plaćen je provajderu. Stiže uskoro.",
    en: "The model has already started, so the job cannot be cancelled - the provider has charged for it. It arrives soon.",
  },
  GRESKA: { sr: "Otkaz nije prošao. Pokušaj ponovo.", en: "The cancel did not go through. Try again." },
} satisfies Record<string, LocalizedText>;

export const CREA_REDO_COPY = {
  open: { sr: "Rad je pokvaren? Ponovi besplatno", en: "Is the piece broken? Redo it for free" },
  title: { sr: "Šta nije u redu?", en: "What is wrong?" },
  body: {
    sr: "Pravimo isti rad još jednom, za 0 kredita. Važi 48 sati, jednom po radu, do 2 puta dnevno.",
    en: "We make the same piece once more, for 0 credits. Valid for 48 hours, once per piece, up to 2 times a day.",
  },
  confirm: { sr: "Ponovi za 0 kr", en: "Redo for 0 cr" },
  cancel: { sr: "Odustani", en: "Never mind" },
  started: { sr: "Ponavljanje je krenulo - stiže u istoriju.", en: "The redo has started - it arrives in your history." },
  left: { sr: "Danas još {count}", en: "{count} left today" },
} satisfies Record<string, LocalizedText>;

export const CREA_REDO_REASONS: Record<FreeRedoReason, LocalizedText> = {
  prazno: { sr: "Prazno, crno ili šum", en: "Blank, black or noise" },
  iskrivljeno: { sr: "Iskrivljeno lice ili ruke", en: "Distorted face or hands" },
  pogresno: { sr: "Nema veze sa opisom", en: "Nothing to do with the description" },
  tekst: { sr: "Natpis je pogrešan", en: "The lettering is wrong" },
  pokret: { sr: "Video se ne pomera", en: "The video does not move" },
  zvuk: { sr: "Zvuk je prazan ili krči", en: "The sound is empty or crackles" },
};

export const CREA_CHECK_COPY = {
  title: { sr: "Provera opisa - ništa nije naplaćeno", en: "Description check - nothing was charged" },
  why: { sr: "Zašto", en: "Why" },
  fix: { sr: "Kako da ispraviš", en: "How to fix it" },
  close: { sr: "Razumem", en: "Got it" },
} satisfies Record<string, LocalizedText>;

export const CREA_FAIR_COPY = {
  toggle: { sr: "Neograničeno", en: "Unlimited" },
  toggleHint: { sr: "spori red · još {left}", en: "slow queue · {left} left" },
  toggleTitle: {
    sr: "Uz Premium plan jeftini modeli rade bez kredita: jedan posao u isto vreme, u sporom redu, do {monthly} radova u 30 dana.",
    en: "With the Premium plan the cheap models work without credits: one job at a time, in a slow queue, up to {monthly} pieces in 30 days.",
  },
  generate: { sr: "Pošalji u spori red", en: "Send to slow queue" },
} satisfies Record<string, LocalizedText>;

export const CREA_ASSISTANT_COPY = {
  intro: {
    sr: "Reci u jednoj rečenici šta ti treba - npr. „reklama za kafić sa videom i muzikom”. Pomoćnik sklopi korake, pokaže ukupnu cenu i čeka tvoje „da”.",
    en: "Say in one sentence what you need - e.g. “an ad for a café with video and music”. The assistant puts the steps together, shows the total price and waits for your “yes”.",
  },
  placeholder: { sr: "Šta praviš?", en: "What are you making?" },
  plan: { sr: "Sklopi plan", en: "Make a plan" },
  planning: { sr: "Sklapam…", en: "Planning…" },
  free: { sr: "Plan je besplatan. Plaćaš tek kad kažeš „da”.", en: "The plan is free. You only pay once you say “yes”." },
  you: { sr: "Ti", en: "You" },
  helper: { sr: "Pomoćnik", en: "Assistant" },
  total: { sr: "Ukupno", en: "Total" },
  askYes: { sr: "Da pokrenem? Napiši „da” ili klikni dugme.", en: "Shall I start? Type “yes” or press the button." },
  yes: { sr: "Da, pokreni", en: "Yes, start" },
  no: { sr: "Ne, promeni", en: "No, change it" },
  answerLabel: { sr: "Tvoj odgovor", en: "Your answer" },
  send: { sr: "Pošalji", en: "Send" },
  notYes: { sr: "Ništa nisam pokrenuo. Za početak napiši „da”, ili opiši drugačiji plan.", en: "I started nothing. To begin, type “yes”, or describe a different plan." },
  unavailable: { sr: "Za ovaj korak sada nema dostupnog modela - preskačem ga.", en: "No model is available for this step right now - I am skipping it." },
  fromStep: { sr: "od slike iz koraka {step}", en: "from the image in step {step}" },
  running: { sr: "Radim korak po korak", en: "Working step by step" },
  done: { sr: "Gotovo - svi koraci su u istoriji.", en: "Done - every step is in your history." },
  stopped: { sr: "Stao sam. Koraci posle ovoga nisu pokrenuti ni naplaćeni.", en: "I stopped. The steps after this were not started or charged." },
  stop: { sr: "Zaustavi ostatak", en: "Stop the rest" },
  newPlan: { sr: "Nov plan", en: "New plan" },
  waiting: { sr: "čeka", en: "waiting" },
  working: { sr: "radi", en: "working" },
  ready: { sr: "gotovo", en: "done" },
  failed: { sr: "nije uspelo", en: "failed" },
  demo: { sr: "DEMO plan (bez Google ključa)", en: "DEMO plan (no Google key)" },
  limit: { sr: "Danas je pomoćnik iskorišćen. Sutra opet.", en: "The assistant has been used up today. Again tomorrow." },
  error: { sr: "Pomoćnik nije uspeo da sklopi plan. Pokušaj ponovo.", en: "The assistant could not make a plan. Try again." },
  steps: {
    slika: { sr: "Slika", en: "Image" },
    video: { sr: "Video", en: "Video" },
    muzika: { sr: "Muzika", en: "Music" },
    govor: { sr: "Glas", en: "Voice" },
  },
} as const;

export const CREA_BOARD_COPY = {
  tabHistory: { sr: "Istorija", en: "History" },
  tabBoard: { sr: "Tabla", en: "Board" },
  title: { sr: "Tabla", en: "Board" },
  hint: {
    sr: "Skupi reference i radove na jednu tablu. Prevuci karticu na polje za opis - postaje referenca.",
    en: "Gather references and pieces on one board. Drag a card onto the description field - it becomes a reference.",
  },
  addWork: { sr: "Rad", en: "Piece" },
  addWorkTitle: { sr: "Dodaj rad iz galerije", en: "Add a piece from the gallery" },
  addNote: { sr: "Beleška", en: "Note" },
  addImage: { sr: "Slika", en: "Image" },
  addImageTitle: { sr: "Okači referencu sa uređaja (0 kr)", en: "Upload a reference from your device (0 cr)" },
  uploading: { sr: "Kačim…", en: "Uploading…" },
  zoomIn: { sr: "Uvećaj", en: "Zoom in" },
  zoomOut: { sr: "Umanji", en: "Zoom out" },
  fit: { sr: "Vrati na početak", en: "Back to start" },
  expand: { sr: "Otvori tablu preko celog ekrana", en: "Open the board full screen" },
  close: { sr: "Zatvori tablu", en: "Close the board" },
  useAsReference: { sr: "Kao referenca", en: "As reference" },
  remove: { sr: "Skloni sa table", en: "Remove from board" },
  notePlaceholder: { sr: "Ideja, boja, rečenica…", en: "An idea, a colour, a sentence…" },
  empty: {
    sr: "Tabla je prazna. Dodaj rad iz galerije, okači sliku ili napiši belešku.",
    en: "The board is empty. Add a piece from the gallery, upload an image or write a note.",
  },
  missing: { sr: "Rad više nije u galeriji.", en: "The piece is no longer in the gallery." },
  pickTitle: { sr: "Izaberi rad", en: "Pick a piece" },
  pickEmpty: { sr: "Još nemaš gotovih radova.", en: "You have no finished pieces yet." },
  full: { sr: "Tabla je puna (200 stavki). Skloni nešto pa dodaj.", en: "The board is full (200 items). Remove something, then add." },
  failed: { sr: "Nije uspelo. Pokušaj ponovo.", en: "That did not work. Try again." },
  dropHere: { sr: "Pusti ovde - postaje referenca", en: "Drop here - it becomes a reference" },
  moveHint: {
    sr: "Vuci prazno mesto da se pomeriš, točkić ili dugmad za zum. Kartice se pomeraju vučenjem.",
    en: "Drag empty space to move around, wheel or buttons to zoom. Cards move by dragging.",
  },
} satisfies Record<string, LocalizedText>;
