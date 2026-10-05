import type { LocalizedText } from "@/lib/i18n";

/**
 * Tekstovi biblioteke Cree (K16: S43 pretraga, U9 galerija 2.0, S44 brze akcije,
 * S45 „Kako je ovo napravljeno?"). Van `lib/i18n.ts`, kao ostali Crea tekstovi (K01-16).
 * `{n}`, `{total}`… se popunjavaju kroz `fillCopy`.
 */
export const CREA_LIBRARY_COPY = {
  // Ulaz u biblioteku i povratak
  title: { sr: "Biblioteka", en: "Library" },
  open: { sr: "Biblioteka", en: "Library" },
  openAll: { sr: "Svi radovi u biblioteci", en: "All works in the library" },
  back: { sr: "Nazad u radionicu", en: "Back to the workshop" },
  intro: {
    sr: "Svi tvoji radovi na jednom mestu. Traži rečima, filtriraj, izaberi više njih odjednom ili uporedi.",
    en: "All your works in one place. Search with words, filter, pick several at once or compare them.",
  },

  // Pretraga (S43)
  searchLabel: { sr: "Pretraži svoje radove", en: "Search your works" },
  searchPlaceholder: { sr: "npr. mačka na krovu, zalazak sunca…", en: "e.g. cat on a roof, sunset…" },
  searchHint: {
    sr: "Nalazi po opisu, na latinici ili ćirilici, i kad ne pogodiš padež.",
    en: "Finds works by their description, in Latin or Cyrillic script, even with a different word ending.",
  },
  searching: { sr: "Tražim…", en: "Searching…" },
  searchCount: { sr: "Pronađeno: {n}", en: "Found: {n}" },
  smartToggle: { sr: "Pametna pretraga", en: "Smart search" },
  smartHint: {
    sr: "Traži i po onome što se VIDI na slici, ne samo po opisu. Radi na ovom računaru, besplatno.",
    en: "Also searches by what you can SEE in the picture, not only the description. Runs on this computer, for free.",
  },
  smartUnavailable: {
    sr: "Pametna pretraga radi na računaru sa WebGPU-om (npr. Chrome ili Edge na laptopu). Obična pretraga po opisu radi svuda.",
    en: "Smart search works on a computer with WebGPU (e.g. Chrome or Edge on a laptop). Regular search by description works everywhere.",
  },
  smartDownload: {
    sr: "Prvi put preuzima {size} na tvoj uređaj — posle radi i bez interneta.",
    en: "The first time it downloads {size} to your device — after that it works offline too.",
  },
  smartStart: { sr: "Preuzmi i uključi", en: "Download and turn on" },
  smartLoading: { sr: "Preuzimam pametnu pretragu… {percent}", en: "Downloading smart search… {percent}" },
  smartIndexing: { sr: "Upoznajem tvoje slike: {done} od {total}", en: "Getting to know your pictures: {done} of {total}" },
  smartReady: { sr: "Pametna pretraga zna {n} tvojih slika.", en: "Smart search knows {n} of your pictures." },
  smartFailed: { sr: "Pametna pretraga nije uspela da se učita. Obična pretraga i dalje radi.", en: "Smart search could not load. Regular search still works." },
  smartBadge: { sr: "Po slici", en: "By picture" },

  // Filteri (U9)
  areaLabel: { sr: "Oblast", en: "Area" },
  areaAll: { sr: "Sve", en: "All" },
  favorite: { sr: "Omiljeno", en: "Favorites" },
  costLabel: { sr: "Cena", en: "Price" },
  costAll: { sr: "Sve", en: "All" },
  costFree: { sr: "Besplatno", en: "Free" },
  costPaid: { sr: "Plaćeno", en: "Paid" },
  sizeLabel: { sr: "Veličina sličica", en: "Thumbnail size" },
  sizeSmaller: { sr: "Manje", en: "Smaller" },
  sizeBigger: { sr: "Veće", en: "Bigger" },
  projectHint: { sr: "Projekat biraš gore desno.", en: "Choose the project in the top right." },

  // Omiljeno na kartici
  favoriteAdd: { sr: "Dodaj u omiljene", en: "Add to favorites" },
  favoriteRemove: { sr: "Ukloni iz omiljenih", en: "Remove from favorites" },

  // Brze akcije (S44)
  quickMenu: { sr: "Brze akcije", en: "Quick actions" },
  quickTitle: { sr: "Šta dalje sa ovim radom?", en: "What next with this work?" },

  // Višestruki izbor i masovne akcije
  select: { sr: "Izaberi više", en: "Select several" },
  selected: { sr: "Izabrano: {n}", en: "Selected: {n}" },
  moveTo: { sr: "Premesti u projekat", en: "Move to project" },
  noProject: { sr: "Bez projekta", en: "No project" },
  moving: { sr: "Premeštam…", en: "Moving…" },
  moved: { sr: "Premešteno: {n}", en: "Moved: {n}" },
  delete: { sr: "Obriši", en: "Delete" },
  deleteConfirm: {
    sr: "Obrisati {n} izabranih radova? Fajlovi nestaju zauvek - ovo ne može da se vrati.",
    en: "Delete {n} selected works? The files are gone for good - this cannot be undone.",
  },
  deleteYes: { sr: "Da, obriši", en: "Yes, delete" },
  cancel: { sr: "Odustani", en: "Cancel" },
  deleting: { sr: "Brišem… {done}/{total}", en: "Deleting… {done}/{total}" },
  deleted: { sr: "Obrisano: {n}", en: "Deleted: {n}" },
  deleteSkipped: {
    sr: "{n} nije obrisano: rad je još u toku ili je deo lekcije.",
    en: "{n} not deleted: the work is still in progress or is part of a lesson.",
  },
  compare: { sr: "Uporedi", en: "Compare" },
  compareHint: { sr: "Za poređenje izaberi 2 do 4 rada.", en: "Pick 2 to 4 works to compare." },
  actionFailed: { sr: "Nije uspelo. Probaj ponovo.", en: "That didn't work. Try again." },

  // Duplikati
  duplicates: { sr: "Nađi duplikate", en: "Find duplicates" },
  duplicatesWorking: { sr: "Upoređujem slike… {done}/{total}", en: "Comparing pictures… {done}/{total}" },
  duplicatesNone: { sr: "Nema duplikata među {n} učitanih slika.", en: "No duplicates among {n} loaded pictures." },
  duplicatesFound: { sr: "Grupa sličnih slika: {n}", en: "Groups of near-identical pictures: {n}" },
  duplicatesKeep: { sr: "ostaje", en: "kept" },
  duplicatesSelect: { sr: "Izaberi duplikate (prvi u grupi ostaje)", en: "Select duplicates (the first in each group stays)" },
  duplicatesClose: { sr: "Zatvori", en: "Close" },

  // Poređenje
  compareTitle: { sr: "Poređenje", en: "Comparison" },
  compareClose: { sr: "Zatvori poređenje", en: "Close comparison" },
  compareOpen: { sr: "Otvori", en: "Open" },
  free: { sr: "Besplatno", en: "Free" },

  // „Kako je ovo napravljeno?" (S45)
  howTitle: { sr: "Kako je ovo napravljeno?", en: "How was this made?" },
  howPrompt: { sr: "Opis", en: "Description" },
  howModel: { sr: "Model", en: "Model" },
  howSettings: { sr: "Podešavanja", en: "Settings" },
  howCost: { sr: "Cena", en: "Price" },
  howFreeLocal: { sr: "Besplatno · na tvom uređaju", en: "Free · on your device" },
  howNoPrompt: {
    sr: "Ova slika nema opis. Neka je AI opiše rečima - pa po tom opisu napravi sličnu.",
    en: "This picture has no description. Let AI describe it in words - then make a similar one from that.",
  },
  howDescribe: { sr: "Opiši ovu sliku", en: "Describe this picture" },
  howLegend: { sr: "Boje pokazuju delove opisa:", en: "Colours show the parts of the description:" },

  // Alat „Kako je ovo napravljeno?" (slika.opis)
  describeIntro: {
    sr: "Ubaci bilo koju sliku - AI je opiše rečima po delovima, a ti po tom opisu napraviš svoju.",
    en: "Drop in any picture - AI describes it in parts, and you make your own from that description.",
  },
  describeWhere: { sr: "Gde da je opišem?", en: "Where should I describe it?" },
  describeEnglishLocal: {
    sr: "Opis je na engleskom (tako ga modeli najbolje razumeju) - „Napravi sličnu“ ga upisuje u polje za opis.",
    en: "The description is in English (models understand it best) - “Make a similar one” puts it into the prompt box.",
  },
  describeLocal: { sr: "Na ovom računaru (besplatno)", en: "On this computer (free)" },
  describeCloud: { sr: "Brže, u oblaku (0 kredita)", en: "Faster, in the cloud (0 credits)" },
  describeCloudHint: {
    sr: "Slika ide Google-ovom modelu samo radi opisa i ne čuva se. Dnevno do {limit} opisa.",
    en: "The picture goes to Google's model only for the description and is not stored. Up to {limit} a day.",
  },
  describeWorking: { sr: "Gledam sliku…", en: "Looking at the picture…" },
  describeEnglish: {
    sr: "Opis za model je na engleskom (tako ga modeli najbolje razumeju); ispod svakog dela je prevod.",
    en: "The prompt for the model is in English (models understand it best); each part has a translation.",
  },
  describeMakeSimilar: { sr: "Napravi sličnu", en: "Make a similar one" },
  describeAsReference: { sr: "Koristi kao referencu", en: "Use as reference" },
  describeAgain: { sr: "Opiši ponovo", en: "Describe again" },
  describeLimit: { sr: "Za danas je iskorišćeno svih {limit} opisa. Sutra opet može.", en: "All {limit} descriptions for today are used up. Try again tomorrow." },
  describeFailed: { sr: "Opis trenutno ne radi. Probaj malo kasnije.", en: "Describing doesn't work right now. Try again a bit later." },
  describeDemo: { sr: "DEMO", en: "DEMO" },
} satisfies Record<string, LocalizedText>;
