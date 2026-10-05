import { brandPromptLine, type CreaBrandKit } from "./crea-brand-kit";
import { nearestAspectRatio } from "./crea-paid-edit";
import type { CreaIconName } from "./crea-shell";
import type { Locale, LocalizedText } from "./i18n";

/**
 * Recepti (S37, K15; K01-14): ~20 gotovih poslova na srpskom - profilna, CV fotka,
 * jelovnik, pozivnica za slavu… Početnik popuni 2-3 polja, vidi primer i FIKSNU
 * cenu, klikne jedno dugme i dobije sliku, pa mu recept ponudi sledeći korak.
 *
 * Čisti podaci i čista logika (bez React-a): recept zna polja, modele po
 * prednosti, format i rečenicu za model. Cena se NE upisuje u recept - računa se
 * iz kataloga istom funkcijom kao svuda (`creditsFor`, sa faktorom cena v2), a
 * test proverava da ne zavisi od toga šta je korisnik upisao ili izabrao.
 *
 * Posao ide kroz POSTOJEĆI `studio.createJob`: ista cena, isti limiti, isti DEMO
 * bez ključa (O3) i isto stablo verzija. Uputstvo modelu je na engleskom (kao
 * dodaci stila i likova, K13/K14); tekst koji korisnik upiše ide doslovno, pod
 * navodnicima, i model ga prepisuje na srpskom.
 */

export type CreaRecipeOption = { id: string; label: LocalizedText; prompt: string };

export type CreaRecipeField =
  | {
      key: string;
      kind: "text";
      label: LocalizedText;
      placeholder: LocalizedText;
      /** Vrednost za „Popuni primerom". */
      example: LocalizedText;
      maxLength: number;
      required: boolean;
      multiline?: boolean;
    }
  | { key: string; kind: "select"; label: LocalizedText; options: readonly CreaRecipeOption[] }
  | { key: string; kind: "image"; label: LocalizedText; hint: LocalizedText; required: boolean }
  /** Lik iz „Likova" (K14): njegove slike idu kao reference. */
  | { key: string; kind: "element"; label: LocalizedText; hint: LocalizedText };

export type CreaRecipeGroup = "ja" | "posao" | "proslave" | "deca";

export const CREA_RECIPE_GROUPS: ReadonlyArray<{ id: CreaRecipeGroup; label: LocalizedText }> = [
  { id: "ja", label: { sr: "Za tebe", en: "For you" } },
  { id: "posao", label: { sr: "Za posao", en: "For business" } },
  { id: "proslave", label: { sr: "Proslave", en: "Celebrations" } },
  { id: "deca", label: { sr: "Za decu", en: "For kids" } },
];

/** Sledeći korak posle rezultata: alat koji prima rad kao ulaz (`?ulaz=`), ili animacija. */
export type CreaRecipeNextStep = { kind: "tool"; toolId: string; label: LocalizedText } | { kind: "animate"; label: LocalizedText };

/**
 * Kako recept koristi brend kit: `full` - ime, boje, slova, ton i logo kao
 * referentna slika; `style` - sve osim logoa (npr. kad se pravi nov logo);
 * `none` - recept nije za firmu.
 */
export type CreaRecipeBrand = "full" | "style" | "none";

/** Modeli koje recepti koriste; za svaki znamo kako se zadaju format i rezolucija. */
export const RECIPE_MODELS = ["nano-banana-2", "nano-banana-pro", "recraft-41"] as const;
export type CreaRecipeModel = (typeof RECIPE_MODELS)[number];

/** Odnosi stranica koje primaju svi modeli recepata (Nano Banana dokumentuje baš ove). */
export type CreaRecipeAspect = "1:1" | "2:3" | "3:2" | "16:9" | "9:16";

type PromptContext = {
  /** Upisana vrednost polja (sređena), ili `""`. */
  text: (key: string) => string;
  /** Izabrana opcija polja `select`. */
  option: (key: string) => CreaRecipeOption;
  /** „image 1" / „images 2-3" za sliku ili lik iz polja; `null` kad nije priložen. */
  image: (key: string) => string | null;
};

export type CreaRecipe = {
  id: string;
  group: CreaRecipeGroup;
  icon: CreaIconName;
  title: LocalizedText;
  summary: LocalizedText;
  /** Šta se dobija, rečima (primer popunjenog recepta). */
  example: LocalizedText;
  fields: readonly CreaRecipeField[];
  /** Modeli po prednosti; radi prvi koji je dostupan (ključ ili DEMO za osoblje). */
  models: readonly CreaRecipeModel[];
  /** Format; `image` = najbliži formatu priložene slike (npr. stara fotka). */
  aspect: CreaRecipeAspect | "image";
  /** Rezolucija za Nano Bananu (Pro ide najmanje na 2K). */
  resolution: "1K" | "2K" | "4K";
  brand: CreaRecipeBrand;
  prompt: (ctx: PromptContext) => string;
  nextSteps: readonly CreaRecipeNextStep[];
};

const q = (text: string) => `“${text}”`;

/** Isto pravilo za svaki tekst u slici - bez izmišljenih reči i sa našim slovima. */
const TEXT_RULE =
  "Spell every text in the image exactly as given between the quotes, in the same language and script, with correct Serbian letters (č, ć, š, ž, đ). Add no other text.";

const opt = (id: string, sr: string, en: string, prompt: string): CreaRecipeOption => ({ id, label: { sr, en }, prompt });

const STEP = {
  crop: { kind: "tool", toolId: "slika.iseci", label: { sr: "Iseci za mreže", en: "Crop for social" } },
  background: { kind: "tool", toolId: "slika.pozadina", label: { sr: "Ukloni pozadinu", en: "Remove background" } },
  editor: { kind: "tool", toolId: "slika.editor", label: { sr: "Dodaj tekst i nalepnice", en: "Add text and stickers" } },
  vector: { kind: "tool", toolId: "slika.vektor", label: { sr: "Pretvori u vektor (SVG)", en: "Turn into a vector (SVG)" } },
  cut9: { kind: "tool", toolId: "slika.uglovi", label: { sr: "Iseci u 9 slika", en: "Cut into 9 pictures" } },
  retouch: { kind: "tool", toolId: "slika.retus", label: { sr: "Blag retuš", en: "Gentle retouch" } },
  upscale: { kind: "tool", toolId: "slika.uvecaj", label: { sr: "Uvećaj 2×", en: "Upscale 2×" } },
  format: { kind: "tool", toolId: "slika.format", label: { sr: "Smanji za slanje", en: "Shrink for sending" } },
  stickers: { kind: "tool", toolId: "slika.nalepnice", label: { sr: "Napravi nalepnice", en: "Make stickers" } },
  animate: { kind: "animate", label: { sr: "Oživi u video", en: "Bring it to life" } },
} as const satisfies Record<string, CreaRecipeNextStep>;

export const CREA_RECIPES: readonly CreaRecipe[] = [
  // ── Za tebe ───────────────────────────────────────────────────────────────
  {
    id: "profilna",
    group: "ja",
    icon: "UserRound",
    title: { sr: "Profilna slika", en: "Profile picture" },
    summary: { sr: "Od tvoje fotke - sređena profilna za mreže i LinkedIn.", en: "From your own photo - a polished picture for social and LinkedIn." },
    example: {
      sr: "Primer: selfi iz kola postaje portret od ramena naviše, meko svetlo, mirna svetla pozadina - lice ostaje tvoje.",
      en: "Example: a car selfie becomes a shoulders-up portrait, soft light, calm light background - the face stays yours.",
    },
    fields: [
      { key: "foto", kind: "image", label: { sr: "Tvoja fotka", en: "Your photo" }, hint: { sr: "Lice spreda, jasno i oštro.", en: "Face from the front, clear and sharp." }, required: true },
      {
        key: "pozadina",
        kind: "select",
        label: { sr: "Pozadina", en: "Background" },
        options: [
          opt("studio", "Svetla studijska", "Light studio", "a plain light studio backdrop"),
          opt("kancelarija", "Kancelarija", "Office", "a softly blurred modern office"),
          opt("priroda", "Priroda", "Nature", "softly blurred green nature"),
          opt("grad", "Grad", "City", "a softly blurred city street"),
        ],
      },
      {
        key: "izgled",
        kind: "select",
        label: { sr: "Utisak", en: "Look" },
        options: [
          opt("poslovno", "Poslovno", "Professional", "professional and confident, neat clothes"),
          opt("opusteno", "Opušteno", "Relaxed", "relaxed and friendly, natural smile"),
          opt("kreativno", "Kreativno", "Creative", "creative and modern, a bit of colour"),
        ],
      },
    ],
    models: ["nano-banana-pro", "nano-banana-2"],
    aspect: "1:1",
    resolution: "2K",
    brand: "none",
    prompt: (c) =>
      `Turn ${c.image("foto")} into a professional profile picture of the same person: keep the face, hair and identity exactly the same. Head and shoulders, looking at the camera, soft flattering daylight, ${c.option("izgled").prompt}, background: ${c.option("pozadina").prompt}. Realistic photo, sharp eyes, no text.`,
    nextSteps: [STEP.crop, STEP.retouch, STEP.animate],
  },
  {
    id: "cv-fotka",
    group: "ja",
    icon: "UserRound",
    title: { sr: "CV fotka", en: "CV photo" },
    summary: { sr: "Ozbiljna fotka za biografiju, kao iz fotografske radnje.", en: "A serious photo for your CV, as if from a photo studio." },
    example: {
      sr: "Primer: fotka sa odmora postaje kadar za CV - sako, bela pozadina, mirno svetlo.",
      en: "Example: a holiday photo becomes a CV shot - blazer, white background, calm light.",
    },
    fields: [
      { key: "foto", kind: "image", label: { sr: "Tvoja fotka", en: "Your photo" }, hint: { sr: "Jedna osoba, lice se dobro vidi.", en: "One person, face clearly visible." }, required: true },
      {
        key: "odeca",
        kind: "select",
        label: { sr: "Odeća", en: "Clothes" },
        options: [
          opt("sako", "Sako", "Blazer", "a neat dark blazer over a plain shirt"),
          opt("kosulja", "Košulja", "Shirt", "a plain ironed shirt"),
          opt("ista", "Kao na fotki", "As in the photo", "the same clothes as in the photo, tidied up"),
        ],
      },
      {
        key: "pozadina",
        kind: "select",
        label: { sr: "Pozadina", en: "Background" },
        options: [
          opt("bela", "Bela", "White", "plain white"),
          opt("siva", "Svetlosiva", "Light grey", "plain light grey"),
          opt("plava", "Svetloplava", "Light blue", "plain light blue"),
        ],
      },
    ],
    models: ["nano-banana-pro", "nano-banana-2"],
    aspect: "2:3",
    resolution: "2K",
    brand: "none",
    prompt: (c) =>
      `Make a formal CV / passport-style portrait of the same person as in ${c.image("foto")}: identical face and identity, neutral friendly expression, straight posture, head and shoulders centred, wearing ${c.option("odeca").prompt}, ${c.option("pozadina").prompt} background, even soft studio light. Realistic photo, no text.`,
    nextSteps: [STEP.crop, STEP.retouch, STEP.format],
  },
  {
    id: "foto-dump",
    group: "ja",
    icon: "PersonStanding",
    title: { sr: "Foto-dump tvog lika", en: "Photo dump of your character" },
    summary: { sr: "Devet opuštenih fotki tvog lika sa jednog „putovanja“, za jednu cenu.", en: "Nine casual photos of your character from one “trip”, for one price." },
    example: {
      sr: "Primer: Maja na moru - kafa na terasi, skok u vodu, zalazak sunca… devet kadrova u jednoj mreži, pa ih iseče na 9 slika.",
      en: "Example: Maja at the seaside - coffee on a terrace, a jump into the water, sunset… nine frames in one grid, then cut into 9 pictures.",
    },
    fields: [
      { key: "lik", kind: "element", label: { sr: "Tvoj lik", en: "Your character" }, hint: { sr: "Lik sačuvan u „Likovima“.", en: "A character saved in “Characters”." } },
      {
        key: "tema",
        kind: "select",
        label: { sr: "Gde je bio", en: "Where" },
        options: [
          opt("more", "More leti", "Summer seaside", "a summer holiday by the sea"),
          opt("grad", "Grad noću", "City at night", "a night out in a big city"),
          opt("planina", "Planina", "Mountains", "a weekend in the mountains"),
          opt("kafic", "Kafići i ulice", "Cafés and streets", "a slow day of cafés and city streets"),
        ],
      },
      {
        key: "dodatak",
        kind: "text",
        label: { sr: "Još nešto (nije obavezno)", en: "Anything else (optional)" },
        placeholder: { sr: "npr. nosi žuti šešir", en: "e.g. wears a yellow hat" },
        example: { sr: "nosi žuti šešir i sunčane naočare", en: "wears a yellow hat and sunglasses" },
        maxLength: 160,
        required: false,
      },
    ],
    models: ["nano-banana-2"],
    aspect: "1:1",
    resolution: "4K",
    brand: "none",
    prompt: (c) =>
      `A 3×3 grid of nine frames of the same subject. Make ONE square image split into 9 equal square cells (3 rows × 3 columns), with no gaps, borders, numbers or text. Every cell is a different casual, candid phone photo of the character from ${c.image("lik")} during ${c.option("tema").prompt} - different moments, places and poses, like a social media photo dump. Keep the same face, hair, body and outfit in every cell.${c.text("dodatak") ? ` Also: ${c.text("dodatak")}.` : ""}`,
    nextSteps: [STEP.cut9, STEP.animate],
  },
  {
    id: "crtani-avatar",
    group: "ja",
    icon: "WandSparkles",
    title: { sr: "Crtani avatar", en: "Cartoon avatar" },
    summary: { sr: "Ti kao lik iz crtaća, stripa ili animea.", en: "You as a cartoon, comic or anime character." },
    example: {
      sr: "Primer: tvoja fotka postaje 3D lik iz crtanog filma - isti osmeh, ista frizura.",
      en: "Example: your photo becomes a 3D cartoon character - same smile, same hairstyle.",
    },
    fields: [
      { key: "foto", kind: "image", label: { sr: "Tvoja fotka", en: "Your photo" }, hint: { sr: "Lice spreda.", en: "Face from the front." }, required: true },
      {
        key: "stil",
        kind: "select",
        label: { sr: "Stil", en: "Style" },
        options: [
          opt("3d", "3D crtani film", "3D cartoon", "a cheerful 3D animated film character"),
          opt("anime", "Anime", "Anime", "a clean anime illustration"),
          opt("strip", "Strip", "Comic", "a bold comic book drawing with ink outlines"),
          opt("akvarel", "Akvarel", "Watercolour", "a soft watercolour illustration"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "1:1",
    resolution: "1K",
    brand: "none",
    prompt: (c) =>
      `Redraw the person from ${c.image("foto")} as ${c.option("stil").prompt}: keep their recognisable face, hairstyle, skin tone and expression. Head and shoulders, simple light background, no text.`,
    nextSteps: [STEP.stickers, STEP.background, STEP.animate],
  },
  {
    id: "stara-fotka",
    group: "ja",
    icon: "History",
    title: { sr: "Stara fotka", en: "Old photo" },
    summary: { sr: "Izgrebana porodična fotka ponovo jasna - po želji i u boji.", en: "A scratched family photo made clear again - in colour if you like." },
    example: {
      sr: "Primer: fotka bake i deke iz 1965. bez ogrebotina i fleka, lica oštra, duh vremena ostaje.",
      en: "Example: grandma and grandpa's 1965 photo without scratches and stains, sharp faces, the feel of the era kept.",
    },
    fields: [
      { key: "foto", kind: "image", label: { sr: "Stara fotka", en: "Old photo" }, hint: { sr: "Slikaj je telefonom, ravno i bez odsjaja.", en: "Snap it with your phone, straight and without glare." }, required: true },
      {
        key: "boje",
        kind: "select",
        label: { sr: "Boje", en: "Colours" },
        options: [
          opt("ostavi", "Ostavi kako jeste", "Keep as it is", "keep the original colours (or black and white) of the photo"),
          opt("oboji", "Oboji prirodno", "Colourise naturally", "colourise it with natural, period-correct colours"),
        ],
      },
    ],
    models: ["nano-banana-pro", "nano-banana-2"],
    aspect: "image",
    resolution: "2K",
    brand: "none",
    prompt: (c) =>
      `Restore the old photograph in ${c.image("foto")}: remove scratches, dust, stains and creases, fix faded areas, sharpen the faces gently - the people, their faces, poses, clothes and the composition stay exactly the same. ${c.option("boje").prompt}. Keep the feel of the era, no text.`,
    nextSteps: [STEP.upscale, STEP.animate],
  },

  // ── Za posao ──────────────────────────────────────────────────────────────
  {
    id: "jelovnik",
    group: "posao",
    icon: "Library",
    title: { sr: "Jelovnik za kafić", en: "Café menu" },
    summary: { sr: "Upiši stavke i cene - dobijaš jelovnik spreman za štampu.", en: "Type the items and prices - get a menu ready to print." },
    example: {
      sr: "Primer: „Kafić Zrno“ - espresso 150, kapućino 200, limunada 250, u stilu table i krede.",
      en: "Example: “Café Zrno” - espresso 150, cappuccino 200, lemonade 250, in a chalkboard style.",
    },
    fields: [
      {
        key: "naziv",
        kind: "text",
        label: { sr: "Ime lokala", en: "Place name" },
        placeholder: { sr: "npr. Kafić Zrno", en: "e.g. Café Zrno" },
        example: { sr: "Kafić Zrno", en: "Café Zrno" },
        maxLength: 40,
        required: true,
      },
      {
        key: "stavke",
        kind: "text",
        label: { sr: "Stavke i cene (jedna po redu)", en: "Items and prices (one per line)" },
        placeholder: { sr: "Espresso 150\nKapućino 200", en: "Espresso 150\nCappuccino 200" },
        example: { sr: "Espresso 150\nKapućino 200\nKafa sa mlekom 180\nLimunada 250\nKroasan 220", en: "Espresso 150\nCappuccino 200\nLatte 180\nLemonade 250\nCroissant 220" },
        maxLength: 400,
        required: true,
        multiline: true,
      },
      {
        key: "stil",
        kind: "select",
        label: { sr: "Stil", en: "Style" },
        options: [
          opt("tabla", "Tabla i kreda", "Chalkboard", "a chalkboard with hand-drawn chalk lettering"),
          opt("moderno", "Moderno i čisto", "Clean and modern", "a clean modern layout on light paper with lots of space"),
          opt("vintage", "Vintage", "Vintage", "a warm vintage print on cream paper"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "2:3",
    resolution: "2K",
    brand: "full",
    prompt: (c) =>
      `A printable café menu, portrait, ${c.option("stil").prompt}. Title at the top: ${q(c.text("naziv"))}. Below it a neat list, one item per line with its price aligned on the right:\n${c
        .text("stavke")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `- ${q(line)}`)
        .join("\n")}\nSmall tasteful coffee illustrations in the margins. ${TEXT_RULE}`,
    nextSteps: [STEP.editor, STEP.format],
  },
  {
    id: "oglas-stan",
    group: "posao",
    icon: "House",
    title: { sr: "Oglas za stan", en: "Apartment listing" },
    summary: { sr: "Fotka stana i par podataka - oglas koji se primećuje.", en: "A photo of the flat and a few facts - a listing that stands out." },
    example: {
      sr: "Primer: dnevna soba + „Izdaje se dvosoban stan, 54 m², Vračar, 600 €“ postaje oglas za mreže.",
      en: "Example: a living room + “Two-room flat for rent, 54 m², Vračar, €600” becomes a social media listing.",
    },
    fields: [
      { key: "foto", kind: "image", label: { sr: "Fotka stana", en: "Photo of the flat" }, hint: { sr: "Najlepša soba, po danu.", en: "The nicest room, in daylight." }, required: true },
      {
        key: "podaci",
        kind: "text",
        label: { sr: "Šta piše na oglasu", en: "What the listing says" },
        placeholder: { sr: "npr. Dvosoban, 54 m², Vračar, 600 €", en: "e.g. Two-room, 54 m², Vračar, €600" },
        example: { sr: "Dvosoban stan, 54 m², Vračar, 600 €", en: "Two-room flat, 54 m², Vračar, €600" },
        maxLength: 90,
        required: true,
      },
      {
        key: "vrsta",
        kind: "select",
        label: { sr: "Oglas za", en: "Listing for" },
        options: [
          opt("izdavanje", "Izdavanje", "Rent", "IZDAJE SE"),
          opt("prodaja", "Prodaju", "Sale", "PRODAJE SE"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "1:1",
    resolution: "2K",
    brand: "full",
    prompt: (c) =>
      `A real estate social media ad built around the interior photo in ${c.image("foto")}: keep the room exactly as it is (do not add or remove furniture), make it bright and inviting. Add a clean banner with the headline ${q(c.option("vrsta").prompt)} and below it ${q(c.text("podaci"))}. ${TEXT_RULE}`,
    nextSteps: [STEP.editor, STEP.crop],
  },
  {
    id: "logo",
    group: "posao",
    icon: "PenTool",
    title: { sr: "Logo", en: "Logo" },
    summary: { sr: "Jednostavan znak sa imenom firme, na beloj pozadini.", en: "A simple mark with the business name, on a white background." },
    example: {
      sr: "Primer: „Pekara Zlatni klas“ - klas pšenice iznad imena, dve boje, čiste linije.",
      en: "Example: “Zlatni klas Bakery” - an ear of wheat above the name, two colours, clean lines.",
    },
    fields: [
      {
        key: "ime",
        kind: "text",
        label: { sr: "Ime firme", en: "Business name" },
        placeholder: { sr: "npr. Pekara Zlatni klas", en: "e.g. Zlatni klas Bakery" },
        example: { sr: "Pekara Zlatni klas", en: "Zlatni klas Bakery" },
        maxLength: 40,
        required: true,
      },
      {
        key: "delatnost",
        kind: "text",
        label: { sr: "Čime se bavi", en: "What it does" },
        placeholder: { sr: "npr. pekara, hleb i kifle", en: "e.g. bakery, bread and rolls" },
        example: { sr: "pekara, domaći hleb i kifle", en: "bakery, homemade bread and rolls" },
        maxLength: 80,
        required: true,
      },
      {
        key: "stil",
        kind: "select",
        label: { sr: "Stil", en: "Style" },
        options: [
          opt("jednostavno", "Jednostavno", "Simple", "a simple flat minimal mark"),
          opt("rukom", "Rukom crtano", "Hand-drawn", "a friendly hand-drawn mark"),
          opt("zanatski", "Zanatski", "Craft", "a classic craft badge, like an old shop sign"),
          opt("geometrijski", "Geometrijski", "Geometric", "a bold modern geometric mark"),
        ],
      },
    ],
    models: ["recraft-41", "nano-banana-2"],
    aspect: "1:1",
    resolution: "1K",
    brand: "style",
    prompt: (c) =>
      `A logo for ${q(c.text("ime"))}, ${c.text("delatnost")}. ${c.option("stil").prompt}, an icon above or beside the name, flat colours, no gradients, no shadows, plain white background, centred with space around it. ${TEXT_RULE}`,
    nextSteps: [STEP.vector, STEP.background],
  },
  {
    id: "thumbnail",
    group: "posao",
    icon: "Clapperboard",
    title: { sr: "YouTube sličica", en: "YouTube thumbnail" },
    summary: { sr: "Sličica koja se klikće: krupan naslov i jaka emocija.", en: "A clickable thumbnail: a big title and a strong emotion." },
    example: {
      sr: "Primer: „Probao sam 7 dana bez telefona“ + tvoje iznenađeno lice, jake boje.",
      en: "Example: “I tried 7 days without a phone” + your surprised face, bold colours.",
    },
    fields: [
      {
        key: "naslov",
        kind: "text",
        label: { sr: "Naslov na sličici (kratko)", en: "Title on the thumbnail (short)" },
        placeholder: { sr: "npr. 7 dana bez telefona", en: "e.g. 7 days without a phone" },
        example: { sr: "7 dana bez telefona", en: "7 days without a phone" },
        maxLength: 40,
        required: true,
      },
      { key: "foto", kind: "image", label: { sr: "Tvoja fotka (nije obavezno)", en: "Your photo (optional)" }, hint: { sr: "Bez fotke model nacrta osobu.", en: "Without a photo the model draws a person." }, required: false },
      {
        key: "emocija",
        kind: "select",
        label: { sr: "Emocija", en: "Emotion" },
        options: [
          opt("iznenadjenje", "Iznenađenje", "Surprise", "a shocked, surprised face"),
          opt("smeh", "Smeh", "Laughter", "a big laughing face"),
          opt("ozbiljno", "Ozbiljno", "Serious", "a serious, focused face"),
          opt("uzbudjenje", "Uzbuđenje", "Excitement", "an excited face pointing at the title"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "16:9",
    resolution: "2K",
    brand: "style",
    prompt: (c) => {
      const person = c.image("foto") ? `the same person as in ${c.image("foto")} (keep the face)` : "a person";
      return `A bold YouTube thumbnail, 16:9: ${person} with ${c.option("emocija").prompt} on one side, and on the other side the huge, very readable title ${q(c.text("naslov"))} with a thick outline. High contrast, bright saturated colours, simple background. ${TEXT_RULE}`;
    },
    nextSteps: [STEP.editor, STEP.format],
  },
  {
    id: "plakat",
    group: "posao",
    icon: "Megaphone",
    title: { sr: "Plakat za događaj", en: "Event poster" },
    summary: { sr: "Plakat za koncert, izložbu, turnir ili žurku.", en: "A poster for a concert, exhibition, tournament or party." },
    example: {
      sr: "Primer: „Leto u dvorištu“ - subota 21. jun, 20 h, Dom kulture - koncertni plakat.",
      en: "Example: “Summer in the yard” - Saturday 21 June, 8 pm, Culture Hall - a concert poster.",
    },
    fields: [
      {
        key: "naziv",
        kind: "text",
        label: { sr: "Naziv događaja", en: "Event name" },
        placeholder: { sr: "npr. Leto u dvorištu", en: "e.g. Summer in the yard" },
        example: { sr: "Leto u dvorištu", en: "Summer in the yard" },
        maxLength: 50,
        required: true,
      },
      {
        key: "kada",
        kind: "text",
        label: { sr: "Kada i gde", en: "When and where" },
        placeholder: { sr: "npr. subota 21. jun, 20 h, Dom kulture", en: "e.g. Saturday 21 June, 8 pm, Culture Hall" },
        example: { sr: "subota 21. jun, 20 h, Dom kulture", en: "Saturday 21 June, 8 pm, Culture Hall" },
        maxLength: 80,
        required: true,
      },
      {
        key: "vrsta",
        kind: "select",
        label: { sr: "Vrsta", en: "Kind" },
        options: [
          opt("koncert", "Koncert", "Concert", "a live music concert poster with a stage mood"),
          opt("kultura", "Izložba ili predstava", "Exhibition or play", "an artistic cultural event poster"),
          opt("sport", "Sport", "Sport", "a dynamic sports tournament poster"),
          opt("zurka", "Žurka", "Party", "a fun party poster"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "2:3",
    resolution: "2K",
    brand: "full",
    prompt: (c) =>
      `${c.option("vrsta").prompt}, portrait. Big headline ${q(c.text("naziv"))}, and below it ${q(c.text("kada"))}. Strong composition, one central illustration, clear hierarchy, readable from far away. ${TEXT_RULE}`,
    nextSteps: [STEP.editor, STEP.crop],
  },
  {
    id: "proizvod-belo",
    group: "posao",
    icon: "Image",
    title: { sr: "Proizvod na belom", en: "Product on white" },
    summary: { sr: "Studijska fotka proizvoda za prodavnicu ili oglas.", en: "A studio product shot for a shop or a listing." },
    example: {
      sr: "Primer: tegla domaćeg džema slikana na stolu postaje čist kadar na beloj pozadini, sa mekom senkom.",
      en: "Example: a jar of homemade jam shot on a table becomes a clean shot on white, with a soft shadow.",
    },
    fields: [
      { key: "proizvod", kind: "image", label: { sr: "Fotka proizvoda", en: "Product photo" }, hint: { sr: "Ceo proizvod u kadru.", en: "The whole product in frame." }, required: true },
      {
        key: "senka",
        kind: "select",
        label: { sr: "Ispod proizvoda", en: "Under the product" },
        options: [
          opt("senka", "Meka senka", "Soft shadow", "a soft natural shadow under it"),
          opt("odraz", "Odraz", "Reflection", "a subtle glossy reflection under it"),
          opt("nista", "Ništa", "Nothing", "no shadow at all"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "1:1",
    resolution: "2K",
    brand: "none",
    prompt: (c) =>
      `A professional e-commerce studio photo of the product from ${c.image("proizvod")} on a pure white background, centred, ${c.option("senka").prompt}. The product stays exactly the same - shape, colours, label, logo and text do not change. Even soft studio light, sharp details, no extra objects, no added text.`,
    nextSteps: [STEP.background, STEP.crop],
  },
  {
    id: "proizvod-ambijent",
    group: "posao",
    icon: "Image",
    title: { sr: "Proizvod u ambijentu", en: "Product in a scene" },
    summary: { sr: "Tvoj proizvod u kuhinji, prirodi ili kafiću - kao prava fotka.", en: "Your product in a kitchen, nature or a café - like a real photo." },
    example: {
      sr: "Primer: flaša rakije na drvenom stolu u vinogradu, zlatni sat.",
      en: "Example: a bottle of rakija on a wooden table in a vineyard, golden hour.",
    },
    fields: [
      { key: "proizvod", kind: "image", label: { sr: "Fotka proizvoda", en: "Product photo" }, hint: { sr: "Ceo proizvod u kadru.", en: "The whole product in frame." }, required: true },
      {
        key: "mesto",
        kind: "select",
        label: { sr: "Gde", en: "Where" },
        options: [
          opt("kuhinja", "Kuhinja", "Kitchen", "on a wooden kitchen counter"),
          opt("priroda", "Priroda", "Nature", "outdoors on a stone in green nature"),
          opt("kafic", "Kafić", "Café", "on a café table"),
          opt("kupatilo", "Kupatilo", "Bathroom", "on a bright bathroom shelf"),
          opt("sto", "Radni sto", "Desk", "on a tidy modern desk"),
        ],
      },
      {
        key: "svetlo",
        kind: "select",
        label: { sr: "Svetlo", en: "Light" },
        options: [
          opt("jutro", "Jutro", "Morning", "fresh morning daylight"),
          opt("zlatno", "Zlatni sat", "Golden hour", "warm golden hour sunlight"),
          opt("vece", "Veče", "Evening", "cosy warm evening lamps"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "1:1",
    resolution: "2K",
    brand: "none",
    prompt: (c) =>
      `Place the product from ${c.image("proizvod")} ${c.option("mesto").prompt}, ${c.option("svetlo").prompt}. The product stays exactly the same - shape, colours, label, logo and text do not change; match light, shadows and perspective so it looks like a real lifestyle photo. Shallow depth of field, no added text.`,
    nextSteps: [STEP.crop, STEP.editor, STEP.animate],
  },
  {
    id: "jelo",
    group: "posao",
    icon: "Image",
    title: { sr: "Jelo za dostavu", en: "Dish for delivery apps" },
    summary: { sr: "Fotka jela sa telefona postaje fotka za Wolt, Glovo ili meni.", en: "A phone photo of a dish becomes a shot for delivery apps or a menu." },
    example: {
      sr: "Primer: pljeskavica iz kuhinje postaje apetitni kadar odozgo, na drvenoj dasci.",
      en: "Example: a burger from the kitchen becomes an appetising top-down shot on a wooden board.",
    },
    fields: [
      { key: "jelo", kind: "image", label: { sr: "Fotka jela", en: "Photo of the dish" }, hint: { sr: "Ceo tanjir u kadru.", en: "The whole plate in frame." }, required: true },
      {
        key: "stil",
        kind: "select",
        label: { sr: "Kadar", en: "Shot" },
        options: [
          opt("odozgo", "Odozgo", "Top-down", "a top-down flat lay on a wooden board"),
          opt("restoran", "Restoranski", "Restaurant", "a 45-degree restaurant shot on a dark table"),
          opt("rusticno", "Domaće", "Homestyle", "a rustic homestyle shot on a checked tablecloth"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "1:1",
    resolution: "2K",
    brand: "none",
    prompt: (c) =>
      `A professional food photo of the same dish as in ${c.image("jelo")}: keep the food itself the same (ingredients, portion, plate), make it fresh and appetising. ${c.option("stil").prompt}, soft natural light, gentle steam if it is warm. No text.`,
    nextSteps: [STEP.crop, STEP.editor],
  },
  {
    id: "instagram-objava",
    group: "posao",
    icon: "Smartphone",
    title: { sr: "Objava za akciju", en: "Promo post" },
    summary: { sr: "Kvadratna objava za Instagram ili Facebook sa porukom koja se čita.", en: "A square Instagram or Facebook post with a readable message." },
    example: {
      sr: "Primer: „−20 % na sve torte ovog vikenda“ + fotka torte, vedre boje.",
      en: "Example: “−20% on all cakes this weekend” + a photo of a cake, cheerful colours.",
    },
    fields: [
      {
        key: "poruka",
        kind: "text",
        label: { sr: "Poruka", en: "Message" },
        placeholder: { sr: "npr. −20 % na sve torte ovog vikenda", en: "e.g. −20% on all cakes this weekend" },
        example: { sr: "−20 % na sve torte ovog vikenda", en: "−20% on all cakes this weekend" },
        maxLength: 70,
        required: true,
      },
      { key: "proizvod", kind: "image", label: { sr: "Fotka proizvoda (nije obavezno)", en: "Product photo (optional)" }, hint: { sr: "Bez fotke model nacrta proizvod.", en: "Without a photo the model draws the product." }, required: false },
      {
        key: "stil",
        kind: "select",
        label: { sr: "Stil", en: "Style" },
        options: [
          opt("vedro", "Vedro i šareno", "Bright and colourful", "bright, cheerful and colourful"),
          opt("moderno", "Čisto i moderno", "Clean and modern", "clean, modern and minimal"),
          opt("domace", "Toplo i domaće", "Warm and homely", "warm, cosy and homemade"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "1:1",
    resolution: "2K",
    brand: "full",
    prompt: (c) => {
      const product = c.image("proizvod") ? `the product from ${c.image("proizvod")} (unchanged: same shape, colours and label)` : "an attractive product photo that fits the message";
      return `A square social media promo post, ${c.option("stil").prompt}: ${product} as the hero, and a big readable message ${q(c.text("poruka"))}. Clear layout with breathing room. ${TEXT_RULE}`;
    },
    nextSteps: [STEP.editor, STEP.animate],
  },
  {
    id: "vizitkarta",
    group: "posao",
    icon: "PenTool",
    title: { sr: "Vizit karta", en: "Business card" },
    summary: { sr: "Lice vizit karte sa imenom, zanimanjem i kontaktom.", en: "The front of a business card with name, job and contact." },
    example: {
      sr: "Primer: „Jelena Marić, frizerka“ + telefon i Instagram, moderan izgled.",
      en: "Example: “Jelena Marić, hairdresser” + phone and Instagram, a modern look.",
    },
    fields: [
      {
        key: "ime",
        kind: "text",
        label: { sr: "Ime i zanimanje", en: "Name and job" },
        placeholder: { sr: "npr. Jelena Marić, frizerka", en: "e.g. Jelena Marić, hairdresser" },
        example: { sr: "Jelena Marić, frizerka", en: "Jelena Marić, hairdresser" },
        maxLength: 60,
        required: true,
      },
      {
        key: "kontakt",
        kind: "text",
        label: { sr: "Kontakt", en: "Contact" },
        placeholder: { sr: "npr. 064 123 4567 · @jelena.frizure", en: "e.g. +381 64 123 4567 · @jelena.hair" },
        example: { sr: "064 123 4567 · @jelena.frizure", en: "+381 64 123 4567 · @jelena.hair" },
        maxLength: 80,
        required: true,
      },
      {
        key: "stil",
        kind: "select",
        label: { sr: "Stil", en: "Style" },
        options: [
          opt("klasicno", "Klasično", "Classic", "classic and elegant"),
          opt("moderno", "Moderno", "Modern", "modern and minimal"),
          opt("kreativno", "Kreativno", "Creative", "creative and colourful"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "3:2",
    resolution: "2K",
    brand: "full",
    prompt: (c) =>
      `A flat, front-on design of a business card filling the whole image (no hands, no table, no mockup), ${c.option("stil").prompt}. The name and job ${q(c.text("ime"))} large, the contact line ${q(c.text("kontakt"))} smaller below. Generous margins. ${TEXT_RULE}`,
    nextSteps: [STEP.editor, STEP.format],
  },
  {
    id: "trazimo-radnika",
    group: "posao",
    icon: "Megaphone",
    title: { sr: "Tražimo radnika", en: "We're hiring" },
    summary: { sr: "Oglas za posao koji se vidi na vratima, Fejsu i grupama.", en: "A job ad that works on the door, on Facebook and in groups." },
    example: {
      sr: "Primer: „Tražimo konobara/icu“ - rad u smenama, plata redovna, poziv na 064…",
      en: "Example: “We're hiring a waiter” - shift work, regular pay, call 064…",
    },
    fields: [
      {
        key: "pozicija",
        kind: "text",
        label: { sr: "Koga tražite", en: "Who you're looking for" },
        placeholder: { sr: "npr. Tražimo konobara/icu", en: "e.g. We're hiring a waiter" },
        example: { sr: "Tražimo konobara/icu", en: "We're hiring a waiter" },
        maxLength: 50,
        required: true,
      },
      {
        key: "uslovi",
        kind: "text",
        label: { sr: "Uslovi i kontakt", en: "Terms and contact" },
        placeholder: { sr: "npr. rad u smenama, plata redovna, 064 123 4567", en: "e.g. shift work, regular pay, 064 123 4567" },
        example: { sr: "rad u smenama, plata redovna, 064 123 4567", en: "shift work, regular pay, 064 123 4567" },
        maxLength: 100,
        required: true,
      },
      {
        key: "mesto",
        kind: "select",
        label: { sr: "Gde", en: "Where" },
        options: [
          opt("ugostiteljstvo", "Kafić ili restoran", "Café or restaurant", "a café or restaurant"),
          opt("prodavnica", "Prodavnica", "Shop", "a shop"),
          opt("kancelarija", "Kancelarija", "Office", "an office"),
          opt("teren", "Teren", "Field work", "outdoor field work"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "1:1",
    resolution: "2K",
    brand: "full",
    prompt: (c) =>
      `A square "we're hiring" job ad for ${c.option("mesto").prompt}: a big headline ${q(c.text("pozicija"))}, below it ${q(c.text("uslovi"))}, and a friendly simple illustration of the workplace. Bold, clear, readable on a phone. ${TEXT_RULE}`,
    nextSteps: [STEP.editor, STEP.format],
  },

  // ── Proslave ──────────────────────────────────────────────────────────────
  {
    id: "pozivnica-slava",
    group: "proslave",
    icon: "PartyPopper",
    title: { sr: "Pozivnica za slavu", en: "Slava invitation" },
    summary: { sr: "Pozivnica sa ikonom sveca, imenom domaćina i vremenom.", en: "An invitation with the saint's icon, the hosts' name and the time." },
    example: {
      sr: "Primer: Sveti Nikola - „Porodica Petrović vas poziva, 19. decembar od 18 h“, ćirilicom.",
      en: "Example: St Nicholas - “The Petrović family invites you, 19 December from 6 pm”, in Cyrillic.",
    },
    fields: [
      {
        key: "slava",
        kind: "select",
        label: { sr: "Slava", en: "Slava" },
        options: [
          opt("nikoljdan", "Sveti Nikola", "St Nicholas", "Sveti Nikola (St Nicholas, 19 December)"),
          opt("djurdjevdan", "Đurđevdan", "St George", "Đurđevdan (St George, 6 May)"),
          opt("jovanjdan", "Jovanjdan", "St John", "Jovanjdan (St John the Baptist, 20 January)"),
          opt("mitrovdan", "Mitrovdan", "St Demetrius", "Mitrovdan (St Demetrius, 8 November)"),
          opt("petkovica", "Sveta Petka", "St Petka", "Sveta Petka (St Paraskeva, 27 October)"),
          opt("arandjelovdan", "Aranđelovdan", "St Michael", "Aranđelovdan (St Michael the Archangel, 21 November)"),
        ],
      },
      {
        key: "domacin",
        kind: "text",
        label: { sr: "Ko poziva, kada i gde", en: "Who invites, when and where" },
        placeholder: { sr: "npr. Porodica Petrović, 19. decembar od 18 h", en: "e.g. The Petrović family, 19 December from 6 pm" },
        example: { sr: "Porodica Petrović vas poziva, 19. decembar od 18 h", en: "Porodica Petrović vas poziva, 19. decembar od 18 h" },
        maxLength: 90,
        required: true,
      },
      {
        key: "pismo",
        kind: "select",
        label: { sr: "Pismo", en: "Script" },
        options: [
          opt("cirilica", "Ćirilica", "Cyrillic", "Serbian Cyrillic"),
          opt("latinica", "Latinica", "Latin", "Serbian Latin"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "2:3",
    resolution: "2K",
    brand: "none",
    prompt: (c) =>
      `A traditional Serbian slava invitation card, portrait, for ${c.option("slava").prompt}: a respectful Orthodox icon-style image of the saint at the top, a lit candle, slavski kolač and wheat, gold and deep red ornaments. The name of the slava as the title, and below it ${q(c.text("domacin"))}. Write every text in ${c.option("pismo").prompt}, converting the given words to that script without changing them. Correct Serbian spelling, no other text.`,
    nextSteps: [STEP.editor, STEP.format],
  },
  {
    id: "pozivnica-rodjendan",
    group: "proslave",
    icon: "PartyPopper",
    title: { sr: "Pozivnica za rođendan", en: "Birthday invitation" },
    summary: { sr: "Vesela pozivnica za dečji ili odrasli rođendan.", en: "A cheerful invitation for a kid's or adult birthday." },
    example: {
      sr: "Primer: „Luka puni 7!“ - subota 15. mart u 17 h, igraonica Balon - dečji, šareni stil.",
      en: "Example: “Luka turns 7!” - Saturday 15 March at 5 pm, Balloon playroom - colourful kids' style.",
    },
    fields: [
      {
        key: "ko",
        kind: "text",
        label: { sr: "Ko slavi", en: "Who is celebrating" },
        placeholder: { sr: "npr. Luka puni 7!", en: "e.g. Luka turns 7!" },
        example: { sr: "Luka puni 7!", en: "Luka turns 7!" },
        maxLength: 40,
        required: true,
      },
      {
        key: "kada",
        kind: "text",
        label: { sr: "Kada i gde", en: "When and where" },
        placeholder: { sr: "npr. subota 15. mart u 17 h, igraonica Balon", en: "e.g. Saturday 15 March at 5 pm, Balloon playroom" },
        example: { sr: "subota 15. mart u 17 h, igraonica Balon", en: "Saturday 15 March at 5 pm, Balloon playroom" },
        maxLength: 80,
        required: true,
      },
      {
        key: "stil",
        kind: "select",
        label: { sr: "Stil", en: "Style" },
        options: [
          opt("decji", "Dečji, šareno", "Kids, colourful", "colourful kids' party style with balloons, confetti and cute animals"),
          opt("elegantno", "Elegantno", "Elegant", "elegant style with gold details and flowers"),
          opt("zurka", "Žurka", "Party", "fun party style with disco lights and confetti"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "2:3",
    resolution: "2K",
    brand: "none",
    prompt: (c) =>
      `A birthday party invitation card, portrait, ${c.option("stil").prompt}. Big headline ${q(c.text("ko"))}, below it ${q(c.text("kada"))}. Clear layout, readable from a phone. ${TEXT_RULE}`,
    nextSteps: [STEP.editor, STEP.animate],
  },
  {
    id: "cestitka",
    group: "proslave",
    icon: "PartyPopper",
    title: { sr: "Čestitka", en: "Greeting card" },
    summary: { sr: "Čestitka za praznik, spremna za Viber ili štampu.", en: "A holiday greeting card, ready for Viber or print." },
    example: {
      sr: "Primer: Nova godina - „Srećna Nova godina, draga bako!“ uz sneg i jelku.",
      en: "Example: New Year - “Happy New Year, dear grandma!” with snow and a tree.",
    },
    fields: [
      {
        key: "povod",
        kind: "select",
        label: { sr: "Povod", en: "Occasion" },
        options: [
          opt("nova-godina", "Nova godina", "New Year", "New Year, with snow, a decorated tree and fireworks"),
          opt("bozic", "Božić", "Christmas", "Orthodox Christmas, with badnjak, a warm hearth and snow"),
          opt("uskrs", "Uskrs", "Easter", "Easter, with painted eggs and spring flowers"),
          opt("osmi-mart", "8. mart", "Women's Day", "International Women's Day, with tulips and spring light"),
          opt("rodjendan", "Rođendan", "Birthday", "a birthday, with a cake, candles and balloons"),
        ],
      },
      {
        key: "poruka",
        kind: "text",
        label: { sr: "Poruka", en: "Message" },
        placeholder: { sr: "npr. Srećna Nova godina, draga bako!", en: "e.g. Happy New Year, dear grandma!" },
        example: { sr: "Srećna Nova godina, draga bako!", en: "Happy New Year, dear grandma!" },
        maxLength: 70,
        required: true,
      },
    ],
    models: ["nano-banana-2"],
    aspect: "1:1",
    resolution: "1K",
    brand: "none",
    prompt: (c) =>
      `A warm illustrated greeting card for ${c.option("povod").prompt}. The message ${q(c.text("poruka"))} written beautifully in the middle or bottom. Cosy, heartfelt, festive. ${TEXT_RULE}`,
    nextSteps: [STEP.editor, STEP.animate],
  },

  // ── Za decu ───────────────────────────────────────────────────────────────
  {
    id: "bojanka",
    group: "deca",
    icon: "Brush",
    title: { sr: "Bojanka za decu", en: "Colouring page" },
    summary: { sr: "Crno-bela bojanka po želji deteta, za štampu na A4.", en: "A black-and-white colouring page of your kid's choice, for A4 print." },
    example: {
      sr: "Primer: „dinosaurus vozi skejtbord“ - debele linije, krupni oblici za uzrast 3-5.",
      en: "Example: “a dinosaur riding a skateboard” - thick lines, big shapes for ages 3-5.",
    },
    fields: [
      {
        key: "tema",
        kind: "text",
        label: { sr: "Šta je na bojanci", en: "What's on the page" },
        placeholder: { sr: "npr. dinosaurus vozi skejtbord", en: "e.g. a dinosaur riding a skateboard" },
        example: { sr: "dinosaurus vozi skejtbord", en: "a dinosaur riding a skateboard" },
        maxLength: 100,
        required: true,
      },
      {
        key: "uzrast",
        kind: "select",
        label: { sr: "Uzrast", en: "Age" },
        options: [
          opt("3-5", "3-5 godina", "Ages 3-5", "very simple, big shapes and very thick outlines for ages 3-5"),
          opt("6-8", "6-8 godina", "Ages 6-8", "simple shapes with some details for ages 6-8"),
          opt("9-12", "9-12 godina", "Ages 9-12", "detailed with patterns for ages 9-12"),
        ],
      },
    ],
    models: ["nano-banana-2"],
    aspect: "2:3",
    resolution: "1K",
    brand: "none",
    prompt: (c) =>
      `A printable children's colouring page, portrait A4: ${c.text("tema")}. Pure black line art on a pure white background, ${c.option("uzrast").prompt}, closed outlines, no shading, no grey, no colour fill, no text.`,
    nextSteps: [STEP.vector, STEP.format],
  },
];

/** Serija (S39): jedan proizvod × više tekstova i formata, više poslova odjednom. */
export const SERIES_RECIPE_ID = "serija";
/** Viber nalepnice (S40) su alat - kartica recepta vodi u njega. */
export const STICKERS_RECIPE_TOOL_ID = "slika.nalepnice";

export function recipeById(id: string | null | undefined): CreaRecipe | undefined {
  return id ? CREA_RECIPES.find((recipe) => recipe.id === id) : undefined;
}

export type RecipeValues = Readonly<Record<string, string>>;

/** Upisan tekst bez suvišnih razmaka (redovi ostaju), isečen na granicu polja. */
export function cleanRecipeText(raw: string, maxLength: number, multiline = false): string {
  const lines = raw.split("\n").map((line) => line.replace(/\s+/g, " ").trim());
  const text = multiline ? lines.filter(Boolean).join("\n") : lines.filter(Boolean).join(" ");
  return text.slice(0, maxLength);
}

/** Podrazumevane vrednosti: prvi izbor u svakom `select` polju, prazni tekstovi. */
export function recipeDefaults(recipe: CreaRecipe): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of recipe.fields) {
    if (field.kind === "select") values[field.key] = field.options[0]!.id;
    if (field.kind === "text") values[field.key] = "";
  }
  return values;
}

/** „Popuni primerom": primer u svako tekstualno polje (izbori ostaju). */
export function recipeExampleValues(recipe: CreaRecipe, locale: Locale, current: RecipeValues): Record<string, string> {
  const values: Record<string, string> = { ...current };
  for (const field of recipe.fields) if (field.kind === "text") values[field.key] = field.example[locale];
  return values;
}

/** Šta još fali za slanje (ključ prvog obaveznog polja bez vrednosti), ili `null`. */
export function recipeMissingField(recipe: CreaRecipe, values: RecipeValues, attached: Readonly<Record<string, number>>): CreaRecipeField | null {
  for (const field of recipe.fields) {
    if (field.kind === "text" && field.required && cleanRecipeText(values[field.key] ?? "", field.maxLength, field.multiline).length === 0) return field;
    if (field.kind === "image" && field.required && (attached[field.key] ?? 0) === 0) return field;
    if (field.kind === "element" && (attached[field.key] ?? 0) === 0) return field;
  }
  return null;
}

function imageRange(positions: readonly number[]): string | null {
  if (positions.length === 0) return null;
  if (positions.length === 1) return `image ${positions[0]}`;
  return `images ${positions[0]}-${positions[positions.length - 1]}`;
}

/** Fal preset veličine za odnos stranica recepta (Recraft). */
const FAL_SIZE: Record<CreaRecipeAspect, string> = {
  "1:1": "square_hd",
  "2:3": "portrait_4_3",
  "3:2": "landscape_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

/**
 * Parametri modela za format i rezoluciju recepta. Ostale kontrole popunjava
 * server podrazumevanim vrednostima (`sanitizeSpecParams`).
 */
export function recipeModelParams(model: CreaRecipeModel, aspect: CreaRecipeAspect, resolution: CreaRecipe["resolution"]): Record<string, string> {
  if (model === "recraft-41") return { image_size: FAL_SIZE[aspect] };
  if (model === "nano-banana-pro") return { aspect_ratio: aspect, resolution: resolution === "4K" ? "4K" : "2K" };
  return { aspect_ratio: aspect, resolution };
}

/** Prima li model slike (recepti sa fotkom ili likom idu samo na takve modele). */
export function recipeModelTakesImages(model: CreaRecipeModel): boolean {
  return model !== "recraft-41";
}

export type RecipeRequestInput = {
  values: RecipeValues;
  /** Koliko je slika priloženo po polju (`image` 0-1, `element` 1-3). */
  attached: Readonly<Record<string, number>>;
  brand: Pick<CreaBrandKit, "name" | "colors" | "fonts" | "tone"> | null;
  /** Logo kita se šalje kao poslednja slika (samo `brand: "full"` i model koji prima slike). */
  brandLogo: boolean;
  /** Veličina priložene slike - za `aspect: "image"`. */
  imageSize?: { width: number; height: number };
};

export type RecipeRequest = {
  modelSlug: CreaRecipeModel;
  inputMode: "text" | "image_multi";
  params: Record<string, string>;
  /** Redosled slika u slotu `image`: polja po redu, pa logo (`"brand-logo"`). */
  imageOrder: string[];
};

/** Odnos stranica posla (za `image` - najbliži dozvoljeni formatu fotke). */
export function recipeAspect(recipe: CreaRecipe, imageSize?: { width: number; height: number }): CreaRecipeAspect {
  if (recipe.aspect !== "image") return recipe.aspect;
  if (!imageSize || imageSize.width <= 0 || imageSize.height <= 0) return "1:1";
  return nearestAspectRatio(imageSize.width, imageSize.height, ["1:1", "16:9", "9:16", "3:2", "2:3"]) as CreaRecipeAspect;
}

/**
 * Ceo zahtev posla iz recepta: model, ulazni režim, parametri (sa rečenicom za
 * model) i redosled slika. Ista funkcija gradi posao u UI-ju i u testu.
 */
export function recipeRequest(recipe: CreaRecipe, model: CreaRecipeModel, input: RecipeRequestInput): RecipeRequest {
  const takesImages = recipeModelTakesImages(model);
  const positions: Record<string, number[]> = {};
  const imageOrder: string[] = [];
  let next = 1;
  for (const field of recipe.fields) {
    if (field.kind !== "image" && field.kind !== "element") continue;
    const count = takesImages ? Math.max(0, Math.floor(input.attached[field.key] ?? 0)) : 0;
    positions[field.key] = Array.from({ length: count }, () => next++);
    for (let i = 0; i < count; i++) imageOrder.push(field.key);
  }
  const withLogo = takesImages && recipe.brand === "full" && input.brand !== null && input.brandLogo;
  const logoImage = withLogo ? next : undefined;
  if (withLogo) imageOrder.push("brand-logo");

  const context: PromptContext = {
    text: (key) => {
      const field = recipe.fields.find((entry) => entry.key === key);
      if (!field || field.kind !== "text") return "";
      return cleanRecipeText(input.values[key] ?? "", field.maxLength, field.multiline);
    },
    option: (key) => {
      const field = recipe.fields.find((entry) => entry.key === key);
      if (!field || field.kind !== "select") throw new Error(`Recept ${recipe.id}: ${key} nije izbor`);
      return field.options.find((option) => option.id === input.values[key]) ?? field.options[0]!;
    },
    image: (key) => imageRange(positions[key] ?? []),
  };

  let prompt = recipe.prompt(context);
  if (recipe.brand !== "none" && input.brand) {
    prompt += `\n\n${brandPromptLine(input.brand, logoImage !== undefined ? { logoImage } : {})}`;
  }
  return {
    modelSlug: model,
    inputMode: imageOrder.length > 0 ? "image_multi" : "text",
    params: { prompt, ...recipeModelParams(model, recipeAspect(recipe, input.imageSize), recipe.resolution) },
    imageOrder,
  };
}

// ── Serija (S39) ─────────────────────────────────────────────────────────────

export const SERIES_MAX_TEXTS = 6;
export const SERIES_MAX_JOBS = 12;
export const SERIES_TEXT_MAX = 80;
export const SERIES_MODEL: CreaRecipeModel = "nano-banana-2";

export const SERIES_FORMATS: ReadonlyArray<{ id: CreaRecipeAspect; label: LocalizedText }> = [
  { id: "1:1", label: { sr: "Kvadrat (objava)", en: "Square (post)" } },
  { id: "9:16", label: { sr: "Uspravno (priča, TikTok)", en: "Upright (story, TikTok)" } },
  { id: "16:9", label: { sr: "Položeno (YouTube, baner)", en: "Wide (YouTube, banner)" } },
  { id: "2:3", label: { sr: "Plakat", en: "Poster" } },
];

/** Tekstovi serije: jedan po redu, bez praznih i duplikata, najviše 6. */
export function seriesTexts(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const text = cleanRecipeText(line, SERIES_TEXT_MAX);
    if (text && !out.includes(text)) out.push(text);
  }
  return out.slice(0, SERIES_MAX_TEXTS);
}

export type SeriesJob = { text: string; aspect: CreaRecipeAspect };

/** Svaki tekst u svakom formatu (najviše 12 poslova), redom tekst pa format. */
export function seriesJobs(texts: readonly string[], formats: readonly CreaRecipeAspect[]): SeriesJob[] {
  const jobs: SeriesJob[] = [];
  for (const text of texts) for (const aspect of formats) jobs.push({ text, aspect });
  return jobs.slice(0, SERIES_MAX_JOBS);
}

/** Opis jednog oglasa iz serije: isti proizvod, drugi tekst i format. */
export function seriesPrompt(job: SeriesJob, brand: Pick<CreaBrandKit, "name" | "colors" | "fonts" | "tone"> | null, logoImage?: number): string {
  const orientation = job.aspect === "9:16" ? "an upright story" : job.aspect === "16:9" ? "a wide banner" : job.aspect === "2:3" ? "a portrait poster" : "a square post";
  let prompt = `An advertising image, ${orientation}: the product from image 1 as the hero - it stays exactly the same (shape, colours, label, logo and text do not change) - in an attractive matching setting, with the big readable headline ${q(job.text)}. Clean layout that fits the format. ${TEXT_RULE}`;
  if (brand) prompt += `\n\n${brandPromptLine(brand, logoImage !== undefined ? { logoImage } : {})}`;
  return prompt;
}

/** Parametri jednog posla serije (uvek Nano Banana 2, 1K - cena je ista za svaki oglas). */
export function seriesParams(job: SeriesJob, prompt: string): Record<string, string> {
  return { prompt, ...recipeModelParams(SERIES_MODEL, job.aspect, "1K") };
}
