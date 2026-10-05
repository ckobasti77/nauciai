import { CHARACTER_SHEET_MARKER } from "@/convex/creaElementsCore";

import type { Locale, LocalizedText } from "./i18n";

/**
 * Kreator lika „kao u igrici" (S36, K14): korisnik bira iz menija - bez kucanja -
 * a ovde se izbor pretvara u opis lista lika (napred, bok, leđa na jednoj slici).
 * Čisti podaci i funkcije: isti opis vidi korisnik („Modelu ide:") i dobija model.
 *
 * Delovi opisa su na engleskom (kao dodaci stila, K13): modeli ih najbolje
 * razumeju; korisnik vidi srpske nazive. Boje (`swatch`) su sadržaj sličice
 * lika, ne boje interfejsa - iste su u obe teme.
 */

export type CharacterMenuId = "vrsta" | "godine" | "kosa" | "bojaKose" | "oci" | "ten" | "odeca" | "dodatak" | "stil";

export type CharacterOption = {
  id: string;
  label: LocalizedText;
  /** Deo opisa za model; prazan = ništa se ne dodaje (npr. „bez dodatka"). */
  prompt: string;
  /** Boja na sličici lika (kosa, oči, ten, odeća). */
  swatch?: string;
};

export type CharacterMenu = { id: CharacterMenuId; label: LocalizedText; options: readonly CharacterOption[] };

export type CharacterSpecies = CharacterOption & {
  /** Koji meniji imaju smisla za ovu vrstu (robot nema kosu ni ten). */
  uses: { age: boolean; hair: boolean; skin: boolean };
  /** Predlozi imena (prvo je podrazumevano). */
  names: readonly string[];
};

export const CHARACTER_SPECIES: readonly CharacterSpecies[] = [
  {
    id: "zena",
    label: { sr: "Žena", en: "Woman" },
    prompt: "an adult woman",
    uses: { age: true, hair: true, skin: true },
    names: ["Mila", "Jelena", "Sara", "Teodora", "Vesna", "Nađa"],
  },
  {
    id: "muskarac",
    label: { sr: "Muškarac", en: "Man" },
    prompt: "an adult man",
    uses: { age: true, hair: true, skin: true },
    names: ["Luka", "Marko", "Stefan", "Dušan", "Bora", "Vuk"],
  },
  {
    id: "osoba",
    label: { sr: "Osoba", en: "Person" },
    prompt: "an adult person with an androgynous look",
    uses: { age: true, hair: true, skin: true },
    names: ["Saša", "Vanja", "Maša", "Aleks", "Nikola", "Ivo"],
  },
  {
    id: "vilenjak",
    label: { sr: "Vilenjak", en: "Elf" },
    prompt: "a fantasy elf with pointed ears",
    uses: { age: true, hair: true, skin: true },
    names: ["Lira", "Elan", "Vida", "Tara", "Zora", "Iris"],
  },
  {
    id: "robot",
    label: { sr: "Robot", en: "Robot" },
    prompt: "a friendly humanoid robot",
    uses: { age: false, hair: false, skin: false },
    names: ["Robi", "Čipko", "Volt", "Bit", "Iskra", "Zupčić"],
  },
];

/** Bez dece: kreator pravi odrasle likove (konzervativno, vidi ODLUKE K14). */
export const CHARACTER_MENUS: readonly CharacterMenu[] = [
  {
    id: "godine",
    label: { sr: "Godine", en: "Age" },
    options: [
      { id: "20", label: { sr: "Dvadesete", en: "Twenties" }, prompt: "in their twenties" },
      { id: "30", label: { sr: "Tridesete", en: "Thirties" }, prompt: "in their thirties" },
      { id: "40", label: { sr: "Četrdesete", en: "Forties" }, prompt: "in their forties" },
      { id: "50", label: { sr: "Pedesete", en: "Fifties" }, prompt: "in their fifties" },
      { id: "65", label: { sr: "Stariji", en: "Older" }, prompt: "in their late sixties" },
    ],
  },
  {
    id: "kosa",
    label: { sr: "Frizura", en: "Hairstyle" },
    options: [
      { id: "kratka", label: { sr: "Kratka", en: "Short" }, prompt: "short hair" },
      { id: "srednja", label: { sr: "Do ramena", en: "Shoulder length" }, prompt: "shoulder-length hair" },
      { id: "duga", label: { sr: "Duga", en: "Long" }, prompt: "long straight hair" },
      { id: "kovrdzava", label: { sr: "Kovrdžava", en: "Curly" }, prompt: "voluminous curly hair" },
      { id: "pundja", label: { sr: "Punđa", en: "Bun" }, prompt: "hair tied in a bun" },
      { id: "pletenica", label: { sr: "Pletenica", en: "Braid" }, prompt: "a long braid" },
      { id: "celav", label: { sr: "Bez kose", en: "Bald" }, prompt: "a shaved bald head" },
    ],
  },
  {
    id: "bojaKose",
    label: { sr: "Boja kose", en: "Hair colour" },
    options: [
      { id: "crna", label: { sr: "Crna", en: "Black" }, prompt: "black", swatch: "#1f1b1a" },
      { id: "smedja", label: { sr: "Smeđa", en: "Brown" }, prompt: "brown", swatch: "#6b4226" },
      { id: "plava", label: { sr: "Plava", en: "Blonde" }, prompt: "blonde", swatch: "#e2c27a" },
      { id: "rida", label: { sr: "Riđa", en: "Red" }, prompt: "copper red", swatch: "#b5502b" },
      { id: "seda", label: { sr: "Seda", en: "Grey" }, prompt: "silver grey", swatch: "#b9bcc0" },
      { id: "roze", label: { sr: "Roze", en: "Pink" }, prompt: "pastel pink", swatch: "#ef9fc0" },
      { id: "plavicasta", label: { sr: "Plava kao nebo", en: "Sky blue" }, prompt: "sky blue", swatch: "#6fa8dc" },
    ],
  },
  {
    id: "oci",
    label: { sr: "Oči", en: "Eyes" },
    options: [
      { id: "smedje", label: { sr: "Smeđe", en: "Brown" }, prompt: "brown eyes", swatch: "#6b4226" },
      { id: "plave", label: { sr: "Plave", en: "Blue" }, prompt: "blue eyes", swatch: "#3d7cc9" },
      { id: "zelene", label: { sr: "Zelene", en: "Green" }, prompt: "green eyes", swatch: "#3f8f5a" },
      { id: "sive", label: { sr: "Sive", en: "Grey" }, prompt: "grey eyes", swatch: "#8a9299" },
      { id: "crne", label: { sr: "Tamne", en: "Dark" }, prompt: "very dark eyes", swatch: "#231f20" },
      { id: "zlatne", label: { sr: "Zlatne", en: "Golden" }, prompt: "golden amber eyes", swatch: "#d39b2a" },
    ],
  },
  {
    id: "ten",
    label: { sr: "Ten", en: "Skin tone" },
    options: [
      { id: "svetao", label: { sr: "Svetao", en: "Fair" }, prompt: "fair skin", swatch: "#f3d7c3" },
      { id: "srednji", label: { sr: "Srednji", en: "Medium" }, prompt: "medium skin tone", swatch: "#d9a77f" },
      { id: "maslinast", label: { sr: "Maslinast", en: "Olive" }, prompt: "olive skin", swatch: "#b98a5e" },
      { id: "tamniji", label: { sr: "Tamniji", en: "Brown" }, prompt: "brown skin", swatch: "#8a5a3c" },
      { id: "tamni", label: { sr: "Tamni", en: "Dark" }, prompt: "deep dark skin", swatch: "#5a3825" },
    ],
  },
  {
    id: "odeca",
    label: { sr: "Odeća", en: "Outfit" },
    options: [
      { id: "lezerna", label: { sr: "Ležerna", en: "Casual" }, prompt: "casual jeans and a plain t-shirt with sneakers", swatch: "#4a78b5" },
      { id: "sportska", label: { sr: "Sportska", en: "Sporty" }, prompt: "a sporty tracksuit and running shoes", swatch: "#d9493a" },
      { id: "poslovna", label: { sr: "Poslovna", en: "Business" }, prompt: "a tailored business suit", swatch: "#2f3a4a" },
      { id: "nosnja", label: { sr: "Narodna nošnja", en: "Folk costume" }, prompt: "a traditional Serbian folk costume with embroidered vest and opanci shoes", swatch: "#b8322c" },
      { id: "kuvar", label: { sr: "Kuvar", en: "Chef" }, prompt: "a white chef jacket and apron", swatch: "#f4f1ea" },
      { id: "naucnik", label: { sr: "Naučnik", en: "Scientist" }, prompt: "a white lab coat over a sweater", swatch: "#e9eef3" },
      { id: "vitez", label: { sr: "Vitez", en: "Knight" }, prompt: "medieval knight armour with a cape", swatch: "#9aa3ad" },
      { id: "heroj", label: { sr: "Superheroj", en: "Superhero" }, prompt: "an original superhero suit with a cape (no existing logos)", swatch: "#6a3fb5" },
    ],
  },
  {
    id: "dodatak",
    label: { sr: "Dodatak", en: "Accessory" },
    options: [
      { id: "bez", label: { sr: "Bez dodatka", en: "None" }, prompt: "" },
      { id: "naocare", label: { sr: "Naočare", en: "Glasses" }, prompt: "round glasses" },
      { id: "kapa", label: { sr: "Kapa", en: "Cap" }, prompt: "a baseball cap" },
      { id: "sal", label: { sr: "Šal", en: "Scarf" }, prompt: "a knitted scarf" },
      { id: "slusalice", label: { sr: "Slušalice", en: "Headphones" }, prompt: "headphones around the neck" },
      { id: "ranac", label: { sr: "Ranac", en: "Backpack" }, prompt: "a small backpack" },
    ],
  },
  {
    id: "stil",
    label: { sr: "Stil", en: "Style" },
    options: [
      { id: "foto", label: { sr: "Kao fotka", en: "Photo-real" }, prompt: "photorealistic, realistic proportions, studio photo" },
      { id: "3d", label: { sr: "3D crtani film", en: "3D cartoon" }, prompt: "stylised 3D animated film character, soft shading" },
      { id: "anime", label: { sr: "Anime", en: "Anime" }, prompt: "anime illustration, clean line art, cel shading" },
      { id: "strip", label: { sr: "Strip", en: "Comic" }, prompt: "comic book illustration, bold ink outlines, flat colours" },
      { id: "akvarel", label: { sr: "Akvarel", en: "Watercolour" }, prompt: "soft watercolour illustration on paper" },
      { id: "piksel", label: { sr: "Piksel igra", en: "Pixel game" }, prompt: "16-bit pixel art game sprite style" },
      { id: "glina", label: { sr: "Glina", en: "Clay" }, prompt: "handmade clay figure, stop-motion look" },
    ],
  },
];

export const CHARACTER_SPECIES_LABEL: LocalizedText = { sr: "Ko je to?", en: "Who is it?" };

export type CharacterChoice = Record<CharacterMenuId, string>;

export const DEFAULT_CHARACTER: CharacterChoice = {
  vrsta: "zena",
  godine: "30",
  kosa: "duga",
  bojaKose: "smedja",
  oci: "smedje",
  ten: "srednji",
  odeca: "lezerna",
  dodatak: "bez",
  stil: "3d",
};

export function speciesById(id: string): CharacterSpecies {
  return CHARACTER_SPECIES.find((species) => species.id === id) ?? CHARACTER_SPECIES[0];
}

export function menuById(id: CharacterMenuId): CharacterMenu | undefined {
  return CHARACTER_MENUS.find((menu) => menu.id === id);
}

export function optionOf(menuId: CharacterMenuId, optionId: string): CharacterOption | undefined {
  if (menuId === "vrsta") return speciesById(optionId);
  const menu = menuById(menuId);
  return menu?.options.find((option) => option.id === optionId) ?? menu?.options[0];
}

/** Meniji koje vrsta koristi (robot: bez godina, kose i tena). */
export function visibleMenus(choice: CharacterChoice): CharacterMenu[] {
  const { uses } = speciesById(choice.vrsta);
  return CHARACTER_MENUS.filter((menu) => {
    if (menu.id === "godine") return uses.age;
    if (menu.id === "kosa" || menu.id === "bojaKose") return uses.hair;
    if (menu.id === "ten") return uses.skin;
    return true;
  });
}

/** Nepoznat ili nedozvoljen izbor → podrazumevan (link, staro stanje). */
export function normalizeChoice(input: Partial<Record<string, string>>): CharacterChoice {
  const choice = { ...DEFAULT_CHARACTER };
  for (const key of Object.keys(DEFAULT_CHARACTER) as CharacterMenuId[]) {
    const wanted = input[key];
    if (!wanted) continue;
    const valid =
      key === "vrsta"
        ? CHARACTER_SPECIES.some((species) => species.id === wanted)
        : menuById(key)?.options.some((option) => option.id === wanted);
    if (valid) choice[key] = wanted;
  }
  return choice;
}

/** „Iznenadi me": nasumičan izbor iz svakog menija (`random` se ubacuje radi testa). */
export function randomChoice(random: () => number = Math.random): CharacterChoice {
  const pick = <T,>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const choice = { ...DEFAULT_CHARACTER, vrsta: pick(CHARACTER_SPECIES).id };
  for (const menu of CHARACTER_MENUS) choice[menu.id] = pick(menu.options).id;
  return choice;
}

function part(choice: CharacterChoice, menuId: CharacterMenuId): string {
  return optionOf(menuId, choice[menuId])?.prompt ?? "";
}

/** Opis lika (bez okvira lista) - ono što ga čini njim. */
export function characterDescription(choice: CharacterChoice): string {
  const species = speciesById(choice.vrsta);
  const shown = new Set(visibleMenus(choice).map((menu) => menu.id));
  const bits: string[] = [species.prompt];
  if (shown.has("godine")) bits.push(part(choice, "godine"));
  if (shown.has("kosa")) {
    bits.push(choice.kosa === "celav" ? part(choice, "kosa") : `${part(choice, "bojaKose")} ${part(choice, "kosa")}`);
  }
  bits.push(part(choice, "oci"));
  if (shown.has("ten")) bits.push(part(choice, "ten"));
  bits.push(`wearing ${part(choice, "odeca")}`);
  const accessory = part(choice, "dodatak");
  if (accessory) bits.push(`with ${accessory}`);
  return bits.filter(Boolean).join(", ");
}

/**
 * Ceo opis lista lika. Počinje sa `CHARACTER_SHEET_MARKER` - po tome server
 * prepoznaje rad iz kreatora. Tri pogleda istog lika jedan do drugog, ceo lik,
 * neutralna poza, čista pozadina, bez teksta (list služi kao referenca).
 */
export function characterSheetPrompt(choice: CharacterChoice): string {
  return [
    `${CHARACTER_SHEET_MARKER} of one original, fictional character, shown three times side by side on a single image: front view on the left, side profile view in the middle, back view on the right.`,
    `The character: ${characterDescription(choice)}.`,
    "Full body from head to feet in every view, standing in a relaxed neutral pose, arms slightly away from the body.",
    `Style: ${part(choice, "stil")}.`,
    "Same proportions, face, colours and clothing in all three views. Plain light grey background, soft even lighting. No text, no labels, no frames.",
  ].join(" ");
}

/** Odnos stranica lista (tri pogleda u redu) - Nano Banana prima 16:9. */
export const CHARACTER_SHEET_PARAMS = { aspect_ratio: "16:9" } as const;

/** Kratak srpski (ili engleski) opis izbora za korisnika: „Žena · Tridesete · Duga smeđa kosa …". */
export function characterSummary(choice: CharacterChoice, locale: Locale): string[] {
  const shown = new Set(visibleMenus(choice).map((menu) => menu.id));
  const label = (menuId: CharacterMenuId) => optionOf(menuId, choice[menuId])?.label[locale] ?? "";
  const lines = [speciesById(choice.vrsta).label[locale]];
  if (shown.has("godine")) lines.push(label("godine"));
  if (shown.has("kosa")) {
    lines.push(
      choice.kosa === "celav"
        ? label("kosa")
        : locale === "sr"
          ? `${label("kosa")} kosa, ${label("bojaKose").toLowerCase()}`
          : `${label("kosa")} hair, ${label("bojaKose").toLowerCase()}`,
    );
  }
  lines.push(locale === "sr" ? `Oči: ${label("oci").toLowerCase()}` : `Eyes: ${label("oci").toLowerCase()}`);
  if (shown.has("ten")) lines.push(locale === "sr" ? `Ten: ${label("ten").toLowerCase()}` : `Skin: ${label("ten").toLowerCase()}`);
  lines.push(label("odeca"));
  if (choice.dodatak !== "bez") lines.push(label("dodatak"));
  lines.push(label("stil"));
  return lines;
}

/** Predlog imena: prvi slobodan iz spiska vrste (ime lika ne mora da se kuca). */
export function suggestedNames(choice: CharacterChoice): readonly string[] {
  return speciesById(choice.vrsta).names;
}
