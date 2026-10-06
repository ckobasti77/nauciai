import type { LocalizedText } from "./i18n";

/**
 * Sezonski događaji Cree (K27, G12): okvir za tematske nedelje. Sezona je čist podatak
 * (bez baze): prozor datuma po godini, teme dnevnog izazova (zamenjuju obične dok
 * sezona traje), efekat koji ukrašava ekrane izazova, galerije i sveske, i nalepnice
 * koje se tada pojavljuju u editoru i montaži (`lib/crea-stickers.ts`).
 *
 * Datumi su beogradski kalendarski dani (`YYYY-MM-DD`, kao `belgradeDayKey`), oba kraja
 * prozora uključena. Nova sezona = jedan red ovde (+ teme i nalepnice).
 */

export type SeasonId = "slava" | "nova-godina" | "uskrs" | "exit";

/** Ukras ekrana (samo `transform`/`opacity`, iza `prefers-reduced-motion`). */
export type SeasonEffect = "svece" | "sneg" | "jaja" | "reflektori";

export type SeasonTheme = { id: string; label: LocalizedText; hint: LocalizedText };

export type CreaSeason = {
  id: SeasonId;
  label: LocalizedText;
  tagline: LocalizedText;
  effect: SeasonEffect;
  /** Prvi i poslednji dan sezone koja POČINJE u godini `year`. */
  window: (year: number) => { start: string; end: string };
  themes: readonly SeasonTheme[];
  /** Id-jevi iz `lib/crea-stickers.ts` (sezonski i obični). */
  stickers: readonly string[];
};

function dayKeyOf(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function shift(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Pravoslavni Uskrs (gregorijanski datum): Meeusov julijanski algoritam + 13 dana
 * (razlika kalendara važi za 1900-2099).
 */
export function orthodoxEaster(year: number): string {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return shift(dayKeyOf(year, month, day), 13);
}

const theme = (id: string, sr: string, en: string, hintSr: string, hintEn: string): SeasonTheme => ({
  id,
  label: { sr, en },
  hint: { sr: hintSr, en: hintEn },
});

export const CREA_SEASONS: readonly CreaSeason[] = [
  {
    id: "slava",
    label: { sr: "Slavska nedelja", en: "Slava week" },
    tagline: {
      sr: "Sveća, žito i puna trpeza - nedelja do Svetog Nikole.",
      en: "Candle, wheat and a full table - the week up to Saint Nicholas.",
    },
    effect: "svece",
    // Nedelja koja se završava Svetim Nikolom (19. decembar), najčešćom slavom.
    window: (year) => ({ start: dayKeyOf(year, 12, 13), end: dayKeyOf(year, 12, 19) }),
    themes: [
      theme("slavska-trpeza", "Slavska trpeza", "The Slava table", "Sto pun hrane i gostiju, kao kod tebe kući.", "A table full of food and guests, like at your home."),
      theme("slavski-kolac", "Slavski kolač iz mašte", "A dreamed-up Slava bread", "Najlepši ukrašen kolač koji možeš da zamisliš.", "The most beautifully decorated bread you can imagine."),
      theme("sveca-i-bosiljak", "Sveća i bosiljak", "Candle and basil", "Tiha, topla slika uz svetlo sveće.", "A quiet, warm picture by candlelight."),
      theme("zito-i-med", "Žito i med", "Wheat and honey", "Zlatne boje, mirne ruke, domaći ukus.", "Golden colors, calm hands, a homemade taste."),
      theme("kuca-puna-gostiju", "Kuća puna gostiju", "A house full of guests", "Smeh, priče i vrata koja se ne zatvaraju.", "Laughter, stories and a door that never closes."),
      theme("zdravica", "Domaćinova zdravica", "The host's toast", "Lepa reč za sve za stolom - može i kao zvuk.", "Kind words for everyone at the table - a sound works too."),
      theme("miris-doma", "Miris doma", "The smell of home", "Kako izgleda (ili zvuči) praznik kod tvojih.", "What a holiday looks (or sounds) like at your family's place."),
    ],
    stickers: ["svica", "zito", "bosiljak", "hleb", "vino", "rucak"],
  },
  {
    id: "nova-godina",
    label: { sr: "Novogodišnje nedelje", en: "New Year weeks" },
    tagline: {
      sr: "Od jelke do Srpske nove godine - sneg, vatromet i želje.",
      en: "From the tree to the Serbian New Year - snow, fireworks and wishes.",
    },
    effect: "sneg",
    // Od 26. decembra do Srpske (pravoslavne) nove godine, 14. januara.
    window: (year) => ({ start: dayKeyOf(year, 12, 26), end: dayKeyOf(year + 1, 1, 14) }),
    themes: [
      theme("cestitka", "Novogodišnja čestitka", "A New Year card", "Čestitka koju bi poslao baš svima.", "A greeting card you would send to everyone."),
      theme("grad-pod-snegom", "Grad pod snegom", "A city under snow", "Tvoj grad u najbelijem izdanju.", "Your town at its whitest."),
      theme("jelka-iz-maste", "Jelka iz mašte", "A dreamed-up tree", "Najluđa jelka koja može da stane u stan.", "The wildest tree that still fits in a flat."),
      theme("deda-mraz-na-odmoru", "Deda Mraz na odmoru", "Santa on holiday", "Gde Deda Mraz ide kad pokloni stignu?", "Where does Santa go once the gifts arrive?"),
      theme("ponoc-na-trgu", "Ponoć na trgu", "Midnight on the square", "Odbrojavanje, vatromet i zagrljaji.", "The countdown, fireworks and hugs."),
      theme("zimska-bajka", "Zimska bajka", "A winter fairy tale", "Bajka koja se dešava samo kad pada sneg.", "A fairy tale that only happens when it snows."),
      theme("zelja", "Želja za sledeću godinu", "A wish for next year", "Nacrtaj (ili izgovori) šta želiš da se desi.", "Draw (or say) what you wish would happen."),
    ],
    stickers: ["jelka", "pahulja", "vatromet", "deda-mraz", "snesko", "zvono", "poklon"],
  },
  {
    id: "uskrs",
    label: { sr: "Uskršnja nedelja", en: "Easter week" },
    tagline: {
      sr: "Šarena jaja, prolećne boje i tucanje - od Cveti do Vaskršnjeg ponedeljka.",
      en: "Painted eggs, spring colors and egg tapping - from Palm Sunday to Easter Monday.",
    },
    effect: "jaja",
    // Pravoslavni Uskrs: od Cveti (nedelju ranije) do Vaskršnjeg ponedeljka.
    window: (year) => {
      const easter = orthodoxEaster(year);
      return { start: shift(easter, -7), end: shift(easter, 1) };
    },
    themes: [
      theme("sarena-jaja", "Šarena jaja", "Painted eggs", "Najlepša šara koju možeš da smisliš.", "The prettiest pattern you can think of."),
      theme("prolecna-livada", "Prolećna livada", "A spring meadow", "Sve što cveta, skače i peva.", "Everything that blooms, hops and sings."),
      theme("tucanje", "Tucanje jajima", "Egg tapping", "Ko će pobediti ove godine?", "Who wins this year?"),
      theme("zeka-u-basti", "Zeka u bašti", "A bunny in the garden", "Mali posetilac među lalama.", "A little visitor among the tulips."),
      theme("uskrsnje-jutro", "Uskršnje jutro", "Easter morning", "Prvo svetlo, prvi doručak, prva jaja.", "First light, first breakfast, first eggs."),
      theme("pile-iz-jajeta", "Pile iz jajeta", "A chick hatching", "Trenutak kad se ljuska otvori.", "The moment the shell cracks open."),
      theme("korpa-boja", "Korpa puna boja", "A basket full of color", "Korpa koju bi poneo kod bake.", "A basket you would bring to grandma's."),
    ],
    stickers: ["jaje", "pile", "zeka", "cvet-tresnje", "korpa", "cvet"],
  },
  {
    // Id ostaje `exit` (brief); naziv je opšti jer je „Exit" tuđe ime festivala (ODLUKA K27).
    id: "exit",
    label: { sr: "Festivalska nedelja", en: "Festival week" },
    tagline: {
      sr: "Leto, bina i muzika do jutra - nedelja letnjih festivala.",
      en: "Summer, a stage and music until morning - summer festival week.",
    },
    effect: "reflektori",
    window: (year) => ({ start: dayKeyOf(year, 7, 6), end: dayKeyOf(year, 7, 13) }),
    themes: [
      theme("bina-pod-zvezdama", "Bina pod zvezdama", "A stage under the stars", "Koncert koji bi voleo da vidiš.", "A concert you would love to see."),
      theme("plakat-za-festival", "Plakat za festival", "A festival poster", "Plakat za festival iz tvoje mašte.", "A poster for the festival of your dreams."),
      theme("sator-i-prijatelji", "Šator i prijatelji", "A tent and friends", "Kamp, ranac i ekipa.", "A campsite, a backpack and the crew."),
      theme("ritam-od-10-sekundi", "Ritam od 10 sekundi", "A 10-second beat", "Kratka melodija za ples - napravi zvuk.", "A short tune for dancing - make a sound."),
      theme("svetla-i-dim", "Svetla i dim", "Lights and haze", "Reflektori koji seku noć.", "Spotlights cutting through the night."),
      theme("najludji-kostim", "Najluđi kostim", "The wildest outfit", "Šta bi obukao za festival?", "What would you wear to a festival?"),
      theme("zalazak-uz-gitaru", "Zalazak uz gitaru", "Sunset with a guitar", "Mirni trenutak posle velike buke.", "A calm moment after the big noise."),
    ],
    stickers: ["gitara", "slusalice", "mikrofon", "sator", "prskalica", "nota"],
  },
];

const BY_ID = new Map(CREA_SEASONS.map((season) => [season.id, season]));

export function seasonById(id: string | null | undefined): CreaSeason | undefined {
  return id ? BY_ID.get(id as SeasonId) : undefined;
}

/** Sezona kojoj dan pripada (prozor koji počinje te ili prethodne godine), ili `null`. */
export function seasonForDay(dayKey: string): CreaSeason | null {
  const year = Number(dayKey.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  for (const season of CREA_SEASONS) {
    for (const start of [year, year - 1]) {
      const window = season.window(start);
      if (dayKey >= window.start && dayKey <= window.end) return season;
    }
  }
  return null;
}

/** Redni broj dana u sezoni (0 = prvi dan) - bira temu izazova. */
export function seasonDayIndex(season: CreaSeason, dayKey: string): number {
  const year = Number(dayKey.slice(0, 4));
  for (const start of [year, year - 1]) {
    const window = season.window(start);
    if (dayKey >= window.start && dayKey <= window.end) {
      return Math.round((Date.parse(`${dayKey}T00:00:00Z`) - Date.parse(`${window.start}T00:00:00Z`)) / 86_400_000);
    }
  }
  return 0;
}
