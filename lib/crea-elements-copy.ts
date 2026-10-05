import type { ElementKind, ElementMappingProblem } from "@/convex/creaElementsCore";

import type { Locale, LocalizedText } from "./i18n";
import { studioErrorMessage } from "./studio-messages";

/**
 * Tekstovi Likova (K14, S34-S36, S24): ekran „Likovi", @pominjanje u opisu,
 * kreator lika i „Zameni lik". Uvoze ih ekran i alati; composer uvozi samo
 * `CREA_MENTION_COPY`.
 */

export const CREA_ELEMENT_KIND_COPY: Record<ElementKind, { one: LocalizedText; many: LocalizedText; add: LocalizedText }> = {
  lik: { one: { sr: "Lik", en: "Character" }, many: { sr: "Likovi", en: "Characters" }, add: { sr: "Novi lik", en: "New character" } },
  mesto: { one: { sr: "Mesto", en: "Place" }, many: { sr: "Mesta", en: "Places" }, add: { sr: "Novo mesto", en: "New place" } },
  predmet: { one: { sr: "Predmet", en: "Object" }, many: { sr: "Predmeti", en: "Objects" }, add: { sr: "Novi predmet", en: "New object" } },
};

export const CREA_ELEMENTS_COPY = {
  how: { sr: "Kako radi", en: "How it works" },
  steps: [
    { sr: "Sačuvaj lik, mesto ili predmet - ime i 1 do 8 slika.", en: "Save a character, place or object - a name and 1 to 8 pictures." },
    { sr: "U opisu slike ili videa napiši @ i izaberi ga.", en: "In an image or video description, type @ and pick it." },
    { sr: "Crea šalje njegove slike modelu kao reference. Bez treniranja.", en: "Crea sends its pictures to the model as references. No training." },
  ],
  all: { sr: "Svi", en: "All" },
  filter: { sr: "Prikaži", en: "Show" },
  creator: { sr: "Napravi lik kao u igrici", en: "Build a character like in a game" },
  emptyTitle: { sr: "Još nemaš sačuvane likove", en: "No saved characters yet" },
  emptyBody: {
    sr: "Sačuvaj sebe, ljubimca, svoju kafanu ili omiljenu šolju - posle ih pozoveš sa @ime u svakoj slici.",
    en: "Save yourself, a pet, your café or a favourite mug - then call them with @name in every picture.",
  },
  loading: { sr: "Učitavam likove…", en: "Loading characters…" },
  images: { sr: "{n} sl.", en: "{n} pic." },
  consentGiven: { sr: "Pristanak dat", en: "Consent given" },
  fictional: { sr: "Izmišljen lik", en: "Fictional character" },
  edit: { sr: "Uredi", en: "Edit" },
  useImage: { sr: "U sliku", en: "In an image" },
  useVideo: { sr: "U video", en: "In a video" },
  swap: { sr: "Stavi u fotku", en: "Put in a photo" },
  limit: {
    sr: "Imaš {n} sačuvanih - obriši neki da napraviš novi.",
    en: "You have {n} saved - delete one to make a new one.",
  },
  privacy: {
    sr: "Likove vidiš samo ti. Slike lika idu modelu samo kad ga pozoveš u opisu.",
    en: "Only you can see your characters. Their pictures go to a model only when you call them in a description.",
  },
  noAccess: {
    sr: "Likove čuvaš kad imaš pristup Crei.",
    en: "You can save characters once you have access to Crea.",
  },
  // Editor
  editTitle: { sr: "Uredi: {name}", en: "Edit: {name}" },
  kind: { sr: "Šta čuvaš?", en: "What are you saving?" },
  name: { sr: "Ime", en: "Name" },
  namePlaceholder: { sr: "npr. Maja", en: "e.g. Maya" },
  handleHint: { sr: "U opisu ga pozivaš kao", en: "In a description you call it as" },
  description: { sr: "Opis (nije obavezno)", en: "Description (optional)" },
  descriptionPlaceholder: { sr: "npr. kratka crna kosa, crvena jakna", en: "e.g. short black hair, red jacket" },
  imagesTitle: { sr: "Slike", en: "Pictures" },
  imagesHintLik: {
    sr: "Najbolje 3 do 5 fotki: spreda, sa strane, uz različito svetlo. Na fotki samo ti.",
    en: "Best are 3 to 5 photos: from the front, from the side, in different light. Only you in the photo.",
  },
  imagesHintOther: { sr: "1 do 8 fotki iz različitih uglova.", en: "1 to 8 photos from different angles." },
  addImages: { sr: "Dodaj slike", en: "Add pictures" },
  dropHere: { sr: "Pusti slike bilo gde", en: "Drop the pictures anywhere" },
  removeImage: { sr: "Ukloni sliku {n}", en: "Remove picture {n}" },
  cover: { sr: "Naslovna", en: "Cover" },
  checking: { sr: "Proveravam lice…", en: "Checking the face…" },
  downloading: { sr: "Preuzimam proveru lica… {p} %", en: "Downloading the face check… {p}%" },
  checkFailed: { sr: "Provera nije uspela na ovom uređaju.", en: "The check did not work on this device." },
  checkOk: { sr: "Fotka je dobra", en: "Good photo" },
  photoN: { sr: "Fotka {n}", en: "Photo {n}" },
  lockedImages: {
    sr: "List iz kreatora se ne menja - možeš da promeniš ime i opis.",
    en: "A sheet from the creator does not change - you can change the name and description.",
  },
  consentLik: {
    sr: "Na fotkama sam ja, ili imam dozvolu osobe sa fotki da je koristim u Crei. Tuđe lice ne čuvam bez pristanka.",
    en: "The photos show me, or I have permission from the person in them to use them in Crea. I do not save someone else's face without consent.",
  },
  consentFictional: {
    sr: "Ovaj lik je izmišljen - ne pravim ga da liči na stvarnu osobu bez njenog pristanka.",
    en: "This character is fictional - I am not making it look like a real person without their consent.",
  },
  save: { sr: "Sačuvaj", en: "Save" },
  saveChanges: { sr: "Sačuvaj izmene", en: "Save changes" },
  cancel: { sr: "Odustani", en: "Cancel" },
  delete: { sr: "Obriši", en: "Delete" },
  confirmDelete: { sr: "Obrisati „{name}“? Slike se brišu zauvek.", en: "Delete “{name}”? The pictures are deleted for good." },
  confirmYes: { sr: "Da, obriši", en: "Yes, delete" },
  confirmNo: { sr: "Ne", en: "No" },
  uploading: { sr: "Šaljem slike {i}/{n}…", en: "Uploading pictures {i}/{n}…" },
  saving: { sr: "Čuvam…", en: "Saving…" },
  saved: { sr: "Sačuvano! U opisu napiši @{handle}.", en: "Saved! Type @{handle} in a description." },
  needName: { sr: "Upiši ime.", en: "Type a name." },
  needImage: { sr: "Dodaj bar jednu sliku.", en: "Add at least one picture." },
  needCheck: { sr: "Sačekaj da se provera fotki završi.", en: "Wait for the photo check to finish." },
  needGoodPhotos: { sr: "Skloni fotke koje nisu prošle proveru.", en: "Remove the photos that did not pass the check." },
  needConsent: { sr: "Označi pristanak da bi sačuvao/la lik.", en: "Tick the consent box to save the character." },
  tooManyImages: { sr: "Najviše 8 slika.", en: "At most 8 pictures." },
  notImage: { sr: "Ovo nije slika (PNG, JPG, WebP ili HEIC).", en: "This is not a picture (PNG, JPG, WebP or HEIC)." },
  imageTooBig: { sr: "Slika je prevelika.", en: "The picture is too big." },
} as const;

export const CREA_MENTION_COPY = {
  button: { sr: "Lik", en: "Character" },
  buttonLabel: { sr: "Dodaj lik, mesto ili predmet u opis", en: "Add a character, place or object to the description" },
  listLabel: { sr: "Tvoji likovi", en: "Your characters" },
  none: { sr: "Još nemaš sačuvane likove.", en: "You have no saved characters yet." },
  create: { sr: "Napravi prvi", en: "Make the first one" },
  noMatch: { sr: "Nema lika sa tim imenom.", en: "No character with that name." },
  remove: { sr: "Skloni {name} iz opisa", en: "Remove {name} from the description" },
  sends: { sr: "Uz opis idu slike: {list}", en: "Pictures sent with the description: {list}" },
  problems: {
    BEZ_REFERENCI: {
      sr: "Ovaj model ne prima likove. Izaberi model koji radi sa referencama, npr. Nano Banana 2.",
      en: "This model does not take characters. Pick a model that works with references, e.g. Nano Banana 2.",
    },
    DRUGI_REZIM: {
      sr: "Likovi idu kao reference - skloni početni i završni kadar ili prebaci na „Sa referencama“.",
      en: "Characters go as references - remove the first and last frame or switch to “With references”.",
    },
    PREVISE_ELEMENATA: {
      sr: "Ovaj model prima najviše {n} likova u jednom poslu - skloni višak iz opisa.",
      en: "This model takes at most {n} characters per job - remove the extra ones from the description.",
    },
  } satisfies Record<ElementMappingProblem, LocalizedText>,
} as const;

export const CREA_CHARACTER_COPY = {
  intro: { sr: "Biraš klikom - ništa ne kucaš. Crea crta tvoj lik spreda, sa strane i otpozadi.", en: "Pick with clicks - no typing. Crea draws your character from the front, the side and the back." },
  surprise: { sr: "Iznenadi me", en: "Surprise me" },
  yourCharacter: { sr: "Tvoj lik", en: "Your character" },
  menus: { sr: "Izgled lika", en: "Character look" },
  name: { sr: "Ime lika", en: "Character name" },
  otherName: { sr: "Ili upiši drugo ime (nije obavezno)", en: "Or type another name (optional)" },
  preview: { sr: "Šta ide modelu", en: "What goes to the model" },
  routePro: { sr: "Nano Banana Pro · najviše detalja", en: "Nano Banana Pro · most detail" },
  route2: { sr: "Nano Banana 2 · jeftinije", en: "Nano Banana 2 · cheaper" },
  cta: { sr: "Napravi list lika", en: "Make the character sheet" },
  waiting: { sr: "Crea crta list lika…", en: "Crea is drawing the character sheet…" },
  arrived: { sr: "List lika je gotov!", en: "The character sheet is ready!" },
  failed: { sr: "List nije napravljen - krediti su vraćeni. Probaj ponovo.", en: "The sheet was not made - the credits are back. Try again." },
  demo: {
    sr: "Ovo je probni (DEMO) list - model nema ključ, pa ne može da se sačuva kao lik.",
    en: "This is a sample (DEMO) sheet - the model has no key, so it cannot be saved as a character.",
  },
  saveTitle: { sr: "Sačuvaj kao Lik", en: "Save as a character" },
  saveCta: { sr: "Sačuvaj kao Lik", en: "Save as a character" },
  saved: { sr: "Lik je sačuvan! Pozovi ga sa @{handle}.", en: "The character is saved! Call it with @{handle}." },
  openLikovi: { sr: "Otvori Likove", en: "Open Characters" },
  useInImage: { sr: "Upotrebi u slici", en: "Use in an image" },
  another: { sr: "Napravi drugi", en: "Make another" },
} as const;

export const CREA_SWAP_COPY = {
  pickLik: { sr: "Koji lik stavljaš u fotku?", en: "Which character goes into the photo?" },
  noLiks: {
    sr: "Prvo sačuvaj svoj lik - u fotku može samo tvoj sačuvani lik, uz tvoj pristanak.",
    en: "Save your character first - only your own saved character can go into a photo, with your consent.",
  },
  openLikovi: { sr: "Otvori Likove", en: "Open Characters" },
  photo: { sr: "Fotka u koju ga stavljaš", en: "The photo to put it in" },
  checking: { sr: "Proveravam lice na fotki…", en: "Checking the face in the photo…" },
  info: {
    sr: "Menjaju se samo lice i kosa; poza, odeća i pozadina ostaju iste.",
    en: "Only the face and hair change; the pose, clothes and background stay the same.",
  },
  consent: {
    sr: "Potvrđujem: lik je moj (ili imam pristanak te osobe), i fotku u koju ga stavljam smem da menjam.",
    en: "I confirm: the character is mine (or I have that person's consent), and I may edit the photo I put it in.",
  },
  needLik: { sr: "Izaberi lik.", en: "Pick a character." },
  needPhoto: { sr: "Izaberi fotku.", en: "Pick a photo." },
  needCheck: { sr: "Sačekaj proveru fotke.", en: "Wait for the photo check." },
  needConsent: { sr: "Označi potvrdu ispod.", en: "Tick the confirmation below." },
  badPhoto: { sr: "Fotka nije prošla proveru: {reason}", en: "The photo did not pass the check: {reason}" },
  cta: { sr: "Zameni lik", en: "Swap the character" },
  routePro: { sr: "Nano Banana Pro · najbolje čuva lice", en: "Nano Banana Pro · keeps the face best" },
  route2: { sr: "Nano Banana 2 · jeftinije", en: "Nano Banana 2 · cheaper" },
} as const;

/**
 * Greške Likova kao rečenica. Prvo kodovi `creaElements`, pa sve ostalo kao kod
 * `createJob`-a (krediti, limiti, tuđ fajl…).
 */
const ELEMENT_ERRORS: Array<[string, LocalizedText]> = [
  ["NEISPRAVNO_IME_ELEMENTA", { sr: "Ime mora da ima od 1 do 40 znakova.", en: "The name must have 1 to 40 characters." }],
  ["PREDUG_OPIS_ELEMENTA", { sr: "Opis može da ima najviše 500 znakova.", en: "The description can have at most 500 characters." }],
  ["BROJ_SLIKA_ELEMENTA", { sr: "Element ima od 1 do 8 različitih slika.", en: "An element has 1 to 8 different pictures." }],
  ["ELEMENT_NIJE_PRONADJEN", { sr: "Ovaj element više ne postoji.", en: "This element no longer exists." }],
  ["PREVISE_LIKOVA", { sr: "Imaš 30 sačuvanih - obriši neki da napraviš novi.", en: "You have 30 saved - delete one to make a new one." }],
  ["SLIKE_ZAKLJUCANE", { sr: "Slike lista iz kreatora se ne menjaju.", en: "The pictures of a creator sheet cannot change." }],
  ["SLIKA_ZAUZETA", { sr: "Ova slika već pripada drugom elementu.", en: "This picture already belongs to another element." }],
  ["NEISPRAVNA_SLIKA_ELEMENTA", { sr: "Element prima samo slike (PNG, JPG ili WebP) koje si sam/a okačio/la.", en: "An element takes only pictures (PNG, JPG or WebP) that you uploaded yourself." }],
  ["PRISTANAK_OBAVEZAN", { sr: "Lik se čuva samo uz tvoj pristanak.", en: "A character is saved only with your consent." }],
  ["PROVERA_FOTKE", { sr: "Fotke nisu prošle proveru lica. Izaberi jasnije fotke na kojima si samo ti.", en: "The photos did not pass the face check. Pick clearer photos with only you in them." }],
  ["LIK_NIJE_DOSTUPAN", { sr: "U fotku može samo tvoj sačuvan lik sa pristankom.", en: "Only your own saved character with consent can go into a photo." }],
  ["MODEL_NE_MENJA_LIK", { sr: "Ovaj model ne menja lik. Izaberi Nano Banana Pro ili 2.", en: "This model does not swap characters. Pick Nano Banana Pro or 2." }],
  ["NIJE_LIST_LIKA", { sr: "Kao lik se čuva samo list iz kreatora lika.", en: "Only a sheet from the character creator can be saved as a character." }],
  ["DEMO_LIST_LIKA", { sr: "Probni (DEMO) list ne može da se sačuva kao lik.", en: "A sample (DEMO) sheet cannot be saved as a character." }],
  ["IZVOR_NIJE_DOSTUPAN", { sr: "Ovaj rad više nije dostupan.", en: "This work is no longer available." }],
];

export function elementErrorMessage(raw: string, locale: Locale): string {
  for (const [code, message] of ELEMENT_ERRORS) {
    if (raw.includes(code)) return message[locale];
  }
  return studioErrorMessage(raw, locale);
}

/** Svi kodovi koje `creaElements` baca (za test: svaki ima svoju rečenicu). */
export const ELEMENT_ERROR_CODES = ELEMENT_ERRORS.map(([code]) => code);
