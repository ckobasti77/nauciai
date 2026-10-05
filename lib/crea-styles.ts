import type { LocalizedText } from "./i18n";

/**
 * Stilovi za „Napravi" u radionici Slika (Crea K13, S8). Čisti podaci: svaki
 * stil je recept - kratak dodatak opisu koji model razume - plus ilustrativna
 * sličica koju UI crta kao SVG (pozadina u dve boje + motiv). Sličice nisu
 * generisane slike (odluka K13: tokom runa se ne generiše ništa), pa su iste u
 * svetloj i tamnoj temi kao i ostali korisnički sadržaj.
 *
 * Dodatak je na engleskom: nazivi filmova, objektiva i tehnika (Kodak Portra,
 * claymation, isometric) modeli najbolje prepoznaju u izvornom obliku. Korisnik
 * vidi srpski naziv, a konačan opis pre slanja (`composeCreatePrompt`).
 */

export type CreaStyleGroup = "foto" | "ilustracija" | "umetnost" | "3d" | "dizajn" | "nase";

/** Motiv sličice; crta ga `components/crea/create/style-thumb.tsx`. */
export type CreaStyleMotif =
  | "sun" | "grain" | "dots" | "lines" | "grid" | "halftone" | "brush" | "pixels"
  | "blob" | "frame" | "stripes" | "waves" | "cube" | "star";

export type CreaStyle = {
  id: string;
  group: CreaStyleGroup;
  label: LocalizedText;
  /** Kad ga izabrati, u pet-šest reči. */
  hint: LocalizedText;
  /** Dodatak opisu (engleski, bez tačke na kraju). */
  fragment: string;
  thumb: { bg: readonly [string, string]; fg: string; motif: CreaStyleMotif };
};

export const CREA_STYLE_GROUPS: ReadonlyArray<{ id: CreaStyleGroup; label: LocalizedText }> = [
  { id: "foto", label: { sr: "Fotografija", en: "Photo" } },
  { id: "ilustracija", label: { sr: "Ilustracija", en: "Illustration" } },
  { id: "umetnost", label: { sr: "Umetnost", en: "Fine art" } },
  { id: "3d", label: { sr: "3D i igre", en: "3D and games" } },
  { id: "dizajn", label: { sr: "Dizajn", en: "Design" } },
  { id: "nase", label: { sr: "Naše", en: "Local" } },
];

const s = (
  id: string,
  group: CreaStyleGroup,
  label: LocalizedText,
  hint: LocalizedText,
  fragment: string,
  thumb: CreaStyle["thumb"],
): CreaStyle => ({ id, group, label, hint, fragment, thumb });

export const CREA_STYLES: readonly CreaStyle[] = [
  // ── Fotografija ──
  s("foto-prirodno", "foto", { sr: "Prirodna fotka", en: "Natural photo" }, { sr: "kao sa dobrog telefona", en: "like a good phone shot" },
    "natural candid photograph, realistic lighting, true-to-life colors", { bg: ["#cfe6f5", "#f6e7c8"], fg: "#e2a93b", motif: "sun" }),
  s("foto-film", "foto", { sr: "Analogni film", en: "Analog film" }, { sr: "topla zrnasta nostalgija", en: "warm grainy nostalgia" },
    "35mm analog film photo, Kodak Portra 400, soft grain, warm tones", { bg: ["#f1c58d", "#c97b4a"], fg: "#5b2e1a", motif: "grain" }),
  s("foto-crno-belo", "foto", { sr: "Crno-belo", en: "Black and white" }, { sr: "drama bez boja", en: "drama without colour" },
    "black and white photograph, high contrast, deep blacks, silver gelatin print", { bg: ["#f2f2f2", "#3a3a3a"], fg: "#111111", motif: "grain" }),
  s("foto-studio", "foto", { sr: "Studijski portret", en: "Studio portrait" }, { sr: "čisto, za CV i profil", en: "clean, for a CV or profile" },
    "professional studio portrait, softbox lighting, seamless backdrop, sharp focus", { bg: ["#e9e4dc", "#b9b2a6"], fg: "#4a4540", motif: "frame" }),
  s("foto-proizvod", "foto", { sr: "Proizvod", en: "Product shot" }, { sr: "za oglas i prodavnicu", en: "for ads and shops" },
    "commercial product photography, clean background, studio lighting, crisp reflections", { bg: ["#ffffff", "#dfe7ee"], fg: "#0e3158", motif: "cube" }),
  s("foto-hrana", "foto", { sr: "Hrana", en: "Food" }, { sr: "jelovnik, kafić, recept", en: "menu, café, recipe" },
    "appetizing food photography, overhead angle, natural window light, shallow depth of field", { bg: ["#f7d9a8", "#d9643a"], fg: "#6e2f17", motif: "blob" }),
  s("foto-noc", "foto", { sr: "Grad noću", en: "City at night" }, { sr: "svetla, kiša, neon", en: "lights, rain, neon" },
    "night city photography, wet streets, neon reflections, long exposure", { bg: ["#1b2350", "#7a2f8f"], fg: "#ffd166", motif: "dots" }),
  s("foto-dron", "foto", { sr: "Iz drona", en: "Drone view" }, { sr: "pogled odozgo", en: "a view from above" },
    "aerial drone photograph, top-down view, wide landscape", { bg: ["#7fb77e", "#3f7cac"], fg: "#e8e2c8", motif: "grid" }),

  // ── Ilustracija ──
  s("ilu-akvarel", "ilustracija", { sr: "Akvarel", en: "Watercolour" }, { sr: "nežne razlivene boje", en: "soft bleeding colours" },
    "watercolor illustration, soft washes, paper texture, gentle bleeding edges", { bg: ["#cfe8f0", "#f5d0dc"], fg: "#6a8fc7", motif: "blob" }),
  s("ilu-strip", "ilustracija", { sr: "Strip", en: "Comic book" }, { sr: "jake linije i oblačići", en: "bold lines and bubbles" },
    "comic book style, bold ink outlines, halftone shading, vibrant flat colors", { bg: ["#ffe14d", "#ff6b4a"], fg: "#111111", motif: "halftone" }),
  s("ilu-manga", "ilustracija", { sr: "Manga", en: "Manga" }, { sr: "japanski crtež", en: "Japanese drawing" },
    "manga illustration, clean line art, screentone shading, expressive eyes", { bg: ["#ffffff", "#d8d8d8"], fg: "#1a1a1a", motif: "lines" }),
  s("ilu-anime", "ilustracija", { sr: "Anime", en: "Anime" }, { sr: "kao crtani film", en: "like an animated film" },
    "anime style, cel shading, vibrant colors, detailed background, soft lighting", { bg: ["#9bd2ff", "#ffc6e0"], fg: "#ffffff", motif: "star" }),
  s("ilu-decja", "ilustracija", { sr: "Dečja knjiga", en: "Picture book" }, { sr: "toplo i razigrano", en: "warm and playful" },
    "children's picture book illustration, soft gouache, rounded shapes, warm palette", { bg: ["#fde2a7", "#bfe3c0"], fg: "#e07a5f", motif: "sun" }),
  s("ilu-ravno", "ilustracija", { sr: "Ravna ilustracija", en: "Flat illustration" }, { sr: "za sajt i prezentaciju", en: "for sites and slides" },
    "flat vector illustration, simple geometric shapes, limited color palette, no gradients", { bg: ["#f4be30", "#0e3158"], fg: "#fffdf8", motif: "blob" }),
  s("ilu-linija", "ilustracija", { sr: "Linijski crtež", en: "Line art" }, { sr: "samo olovka, minimalno", en: "just a pen, minimal" },
    "minimal single-line drawing, black ink on white paper, clean continuous lines", { bg: ["#ffffff", "#f1efe9"], fg: "#111111", motif: "waves" }),
  s("ilu-bojanka", "ilustracija", { sr: "Bojanka", en: "Colouring page" }, { sr: "konture za bojenje", en: "outlines to colour in" },
    "coloring book page, clean black outlines, white fill, no shading", { bg: ["#ffffff", "#ffffff"], fg: "#222222", motif: "star" }),

  // ── Umetnost ──
  s("um-ulje", "umetnost", { sr: "Ulje na platnu", en: "Oil painting" }, { sr: "klasično, sa potezima", en: "classic, with brush strokes" },
    "oil painting on canvas, visible brush strokes, rich layered colors, museum quality", { bg: ["#8c5a2b", "#2f4858"], fg: "#e9c46a", motif: "brush" }),
  s("um-impresionizam", "umetnost", { sr: "Impresionizam", en: "Impressionism" }, { sr: "svetlo u tačkicama", en: "light in dabs" },
    "impressionist painting, loose brushwork, dappled light, Monet-inspired palette", { bg: ["#a8d5e2", "#f9d29d"], fg: "#7aa95c", motif: "dots" }),
  s("um-pop-art", "umetnost", { sr: "Pop art", en: "Pop art" }, { sr: "jarke boje, tačkice", en: "loud colours, dots" },
    "pop art style, bold primary colors, Ben-Day dots, thick outlines", { bg: ["#ff2e63", "#08d9d6"], fg: "#ffe600", motif: "halftone" }),
  s("um-ugljen", "umetnost", { sr: "Ugljen", en: "Charcoal" }, { sr: "skica sa ateljea", en: "a studio sketch" },
    "charcoal sketch on textured paper, expressive smudged shading", { bg: ["#e6e1d8", "#9a958c"], fg: "#262626", motif: "brush" }),
  s("um-mozaik", "umetnost", { sr: "Mozaik", en: "Mosaic" }, { sr: "kamenčići i staklo", en: "tiles and glass" },
    "byzantine mosaic, small glass tiles, gold accents", { bg: ["#c9a227", "#1d4e89"], fg: "#f2e8cf", motif: "grid" }),
  s("um-vitraz", "umetnost", { sr: "Vitraž", en: "Stained glass" }, { sr: "obojeno staklo, olovo", en: "coloured glass, lead lines" },
    "stained glass window, bold black leading, glowing jewel colors", { bg: ["#c1121f", "#003049"], fg: "#fdf0d5", motif: "frame" }),
  s("um-ukiyo", "umetnost", { sr: "Japanski drvorez", en: "Ukiyo-e" }, { sr: "talasi, ravne boje", en: "waves, flat colours" },
    "ukiyo-e woodblock print, flat colors, fine outlines, textured paper", { bg: ["#f2e3c6", "#264653"], fg: "#e76f51", motif: "waves" }),
  s("um-nadrealizam", "umetnost", { sr: "Nadrealizam", en: "Surrealism" }, { sr: "san koji nema smisla", en: "a dream that makes no sense" },
    "surrealist painting, dreamlike impossible scene, melting forms, long shadows", { bg: ["#f4a261", "#2a9d8f"], fg: "#264653", motif: "sun" }),

  // ── 3D i igre ──
  s("3d-glina", "3d", { sr: "Glina", en: "Claymation" }, { sr: "kao plastelin figurice", en: "like modelling-clay figures" },
    "claymation style, handmade plasticine figures, soft studio lighting, fingerprint texture", { bg: ["#ffb4a2", "#b5e48c"], fg: "#6d597a", motif: "blob" }),
  s("3d-crtani", "3d", { sr: "3D crtani", en: "3D cartoon" }, { sr: "kao animirani film", en: "like an animated movie" },
    "3D animated movie style, soft global illumination, expressive characters, subsurface scattering", { bg: ["#90e0ef", "#ffd6a5"], fg: "#0077b6", motif: "cube" }),
  s("3d-izometrija", "3d", { sr: "Izometrija", en: "Isometric" }, { sr: "mali svet pod uglom", en: "a tiny world at an angle" },
    "isometric 3D diorama, miniature world, clean edges, soft shadows", { bg: ["#e9f5db", "#cfe1b9"], fg: "#718355", motif: "cube" }),
  s("3d-piksel", "3d", { sr: "Piksel art", en: "Pixel art" }, { sr: "stare igrice", en: "old video games" },
    "16-bit pixel art, limited palette, crisp pixels, retro video game", { bg: ["#2b2d42", "#8d99ae"], fg: "#ef233c", motif: "pixels" }),
  s("3d-lowpoly", "3d", { sr: "Low poly", en: "Low poly" }, { sr: "trouglovi i ivice", en: "triangles and facets" },
    "low poly 3D render, faceted geometry, pastel gradient lighting", { bg: ["#cdb4db", "#a2d2ff"], fg: "#ffafcc", motif: "star" }),
  s("3d-igracka", "3d", { sr: "Plastična igračka", en: "Toy figure" }, { sr: "sjajna mala figura", en: "a shiny little figure" },
    "glossy vinyl toy figure, collectible, studio product render, soft reflections", { bg: ["#ffe5ec", "#ffc2d1"], fg: "#fb6f92", motif: "blob" }),

  // ── Dizajn ──
  s("diz-poster", "dizajn", { sr: "Poster", en: "Poster" }, { sr: "za događaj i oglas", en: "for events and ads" },
    "bold graphic poster design, strong typography area, high contrast, print-ready", { bg: ["#0e3158", "#f4be30"], fg: "#fffdf8", motif: "stripes" }),
  s("diz-minimal", "dizajn", { sr: "Minimalizam", en: "Minimalist" }, { sr: "puno praznog prostora", en: "lots of empty space" },
    "minimalist composition, lots of negative space, simple shapes, muted colors", { bg: ["#f8f9fa", "#e9ecef"], fg: "#495057", motif: "sun" }),
  s("diz-retro", "dizajn", { sr: "Retro 70-te", en: "70s retro" }, { sr: "narandžasto i braon", en: "orange and brown" },
    "1970s retro graphic style, warm orange and brown palette, rounded type, sunburst", { bg: ["#f4a261", "#e76f51"], fg: "#6b4226", motif: "stripes" }),
  s("diz-sinthwejv", "dizajn", { sr: "Synthwave", en: "Synthwave" }, { sr: "80-te, neon, mreža", en: "80s, neon, grid" },
    "synthwave 1980s aesthetic, neon grid, sunset gradient, chrome", { bg: ["#240046", "#ff006e"], fg: "#ffbe0b", motif: "grid" }),
  s("diz-papir", "dizajn", { sr: "Isečen papir", en: "Paper cut" }, { sr: "slojevi papira", en: "layers of paper" },
    "layered paper cut art, depth with soft shadows, handcrafted", { bg: ["#ffd6a5", "#caffbf"], fg: "#9bf6ff", motif: "waves" }),
  s("diz-ikonica", "dizajn", { sr: "Ikonica / nalepnica", en: "Icon / sticker" }, { sr: "za aplikaciju ili Viber", en: "for an app or Viber" },
    "die-cut sticker design, thick white border, simple bold shapes, flat colors", { bg: ["#ffffff", "#e0fbfc"], fg: "#ee6c4d", motif: "star" }),

  // ── Naše ──
  s("nase-sveska", "nase", { sr: "Sveska", en: "Notebook doodle" }, { sr: "crtež hemijskom u svesci", en: "a pen doodle in a notebook" },
    "ballpoint pen doodle on lined school notebook paper, blue ink", { bg: ["#fffdf8", "#e3eefb"], fg: "#1f4e9c", motif: "lines" }),
  s("nase-razglednica", "nase", { sr: "Stara razglednica", en: "Vintage postcard" }, { sr: "Jugoslavija, 60-te", en: "Yugoslavia, the 60s" },
    "vintage 1960s Yugoslav postcard, faded colors, halftone print, white border", { bg: ["#f6e2b3", "#7fb7be"], fg: "#bc4b51", motif: "frame" }),
  s("nase-narodno", "nase", { sr: "Narodni motiv", en: "Folk ornament" }, { sr: "vez, ćilim, šara", en: "embroidery, rug, pattern" },
    "Serbian folk art ornament, pirot kilim geometric patterns, red and black embroidery", { bg: ["#b5161b", "#1b1b1b"], fg: "#f3e9d2", motif: "grid" }),
  s("nase-freska", "nase", { sr: "Freska", en: "Fresco" }, { sr: "kao u manastiru", en: "like in a monastery" },
    "medieval Serbian Orthodox fresco style, aged plaster texture, ochre and lapis blue", { bg: ["#d4a373", "#264c7a"], fg: "#faedcd", motif: "brush" }),
];

export function styleById(id: string | null | undefined): CreaStyle | undefined {
  return id ? CREA_STYLES.find((style) => style.id === id) : undefined;
}

export function stylesInGroup(group: CreaStyleGroup): CreaStyle[] {
  return CREA_STYLES.filter((style) => style.group === group);
}

// ── Palete (S8) ──────────────────────────────────────────────────────────────

export type CreaPalettePreset = { id: string; label: LocalizedText; colors: readonly string[] };

/** Najviše boja u paleti koja ide u opis (više od 5 model ionako ne prati). */
export const CREA_PALETTE_MAX = 5;

export const CREA_PALETTES: readonly CreaPalettePreset[] = [
  { id: "sveska", label: { sr: "Sveska", en: "Notebook" }, colors: ["#0e3158", "#f4be30", "#fffdf8"] },
  { id: "pastel", label: { sr: "Pastel", en: "Pastel" }, colors: ["#ffd6e0", "#c1e1c1", "#cde7f0", "#fff1b6"] },
  { id: "zalazak", label: { sr: "Zalazak", en: "Sunset" }, colors: ["#ff7b54", "#ffb26b", "#ffd56b", "#6c4ab6"] },
  { id: "suma", label: { sr: "Šuma", en: "Forest" }, colors: ["#1b4332", "#40916c", "#95d5b2", "#d8f3dc"] },
  { id: "more", label: { sr: "More", en: "Sea" }, colors: ["#03045e", "#0077b6", "#00b4d8", "#caf0f8"] },
  { id: "neon", label: { sr: "Neon noć", en: "Neon night" }, colors: ["#10002b", "#ff006e", "#3a86ff", "#ffbe0b"] },
  { id: "zemlja", label: { sr: "Zemljani tonovi", en: "Earth tones" }, colors: ["#6b4226", "#a47148", "#d4a373", "#e9edc9"] },
  { id: "monohrom", label: { sr: "Crno-belo", en: "Monochrome" }, colors: ["#111111", "#666666", "#bbbbbb", "#f5f5f5"] },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Samo ispravni HEX-ovi, bez ponavljanja, malim slovima, najviše `CREA_PALETTE_MAX`. */
export function normalizePalette(colors: readonly string[]): string[] {
  const out: string[] = [];
  for (const color of colors) {
    const hex = color.trim().toLowerCase();
    if (HEX.test(hex) && !out.includes(hex)) out.push(hex);
    if (out.length === CREA_PALETTE_MAX) break;
  }
  return out;
}
