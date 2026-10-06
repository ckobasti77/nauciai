import type { LocalizedText } from "./i18n";
import { seasonDayIndex, seasonForDay, type SeasonId, type SeasonTheme } from "./crea-seasons";

/**
 * Dnevni izazov Cree (K27, G3). Svaki beogradski dan ima temu; izazov ima dve grupe -
 * „Početnici" (malo XP-a) i „Svi" - i ide u tri dana:
 *
 *   dan D     prijave: rad napravljen tog dana (plaćen ili besplatan) ide na izazov;
 *   dan D+1   glasanje: jedan glas po korisniku po grupi, nikad za svoj rad;
 *   dan D+2   rezultati: pobednik grupe dobija bedž, XP i male kredite.
 *
 * Teme su na srpskom (i engleskom); dok traje sezona (G12), teme daje sezona.
 */

export type ChallengeGroup = "pocetnici" | "svi";
export const CHALLENGE_GROUPS: readonly ChallengeGroup[] = ["pocetnici", "svi"];

/** Do ovoliko ukupnog XP-a (nivo 1) rad ide u grupu „Početnici". */
export const CHALLENGE_BEGINNER_MAX_XP = 500;
/** Manje prijava od ovoga = grupa nema pobednika (nema takmičenja). */
export const CHALLENGE_MIN_ENTRIES = 3;
/** Pobednik mora da ima bar ovoliko glasova. */
export const CHALLENGE_MIN_VOTES = 2;
/** Nagrada pobedniku grupe (≈ jedna jeftina slika), jednom po grupi i danu. */
export const CHALLENGE_WINNER_CREDITS = 10;

export type ChallengeTheme = SeasonTheme;

const theme = (id: string, sr: string, en: string, hintSr: string, hintEn: string): ChallengeTheme => ({
  id,
  label: { sr, en },
  hint: { sr: hintSr, en: hintEn },
});

/** Obične teme - redom, jedna dnevno (posle poslednje kreće ispočetka). */
export const CHALLENGE_THEMES: readonly ChallengeTheme[] = [
  theme("grad-nocu", "Moj grad noću", "My city at night", "Ulice, svetla i tišina posle ponoći.", "Streets, lights and the quiet after midnight."),
  theme("dorucak-iz-snova", "Doručak iz snova", "A dream breakfast", "Najlepši doručak koji možeš da zamisliš.", "The most beautiful breakfast you can imagine."),
  theme("ljubimac-heroj", "Ljubimac kao superheroj", "A pet as a superhero", "Koja bi bila njegova moć?", "What would its power be?"),
  theme("kuca-na-drvetu", "Kuća na drvetu", "A treehouse", "Skrovište koje bi voleo da imaš.", "A hideout you wish you had."),
  theme("robot-na-pijaci", "Robot na pijaci", "A robot at the market", "Šta bi robot kupio na pijaci?", "What would a robot buy at the market?"),
  theme("baka-i-deka-na-marsu", "Baka i deka na Marsu", "Grandma and grandpa on Mars", "Prvi penzioneri na crvenoj planeti.", "The first retirees on the red planet."),
  theme("najmanji-svet", "Najmanji svet", "The tiniest world", "Ceo svet na jednom listu ili kapi.", "A whole world on one leaf or drop."),
  theme("leto-na-reci", "Leto na reci", "Summer by the river", "Kupanje, peškiri i lubenica.", "Swimming, towels and watermelon."),
  theme("stari-zanat", "Stari zanat", "An old craft", "Majstor koji radi rukama.", "A master working with their hands."),
  theme("bajka-u-gradu", "Bajka u modernom gradu", "A fairy tale in a modern city", "Junak iz bajke u tramvaju ili liftu.", "A fairy-tale hero on a tram or in a lift."),
  theme("plakat-za-film", "Plakat za izmišljen film", "A poster for a made-up film", "Naslov, junak i jedna rečenica.", "A title, a hero and one line."),
  theme("zvuk-kise", "Zvuk kiše", "The sound of rain", "Napravi zvuk ili sliku kišnog dana.", "Make a sound or a picture of a rainy day."),
  theme("jutro-na-selu", "Jutro na selu", "Morning in the village", "Petao, magla i topao hleb.", "A rooster, fog and warm bread."),
  theme("kafa-i-knjiga", "Kafa i knjiga", "Coffee and a book", "Tvoj omiljeni kutak za čitanje.", "Your favorite reading corner."),
  theme("neobicna-vozila", "Neobična vozila", "Unusual vehicles", "Bicikl na krila, autobus na nogama...", "A bike with wings, a bus on legs..."),
  theme("podvodni-grad", "Podvodni grad", "An underwater city", "Kako se živi ispod talasa?", "What is life like under the waves?"),
  theme("selfi-iz-praistorije", "Selfi iz praistorije", "A selfie from prehistory", "Pećina, dinosaurus i osmeh.", "A cave, a dinosaur and a smile."),
  theme("pejzaz-od-hrane", "Pejzaž od hrane", "A landscape made of food", "Planine od hleba, reke od meda.", "Mountains of bread, rivers of honey."),
  theme("decja-knjiga", "Ilustracija za dečju knjigu", "An illustration for a children's book", "Jedna strana iz priče za laku noć.", "One page from a bedtime story."),
  theme("carobni-ormar", "Čarobni ormar", "A magic wardrobe", "Šta se krije iza vrata?", "What is behind the door?"),
  theme("logo-za-firmu", "Logo za izmišljenu firmu", "A logo for a made-up company", "Ime, znak i boje.", "A name, a mark and colors."),
  theme("dzingl", "Melodija od 10 sekundi", "A 10-second jingle", "Kratak zvuk koji se pamti.", "A short sound that sticks."),
  theme("kosmonaut-u-parku", "Kosmonaut u parku", "An astronaut in the park", "Iz svemira pravo na klupu.", "Straight from space to a park bench."),
  theme("jesen-u-boji", "Jesen u boji", "Autumn in color", "Lišće, kesten i topla jakna.", "Leaves, chestnuts and a warm jacket."),
  theme("igracka-ozivi", "Igračka koja oživi", "A toy comes alive", "Šta igračke rade kad nikog nema?", "What do toys do when nobody is home?"),
  theme("prozor-voza", "Pogled kroz prozor voza", "The view from a train window", "Predeli koji promiču.", "Landscapes rushing by."),
  theme("kuhinja-buducnosti", "Kuhinja budućnosti", "The kitchen of the future", "Ko kuva 2100. godine?", "Who cooks in the year 2100?"),
  theme("zivotinje-u-odelima", "Životinje u odelima", "Animals in suits", "Sastanak u šumskoj kancelariji.", "A meeting at the forest office."),
  theme("svet-na-stolu", "Mali svet na stolu", "A tiny world on a desk", "Grad između olovke i šolje.", "A town between a pencil and a mug."),
  theme("stari-film", "Stari film, nova priča", "Old film, new story", "Crno-belo, zrnasto, sa zapletom.", "Black and white, grainy, with a twist."),
  theme("ples-na-kisi", "Ples na kiši", "Dancing in the rain", "Kad kiša ne smeta nikome.", "When nobody minds the rain."),
  theme("zmaj-ljubimac", "Zmaj kao kućni ljubimac", "A dragon as a pet", "Šetnja, hrana i mali požari.", "Walks, food and small fires."),
  theme("pijaca-boja", "Pijaca boja", "A market of colors", "Tezge pune svih boja sveta.", "Stalls full of every color in the world."),
  theme("biblioteka-u-oblacima", "Biblioteka u oblacima", "A library in the clouds", "Knjige koje lebde.", "Books that float."),
  theme("dan-bez-struje", "Dan bez struje", "A day without electricity", "Sveće, društvene igre i priče.", "Candles, board games and stories."),
  theme("tajni-talenat", "Moj tajni talenat", "My secret talent", "Ono što niko ne zna da umeš.", "What nobody knows you can do."),
  theme("grad-od-slatkisa", "Grad od slatkiša", "A city made of sweets", "Kuće od keksa, ulice od čokolade.", "Houses of biscuits, streets of chocolate."),
  theme("stripski-kadar", "Stripski kadar", "A comic panel", "Jedan kadar, jedan oblačić.", "One panel, one speech bubble."),
  theme("suma-koja-svetli", "Šuma koja svetli", "A glowing forest", "Noć kad drveće sija.", "The night the trees glow."),
  theme("avantura-u-liftu", "Avantura u liftu", "An adventure in a lift", "Između dva sprata sve je moguće.", "Between two floors anything can happen."),
  theme("planina-u-magli", "Planina u magli", "A mountain in the fog", "Vrhovi koji izviruju iz belog.", "Peaks peeking out of the white."),
  theme("naopak-dan", "Naopak dan", "An upside-down day", "Sve radi obrnuto - šta vidiš?", "Everything works backwards - what do you see?"),
];

const DAY_MS = 86_400_000;
/** Početak brojanja tema (ponedeljak); dan pre toga se broji unazad, ciklično. */
const THEME_EPOCH = Date.parse("2026-01-05T00:00:00Z");

function dayNumber(dayKey: string): number {
  return Math.round((Date.parse(`${dayKey}T00:00:00Z`) - THEME_EPOCH) / DAY_MS);
}

function cyclic(index: number, length: number): number {
  return ((index % length) + length) % length;
}

export type DailyChallenge = { dayKey: string; theme: ChallengeTheme; seasonId: SeasonId | null };

/** Tema dana: sezonska dok sezona traje, inače sledeća obična. Isti dan = ista tema. */
export function challengeForDay(dayKey: string): DailyChallenge {
  const season = seasonForDay(dayKey);
  if (season) {
    return { dayKey, theme: season.themes[cyclic(seasonDayIndex(season, dayKey), season.themes.length)]!, seasonId: season.id };
  }
  return { dayKey, theme: CHALLENGE_THEMES[cyclic(dayNumber(dayKey), CHALLENGE_THEMES.length)]!, seasonId: null };
}

/** Naziv teme nekog dana (obične ili sezonske) - za prikaz starih rezultata i bedževa. */
export function challengeThemeLabel(dayKey: string): LocalizedText {
  return challengeForDay(dayKey).theme.label;
}

export function challengeGroupForXp(totalXp: number): ChallengeGroup {
  return totalXp < CHALLENGE_BEGINNER_MAX_XP ? "pocetnici" : "svi";
}

function shift(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Dan čije se prijave danas glasaju (juče) i dan čiji su rezultati najnoviji (prekjuče). */
export function votingDayFor(todayKey: string): string {
  return shift(todayKey, -1);
}

export function resultsDayFor(todayKey: string): string {
  return shift(todayKey, -2);
}

export type ChallengeEntryFacts = { id: string; votes: number; enteredAt: number };

export type ChallengeOutcome =
  | { winnerId: string; votes: number }
  | { winnerId: null; reason: "MALO_PRIJAVA" | "MALO_GLASOVA" };

/**
 * Pobednik grupe: najviše glasova; nerešeno rešava RANIJA prijava (ko je prvi stigao).
 * Bez dovoljno prijava ili glasova pobednika nema - jedna prijava ne sme da „pobedi".
 */
export function pickWinner(entries: readonly ChallengeEntryFacts[]): ChallengeOutcome {
  if (entries.length < CHALLENGE_MIN_ENTRIES) return { winnerId: null, reason: "MALO_PRIJAVA" };
  const best = [...entries].sort((a, b) => b.votes - a.votes || a.enteredAt - b.enteredAt || a.id.localeCompare(b.id))[0]!;
  if (best.votes < CHALLENGE_MIN_VOTES) return { winnerId: null, reason: "MALO_GLASOVA" };
  return { winnerId: best.id, votes: best.votes };
}
