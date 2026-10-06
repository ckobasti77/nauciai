import type { CreaCapability, CreaDeviceClass } from "./crea-device";
import type { CreaLocalModelId } from "./crea-local-ai/models";
import type { CreaArea, CreaModeId } from "./crea-shell";
import type { LocalizedText } from "./i18n";

/**
 * Registar alata Cree (K04, plan §4.1 i K01 §3.1): JEDAN spisak svih alata iz
 * feature tabela §7, sa stanjem (`ready` / `soon`), da UI zna šta da ponudi, a
 * kasniji koraci samo prebacuju `soon` → `ready`.
 *
 * Čisti podaci. Uvozi ga i Convex (`creaLocal.saveLocalResult` proverava
 * `toolId`), zato su dozvoljeni samo `import type`: nikakav React, lucide ni
 * browser API.
 *
 * Slojevi (tier):
 * - `local-code` 🟢 deterministički kod u browseru, 0 kredita;
 * - `local-ai`   🟡 model u browseru korisnika, 0 kredita;
 * - `server`     🟣 naš server - isključeno (O2), uvek `soon`;
 * - `paid`       🔵 provajder, krediti.
 */

export type CreaToolTier = "local-code" | "local-ai" | "server" | "paid";
export type CreaToolStatus = "ready" | "soon";
export type CreaMediaKind = "image" | "video" | "audio";
export type CreaToolIo = CreaMediaKind | "images" | "text" | "svg" | "zip";

export type CreaDeviceRule = {
  /** Najslabija klasa uređaja na kojoj alat radi u punom obliku. */
  minClass: CreaDeviceClass;
  requires?: readonly CreaCapability[];
  /** Od ove klase radi manja varijanta (npr. MODNet na telefonu umesto BiRefNet-a). */
  smallVariantFrom?: CreaDeviceClass;
};

/**
 * Cena. Plaćeni alat koji je još `soon` sme da bude bez modela - model bira
 * korak koji ga pravi (npr. Recraft za logo stiže u K07/K15). Test traži model
 * iz kataloga za svaki plaćeni alat koji je `ready`.
 */
export type CreaToolPrice = { kind: "free" } | { kind: "credits"; modelSlug?: string; inputMode?: string };

export type CreaTool = {
  /** `<oblast>.<kebab>` - stabilno; ide u URL (`?alat=`) i u `modelSlug` posla (`local:<id>`). */
  id: string;
  featureIds: readonly string[];
  area: CreaArea;
  mode: CreaModeId;
  tier: CreaToolTier;
  status: CreaToolStatus;
  title: LocalizedText;
  /** Jedna rečenica: šta alat radi. */
  summary: LocalizedText;
  inputs: readonly CreaToolIo[];
  output: CreaToolIo;
  device: CreaDeviceRule;
  price: CreaToolPrice;
  localModels?: readonly CreaLocalModelId[];
  /** `false` za izlaze koji nisu medij (tekst, SVG, zip) - oni se samo preuzimaju. */
  savesToGallery: boolean;
  /** Plaćeni put kad lokalni nije dovoljan (npr. veliki predmet za brisanje). */
  paidFallback?: { modelSlug: string; inputMode?: string };
  /**
   * Plaćen alat sa besplatnim korakom na uređaju (K12: isecanje kadra, 9 uglova iz
   * mreže, izvoz slojeva, isečak proizvoda) - taj korak čuva rezultat u galeriju
   * kao lokalni rad (0 kr), kao i lokalni alati.
   */
  localSave?: true;
  /**
   * Radi i kad uređaj ne može lokalni model (K16, S45): jeftin poziv u oblaku, 0 kredita
   * (`creaLlm`). Uređaj tada ne blokira alat, a oznaka ne tvrdi „Na tvom uređaju".
   */
  cloudFallback?: true;
  /**
   * Vrste koje alat čuva pored `output` (K19: montaža izvozi MP4 ili GIF, a GIF je u
   * galeriji slika). `creaLocal.saveLocalResult` ih prima kao i `output`.
   */
  alsoSaves?: readonly CreaMediaKind[];
};

const FREE = { kind: "free" } as const;
const ANY_DEVICE = { minClass: "weak" } as const;

export const CREA_TOOLS: readonly CreaTool[] = [
  // ── Slika · Alati ─────────────────────────────────────────────────────────
  {
    id: "slika.format",
    featureIds: ["S27"],
    area: "slika",
    mode: "alati",
    tier: "local-code",
    status: "ready",
    title: { sr: "Promeni format i smanji", en: "Change format and compress" },
    summary: {
      sr: "Pretvori sliku (i HEIC sa iPhone-a) u WebP, JPG, PNG ili AVIF, smanji fajl i obriši skrivene podatke kao što je lokacija.",
      en: "Turn an image (iPhone HEIC too) into WebP, JPG, PNG or AVIF, make the file smaller and remove hidden data such as the location.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "slika.provera",
    featureIds: ["S35"],
    area: "slika",
    mode: "alati",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Proveri fotku", en: "Check a photo" },
    summary: {
      sr: "Pre nego što platiš: da li se lice vidi, da li je dovoljno veliko i oštro, i da li je na slici samo jedna osoba.",
      en: "Before you pay: is the face visible, big and sharp enough, and is there only one person in the picture.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    price: FREE,
    localModels: ["mp-face-detector"],
    savesToGallery: true,
  },
  {
    id: "slika.iseci",
    featureIds: ["S26"],
    area: "slika",
    mode: "alati",
    tier: "local-code",
    status: "ready",
    title: { sr: "Iseci, okreni, promeni veličinu", en: "Crop, rotate, resize" },
    summary: {
      sr: "Iseci sliku za Instagram, priču, YouTube ili profilnu, okreni je ili preslikaj i promeni joj veličinu.",
      en: "Crop an image for Instagram, a story, YouTube or a profile picture, rotate or flip it and change its size.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "slika.pametni-isecak",
    featureIds: ["S30"],
    area: "slika",
    mode: "alati",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Pametan isečak", en: "Smart crop" },
    summary: {
      sr: "Iseci sliku za Instagram ili TikTok, a lice sâmo ostane u kadru.",
      en: "Crop an image for Instagram or TikTok and the face stays in the frame by itself.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    price: FREE,
    localModels: ["mp-face-detector"],
    savesToGallery: true,
  },
  {
    id: "slika.paleta",
    featureIds: ["S31"],
    area: "slika",
    mode: "alati",
    tier: "local-code",
    status: "ready",
    title: { sr: "Paleta boja", en: "Colour palette" },
    summary: {
      sr: "Izvuci glavne boje iz slike, kopiraj njihove kodove ili ih pošalji u opis nove slike.",
      en: "Pull the main colours out of an image, copy their codes or send them into a new image description.",
    },
    inputs: ["image"],
    output: "text",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: false,
  },
  {
    id: "slika.qr",
    featureIds: ["S31"],
    area: "slika",
    mode: "alati",
    tier: "local-code",
    status: "ready",
    title: { sr: "QR kod", en: "QR code" },
    summary: {
      sr: "Napravi QR kod za link, meni ili Wi-Fi, u svojim bojama.",
      en: "Make a QR code for a link, a menu or Wi-Fi, in your own colours.",
    },
    inputs: ["text"],
    output: "image",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "slika.vektor",
    featureIds: ["S31"],
    area: "slika",
    mode: "alati",
    tier: "local-code",
    status: "ready",
    title: { sr: "Slika u vektor (SVG)", en: "Image to vector (SVG)" },
    summary: {
      sr: "Pretvori logo ili crtež u SVG koji se ne mrvi kad ga uvećaš.",
      en: "Turn a logo or a drawing into an SVG that stays crisp when you enlarge it.",
    },
    inputs: ["image"],
    output: "svg",
    device: { minClass: "phone" },
    price: FREE,
    savesToGallery: false,
  },
  {
    id: "slika.gif",
    featureIds: ["S31"],
    area: "slika",
    mode: "alati",
    tier: "local-code",
    status: "ready",
    title: { sr: "GIF od slika", en: "GIF from images" },
    summary: {
      sr: "Složi nekoliko slika u GIF koji se vrti.",
      en: "Put a few images together into a looping GIF.",
    },
    inputs: ["images"],
    output: "image",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "slika.ocr",
    featureIds: ["S32"],
    area: "slika",
    mode: "alati",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Tekst sa slike", en: "Text from an image" },
    summary: {
      sr: "Prepiši tekst sa fotke, i latinicu i ćirilicu.",
      en: "Copy the text out of a photo, in both Latin and Cyrillic script.",
    },
    inputs: ["image"],
    output: "text",
    device: { minClass: "phone" },
    price: FREE,
    localModels: ["tess-srp", "tess-srp-latn"],
    savesToGallery: false,
  },
  {
    id: "slika.editor",
    featureIds: ["S28"],
    area: "slika",
    mode: "alati",
    tier: "local-code",
    status: "ready",
    title: { sr: "Tekst, nalepnice i kolaž", en: "Text, stickers and collage" },
    summary: {
      sr: "Dodaj tekst sa č, ć, š, ž, đ, nalepnice, oblike i vodeni žig, ili složi kolaž.",
      en: "Add text, stickers, shapes and a watermark, or put a collage together.",
    },
    inputs: ["image", "images"],
    output: "image",
    device: { minClass: "phone" },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "slika.sabloni",
    featureIds: ["S29"],
    area: "slika",
    mode: "alati",
    tier: "local-code",
    status: "ready",
    title: { sr: "Šabloni", en: "Templates" },
    summary: {
      sr: "Mim, sličica za YouTube, objava, poster, pozivnica ili jelovnik - popuni i preuzmi.",
      en: "Meme, YouTube thumbnail, post, poster, invitation or menu - fill it in and download.",
    },
    inputs: ["images", "text"],
    output: "image",
    device: { minClass: "phone" },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "slika.3d-foto",
    featureIds: ["S33"],
    area: "slika",
    mode: "alati",
    tier: "local-ai",
    status: "ready",
    title: { sr: "3D foto", en: "3D photo" },
    summary: {
      sr: "Fotka dobije dubinu i blago se pomera, kao mali video.",
      en: "A photo gets depth and moves gently, like a short video.",
    },
    inputs: ["image"],
    output: "video",
    device: { minClass: "desktop", requires: ["webgl2", "webcodecs-video"] },
    price: FREE,
    localModels: ["depth-anything-v2-small"],
    savesToGallery: true,
  },
  {
    id: "slika.opis",
    featureIds: ["S45"],
    area: "slika",
    mode: "alati",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Kako je ovo napravljeno?", en: "How was this made?" },
    summary: {
      sr: "Opiši tuđu sliku rečima, pa po tom opisu napravi svoju.",
      en: "Describe someone else's image in words, then make your own from that description.",
    },
    inputs: ["image"],
    output: "text",
    device: { minClass: "desktop-gpu", requires: ["webgpu"] },
    price: FREE,
    localModels: ["florence-2-base"],
    savesToGallery: false,
    cloudFallback: true,
  },

  // ── Slika · Izmeni ────────────────────────────────────────────────────────
  {
    id: "slika.cetkica",
    featureIds: ["S11"],
    area: "slika",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Četkica i opis", en: "Brush and describe" },
    summary: {
      sr: "Ofarbaj deo slike i napiši šta tu treba da bude - AI menja samo taj deo.",
      en: "Paint over part of the image and write what should go there - AI changes only that part.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    // Prava maska (K06 §4.1, Auto S-1); bez fal ključa DEMO za osoblje (O3). Nano Banana 2 dobija obojenu zonu.
    price: { kind: "credits", modelSlug: "ideogram-45", inputMode: "mask" },
    savesToGallery: true,
    paidFallback: { modelSlug: "nano-banana-2", inputMode: "image_multi" },
  },
  {
    id: "slika.klik",
    featureIds: ["S12"],
    area: "slika",
    mode: "izmeni",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Klikni i izaberi", en: "Click to select" },
    summary: {
      sr: "Klikni na predmet i on se sâm označi - izdvoji ga bez pozadine ili ga ostavi u boji, a ostatak crno-beo.",
      en: "Click on an object and it selects itself - cut it out or keep it in colour with the rest in black and white.",
    },
    inputs: ["image"],
    output: "image",
    device: { minClass: "phone" },
    price: FREE,
    localModels: ["mp-interactive-segmenter"],
    savesToGallery: true,
  },
  {
    id: "slika.obrisi",
    featureIds: ["S13"],
    area: "slika",
    mode: "izmeni",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Obriši predmet", en: "Erase an object" },
    summary: {
      sr: "Prevuci preko predmeta i nestane. Mali predmeti besplatno, veliki uz kredite.",
      en: "Brush over an object and it disappears. Small objects are free, big ones cost credits.",
    },
    inputs: ["image"],
    output: "image",
    // MI-GAN (28 MB) staje u budžet telefona; slika se krpi u isečku oko predmeta, ne cela (memorija).
    device: { minClass: "phone" },
    price: FREE,
    localModels: ["migan"],
    savesToGallery: true,
    paidFallback: { modelSlug: "ideogram-45", inputMode: "mask" },
  },
  {
    id: "slika.pozadina",
    featureIds: ["S14"],
    area: "slika",
    mode: "izmeni",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Ukloni pozadinu", en: "Remove the background" },
    summary: {
      sr: "Iseci osobu ili predmet, pa stavi novu pozadinu: boju, zamućenje ili sliku.",
      en: "Cut out a person or an object, then add a new background: a colour, a blur or a picture.",
    },
    inputs: ["image"],
    output: "image",
    // K11: osoba - MODNet (6,6 MB), predmet - klik (MagicTouch); oba na svakom uređaju od telefona naviše.
    // BiRefNet lite (plan) ne radi na onnxruntime-web 1.30 (vidi `lib/crea-local-ai/models.ts`).
    device: { minClass: "phone" },
    price: FREE,
    localModels: ["modnet", "mp-interactive-segmenter"],
    savesToGallery: true,
    paidFallback: { modelSlug: "nano-banana-2", inputMode: "image_multi" },
  },
  {
    id: "slika.uvecaj",
    featureIds: ["S16"],
    area: "slika",
    mode: "izmeni",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Uvećaj 2×", en: "Upscale 2×" },
    summary: {
      sr: "Udvostruči veličinu slike a da ne postane mutna.",
      en: "Double the size of an image without it going blurry.",
    },
    inputs: ["image"],
    output: "image",
    device: { minClass: "phone" },
    price: FREE,
    localModels: ["swin2sr-x2"],
    savesToGallery: true,
  },
  {
    id: "slika.boje",
    featureIds: ["S17"],
    area: "slika",
    mode: "izmeni",
    tier: "local-code",
    status: "ready",
    title: { sr: "Boje i svetlo", en: "Colour and light" },
    summary: {
      sr: "Klizači za svetlo i boje, i filmski izgledi jednim klikom.",
      en: "Sliders for light and colour, and film looks in one click.",
    },
    inputs: ["image"],
    output: "image",
    device: { minClass: "phone", requires: ["webgl2"] },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "slika.prosiri",
    featureIds: ["S15"],
    area: "slika",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Proširi ili iseci kadar", en: "Expand or crop the frame" },
    summary: {
      sr: "Dugme „za Instagram, TikTok, YouTube\": iseci besplatno ili neka AI doslika ono što fali sa strane.",
      en: "A button for Instagram, TikTok or YouTube: crop for free, or let AI paint in what is missing at the sides.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    // Nano Banana 2 dobija fotku na „platnu" ciljnog odnosa (cena po slici); FLUX.2 Pro outpaint
    // čeka serversko merenje dimenzija (K06-9, N7) - vidi `lib/crea-reframe.ts`.
    price: { kind: "credits", modelSlug: "nano-banana-2", inputMode: "image_multi" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "slika.svetlo",
    featureIds: ["S18"],
    area: "slika",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Novo svetlo", en: "New lighting" },
    summary: {
      sr: "Pomeri „sunce\" oko lika i AI ga osvetli sa te strane.",
      en: "Move the \"sun\" around the character and AI lights it from that side.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "nano-banana-pro", inputMode: "image_multi" },
    savesToGallery: true,
    paidFallback: { modelSlug: "nano-banana-2", inputMode: "image_multi" },
  },
  {
    id: "slika.uglovi",
    featureIds: ["S19"],
    area: "slika",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Uglovi kamere", en: "Camera angles" },
    summary: {
      sr: "Devet uglova istog prizora iz jedne generacije - mreža 3×3 se na uređaju iseče u 9 radova.",
      en: "Nine angles of the same scene from a single generation - the 3×3 grid is cut into 9 works on your device.",
    },
    inputs: ["image"],
    output: "images",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "nano-banana-2", inputMode: "image_multi" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "slika.slojevi",
    featureIds: ["S20"],
    area: "slika",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Slojevi", en: "Layers" },
    summary: {
      sr: "Rastavi sliku na slojeve, pa ih pomeraj, sakrij, prefarbaj i spoji - i izvezi novu sliku.",
      en: "Split an image into layers, then move, hide, recolour and merge them - and export a new image.",
    },
    inputs: ["image"],
    output: "images",
    device: { minClass: "phone" },
    price: { kind: "credits", modelSlug: "seedream-5-pro", inputMode: "layerize" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "slika.tekst",
    featureIds: ["S21"],
    area: "slika",
    mode: "izmeni",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Tekst kao sloj", en: "Text as a layer" },
    summary: {
      sr: "Tekst bez grešaka, sa č, ć, š, ž, đ i ćirilicom; stari tekst se prepozna i obriše.",
      en: "Error-free text, including Serbian letters and Cyrillic; old text is recognised and removed.",
    },
    inputs: ["image"],
    output: "image",
    device: { minClass: "phone" },
    price: FREE,
    // Prepoznavanje (Tesseract) + brisanje starog teksta na uređaju (MI-GAN, kao „Obriši predmet").
    localModels: ["tess-srp", "tess-srp-latn", "migan"],
    savesToGallery: true,
    paidFallback: { modelSlug: "ideogram-45", inputMode: "mask" },
  },
  {
    id: "slika.retus",
    featureIds: ["S22"],
    area: "slika",
    mode: "izmeni",
    tier: "local-code",
    status: "ready",
    title: { sr: "Retuš i stare fotke", en: "Retouch and old photos" },
    summary: {
      sr: "Blag retuš kože besplatno; vraćanje oštećenih starih fotki uz kredite.",
      en: "Gentle skin retouching for free; restoring damaged old photos costs credits.",
    },
    inputs: ["image"],
    output: "image",
    // Filter na platnu (CPU), bez WebGL-a - radi svuda od telefona naviše.
    device: { minClass: "phone" },
    price: FREE,
    savesToGallery: true,
    paidFallback: { modelSlug: "nano-banana-pro", inputMode: "image_multi" },
  },
  {
    id: "slika.odeca",
    featureIds: ["S23"],
    area: "slika",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Odeća i proizvodi", en: "Clothes and products" },
    summary: {
      sr: "Probaj odeću na liku, ili iseci proizvod i postavi ga u scenu.",
      en: "Try clothes on a character, or cut out a product and place it in a scene.",
    },
    inputs: ["image", "image"],
    output: "image",
    // Isečak proizvoda je klik (MagicTouch) na uređaju, kao „Klikni i izaberi".
    device: { minClass: "phone" },
    price: { kind: "credits", modelSlug: "kling-tryon", inputMode: "image_multi" },
    localModels: ["mp-interactive-segmenter"],
    savesToGallery: true,
    paidFallback: { modelSlug: "nano-banana-2", inputMode: "image_multi" },
    localSave: true,
  },
  {
    id: "slika.zameni-lik",
    featureIds: ["S24", "S35"],
    area: "slika",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Zameni lik", en: "Swap the character" },
    summary: {
      sr: "Stavi svoj sačuvani lik u fotku - samo svoj, uz tvoj pristanak.",
      en: "Put your own saved character into a photo - only your own, with your consent.",
    },
    inputs: ["image"],
    output: "image",
    // Fotka koja se menja prvo prolazi proveru lica (BlazeFace) na uređaju.
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "nano-banana-pro", inputMode: "image_multi" },
    localModels: ["mp-face-detector"],
    savesToGallery: true,
    paidFallback: { modelSlug: "nano-banana-2", inputMode: "image_multi" },
  },

  // ── Slika · Likovi ────────────────────────────────────────────────────────
  // K14: ekran „Likovi" je besplatan (čuvanje elementa, provera fotke na uređaju);
  // krediti idu tek kad se element pozove u poslu (`@pominjanje`).
  {
    id: "slika.likovi",
    featureIds: ["S34", "S35"],
    area: "slika",
    mode: "likovi",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Moji likovi", en: "My characters" },
    summary: {
      sr: "Sačuvaj lik, mesto ili predmet jednom, pa ga pozovi sa @ime u svakoj slici i videu.",
      en: "Save a character, a place or an object once, then call it with @name in every image and video.",
    },
    inputs: ["images"],
    output: "images",
    device: ANY_DEVICE,
    price: FREE,
    localModels: ["mp-face-detector"],
    // Element nije rad u galeriji: slike čuva `creaElements`.
    savesToGallery: false,
  },
  {
    id: "slika.kreator-lika",
    featureIds: ["S36"],
    area: "slika",
    mode: "likovi",
    tier: "paid",
    status: "ready",
    title: { sr: "Napravi lik kao u igrici", en: "Build a character like in a game" },
    summary: {
      sr: "Izaberi izgled iz menija i dobij list lika spreda, sa strane i otpozadi.",
      en: "Pick the look from menus and get a character sheet from the front, side and back.",
    },
    inputs: ["text"],
    output: "image",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "nano-banana-pro" },
    savesToGallery: true,
    paidFallback: { modelSlug: "nano-banana-2" },
  },

  // ── Slika · Napravi ───────────────────────────────────────────────────────
  // K13: composer („opiši sliku rečima") je glavni put; ovi alati stoje pored njega.
  {
    id: "slika.probni-list",
    featureIds: ["S4", "S5"],
    area: "slika",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Probni list", en: "Contact sheet" },
    summary: {
      sr: "4 do 16 malih skica jeftinim modelom za cenu jedne prave slike - izaberi najbolju, pa je „Usavrši\".",
      en: "4 to 16 small sketches with a cheap model for the price of one real image - pick the best, then \"Refine\" it.",
    },
    inputs: ["text"],
    output: "images",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "z-image-turbo", inputMode: "text" },
    savesToGallery: true,
  },
  {
    id: "slika.ko-gde-kako",
    featureIds: ["S7"],
    area: "slika",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Ko · Gde · Kako", en: "Who · Where · How" },
    summary: {
      sr: "Tri slike - lik, mesto i stil - a opis se sam sklopi.",
      en: "Three pictures - a character, a place and a style - and the description writes itself.",
    },
    inputs: ["images"],
    output: "image",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "nano-banana-2", inputMode: "image_multi" },
    savesToGallery: true,
  },
  {
    id: "slika.crtaj",
    featureIds: ["S9"],
    area: "slika",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Crtaj i gledaj", en: "Draw and watch" },
    summary: {
      sr: "Crtaš, a slika se sama osvežava dok crtaš. Cena svakog osvežavanja piše unapred.",
      en: "You draw, and the picture refreshes by itself as you go. The price of every refresh is shown up front.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "flux-2-klein", inputMode: "image_multi" },
    savesToGallery: true,
  },
  {
    id: "slika.skica",
    featureIds: ["S10"],
    area: "slika",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Skica u sliku", en: "Sketch to image" },
    summary: {
      sr: "Nacrtaj na platnu ili slikaj crtež iz sveske - AI od njega napravi pravu sliku.",
      en: "Draw on the canvas or snap a drawing from your notebook - AI turns it into a real picture.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "nano-banana-2", inputMode: "image_multi" },
    savesToGallery: true,
  },
  {
    id: "slika.nalepnice",
    featureIds: ["S40"],
    area: "slika",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Viber nalepnice", en: "Sticker pack" },
    summary: {
      sr: "Devet izraza tvog lika iz jedne slike, isečeno i spremno za paket; i sprajt za igricu iz kratkog videa.",
      en: "Nine expressions of your character from one picture, cut out and ready as a pack; plus a game sprite from a short video.",
    },
    // Sprajt iz kratkog videa bira fajl sam (sličice se vade na uređaju, 0 kredita).
    inputs: ["image"],
    output: "zip",
    device: { minClass: "phone" },
    price: { kind: "credits", modelSlug: "nano-banana-2", inputMode: "image_multi" },
    savesToGallery: false,
  },
  {
    id: "slika.logo",
    featureIds: ["S41"],
    area: "slika",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Logo i ikone", en: "Logo and icons" },
    summary: {
      sr: "Logo kao vektor (SVG) koji se ne mrvi ni na bilbordu.",
      en: "A logo as a vector (SVG) that stays crisp even on a billboard.",
    },
    inputs: ["text"],
    output: "svg",
    device: ANY_DEVICE,
    // Recraft V4.1 (najjeftiniji znak); pravi vektor (`recraft-41-vector`) kad se upali u katalogu.
    price: { kind: "credits", modelSlug: "recraft-41", inputMode: "text" },
    savesToGallery: false,
  },
  {
    id: "slika.brend-kit",
    featureIds: ["S38"],
    area: "slika",
    mode: "napravi",
    tier: "local-code",
    status: "ready",
    title: { sr: "Brend kit", en: "Brand kit" },
    summary: {
      sr: "Logo, boje, slova i ton tvoje firme - jednom podesiš, recepti i editor ih sami koriste.",
      en: "Your business logo, colours, fonts and tone - set once, recipes and the editor use them on their own.",
    },
    inputs: ["image"],
    output: "text",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: false,
  },
  {
    id: "slika.3d-model",
    featureIds: ["S42"],
    area: "slika",
    mode: "napravi",
    tier: "paid",
    status: "soon",
    title: { sr: "Slika u 3D model", en: "Image to 3D model" },
    summary: {
      sr: "Od slike predmeta napravi 3D model koji možeš da okrećeš.",
      en: "Turn a picture of an object into a 3D model you can spin around.",
    },
    inputs: ["image"],
    output: "zip",
    device: { minClass: "phone", requires: ["webgl2"] },
    price: { kind: "credits" },
    savesToGallery: false,
  },

  // ── Video ─────────────────────────────────────────────────────────────────
  {
    id: "video.poslednji-kadar",
    featureIds: ["V4"],
    area: "video",
    mode: "napravi",
    tier: "local-code",
    status: "ready",
    title: { sr: "Nastavi od poslednjeg kadra", en: "Continue from the last frame" },
    summary: {
      sr: "Izvuci poslednji (ili bilo koji) kadar videa na svom uređaju, pa od njega napravi sledeći klip.",
      en: "Pull the last (or any) frame of a video on your device, then make the next clip from it.",
    },
    inputs: ["video"],
    output: "image",
    // K18: bez WebCodecs-a radi kroz običan `<video>` element (Firefox za Android), pa ih ne traži.
    device: { minClass: "phone" },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "video.vise-scena",
    featureIds: ["V11"],
    area: "video",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Više scena u jednom klipu", en: "Several scenes in one clip" },
    summary: {
      sr: "Do šest kartica - šta se dešava i kako se kamera kreće - postaje jedan klip sa rezovima (Kling 3.0).",
      en: "Up to six cards - what happens and how the camera moves - become one clip with cuts (Kling 3.0).",
    },
    inputs: ["image"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "kling-3", inputMode: "text" },
    savesToGallery: true,
  },
  {
    id: "video.crtaj-pokret",
    featureIds: ["V12"],
    area: "video",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Crtaj pokret", en: "Draw the motion" },
    summary: {
      sr: "Nacrtaj strelice preko slike - šta se pomera i kuda - i slika oživi baš tako.",
      en: "Draw arrows over a picture - what moves and where - and the picture comes to life exactly like that.",
    },
    inputs: ["image"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "hailuo-23-fast", inputMode: "image" },
    savesToGallery: true,
  },
  // K21: složeni tokovi koji završavaju kao montaža (V10, V28, V31).
  {
    id: "video.strip",
    featureIds: ["V10"],
    area: "video",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Strip → film", en: "Comic strip → film" },
    summary: {
      sr: "Napiši priču - Crea je složi u strip od 3 do 8 kadrova, nacrta ih sa tvojim Likom, oživi i spoji u film.",
      en: "Write a story - Crea lays it out as a 3-8 panel comic, draws it with your character, animates it and joins it into a film.",
    },
    inputs: ["text", "image"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "nano-banana-2-lite", inputMode: "text" },
    savesToGallery: true,
  },
  {
    id: "video.objasnjenje",
    featureIds: ["V28"],
    area: "video",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Objašnjavajući video", en: "Explainer video" },
    summary: {
      sr: "Lekcija ili tekst postaje kratak video sa slikama u stilu table, papira ili gline, srpskim glasom i titlovima.",
      en: "A lesson or a text becomes a short video with chalkboard, paper or clay pictures, a Serbian voice and subtitles.",
    },
    inputs: ["text"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "nano-banana-2-lite", inputMode: "text" },
    savesToGallery: true,
    localSave: true,
    alsoSaves: ["image"],
  },
  {
    id: "video.reklama",
    featureIds: ["V31"],
    area: "video",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Reklama za mali biznis", en: "An ad for a small business" },
    summary: {
      sr: "Fotka proizvoda i dve rečenice postaju govorni oglas ili animacija proizvoda, u bojama tvog brenda.",
      en: "A product photo and two sentences become a voice-over ad or a product animation, in your brand colours.",
    },
    inputs: ["image", "text"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "gemini-tts", inputMode: "text" },
    savesToGallery: true,
    localSave: true,
    alsoSaves: ["image"],
  },
  {
    id: "video.produzi",
    featureIds: ["V5"],
    area: "video",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Produži klip", en: "Extend a clip" },
    summary: {
      sr: "Dodaj nastavak posle kraja ili početak pre prvog kadra (Seedance 2.5, Veo 3.1).",
      en: "Add what comes after the end or before the first frame (Seedance 2.5, Veo 3.1).",
    },
    inputs: ["video"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "seedance-25", inputMode: "reference" },
    savesToGallery: true,
  },
  {
    id: "video.montaza",
    featureIds: ["V24"],
    area: "video",
    mode: "montaza",
    tier: "local-code",
    status: "ready",
    title: { sr: "Montaža", en: "Editing" },
    summary: {
      sr: "Seci, spajaj, dodaj prelaze, naslove, nalepnice i muziku, pa izvezi MP4 ili GIF.",
      en: "Cut, join, add transitions, titles, stickers and music, then export an MP4 or a GIF.",
    },
    inputs: ["video", "audio", "image"],
    output: "video",
    // K17-5: radi i na telefonu (uz granice dužine i rezolucije); bez WebCodecs-a
    // ostaju pregled i GIF, uz poruku (K17-3) - zato alat ne traži `webcodecs-video`.
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: true,
    alsoSaves: ["image"],
  },
  {
    id: "video.ritam-sabloni",
    featureIds: ["V29"],
    area: "video",
    mode: "montaza",
    tier: "local-code",
    status: "ready",
    title: { sr: "Ubaci i gotovo", en: "Drop in and done" },
    summary: {
      sr: "Tvoje slike se same slože po ritmu pesme.",
      en: "Your pictures line up to the beat of a song by themselves.",
    },
    inputs: ["images", "audio"],
    output: "video",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: true,
    alsoSaves: ["image"],
  },
  {
    id: "video.izvoz",
    featureIds: ["V30"],
    area: "video",
    mode: "montaza",
    tier: "local-code",
    status: "ready",
    title: { sr: "Izvoz za mreže", en: "Export for social media" },
    summary: {
      sr: "Pravi format i sigurne zone za Instagram, TikTok i YouTube, uz proveru pre objave.",
      en: "The right format and safe zones for Instagram, TikTok and YouTube, with a check before you post.",
    },
    inputs: ["video"],
    output: "video",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: true,
    alsoSaves: ["image"],
  },
  // K20: Video · Izmeni (V13-V19), Pokret (V20) i Govor (V21-V23).
  {
    id: "video.izmeni-recima",
    featureIds: ["V13"],
    area: "video",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Izmeni video rečima", en: "Edit a video with words" },
    summary: {
      sr: "Napiši šta da se promeni - „dodaj kišu\", „skloni auto\" - a pokret i kamera ostaju isti.",
      en: "Write what should change - \"add rain\", \"remove the car\" - and the motion and camera stay the same.",
    },
    inputs: ["video", "text", "image"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "kling-o3-edit", inputMode: "video" },
    savesToGallery: true,
  },
  {
    id: "video.zameni",
    featureIds: ["V14"],
    area: "video",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Zameni predmet ili lik", en: "Swap an object or a character" },
    summary: {
      sr: "Slikom pokaži novi predmet (ili izaberi svoj Lik) i on ulazi u video umesto starog.",
      en: "Show the new object with a picture (or pick your character) and it replaces the old one in the video.",
    },
    inputs: ["video", "image"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "kling-o3-edit", inputMode: "video" },
    savesToGallery: true,
  },
  {
    id: "video.reframe",
    featureIds: ["V15"],
    area: "video",
    mode: "izmeni",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Prekroji kadar videa", en: "Reframe a video" },
    summary: {
      sr: "Isti video u 9:16, 1:1, 16:9 ili 4:5 (prekrajanje = novi oblik kadra), a lice ostaje u kadru.",
      en: "The same video in 9:16, 1:1, 16:9 or 4:5 (reframing = a new frame shape), and the face stays in the frame.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop", requires: ["webcodecs-video"] },
    price: FREE,
    localModels: ["mp-face-detector"],
    savesToGallery: true,
  },
  {
    id: "video.boje",
    featureIds: ["V16"],
    area: "video",
    mode: "izmeni",
    tier: "local-code",
    status: "ready",
    title: { sr: "Boje videa", en: "Video colour" },
    summary: {
      sr: "Isti filmski izgledi i klizači kao za sliku, za ceo video - izvoz u MP4, zvuk ostaje.",
      en: "The same film looks and sliders as for images, for the whole video - exported as MP4, the sound stays.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop", requires: ["webgl2", "webcodecs-video"] },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "video.pozadina",
    featureIds: ["V18"],
    area: "video",
    mode: "izmeni",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Ukloni pozadinu videa", en: "Remove a video background" },
    summary: {
      sr: "Ljude iz videa iseci besplatno, na svom uređaju, i stavi ih na boju, zamućenje ili sliku.",
      en: "Cut people out of a video for free, on your device, and put them on a colour, a blur or a picture.",
    },
    inputs: ["video", "image"],
    output: "video",
    device: { minClass: "desktop", requires: ["webcodecs-video"] },
    price: FREE,
    localModels: ["mp-selfie-segmenter"],
    savesToGallery: true,
  },
  {
    id: "video.uvecaj",
    featureIds: ["V17"],
    area: "video",
    mode: "izmeni",
    tier: "paid",
    status: "ready",
    title: { sr: "Uvećaj video", en: "Upscale a video" },
    summary: {
      sr: "Oštriji i veći video - 1080p, 2K ili 4K (ByteDance), plaća se po sekundi.",
      en: "A sharper, bigger video - 1080p, 2K or 4K (ByteDance), paid per second.",
    },
    inputs: ["video"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "video-upscaler", inputMode: "video" },
    savesToGallery: true,
  },
  {
    id: "video.slowmo",
    featureIds: ["V17"],
    area: "video",
    mode: "izmeni",
    tier: "local-code",
    status: "ready",
    title: { sr: "Usporeni snimak", en: "Slow motion" },
    summary: {
      sr: "Uspori video 2× ili 4× - između kadrova se ubace meko stopljeni kadrovi, bez seckanja.",
      en: "Slow a video down 2× or 4× - softly blended frames go between the real ones, without stutter.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop", requires: ["webcodecs-video"] },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "video.bez-treperenja",
    featureIds: ["V17"],
    area: "video",
    mode: "izmeni",
    tier: "local-code",
    status: "ready",
    title: { sr: "Ukloni treperenje", en: "Remove flicker" },
    summary: {
      sr: "Svetlo koje pulsira (sijalice, timelapse, AI video) se ujednači, a prava promena svetla ostaje.",
      en: "Pulsing light (bulbs, timelapse, AI video) is evened out, while real light changes stay.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop", requires: ["webcodecs-video"] },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "video.svetlo",
    featureIds: ["V19"],
    area: "video",
    mode: "izmeni",
    tier: "paid",
    status: "soon",
    title: { sr: "Novo svetlo za video", en: "New lighting for a video" },
    summary: {
      sr: "Promeni odakle i kakvo svetlo pada na scenu u videu.",
      en: "Change where the light comes from and what it is like in a video.",
    },
    inputs: ["video"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits" },
    savesToGallery: true,
  },
  {
    id: "video.odglumi",
    featureIds: ["V20"],
    area: "video",
    mode: "pokret",
    tier: "paid",
    status: "ready",
    title: { sr: "Odglumi", en: "Act it out" },
    summary: {
      sr: "Snimi sebe kamerom (ili okači snimak pokreta), a tvoj Lik ponovi isti pokret.",
      en: "Record yourself with the camera (or upload a motion clip) and your character repeats the same move.",
    },
    inputs: ["video", "image"],
    output: "video",
    device: { minClass: "phone", requires: ["media-recorder"] },
    price: { kind: "credits", modelSlug: "kling-motion", inputMode: "video_image" },
    savesToGallery: true,
  },
  {
    id: "video.lik-govori",
    featureIds: ["V21", "V22", "V23"],
    area: "video",
    mode: "govor",
    tier: "paid",
    status: "ready",
    title: { sr: "Lik koji govori", en: "A talking character" },
    summary: {
      sr: "Napiši tekst, Crea ga izgovori na srpskom, a tvoj Lik ga kaže - u selfiju, podkastu, vestima, na predavanju ili u autu.",
      en: "Write a text, Crea says it in Serbian and your character speaks it - in a selfie, a podcast, the news, a lecture or a car.",
    },
    inputs: ["text", "image", "video", "audio"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "kling-avatar", inputMode: "image_audio" },
    savesToGallery: true,
  },
  {
    id: "video.titlovi",
    featureIds: ["V25"],
    area: "video",
    mode: "montaza",
    // K21: titl se utiskuje na uređaju (0 kr); tekst napišeš sam ili ga prepozna
    // `stt` (plaćeno, ~2 kr po minutu). Whisper na uređaju nije uveden (K17-14, ODLUKA).
    tier: "local-code",
    status: "ready",
    title: { sr: "Titlovi na srpskom", en: "Serbian subtitles" },
    summary: {
      sr: "Titlovi latinicom ili ćirilicom, u karaoke stilu, utisnuti u video.",
      en: "Subtitles in Latin or Cyrillic, karaoke style, burned into the video.",
    },
    inputs: ["video", "text"],
    output: "video",
    // Kao montaža (K17-5): radi i na telefonu; bez WebCodecs-a ostaju pregled, GIF i SRT/VTT.
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: true,
    alsoSaves: ["image"],
    paidFallback: { modelSlug: "stt", inputMode: "video" },
  },
  {
    id: "video.shorts",
    featureIds: ["V26"],
    area: "video",
    mode: "montaza",
    tier: "paid",
    status: "ready",
    title: { sr: "Kratki klipovi iz dugog videa", en: "Short clips from a long video" },
    summary: {
      sr: "Najbolji momenti iz dugog snimka, kao 9:16 klipovi sa titlovima.",
      en: "The best moments of a long recording, as 9:16 clips with subtitles.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop", requires: ["webcodecs-video"] },
    price: { kind: "credits", modelSlug: "stt", inputMode: "video" },
    localModels: ["mp-face-detector"],
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "video.retro",
    featureIds: ["V27"],
    area: "video",
    mode: "izmeni",
    tier: "local-code",
    status: "ready",
    title: { sr: "Retro efekti", en: "Retro effects" },
    summary: {
      sr: "VHS, stari televizor, glič, noćni vid, Nokia i pisaća mašina.",
      en: "VHS, an old TV, glitch, night vision, Nokia and typewriter.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop", requires: ["webgl2", "webcodecs-video"] },
    price: FREE,
    savesToGallery: true,
  },

  // ── Zvuk ──────────────────────────────────────────────────────────────────
  // K22: Govor (A2, A4, A5, A6) i Glasovi (A3, A7, A8).
  {
    id: "zvuk.govor",
    featureIds: ["A2", "A4"],
    area: "zvuk",
    mode: "govor",
    tier: "paid",
    status: "ready",
    title: { sr: "Govor sa emocijama", en: "Speech with emotion" },
    summary: {
      sr: "Izaberi motor i glas, ubaci nalepnice kao [šapuće] ili [pauza 1s], podesi raspoloženje i brzinu - i dobij do 4 verzije.",
      en: "Pick an engine and a voice, drop in stickers like [whispers] or [pause 1s], set the mood and speed - and get up to 4 takes.",
    },
    inputs: ["text"],
    output: "audio",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "gemini-tts", inputMode: "text" },
    savesToGallery: true,
  },
  {
    id: "zvuk.dijalog",
    featureIds: ["A5"],
    area: "zvuk",
    mode: "govor",
    tier: "paid",
    status: "ready",
    title: { sr: "Dijalog i podkast", en: "Dialogue and podcast" },
    summary: {
      sr: "Do 10 govornika, replika po replika. Izmeniš jednu repliku - plaćaš samo nju; snimak se spaja na tvom uređaju.",
      en: "Up to 10 speakers, line by line. Change one line - pay only for it; the recording is joined on your device.",
    },
    inputs: ["text"],
    output: "audio",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "gemini-tts", inputMode: "text" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "zvuk.podkast",
    featureIds: ["A6"],
    area: "zvuk",
    mode: "govor",
    tier: "paid",
    status: "ready",
    title: { sr: "Podkast iz lekcije", en: "Podcast from a lesson" },
    summary: {
      sr: "Nalepi tekst lekcije: Crea besplatno napiše razgovor dva voditelja, pa ga izgovori i spoji.",
      en: "Paste a lesson: Crea writes a two-host conversation for free, then voices and joins it.",
    },
    inputs: ["text"],
    output: "audio",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "gemini-tts", inputMode: "text" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "zvuk.glasovi",
    featureIds: ["A3"],
    area: "zvuk",
    mode: "glasovi",
    tier: "local-code",
    status: "ready",
    title: { sr: "Biblioteka glasova", en: "Voice library" },
    summary: {
      sr: "Filtriraj po polu, godinama i tonu, preslušaj besplatno, sačuvaj omiljene i svoja podešavanja.",
      en: "Filter by gender, age and tone, listen for free, keep your favourites and your settings.",
    },
    inputs: [],
    output: "audio",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: false,
    cloudFallback: true,
  },
  {
    id: "zvuk.dizajn",
    featureIds: ["A8"],
    area: "zvuk",
    mode: "glasovi",
    tier: "paid",
    status: "ready",
    title: { sr: "Dizajniraj glas", en: "Design a voice" },
    summary: {
      sr: "Opiši glas rečima - Crea predloži 3 glasa koji tako zvuče, preslušaš ih i sačuvaš onaj koji ti se dopadne.",
      en: "Describe a voice in words - Crea suggests 3 voices that sound like it, you listen and keep the one you like.",
    },
    inputs: ["text"],
    output: "audio",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "gemini-tts", inputMode: "text" },
    savesToGallery: true,
  },
  {
    id: "zvuk.kloniraj",
    featureIds: ["A7"],
    area: "zvuk",
    mode: "glasovi",
    tier: "local-code",
    // „Uskoro" dok kloniranje nema provajdera (A7, BLOKADA K22): snimak pristanka ne
    // ide Google-u za tok koji se završava porukom „uskoro" (K29 S-07).
    status: "soon",
    title: { sr: "Kloniraj svoj glas", en: "Clone your voice" },
    summary: {
      sr: "Samo tvoj glas: snimiš se uz merač i proveru buke, izgovoriš pristanak, a Crea ga proveri.",
      en: "Your own voice only: record yourself with a level meter and a noise check, say the consent sentence, and Crea checks it.",
    },
    inputs: ["audio"],
    output: "audio",
    device: { minClass: "weak", requires: ["media-recorder"] },
    price: FREE,
    savesToGallery: false,
    cloudFallback: true,
  },
  // K23: Promena glasa (A9), Prevod (A10), Muzika (A11, A12), Efekti (A13), trake (A18);
  // oznaka „Sigurno za objavu" (A21) je u `lib/crea-license-tags.ts`.
  {
    id: "zvuk.promena",
    featureIds: ["A9", "A21"],
    area: "zvuk",
    mode: "promena",
    tier: "paid",
    status: "ready",
    title: { sr: "Promeni glas po govorniku", en: "Change voices per speaker" },
    summary: {
      sr: "Snimak ili video: svaki govornik dobije svoj novi glas, a muzika u pozadini ostaje. Spaja se na tvom uređaju.",
      en: "A recording or a video: each speaker gets a new voice of their own, and the background music stays. Joined on your device.",
    },
    inputs: ["audio", "video"],
    output: "audio",
    alsoSaves: ["video"],
    device: { minClass: "phone" },
    price: { kind: "credits", modelSlug: "voice-changer", inputMode: "audio" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "zvuk.prevod",
    featureIds: ["A10", "A21"],
    area: "zvuk",
    mode: "prevod",
    tier: "paid",
    status: "ready",
    title: { sr: "Prevod uz pregled", en: "Dubbing with review" },
    summary: {
      sr: "Crea zapiše šta se govori i prevede - ti ispraviš tekst i prevod PRE izgovora. Izmeniš rečenicu, plaćaš samo nju; usne po želji, titlovi (SRT) besplatno.",
      en: "Crea writes down what is said and translates it - you fix the text and translation BEFORE it is spoken. Change a sentence, pay only for it; lips if you want, subtitles (SRT) for free.",
    },
    inputs: ["video", "audio"],
    output: "audio",
    alsoSaves: ["video"],
    device: { minClass: "phone" },
    price: { kind: "credits", modelSlug: "gemini-tts", inputMode: "text" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "zvuk.muzika",
    featureIds: ["A11", "A21"],
    area: "zvuk",
    mode: "muzika",
    tier: "paid",
    status: "ready",
    title: { sr: "Pesma po delovima", en: "Song by sections" },
    summary: {
      sr: "Uvod, strofa, refren - svaki deo sa svojim tekstom; ili instrumental, ili petlja za video. Cena na dugmetu.",
      en: "Intro, verse, chorus - each section with its own lyrics; or instrumental, or a loop for a video. The price is on the button.",
    },
    inputs: ["text"],
    output: "audio",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "lyria-3-clip", inputMode: "text" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "zvuk.ozvuci",
    featureIds: ["A12", "A21"],
    area: "zvuk",
    mode: "muzika",
    tier: "paid",
    status: "ready",
    title: { sr: "Ozvuči moj video", en: "Score my video" },
    summary: {
      sr: "Crea pogleda klip i predloži muziku, napravi 4 numere i efekte, a muzika se sama utiša ispod govora.",
      en: "Crea looks at the clip and suggests music, makes 4 tracks and effects, and the music dips under speech by itself.",
    },
    inputs: ["video"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "lyria-3-clip", inputMode: "text" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "zvuk.efekti",
    featureIds: ["A13", "A21"],
    area: "zvuk",
    mode: "efekti",
    tier: "paid",
    status: "ready",
    title: { sr: "Zvučni efekti", en: "Sound effects" },
    summary: {
      sr: "Besplatna CC0 biblioteka sa pretragom - ili nov efekat iz opisa, jeftino ili u najboljem kvalitetu.",
      en: "A free CC0 library with search - or a new effect from a description, cheap or at the best quality.",
    },
    inputs: ["text"],
    output: "audio",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "mmaudio-sfx", inputMode: "text" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "zvuk.trake",
    featureIds: ["A18", "A21"],
    area: "zvuk",
    mode: "uredjivac",
    tier: "paid",
    status: "ready",
    title: { sr: "Razdvoji na trake", en: "Split into stems" },
    summary: {
      sr: "Pesma ili video postane četiri trake: glas, bubanj, bas i ostalo. Karaoke (bez glasa) se spaja besplatno.",
      en: "A song or a video becomes four tracks: vocals, drums, bass and the rest. A karaoke mix (no vocals) is joined for free.",
    },
    inputs: ["audio", "video"],
    output: "audio",
    device: { minClass: "phone" },
    price: { kind: "credits", modelSlug: "stems", inputMode: "audio" },
    savesToGallery: true,
    localSave: true,
  },
  {
    id: "zvuk.snimac",
    featureIds: ["A17"],
    area: "zvuk",
    mode: "uredjivac",
    tier: "local-code",
    status: "ready",
    title: { sr: "Snimač", en: "Recorder" },
    summary: {
      sr: "Snimi glas u browseru, uz merač jačine i „snimi ponovo\".",
      en: "Record your voice in the browser, with a level meter and \"record again\".",
    },
    inputs: [],
    output: "audio",
    device: { minClass: "weak", requires: ["media-recorder"] },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "zvuk.uredjivac",
    featureIds: ["A14"],
    area: "zvuk",
    mode: "uredjivac",
    tier: "local-code",
    status: "ready",
    title: { sr: "Uređivač zvuka", en: "Audio editor" },
    summary: {
      sr: "Seci, spajaj, skrati pauze, dodaj odjek i muziku ispod govora, podesi glasnoću za mreže i izvezi MP3 ili WAV.",
      en: "Cut, join, shorten pauses, add echo and music under the speech, set the loudness for social media and export MP3 or WAV.",
    },
    inputs: ["audio", "video"],
    output: "audio",
    device: { minClass: "phone", requires: ["audio-worklet"] },
    price: FREE,
    localModels: ["silero-vad"],
    savesToGallery: true,
  },
  {
    id: "zvuk.ciscenje",
    featureIds: ["A15"],
    area: "zvuk",
    mode: "uredjivac",
    tier: "local-ai",
    status: "ready",
    title: { sr: "Očisti zvuk", en: "Clean up audio" },
    summary: {
      sr: "Skloni šum iz snimka na uređaju; težak slučaj uz kredite.",
      en: "Remove noise from a recording on your device; hard cases cost credits.",
    },
    inputs: ["audio", "video"],
    output: "audio",
    // K24: procesor RNNoise/GTCRN radi na glavnoj niti u blokovima (bez AudioWorklet-a, vidi `uredjivac/denoise.ts`).
    device: { minClass: "phone" },
    price: FREE,
    localModels: ["rnnoise", "gtcrn"],
    savesToGallery: true,
    paidFallback: { modelSlug: "audio-isolation" },
  },
  {
    id: "zvuk.transkript",
    featureIds: ["A16"],
    area: "zvuk",
    mode: "uredjivac",
    // K24: tekst prepoznaje postojeći `stt` (po minutu, kao titlovi K21); uređivanje tekstom,
    // pismo, SRT/VTT i sečenje snimka su na uređaju (0 kr). Whisper na uređaju nije uveden (K21).
    tier: "local-code",
    status: "ready",
    title: { sr: "Transkript", en: "Transcript" },
    summary: {
      sr: "Snimak u tekst sa govornicima i vremenom; obriši reč i nestane iz snimka.",
      en: "A recording to text with speakers and timing; delete a word and it disappears from the audio.",
    },
    inputs: ["audio", "video"],
    output: "audio",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: true,
    paidFallback: { modelSlug: "stt" },
  },
  {
    id: "zvuk.ritam",
    featureIds: ["A19"],
    area: "zvuk",
    mode: "uredjivac",
    tier: "local-code",
    status: "ready",
    title: { sr: "Ritam i tonalitet", en: "Tempo and key" },
    summary: {
      sr: "Koliko udaraca u minuti i u kom tonalitetu je pesma, sa markerima za montažu.",
      en: "Beats per minute and the key of a song, with markers for editing.",
    },
    inputs: ["audio", "video"],
    output: "text",
    device: { minClass: "phone" },
    price: FREE,
    savesToGallery: false,
  },
  {
    id: "zvuk.audiogram",
    featureIds: ["A20"],
    area: "zvuk",
    mode: "uredjivac",
    tier: "local-code",
    status: "ready",
    title: { sr: "Audiogram", en: "Audiogram" },
    summary: {
      sr: "Zvuk i slika postanu video sa talasom i titlovima.",
      en: "Sound and a picture become a video with a waveform and subtitles.",
    },
    inputs: ["audio", "image"],
    output: "video",
    device: { minClass: "phone", requires: ["webcodecs-video"] },
    price: FREE,
    savesToGallery: true,
  },
  // ── K28: pomoćnik (U12) i tabla (U13) ────────────────────────────────────
  {
    id: "slika.pomocnik",
    featureIds: ["U12"],
    area: "slika",
    mode: "napravi",
    tier: "paid",
    status: "ready",
    title: { sr: "Pomoćnik: od rečenice do kampanje", en: "Assistant: from a sentence to a campaign" },
    summary: {
      sr: "Napiši šta ti treba, a pomoćnik složi korake - slika, video, muzika, glas - pokaže ukupnu cenu i čeka tvoje „da”.",
      en: "Write what you need and the assistant lines up the steps - image, video, music, voice - shows the total price and waits for your “yes”.",
    },
    inputs: ["text"],
    output: "image",
    device: ANY_DEVICE,
    // Prvi korak je najčešće slika; cena celog plana stoji pre potvrde.
    price: { kind: "credits", modelSlug: "nano-banana-2", inputMode: "text" },
    savesToGallery: true,
  },
  {
    id: "slika.tabla",
    featureIds: ["U13"],
    area: "slika",
    mode: "alati",
    tier: "local-code",
    status: "ready",
    title: { sr: "Tabla za ideje", en: "Idea board" },
    summary: {
      sr: "Beskonačna tabla za reference, radove i beleške. Prevuci karticu na polje za opis i postaje referenca.",
      en: "An endless board for references, pieces and notes. Drag a card onto the description field and it becomes a reference.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    price: FREE,
    savesToGallery: true,
  },
];

export function toolById(id: string | null | undefined): CreaTool | undefined {
  if (!id) return undefined;
  return CREA_TOOLS.find((tool) => tool.id === id);
}

/** Alati jedne oblasti (i režima), redosledom registra; gotovi pre onih koji stižu. */
export function toolsFor(area: CreaArea, mode?: CreaModeId): CreaTool[] {
  const matching = CREA_TOOLS.filter((tool) => tool.area === area && (mode === undefined || tool.mode === mode));
  return [...matching.filter((tool) => tool.status === "ready"), ...matching.filter((tool) => tool.status === "soon")];
}

export function isLocalTier(tier: CreaToolTier): boolean {
  return tier === "local-code" || tier === "local-ai";
}

export type CreaToolBadge = "besplatno" | "na-uredjaju" | "krediti" | "uskoro";

export function toolBadges(tool: CreaTool): CreaToolBadge[] {
  const badges: CreaToolBadge[] = tool.cloudFallback
    ? ["besplatno"]
    : isLocalTier(tool.tier)
    ? ["besplatno", "na-uredjaju"]
    : tool.localSave
      ? ["krediti", "na-uredjaju"]
      : ["krediti"];
  if (tool.status === "soon" || tool.tier === "server") badges.push("uskoro");
  return badges;
}

/**
 * Sme li alat da sačuva rezultat kao lokalni rad (`creaLocal.saveLocalResult`):
 * lokalni alat, ili plaćen alat sa besplatnim korakom na uređaju (`localSave`).
 */
export function savesLocalResults(tool: CreaTool): boolean {
  return isLocalTier(tool.tier) || tool.localSave === true;
}

/** `modelSlug` posla koji je napravio lokalni alat. */
export const LOCAL_MODEL_SLUG_PREFIX = "local:";

export function localModelSlug(toolId: string): string {
  return `${LOCAL_MODEL_SLUG_PREFIX}${toolId}`;
}

export function toolIdFromModelSlug(slug: string): string | null {
  return slug.startsWith(LOCAL_MODEL_SLUG_PREFIX) ? slug.slice(LOCAL_MODEL_SLUG_PREFIX.length) : null;
}

/** Alat koji je napravio posao, ako je posao lokalni. */
export function toolOfJob(job: { modelSlug: string }): CreaTool | undefined {
  return toolById(toolIdFromModelSlug(job.modelSlug));
}
