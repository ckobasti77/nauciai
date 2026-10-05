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
    status: "soon",
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
    featureIds: ["S24"],
    area: "slika",
    mode: "izmeni",
    tier: "paid",
    status: "soon",
    title: { sr: "Zameni lik", en: "Swap the character" },
    summary: {
      sr: "Samo tvoj sačuvani lik, uz tvoj pristanak.",
      en: "Only your own saved character, with your consent.",
    },
    inputs: ["image"],
    output: "image",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "nano-banana-pro", inputMode: "image_multi" },
    savesToGallery: true,
  },

  // ── Slika · Likovi ────────────────────────────────────────────────────────
  {
    id: "slika.likovi",
    featureIds: ["S34"],
    area: "slika",
    mode: "likovi",
    tier: "paid",
    status: "soon",
    title: { sr: "Likovi i elementi", en: "Characters and elements" },
    summary: {
      sr: "Sačuvaj lik, mesto ili predmet jednom i koristi ga u svakoj slici i videu.",
      en: "Save a character, a place or an object once and use it in every image and video.",
    },
    inputs: ["images"],
    output: "image",
    device: ANY_DEVICE,
    price: { kind: "credits", modelSlug: "nano-banana-pro", inputMode: "image_multi" },
    savesToGallery: true,
  },
  {
    id: "slika.kreator-lika",
    featureIds: ["S36"],
    area: "slika",
    mode: "likovi",
    tier: "paid",
    status: "soon",
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
    status: "soon",
    title: { sr: "Viber nalepnice", en: "Sticker pack" },
    summary: {
      sr: "Devet izraza tvog lika iz jedne slike, isečeno i spremno za paket.",
      en: "Nine expressions of your character from one picture, cut out and ready as a pack.",
    },
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
    status: "soon",
    title: { sr: "Logo i ikone", en: "Logo and icons" },
    summary: {
      sr: "Logo kao vektor (SVG) koji se ne mrvi ni na bilbordu.",
      en: "A logo as a vector (SVG) that stays crisp even on a billboard.",
    },
    inputs: ["text"],
    output: "svg",
    device: ANY_DEVICE,
    price: { kind: "credits" },
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
    status: "soon",
    title: { sr: "Nastavi od poslednjeg kadra", en: "Continue from the last frame" },
    summary: {
      sr: "Poslednji kadar videa postaje početak sledećeg.",
      en: "The last frame of a video becomes the start of the next one.",
    },
    inputs: ["video"],
    output: "image",
    device: { minClass: "phone", requires: ["webcodecs-video"] },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "video.montaza",
    featureIds: ["V24"],
    area: "video",
    mode: "montaza",
    tier: "local-code",
    status: "soon",
    title: { sr: "Montaža", en: "Editing" },
    summary: {
      sr: "Seci, spajaj, dodaj prelaze, naslove i muziku, pa izvezi MP4.",
      en: "Cut, join, add transitions, titles and music, then export an MP4.",
    },
    inputs: ["video", "audio", "image"],
    output: "video",
    device: { minClass: "desktop", requires: ["webcodecs-video"] },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "video.ritam-sabloni",
    featureIds: ["V29"],
    area: "video",
    mode: "montaza",
    tier: "local-code",
    status: "soon",
    title: { sr: "Ubaci i gotovo", en: "Drop in and done" },
    summary: {
      sr: "Tvoje slike se same slože po ritmu pesme.",
      en: "Your pictures line up to the beat of a song by themselves.",
    },
    inputs: ["images", "audio"],
    output: "video",
    device: { minClass: "phone", requires: ["webcodecs-video"] },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "video.izvoz",
    featureIds: ["V30"],
    area: "video",
    mode: "montaza",
    tier: "local-code",
    status: "soon",
    title: { sr: "Izvoz za mreže", en: "Export for social media" },
    summary: {
      sr: "Pravi format i sigurne zone za Instagram, TikTok i YouTube, uz proveru pre objave.",
      en: "The right format and safe zones for Instagram, TikTok and YouTube, with a check before you post.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "phone", requires: ["webcodecs-video"] },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "video.reframe",
    featureIds: ["V15"],
    area: "video",
    mode: "izmeni",
    tier: "local-ai",
    status: "soon",
    title: { sr: "Prekroji kadar videa", en: "Reframe a video" },
    summary: {
      sr: "Isti video u 9:16, 1:1 ili 16:9, a lice ostaje u kadru.",
      en: "The same video in 9:16, 1:1 or 16:9, and the face stays in the frame.",
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
    status: "soon",
    title: { sr: "Boje videa", en: "Video colour" },
    summary: {
      sr: "Filmski izgledi i klizači za boje, izvoz u MP4.",
      en: "Film looks and colour sliders, exported as MP4.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop", requires: ["webgl2", "webcodecs-video"] },
    price: FREE,
    savesToGallery: true,
  },
  {
    id: "video.uvecaj",
    featureIds: ["V17"],
    area: "video",
    mode: "izmeni",
    tier: "paid",
    status: "soon",
    title: { sr: "Uvećaj video", en: "Upscale a video" },
    summary: {
      sr: "Oštriji i veći video, bez treperenja.",
      en: "A sharper, bigger video, without flicker.",
    },
    inputs: ["video"],
    output: "video",
    device: ANY_DEVICE,
    price: { kind: "credits" },
    savesToGallery: true,
  },
  {
    id: "video.slowmo",
    featureIds: ["V17"],
    area: "video",
    mode: "izmeni",
    tier: "local-ai",
    status: "soon",
    title: { sr: "Usporeni snimak", en: "Slow motion" },
    summary: {
      sr: "Uspori video glatko, bez seckanja.",
      en: "Slow a video down smoothly, without stutter.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop-gpu", requires: ["webgpu", "webcodecs-video"] },
    price: FREE,
    localModels: ["rife"],
    savesToGallery: true,
  },
  {
    id: "video.pozadina",
    featureIds: ["V18"],
    area: "video",
    mode: "izmeni",
    tier: "local-ai",
    status: "soon",
    title: { sr: "Ukloni pozadinu videa", en: "Remove a video background" },
    summary: {
      sr: "Ljude iz videa iseci besplatno; predmete uz kredite.",
      en: "Cut people out of a video for free; objects cost credits.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop", requires: ["webcodecs-video"] },
    price: FREE,
    localModels: ["mp-selfie-segmenter"],
    savesToGallery: true,
  },
  {
    id: "video.odglumi",
    featureIds: ["V20"],
    area: "video",
    mode: "pokret",
    tier: "paid",
    status: "soon",
    title: { sr: "Odglumi", en: "Act it out" },
    summary: {
      sr: "Snimi sebe kamerom, a lik sa tvoje slike ponovi pokret.",
      en: "Record yourself with the camera and the character from your picture repeats the move.",
    },
    inputs: ["video", "image"],
    output: "video",
    device: { minClass: "phone", requires: ["media-recorder"] },
    price: { kind: "credits", modelSlug: "kling-motion", inputMode: "video_image" },
    savesToGallery: true,
  },
  {
    id: "video.titlovi",
    featureIds: ["V25"],
    area: "video",
    mode: "montaza",
    tier: "local-ai",
    status: "soon",
    title: { sr: "Titlovi na srpskom", en: "Serbian subtitles" },
    summary: {
      sr: "Titlovi latinicom ili ćirilicom, u karaoke stilu, utisnuti u video.",
      en: "Subtitles in Latin or Cyrillic, karaoke style, burned into the video.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop-gpu", requires: ["webgpu", "webcodecs-video"] },
    price: FREE,
    localModels: ["whisper-large-v3-turbo"],
    savesToGallery: true,
    paidFallback: { modelSlug: "stt" },
  },
  {
    id: "video.shorts",
    featureIds: ["V26"],
    area: "video",
    mode: "montaza",
    tier: "paid",
    status: "soon",
    title: { sr: "Kratki klipovi iz dugog videa", en: "Short clips from a long video" },
    summary: {
      sr: "Najbolji momenti iz dugog snimka, kao 9:16 klipovi sa titlovima.",
      en: "The best moments of a long recording, as 9:16 clips with subtitles.",
    },
    inputs: ["video"],
    output: "video",
    device: { minClass: "desktop", requires: ["webcodecs-video"] },
    price: { kind: "credits", modelSlug: "stt" },
    savesToGallery: true,
  },
  {
    id: "video.retro",
    featureIds: ["V27"],
    area: "video",
    mode: "izmeni",
    tier: "local-code",
    status: "soon",
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
  {
    id: "zvuk.snimac",
    featureIds: ["A17"],
    area: "zvuk",
    mode: "uredjivac",
    tier: "local-code",
    status: "soon",
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
    status: "soon",
    title: { sr: "Uređivač zvuka", en: "Audio editor" },
    summary: {
      sr: "Seci, spajaj, utišaj tišinu, ujednači jačinu i izvezi MP3 ili WAV.",
      en: "Cut, join, trim silence, even out the loudness and export MP3 or WAV.",
    },
    inputs: ["audio"],
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
    status: "soon",
    title: { sr: "Očisti zvuk", en: "Clean up audio" },
    summary: {
      sr: "Skloni šum iz snimka na uređaju; težak slučaj uz kredite.",
      en: "Remove noise from a recording on your device; hard cases cost credits.",
    },
    inputs: ["audio"],
    output: "audio",
    device: { minClass: "phone", requires: ["audio-worklet"] },
    price: FREE,
    savesToGallery: true,
    paidFallback: { modelSlug: "audio-isolation" },
  },
  {
    id: "zvuk.transkript",
    featureIds: ["A16"],
    area: "zvuk",
    mode: "uredjivac",
    tier: "local-ai",
    status: "soon",
    title: { sr: "Transkript", en: "Transcript" },
    summary: {
      sr: "Snimak u tekst sa govornicima i vremenom; obriši reč i nestane iz snimka.",
      en: "A recording to text with speakers and timing; delete a word and it disappears from the audio.",
    },
    inputs: ["audio"],
    output: "text",
    device: { minClass: "desktop-gpu", requires: ["webgpu"] },
    price: FREE,
    localModels: ["whisper-large-v3-turbo"],
    savesToGallery: false,
    paidFallback: { modelSlug: "stt" },
  },
  {
    id: "zvuk.ritam",
    featureIds: ["A19"],
    area: "zvuk",
    mode: "uredjivac",
    tier: "local-code",
    status: "soon",
    title: { sr: "Ritam i tonalitet", en: "Tempo and key" },
    summary: {
      sr: "Koliko udaraca u minuti i u kom tonalitetu je pesma, sa markerima za montažu.",
      en: "Beats per minute and the key of a song, with markers for editing.",
    },
    inputs: ["audio"],
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
    status: "soon",
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
  const badges: CreaToolBadge[] = isLocalTier(tool.tier)
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
