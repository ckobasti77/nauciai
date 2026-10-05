import type { Locale, LocalizedText } from "./i18n";

/**
 * Tekstovi radionice Cree (K01-16): objekti `{ sr, en }` po obrascu
 * `lib/studio-landing.ts`, da `lib/i18n.ts` ne raste. Nazivi oblasti i režima su
 * podaci ljuske (`lib/crea-shell.ts`), a kartice ciljeva u `lib/crea-goals.ts`.
 */
export const CREA_SHELL_COPY = {
  areaTabs: { sr: "Šta praviš", en: "What you are making" },
  modeTabs: { sr: "Način rada", en: "Way of working" },
  start: { sr: "Početak", en: "Start" },
  soonBadge: { sr: "uskoro", en: "soon" },
} satisfies Record<string, LocalizedText>;

export const CREA_START_COPY = {
  title: { sr: "Šta praviš danas?", en: "What are you making today?" },
  body: {
    sr: "Izaberi cilj. Crea otvara pravi alat, piše prvi opis i bira model. Sve to posle možeš da promeniš.",
    en: "Pick a goal. Crea opens the right tool, writes a first description and picks a model. You can change all of it afterwards.",
  },
} satisfies Record<string, LocalizedText>;

export const CREA_STAGE_COPY = {
  latest: { sr: "Poslednji rad", en: "Latest work" },
  emptyTitle: { sr: "Ovde stiže tvoj rad", en: "Your work lands here" },
  emptyDocked: {
    sr: "Napiši opis u polju levo i klikni dugme sa cenom.",
    en: "Write a description in the box on the left and click the button with the price.",
  },
  emptyFloating: {
    sr: "Napiši opis u polju na dnu ekrana i klikni dugme sa cenom.",
    en: "Write a description in the box at the bottom of the screen and click the button with the price.",
  },
  emptyGuest: {
    sr: "Prijavi se, napiši opis i klikni dugme sa cenom.",
    en: "Sign in, write a description and click the button with the price.",
  },
  open: { sr: "Otvori ceo prikaz", en: "Open full view" },
  noModels: {
    sr: "Nijedan model za ovaj način rada trenutno nije uključen. Ovo nije do tvog naloga - probaj drugi način rada ili kasnije.",
    en: "No model for this way of working is switched on right now. This is not about your account - try another one or come back later.",
  },
} satisfies Record<string, LocalizedText>;

export const CREA_SOON_COPY = {
  title: { sr: "Stiže uskoro", en: "Coming soon" },
  meanwhile: { sr: "Do tada probaj:", en: "Meanwhile, try:" },
} satisfies Record<string, LocalizedText>;

export const CREA_HISTORY_COPY = {
  title: { sr: "Istorija", en: "History" },
  allTitle: { sr: "Tvoji radovi", en: "Your work" },
  empty: {
    sr: "Još nema radova u ovoj radionici. Prvi koji napraviš pojaviće se ovde.",
    en: "No work in this workshop yet. The first one you make will appear here.",
  },
  emptyAll: {
    sr: "Još nema radova. Izaberi cilj i napravi prvi.",
    en: "No work yet. Pick a goal and make your first one.",
  },
  guest: {
    sr: "Kad se prijaviš, ovde se čuva sve što napraviš.",
    en: "Once you sign in, everything you make is kept here.",
  },
} satisfies Record<string, LocalizedText>;

// ── K04: alati, uređaj, lokalni AI ──────────────────────────────────────────

/** Zašto alat ne može na ovom uređaju (`lib/crea-device.ts`). */
export const CREA_DEVICE_COPY = {
  reasons: {
    soon: { sr: "Ovaj alat stiže uskoro.", en: "This tool is coming soon." },
    "server-off": {
      sr: "Ovaj alat traži naš server, a on još nije uključen.",
      en: "This tool needs our server, which is not switched on yet.",
    },
    "needs-webgpu": {
      sr: "Ovaj alat traži jači računar sa WebGPU podrškom (noviji Chrome ili Edge). Na ovom uređaju ga ne nudimo.",
      en: "This tool needs a stronger computer with WebGPU support (a recent Chrome or Edge). We do not offer it on this device.",
    },
    "needs-webcodecs": {
      sr: "Ovaj alat traži noviji browser koji ume da pravi video (npr. Chrome ili Edge).",
      en: "This tool needs a newer browser that can make video (for example Chrome or Edge).",
    },
    "missing-capability": {
      sr: "Ovaj browser nema nešto što alatu treba. Probaj u novom Chrome-u ili Edge-u.",
      en: "This browser is missing something the tool needs. Try a recent Chrome or Edge.",
    },
    "too-heavy-for-phone": {
      sr: "Ovaj alat je pretežak za telefon. Otvori Creu na računaru.",
      en: "This tool is too heavy for a phone. Open Crea on a computer.",
    },
    "weak-device": {
      sr: "Ovaj uređaj ima premalo memorije za ovaj alat. Probaj na jačem telefonu ili računaru.",
      en: "This device has too little memory for this tool. Try a stronger phone or a computer.",
    },
  },
} satisfies { reasons: Record<string, LocalizedText> };

/** `lib/crea-local-ai/errors.ts` - jedna rečenica po kodu: šta sad da uradiš. */
export const CREA_LOCAL_AI_ERROR_COPY = {
  ABORTED: { sr: "Prekinuto. Možeš da pokreneš ponovo kad hoćeš.", en: "Stopped. You can start again any time." },
  NETWORK: {
    sr: "Preuzimanje nije uspelo. Proveri internet i pokušaj ponovo.",
    en: "The download did not finish. Check your connection and try again.",
  },
  QUOTA: {
    sr: "Na uređaju nema dovoljno mesta. Oslobodi malo prostora i pokušaj ponovo.",
    en: "There is not enough space on this device. Free up some space and try again.",
  },
  UNSUPPORTED: {
    sr: "Ovaj browser ne ume da pokrene ovaj alat. Probaj u novom Chrome-u ili Edge-u.",
    en: "This browser cannot run this tool. Try a recent Chrome or Edge.",
  },
  TOO_HEAVY: {
    sr: "Ovo je preteško za ovaj uređaj. Probaj manju sliku ili jači uređaj.",
    en: "This is too heavy for this device. Try a smaller image or a stronger device.",
  },
  BAD_INPUT: {
    sr: "Ovu sliku ne možemo da otvorimo. Probaj JPG, PNG, WebP ili HEIC sa iPhone-a.",
    en: "We cannot open this image. Try JPG, PNG, WebP or HEIC from an iPhone.",
  },
  MODEL_LOAD_FAILED: {
    sr: "Alat nije uspeo da se pokrene. Osveži stranicu i pokušaj ponovo.",
    en: "The tool did not start. Refresh the page and try again.",
  },
  INFERENCE_FAILED: {
    sr: "Nešto je zapelo dok je alat radio. Pokušaj ponovo, a ako se ponovi, probaj drugu sliku.",
    en: "Something got stuck while the tool was working. Try again, and if it happens again, try another image.",
  },
} satisfies Record<string, LocalizedText>;

/** Spisak alata i `ToolRunner` (`components/crea/tool-runner.tsx`). `{x}` popunjava `fillCopy`. */
export const CREA_TOOL_COPY = {
  badges: {
    besplatno: { sr: "Besplatno", en: "Free" },
    "na-uredjaju": { sr: "Na tvom uređaju", en: "On your device" },
    krediti: { sr: "Krediti", en: "Credits" },
    uskoro: { sr: "Uskoro", en: "Soon" },
  },
  listTitle: { sr: "Besplatni alati", en: "Free tools" },
  soonTitle: { sr: "Stižu uskoro", en: "Coming soon" },
  pickTitle: { sr: "Izaberi alat", en: "Pick a tool" },
  pickBody: {
    sr: "Alati rade besplatno, na tvom uređaju: slika ne ide nigde dok je sam ne sačuvaš.",
    en: "The tools run for free, on your device: the image goes nowhere until you save it.",
  },
  guestTitle: { sr: "Prijavi se i koristi besplatne alate", en: "Sign in to use the free tools" },
  guestBody: {
    sr: "Alati rade na tvom uređaju i ne troše kredite. Treba ti samo nalog.",
    en: "The tools run on your device and cost no credits. You only need an account.",
  },
  guestCta: { sr: "Prijavi se", en: "Sign in" },
  chooseFile: { sr: "Izaberi sliku", en: "Choose an image" },
  dropHint: { sr: "ili je prevuci bilo gde na ekran", en: "or drag it anywhere onto the screen" },
  dropLabel: { sr: "Pusti sliku bilo gde", en: "Drop the image anywhere" },
  dropBody: {
    sr: "Ceo ekran prima sliku. Ništa se ne šalje - alat radi na tvom uređaju.",
    en: "The whole screen takes the image. Nothing is uploaded - the tool runs on your device.",
  },
  notImage: {
    sr: "To nije slika. Izaberi JPG, PNG, WebP ili HEIC.",
    en: "That is not an image. Choose a JPG, PNG, WebP or HEIC.",
  },
  heicConverting: { sr: "Pretvaram fotku sa iPhone-a (HEIC) u JPG…", en: "Converting the iPhone photo (HEIC) to JPG…" },
  heicFailed: {
    sr: "Ovaj HEIC fajl nismo uspeli da otvorimo. Na iPhone-u ga podeli kao JPG pa probaj ponovo.",
    en: "We could not open this HEIC file. Share it as a JPG from the iPhone and try again.",
  },
  tooBig: { sr: "Slika je veća od 50 MB. Izaberi manju.", en: "The image is larger than 50 MB. Choose a smaller one." },
  otherFile: { sr: "Druga slika", en: "Another image" },
  run: { sr: "Pokreni", en: "Run" },
  cancel: { sr: "Odustani", en: "Cancel" },
  again: { sr: "Pokreni ponovo", en: "Run again" },
  checking: { sr: "Proveravam šta tvoj uređaj ume…", en: "Checking what your device can do…" },
  confirmTitle: { sr: "Prvo preuzimanje", en: "First download" },
  confirmBody: {
    sr: "Alat prvi put preuzima {size}. Posle toga ostaje na uređaju i radi odmah, i bez interneta.",
    en: "The first time, the tool downloads {size}. After that it stays on your device and starts right away, even offline.",
  },
  confirmCta: { sr: "Preuzmi i pokreni", en: "Download and run" },
  firstRunNote: {
    sr: "Prvi put preuzima {size}, posle radi odmah.",
    en: "The first run downloads {size}, then it starts right away.",
  },
  cachedNote: { sr: "Alat je već na tvom uređaju.", en: "The tool is already on your device." },
  downloading: { sr: "Preuzimam alat", en: "Downloading the tool" },
  downloadedOf: { sr: "{loaded} od {total}", en: "{loaded} of {total}" },
  secondsLeft: { sr: "još oko {n} s", en: "about {n} s left" },
  running: { sr: "Radim na tvom uređaju…", en: "Working on your device…" },
  doneTitle: { sr: "Gotovo", en: "Done" },
  save: { sr: "Sačuvaj u galeriju", en: "Save to gallery" },
  saving: { sr: "Čuvam…", en: "Saving…" },
  saved: { sr: "Sačuvano u galeriju", en: "Saved to gallery" },
  download: { sr: "Preuzmi", en: "Download" },
  saveTooBig: {
    sr: "Ovaj fajl je prevelik za galeriju (najviše {size}), ali možeš da ga preuzmeš.",
    en: "This file is too large for the gallery (at most {size}), but you can download it.",
  },
  noAccess: {
    sr: "Čuvanje u galeriju stiže kad dobiješ pristup Crei. Dotle rezultat preuzmi.",
    en: "Saving to the gallery comes once you get access to Crea. Until then, download the result.",
  },
  galleryLabel: { sr: "Besplatno · na tvom uređaju", en: "Free · on your device" },
  openTool: { sr: "Otvori alat", en: "Open the tool" },
  // Slika · Izmeni (K11): alati stoje pored composera.
  editListTitle: { sr: "Alati za izmenu", en: "Editing tools" },
  describeTitle: { sr: "Opiši izmenu rečima", en: "Describe the edit in words" },
  describeBody: {
    sr: "AI menja sliku po tvom opisu: pozadinu, svetlo, odeću ili stil.",
    en: "AI changes the image from your description: background, light, clothes or style.",
  },
  shortcutsTitle: { sr: "Ili uzmi alat", en: "Or pick a tool" },
} satisfies Record<string, LocalizedText | Record<string, LocalizedText>>;

/** Stablo verzija, pre/posle i „Vrati" u detalju rada (K05, S25). */
export const CREA_VERSION_COPY = {
  title: { sr: "Verzije", en: "Versions" },
  hint: {
    sr: "Svaka izmena pravi novu verziju, a stara ostaje. Klikni sličicu da je otvoriš.",
    en: "Every change makes a new version and the old one stays. Click a thumbnail to open it.",
  },
  current: { sr: "ovaj rad", en: "this work" },
  truncated: {
    sr: "Prikazano je prvih 100 verzija ovog stabla.",
    en: "Showing the first 100 versions of this tree.",
  },
  derivations: {
    original: { sr: "Original", en: "Original" },
    izmena: { sr: "Izmena", en: "Edit" },
    animacija: { sr: "Animacija", en: "Animation" },
    ozvucenje: { sr: "Ozvučenje", en: "Sound" },
    "lokalni-alat": { sr: "Besplatan alat", en: "Free tool" },
    produzenje: { sr: "Produženje", en: "Extension" },
    usavrsavanje: { sr: "Usavršeno", en: "Refined" },
    varijacija: { sr: "Varijacija", en: "Variation" },
    regeneracija: { sr: "Ponovo", en: "Again" },
    montaza: { sr: "Montaža", en: "Edit cut" },
    sloj: { sr: "Sloj", en: "Layer" },
  },
  compare: { sr: "Uporedi pre i posle", en: "Compare before and after" },
  compareOff: { sr: "Samo nova verzija", en: "New version only" },
  before: { sr: "Pre", en: "Before" },
  after: { sr: "Posle", en: "After" },
  compareLabel: {
    sr: "Pre i posle: povuci ručku ili koristi strelice.",
    en: "Before and after: drag the handle or use the arrow keys.",
  },
  restore: { sr: "Vrati prethodnu", en: "Go back" },
  restoreTitle: {
    sr: "Otvori verziju iz koje je ova nastala",
    en: "Open the version this one was made from",
  },
  restoredTitle: { sr: "Vratio/la si se na ovu verziju.", en: "You went back to this version." },
  restoredBody: {
    sr: "Nastavi od nje: upotrebi je kao ulaz za sledeću izmenu.",
    en: "Carry on from here: use it as the input for your next change.",
  },
  useAsInput: { sr: "Koristi kao ulaz", en: "Use as input" },
  openLayers: { sr: "Uredi slojeve", en: "Edit the layers" },
  cutAngles: { sr: "Iseci u 9 radova · besplatno", en: "Cut into 9 works · free" },
  animate: { sr: "Animiraj", en: "Animate" },
  tools: { sr: "Besplatno sredi u alatu", en: "Touch it up for free" },
  sourceLoading: { sr: "Učitavam rad iz galerije…", en: "Loading the work from your gallery…" },
  sourceFailed: {
    sr: "Rad iz galerije nije mogao da se učita. Izaberi fajl sa uređaja.",
    en: "The work from your gallery could not be loaded. Choose a file from your device.",
  },
} satisfies Record<string, LocalizedText | Record<string, LocalizedText>>;

/** Odbijeno čuvanje (razlozi iz `convex/creaLocalCore.ts` i greške dozvole). */
/** Auto izbor modela, „Probaj jeftino" / „Usavrši" i keš istih zahteva (K07). */
export const CREA_PICK_COPY = {
  auto: { sr: "Auto", en: "Auto" },
  autoTitle: {
    sr: "Neka Crea izabere najjeftiniji model koji ume ovaj posao",
    en: "Let Crea pick the cheapest model that can do this job",
  },
  autoPicked: { sr: "Auto je izabrao {model}:", en: "Auto picked {model}:" },
  autoDemo: { sr: "(DEMO - izlaz je probni.)", en: "(DEMO - the output is a sample.)" },
  autoNone: {
    sr: "Za ovaj posao Auto nema predlog - izaberi model ručno.",
    en: "Auto has no suggestion for this job - pick a model yourself.",
  },
  tryCheap: { sr: "Probaj jeftino", en: "Try it cheap" },
  tryCheapTitle: {
    sr: "Brza proba jeftinijim modelom ({model}); kad ti se svidi, klikni „Usavrši“ na rezultatu.",
    en: "A quick test with a cheaper model ({model}); when you like it, click “Refine” on the result.",
  },
  refine: { sr: "Usavrši", en: "Refine" },
  refineTitle: {
    sr: "Napravi konačnu verziju ove probe modelom {model}.",
    en: "Make the final version of this test with {model}.",
  },
  cacheTitle: { sr: "Već imaš isti rad", en: "You already have this exact work" },
  cacheBody: {
    sr: "Isti opis, podešavanja i fajlovi. Otvori ga besplatno ili napravi novu varijantu.",
    en: "Same description, settings and files. Open it for free or make a new variation.",
  },
  cacheOpen: { sr: "Otvori (0 kr)", en: "Open (0 cr)" },
  cacheNew: { sr: "Nova varijanta", en: "New variation" },
} satisfies Record<string, LocalizedText>;

/** Noćna tura (K08, C2) i jutarnje iznenađenje (G13). */
export const CREA_NIGHT_COPY = {
  toggle: { sr: "Noćna tura", en: "Night run" },
  toggleHint: { sr: "stiže do jutra, −{percent} %", en: "arrives by morning, −{percent}%" },
  toggleTitle: {
    sr: "Rad ide u noćnu turu po nižoj ceni i stiže do jutra. Javićemo ti kad bude gotov.",
    en: "The work goes into the night run at a lower price and arrives by morning. We will let you know when it is ready.",
  },
  generate: { sr: "Pošalji u noćnu turu", en: "Send to night run" },
  badge: { sr: "Noćna tura", en: "Night run" },
  arrivalsOpen: { sr: "Pogledaj", en: "Take a look" },
  arrivalsFrom: { sr: "iz noćne ture", en: "from the night run" },
} satisfies Record<string, LocalizedText>;

export const CREA_SAVE_ERROR_COPY = {
  NEPOZNAT_ALAT: {
    sr: "Ovaj alat još ne čuva rezultate u galeriju. Preuzmi rezultat.",
    en: "This tool does not save to the gallery yet. Download the result instead.",
  },
  NEISPRAVAN_TIP_FAJLA: {
    sr: "Galerija ne prima ovu vrstu fajla. Preuzmi rezultat.",
    en: "The gallery does not take this kind of file. Download the result instead.",
  },
  FAJL_PREVELIK: {
    sr: "Fajl je prevelik za galeriju. Preuzmi rezultat.",
    en: "The file is too large for the gallery. Download the result instead.",
  },
  PRAZAN_FAJL: { sr: "Rezultat je prazan. Pokreni alat ponovo.", en: "The result is empty. Run the tool again." },
  MINUTNI_LIMIT: {
    sr: "Polako - sačuvao si mnogo radova u poslednjem minutu. Sačekaj malo pa probaj ponovo.",
    en: "Easy - you saved a lot of work in the last minute. Wait a moment and try again.",
  },
  DNEVNI_LIMIT: {
    sr: "Za danas si sačuvao najviše besplatnih radova. Ovaj preuzmi, a sutra možeš opet.",
    en: "You have saved the most free results for today. Download this one; you can save again tomorrow.",
  },
  DNEVNI_LIMIT_PROSTORA: {
    sr: "Za danas je potrošen prostor za besplatne radove. Ovaj preuzmi, a sutra možeš opet.",
    en: "Today's space for free results is used up. Download this one; you can save again tomorrow.",
  },
  PROJEKAT_NIJE_DOSTUPAN: {
    sr: "Izabrani projekat više nije dostupan. Izaberi drugi projekat i sačuvaj ponovo.",
    en: "The selected project is no longer available. Pick another project and save again.",
  },
  IZVOR_NIJE_DOSTUPAN: {
    sr: "Rad iz kojeg si krenuo/la više nije u galeriji. Sačuvaćemo ovo kao nov rad - probaj ponovo.",
    en: "The work you started from is no longer in your gallery. Try again to save this as a new work.",
  },
  NEMA_PRISTUPA: {
    sr: "Čuvanje u galeriju stiže kad dobiješ pristup Crei. Dotle rezultat preuzmi.",
    en: "Saving to the gallery comes once you get access to Crea. Until then, download the result.",
  },
  NEDOZVOLJEN_UPLOAD: {
    sr: "Čuvanje je isteklo. Klikni „Sačuvaj u galeriju\" ponovo.",
    en: "The save timed out. Click \"Save to gallery\" again.",
  },
  SLANJE: {
    sr: "Slanje nije uspelo. Proveri internet i pokušaj ponovo.",
    en: "The upload failed. Check your connection and try again.",
  },
} satisfies Record<string, LocalizedText>;

/** „Promeni format i smanji" (S27). */
export const CREA_FORMAT_COPY = {
  format: { sr: "Format", en: "Format" },
  formats: {
    webp: { sr: "WebP · najmanji za web", en: "WebP · smallest for the web" },
    jpeg: { sr: "JPG · radi svuda", en: "JPG · works everywhere" },
    png: { sr: "PNG · bez gubitka, providan", en: "PNG · lossless, transparent" },
    avif: { sr: "AVIF · još manji, novi browseri", en: "AVIF · even smaller, new browsers" },
  },
  quality: { sr: "Kvalitet", en: "Quality" },
  qualityHint: {
    sr: "Manje = manji fajl. 80 je dobar izbor za fotke.",
    en: "Lower = smaller file. 80 is a good choice for photos.",
  },
  avifSlow: {
    sr: "AVIF se pravi sporije (nekoliko sekundi) i veće slike smanjujemo na oko 4 MP.",
    en: "AVIF takes longer (a few seconds) and we shrink bigger images to about 4 MP.",
  },
  heicNote: {
    sr: "Fotka sa iPhone-a (HEIC) je pretvorena na tvom uređaju. Izaberi JPG da radi svuda.",
    en: "The iPhone photo (HEIC) was converted on your device. Pick JPG so it works everywhere.",
  },
  whyTitle: { sr: "Zašto je bitno da obrišeš lokaciju?", en: "Why does removing the location matter?" },
  whyBody: {
    sr: "Fotka sa telefona često pamti tačno mesto gde je snimljena, model telefona i vreme. Kad je okačiš ili pošalješ, svako ko otvori fajl može da vidi gde živiš ili gde ti dete ide u školu. Ovaj alat pravi novu sliku samo od piksela, pa toga u njoj nema.",
    en: "A phone photo often remembers the exact place it was taken, the phone model and the time. When you post or send it, anyone who opens the file can see where you live or where your child goes to school. This tool makes a new image out of the pixels only, so none of that is left.",
  },
  pngNoQuality: {
    sr: "PNG čuva svaki piksel, pa nema klizač kvaliteta.",
    en: "PNG keeps every pixel, so it has no quality slider.",
  },
  privacyTitle: { sr: "Skriveni podaci", en: "Hidden data" },
  privacyFound: {
    sr: "U originalu su bili: {list}. U novoj slici ih nema.",
    en: "The original contained: {list}. The new image does not.",
  },
  privacyNone: {
    sr: "U originalu nismo našli lične podatke, a nova slika ih sigurno nema.",
    en: "We found no personal data in the original, and the new image surely has none.",
  },
  metadata: {
    gps: { sr: "lokacija (GPS)", en: "location (GPS)" },
    device: { sr: "model telefona ili aparata", en: "phone or camera model" },
    date: { sr: "datum snimanja", en: "date taken" },
    author: { sr: "ime autora", en: "author name" },
  },
  smaller: { sr: "{n} % manje", en: "{n}% smaller" },
  bigger: { sr: "{n} % veće", en: "{n}% larger" },
  same: { sr: "iste veličine", en: "same size" },
  scaled: {
    sr: "Slika je smanjena na {w} × {h} px, da bi brzo radilo i na telefonu.",
    en: "The image was resized to {w} × {h} px so it works quickly on a phone too.",
  },
} satisfies Record<string, LocalizedText | Record<string, LocalizedText>>;

/** „Proveri fotku" (S35). `{n}` popunjava `fillCopy`. */
export const CREA_PHOTO_CHECK_COPY = {
  verdict: {
    ok: { sr: "Fotka je spremna", en: "The photo is ready" },
    warn: { sr: "Može, ali bolje je da popraviš", en: "It works, but better fix it first" },
    fail: { sr: "Ova fotka neće dati dobar rezultat", en: "This photo will not give a good result" },
  },
  items: {
    lica: {
      ok: { sr: "Jedno lice - odlično.", en: "One face - great." },
      warn: {
        sr: "Na slici je {n} lica. Za lik je najbolje kad je jedna osoba.",
        en: "There are {n} faces. For a character, one person works best.",
      },
      fail: {
        sr: "Nismo našli lice. Okreni se ka kameri i neka lice bude na svetlu.",
        en: "We found no face. Face the camera and keep your face in the light.",
      },
    },
    velicina: {
      ok: { sr: "Lice je dovoljno veliko ({n} % visine).", en: "The face is big enough ({n}% of the height)." },
      warn: {
        sr: "Lice je malo ({n} % visine). Priđi bliže ili iseci sliku.",
        en: "The face is small ({n}% of the height). Move closer or crop the image.",
      },
      fail: {
        sr: "Lice je premalo ({n} % visine). Priđi mnogo bliže.",
        en: "The face is too small ({n}% of the height). Move much closer.",
      },
    },
    ostrina: {
      ok: { sr: "Oštro.", en: "Sharp." },
      warn: { sr: "Malo mutno. Umiri ruku ili dodaj svetla.", en: "A bit blurry. Hold steady or add more light." },
      fail: {
        sr: "Mutno. Slikaj ponovo, mirnije i uz više svetla.",
        en: "Blurry. Take it again, steadier and with more light.",
      },
    },
    rezolucija: {
      ok: { sr: "Dovoljno piksela ({n} px).", en: "Enough pixels ({n} px)." },
      warn: {
        sr: "Slika je mala ({n} px). Bolje je bar 1024 px.",
        en: "The image is small ({n} px). At least 1024 px is better.",
      },
      fail: { sr: "Slika je premala ({n} px).", en: "The image is too small ({n} px)." },
    },
  },
  stamp: {
    ok: { sr: "SPREMNO", en: "READY" },
    warn: { sr: "POPRAVI", en: "FIX IT" },
    fail: { sr: "NE VALJA", en: "NOT GOOD" },
  },
} as const;

/**
 * Kod odbijanja (vraćen razlog ili poruka bačene greške, gde Convex dodaje svoj
 * prefiks) → rečenica. Duži kodovi se proveravaju prvi (`DNEVNI_LIMIT_PROSTORA`
 * sadrži `DNEVNI_LIMIT`); nepoznata greška je mrežna.
 */
export function creaSaveErrorMessage(codeOrMessage: string, locale: Locale): string {
  const codes = (Object.keys(CREA_SAVE_ERROR_COPY) as Array<keyof typeof CREA_SAVE_ERROR_COPY>).sort(
    (a, b) => b.length - a.length,
  );
  const code = codes.find((candidate) => codeOrMessage.includes(candidate)) ?? "SLANJE";
  return CREA_SAVE_ERROR_COPY[code][locale];
}

/** `{ime}` u tekstu → vrednost. Nepoznat ključ ostaje kakav jeste. */
export function fillCopy(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
