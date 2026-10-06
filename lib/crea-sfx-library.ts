import type { LocalizedText } from "./i18n";
import { normalizeSearchText, searchStem } from "./crea-search-text";

/**
 * Besplatna biblioteka zvučnih efekata Cree (K23, A13): mala, ručno izabrana,
 * hostovana kod nas (`public/brand/crea/sfx/<id>.mp3`). Samo **CC0** - plan §6 zabranjuje
 * Freesound (nekomercijalan API), Pixabay, Mixkit i Sonniss (zabranjuju
 * redistribuciju kao biblioteku).
 *
 * Svaki fajl je iz paketa autora Kenney (https://kenney.nl, licenca CC0 1.0,
 * https://creativecommons.org/publicdomain/zero/1.0/); original je OGG, ovde je
 * pretvoren u MP3 (96 kb/s) bez drugih izmena, preuzeto 2026-10-05. Izvor i
 * licenca svakog fajla su i u `public/brand/crea/sfx/IZVORI.txt`; test proverava da
 * se spisak, fajlovi na disku i taj dokument slažu.
 */

// Licenca živi uz oznake licenci (`crea-license-tags`), da detalj rada ne vuče ceo
// spisak zvukova u početni chunk radionice (K29-17).
export { SFX_LICENSE } from "./crea-license-tags";

// Ne pod `/crea/` (K30, nalaz K29-14): fizički folder `public/crea` bi na LiteSpeed-u
// zaklonio javnu rutu `/crea` (doc root je `public/`).
export const SFX_BASE_PATH = "/brand/crea/sfx";

/** Paketi iz kojih su fajlovi uzeti - ime i strana paketa (izvor). */
export const SFX_PACKS = {
  "Interface Sounds": "https://kenney.nl/assets/interface-sounds",
  "Impact Sounds": "https://kenney.nl/assets/impact-sounds",
  "RPG Audio": "https://kenney.nl/assets/rpg-audio",
  "Digital Audio": "https://kenney.nl/assets/digital-audio",
  "Casino Audio": "https://kenney.nl/assets/casino-audio",
  "Music Jingles": "https://kenney.nl/assets/music-jingles",
} as const;
export type SfxPack = keyof typeof SFX_PACKS;

export const SFX_CATEGORIES = ["interfejs", "koraci", "udarci", "predmeti", "igra", "dzinglovi"] as const;
export type SfxCategory = (typeof SFX_CATEGORIES)[number];

export const SFX_CATEGORY_LABELS: Record<SfxCategory, LocalizedText> = {
  interfejs: { sr: "Klikovi i obaveštenja", en: "Clicks and alerts" },
  koraci: { sr: "Koraci", en: "Footsteps" },
  udarci: { sr: "Udarci", en: "Hits" },
  predmeti: { sr: "Predmeti", en: "Objects" },
  igra: { sr: "Igrice", en: "Games" },
  dzinglovi: { sr: "Džinglovi", en: "Jingles" },
};

export type SfxFile = {
  /** Ime fajla bez nastavka: `public/brand/crea/sfx/<id>.mp3`. */
  id: string;
  category: SfxCategory;
  title: LocalizedText;
  /** Reči za pretragu (sr i en). */
  tags: string;
  seconds: number;
  /** Paket i originalni fajl (izvor). */
  source: { pack: SfxPack; file: string };
};

export const SFX_LIBRARY: readonly SfxFile[] = [
  { id: "klik", category: "interfejs", title: { sr: "Klik", en: "Click" }, tags: "klik dugme miš taster click button mouse tap", seconds: 0.1, source: { pack: "Interface Sounds", file: "click_001.ogg" } },
  { id: "potvrda", category: "interfejs", title: { sr: "Potvrda", en: "Confirmation" }, tags: "potvrda uspeh gotovo ding tačno confirm success done ding correct", seconds: 0.29, source: { pack: "Interface Sounds", file: "confirmation_001.ogg" } },
  { id: "greska", category: "interfejs", title: { sr: "Greška", en: "Error" }, tags: "greška pogrešno netačno ne error wrong mistake no", seconds: 0.1, source: { pack: "Interface Sounds", file: "error_004.ogg" } },
  { id: "pitanje", category: "interfejs", title: { sr: "Pitanje", en: "Question" }, tags: "pitanje obaveštenje poruka question notification message", seconds: 0.49, source: { pack: "Interface Sounds", file: "question_001.ogg" } },
  { id: "stakleni-zvon", category: "interfejs", title: { sr: "Stakleni zvon", en: "Glass chime" }, tags: "staklo zvonce zvon obaveštenje glass chime bell notification", seconds: 0.28, source: { pack: "Interface Sounds", file: "glass_001.ogg" } },
  { id: "kap", category: "interfejs", title: { sr: "Kap", en: "Drop" }, tags: "kap voda pad drop water drip", seconds: 0.13, source: { pack: "Interface Sounds", file: "drop_001.ogg" } },
  { id: "grebanje", category: "interfejs", title: { sr: "Grebanje", en: "Scratch" }, tags: "grebanje ploča struganje scratch record scrape", seconds: 0.14, source: { pack: "Interface Sounds", file: "scratch_001.ogg" } },
  { id: "prekidac", category: "interfejs", title: { sr: "Prekidač", en: "Switch" }, tags: "prekidač uključi isključi switch toggle on off", seconds: 0.61, source: { pack: "Interface Sounds", file: "switch_001.ogg" } },
  { id: "gong", category: "interfejs", title: { sr: "Gong", en: "Gong" }, tags: "gong bong kraj gong bong end", seconds: 0.12, source: { pack: "Interface Sounds", file: "bong_001.ogg" } },
  { id: "trzaj-zice", category: "interfejs", title: { sr: "Trzaj žice", en: "Pluck" }, tags: "žica trzaj gitara pluck string guitar", seconds: 0.1, source: { pack: "Interface Sounds", file: "pluck_001.ogg" } },
  { id: "otvaranje-prozora", category: "interfejs", title: { sr: "Otvaranje prozora", en: "Window open" }, tags: "otvori prozor fijuk prelaz open window whoosh transition", seconds: 0.26, source: { pack: "Interface Sounds", file: "maximize_001.ogg" } },
  { id: "tik", category: "interfejs", title: { sr: "Tik", en: "Tick" }, tags: "tik sat sekunda tick clock second", seconds: 0.04, source: { pack: "Interface Sounds", file: "tick_001.ogg" } },
  { id: "korak-drvo", category: "koraci", title: { sr: "Korak po drvetu", en: "Step on wood" }, tags: "korak hod drvo pod footstep walk wood floor", seconds: 0.27, source: { pack: "Impact Sounds", file: "footstep_wood_000.ogg" } },
  { id: "korak-trava", category: "koraci", title: { sr: "Korak po travi", en: "Step on grass" }, tags: "korak hod trava napolju footstep walk grass outdoor", seconds: 0.77, source: { pack: "Impact Sounds", file: "footstep_grass_000.ogg" } },
  { id: "korak-sneg", category: "koraci", title: { sr: "Korak po snegu", en: "Step on snow" }, tags: "korak hod sneg zima footstep walk snow winter", seconds: 0.37, source: { pack: "Impact Sounds", file: "footstep_snow_000.ogg" } },
  { id: "korak-beton", category: "koraci", title: { sr: "Korak po betonu", en: "Step on concrete" }, tags: "korak hod beton ulica footstep walk concrete street", seconds: 0.1, source: { pack: "Impact Sounds", file: "footstep_concrete_000.ogg" } },
  { id: "udarac-pesnicom", category: "udarci", title: { sr: "Udarac pesnicom", en: "Punch" }, tags: "udarac pesnica tuča bum punch hit fight boom", seconds: 0.65, source: { pack: "Impact Sounds", file: "impactPunch_heavy_000.ogg" } },
  { id: "udarac-staklo", category: "udarci", title: { sr: "Udarac u staklo", en: "Glass hit" }, tags: "staklo udarac lom glass hit break", seconds: 0.24, source: { pack: "Impact Sounds", file: "impactGlass_heavy_000.ogg" } },
  { id: "udarac-metal", category: "udarci", title: { sr: "Udarac u metal", en: "Metal hit" }, tags: "metal udarac zveket metal hit clang", seconds: 0.16, source: { pack: "Impact Sounds", file: "impactMetal_heavy_000.ogg" } },
  { id: "zvono", category: "udarci", title: { sr: "Zvono", en: "Bell" }, tags: "zvono crkva udarac bell church strike", seconds: 1.48, source: { pack: "Impact Sounds", file: "impactBell_heavy_000.ogg" } },
  { id: "udarac-daska", category: "udarci", title: { sr: "Udarac u dasku", en: "Plank hit" }, tags: "daska drvo udarac plank wood hit", seconds: 0.78, source: { pack: "Impact Sounds", file: "impactPlank_medium_000.ogg" } },
  { id: "kramp", category: "udarci", title: { sr: "Kramp", en: "Pickaxe" }, tags: "kramp kopanje kamen rudnik pickaxe dig stone mine", seconds: 0.94, source: { pack: "Impact Sounds", file: "impactMining_000.ogg" } },
  { id: "vrata-otvaranje", category: "predmeti", title: { sr: "Otvaranje vrata", en: "Door opening" }, tags: "vrata otvaranje kvaka door open handle", seconds: 0.92, source: { pack: "RPG Audio", file: "doorOpen_1.ogg" } },
  { id: "vrata-zatvaranje", category: "predmeti", title: { sr: "Zatvaranje vrata", en: "Door closing" }, tags: "vrata zatvaranje lupanje door close slam", seconds: 0.68, source: { pack: "RPG Audio", file: "doorClose_1.ogg" } },
  { id: "skripa", category: "predmeti", title: { sr: "Škripa", en: "Creak" }, tags: "škripa vrata pod strava creak door floor spooky", seconds: 0.66, source: { pack: "RPG Audio", file: "creak1.ogg" } },
  { id: "listanje", category: "predmeti", title: { sr: "Listanje knjige", en: "Page flip" }, tags: "knjiga listanje stranica papir book page flip paper", seconds: 0.77, source: { pack: "RPG Audio", file: "bookFlip1.ogg" } },
  { id: "novcici", category: "predmeti", title: { sr: "Novčići", en: "Coins" }, tags: "novac novčići pare kasa money coins cash", seconds: 0.85, source: { pack: "RPG Audio", file: "handleCoins.ogg" } },
  { id: "noz", category: "predmeti", title: { sr: "Nož", en: "Knife" }, tags: "nož sečenje kuhinja knife slice kitchen", seconds: 0.6, source: { pack: "RPG Audio", file: "knifeSlice.ogg" } },
  { id: "tkanina", category: "predmeti", title: { sr: "Šuštanje tkanine", en: "Cloth rustle" }, tags: "tkanina odeća šuštanje cloth clothes rustle", seconds: 0.66, source: { pack: "RPG Audio", file: "cloth1.ogg" } },
  { id: "reza", category: "predmeti", title: { sr: "Reza", en: "Latch" }, tags: "reza brava metal klik latch lock metal click", seconds: 0.26, source: { pack: "RPG Audio", file: "metalLatch.ogg" } },
  { id: "cepanje-drva", category: "predmeti", title: { sr: "Cepanje drva", en: "Wood chop" }, tags: "sekira cepanje drvo axe chop wood", seconds: 0.24, source: { pack: "RPG Audio", file: "chop.ogg" } },
  { id: "pojacanje", category: "igra", title: { sr: "Pojačanje", en: "Power-up" }, tags: "igrica bonus nivo pojačanje game bonus level power up", seconds: 1.2, source: { pack: "Digital Audio", file: "powerUp1.ogg" } },
  { id: "laser", category: "igra", title: { sr: "Laser", en: "Laser" }, tags: "laser pucanj svemir laser shot space", seconds: 1.1, source: { pack: "Digital Audio", file: "laser1.ogg" } },
  { id: "struja", category: "igra", title: { sr: "Struja", en: "Zap" }, tags: "struja varnica električno zap spark electric", seconds: 1.02, source: { pack: "Digital Audio", file: "zap1.ogg" } },
  { id: "uzlazni-ton", category: "igra", title: { sr: "Uzlazni ton", en: "Rising tone" }, tags: "ton gore uspon tone up rise", seconds: 0.52, source: { pack: "Digital Audio", file: "phaserUp1.ogg" } },
  { id: "tri-tona", category: "igra", title: { sr: "Tri tona", en: "Three tones" }, tags: "obaveštenje tonovi signal notification tones signal", seconds: 0.85, source: { pack: "Digital Audio", file: "threeTone1.ogg" } },
  { id: "kocka", category: "igra", title: { sr: "Bacanje kocke", en: "Dice throw" }, tags: "kocka bacanje igra sreća dice throw game luck", seconds: 0.63, source: { pack: "Casino Audio", file: "dice-throw-1.ogg" } },
  { id: "mesanje-karata", category: "igra", title: { sr: "Mešanje karata", en: "Card shuffle" }, tags: "karte mešanje špil cards shuffle deck", seconds: 3.06, source: { pack: "Casino Audio", file: "card-shuffle.ogg" } },
  { id: "zetoni", category: "igra", title: { sr: "Žetoni", en: "Chips" }, tags: "žetoni kazino ulog chips casino bet", seconds: 0.28, source: { pack: "Casino Audio", file: "chips-stack-1.ogg" } },
  { id: "dzingl-8bit", category: "dzinglovi", title: { sr: "Džingl 8-bit", en: "8-bit jingle" }, tags: "džingl melodija retro igrica pobeda jingle melody retro game win", seconds: 1.76, source: { pack: "Music Jingles", file: "jingles_NES00.ogg" } },
  { id: "dzingl-saksofon", category: "dzinglovi", title: { sr: "Džingl saksofon", en: "Sax jingle" }, tags: "džingl saksofon džez melodija jingle sax jazz melody", seconds: 1.12, source: { pack: "Music Jingles", file: "jingles_SAX03.ogg" } },
  { id: "dzingl-pizzicato", category: "dzinglovi", title: { sr: "Džingl pizzicato", en: "Pizzicato jingle" }, tags: "džingl violina zaigrano melodija jingle violin playful melody", seconds: 1.15, source: { pack: "Music Jingles", file: "jingles_PIZZI03.ogg" } },
  { id: "dzingl-steel-drum", category: "dzinglovi", title: { sr: "Džingl steel drum", en: "Steel drum jingle" }, tags: "džingl leto plaža melodija jingle summer beach melody", seconds: 1.38, source: { pack: "Music Jingles", file: "jingles_STEEL01.ogg" } },
  { id: "dzingl-udarac", category: "dzinglovi", title: { sr: "Džingl udarac", en: "Hit jingle" }, tags: "džingl udarac najava jingle hit intro sting", seconds: 0.75, source: { pack: "Music Jingles", file: "jingles_HIT03.ogg" } },
];

export function sfxUrl(file: Pick<SfxFile, "id">): string {
  return `${SFX_BASE_PATH}/${file.id}.mp3`;
}

export function sfxSourceUrl(file: Pick<SfxFile, "source">): string {
  return SFX_PACKS[file.source.pack];
}

function matches(words: readonly string[], term: string): boolean {
  return words.some((word) => word.startsWith(term) || searchStem(word).startsWith(term));
}

/**
 * Pretraga na srpskom ili engleskom, bez obzira na pismo, kvačice i padež
 * („vrata", „vratima", „врата", „door"): svaka reč upita mora da se nađe kao
 * početak neke reči fajla (po korenu). Prazan upit vraća sve; kategorija sužava.
 * Redosled: više pogodaka u naslovu ide pre, pa redom biblioteke.
 */
export function searchSfx(query: string, category: SfxCategory | null = null, library: readonly SfxFile[] = SFX_LIBRARY): SfxFile[] {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean).map(searchStem);
  const inCategory = library.filter((file) => category === null || file.category === category);
  if (terms.length === 0) return [...inCategory];
  const scored: Array<{ file: SfxFile; score: number; index: number }> = [];
  inCategory.forEach((file, index) => {
    const words = normalizeSearchText(`${file.title.sr} ${file.title.en} ${file.tags}`).split(" ").filter(Boolean);
    if (!terms.every((term) => matches(words, term))) return;
    const titleWords = normalizeSearchText(`${file.title.sr} ${file.title.en}`).split(" ");
    scored.push({ file, score: terms.filter((term) => matches(titleWords, term)).length, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.file);
}

export function sfxById(id: string | null | undefined): SfxFile | undefined {
  return id ? SFX_LIBRARY.find((file) => file.id === id) : undefined;
}
